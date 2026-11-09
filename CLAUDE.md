# CLAUDE.md · 给 AI 协作者的架构规则

《网球总监》是一款浏览器上的网球中心经营模拟，画面是 three.js 3D 像素（低分辨率正交渲染，ADR 0027）。完整设计见项目里的技术架构文档、玩法设计文档、测试文档。

## 玩法准则（设计文档「玩法准则」，冲突时前面的优先）

2026-11-09 删掉原准则 5（"日常经营靠招人和排人"，派工；归档在 `docs/archive/pre-3d/tenet-5-staffing.md`），原准则 6 改号成 5。之前的 ADR、契约、代码注释里的"准则 6"就是现在的准则 5。2.5D 时期的主线和派工整个归档，游戏流程重新设计中（设计文档「游戏流程：重新设计中」）。

1. **不做菜单式操作。** 玩家的动作要么回应事件（卡、来找你的人），要么直接点场景或 HUD 里的东西。不加"面板 → 子菜单 → 按钮"式的管理操作。
2. **选择要有取舍。** 每个选项都换来一些、付出一些（钱、时间、总监位置、好感、以后的风险）；不能有各方面都更好的选项。
3. **不同的选择通向不同的后果。** 选择要留下痕迹（后续卡、人物态度、设施、结局），并能在因果日志里看到。
4. **事件是偶发的，而且有分量。** 卡不是流水线：隔一阵才来一张，每张都配足够的界面（谁来找你、现在的处境、每个选项的代价和后果），让选择显得重要。
5. **不操作时世界照样运转，局面慢慢回到"你布置的样子"。** 有人守的地方维持住，没人管的设施按使用量慢慢变旧（先出画面信号，再掉档）；收入和满意度只在有人在岗时产生，没人就是零、不倒扣；钱、会员、声望不实时漂移，每天收盘按今天的服务率结算一次（结算卡讲清楚为什么，ADR 0024），今天没有客人就不动。

## 平台：手机优先

主要在手机上玩（竖屏为主）。界面先按 390×844 竖屏设计：操作放在拇指够得着的地方，点击目标至少 44 px，用拖动和点按（Pointer Events），不依赖悬停和键盘；桌面是第二布局。截图和试玩评审以手机画面为准。

## 分层（由 `pnpm check:deps` 强制）

```
apps/sandbox (three.js 3D 像素场景)      apps/game, apps/sim-cli
                                                ↓
                                     packages/ui (Preact)
                                                ↓
                                     packages/sim            ← 不碰画面、three、Preact、DOM
                                                ↓
                                     packages/shared
packages/content 只由 sim 读取
three 暂时只在 apps/sandbox；游戏暂时没有画面（接回时另写 ADR）
docs/archive/** 不参与构建，谁也不能引用
```

- `sim` 是纯函数式状态机：输入状态和命令，输出新状态和领域事件。可序列化，不放类实例、函数、场景图节点。
- 动画永远不决定数值。结果先由模拟算出，演出只负责演。
- 模拟只按名字引用位置（锚点，例如 `court_1`、`deck`），坐标由场景模块决定。
- 新增依赖前先确认它进了正确的包；`sim` 的 package.json 里不能出现 preact、three 或画面包；three 只进 `apps/sandbox`（ADR 0027）。

## 目录约定

