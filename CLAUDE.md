# CLAUDE.md · 给 AI 协作者的架构规则

《网球总监》是一款浏览器上的 3D 体素网球中心经营模拟。完整设计见项目里的技术架构文档、玩法设计文档、测试文档。

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

## 不要做的事

- 不要调换场景 `build.ts` 里的构建步骤顺序：所有细节都从同一条种子随机流取数，顺序就是画面。新东西加在最后。
- 不要在 `sim` 里用 `Math.random`；用状态里的种子随机数。
- 不要在演出代码里改模拟状态。
- 不要把文案写死在代码里（M1 起走 i18n 键值表）。
- 不要在 M0 升级 three.js 以外的方式改画面；改了画面要更新截图基准，并说明原因。

## 常用命令

```
pnpm dev            # sandbox 开发服务器
pnpm typecheck      # 全部包类型检查（TypeScript 7）
pnpm lint           # Biome
pnpm check:deps     # 分层规则
pnpm test           # Vitest
pnpm build          # 构建 apps
pnpm screenshot     # 画面回归（先 build）
```

提交信息用 Conventional Commits（`feat(render): …`、`fix(sim): …`、`chore: …`）。
