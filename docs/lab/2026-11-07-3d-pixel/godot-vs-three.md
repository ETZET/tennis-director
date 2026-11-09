# Godot 4.7 vs three.js：同一个池塘，画面、工作量、桌面和网页

> **参考图和含参考图的对比图只放本地，不进仓库**（参考图是别人的作品截图）。
> 参考图：`~/workspace/tennis-director-refs/pixel-pond/ref/{summer,spring,autumn,winter}.{jpg,png}`（文中旧路径 `/private/tmp/claude-501/pond/refN.png` 对应这里）。
> 含参考图的对比图（`cmp-*`、`detail-*`、`mat-*`、`fix2-*`、`godot-cmp-*`、`godot-renderer-*`、部分 `desert-b-*` 等，文中引用的 `shots/…` 找不到时就在这里）：`~/workspace/tennis-director-refs/pixel-pond/shots/`。
> 提交前跑 `node docs/lab/2026-11-07-3d-pixel/tools/refcheck.mjs docs/lab/2026-11-07-3d-pixel/shots`，标 REF? 的图不要提交。


2026-11-08 · Godot 版在 `experiments/godot-pond/`（怎么打开见那里的 README）。three.js 版是 `apps/sandbox/pond3d.html`（`src/pond3d/`）。
参考图的作者说原图是 Godot 做的，所以问题是：**这种画风，Godot 比 three.js 多给了什么？** 下面是做完以后量出来的答案。

## 一句话结论

**画面上没有多给。** 这个画风的"像"全在手写的东西里：每种材质手挑的三档调色板、按纹素取的元素纹理、阈值化的阴影加毛边、按方向分的一纹素描边。这些移到 Godot 是一比一的（同一份几何体，Forward+ 和 three.js 只有 1.7% 的像素不同，差别都在阴影毛边和倒影的一纹素偏移上）。
Godot 真正省事的是几个管线部件（深度/法线缓冲白给、阴影软化预设、风摆自动进阴影、低分辨率放大一行代码），但**省事的部分大多只在 Forward+（桌面）里**；网页只能用 Compatibility（WebGL 2），那里又回到和 three.js 一样的做法，还多了 12 MB 下载、约 10 秒的冷启动（three.js 约 1.4 秒）和横屏下 4～5 倍的每帧主线程开销。
**建议：我们的手机网页游戏继续用 three.js / 现在的管线。** 就算放弃网页，Godot 桌面版的画面也不会更好（见「桌面端 vs 网页端」）。

## 怎么比的（为什么公平）

1. three.js 版的整个场景（94 个网格、50 个材质）用浏览器导出（`experiments/godot-pond/tools/export-scene.mjs`：Playwright 打开 pond3d.html，遍历 `scene`，把世界矩阵、位置/法线/uv/`aSway`/`aPad`、材质的 defines 和 uniform 存成 json + bin）。没用 GLTFExporter：它把自定义属性写成 `_ASWAY`/`_APAD`，Godot 的 glTF 导入不认；ShaderMaterial 也只剩 extras。
2. 画面全在 Godot 里重写：`shaders/ramp.gdshaderinc`（色阶材质，three 版 `ramp.ts` 的移植）、`water.gdshader`、`post.gdshader`（描边/天气/调色），`scripts/main.gd`（视口、相机、反射、按键、截图、测帧）。
3. 每一帧都对着参考图和 three.js 同一帧比：整帧差异（像素差 > 3 的占比）、`stats.mjs`（降到纹素：饱和度、边缘密度、强边缘）、`lum.mjs` 分区明暗、裁切放大并排。
4. `--tune=0` = 和 three.js 版逐像素对齐的"原样"；默认是对着参考图又调过 6 轮的版本（只在 Godot 版里）。

## 结果

### 和 three.js 对齐程度（同一份几何体，`--tune=0`）

