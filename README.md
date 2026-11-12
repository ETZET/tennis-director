# 网球总监 · Tennis Director

浏览器上的网球中心经营模拟。画面正从 2.5D 等距像素换成 three.js 3D 像素（低分辨率正交渲染，ADR 0027）：新场景在 `apps/sandbox` 的 club* 页面里做，游戏暂时只有模拟和界面；旧的 2.5D 画面归档在 `docs/archive/iso-2.5d`。你是沙漠里一家网球俱乐部的总监：在 3D 俱乐部里走来走去，拿起工具干活，会员和客人的一天跟着你转（ADR 0029）。2.5D 时期的主线（修复、16 周、星级、赛事、结局）和派工 2026-11-09 作废（设计文档 2026-11-12 删除），游戏流程正在重新设计。

## 当前进度：3D 像素场景在 sandbox 里做，下一步先把场景美术做全，再接回游戏

五个场景能操控总监玩（停车场、露天前台、匹克球、红土、喷泉广场），中心球场和会员场 + 青训场素材做完，餐车院子是白模。
待办和里程碑（M-A 场景美术做全 → M-B 接回游戏；M-0 重新设计游戏流程和 M-A 并行）见 [docs/design/backlog.md](docs/design/backlog.md)。

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M0 | 工程脚手架；Hollow Creek 拆进 `packages/render`，浮空岛、溪流分岛布局、场边转播 HUD（ADR 0005、0006） | 完成（three.js 版画面后来被 ADR 0019 取代） |
| M1 | 模拟核心：时钟、状态、命令、事件引擎和导演、存档迁移、sim-cli（ADR 0007） | 完成 · 1000 局确定性闸口通过 |
| M2 | 第一幕纵切片：`apps/game` 把模拟、画面、界面接起来；总监走位、因果日志、活动演出、自动存档（ADR 0008） | 完成 · 等试玩 |
| M3 | 内容热重载、调试面板、内容校验、机器人跑局报告和平衡（ADR 0009） | 完成 · 不写代码加卡的示范见 `docs/content-guide.md` |
| IW | 整局只在废弃的 Indian Wells Tennis Garden：修一处开一处、招聘日、16 周期限、表演赛通关 | P0、P1 完成；这条主线 2026-11-09 作废 |
| ISO | 画面换成 2.5D 等距像素 `packages/iso`：软件光栅、字符画素材、Palm Oasis 场景、活动动画库搬家，删掉 three.js（ADR 0018、0019） | 完成，后来被 ADR 0027 取代、归档 |
| 3D | 画面换成 three.js 3D 像素、玩家直接操控总监：sandbox 里按 pixel-scene 流程做俱乐部的各个场景，接回游戏另写 ADR（ADR 0027、0029） | 进行中（M-A 场景美术做全） |
| M-0 | 围绕 3D 俱乐部重新设计游戏流程（一局怎么走、目标、员工要不要有、卡、结算、失败） | 设计中，和 M-A 并行 |

## 目录

```
packages/
  shared/    类型、常量、种子随机数、数学工具
  sim/       模拟核心：时钟、状态、命令、事件引擎、导演、存档、机器人
  content/   YAML 内容、schema、编译器、热重载插件
  ui/        Preact 界面：场边转播 HUD（记分牌、状态条、事件卡、俱乐部快讯）、调试面板
apps/
  game/      正式游戏：模拟 + 界面（画面迁移中，舞台上暂时只有地点按钮）
  sandbox/   three.js 3D 像素场景（club* 页面；index.html 是页面目录）
  sim-cli/   命令行无头跑局：确定性闸口、机器人平衡报告
tools/
  playtest/    试玩服务器
docs/adr/      架构决策记录
docs/design/   设计文档（玩法、架构、测试、待办）
docs/lab/      实验记录（3D 像素：docs/lab/2026-11-07-3d-pixel）
docs/archive/  归档（iso-2.5d：旧的 2.5D 等距画面代码，不参与构建）
docs/art/      画风和素材说明（还是 2.5D 时期的，待重写）
docs/content-guide.md   不写代码加卡
```

分层规则见 [CLAUDE.md](CLAUDE.md)。

## 开发

需要 Node 22 和 pnpm 10。

```
pnpm install
pnpm game                # 打开游戏（开发版：` 键调试面板，改 YAML 热重载）
pnpm dev                 # 打开 sandbox（3D 像素场景：clubmap2.html、clubdesk.html……）
pnpm check               # 类型检查 + 规范 + 分层 + 测试 + 构建
pnpm content             # 内容 YAML → JSON
pnpm sim bots --games 1000   # 机器人跑局报告
```

