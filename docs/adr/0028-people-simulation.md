# 0028 人物模拟：三层人、行为是信号、空闲有产出但只有一小截

- 状态：提议
- 编号说明：原来是 0023（和 [0023 无极旋转](0023-free-rotation.md) 撞号），2026-11-08 改成 0028（0025、0026 留给没合并的分支，0027 已占）。
- 日期：2026-11-05
- 修订：玩法准则 5（"日常经营靠招人和排人"，`CLAUDE.md` 和设计文档）
- 补充：[0012](0012-staffing-loop.md)（岗位和工单）、[0014](0014-routines.md)（习惯）、[0010](0010-activity-library.md)（演出不决定数值）、[0022](0022-court-usability.md)（信号说档不说数）
- 依据：`docs/design/people-sim.md`（完稿 v3，两轮评审）、`docs/design/people.md`

## 背景

准则 6 说"不操作时世界照样运转"。现在的实现里，员工只在岗位、工单、办事、走路四种状态之间切换，下班以后就站在原地；
访客只存在于画面层（`apps/game/src/life.ts` 用哈希决定谁在场），模拟里没有这个人，所以 HUD 的"有 N 处客人在等"和场景里的人是两套各算各的。
人物设计文档给了 14 个有背景的候选人，但背景只在招聘卡上出现一次，招来以后他们彼此没有差别，人与人之间也没有故事。

用户的决定：空闲行为**可以**产出（否决了"绝对不产生数值"的提议）；常客进第一版；访客做成个体。

## 决定

1. **三层人，三种精度。** 有名字的员工每人一条状态（已有，加 `intent`）；有名字的常客进 `s.people`（`role: regular`、`hired: false`，一个 id 一个精灵，夫妇是两个 id）
   加一张旁表 `regulars`（好感、来访、四次来访的记忆，夫妇共用一张）；人群不记个体的一生，只记此刻的目的、位置、等了多久（`visitors`，上限 24 个个体，超出只计数），
   `walk.ts` 泛化到 `Mover` 接口让访客也能走。
2. **行为是信号。** 每一种自主行为都对应一个玩家关心的事实。点场景里的人看到一行他"在想什么"（员工走员工条的 `doing()`，场景里一个 3 秒气泡），不开面板；
   有信息量的动作在精灵头顶放一个像素图标（`SpriteLayer` 的表情通道）。信号说档不说数。
3. **不随机。** 每个人按"性子 + 一天的模板"行动，模板是内容（`behaviour.yaml`、`people/*.yaml` 的 `day`，可带钟点）；随机只打破同分。
   人群到达、常客抖动、同分打破全部用 `s.seed` 派生的哈希，**不消耗 `s.rng`**：现有种子的天气和抽卡不变。
4. **准则 5 改写**（写进 `CLAUDE.md` 的措辞）："日常经营靠招人和排人。……没排的人按自己的性子找事做（ADR 0028）：那是信号，不是经营。产出只有排人的一小截，
   永远不会替玩家修好一处设施、带完一堂课或收一分钱。"数值：`idle_k = 0.2`，所有倍率乘完截在 `idle_cap = 0.5`，一名球员同时只有一个带练的人。
   空闲产出只有球技、短期脏乱、疲劳三种，不碰设施状况（否则一个闲着的维护工会抵消掉档）、现金、会员、声望；空闲练球多出疲劳，这是它的代价。
   球技走新的 `growBy`，截在潜力，未取整的部分攒在 `bank` 里。
5. **关系只做成对的规则。** 两个人都在、处境成立 → 看得见的行为 + 一个小数值或一张卡；全部进因果日志。不做社交网。摩擦在第一版就要有代价（疲劳、好感、倍率），不只是士气。
   关系只写跨招聘日的人之间（同一招聘日只能招一个人）以及和 Dale、常客之间；可达性按"两人都被招到的概率"分档。
6. **人群和常客的等待不改变经济。** 服务率仍按需求分钟算（准则 6），HUD 继续读需求；访客只把没人服务的分钟演成人；常客的好感只影响耐心、带朋友（记周账、周日结算）和卡。
   碰经济的例外在设计文档第九节逐条列出（七条），再加要先改那里。
7. **空闲和习惯的交接。** `intentSystem` 只处理班关着、没工单、没办事、没走路的在职员工（不含总监）；它自己负责在开班前把人送回去；选去处时保证来得及赶下一班；
   习惯、玩家拖人、事件叫人、回班四处都清掉 `intent`。
8. **画面只跟随。** `life.ts` 改成读 `s.crowd`、`s.visitors`、`s.regulars` 的跟随者，不再自己决定谁在场。

## 为什么不违反准则

- 准则 1：没有新面板。点人的一行话是场景点按，和地点牌同一类。
- 准则 2：空闲产出很小、有疲劳代价，而且只在玩家修好的设施上发生；关系的卡每个选项都有取舍；摩擦有代价。
- 准则 3：常客的好感、`gone`、人物弧线卡都是选择留下的痕迹，并进因果日志。
- 准则 4：新卡都挂在具体的人和具体的时刻上，每周最多开 2 张人物卡（`people_cards_per_week`）、每天最多 2 条人物快讯；纯奖励的时刻做快讯不做卡；要两个特定员工的卡标 `rare`，不进必出清单。
- 准则 6：`intent` 不耽误下一班；习惯到点，人照样回到你布置的岗位；会员不实时漂移。

## 后果

- `packages/sim`：`intent.ts`、`crowd.ts`、`regulars.ts`；`PersonState.intent`；`GameState.regulars`、`visitors`、`crowd`、`week.friends`；`growth.ts` 的 `growBy`；`staff.ts` 的 `nextShift`、`clearIntent`；
  `walk.ts` 的 `Mover` 版本；新事件 `intent`、`visitorArrived`、`visitorLeft`、`regularVisit`、`regularFavor`；`SAVE_VERSION` 每一期上线加一。
- `packages/content`：`behaviour.yaml`、`regulars/indian_wells.yaml`、`people/*.yaml` 的 `day` / `pair` / `escort`；schema：role 枚举加 `regular`、卡加 `rare`、`rules.people_cards_per_week`、`rules.stipends`；
  新效果 `favor` / `regular gone` / `regular flag`；`COMPUTED_VARS` 加 `visitor_left.<post>`、`regular.<id>.<attr>`、`idle_hours.<person>.<verb>`、`crowd.waiting`（编译器和模拟两边一致）；
  i18n `intent.*`、`ui.staff.intent.*`、`regulars.*`、`ui.regular.greet`、`ui.week.park`；`iw_pickle_noise`、`iw_first_players` 的 `who` 换成常客；`bios.lily_chen` 改。
- `apps/game`：`life.ts` 退化成跟随者；`scene.ts` 按 `intent` 事件走位、常客按 `visit` 显示；`project.ts` 的 `doing()` 加 intent 分支、`nextShift` 改调 sim；`LOOKS` 加常客。
- `apps/sim-cli`：报告"从未出现的卡"跳过 `rare` 并单列出现率；加一种"招聘卡全选另一侧"的机器人打法。
- 平衡：`idle_k` 的影响要用 200 局报告确认在区间内；人物卡要在报告里出现过。
- `CLAUDE.md` 和 `game-design.md` 的准则 5 按上面的措辞改写（实现第一期时一起改）。
- 分四期实现，见设计文档第十节。