| 对比（1280×720） | 像素差 > 3 | 差 > 40 | 主要在哪 |
|---|---|---|---|
| Godot Forward+ vs three.js（夏） | 1.70% | 0.91% | 阴影边缘的毛边（两边阴影贴图的采样位置不同，取阈值后差一两个纹素）、芦苇倒影差一纹素、台阶磨亮条的位置（`floor` 正好落在级界上） |
| Godot Compatibility vs three.js（夏） | 2.47% | 1.38% | 上面那些 + 树冠里零星的暗点、团与团之间的凸边白线少 |
| Forward+ vs three.js（冬 / 秋） | 0.89% / 1.76% | 0.63% / 0.71% | 同上 |
| Godot 网页版（Chromium，WebGL 2）vs 桌面 Compatibility | **0.00%** | 0.00% | 完全一样 |
| Forward+ vs Compatibility（夏，调过的） | 1.15% | 0.81% | 见「桌面端 vs 网页端」 |

### 对着参考图的统计（`stats.mjs`，降到纹素）

| | 饱和度 | 边缘密度 | 强边缘 | 平均亮度 |
|---|---|---|---|---|
| 参考图（夏） | 0.47 | 0.192 | 0.044 | 137 |
| three.js | 0.48 | 0.173 | 0.037 | 138 |
| Godot Forward+（原样，tune=0） | 0.48 | 0.173 | 0.035 | 137 |
| Godot Forward+（调过） | 0.48 | 0.175 | 0.033 | 138 |
| Godot Compatibility（调过） | 0.48 | 0.173 | 0.034 | 138 |
| 参考图（冬） | 0.22 | 0.165 | 0.059 | 183 |
| three.js | 0.23 | 0.126 | 0.038 | 183 |
| Godot Forward+ / Compatibility（调过） | 0.24 / 0.25 | 0.123 / 0.121 | 0.037 / 0.037 | 181 / 181 |
| 参考图（秋） | 0.44 | 0.218 | 0.036 | 117 |
| three.js | 0.50 | 0.206 | 0.030 | 120 |
| Godot Forward+ / Compatibility | 0.50 / 0.50 | 0.206 / 0.205 | 0.028 / 0.029 | 120 / 120 |

分区明暗（`lum.mjs`，均值 · 暗/中/亮 %，夏）：

| 区域 | 参考 | three.js | Godot 调过（F+ / Compat 相同） |
|---|---|---|---|
| 水面（330,260,820,330） | 131 · 28/65/8 | 129 · 46/48/7 | **130 · 28/65/6** |
| 阴影里的石板路（130,380,120,130） | 98 · 85/13/2 | 89 · 96/3/1 | 92 · 97/2/1 |
| 左边云影（0,290,300,270） | 130 · 50/24/26 | 126 · 55/21/24 | 127 · 55/21/24 |
| 北（560,40,600,160） | 131 · 40/32/28 | 136 · 28/43/29 | 134 · 32/39/28 |
| 树（1095,120,135,110） | 149 · 31/31/38 | 171 · 21/30/49 | 169 · 24/28/49 |
| 冬天亮度直方图第 8/9 档（雪） | 39% / 10% | 2% / 48% | **45% / 5%** |

### 对着参考图迭代（6 轮，都在 Godot 版里；参数在 `scripts/main.gd` 的 `TUNE`）

| 轮 | 改什么 | 量出来 | 用到 Godot 特有的东西了吗 |
|---|---|---|---|
| 1 阴影 | 试 Godot 的阴影参数：normal bias 0 / 0.3 / 1.0、软阴影质量 Ultra + blur 2.5、PCSS（光源角直径 0.5°） | 取阈值以后几乎看不出差别；normal bias < 0.5 时树冠里出一片片暗麻点（自阴影痤疮）。保留 bias 0.03、normal bias 1.0、blur 1.5、质量 Medium。树的明暗（169 vs 参考 149）差在形状：参考图树冠是一层层"垫子"、下沿有一条条横向暗带，不是阴影参数能给的 | 是，但**没带来收益** |
| 2 水面 | 斑块阈值下移、斑块更碎、零星深色小块 | 底色占比 51% → 15%（参考 8%），水面框暗/中/亮 46/48/7 → 28/65/6（参考 28/65/8） | 否（shader 参数） |
| 3 石板路 | 石块 8.5×6 → 12×8 纹素、缝更细、阴影档本色提亮到参考图的 #4c4c94 | 阴影里路缝占比 21% → 11%（参考 5%），均值 89 → 92（参考 98） | 否 |
| 4 阴影草地 | 草叶密度 1～30% → 14～42%，两种草叶色都只比底色差 ±5～10 亮度（参考图那种"又密又淡"） | 见 `godot-cmp-path.png` 左半 | 否 |
| 5 云影里的灌木 | 进云影只降一档（不是直接换暗档） | 云影里的灌木留着亮顶和草须，像参考图 | 否 |
| 6 冬天的雪 | 亮雪 #e0e6f1 → 参考图众数 #dce4f4，雪地上零星灰块 | 亮度直方图第 8/9 档 2/48 → 45/5（参考 39/10） | 否 |

