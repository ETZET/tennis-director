# 小游戏（src/minigames）

总监的十件活，每件做成一个一两分钟的小游戏，放在现成的 3D 俱乐部场景里。每个小游戏一个独立页面：
`apps/sandbox/mg-<id>.html` + `apps/sandbox/src/minigames/<id>/`。列表页是 `minigames.html`（`hub/`）。

## 十个小游戏（id 固定）

| # | id | 名字 | 场景（场景模块） |
|---|----|------|------------------|
| 1 | `ballpickup` | 捡球冲刺 | 会员场（`clubcourts`） |
| 2 | `blower` | 吹叶清场 | 中心球场（`clubstadium`） |
| 3 | `claydrag` | 红土拖场 | 红土场（`clubclay`） |
| 4 | `valet` | 代客泊车 | 停车场（`clubpark`） |
| 5 | `stringing` | 穿线 | 会所一楼穿线铺（`clubhouse`） |
| 6 | `foodtruck` | 餐车出餐 | 餐车院子（`clubfood`） |
| 7 | `checkin` | 前台签到 | 露天前台（`clubdesk`） |
| 8 | `ballkid` | 球童 | 中心球场 · 比赛中（`clubstadium`） |
| 9 | `lifeguard` | 泳池救生 | 泳池（`clubpool`） |
| 10 | `golfputt` | 果岭推杆 | 高尔夫果岭（`clubgolf`） |

列表页的文字在 `hub/list.ts`（已经写好十条，做小游戏的时候不用改）。

## 加一个小游戏：只加文件，不改共用文件

1. `apps/sandbox/mg-<id>.html`：照抄 `mg-ballpickup.html`，改 `<title>` 和 script 路径。
   `vite.config.ts` 自动收所有 `mg-*.html`，不用登记；列表页自动链过去（页面没做出来时标"制作中"）。
2. `apps/sandbox/src/minigames/<id>/main.ts`（目录里随便放别的文件）：

```ts
import '../../clubsite/render/colors'; // 第一行：关颜色管理（同各场景的 main）
import { CLOUDS } from '../../clubstadium/layout';
import { createStadiumRegion } from '../../clubstadium/scene';
import { mountMinigame } from '../shell';

mountMinigame({
  id: 'blower',
  title: '吹叶清场',
  tag: '小游戏 2 · 中心球场',
  goal: '比赛开始前把场上的落叶吹出界。',
  howto: ['拖动走路', '按住「吹」朝叶子吹', '吹出边线才算'],
  region: createStadiumRegion, // 场景模块原样建（同独立页面）
  clouds: CLOUDS,
  life: false, // 场景的日常演出（默认关）；attach: true 另外拿场景登记的活
  hour: 9,
  weather: 'clear', // 固定时刻、天气（URL 优先）；时间默认不走
  start: { start: [0, -20], yaw: Math.PI }, // 总监开局（不给 = region.start）
  camera: { dead: [1.2, 2] },
  duration: 90, // null = 不计时
  stars: [300, 600, 900],
  setup(mg) {
    // 场景建好、总监就位以后调一次：摆东西、play.add 互动点、play.addItem 工具
    return {
      reset() {}, // 每局开始前把场面摆回去（总监已经放回 start）
      start() {}, // 点了「开始」
      step(dt, t) {}, // 玩的时候每个模拟步（1/60 秒）：mg.addScore(10, 世界点)
      frame() {}, // 每帧
      finish(reason) {
        // 时间到 / mg.finish('清场！')：结算卡的明细 + 奖励分
        return { lines: [{ label: '吹走', value: 12 }], bonus: [{ label: '清场奖励', value: 100 }] };
      },
      debug: () => ({}), // 进 window.__mg.state()
    };
  },
});
```

`mg` 上有什么、每个选项什么意思，看 `shell/index.ts` 顶上的注释（以那里为准）。常用的：

- `mg.scene`、`mg.region`（场景模块，类型跟着工厂走：`clubcourts` 有 `objs`、`kit`……）、`mg.play`（总监操控，`clubsite/play/index.ts` 顶上有完整说明）
- `mg.ctx`：俱乐部底表的资产上下文，`clubsite/assets`、`clubsite/people` 的东西都能拿它建；场景自己的资产用 `region.kit.makeAsset`
- `mg.addScore(n, 世界点)`、`mg.comboHit()`、`mg.setLives(n, max)`、`mg.stat(key, label, value)`、`mg.pop(点, '+10')`、`mg.toast('…')`
- `mg.marker(id, 点, { label })`：头上跳的箭头，在画面外就贴着画面边指过去；`mg.ring(x, z, r)`：地上的圈
- `mg.rng(key)`：种子随机流（不要用 `Math.random`）；`mg.onStep`、`mg.onFrame`：任何状态都跑的钩子
- `mg.finish(reason)`：提前结束；`mg.state`、`mg.timeLeft`、`mg.elapsed`、`mg.round`

## 规矩

- 不改共用文件（`shell/`、`hub/`、`vite.config.ts`、场景、`clubsite/`）。场景的东西要改样子：复制到自己的目录再改；要读场景的坐标、资产，只读 import。
  `pnpm check:deps` 的 `minigames-isolated`：小游戏只能 import 自己的目录和 `shell/`，不能 import 别的小游戏。
- 手机竖屏优先（390×844）：操作在拇指区，按钮 ≥ 44 px；play 的大按钮在右下，壳的 HUD 在顶上，别再往这两处叠东西。
- 界面文字中文；注释中文；提交用 Conventional Commits。
- 人物有名字的（`clubsite/cast`、ADR 0030）：数据层 `clubsite/cast`（`CAST`、`NAMED_BY_ID`）可以直接用；名牌、人物卡那套界面在 `clubwalk/cast`，小游戏不能 import（`clubwalk-is-top`）。

## 无头驱动（截图、测试）

`window.__mg`：`ready`（第一帧画完）、`state()`、`start()`、`finish(reason?)`、`again()`、`step(秒)`（同步跑固定步，不等 rAF）、
`play`（`setStick`、`tapWorld`、`setUse`、`pick`……）、`mg`。URL：`?auto=1` 跳过开局卡；`?seed=`、`?hour=`、`?weather=`、`?pause=1`。

```js
await page.goto('http://localhost:8765/mg-ballpickup.html');
await page.waitForFunction(() => window.__mg?.ready, null, { timeout: 120000 });
await page.click('.mg-go'); // 或 __mg.start()
await page.evaluate(() => { __mg.play.setUse(true); __mg.play.tapWorld(-24, 26); __mg.step(4); });
await page.screenshot({ path: 'mid.png' });
await page.evaluate(() => __mg.finish());
```

Chromium 参数：`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --no-sandbox`；先 `pnpm --filter ./apps/sandbox build`，
再在 `apps/sandbox/dist` 里 `python3 -m http.server`。swiftshader 下页面要十几二十秒才出第一帧。
