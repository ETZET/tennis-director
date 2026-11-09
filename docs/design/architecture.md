# 网球总监 · 技术架构文档 v1.0（3D 像素）

2026-11-08 · 按 three.js 3D 像素画面重写（ADR 0027、0029）。上一版 v0.2（2.5D 等距画面 `packages/iso`、Site 接口）归档在
[`docs/archive/pre-3d/architecture-v0.2.md`](../archive/pre-3d/architecture-v0.2.md)；旧画面的接口契约在 [`docs/archive/iso-2.5d/`](../archive/iso-2.5d/README.md)。

## 现状

- **模拟和界面能玩一整局，但没有画面。** `apps/game` = `@td/sim` + `@td/ui`：拿人、派活、选卡、每日结算、自动存档、调试面板、试玩桥；舞台上是一行说明和一排地点按钮。
- **画面在 `apps/sandbox` 里做。** 一个场景一个页面，俱乐部的各处小景用同一套世界坐标、同一个渲染核心、同一套人物和总监操控；五个场景能操控总监玩。
- **两边还没接上。** 场景里的演出和数字不进模拟；接回游戏是下一个大里程碑（见文末"接回游戏"和 [backlog.md](backlog.md) 的 M-B）。

## 原则

1. **模拟是纯函数式状态机。** 输入状态和命令，输出新状态和领域事件；可序列化，不放类实例、函数、场景图节点；不用 `Math.random`，只用状态里的种子随机数。
2. **动画永远不决定数值。** 结果先由模拟算出，演出只负责演；演出里的随机只决定画面。
3. **模拟只按名字引用位置（锚点）。** 坐标归画面；接回以后由场景接口把锚点换成场景里的站位。
4. **内容是数据。** 卡、岗位、工单、人、地图配置都是 YAML，编译校验后给模拟读。
5. **手机优先。** 390×844 竖屏先做，横屏也要；点击目标 ≥ 44 px，Pointer Events。
6. **场景各管各的，共用的东西只有一份。** 场景之间不互相改文件，只读引用（`reuse.ts`）；渲染核心、世界坐标、人物、操控在 `clubsite/`。

## 分层和目录（`pnpm check:deps` 强制）

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

| 目录 | 是什么 |
| --- | --- |
| `packages/shared` | 类型、常量、种子随机数、表达式语言、数学工具 |
| `packages/sim` | 模拟核心：时钟、状态、命令、系统、事件引擎和导演、存档、机器人 |
| `packages/content` | YAML 内容、Zod schema、编译器、热重载插件（`@td/content/vite`）、Node 专用代码（`@td/content/node`） |
| `packages/ui` | Preact 界面：HUD（状态条、事件卡、快讯、结算卡）、员工条和说明面板、调试面板 |
| `apps/game` | 正式游戏：模拟 + 界面，暂时没有画面 |
| `apps/sim-cli` | 命令行无头跑局：机器人平衡报告、可玩性报告、确定性闸口 |
| `apps/sandbox` | three.js 3D 像素场景（club* 页面）和早期实验 |
| `tools/playtest` | 试玩桥（无头 Chromium 里玩构建好的游戏） |
| `docs/archive` | 归档：2.5D 画面代码（`iso-2.5d/`）、3D 之前的设计文档（`pre-3d/`） |

`check:deps` 的规则（`.dependency-cruiser.cjs`）：`sim-is-pure`、`shared-is-leaf`、`three-only-in-sandbox`、`content-only-via-sim`、`no-archive`、`packages-not-apps`、`no-unresolvable`、`no-circular`（只算运行时引用，类型引用的环不算）。

## 模拟核心（`packages/sim`）

不变，2.5D 归档没有动它。存档版本 15。

