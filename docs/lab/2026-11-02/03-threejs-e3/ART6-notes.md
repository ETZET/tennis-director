# ART-6 迁移笔记：three.js r128 → r187（0.187.0）

> 本地探路实验，没有提交、没有推送。**所有数据基于上游 main `bc7d166`**（包含 #8 Indian Wells 美术补齐）。
> 早先基于 `8a150c1` 的截图和像素差（`shots/`、`dist-*`、`lab2/`）画面已经过时，只当历史参考。

## 结论

- **难度：低。** 类型检查、lint、分层检查、134 个测试、game 和 sandbox 构建全部一次通过，不用改任何类型。真正要动的只有色彩和光照，一共几行。
- **改动：11 个文件**（10 个代码和 package.json，加 `pnpm-lock.yaml`），+109 / −32 行。新增文件只有 `packages/render/src/world/color.ts`。
- **画面：和 r128 像素级一致。** 推荐方案（关掉 ColorManagement、输出线性、灯光 ×π）的平均像素差 0.16%，r128 自己连拍两次的噪声是 0.15%。3D 部分逐像素相同，剩下的差异都在 HTML 地点牌上（脉冲高亮和 1px 位置），和 three 无关。
- **绘制调用：不变**（桌面每帧 GL 绘制 148 / 175，手机 129–180，和 r128 逐角度相同）。前提是给透明的双面围网材质加上 `forceSinglePass: true`，不加的话每帧多 10–15 次绘制。
- **体积：** game JS 1014.1 → 1049.3 kB（gzip 296.3 → 304.6 kB，+2.8%）；sandbox 675.1 → 709.6 kB（gzip 192.7 → 200.5 kB）。
- **风险最大的两点：**
  1. `THREE.ColorManagement.enabled = false` 是全局开关，**必须在任何 `THREE.Color` 创建之前执行**。现在靠 `packages/render/src/index.ts` 第一行 `import './world/color'` 保证。`@td/render` 只有 `.` 一个入口，所以目前是安全的；但如果有人绕过入口直接 import 子模块，或者 app 在 import `@td/render` 之前就在模块顶层建 Color，颜色会悄悄变暗。render 自己的 vitest 测试就是直接 import 子模块的，测试里色彩管理其实是开着的（目前没有测试断言颜色，所以没影响）。
  2. 这是一个"兼容模式"：色彩不走线性工作流。以后要换成正确的线性工作流（ColorManagement 开、输出 sRGB），所有颜色、光强、雾、贴图都得一起重调，适合放到 ART-10（时段和天气光照）一起做，**ART-6 里不要做**。

## 破坏性变化清单

| # | 文件 | 旧写法（r128） | 新写法（r187） | 迁移指南的哪一条 |
|---|---|---|---|---|
| 1 | `packages/render/src/world/color.ts`（新文件），`index.ts` 第一行 import | 没有色彩管理；`new Color('#hex')`、`setHSL` 的值原样进着色器 | `THREE.ColorManagement.enabled = false` | r151 → r152：`ColorManagement.enabled` 默认改成 `true`（十六进制 / CSS 颜色按 sRGB 解释，转到线性） |
| 2 | `world/stage.ts`（`createStage`），`apps/sandbox/src/activities/main.ts`（自己建的 renderer） | `renderer.outputEncoding` 默认 `LinearEncoding` | 建好 renderer 后调 `useLegacyColor(renderer)`，里面设 `renderer.outputColorSpace = THREE.LinearSRGBColorSpace` | r151 → r152：`outputEncoding` 换成 `outputColorSpace`，默认 `SRGBColorSpace` |
| 3 | `world/stage.ts`、`ambient/rain.ts`（下雨时改光强）、`activities/diorama.ts` | `HemisphereLight` / `DirectionalLight` 的 intensity 原样写（legacy lights，内部 ×π） | `intensity * LIGHT_UNIT`，`LIGHT_UNIT = Math.PI` | r154 → r155：`useLegacyLights` 默认改成 `false`；r164 → r165：`useLegacyLights` 删除。对平行光和半球光，×π 就等于旧的亮度 |
| 4 | `props/court.ts`（围网 `pen`）、`activities/diorama.ts`（小岛围网） | `transparent + DoubleSide` 一遍画完 | 加 `forceSinglePass: true` | 新增了 `Material.forceSinglePass`（约 r150 前后，以迁移指南为准）：透明的双面材质默认分两遍画（先背面后正面）。画面看不出差别（不加时像素差 0.15%），但每帧多 10–15 次绘制 |
| 5 | `packages/render/package.json`、`apps/game/package.json`、`apps/sandbox/package.json`、`pnpm-lock.yaml` | `three` / `@types/three` 0.128.0 | 0.187.0 | — （`@types/three` 0.187 新带进 `@tweenjs/tween.js`、`@types/stats.js`、`@types/webxr`、`fflate`、`meshoptimizer`、`@dimforge/rapier3d-compat`，都只是类型或开发依赖） |

