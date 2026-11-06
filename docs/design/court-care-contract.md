# 场地养护接口契约：场地可用度、打扫、亲手扫、门口等人、酷热

规则来源：制作人 2026-11-04 拍板（把 sandbox 的场地养护 demo 做进正式游戏），ADR 0022，玩法准则 2、4、5、6。
demo：`apps/sandbox/demo-court.html`，代码 `apps/sandbox/src/demos/court/`，笔记 `docs/lab/2026-11-04-playability/demos/06-court-care/notes-r2.md`。
Wave 0 已经落地了**类型和桩**（见文末"Wave 0 已落地"），四个实现代理照这份文件并行做，文件归属互不重叠（"文件归属"一节）。
做完以后代理 A 把最终 schema 和数值回写到这份文件的"最终 schema"一节（下游只认这份文件）。1000 局确定性闸口暂停，不要跑 `pnpm sim determinism`。

## 名字（全局固定）

### 球场

只有这五处设施有可用度（`rules.care.courts`）。新地（W5）上的南场、学院岛练习场不是设施，这一版没有可用度。

| 设施 id | 地点（锚点） | 面 | 变体换面 | 修好的档（`stateDef.courts > 0`） | 场地数 |
| --- | --- | --- | --- | --- | --- |
| `outer_1` | `outer_1` 会员场 | `hard` | — | `playable`、`resurfaced` | 1 |
| `outer_23` | `outer_23` 红土场 | `clay` | `hard` → `hard` | `playable` | 2 |
| `practice` | `practice` 青训场 | `hard` | — | `open` | 2 |
| `stadium_1` | `stadium_1` 中心球场 | `hard` | — | `restored` | 1 |
| `stadium_3` | `stadium_3` 匹克球场 | `pickleball` | `tennis2` → `hard` | `open` | 1（`tennis2` 是 2） |

- **开着**（`careActive`）= 在表里、这一档 `courts > 0`、没在改造。没开的场（废墟、停用、改造中）脏乱冻住不变，可用度当 100、档当能打，不画、不挡岗位。
- 面 `surfaceOf(s, w, f)` = `courts[f].variants[s.variants[f]] ?? courts[f].surface`。

### 五种脏乱（`MESS_KINDS`，各 0..1）

| 键 | 中文 | 硬地 / 匹克球上画成 | 红土上画成 | 主要来源 | 小游戏工具（硬地 / 红土） |
| --- | --- | --- | --- | --- | --- |
| `sand` | 积沙 | 沙堆、薄沙 | 同左 | 大风、沙尘暴卡 | 扫把 `broom` / 扫把 `broom` |
| `water` | 积水（红土：泥水） | 水洼、反光 | 深色湿泥、小水洼 | 下雨（晴、风、热会晒干） | 推水 `squeegee` / 压路滚 `roller` |
| `litter` | 球和垃圾 | 网球、瓶子、落叶 | 同左 | 有人打球 | 捡 `pick` / 捡 `pick` |
| `lines` | 线褪了（红土：线带被盖住） | 白线发灰、断续 | 线带被红土盖住 | 酷热、有人打球 | 画线车 `paint` / 画线车 `paint`（扫线带） |
| `cracks` | 裂缝（红土：干裂） | 裂纹 | 发白的干裂斑块 | 酷热（红土 × 2.5） | 压路滚 `roller` / 洒水 `water` |

### 三档（`CareLevel`）

| 档 | 条件（可用度 u） | 画面和界面 | 模拟 |
| --- | --- | --- | --- |
| `ok` 能打 | u ≥ `ok_at`（70） | 地点牌上绿色小记号 | 照常 |
| `meh` 勉强 | `no_below` ≤ u < `ok_at` | 琥珀色记号；偶尔有人抱怨（气泡） | 照常营业，有需求的岗位有人在岗的一分钟只算 `meh_service`（0.6）个服务到 |
| `no` 不能打 | u < `no_below`（40） | 红色记号；门口站着等的会员、抱怨气泡 | 球场上的岗位停转（打扫岗位除外），有需求的岗位这一分钟算需求、不算服务到；门口等人、等满了走人 |

**可用度** u = clamp(100 − 100 × Σₖ `weights[面][k]` × mess[k], 0, 100)，不取整（日志和事件里取整）。玩家永远看不到这个数。

### 天气：酷热 `heat`

- `Weather = 'sun' | 'cloud' | 'rain' | 'wind' | 'heat'`（`@td/content` 的 `WEATHERS`；sim 的 `GameState.weather`、`SimEvent weather`、条件 `{ weather: heat }` 都认）。
- 季节权重 `weather.<季节>.heat`，不写是 0（老内容抽出来的天气和以前完全一样：heat 排在抽签表最后、权重 0）。
- Indian Wells 初值（代理 A 写进 YAML）：`autumn heat: 2`、`winter heat: 0`、`spring heat: 1`。
- 酷热只影响可用度（线褪、开裂、晒干积水）和画面（天色偏暖发白、地面热浪）；不关场、不改别的数。HUD 图标、文案 `ui.weather.heat` 已落地。

### 打扫工单和打扫岗位

| 种类 | id | 地点 | 说明 |
| --- | --- | --- | --- |
| 打扫工单 | `care_outer_1`、`care_outer_23`、`care_practice`、`care_stadium_1`、`care_stadium_3` | 同名设施的锚点 | `orders/care_<设施>.yaml`，一个文件一张；文案 `orders.care_<设施>` 已落地 |
| 打扫岗位 | `o1_upkeep`、`o23_upkeep`、`pr_upkeep`、`st1_upkeep`、`st3_upkeep` | 已有的维护岗位 | 加一个字段 `care: 0.04` |

## 内容（`packages/content`，代理 A）

### `acts/indian_wells.yaml` 的 `rules.care`（schema 已落地：`careRules`）

