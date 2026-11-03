# 2.5D 等距像素画面 · 架构契约（ADR 0019）

这份是 `packages/iso`（`@td/iso`）的接口契约，所有参与迁移的人（和 subagent）都按它写。
接口改动要先改这份文件。样片：`docs/art/style-demos/isometric-2.5d/index.html`（画法的参考实现，照搬它的光栅器）。

## 目标

- 画面从 three.js 体素 3D 换成 Canvas 2D 软件光栅的 2.5D 等距像素（固定 2:1 等距，Q/E 转 90°）。
- `sim`、`ui`、`content` 不动；模拟只按锚点名说话，画面按 `layout.ts` 的世界坐标（米）画。
- 迁移完成后删掉 `packages/render` 和 three 依赖。

## 包结构和归属

```
packages/iso/src/
  core/        graph.ts（场景图，已定）、raster.ts（光栅原语）、art.ts（bakeArt 烘焙、换色）、
               view.ts（IsoView：画布、低分辨率缓冲、投影、静态层缓存、渲染循环一帧）、
               camera.ts（IsoCamera：平移、整数档缩放、Q/E 旋转、project/unproject、bindPointer）、
               daylight.ts（按游戏分钟给天色、夜色、灯光强度）、world.ts（IsoWorld = 旧 Stage）
  art/         format.ts（已定）、people/（人物精灵表）、props/（手持和地上道具）、icons/（表情图标）、
               font/（像素字，场景里的漫画字和招牌）、tiles/（设施细节贴片）
  site/        site.ts（Site 接口）、indian-wells/（layout.ts、build、overlays、wear、sky）
  people/      person.ts（Person，像素精灵版，API 兼容旧版）、poses.ts（已拷）、looks
  motion/      ball.ts（BallPool / Ball）、ballistics.ts（已拷）
  choreo/      scheduler.ts（已拷）、shots.ts
  fx/          particles.ts、sprites.ts（SpriteLayer：漫画字、表情、气泡，画在叠加层）、icons
  ambient/     car、dog、crow、rain、tumbleweed
  activities/  runtime、choreo、12 个活动、registry/text/types/looks（已拷）、diorama（动画库小岛）
  index.ts     公共出口
```

## 投影和像素

- 世界：米，y 向上，北是 -z。投影（样片的 `P`）：先绕场地中心转角 `ang`，再
  `sx = OX + (rx - rz) * k`，`sy = OY + (rx + rz) * k / 2 - y * k * 1.225`。
- 画面画进**低分辨率缓冲**（Uint32Array，ImageData），再用 `image-rendering: pixelated` 放大到画布。
  缓冲像素 = 整数个 CSS 像素（手机 1、桌面 2，可调）。
- `k`（每米缓冲像素）随缩放连续变；**精灵档位** `spriteScale = max(1, round(k / K1))`，`K1 = 14 / 1.8 ≈ 7.8`
  （1 档时 14 像素高的人正好 1.8 米）。镜头拉远时人比真实比例大（Kairosoft 式），拉近时按 2、3 倍放大。
- 旋转：静止时只停在 4 个等距角（0、90、180、270 度），Q/E 是约 0.45 秒的缓动。
- 缩放档位：建议 `k` 取一组离散值（例如 2、3、4、5.2、7.8、11.7、15.6），手机默认约 1.5 倍"铺满围墙"。

## 渲染分层（性能）

1. **背景**：天空、星星、群山（样片里的画法），按转角缓存，换天色时重画。
2. **静态层**：地面贴图（0.2 m/texel 的俯视贴图，反投影采样）+ 所有静态节点（建筑、看台、围网、树）。
   **按转角和缩放缓存成一张缓冲**；设施状态变了、昼夜档变了就标脏，下一帧重烘（可以接受约 100 ms 的一次卡顿）。
   旋转动画中途不缓存，实时画。
3. **动态层**：人、球、道具、粒子、活动的东西。每帧画，按脚底深度排序，和静态层用一个
   **深度缓冲**（每像素存 rx+rz 深度，Float32Array）做遮挡：动态物件被前面的建筑挡住时不画。
4. **叠加层**：漫画字、表情、地点牌在另一张画布或 DOM（游戏的地点牌仍是 DOM，`camera.project` 给 CSS 坐标）。

## 实现备注（wave 1 定下来的）

- `IsoCameraPose.zoom` 就是 `k`（每米缓冲像素）；档位 `ZOOM_STEPS = 2, 3, 4, 5.2, 7.8, 11.7, 15.6`，默认限制 [2, 15.6]。
- 相机额外有 `enabled`、`zoomAt`、`setPose`、`home`、`moving`；`bindPointer` 返回解绑函数；`world.dispose()` 释放画布和事件。
- 像素图锚点在像素缝上：人物左右对称于第 `ox-1` 列和第 `ox` 列之间。翻转时 `ox' = w - ox`，挂点 `x' = w - 1 - x`。
- `world.render` 在游戏没调 `camera.update` 的那一帧自己调一次；地面绘制和 `addLamp` 会自动标脏静态层。
- 雨只画雨丝（ambient/rain），变暗由 `daylight.update(minute, rain)` 负责。

## 关键接口

### IsoWorld（旧 `Stage` 的替身，`core/world.ts`）

