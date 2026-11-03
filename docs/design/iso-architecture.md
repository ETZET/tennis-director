# 2.5D 等距像素画面 · 架构契约（ADR 0019）

这份是 `packages/iso`（`@td/iso`）的接口契约和参考，按 2026-11-03 的代码写。改下面列出的接口（尤其是 `core/graph.ts`、
`art/format.ts`、`Site`）要同时改这份文件。画法的参考实现是样片 `docs/art/style-demos/isometric-2.5d/index.html`，光栅器照搬它。

## 目标

- 画面是 Canvas 2D 软件光栅的 2.5D 等距像素（固定 2:1 等距，Q/E 转 90°），不用 WebGL，不依赖 three。
- `sim`、`ui`、`content` 不知道画面怎么画；模拟只按锚点名说话，画面按 `layout.ts` 的世界坐标（米）画。

## 包结构

```
packages/iso/src/
  core/        graph.ts（场景图）、raster.ts（光栅原语、深度缓冲）、proj.ts（投影）、draw.ts（SceneDrawer：排序后光栅）、
               color.ts（打包颜色、调色板夜色、抖动、噪声）、art.ts（bakeArt 烘焙、换色、翻转、夜色）、
               ground.ts（GroundPainter：地面贴图、影子、灯光池）、
               view.ts（IsoView：画布、低分辨率缓冲、静态层缓存、一帧渲染）、
               camera.ts（IsoCamera：平移、档位缩放、Q/E 旋转、project/unproject、bindPointer）、
               daylight.ts（按游戏分钟给天色、夜色、灯光强度）、world.ts（createIsoWorld → IsoWorld，旧 Stage 的替身）
  art/         format.ts（字符画格式、SLOT 槽位、PersonSheet、帧名回退）、people/（成人和小孩精灵表，README.md）、
               props/（held.ts 手持道具、ground.ts 地上道具）、icons/（表情图标）、font/（像素字 5×7、3×5）、
               creatures/（狗、乌鸦、风滚草）
  site/        site.ts（Site 接口、pointAlong）、indian-wells/（layout、ground、build、kit、noise、overlays、state、wear、sky、index）
  people/      person.ts（Person，像素精灵版）、view.ts（setPeopleView）、frames.ts（取帧）、looks.ts（外观 → 换色表）、
               poses.ts、parts.ts、types.ts
  motion/      ball.ts（BallPool / Ball）、ballistics.ts
  choreo/      scheduler.ts（演出时间轴）、shots.ts（击球原子动作）
  fx/          particles.ts（Particles）、sprites.ts（SpriteLayer：漫画字、表情、气泡）、icons.ts（图标烘焙）
  ambient/     car、critter（小动物的画法）、dog、crow、rain、tumbleweed
  world/       frame.ts（CourtFrame 场地坐标系）
  activities/  runtime、choreo、各活动文件、registry/text/types/looks/props、diorama（动画库小岛，只给 sandbox）
  index.ts     公共出口：游戏和 sandbox 只从这里引用（activities 和 indianWells 是命名空间导出）
```

## 投影和像素

- 世界：米，y 向上，北是 -z。投影（`core/proj.ts` 的 `Projection`，样片的 `P`）：先绕旋转中心转角 `ang`，再
  `sx = ox + (rx - rz) * k`，`sy = oy + (rx + rz) * k / 2 - y * k * HV`，`HV = 1.225`。投影是仿射的，深度 `rx + rz` 越大越靠前。
- 画面画进**低分辨率缓冲**（`Uint32Array`，ImageData 的像素，ABGR），再用 `image-rendering: pixelated` 放大到画布。
  每个缓冲像素 = `pixelSize` 个 CSS 像素（默认手机 1，宽屏 ≥ 820 CSS px 时 2）。
- `k`（每米缓冲像素）就是镜头的 `zoom`；**精灵档位** `spriteScale = max(1, round(k / K1))`，`K1 = 14 / 1.8 ≈ 7.8`
  （1 档时 14 像素高的人正好 1.8 米）。镜头拉远时人比真实比例大（Kairosoft 式），拉近时按 2、3 倍放大。
