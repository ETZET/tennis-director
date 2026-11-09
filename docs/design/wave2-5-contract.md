# Wave 2–5 接口契约：赛事阶梯和选路（W2）、员工成长（W3）、结局和第二季（W4）、地图长大（W5）

> **2026-11-08 起：** 画面改成 3D 像素（ADR 0027），本文的"画面（iso）"一节作废；模拟、内容、界面和 W2–W5 的"最终 schema"仍是 `packages/sim` 的现状。文中说的 `game-design.md` 规则来源，现在是归档的 [`docs/archive/pre-3d/game-design-v0.5.md`](../archive/pre-3d/game-design-v0.5.md)。
>
> **2026-11-09 起：** 本文定的整套（赛事和选路、员工成长、结局和第二季、地块）属于归档的 2.5D 主线（[`main-line-2.5d.md`](../archive/pre-3d/main-line-2.5d.md)），游戏流程重新设计中；模拟照旧按它跑，重新设计定了再删改。

规则来源：`game-design.md` 的"推进结构""赛事阶梯""三次选路""五种钥匙""结局""地图怎么长大"，ADR 0020、0021。
2026-11-03 用户拍板：人-14 照草案（路名和各开什么照设计文档），人-18 采纳 ADR 0021，人-17 开地数值由机器人校准，人-13 **派去工单的人做完以前不被习惯拉走，做完回到上一个岗位**。
每个 wave 的模拟一路做完以后，把最终 schema 和字段名回写到这份文件的对应小节（下游只认这份文件）。1000 局确定性闸口暂停（`testing.md`），不要跑。

## 名字（全局固定）

### 赛事（W2）

| id | 种类 | 地点 | 说明 |
| --- | --- | --- | --- |
| `cup_monthly` | 主办 | 会员场或红土场 | 已有工单改成按日历：第 3、7、11、15 周周六；占两块场一整天 |
| `regional_open` | 外出 | 大门 | 地区业余赛，第 5、9、13 周；★3 起双打要两名球员 |
| `junior_regional` | 外出 | 大门 | 地区青少年赛，第 8、12 周；教练带队 |
| `invitational` | 主办 | 红土场 + 会所 + 棕榈喷泉 | 第 10、13 周周末；认场地（`inv_clay` 并进来：红土变体时是红土邀请赛，硬地时是硬地邀请赛，奖励不同） |
| `exhibition` | 主办 | 中心球场 | 已有；★3 起挂出四期筹备 |

临时岗位 id：`t_checkin`（签到，服务）、`t_umpire`（裁判，教学）、`t_courtside`（场边服务）、`t_catering`（餐饮）。
表演赛四期筹备工单 id：`prep_stands`（看台）、`prep_lights`（夜场灯）、`prep_service`（球童和服务）、`prep_media`（赞助或转播）。
重复参赛：第二次起奖励减半、附加目标换一个。

### 选路（W2；★3、★4 的路在 W5 决定开哪块地）

| 星级 | 路 A | 路 B |
| --- | --- | --- |
| ★2 | `youth` 青训之路：学院、理疗室的变体先开；招聘日多教练 | `resort` 度假之路：咖啡吧、泳池度假的变体先开；周末客人多 |
| ★3 | `south_courts` 南场：收回高尔夫西段，填塘铺两片新场 | `oasis_lawn` 绿洲草坪：同一块地留水塘，盖三间小屋和小泳池庭院 |
| ★4 | `event_plaza` 赛事广场：南停车场改观赛坡，岛在东南角长出新地放车位 | `academy_isle` 学院岛：东南天上的小岛靠岸，搭一座桥 |

选路卡在升星时来，一天倒计时，不选由 Dale 定（默认 A）。W2 先让 ★2 的路真正生效；★3、★4 的卡在 W2 就上，但它们开地的效果在 W5 才接上（W2–W4 期间只记下选择、开相应的变体或岗位占位）。

### 员工成长（W3）

- 人物加 `potential`（每项能力的上限，默认起始值 +15，"大器晚成" +25）。
- 每干完一圈，那项能力 +0.2，不超过潜力；总监照旧（+0.3，上限 80）。
- 跨过门槛发领域事件 `skill_up {person, skill, value}`，开出东西时发 `unlock {person, key}`。
- 门槛（初值）：教练教学 ≥ 65、维护工维护 ≥ 75、前台服务 ≥ 70、球员球技 ≥ 70、教练 + 体能师都 ≥ 60（见设计文档"五种钥匙"）。成长也解锁变体和升级（Wave 1 的 `worker` 门槛照用）。

### 结局（W4）

- 方案 A：第 112 天 18 点结算打分，不判输；破产照旧。
- 提前办成表演赛到 ★5：来结局卡，"马上结算"或"接着经营到第 112 天"。
- 分项（初值）：星级每星 1000、奖杯每座 300、会员每人 10、声望每点 10、表演赛 2000 + 每提前一天 50、现金每 $10 一分；评语 S/A/B/C/D。
- 第二季入口：结局卡上"开第二季"，第二季目标先占位（办一站正式赛事），第一季没选的地留给第二季。
- `balance.test.ts` 的区间按"分数档"重定（不再按通关率）。

### 地块（W5）

| 地块 id | 门槛 | 变体（= 选路） | 新锚点（追加，不挪旧的） |
| --- | --- | --- | --- |
| `golf_west` | ★3 选路 | `south_courts` / `oasis_lawn` | `south_courts` 或 `oasis_lawn`（同一块地，两种用途） |
| `se_corner` | ★4 选路 | `event_plaza` / `academy_isle` | `event_plaza` 或 `academy_isle` |

