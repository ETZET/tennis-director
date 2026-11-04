# 机器人跑局报告 · indian_wells

导演 steady · 内容版本 b31fa2c1 · 共 1400 局

| 机器人 | 局数 | 平均分 | 中位分 | 提前结算 | 平均天数 | 卡死 | 平均质量 | 平均会员 | 平均声望 | 平均现金 | 平均复原 | 每局耗时 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| greedy | 200 | 13186 | 13166 | 99.5% | 81.3 | 0 | 100.0 | 113.8 | 100.0 | $8460 | 8.0/8 | 792.5 ms |
| random | 200 | 2836 | 3128 | 0.0% | 110.5 | 0 | 58.6 | 60.5 | 25.5 | $1293 | 3.7/8 | 606.8 ms |
| cautious | 200 | 7789 | 7885 | 0.0% | 112.0 | 0 | 100.0 | 99.8 | 97.6 | $4993 | 7.0/8 | 957.5 ms |
| idle | 200 | 30 | 30 | 0.0% | 112.0 | 0 | 7.8 | 0.0 | 3.0 | $621 | 0.0/8 | 462.5 ms |
| good | 200 | 12810 | 12807 | 93.0% | 91.6 | 0 | 100.0 | 117.4 | 99.9 | $9064 | 8.0/8 | 702.7 ms |
| average | 200 | 12767 | 12861 | 92.5% | 94.3 | 0 | 100.0 | 116.2 | 100.0 | $9127 | 8.0/8 | 706.0 ms |
| novice | 200 | 12311 | 12568 | 76.0% | 101.2 | 0 | 100.0 | 117.2 | 100.0 | $9561 | 8.0/8 | 749.2 ms |

## 打分（结局方案 A）

| 机器人 | 10% 分位 | 中位 | 90% 分位 | 评语档 | 分项平均 |
| --- | --- | --- | --- | --- | --- |
| greedy | 12807 | 13166 | 13649 | S 90.5%，A 9.0%，B 0.0%，C 0.5%，D 0.0% | stars 4990，trophies 1481，members 1138，reputation 1000，unlocks 506，exhibition 1990，early 1536，cash 546 |
| random | 1639 | 3128 | 3848 | S 0.0%，A 0.0%，B 0.0%，C 0.0%，D 95.0%，bankrupt 5.0% | stars 1553，trophies 264，members 624，reputation 260，unlocks 127，exhibition 0，early 0，cash 8 |
| cautious | 7383 | 7885 | 8280 | S 0.0%，A 0.0%，B 0.0%，C 96.0%，D 4.0% | stars 3960，trophies 1425，members 998，reputation 976，unlocks 226，exhibition 0，early 0，cash 204 |
| idle | 30 | 30 | 30 | S 0.0%，A 0.0%，B 0.0%，C 0.0%，D 100.0% | stars 0，trophies 0，members 0，reputation 30，unlocks 0，exhibition 0，early 0，cash 0 |
| good | 12318 | 12807 | 13379 | S 51.0%，A 41.5%，B 6.5%，C 1.0%，D 0.0% | stars 4980，trophies 1544，members 1174，reputation 999，unlocks 506，exhibition 1980，early 1022，cash 606 |
| average | 12102 | 12861 | 13324 | S 55.0%，A 32.5%，B 12.0%，C 0.5%，D 0.0% | stars 4995，trophies 1589，members 1162，reputation 1000，unlocks 534，exhibition 1990，early 884，cash 613 |
| novice | 11668 | 12568 | 13278 | S 32.0%，A 38.0%，B 24.5%，C 5.5%，D 0.0% | stars 4920，trophies 1596，members 1172，reputation 1000，unlocks 536，exhibition 1890，early 539，cash 658 |

## 结局分布

- greedy：score 100.0%
- random：score 95.0%，bankrupt 5.0%
- cautious：score 100.0%
- idle：score 100.0%
- good：score 100.0%
- average：score 100.0%
- novice：score 100.0%

## 修复变体（局数比例）

- greedy：clubhouse.cafe 100.0%，outer_23.clay 100.0%，plaza.nightlife 100.0%，practice.academy 100.0%，stadium_2.recovery 9.5%，stadium_2.resort 90.5%，stadium_3.pickle4 100.0%
- random：clubhouse.cafe 81.5%，clubhouse.physio 12.5%，outer_23.clay 88.0%，plaza.nightlife 28.0%，practice.academy 70.0%，practice.bootcamp 4.0%，stadium_3.pickle4 10.5%
- cautious：clubhouse.cafe 100.0%，outer_23.clay 100.0%，plaza.nightlife 100.0%，practice.academy 100.0%，stadium_2.recovery 3.5%，stadium_2.resort 96.5%，stadium_3.pickle4 100.0%
- idle：—
- good：clubhouse.cafe 57.0%，clubhouse.physio 43.0%，outer_23.clay 55.0%，outer_23.hard 45.0%，plaza.nightlife 52.0%，plaza.shade_lawn 48.0%，practice.academy 48.0%，practice.bootcamp 52.0%，stadium_2.recovery 52.0%，stadium_2.resort 48.0%，stadium_3.pickle4 50.5%，stadium_3.tennis2 49.5%
- average：clubhouse.cafe 57.5%，clubhouse.physio 42.5%，outer_23.clay 45.0%，outer_23.hard 55.0%，plaza.nightlife 48.5%，plaza.shade_lawn 51.5%，practice.academy 46.0%，practice.bootcamp 54.0%，stadium_2.recovery 50.5%，stadium_2.resort 49.5%，stadium_3.pickle4 53.5%，stadium_3.tennis2 46.5%
- novice：clubhouse.cafe 52.5%，clubhouse.physio 47.5%，outer_23.clay 54.0%，outer_23.hard 46.0%，plaza.nightlife 50.0%，plaza.shade_lawn 50.0%，practice.academy 48.5%，practice.bootcamp 51.5%，stadium_2.recovery 53.0%，stadium_2.resort 47.0%，stadium_3.pickle4 48.5%，stadium_3.tennis2 51.5%

