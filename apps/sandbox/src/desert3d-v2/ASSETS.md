# desert3d-v2 · 资产清单和规格

页面：`http://localhost:5190/desert3d-v2.html`（构图 + 占位）· 画廊：`desert3d-v2.html?asset=<id>`（`&v=1` 变体、`&cy=1.5` 放大窗看的高度、`&ref=0` 去掉 1.8 米人形比例尺；放大窗可拖）。
核心照搬 desert3d/pond3d：`pipeline.ts`（像素管线、描边）、`toon.ts`（三档色阶材质）、`colors.ts`。**不要从 `desert3d/parts/` 拿任何东西。**

## 怎么交一个资产

1. 新建 `assets/<id>.ts`：`export function build(ctx: AssetCtx): THREE.Object3D`（模板 `assets/_example.ts`）。文件一存在，场景里 `layout.ts` 的 `SLOTS` 里 `asset: '<id>'` 的占位自动换成它，标签变绿。
2. 本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头（画面下方），单位米。动画写在返回对象的 `userData.update = (dt, t) => {}`；风摆用材质的 `sway/swayH`。
3. 材质只能 `ctx.mat('<palette 名>', extra)`。缺颜色：先在 `palette.ts` 加一条（三档 + edge/convex），并写进这份文件。
4. 随机只用 `ctx.rng('<id>:<用途>')`；同一资产放好几处时按 `ctx.variant` 出不同的样子。
5. 自检：画廊竖屏 + 横屏各截一张，再在场景里看它在构图里的样子：
   `node docs/lab/2026-11-07-3d-pixel/tools/v2-shot.mjs "http://localhost:5190/desert3d-v2.html?asset=<id>" out.png`（竖屏 390×844 dpr2；末尾加 `1280 720` 是横屏）
   类型检查 `cd apps/sandbox && npx tsc -p tsconfig.json --noEmit 2>&1 | grep desert3d-v2`。

## 硬规则（沙漠 v1 失败复盘得来，违反就重画）

- **厚度**：最终缩放 0.09 米/纹素。任何看得见的部分 ≥ 3 纹素（≈ 0.27 米）宽，或者不画。细杆、铁丝网、细裂缝、单纹素的点 = 噪点 = 毛坯感。
- **少而胖**：剪影是 2～4 个大团块，不是很多小零件。每个资产先在画廊里眯眼看：只剩剪影和三档明暗时还认得出来吗？
- **三档要分开**：亮顶、中腰、暗底都要有，暗档换色相（palette 已经挑好）。圆的东西用球面法线（`sphereNormals`，多团的树冠用 `blobNormals` 每团单独算再合并）+ `lightUp`；面法线的低多边形球 = 碎面 = 不像。
- **细节放在主角上**：资产自己的细节（花、叶尖、裂纹）只在离镜头近、尺寸大的地方加，而且成簇；不要满身撒小点。
- **边缘**：`edge`/`convex` 用 palette 给的；不要在地面类资产上加描边。
- **不加新颜色**到贴图里：贴图/顶点色只做接近白的明暗（0.82～1.0），颜色来自三档。
- **预算**：整个场景 < 300 draw call、< 15 万三角形。一个资产 = 每种材质一个网格（合并几何体，`mergeGeometries`），重复的用 `InstancedMesh`。下表的三角形是单个实例的上限。

## 构图里的位置（layout.ts）

竖屏（390×844，195×422 纹素 = 17.5 × 38 米的画面）：上沿是北台崖壁暗带 + 左上蒲葵林的叶冠；中间是球场（主角，几乎占满宽度）；下面是球场台地南崖暗带 + 台阶；左下绿洲池和蒲葵，右下步道。
横屏（1280×720）再多出西台（假紫荆、龙舌兰）和东台（烟树、墨西哥刺木、石堆）。
**空着的沙地是故意的**（球场两侧的条带、北台中段、低地西段）：不要往那里加东西。

## 尺寸换算

0.09 米/纹素、俯角 45°：横向 1 米 = 11.1 纹素；竖直 1 米 = 7.9 纹素（屏幕上）；地面纵深 1 米 = 7.9 纹素。

## 清单