```yaml
rules:
  care:
    courts:
      outer_1: { surface: hard }
      outer_23: { surface: clay, variants: { hard: hard } }
      practice: { surface: hard }
      stadium_1: { surface: hard }
      stadium_3: { surface: pickleball, variants: { tennis2: hard } }
    ok_at: 70
    no_below: 40
    # 每一单位脏乱扣多少可用度（× 100）
    weights:
      hard:       { sand: 0.6,  water: 0.8, litter: 0.3,  lines: 0.35, cracks: 0.5 }
      clay:       { sand: 0.45, water: 0.7, litter: 0.3,  lines: 0.4,  cracks: 0.6 }
      pickleball: { sand: 0.6,  water: 0.8, litter: 0.35, lines: 0.3,  cracks: 0.5 }
    # 营业时间里每小时的增减（负数 = 自己变干净）；乘 surface[面][k]（不写是 1），结果截在 0..1
    weather:
      sun:   { sand: 0.004, water: -0.10 }
      cloud: { sand: 0.004, water: -0.05 }
      wind:  { sand: 0.05, litter: 0.01, water: -0.12 }
      rain:  { water: 0.09 }
      heat:  { lines: 0.02, cracks: 0.012, water: -0.20 }
    surface:
      clay: { cracks: 2.5, lines: 1.5, water: 0.8 }
    # 每有一个"在用这块场"的岗位在干活，每小时加多少
    use: { litter: 0.02, lines: 0.002, cracks: 0.001 }
    order_below: 85
    meh_service: 0.6
    patience: 90m
    walkout_max_day: 3
    waiting_per_post: 2
    waiting_max: 6
    grumble_every: 2h
    hand:
      base: 15
      per: { sand: 90, water: 60, litter: 45, lines: 120, cracks: 90 }
      min: 10
      max: 240
```

读数（初值，机器人校准时可以改，改了回写这里）：
- 一个大风天（12 营业小时）沙 +0.6 → 硬地可用度 64（勉强）；连着两天没人扫 → 不能打。
- 下一整天雨，积水 ≈ 1 → 20（不能打）；第二天晴天上午约 5 小时晒到勉强。雨后早上推水是这条机制最常见的"该你出手"。
- 会员场一天约 11 个打球小时：垃圾 +0.22/天（−6.6）。没人管 4–5 天到勉强。
- 酷热一天：硬地 −16 左右，红土约 −36（红土要洒水，两天不管就不能打）。
- 一名维护 62 的人守打扫岗位：每圈每项 −0.04 × 1.12 ≈ −0.045，一天约 −0.54，平常的晴天顶得住，大风天顶不住。

### 周结算（`rules.week`，代理 A 改 YAML）

```yaml
week:
  reputation:
    walkouts: "-0.5 * care.walkouts"        # 文案 ui.terms.walkouts 已落地
  members: >-
    <原来的表达式> - floor(care.walkouts / 3)
```

### 岗位和工单的新字段（schema 已落地）

```yaml
# posts/o1_upkeep.yaml（另外四个维护岗位同样）
care: 0.04       # 每圈每项清掉 care × (0.5 + worker.skill / 100)；写了 care 的岗位在"不能打"的场上照样转

# orders/care_outer_1.yaml（另外四张照写，at 换成自己的锚点）
id: care_outer_1
act: indian_wells
at: outer_1
skill: upkeep
work: 4h
crew: 2
care: { clean: 0.7 }
performance: workday   # 或者代理 D 在 perform.ts 配的新演出名
```

- 打扫工单**不写 `when`**：模拟按"场开着，并且（已经开工 或 可用度 < `order_below`）"决定出不出现（开了工就一直在，做完为止，不会因为扫到一半可用度回到 85 以上而作废）。写了 `when` 也再与上它。
- 不扣材料费、不加状况（`restore: 0`）、没有冷却（做完以后可用度又掉下来就再冒出来）。

### 效果 `mess`（schema、编译器校验已落地）

```yaml
- { mess: outer_1, add: { sand: 0.7 } }    # 各项可以是负数；截在 0..1；不是球场什么都不做
```

沙尘暴卡 `iw_sandstorm` 的 B（不管）加：`{ mess: outer_1, add: { sand: 0.7 } }`、`{ mess: outer_23, add: { sand: 0.6 }, if: { facility: outer_23, is: playable } }`、
`{ mess: practice, add: { sand: 0.5 }, if: { facility: practice, is: open } }`（原来的 `condition` 扣分保留）。

### 表达式变量（两边的变量表已同步：`COMPUTED_VARS` 和 sim `vars.ts`）

| 变量 | 值 |
| --- | --- |
| `usability.<设施>` | 0..100（不取整）；不是球场或没开 = 100。正则 `USABILITY_VAR`，编译器只认设施 id |
| `care.waiting` | 此刻在门口等的会员一共几个 |
| `care.walkouts` | 这一周走掉的会员（周日收盘结算以后清零） |
| `care.worst` | 开着的球场里最低的可用度（没有开着的球场 = 100） |

没写 `rules.care` 的地图：`care.waiting` 0、`care.walkouts` 0、`care.worst` 100、`usability.*` 100。

## 模拟（`packages/sim`，代理 A）

### 状态（已落地，`state.ts`）

