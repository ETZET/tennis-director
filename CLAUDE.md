# CLAUDE.md · 给 AI 协作者的架构规则

《网球总监》是一款浏览器上的网球中心经营模拟，画面是 three.js 3D 像素（低分辨率正交渲染，ADR 0027）。完整设计见 `docs/design/` 的技术架构、玩法设计、测试文档。

**现在只有 3D 场景（`apps/sandbox`），没有模拟、没有游戏 app。** 2.5D 时期的模拟、内容、界面、游戏 app、sim-cli 2026-11-12 整套归档在 `docs/archive/2.5d-game/`；游戏流程重新设计（M-0）定了以后重写模拟，再把场景接上（M-B）。

## 玩法准则（设计文档「玩法准则」，冲突时前面的优先）

2026-11-09 删掉原准则 5（"日常经营靠招人和排人"，派工），原准则 6 改号成 5。之前的 ADR 里的"准则 6"就是现在的准则 5。2.5D 时期的主线（16 周修复、星级、赛事、结局）和派工（拖人上岗）整个作废，2026-11-12 设计文档和 ADR 0011–0017、0020、0021、0028 删除、代码归档；游戏流程重新设计中（设计文档「游戏流程：重新设计中」）。不要照着旧玩法补功能。

1. **不做菜单式操作。** 玩家的动作要么回应事件（卡、来找你的人），要么直接点场景或 HUD 里的东西。不加"面板 → 子菜单 → 按钮"式的管理操作。
2. **选择要有取舍。** 每个选项都换来一些、付出一些（钱、时间、总监位置、好感、以后的风险）；不能有各方面都更好的选项。
3. **不同的选择通向不同的后果。** 选择要留下痕迹（后续卡、人物态度、设施、结局），并能在因果日志里看到。
4. **事件是偶发的，而且有分量。** 卡不是流水线：隔一阵才来一张，每张都配足够的界面（谁来找你、现在的处境、每个选项的代价和后果），让选择显得重要。
5. **不操作时世界照样运转，局面慢慢回到"你布置的样子"。** 有人守的地方维持住，没人管的设施按使用量慢慢变旧（先出画面信号，再掉档）；收入和满意度只在有人在岗时产生，没人就是零、不倒扣；钱、会员、声望不实时漂移，每天收盘按今天的服务率结算一次（结算卡讲清楚为什么，ADR 0024），今天没有客人就不动。

## 平台：手机优先

主要在手机上玩（竖屏为主）。界面先按 390×844 竖屏设计：操作放在拇指够得着的地方，点击目标至少 44 px，用拖动和点按（Pointer Events），不依赖悬停和键盘；桌面是第二布局。截图和试玩评审以手机画面为准。

## 分层（由 `pnpm check:deps` 强制）

```
apps/sandbox (three.js 3D 像素场景)
packages/shared                       ← 最底层（种子随机数、表达式、数学）
three 暂时只在 apps/sandbox
docs/archive/** 不参与构建，谁也不能引用
```

以后重写模拟时守这几条（2.5D 那套就是这么做的，`sim-is-pure` 规则留着等它）：

- 分层 `apps → packages/ui → packages/sim → packages/shared`；`sim` 是纯函数式状态机：输入状态和命令，输出新状态和领域事件。可序列化，不放类实例、函数、场景图节点；不碰画面、three、Preact、DOM。
- 动画永远不决定数值。结果先由模拟算出，演出只负责演。
- 模拟只按名字引用位置（锚点），坐标由场景决定。
- 新增依赖前先确认它进了正确的包；three 只进 `apps/sandbox`（ADR 0027），直到另写 ADR 把场景接回游戏。

## 目录约定