- `apps/sandbox`：three.js 3D 像素场景（ADR 0027，t3ssel8r 风格：低分辨率正交渲染、纹素对齐相机、深度/法线描边、三档 toon 光）。一个场景一个页面 `<name>.html` + `src/<name>/`，在 `vite.config.ts` 的 input 里登记；`index.html` 是页面目录。
  - `src/club*/`：俱乐部的各个场景（`clubmap2` 整座俱乐部的微缩地图；`clubpark`、`clubdesk`、`clubpickle`、`clubclay`、`clubplaza`、`clubstadium`、`clubcourts`、`clubfood` 是各处小景；`clubfront`、`clubmap` 是早期的前台和地图）。每个场景自己有 `layout.ts`（构图、站位、路线）、`nav.ts`（能走的范围）、`terrain.ts`、`assets/`、`ctx.ts`（`AssetCtx<本场景的 Pal>`）、`palette.ts`（核心调色板的超集）、`placeholders.ts`（白模）、`reuse.ts`（只读引用别处的素材）；做到演出的有 `life.ts`，能操控总监的有 `play.ts`。
  - `src/clubsite/`：各场景共用，不引用任何场景（`pnpm check:deps` 的 `clubsite-not-from-scenes`）：
    - `render/`：渲染核心，只有一份，场景 import 它、不复制：`pipeline.ts`（低分辨率渲染、描边、纹素对齐；`dist`/`far` 给地图拉远）、`toon.ts`（色阶材质）、`colors.ts`（关掉颜色管理，main 第一个 import）、`noise.ts`、`ctx.ts`（`AssetCtx`、`SharedUniforms`）、`palette-base.ts`（底表，原 desert3d-v2 的）+ `palette.ts`（俱乐部的表）、`palettes/`（配色方案覆盖层，`?pal=<id>`，默认 `golden` 6 午后金光）、`geo.ts`（`topGeo`、`wallGeo`、`smoothLoop`、`box`、`quad`……）。
    - `world.ts`：整座俱乐部的世界坐标（米，y 朝上，北 = −z，东 = +x；`SITE`、`COURTS`、`GATE`、`DESK`、`PATHS`、围网……），所有场景从这里 import。
    - `ground.ts`（铺出画面的地面，不再是浮空岛）、`mountains.ts`（地图边低成本的山和只写深度的天幕）、`framing.ts`（取景）、`people/`（骨骼 Q 版人，`rig/` 是骨骼和球员/教练/总监）、`play/`（总监操控）、`nature/`（沙漠植物、石头）、`assets/`（长椅、遮阳帆、工具、工具架、裁判椅、球车、球网、球场灯、记分牌、匹克球……）、`tools/`（总监工具的合并几何、握点、水管）、`reuse.ts`（共用的现成资产表）。
  - `src/desert3d-v2/`、`src/pond3d/`、`src/desert3d/`：早期实验，素材接口和"材质规范 v2"的 API 在 `desert3d-v2/ASSETS.md`。desert3d-v2 用 `clubsite/render` 和搬走的素材（`assets/` 里留一行 re-export）；反过来 club* 和 clubsite 不能引用实验（`club-not-from-experiments`）。
  - 新场景按 `.claude/skills/pixel-scene` 的流程做（白模 → 素材 → 组装演出 → 数字验收）；经验、材质规范、地图边界、截图和量图工具在 `docs/lab/2026-11-07-3d-pixel/`（`lessons.md`、`material-spec.md`、`boundary.md`、`tools/`）。
- `docs/archive/iso-2.5d/`：归档的 2.5D 等距像素画面（原 `packages/iso`、sandbox 的查看器/活动库/demo/人物页、游戏的画面层，ADR 0019 → 0027）。只作参考，不能构建，不要引用。
- `docs/adr/`：重要决策一个文件。违反架构原则的改动先写 ADR。
- `packages/content/data/`：所有游戏内容（YAML）。卡在 `events/<幕>/<id>.yaml`，文件名就是 id；文案在 `i18n/en.yaml`、`i18n/zh.yaml`。改完运行 `pnpm content`，生成的 `src/generated/content.json` 一起提交。
- `apps/game/src/`：`session.ts`（实时 → 游戏分钟、命令队列、手上拿着的人）、`project.ts`（状态 → HUD 快照、员工条、岗位说明）、`settle.ts`（每日结算卡）、`main.ts`（画面迁移中：没有场景，舞台上是一行说明和一排地点按钮；HUD、拖放落点、自动存档、试玩桥 `window.__td`）、`debug.ts`（调试面板）、`text.ts`（i18n 拼句）。
- 内容热重载插件在 `@td/content/vite`，Node 专用代码在 `@td/content/node`；两者都不要从 `@td/content` 入口导出。
- `packages/sim/src/`：`effects.ts`（白名单效果）、`vars.ts`（条件和表达式变量）、`cards.ts`（事件引擎和导演）、`staff.ts`（指派、岗位、工单、设施衰减；派工模型已归档，代码照旧在跑）、`walk.ts`（导航图最短路、走路、办事）、`systems.ts`（每个 tick 的系统顺序）、`game.ts`（命令、推进、重放）、`save.ts`（存档和迁移）。
- 岗位在 `packages/content/data/posts/`，工单在 `data/orders/`，一个文件一个，id 两边共用一个空间；文案在 `posts.<id>`、`orders.<id>`。主线（星级、选路、赛事、地块、结局）的实现在 `stars.ts`、`tournaments.ts`、`growth.ts`、`potential.ts`、`plots.ts`、`ending.ts` 和 `acts/indian_wells.yaml` 的对应几节，设计已归档（`docs/archive/pre-3d/main-line-2.5d.md`），代码照旧在跑，重新设计定了再删改。