**这一节的结论**：对着参考图能改进的地方，没有一处需要 Godot 的功能；同样的改动放进 three.js 版效果一样。剩下的差距（参考图的树是一层层的、北边是好几级小台地、东北岸描得偏北）是几何和布局，和引擎无关。

## Godot 真正好用的地方（哪些功能省了事、哪些让画面更好）

1. **深度 + 法线缓冲白给（Forward+）。** `hint_depth_texture` + `hint_normal_roughness_texture` 直接在后期四边形里读；材质的描边强度写进 `ROUGHNESS` 就进了缓冲。three.js 版要把整个场景再画一遍法线 pass（换材质、关阴影更新），Godot Forward+ 省了这一遍：draw call 198 vs three.js 293（三个 pass 合计）。**但只有 Forward+ 有**（4.7 文档：「Normal-roughness texture is only supported in the Forward+ rendering method, not Mobile or Compatibility」），手机原生（Mobile 渲染器）和网页都没有。
2. **`light()` 钩子 + `ATTENUATION`。** 自定义光照不用拼 three 的 shader chunk（`lights_pars_begin`、`shadowmap_pars_*`、`lights: true` 那一套），阴影直接是一个数，PCF 已经做好。
3. **风摆自动进阴影。** Godot 的阴影 pass 跑同一个 `vertex()`，改 `VERTEX` 影子就跟着摆；three.js 要单独配一个 `customDepthMaterial` 改顶点。
4. **阴影的软化是现成的设置**：软阴影质量 6 档、`shadow_blur`、PCSS（`light_angular_distance`）、阴影图 4096。three.js 的 `PCFShadowMap + radius 4` 取阈值以后效果一样（第 1 轮），所以对这个画风"质量更高"体现不出来。
5. **低分辨率 + 最近邻放大**：`SubViewportContainer`（`stretch_shrink = 2`、`TEXTURE_FILTER_NEAREST`）几行代码；three.js 版写了一个合成 pass。纹素对齐和亚纹素偏移两边一样要自己算。
6. **桌面性能**：Forward+ 在 M4 上 1.6～1.75 ms/帧（642×362 内部分辨率，关垂直同步）。
7. **编辑器**（这次是 AI 在命令行里做的，没用上）：ShaderMaterial 的 uniform 能在检查器里拖滑块实时看，人调色会比改 URL 参数快。

没用上 / 用不上的：**SSAO / SSIL / SDFGI / SSR / 体积雾**——这个画风关了环境光（手挑调色板，环境光会把暗档往灰里拉），AO 只作用于环境光，GI 和反射也一样；**MultiMesh**——2.4 万三角形、几何体已按材质合并，没有瓶颈；**后期辉光、色调映射**——调色板是多少输出就是多少，用的是 Linear 色调映射 + 手动 sRGB 换算。

## 不比 three.js 好、或者更差的地方

