# 人物设计方向 demo：共用简报

制作人的话：**现在的人太卡通，像素点太少，人的样貌和特征都表现不出来。** 要几种不一样的人物画法 demo 来挑。

现状：成人精灵 8×14（含描边），头 5 行、躯干 3 行；小孩 7×10。换色槽位（皮肤、头发、上衣、下装、鞋、帽子、球拍），发型是叠加图。见 `packages/iso/src/art/people/README.md`、`adult.ts`、`gestures.ts`、`kid.ts`、`packages/iso/src/people/`。游戏里每个人的样子在 `apps/game/src/scene.ts` 的 `LOOKS`；人物背景在 `packages/content/data/i18n/zh.yaml` 的 `bios:`，特质在 `traits:`，招聘表在 `docs/design/game-design.md`"招人"一节。

## 每页要展示的（手机竖屏 390×844 优先，可以上下滚动）

1. **全体阵容**：按你这个方向的画法画出这些人，每人标名字和一句话（≤14 字）。必须有：Dale（60 多岁老教练，戴棒球帽，白胡子，宽身板）、Rosa（沙漠长大的维护工）、Ben（早起的大学生前台）、Jess（干劲足的年轻教练，马尾）、Gus（心累的老场地工，完美主义）、Lily（双语夜猫子前台）、Teodora（塞尔维亚穿线师，挑剔）、Nadia（退役职业明星球员，肩伤）、Ray（膝盖不好的老场地主管）、Mateo（16 岁球童）、总监（玩家）、两个小孩学员、三种客人（退休老人、网球妈妈、游客）。**每个人要一眼认出是谁**：年龄、体型、发型、脸部特征（胡子、眼镜、皱纹、雀斑、妆）、衣着风格、配饰（夹板、毛巾、穿线钳、护膝、太阳镜、帽子）都要能看出来，和他的背景、特质对得上。
2. **动作**：至少 idle（有个性的小动作：Dale 揉腰、Gus 叹气、Lily 看手机、Mateo 抛球）、走路 4 帧、挥拍（正手）、一个情绪动作（高兴 / 生气），循环播放。四个朝向里至少画正面和背面（左右用翻转）。
3. **近看**：把几个人按整数倍放大到大约 2–3 cm 高，方便看清像素。
4. **放进游戏**：用 `@td/iso` 建一个小场景（真实的 Palm Oasis 地图 `INDIAN_WELLS` 的一块，或者 `activities/diorama.ts` 那样的小岛），按游戏的默认缩放把你的人放进去：几个人在球场上打球、几个在场边、一个在走路。**这一块最重要**，制作人要看的是在游戏里的样子，不是单独看。和现在的人（`Person`）并排放一个对照。
5. **"?" 或页面底部的说明**（中文，简短）：这个方向的规格（精灵尺寸、头身比、调色板几色、描边规则、换色怎么做）、每个人要画多少帧、做全套的成本估计、对游戏的影响（镜头缩放、和场景比例、性能），优点和风险。

## 硬性要求

- 只写你自己的文件：`apps/sandbox/chars-<id>.html`（壳子已建好，可以改）、`apps/sandbox/src/chars/<id>/**`、截图 `apps/sandbox/public/shots/chars-<id>-1.png`（阵容）、`chars-<id>-2.png`（放进游戏的场景）、`docs/lab/2026-11-04-characters/<id>.md`（规格和说明，同"?"里的内容）。**不改 `packages/`**（需要的东西复制到你的目录里改），不改 vite.config.ts、chars.html，不 commit，不跑 `vite build`。
- 素材全是字符画（字符串数组 + 调色板/换色槽），不用图片文件。画面只用 `@td/iso` 的软件光栅或你自己的 Canvas 2D 低分辨率画布，整数倍放大、`image-rendering: pixelated`，3× 手机上不糊。不引入 three、WebGL 或别的库。
- 风格要和游戏的场景协调（看 `apps/sandbox/public/shots/` 里游戏和 demo 的截图，或者起 sandbox 看 `index.html`）：同样的沙漠暖色调、同样的光照方向、同样的像素密度感（不要人物比场景细很多倍显得贴上去的）。界面用 `apps/sandbox/src/demos/kit/kit.css` 的样式（只读）。
- 不能抄任何现成游戏的角色。参考可以是像素画的一般技法。
- 验证：`npx -y pnpm@10.18.3 --filter @td/sandbox typecheck`、`npx -y pnpm@10.18.3 exec biome check apps/sandbox/src/chars/<id> apps/sandbox/chars-<id>.html` 通过；起 dev server（`cd apps/sandbox && npx -y pnpm@10.18.3 exec vite --port <端口> --strictPort`，后台跑，做完关掉）；截图 `SHOT_OUT=apps/sandbox/public/shots/chars-<id>-1.png node docs/lab/2026-11-04-playability/tools/shot.mjs http://localhost:<端口>/chars-<id>.html 3000`（第二张可以用交互脚本滚到场景那块，或者给页面加 `?view=scene`），必须 `ok, no errors`。**用 Read 按原尺寸看截图**：每个人认得出、像素清楚、和场景协调。看到问题就改了重截。

## 回报（≤8 行）

规格一句话、你觉得最成功的两个人物、在游戏场景里的效果怎么样、成本、最大的风险。