- 旋转：静止时只停在 4 个等距角（`rot` 0–3），Q/E 是约 0.45 秒的缓动。
- 缩放档位：`ZOOM_STEPS = [2, 3, 4, 5.2, 7.8, 11.7, 15.6]`，默认限制 [2, 15.6]；`IsoCamera.nearestStep(z)` 取最近一档。
- 像素图锚点在像素缝上：人物左右对称于第 `ox-1` 列和第 `ox` 列之间。翻转时 `ox' = w - ox`，挂点 `x' = w - 1 - x`。

## 渲染分层

1. **背景**：天空渐变、星星、日月、群山、地台外的荒原（`Light` 的字段），和静态层一起缓存，换天色时重画。
2. **静态层**：地台侧面 + 地面贴图（0.2 m/纹素的俯视贴图，反投影采样）+ `statics` 下所有节点（建筑、看台、围网、树）。
   **按转角、缩放、夜色档（1/16）、灯光档（1/8）、地面版本、`invalidate` 版本缓存成一张比屏幕大一圈的缓冲**，
   平移在缓存范围里只是挪位置；任何一项变了下一帧重烘（可以接受约 100 ms 的一次卡顿）。转动、缩放途中不缓存，实时画。
3. **动态层**：`scene` 下的人、球、道具、粒子。每帧画，按世界包围盒做深度排序（`SceneDrawer`），和静态层共用
   **深度缓冲**（`Float32Array`，每像素存 rx+rz）：`ZTEST` 模式下被前面的建筑挡住的部分不画（人物 `xray` 画成棋盘格剪影）。
4. **叠加层**：游戏的地点牌、岗位和工单标记是 DOM（`camera.project` 给 CSS 坐标）；场景里的漫画字和表情是 `SpriteLayer` 的节点，排在最前。

`IsoView.stats` 给出上一帧的毫秒数、上次烘焙的毫秒数、静态和动态节点数、是否实时画。

## 关键接口

### 场景图（`core/graph.ts`）

照 three Object3D 的子集：`V3`、`Euler`（XYZ 顺序），`Node`（`position`、`rotation`、`scale`、`visible`、`parent`、`children`、
`userData`、`renderOrder`（深度偏置，米）、`lit`（夜里受光量，undefined 按所在位置的灯光）、`add / remove / removeFromParent / attach /
traverse / traverseVisible / updateMatrixWorld / getWorldPosition / getWorldYaw / localToWorld / worldToLocal`）。可画的节点：

```ts
class Group extends Node {}
class Box extends Node { constructor(w: number, h: number, d: number, color: string, style?: BoxStyle) }   // style: top、side、emissive、edge、outline
class Sprite extends Node { frame: BakedArt | null; flipX: boolean; opacity: number; xray: boolean }
class Custom extends Node { constructor(draw: (r: DrawContext, self: Custom) => void, bounds?: { x0; x1; y0; y1; z0; z1 }) }
interface BakedArt { w; h; ox; oy; px: Uint32Array; emissive?: Uint8Array; pts?: Record<string, [number, number]> }
```

`DrawContext`（`Raster` 实现）给 `Custom` 用：`P`、`k`、`spriteScale`、`vis`、`col` / `em`（夜色换算）、`litAt`、`night`、`t`，
世界空间的 `wpoly`、`wline`、`box`、`hipRoof`、`cyl`，屏幕空间的 `pix`、`darken`、`rect`、`line`、`ell`、`glow`，以及 `art`（在世界点画烘焙图）。

### IsoWorld（`core/world.ts`）

