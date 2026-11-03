# CLAUDE.md · 给 AI 协作者的架构规则

《网球总监》是一款浏览器上的 3D 体素网球中心经营模拟。完整设计见项目里的技术架构文档、玩法设计文档、测试文档。

## 玩法准则（设计文档「玩法准则」，冲突时前面的优先）

1. **不做菜单式操作。** 玩家的动作要么回应事件（卡、来找你的人），要么直接点场景或 HUD 里的东西。不加"面板 → 子菜单 → 按钮"式的管理操作。
2. **选择要有取舍。** 每个选项都换来一些、付出一些（钱、时间、总监位置、好感、以后的风险）；不能有各方面都更好的选项。
3. **不同的选择通向不同的后果。** 选择要留下痕迹（后续卡、人物态度、设施、结局），并能在因果日志里看到。
4. **事件是偶发的，而且有分量。** 卡不是流水线：隔一阵才来一张，每张都配足够的界面（谁来找你、现在的处境、每个选项的代价和后果），让选择显得重要。
5. **日常经营靠招人和排人。** 提升会所靠玩家主动把人（总监也是一个可指派的劳动力）拖到场景里的岗位和工单上；没有日程表画面，排班藏在随时拖动里（ADR 0012）。
6. **不操作时世界照样运转，局面慢慢回到"你布置的样子"。** 有人守的地方维持住，没人管的设施按使用量慢慢变旧（先出画面信号，再掉档）；收入和满意度只在有人在岗时产生，没人就是零、不倒扣；会员、声望不实时漂移，按一周的平均服务率结算。

## 平台：手机优先

主要在手机上玩（竖屏为主）。界面先按 390×844 竖屏设计：操作放在拇指够得着的地方，点击目标至少 44 px，用拖动和点按（Pointer Events），不依赖悬停和键盘；桌面是第二布局。截图和试玩评审以手机画面为准。

## 分层（由 `pnpm check:deps` 强制）

```
apps/game, apps/sandbox, apps/sim-cli
        ↓
packages/iso (Canvas 2D 等距像素)   packages/ui (Preact)      ← 两者互不引用
        ↓                                ↓
                   packages/sim                            ← 不碰画面、Preact、DOM
                        ↓
                 packages/shared
packages/content 只由 sim 读取
```

- `sim` 是纯函数式状态机：输入状态和命令，输出新状态和领域事件。可序列化，不放类实例、函数、场景图节点。
- 动画永远不决定数值。结果先由模拟算出，演出只负责演。
- 模拟只按名字引用位置（锚点，例如 `court_1`、`deck`），坐标由场景模块决定。
- 新增依赖前先确认它进了正确的包；`sim` 的 package.json 里不能出现 preact 或画面包；整个仓库不引入 three 和 WebGL（ADR 0019）。

## 目录约定

- `packages/iso/src/`：2.5D 等距像素画面（ADR 0019，接口契约 `docs/design/iso-architecture.md`）。游戏和 sandbox 只从 `@td/iso` 入口引用。
  - `core/`：`graph.ts`（照 three Object3D 子集写的轻量场景图：`Node`、`Group`、`Box`、`Sprite`、`Custom`）、`raster.ts`（软件光栅原语和深度缓冲）、`proj.ts`（等距投影）、`draw.ts`（场景图排序后光栅）、`ground.ts`（地面贴图和夜里的灯光池）、`art.ts`（`bakeArt` 把字符画烘焙成像素并按换色表缓存）、`view.ts`（`IsoView`：画布、低分辨率缓冲、静态层缓存、一帧渲染）、`camera.ts`（`IsoCamera`：平移、档位缩放、Q/E 转 90°、`project`/`unproject`、指针）、`daylight.ts`（按游戏分钟给天色和灯光）、`world.ts`（`createIsoWorld` → `IsoWorld`）。除了 `view.ts`、`camera.ts`、`world.ts` 都不碰 DOM。
  - `art/<people|props|icons|font|creatures>/`：所有素材都是文本字符画（`art/format.ts` 的 `PixelArt`），字母是 `SLOT` 换色槽位，运行时按人物外观或设施状态换色；人物精灵表的约定和预览方法见 `art/people/README.md`。
  - `site/site.ts`（`Site` 接口）和 `site/<地图>/`：`layout.ts`（世界坐标、场地坐标系、地面高度、锚点、站位、步道和最短路）、`ground.ts`（地面贴图、浮空岛范围 `SLAB`）、`build.ts`（静态节点）、`overlays.ts`（建场景、设施状态的画面层）、`state.ts`（设施状态 → 画面档位）、`wear.ts`（状况下降的画面信号）、`sky.ts`（云、鸟、风滚草）、`index.ts`（`Site` 实现和相机预设）。
  - `people/`（像素精灵版 `Person`、姿势、取帧、换色）、`motion/`（球、弹道）、`choreo/`（演出时间轴、击球）、`fx/`（粒子 `Particles`、漫画字和像素表情 `SpriteLayer`；中文字退回画布写字再二值化）、`ambient/`（车、狗、乌鸦、雨、风滚草）、`world/frame.ts`（场地坐标系）。
  - `activities/`：活动动画库（ADR 0010）。`registry.ts` 是纯数据的注册表（id、分类、变量范围和默认值），每个活动一个文件，`runtime.ts` 是演出运行时（局部坐标组、借人还人、tick），`choreo.ts` 是共用的击球和桥段，`text.ts` 是场景里的中英文字，`diorama.ts` 是只给 sandbox 用的小岛。公共入口 `startActivity(env, id, { area, conditions, params, cast })`。演出里的随机只决定画面，不决定数值。
