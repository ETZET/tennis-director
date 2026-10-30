# 网球总监 · Tennis Director

浏览器上的 3D 体素网球中心经营模拟。你是一家网球中心的总监：事件推着时间走，你决定先处理哪件事、走到哪里去。

## 当前进度：M0 工程脚手架

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| M0-1 | pnpm 工作区、五个包和三个应用、TypeScript 7、Vite 8、Vitest、Biome、分层规则、CI | 完成 |
| M0-2 | Hollow Creek 原样拆进 `packages/render`，写死的剧情时间轴留在 `apps/sandbox` | 完成 |
| M0-3 | three.js 从 r128 升到当前稳定版，对照四个角度的截图调光照 | 下一步 |
| M0-4 | Maple Ridge、Palm Oasis 和活动动画库用同样方法迁移（可与 M1 并行） | 待做 |

M0 闸口：Hollow Creek 截图与原型一致。`pnpm screenshot --against prototype` 对比原型和新构建的四个角度。

## 目录

```
packages/
  shared/    类型、常量、种子随机数、数学工具
  sim/       模拟核心（M1）：时钟、状态、命令、事件引擎、导演
  content/   YAML 内容和 schema（M1）
  render/    three.js：体素批处理、场地坐标系、人物、球、演出原子动作、相机、场景
  ui/        Preact 界面（M1）
apps/
  game/      正式游戏入口
  sandbox/   场景查看器和活动动画库（现有原型迁到这里）
  sim-cli/   命令行无头跑局（M3）
tools/
  screenshot/  画面回归
prototypes/    最初的单文件原型（参考和截图基准，不修改）
docs/adr/      架构决策记录
```

分层规则见 [CLAUDE.md](CLAUDE.md)。

## 开发

需要 Node 22 和 pnpm 10。

```
pnpm install
pnpm dev                 # 打开 sandbox，进入 Hollow Creek
pnpm check               # 类型检查 + 规范 + 分层 + 测试 + 构建
pnpm screenshot          # 画面回归（先 pnpm build）
```

画面回归需要 Chromium：本地有 Playwright 浏览器即可，或用 `CHROMIUM_PATH` 指定。