检查过、**不需要改**的：

- 贴图：全是 `CanvasTexture`（地点牌、漫画字、图标、记分牌），r187 默认 `NoColorSpace`。在"CM 关 + 线性输出"下不做转换，和 r128 一样。**以后切到线性工作流时**，这些贴图要标 `colorSpace = SRGBColorSpace`（r151 → r152，`Texture.encoding` 换成 `colorSpace`）。
- 顶点色和实例色：`VoxelBatcher` 用 `setHSL` 写顶点色，`Particles` 用 `setColorAt`。CM 关掉以后存的是原值，和 r128 一致。
- 自发光：#8 新加的 `emissive` / `emissiveIntensity`（亮灯、水面）不受灯光单位影响，结果一致。
- `MeshLambertMaterial` 从逐顶点改成逐片元光照（约 r145）：体素是平面，只有一盏平行光加半球光，结果相同，像素差也证明了这一点。
- WebGL1 在 r163 删掉了：项目本来就用 `WebGLRenderer`（WebGL2）。只有非常老、不支持 WebGL2 的手机会受影响。
- `Geometry` 和 `*BufferGeometry` 别名、`examples/jsm` 合并工具、`THREE.Clock`：项目都没用。

## 推荐的色彩和光照设置

```ts
THREE.ColorManagement.enabled = false;               // 模块最先执行
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
light.intensity = r128Intensity * Math.PI;           // HemisphereLight、DirectionalLight
material.forceSinglePass = true;                     // 透明 + DoubleSide 的材质
```

**理由：** 所有颜色和光强都是在 r128 下对着截图调出来的，CLAUDE.md 也规定"M0 只允许升级 three.js 这一种方式改画面"。这组设置在数学上就等于 r128 的管线（颜色不转换、输出不编码、legacy lights 的 π），实测也和 r128 一致，截图基准不用重拍。

**像素差数据**（`bc7d166`，基准 = r128 构建；16 张图 = 手机 390×844@2x 和桌面 1280×800 × 开局和全修好 × 4 个角度；pixelmatch threshold 0.1；亮度变化是 Rec.709 亮度均值，范围 0–255）：

| 方案 | ColorManagement | 输出 | 光强 | 像素差% 均值 | 最大 | 每通道平均绝对差 | 亮度变化 | 手机 / 桌面 像素差% |
|---|---|---|---|---|---|---|---|---|
| r128 自己再拍一次（噪声） | — | — | — | 0.15 | 0.63 | 0.08 | 0.0 | 0.19 / 0.11 |
| **legacy（推荐）** | 关 | Linear | ×π | **0.16** | 0.80 | 0.07 | 0.0 | 0.27 / 0.05 |
| legacy，不加 forceSinglePass | 关 | Linear | ×π | 0.15 | 0.62 | 0.07 | 0.0 | 0.22 / 0.07 |
| naive（只升版本） | 开 | sRGB | ×1 | 72.17 | 83.07 | 61.27 | −64.8 | 63.38 / 80.97 |
| modern | 开 | sRGB | ×π | 48.80 | 59.59 | 15.47 | −15.4 | 42.05 / 55.55 |
| cmOffSrgb | 关 | sRGB | ×π | 44.60 | 49.90 | 27.91 | +25.2 | 40.35 / 48.86 |
| legacyNoPi | 关 | Linear | ×1 | 72.28 | 83.19 | 86.70 | −91.5 | 63.45 / 81.10 |