```ts
export type CourtMess = Record<MessKind, number>;         // MessKind = 'sand' | 'water' | 'litter' | 'lines' | 'cracks'
export type CareLevel = 'ok' | 'meh' | 'no';
export interface CourtCare {
  mess: CourtMess;
  level: CareLevel;                                      // 上一次 careSystem 算出的档
  waiting: { since: number; n: number } | null;          // 不能打时门口等的会员；每走一个 since 重新计
  walkoutsToday: number;                                 // 收盘清零
  grumbled: number | null;                               // 上一次抱怨的时刻
}
GameState.care: Record<string, CourtCare>;               // 设施 id → ；只有 rules.care.courts 里的设施
GameState.weather: Weather;
WeekState.walkouts?: number;                             // 本周走掉的会员（变量 care.walkouts）
WeekState.unplayable?: Record<string, number>;           // 岗位 → 本周因为场地不能打没服务到的分钟（不记进 missed）
WeekSettlement.walkouts?: number;
WeekSettlement.unplayable?: { court: string; minutes: number } | null;   // 挡掉分钟最多的那块场
OrderState.care0?: CourtMess;                            // 打扫工单开工那一刻的脏乱
Cause += { kind: 'care'; court; minutes; before; after; cleared: Partial<Record<MessKind, number>> }
       | { kind: 'walkout'; court; waited }
EffectRecord += { kind: 'mess'; facility; delta: Partial<Record<MessKind, number>> }
CareResult = { cleared: Partial<Record<MessKind, number>> }   // 每项清掉了开始时的几成 0..1
```

- 状态里不存可用度（按 mess 和面现算），只存档 `level`（换档发事件用）。
- 全程**不用随机数**（不消耗 `s.rng`）：除了酷热改了天气表，同一种子的局面和以前一样展开。

### 模块（不许循环引用，depcruise 管）

| 文件 | 放什么 | 能引用 |
| --- | --- | --- |
| `mess.ts`（叶子，已落地并实现） | `CLEAN`、`freshCare`、`careCourts`、`initCare`、`surfaceOf`、`messOf`、`usabilityFrom`、`levelFrom`、`addMess` | 只有 content、state、world 的类型 |
| `vars.ts`（查询已落地） | `careActive`、`usabilityOf`、`careLevelOf`、`careWorst`、`careWaiting`（已实现）、`careBlocksPost`（桩） | mess |
| `care.ts`（桩） | `canCare`、`careMinutes`、`careEstimate`、`careSystem`、`careCloseDay`、`careFinish` | staff、walk、effects、vars、mess |
| `staff.ts` | 岗位停转、打扫岗位每圈清、打扫工单出现和按进度清 | vars、mess（**不能**引用 care.ts） |
| `effects.ts` | 效果 `mess`（调 `addMess`，记 `mess` 记录） | mess |

### 每个 tick（`systems.ts`，顺序已落地）

`… → staffSystem → careSystem → activitySystem → …`；收盘 `closeDay` 在衰减之前调 `careCloseDay`。

**staffSystem 里（staff.ts）：**
1. `postSystem`：岗位所在的地点是开着的球场、档是 `no`、岗位没写 `care` → `careBlocksPost` 为真：
   有需求的岗位这一分钟 `demand += 1`、不加 `served`、`unplayable[岗位] += 1`（不记 `missed`）；不转圈（`s.posts[id]` 不涨，不结算效果、不磨损）；
   赛事那几天 `trackEventMinute(…, busy = false)`。人留在岗位上（不 `released`）。
   档是 `meh`、有人在岗：`served += meh_service`（可以是小数）代替 `+1`。`careBlocksPost` 读 `s.care[f].level`（上一个 tick 的档）。
2. `finishCycle`：岗位写了 `care` → 这块场每项 `addMess(−care × speedOf(skill))`；变化合进当天岗位账（`mess` 记录，同一设施的 delta 按项相加）。
3. `orderVisible`：工单写了 `care` → 见上面"不写 when"的规则。开工那一刻记 `care0 = { ...mess }`。
   每分钟进度涨 Δ（在场的人 `speedOf` 之和）时，每项 `addMess(−care0[k] × clean × Δ / work)`。做满照常 `finishOrder`（因果日志 `order`、成长）；
   A 可以在那条日志的 effects 里补一条 `mess` 汇总。

**careSystem（care.ts）**，对每块 `careActive` 的球场（缺条目先 `initCare`）：
1. **天气**：每项 `addMess(weather[今天][k] × surface[面][k] / 60)`。
2. **使用**：units = 这个地点上此刻在干活（`working`）、存在、在时段里、没写 `care`、没被挡住的岗位个数；每项 `addMess(use[k] × units / 60)`。
3. **换档**：按新的可用度算档，和 `level` 不同就发 `careLevel`、存下来。
4. **门口等人**（档是 `no`）：blocked = 这个地点上存在、在时段里的有需求岗位个数（有没有人在岗都算）；n = min(`waiting_max`, blocked × `waiting_per_post`)。
   - n > 0 且没人等 → `waiting = { since: t, n }`，发 `membersWaiting`；n 变了 → 改 n，发 `membersWaiting`。
   - `t − since ≥ patience` 且 `walkoutsToday < walkout_max_day` → 走一个：`walkoutsToday += 1`、`week.walkouts += 1`、
     因果日志 `{ kind: 'walkout', court, waited }`（没有效果）、发 `memberWalkedOut`，`since = t`。
   - 档不是 `no` 或 n = 0 而门口有人 → `waiting = null`，发 `waitingEnded { reason: 'playable' }`。
5. **抱怨**（档是 `meh`、units > 0、距上一次 ≥ `grumble_every` 或从没抱怨过）→ 发 `careGrumble`、`grumbled = t`。不写日志。

没开的球场：这一分钟什么都不加；如果门口还有人（场地刚停用），`waitingEnded { reason: 'playable' }`。

**careCloseDay**：门口有人的发 `waitingEnded { reason: 'closed' }`（回家，不算走掉）、`waiting = null`；`walkoutsToday = 0`；`grumbled = null`。夜里不模拟，脏乱过夜不变。

**周结算（week.ts）**：`WeekSettlement.walkouts = week.walkouts ?? 0`；`unplayable` = 按岗位所在设施合计 `week.unplayable`，取最多的那块（同分取 id 小的，没有是 null）。
声望、会员的扣分在 YAML 的表达式里（上面"周结算"）。新的一周 `walkouts: 0`、`unplayable: {}`。