```ts
interface IsoWorld {
  readonly container: HTMLElement;
  readonly view: IsoView;           // 画布、缓冲、投影（view.proj）、渲染、invalidate()、stats
  readonly camera: IsoCamera;
  readonly scene: Node;             // 动态根节点：人物、球、活动道具都挂这里
  readonly statics: Node;           // 静态根节点：场景构建挂这里（增删改了要 view.invalidate()）
  readonly ground: GroundPainter;   // 地面贴图：paintRect / paintCirc / shadowBox / shadowBlob；改完自动标脏
  addLamp(l: Lamp): () => void;     // Lamp = { x, z, r, i }：夜里的灯光池，返回移除函数
  render(dt: number, now: number): void;  // dt 秒，now 演出时间（秒）
  dispose(): void;                  // 拆掉画布和事件
}
interface IsoWorldOptions { sky: string; bounds: Rect; slab?: Rect; slabDepth?: number; pose?: IsoCameraPose; pixelSize?: number }
function createIsoWorld(container: HTMLElement, o: IsoWorldOptions): IsoWorld;
```

- `slab` 是地台（浮空岛，ADR 0005）的范围，地面贴图只覆盖它；默认 `bounds` 外扩 12 米。Indian Wells 用 `indianWells.INDIAN_WELLS_WORLD`（含 `SLAB`）。`slabDepth` 是地台侧面的厚度（米，默认 7），动画库的小岛卡片用薄一些的地台；小岛自己不再建岛体方块，侧面全由 IsoView 画。
- `bounds` 同时是镜头平移的默认限制。`createIsoWorld` 自己 `bindPointer`、监听 `resize`。
- `render` 在宿主这一帧没调 `camera.update` 时自己补一次；地面绘制和 `addLamp` 会自动标脏静态层。

### IsoCamera（`core/camera.ts`）

```ts
interface IsoCameraPose { tx: number; tz: number; zoom: number; rot: 0 | 1 | 2 | 3 }   // zoom 就是 k
interface IsoCameraLimits { zoom: [number, number]; tx: [number, number]; tz: [number, number] }
class IsoCamera {
  constructor(view: IsoView, pose?: IsoCameraPose, limits?: IsoCameraLimits);
  readonly target: IsoCameraPose; readonly smooth: { tx; tz; zoom; ang };
  limits: IsoCameraLimits; home: IsoCameraPose; enabled: boolean;      // enabled = false 时不响应指针（正拖着人）
  setPose(p: IsoCameraPose, instant?: boolean): void;
  rotate(steps: number): void; zoomIn(): void; zoomOut(): void; reset(): void;   // reset 回 home，转角不变
  pan(dxPx: number, dyPx: number): void; zoomAt(zoom: number, cssX: number, cssY: number, instant?: boolean): void;
  static nearestStep(z: number): number;
  setFollow(on: boolean): void; readonly following: boolean;
  update(dt: number, focus: { x: number; z: number } | null): void;    // 每帧：跟随、缓动、交给 IsoView
  takeUpdated(): boolean; readonly moving: boolean;                    // moving：转动或缩放途中
  project(x: number, y: number, z: number): { x: number; y: number; depth: number };  // CSS 像素
  unproject(cssX: number, cssY: number, y?: number): { x: number; z: number };
  readonly pxPerM: number;          // CSS 像素每米（地点牌的紧凑模式读它）
  occludedBottomPx: number;         // 屏幕底部被 HUD 挡住的 CSS 像素：目标点放在剩下部分的中间
  resize(): void;
  bindPointer(el: HTMLElement): () => void;   // 拖动平移、双指缩放、滚轮；只在 el 上监听，返回解绑函数
}
```

### 昼夜（`core/daylight.ts`）

```ts
function daylightAt(minute: number, rain?: number): Light;   // Light：sky、mtn、plain、star、disc、moon、night、lamps
function createDaylight(world: { view: { setLight(l: Light): void } }): Daylight;
interface Daylight { update(minute: number, rain: number): void; lamps(): number; night(): number; readonly light: Light }
```

`update` 按 10 游戏分钟和雨量 1/10 分档，跨档才 `setLight`；`IsoView.setLight` 再按夜色 1/16、灯光 1/8 量化，跨档才重烘静态层。
雨天的压暗由 `daylight.update(minute, rain.amount())` 负责，`ambient/rain` 只画雨丝和水花。

