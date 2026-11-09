# 归档 · 2.5D 时期的主线和派工

2026-11-09 归档。

**是什么：** 2.5D 等距画面时期定下、`packages/sim` 照着实现的游戏流程：接手一座荒废的俱乐部（Palm Oasis），16 周里修一处开一处，
星级 ★0–★5、升星时选路、赛事阶梯和表演赛筹备、员工成长、地图跟着选路长出去、第 112 天打分的结局和第二季；
日常经营靠招人、把人（包括总监）拖到岗位和工单上（原玩法准则 5，归档在 [tenet-5-staffing.md](tenet-5-staffing.md)）。

**为什么归档：** 3D 场景演的是一座已经在营业的俱乐部，玩家直接操控总监走着干活（ADR 0027、0029），和"从废墟修回来、拖人派活"对不上。
用户 2026-11-09 决定：主线和派工整个归档，游戏流程围绕 3D 俱乐部重新设计，什么都还没定。现在的设计和开放问题见
[game-design.md](../../design/game-design.md)「游戏流程：重新设计中」，里程碑 M-0 见 [backlog.md](../../design/backlog.md)。

**规则细节在哪：** 完整的规则和初值在 [game-design-v0.5.md](game-design-v0.5.md)（修复主线、修复分叉和升级改造、地图怎么长大、推进结构、经济、招人、决定记录）
和模拟的契约 [wave1-contract.md](../../design/wave1-contract.md)、[wave2-5-contract.md](../../design/wave2-5-contract.md)。
下面"从 v1.0 设计文档搬来的原文"是 2026-11-08 的 `game-design.md` v1.0 里讲这些的段落，原样搬过来。

**代码照旧在、照旧跑。** 归档的是设计，不是代码：模拟、内容、测试和机器人都还按这套跑（`pnpm test`、`balance.test.ts` 照常要过），
重新设计定了以后再决定删改哪些。

## 哪些代码是它的实现

读过代码以后的划分（2026-11-09，存档版本 15）。

**主线（推进、修复、赛事、地块、结局）：**

| 位置 | 是什么 |
| --- | --- |
| `packages/sim/src/stars.ts` | 星级 ★0–★5（ADR 0020） |
| `packages/sim/src/tournaments.ts` | 赛事日历、主办和外出赛事、附加目标 |
| `packages/sim/src/growth.ts`、`potential.ts` | 员工成长和潜力（"人是钥匙"） |
| `packages/sim/src/plots.ts` | 地块（地图长大，ADR 0021） |
| `packages/sim/src/ending.ts` | 结局方案 A、第二季 |
| `packages/sim/src/effects.ts` 的一部分 | 选路（`route`）、开地（`plot`、`startPlot`、`checkPlotOpen`）、升星、结算打分（`settle`） |
| `packages/sim/src/staff.ts` 的一部分 | 掉档（`grade_drop_below`、`drops_to`，ADR 0017） |
| `packages/content/data/acts/indian_wells.yaml` 的一部分 | 开局的废墟状况 `condition`、`stars`、`routes`、`plots`、`tournaments`、`calendar`、`ending`、`growth`、`rules.lose_if`、`rules.grade_drop_below`、四块地块的锚点和导航边 |
| `packages/content/data/facilities.yaml` | 8 处设施从废墟到修好的一级级状态、修复变体、升级、`drops_to` / `worn`（ADR 0015、0017） |
| `packages/content/data/orders/` 的大部分 | 修复和变体（`*_repair`、`*_clear`、`*_rebuild`、`*_to_*`、`o23_pro_*`……）、重开（`*_reopen`、`o1_refinish`）、赛事（`cup_monthly`、`regional_open`、`junior_regional`、`invitational`、`official_tournament`、`pl_tournament`）、表演赛（`prep_*`、`st1_exhibition`）、地块清理（`ai_*`、`ep_*`、`ol_*`、`sc_*`） |
| `packages/content/data/posts/` 的一部分 | 赛事临时岗位（`t_checkin`、`t_catering`）、地块开出的岗位（`ai_*`、`ep_*`、`ol_*`、`sc_*`） |
| `packages/content/data/events/indian_wells/` | 全部 27 张卡都是为这条主线写的：开场、招聘日、选路（`iw_route_s2/3/4`）、期限、结局、Dale 的故事线和几张随机卡 |
| 测试 | `build.test.ts`、`wave2.test.ts`、`growth.test.ts`、`ending.test.ts`、`plots.test.ts`、`decay.test.ts`；`apps/sim-cli` 的 `balance.test.ts` 按通关和打分定区间 |

**派工（招人、把人放到岗位和工单上）：**

| 位置 | 是什么 |
| --- | --- |
| `packages/sim/src/staff.ts` | 指派（`assign`）、岗位转圈、工单推进、办事、习惯（ADR 0012、0014）、设施衰减 |
| `packages/sim/src/walk.ts` | 人按导航图走最短路（重派要走过去，ADR 0012） |
| `packages/content/data/posts/`、`orders/` | 岗位和工单（id 共用一个空间） |
| `packages/content/data/people/indian_wells.yaml`、`traits.yaml` | 总监、开局的 Dale、招聘日的候选人和特质（[people.md](../../design/people.md)） |
| `packages/sim/src/bots.ts` | 机器人（按需求时段排人、做工单） |
| `apps/game/src/session.ts`、`project.ts` | 手上拿着的人、员工条、岗位说明、地点清单（ADR 0013） |