1. **网页只能用 Compatibility（WebGL 2）。** 来源：Godot 4.7 文档《Exporting for the Web》：「Godot 4 can only target WebGL 2.0 (using the Compatibility rendering method)」「Forward+/Mobile are not supported on the web platform」「Godot currently does not support WebGPU」。4.7.2 的导出模板里也只有 `web_*` 的 WebGL 版。上面第 1 条的好处在网页上全没了：法线缓冲要像 three.js 一样多画一遍（复制一套网格、换只输出法线的材质，draw call 292，和 three.js 293 一样）。
2. **两个渲染器的颜色空间不一样**，要写两套代码（`noise.gdshaderinc` 的 `unshaded_out / screen_in`）：Forward+ 的 3D 缓冲是线性的，不打光材质要给线性值、`hint_screen_texture` 读到线性值、SubViewport 的贴图读到 sRGB 原值；Compatibility 里打光材质在 shader 末尾就转 sRGB、不打光材质原样写、采样都读原值。这些文档里没写，是用调试视图一个个量出来的（花了约 45 分钟）。
3. **只能在本片元查阴影。** three.js 可以在任意世界坐标采阴影贴图（墙顶草沿用"台面上那一点"的阴影），Godot 只有本片元的 `ATTENUATION`；草沿改成用本片元的阴影近似。而且档位要在 `fragment()` 里定、阴影在 `light()` 里才知道，所以每个片元要把"受光"和"影子"两套颜色都算一遍（varying 传给 `light()`），复杂材质的片元开销翻倍。
4. **下载和冷启动**（网页，单线程版）：wasm 39.5 MB（gzip 10.2 MB，brotli 7.1 MB）+ pck 7.9 MB（gzip 1.7 MB，里面 7.5 MB 是四个季节的几何体）= **gzip 后 12.0 MB**；three.js 版整个打包 616 KB（gzip 169 KB），几何体运行时生成。本机（M4、本地服务器、无网络延迟、每次新开浏览器）冷启动到第一帧画出来 **5.6～13.3 秒，中位数 10.5 秒**（6 次），其中最后 2.5～3.7 秒是第一帧编译所有 shader 变体（50 个材质 × 主 pass/法线 pass，每个 `#define` 组合一个 shader）；three.js（vite 开发服务器、未打包的 6.45 MB）第一帧画完 **1.1～2.4 秒，中位数 1.4 秒**，含 three 自己编译 shader。桌面原生程序也不快：从进程启动到第一帧 Forward+ 2.4～4.0 秒、Compatibility 10.3～11.6 秒（其中约 6 秒是 GL 驱动编译 shader）。把 define 变体合成一个用 uniform 分支的大 shader 应该能省掉大部分编译时间，没试。导出要先装导出模板：官方 4.7.2 的 tpz 是 1.28 GB（所有平台），网页实际只用其中 10 MB 的 `web_nothreads_release.zip`；导出本身 4 秒。
5. **每帧开销（网页）**：同一个 Chromium（ANGLE-Metal、关垂直同步），1280×720 下 Godot 每帧主线程 **6.7～8 ms**（中位数，p95 16～28 ms，不锁帧 68～118 fps），three.js **1.5～1.7 ms**（390～480 fps）；竖屏 390×844（dpr 3）Godot 2.2～2.6 ms、three.js 1.7～1.9 ms。手机 CPU 慢 3～5 倍，横屏的 Godot 在手机上很可能掉到 60 fps 以下。
6. **AI 写 Godot 的摩擦**（这次实际遇到的）：
   - 无头模式没有渲染器，截图只能开窗口（会弹到桌面上），每张约 5～6 秒（启动 + 30 帧）；脚本一报错窗口就挂着不退，要自己写看门狗（`tools/shot.sh`）。
   - GDScript 2 的类型推断：`var kv := a.split(...)` 这类在 `:=` 下解析失败，整个脚本不加载。
   - Godot 着色语言没有可写的全局变量（后期 shader 第一版就是这么写的），函数里不能直接用内建量（要当参数传）。
   - 网上和旧文档的 normal_roughness 解码（`× 127/255` + 动态物体位）在 4.7 已经不对了，照着解，描边强度大一倍（第一版和 three.js 差 3.7%，修好后 1.7%）。
   - 正面是顺时针（three 是逆时针，导入要翻三角形）；`FRAGCOORD` y 朝下、`dFdy` 方向和 WebGL 相反。
   - 场景全用 GDScript 代码建（没手写 .tscn），绕开了 .tscn 的格式问题，代价是用不上编辑器的场景编辑。
