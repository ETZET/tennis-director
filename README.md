# 网球总监 · Tennis Director

浏览器上的 3D 体素网球中心经营模拟。你是一家网球中心的总监：事件推着时间走，你决定先处理哪件事、走到哪里去。

## 当前进度：M3 完成，第一幕可以完整玩一遍

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M0 | 工程脚手架；Hollow Creek 拆进 `packages/render`，浮空岛、溪流分岛布局、场边转播 HUD（ADR 0005、0006） | 完成（M0-3 升级 three.js、M0-4 迁移其他场景待做） |
| M1 | 模拟核心：时钟、状态、命令、事件引擎和导演、存档迁移、sim-cli（ADR 0007） | 完成 · 1000 局确定性闸口通过 |
| M2 | 第一幕纵切片：`apps/game` 把模拟、画面、界面接起来；总监走位、因果日志、活动演出、自动存档（ADR 0008） | 完成 · 等试玩 |
| M3 | 内容热重载、调试面板、内容校验、机器人跑局报告和平衡（ADR 0009） | 完成 · 不写代码加卡的示范见 `docs/content-guide.md` |

## 目录

```
packages/
  shared/    类型、常量、种子随机数、数学工具
  sim/       模拟核心：时钟、状态、命令、事件引擎、导演、存档、机器人
  content/   YAML 内容、schema、编译器、热重载插件
  render/    three.js：体素批处理、场地坐标系、人物、球、演出原子动作、相机、场景
  ui/        Preact 界面：场边转播 HUD（记分牌、状态条、事件卡、俱乐部快讯）、调试面板
apps/
  game/      正式游戏：第一幕
  sandbox/   场景查看器和活动动画库（写死的演示剧情）
  sim-cli/   命令行无头跑局：确定性闸口、机器人平衡报告
tools/
  screenshot/  画面回归
prototypes/    最初的单文件原型（参考和截图基准，不修改）
docs/adr/      架构决策记录
docs/content-guide.md   不写代码加卡
docs/balance/  机器人跑局报告
```

分层规则见 [CLAUDE.md](CLAUDE.md)。

## 开发

需要 Node 22 和 pnpm 10。

```
pnpm install
pnpm game                # 打开游戏（开发版：` 键调试面板，改 YAML 热重载）
pnpm dev                 # 打开 sandbox，进入 Hollow Creek 演示
pnpm check               # 类型检查 + 规范 + 分层 + 测试 + 构建
pnpm screenshot          # 画面回归（先 pnpm build）
pnpm content             # 内容 YAML → JSON
pnpm sim bots --games 1000   # 机器人跑局报告
```

画面回归需要 Chromium：本地有 Playwright 浏览器即可，或用 `CHROMIUM_PATH` 指定。