**不属于它、仍然通用的：** 卡的引擎和导演（`cards.ts`；卡的内容是主线的）、白名单效果和变量（`effects.ts`、`vars.ts` 的大部分）、
每日结算（`day.ts`，ADR 0024）、钱的日账和周日回顾（`week.ts`）、场地可用度（`care.ts`、`mess.ts`，ADR 0022）、领域事件（`events.ts`）、
时间、季节、天气、因果日志、存档（`systems.ts`、`game.ts`、`state.ts`、`save.ts`、`world.ts`）。
其中每日结算的服务率、场地可用度的打扫是按岗位和工单算的，重新设计时要一起看。

## 从 v1.0 设计文档搬来的原文（2026-11-08 版 `game-design.md`）

### 玩法准则下的注

> 准则 5 说的"把总监拖到岗位"现在是"操控总监走过去"（ADR 0029），措辞要不要改【待定】。

### 概述

> - **人手最稀缺。** 总监一个人顾不过来：在前台签到就没法去红土场拖场；招来的员工和他们放在哪儿，决定了俱乐部的底子【模拟】。

### 核心循环 · 一天【模拟】

> 营业 8:00–20:00。需求按时段来（早上租场、下午上课、傍晚成人班），人手比岗位少，玩家一天重派两三次人。

（"20:00 收盘按今天的服务率结算"留在现在的设计里。）

### 核心循环 · 一周、一局【模拟】

> 周日的结算卡多一页"本周回顾"；周日收盘没人管的设施掉档（ADR 0017）；会所开张以后每两周一个招聘日。
> 一局 16 周（112 天）：第 112 天 18 点结算打分，之后可以开第二季；现金低于 −$2000 破产结束。
> 这条"从废墟修回来、星级、选路、赛事、表演赛"的主线是 2.5D 时期定的，模拟照它跑；3D 场景演的是一座已经在营业的俱乐部，两者怎么合【待定】。

### 人

| 谁 | 模拟里 |
| --- | --- |
| **总监** | 一个劳动力：没有士气、不要工资；干完一圈岗位或一张工单，对应能力 +0.3，上限 80【模拟】 |
| **员工** | 四类作用（教练、维护工、特殊岗位、球员）、能力 0–100、一句话背景和 1–2 个特质、周薪、士气、成长和潜力；招聘日招进来，拖到岗位和工单上；记住派过的班自己去上（ADR 0012、0014）。详见 [people.md](../../design/people.md)【模拟】 |

### 模拟里已经有的（主线和派工那几条）

> - **岗位和工单（ADR 0012）：** 岗位是地点上的位子，有人坐上、在它的时段里一圈一圈转（一圈 1 小时）、每圈结算；工单是长在问题上的一次性任务，可以几个人一起，第一个人到场扣材料费。
> - **修复就是解锁（ADR 0015）：** 8 处设施（会员场、红土场、青训场、会所、棕榈喷泉、匹克球场、泳池、中心球场），一开局全是废墟，修好一处开出它的岗位和下一步。
> - **衰减和掉档（ADR 0017）：** 没人维护的设施每天掉状况，周日收盘低于 15 掉一档，冒出"重开"工单。
> - **招人：** 会所开张后每两周一个招聘日，一次两个候选人，手写的 14 个人按种子抽，一局见到 8 个。
> - **推进：** 星级 ★0–★5、★2/★3/★4 升星时选路、赛事日历（月度内赛、地区赛、邀请赛）、表演赛分期筹备、员工成长和潜力、地块（地图跟着选路长出去：南场、绿洲草坪、赛事广场、学院岛）、
>   结局方案 A（第 112 天打分，之后第二季）。规则见 [wave1-contract.md](../../design/wave1-contract.md)、[wave2-5-contract.md](../../design/wave2-5-contract.md) 的"最终 schema"和归档的 v0.5"推进结构"。

### 还没定的（主线和派工那几条）

> - 2.5D 时期的主线（废墟修复、16 周、星级、选路、赛事、表演赛、地图长大）在 3D 里还要不要、怎么演：3D 场景演的是一座已经在营业的俱乐部。
> - 员工在 3D 里怎么派：拖头像到场景里的岗位，还是别的办法（准则 5）；场景里现在的 NPC 员工（代客、教练、裁判、球童）要不要变成模拟里招来的人。
> - 准则 5 的措辞要不要按直接操控改。

2026-11-09 的答案：前两条归档、重新设计（不再是"怎么演"，而是"要不要、要什么"）；第三条准则 5 删掉。

## 归档的 ADR

状态行改成"已归档"的：[0012](../../adr/0012-staffing-loop.md) 招人和排人、[0013](../../adr/0013-place-hubs.md) 地点牌、[0014](../../adr/0014-routines.md) 习惯、
[0015](../../adr/0015-jobs-unlock-from-repairs.md) 修设施开出工单、[0017](../../adr/0017-grade-drop.md) 掉档、[0020](../../adr/0020-progression-structure.md) 推进结构、[0021](../../adr/0021-map-grows.md) 地图长大。
[0016](../../adr/0016-single-map-site.md) 只有"通关和失败""招聘日"两条随之归档，加了一行注。

研究笔记 [research-kairosoft.md](../../design/research-kairosoft.md)、[research-main-line.md](../../design/research-main-line.md)、[research-map-growth.md](../../design/research-map-growth.md)
是给这条主线做的，留在 `docs/design/`，重新设计时可以参考。