| id | 用在（SLOTS） | 尺寸 米（宽×高×深） | 屏幕上约 纹素（宽×高） | 调色板 | 三角形 |
|---|---|---|---|---|---|
| `court` | court | 14 × 0.05 × 28.4 | 155 × 224 | court、courtBleach、surround、line、asphalt、sandDrift | 6k |
| `net` | net | 12.8 × 1.07 × 0.15 | 142 × 9 | net、netTape、metal | 1k |
| `umpire-chair` | umpire | 1.0 × 2.3 × 1.0 | 11 × 20 | metal、wood | 1.5k |
| `bench` | bench-court、bench-n | 1.9 × 0.85 × 0.55 | 21 × 9 | wood、metal | 0.8k |
| `ball-hopper` | hopper | 0.55 × 0.95 × 0.55 | 6 × 8 | metal、ball | 0.6k |
| `shade-sail` | sail | 4.6 × 3.0 × 3.4 | 51 × 50 | fabric、fabricStripe、woodWeathered | 1k |
| `player` | player-a、player-b（v0/v1） | 0.7 × 1.8 × 0.5 | 8 × 15（Q 版：头大，实际做到 ≈ 10 × 18） | skin*、hair、cloth*、ball | 2k |
| `director` | director | 0.8 × 1.85 × 0.6 | 9 × 16（+ 帽檐 12 宽） | skinTan、straw、clothTeal、wood | 2.5k |
| `fan-palm` | palm-n1/n2/n3、palm-s1/s2（v0..2） | 5 × 8.5 × 5 | 55 × 67 | palm、palmSkirt、palmTrunk | 5k |
| `palo-verde` | paloverde-w1/w2（v0/v1） | 5.5 × 5 × 5 | 61 × 40 | yellowGreen、branch | 4k |
| `smoke-tree` | smoke-n、smoke-ne、smoke-e | 3.6 × 3.6 × 3.4 | 40 × 28 | silverBlue、branch | 3k |
| `creosote` | creosote-n/s1/e（v0/v1） | 2.0 × 1.5 × 1.8 | 22 × 12 | sage、branch、flowerYellow（少） | 1.5k |
| `brittlebush` | brittle-w/s1/s2（v0/v1） | 1.4 × 0.9 × 1.3 | 16 × 7 | silverBlue（叶）、flowerYellow | 1.2k |
| `ocotillo` | ocotillo-s、ocotillo-e | 2.4 × 3.6 × 2.2 | 27 × 28 | cactus（茎，偏灰）、flowerRed（茎梢） | 1.5k |
| `barrel-cactus` | barrel-s | 0.8 × 1.0 × 0.8 | 9 × 8 | cactus、flowerYellow（顶） | 0.6k |
| `cholla` | cholla-s | 1.2 × 1.5 × 1.1 | 13 × 12 | dryGrass（泰迪熊仙人掌是金色的）、cactus（暗处） | 1k |
| `agave` | agave-w、agave-s | 1.8 × 0.9 × 1.8 | 20 × 7 | silverBlue | 0.8k |
| `rocks` | rocks-ne、rocks-pool、rock-e、rocks-e（v0..2） | 2.6 × 1.2 × 2.0 | 29 × 10 | rock、rockCool（少） | 1k |
| `tumbleweed` | tumble | 0.9 × 0.8 × 0.9 | 10 × 6 | dryGrass | 0.6k |

（以后要的：`water-fx` 池面倒影/涟漪、`sand-drift` 场地积沙的可扫格子、`ground-patch` 少量成片的碎石/沙纹 —— 先别做，等上面的齐了再看构图缺什么。）

## 每个资产的要点

**court（主角）**——平涂色块为主：内场 `court`，晒白两三大块 `courtBleach`（低频，≥ 2 米大）；外场 `surround`；奶油线 2 纹素宽（0.18 米），只断两三处。破损只要：2～3 条**粗**裂缝（2 纹素，`asphalt` 色，不是 1 纹素的线）、一两块剥落露沥青、一块翘起的板（侧面露出 3+ 纹素）。积沙是几块大而圆的沙堆（`sandDrift`，堆在北端和下风角，抬起 0.1～0.25 米，边缘是一纹素深一档的沙），不是满场的沙纹。贴图按纹素（0.09 米/像素）画。现在的平涂占位就是它的底色和线位。

**net**——一条粗的暗靛带（网身 `net` 高 0.9 米 ≈ 7 纹素）+ 顶上 2 纹素白网带 `netTape` + 两根 3 纹素粗的网柱 `metal`。**不画网格**（网眼在 0.09 米下是噪点）；最多在网身上用一纹素的稍亮竖线每 4 纹素一条暗示网眼。网带中间略下垂。