- `apps/sandbox`：three.js 3D 像素场景（ADR 0027，t3ssel8r 风格：低分辨率正交渲染、纹素对齐相机、深度/法线描边、三档 toon 光）。一个场景一个页面 `<name>.html` + `src/<name>/`，在 `vite.config.ts` 的 input 里登记；`index.html` 是页面目录。
  - `src/club*/`：俱乐部的各个场景（`clubmap2` 整座俱乐部的微缩地图；`clubpark`、`clubdesk`、`clubpickle`、`clubclay`、`clubplaza`、`clubstadium`、`clubcourts`、`clubfood`、`clubhouse`、`clubpool`、`clubgolf` 是各处小景；`clubwalk` 把它们连成能走遍的一整座俱乐部，场景通过 `clubsite/region.ts` 挂进去；`clubfront`、`clubmap` 是早期的前台和地图）。每个场景自己有 `layout.ts`（构图、站位、路线）、`nav.ts`（能走的范围）、`terrain.ts`、`assets/`、`ctx.ts`（`AssetCtx<本场景的 Pal>`）、`palette.ts`（核心调色板的超集）、`placeholders.ts`（白模）、`reuse.ts`（只读引用别处的素材）；做到演出的有 `life.ts`，能操控总监的有 `play.ts`。
  - `src/clubsite/`：各场景共用，不引用任何场景（`pnpm check:deps` 的 `clubsite-not-from-scenes`）：
    - `render/`：渲染核心，只有一份，场景 import 它、不复制：`pipeline.ts`（低分辨率渲染、描边、纹素对齐；`dist`/`far` 给地图拉远）、`toon.ts`（色阶材质）、`colors.ts`（关掉颜色管理，main 第一个 import）、`noise.ts`、`ctx.ts`（`AssetCtx`、`SharedUniforms`）、`palette-base.ts`（底表，原 desert3d-v2 的）+ `palette.ts`（俱乐部的表）、`palettes/`（配色方案覆盖层，`?pal=<id>`，默认 `golden` 6 午后金光）、`geo.ts`（`topGeo`、`wallGeo`、`smoothLoop`、`box`、`quad`……）。
    - `world.ts`：整座俱乐部的世界坐标（米，y 朝上，北 = −z，东 = +x；`SITE`、`COURTS`、`GATE`、`DESK`、`PATHS`、围网……），所有场景从这里 import。
    - `daylight/`：时间和天气（时钟、太阳/月亮绕着走、三档颜色乘子、阴雨风沙、夜里开灯；`mountDaylight` 接进场景 main，说明在 `docs/lab/2026-11-07-3d-pixel/daylight.md`）。
    - `ground.ts`（铺出画面的地面，不再是浮空岛）、`mountains.ts`（地图边低成本的山和只写深度的天幕）、`framing.ts`（取景）、`people/`（骨骼 Q 版人，`rig/` 是骨骼和球员/教练/总监）、`play/`（总监操控）、`nature/`（沙漠植物、石头）、`assets/`（长椅、遮阳帆、工具、工具架、裁判椅、球车、球网、球场灯、记分牌、匹克球……）、`tools/`（总监工具的合并几何、握点、水管）、`reuse.ts`（共用的现成资产表）。
  - `src/desert3d-v2/`、`src/pond3d/`、`src/desert3d/`：早期实验，素材接口和"材质规范 v2"的 API 在 `desert3d-v2/ASSETS.md`。desert3d-v2 用 `clubsite/render` 和搬走的素材（`assets/` 里留一行 re-export）；反过来 club* 和 clubsite 不能引用实验（`club-not-from-experiments`）。
  - 新场景按 `.claude/skills/pixel-scene` 的流程做（白模 → 素材 → 组装演出 → 数字验收）；经验、材质规范、地图边界、截图和量图工具在 `docs/lab/2026-11-07-3d-pixel/`（`lessons.md`、`material-spec.md`、`boundary.md`、`tools/`）。
- `docs/archive/iso-2.5d/`：归档的 2.5D 等距像素画面（原 `packages/iso`、sandbox 的查看器/活动库/demo/人物页、游戏的画面层，ADR 0019 → 0027）。只作参考，不能构建，不要引用。
- `docs/adr/`：重要决策一个文件。违反架构原则的改动先写 ADR。
- `docs/archive/2.5d-game/`：归档的 2.5D 时期整套游戏（原 `packages/sim`、`packages/content`、`packages/ui`、`apps/game`、`apps/sim-cli`、`tools/playtest`，以及内容指南、人物设计、人物模拟、主线研究）。只作参考，不能构建，不要引用；重写模拟时好的做法照着重写。
- `packages/shared`：种子随机数、表达式语言、数学工具，留给以后的模拟。

## 不要做的事

- 模拟（以后重写的）里不要用 `Math.random`，用状态里的种子随机数；场景的演出也只用种子随机流（`ctx.rng(...)`）。
- 不要在演出代码里改模拟状态；演出只读状态、只订阅领域事件。演出里的随机只决定画面，不决定数值。
- 不要把文案写死在游戏代码里，走 i18n 键值表，两种语言都要有（sandbox 场景的调试文字不算）。
- three 只在 `apps/sandbox` 里用，直到游戏把场景接回来（`pnpm check:deps` 的 `three-only-in-sandbox`）。
- 不要改别的场景的文件来给新场景用：复制到自己的场景目录再改（`reuse.ts` 只读引用）；几个场景都要的东西收进 `clubsite/`。渲染核心不复制，改 `clubsite/render/` 就是改所有场景，改完每个页面截图对比。
- 参考图（别人作品的截图、裁剪、含参考图的对比图）永远不进仓库，只放本地 `~/workspace/tennis-director-refs/`。提交 PNG 前跑 `node docs/lab/2026-11-07-3d-pixel/tools/refcheck.mjs <图或目录>`，标 `REF?` 的不要提交。
- 不要引用或修改 `docs/archive/` 里的代码；要用里面的想法就在新代码里重写。

## 常用命令

```
pnpm dev            # sandbox 开发服务器（3D 像素场景：/clubwalk.html、/clubmap2.html、/clubdesk.html……）
pnpm typecheck      # 全部包类型检查（TypeScript 7）
pnpm lint           # Biome
pnpm check:deps     # 分层规则
pnpm test           # Vitest
pnpm build          # 构建 apps（现在只有 sandbox）
pnpm check          # 上面五个一起
```

提交信息用 Conventional Commits（`feat(render): …`、`fix(sim): …`、`chore: …`）。