## 不要做的事

- 不要在 `sim` 里用 `Math.random`；用状态里的种子随机数。
- 不要在演出代码里改模拟状态；演出只读状态、只订阅领域事件。演出里的随机只决定画面，不决定数值。
- 不要把文案写死在代码里（M1 起走 i18n 键值表）。
- 不要在 sim 里新增效果或条件而不更新 `@td/content` 的 schema 和编译器校验；两边的变量表（`COMPUTED_VARS`）必须一致。
- 不要手改 `src/generated/content.json`；改 YAML 再运行 `pnpm content`。
- 改了平衡相关的数值，重跑 `pnpm sim bots --games 200 > docs/balance/indian-wells.md` 一起提交；`balance.test.ts` 守着区间。
- 场景接回游戏前（另写 ADR 定新的场景接口），`apps/game` 不引用 sandbox 的代码，也不引用 three。内容里的 `nav` 分钟数暂时没有地图检查（原来的检查归档在 `docs/archive/iso-2.5d/apps/game/src/map-nav.test.ts`），接回时要重建。
- 新的界面文字放进 i18n 的 `ui.*`，两种语言都要有。
- three 只在 `apps/sandbox` 里用，直到游戏把场景接回来（`pnpm check:deps` 的 `three-only-in-sandbox`）。
- 不要改别的场景的文件来给新场景用：复制到自己的场景目录再改（`reuse.ts` 只读引用）；几个场景都要的东西收进 `clubsite/`。渲染核心不复制，改 `clubsite/render/` 就是改所有场景，改完每个页面截图对比。
- 参考图（别人作品的截图、裁剪、含参考图的对比图）永远不进仓库，只放本地 `~/workspace/tennis-director-refs/`。提交 PNG 前跑 `node docs/lab/2026-11-07-3d-pixel/tools/refcheck.mjs <图或目录>`，标 `REF?` 的不要提交。
- 不要引用或修改 `docs/archive/` 里的代码；要用里面的想法就在新代码里重写。

## 常用命令

```
pnpm game           # 游戏开发服务器（暂时没有画面；` 调试面板；改 YAML 热重载）
pnpm dev            # sandbox 开发服务器（3D 像素场景：/clubmap2.html、/clubdesk.html……）
pnpm typecheck      # 全部包类型检查（TypeScript 7）
pnpm lint           # Biome
pnpm check:deps     # 分层规则
pnpm test           # Vitest
pnpm build          # 构建 apps
pnpm content        # 编译内容 YAML → JSON（check:content 只校验）
pnpm sim determinism --games 1000   # 确定性闸口（暂停中，见测试文档，玩法定型前不跑）
pnpm sim bots --games 1000          # 机器人跑局报告（平衡）
```

提交信息用 Conventional Commits（`feat(render): …`、`fix(sim): …`、`chore: …`）。
