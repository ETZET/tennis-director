# 界面重做：像素 HUD（2026-11-25）

用户看了《垂钓手记》的开发视频（参考帧只在本地 `~/workspace/tennis-director-refs/fishing-notes-stream/`），觉得画面干净：
界面只占三个角（左上日钟 + 季节日期、右上金币、右下三个图标），画面中间没有字，反馈是东西弹出来 + 一行字。
clubwalk 原来到处是深蓝框白字的文字牌（像素级别、时刻、模拟状态条、名册、小地图、推球包车、操作提示、人名牌、对话气泡）。
这一次把界面重做成共用的 `apps/sandbox/src/clubsite/hud/`，clubwalk 先接上（`?hud=old` 看旧的）；别的页面没接，保持原样
（山谷 valley 也用 `mountWalk`，没开 `pixelHud`，还是旧的）。

截图只在本地：`~/workspace/tennis-director-refs/club-redo/ui/`（`before/`、`round-1/`……，每轮的 `numbers.md` 和评判原文 `judge.md`）。

## 界面规则（做到现在定下来的）

1. **只占三个角，画面中间不放字和框。** 左上日钟 + 日期，右上钱，右下（拇指区）图标按钮。场景里只允许：人头上的心情泡（小图标，同屏最多 2 个）、
   互动点头上的小箭头。量：画面中间 60% 区域里的"字和框"像素 = 0（静止帧和真玩帧都要量）。
2. **字分两种，不要中间态。** 固定的数字（钱、第几天）用 5×7 点阵字，和图标同一个纹素网格；浮动的话（上方一行、小牌子、按钮名、地点名、开局提示）
   用平滑的系统字 + 1 px 墨色细描边（同参考的浮动中文）。不要把系统字按阈值切成"伪像素"（第 2、3 轮试过，汉字发碎、和图标不在一个网格）。
3. **图标没有底板。** 像素格子画形状，自动加 1 纹素墨色描边、1 纹素奶油贴纸边、往下 1 纹素深影（`sprite.ts`）；任何背景上都分得开。
   全界面只有一种底板：奶油小牌子（点日钟、长按按钮），一两秒消失。
4. **颜色和场景一家，不抢焦点。** 全部取 `clubsite/render/palette.ts` 的 PAL（`colors.ts`），描边是铁艺暗档靛黑。画面的焦点色是总监的草帽，
   界面的金色只给钱、日钟的进度、互动点小箭头；图标里的点缀色用低饱和的中档。
5. **手机优先。** 界面纹素：手机 2 CSS 像素，短边 ≥ 600 的屏 3 CSS 像素（`hudScale()`，转屏时重设）。所有按钮 ≥ 48 px（图标 + 透明外框），
   心情泡点击区 ≥ 44 px。只用 Pointer Events（点、按住、长按），桌面键盘照旧（clubsite/play 的）。
6. **不做菜单。** 按钮直接是动作；点日钟只冒一个小牌子（天气图标 + 星期几）。调时刻、调天气的面板是调试工具，只在调试里（`?debug=1`，或 3 秒内连点日钟 5 下）。
7. **字只在需要时出现。** 动作键、名册、地图没有字；活第一次出现、或长按按钮时，按钮正上方的奶油小牌子亮 1.5 秒。开局的操作提示 5 秒或第一次碰画面就淡掉。
8. **说话的人要连得上。** 点心情泡 / 点人：上方一行 = 小人头（这个人的发色、肤色、衣服色）+ 名字（金）+ 他自己的一句话，2.4 秒；点过的泡收起（已读）。
   再点他一次（或点那行字）= 开人物卡片。
9. **换场景用圆形转场。** 收拢到总监身上 → 全黑（右下三个点一个个亮）→ 展开；进出会所剖面、坐电梯换层都走它。

## 组件和接法（`apps/sandbox/src/clubsite/hud/`）