| 文件 | 管什么 |
| --- | --- |
| `state.ts` | `GameState`（可序列化）、存档版本 |
| `game.ts` | 命令（指派、选卡、调试命令……）、`step` / `advance`、重放 |
| `systems.ts` | 每分钟的系统顺序：结局 → 日历 → 赛事 → 岗位和工单 → 场地可用度 → 活动 → 质量 → 派生量 → 卡过期 → 导演 → 走路；收盘时衰减、记账、每日结算、星级、解锁、天气预报 |
| `staff.ts`、`walk.ts` | 指派、岗位转圈、工单推进、办事、习惯（ADR 0012、0014）；导航图最短路、走路 |
| `cards.ts`、`effects.ts`、`vars.ts` | 事件引擎和导演；白名单效果；条件和表达式变量（`COMPUTED_VARS` 和内容编译器一致） |
| `care.ts`、`mess.ts` | 场地可用度（ADR 0022，[court-care-contract.md](court-care-contract.md)） |
| `day.ts`、`week.ts` | 每日结算（ADR 0024，[daily-settlement-contract.md](daily-settlement-contract.md)）、钱的日账和周日回顾 |
| `stars.ts`、`tournaments.ts`、`growth.ts`、`potential.ts`、`plots.ts`、`ending.ts` | 星级、赛事日历和选路、员工成长和潜力、地块（地图长大）、结局方案 A 和第二季（[wave1-contract.md](wave1-contract.md)、[wave2-5-contract.md](wave2-5-contract.md)） |
| `events.ts` | 领域事件：画面和界面订阅它们来演出、提示 |
| `save.ts` | 存档和逐级迁移 |
| `bots.ts` | 机器人（贪心、谨慎、随机、放置和几种普通玩家） |

## 内容（`packages/content`）

`data/` 下：`acts/indian_wells.yaml`（地图配置：开局、营业时间、设施、锚点、导航分钟数、季节天气、星级、选路、地块、赛事、日历、结局、规则）、
`facilities.yaml`、`posts/`、`orders/`（一个文件一个，id 共用一个空间）、`events/indian_wells/<id>.yaml`（文件名就是 id）、`people/`、`traits.yaml`、`directors/`、`stats.yaml`、`i18n/en.yaml`、`i18n/zh.yaml`。
改完运行 `pnpm content`，生成的 `src/generated/content.json` 一起提交；`pnpm check:content` 只校验。写法见 `docs/content-guide.md`。

注意：锚点（`entrance`、`parking`、`plaza`、`clubhouse`、`stadium_1/2/3`、`practice`、`outer_1`、`outer_23` 和四块地块）和 `nav` 分钟数来自 2.5D 的 Palm Oasis 地图，
3D 场景的命名不一样（`outer_2`、`outer_3`、`practice_w/e`、`pickle_1/2`……），接回时要对一遍（见"接回游戏"）。

## 游戏 app 和界面（`apps/game`、`packages/ui`）

