# 机器人跑局报告 · indian_wells

导演 steady · 内容版本 cfe3ae34 · 共 1400 局

| 机器人 | 局数 | 平均分 | 中位分 | 提前结算 | 平均天数 | 卡死 | 平均质量 | 平均会员 | 平均声望 | 平均现金 | 平均复原 | 每局耗时 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| greedy | 200 | 16561 | 16702 | 99.5% | 81.3 | 0 | 100.0 | 113.8 | 100.0 | $8460 | 8.0/8 | 788.3 ms |
| random | 200 | 2097 | 2340 | 0.0% | 110.6 | 0 | 59.2 | 60.4 | 26.3 | $1352 | 3.7/8 | 628.3 ms |
| cautious | 200 | 6006 | 6088 | 0.0% | 112.0 | 0 | 100.0 | 99.8 | 97.6 | $4993 | 7.0/8 | 1032.5 ms |
| idle | 200 | 15 | 15 | 0.0% | 112.0 | 0 | 7.8 | 0.0 | 3.0 | $621 | 0.0/8 | 452.7 ms |
| good | 200 | 14990 | 14931 | 93.0% | 91.6 | 0 | 100.0 | 117.4 | 99.9 | $9096 | 8.0/8 | 765.9 ms |
| average | 200 | 14358 | 14350 | 92.5% | 94.3 | 0 | 100.0 | 116.2 | 100.0 | $9141 | 8.0/8 | 720.4 ms |
| novice | 200 | 12912 | 13145 | 76.0% | 101.2 | 0 | 100.0 | 117.1 | 100.0 | $9519 | 8.0/8 | 757.5 ms |

## 打分（结局方案 A）

| 机器人 | 10% 分位 | 中位 | 90% 分位 | 评语档 | 分项平均 |
| --- | --- | --- | --- | --- | --- |
| greedy | 15700 | 16702 | 17326 | S 93.5%，A 6.0%，B 0.0%，C 0.5%，D 0.0% | stars 3992，trophies 1481，members 500，reputation 500，unlocks 506，exhibition 1493，pace 3689，service 3018，early 922，cash 461 |
| random | 1124 | 2340 | 3001 | S 0.0%，A 0.0%，B 0.0%，C 0.0%，D 96.5%，bankrupt 3.5% | stars 1231，trophies 261，members 309，reputation 134，unlocks 97，exhibition 0，pace 0，service 52，early 0，cash 12 |
| cautious | 5622 | 6088 | 6476 | S 0.0%，A 0.0%，B 0.0%，C 64.5%，D 35.5% | stars 3168，trophies 1425，members 496，reputation 488，unlocks 226，exhibition 0，pace 0，service 0，early 0，cash 203 |
| idle | 15 | 15 | 15 | S 0.0%，A 0.0%，B 0.0%，C 0.0%，D 100.0% | stars 0，trophies 0，members 0，reputation 15，unlocks 0，exhibition 0，pace 0，service 0，early 0，cash 0 |
| good | 13550 | 14931 | 16649 | S 30.0%，A 58.0%，B 10.0%，C 2.0%，D 0.0% | stars 3984，trophies 1544，members 499，reputation 499，unlocks 507，exhibition 1485，pace 2623，service 2762，early 613，cash 474 |
| average | 12777 | 14350 | 15917 | S 21.0%，A 48.0%，B 27.0%，C 4.0%，D 0.0% | stars 3996，trophies 1587，members 499，reputation 500，unlocks 534，exhibition 1493，pace 2283，service 2451，early 530，cash 485 |
| novice | 10982 | 13145 | 14800 | S 5.5%，A 27.5%，B 45.5%，C 21.5%，D 0.0% | stars 3936，trophies 1595，members 498，reputation 500，unlocks 533，exhibition 1418，pace 1625，service 2003，early 323，cash 482 |

## 结局分布