推荐方案的逐张结果：8 张开局图全部是 0.00%；全修好的图桌面在 0–0.34%，手机在 0.19–0.80%。我把差异像素圈出来看过（`lab3/cmp-legacy-mobile-repaired-a0-crop.png`），全是 HTML 地点牌：高亮脉冲的相位，加上 1px 位置舍入。

**绘制调用**（`lab3/measure3.mjs`，桌面，镜头在 home；GL 调用数是挂钩 `drawArrays/drawElements*` 数出来的）：

| 构建 | 状态 | GL 绘制 / 帧 | 主通道 | 阴影通道 | `renderer.info.render.calls` | `info.render.triangles` | programs |
|---|---|---|---|---|---|---|---|
| r128 | 开局 | 148 | 87 | 61 | 87 | 170,562 | 7 |
| r128 | 全修好 | 175 | 114 | 61 | 114 | 148,990 | 7 |
| r187 推荐 | 开局 | 148 | 87 | 61 | 148 | 230,538 | 9 |
| r187 推荐 | 全修好 | 175 | 114 | 61 | 175 | 212,482 | 10 |
| r187 不加 forceSinglePass | 开局 / 全修好 | 158 / 185 | 87 / 114 | 71 / 71 | 158 / 185 | — | 9 / 10 |

注意：**`renderer.info.render.calls` 的口径变了。** r128 不算阴影通道，r187 算。所以 r187 的 info 数字看起来多了约 61 次绘制、约 6 万个三角形，但实际的 GL 调用数没变。以后做性能基准要用 GL 挂钩，或者两边都只看主通道。逐角度的每帧绘制数（`shots/*/report.json`）r128 和推荐方案完全一样：手机 129–180，桌面 148 / 175。

## 截图在哪、看到了什么

- 基于 `bc7d166` 的有效数据都在 `lab/e3/lab3/`：
  - 截图：`shots/<方案>/`，方案有 `r128`、`r128b`（噪声对照）、`legacy`、`nofsp`、`modern`、`naive`、`cmOffSrgb`、`legacyNoPi`；每个目录里的 `report.json` 带每帧绘制数和镜头状态。
  - 像素差：`diff/<方案>/`（差异图和 `summary.json`）。
  - 并排对比图：`compare/*.png`（左边都是 r128）。
  - 构建产物：`dist-<方案>/`（带 LAB-ONLY 钩子，只在实验里用）。
  - sandbox 冒烟截图：`sb-activities.png`、`sb-index.png`。
- 我亲眼看过的图：
  - `compare/mobile-start-a0__r128_vs_naive_modern_legacy.png`：naive 整体暗、发褐，岛外的地面变成深褐色。modern 的阴影和明暗面对比变平，偏灰。legacy 和 r128 分不出来。
  - `compare/desktop-repaired-a1__r128_vs_naive_legacy.png`：全修好以后紫色场地、绿地、看台，legacy 和 r128 一致，naive 明显暗。
  - `compare/desktop-start-a2__r128_vs_modern_cmOffSrgb_legacyNoPi.png`：cmOffSrgb 发白、发灰，legacyNoPi 暗了约三分之一，正好对应少了一个 π。
  - `compare/mobile-repaired-a0__r128_vs_legacy.png`：3D 一致，只有地点牌的高亮不同。
