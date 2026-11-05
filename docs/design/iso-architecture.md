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
               props/（held.ts 手持道具、ground.ts 地上道具、mess.ts 球场上的球和垃圾）、icons/（表情图标）、font/（像素字 5×7、3×5）、
               creatures/（狗、乌鸦、风滚草）
  site/        site.ts（Site 接口、pointAlong）、indian-wells/（layout、ground、build、kit、noise、overlays、state、wear、mess、sky、index）
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
  每个缓冲像素 = `pixelSize` 个 CSS 像素（默认手机 1，宽屏 ≥ 820 CSS px 时 2）。 运行中可以用 `view.setPixelSize(n)` 换（之后 `camera.resize()`），`view.pixelSize` 读回构造时或最后一次设的值；打扫小游戏用它放大到 2。
- `k`（每米缓冲像素）就是镜头的 `zoom`；**精灵档位** `spriteScale = max(1, round(k / K1))`，`K1 = 14 / 1.8 ≈ 7.8`
  （1 档时 14 像素高的人正好 1.8 米）。镜头拉远时人比真实比例大（Kairosoft 式），拉近时按 2、3 倍放大。
- 旋转：静止时只停在 4 个等距角（`rot` 0–3），Q/E 是约 0.45 秒的缓动。
- 缩放档位：`ZOOM_STEPS = [2, 3, 4, 5.2, 7.8, 15.6, 23.4]`（精灵 1/1/1/1/1/2/3 倍，人相对世界的大小随放大只减不增），游戏限制 [2, 15.6]；精灵档位跟目标档位走（`spriteScaleFor`，缩放动画开始时就换好），双指时带回差（`spriteScaleHyst`）；`IsoCamera.nearestStep(z)` 取最近一档。
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
interface IsoWorldOptions { sky: string; bounds: Rect; slab?: Rect | Rect[]; slabDepth?: number; pose?: IsoCameraPose; pixelSize?: number }
// IsoWorld 还有：setSlab(rects: Rect | Rect[], bounds?: Rect): void  // 地台换轮廓（地图长大）
function createIsoWorld(container: HTMLElement, o: IsoWorldOptions): IsoWorld;
```

- `slab` 是地台（浮空岛，ADR 0005）的范围，地面贴图只覆盖它；默认 `bounds` 外扩 12 米。Indian Wells 用 `indianWells.INDIAN_WELLS_WORLD`（含 `SLAB`）。`slabDepth` 是地台侧面的厚度（米，默认 7），动画库的小岛卡片用薄一些的地台；小岛自己不再建岛体方块，侧面全由 IsoView 画。
- **地台可以是几块矩形拼出的轮廓（ADR 0021）。** `slab` 给矩形数组时，`IsoView` 用 `slabOutline(rects)`（`core/ground.ts`）把它们合并成外轮廓：按所有矩形的边切格子，"格子在里、隔壁在外"的格边是外墙，同一直线上、同朝向、首尾相接的并成一面；重叠、相接、分开（靠岸的小岛）都行。朝镜头的墙从远到近画，土层只看"离地面多深"，所以几面墙的土层在同一高度接上；内角两面墙直接相接，不留缝、不加竖线（现在地台本来就没有切角和竖边线，外角和单块矩形时一样）。**单块矩形走原来的代码路径，像素和以前完全一样。**
- 地面贴图覆盖几块矩形的外包框；框里不在地台上的纹素是 0（透明），`paintRect` 不会画进去（`GroundPainter.mask`、`onSlab(x, z)`）。
- `world.setSlab(rects, bounds?)` 在运行时换轮廓：贴图换成新外包框，画过的纹素按世界坐标原样搬过去（外包框西北角不动时纹素下标也不变，`hash(i, j)` 花纹对得上），新进地台的纹素填底色、出了地台的清成 0，地面版本号、灯光图、背景地平线都重算；旋转中心不动，镜头不跳。新地的地面由场景自己画上去（Palm Oasis 见 `site/indian-wells/land.ts`，挂在 `foreshadow.ts` 的 `afterPaintGround` 上）。给了 `bounds` 就同时放宽镜头平移范围。按 ADR 0021，新地只往东南、西北角长（竖屏只变高不变宽）。
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
interface Daylight { update(minute: number, rain: number, heat?: number): void; lamps(): number; night(): number; readonly light: Light }
```