- 地块状态：`locked` → `building`（3–5 张清理工单）→ `open`（开出新岗位）。
- 导航只加不挪：新锚点和导航边一直在内容里，地块没开时这些地点不可用、不显示。
- 伏笔从 ★0 起在画面里：西步道断头处砌死的南门；高尔夫西段一周比一周荒；东南天上带两根旧网柱的小岛。

## 画面（iso）

`site.createOverlays(world)` 再加（都可选）：

```ts
event?(anchor: string, kind: string | null): void;            // 赛事日的布置（横幅、签到桌、观众），null 撤掉
prep?(phase: string, done: boolean): void;                     // 表演赛四期筹备在中心球场上看得见
land?(plot: string, state: 'locked' | 'building' | 'open', variant: string | null, progress?: number): void;
landPreview?(plot: string, variant: string | null): void;      // 选路卡上的半透明预览
```

- 地台从一个矩形变成几块拼出的轮廓：`createIsoWorld` 的 `slab` 可以是矩形数组；`world.setSlab(rects)` 在运行时长大（侧面按合并后的整体画，土层对齐，切角只在外角）。
- 新地的画面层加在构建顺序的最后或用自己的随机流：原来那座岛的像素不变（地块 `locked` 时只有伏笔）。
- 新锚点的坐标和步道写进 `site/indian-wells/layout.ts`（追加），内容里的 `nav` 分钟数照 `game.test.ts` 的规则生成。

## 界面

- W2：季节栏上"接下来两个节拍"（点它跳到那一处地点牌）；赛事工单提前一周出现在地点牌上；临时岗位当天出现；选路卡（两项都配场景预览，点一项镜头先转过去）。
- W3：招聘卡多一行"潜力"；成长跨门槛上快讯。
- W4：结局卡分项打分和评语；"开第二季 / 看总结"。
- W5：拿着人拖到屏幕边自动平移；HUD"回到会所"按钮；新地启用时镜头飞过去停一拍。

---

## W2 最终 schema（模拟一路已实现：LG-11 赛事日历、选路、人-13、掉档放人、表演赛分期筹备；以这一节为准）

没写赛事、选路、筹备的内容行为和以前一样。存档版本 **9**（8 → 9 有迁移：补 `routes`、`events`、`tournaments`，每人 `back: null`）。

### 内容：赛事日历（`acts/<地图>.yaml` 的 `tournaments`）

```yaml
tournaments:
  - id: cup_monthly
    kind: host                 # host 主办 / away 外出
    at: outer_1                # 地点（报名工单必须在这里）
    weeks: [3, 7, 11, 15]      # 第几周；或者 every: { weeks: 4, from: 3, until: 15 }（二选一）
    days: [5]                  # 星期几（0 = 周一，5 = 周六）；两天的写 [5, 6]。默认 [5]
    hours: [9, 17]             # 比赛时段（要在营业时间里）。默认 [9, 17]
    when: { all: [{ expr: "stars >= 1" }, { expr: "courts_built >= 2" }] }   # 参赛条件
    fee: 60                    # 报名费 = 报名工单的材料费（开工时扣；写了 fee 就不看工单的 cost）
    order: cup_monthly         # 报名工单（普通工单；cooldown / once 不看，日历决定什么时候出现）
    lead: 7d                   # 提前多久出现。默认 7d（不早于开局）
    posts: [t_checkin, t_umpire]   # 临时岗位：只在接下的这一期的比赛日存在（时段照岗位自己的 hours，必须写 hours）；不进习惯
    closes: [o1_rental, o1_lesson] # 比赛日整天不开的岗位（"占两块场一整天，不租场、不上课"）
    rain_spoils: true          # 比赛日下雨就办不成、报名费白花。主办默认 true，外出默认 false
    reward:                    # 办完给的
      - { trophy: 1 }
      - { flag: hosted_cup, set: true }
      - { stat: reputation, add: 2 }
      - { stat: members, add: 2 }
    goals:                     # 附加目标：收赛时逐个判定；if、chance 是表达式，可以用 event.* 变量
      - { id: service, if: "event.service_rate >= 0.8", reward: [{ stat: reputation, add: 1 }] }
      - { id: members, if: "stat.members >= 10", reward: [{ stat: members, add: 2 }] }
    repeat:                    # 第二次起：stat 的 add 乘 scale（默认 0.5，奖杯和标记不打折），目标换成 repeat.goals（不写照旧）
      scale: 0.5
      goals: [{ id: staffed, if: "event.staffed >= 0.95", reward: [{ stat: cash, add: 100 }] }]

  - id: regional_open
    kind: away
    at: entrance
    weeks: [5, 9, 13]
    days: [2]
    when: { expr: "stars >= 2 && hired.player >= 1" }
    fee: 200
    order: regional_open       # 工单里写 only: [player]、min_crew: "stars >= 3 ? 2 : 1"（★3 起双打）
    goals:
      - id: win
        chance: "clamp(0.1 + (event.skill - 50) / 45, 0.05, 0.9)"
        reward: [{ stat: cash, add: 800 }, { stat: reputation, add: 5 }, { trophy: 1 }]

  - id: invitational
    kind: host
    at: outer_23
    weeks: [10, 13]
    days: [5, 6]
    variant_of: outer_23       # 认场地：文案 tournaments.invitational.variants.<clay|hard>；奖励用效果的 if 分
    when: { all: [{ expr: "stars >= 3" }, { facility: clubhouse, is: open }, { facility: plaza, is: open }] }
    fee: 800
    order: invitational
    posts: [t_checkin, t_courtside, t_catering, t_umpire]
    reward:
      - { stat: cash, add: 2000 }
      - { stat: reputation, add: 6 }
      - { trophy: 1 }
      - { flag: hosted_invitational, set: true }
      - { stat: reputation, add: 2, if: { variant: outer_23, is: clay } }
    goals: [{ id: staffed, if: "event.staffed >= 0.95", reward: [{ stat: members, add: 4 }] }]
```