### Site（`site/site.ts`，ADR 0016）

```ts
interface Site {
  readonly id: string;
  readonly sky: string;                                    // 起始天色（之后由 daylight 设）
  readonly camera: { overview: IsoCameraPose; portrait: IsoCameraPose; limits: { zoom: [number, number]; tx: [number, number]; tz: [number, number] } };
  readonly venue: Venue;                                   // 活动动画库的场地风格
  readonly bounds: { x0; x1; z0; z1 };                     // 园区范围
  groundY(x: number, z: number): number;
  readonly anchors: Record<string, XZ>;                    // 地点中心（活动牌）
  readonly stands: Record<string, XZ>;                     // 站位（地点牌）
  routeLine(a: string, b: string): XZ[] | null;            // 两个地点之间的步道折线（含两头站位）
  readonly courts: Record<string, readonly CourtFrame[]>;  // 地点 → 球场
  readonly grounds: Record<string, CourtFrame>;            // 地点 → 不是球场的空地
  build(w: IsoWorld): void;                                // 地面贴图 + 静态节点；种子随机流，顺序就是画面
  createOverlays(w: IsoWorld): { set(facility: string, state: string): void; wear?(facility: string, amount: number): void; flush?(): void };   // flush：立刻做掉排着的重建（截图、测试用）
  createSky(w: IsoWorld): { update(dt: number, now: number, rain: number, wind?: number): void };
}
```

- 设施 id 和状态名沿用内容里的 `facilities.yaml`；`site/indian-wells/state.ts` 把每个"设施 · 状态"映射到画面档位
  （`ruin` / `mid` / `fresh` / `worn`），`overlays.ts` 在同一轮的 `set` 之后（微任务里）按新状态表整体重建一次，每段用自己的种子随机流。
- `wear` 的 amount：0 干净，1 快掉档，再往上已经掉档（准则 6"先出画面信号，再掉档"）；状况怎么换算由游戏决定。
- `wind` 0 无风到 1 大风，默认 0.3，同时让棕榈和旗子摆得更厉害。

### Person（`people/person.ts`，API 兼容旧版）

`new Person(o: PersonOptions, world: PeopleWorld)`，`PeopleWorld = { scene: Node; groundY(x, z): number; people: Person[] }`。

活动库和游戏用到的旧 API 全部保留：`pos`（V3）、`root`（Group；`root.visible`、`root.scale`、`root.parent` 照用）、`headTop`、`handL`、`handR`、
`racketHead`（Node，跟当前帧的挂点走）、`yaw`、`lock`、`base`、`seatY`、`speedK`、`tired`、`panting`、`removed`、`userData`、`slideBounds`、
`go / path / wait / call / clearMoves / hop / spin / fall / give / take / overlay / resetAction / setStroke / gesture / update / rehome / busy / moving / speed`。
`body`、`head`、`upper`、`legL`、`legR`、`armL`、`armR` 保留为空 Group（演出偶尔转它们；像素版里忽略）。

画法：一个 `Sprite`（`person.sprite`），每帧按（朝向、姿势、击球分段、手势、走路相位）从精灵表取帧（`people/frames.ts` 的 `pickFrame`，
取不到按 `FRAME_FALLBACK` 回退，最后是 `idle`），换色按 `PersonOptions` 填槽位（`people/looks.ts` 的 `personSlots`）。`scale < 0.8` 用小孩精灵表。

### 镜头信息（`people/view.ts`）

```ts
function setPeopleView(ang: number, k?: number, spriteScale?: number): void;
```

人物选朝向、把素材像素的挂点换算成世界偏移（`artOffsetToWorld`）都要知道当前转角和精灵档位。宿主**每帧在更新人物之前**调一次，
传 `world.view.proj` 的 `ang`、`k`、`spriteScale`；没调时按 0 度、1 档算。这是模块级状态，一个页面里的多个 `IsoWorld` 共用它
（sandbox 动画库每张卡更新前各调一次）。