| 文件 | 管什么 |
| --- | --- |
| `session.ts` | 实时 → 游戏分钟、倍速、命令队列、手上拿着的人 |
| `project.ts` | 状态 → HUD 快照、员工条、岗位说明、快讯 |
| `settle.ts` | 每日结算卡 |
| `main.ts` | 没有画面的入口：HUD + 模拟 + 一排地点按钮；拖放落点、自动存档、试玩桥 `window.__td` |
| `persist.ts`、`debug.ts`、`text.ts`、`chips.ts` | 存档到本地、调试面板（` 键）、i18n 拼句、代价小标签 |

界面文字都在 i18n 的 `ui.*`，两种语言都要有。

## 画面：`apps/sandbox` 的 3D 像素场景

### 画法（ADR 0027，t3ssel8r 风格）

- 正交相机，俯角 45°，场景默认 yaw 0（地图可以转）；场景渲到低分辨率目标，相机对齐纹素网格，最近邻放大，亚纹素偏移在合成时补回（平移不"爬"）。
- **像素默认 1×**（每纹素 1 CSS 像素），左上角可切 1 / 1.5 / 2 / 3；素材按 2×（0.09 米/纹素）的"设计纹素"建模。
- 三档 toon 光：每个材质手挑亮 / 中 / 暗三色（暗档换冷色相），光照只算 `dot(N, 太阳) + 噪声` 挑档；不用环境光；关掉颜色管理、线性输出（调色板原值上屏）。
- 描边：深度突变压暗偏靛、上沿提亮；法线凸边提亮；每个材质自己的 `edge` / `convex` 强度写进法线 pass 的 alpha。
- 投影：PCF 取阈值、阈值按竖向笔触抖（圆滑的块 + 草一样的毛边）；云影手摆、硬边；风摆在顶点里，法线和投影 pass 同步摆。
- 材质规范 v2：表面由"元素"组成（石块、板条、叶团、沙纹……），同档内 2～3 个元素色，阴影里纹理还在。
- 配色方案：`?pal=<id>` 切换，右上角有切换器；默认 `golden`（6 午后金光）。
- 依据和参数：`docs/lab/2026-11-07-3d-pixel/lessons.md`、`material-spec.md`、`desert3d-v2/ASSETS.md`（资产接口和材质规范 v2 的 API）。

### 共用模块（`apps/sandbox/src/clubsite/`）

2026-11-08 正在合并成下面这样（`refactor/clubsite-core`）：渲染核心原来 desert3d-v2、clubfront、clubdesk、clubmap 各有一份拷贝，世界坐标原来在 `clubmap2/layout.ts`，人物骨骼和沙漠植物原来在 desert3d-v2。

| 模块 | 内容 |
| --- | --- |
| `render/` | 渲染核心，只有一份：`pipeline.ts`（低分辨率渲染、纹素对齐、描边、合成）、`toon.ts`（色阶材质、元素、风摆、云影）、`palette.ts` + `palette-base.ts` + `colors.ts`（调色板）、`palettes/`（配色方案覆盖层和切换器）、`ctx.ts`（资产上下文 `AssetCtx`、共享 uniform）、`geo.ts`、`noise.ts` |
| `world.ts` | 整座俱乐部的世界坐标（米，y 朝上，北 = −z，东 = +x）：`SITE`、`GROUNDS`、`GATE`、`COURTS`（`stadium_1`、`practice_w/e`、`outer_1`、`outer_2/3`、`pickle_1/2`）、`PICKLE`、`CLUBHOUSE`、`TERRACE`、`POOL`、`FOUNTAIN`、`PLAZA`、`LAWN`、`DRIVE`、`LOT_N/S`、`GOLF`、`PATHS`、围网、`DESK`、`DESERT`、`ROAD_OUT`、`FIT` |
| `ground.ts`、`mountains.ts`、`framing.ts` | 铺到画外的地面（不再是浮空岛）；地图边三道低成本的山梁 + 只写深度的天幕和两翼 + 山口车道；clubmap2 的取景（顶上露一条天和山梁）。见 `docs/lab/2026-11-07-3d-pixel/boundary.md` |
| `people/` | 骨骼 Q 版人：球员、教练、总监、孩子、球童、裁判（`rig/` 是骨骼和原来的姿势），新姿势（坐、鼓掌、喝、拖垫、浇水、摇绞盘、捞网、dink、倒水、报分、刮水、球童的蹲站滚球撑伞……），手里的东西（`hold`、`addTool`） |
| `play/` | 总监操控（ADR 0029）：摇杆和点地面寻路（`nav.ts`：0.2 米网格、A* + 拉直、台阶坡道、会动的挡路圆）、互动点 `play.add`、手里的东西 `play.addItem`、一次性动作 `busy`、气泡和顶栏 `hud.ts`、相机跟随；`index.ts` 顶上的注释是接入说明 |
| `assets/`、`nature/`、`tools/` | 共享素材（球网、球场灯、记分牌、伞、长椅、遮阳帆、裁判椅、球车、捡球器、匹克球和网球、拍架、器材箱……）；沙漠植物和石头；总监工具的合并几何和握点 |
| `reuse.ts` | 场景从别处只读引用素材的入口 |

### 每个场景的文件约定

一个场景 = `apps/sandbox/<name>.html` + `src/<name>/`，在 `vite.config.ts` 的 input 里登记；`index.html` 是页面目录。

| 文件 | 内容 |
| --- | --- |
| `main.ts` | 建场景、相机和取景（竖屏 / 横屏各一个 `TARGET`）、固定 1/60 秒步长的循环、URL 参数、调试钩子 `window.__<场景>`（`scene`、`pipe`、`step`、`life`、`play`…） |
| `layout.ts` | 构图、站位 `SPOTS`、路线 `ROUTES`、能走的范围 `WALKABLE` / 挡路 `BLOCKED`、场景自己的常量；共享坐标只从 `clubsite/world.ts` import |
| `terrain.ts`、`nav.ts` | 地面、台地、台阶、`groundAt`；导航数据 |
| `ctx.ts`、`palette.ts` | 本场景的资产上下文和调色板（核心的超集） |
| `assets/` | 本场景从零画的素材（画廊 `?asset=<id>` 隔离看） |
| `placeholders.ts`、`reuse.ts` | 白模的灰盒；只读引用别处的素材 |
| `life.ts` | 做到演出的：NPC 的日常（演出时钟 + 种子随机流 `ctx.rng(...)`，不用 `Math.random`） |
| `play.ts` | 能操控总监的：登记导航、互动点、手里的东西、顶栏 |

常用 URL 参数：`px`、`zoom`、`tx`/`tz`、`pause=1`、`labels=0`、`ph=0`（不放占位）、`play=0`（只看模式）、`life=0`、`nav=0`、`clouds=0`、`warm`（先跑几秒）、`seed`、`pal`、`sunel`/`sunaz`、`asset=<id>`。

### 场景之间怎么接

- **同一套世界坐标。** 每个场景只画自己那一块，边上和邻居对得上（大门、台阶、步道、围网）；clubmap2 用同一份坐标画整张图。
- **在边上交接。** 例如会员在 clubpark 下车、从大门走进 clubdesk 排队：两个页面各自独立跑，按同一张时间表（`GATE_TIMING`）在大门交接。
- **不改别人的文件。** 要用别处的素材就复制到自己的 `assets/` 改，或者通过 `reuse.ts` 只读引用；共享的东西放 `clubsite/`。

### 早期实验和前身

`desert3d-v2`（沙漠球场：素材接口 `ASSETS.md`、第一个能操控的总监 `control.ts` / `hud.ts`）、`pond3d`（池塘复刻）、`desert3d`（第一版，被评为毛坯），
`clubfront`（露天前台的第一版）、`clubmap`（第一版大布局）。保留作实验记录，不再扩展；俱乐部场景不要依赖它们。

### 做一个场景的流程（`.claude/skills/pixel-scene`）

1. **白模（stage 1）**：手摆构图（台地暗带、主角、步道引导视线、留白）、调色板、素材清单，占位用灰盒；竖屏 390×844、横屏 1280×720 截图给用户看，确认后才画素材。
2. **素材（stage 2）**：每件（或每小类）一个子代理从零画，在画廊 `?asset=<id>` 里隔离迭代，照材质规范 v2。
3. **组装和演出（stage 3）**：`life.ts` 的 NPC 日常、`play.ts` 的总监操控；动作对着 1/30 秒连拍检查（击球不能停顿）。
4. **验收（数字）**：全帧饱和度 ≥ 0.42、强边缘 ≤ 0.05（资产加完不超过 0.055）、细变化 0.17～0.21、亮度两峰；每类物件的暗 / 中 / 亮比例对照参考；裁切并排放大。工具和做法见 [testing.md](testing.md)。
5. **交付**：手机竖屏截图 + 单文件可玩页面（见下）。

### 性能（量过的）

每帧 = 颜色 + 法线 + 投影三个 pass 合计，`?pause=1`，1280×720（`docs/lab/2026-11-07-3d-pixel/boundary.md`、ADR 0027）：

| 页面 | 绘制次数 / 三角形 |
| --- | --- |
| clubmap2（整张地图） | ≈ 2670 / 92 万 |
| clubpark | ≈ 1400 / 21 万 |
| clubdesk | ≈ 1365 / 23 万 |
| 各小景大致范围 | ≈ 800～2000 次绘制 |
| 地图边的山 + 天幕 + 地面 | +12 次、+2.7k 三角形（不进投影 pass） |

对照：池塘复刻 237 次 / 11.7 万。还没在真手机上量过帧时间；体积和低端机性能接回游戏前要量（backlog 的技术债）。
已经在用的省法：几何按材质合并、看台观众每种颜色一个 `InstancedMesh`（10 次绘制）、动画放进顶点着色器、山不投影、小道具不接收投影。

### 交付：单文件页面

`bash .claude/skills/pixel-scene/scripts/single-file.sh <页面名> <输出.html> [默认查询串]`：用 Vite 把一个页面打成单个 HTML（JS 内联，`inlineDynamicImports`），
可以直接用 `file://` 打开，也可以发布成私有的在线页面。先在浏览器里打开一次，确认控制台没有报错。