### 命令（已落地，`game.ts`）

```ts
| { type: 'careFinish'; court: string; result: CareResult }
| { type: 'debugMess'; court: string; mess: Partial<Record<MessKind, number>> }   // 已实现：把几项直接设成给的值
```

只有一条正式命令：小游戏期间游戏时间停着（不 tick），开始时什么都不发，做完发 `careFinish`，放弃什么都不发。重放只需要这一条。

**`canCare(s, w, f): CareBlock`**（界面在打开小游戏前问，`careFinish` 用同一条规则；按这个顺序判）：

| 返回 | 条件 |
| --- | --- |
| `'over'` | `s.outcome` 不为空 |
| `'court'` | `f` 不在 `rules.care.courts` |
| `'inactive'` | 不是 `careActive` |
| `'busy'` | 总监没在职、或者 `errand` 不为空（事件、上一次亲手扫还没完） |
| `'rain'` | 今天下雨 |
| `'clean'` | Σₖ mess[k] < 0.03 |
| `null` | 可以扫 |

总监手上有岗位或工单、正在走路都可以扫（像卡的 errand 一样把他叫走，岗位这一圈作废）。

**`careMinutes(s, w, f, r): { work; walk; total }`**（总监的工时；纯函数，界面拿它预告，`careFinish` 用同一个）：

```
c[k]   = clamp(r.cleared[k], 0, 1)（不是有限数当 0）
raw    = hand.base + Σₖ hand.per[k] × mess[k] × c[k]
speed  = speedOf(workSkill(s, w, DIRECTOR, 'upkeep'))      // 0.5 + 维护 / 100，算特质
courts = max(1, stateDef(s, w, f).courts)
work   = round(clamp(raw / speed × (1 + 0.5 × (courts − 1)), hand.min, hand.max))
walk   = 总监走到 f 的锚点要几分钟（和 sendErrand 用同一条路：在路上的从路上算，已经在那儿是 0）
total  = work + walk
```

`careEstimate(s, w, f)` = `careMinutes` 每项都清掉 1（地点清单"亲手扫"按钮上的代价提示，已落地）。
例：大风天傍晚的会员场（沙 0.5、垃圾 0.2），总监维护 35：work = (15 + 45 + 9) / 0.85 ≈ 81 分钟，加走路。
同一块场派一名维护 62 的员工做打扫工单约 214 分钟、只扫掉七成；两个人约 107 分钟。

**`careFinish(ctx, f, r)`**：
1. `canCare` 不是 null → 拒绝（返回 false，命令不进日志）。
2. before = round(可用度)；m = 结算时的 mess；每项 `addMess(−m[k] × c[k])`。
3. 重新算档：变了就发 `careLevel`、存下来；不再是 `no` 而门口有人 → `waitingEnded { reason: 'playable' }`、`waiting = null`。
4. `sendErrand(ctx, DIRECTOR, 锚点, work)`（走过去、在场上待 work 分钟；期间 `canAssign` 给 `busy`）。
5. 因果日志 `{ kind: 'care', court: f, minutes: total, before, after: round(新可用度), cleared: 只写 > 0 的项 }`，
   effects：`{ kind: 'errand', person: 'director', at, minutes: work }`、`{ kind: 'mess', facility: f, delta }`。
6. 总监的维护能力按干完一张工单涨一次（和 `finishOrder` 的 `grow` 一样；A 把 `grow` 导出或在 staff.ts 加一个导出函数）。
7. 发 `careDone { court, before, after, minutes: total }`，返回 true。

数在命令那一刻就改了（玩家刚刚亲眼看着扫干净）；画面上总监随后走过去、在场上忙 work 分钟（演出由代理 D 配）。

### 领域事件（已落地，`events.ts`）

```ts
| { type: 'weather'; weather: Weather }
| { type: 'careLevel'; court: string; from: CareLevel; to: CareLevel; usability: number }   // usability 取整，只给测试和调试面板
| { type: 'careDone'; court: string; before: number; after: number; minutes: number }
| { type: 'membersWaiting'; court: string; n: number }
| { type: 'waitingEnded'; court: string; waited: number; reason: 'playable' | 'closed' }
| { type: 'memberWalkedOut'; court: string; waited: number }
| { type: 'careGrumble'; court: string }
```

`court` 一律是设施 id（地点锚点和设施 id 在这五处一样）。

### 存档（已落地）

`SAVE_VERSION = 14`。迁移 13 → 14：`state.care ??= {}`、`week.walkouts ??= 0`、`week.unplayable ??= {}`。迁移读不到内容，
模拟用到时 `initCare` 按 `rules.care.courts` 补全（全干净、能打）。`newGame` 已调 `initCare`。

### 机器人和平衡（代理 A）

- `bots.ts`：普通玩家机器人把闲着的维护工派到出现了的打扫工单上（和别的工单一样的优先级规则，档是 `no` 的优先）；
  good / average 档在总监闲着、某块场是 `no` 或 `meh` 时偶尔发 `careFinish`（`cleared` 每项 0.9 / 0.75 / 0.6 按档），novice 不发。
- 重跑 `pnpm sim bots --games 200 > docs/balance/indian-wells.md`；`balance.test.ts` 的区间守住（变了先回写这里、说明原因）。
- 新测试（sim）：可用度公式和档；天气 / 使用累积；`careBlocksPost` 让服务率掉、不出收入；等人、走人（每天封顶）、收盘回家；
  打扫工单的出现 / 不作废 / 按进度清；`careFinish` 校验、工时公式、errand；周结算的 walkouts 项；迁移 13 → 14；
  没写 `rules.care` 的内容行为和以前一样；`COMPUTED_VARS` 两边一致。

## 画面（`@td/iso`，代理 B）

### 接口（已落地，`site/site.ts`）

