# 0016 整局只有一张地图（Indian Wells），画面通过 Site 接口接进游戏

- 状态：已采纳
- 日期：2026-11-01
- 取代：三幕结构（Hollow Creek → 枫岭高中 → 顶级网球中心）和跨幕继承
- 补充：[0008](0008-game-app-vertical-slice.md)、[0012](0012-staffing-loop.md)、[0015](0015-jobs-unlock-from-repairs.md)
- 注（2026-11-09）："通关和失败""招聘日"两条随 2.5D 主线 / 派工归档（[main-line-2.5d.md](../archive/pre-3d/main-line-2.5d.md)），游戏流程重新设计中；整局一张地图照旧。

## 背景

设计改成整局只在一张地图上：废弃的 Indian Wells Tennis Garden，修一处、开一处（设计文档"地图"一节）。
游戏 app 的画面原来直接引用 `hollowCreek` 模块的锚点、步道、球场、相机、天空和设施覆盖层，换地图就要改一遍游戏代码。
内容和模拟按"幕"索引，还有一套"谁跟我走"的跨幕继承。

## 决定

- **Site 接口**（`packages/render/src/world/site.ts`）：一张地图在画面这一侧提供锚点中心、站位、两点之间的步道折线、
  每个地点上的球场框和空地、灯光和雨天、相机预设和范围、建静态场景、设施状态的画面层、天空。
  `apps/game` 只认这个接口；`scene.ts`、`life.ts`、`perform.ts`、`main.ts` 都不再引用具体的地图。
- **Indian Wells 灰盒**（`packages/render/src/scenes/indian-wells/`）：平地、色块和现成的场地道具，按真实场馆的大致关系摆。
  每个"设施.状态"一层覆盖层（开局的积沙、倒网、碎石也是一层）。精细的废弃场景以后替换它，接口不变。
- **导航图两两相连**：内容里 10 个地点两两都有一条边，分钟数等于画面上步道最短路的长度 ÷ 3 米/分钟，
  `game.test.ts` 检查两边一致（±1 分钟）。这样模拟的最短路和画面上走的路永远对得上。
- **"幕"这一层保留为地图配置**：`acts/indian_wells.yaml` 是唯一的一份，字段不变（营业时间、开局、导航、规则、日程）。
  只改名不改结构的收益太小，改名留到以后真要做第二张地图时再说。
- **去掉跨幕继承**：`follow` 效果、状态里的 `legacy` 删掉，存档版本 4 → 5（迁移时删掉 `legacy`）。
- **通关和失败**：在 Stadium 1 办成表演赛（工单，带判定，冷场了一周后可以再办）= 通关；
  第 112 天收盘（投资方的 16 周期限）或现金跌破 −$2000 = 失败。
- **招人用招聘日**：会所修好后开第一个招聘日，之后每两周一次（卡链）。卡上直接显示候选人最强的两项能力和周薪，
  所以没有另做"试训"：信息已经是公开的，再试一天不会多知道什么。

## 后果

- 加一张新地图 = 一个新的 `scenes/<map>/` 实现 Site + 一份内容；游戏代码不动。
- Hollow Creek 的渲染场景代码留着（sandbox 和以后的参考），但游戏不再用它。
- 平衡报告改成 `docs/balance/indian-wells.md`；`balance.test.ts` 的区间：贪心型通关 ≥ 60%，从不招人的谨慎型 ≤ 20%，
  随机型 ≤ 20%，放置不管的对照组 0%，贪心型平均 70 天以上才通关。

## 修订（2026-11-03，ADR 0019）

`Site` 搬到 `packages/iso/src/site/site.ts`，不再有 three 类型：相机预设和范围是 `IsoCameraPose`（`tx`、`tz`、`zoom`、`rot`），
`build`、`createOverlays`、`createSky` 接 `IsoWorld`；灯光和雨天光照从接口里去掉（由 `core/daylight.ts` 统一处理），加了起始天色 `sky`，
`createOverlays` 多了可选的 `wear`（状况下降的画面信号）。地图在 `site/indian-wells/`（Palm Oasis，ADR 0018），灰盒和 Hollow Creek 场景已删。