## 接回游戏（还没做，开放设计）

ADR 0027 定了"接回时另写 ADR 定新的场景接口"。下面是要回答的问题和现在的倾向，都没定：

| 问题 | 倾向 |
| --- | --- |
| 场景接口长什么样 | 类似归档的 `Site` 接口（ADR 0016）：游戏只认一个接口，不直接 import 某个场景；接口给出锚点 → 场景、站位、区域，相机预设，演出入口 |
| 锚点 ↔ 场景里的站位 | 模拟的锚点保留名字，场景的 `SPOTS` 挂到锚点下；一个锚点可以对多片场（`outer_23` → `outer_2`、`outer_3`）；露天前台、餐车院子这种模拟里没有的地方要新锚点或并进现有锚点 |
| 导航分钟数 | 从 `clubsite/world.ts` 的步道量出来，和内容的 `nav` 对上；重建归档的 `map-nav.test.ts` 那种检查 |
| 总监的活 → 模拟命令 | 互动点做完一件活 = 一条命令（派到岗位、一次打扫、一次办事）；按住的活按游戏分钟累计；总监走路的实时秒怎么换成游戏分钟要定 |
| NPC 日常 ↔ 模拟 | 演出订阅领域事件、只读状态（不改模拟）；场景里的排队人数、场面状态由模拟的量驱动（服务率、可用度、状况），而不是自己的种子流 |
| 每日结算由场景里的活动驱动 | 收盘那张卡上的"今天"要能在场景里看到原因（谁在前台、哪块场没拖） |
| 卡怎么来 | 卡以人的形式来找你：有人走到总监跟前冒气泡，点他开卡 |
| 一个页面还是很多页面 | 游戏里是一整座俱乐部：要么一个大场景按区域加载 / 卸载，要么按场景切页面（过大门换场景）；先量性能再定 |
| three 进 `apps/game` | 改 `three-only-in-sandbox` 规则；场景代码从 sandbox 挪进一个包（例如 `packages/club3d`），sandbox 和游戏都从包里拿 |

## 存档

模拟的存档版本 15，逐级迁移（`save.ts`）；`apps/game` 自动存到本地。场景里的状态（场面、叶子、队伍）现在不存档。

## 风险

- **性能**：小景每帧上千次绘制，整张图近 2700 次；手机上还没量过。整座俱乐部一起加载可能撑不住。
- **两套坐标和命名**：模拟的锚点、`nav` 分钟数来自 2.5D 地图，3D 场景改过布局（青训东西对调、红土两片分开、露天前台、餐车院子），接回时要对齐。
- **演出和模拟两套节奏**：场景按实时秒和种子流演，模拟按游戏分钟算；接回时最容易出现"画面说一回事、数字说另一回事"。
- **素材复制**：场景之间靠复制素材改，同一件东西可能有几份；共享的东西要及时挪进 `clubsite/`。