- **主办**：报名工单从 `开赛 − lead` 到开赛前出现在地点牌上；做完就算接下（`tournament_entered`）。开赛时还没做完的报名工单作废（报名费不退）。比赛日开出 `posts`、关掉 `closes`；收赛（最后一天 `hours[1]`）时结算。不报名没有惩罚。
- **外出**：工单从 `开赛 − lead` 起出现，但开赛前 `canAssign` 给 **`'early'`**（`orderStatus.blocked` 也是 `'early'`）；比赛那几天能开工，做完当场结算；这一期打完后不再出现。
- **天气**：开门抽完天气后，接下的主办赛事今天是比赛日又下雨 → 这一期作废（日志 `result: 'spoiled'`，`tournament_spoiled`），不算参加过。
- **`event.*` 变量**（`COMPUTED_VARS`，只在结算时有值，别处是 0）：`event.service_rate`（比赛那几天时段里全园的服务率）、`event.staffed`（临时岗位有人在岗的分钟比例；没有临时岗位是 1）、`event.skill`（报名工单上那项能力最高的人，含特质）、`event.crew`（报名工单上的人数）、`event.repeat`（以前参加过几次）。
- 文案（两种语言，编译器检查）：`tournaments.<id>.title`、`tournaments.<id>.goals.<目标 id>`、有 `variant_of` 时 `tournaments.<id>.variants.<变体>`。

### 内容：工单的新字段

```yaml
min_crew: "stars >= 3 ? 2 : 1"   # 至少几人到场才开工（数或表达式）；人不够不扣材料费、不走进度。orderStatus.minCrew
prep: exhibition                 # 分期筹备：这一组的一期，每一期只做一次（隐含 once）。文案 prep.<组>
variants:
  physio: { when: { route: s2, is: youth } }   # 变体可以写 when（按路先开）；不满足 canAssign 给 'variant'
```

表演赛四期：`prep_stands`、`prep_lights`、`prep_service`、`prep_media` 都写 `at: stadium_1`、`prep: exhibition`、`when: { expr: "stars >= 3" }`；`st1_exhibition` 的 `when` 加 `{ prep: exhibition }`。

### 内容：选路

```yaml
# acts/indian_wells.yaml
routes:                       # 处 → 路（第一条是路 A = 默认、机器人 greedy / cautious 的选择）；文案 routes.<处>.<路>
  s2: [youth, resort]
  s3: [south_courts, oasis_lawn]
  s4: [event_plaza, academy_isle]
stars:
  - requires: { ... }
    opens: [regional]
    card: iw_route_s2         # 升上这一星时打开（下一分钟，因果链指向升星那条日志）
```

```yaml
# events/indian_wells/iw_route_s2.yaml
id: iw_route_s2
act: indian_wells
source: milestone
location: entrance
who: dale
countdown: 1d                 # 一天不选，Dale 按默认定（日志 cause.kind = 'default'）
pause: true
options:
  A: { effects: [{ route: s2, set: youth }] }
  B: { effects: [{ route: s2, set: resort }] }
default: { then: A }
```

- 效果 `{ route: s2, set: youth }`：一处只记一次（已经选过就不改）；日志记录 `{ kind: 'route', slot, route }`，发 `route_chosen {slot, route}`。
- 条件 `{ route: s2, is: youth }`（`is: none` = 还没选）；变量 `route.s2`（字符串，没选是 `''`）。
- 卡的 `weight` 可以是表达式（招聘日按路调权重）：`weight: 'route.s2 == "youth" ? 2 : 1'`。

### 其他新条件和变量

| 写法 | 意思 |
| --- | --- |
| `{ prep: exhibition }` / `{ prep: exhibition, done: false }` | 这一组筹备都做完了 / 还没都做完 |
| `prep.exhibition` | 做完的比例 0..1 |
| `cycles.pr_academy` | 这个岗位这一周转了几圈（周日收盘清零；青少年赛"这一周学院岗位 ≥ 10 圈"） |
| `event.*` | 见上 |

### 状态（`GameState`，版本 9）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `routes` | `Record<'s2'\|'s3'\|'s4', string>` | 选的路 |
| `events` | `Record<tournament, EventRun>` | 接下了、还没结算的主办赛事这一期：`{ start, end, demand, served, need, staffed, skill, crew, live? }` |
| `tournaments` | `Record<tournament, { entries, last }>` | 办过（结算过）几次、上一次结算的时刻 |
| `people[id].back` | `string \| null` | 人-13：派去工单之前的岗位 |
| `week.cycles` | `Record<post, number>` | 这一周每个岗位转了几圈 |

### 人-13 和掉档放人（行为）