| 文件 | 做什么 |
| --- | --- |
| `index.ts` | `mountPixelHud({ play, canvas, day, money, buttons, who, params })` → `{ frame(), iris, peek(p), pop(text, icon, sec, who), place(name), setDebug(on) }`；`actionIcon(label)` / `pickIcon(label)`：活的中文名 → 图标；`hudScale()` |
| `clock.ts` | `drawClock({ hour, look, weather })` → 38×39 纹素 RGBA：四条色带的天、太阳沿弧走、月亮 + 三颗星、按天气的云 / 雨 / 风沙、外环 = 营业时段 6–22 点（`OPEN` / `CLOSE`） |
| `iris.ts` | `createIris({ center, cell, ms }).run(async () => { 换场景 })` → Promise；`busy()`、`pose(phase, k)`（截图定格）。只依赖 DOM，可以单独用（地图代理的 clubvista 在用） |
| `icons.ts` | 按钮图标（≤ 18×18）、心情字形（9×9）+ 心情泡、天气小图标（11×9）；字符格子，颜色键见 `colors.ts` |
| `sprite.ts` | 字符格子 → canvas：自动描边、奶油贴纸边、投影；`spriteCanvas(s, key, outline, ring)`、`blit` |
| `font.ts` | `textCanvas(text)`：5×7 点阵字（钱、天数）；`{ px }` 是阈值切的系统字（已经不用在界面上，留着给画廊） |
| `mood.ts` | `moodOf(台词)` → 心情字形（扳手、心、水滴、杯子、网球、沙漏、青筋、音符、zzz、? 、!；分不出类 = "…"，不出泡）；有单测 |
| `i18n.ts` | 玩家看得见的字（星期、提示、按钮名、天气）中英两份，`?lang=en` |
| `style.ts` | 样式；`body.pxh-on` 藏掉旧的文字界面，`body.pxh-debug` 放出调试牌 |

clubwalk 里接的地方（`clubwalk/walk.ts`，`WalkHooks.pixelHud`，`clubwalk/main.ts` 开）：

```ts
const day = mountDaylight({ ..., hud: PIXEL_HUD ? null : pxEl, panelOnly: PIXEL_HUD });  // 调时间面板只要面板、不要牌子
hud = mountPixelHud({ play, canvas, day, params,
  money: () => cast.money(), who: (a) => cast.whoOf(a),
  buttons: [{ id: 'map', icon: 'map', label: 'map', onTap: () => document.body.classList.toggle('pxh-map') },
            { id: 'roster', icon: 'roster', label: 'roster', onTap: () => cast.openRoster() }] });
// 每帧 render 之后：play.hud.frame()（它还管画面上的指针）→ cast.frame() → hud.frame()
```

- 进出会所：`step` 里"总监在不在会所里"先过一道转场，黑的那一刻才切剖面（`houseShown`）；楼梯换层不走转场。
- 坐电梯：`RegionHost.transition`（`clubsite/region.ts` 新加的可选项），`clubhouse/scene.ts` 的电梯 / 货梯 `onUse` 有它就包一层。
- 演员表（`clubwalk/cast/index.ts`）：`quiet` 不画名字小牌和"名册"牌；`peek` 点人 → 上方那行字；`whoOf(obj)`、`money()`、`openRoster()`。
- 时间面板（`clubsite/daylight/hud.ts`、`index.ts`）：`panelOnly` 只要面板；`api.panel`（toggle / isOpen）、`api.current`（现在实际的天气）。别的页面默认行为不变。

调试：`?debug=1`（像素级别、模拟状态条，点日钟 = 调时间面板）、`?hud=old`（旧界面）、`?hudsheet=1`（所有图标、心情泡、几个时刻的日钟摆成一张）、`?lang=en`、
`window.__hud`（`iris.pose('close', 0.5)`……）。

## 量图工具

`docs/lab/2026-11-07-3d-pixel/tools/hudshots.mjs <输出目录> <url> <宽> <高> <前缀> [ui live peek mood clock iris house debug]`：
- `ui` / `live`：把场景 canvas 藏掉、底换品红，数界面像素、中间 60% 的界面像素、再把心情泡和小箭头也藏掉以后中间的"字和框"；`live` 不暂停（真玩帧）。
- `peek` 点离中心最近的演员；`mood` 没人说话就让一个人说一句再点泡；`clock` 点日钟；`iris` 转场定格三帧；`house` 真的走进会所连拍；`debug` 调试牌 + 调时间面板。

<!-- ROUNDS -->