- greedy：score 100.0%
- random：score 96.5%，bankrupt 3.5%
- cautious：score 100.0%
- idle：score 100.0%
- good：score 100.0%
- average：score 100.0%
- novice：score 100.0%

## 修复变体（局数比例）

- greedy：clubhouse.cafe 100.0%，outer_23.clay 100.0%，plaza.nightlife 100.0%，practice.academy 100.0%，stadium_2.recovery 9.5%，stadium_2.resort 90.5%，stadium_3.pickle4 100.0%
- random：clubhouse.cafe 76.0%，clubhouse.physio 16.5%，outer_23.clay 88.0%，plaza.nightlife 30.0%，practice.academy 78.0%，practice.bootcamp 1.5%，stadium_3.pickle4 8.5%，stadium_3.tennis2 1.0%
- cautious：clubhouse.cafe 100.0%，outer_23.clay 100.0%，plaza.nightlife 100.0%，practice.academy 100.0%，stadium_2.recovery 3.5%，stadium_2.resort 96.5%，stadium_3.pickle4 100.0%
- idle：—
- good：clubhouse.cafe 57.0%，clubhouse.physio 43.0%，outer_23.clay 55.0%，outer_23.hard 45.0%，plaza.nightlife 52.0%，plaza.shade_lawn 48.0%，practice.academy 48.0%，practice.bootcamp 52.0%，stadium_2.recovery 52.0%，stadium_2.resort 48.0%，stadium_3.pickle4 50.5%，stadium_3.tennis2 49.5%
- average：clubhouse.cafe 57.5%，clubhouse.physio 42.5%，outer_23.clay 45.0%，outer_23.hard 55.0%，plaza.nightlife 48.5%，plaza.shade_lawn 51.5%，practice.academy 46.0%，practice.bootcamp 54.0%，stadium_2.recovery 50.5%，stadium_2.resort 49.5%，stadium_3.pickle4 53.5%，stadium_3.tennis2 46.5%
- novice：clubhouse.cafe 52.5%，clubhouse.physio 47.5%，outer_23.clay 54.0%，outer_23.hard 46.0%，plaza.nightlife 50.0%，plaza.shade_lawn 50.0%，practice.academy 48.5%，practice.bootcamp 51.5%，stadium_2.recovery 53.0%，stadium_2.resort 47.0%，stadium_3.pickle4 48.5%，stadium_3.tennis2 51.5%

## 星级

- greedy：平均 4.99 星、4.93 座奖杯；★1 中位第 3 天（100.0% 的局升上来），★2 中位第 20 天（100.0% 的局升上来），★3 中位第 48 天（100.0% 的局升上来），★4 中位第 70 天（99.5% 的局升上来），★5 中位第 80 天（99.5% 的局升上来）
- random：平均 1.51 星、0.84 座奖杯；★1 中位第 28 天（99.5% 的局升上来），★2 中位第 83 天（51.0% 的局升上来），★3 中位第 98 天（1.0% 的局升上来）
- cautious：平均 3.96 星、4.75 座奖杯；★1 中位第 7 天（100.0% 的局升上来），★2 中位第 23 天（100.0% 的局升上来），★3 中位第 68 天（100.0% 的局升上来），★4 中位第 92 天（96.0% 的局升上来）
- idle：平均 0.00 星、0.00 座奖杯；没有升星
- good：平均 4.98 星、5.14 座奖杯；★1 中位第 4 天（100.0% 的局升上来），★2 中位第 24 天（100.0% 的局升上来），★3 中位第 48 天（100.0% 的局升上来），★4 中位第 70 天（99.0% 的局升上来），★5 中位第 91 天（99.0% 的局升上来）
- average：平均 5.00 星、5.29 座奖杯；★1 中位第 6 天（100.0% 的局升上来），★2 中位第 26 天（100.0% 的局升上来），★3 中位第 48 天（100.0% 的局升上来），★4 中位第 70 天（100.0% 的局升上来），★5 中位第 92 天（99.5% 的局升上来）
- novice：平均 4.92 星、5.32 座奖杯；★1 中位第 7 天（100.0% 的局升上来），★2 中位第 28 天（100.0% 的局升上来），★3 中位第 50 天（100.0% 的局升上来），★4 中位第 71 天（97.5% 的局升上来），★5 中位第 97 天（94.5% 的局升上来）