```ts
export interface CourtMessLook { sand; water; litter; lines; cracks: number }      // 和 sim 的 CourtMess 同构，游戏直接传 s.care[f].mess
Site.gates?: Readonly<Record<string, XZ>>;                                          // 球场锚点 → 门外等人的点（围网外、步道上、不挡门）
createOverlays(w): {
  …
  mess?(facility: string, mess: CourtMessLook | null): void;   // 画在这处设施的所有球场上；null 不画（小游戏接管时）
  repaint?(): void;                                            // 立刻整个重做地面和静态节点（已实现：rebuild(rt, true)）
}
createSky(w).update(dt, now, rain, wind?, heat?)                // heat 0..1
Daylight.update(minute, rain, heat?)                            // heat 0..1
```

### 要做

- `site/indian-wells/mess.ts`（新文件）：照 demo `draw.ts` 的 `createOverlay` / `buildCells` 的样子（0.2 米纹素对齐、`Custom` 叠层逐像素反投影、
  走深度缓冲），按 `CourtMessLook` 的量画沙、水洼（红土：湿泥）、球瓶落叶、褪色的线（盖在地面贴图的白线上压灰、断续）、裂缝（红土：干裂发白）。
  分布用自己的种子随机流（每块场固定），量越大铺得越开（每块碎屑一个门槛，和 `wear.ts` 一样），所以量变时画面连续、不跳。
  面按 `variant()` 给的变体定（`outer_23` 的 hard、`stadium_3` 的 pickle4 / tennis2 用 `courtsFor`）。量变不到 0.01 不重画。
- `createFacilityOverlays` 的 `mess` 接上它（Wave 0 是空桩）。设施没修好时不画。
- `wear.ts`：五处球场的磨损信号**不再画沙和垃圾**（留给可用度），只画杂草和旧面斑驳；非球场设施不变。
- `Site.gates`：在 `layout.ts` 末尾追加五个门外点（不挪已有的步道和站位，不改构建顺序）。
- 天色：`daylightAt(minute, rain, heat = 0)` 白天偏暖、地平线发白（夜里不变）；`createDaylight` 透传。
- 远景（可选）：`heat` 时地面热浪（每帧画，不进静态层）。
- sandbox 场景查看器加"脏乱"（五个滑杆或几档预设）和"酷热"开关，能写进 URL；更新截图并说明原因。
- `docs/design/iso-architecture.md`：Site 接口的这几处改动。
- 测试：`mess` 不认识的设施、null、重复同样的值不重烘；量为 0 时没有像素。

## 界面和游戏（`apps/game`、`packages/ui`）

### 小游戏（代理 C）：`apps/game/src/care/`

从 demo 搬过来改：`model.ts`（数值网格，由 `CourtMessLook` 和面生成）、`draw.ts`（叠层、工具、准星）、`art.ts`、`index.ts`、`care.css`、`care.test.ts`。
只引用 `@td/iso`、`@td/sim`、`@td/shared` 的入口，不引用 sandbox 的代码。

```ts
// apps/game/src/care/index.ts
export interface CareDeps {
  world: IsoWorld;                   // main.ts 的 stage
  camera: IsoCamera;                 // stage.camera
  site: Site;
  session: () => Session;            // 读档会换 Session、热重载会换内容和文案，这三样用 getter
  content: () => ContentBundle;
  text: () => Text;                  // apps/game/src/text.ts 的 Text
  host: HTMLElement;                 // main.ts 的 container（#stage）：小游戏在里面挂自己的全屏 DOM 层，挡住地图的指针事件
  stage(facility: string | null): void;   // = scene.careStage（代理 D 实现）
}
export interface CareGame {
  readonly active: string | null;    // 正在扫的设施
  open(facility: string): boolean;   // canCare 不是 null 就返回 false、什么都不做
  update(dt: number): void;          // 每帧，真实秒（游戏时间停着）
  close(): void;                     // 放弃：不发命令、还原
}
export function createCare(d: CareDeps): CareGame;
```

流程：
1. `open(f)`：`canCare` 通过 → 先拍外面画着的快照（`mess.snapshot(f, messOf(s, f))`，见下"小游戏和外面同步"）→
   `session.care = f`（时间停）→ `stage(f, 快照的 key)`（场景只藏起扫的这块场的脏乱叠层，同一处设施别的场照画；藏真总监、门口的会员和打球的人）→
   记下镜头，镜头对准 `site.courtsFor(f, variant)[0]` 铺满屏宽、不能平移 → `document.body.classList.add('td-care')` → 建模型和叠层。
2. 模型照快照摆：每格的沙、水、裂缝 / 干裂、褪了的线、每件垃圾（位置、样子）都取外面画着的那一格、那一件，量也是画面上的量；
   只给这块场上看得见的脏乱配工具（见"五种脏乱"的工具列）；匹克球场用匹克球的线（13.41 × 6.10 米）。
   地图不提供快照时（`Site.createOverlays` 没有 `messSnapshot`）才退回按 `messOf(s, f)` 用 `mulberry32(s.seed ^ s.t ^ hash(f))` 随机摆。
3. 只有一块场画进小游戏（`courtsFor(...)[0]`，对上离它最近的那份快照）；同一处设施的另一片场原样画着、扫不到。
4. "收工"：这块场每项 `剩下 / 开始`，按整处设施画面上的多少折算（另一片场算"一点没动"，`facilityLeft`）→
   `cleared[k] = 1 − 折算后剩下的`（开始是 0 的项不写）→ 底部卡片预告"清掉了 p% · 总监还要在场上忙 {time}"（`careMinutes`）→
   `session().careFinish(f, { cleared })`（当场交给模拟，返回收没收）→ 收了就 `mess.rebase(f, [扫剩下的, 别的场原样], messOf(s, f))` → 还原（见下）。
   "不扫了"：直接还原，不发命令、不交回。