7. **和我们现有代码的关系**：sim 是 TypeScript 纯函数状态机、界面是 Preact。换 Godot 要么把 UI 和 sim 改写成 GDScript，要么网页上用 `JavaScriptBridge` 两边传消息；Godot 4 的 C# 不能导出网页（文档原话：「Projects written in C# using Godot 4 currently cannot be exported to the web」）。
8. **迭代速度**：命令行"改 shader → 截图 → 量"一轮，Godot 5～6 秒，three.js（Playwright 截图）约 5 秒，差不多。导出网页 4 秒。

## 桌面端 vs 网页端

### 功能表（这个场景用到的）

| 功能 | Godot Forward+（桌面） | Godot Compatibility（网页 / 也能在桌面跑） | three.js（WebGL 2） |
|---|---|---|---|
| 自定义光照 `light()` + 阴影衰减 | 有 | 有 | 自己写 ShaderMaterial + 阴影 chunk |
| 阴影软化 | 6 档质量 + blur + PCSS | PCF（取阈值后树冠里多出零星暗点） | PCF radius / PCFSoft / VSM |
| 任意位置采阴影 | 没有 | 没有 | 有 |
| 风摆进阴影 | 自动 | 自动 | 要配 customDepthMaterial |
| 深度缓冲给后期用 | `hint_depth_texture` | `hint_depth_texture`（4.7 能用，NDC z 是 [-1,1]） | 渲染目标的 DepthTexture |
| 法线缓冲 | `hint_normal_roughness_texture`（白给，粗糙度通道放描边强度） | **没有** → 复制一套网格画法线 pass（8 位八面体编码） | 没有 → 换材质再画一遍 |
| 平面反射 | 第二个 SubViewport + 镜像相机（手写） | 同左 | 镜像相机 + 渲染目标（手写） |
| 低分辨率放大 | SubViewportContainer | 同左 | 自己写合成 pass |
| SSAO/SSIL/SDFGI/SSR | 有（这个画风用不上） | 没有 | 没有 |
| 颜色空间 | 线性 3D 缓冲，手动 sRGB 换算 | 不打光的输出不转换，另一套代码 | 关掉颜色管理，调色板原值进出 |
| draw call（这个场景） | 198 | 292 | 293 |
| 帧时间（M4） | 1.6～1.75 ms（桌面，关垂直同步） | 桌面 3.2～4.1 ms；网页主线程 6.7～8 ms（横屏）、2.2～2.6 ms（竖屏） | 网页主线程 1.5～1.7 ms（横屏）、1.7～1.9 ms（竖屏） |
| 显存 / 内存 | 显存 102 MB | 桌面显存 24 MB；网页 wasm 堆 46 MB + JS 堆 18～40 MB | JS 堆 20～40 MB |
| 下载 | —（macOS 导出模板 124 MB） | gzip 12.0 MB（解压后 47.8 MB；brotli ≈ 7.5 MB） | gzip 169 KB（打包后 616 KB） |
| 冷启动到第一帧（本机） | 原生程序 2.4～4.0 秒 | 网页 5.6～13.3 秒（中位数 10.5）；桌面 10.3～11.6 秒 | 网页 1.1～2.4 秒（中位数 1.4，开发服务器） |

### 实际看到的画面差别

- `godot-renderer-full.png`（参考 | Forward+ | Compatibility | three.js，半尺寸）：整帧几乎一样，只有 1.15% 的像素不同。
- `godot-renderer-trees.png`：Compatibility 的树冠里多了一些单个的暗点（多半是 Compatibility 的阴影 PCF 和 Forward+ 不同，取阈值时值在门槛附近抖；调 bias 没用），团与团之间的凸边白线比 Forward+ 少（可能是法线 pass 用 8 位八面体编码，精度比 normal_roughness 缓冲低，凸边判据过不了门槛）。
- `godot-renderer-shadows.png`、`godot-renderer-water.png`：阴影形状、毛边、水面、倒影看不出差别。
- `godot-renderer-outlines.png`：上沿提亮、下沿压暗都在；Compatibility 的灌木轮廓和 Forward+ 一样。
- 网页版（`godot-web-land.png`）和桌面 Compatibility 逐像素相同。竖屏手机模拟（`godot-web-port.png`，左 Godot 网页、右 three.js）画面一样，只是 Godot 的取景往上偏了约 25 纹素（桌面版竖屏 `--w=390 --h=844` 和 three.js 对得上，网页上的原因没追）。

