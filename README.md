# 网球总监 · Tennis Director

浏览器上的 2.5D 等距像素网球中心经营模拟（Canvas 2D 自己写的软件光栅，不用 WebGL 和 three.js）。你是一家网球中心的总监：事件推着时间走，你决定先处理哪件事、走到哪里去。

## 当前进度：主游戏迁到 Indian Wells（整局一张地图，开局废弃），P0 和 P1 完成

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M0 | 工程脚手架；Hollow Creek 拆进 `packages/render`，浮空岛、溪流分岛布局、场边转播 HUD（ADR 0005、0006） | 完成（three.js 版画面后来被 ADR 0019 取代） |
| M1 | 模拟核心：时钟、状态、命令、事件引擎和导演、存档迁移、sim-cli（ADR 0007） | 完成 · 1000 局确定性闸口通过 |
| M2 | 第一幕纵切片：`apps/game` 把模拟、画面、界面接起来；总监走位、因果日志、活动演出、自动存档（ADR 0008） | 完成 · 等试玩 |
| M3 | 内容热重载、调试面板、内容校验、机器人跑局报告和平衡（ADR 0009） | 完成 · 不写代码加卡的示范见 `docs/content-guide.md` |
| IW | 整局只在废弃的 Indian Wells Tennis Garden：修一处开一处、招聘日、16 周期限、表演赛通关（ADR 0015、0016） | P0、P1 完成（`docs/design/indian-wells-migration.md`） |
| ISO | 画面换成 2.5D 等距像素 `packages/iso`：软件光栅、字符画素材、Palm Oasis 场景、活动动画库搬家，删掉 three.js（ADR 0018、0019） | 完成 |

## 目录

```
packages/
  shared/    类型、常量、种子随机数、数学工具
  sim/       模拟核心：时钟、状态、命令、事件引擎、导演、存档、机器人
  content/   YAML 内容、schema、编译器、热重载插件
  iso/       2.5D 等距像素画面：Canvas 2D 软件光栅、轻量场景图、字符画素材、Site 和场景、人物、球、活动动画库
  ui/        Preact 界面：场边转播 HUD（记分牌、状态条、事件卡、俱乐部快讯）、调试面板
apps/
  game/      正式游戏：Indian Wells
  sandbox/   场景查看器（index.html）和活动动画库（activities.html）
  sim-cli/   命令行无头跑局：确定性闸口、机器人平衡报告
tools/
  playtest/    试玩服务器
docs/adr/      架构决策记录
docs/design/   设计文档（玩法、架构、画面契约 iso-architecture.md、测试）
docs/art/      画风和素材说明
docs/content-guide.md   不写代码加卡
docs/balance/  机器人跑局报告
```

分层规则见 [CLAUDE.md](CLAUDE.md)。

## 开发

需要 Node 22 和 pnpm 10。

```
pnpm install
pnpm game                # 打开游戏（开发版：` 键调试面板，改 YAML 热重载）
pnpm dev                 # 打开 sandbox（场景查看器；activities.html 是活动动画库）
pnpm check               # 类型检查 + 规范 + 分层 + 测试 + 构建
pnpm content             # 内容 YAML → JSON
pnpm sim bots --games 1000   # 机器人跑局报告
```