- 在工单上的人习惯不拉走（`routineTarget` 直接返回 null），直到做完、作废、或者玩家改派。从岗位上被派去工单时记下 `back`；工单做完（或作废、钱不够开不了工）回到 `back`——它存在、在时段里（或没有时段）、没人坐的话（发 `returned {person, post, order}`），不然闲着，之后照习惯走。原来"班一开始放下工单去上班"的行为去掉了；`resume` 只剩效果 `task` 用。
- 每分钟：坐在已经不存在的岗位上的人放下来闲着（这一圈作废，不发 `postInterrupted`），发 `released {person, post, facility, reason}`，`reason`：`'closed'`（设施掉档等条件没了）、`'remodel'`（改造停用）、`'event'`（赛事收了临时岗位，或比赛日 `closes` 占了场）。岗位回来后习惯会带他回去。

### W2 闸口修正：守着的岗位、有人守的设施、会员一周最多走多少（2026-11-04，GM-1 问题 1、W2 闸口试玩）

**守着的岗位（`people[id].pin: string | null`，可选字段，旧档没有 = null，不升存档版本）。** 和人-13 同一个原则：玩家亲手做的安排，习惯不推翻。

- 玩家亲手（`assign` 命令）把人派到**"随时"岗位**（没有 `hours`，例如维护）或**赛事临时岗位**上，`pin` = 这个岗位；派到有时段的普通岗位、工单以外的别处，或者叫停（`target: null`），`pin` 清掉。拖到他已经在的岗位上（例如习惯带他来的）也算一次"就守这儿"。
- 派去工单时：原来守着的岗位就是 `back`，`pin` 照旧留着（做完回去接着守）；别的情况清掉。
- 习惯、做完工单回去（`returned`）不是玩家亲手派的，不改 `pin`。别人被玩家派上这个岗位顶掉时，原来那人的 `pin` 清掉。
- `routineTarget`：在工单上照旧不动（人-13）；之后先看 `pin`——它此刻开着（在时段里、存在；"随时"岗位一直算在时段里），人在上面就**不动**（早上 8 点不再被拉回前台）；不在上面（被事件叫走办完了、第二个比赛日到点）而它空着、离结束还有 45 分钟以上，就**回去**。临时岗位过了当天的时段照下面的习惯走（不白站着），下一个比赛日到点再回来。
- 不再守：岗位没了（`released`；或 `routineSystem` 发现 `pin` 指的岗位不存在了：设施掉档、赛事收赛）、被解雇。之后照 ADR 0014 的习惯走。
- 习惯（`routine`）照旧记：派到维护上同样进习惯（顶掉旧的"随时"岗位），有时段的班留在习惯里，等玩家把他拖回有时段的班（`pin` 清掉）时照旧生效。所以规则是：**最后一次亲手拖动说了算；习惯只填它没说的空当。**

**有人守的设施掉得慢（`rules.staffed_decay`，0..1，默认 0.5）。** 收盘衰减改成 `decay_day × 季节倍数 × (今天有人守 ? staffed_decay : 1)`。"今天有人守" = 今天有人在这处设施的任何一个岗位（包括维护）上干完过至少一圈（读今天的岗位账，所以收盘时衰减挪到 `closeLedger` 之前；日志顺序不变）。岗位每圈的 `wear` 是使用磨损，照算不打折——要调就改岗位 YAML 里的 `wear`。`dayDecay(s, w, facility, seasonDecay, staffed?)` 和 `staffedToday(s, w)` 导出给界面（"周日会不会掉档"的预告应该用它，不要直接用 `decay_day`）。

**会员一周最多走多少（`rules.week.member_loss_max`，表达式，默认 `max(8, stat.members * 0.25)`）。** 周结算的会员变化不低于它的相反数（只挡走，不挡来）；挡住时周结算日志 `cause.members.loss_max` 写出挡在多少，下一周接着按上限走。

**赛事目标因为没人守而没达成（领域事件 `tournament_goal_missed`）。** 收赛结算时，条件里用到 `event.staffed` 的附加目标没达成、而临时岗位确实空过，就发 `{ type: 'tournament_goal_missed'; tournament; at; goal; staffed /* 0..1 */; posts: { post; minutes }[] /* 空了多少分钟，从多到少 */ }`（在 `tournament_done` 之后），日志 `cause.unstaffed: { goal, posts }[]` 同样记着。`EventRun.short: Record<post, minutes>` 是每个临时岗位在比赛时段里空着的分钟。快讯可以用它讲"邀请赛第二天签到没人，'全程有人'没拿到"。

### 领域事件（新增）

```ts
{ type: 'tournament_entered'; tournament; at; start; end }
{ type: 'tournament_live'; tournament; at; posts }          // 每个比赛日开赛时一次：画面 event(anchor, kind)
{ type: 'tournament_spoiled'; tournament; at; reason: 'rain' }
{ type: 'tournament_done'; tournament; at; goals: { id; met }[]; repeat; scale }   // 画面 event(anchor, null)
{ type: 'route_chosen'; slot; route }
{ type: 'prep_done'; group; order; done; total }            // 画面 prep(order, true)
{ type: 'released'; person; post; facility: string | null; reason: 'closed' | 'remodel' | 'event' }
{ type: 'returned'; person; post; order }
{ type: 'tournament_goal_missed'; tournament; at; goal; staffed; posts: { post; minutes }[] }   // W2 闸口修正，见上
```

因果日志：赛事结算 `cause: { kind: 'tournament', tournament, result: 'done' | 'spoiled', goals: Record<id, boolean>, repeat, scale }`；选路的效果记录 `{ kind: 'route', slot, route }`。

### 给界面和游戏的函数（`@td/sim`）

