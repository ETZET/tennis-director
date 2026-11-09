# 每日结算接口契约：每天收盘结算钱、声望、会员，停下来弹一张结算卡

> **2026-11-08 起：** 画面改成 3D 像素（ADR 0027），本文提到的 `@td/iso`（像素头像 `personHead`）、`main.ts` 的画面部分随 2.5D 画面归档；模拟、内容、结算卡（`apps/game/src/settle.ts`、`packages/ui` 的 `SettlementCard`）和"最终 schema"仍是现状。
>
> **2026-11-09 起：** 每日结算仍是现行的模拟；其中按岗位算服务率、"缺人最多的岗位"、赛事和招聘日几行属于归档的主线和派工（[`main-line-2.5d.md`](../archive/pre-3d/main-line-2.5d.md)），文中的"准则 6"是现在的准则 5；没有派工以后服务率怎么算归 `backlog.md` 的 M-0。

规则来源：制作人 2026-11-06 拍板（定稿，不再讨论），ADR 0024，玩法准则 1、4、6（准则 6 的措辞已改，见 CLAUDE.md）。
Wave 0 已经落地了**类型、桩、文案和 YAML 数值**（见文末"Wave 0 已落地"），两个实现代理照这份文件并行做，文件归属互不重叠（"文件归属"一节）。
做完以后代理 A 把最终数值和加的字段回写"最终 schema"一节（下游只认这份文件）。
**不跑** `pnpm sim determinism`、`pnpm sim bots`（制作人：这一轮不做平衡跑局）；`pnpm test` 里的 `balance.test.ts` 照常要过。

## 一句话

每天收盘（20:00）模拟把今天结算完：现金照旧按天记，**声望、会员也按今天算一次**（今天的服务率、今天走掉的会员、今天的特质），
写一条 `daily` 因果日志，抽好明天的天气，出一份 `DayReport`，发 `daySettled { report }`。游戏收到就停自己的钟（不管 1×/2×/4×），
弹像素风结算卡：数字滚出来，点一下跳到结尾，再点一下进入明天。周日多一页"本周回顾"（只是七天加起来讲，不算数）。
**模拟从不等卡**：不是命令、不进命令日志，重放和界面无关。

## 公式（`acts/indian_wells.yaml` 的 `rules.day`，Wave 0 已写进 YAML）

初值 = 原来 `rules.week` 的各项 ÷ 7。规则：**按一周累计的量除以 7**（服务、质量、修复、会员增长）；
**按次数的量不除**（`care.walkouts` 现在就是今天走掉的个数）；**存量的上限不除**（`member_cap`）。

```yaml
rules:
  day:
    service_pass: 0.5
    reputation:
      service: (service_rate - service_pass) * 2 / 7          # 周：service_demand * (service_rate - service_pass) * 2
      quality: (stat.quality - 50) / 25 / 7                  # 周：service_demand * (stat.quality - 50) / 25
      restored: restored * 0.15 / 7                           # 周：restored * 0.15
      walkouts: "-0.5 * care.walkouts"                        # 不除：今天每走一个 −0.5
    members:                                                  # 可以写成一个表达式，也可以拆项（拆项才讲得出为什么）
      growth: >-
        max(0, (courts_built * service_rate + (stat.quality - 30) / 12 + stat.reputation / 30) / 7
        - (plot.se_corner == "building" && route.s4 == "event_plaza" && flag.ep_cleared ? 2 : 0) / 7)
      walkouts: "-care.walkouts / 3"                          # 周：- floor(care.walkouts / 3)；现在按小数、零头留到明天
    member_cap: <和 week.member_cap 一字不差>
    member_loss_max: max(8, stat.members * 0.25) / 7          # 周：max(8, stat.members * 0.25)（schema 默认值同样 ÷ 7）
```

- `service_demand *` 去掉了：今天没有需求时整段不结算（见下），算到的时候它总是 1。
- 特质的声望（`traits.<id>.reputation_drift`）本来就是按天的：今天的直接算，不除。
- 钱不变：会费 `dues_week / 7`、设施收入和维护费 `/ 7`、工资 `wagesWeek / 7`、岗位每圈的收入，都和现在一样按天记进现金（`bookDay`）。
- 代理 A 接上以后**删掉 `rules.week`**（schema、编译器校验、YAML），`servicePass(w)` 改读 `rules.day.service_pass`。旧写法的每日漂移
  `member_drift` / `reputation_drift`（默认 `'0'`）不动。

读数（典型的中期一天：4 块场、服务率 80%、质量 60、声望 40、修好 6 处）：声望 +0.09（服务）+0.06（质量）+0.13（修复）≈ **+0.27**，
一周 ≈ +1.9（和周结算一样）；会员 growth ≈ (3.2 + 2.5 + 1.33) / 7 ≈ **+1.0**，一周 ≈ 7（周结算 round(7.03) = 7）。
很差的一天（服务率 20%）：声望服务项 −0.09，会员 +0.66。一块场一天走掉 3 个：声望 −1.5、会员 −1。

### 今天没有需求就不动

`s.today.demand === 0`（一整天没有一个开着的有需求岗位：开局、雨天全关）→ 声望、会员**都不结算**（包括特质、修复项；
`memberCarry` 原样留着；会员上限这天也不收人）。`daily` 日志照写（`rep: {}`、`members.gain: 0`），报告里 `skipped: true`。
这是行为变化：以前开局几周没有客人时修复项照样每周给声望，现在不给（准则 6：没人就是零、不倒扣）。

