# Wave 1 接口契约：修复变体、升级改造（B1）和星级（P1）

Wave 1 的几路（模拟、内容、界面、画面）按这份同时开工。规则来源：`game-design.md` 的"修复分叉、升级和改造""星级"，ADR 0020。
**模拟这一路做完以后，把最终的 schema 和字段名回写到这里**（下游只认这份文件）。

## 名字（全局固定）

### 变体（设施 → 变体 id）

| 设施 | 变体 A | 变体 B | 画面要点 |
| --- | --- | --- | --- |
| `outer_23` 红土场 | `clay` 保留红土 | `hard` 改成硬地 | 红土 vs 蓝绿硬地 |
| `clubhouse` 会所 | `cafe` 咖啡吧 | `physio` 理疗室 | 露台遮阳伞和咖啡招牌 vs 白色理疗间、冰桶、按摩床 |
| `stadium_3` 匹克球场 | `pickle4` 四片匹克球 | `tennis2` 两片网球场 | 四片小场 vs 两片标准网球场 |
| `practice` 青训场 | `academy` 学院 | `bootcamp` 晨间训练营 | 发球机、学员看板 vs 体能器械、标志桶、跑道 |
| `plaza` 棕榈喷泉 | `nightlife` 夜场 | `shade_lawn` 遮阳观赛坡 | 串灯和吧台 vs 遮阳帆和草坡看台 |
| `stadium_2` 泳池 | `resort` 度假 | `recovery` 冷水恢复池 | 躺椅和小木屋 vs 冷水池、计时钟、毛巾架 |

`outer_1`、`stadium_1` 不分叉。

### 升级（设施 → 升级 id，每处一个）

| 设施 | 升级 id | 开的前提（草案，内容一路定数值） | 画面 |
| --- | --- | --- | --- |
| `outer_23` | `tournament_clay`（仅 clay） / `pro_hard`（仅 hard） | 维护 ≥ 75 的人 | 新线、记分牌、场边伞 |
| `clubhouse` | `pro_shop` | 服务 ≥ 65 | 球拍架和店招 |
| `stadium_3` | `league_lights` | — | 灯杆 |
| `practice` | `video_wall` | 教学 ≥ 65 | 场边大屏 |
| `plaza` | `misters` | — | 喷雾杆 |
| `stadium_2` | `cabanas` | — | 小木屋一排 |

改造 = 花钱换成同一设施的另一个变体，停用一周（状态先进入原有的停用档或新的 `remodel` 档，由模拟一路定）。

## 状态（模拟）

- 设施：`variant?: string`（第一个人到场、扣材料费时锁定）、`upgrades: string[]`。
- 牌匾：`plaque: { facility: string; variant?: string; leader: string; day: number }[]`（修好一处加一行，自动记录）。
- 星级：`stars: number`（0–5，已经达到的最高星，不往回掉）；`trophies: number`。
- 存档加版本和迁移。

计算变量（`COMPUTED_VARS` 两边一致）：`stars`、`trophies`，以及内容需要的 `variant.<facility>` 判定（写法由模拟一路定，例如条件 `variant: { facility: outer_23, is: hard }`）。

领域事件：`variant_locked {facility, variant}`、`upgrade_done {facility, upgrade}`、`remodel_started/done {facility, variant}`、`plaque_added {facility, leader, day}`、`star_up {stars, opens: string[]}`。

P1 的奖杯：现有的外出赛事 `pl_tournament` 赢了 +1；新加一张最小的"月度内赛"工单（★1 开，在球场办，办成 +1 奖杯、算"办成过 1 次内赛"）。完整的赛事日历和临时岗位留给 P2。

## 画面（iso Site 覆盖层）

`site.createOverlays(world)` 返回的对象增加（都可选，游戏判空再调）：

