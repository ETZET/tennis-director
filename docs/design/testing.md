# 网球总监 · 测试文档 v1.0（3D 像素）

2026-11-08 · 按 3D 像素画面重写。2.5D 时期的旧版 2026-11-12 删除。

## 测试分层

模拟和内容靠自动测试和机器人兜底；3D 场景没有单元测试，靠数字验收和逐帧截图；好不好玩靠评审代理和真人。

| 层 | 回答的问题 | 工具 | 何时跑 |
| --- | --- | --- | --- |
| 1 内容校验 | 数据写得合法吗，引用都存在吗 | `pnpm content` / `pnpm check:content`（Zod + 编译器），开发时热重载 | 每次改 YAML；`pnpm check` |
| 2 单元测试 | 每个系统、条件、效果算得对吗 | Vitest，`pnpm test` | 每次提交、CI |
| 3 确定性 | 同样的输入是否永远得到同样的结果 | `sim.test.ts`；`pnpm sim determinism`（**1000 局闸口暂停**） | CI 只跑单元测试 |
| 4 机器人跑局 | 能不能打完，有没有卡死、永不出现的卡，太难太易 | `balance.test.ts`、`pnpm sim bots`、`pnpm sim playability` | CI 跑区间；改平衡数值后重出报告 |
| 5 组装 | 模拟和界面对得上吗，核心流程走得通吗 | `apps/game` 的测试 | CI |
| 6 场景验收 | 3D 场景的画面达标吗，动作对吗，页面能跑吗 | `docs/lab/2026-11-07-3d-pixel/tools/`、Playwright 脚本、单文件页面 | 每个场景每个 stage 的关卡 |
| 7 玩法评审 | 好玩吗，守住玩法准则了吗 | 试玩桥 + 评审代理；真人 | 每个大改动后一轮 |

## CI

`.github/workflows/ci.yml`，推到 main 和每个 PR 都跑：`pnpm typecheck` → `pnpm lint` → `pnpm check:deps` → `pnpm test` → `pnpm build`，然后把 `apps/sandbox/dist/` 传成构建产物（预览）。
本地 `pnpm check` 多一步 `pnpm check:content`（CI 里没有这一步）。`pnpm lint`（Biome）不查 Markdown、`docs/lab`、`docs/archive`。

### 分层规则（`pnpm check:deps`，`.dependency-cruiser.cjs`）

| 规则 | 管什么 |
| --- | --- |
| `sim-is-pure` | 模拟不依赖界面、three、Preact，能在命令行里无头跑 |
| `shared-is-leaf` | shared 是最底层，不依赖别的工作区包 |
| `three-only-in-sandbox` | three 只在 `apps/sandbox`（ADR 0027），游戏和各个包都不引用 |
| `content-only-via-sim` | 内容只由 sim 读取 |
| `no-archive` | 谁也不能引用 `docs/` 下的代码（归档不参与构建） |
| `packages-not-apps` | 包不能引用应用 |
| `no-unresolvable`、`no-circular` | 引用都解析得到；没有运行时的循环引用（只有类型的环不算） |

## 单元测试（`pnpm test`）

Vitest 收 `packages/*/src/**/*.test.ts` 和 `apps/*/src/**/*.test.ts`（`apps/sandbox` 没有测试；`docs/archive` 不收）。