```ts
interface IsoWorld {
  readonly container: HTMLElement;
  readonly view: IsoView;           // 画布、缓冲、投影、渲染
  readonly camera: IsoCamera;
  readonly scene: Node;             // 动态根节点：人物、球、活动道具都挂这里
  readonly statics: Node;           // 静态根节点：场景构建挂这里（改了要 view.invalidate()）
  readonly ground: GroundPainter;   // 地面贴图：paintRect / paintCirc（样片 API），改完 invalidate
  addLamp(l: { x: number; z: number; r: number; i: number }): () => void;  // 夜里的灯光池，返回移除函数
  render(dt: number, now: number): void;
}
function createIsoWorld(container: HTMLElement, o: { sky: string; bounds: Rect; slab?: Rect }): IsoWorld;
```

### IsoCamera（`core/camera.ts`，取代 OrbitCamera）

```ts
interface IsoCameraPose { tx: number; tz: number; zoom: number; rot: 0 | 1 | 2 | 3 }
class IsoCamera {
  readonly target: IsoCameraPose; readonly smooth: { tx; tz; zoom; ang };
  rotate(steps: number): void; zoomIn(): void; zoomOut(): void; reset(): void; pan(dxPx: number, dyPx: number): void;
  bindPointer(el: HTMLElement): void;         // 拖动平移、双指缩放、滚轮；不拦截 HUD 的事件
  setFollow(on: boolean): void; update(dt: number, focus: { x: number; z: number } | null): void;
  project(x: number, y: number, z: number): { x: number; y: number; depth: number }; // CSS 像素
  unproject(cssX: number, cssY: number, y?: number): { x: number; z: number };
  readonly pxPerM: number;                    // CSS 像素每米（地点牌的紧凑模式读它）
  occludedBottomPx: number; resize(): void;
}
```

### Site（`site/site.ts`）

和旧接口一样的部分：`id`、`venue`、`bounds`、`groundY`、`anchors`、`stands`、`routeLine`、`courts`、`grounds`。
变化：

```ts
interface Site {
  readonly sky: string;
  readonly camera: { overview: IsoCameraPose; portrait: IsoCameraPose; limits: { zoom: [number, number]; tx: [number, number]; tz: [number, number] } };
  build(w: IsoWorld): void;                                   // 地面贴图 + 静态节点；同一条种子随机流，顺序就是画面
  createOverlays(w: IsoWorld): { set(facility: string, state: string): void; wear?(facility: string, amount: number): void };
  createSky(w: IsoWorld): { update(dt: number, now: number, rain: number, wind?: number): void };
}
```

设施和状态的名字沿用 `packages/render/src/scenes/indian-wells/overlays.ts`（游戏按内容里的设施状态调 `set`）。

### Person（`people/person.ts`，API 兼容旧版）

活动库和游戏用到的旧 API 全部保留：构造参数 `PersonOptions`（同旧版）、`pos`（V3）、`root`（Node；`root.visible`、
`root.scale`、`root.parent` 照用）、`headTop`、`handL`、`handR`、`racketHead`（都是 Node，世界位置跟当前帧的挂点走）、
`yaw`、`lock`、`base`、`seatY`、`speedK`、`tired`、`panting`、`removed`、`userData`、`slideBounds`、
`go / path / wait / call / clearMoves / hop / spin / fall / give / take / overlay / resetAction / setStroke / gesture / update / rehome / busy / moving / speed`。
`body`、`head`、`upper`、`legR` 这些肢体节点保留为空 Group（演出偶尔转它们；像素版里只影响挂点偏移或忽略）。
画法：一个 `Sprite` 节点，每帧按（朝向、姿势、击球分段、手势、走路相位）从精灵表取帧（`art/format.ts` 的帧名约定），
换色按 `PersonOptions` 的颜色填槽位。`scale < 0.8` 用 kid 体型。

`PeopleWorld` 不变：`{ scene: Node; groundY(x, z): number; people: Person[] }`。

### 活动库

`ActivityEnv.scene` 的类型从 `THREE.Object3D` 换成 `Node`，其余类型不变。演出代码把 `THREE.Group/Object3D` 换成 `Group/Node`，
`new THREE.Mesh(boxGeo(w,h,d), material(hex))` / `part()` 换成 `new Box(w,h,d,hex)`，`Particles`、`SpriteLayer`、`BallPool` 用 iso 版。
`activities.test.ts` 照旧能在 node 里跑（不碰 DOM）。

## 素材

- 烘焙接口（`core/art.ts`）：`bakeArt(a: PixelArt, slots?: SlotColors): BakedArt`（按 art+slots 缓存），
  `flipArt(b: BakedArt): BakedArt`；夜色在画的时候由 `DrawContext.art` 处理，烘焙结果是白天色。

- 一律是 `art/format.ts` 的字符画，放在 `art/<类>/*.ts`，导出常量；运行时 `bakeArt(art, slots)` 烘焙并缓存。
- 人物 8×14 左右（kid 约 6×10），两个朝向（front / back），左向由翻转得到。描边用 `O` 槽位。
- 调色：暖色沙漠、Kairosoft 式饱和度，和样片一致（`docs/art/README.md`）。

## 规则（和 CLAUDE.md 一致）

- 演出里的随机只决定画面；场景构建用种子随机流，构建顺序就是画面。
- 不在画面代码里改模拟状态；不把文案写死（场景里的字走 `activities/text.ts` 或 i18n）。
- `@td/iso` 不依赖 three、preact、`@td/ui`、`@td/content`。核心（graph、raster、art 烘焙）不碰 DOM，能在 node 里测；
  只有 `view.ts`、`camera.ts` 碰画布和指针事件。
- 注释和文档用中文，代码风格照现有（Biome）。
