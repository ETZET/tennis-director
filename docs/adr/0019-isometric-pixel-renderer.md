# 0019 画面从 three.js 体素 3D 换成 2.5D 等距像素（Canvas 2D 软件光栅）

- 状态：已采纳；已被 [0027](0027-3d-pixel-three.md) 取代（2026-11-08，2.5D 画面归档到 `docs/archive/iso-2.5d`）
- 日期：2026-11-02
- 取代：[0003](0003-m0-split-before-upgrade.md) 里"M0 只用升级 three.js 的方式改画面"的约束；[0004](0004-typescript-7-tooling.md) 之外的 three 相关约定
- 修订：[0005](0005-scenes-are-islands.md)（浮空岛保留，画法换成像素立体模型）、[0010](0010-activity-library.md)（活动库搬到新包，API 不变）、[0016](0016-single-map-site.md)（Site 接口去掉 three 类型）

## 背景

美术样片 `docs/art/style-demos/isometric-2.5d/` 用纯 Canvas 2D 自己写的软件光栅器画出了 Palm Oasis 的三个复原阶段和昼夜，
效果明显好过 three.js 体素版：轮廓清楚、像 Kairosoft 一样一眼看得懂、夜景氛围好，而且不用建模和调光。
three.js 在这个画风里只剩负担：体积（gzip 约 300 kB 的大头）、色彩管理兼容模式、正交相机和体素批次都要绕路才能出像素感。

## 决定

- 新包 `packages/iso`（`@td/iso`）：Canvas 2D 软件光栅的 2.5D 等距像素画面，契约见 `docs/design/iso-architecture.md`。
  不依赖 three；核心（场景图、光栅、素材烘焙）不碰 DOM。
- 用一个照 three Object3D 子集写的轻量场景图（`core/graph.ts`），活动库和人物的演出代码几乎原样搬过来，只换画法。
- 人物换成约 8×14 像素的精灵（两个朝向、按帧名取帧、运行时换色）；素材一律是文本字符画（可 diff、可审查），不放图片。
- 静态层按转角和缩放缓存，动态层每帧画，用深度缓冲遮挡；静止时只停在 4 个等距角，缩放用离散档位。
- 迁移完成后删除 `packages/render`、Hollow Creek 场景、three 和 `@types/three`；sandbox 改成 iso 场景查看器和活动库。

## 后果

- 分层规则不变，只是 `render` 换成 `iso`：`apps → iso / ui → sim → shared`，`iso` 和 `ui` 互不引用。
- 低端安卓上的 CPU 光栅是主要风险：静态层缓存，每帧只画动态物件；必要时降缓冲分辨率。
- 截图基准全部重拍。
- 细节美术（人物动作、设施贴片）靠程序化字符画，以后可以由像素美术逐张替换，格式不变。
