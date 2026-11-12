# clubwalk：所有场景连成一个大世界（试验中）

2026-11-09 · 页面 `apps/sandbox/clubwalk.html`（代码 `apps/sandbox/src/clubwalk/`）。用户原话："把建好的场景都连起来，让我的总监可以在里面走来走去。"
这是 [architecture.md](../../design/architecture.md)「接回游戏」里 U-12（一个大场景按区域加载，还是按场景切页面）的一个试验，不是定论：真机性能还没量。

## 做法

- **一个画面管线、一个相机、一个太阳、一个总监。** 相机 yaw 0、俯角 45°、跟着总监（`clubsite/play` 的跟随，捏合 / 滚轮缩放）；
  太阳统一 el 44 / az 8，阴影相机（±34 米，2048）跟着总监走、按阴影纹素对齐（走路时影子边不闪）。像素默认 1×，左上角 1 / 1.5 / 2 / 3。
- **底图一直在。** clubmap2 的整张地图（`clubmap2/build.ts` 的 `buildMap` + `scatter.ts` 的植物、长椅、人；地面、山、天幕、步道、建筑）。
  建好以后按区域的范围在 CPU 上切开（`clip.ts`：三角形裁到矩形里 / 矩形外，所有顶点属性插值）：不归任何区域的一块一直显示，
  每个区域一块，那个区域没显示的时候显示。植物、人按位置归区域。
- **细节场景 = 区域，走近了才建。** `regions.ts` 一行一个：场景模块、地点名、它管的范围（互不重叠的矩形，边落在两边地面一样的缝上）。
  画面范围 + 14 米碰到的区域：没建就建（一帧最多建一个），建过的显示、跑演出、登记互动点；离开 2 秒以后藏起来、停演出、撤互动点（建过的留着）。
  画面 + 6 米以外的区域不画（底图那块补上），演出照跑。总监手里拿着某个区域的东西时，那个区域不藏。
- **区域建好以后裁成自己那块。** 场景模块照常把整块地建出来（含给邻居做背景的部分、地图边的山），clubwalk 再：
  拿掉山（`mtn`，底图有）；地形（`terrain` 组）的网格裁到区域范围里（小于 4 米的按中心算）；中心在范围外的摆件（`slot:*`）先藏起来，
  演出把它挪进范围以后再显示。所以相邻两个区域的地面、围网、墙在缝上是两边各画一半，接得上（同一套世界坐标、同一份 `world.ts`）。
- **导航一张网格。** `clubsite/play` 的 `NavMap`，范围 x −66…120、z −45…78（0.2 米一格）。每个点归哪个区域：建好的区域用它自己的
  walkable + ramps + groundAt（`NavMap(cell 1000)` 当高度判断），没建的和区域外用底图的粗规则（围墙里、门外的车道和停车场、高尔夫能走，
  网球场围网、看台、会所、泳池、东墙挡住）。挡路的形状：每个区域只取中心在自己范围里的。区域建好时只重建它那块的格子（`setBlocked(shapes, rect)`）。
  `stepUp` 0.36（中心球场的端梯），草坪 0.5、广场 1.2 的高差照样挡住。
- **互动点按区域包一层**（`main.ts` 的 `scopePlay`）：id、顶栏、气泡的 key 加区域前缀（各场景的 `water`、`queue` 不打架）；
  区域藏起来时撤掉互动点和常驻气泡、挡路的人不算；顶栏只显示总监所在区域的；提示（toast）只有总监所在区域的才出。
  手里的东西（`play.addItem`）是全局的：拿着广场的扫帚走到红土场也行。
  有的场景开局把工具塞给总监（会员场的吹叶机、中心球场的…）：大世界里区域第一次接进来时把它放回收它的互动点（架子），总监手里原来的还给他。
- **地点名**：总监进一个区域（或底图里的中心球场、青训、球员草坪……）时，上方淡出一个中文地点名。右上角小地图：区域（深 = 显示中）、画面框、总监。
- **会所**：总监走进会所的体块就切成剖面（`clubhouse` 的 `setInside`），出门切回外观。会所南门 ↔ 泳池北门的小路是连着的。
  2026-11-10 会所三层（B1 / 1F / 2F）：区域的导航带 `surface`（每层一张，楼梯段在里面），oracle 用它；总监在会所里按脚下高度（`clubhouse/nav.ts` 的 `floorFor`）换层 → `setFloor` → 只重建会所那块世界网格（≈ 80 毫秒）；钟楼里的电梯是区域登记的互动点。

## 区域表（`src/clubwalk/regions.ts`）