### 声望（精确）

```
extra   = { service_rate: today.served / today.demand, service_demand: 1 }
terms[k] = num(rules.day.reputation[k], extra)；traitRep ≠ 0 时 terms.traits = today.traitRep
delta   = Σ terms（不取整，直接加；stat 按 0..100 截）
```
日志和报告里每项保留两位小数（`Math.round(x * 100) / 100 || 0`）。

### 会员（精确，零头 `memberCarry`）

```
terms[k] = num(rules.day.members[k], extra)（写成一个字符串时只有 terms.total）
gain     = Σ terms
acc      = memberCarry + gain
cap      = member_cap 写了 ? round(num(member_cap, extra)) : null
capped   = cap !== null && acc > cap − members        → acc = cap − members（可以是负数：超出上限的人不续了）
lossMax  = max(0, num(member_loss_max, extra))（不取整）
limited  = acc < −lossMax                              → acc = −lossMax
dm       = Math.trunc(acc)                             // 朝 0 取整
carry    = acc − dm                                    // (−1, 1)
members += dm；如果被 stat 的 0..500 截了，carry = 0
memberCarry = carry
```
撞上限时 acc 被压到整数（cap 和 members 都是整数），carry 自然是 0：**到了上限不攒零头**。

## 状态（Wave 0 已落地，`packages/sim/src/state.ts`）

```ts
SAVE_VERSION = 15
GameState.today: DayState              // 今天的账：openDay 开头 freshDay 重建，收盘结算
GameState.memberCarry: number          // 会员零头 (−1, 1)
GameState.forecast: { day: number; weather: Weather } | null   // 明天的天气（收盘抽好）
GameState.days: DayReport[]            // 最近 7 份报告，最新的在最后（结算卡读 days.at(-1)，周日的回顾读这一周的）
interface DayState {
  day; log0;                           // 第几天；开门那一刻因果日志的下一个 id
  demand; served;                      // 今天有需求的分钟、服务到的分钟（勉强能打按 meh_service 折算）
  missed: Record<post, min>; unplayable: Record<post, min>; walkouts: Record<court, n>;
  last; lastDemand;                    // 昨天的服务率、需求分钟（今天还没有需求时 service_rate 读它）
  traitRep;                            // 今天特质的声望
  materials: Record<order, $>;         // 今天开工扣的材料费（开工扣钱不写日志，所以在这里记）
  cash0; reputation0; members0; quality0; morale0: Record<person, n>;   // 开门那一刻
  work: Record<person, min>; idle: Record<person, min>;                 // 今天干活 / 闲着的营业分钟
}
WeekState.rep?: Record<string, number>; WeekState.members?: number;     // 这一周每天声望各项之和、会员一共变了几个
WeekSettlement.review?: boolean                                         // 新的周结算只是回顾
Cause += ({ kind: 'daily' } & DaySettlement)
```

`DaySettlement`（`daily` 因果日志）：`{ day, demand, served, pass, missed, money: WeekMoney, rep, members: { gain, cap, carry, loss_max? }, walkouts?, unplayable? }`，
和 `WeekSettlement` 同一套讲法（`week` 换成 `day`）。`effects`：实际改的 `stat members`、`stat reputation`（`applyEffects`），
再补一条只讲不改的 `stat cash`（今天净现金，和周结算现在的写法一样）。

### 谁往今天的账里记（代理 A 改）

| 现在写 | 改成写 | 在哪 |
| --- | --- | --- |
| `s.week.demand / served / missed / unplayable`（每分钟） | `s.today.*` | `staff.ts` postSystem |
| `s.week.served` 退回、`missed` 补上（被拉走） | `s.today.*` | `walk.ts` |
| `s.week.walkouts += 1` | `s.today.walkouts[court] += 1` | `care.ts` |
| `s.week.traitRep += drift` | `s.today.traitRep += drift` | `systems.ts` closeDay |
| 工单开工扣材料费 | 另记 `s.today.materials[order] += cost` | `staff.ts` |
| `idleMin` 每营业分钟 | 同一处另记：在职的人有 `errand`，或者有 `job` 且没在走路 → `work += 1`；没 job、没走路、没办事 → `idle += 1` | `staff.ts` |
| `s.week.cycles` | **不变**（变量 `cycles.<岗位>` 还是这一周的，赛事条件在用） | `staff.ts` |

`s.week` 的 demand、served、missed、money、traitRep、walkouts、unplayable 改成**收盘时从今天卷进来**（`settleDay` 末尾），
另记 `rep`（各项累加）和 `members`（dm 累加）。周日 `settleWeek` 照旧从 `s.week` 写 `week` 日志，但**不改任何数**，`review: true`。

## 每个 tick 和收盘的顺序（`systems.ts`）

tick 不变。`closeDay` 改成（**加粗**是新的或改了的）：

1. `tournamentSystem`
2. `careCloseDay`（今天走掉的已经记在 `today.walkouts` 里了）
3. `decayDay`、`closeLedger`
4. `bookDay`（只记钱；老写法的每日漂移照旧）
5. 特质：士气漂移，**`today.traitRep += reputation_drift`**
6. **`settleDay(ctx, day)`**：声望、会员按 `rules.day`；写 `daily` 日志；把今天卷进 `s.week`
7. 周日：**`settleWeek`（只回顾，不改数）**；`gradeDrop`（不变，ADR 0017）
8. `recomputeDerived`、`checkStars`、`checkUnlocks`
9. 周日：`weekSettled` 事件（不变）
10. `dayEnded` 事件
11. `lose_if`
12. **`forecastWeather(ctx, day)`**：`weightedPick` 按**明天**的季节（`seasonOn(w, day + 1)`）抽，`s.forecast = { day: day + 1, weather }`
13. **`report = buildDayReport(s, w, day)`**（只读、不用随机数）→ `s.days.push(report)`（留最后 7 份；周日先 push 再算 `review` 挂上）→
    `ctx.events.push({ type: 'daySettled', report })`