## 卡出现的局数比例

| 卡 | 出现比例 |
| --- | --- |
| iw_deadline | 0.0% |
| iw_dale_sweep | 11.2% |
| iw_hiring_day_4b | 21.0% |
| iw_hiring_day_4c | 27.7% |
| iw_dale_nudge | 30.5% |
| iw_hiring_day_4 | 31.5% |
| iw_hiring_day_2b | 34.8% |
| iw_hiring_day_3b | 35.3% |
| iw_hiring_day_3 | 46.4% |
| iw_hiring_day_2 | 48.1% |
| iw_pickle_noise | 51.4% |
| iw_ending | 56.1% |
| iw_route_s4 | 70.3% |
| iw_dale_story | 71.4% |
| iw_route_s3 | 71.6% |
| iw_sponsor | 71.6% |
| iw_loan_due | 73.3% |
| iw_route_s2 | 78.7% |
| iw_rival_club | 81.3% |
| iw_hiring_day_1 | 84.2% |
| iw_reporter | 84.4% |
| iw_investor_check | 85.4% |
| iw_sandstorm | 85.6% |
| iw_first_players | 85.7% |
| iw_dale_ten_years | 98.6% |
| iw_credit_union | 99.5% |
| iw_arrival | 100.0% |

**从未出现的卡：** iw_deadline

## 结局打分（W4 门评审，手工附录）

表里的数是内容版本 cfe3ae34 跑的；之后到 c4b6e2c6 只改了文案（评语、卡面、工单说明），模拟一样。
W4 门评审重做了分项（`acts/indian_wells.yaml` 的 `ending.score`）：旧分项下 good / average / novice 中位 12807 / 12861 / 12568，
只差约 300 分（会员、声望到第 92–100 天都顶满，分数奖励"顶到上限"，不奖励"经营得好"）。三档机器人真正不同的是一天看几次场景，
落在两件事上：整季服务率（中位 68% / 65% / 63%）、表演赛办成的日子（中位第 89 / 92 / 97 天）。新分项：

| 项 | 分 |
| --- | --- |
| stars | 每星 800（原 1000） |
| trophies | 每座 300 |
| members | min(会员, 100) × 5（原 ×10 不封顶） |
| reputation | × 5（原 ×10） |
| unlocks | 每把 200 |
| exhibition | 1500（原 2000） |
| pace（新） | 表演赛比第 112 天早几天 × 120（新变量 `ending.exhibition_early`，按办成那天算） |
| service（新） | 整季服务率高于 50% 的每一点 × 150（新变量 `service_season`） |
| early | 马上结算提前几天 × 30（原 ×50） |
| cash | min(5000, 现金 − 3000) × 0.1（原不封顶） |

档：S ≥ 15500、A ≥ 13800、B ≥ 11800、C ≥ 6000、D。各档（之前 → 现在）：

| 机器人 | 之前 | 现在 | 中位（之前 → 现在） |
| --- | --- | --- | --- |
| good | S 51 / A 41.5 / B 6.5 / C 1 | S 30 / A 58 / B 10 / C 2 | 12807 → 14931 |
| average | S 55 / A 32.5 / B 12 / C 0.5 | S 21 / A 48 / B 27 / C 4 | 12861 → 14350 |
| novice | S 32 / A 38 / B 24.5 / C 5.5 | S 5.5 / A 27.5 / B 45.5 / C 21.5 | 12568 → 13145 |
| cautious | C 96 / D 4 | C 64.5 / D 35.5 | 7885 → 6088 |
| greedy | S 90.5 / A 9 | S 93.5 / A 6 | 13166 → 16702 |
| random | D 95 / 破产 5 | D 96.5 / 破产 3.5 | 3128 → 2340 |
| idle | D 100 | D 100 | 30 → 15 |

