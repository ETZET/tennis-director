# 内容指南：不写代码加一张卡

所有游戏内容都是 `packages/content/data/` 下的 YAML。加卡、改数值、改文案都不用碰代码。M3 闸口用的示范卡是 `events/hollow_creek/hc_rival_flyer.yaml`（对手俱乐部把传单贴到我们围网上），它只加了这个文件和两种语言的文案。

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

文件名就是卡的 id，放在 `events/<幕>/` 下。

```yaml
id: hc_rival_flyer
act: hollow_creek
source: random          # milestone 里程碑 | calendar 日历 | consequence 后果 | threshold 阈值 | random 随机
tone: comedy            # crisis 危机 | relief 好消息 | comedy 喜剧 | neutral 日常（导演按语气调权重）
when: { stat: members, lt: 60 }   # 阈值卡和随机卡的出现条件
cooldown: 4d            # 出现一次后多久不再出现
weight: 0.8             # 被导演抽中的权重（数字）
countdown: 2h           # 多久不处理就按默认处理
location: lot           # 发生在哪个地点（卡片标签、地图上的感叹号、镜头）
options:
  A:
    requiresDirectorAt: lot          # 要总监走到那儿才能选（玩家按下后总监自动走过去）
    effects:
      - { stat: reputation, add: 2 }
      - { stat: members, add: 1, chance: 0.5 }
  B:
    check: { stat: reputation, vs: 40 }   # 判定：成功率 0.5 + (声望 − 40) / 50
    onSuccess: [{ stat: reputation, add: 1 }]
    onFail: [{ stat: reputation, add: -2 }]
  C:
    effects: [{ stat: members, add: -1 }]
default: { then: C }    # 倒计时到了按哪个选项处理；extra 里可以再加惩罚
```

其他字段：`once: true`（只出现一次）、`pause: true`（打开时自动暂停）、`cost`（选项花钱，钱不够就选不了）、`requires`（选项的条件，不满足就锁住）、`errand: { at, for }`（选了以后总监放下手上的岗位，去那儿待一段时间；代价是总监的工时）、`stage: { anchor, performance }`（打开时在某处演一段）。

### 条件

`all` / `any` / `not` 组合；`stat`（`lt` `lte` `gt` `gte` `eq`）、`flag`（`is`）、`facility`（`is`）、`assigned`（某人正在干活，可带 `at` 要求在某地）、`day`、`hour`、`seen`、`open`、`coach`（`none` 表示没有主教练）、`activity`（`running`）、`expr`（任意表达式）。

### 效果

改状态量（`add` / `set`）、设标记、改设施状态、`schedule` 安排后续卡（`in: 1d`）、`activity` 开始活动、`hire` / `fire`、改人的 `skill` `upkeep` `service` `morale` `fatigue`、`errand` 把某人叫去办事、`log` 写一行快讯、`endAct` 结束本幕、`follow`「谁跟我走」。每个效果都可以带 `if` 和 `chance`。

### 表达式

数值可以写成表达式，例如 `round(2 + stat.reputation / 15 + rand() * 3)`。能用的变量：`stat.<id>`、`flag.<id>`、`facility.<id>`、`person.<id>.skill|upkeep|service|morale|fatigue`、`coach.skill|attention|morale|present|hired`、`director.at`、`condition.<设施>`、`service_rate`、`staff`、`courts_open`、`facility_quality`、`wages_week`、`open_cards`、`day`、`hour`、`pressure`；岗位效果里还有 `worker.skill`（在岗这个人对应那项能力）。函数：`min max clamp round floor ceil abs rand`。拼错的变量名在编译时就报错。

## 岗位和工单（ADR 0012）

岗位放在 `data/posts/<id>.yaml`，是地点上的一个"位子"：`at`（锚点）、`skill`（teach / upkeep / service）、`cycle`（一圈多久）、`hours: [15, 18]` 和 `days: [0, 1, 2, 3, 4]`（有客人的时段；有时段的岗位算需求，计入服务率）、`when`（岗位什么时候存在）、`effects`（每圈结算，可以用 `worker.skill`）、`wear`（每圈磨损）、`restore`（维护岗位每圈修复多少，乘能力）、`performance`。

工单放在 `data/orders/<id>.yaml`，是长在问题上的一次性活：`work`（能力 50 的一个人要干多久）、`cost`（开工时扣的材料费）、`crew`（最多几个人）、`when`（标记什么时候出现；中途变成不满足，工单作废）、`cooldown` / `once`、`restore`（完工后设施状况加多少）、`check` 和 `effects` / `onSuccess` / `onFail`、`performance`。

岗位和工单共用一个 id 空间。文案在 `posts.<id>` / `orders.<id>` 下，要有 `title` 和 `note`。设施的 `decay_day` 是没人维护时每天掉多少状况；季节的 `decay` 是倍数。

## 文案

每张卡在 `i18n/en.yaml` 和 `i18n/zh.yaml` 的 `events.<id>` 下要有 `topic`、`title`、`body` 和每个选项的文字。缺了会报错；一种语言有、另一种没有的键会给警告。

## 校验会抓住的问题

引用了不存在的卡、活动、地点、状态量、设施状态、人物或文案；表达式里的未知变量；字段类型不对（例如 `weight` 写成了字符串）；只被读、从没被写过的标记；效果完全相同的两个选项；永远不会出现的卡。

## 平衡

`docs/balance/hollow-creek.md` 是当前内容的机器人跑局报告。第一幕的目标：贪心型机器人通关 70–85%，随机型很少赢（0–15%），放置不管的对照组输，每张卡都要出现过（ADR 0012 起的区间，等第二轮试玩后再收紧）。改完数值重跑一次，把报告一起提交。
