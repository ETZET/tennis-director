# desert3d-v2 · 资产清单和规格

页面：`http://localhost:5190/desert3d-v2.html`（构图 + 占位）· 画廊：`desert3d-v2.html?asset=<id>`（`&v=1` 变体、`&cy=1.5` 放大窗看的高度、`&ref=0` 去掉 1.8 米人形比例尺；放大窗可拖）。
核心照搬 desert3d/pond3d：`pipeline.ts`（像素管线、描边）、`toon.ts`（三档色阶材质 + 材质规范 v2 的元素库）、`colors.ts`。**不要从 `desert3d/parts/` 拿任何东西。**

## 材质规范 v2（2026-11-08，先读这一节）

用户的评价是"大块平涂"：每个表面只有三档光照色，朝同一方向的一整片就是一个颜色。池塘复刻（`docs/lab/2026-11-07-3d-pixel/material-spec.md`）解决这个问题的办法搬过来了：**表面由"元素"组成**（沙纹、岩层里的石块、土团、踏面石条、板条、叶团……），每个元素在本档的三色里挑一个，外加缝色和亮边色。所有资产都可以用，不用的资产和以前完全一样。

### 规则（违反就是噪点或平涂）

1. **元素有形状、有尺寸**（一般 4～16 纹素），整块一个颜色；不是逐纹素的随机点。噪声一律按纹素中心取（shader 里已经做了）。
2. **每档三色**：`[本色, 高一级, 低一级]`。高/低一级只和本色差 6～12 个亮度（远看不花），缝和亮边差 15～25。暗档往冷色相走（紫、靛、青），不是亮档乘系数。
3. **亮边只画在规范说的地方**：墙 = 只在缝下面那一行（`hi` 是比例）；石板 = 每块上沿；叶团/灌木 ≈ 15% 的团；沙 = 丘顶。每个元素都画亮边 → 45° 下满屏横线。
4. **阴影里纹理还在**：投影 = 整套换暗档那三色 + 暗档缝/亮边；云影 = 亮档整套换中档那三色（硬边 + 最多一纹素棋盘抖动，云是 `fx.ts` 的 `CLOUDS` 手摆的几团，只走北台和低地两条带，不上球场）。这两件 toon.ts 都做了，资产不用管。
5. **线都是 1 纹素、按屏幕行**：元素坐标就是屏幕纹素（`space: 'screen'`，跟世界锚定，平移不爬）。竖直 1 米 = 0.707/纹素 屏幕行，墙用 `space: 'wall'`（uv 米 → 屏幕行）。
6. **撒的细节按斑块变疏密**（`density: [lo, hi]` + `patch` 米）：≈1% → 25～40%。处处一样密 = 一层噪点。
7. **矮墙不挂东西**：墙露出 < 9 行（≈ 1.1 米）= 实心一条 + 亮唇；≥ 18 行才挂淌沙之类往下挂的东西（`strata` 的 `q`）。
8. **明暗分档要量**（`node /private/tmp/claude-501/audit2/lum.mjs '[["名","<png>",x,y,w,h]]'`：平均亮度 + 暗 L<120 / 中 <170 / 亮 三档占比），加了元素以后同一个框的三档占比变化 ≤ 10 个点。两个坑：**亮档的"低一级"别掉到 170 以下**（亮沙一大片会变成中档），**暗档的"高一级"别跨过 120**（投影要是一整块暗形，不能碎成中档）。
9. **强边缘预算**：元素和本色的亮度差都 < 60（`stats.mjs` 的 strongEdge 只数 > 60 的），缝、碎石、泡沫空隙也一样。整帧强边缘 ≤ 0.05，现在正好 0.050（大头是沙和投影的交界、白线），新东西不要再加 > 60 的对比。
10. **会动的东西**：跟着物件走用 `space: 'local'`（原点随物件动、图案不游）；蒙皮的人物、风滚草这类不要元素（`elem` 不给）。

### 怎么用