- `tournamentStatus(s, w)` → 每项赛事的下一期（或正在办的这一期），按开赛排序：`{ id, kind, at, signup, start, end, days, eligible, entered, live, repeat, scale, goals, variant, order, posts, fee }`。季节栏"接下来两个节拍"取前两个（和日历卡一起排）。
- `currentEdition(w, id, t)`、`eventLive(s, w, t)`、`goalsFor(t, repeat)`、`repeatOf(s, id)`；`w.editions`、`w.tournamentOf`（工单 → 赛事）、`w.eventPosts`（临时岗位 → 赛事）。
- `orderStatus` 多了 `openVariants`、`minCrew`、`tournament`、`prep`；`blocked` 多了 `'early'`。`canAssign` 多了 `'early'`。
- `prepStatus(s, w, group)` → `{ group, phases: { order, done, cost }[], done, total, costLeft }`（中心球场地点牌的四期和总价）；`prepProgress(s, w, group)`。
- `orderVariant(s, o, w?)`、`orderCost(s, o, variant?, w?)`：给了 `w` 才看变体的 `when` 和赛事的报名费。`openVariants(s, w, o)`、`minCrew(s, w, o)`。

### 机器人

- 报名赛事：报名工单的价值 = 奖励 + 附加目标（按六成把握）+ 每座奖杯 25 分，第二次起打折；外出赛事开赛前不去；`min_crew` 凑不齐（在职的合格的人不够）就不去。
- 临时岗位按有需求的岗位算，多值五成。
- 选路卡：greedy / cautious 选 A（打平取第一个），普通玩家（novice / average / good）按自己的种子随机挑。

---

## W3 最终 schema（模拟一路已实现：LG-12 员工成长和潜力；以这一节为准）

**默认关着**：地图不写 `growth` 或 `enabled: false` 时和以前完全一样（员工能力不涨、不截、不发事件，总监照旧）。Wave 3 内容一路打开它。
存档版本 **10**（9 → 10 有迁移：补 `unlocks: {}`）。潜力不进存档，按内容现算。士气影响速度（人-9）没做。

### 内容：地图的 `growth`（`acts/<地图>.yaml`）

```yaml
growth:
  enabled: true
  rate: 0.2                 # 每干完一圈岗位 / 一张工单，那项能力 +0.2（不超过潜力）。默认 0.2
  rates: { upkeep: 0.15, teach: 0.08 }   # 可选：分项涨幅，写了的能力用它、不写的用 rate（teach / upkeep / service / play）
  headroom: 15              # 默认潜力 = 起始值 + 15（截在 100）
  traits: { late_bloomer: 10 }   # 带这些特质的潜力再加（默认大器晚成 +10 → 起始值 +25）
  skills: [teach, upkeep, service]   # 哪些能力按干活涨（默认不含 play，见下）
  step: 5                   # 跨过 5 的整数倍、或某条解锁的 gte 时发 skill_up
  unlocks:
    - key: night_clay_care            # 文案 unlocks.<key>（必填，两种语言）
      need: [{ skill: upkeep, gte: 75, who: crew }]   # who：作用或特质，可不写（任何在职的人，含总监）
      when: { facility: outer_23, is: restored }      # 可选
      effects: [{ flag: night_care, set: true }]      # 可选；person: worker = 开出它的人
    - key: member_referrals
      need: [{ skill: service, gte: 70 }]
      effects: [{ stat: member_cap_bonus, add: 10 }]  # 举例：内容自己决定落在哪
    - key: weekend_camp               # 组合：每条 need 由不同的人满足（Indian Wells 的第二条不写 who：第二名教练、Kofi 或总监）
      need: [{ skill: teach, gte: 60, who: coach }, { skill: teach, gte: 60 }]
```

- 总监不走 `rate`：照旧 `rules.director_growth`（0.3）/ `director_skill_cap`（80），不重复算；成长打开时总监也发 `skill_up`、也能满足 need。
- 球技：球员靠训练岗位效果（`person: worker, add: { play }`）涨，不另加 `rate`；成长打开时这份涨幅截在潜力上（已经高于潜力的不往下拉）。想让球技也按 rate 涨就把 `play` 写进 `skills`（那就会和训练效果叠加）。
- 解锁一局只开一次，不往回收；在能力涨了的那一刻和每天收盘时检查（招来的人、卡加的能力在收盘时补上）。

### 内容：人物 `potential`、岗位 `worker`

```yaml
- { id: gus_moreno, ..., upkeep: 70, potential: { upkeep: 90 } }   # 写了的项直接用；不写按 headroom/traits 算
```

岗位也可以写 `worker: { teach: 60 }`（和工单的一样：底子不算特质，不够时 `canAssign` 给 `'skill'`）。

### 条件和变量

| 写法 | 意思 |
| --- | --- |
| `{ unlocked: night_clay_care }` | 这条解锁开出来了 |
| `{ skilled: upkeep, gte: 75, who: crew }` | 在职能指派的人（含总监）里有一个这项底子 ≥ 75 的（who 可不写） |
| `unlocked.<key>` | 0 / 1 |
| `best.teach` / `best.upkeep` / `best.service` / `best.play` | 在职能指派的人里这项底子最高的值 |

例：夜间养护工单 `when: { unlocked: night_clay_care }` + `worker: { upkeep: 75 }`；周末训练营岗位 `when: { unlocked: weekend_camp }`。

### 领域事件和日志