然后 tick 里照旧 `overnight` → `s.t = 开门` → `openDay(ctx, next)`：
- **开头** `s.today = freshDay(s, next, prev)`，prev = 今天有需求 ? `{ last: served/demand, lastDemand: demand }` : 原样带上 `{ last, lastDemand }`；
- 天气：`s.forecast?.day === next` → 用它、`s.forecast = null`，**不抽签**；否则照旧抽（新开局第一天、读旧档、第二季回拨时钟）。
- 随机数：第 12 步正好在以前 openDay 抽天气的位置之前，中间（overnight、换季）不用随机数，所以**同一种子的天气序列和以前一样**。

## 领域事件（Wave 0 已落地，`events.ts`）

```ts
| { type: 'daySettled'; report: DayReport }   // closeDay 的最后一件事；这一局在收盘时结束（破产）也照发，游戏不开卡
```

## `DayReport`（Wave 0 已落地，`state.ts`；桩 `buildDayReport` 在 `day.ts`）

```ts
interface DayReport {
  day; week; weekday /* 0 = 周一 */; season; weather /* 今天的 */;
  money: { lines: DayMoneyLine[]; total /* 收盘现金 − cash0，取整 */; cash /* 收盘现金 */; vsYesterday: number | null };
  service: { demand; served; rate: number | null /* 今天没需求 null */; pass; vsYesterday: number | null /* 两天都有需求才有，rate 之差 */;
             missed: { post; minutes } | null; unplayable: { court; minutes } | null; walkouts; walkoutsBy: Record<court, n> };
  reputation: { before; after; delta; terms: Record<string, number>; skipped };
  members: { before; after; delta /* 整数 */; gain /* 小数 */; terms; carry; cap: number | null; capped; lossMax: number | null; limited; skipped };
  quality: { before; after; target };
  people: { top: DayPerson[]; idle: DayPerson[]; morale: DayPerson[] };   // DayPerson = { id; work; idle; morale; morale0 }
  tomorrow: DayTomorrow;
  review: WeekReview | null;   // 只有周日
}
type DayMoneyKind = 'dues' | 'facility' | 'post' | 'wages' | 'upkeep' | 'materials' | 'card' | 'event' | 'other';
interface DayMoneyLine { kind: DayMoneyKind; id: string | null; amount: number /* 取整，收入正、花销负 */ }
```

### 钱的每一行（代理 A 照这个算）

| kind | id | amount |
| --- | --- | --- |
| `dues` | null | + 会员 × `dues_week` / 7 |
| `facility` | 设施 | + 这处设施这一档的 `income_week` / 7（加 `facilityMoney(s, w)`：设施 → { income, upkeep }，`facilityTotals` 拆开） |
| `upkeep` | 设施 | − 这处设施的 `upkeep_week` / 7 |
| `wages` | null | − `wagesWeek` / 7 |
| `post` | 岗位 | 今天 `post` 日志（`id ≥ log0`）里 `stat cash` 之和 |
| `materials` | 工单 | − `today.materials[工单]` |
| `card` | 卡 | 今天 `option` / `default` 日志里 `stat cash` 之和 − `cost` 记录 |
| `event` | 赛事 | 今天 `tournament` 日志里 `stat cash` 之和（报名费从工单材料走 `materials`） |
| `other` | null | `total − Σ 上面各行（取整后）`；绝对值 < 2 不写（取整的零头） |

每行先按原值加，最后各自取整；0 不写。排序：收入（正）从大到小在前，花销（负）从大到小在后，`other` 最后。
`vsYesterday` = 今天 `total` − `days` 里第 day − 1 天那份的 `total`（没有那份是 null）。

### 今天的人

候选：`isStaff`（在职、能指派，含总监）。
- `top`：`work ≥ 120`，按 work 降序（同分按 id），最多 3 个。
- `idle`：`idle ≥ 240`，按 idle 降序，最多 3 个（总监也算：他闲着也是信息）。
- `morale`：不算总监（总监没有情绪）；`morale0` 有值且 `morale ≤ morale0 − 1`，按 `morale − morale0` 升序，最多 3 个。
一个人可以同时在几组里。

### 明天（`DayTomorrow`）

```ts
{ day; weekday; season /* seasonOn(w, day) */; seasonStarts /* ≠ 今天的季节 */; weather /* = s.forecast.weather */;
  dirty: { court; level /* 明天会变成 */; now; why: MessKind }[];
  calendar: DayCalendarItem[]; daysLeft: number | null }
```
- **dirty**（明天没人扫会变差的球场）：对每块 `careActive` 的场——这块场的打扫岗位（写了 `care` 的岗位）此刻有人守着就跳过；
  `units` = 这个地点上此刻有人（`job` 是它）的、不写 `care` 的岗位个数；`hours = close − open`；
  `m'[k] = clamp(mess[k] + (weather[明天][k] × surface[面][k] + use[k] × units) × hours, 0, 1)`，`level' = levelFrom(usabilityFrom(m', 面))`；
  `level'` 比现在的档差（ok < meh < no）才放进来；`why` = `weights[面][k] × (m'[k] − mess[k])` 最大的那项（同分按 `MESS_KINDS` 顺序）。
  按 `level'`（no 在前）再按设施 id 排。不写 `rules.care` 的地图是 `[]`。
