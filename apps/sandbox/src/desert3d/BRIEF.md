# Desert 3D 像素画实验 · 子代理共同说明

## 新材质怎么用（2026-11-07 起，配方见 docs/lab/2026-11-07-3d-pixel/lessons.md）

核心改了：`w.mats.toon(color, opts)` 现在是**色阶材质**（仍是 MeshToonMaterial，贴图/顶点色/实例色/蒙皮/alphaMap/透明/onBeforeCompile 都照旧），
光照只分三档：亮 / 中 / 暗。投影（PCF 取阈值，边缘有竖向"毛"）直接压到暗档，云影把亮档往中档混。没有环境光、半球光。
颜色管理已关（`colors.ts`）：`Color(0xd8b47a)` 就是屏幕上的 #d8b47a，sRGB 贴图也按原值用。
相机默认：yaw 0、俯角 45°、每纹素 2 CSS 像素、0.1 米/纹素（球场长轴竖着，竖屏一屏看全）。太阳在画面后方（-z）、仰角约 35°：**朝镜头的面都是暗档，影子落向镜头**。

- **只给一个颜色**（旧调用）：中、暗两档自动推（色相往靛蓝转：暖色经品红 → 沙子的影子是偏紫的赭色；绿色经青 → 青绿）。能用，但**重画时请给 `ramp`**。
- **`ramp: [亮, 中, 暗]`**：手挑三档，是最重要的一步。暗档不要是亮档变暗，要换色相（冷、偏紫/靛/青），饱和度别掉太多。给了 ramp 后 `color` 当白色；贴图/顶点色/实例色仍乘在上面，所以用 ramp 时顶点色请用接近白的明暗变化（0.85～1.0）。
- `bands: [暗|中, 中|亮]`：阈值，`l = dot(N, 光)`，默认 `[0.1, 0.5]`。平地顶面 ≈ 0.57（亮档），朝南（镜头）的竖直面 < 0（暗档）。
- `edge`（默认 0.6）：描边强度。深度轮廓：侧边/下沿压暗偏靛；**上沿提亮只给 edge > 0.2 的物件**。`convex`（默认 0.5）：法线凸边的白线强度。
- `sphereNormals: true | [x,y,z]`：法线 = 从这个本地点指向顶点（单团的实例化灌木/石头用）。合并的多团树冠用 `blobNormals(geo, center)`（`toon.ts` 导出）对**每一团**单独改法线再合并。
- `lightUp`（0..1）：明暗用的光往正上方偏，树冠 0.4（否则朝镜头一面全黑）；影子仍按真太阳。
- `noise`：档位交界噪声，树冠 0.3～0.4 → 竖向叶子笔触。
- `noShadowReceive`：不接收投影（浮在空中、很薄的东西）。
- A/B 开关（URL）：`light=flat`（暗档只变暗，看对比）、`fur=0`、`shadow=soft`、`noisek=0`、`edgemode=uniform`、`dstr/nstr/tstr`、`smap/srad`、`clouds=0`。

**推荐调色板 `[亮, 中, 暗]`**（暗档统一偏冷）：
| 材质 | ramp |
|---|---|
| 浅沙 | `0xdcb880, 0xc49a6c, 0x8a6f78` |
| 深沙/土 | `0xc99a5e, 0xa47a58, 0x6e5468` |
| 红岩 | `0xb07a58, 0x8a5a4a, 0x5a4058` |
| 灰紫石 | `0xaea0a2, 0x7e7088, 0x4e4868` |
| 硬地蓝 | `0x5f8fb0, 0x4a7096, 0x34466e`（褪色 `0x8aa6b8, 0x6e88a0, 0x4e5a7a`） |
| 外场绿 | `0x6f9a72, 0x557a62, 0x3a5258` |
| 鼠尾草绿 | `0x9aa86a, 0x6f8a5a, 0x46605a` |
| 棕榈/嫩绿 | `0x8fa840, 0x5f7f3a, 0x3a5848` |
| 黄花 | `0xf0c840, 0xd09a38, 0x8a6a50` |
| 锈铁 | `0xb0623a, 0x8a4a34, 0x5a3440` |
| 木头 | `0xc08a58, 0x9a6a48, 0x64485a` |
| 深绿挡风布 | `0x4f7060, 0x3a5450, 0x2a3a48` |
| 白线/白漆 | `0xe8e0d0, 0xc0b8b8, 0x8a8498` |

**edge / convex 建议**：地面、沙地、球场铺面 `0.05 / 0`；岛的崖壁 `0.3 / 0.2`；石头 `0.8 / 1`；木头、金属道具 `0.6 / 0.6`；植物 `0.4 / 0.2`；人 `0.7 / 0.4`；细杆、围网 `0.4 / 0`。

**树冠/灌木**：几大团球（中心一大团 + 一圈 3～4 团 + 顶上 1～2 团），每团球面法线，`lightUp 0.4`、`noise 0.35`、`bands [0.02, 0.5]`。别用面法线的二十面体（会像低多边形）。不需要叶片卡片。

**地面细节要克制**：亮的地面以纯色为主，斑点、草叶、碎石只在少数地方成片出现；满地撒小点在 0.1 米/纹素下就是噪点（现在的铺面积沙和地面贴图都偏"噪"）。