| 区域 | 地点名 | 范围（世界米） | 场景状态 |
| --- | --- | --- | --- |
| `clubpark` | 停车场 · 到达 | x 61…140、z −45…45（东墙外） | stage 3 |
| `clubdesk` | 露天前台 | x 52…61、z −8.6…34 | stage 3 |
| `clubpickle` | 匹克球场 | x 33.6…52、z −8.6…16.6；x 36…52、z 16.6…34（草坪西半） | stage 3 |
| `clubplaza` | 棕榈喷泉广场 | x 31…61、z −44…−8.6 | stage 3 |
| `clubstadium` | 中心球场 | x −21.4…31、z −44…−8.6；x −22.6…−21.4、z −30…−8.6；长廊 x −21.4…33.6、z −8.6…−4.4 | stage 3 |
| `clubcourts` | 会员场 · 青训 | x −38.5…27、z −4.4…16.6；x −38.5…−1、z 16.6…47 | stage 3 |
| `clubclay` | 红土场 | x −1…36、z 16.6…53 | stage 3 |
| `clubfood` | 餐车院子 | FOOD_COURT（z > −30 东沿 −22.6）+ ARCADE_YARD | stage 3 |
| `clubhouse` | 会所 | x −64.5…−46、z −44…−1；x −46…−40、z −44…−27 | 白模（外观 / 剖面） |
| `clubpool` | 泳池 | x −64.5…−38.5、z −1…20；北门小路 x −46…−38.5、z −9.4…−1 | 白模 |
| `clubgolf` | 高尔夫 | 南墙以南（x −1…36 那段从 z 53 起，南墙归红土场） | 白模（方案 A：西步道南头开门） |

不归任何区域、走底图的：青训东头 x 27…33.6（clubcourts 只画到 x 27）、长廊西段 x −38.5…−21.4、球员草坪南边 z 34 以南、围墙外的沙漠和山。

## 场景模块的接口（`apps/sandbox/src/clubsite/region.ts`）

每个场景一个 `src/<场景>/scene.ts`，导出 `create<场景>Region(host: RegionHost): Region`（stage 3 的场景另导出 `create<场景>Kit` 给画廊用）。
独立页面的 `main.ts` 只剩页面的壳（管线、太阳、天、标签、画廊、像素 / 配色切换、循环），从 scene.ts 建场景：

```ts
const region = createXRegion({ scene, parent: scene, uniforms, params, texelMeters, designTexel, life, play, label });
const play = mountPlay({ scene, pipe, canvas, director: region.director(), ...region.start, nav: { groundAt: region.groundAt, ...region.nav() } });
const jobs = region.attach(play);
// 每步：region.update(dt, t) → play.update(dt, t) → jobs.step(dt) → region.post?.(dt, t)
```

- `RegionHost`：`scene`（页面的 scene，总监和手里的东西挂这里）、`parent`（区域的东西加到哪：独立页面 = scene，大世界 = 区域自己的 Group）、
  共用的 `uniforms`、`params`、`texelMeters()`、`designTexel`、`life` / `play` 开关、大世界才有的 `director`（共用的总监）、看图模式的 `label`。
- `Region`：`root`、`groundAt`、`nav()`（世界坐标的 bounds / walkable / blocked / ramps / stepUp，建好以后才有）、`director()`、`start`（独立页面开局的站位、相机、提示）、
  `update`（play 之前）、`post?`（play 和总监的活之后）、`attach(play)`（登记互动点、手里的东西、挡路的人、顶栏，返回每步的 `step`）、`counts`、`debug`。
- 场景模块要守的：东西都加到 `host.parent`、按名字找用 `host.parent.getObjectByName`；地形放在名字 `terrain` 的组里、摆件名字 `slot:<id>`；
  有 `host.director` 时不建自己的总监（life 里 `slot('director')` 拿到的是它）；总监的活只在 `attach` 里登记。
- 独立页面的 life 要先 mountPlay 再建的（clubplaza、clubcourts、clubfood：气泡交给 play.say），有 `startLife(play)`；大世界里 `attach` 时自动建。
- 各场景自己的调色（`PAL`、`PROXY` / `GROUP_AS` 借组、`SUN_SKIP` / `unSun`、clubpickle 的 `GRADE_AS`）都在模块里，大世界里照样生效
  （每个区域自己一份 `createMats`，同一份 uniforms）。

### 拆模块以后的像素对比

拆之前（clubpark、clubdesk、clubpickle、clubclay、clubplaza 用 git HEAD；clubstadium、clubcourts、clubfood 用拆之前的工作区）和拆之后，
每个场景截 6 张：`?play=0&pause=1`（竖屏 390×844、横屏 1280×720）、`?pause=1`（竖、横）、`?pause=1&warm=7`（竖）、`?play=0&life=1&pause=1&warm=9`（横）。
8 个场景 48 张逐像素一样；唯一的差别是玩法模式里互动点头顶那个上下浮动的黄箭头（HUD 的 DOM，按真实时间动，13×12 像素，HEAD 自己截两次也会差），不是画面。
clubhouse、clubpool、clubgolf 是白模：只新增了 scene.ts（建场景的代码从 main.ts 照搬），独立页面的 main.ts 没动，等做到 stage 3 再收成薄壳。