| 文件 | 测什么 |
| --- | --- |
| `packages/sim/src/sim.test.ts`（76 条） | 开局、走路和指派、修复就是解锁、岗位、工单、习惯、总监成长、衰减、事件卡、时间、条件、确定性（重放哈希、JSON 往返）、存档迁移、整局 |
| `packages/sim/src/care.test.ts`（20） | 场地可用度：变脏、换档、打扫、门口等人、收盘（ADR 0022） |
| `packages/sim/src/day.test.ts`（13） | 每日结算（ADR 0024）：今天没需求不动、零头、上限、走掉的会员 |
| `packages/sim/src/build.test.ts`、`wave2.test.ts`、`growth.test.ts`、`ending.test.ts`、`plots.test.ts`、`decay.test.ts` | 修复变体和升级改造、星级；赛事和选路；员工成长和潜力；结局方案 A 和第二季；地块；掉档 |
| `packages/content/src/compile.test.ts`（16） | 编译器把真实内容故意改坏（错的地点、拼错的变量、缺默认后果和文案、文件名不对），每种错误都报得出 |
| `packages/shared/src/expr.test.ts`、`rng.test.ts` | 表达式语言；种子随机数 |
| `packages/ui/src/hud/format.test.ts` | HUD 数字格式 |
| `apps/game/src/game.test.ts` | 代码用到的 `ui.*` 键两种语言都有；每日结算的快讯和因果日志；`Session` 用实时循环跑一局、每帧投影 HUD；选要总监去的选项他会走过去；从员工条派人；掉档快讯；路上的人不算在岗 |
| `apps/game/src/settle.test.ts`、`wave1.test.ts`、`wave2.test.ts`、`wave34.test.ts`、`wave5.test.ts` | 结算卡；各波功能在 HUD 快照里的样子 |
| `apps/sim-cli/src/balance.test.ts` | 平衡区间（见下） |

内容的锚点、`nav` 分钟数和地图对不对得上，**现在没有检查**：原来的 `map-nav.test.ts`、`wave5-land.test.ts` 查的是 2.5D 地图，随画面归档在
`docs/archive/iso-2.5d/apps/game/src/`。场景接回游戏时要在 3D 的世界坐标上重建（backlog 的 M-B）。

## 确定性

种子加命令日志就是一局的全部，所以 bug 复现几乎没有成本。模拟里不用 `Math.random`；3D 场景的演出也只用种子随机流（`ctx.rng(...)`），固定 1/60 秒步长。

> **暂停（2026-11-03 起）：** 玩法还没定型，`pnpm sim determinism --games 1000` 不跑，改模拟以后也不跑；`sim.test.ts` 里的确定性单元测试照常在 CI 里跑。玩法定型后恢复。

接回游戏时要补："有无画面一致"（带画面跑和无头跑，状态哈希相同；不同就说明画面层偷偷改了状态）、"变速一致"。

## 机器人跑局和平衡

模拟不依赖画面，可以在命令行里让不同打法的机器人各跑几百局（`packages/sim/src/bots.ts`：贪心、谨慎（从不招人）、随机、放置，加几种普通玩家）。

`apps/sim-cli/src/balance.test.ts`（CI 每次跑）守着区间：会玩的人通常能赢、多数拿前两档；从不招人的修不完、拿不到前三档；乱玩很少赢；放着不管拿最低档；
表演赛来得晚（不是第 6 周）；没有卡死的局，每张卡都出现过。

```bash
pnpm sim bots --games 200          # 结局分布、平均状态、每张卡出现的比例
pnpm sim playability --games 60    # 节奏、取舍、后果分叉
```

这些区间守的是作废的 2.5D 主线（16 周、表演赛），报告不再提交；游戏流程重新设计以后跟着改。真人的区间等真人试玩以后再定。

## 场景验收（`apps/sandbox` 的 3D 场景）

### 数字（pixel-scene 的关卡，不凭感觉）

工具在 `docs/lab/2026-11-07-3d-pixel/tools/`，在仓库根目录运行：