```ts
variant?(facility: string, variant: string | null): void;      // 这处设施修成/要修成哪个变体（影响修好以后各档的画面）
preview?(facility: string, variant: string | null): void;      // 在当前样子上叠这个变体修好后的半透明预览（Bayer 抖动溶解约 45%）；null 关掉
upgrade?(facility: string, upgrade: string, on: boolean): void;
stars?(n: number, animate: boolean): void;                      // 大门星级牌 0–5；animate 时播升星特效
plaque?(rows: readonly { facility: string; leader: string; day: number }[]): void; // 大门牌匾
```

`set(facility, state)` 不变；变体通过 `variant()` 先设好，再 `set()` 状态。升星时游戏把镜头转到大门（`site.anchors.entrance`）。

## 界面（HUD 快照，project.ts → packages/ui）

- 状态条：星级格（几颗星 + 下一星还差几项，点开明细列出每一条、满足没有），替代"复原 x/8"。
- 地点清单：有变体的修复工单显示两行变体（名字、换来、付出），点一行开预览，把人拖到那一行开工；不加面板。
- 快讯：升星、变体锁定、牌匾。

---

## 最终 schema（模拟一路已实现，LG-14、LG-10；以这一节为准）

上面"状态（模拟）"一节是草案；字段名以这里为准。没写变体、升级、星级的内容行为和以前完全一样。

### 内容：设施的变体和升级（`facilities.yaml`）

```yaml
- id: outer_23
  anchor: outer_23
  states:
    ruined: {}
    playable: { courts: 2, quality: 9, upkeep_week: 30, decay_day: 5, drops_to: worn }
    worn: { upkeep_week: 10 }
  # 变体：id → 对各状态的覆盖（写了的字段替换基础值：courts、rain_ok、quality、income_week、upkeep_week、decay_day、drops_to）。
  # 第一个是默认变体（机器人、没指明变体的指派用它）
  variants:
    clay: {}
    hard: { states: { playable: { decay_day: 3, income_week: 40 } } }
  # 升级：id → 只给哪个变体（不写 = 都行）、对各状态的加成（数值相加：courts、quality、income_week、upkeep_week、decay_day）
  upgrades:
    tournament_clay: { variant: clay, states: { playable: { quality: 3, income_week: 60 } } }
    pro_hard: { variant: hard, states: { playable: { quality: 3 } } }
```

实际数值 = 基础状态 → 换上变体覆盖 → 加上已装升级（`stateDef(s, w, facility)`）。文案：`variants.<设施>.<变体>`、`upgrades.<设施>.<升级>`（两种语言，编译器检查）。

### 内容：变体修复工单（`orders/*.yaml`）

```yaml
id: o23_repair
at: outer_23            # 工单落在这个地点的设施上
cost: 900
work: 12h
effects:
  - { facility: outer_23, set: playable }
# 变体：id 必须在设施的 variants 里；每个可以另写 cost、work 和追加的 effects（接在 effects 后面执行）
variants:
  clay: {}
  hard: { cost: 1200, work: 14h, effects: [{ stat: reputation, add: 1 }] }
```

- 把人拖到某一行：命令 `{ type: 'assign', person, target: 'o23_repair', variant: 'hard' }`。还没开工时可以改选（同一个人拖到另一行只换变体）。
- 第一个人到场、扣材料费（按那个变体的 cost）时锁定：`state.variants[facility] = variant`，发 `variant_locked`。锁定后只能按锁定的变体加人（另一个变体 → `canAssign` 给 `'variant'`；不写 variant 就是加入）。

### 内容：变体条件、升级条件、变量

```yaml
when: { all: [{ facility: outer_23, is: playable }, { variant: outer_23, is: hard }] }   # is: none = 还没选过
when: { upgrade: clubhouse, has: pro_shop }
when: { expr: 'variant.outer_23 == "clay" && stars >= 2' }   # variant.<设施> 是字符串，没选过是 ''
```

### 内容：升级工单（能力门槛）

```yaml
id: o23_pro_clay
at: outer_23
skill: upkeep
work: 6h
cost: 400
when: { facility: outer_23, is: playable }
upgrade: tournament_clay     # 做完装上；已装过、或者设施不是这个升级要的变体时，工单自动不出现
worker: { upkeep: 75 }       # 只有底子（不算特质）维护 ≥ 75 的人能干；不够 → canAssign 给 'skill'
```