## 性能（量过的）

Chrome headless + SwiftShader（软件 GL，不代表真机 GPU 的帧率，只看相对大小）；一帧 = 颜色 + 法线 + 投影 + 合成合计，`window.__walk.perf()`：

| 位置 | 竖屏 390×844 | 横屏 1280×720 |
| --- | --- | --- |
| 停车场开局（62.2, −5.9） | ≈ 2.2k 次绘制 / 30 万三角 | ≈ 3.6k / 49 万 |
| 喷泉广场南沿（44, −14） | ≈ 2.7k / 35 万 | — |
| 匹克球长廊（44, −6） | — | ≈ 3.8k / 51 万 |
| 红土场东步道（34.8, 30） | ≈ 2.0k / 29 万 | — |
| 中心球场长廊（−10, −6.5） | ≈ 1.1k / 19 万 | — |
| 泳池北门（−47.6, −5） | ≈ 2.5k / 27 万 | — |
| 餐车院子（−30, −20） | ≈ 6.2k / 50 万 | ≈ 8.4k / 64 万（加上会所剖面） |

- 建一个区域 50～140 毫秒（clubfood 第一次 ≈ 380 毫秒），底图（建 + 切）0.4～0.6 秒；一帧最多建一个区域。
  走路卡顿的修正（2026-11-10，`clubsite/play/smooth.ts`、`pipe.prewarm`）：总监站定 0.4 秒以后按远近预建；建好马上异步预编着色器
  （颜色 / 法线 / 投影三套），编完前不在画面外的余量里画；建过区域的下一帧不追时间；渲染插值；法线 pass 不重算世界矩阵；
  底图和藏起来的区域冻住世界矩阵。画面逐像素不变（`pause=1` 截图对比）。
- 对照：clubmap2 整张图 ≈ 2670 次绘制 / 92 万三角；各小景独立页面 ≈ 800～2000 次。餐车院子的客人、托盘、桌椅多，是最重的一块。
- 单文件：`bash .claude/skills/pixel-scene/scripts/single-file.sh clubwalk <输出.html>` → 1.5 MB（JS 内联，`file://` 能打开）。

## URL 参数

`px`、`zoom`、`pause=1`、`warm=秒`、`at=x,z`（开局站哪）、`walk=x,z`（开局点地面走过去）、`route=x,z;x,z;…`（依次走过去，截图用）、
`eager=1`（开局就把所有区域建好）、`perf=1`（左下角帧率、绘制次数、显示中的区域）、`smooth=0`（关掉渲染插值和帧间隔贴齐）、`prebuild=0`（关掉站着时的预建）、`pal`、`seed`、`life=0`、`clouds=0`、`sunel` / `sunaz`。
调试钩子：`window.__walk`（`play`、`lives`、`step(秒)`、`stream(dt, force)`、`perf()`、`place()`、`state()`）。

## 已知问题

- **接缝**：底图（clubmap2）细节低，和区域的接缝看得出：青训东头 x 27…33.6 那一条、广场在底图上是平的（区域没建时远处能看到）。
- **背景人**：各场景给邻居画的背景人在区域外一开始藏起来；演出里走动的人出了自己的区域还显示（例如停车场的会员走进大门），会和邻居的人叠在一起。
- **同一个总监被几个场景的演出"读"**：各场景的 life 只读总监的位置，互不知道；中心球场接进来时会清一次总监手里道具的显示（`setupStadiumPlay` 开头 `setProp(null)`）。
- **建区域的卡顿**：站着的时候预建（见上）；一直走不停的话，碰到要用的区域还是当场建（一帧 0.1～0.5 秒 + 导航重建 50～170 毫秒）。
  彻底去掉要把各场景的 create 拆成几帧（生成器），或者开局全建（`eager=1`）。
- **性能**：餐车院子一带绘制次数到 6～8k；手机上大概要降级（只留底图、或者按区域合并几何）。真机帧时间还没量。
- **云影**：从各场景的云里挑了 8 团；云在 x 方向每 96 米绕回，所以别的地方也会有。
- **白模区域**：会所 / 泳池 / 高尔夫没有演出和总监的活；导航是粗的（泳池的围栏没挡、会所的家具按白模的规格挡）。

## 第二阶段（场景做到 stage 3 以后）

- clubhouse、clubpool、clubgolf：把 main.ts 收成薄壳，用 scene.ts（照 clubpickle），加 life / attach。
- 区域之间交接演出（停车场的会员走进前台的队伍、前台签完到的人走去球场……）现在各演各的：要一个跨区域的人物调度。
- 真机量帧时间；不够就降级：远的区域只留底图、几何按区域合并、阴影相机缩小。