good 88% 在 S/A，average 75% 在 A/B，novice 67% 在 B/C；cautious 只在 C/D，random、idle 是 D。三档的分布仍然有重叠
（机器人本身只差看场景的次数），中位差从约 300 拉到约 600 / 1200。

**结局卡（交账 vs 接着经营）：** 同一批种子 1–60（风季以前），全部交账 vs 全部接着经营：接着经营更高的局 good / average / novice
74% / 57% / 25%，中位差 +142 / +51 / −118。接着经营多拿的是第 15 周内赛的奖杯（约 +500）、成长解锁（+100）和整季服务率（排得勤的往上），
丢的是提前交账的 ×30。排得稳的接着经营划算，排得松的交账划算，哪条都不压倒另一条。之后又给"接着经营"加了风季
（三周外场和训练场衰减 ×1.5），机器人的交账率不变（它们看到结局卡就交账），所以表里不体现；什么都不做地接着经营不再白涨分。

**第二季：** 加了最小的钩子：正式巡回赛（`tournaments.official_tournament`，第二季 ★5，第 6、12 周周末，报名 、奖金 ）。
good 机器人种子 1–4 开第二季跑 95 天，四局都办了（1–2 次）。第二季还没有卡。

## 员工成长（GM-11，手工附录：sim-cli 的报告还不统计解锁）

W3 门评审以后（内容版本 570cbaa6）：分项涨幅 `growth.rates` 教学 0.12、维护 0.05、服务 0.06（`rate` 0.1 只剩没写的项用）；
球技不按 rate 涨（训练岗位效果）。`night_clay_care` 只在保留红土的局开，`o23_night_care` 解锁后不再要"状况 < 75"；
`junior_coach` 另给学院课 +$3、会员 +3% 一圈；Marco 改成现成的维护 64 / 服务 50，Diego 工资 $100 → $140；Jess 的服务潜力截在 40。
同一批种子（1–60），good / average / novice 机器人：

| 解锁 | good | average | novice | 中位第几天 | 主要是谁开的 |
| --- | --- | --- | --- | --- | --- |
| `junior_coach`（教练教学 ≥ 65） | 70% | 68% | 75% | 74–80（第 11–12 周） | 绝大多数是 Dale；Walt / Nadia 一来就开 |
| `night_clay_care`（维护工维护 ≥ 75，红土） | 28% | 22% | 28% | 67–71 | Ray、Gus，少数 Rosa；约等于红土局的一半，开了的局都做过夜间养护工单 |
| `member_referrals`（前台服务 ≥ 70） | 57% | 50% | 48% | 60–64 | 多半 Lily，Ben 约一成 |
| `open_division`（球员球技 ≥ 70） | 72% | 77% | 68% | 62–65 | Luca、Amara，少数 Diego |
| `weekend_camp`（一名教练 + 另一个教学 ≥ 60 的人） | 35% | 40% | 43% | 73–82 | 一直上课的总监 + Dale 最多；也有 Jess、Kofi |

- 改以前（一样快的 0.1）：`junior_coach` 中位第 82–87 天，开了以后还赶上一场青少年赛的局 0–23%；现在约四分之一，另有学院课的加成撑着后半段。
- `open_division` 开了以后约一半的局还去了一场地区赛（多半是第 13 周的卫冕）：卫冕奖励减半而加价 $200 不减，球技 70 双打时期望只多 $40 左右，是"翻倍下注"而不是白送。
- 通关率 good / average / novice 99.0% / 99.5% / 94.5%（上一版 98.0% / 98.5% / 93.0%）；★3 中位第 48 / 48 / 50 天，★4 第 70 / 70 / 71 天；greedy 99.5%，cautious 仍然 0%。