- 每个场景是一座浮空岛（ADR 0005）：像素画面里是一块地台（`createIsoWorld` 的 `slab`，Indian Wells 是 `SLAB`），地面贴图只覆盖地台，地台外不放任何东西；云和鸟在 `site/<地图>/sky.ts`。
- `apps/sandbox`：场景查看器和活动动画库，写死的演示剧情放这里，不放进 iso。`index.html` + `src/viewer/` 是场景查看器（设施状态、昼夜、雨、风、磨损、旋转缩放，状态可以写进 URL 方便截图）；`activities.html` + `src/activities/` 是动画库页面（手机竖屏优先，每张卡一个 `IsoWorld`），给策划看的效果读数（中文）在 `src/activities/effects.ts`。
- `docs/adr/`：重要决策一个文件。违反架构原则的改动先写 ADR。
- `packages/content/data/`：所有游戏内容（YAML）。卡在 `events/<幕>/<id>.yaml`，文件名就是 id；文案在 `i18n/en.yaml`、`i18n/zh.yaml`。改完运行 `pnpm content`，生成的 `src/generated/content.json` 一起提交。
- `apps/game/src/`：`session.ts`（实时 → 游戏分钟、命令队列、手上拿着的人）、`project.ts`（状态 → HUD 快照、员工条、岗位说明）、`main.ts`（用 `createIsoWorld` 和 `Site` 建画面；岗位和工单的场景标记、拖放落点；每帧先 `setPeopleView(proj.ang, proj.k, proj.spriteScale)` 再更新人物和 `render`）、`scene.ts`（只读模拟的演出：员工走位、活动、设施画面层、昼夜和雨）、`life.ts`（园区日常）、`labels.ts`（地点牌等 DOM 叠层，用 `camera.project` 定位）、`perform.ts`（模拟的 performance 名 → 活动动画库；内容里新加 performance 要在这里配演出）、`debug.ts`（调试面板）、`text.ts`（i18n 拼句）。
- 内容热重载插件在 `@td/content/vite`，Node 专用代码在 `@td/content/node`；两者都不要从 `@td/content` 入口导出。
- `packages/sim/src/`：`effects.ts`（白名单效果）、`vars.ts`（条件和表达式变量）、`cards.ts`（事件引擎和导演）、`staff.ts`（指派、岗位、工单、设施衰减，ADR 0012）、`walk.ts`（导航图最短路、走路、办事）、`systems.ts`（每个 tick 的系统顺序）、`game.ts`（命令、推进、重放）、`save.ts`（存档和迁移）。
- 岗位在 `packages/content/data/posts/`，工单在 `data/orders/`，一个文件一个，id 两边共用一个空间；文案在 `posts.<id>`、`orders.<id>`。

## 不要做的事

- 不要调换 `site/<地图>/build.ts`、`ground.ts` 里的构建步骤顺序：每一段的细节都从自己的种子随机流取数，顺序就是画面。新东西加在最后，或者用单独的随机流。
- 不要在 `sim` 里用 `Math.random`；用状态里的种子随机数。
- 不要在演出代码里改模拟状态。
- 不要把文案写死在代码里（M1 起走 i18n 键值表）。
- 不要在 sim 里新增效果或条件而不更新 `@td/content` 的 schema 和编译器校验；两边的变量表（`COMPUTED_VARS`）必须一致。
- 不要手改 `src/generated/content.json`；改 YAML 再运行 `pnpm content`。
- 不要在 `apps/game/src/scene.ts` 里改模拟状态；画面只读状态、只订阅领域事件。
- 改了平衡相关的数值，重跑 `pnpm sim bots --games 200 > docs/balance/indian-wells.md` 一起提交；`balance.test.ts` 守着区间。
- 游戏 app 不直接引用某张地图的模块；地图的画面只通过 `Site` 接口进来（ADR 0016）。改了步道或站位，同步内容里的 `nav` 分钟数（`game.test.ts` 检查）。
- 新的界面文字放进 i18n 的 `ui.*`，两种语言都要有。
- 画面只用 `@td/iso` 的软件光栅，不引入 WebGL 或 three；改了画面要更新截图，并说明原因。素材是字符画，不提交图片素材。
- 不要改 iso 的 `core/graph.ts`、`art/format.ts` 的接口而不更新 `docs/design/iso-architecture.md`。

## 常用命令

```
pnpm game           # 游戏开发服务器（` 调试面板；改 YAML 热重载）
pnpm dev            # sandbox 开发服务器
pnpm typecheck      # 全部包类型检查（TypeScript 7）
pnpm lint           # Biome
pnpm check:deps     # 分层规则
pnpm test           # Vitest
pnpm build          # 构建 apps
pnpm content        # 编译内容 YAML → JSON（check:content 只校验）
pnpm sim determinism --games 1000   # 确定性闸口
pnpm sim bots --games 1000          # 机器人跑局报告（平衡）
```

提交信息用 Conventional Commits（`feat(render): …`、`fix(sim): …`、`chore: …`）。
