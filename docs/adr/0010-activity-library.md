# 0010 活动动画库

- 状态：已采纳
- 日期：2026-10-31

## 背景

游戏里的活动演出（`apps/game/src/scene.ts` 的 `PERFS`）只是几个人来回走、两个人对打一颗球，看不出疲劳、天气、教练水平的区别。另有一个单文件原型「网球活动动画库」（three.js r128，约 2300 行）：训练、招生、比赛、团建四类"原子活动"，全局条件（疲劳、天气、教练、场地风格）会改变每个活动的动作快慢、失误、桥段，自带粒子特效、像素表情、飘字和气泡。要把它搬进单仓，让游戏和 sandbox 用同一套演出。

## 决定

- **放在 render**：`packages/render/src/activities/` 是动画库（注册表、运行时、每个活动一个文件），`packages/render/src/fx/` 是粒子（`Particles`）和漫画字（`SpriteLayer`、像素图标、文字贴图、写字的平面）。只用 three.js；唯一的 DOM 是画布贴图。不引用 ui 和 sim。
- **注册表是纯数据**（`registry.ts`）：id、分类、标题 / 说明 / 标签的文案键、变量（范围或选项、默认值、改了要不要重建）、原生大小和地面类型。`resolveParams` 把越界的值收回来。
- **公共接口**：`startActivity(env, id, { area, bounds?, conditions, params?, cast?, seed?, extras? }) → { stop(), finished, shake }`。
  - `env` 给场景、演出时间轴（`Scheduler`）、人物世界（宿主照常每帧 `update` 人物）、世界坐标的地面高度、语言、随机流、漫画字放大倍数。
  - `area` 是一个 `CourtFrame`：活动的一切挂在一个按它摆放的局部组里，演出代码全用局部坐标（球场类活动球网在 x=0），和原型写法一致，换场地不用改演出。
  - 活动每帧的逻辑、球、粒子、漫画字由时间轴上的 tick 自己推进，宿主不用额外调用；暂停 / 变速跟着时间轴走。
  - `cast` 借游戏里现有的人物（主教练、青少年）：临时搬进局部组，演完原样还回去（位置、朝向、姿势、可见性）。其余人物由活动生成，停下时删掉。
  - `conditions = { fatigue: 0..1, weather: sun|cloud|rain|wind|heat, coach: 1..5, venue: generic|maple|hollow }`。
- **动画不决定数值**：活动里的随机（命中、失误、天才、输赢）只决定画面。游戏里比赛用 `finale: none`（打满一盘只清零比分，不演胜负），拔河用 `result: lose`（内容里网球这边从来没赢过）。随机数用 `@td/shared` 的 mulberry32，种子由调用方给。
- **扩展而不是复制**：`Person` 加了缩放、移动速度倍率、摔倒（脸朝下 / 仰面、滑行）、可调的小跳、转圈、手里拿东西、毛巾 / 熏黑 / 一身泥的覆盖物、头顶挂点、腿部钩子、`rehome`（换世界）；姿势表加了原型的姿势、发球 / 下手抛球 / 截击三种挥拍和二十来个手势（手势多了一个"进行比例"参数）。`BallPool` 加了颜色和大小（水球、红色小球）和风偏。新东西都是懒创建：已有场景不会多建一个物体，也不会多消耗 `Math.random`（three.js 生成 UUID 用它），所以 Hollow Creek 截图基准逐像素不变。
- **活动**：原型的九个（底线喂球、发球打靶、体能冲刺、选拔试训、社团招新会、开放日体验课、正式比赛、烧烤野餐、拔河大赛）都搬了；为了游戏另加两个：**劳动日**（`cleanup`，义工或外包施工队清理场地）和**匹克球对打**（`pickleball`，2 号场）。
- **文字**：场景里的飘字、横幅、记分牌和注册表的标题说明在 `activities/text.ts`，每个键一对中英文（游戏的 i18n 在内容包里，这些只属于画面）。sandbox 里给策划看的"当前效果"读数、场地桥段、分类介绍只有中文，写在 `apps/sandbox/src/activities/effects.ts`。
- **游戏接入**：`apps/game/src/perform.ts` 把模拟的 `performance` 名映射到活动、场地和要借的人物：lesson → 喂球（主教练 + 两个孩子轮换）、trial_day → 选拔试训（主教练喂球）、match → 比赛（校内级别、不演胜负）、workday → 劳动日（义工）、contractor → 劳动日（施工队）、fundraiser → 烧烤（预算高，在露台东边的上层台地上）、tug_of_war → 拔河（2 号场，固定输）、pickleball → 匹克球。条件来自游戏给的 `{ weather, fatigue, coachSkill }`，场地风格固定 `hollow`。`scene.ts` 只换了 `startActivity` 和删掉旧的 `PERFS`；2 号场的演出开始前请下正在打球的匹克球四人，结束后恢复。`perform.test.ts` 检查内容里每个 performance（活动和卡的 `stage.performance`）都有演出。
- **sandbox**：`apps/sandbox/activities.html`。手机竖屏优先（390×844：上面舞台、下面可滚动的面板，触控目标 44px，指针事件拖动 / 双指缩放），桌面是三栏。配色跟转播 HUD。每张卡是一座按活动原生大小切出来的浮空小岛（`activities/buildDiorama`，只给 sandbox 用）。始终按屏幕原生像素渲染，没有像素粗细档位。