- **截图脚本有一个坑（已修）：** 手机竖屏下剧情镜头（`OrbitCamera.followStory`）会接管目标点、跟着动的人走，同一个 r128 构建连拍两次，手机图的差异能到 30–50%。上一个 agent 的 diff 里 mobile-start-a1 的 43%，以及 `lab2/` 的结果，都是这个原因。`lab3/shoot2.mjs` 在暂停后设 `__labCam.followStory = false`，只拍 home 姿态，r128 连拍两次的差异降到 0.15%。另外，同时开 7 个 swiftshader 截图进程会让截图超时，最多并行两个。
- 旧的数据（`shots/`、`shots/diff/*`、`dist-*`、`lab2/`）是基于 `8a150c1` 的，而且掺杂了剧情镜头造成的抖动，**不要再用**。

## 还没解决的问题

1. **ColorManagement 的全局开关依赖 import 顺序**（见"结论"）。可以考虑在 `createStage` 里加一句断言（`if (THREE.ColorManagement.enabled) console.warn(...)`），或者用 lint 规则禁止深层 import `@td/render/src/...`。
2. **sandbox 只做了构建和冒烟测试**：`/` 和 `activities.html` 都能加载，没有页面错误（只有一个 favicon 404），画面看起来正常。但没有和 r128 的 sandbox 做像素对比。
3. **截图基准没有进仓库**：项目里没有截图基准目录（ART-12 才做）。这次画面和 r128 一致，所以没有"要更新的基准"；如果之后的 agent 要建基准，记得带上关掉 followStory 这一步。
4. 测试是在 swiftshader（软件 WebGL2）上做的，**没在真机上验证**，特别是 iOS Safari。WebGL1 已经删掉，只能用 WebGL2 的设备才行。
5. 体积增加 35 kB（gzip 8 kB）。`import * as THREE` 拿不到更多 tree-shaking；要瘦身得改成按需 import，这是另一件事。
6. 长期来看，要不要切到线性工作流（CM 开、sRGB 输出、CanvasTexture 标 sRGB），需要单独决策，最好写 ADR，和 ART-10 一起做。

## 给真正做 ART-6 的 agent 的分步建议

1. 从最新 main 开分支。如果 main 还是 `bc7d166`：`git apply lab/e3/art6.patch lab/e3/art6-lock.patch`（已经对 `bc7d166` 的全新 clone 用 `git apply --check` 验证过，可以干净应用），然后 `pnpm install --frozen-lockfile`。如果 main 前进了，用 `--3way`，或者照"破坏性变化清单"手改；锁文件冲突的话就直接改 package.json，再重新 `pnpm install`。
2. 用 `grep -rn "Light(\|WebGLRenderer(\|DoubleSide" packages apps` 看新代码里有没有：新的灯（要 ×`LIGHT_UNIT`）、新的 renderer（要调 `useLegacyColor`）、新的透明双面材质（要加 `forceSinglePass`）。
3. 跑 `pnpm check`（typecheck、lint、check:deps、check:content、test、build）。
4. 截图对比：构建 r128 和新版，各加一行 LAB-ONLY 钩子 `Object.assign(window, { __labStage: stage, __labCam: camera })`（**不要提交**），用 `lab/e3/lab3/shoot2.mjs` 拍，`tools/diff.mjs` 比，`lab3/summarize.mjs` 汇总。验收线：平均像素差接近 r128 自己的噪声（约 0.15%），开局图应该是 0%。
5. 用 `lab3/measure3.mjs` 量 GL 绘制数，确认和 r128 相同。
6. 提交信息建议 `chore(render): upgrade three r128 → r187 (legacy color pipeline)`。在 PR 里贴上面的像素差和绘制调用表，说明画面不变、所以没有更新截图基准。按 CLAUDE.md，"兼容色彩管线"这个决策值得补一个简短的 ADR。

## 产物

- `lab/e3/art6.patch`：代码和 package.json，10 个文件。
- `lab/e3/art6-lock.patch`：只有 `pnpm-lock.yaml`。
- 两个 patch 都不含 dist、shots、LAB-ONLY 钩子和 `tools/pack_game.py`。
- 已经应用了改动的工作副本：`lab/e3/repo2`（基于 `bc7d166`）。r128 对照：`lab/e3/r128repo2`（干净的 `bc7d166`）。
- 验证 patch 用的 clone：`lab/e3/applytest`（已经应用了 patch，可以删）。
