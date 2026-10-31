# CLAUDE.md · 给 AI 协作者的架构规则

《网球总监》是一款浏览器上的 3D 体素网球中心经营模拟。完整设计见项目里的技术架构文档、玩法设计文档、测试文档。

## 玩法准则（设计文档「玩法准则」，冲突时前面的优先）

1. **不做菜单式操作。** 玩家的动作要么回应事件（卡、来找你的人），要么直接点场景或 HUD 里的东西。不加"面板 → 子菜单 → 按钮"式的管理操作。
2. **选择要有取舍。** 每个选项都换来一些、付出一些（钱、时间、总监位置、好感、以后的风险）；不能有各方面都更好的选项。
3. **不同的选择通向不同的后果。** 选择要留下痕迹（后续卡、人物态度、设施、结局），并能在因果日志里看到。
4. **事件是偶发的，而且有分量。** 卡不是流水线：隔一阵才来一张，每张都配足够的界面（谁来找你、现在的处境、每个选项的代价和后果），让选择显得重要。
5. **日常经营靠和界面互动。** 提升会所靠玩家主动做：在公告板上拖便条排一季的日程，点场景里的地点让总监跑过去做事（跑多快看当天的精力）。
6. **不操作时会所不会自己变好或变坏太多，但世界一直在动。** 模拟、偶发事件、天气、季节、场上的人和画面照常进行；数值的大变化来自玩家的决定。

## 平台：手机优先

主要在手机上玩（竖屏为主）。界面先按 390×844 竖屏设计：操作放在拇指够得着的地方，点击目标至少 44 px，用拖动和点按（Pointer Events），不依赖悬停和键盘；桌面是第二布局。截图和试玩评审以手机画面为准。

## 分层（由 `pnpm check:deps` 强制）

```
apps/game, apps/sandbox, apps/sim-cli
        ↓
packages/render (three.js)   packages/ui (Preact)      ← 两者互不引用
        ↓                          ↓
                packages/sim                            ← 不碰 three、Preact、DOM
                     ↓
              packages/shared
packages/content 只由 sim 读取
```

- `sim` 是纯函数式状态机：输入状态和命令，输出新状态和领域事件。可序列化，不放类实例、函数、three 对象。
- 动画永远不决定数值。结果先由模拟算出，演出只负责演。
- 模拟只按名字引用位置（锚点，例如 `court_1`、`deck`），坐标由场景模块决定。
- 新增依赖前先确认它进了正确的包；`sim` 的 package.json 里不能出现 three 或 preact。

## 目录约定

- `packages/render/src/scenes/<场景>/`：`layout.ts`（坐标、场地坐标系、地面高度、锚点）、`build.ts`（静态场景）、`index.ts`（光照、相机预设）。
- `packages/render/src/voxel|props|people|motion|choreo|ambient|camera|world`：共享的渲染构件。
- 每个场景是一座浮空岛（ADR 0005）：放在岛上的东西用 `onIsland` 检查，岛边外不放任何东西；岛四周的云和小土块在 `ambient/sky.ts`。
- `apps/sandbox`：场景查看器和活动动画库，写死的演示剧情放这里，不放进 render。
- `prototypes/`：最初的单文件原型，只作参考和截图对比基准，不要修改。
- `docs/adr/`：重要决策一个文件。违反架构原则的改动先写 ADR。
- `packages/content/data/`：所有游戏内容（YAML）。卡在 `events/<幕>/<id>.yaml`，文件名就是 id；文案在 `i18n/en.yaml`、`i18n/zh.yaml`。改完运行 `pnpm content`，生成的 `src/generated/content.json` 一起提交。
- `apps/game/src/`：`session.ts`（实时 → 游戏分钟、命令队列、"先走过去"的意图）、`project.ts`（状态 → HUD 快照）、`scene.ts`（只读模拟的演出）、`debug.ts`（调试面板）、`text.ts`（i18n 拼句）。
- 内容热重载插件在 `@td/content/vite`，Node 专用代码在 `@td/content/node`；两者都不要从 `@td/content` 入口导出。
- `packages/sim/src/`：`effects.ts`（白名单效果）、`vars.ts`（条件和表达式变量）、`cards.ts`（事件引擎和导演）、`systems.ts`（每个 tick 的系统顺序）、`game.ts`（命令、推进、重放）、`save.ts`（存档和迁移）。

## 不要做的事

- 不要调换场景 `build.ts` 里的构建步骤顺序：所有细节都从同一条种子随机流取数，顺序就是画面。新东西加在最后。
- 不要在 `sim` 里用 `Math.random`；用状态里的种子随机数。
- 不要在演出代码里改模拟状态。
- 不要把文案写死在代码里（M1 起走 i18n 键值表）。
- 不要在 sim 里新增效果或条件而不更新 `@td/content` 的 schema 和编译器校验；两边的变量表（`COMPUTED_VARS`）必须一致。
- 不要手改 `src/generated/content.json`；改 YAML 再运行 `pnpm content`。
- 不要在 `apps/game/src/scene.ts` 里改模拟状态；画面只读状态、只订阅领域事件。
- 改了平衡相关的数值，重跑 `pnpm sim bots --games 1000 > docs/balance/hollow-creek.md` 一起提交；`balance.test.ts` 守着区间。
- 新的界面文字放进 i18n 的 `ui.*`，两种语言都要有。
- 不要在 M0 升级 three.js 以外的方式改画面；改了画面要更新截图基准，并说明原因。

## 常用命令

```
pnpm game           # 游戏开发服务器（` 调试面板；改 YAML 热重载）
pnpm dev            # sandbox 开发服务器
pnpm typecheck      # 全部包类型检查（TypeScript 7）
pnpm lint           # Biome
pnpm check:deps     # 分层规则
pnpm test           # Vitest
pnpm build          # 构建 apps
pnpm screenshot     # 画面回归（先 build）
pnpm content        # 编译内容 YAML → JSON（check:content 只校验）
pnpm sim determinism --games 1000   # 确定性闸口
pnpm sim bots --games 1000          # 机器人跑局报告（平衡）
```

提交信息用 Conventional Commits（`feat(render): …`、`fix(sim): …`、`chore: …`）。