### 环境（`ambient/`）

```ts
createRain(world: IsoWorld, lighting?: RainLighting, n?: number, onGround?: (x, z) => boolean): Rain;   // start / stop / amount / update(dt, cx, cz)
createDog(scene, groundY, waypoints, coat?): Dog;
createCar(scene, carY, x, z, col, trim, path, vanishAtEnd?): Car;   // CAR_COLORS 给几种配色
new Crow(scene, x, y, z, yaw);
createTumbleweed(scene, groundY, bounds, o?) / createTumbleweeds(scene, groundY, bounds, count, o?);
```

小动物用 `Critter`（`Custom`）画：按屏幕上的走向自己挑朝向和翻转，不用知道镜头转角。只动画面，不碰模拟。

### 活动库（`activities/`，ADR 0010）

API 和搬家前一样：`startActivity(env, id, { area, bounds?, conditions, params?, cast?, seed?, extras? })`。
`ActivityEnv.scene` 是 `Node`；演出代码用 `Group / Node`，方块用 `new Box(w, h, d, hex)` 或 `people/parts.ts` 的 `part()`，
`Particles`、`SpriteLayer`、`BallPool` 是 iso 版。`activities.test.ts` 在 node 里跑（不碰 DOM）。

动画库小岛（只给 sandbox）：

```ts
function dioramaArea(meta: ActivityMeta): { area: CourtFrame; bounds };
function buildDiorama(world: DioramaWorld, meta: ActivityMeta, C: Conditions, seed?: number): Diorama;
```

`DioramaWorld` 是 `IsoWorld` 的结构子集（`scene`、`statics`、`ground.paintRect`、可选 `view.invalidate`）。`Diorama` 给出 `scene`、`root`、
`sky`、`area`、`bounds`、`perches`、`W`、`D`、`groundY`、`update(dt)`（雨丝）、`dispose()`。地面贴图换不掉，换小岛就重建一个 `IsoWorld`。

## 素材

- 一律是 `art/format.ts` 的字符画（`PixelArt`：`rows`、锚点 `ox / oy`、可选 `pal` 固定色、`pts` 挂点），放在 `art/<类>/*.ts`，导出常量。不放图片文件。
- 字符：`.` 透明；大写字母是 `SLOT` 槽位（人物：O 描边、S 皮肤、H 头发、T 上衣、R 腰带、L 袖子、B 下装、K 袜子、F 鞋、C 帽子、Q 球拍、W 白、E 眼睛；
  道具和设施：M 主色、N 副色、A 点缀、D 木、G 金属、V 玻璃、Y 灯光）；小写字母先查 `pal`，查不到就是对应大写槽位压暗（×0.75）；其余字符查 `pal`。
- 烘焙（`core/art.ts`）：`bakeArt(a: PixelArt, slots?: SlotColors): BakedArt`（按 art + slots 缓存；槽位颜色写 `'none'` 是透明），
  `flipArt(b)`，`nightArt(b, n, lit)`；烘焙结果是白天色，夜色在画的时候换算，`Y` 槽位自发光。
- 人物 8×14 左右（小孩约 7×10），两个朝向（front / back），左向由翻转得到。帧名、锚点、挂点、槽位约定见 `art/people/README.md`。
- 调色：暖色沙漠、Kairosoft 式饱和度，和样片一致（`docs/art/README.md`）。

## 规则（和 CLAUDE.md 一致）

- 演出里的随机只决定画面；场景构建用种子随机流，构建顺序就是画面。
- 不在画面代码里改模拟状态；不把文案写死（场景里的字走 `activities/text.ts` 或 i18n）。
- `@td/iso` 不依赖 three、preact、`@td/ui`、`@td/content`（`pnpm check:deps` 检查）。核心（graph、raster、proj、draw、art、ground、daylight）不碰 DOM，
  能在 node 里测；只有 `view.ts`、`camera.ts`、`world.ts` 碰画布、指针和窗口事件。
- 注释和文档用中文，代码风格照现有（Biome）。