| 工具 | 量什么 | 目标 |
| --- | --- | --- |
| `stats.mjs '[["名字","图.png",每纹素像素数]]'` | 全帧（降到纹素）：饱和度（HSV 平均）、细变化（相邻纹素亮度差 > 12 的比例，`edgeDensity`）、强边缘（差 > 60，`strongEdge`）、亮度直方图 10 档 | 饱和度 ≥ 0.42；强边缘 ≤ 0.05（资产加完 ≤ 0.055）；细变化 0.17～0.21；亮度两峰（暗带 / 影子、地面） |
| `lum.mjs '[["名字","图.png",x,y,w,h]]'` | 一个框里的平均亮度和暗 / 中 / 亮比例 | 对照参考（池塘：树冠 ≈ 163 · 24/26/50） |
| `crop.mjs <out> <倍数> x y w h <a> <b> [c]` | 同一块并排、最近邻放大（修前 / 修后 / 参考） | 看细节 |
| `pick.mjs <图> x,y[,r]` | 窗口里的众数颜色 | 取色、对色 |
| `refcheck.mjs <png 或目录>` | PNG 里有没有混进参考图（颜色数 ≥ 1000 标 `REF?`） | 提交 PNG 前必跑，标 `REF?` 的不进仓库 |
| `shot.mjs`、`scale.mjs`、`v2-*.mjs` | 截图、缩放、desert3d-v2 用的连拍和拼图 | — |

截图规格：竖屏 390×844（dpr 2，按每纹素 2 像素量），横屏 1280×720（dpr 1）；都带 `?pause=1&labels=0`。主代理要自己重拍、重量、看裁切，不只看子代理的报告。

### 动作和操控（Playwright 脚本）

场景没有单元测试，动作靠逐帧截图查。做法（各场景的验收脚本都是这个样子，写在临时目录，不进仓库）：

1. 用 Playwright（仓库里有 `playwright-core`）打开 `pnpm dev` 的页面，带 `?pause=1`：模拟时钟停住，画面不自己走。
2. 用调试钩子推进：`window.__<场景>.step(1/30)` 一次推 1/30 秒，连拍一串（击球、拖垫、捞网这种动作看 6～10 帧）；也可以先 `step(秒)` 跳到某一刻。
3. 裁到人物附近放大 2 倍看：球拍有没有碰到球、柄会不会时有时无、姿势停不停顿。
4. 操控用 `window.__<场景>.play`：`setStick(x, y)`、`setKey('KeyW', true)`、`setUse(true/false)`、`pick()`、`tapWorld(x, z)`、`tapScreen(...)`、`state()`、`pathLeft()`、`ui()`；
   NPC 用 `life`（各场景的 `state` / `debug()`）。查"做完一件活 → NPC 有反应"（例如绷好网 → 队里两个人上场）。
5. 盯着控制台：不能有报错。

### 单文件页面

`bash .claude/skills/pixel-scene/scripts/single-file.sh <页面名> <输出.html> [默认查询串]` 打出来以后，用 `file://` 在浏览器（或 Playwright）里打开一次：
画面出来、能操控、控制台没有报错，才发布。

### 参考图

参考图和任何含参考图像素的对比图只放本地 `~/workspace/tennis-director-refs/`，不进仓库；提交 PNG 前跑 `refcheck.mjs`。

## 玩法评审

- **评审代理（试玩桥）：** `tools/playtest/server.mjs` 在无头 Chromium 里玩构建好的游戏，HTTP 一步一步地玩（旧的评审说明 `brief.md` 讲的是 2.5D 主线，2026-11-12 删了）。
  现在游戏没有画面，评审的是模拟、卡和 HUD（地点是一排按钮）；场景接回以后要重写评审说明，评审改成在 3D 场景里操控总监。
- **场景的试玩：** 现在只能在 sandbox 的页面里玩单个场景（`pnpm dev`，或单文件页面）。看的是：总监的活有没有取舍、NPC 的反应读不读得懂、竖屏横屏拇指够不够得着。
- **真人试玩：** 以手机画面为准。

## 接回游戏时要补的测试

- 锚点 ↔ 场景站位、内容 `nav` 分钟数 ↔ 世界坐标步道长度（重建 `map-nav.test.ts`）；每个有场地的锚点在场景里有足够的球场。
- 内容里每个 performance（演出名）在 3D 场景里都有演出（原来的 `perform.test.ts` 也归档了）。
- 有无画面一致：带画面跑和无头跑状态哈希相同。
- 总监的一件活 → 一条模拟命令：同一串操作重放结果一样。
- 真手机上的帧时间和加载体积（中低端安卓、iPhone）。
