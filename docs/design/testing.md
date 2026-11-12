# 网球总监 · 测试文档 v1.0（3D 像素）

2026-11-08 · 按 3D 像素画面重写。2026-11-12 起模拟、内容、游戏 app 和它们的测试整套归档（`docs/archive/2.5d-game/`），现在要测的只有 shared 和 3D 场景。

## 测试分层

现在没有模拟，3D 场景靠少量单元测试、数字验收和逐帧截图；好不好玩靠真人和评审代理。模拟按新流程重写以后，把内容校验、确定性、机器人跑局这几层照归档那套的做法补回来。

| 层 | 回答的问题 | 工具 | 何时跑 |
| --- | --- | --- | --- |
| 1 单元测试 | shared 的随机数和表达式对不对；场景的导航、演出跑 5 分钟不出错 | Vitest，`pnpm test` | 每次提交、CI |
| 2 场景验收 | 3D 场景的画面达标吗，动作对吗，页面能跑吗 | `docs/lab/2026-11-07-3d-pixel/tools/`、Playwright 脚本、单文件页面 | 每个场景每个 stage 的关卡 |
| 3 玩法评审 | 好玩吗，守住玩法准则了吗 | 真人；评审代理 | 每个大改动后一轮 |

## CI

`.github/workflows/ci.yml`，推到 main 和每个 PR 都跑：`pnpm typecheck` → `pnpm lint` → `pnpm check:deps` → `pnpm test` → `pnpm build`，然后把 `apps/sandbox/dist/` 传成构建产物（预览）。
本地 `pnpm check` 跑同样几步。`pnpm lint`（Biome）不查 Markdown、`docs/lab`、`docs/archive`。

### 分层规则（`pnpm check:deps`，`.dependency-cruiser.cjs`）

| 规则 | 管什么 |
| --- | --- |
| `sim-is-pure` | （等新模拟）模拟不依赖界面、three、Preact，能在命令行里无头跑 |
| `shared-is-leaf` | shared 是最底层，不依赖别的工作区包 |
| `three-only-in-sandbox` | three 只在 `apps/sandbox`（ADR 0027） |
| `club-not-from-experiments`、`clubsite-not-from-scenes`、`clubwalk-is-top` | 俱乐部场景不引用早期实验；clubsite 不引用场景；只有 clubwalk 把场景拼在一起 |
| `no-archive` | 谁也不能引用 `docs/` 下的代码（归档不参与构建） |
| `packages-not-apps` | 包不能引用应用 |
| `no-unresolvable`、`no-circular` | 引用都解析得到；没有运行时的循环引用（只有类型的环不算） |

## 单元测试（`pnpm test`）

Vitest 收 `packages/*/src/**/*.test.ts` 和 `apps/*/src/**/*.test.ts`（`docs/archive` 不收）。现在有 `packages/shared`（表达式语言、种子随机数）和 `apps/sandbox` 里的场景测试（导航、会所各层的演出跑几分钟不出错、Walker 不卡、脚不溜）。

## 确定性

模拟按新流程重写以后照旧：种子加命令日志就是一局的全部，模拟里不用 `Math.random`。3D 场景的演出也只用种子随机流（`ctx.rng(...)`），固定 1/60 秒步长。
接回游戏时要补："有无画面一致"（带画面跑和无头跑，状态哈希相同）、"变速一致"、机器人跑局和平衡区间（归档里的 `bots.ts`、`balance.test.ts` 是做法的参考）。

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

- **场景的试玩：** 现在只能在 sandbox 的页面里玩（`pnpm dev`、`clubwalk`，或单文件页面）。看的是：总监的活有没有取舍、NPC 的反应读不读得懂、竖屏横屏拇指够不够得着。
- **评审代理：** 原来的试玩桥（无头 Chromium 里玩没有画面的游戏）随 2.5D 游戏归档；接回游戏以后重写，改成在 3D 场景里操控总监。
- **真人试玩：** 以手机画面为准。

## 接回游戏时要补的测试

- 新模拟的锚点 ↔ 场景站位；每个有场地的锚点在场景里有足够的球场。
- 内容里每个演出名在 3D 场景里都有演出。
- 有无画面一致：带画面跑和无头跑状态哈希相同。
- 总监的一件活 → 一条模拟命令：同一串操作重放结果一样。
- 真手机上的帧时间和加载体积（中低端安卓、iPhone）。