`worker` 可以写在任何工单上（teach / upkeep / service / play）。

### 内容：改造工单

```yaml
id: o23_to_hard
at: outer_23
skill: upkeep
work: 4h
cost: 1500
when: { facility: outer_23, is: playable }
remodel: hard        # 做完以后设施停用 closed_for（默认 7d），期满换成这个变体
closed_for: 7d
```

- 已经是这个变体、还没选过变体、或者正在改造时，工单自动不出现。
- 停用期间：`state.remodels[facility] = { variant, until }`；不算场地、质量、收入（维护费照付），这个地点的岗位和工单都不开，状况不掉、不掉档；设施状态字符串不变。
- 期满：换变体，只给旧变体的升级拆掉，写一条因果日志 `{ kind: 'remodel', facility, variant }`，发 `remodel_done`。

### 内容：星级（`acts/<地图>.yaml`）和内赛

```yaml
stars:                       # 第 i 项 = 升到 ★(i+1) 的清单，最多 5 项
  - requires:                # 条 id → 条件（现有条件语言），全部满足才升
      court: { facility: outer_1, is: playable }
      members_5: { stat: members, gte: 5 }
    opens: [internal_cup]    # 升上来开出的机制（只是键：内容里用 stars >= N 去开）
  - requires:
      clubhouse: { facility: clubhouse, is: open }
      restored_3: { expr: "restored >= 3" }
      members_20: { stat: members, gte: 20 }
      cup_once: { flag: hosted_cup }
    opens: [regional]
  - requires:
      restored_5: { expr: "restored >= 5" }
      # 橡皮筋：第 12 周（第 78 天）起会员、声望门槛 ×0.8，直接写在表达式里
      members_45: { expr: "stat.members >= (day >= 78 ? 36 : 45)" }
      rep_30: { expr: "stat.reputation >= (day >= 78 ? 24 : 30)" }
      trophies_2: { expr: "trophies >= 2" }
    opens: [invitational, sponsor, exhibition_prep]
```

- 文案：`stars.items.<条 id>`、`stars.opens.<键>`（两种语言，编译器检查）。星级名字放 `ui.*`。
- 表演赛条件写 `{ expr: "stars >= 4" }`。
- 奖杯：新效果 `{ trophy: 1 }`（可带 if / chance）。外出赛事 `pl_tournament` 的 onSuccess 加一条 `{ trophy: 1 }`。
- 月度内赛不需要新的工单类型，就是一张普通工单：

```yaml
id: cup_monthly
at: outer_1
skill: service
work: 4h
cost: 150
cooldown: 28d
when: { expr: "stars >= 1" }
effects:
  - { trophy: 1 }
  - { flag: hosted_cup, set: true }   # "办成过 1 次内赛"
  - { stat: reputation, add: 2 }
```

### 状态（`GameState`，存档版本 8，7 → 8 有迁移）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `variants` | `Record<facility, variant>` | 修成（或锁定了正在修成）的变体；没选过的设施不在表里 |
| `upgrades` | `Record<facility, string[]>` | 装上的升级，按先后 |
| `remodels` | `Record<facility, { variant, until }>` | 正在改造（停用）的设施 |
| `picks` | `Record<order, variant>` | 还没开工的变体工单，玩家拖向的那一行（开工时锁定并拿掉） |
| `plaque` | `PlaqueRow[]` | 牌匾 |
| `stars` | `number` | 0–5，只往上 |
| `trophies` | `number` | 奖杯数 |
| `orders[id].variant / by / mins` | | 锁定的变体、每人做了多少工作量、有人在干的分钟数（停工期间保留） |
| `repairs?` | `Record<facility, { by, mins, work }>` | 还没上牌匾的设施：修它的所有工单累计的每人工作量、分钟数、已做完工单的名义工作量（牌匾带队按它定） |