## 删减和差异

- 比赛赛点的慢镜头（原型把整场时间放慢到 0.6）去掉了：游戏和 sandbox 共用一条时间轴，一个活动不能单独变速。
- 原型的教练头顶星级、路人、围网上的乌鸦位置只在动画库小岛上出现（`extras`）；游戏里不显示星级、不放路人，乌鸦停在区域北边。
- 原型的吉祥物大头换成"藏起脑袋、在上身上装一个大网球"；厨师帽换成白帽子；枫岭路人的书包没做。
- 原型里每个人物脚下的圆形假影子换成了渲染器的真实阴影（和游戏一致）。
- 原型发球打靶的球场是压缩过的（底线在 ±10.6 米）；这里用标准场地，小岛宽 26 米。比赛的小岛加深到 30 米，全国赛的看台和旗杆不再悬在岛外。
- 原型里 Hollow Creek 水坑的落球溅水只在下雨时有（小岛上的水坑没有传给活动）。
- 演出不会跟着中途的天气变化而改变（开演时读一次条件）。

## 后果

- 新活动 = `registry.ts` 里加一条 + `activities/<id>.ts` + 文案；`activities.test.ts` 会在无 WebGL 的环境里把每个活动在每种场地、每种天气下跑一遍，确认不出错、停下后清理干净、借来的人物还回去。
- 内容里新加一种 performance，要在 `perform.ts` 里配上演出，否则 `perform.test.ts` 不过。
- 游戏的相机比动画库远，漫画字放大 2.4 倍；以后有了贴近镜头，再调。

## 修订（2026-11-03，ADR 0019）

动画库从 `packages/render` 搬到 `packages/iso/src/activities/`，公共接口不变：`startActivity(env, id, { area, bounds?, conditions, params?, cast?, seed?, extras? })`，
注册表、文字、`perform.ts` 映射照旧。变化：`ActivityEnv.scene` 是 iso 场景图的 `Node`；演出里的方块是 `Box`，粒子、漫画字、球是 iso 版（像素画，没有画布贴图以外的 DOM）；
人物是像素精灵，"真实阴影"换成地上的影子；`activities.test.ts` 照样在 node 里跑。小岛是 `buildDiorama(world, meta, conditions, seed)`，画进一个 `IsoWorld`，
sandbox 里每张卡一个 `IsoWorld`。上面提到的 three.js、`Math.random`/UUID、Hollow Creek 截图基准都已不适用。