- **calendar**（和季节栏节拍 `project.ts beats()` 同一套规则，只看明天，按时刻排）：
  - `tournament`：`tournamentStatus` 里 `eligible || entered`、`days` 含明天的一期（`first` = 明天是 `days[0]`）；
    或者 `dayOf(signup) === 明天`（`signup: true`）。已经在日志里结算过的一期不算。
  - `hiring`：`s.cards.scheduled` 里卡的 `who === 'applicants'`、在明天的。
  - `card`：第一季的 `act.calendar` 里在明天的（投资方、期限）；时刻 ≥ 季末结算的不算（换成 `settle`）。
  - `settle`：写了 `ending`、第一季、`ending.day === 明天`。
- **daysLeft**：写了 `ending` 且第一季 → `max(0, ending.day − 明天)`；否则 null。

### 本周回顾（`WeekReview`，只有周日）

`s.days` 里 `week` 是这一周的那几份（含今天）加起来：`days`（第几天）、`money.total` 和 `money.lines`（按 kind + id 合并）、
`reputation`（Σ delta）、`members`（Σ delta）、`walkouts`、`service { demand, served, rate, trend }`（trend 每天的 rate，顺序同 days）、
`best` / `worst`（按每天 `money.total`，同分取早的那天）、`quality { before: 第一份的 before, after: 今天的 after }`。只报告，不算任何数。

## 变量（两边的 `COMPUTED_VARS` 名字都不变，只改意思；代理 A 改 sim `vars.ts` 和 content `compile.ts` 的注释）

| 变量 | 以前 | 现在 |
| --- | --- | --- |
| `service_rate` | 本周到现在（本周没需求用上周） | **今天到现在**（今天没需求用昨天的，昨天也没有是 0）：`todayRate(s)`（`day.ts`，已实现） |
| `service_demand` | 本周或上周有需求 | **今天或昨天**有需求：`todayHasDemand(s)` |
| `service_pass` | `rules.week.service_pass` | `rules.day.service_pass` |
| `service_season` | Σ `week` 日志 + 本周 | Σ `daily` 日志 + 没有 `review` 的旧 `week` 日志 + 今天（只给结局打分，W4 的分项意思不变） |
| `care.walkouts` | 这一周走掉的 | **今天**走掉的：`todayWalkouts(s)` |
| `cycles.<岗位>` | 这一周转了几圈 | 不变 |

- sim 导出的 `serviceRate(s)`、`hasDemand(s)`、`servicePass(w)` **名字不变**，改成上表的意思（游戏在用）。
- 派生量 `derived.service: round(service_rate * 100)` 照旧只在收盘时算（`systems.ts` 的 `WEEKLY_VARS` 正则改名 `CLOSE_VARS`，行为不变），
  所以 HUD 的"服务"现在是今天的服务率；质量目标里的 `stat.service * 0.2` 也跟着按天变（见"风险"）。
- 内容里的卡、星级、赛事没有一个条件读 `service_rate` / `service_demand` / `care.walkouts`（已查：只有 `rules` 和 `derived` 在用）；
  赛事的附加目标读 `event.service_rate`（赛事那几天自己的账），不受影响。

## 存档（Wave 0 已落地）

`SAVE_VERSION = 15`。迁移 14 → 15（`save.ts`）：`today ??= freshDay(state, dayOf(t), { last: week.last, lastDemand: week.lastDemand })`、
`memberCarry ??= 0`、`forecast ??= null`、`days ??= []`。读旧档那一周，读档之前几天的声望、会员**不补算**（那几天的周结算本该在周日做，现在不做了）；
今天的账从读档那一刻记起。代理 A 加字段就改这一个迁移，不再升版本。

## 游戏怎么停、怎么走（Wave 0 已落地，`apps/game/src/session.ts`）

```ts
settlement: DayReport | null        // 开着的结算卡；frame() / stepMinute() 不走时间（和 paused 一样，但不改 paused）；不存档
ackSettlement(): void               // 点完最后一页：关卡，下一帧起时间接着走
```
- `run()` 每走一分钟看一眼事件：有 `daySettled` 且这一局没结束 → `settlement = report`、`frac = 0`、这一帧不再往下走。
  同一分钟有 `requestPause` 也照样记 `paused`（两个都停）。
- 一批事件里有好几个 `daySettled`（`debugSkip` 跳了几天）只开最后一张。
- 这一局在收盘时结束（破产）：不开卡，结局卡接手。
- 次日开门的卡（招聘日等）在玩家点完结算卡后的下一分钟才打开，照旧自己暂停。
- 卡开着的时候：不能拖人、不能点地点牌（`main.ts` 拦掉地图指针）；HUD 的暂停、倍速按钮不响应（点了等于点卡）。
- 地图背后已经是第二天早上 8 点（模拟在同一个 tick 里跳过了夜里）：结算卡下面盖一层深色（夜色）遮罩，点完淡出，看起来是"天亮了"。
- **重放和机器人与卡无关**：模拟不等、不记命令；`bots.ts`、`sim-cli` 不改。

## 因果日志和快讯