- `skill_up { person, skill, value }`：value 是跨过的门槛（5 的整数倍或解锁的 gte）。只在成长打开时发。
- `head_coach { person, from, reason }`：主教练换人。`reason: 'hired'` = 招来的教练接任（from 是原来的主教练，可为 null）；`'left'` = 主教练走了，由还在的教练接上（person 为 null = 空缺）。成长关着也发。
- `unlock { person, key }`：同时写一条因果日志 `{ kind: 'unlock', key, person, people }`（people 是满足各条 need 的人），效果记在这一条下。
- 模拟导出 `potentialOf(w, person, skill)`、`growthOf(w)`、`bestSkill`、`anySkilled`、`tagged`（招聘卡的"潜力"一行用 `potentialOf`）；`rateOf(growth, skill)`（growth.ts）是某项能力每圈的涨幅。
- 潜力只截底子（不含特质）。派谁去里显示"底子/潜力 +特质此刻的加成"（"维护 78/78 +15"），不拿含特质的数和潜力比。

### 效果 `decay_mult`（W3 跟进：夜间养护）

```yaml
effects: [{ decay_mult: { facility: outer_23, factor: 0.7, days: 7 } }]
```

- 这处设施收盘衰减（`dayDecay`）再乘 `factor`（0..2），从现在起 `days × 24` 小时内有效；同一处再来一次就换成新的倍数和到期。岗位每圈的 `wear` 不打折。
- 状态 `decayMult: Record<facility, { factor, until }>`（存档版本 **13**，12 → 13 迁移补 `{}`）；效果记录 `{ kind: 'decay_mult', facility, factor, until }`（界面不讲，工单自己带一行 `log`）。
- `o23_night_care` 用它：`restore: 40` + 一周内衰减 ×0.7（以前的 +5 折算去掉了）。

### 显示

能力在状态里是小数（存两位小数；总监以前就是 +0.3 的小数），门槛按原值比。界面显示时自己取整（员工条的条宽已经 `Math.round`），不改状态语义。

---

## W4 最终 schema（模拟一路已实现：LG-13 结局方案 A、第二季入口；以这一节为准）

**默认关着**：地图不写 `ending` 时和以前完全一样（表演赛 `endAct: won` 通关，第 112 天的期限卡 `endAct: lost` 判输）。Wave 4 内容一路打开它。
存档版本 **11**（10 → 11 有迁移：补 `ending: { season: 1, exhibition: null, settlement: null, goal: null, land: {} }`；旧档的 outcome 照旧）。

### 内容：地图的 `ending`（`acts/<地图>.yaml`）

```yaml
ending:
  mode: score                       # 必填；写了就是结局方案 A
  day: 112                          # 第 day 天 hour 点结算打分（默认 112 / 18）
  hour: 18
  exhibition: { flag: exhibition_done }   # 默认就是它：第一次满足 = "表演赛办成了"，记下时刻
  card: iw_ending                   # 可选：表演赛提前办成时打开的结局卡（内容写文案和选项）
  score:                            # 分项：分 = floor(of × per)；文案 ending.items.<项>。不写 = 下面这份初值
    stars:      { of: stars, per: 1000 }
    trophies:   { of: trophies, per: 300 }
    members:    { of: stat.members, per: 10 }
    reputation: { of: stat.reputation, per: 10 }
    exhibition: { of: ending.exhibition, per: 2000 }
    early:      { of: "ending.exhibition * ending.days_early", per: 50 }
    cash:       { of: stat.cash, per: 0.1 }          # 每 $10 一分（负的现金扣分）
  grades:                           # 从高到低；第一个 total ≥ gte 的档，都不够是最后一档；文案 ending.grades.<档>
    - { grade: S, gte: 12500 }
    - { grade: A, gte: 10000 }
    - { grade: B, gte: 7000 }
    - { grade: C, gte: 4000 }
    - { grade: D, gte: 0 }
  season2:                          # 可不写（默认如下）
    goal: official_tournament       # 第二季目标（占位），文案 ending.goals.<目标>
    start: { day: 1, hour: 8 }      # 可选；默认第 1 天、开门时间
    start_cards: []                 # 第二季一开始打开的卡
```

- 结局卡示例：`options: { A: { effects: [{ settle: true }] }, B: { effects: [] } }`，`default: { then: B }`（倒计时到了按"接着经营"）。
- 新效果 `{ settle: true }`：现在就结算（reason `early`）。结局没打开、已经结算过、或者第二季时什么都不做。
- 打开 `ending` 后：效果 `endAct: won`（表演赛工单）**不再结束这一局**，改成"看一眼结局"（记下表演赛、来结局卡）；`endAct: lost` 的结局是 `rules.lose_if.ending`（破产）时照旧结束，别的 `endAct: lost`（旧的期限卡 `iw_deadline`）改成结算。期限卡排在 112 天 18 点也打不开：那一分钟先结算了。内容可以删掉它，也可以留着。
- **注意**：表演赛工单现在冷却 7 天可以再办（+$6000）。接着经营的局会刷现金分，内容打开 ending 时请给 `st1_exhibition` 加 `once: true` 或 `when: { not: { flag: exhibition_done } }`。
- 编译器校验：`card` / `season2.start_cards` 存在；`score` 至少一项、表达式变量合法；`grades` 不重复、从高到低；文案 `ending.items.<项>`、`ending.grades.<档>`、`ending.goals.<目标>`、`endings.score.title/body` 两种语言都要有。

### 条件和变量

| 写法 | 意思 |
| --- | --- |
| `ending.exhibition` | 表演赛办成过没有（0 / 1） |
| `ending.days_early` | 结算那天离 `ending.day` 还有几天（没结算时按今天算；不小于 0） |
| `ending.season` | 第几季（1、2） |
| `ending.settled` | 第一季结算过没有（0 / 1） |

### 打分怎么取舍（行为）