```ts
// 1. 颜色：palette.ts 里给这个材质一套 tones（tn(亮, 中, 暗, 缝, 亮边)，每档 [本色, 高一级, 低一级]）。
//    不给也行：从 ramp 自动推（autoTones），但缝是"冷暗"色，适合石缝，不适合沙纹 —— 大面积的东西请手挑。
rock: s([0xd88e68, 0xa85e6a, 0x4e3c80], 0.8, 1.0, ROUND, tn(
  [0xd88e68, 0xe09a72, 0xcc8060],   // 亮档：本色、高一级、低一级
  [0xa85e6a, 0xb26a70, 0x9c5464],   // 中档
  [0x4e3c80, 0x58468a, 0x463674],   // 暗档（冷）
  [0xb06a5c, 0x86485e, 0x3c2c6a],   // 三档的缝
  [0xf0b086, 0xc27a78, 0x6a5498],   // 三档的亮边
)),
// 2. 图案：在资产里给 elem（不要写进 palette 的 opts：同一个 palette 名别处也在用，比如 'path' 也是尘团的材质）
const m = ctx.mat('rock', { ...rockOpts, elem: { kind: 'stones', size: [7, 5], seam: 0.6, hi: 0.3 } });
// 3. 现成的预设（palette.ts 的 EL）：EL.sand / EL.strata / EL.path / EL.water / EL.foam
const drift = ctx.mat('sandDrift', { elem: { ...EL.sand, seed: 2 } });
```

`ToonOpts` 新加的三个字段：`elem?: Elem`、`tones?: Tones`（palette 的 `tones` 会自动带上）、`toneW?: [高一级比例, 低一级比例]`（默认 `[0.28, 0.24]`）。

### `elem` 的 kind 和参数

公共参数：`space`（`screen` 默认 / `wall` / `local`）、`size`（纹素 [宽, 高]）、`seam`（缝宽，纹素）、`hi`（亮边比例 0..1）、`density`（撒的细节，斑块之间 [疏, 密]）、`patch`（斑块尺度，米，默认 3）、`mottle`（低频深浅斑 0..1）、`pebbles`（叠加碎石：每 7×5 纹素格的概率）、`accent`（强调色 [亮, 中, 暗]）、`p`/`q`（kind 自己的 vec4）、`attr`（几何体带 `aElem` vec4 顶点属性）、`seed`。

| kind | 用在 | 参数 | 已经用了的地方 |
|---|---|---|---|
| `stones` | 石板、乱石墙、石头的切面、路缘 | `size` 石块（纹素），`seam` 缝宽判据（0.6～0.75，再大缝就成 2 纹素），`hi` 有上沿亮边的石块比例 | （phase B） |
| `strata` | 崖壁、岩台、层状红岩（墙，`space: 'wall'`，uv = [沿墙米, 离墙顶米]） | `size` = [石块宽, 一层几行]（每块石头自己一个深浅，轮着取）；`hi` 缝下那行变亮（= 这块石头的上一级）的比例；`q.x` 矮墙行数（默认 9），`q.y` 淌沙的最少行数（18）；`accent` 淌下来的沙；`attr` + `wallGeo(…, expo)` 写露出高度 | 所有台地崖壁、岛外沿、池壁（`EL.strata`） |
| `planks` | 木板、长椅、工具架、门、箱子 | `p` = [本地轴 x, y, z, 每块板宽（米）]，`q.x` = 物件缩放；`seam` 缝宽（纹素），`hi` > 0 时缝后一纹素亮条 | （phase B） |
| `leaves` | 树冠、灌木团 | `size.x` 叶团格子（纹素，2.1～2.6）；`hi` 有亮顶的团比例（≈0.15）；还要 `noise` > 0（档位交界跟着叶团走） | （phase B） |
| `blades` | 草、干草、仙人掌的刺（竖向 1 × 2～4 的亮划） | `density`、`patch` | （phase B） |
| `ripples` | 沙地 | `size` = [分段长, 每几行一行沙纹]；`density` 沙纹段的比例；`mottle` 深浅沙斑（深斑上沿 = 丘顶亮边）；`pebbles` + `accent` 碎石 | 所有台面、地上的沙斑（`EL.sand`） |
| `pebbles` | 踩实的土路 | `size` 土团（纹素）；`seam` 龟裂（只在少数斑块）；`density` 脚印；`pebbles` + `accent` 嵌着的碎石 | 步道（`EL.path`） |
| `paint` | 漆面（球场、帆布、漆过的金属） | `size` 深浅块（纹素，有机形状）；`density` 擦痕 | 内场、外场、晒白块（`court.ts`） |
| `treads` | 台阶 | `p` = [顶端 x, z, 朝下方向 x / 每级长, z / 每级长]，`q` = [级数, 顶面高, 每级高, -]，`size` = 石条长 [最短, 最长] | 台阶（`terrain.ts`） |
| `drift` | 场上的积沙（高度场 + alphaMap） | `p.xy` 风向（迎风坡上有沙纹，密度 `density[1]`）；alphaMap 的 **b 通道** = 背风脚下的暗边 | `court.ts` 的积沙 |
| `water` | 水面 | 要 `attr`：`aElem` = [往北到岸的距离, 到岸的距离]（米）；亮边色 = 北岸天光带，缝色 = 深水 | 绿洲池（`EL.water`） |
| `dash` | 虚线（泡沫圈） | `size` = [段长, 最长空隙]，`accent` = 空隙的颜色 | 池边泡沫（`EL.foam`） |