**umpire-chair**——高脚椅：两条粗腿（3 纹素）+ 梯子三根横档 + 座位 + 小遮阳顶（可选，同 `fabric`）。侧对球场（rotY 已在 SLOTS 里给）。

**bench**——两块木板座面 + 一块靠背 + 两个金属脚；木板之间留 1 纹素缝（这是唯一允许的细线）。

**ball-hopper**——金属框篮子 + 一团荧光球（`ball`，一个 3×3 纹素的亮块，画面里最亮的点之一）。

**shade-sail**——三角或梯形帆布（`fabric`，可加一两条 `fabricStripe` 宽条纹），四角拉到两三根粗木杆（`woodWeathered`，4 纹素粗）。帆布下垂、风里轻轻鼓（CPU 顶点动画或 sway）。投影是北台上最大的一块阴影，是构图的一部分（长椅在它下面）。

**player / director**——Q 版：头 ≈ 身高的 1/3.5，身体是两三个胖块（躯干、短裤/裙、腿），手臂 3 纹素粗，球拍是一个圆块 + 粗柄。上沿提亮的描边让人从地面跳出来。总监：宽檐草帽（`straw`，帽檐宽 ≈ 肩宽 1.5 倍，帽子的投影罩住脸）、青绿衬衫、扫帚（木柄 + 一大块 `dryGrass` 扫帚头）。需要动作：站、走、挥拍、扫地（`userData.update` 里做或导出骨骼；演出以后接）。

**fan-palm（主框）**——加州蒲葵：笔直略斜的树干（直径 0.5 米，6 纹素，`palmTrunk`，顶下 1/3 是枯叶裙 `palmSkirt`：一个下垂的胖锥/团）；树冠是 10～14 片**扇形叶**，每片是一个宽扇面（不是细叶片），叶尖往下垂，整体成一个半球伞。叶冠用 `palm`（FOLIAGE 参数：球面法线以冠心为中心、lightUp、档位噪声 → 竖向叶笔触）。变体：高度 7～9.5 米、树干弯曲方向、冠大小。北台三棵站成不等边三角形，冠要互相叠一点（成一团框），投影落向镜头偏西。

**palo-verde（中框）**——假紫荆：绿色树皮的分叉枝干（3～5 根粗枝，`yellowGreen` 偏暗 → 用 `branch` 的话太棕；枝用 yellowGreen 的中暗档即可）+ 稀疏、通透的树冠：5～7 团扁的叶团（`yellowGreen`），团与团之间留空让枝露出来。春天有黄花（`flowerYellow` 成簇点在冠顶），变体 v1 开花。

**smoke-tree**——烟树：银蓝灰的蓬松一团（`silverBlue`，4～6 团，几乎看不见叶），细枝在下面露一点。剪影比假紫荆圆、比蒲葵矮。

**creosote**——石炭酸灌木：一丛从地面放射的细枝（只画 4～6 根 3 纹素粗的枝）+ 3～5 团小而通透的橄榄/鼠尾草绿叶团，顶上零星黄花。最常见的灌木。

**brittlebush**——脆灌木：银灰绿的圆垫子（`silverBlue` 叶团 2～3 团），春天顶上一层亮黄的花（`flowerYellow`，成一片平顶，像一顶黄帽子）——这是低地最鲜的颜色点。

**ocotillo**——墨西哥刺木：8～12 根从同一点放射、略弯的长茎（3 纹素粗，`cactus` 偏灰绿），茎梢一小簇红花（`flowerRed`）。剪影像一把张开的鞭子；这是唯一允许"线状"剪影的资产，所以茎一定要够粗。

**barrel-cactus**——桶形仙人掌：一个胖桶（竖向棱用法线做出亮暗条），顶上一圈黄花。成组 2～3 个大小不一。

**cholla**——泰迪熊仙人掌：几节毛茸茸的短粗段（金色 `dryGrass` 亮档，暗档往紫），像一个小人举着手。

**agave**——龙舌兰：一圈宽厚、尖的叶片（12～16 片，每片宽 ≥ 3 纹素），从中心往外往上翻，银蓝 `silverBlue`，叶尖一纹素深色。

**rocks**——红岩：一块大的 + 两三块小的，压扁、棱角钝（参考 `_example.ts`），`rock` 为主、`rockCool` 只点一块。上沿亮线（convex 1）要清楚。