5. 还原：拿掉自己的节点 → `world` 上的 `overlays.repaint?.()` 由 `stage(null)` 做 → 镜头回到原处 → 去掉 `td-care` → `session.care = null`。
- 手感、音效、粒子、收尾一口气清光照 demo 第二轮；不做"开场第一场"和客人耐心牌（正式游戏里那是门口的会员，代理 D 画）。
- 时间：小游戏不设倒计时（游戏时间停着，代价是之后的工时）；可以显示"已经扫了多久"（真实秒），不影响数。

#### 小游戏和外面同步（2026-11-06 修）

外面看到的脏乱和小游戏里扫的必须是同一份东西：进去不跳、不换位置，出来剩下的留在原地、扫掉的不再出现。

- **一格怎么画只有一份**：`@td/iso` 的 `site/mess-look.ts`（`messCell`、`MESS_DAY`、`MESS_PROPS`）。地图的叠层和小游戏的叠层都用它画每一格、画垃圾，
  夜里都逐格 `nightP`。小游戏自己的东西（引导线、刚画好的线、画在沙上的脏线、画歪的白点）只是盖在线那一层上的颜色。
- **快照**（`MessCourtSnapshot`）：一块场在世界格子（0.2 米，和地面纹素对齐）上画面里的量——沙的厚度、水深、裂缝清楚程度、红土干裂、线发灰和褪掉多少、
  画着的垃圾（编号、位置、样子）。`Site.createOverlays().messSnapshot(f, fallback)` 给这处设施每块场一份。
- **交回**：`messRebase(f, courts, amounts)`。地图按扫剩下的样子重排门槛：沙、水、干裂、线这些连续的量直接解出门槛（按清完以后的量画出来正好是剩下的），
  一格格有没有的（硬地裂缝、垃圾）剩下的挤到量以下、扫掉的挤到量以上。之后量再涨（风、使用），扫掉的地方先回来；再退（员工打扫），照常一点点退。
  门槛只是画面，不存档；读档以后按地图的种子重新铺（和以前一样）。
- **只藏一块场**：`messFocus(f, key)`；`scene.careStage(f, key)` 接上，别的场照 `s.care[f].mess` 画（时间停着，不会变）。
- **当场交给模拟**：`Session.careFinish` 不等下一帧，当场 `advance`（事件留到下一次 `frame()` 交出去），还原时外面已经是清完以后的量，不闪回。
- 画面上的小变化：硬地裂缝过了门槛以后在 0.04 的量里淡入（以前是一下子冒出来），交回时才能照剩下的清楚程度画。
- 还对不上的：画歪的白点（小游戏的惩罚）只在小游戏里画，出来就没了；球网的松紧外面不画。

`session.ts`（代理 C）：
```ts
care: string | null = null;                   // 小游戏开着：frame() 不走游戏时间（和 paused 一样，但不改 paused）
careFinish(court: string, result: CareResult): void   // send({ type: 'careFinish', court, result })；care = null
```

### 场景、园区、HUD、地点牌、文案（代理 D）

- `scene.ts`：
  - 每帧对开着的球场 `overlays.mess?.(f, s.care[f].mess)`（没开的、`careStage` 接管的传 null）。
  - `careStage(facility: string | null): void`（加到 scene 返回的对象上，给代理 C）：给设施 → 那块场 `mess(f, null)`、藏真总监、
    暂停那块场上的演出和路人；null → `overlays.repaint?.()`、全部还原。
  - 天色、远景传 `heat`（`s.weather === 'heat' ? 1 : 0`，淡入淡出随意）；`performInput` 的 weather 认 `heat`。
  - 亲手扫的 errand 期间总监在那块场上做扫场的演出（`perform.ts` 配，或者人物的姿势循环）。
- `life.ts`：档是 `no` 的场不上会员自己打球；`membersWaiting` 时在 `site.gates?.[锚点] ?? site.stands[锚点]` 站 n 个会员（`Person`，走过来），
  隔一会儿冒 `ui.care.grumble.<0..4>` 的气泡（`SpriteLayer`）；`memberWalkedOut` 时其中一个转身沿步道走向大门、消失；`waitingEnded` 时
  playable → 他们进场打球，closed → 走向大门。`careGrumble` 在那块场上打球的人头上冒一句。
- `project.ts`：
  - `hub()` 加 `care: CareLevel | null`（开着的球场才有）；`main.ts` 地点牌 HTML 加 `<span class="hb-care hb-care-{ok|meh|no}">`（能打绿、勉强琥珀、不能打红，
    三档都显示，不写数）。
  - `placeSheet()` 加 `care: { level; kinds: string[]（场上有的脏乱的名字，红土用 kinds_clay，不带数）; hand: { ok: boolean; why: string | null; minutes: number } } | null`；
    `PlaceSheetData`（packages/ui）同步。"亲手扫"按钮显示 `ui.care.hand` + `hand_cost`（`careEstimate` 的 total）+ `hand_note`；`canCare` 不通过时置灰、写 `ui.care.why.*`。
  - 快讯：`careLevel` 到 `no`（`wire_no`，why = 主要的那一项脏乱名）、从 `no` 回到 `ok`（`wire_ok`）；`memberWalkedOut`（`wire_walkout`）；`careDone`（`wire_done`）。
    `meh` 只在第一次进入时上一条 `wire_meh`，别刷屏。
- `text.ts`：因果日志 `care`（`because_care`）、`walkout`（`because_walkout`）、效果记录 `mess`；周结算多两行 `week_walkouts`、`week_unplayable`（有才写）。
- `main.ts`：接上小游戏（见下）；`PlaceSheet` 的"亲手扫"动作 → `care.open(设施)`。
- `packages/ui`：`PlaceSheet` 的场地一节和按钮（≥ 44 px，拇指区）；HUD 的酷热图标（Wave 0 放了一个占位的 SVG 路径，可以换）。
- `debug.ts`：调试面板加"弄脏场地"（`debugMess`：沙 / 水 / 垃圾 / 线 / 裂缝各一键设到 0.8，一键清空）。

