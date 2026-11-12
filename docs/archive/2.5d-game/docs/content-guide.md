# 内容指南：不写代码加一张卡

所有游戏内容都是 `packages/content/data/` 下的 YAML。加卡、改数值、改文案都不用碰代码。整局只有一张地图 `acts/indian_wells.yaml`，卡放在 `events/indian_wells/` 下，例如 `iw_sandstorm.yaml`（起风了，要不要去盖场地）。

## 工作流程

```
pnpm game                      # 打开游戏（开发版），按 ` 打开调试面板
# 编辑 packages/content/data/**.yaml —— 保存后游戏不刷新就换上新内容
# 写错了会弹出错误层，写清文件和问题；改对了自动消失
pnpm content                   # 生成 src/generated/content.json（要一起提交）
pnpm sim bots --games 1000     # 看看这张卡多常出现、对通关率有什么影响
```

调试面板里可以：直接改状态量和标记，看导演此刻会抽哪些卡和概率并强制打开，看排上日程的卡，跳过 15 分钟到 1 天，导出存档和命令日志（报 bug 时附上），用指定种子开新局。

## 一张卡的文件

文件名就是卡的 id，放在 `events/indian_wells/` 下。

```yaml
id: iw_sandstorm
act: indian_wells
source: random          # milestone 里程碑 | calendar 日历 | consequence 后果 | threshold 阈值 | random 随机
tone: crisis            # crisis 危机 | relief 好消息 | comedy 喜剧 | neutral 日常（导演按语气调权重）
cooldown: 5d            # 出现一次后多久不再出现
max_shown: 4            # 一局最多出现几次
countdown: 2h           # 多久不处理就按默认处理
when:                   # 阈值卡和随机卡的出现条件
  all:
    - { weather: wind }
    - { any: [{ facility: outer_1, is: playable }, { facility: outer_1, is: resurfaced }] }
location: outer_1       # 发生在哪个地点（卡片标签、镜头）
who: dale               # 谁来找你（人物 id，或 who.<id> 文案里的群体）
options:
  A:
    errand: { at: outer_1, for: 1h }   # 总监放下手上的岗位，去那儿待 1 小时
    effects:
      - { log: log.sand_covered }
  B:
    effects:
      - { condition: outer_1, add: -25 }
      - { condition: outer_23, add: -20, if: { facility: outer_23, is: playable } }