- 因果日志每天一条 `daily`：
  - 因为（`text.ts` 的 because）：有需求 `ui.daily.because`（`{n}` 第几天、`{rate}`、`{pass}`），加上 `ui.settle.missed` 那半句（有才写）；
    没需求 `ui.daily.because_none`。
  - 所以（so）：照 `settled()` 的写法讲钱（`ui.settle.money.*`）、声望各项（`ui.terms.*`）、会员（撞上限 `ui.settle.capped` / `ui.settle.full`）、
    走掉的会员 `ui.care.week_walkouts` → 改用 `ui.daily.standing.walkouts`、不能打的场 `ui.daily.standing.unplayable`。
- 周日的 `week` 日志：因为改成 `ui.daily.because_week` / `because_week_none`，所以照旧（七天之和），它不再改数。
- "来龙去脉"（`story`）里 `daily` 只留最近一条（不然一天一条把别的挤掉）。
- 快讯：每天收盘一条 `ui.daily.wire`（`{n}`、`{rate}` = `ui.daily.wire_rate` 或 `wire_none`、`{what}` = 现金 · 声望 · 会员的变化），
  声望或会员掉了、或者今天有人走了 → `hot`。**周结算那条快讯（`ui.wire.week`）不再发**（回顾在卡上）。
- HUD 明细的服务率一行用 `ui.daily.ctx_service`（"今天服务率"）代替 `ui.ctx.service`；会所报告的会员上限读 `rules.day.member_cap`。

## 结算卡（代理 B，`packages/ui` + `apps/game`）

类型已落地（`packages/ui/src/hud/types.ts`）：`SettlementCardData { id; pages: SettlementPage[]; hint: { skip; next; week; done }; continueLabel }`、
`SettlementPage { id: 'day' | 'week'; title; subtitle?; sections }`、
`SettlementSection { id; title; rows: SettlementRow[]; total?; groups?; bars?; empty? }`、
`SettlementRow { id; label; value; from?; format: 'money' | 'signed' | 'int' | 'pct' | 'text'; digits?; text; note?; tone? }`、
`SettlementPerson { id; name; initials; color; head?; note; tone? }`；
`HudSnapshot.settlement?: SettlementCardData | null`；`HudActions.settlementDone?()`、`HudActions.settlementPerson?(person)`。
`project.ts` 把 `session.settlement`（`DayReport`）翻成 `SettlementCardData`（全部文字在这里拼好，ui 不读 i18n 键）。

### 版式（手机 390 × 844 竖屏优先）

- 全屏遮罩（深蓝夜色，透明度 0.6）+ 居中偏下的一张卡：宽 `min(100vw − 16px, 420px)`，高不超过 `78vh`，内容超出时卡内滚动。
  沿用 HUD 的配色、圆角和字号（事件卡 `EventCard` 那一套），标题和数字用像素字（HUD 里已有的像素字体；没有就 `image-rendering: pixelated`
  的位图字 / 等宽字，数字等宽不跳）。
- 第一页"第 12 天 · 周五收盘"（`ui.daily.title`），副标题：今天的天气（`ui.daily.weather.*`）· 现金。四节从上到下：
  1. **今天的钱**（`ui.daily.sections.money`）：每行 `label` 左、金额右（收入绿、花销红），最多显示 6 行、其余合进"其他"；
     底部合计 `ui.daily.money.total` 加粗，下面小字"比昨天 +$40"（`vs_yesterday` / `same_yesterday`）。
     行名：岗位 `posts.<id>.title`、设施 `ui.fac.<id>`（或 `T.facility`）、工单 `orders.<id>.title`、卡 `T.cardTitle`、赛事 `tournaments.<id>.title`。
  2. **口碑和会员**（`standing`）：两行大数（声望 `before → after`、`+0.27`，两位小数；会员 `42 → 43`、`+1`），
     各自下面一行小字讲为什么：声望的各项（`ui.terms.*` + 两位小数，0 不写）；会员的各项、撞上限 `capped`、被挡 `limited`、
     差一点 `carry`（carry ≥ 0.5 才写）。再一行服务率（`service` + 及格线 `pass` + `vs_yesterday`）、缺人最多 `missed`、不能打 `unplayable`、
     走掉 `walkouts`。`skipped` 时这一节只写 `ui.daily.standing.none`。
  3. **今天的人**（`people`）：三组（`top` 干得最多 / `idle` 一直闲着 / `morale` 士气在掉），每组一行横排像素头像（32 × 32 显示，最近邻放大），
     头像下面名字和一行小字（`work` / `idle_for` / `morale_drop`）。没人的组不显示；三组都空写 `ui.daily.people.none`。
     点头像 → `settlementPerson(id)`：可以什么都不做，或者在地图上亮一下这个人（卡不关）。点击目标 ≥ 44 px。
  4. **明天**（`tomorrow`）：天气图标 + `ui.daily.tomorrow.weather`；换季 `season`；会变脏的球场每块一行 `dirty`（`{level}` = `ui.care.level.*`，
     `{why}` = `ui.care.kinds.*` / 红土 `kinds_clay.*`）；日历每项一行（`tournament` / `tournament_first` / `tournament_signup` / `hiring` /
     `card`（`ui.beat.cards.<卡>` 或卡标题）/ `settle`，后面跟时刻）；最后一行 `days_left`（0 时 `last_day`）。什么都没有写 `nothing`。