`main.ts` 里接小游戏要加的（代理 D 写，名字照这里）：
```ts
import { createCare } from './care';
const care = createCare({
  world: stage,
  camera,
  site,
  session: () => session,
  content: () => content,
  text: () => text,
  host: container,
  stage: (f) => scene.careStage(f),
});
// PlaceSheet actions：onCare: (anchor) => care.open(anchor)
// 每帧：care.update(dt)；care.active 时不做镜头自动对焦、不处理地图上的拖人和点地点牌
```

## 文案（已落地，`i18n/zh.yaml`、`en.yaml`，两种语言都有）

| 键 | 用途 |
| --- | --- |
| `ui.weather.heat` | 季节栏天气 |
| `ui.terms.walkouts` | 周结算声望分项 |
| `orders.care_<设施>.title / note` | 五张打扫工单 |
| `ui.care.level.{ok,meh,no}`、`ui.care.sign` | 地点牌记号的无障碍名字 |
| `ui.care.kinds.*`、`ui.care.kinds_clay.*` | 脏乱的名字（硬地 / 红土） |
| `ui.care.hand`、`hand_cost {time}`、`hand_note`、`ui.care.why.{court,inactive,busy,rain,clean,over}` | 地点清单的"亲手扫" |
| `ui.care.waiting {n}`、`walkout`、`grumble.{0..4}` | 门口的会员和气泡 |
| `ui.care.wire_{no,meh,ok,walkout,done}` | 快讯 |
| `ui.care.because_{care,walkout}`、`week_{walkouts,unplayable}` | 因果日志和周结算 |
| `ui.care.game.{title,start,finish,quit,left,clean,done}`、`ui.care.game.tools.*`、`ui.care.game.hint.*` | 小游戏 |

占位符：`{place}` 地点名、`{time}` 时长（`text.ts` 现有的时长格式）、`{n}`、`{p}`、`{why}`、`{list}`、`{level}`。
要加新键：C、D 不改 YAML（文件归 A），在交付报告里列出键和两种语言的文字，合并时补；先用已有的键。

## 文件归属（互不重叠）

| 代理 | 拥有（只有它改） | 不碰 |
| --- | --- | --- |
| **A** 模拟 + 内容 + 平衡 | `packages/sim/**`、`packages/content/**`（schema、编译器、全部 YAML 含 i18n、`generated/content.json`）、`apps/sim-cli/**`、`docs/balance/**`、`docs/design/game-design.md`（加"场地可用度"一节）、本文件的"最终 schema"一节 | apps/game、iso、ui |
| **B** 画面 | `packages/iso/**`、`apps/sandbox/**`（查看器；demo 原样保留）、`docs/design/iso-architecture.md`、截图 | sim、content、apps/game |
| **C** 小游戏 | `apps/game/src/care/**`（新）、`apps/game/src/session.ts` | main.ts、scene.ts 等其余 apps/game 文件 |
| **D** 游戏里的其余部分 | `apps/game/src/` 里除 `care/**`、`session.ts` 以外的全部（`main.ts`、`project.ts`、`scene.ts`、`life.ts`、`labels.ts`、`text.ts`、`perform.ts`、`debug.ts`、`style.css`、测试）、`packages/ui/**` | sim、content、iso、care/ |

共享点怎么交接：
- **冻结的类型**（Wave 0 已落地的名字、字段、签名）谁都不改名、不删；A 可以加字段，加了回写这里。
- **i18n**：Wave 0 已经把这份契约要的键全放进去了；只有 A 改 YAML，C、D 缺字报给合并的人。
- **main.ts 接小游戏**：D 照上面的代码块写；C 保证 `createCare` 的签名一致。
- **scene.careStage**：D 照上面的行为实现；C 只调它。
- **iso 的 `mess` / `repaint` / `gates` / `heat`**：签名已落地，B 实现前是空桩，C、D 照签名调用（桩期间画面上看不到脏乱，不影响编译）。
- **sim 的 care 函数**：签名已落地，A 实现前 `canCare` 一律返回 `'court'`、`careMinutes` 返回 0；C、D 写测试时用 `debugMess` 造局面、等 A 合进来再跑通。

## 验收

- `pnpm typecheck`、`pnpm test`、`pnpm check:deps`、`pnpm lint`、`pnpm content --check` 都过；不跑确定性闸口。
- 手机竖屏（390 × 844）上：大风天之后会员场画面上有沙、地点牌变琥珀；第二天不管它变红、门口站着会员冒气泡、一个半小时走一个、快讯有一条；
  拖人上打扫工单，沙一点点少下去、牌子变回绿；点地点牌"亲手扫"，扫完回来总监走过去忙一阵，期间拖不动他；周日的周结算里有"走掉的会员"。
- 酷热天：天色偏暖，红土一天就勉强、线发灰；洒水能救回来。
- 读 13 版的旧存档不报错，球场全干净、能打。

## Wave 0 已落地

- `packages/content/src/schema.ts`：`WEATHERS`/`Weather`、`MESS_KINDS`/`MessKind`、`SURFACES`/`Surface`、`messAmounts`、`careRules`（`act.rules.care`，可选）、
  岗位 `care`、工单 `care`、效果 `mess`、条件 `weather` 认 heat、季节权重 `heat`（可选）。
- `packages/content/src/compile.ts`：`COMPUTED_VARS` 加 `care.waiting`、`care.walkouts`、`care.worst`；`USABILITY_VAR`；效果 `mess` 和 `rules.care.courts` 的校验。
- `packages/sim/src`：`state.ts`（上面的全部类型，`SAVE_VERSION` 14）、`events.ts`、`game.ts`（两条命令；`debugMess` 已实现）、`save.ts`（13 → 14）、
  `mess.ts`（已实现）、`vars.ts`（查询已实现、`careBlocksPost` 桩，变量 `usability.*`、`care.*`）、`care.ts`（桩）、`systems.ts`（天气抽签认 heat、调用顺序）、
  `effects.ts`（`mess` 分支是空桩）、`index.ts` 导出。