- "马上结算"：拿 `early`（每提前一天 50 分）；"接着经营"：`early` 是 0，但会员、声望、奖杯、现金还在涨，也还担着破产的风险。两条路都以结算收尾。
- 结算前先看一眼星级（★5 算进分里）。破产（现金 < −$2000，每天收盘）照旧 `outcome: { result: 'lost', ending: 'bankrupt' }`，**不结算**、不能开第二季。
- 结算：`outcome = { result: 'settled', ending: 'score', t }`（`OutcomeResult = 'won' | 'lost' | 'settled'`）；`s.ending.settlement` 存分项。

### 状态（`GameState`，版本 11）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ending.season` | `number` | 第几季 |
| `ending.exhibition` | `number \| null` | 表演赛办成的时刻 |
| `ending.settlement` | `Settlement \| null` | `{ t, day, reason: 'early' \| 'deadline', items: { id, value, per, points }[], total, grade }`；开了第二季也留着 |
| `ending.goal` | `string \| null` | 第二季目标（第一季是 null） |
| `ending.land` | `Record<处, 路[]>` | 开第二季时记下第一季没选的路（选过的处留另一条，没选过的处留全部），W5 的地块用 |

### 命令

- `{ type: 'startSeason2' }`：第一季结算过（`result: 'settled'`）才接受。会所、人、设施、星级、奖杯、钱、习惯都留着；开着的卡、排着的卡、活动、接下的赛事清掉；
  时钟回到 `season2.start`（卡和工单的冷却、改造期满、赛事的 `last` 跟着整天平移）；赛事日历按周重新排起来。第二季没有第 112 天的结算（目标是占位，W5 以后定）。

### 领域事件和日志

```ts
{ type: 'ending_offered'; day; card: string | null }          // 表演赛提前办成（结局卡随后打开）
{ type: 'settlement'; t; day; reason; items; total; grade }   // 结算（界面：结局卡分项和评语）
{ type: 'actEnded'; result: 'settled'; ending: 'score' }
{ type: 'season_two'; goal; land }
```

因果日志：`cause: { kind: 'settlement', ...Settlement }`（effects 里一条 `{ kind: 'end', result: 'settled', ending: 'score' }`）；`{ kind: 'season', season: 2, goal }`。

### 给界面和游戏的函数（`@td/sim`）

- `endingStatus(s, w)` → 结局没打开时 `null`；否则 `{ season, deadline: { day, hour, daysLeft } | null, exhibition: 第几天 | null, deciding（结局卡开着）, settlement, preview: { items, total, grade }（现在结算会是多少；结算后等于 settlement）, grades, canStartSeason2, goal, land }`。
- `scoreOf(s, w)`、`gradeOf(ending, total)`、`canStartSeason2(s, w)`。

### 机器人和平衡

- 结局卡上 `{ settle: true }` 的选项：greedy / 普通玩家加 10 分、cautious 最坏情况 +1（见好就收）。
- `pnpm sim bots`：地图写了 ending 时报告出平均分、中位分、提前结算比例，和每个机器人的 10% / 中位 / 90% 分位、评语档比例（破产记 `bankrupt`）、分项平均；没写时照旧出通关率。
- `balance.test.ts`：`mode: score` 时按分数档（greedy 前两档 ≥ 80%、cautious 没有最高档、random 前两档 ≤ 20%、idle 全是最后一档）；没写时照旧按通关率。
- 校准（按当时内容、在内存里打开初值 ending、20 局）：greedy 中位 12347、90% 分位 12630（S 门槛 13000 时 A 95% / S 5%，初值降到 12500 让好局能拿 S），good 11945、average 12038、novice 11579（A 为主），cautious 7425（B 85%），random 3491（D 为主，破产 20%），idle 92（D）。

---

## W5 最终 schema（模拟一路已实现：LG-15 地块；以这一节为准）

**默认关着**：地图不写 `plots` 时和以前完全一样（没有地块状态，所有地点都能用，路不变）。W5 内容一路打开它。
存档版本 **12**（11 → 12 有迁移：补 `plots: {}`）。

### 内容：地图的 `plots`（`acts/<地图>.yaml`）

```yaml
anchors: [..., south_courts, oasis_lawn, event_plaza, academy_isle]   # 新锚点一开始就在（导航只加不挪）
nav:                                    # 新锚点和每个地点之间都要有边（game.test 照画面查分钟数），分钟数照 art17 的步行表
  - [entrance, south_courts, 105]
  # ...
plots:
  - id: golf_west
    route: s3                           # 哪一处选路决定它；选了哪条路就按同名的变体开工
    season: 1                           # 默认 1；2 = 开第二季时按 ending.land[route] 里第一个有变体的路开工（数据钩子）
    pause_on_events: true               # 默认 true：接下的主办赛事的比赛日，清理工单不走进度（人在那儿等）
    variants:
      south_courts:                     # = routes.s3 里的一条路
        anchor: south_courts            # 新锚点（不能有设施、不能有人开局站在那儿、不能被别的地块用）
        orders: [sc_clear, sc_fill, sc_pave]   # 清理工单：开工时一起冒出来，隐含只做一次（cooldown 不看）；3–5 张（不在这个范围给警告）
        start: [{ flag: gw_noise, set: true }]  # 可选：开工时执行一次
        opens:
          posts: [sc_rental, sc_lesson] # 开地以后才有（不用再写 when）
          orders: [sc_tidy]
          effects: [{ stat: reputation, add: 2 }]   # 开地时执行一次
      oasis_lawn:
        anchor: oasis_lawn
        orders: [ol_dig, ol_cabins, ol_pool]
  - id: se_corner
    route: s4
    variants:
      event_plaza: { anchor: event_plaza, orders: [...] }
      academy_isle: { anchor: academy_isle, orders: [...] }
```