- 周日第二页"第 2 周回顾"（`ui.daily.title_week`）：**本周的钱**（合计 + 按来源合并的前几行 + 最好 / 最差的一天 `week.best` / `week.worst`）、
  **本周口碑和会员**（`week.reputation`、`week.members`、`week.walkouts`、`week.service`）、**这一周的服务率**（`bars`：周一到周日七根柱子，
  没客人的那天画灰、写 `no_demand`；及格线一条横线）。页码 `ui.daily.page`。
- 底部提示条在拇指区（离底 ≥ 24 px），整条可点、高 ≥ 44 px：动画中 `hint.skip`（`tap_skip`），播完有下一页 `hint.week`（`tap_week`），
  最后一页 `hint.done` + 主按钮 `continueLabel`（`ui.daily.continue`）。

### 动画和点按

- 打开：遮罩淡入 200 ms，卡从下往上滑入 200 ms。各节依次出现（每节间隔 250 ms）；节里的数从 `from`（默认 0；声望、会员从 `before`）
  滚到 `value`，每个数 400 ms（ease-out），整页不超过 2.5 秒。滚动时每跳一档可以有像素闪一下，不要音效。
- **点卡上任何地方**（或 Space / Enter）：动画没播完 → 立刻跳到结尾（所有数是最终值）；播完了 → 有下一页翻页（第二页照样先播动画）、
  最后一页 → `settlementDone()` → `session.ackSettlement()`，遮罩淡出 300 ms。
- `prefers-reduced-motion`：不滚、不滑，直接显示结尾。
- 换了 `id`（第几天）才重播；同一张卡的快照每帧重建不能把动画打回开头（动画状态放 Preact 组件里，按 `id` 重置）。
- 结算卡开着时事件卡、底部说明、地点清单都让开（不渲染或盖在下面），员工条不响应。

### 像素头像（Wave 0 已落地，`@td/iso` 的 `personHead`）

`personHead(o: PersonOptions, rows = 9): BakedArt | null`：和地图上的小人同一张站立正面帧、同一套换色和发型，从头顶裁 9 行（头和肩）。
游戏用 `scene.ts` 的 `LOOKS[id]`（加上 `name`、`x: 0`、`z: 0`）调它，把 `px`（每像素一个 `Uint32`，0 透明，和 `IsoView` 的缓冲同一种打包）
画到小画布上，`toDataURL()` 缓存到人身上（外观不变就不重画），放进 `SettlementPerson.head`。没有外观的人用 `initials` + `color`。
48 × 48 的大肖像是以后的名册，这一版不做。

## 文案（Wave 0 已落地，`i18n/zh.yaml`、`en.yaml` 两种语言都有）

| 键 | 用途 |
| --- | --- |
| `ui.daily.title {n}{d}`、`title_week {n}`、`page {i}{n}` | 两页的标题、页码（`{d}` 用 `ui.days.<0..6>`） |
| `ui.daily.tap_skip`、`tap_next`、`tap_week`、`continue` | 底部提示和主按钮 |
| `ui.daily.weather.{sun,cloud,rain,wind,heat}` | 卡上的短天气名（`ui.weather.*` 带了说明，太长） |
| `ui.daily.sections.{money,standing,people,tomorrow,week_money,week_standing,week_trend}` | 节标题 |
| `ui.daily.money.{dues,facility,post,wages,upkeep,materials,card,event,other,total,cash,vs_yesterday,same_yesterday}` | 钱的行（`{place}`、`{post}`、`{order}`、`{card}`、`{title}`、`{d}`） |
| `ui.daily.standing.{reputation,members,service,pass,vs_yesterday,none,missed,unplayable,walkouts,capped,limited,carry}` | 口碑和会员 |
| `ui.daily.people.{top,idle,morale,work,idle_for,morale_drop,none,locate}` | 今天的人（`{time}`、`{from}`、`{to}`、`{name}`） |
| `ui.daily.tomorrow.{weather,season,dirty,dirty_why,tournament,tournament_first,tournament_signup,hiring,card,settle,days_left,last_day,nothing,at}` | 明天 |
| `ui.daily.week.{total,best,worst,reputation,members,walkouts,service,no_demand,days}` | 本周回顾 |
| `ui.daily.wire`、`wire_rate`、`wire_none`、`ctx_service` | 快讯、HUD 明细 |
| `ui.daily.because`、`because_none`、`because_week`、`because_week_none` | 因果日志 |
| `ui.terms.growth` | 会员 growth 项的名字（编译器要求 `rules.day` 的每项都有 `ui.terms.<项>`） |

占位符沿用 `text.ts`：`{time}` 时长格式、`{place}` 地点名、金额由代码写好（`+$120`、`−$45`）再填进 `{d}`、`{money}`。
要加新键：B 不改 YAML（文件归 A），在交付报告里列出键和两种语言的文字，合并时补；先用已有的键。

## 风险（只记下来，制作人没要平滑，这一版不加）

1. **一天的量很小**：声望一天零点几（卡上要两位小数才看得出），会员多半是 0、1、2。"今天排得好"的回报在卡上看得见，但不刺激。
   要调手感改 `rules.day` 的系数（例如服务项 × 2 / 7 → × 3 / 7），不要改结算方式。
2. **按今天算更跳**：服务率一天 0%、一天 100% 都可能（一个人被事件叫走半天）。已经有的边界：每天的量是周的七分之一；
   会员 growth 每天 `max(0, …)` 不倒扣；一天最多走掉 `max(8, 会员 × 25%) / 7`；没有需求的天不动。
   没有的：跨天平滑（制作人没要）。
