---
name: pixel-scene
description: Build a new three.js 3D pixel-art scene in apps/sandbox following the art direction distilled from the pond replica and the desert court (desert3d-v2) — blockout first, assets drawn in isolation by subagents with 材质规范 v2, numeric acceptance against the reference, mobile-portrait screenshots and a playable online page. Use when the user asks for a new 3D pixel scene / map / diorama in this style (e.g. "/pixel-scene 沙漠绿洲集市，傍晚").
argument-hint: <场景描述：主题、时间、主角/焦点、要发生的事>
---

# 新的 3D 像素场景（t3ssel8r 风格，three.js）

用户给的描述：$ARGUMENTS

描述里没说清的（主题、焦点、要不要能操控、复用哪些现成素材）先问一句，问完就开始。

## 0. 先读（不读不要动手）
- `docs/lab/2026-11-07-3d-pixel/lessons.md`：成功配方、细节打磨、沙漠失败复盘、组装经验、动画评审。
- `docs/lab/2026-11-07-3d-pixel/material-spec.md`：材质规范（元素 + 每元素深浅 + 亮边 + 阴影里保留纹理），各轮实测的参数和明暗目标。
- `apps/sandbox/src/desert3d-v2/ASSETS.md`：资产接口、画廊、"材质规范 v2" 的 API（`elem` / `tones` / `toneW`、`tn()`、`EL.*` 预设）。
- 代码骨架：`apps/sandbox/src/desert3d-v2/`（`pipeline.ts`、`toon.ts`、`palette.ts`、`world.ts`、`terrain.ts`、`main.ts`、`hud.ts`/`control.ts`/`life.ts`/`fx.ts`）。复用它：新场景新建 `apps/sandbox/<name>.html` + `apps/sandbox/src/<name>/`，复制核心（pipeline/toon/colors），需要的素材复制过去改，**不要改 desert3d-v2 本身**。在 `apps/sandbox/vite.config.ts` 的 input 里登记页面。
- 参考图（只在本地，**不在仓库里**）：`~/workspace/tennis-director-refs/pixel-pond/ref/{summer,spring,autumn,winter}.png`；含参考图的旧对比图在 `~/workspace/tennis-director-refs/pixel-pond/shots/`。用户另给了新参考图，也放到 `~/workspace/tennis-director-refs/<场景>/`。

## 1. 固定的画面设置
- 正交相机，俯角 45°，yaw 0；低分辨率渲染 + 纹素对齐 + 最近邻放大。
- **默认像素 1×**（每纹素 1 CSS 像素），米/纹素 = 0.09 × px / 2；素材按 2×（0.09 米/纹素）的"设计纹素"建模。左上角保留像素级别选择器（1 / 1.5 / 2 / 3）。
- 太阳在画面后方、偏高（先从参考图的影子位置量，不要猜）；云影手摆、硬边、不落在主角上。
- 每个材质手挑 3 档 × 3 色（暗档冷色相），关颜色管理、线性输出，不用半球光。
- 描边：深度描边压暗偏靛、上沿提亮；每个材质的 `edge` / `convex` 生效（法线材质 `NoBlending`，见 toon.ts）。

## 2. 流程（按顺序，每步有关卡）
1. **白模 → 给用户看，确认后才画素材。** 一个美术方向子代理：手摆构图（台地层次、朝镜头的崖壁做深色框、主角、步道引导视线、留白区）、调色板、素材清单（每件：尺寸米/纹素、轮廓要点、色阶、三角形预算、元素类型），占位用灰盒。截竖屏 390×844 和横屏 1280×720 给用户。
2. **素材：每件（或每小类）一个子代理，从零画，不看别的场景的素材代码。** 在画廊 `?asset=<id>` 里隔离迭代；只改自己的文件，调色板和共享材质由一个"核心"子代理改。照 `material-spec.md`：元素有形状（4～12 纹素），同档内 2～3 个元素色，亮边只在该有的地方（不是每个元素都加，否则变横条），阴影里换暗档色组、纹理还在，线 1 纹素、按纹素/屏幕行取整，噪声按纹素中心取。小道具和朝镜头的竖直面 `noShadowReceive`；朝镜头的面用 `lightUp` + 低 `bands`；多团/多切面的东西 `convex` ≤ 0.3；偏移只用 0 或整纹素；金色的东西放在沙上要拉开亮度。
3. **组装 + 演出**（如果要能动/能操控）：沿用 desert3d-v2 的 life/control/hud 做法；动作要对着帧检查（1/30 秒连拍，例如击球不能停顿）。
4. **验收（用数字，不凭感觉）**：
   - 全帧：`node docs/lab/2026-11-07-3d-pixel/tools/stats.mjs '[["名字","图.png",每纹素像素数]]'` → 饱和度 ≥ 0.42、强边缘 ≤ 0.05、细变化 0.17～0.21、亮度两峰。
   - 每类物件：`node docs/lab/2026-11-07-3d-pixel/tools/lum.mjs '[["名字","图.png",x,y,w,h]]'` → 暗/中/亮比例对照参考（池塘：树冠 ≈ 163 · 24/26/50，亮处灌木 ≈ 158–165 · 24/27/49，阴影灌木 ≈ 134 · 35/43/23）。
   - 裁切并排放大：`node docs/lab/2026-11-07-3d-pixel/tools/crop.mjs <out> <倍数> x y w h <参考> <修前> <修后>`。
   - 主代理自己复查：重新渲染、重测数字、看裁切，不只看子代理报告。
5. **交付**：手机竖屏截图 + 在线可玩页面：`bash .claude/skills/pixel-scene/scripts/single-file.sh <页面名> <输出.html> [默认查询串]`，先在浏览器里打开一次确认没报错，再用 Artifact 发布（私有）。

## 3. 不要做（都踩过）
- 不先定构图就撒素材；程序随机铺满整个地面。
- 大块平涂、柔边色块（软边云影、软边褪色斑）、满地逐纹素随机噪点、细于 1 纹素的线、几十条 1 纹素的细杆细网。
- 所有材质一个颜色乘系数变暗；阴影里纹理消失。
- 在旧素材上修修补补（会被旧东西带偏）——要重画就从零画。

## 4. 参考图版权（必须遵守）
参考图是别人的作品截图：**参考图和任何含参考图像素的对比图都只放在 `~/workspace/tennis-director-refs/`，不进仓库**。提交前跑 `node docs/lab/2026-11-07-3d-pixel/tools/refcheck.mjs <要提交的 png 或目录>`，标 `REF?` 的图移到本地目录。仓库里只放我们自己的渲染图。

## 5. 汇报
每个关卡给用户：截图路径、关键数字（修前/修后/目标）、还没对上的地方（老实说），以及下一步建议。提交、推送只在用户要求时做。