### iOS Safari（文档）

单线程导出「works very well on macOS and iOS too」，所以不需要 COOP/COEP 头（`tools/serve.mjs` 还是带上了，以后开线程版要用）；但文档也说 Safari 的 WebGL 2 有其他浏览器没有的问题，推荐 Chromium 或 Firefox；原生 Android / iOS 导出「will always perform better by a significant margin」；手机 CPU/GPU 有限、WebAssembly 还有额外开销。我们的目标是手机网页（大量 iPhone Safari 用户），这几条正好都是短板。

### 建议

- **继续做手机网页：用 three.js（或现在的 @td/iso），不换 Godot。** Godot 网页版的画面和 three.js 一模一样（都是同一套手写 shader），但下载大 70 倍、冷启动慢约 7 倍（中位数 10.5 秒 vs 1.4 秒）、每帧主线程贵 1.3～5 倍，Safari 还是它文档里点名的弱项。
- **"桌面版好很多所以放弃网页"不成立。** Forward+ 和 Compatibility 的画面只差 1.15% 的像素（树冠里的暗点、少几条凸边白线）；Forward+ 多出来的是开发上的方便（法线缓冲、阴影预设），不是玩家看得出的画面。真要放弃网页，理由应该是"想要 Godot 的编辑器和原生发布流程"，而那意味着把 Preact 界面和 TS 的 sim 都搬过去——这是另一个量级的决定。
- 值得从这次搬回 three.js 版的：第 2～6 轮的参数（水面、石板路、阴影草地、云影里的灌木、冬天的雪），在 three.js 里改效果一样。

## 截图（`shots/`）

- 整帧：`godot-summer.png`、`godot-winter.png`、`godot-autumn.png`（Forward+，调过）、`godot-compat-summer.png`（Compatibility）、`godot-web-land.png`（网页，Chromium 1280×720）、`godot-web-port.png`（网页竖屏 390×844 dpr 3：左 Godot、右 three.js）
- **参考 | Godot（Forward+，调过）| three.js**：`godot-cmp-full.png`（夏，半尺寸，上下排）、`godot-cmp-full-winter.png`（冬）、`godot-cmp-trees.png`（树，2×）、`godot-cmp-water.png`（水面，2×）、`godot-cmp-path.png`（阴影里的路和草地，3×）、`godot-cmp-house.png`（房子，2×）、`godot-cmp-cliff.png`（池壁，3×）、`godot-cmp-lily.png`（睡莲，3×）、`godot-cmp-bush.png`（灌木，3×）。宽的物件上下排。
- **参考 | Godot Forward+ | Godot Compatibility | three.js**：`godot-renderer-full.png`（2×2，半尺寸）、`godot-renderer-shadows.png`（树影和台地，3×）、`godot-renderer-outlines.png`（描边，4×）、`godot-renderer-water.png`（水面和倒影，2×）、`godot-renderer-trees.png`（树冠，3×）

## 复现

```
# Godot 截图（两个渲染器）
experiments/godot-pond/tools/shot.sh /tmp/f.png forward_plus --season=summer
experiments/godot-pond/tools/shot.sh /tmp/c.png gl_compatibility --season=summer
# 桌面帧时间
godot --path experiments/godot-pond --rendering-method forward_plus -- --bench=900
# 网页：导出、起服务器、测
godot --headless --path experiments/godot-pond --export-release "Web" build/web/index.html
node experiments/godot-pond/tools/serve.mjs 8060
REPS=2 node experiments/godot-pond/tools/web-measure.mjs /tmp/web both
```