- `packages/iso`：`CourtMessLook`、`Site.gates`、`mess?`、`repaint?`（Indian Wells 的 `repaint` 已实现，`mess` 是空桩）、天色和远景的 `heat` 参数（只在接口上）。
- `packages/ui`：HUD 天气类型认 heat，占位图标。
- i18n：上表的全部键。

## 最终 schema（实现完以后由代理 A 回写）

代理 A 2026-11-04 实现完、机器人 200 局校准后的定稿。和上文不一样的地方以这里为准。

### 数值（`acts/indian_wells.yaml` 的 `rules.care`；改动处标 ←）

```yaml
care:
  courts: （同上文）
  ok_at: 70
  no_below: 40
  weights: （同上文）
  weather:
    sun:   { sand: 0.002, water: -0.10 }           # ← 0.004：晴天也积沙太快，打扫工单每两天一张
    cloud: { sand: 0.002, water: -0.05 }           # ← 0.004
    wind:  { sand: 0.04, litter: 0.01, water: -0.12 }   # ← 0.05：一天没人扫 ≈ 67（勉强），两天 ≈ 35（不能打）
    rain:  { water: 0.05 }                         # ← 0.09：一整天雨 ≈ 52（勉强）、连着两天才不能打；
                                                   #   0.09 时每个雨天五块场都不能打、各走 3 个，玩家没法应对（下雨不能亲手扫）
    heat:  { lines: 0.02, cracks: 0.012, water: -0.20 }
  surface: { clay: { cracks: 2.5, lines: 1.5, water: 0.8 } }
  use: { litter: 0.01, lines: 0.002, cracks: 0.001 }   # ← litter 0.02：会员场一天约 −3.3
  order_below: 80                                  # ← 85
  meh_service: 0.7                                 # ← 0.6
  patience: 90m
  walkout_max_day: 3
  waiting_per_post: 2
  waiting_max: 6
  grumble_every: 2h
  hand: { base: 15, per: { sand: 90, water: 60, litter: 45, lines: 120, cracks: 90 }, min: 10, max: 240 }
weather（季节权重）: autumn heat 2、winter heat 0、spring heat 1
week.reputation.walkouts: "-0.5 * care.walkouts"；week.members 末尾 "- floor(care.walkouts / 3)"（在 max(0, …) 外面）
```

- 打扫工单 `orders/care_<设施>.yaml`：`work: 2h`（← 4h）、`crew: 2`、`care: { clean: 0.7 }`、`performance: sweep`（代理 D 的演出）。
  一名维护 62 的员工约 107 分钟、两个人约 54 分钟。
- 五个维护岗位 `care: 0.06`（← 0.04）：维护 62 的人每圈每项 −0.067，一天约 −0.8，平常日子和雨后顶得住、大风天差一点。
- 新的 i18n 键：`ui.care.log_mess`（`{place}扫掉了{list}` / `{place}: cleared {list}`）、`ui.care.game.tools.net`、
  `ui.care.game.hint.{net,roller_clay,paint_clay}`、`ui.care.game.fx.*`（代理 C 要的 15 个）。

### 加的类型和导出（没有改名、删字段）

- `Cause` 加了 `{ kind: 'care'; court; minutes; before; after; cleared }`、`{ kind: 'walkout'; court; waited }`（`state.ts`）。
- `PostState.credit?: number`：勉强能打时这一圈实际记上的服务分钟（被拉走时退回它；一直能打不写）。
- `OrderState.careCleared?: Partial<CourtMess>`：打扫工单到现在清掉的量；做完时合成一条 `mess` 记录写进 `order` 日志。
- `World.postsAt: Map<地点, Post[]>`。
- `vars.ts`：`careLevelAtPost(s, w, post): CareLevel`（`careBlocksPost` = 它 === 'no'）。`staff.ts`：`grow` 导出。
- 命令 `{ type: 'debugWeather'; weather: Weather }`：把今天的天气换掉、发 `weather` 事件、写一条 debug 日志（能重放）。
- 机器人：`runGame(…, { observe?(s) })`；`HumanProfile.hand?: number`（good 0.9、average 0.75、novice 不写）；greedy 亲手扫 0.6。
  机器人派打扫工单的价值 = (100 − 可用度) / 4，不能打 × 2，还能打且 ≥ 70 × 0.5；亲手扫只在不能打、或勉强且低于 55 时。

### 行为上的说明

- 赛事（LG-11）的服务率、到岗率：勉强算满（`trackEventMinute` 拿到 busy = 有人在干、没被挡住）；只有不能打算没服务到。
- `careSystem` 里"使用"和"被挡住的岗位"按上一分钟的档数（和 `postSystem` 一样），换档后下一分钟才开始等人；
  `careFinish`、换档到能打 / 勉强时门口的人立刻 `waitingEnded playable`。
- 周结算的 `walkouts`、`unplayable` 只在地图写了 `rules.care` 时写。
- 机器人 200 局（内容 5fcfad2f）：greedy 能打 92.4% / 勉强 7.4% / 不能打 0.1%，平均分 15950 → 14757；good 81.8 / 16.2 / 2.0%，
  14415 → 12816；average 79.2 / 18.0 / 2.7%，13604 → 11511；novice 72.1 / 22.3 / 5.6%，12032 → 8814；cautious 5915 → 5943。
  `balance.test.ts` 的区间都过（greedy S/A 98.5%）。人类档整体掉一档（good 多半 B），结局档没动，留给制作人定。
- 报告 `docs/balance/indian-wells.md` 多一节"场地可用度"：各档时间占比、每局走掉的会员、亲手扫次数、打扫工单张数。