## 星级

- greedy：平均 4.99 星、4.93 座奖杯；★1 中位第 3 天（100.0% 的局升上来），★2 中位第 20 天（100.0% 的局升上来），★3 中位第 48 天（100.0% 的局升上来），★4 中位第 70 天（99.5% 的局升上来），★5 中位第 80 天（99.5% 的局升上来）
- random：平均 1.51 星、0.84 座奖杯；★1 中位第 28 天（99.0% 的局升上来），★2 中位第 84 天（52.0% 的局升上来），★3 中位第 101 天（0.5% 的局升上来）
- cautious：平均 3.96 星、4.75 座奖杯；★1 中位第 7 天（100.0% 的局升上来），★2 中位第 23 天（100.0% 的局升上来），★3 中位第 68 天（100.0% 的局升上来），★4 中位第 92 天（96.0% 的局升上来）
- idle：平均 0.00 星、0.00 座奖杯；没有升星
- good：平均 4.98 星、5.14 座奖杯；★1 中位第 4 天（100.0% 的局升上来），★2 中位第 24 天（100.0% 的局升上来），★3 中位第 48 天（100.0% 的局升上来），★4 中位第 70 天（99.0% 的局升上来），★5 中位第 91 天（99.0% 的局升上来）
- average：平均 5.00 星、5.30 座奖杯；★1 中位第 6 天（100.0% 的局升上来），★2 中位第 26 天（100.0% 的局升上来），★3 中位第 48 天（100.0% 的局升上来），★4 中位第 70 天（100.0% 的局升上来），★5 中位第 92 天（99.5% 的局升上来）
- novice：平均 4.92 星、5.32 座奖杯；★1 中位第 7 天（100.0% 的局升上来），★2 中位第 28 天（100.0% 的局升上来），★3 中位第 50 天（100.0% 的局升上来），★4 中位第 71 天（97.5% 的局升上来），★5 中位第 97 天（94.5% 的局升上来）

## 卡出现的局数比例

| 卡 | 出现比例 |
| --- | --- |
| iw_deadline | 0.0% |
| iw_dale_sweep | 10.8% |
| iw_hiring_day_4b | 21.1% |
| iw_hiring_day_4c | 27.1% |
| iw_dale_nudge | 30.4% |
| iw_hiring_day_4 | 32.2% |
| iw_hiring_day_2b | 34.8% |
| iw_hiring_day_3b | 35.4% |
| iw_hiring_day_3 | 46.4% |
| iw_hiring_day_2 | 48.2% |
| iw_pickle_noise | 51.4% |
| iw_ending | 56.1% |
| iw_route_s4 | 70.3% |
| iw_dale_story | 71.4% |
| iw_route_s3 | 71.5% |
| iw_sponsor | 71.5% |
| iw_loan_due | 72.9% |
| iw_route_s2 | 78.9% |
| iw_rival_club | 81.0% |
| iw_reporter | 84.0% |
| iw_hiring_day_1 | 84.2% |
| iw_investor_check | 85.3% |
| iw_sandstorm | 85.6% |
| iw_first_players | 85.7% |
| iw_dale_ten_years | 98.6% |
| iw_credit_union | 99.6% |
| iw_arrival | 100.0% |

**从未出现的卡：** iw_deadline

## 结局打分（W4，手工附录）

内容版本 b31fa2c1 打开结局方案 A（`acts/indian_wells.yaml` 的 `ending`）。分项：星级 ×1000、奖杯 ×300、会员 ×10、声望 ×10、
成长解锁 ×200、表演赛 2000、提前每天 50、现金只算 $3000 以上的部分 ×0.1。档：S ≥ 12800、A ≥ 12200、B ≥ 10500、C ≥ 6000、D。
S 线放在 good 的中位（12807）上。good / average / novice 三档到第 92–100 天会员、声望都顶到上限，分开它们的主要是提前的天数
（平均提前 20 / 18 / 11 天），中位只差约 300 分：分数分得开"有没有办成表演赛、有没有到 ★4"，分不太开"都办成了的人谁更会排人"。
结局分布里没有 deadline：期限卡在打分模式下打不开（第 112 天 18 点先结算了）；破产照旧结束、不结算（random 5%）。

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
