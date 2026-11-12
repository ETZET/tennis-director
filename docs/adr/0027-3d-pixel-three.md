# 0027 画面换成 three.js 3D 像素（低分辨率正交渲染），2.5D 等距画面归档

- 状态：已采纳
- 日期：2026-11-08
- 取代：[0019](0019-isometric-pixel-renderer.md)（Canvas 2D 软件光栅的 2.5D 等距像素画面，以及"整个仓库不引入 three 和 WebGL"的约束）
- 修订：[0005](0005-scenes-are-islands.md)（不再是浮空岛：地面铺出画面，地图边上是低成本的山，见 `docs/lab/2026-11-07-3d-pixel/boundary.md`）、0016（地图的画面以后由 3D 场景提供，Site 接口在接回游戏时重定；0016 随 2.5D 主线删除）
- 编号说明：0025（总监直接操控）、0026（骨骼像素人物）当时在另一条没合并的分支上，所以这里跳到 0027。那条分支建在归档的 2.5D 画面上，2026-11-08 已放弃：直接操控总监在 3D 场景里已经做出来了，见 [0029](0029-director-direct-control.md)；骨骼人物就是 `clubsite/people/`。0025、0026 这两个号不再用。人物模拟原来和 0023（无级旋转）撞号，改成 0028（2026-11-12 随派工删除）。

## 背景

2026-11-07 起在 sandbox 里试了 three.js 的"3D 像素"做法（t3ssel8r 风格）：低分辨率正交渲染、纹素对齐的相机、深度/法线描边、三档 toon 光、云影、风摆。
先后做了池塘复刻、沙漠球场、整座俱乐部地图和七个场景（停车场、露天前台、匹克球、红土、喷泉、中心球场、会员场 + 青训），
有一套固定流程（`.claude/skills/pixel-scene`：白模 → 素材 → 组装演出 → 数字验收）、材质规范（`docs/lab/2026-11-07-3d-pixel/material-spec.md`）和配色（6 午后金光）。
用户看过以后决定：游戏的画面改走这条路，原来的 2.5D 等距画面归档。

## 决定

- 画面用 three.js 3D 像素：每个场景在 `apps/sandbox` 里按 skill 的流程做（`src/club*/`），共用的东西在 `src/clubsite/`（地面、山、取景、人物、共享素材、总监操控）、`src/clubfront/`（toon、管线、配色方案）。
- `packages/iso`、依赖它的 sandbox 页面（场景查看器、活动动画库、demo 页、人物方案页）和 `apps/game` 里的画面层归档到 `docs/archive/iso-2.5d/`，不参与构建、类型检查和测试。代码原样保留，作为参考（活动演出、人物动作、Site 接口的写法）。
- `packages/sim`、`packages/ui`、`packages/content`、`packages/shared` 不动；模拟只按名字引用位置（锚点）这条照旧。
- 游戏暂时没有画面。以后把 3D 场景接回 `apps/game` 时另写 ADR，定新的场景接口（锚点 → 场景里的站位、演出订阅领域事件）。

## 后果

- 分层：`apps/sandbox → three + sim/shared`；`apps/game` 暂时只有模拟和界面。`pnpm check:deps` 的规则按归档后的包更新。
- three 回到依赖里（只在 `apps/sandbox`）。体积和低端机性能以后接回游戏时再量；场景页现在每帧约 1300～2700 次绘制、20 万～90 万三角形（含深度、法线、投影三遍）。
- 截图基准、活动库、2.5D 的截图测试随归档一起停用。
- 参考图（别人的作品截图）仍然只放在本地 `~/workspace/tennis-director-refs/`，不进仓库。
