# 第二轮简报：01 / 06 / 08 / 11 精修（每个 agent 先读这份，再读第一轮的 brief.md）

制作人试玩了第一轮的 11 个 demo，挑出 **01 球具店、06 场地养护、08 拖人 2.0、11 社交媒体**，要求：

1. **画面贴合主游戏的审美**：用游戏真正的像素引擎 `@td/iso`（2:1 等距像素、字符画精灵、软件光栅、地台浮空岛、抖动阴影），不再手画一套近似的。
2. **提升操作手感**：拖、按、松手都要跟手；有拿起/悬停/放下三段反馈；不卡顿、不误触；在 390×844 手机竖屏上用拇指好操作。
3. **提升 UI**：和游戏 HUD 同一套视觉语言（下面"UI 规范"），信息层级清楚，不要大段文字。

玩法本身以第一轮为底子（先读你那个 demo 的 `docs/lab/2026-11-04-playability/demos/<NN>/index.html` 和 `notes.md`），保留好玩的循环、修掉 notes 里写的"最弱的地方"。**不怕违反玩法准则**，以好玩为准。

## 你写在哪里（只写这些，其他文件一律不碰；不要 git commit）

- `apps/sandbox/demo-<id>.html`：页面壳子已经建好（字体、`#phone > #stage + #vignette + #ui`），可以改。
- `apps/sandbox/src/demos/<id>/`：你的全部 TypeScript 和 CSS，入口是 `main.ts`（第一行已经 `import '../kit/kit.css'`）。
- `apps/sandbox/public/shots/<id>-1.png`（开始画面）、`<id>-2.png`（正在玩），截图脚本放在 `apps/sandbox/src/demos/<id>/` 下（`.mjs`）。
- `docs/lab/2026-11-04-playability/demos/<NN>/notes-r2.md`：第二轮改了什么、手感和 UI 怎么做的、还差什么（中文，简洁）。

`<id>`：01 → `shop`，06 → `court`，08 → `staff`，11 → `social`。

**共用的、只读的**（不要改，别的 agent 也在用）：`apps/sandbox/src/demos/kit/kit.css`（UI 变量和 `.k-*` 样式）、`apps/sandbox/src/demos/kit/juice.ts`（`floatText`、`shake`、`pop`、`flash`、`sfx`/`SFX`、`buzz`、`tween`、`setMuted`）、`apps/sandbox/vite.config.ts`、`apps/sandbox/demos.html`、整个 `packages/`。需要 kit 里没有的东西，写在你自己的目录里。

## 怎么用 @td/iso

- 从 `@td/iso` 入口 import（见 `packages/iso/src/index.ts`）。接口契约在 `docs/design/iso-architecture.md`，先读它。
- 参考怎么建世界、放人、每帧渲染：`apps/sandbox/src/viewer/main.ts`（Palm Oasis 全图、设施状态、昼夜、路人）、`apps/sandbox/src/activities/main.ts` 和 `packages/iso/src/activities/diorama.ts`（小岛、局部场景）、`apps/game/src/main.ts`（游戏里：`createIsoWorld` + `Site`、每帧先 `setPeopleView(proj.ang, proj.k, proj.spriteScale)` 再更新人物和 `render`、`camera.project` 把世界坐标转成屏幕坐标给 DOM 叠层定位、`camera.unproject` 把指针转回世界坐标）。
- 人物用 `Person`（`packages/iso/src/people/`），外观换色、姿势、走路、表情都有；精灵约定见 `packages/iso/src/art/people/README.md`。粒子 `Particles`、漫画字和像素表情 `SpriteLayer`（`packages/iso/src/fx/`）。图标 `ICON_ART`。字符画 `bakeArt`、`textArt`。
- 新的道具/物件（货架、商品、手机、相机取景框……）用 `Box`/`Sprite`/`Custom` 节点和 `PixelArt` 字符画在**你自己的目录里**画，配色从游戏调色板取（看 `packages/iso/src/art/` 里现有的颜色）。不要提交图片文件，素材全是字符画。
- 画面只用 `@td/iso` 的软件光栅，不引入 three、WebGL、别的库。
- 演出里的随机只决定画面；这一轮 demo 的数值逻辑可以直接写在你的目录里（不用 sim）。

## UI 规范（和游戏 HUD 一致，见 `apps/game/src/style.css`、`packages/ui/src/hud/hud.css`）

- 深海军蓝 `--navy #14223a` 半透明面板、**方角**（不要圆角卡片）、2px 硬投影；奶油 `--paper #f3ecdc` 字；强调色 `--optic #d8c08a`（金）、`--green #2f7a49`；警告 `--coral #ff8a6b`；钱 `--money`。
- 字体：数字和标题 `var(--f-cond)`（TD Digits 像素数字 + Pixelify Sans + ZCOOL QingKe HuangYou），小标签 `var(--f-label)`（Silkscreen，英文大写）。
- 场景里的地点牌、岗位标记照游戏的样子：海军蓝小牌 + 细竖线指到地面（`.pl` / `.tg` 的写法），用 `camera.project` 跟着场景定位。
- 顶上一条状态条（钱、口碑/星级、时间），底部拇指区放操作；中间留给场景。一屏上不要超过两块大面板。
- 文字短：一行话 ≤ 14 个汉字；规则说明放在"?"浮层里，开始画面 2–3 行。

## 手感清单（逐条做到）

- 拖动：按下 0 延迟有反馈（缩放/抬起/音效/`buzz(8)`）；拿着时物体跟手（不落后），落点有吸附和高亮，松手有落下的动画和声音；拖到无效位置松手会弹回原处。
- 拖动时不要触发镜头平移；镜头可以双指缩放或者干脆固定（选更好操作的）。
- 所有按钮 ≥ 44 px，按下有按压态。不依赖 hover。
- 每一个改变数值的动作都有看得见的结果（`floatText`、表情、计数跳动），并且原因可读（一行字说明为什么好/为什么坏）。
- 帧率：手机上要流畅。iso 渲染有静态层缓存（`view.invalidate()` 只在静态东西变了时调），动态的东西挂 `scene`。

## 验证（必须做）

1. `npx -y pnpm@10.18.3 --filter @td/sandbox typecheck` 和 `npx -y pnpm@10.18.3 exec biome check apps/sandbox/src/demos/<id> apps/sandbox/demo-<id>.html` 通过（lint 报的问题修掉；格式可以用 `biome check --write` 只对你的文件跑）。
2. 自己起一个 dev server，**每个 agent 用固定端口，别冲突**：`cd apps/sandbox && npx -y pnpm@10.18.3 exec vite --port <端口> --strictPort`（后台跑），shop 5181、court 5182、staff 5183、social 5184。做完关掉。
3. 截图：`SHOT_OUT=apps/sandbox/public/shots/<id>-1.png node docs/lab/2026-11-04-playability/tools/shot.mjs http://localhost:<端口>/demo-<id>.html 3000`；正在玩的那张带交互脚本（第三个参数）。必须打印 `ok, no errors`。用 Read 看截图：像素清晰、和游戏截图一个风格、文字不截断、按钮在拇指区。
4. 用脚本把一局从头玩到结束画面（支持 `?fast=N`、`?seed=N`），不卡死、不报错。
5. **不要跑 `vite build`**（四个 agent 共用 dist，会互相覆盖；总构建由 lead 做）。

## 回报（5–8 行）

做了什么、和第一轮比画面/手感/UI 具体改了哪些、一局多久、最满意的手感细节、还差什么。