### 量出来的（修前 → 修后，横屏 1280×720 降到纹素）

整帧：饱和度 0.49 → 0.49，边缘密度 0.129 → 0.161（池塘 0.173），强边缘 0.051 → 0.050，亮度三档 24/18/58 → 23/22/55。逐块的表和对比图在 `docs/lab/2026-11-07-3d-pixel/material-spec.md` 末尾「沙漠移植」和 `shots/desert-mat-*.png`。

### 还没做的（phase B：按资产上元素）

| 资产 | 建议 | 备注 |
|---|---|---|
| `fan-palm` 叶冠 / 枯叶裙 / 树干 | 冠 `leaves`（size 2.4, hi 0.15）；裙 `blades`（竖向枯叶须）；干 `planks`（`p: [0,1,0,0.16]` 横向叶痕环） | `palm`、`palmSkirt`、`palmTrunk` 要手挑 tones |
| `palo-verde`、`smoke-tree` | 冠 `leaves`（烟树 size 2.8、hi 0.1，更蓬） | `yellowGreen`、`silverBlue` |
| `creosote`、`brittlebush`、地上的草团（`ground.ts` tuft） | 池塘第四轮灌木做法：整丛一个圆顶 + `blades` 竖须；`leaves` 只在大丛上 | `sage`、`olive`、`dryTuft` |
| `rocks`（含 `_example`） | `stones`（size [7,5], seam 0.6, hi 0.3）或者大的层状红岩 `strata`；脚下的积沙 `EL.sand` | 面法线已经给了切面，元素只加在大面上 |
| `bench`、`tool-rack`、`umpire-chair`、遮阳帆的杆 | `planks`（按板的方向给 `p`，`seam: 1`，`hi: 1`） | `wood`、`woodWeathered` |
| `shade-sail` 帆布、球场路缘（`court.ts` curb） | 帆布 `paint`（size [10,6]）；路缘 `stones`（size [14,3]，水泥接缝） | `fabric`、`concrete` |
| `cholla`、`barrel-cactus` | `blades`（刺）；桶仙人掌的棱已经靠法线 | `cactus`、`dryGrass` |
| 岛底 `underside` | 没有 uv：`stones` 屏幕空间（size [12,6]）或者给几何体 uv 后用 `strata` | 竖屏最下面一条 |
| `agave`、`ocotillo`、`net`、人物、球车、工具、风滚草、尘团 | 不加（细长、会动、蒙皮，或者本来就该是一条干净的色带） | |

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
| 崖壁 | cliff / cliffLip / underside | #d8845e / #f6cc8c / #9a5a7a | #b05c66 … | **#5a3f86** / #7c589a / #3e3070 |
| 岩石 | rock / rockCool | #d88e68 / #c0a8c4 | #a85e6a / #8a78aa | #4e3c80 / #4a4280 |
| 球场 | court / courtBleach / surround / line | #4aa6c0 / #7cbccc / #5cae78 / #f6ead0 | … | #2e4c86 / #3e5a8c / #2e5a74 / #7e6ea0 |
| 球场（v2） | courtBleachCore（晒白块里偏一边更白的一块；晒白块一共两色、硬边、不加元素） | #8ec8d4 | #6aa4bc | #466494 |
| 植物 | palm / sage / olive / yellowGreen / silverBlue / cactus | #b4d04a / #a8c470 / #9cb440 / #cce050 / #accad0 / #8cc068 | … | 青：#2c6a62 / #346468 / #2c5c58 / #3a7c62 / #4a5890 / #2c5a6e |
| 花 | flowerYellow / Red / Purple | #ffd23c / #f4583c / #c47ade | … | … |
| 人 | skin* / cloth* / straw / ball | 见 palette.ts | | |
| 天 | SKY | #5fb0e8 → #a8dcf0（4 档色带） | | |