**tumbleweed**——风滚草：一个通透的枯草球（几圈粗的弯枝缠成球，`dryGrass`），画廊里静止，场景里由 fx 推着滚（以后）。

## 调色板摘要（palette.ts，[亮, 中, 暗]）

| 类 | 名字 | 亮 | 中 | 暗 |
|---|---|---|---|---|
| 地面 | sand / sandHigh / sandDrift | #eab46c / #f0be78 / #e0a05c | #cc8a62 … | #8a5f96 / #90629a / #7c5690（紫红，不是棕） |
| 步道 | path / stair | #f6e0b4 / #fae8c4 | #d8aa8e / #dcae96 | #8e6c9c / #6a5294 |
| 崖壁 | cliff / cliffLip / underside | #d8845e / #f6cc8c / #9a5a7a | #b05c66 … | **#5a3f86** / #8a64a6 / #3e3070 |
| 岩石 | rock / rockCool | #d88e68 / #c0a8c4 | #a85e6a / #8a78aa | #4e3c80 / #4a4280 |
| 球场 | court / courtBleach / surround / line | #4aa6c0 / #7cbccc / #5cae78 / #f6ead0 | … | #2e4c86 / #3e5a8c / #2e5a74 / #7e6ea0 |
| 植物 | palm / sage / olive / yellowGreen / silverBlue / cactus | #b4d04a / #a8c470 / #9cb440 / #cce050 / #accad0 / #8cc068 | … | 青：#2c6a62 / #346468 / #2c5c58 / #3a7c62 / #4a5890 / #2c5a6e |
| 花 | flowerYellow / Red / Purple | #ffd23c / #f4583c / #c47ade | … | … |
| 人 | skin* / cloth* / straw / ball | 见 palette.ts | | |
| 天 | SKY | #5fb0e8 → #a8dcf0（4 档色带） | | |

明暗目标（`node docs/lab/2026-11-07-3d-pixel/tools/stats.mjs '[["x","<png>",4]]'`，竖屏截图 px=4、横屏 px=2）：饱和度 ≥ 0.42、强边缘密度 ≤ 0.055、亮度直方图两个峰（亮沙/球场 ≈ 第 5、7 档，崖壁/投影 ≈ 第 2～4 档）。参考图：0.47 / 0.045。

## 组装以后（2026-11-07 第二轮）

- 场景模块：`terrain.ts`（地形）、`ground.ts`（中间层地面细节：手摆的草团/小花/碎石簇 + 几块深沙斑 + 球场裂缝里的草）、`fx.ts`（阵风、贴地沙线、风滚草、尘团、风把沙吹回球场）、`life.ts`（四幕轮播 ≈ 3 分钟：对打 + 分间扫沙 → 教练喂多球 → 总监推捡球器捡球、倒回球车 → 教练吹沙；`?scene=rally|drill|pick|blow` 只演一幕。击球按"拍面到达击球点的时刻 = 球到的时刻"倒推挥拍，球不停顿）。
- `court.userData.sand`：`at / sweep / blow(x, z, dirX, dirZ, length, width, amount) / deposit / dirtiest(min, near?) / homes / total / flush`。`blow` = 吹叶机：锥里吹走、六成堆到锥尖前面（推出场边就没了）。`deposit` 每格不超过初始沙丘厚度 + 2 厘米（沙只往原来的沙丘上堆）。
- 人物：`userData.pose(name, phase)`（idle/walk/ready/forehand/backhand/serve/sweep），给 phase = 固定帧；不给 = 自动播放。正面朝 +z，右手在 −x。
- URL：`life=0`、`fx=0`、`detail=0`、`clouds=`（默认 0.25 的移动云影）、`sunel`/`sunaz`（默认 50° / 偏东 22°）、`dstr`（描边压暗，默认 0.48）。
- 钩子：`window.__d3v2 = { step(秒), life.state, fx, setSun, setHour }`；序列截图：`node docs/lab/2026-11-07-3d-pixel/tools/v2-seq.mjs "<url>&pause=1" <前缀> 19,20,24,28`。
- 组装时改过的资产：`court`（裂缝改成"缝 + 下沿亮边"、剥落只留一块、加水泥路缘、沙 API 加 deposit/dirtiest/homes）；调色板加 `courtCrack / surroundCrack / surroundLight / sandPatch / dryTuft / concrete`，`dryGrass` 提亮（风滚草、仙人球、扫帚头在沙上不再消失），`asphalt` 换成浅石板蓝。