`update` 按 10 游戏分钟和雨量 1/10 分档，跨档才 `setLight`；`IsoView.setLight` 再按夜色 1/16、灯光 1/8 量化，跨档才重烘静态层。
雨天的压暗由 `daylight.update(minute, rain.amount())` 负责，`ambient/rain` 只画雨丝和水花。
酷热 `heat`（0..1，court-care-contract.md）：白天的天空往发白的暖色靠、地平线最白、远山被热霾冲淡、太阳发白，按白天的程度淡入，
夜里和雨天没有；只改天空、山、荒原和太阳（每帧查表），不改调色板夜色，不让静态层重烘。

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
  readonly gates?: Record<string, XZ>;                     // 球场门外：场地不能打时会员等在这儿（围网外的步道上、不挡门）；没给的用 stands
  routeLine(a: string, b: string): XZ[] | null;            // 两个地点之间的步道折线（含两头站位）
  readonly courts: Record<string, readonly CourtFrame[]>;  // 地点 → 球场
  readonly grounds: Record<string, CourtFrame>;            // 地点 → 不是球场的空地
  build(w: IsoWorld): void;                                // 地面贴图 + 静态节点；种子随机流，顺序就是画面
  createOverlays(w: IsoWorld): {
    set(facility: string, state: string): void;
    wear?(facility: string, amount: number): void;
    flush?(): void;                                          // 立刻做掉排着的重建（截图、测试用）
    variant?(facility: string, variant: string | null): void; // 修复变体（wave1-contract.md），影响 fresh / worn 各档；null = 原样
    preview?(facility: string, variant: string | null): void; // 现在的样子上叠变体修好后的幽灵（Bayer 约 45% + 浅青 + 虚线框）；null 关
    upgrade?(facility: string, upgrade: string, on: boolean): void; // 升级画在变体上面（没修好、变体不对时不画）
    plaque?(rows: readonly { facility: string; leader: string; day: number }[]): void; // 大门南侧的铜牌，一行一处
    mess?(facility: string, mess: CourtMessLook | null): void; // 场地可用度的脏乱（见下）；null 不画
    repaint?(): void;                                        // 立刻整个重做地面和静态节点（小游戏改过地面以后还原）
  };
  createSky(w: IsoWorld): { update(dt: number, now: number, rain: number, wind?: number, heat?: number): void };
}
```

- 设施 id 和状态名沿用内容里的 `facilities.yaml`；`site/indian-wells/state.ts` 把每个"设施 · 状态"映射到画面档位
  （`ruin` / `mid` / `fresh` / `worn`），`overlays.ts` 在同一轮的 `set` 之后（微任务里）按新状态表整体重建一次，每段用自己的种子随机流。
- `wear` 的 amount：0 干净，1 快掉档，再往上已经掉档（准则 6"先出画面信号，再掉档"）；状况怎么换算由游戏决定。
- `wind` 0 无风到 1 大风，默认 0.3，同时让棕榈和旗子摆得更厉害。
- `heat` 0..1 酷热（默认 0）：球场、停车场和车道上的热浪——屏幕上那块菱形里一部分像素行整行左右错一格、慢慢往上飘
  （动态层最先画，只挪静态层的像素，不混色、不进静态层；夜里、雨天没有）。天色发白归 `daylight`。
- `mess(facility, mess)`（court-care-contract.md，ADR 0022；Indian Wells 在 `site/indian-wells/mess.ts`）：
  `CourtMessLook = { sand; water; litter; lines; cracks }`，各 0..1，和模拟的 `CourtMess` 同构（游戏直接传 `s.care[f].mess`）。
  只认五处球场（`outer_1`、`outer_23`、`practice`、`stadium_1`、`stadium_3`），设施修好（`fresh` 档）才画；面和场地按 `variant()`
  （`outer_23` 的 hard 画硬地的样子，`stadium_3` 的 pickle4 四片、tennis2 两片）。每块场一个贴地的 `Custom`（`renderOrder` -1000，
  挂在 `statics` 下），格子和地面纹素对齐（0.2 米），逐像素反投影混色、走深度缓冲，夜里逐格按灯光池换算；
  沙（西边围网根先积、几堆沙丘）、水（硬地：浅蓝水洼和深色湿印；红土：深色湿泥和小水洼）、褪色的线（先发灰，再一段段露出场地色；
  红土是被红土盖住）、裂缝（硬地：几道慢慢长出来的裂纹；红土：发白的干裂斑块和龟裂纹），球和垃圾是 `art/props/mess.ts` 的小像素块。
  每格、每件、每道裂缝都有固定的门槛（自己的种子流和值噪声，按百分位），量越大铺得越开，连续不跳。
  量按 0.02 量化，没跨档不 `invalidate`（游戏可以每帧调）；不认识的设施、全 0、null 不画。
  长期磨损 `wear` 在这五处球场上不再画沙和垃圾，只画杂草和旧面斑驳（Bayer 抖动的灰白斑），两个信号分开。
- sandbox 场景查看器：`?mess=outer_1:sand=0.7,water=0.3,outer_23:cracks=0.6`（设施:项=量，可以接着写下一处）、`?heat=1`；
  "更多"面板里有选场地、五个滑杆、全脏 / 清空、酷热开关。截图在 `apps/sandbox/public/shots/mess-*.png`。

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


- 多块拼合的地台：远侧的内角墙如果大半个底边被前面的地面挡住，就不画（否则隔着缺口看像地上的坑）；单一矩形的地台画法不变。