明暗目标（`node docs/lab/2026-11-07-3d-pixel/tools/stats.mjs '[["x","<png>",4]]'`，竖屏截图 px=4、横屏 px=2）：饱和度 ≥ 0.42、强边缘密度 ≤ 0.055、亮度直方图两个峰（亮沙/球场 ≈ 第 5、7 档，崖壁/投影 ≈ 第 2～4 档）。参考图：0.47 / 0.045。

## 组装以后（2026-11-07 第二轮）

- 场景模块：`terrain.ts`（地形）、`ground.ts`（中间层地面细节：手摆的草团/小花/碎石簇 + 几块深沙斑 + 球场裂缝里的草）、`fx.ts`（阵风、贴地沙线、风滚草、尘团、风把沙吹回球场）、`life.ts`（四幕轮播 ≈ 3 分钟：对打 + 分间扫沙 → 教练喂多球 → 总监推捡球器捡球、倒回球车 → 教练吹沙；`?scene=rally|drill|pick|blow` 只演一幕。击球按"拍面到达击球点的时刻 = 球到的时刻"倒推挥拍，球不停顿）。
- `court.userData.sand`：`at / sweep / blow(x, z, dirX, dirZ, length, width, amount) / deposit / dirtiest(min, near?) / homes / total / flush`。`blow` = 吹叶机：锥里吹走、六成堆到锥尖前面（推出场边就没了）。`deposit` 每格不超过初始沙丘厚度 + 2 厘米（沙只往原来的沙丘上堆）。
- 人物：`userData.pose(name, phase)`（idle/walk/ready/forehand/backhand/serve/sweep），给 phase = 固定帧；不给 = 自动播放。正面朝 +z，右手在 −x。
- URL：`life=0`、`fx=0`、`detail=0`、`clouds=0`（关云影；云是 `fx.ts` 的 `CLOUDS`，沿 +x 每秒 0.12 米飘）、`sunel`/`sunaz`（默认 50° / 偏东 22°）、`dstr`（描边压暗，默认 0.48）。
- 钩子：`window.__d3v2 = { step(秒), life.state, fx, setSun, setHour }`；序列截图：`node docs/lab/2026-11-07-3d-pixel/tools/v2-seq.mjs "<url>&pause=1" <前缀> 19,20,24,28`。
- 材质规范 v2（2026-11-08）：地形（沙、崖壁、步道、台阶、水、泡沫）、球场漆面和积沙、地上的沙斑都换成了元素材质（见文件开头那一节）；崖壁不再用岩层贴图（`strataTexture` 删了），`wallGeo` 多了第 6 个参数（露出高度 → `aElem`）；水面是一块带距离属性的格子（`waterGeo`）；积沙 alphaTex 的 b 通道 = 背风脚的暗边。第二轮（core2）：云影换成手摆的硬边云（`SharedUniforms` 的 `uCloudTex/uCloudScale` 换成 `uClouds`），晒白块改成硬边两色（`courtWorn/courtLip` 删了，加 `courtBleachCore`），崖壁石块每块一个深浅，投影里的沙纹更密、对比更大。
- 组装时改过的资产：`court`（裂缝改成"缝 + 下沿亮边"、剥落只留一块、加水泥路缘、沙 API 加 deposit/dirtiest/homes）；调色板加 `courtCrack / surroundCrack / surroundLight / sandPatch / dryTuft / concrete`，`dryGrass` 提亮（风滚草、仙人球、扫帚头在沙上不再消失），`asphalt` 换成浅石板蓝。
