# Wave 2–5 接口契约：赛事阶梯和选路（W2）、员工成长（W3）、结局和第二季（W4）、地图长大（W5）

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