## 目标
在 three.js 里做一个 **t3ssel8r 风格的 3D 像素画** 场景（参考《星露谷》式的钓鱼池截图那种画面）：一块浮空沙漠地台上有一座 **荒废、破损、积沙的硬地网球场**，风沙在吹，长满 Indian Wells（加州 Coachella Valley 低地沙漠）原生植物。有人来来去去打网球，**总监在分与分之间扫场地上的沙**。手机竖屏（390×844）优先。

页面：`apps/sandbox/desert3d.html`，开发服务器已在跑：`http://localhost:5190/desert3d.html`（Vite 热更新，不要再起服务器；如果它挂了，用 `cd apps/sandbox && npx vite --port 5190 --strictPort` 起一个）。

## 管线（已写好，不要改）
- `pipeline.ts`：正交相机，对齐纹素网格；先渲到低分辨率（每个纹素 = 2 个 CSS 像素，`?px=`）；再单独渲一遍法线 + 深度，做一像素宽的描边：深度突变处压暗（物体自己颜色暗一档），凸边提亮。最后合成、最近邻放大。
- `toon.ts`：`w.mats.toon(color, { sway, swayH, ... })` 是卡通材质：三档色阶、只压太阳光的云影、顶点风摆（`sway` 米，在本地 y = `swayH` 处达到，往下按平方衰减；描边法线和投影跟着一起摆）。**所有实体都用它**，这样光照风格一致。同参数自动复用。每个部件 build 完调用 `w.mats.prepare(root)`。
- 镂空卡片（草片、叶片、粒子）放到 `w.layers.FX` 图层（`obj.layers.set(w.layers.FX)`）：不参与描边。
- `world.ts`：契约（`World`、`Dirt`、`Fx`、`Play`）。`layout.ts`：尺寸常量（球场中心在原点，长轴沿 z，单位米；地台 x∈[-17,17]，z∈[-27,27]，顶面 y=0）。
- `main.ts`：启动、灯光（太阳 + 半球光）、固定步长循环、拖动平移/缩放。URL 参数：`zoom`（米/纹素，默认 0.2，近看用 0.08～0.12）、`tx`/`tz`（看向哪）、`yaw`/`pitch`（度）、`hour`、`wind`（0..1）、`warm`（启动先快进几秒）、`pause=1`、`edges=1`（只看描边）、`seed`。
- 测试钩子：`window.__d3 = { world, pipe, step(seconds), setHour(h) }`。

**只改你被分配的文件**（可以在 `parts/<你的名字>/` 下新建子模块）。不要改 `pipeline.ts`、`toon.ts`、`world.ts`、`main.ts`、`layout.ts`、别人的部件文件。如果契约需要改，写在最终报告里，由主代理来改。不要 git commit。

## 部件接口
```ts
export const build: Build = (w: World) => { /* 建网格加到 w.scene */ return { update(dt, t) {} }; };
```
部件 build 顺序：island, court, structures, plants, fx, people。`w.dirt` 由 court 设置，`w.fx` 由 fx 设置；**在 update 里再用别人的服务**（build 时可能还没齐），并且容错（`w.dirt?.sweep(...)`）。

## 美术方向（t3ssel8r 3D pixel art）
- 关键：低分辨率 + 正交 + 纹素对齐 + 卡通三档光 + 一像素描边/凸边高光 + 云影 + 风。
- **造型要"胖"、圆、可读**：在 0.2 米/纹素下，一个人约 9 纹素高。小于 1 纹素的细节看不见，会闪。细杆、细线至少 0.15～0.2 米粗，或者干脆不画。
- 植物和树冠：一团团圆的低多边形（Icosahedron detail 0/1 + 随机顶点扰动），t3ssel8r 的树冠是一簇簇叶团，亮面、中间调、暗面三档分得很清楚。
- 颜色：饱和度适中，阴影偏冷（半球光负责），亮面偏暖。沙漠调色：沙 #d8b47a / #c99a5e，岩石 #9a6a4a / #7a4e3a，干草 #c8b06a，鼠尾草绿 #7f8f5a，棕榈绿 #6f8a3a，硬地蓝 #4f7fa0（褪色 #7f9fb0）、外场绿 #5f8a6a（褪色）。
- 细节密度要接近参考截图：地面上有碎石、小草丛、裂缝、杂色斑块，不能有大片光秃秃的平面。
- 演出里的随机用 `w.rng('<你的名字>:<用途>')`，不要用 `Math.random`。

## 性能预算（手机）
整个场景 draw call 尽量 < 300，三角形 < 15 万。重复的东西用 `InstancedMesh` 或合并几何体（`BufferGeometryUtils.mergeGeometries`，从 `three/examples/jsm/utils/BufferGeometryUtils.js` 引用）。

## 自检
- 类型检查：`cd apps/sandbox && npx tsc -p tsconfig.json --noEmit 2>&1 | grep desert3d`
- 截图（390×844，dpr 2）：
  `SHOT_OUT=<你的 scratch 路径>.png node docs/lab/2026-11-04-playability/tools/shot.mjs "http://localhost:5190/desert3d.html?warm=3&zoom=0.1&tx=..&tz=.." 3000`
  然后用 Read 工具看图。全景看一张，自己负责的部分近看几张（`zoom=0.08`～`0.12`）。会输出页面报错。
- 其他代理在同时改别的部件，你的截图里可能出现他们半成品的东西，正常。
- 截图存到 `/private/tmp/claude-501/desert3d/<你的名字>-*.png`。

## 最终报告（简短）
做了什么、哪些文件、性能（大概的网格数/实例数）、已知问题、对契约或管线的建议、最好的 1～2 张截图路径。