3. **质量跟着跳**：`stat.service` 现在是今天的服务率，质量目标里 `service × 0.2` 一天能差 10 分；质量每天只往目标走 15%，所以质量本身一天
   约 ±1.5。以前周一收盘也是这样（周结算的服务率周一只算了一天），只是现在每天都这样。
4. **平衡会动**：每天各自 `max(0, …)` 比一周一次稍宽（会员略多）；走掉的会员以前一周不到 3 个不扣会员，现在按 1/3 个累计（略严）；
   开局没有需求的几周不再拿修复项的声望（★1、★2 可能晚一两天）。`balance.test.ts` 由代理 A 守住；守不住先回写这里、报给制作人，不擅自调。
5. **112 张卡**：一局每天一张，必须两下就能点过去；读档不恢复卡（存档里没有 UI 状态）。

## 文件归属（互不重叠）

| 代理 | 拥有（只有它改） | 不碰 |
| --- | --- | --- |
| **A** 模拟 + 内容 + 文档 | `packages/sim/**`（`day.ts` 实现、`systems.ts`、`week.ts`、`staff.ts`、`walk.ts`、`care.ts`、`vars.ts`、`save.ts`、测试）、`packages/content/**`（schema 删 `week`、编译器、全部 YAML 含 i18n、`generated/content.json`）、`apps/sim-cli/**`、`docs/**`（本文件"最终 schema"、ADR 0024 定稿、`game-design.md` 经济一节和节奏表"一周"那行） | `apps/game`、`packages/ui`、`packages/iso` |
| **B** 游戏和界面 | `apps/game/src/**`（`session.ts`、`project.ts`、`text.ts`、`main.ts`、`debug.ts`、`style.css`、测试）、`packages/ui/**`（新组件 `SettlementCard`、`Hud` 接上） | `packages/sim`、`packages/content`、`packages/iso`、`docs` |

共享点怎么交接：
- **冻结的类型**（Wave 0 落地的名字、字段、签名）谁都不改名、不删；A 可以加字段（`DayReport` 加了要回写这里），B 照旧编译。
- **i18n**：Wave 0 已经把这份契约要的键全放进去了；只有 A 改 YAML。
- **桩期间**：A 接上之前模拟不发 `daySettled`，`buildDayReport` 是结构对、数空的桩。B 写测试时自己造一份 `DayReport`
  （或者调 `buildDayReport(s, w, day)`），用 `new Session(...)` 再手动设 `session.settlement = report` 测卡、测停钟。
- **测试**：A 改 sim 里断言"周日改数"的测试（`sim.test.ts` 周结算一组、`care.test.ts` 周结算的 walkouts、`ending.test.ts` 的整季服务率）；
  B 改 `apps/game` 里用 `session.frame` 跨过收盘的测试（A 接上以后会停在结算卡上：循环里 `session.ackSettlement()`）。
- `iso` 的 `personHead` 已落地，这一轮谁都不改 iso。

## 验收

- `pnpm typecheck`、`pnpm test`（含 `balance.test.ts`）、`pnpm check:deps`、`pnpm lint`、`pnpm content --check` 都过；不跑确定性闸口和机器人报告。
- 手机竖屏：第 1 天 20:00 弹卡（4× 也停）；数字滚动，点一下到结尾，再点一下天亮、时间接着走；钱的各行加起来等于合计（差不过 $1）。
- 雨天或开局没岗位的那天：口碑和会员一节写"今天没有客人"，声望、会员没动。
- 卡上"明天晴"，第二天开门就是晴；同一种子的天气序列和改之前一样（A 加测试：关掉每日结算前后 30 天的天气相同）。
- 周日两页，第二页的七天之和等于七张卡各自的合计；周日不再一下子跳声望、会员；掉档照旧在周日。
- 读 14 版旧存档不报错；会员零头从 0 起；当天的账从读档起记。

## Wave 0 已落地

- `packages/sim/src/state.ts`：`DayState`、`DaySettlement`、`DayReport`、`DayMoneyKind`/`DayMoneyLine`、`DayPerson`、`DayCalendarItem`、`DayTomorrow`、
  `WeekReview`；`GameState.today / memberCarry / forecast / days`；`WeekState.rep? / members?`；`WeekSettlement.review?`；`Cause` 加 `daily`；`SAVE_VERSION = 15`。
- `packages/sim/src/day.ts`（新）：`freshDay`、`todayRate`、`todayHasDemand`、`todayWalkouts`（实现了，还没人调用）；`settleDay`、`forecastWeather`、
  `buildDayReport`、`weekReview`（桩，没接进 `closeDay`）。`index.ts` 导出 `buildDayReport`、`todayRate`、`weekReview`。
- `events.ts`：`daySettled`。`game.ts`：`newGame` 建 `today` 等字段。`save.ts`：迁移 14 → 15。**模拟行为和以前完全一样**（还是周结算在改数）。
- `packages/content`：schema `rules.day`（可选，和 `week` 并存到 A 删掉 `week`）；编译器校验 `rules.day` 的表达式和 `ui.terms.*`；
  `indian_wells.yaml` 写好了 `rules.day`（上面的数）；i18n 全部 `ui.daily.*` 和 `ui.terms.growth`。