default: { then: B }    # 倒计时到了按哪个选项处理；extra 里可以再加惩罚
```

其他字段：`once: true`（只出现一次）、`pause: true`（打开时自动暂停）、`weight`（导演抽卡的权重）、`cost`（选项花钱，钱不够就选不了）、`requires`（选项的条件，不满足就锁住）、`check` + `onSuccess` / `onFail`（判定）、`stage: { anchor, performance }`（打开时在某处演一段）。

### 条件

`all` / `any` / `not` 组合；`stat`（`lt` `lte` `gt` `gte` `eq`）、`flag`（`is`）、`facility`（`is`）、`assigned`（某人正在干活，可带 `at` 要求在某地）、`day`、`hour`、`seen`、`open`、`coach`（`none` 表示没有主教练）、`activity`（`running`）、`expr`（任意表达式）。

### 效果

改状态量（`add` / `set`）、设标记、改设施状态、`schedule` 安排后续卡（`in: 1d`）、`activity` 开始活动、`hire` / `fire`、改人的 `skill` `upkeep` `service` `morale` `fatigue`、`errand` 把某人叫去办事、`task` + `who` 把一张工单记给某人（他闲下来就自己走过去开工，材料费开工时扣）、`condition` 改设施状况（`add`）、`log` 写一行快讯、`endAct` 结束这一局。每个效果都可以带 `if` 和 `chance`。

### 表达式

数值可以写成表达式，例如 `round(2 + stat.reputation / 15 + rand() * 3)`。能用的变量：`stat.<id>`、`flag.<id>`、`facility.<id>`、`person.<id>.skill|upkeep|service|morale|fatigue`、`coach.skill|attention|morale|present|hired`、`director.at`、`condition.<设施>`、`service_rate`、`staff`、`restored`（修好了几处设施：换到给园区加分的状态才算，扫完沙这种中间状态不算）、`idle_days`（在职的人里闲得最久的那个连续闲了几个营业日）、`quiet_days`（离上一张卡打开过了几天）、`courts_open`、`facility_quality`、`wages_week`、`open_cards`、`day`、`hour`、`pressure`；岗位效果里还有 `worker.skill`（在岗这个人对应那项能力）。函数：`min max clamp round floor ceil abs rand`。拼错的变量名在编译时就报错。

## 岗位和工单

派工的设计 2026-11-09 作废（游戏流程重新设计中），下面是代码现在怎么读这些文件。

岗位放在 `data/posts/<id>.yaml`，是地点上的一个"位子"：`at`（锚点）、`skill`（teach / upkeep / service）、`cycle`（一圈多久）、`hours: [15, 18]` 和 `days: [0, 1, 2, 3, 4]`（有客人的时段；有时段的岗位算需求，计入服务率）、`when`（岗位什么时候存在）、`effects`（每圈结算，可以用 `worker.skill`）、`wear`（每圈磨损）、`restore`（维护岗位每圈修复多少，乘能力）、`performance`。

工单放在 `data/orders/<id>.yaml`，是长在问题上的一次性活：`work`（能力 50 的一个人要干多久）、`cost`（开工时扣的材料费）、`crew`（最多几个人）、`when`（标记什么时候出现；中途变成不满足，工单作废）、`cooldown` / `once`、`restore`（完工后设施状况加多少）、`check` 和 `effects` / `onSuccess` / `onFail`、`performance`。

岗位和工单共用一个 id 空间。文案在 `posts.<id>` / `orders.<id>` 下，要有 `title` 和 `note`。设施的 `decay_day` 是没人维护时每天掉多少状况；季节的 `decay` 是倍数。

岗位和工单都可以写 `only: [player]`（作用或特质 id，命中一个就行）只收特定的人；这样的岗位最好在 `when` 里加上
`{ expr: "hired.player >= 1" }`，没招到人时它就不存在、不算需求。效果里 `{ person: worker, add: { play: 0.1 } }` 改在岗的那个人；
工单的效果和 `check` 可以用 `worker.skill`（干这张工单的人里最高的那项能力）。`skill` 多了 `play`（球技）。

## 人物和特质

人物在 `data/people/<地图>.yaml`。招聘日的候选人 `role: candidate`，必须写 `kind`
（coach / crew / special / player），并在 `i18n` 的 `bios.<id>` 写一句话背景（两种语言）；作用的名字在 `kinds.<作用>`。
特质在 `data/traits.yaml`：`attention`、`morale_drift`、`reputation_drift`，以及干活时的能力加减 `bonus: { upkeep: 12, service: -10 }`
和只在某些时候生效的 `when`（条件，和卡的 `when` 一样）。每个特质在 `traits.<id>` 下要有 `name` 和 `note`。
名字和经历写成虚构的人，不用真实的在世名人。

## 文案

每张卡在 `i18n/en.yaml` 和 `i18n/zh.yaml` 的 `events.<id>` 下要有 `topic`、`title`、`body` 和每个选项的文字。缺了会报错；一种语言有、另一种没有的键会给警告。

## 校验会抓住的问题

引用了不存在的卡、活动、地点、状态量、设施状态、人物或文案；表达式里的未知变量；字段类型不对（例如 `weight` 写成了字符串）；只被读、从没被写过的标记；效果完全相同的两个选项；永远不会出现的卡。

## 平衡

`apps/sim-cli/src/balance.test.ts` 守着机器人跑局的区间（按作废的 16 周主线定的，重新设计以后跟着改）；改完数值跑 `pnpm sim bots --games 200` 看一眼，报告不提交。