- **工单放在哪**：清理工单放在这个变体的锚点上（或者旧地点上）；不能放在别的地块的锚点上。
- **地块锚点上的东西**：施工时只有它的清理工单；开了以后那里的岗位、工单才有（`opens` 里没列的也一样，按地点挡）。`opens` 里列的岗位和工单放在哪儿都行，都要开了才有。
- **施工的副作用**交给内容：条件 `{ plot: golf_west, is: building }` 或变量 `plot.golf_west == "building"` 写进岗位效果、质量项、卡的条件（例如施工噪音让泳池的满意度打折）。
- 编译器校验：路的处和变体对得上；锚点在 `anchors` 里、直接连着至少一个旧地点；新地不能成为两个旧地点之间的近路（经过它比旧边快 1 分钟以上就报错）；清理工单和开出来的岗位、工单存在、属于这张地图、只被一处用、不是赛事的报名工单；`start`、`opens.effects` 的效果；同一块地各变体到旧地点的平均步行分钟差超过 ±10% 给**警告**（se_corner 的两个变体差很多，平衡交给机器人）。清理工单没有效果不再警告。
- 路断不断在岛边：`game.test.ts` 按画面的折线查（每块地的每个变体，从每个地点走过去，折线都在长大后的地台上，站位离岛边 ≥ 2 米）；内容写了 `plots` 时还查变体的锚点和画面 `PLOT_ANCHORS` 一致。地块的新锚点在 `LAND_STANDS` / `LAND_ANCHORS` 里有站位和中心就算（不在 `Site.stands` 里）。

### 行为

- `locked`（不在 `s.plots` 里）→ `building`：选路效果 `{ route: s3, set: south_courts }` 让 `route: s3`、`season: 1`、有这个变体的地块开工；或者效果 `{ plot: se_corner, build: academy_isle }`（地块还是 locked 才生效）；或者第二季开局。开工写一条日志（挂在选路那一条下），执行 `start`，发 `plot_building`。
- `building` → `open`：这个变体的清理工单都做完一次（做最后一张的那一分钟），写一条日志（挂在开工那一条下），执行 `opens.effects`，发 `plot_open`。
- **导航**：地块的锚点只当终点、不当中转站（`walk.ts` 的最短路不从它们中间穿过），所以旧地点之间的路和分钟数一条不变；走去新地按直连的边。
- 停工：`pause_on_events` 的地块在接下的主办赛事的比赛日（整天）不走进度、不扣材料费，人留在原地等。
- 第二季：`startSeason2` 时 `season: 2` 的地块按 `ending.land[route]`（第一季没选的路）里第一个在 `variants` 里的路开工；开工和开地的时刻跟着时钟平移。

### 条件和变量

| 写法 | 意思 |
| --- | --- |
| `{ plot: golf_west, is: open }` | 地块的阶段：`locked` / `building` / `open` |
| `{ plot: golf_west, is: south_courts }` | 按这个变体开了工（施工中或者开了） |
| `plot.golf_west` | `'locked'` / `'building'` / `'open'` |

### 状态（`GameState`，版本 12）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `plots` | `Record<plot, PlotState>` | 开了工的地块：`{ state: 'building' \| 'open', variant, since, opened: number \| null, cause }`；locked 的不在表里 |

### 领域事件和日志

```ts
{ type: 'plot_building'; plot; variant; anchor; orders }   // 画面 land(plot, 'building', variant, 0)
{ type: 'plot_open'; plot; variant; anchor }               // 画面 land(plot, 'open', variant)；镜头飞过去停一拍
```

因果日志：`cause: { kind: 'plot', plot, variant, state: 'building' | 'open' }`；引出它的那一条（选路、效果、第二季）里记一笔 `{ kind: 'plot', plot, variant, state }`。

### 给界面和游戏的函数（`@td/sim`）

- `placeAvailable(s, w, anchor)`：这个地点在不在地图上（画不画地点牌、能不能往那儿拖人）。不在地块上的地点一直 true；地块上的地点在它的变体**开工以后**就是 true（施工中只有清理工单）。
- `placeOpen(s, w, anchor)`：开了没有（地块上的岗位要开了才有）。
- `plotStatus(s, w)` → 每块地 `{ id, route, season, state, variant, anchor, orders: { id, done, progress }[], done, total, progress（按工作量 0..1，开了是 1）, paused, since, opened }`（画面 `land(plot, state, variant, progress)`）。
- `plotPhase(s, plot)`、`plotPaused(s, w, plot)`、`plotOrderPaused(s, w, order)`、`plotAllows(s, w, target, at)`；`w.plots`、`w.plotAt`（锚点 → 地块和变体）、`w.plotOrders`（清理工单 → 地块和变体）、`w.plotOpens`。
- `orderStatus` 多了 `plot`（清理工单是哪块地的）、`paused`（停工）。没开的地块上的岗位 `postStatus.exists` 是 false，工单 `visible` 是 false，`canAssign` 给 `'gone'`。

### 机器人和报告

- 清理工单：每块地一共值 240 分（按张数分摊，和别的工单一样再按工时开平方折算）；停工时不去。
- `pnpm sim bots`：地图写了 `plots` 时多一节"地块"：每个机器人每块地开工、开地的局数比例，各变体的比例，开地的中位天数、施工的中位天数。