- `packages/iso`：`people/head.ts` 的 `personHead`（加测试），`docs/design/iso-architecture.md` 已更新。
- `apps/game/src/session.ts`：`settlement`、`ackSettlement()`、收到 `daySettled` 停钟。
- `packages/ui/src/hud/types.ts`：`SettlementCardData` 等类型，`HudSnapshot.settlement?`、`HudActions.settlementDone? / settlementPerson?`。
- 文档：ADR 0024、CLAUDE.md 和 `game-design.md` 的准则 6、`docs/design/README.md` 索引。

## 最终 schema（实现完以后由代理 A 回写）

代理 A 2026-11-06 落地。上面各节的名字、字段、签名都没改；下面是**最终数值**和**新加的字段**（都是可选的加法，B 照旧编译）。

### 数值（`acts/indian_wells.yaml` 的 `rules.day`，和 Wave 0 一字不差，没调）

`service_pass: 0.5`；`reputation: { service: (service_rate - service_pass) * 2 / 7, quality: (stat.quality - 50) / 25 / 7,
restored: restored * 0.15 / 7, walkouts: -0.5 * care.walkouts }`；`members: { growth: max(0, (…) / 7 - (…) / 7), walkouts: -care.walkouts / 3 }`；
`member_cap` 和原来的 `week.member_cap` 一样；`member_loss_max: max(8, stat.members * 0.25) / 7`。
`rules.week` 已从 schema、编译器校验、YAML 里删掉（`member_drift` / `reputation_drift` 老写法不动）。

### 新加的字段

```ts
DayState.book?: { dues: number; wages: number; facilities: Record<facility, { income: number; upkeep: number }> }
  // bookDay 收盘时记的今天的会费、工资、每处设施的收入和维护费（按天、不取整）；结算卡的钱按它列（会员在结算后才变，事后再算会费就错了）
DaySettlement.members.terms?: Record<string, number>   // rules.day.members 各项（两位小数；写成一个表达式时只有 total）
DaySettlement.members.capped?: boolean                  // 撞了上限
DaySettlement.members.delta?: number                    // 会员实际变了几个（整数；被 0..500 截住时是截后的）
DaySettlement.skipped?: true                            // 今天没有需求：rep 是 {}、members.gain 是 0、不改数
```

`DaySettlement.members.carry` 是两位小数（讲给玩家）；精确的零头在 `GameState.memberCarry`。`loss_max` 只在被挡住时写（两位小数）。
`daily` 日志的 `effects`：先是只讲不改的 `stat cash`（今天 bookDay 的会费 + 设施收入 − 维护 − 工资，取整），再是实际改的 `stat members`、`stat reputation`。

### 新导出（`@td/sim` 没有新增入口导出；模块内）

- `vars.ts`：`walkoutsToday(s)`（变量 `care.walkouts`）、`facilityMoney(s, w)`（设施 → `{ income, upkeep }` 每周数，和 `facilityTotals` 同规则）。
- `day.ts`：`seasonOn` 挪到这里（`systems.ts` 照旧 `export { seasonOn }`，入口不变）、`weatherWeights`。`todayRate` / `todayHasDemand` /
  `todayWalkouts` 是 `vars.ts` 的 `serviceRate` / `hasDemand` / `walkoutsToday` 的别名（`vars` 不能反过来引用 `day`）。

### 行为细节（实现里定下来的）

- `buildDayReport` 在周日自己挂 `review`（把 `s.days` 里同一周的、加上这一份算），`closeDay` 只 push、截到 7 份、发 `daySettled`；直接调它也拿得到回顾。
- `reputation.delta` = 收盘声望 − 开门声望（含当天卡、工单的零头，两位小数）；`terms` 只有每日结算的各项。`members.delta` 同理（整数）。
- 钱的行：同一 kind + id 合并后取整，0 不写；`other` = total − Σ 行，|other| ≥ 2 才写；排序：收入从大到小 → 花销绝对值从大到小 → `other`。
  `card` 行 = `option` / `default` 日志里 `stat cash` 之和 − `cost` 记录（卡的花费直接扣现金、只记 `cost`）。
- `people.morale` 要 `today.morale0` 里有这个人（开门时在职）；`top` / `idle` 的候选是 `isStaff`（含总监）。
- `tomorrow.dirty` 的"此刻有人"按 `job`（不看在不在路上）；`now` 按此刻的脏乱算档（不读存下的 `level`）。
- `tomorrow.calendar` 的赛事：比赛日要 `eligible || entered`；报名日（`signup: true`）要 `eligible` 且还没接下。比赛日的 `start`：
  第一个比赛日是这一期的 `start`，之后的比赛日是那天的赛事开始时刻。
- `openDay` 开头 `freshDay`（prev 按契约）；`s.forecast` 用过就清成 null（不管季节有没有天气表）。
- 整季服务率 `service_season` = Σ `daily` + Σ 没有 `review` 的旧 `week` + 今天。

### 测试

`packages/sim/src/day.test.ts`：普通的一天按今天的各项动声望、会员；没需求的一天什么都不动；走掉的会员当天罚；零头攒到明天；
上限挡住且不攒零头；周日回顾等于七天之和、周日只按周日一天变、`settleWeek` 不改任何状态量；`days` 只留 7 份；预告 = 第二天的天气，
且 seed 1 的 30 天天气序列和改之前（开门时抽）逐日相同（序列是用改之前的代码跑出来钉住的）；报告每节都有（钱按来源、合计差 < $2、
和昨天比、今天的人、明天的天气/脏场/日历/离季末）；读 14 版存档。`sim.test.ts`、`care.test.ts`、`ending.test.ts` 原来断言周结算改数的用例改成按天，意图不变。