`PlaqueRow = { facility, variant?, leader, crew: string[], day, minutes, work, order }`：一处设施**第一次修好**（见下面"修好了"的定义）时由修好它的那张工单（`order`）自动记一行。`leader` = 修这处设施做得最多的人，`crew` 按做的多少排——工作量按这处设施第一次修好之前**所有**工单累计（`state.repairs[facility] = { by, mins, work }`：挖沙 → 铺场这样分几张工单修的、中途停工再由别人接着干的，每人的账都留着），不是只看最后那张；`minutes` 是这些工单上有人在干的分钟数，`work` 是它们的名义工作量之和（能力 50 的一个人要干的分钟），快讯的"快了几小时"用 `work − minutes` 讲。一处设施只记一行（重开、改造不再记、也不再累计）；记上牌匾后 `repairs[facility]` 拿掉。

**"修好了"只有一个定义**（`isRestored(s, w, facility)`，`@td/sim` 的 vars.ts）：状态和开局不同、这一档质量 > 0、而且没在改造。扫完沙、挖完沙这些中间状态不算；掉档停用（`worn`，质量 0）不算，`*_reopen` 重开后又算；改造停用期间不算，期满又算。变量 `restored`（星级的"修好 N 处"、声望的周结算项）、HUD 的复原 `stat.restoration`（幕规则 `derived: restoration: restored`）和牌匾都用它。`stat.restoration` 这类只读此刻状态的派生量每分钟同步（读 `service_rate` / `service_demand` 的派生量照旧收盘才算），所以复原数和星级清单永远一致。

计算变量（`COMPUTED_VARS` 两边一致）：`stars`、`trophies`；另有 `variant.<设施>`（`VARIANT_VAR`）。

### 领域事件（`SimEvent`）

```ts
{ type: 'variant_locked'; facility; variant; order }
{ type: 'upgrade_done'; facility; upgrade; order }
{ type: 'remodel_started'; facility; variant; until }
{ type: 'remodel_done'; facility; variant }
{ type: 'plaque_added' } & PlaqueRow
{ type: 'star_up'; stars; opens: string[] }
```

因果日志：升星是一条 `cause: { kind: 'star', stars, opens }`；改造期满 `cause: { kind: 'remodel', facility, variant }`。工单那条日志的 effects 里多几种记录：`{ kind: 'variant', facility, variant }`、`{ kind: 'upgrade', facility, upgrade }`、`{ kind: 'remodel', facility, variant, until }`、`{ kind: 'plaque', facility, leader }`、`{ kind: 'trophy', delta }`。

### 给界面和游戏的函数（`@td/sim`）

- `orderStatus(s, w, o)` 多了：`variants: string[] | null`、`variant`（锁定的 / 拖向的 / 默认的）、`locked`、`worker`（门槛）、`upgrade`、`remodel`；`cost`、`work` 按当前变体算。
- `orderCost(s, o, variant?)`、`orderWork(s, o, variant?)`、`orderVariants(o)`、`orderVariant(s, o)`、`orderFacility(w, o)`、`meetsWorker(s, id, o)`、`remodelMinutes(o)`。
- `canAssign(s, w, person, target, variant?)`：新原因 `'skill'`（能力不到 worker 门槛）、`'variant'`（不是这张工单的变体，或者和已锁定的不一样）。
- `stateDef(s, w, facility)`：此刻这一档的实际数值；`remodeling(s, facility)`。
- `starStatus(s, w)` → `{ stars, max, next: { level, items: { id, met }[], missing, opens } | null }`（状态条的星级格和明细）。

星级每 10 分钟、每天收盘时、以及效果 `endAct` 结束这一局之前各检查一次，满足就升（可以连升，每星各发一次 `star_up`、各写一条升星日志），不暂停。所以表演赛办成（同一串效果里先设 `exhibition_done` 再 `endAct`）时 ★5 一定在 `actEnded` 之前升上来。机器人：变体工单 greedy / cautious 选第一个变体，human 按自己的种子随机挑一个、想好不改；升级工单按 +40 分估价，只派够门槛的人；改造不主动做。
