# 机器人跑局报告 · indian_wells

导演 steady · 内容版本 60f24867 · 共 1400 局

| 机器人 | 局数 | 平均分 | 中位分 | 提前结算 | 平均天数 | 卡死 | 平均质量 | 平均会员 | 平均声望 | 平均现金 | 平均复原 | 每局耗时 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| greedy | 200 | 15950 | 16000 | 99.5% | 83.1 | 0 | 100.0 | 139.0 | 100.0 | $10412 | 8.0/8 | 2319.2 ms |
| random | 200 | 1913 | 1668 | 0.0% | 110.0 | 0 | 55.1 | 54.2 | 22.2 | $1117 | 3.5/8 | 924.7 ms |
| cautious | 200 | 5915 | 5943 | 0.0% | 112.0 | 0 | 100.0 | 122.2 | 99.1 | $3519 | 7.0/8 | 1243.5 ms |
| idle | 200 | 15 | 15 | 0.0% | 112.0 | 0 | 7.8 | 0.0 | 3.0 | $621 | 0.0/8 | 583.0 ms |
| good | 200 | 14415 | 14420 | 96.0% | 91.7 | 0 | 100.0 | 129.1 | 100.0 | $9627 | 8.0/8 | 877.6 ms |
| average | 200 | 13604 | 13565 | 90.0% | 95.5 | 0 | 100.0 | 129.0 | 99.9 | $10246 | 8.0/8 | 936.3 ms |
| novice | 200 | 12032 | 12242 | 73.5% | 102.1 | 0 | 100.0 | 128.7 | 100.0 | $10170 | 8.0/8 | 971.8 ms |

## 打分（结局方案 A）

| 机器人 | 10% 分位 | 中位 | 90% 分位 | 评语档 | 分项平均 |
| --- | --- | --- | --- | --- | --- |
| greedy | 15100 | 16000 | 16750 | S 93.0%，A 6.5%，B 0.0%，C 0.5%，D 0.0% | stars 3992，trophies 1526，members 500，reputation 500，unlocks 574，exhibition 1493，pace 3466，service 2534，early 866，cash 500 |
| random | 1035 | 1668 | 2874 | S 0.0%，A 0.0%，B 0.0%，C 0.0%，D 94.0%，bankrupt 6.0% | stars 1145，trophies 211，members 281，reputation 114，unlocks 118，exhibition 0，pace 0，service 26，early 0，cash 18 |
| cautious | 5595 | 5943 | 6311 | S 0.0%，A 0.0%，B 0.0%，C 38.5%，D 61.5% | stars 3164，trophies 1464，members 500，reputation 495，unlocks 216，exhibition 0，pace 0，service 0，early 0，cash 76 |
| idle | 15 | 15 | 15 | S 0.0%，A 0.0%，B 0.0%，C 0.0%，D 100.0% | stars 0，trophies 0，members 0，reputation 15，unlocks 0，exhibition 0，pace 0，service 0，early 0，cash 0 |
| good | 13150 | 14420 | 15900 | S 27.0%，A 61.5%，B 10.0%，C 1.5%，D 0.0% | stars 4000，trophies 1557，members 500，reputation 500，unlocks 518，exhibition 1500，pace 2539，service 2204，early 610，cash 487 |
| average | 12170 | 13565 | 15500 | S 16.5%，A 45.0%，B 32.5%，C 6.0%，D 0.0% | stars 3992，trophies 1626，members 499，reputation 500，unlocks 512，exhibition 1485，pace 2182，service 1826，early 494，cash 489 |
| novice | 9579 | 12242 | 14320 | S 3.0%，A 19.5%，B 50.0%，C 27.5%，D 0.0% | stars 3900，trophies 1562，members 499，reputation 500，unlocks 538，exhibition 1358，pace 1481，service 1429，early 298，cash 468 |

## 结局分布

- greedy：score 100.0%
- random：score 94.0%，bankrupt 6.0%
- cautious：score 100.0%
- idle：score 100.0%
- good：score 100.0%
- average：score 100.0%
- novice：score 100.0%

## 修复变体（局数比例）

- greedy：clubhouse.cafe 100.0%，outer_23.clay 100.0%，plaza.nightlife 100.0%，practice.academy 100.0%，stadium_2.recovery 9.5%，stadium_2.resort 90.5%，stadium_3.pickle4 100.0%
- random：clubhouse.cafe 86.5%，clubhouse.physio 5.0%，outer_23.clay 82.5%，plaza.nightlife 23.0%，practice.academy 67.5%，practice.bootcamp 2.0%，stadium_3.pickle4 7.5%，stadium_3.tennis2 0.5%
- cautious：clubhouse.cafe 100.0%，outer_23.clay 100.0%，plaza.nightlife 100.0%，practice.academy 100.0%，stadium_2.recovery 3.5%，stadium_2.resort 96.5%，stadium_3.pickle4 100.0%
- idle：—
- good：clubhouse.cafe 57.0%，clubhouse.physio 43.0%，outer_23.clay 55.0%，outer_23.hard 45.0%，plaza.nightlife 52.0%，plaza.shade_lawn 48.0%，practice.academy 48.0%，practice.bootcamp 52.0%，stadium_2.recovery 56.5%，stadium_2.resort 43.5%，stadium_3.pickle4 50.5%，stadium_3.tennis2 49.5%
- average：clubhouse.cafe 57.5%，clubhouse.physio 42.5%，outer_23.clay 45.0%，outer_23.hard 55.0%，plaza.nightlife 48.5%，plaza.shade_lawn 51.5%，practice.academy 46.0%，practice.bootcamp 54.0%，stadium_2.recovery 51.0%，stadium_2.resort 49.0%，stadium_3.pickle4 53.5%，stadium_3.tennis2 46.5%
- novice：clubhouse.cafe 52.5%，clubhouse.physio 47.5%，outer_23.clay 54.0%，outer_23.hard 46.0%，plaza.nightlife 50.0%，plaza.shade_lawn 50.0%，practice.academy 48.5%，practice.bootcamp 51.5%，stadium_2.recovery 49.0%，stadium_2.resort 51.0%，stadium_3.pickle4 48.5%，stadium_3.tennis2 51.5%

## 星级

- greedy：平均 4.99 星、5.08 座奖杯；★1 中位第 3 天（100.0% 的局升上来），★2 中位第 20 天（100.0% 的局升上来），★3 中位第 48 天（100.0% 的局升上来），★4 中位第 70 天（99.5% 的局升上来），★5 中位第 82 天（99.5% 的局升上来）
- random：平均 1.40 星、0.66 座奖杯；★1 中位第 32 天（99.0% 的局升上来），★2 中位第 97 天（40.5% 的局升上来），★3 中位第 104 天（1.0% 的局升上来）
- cautious：平均 3.96 星、4.88 座奖杯；★1 中位第 7 天（100.0% 的局升上来），★2 中位第 23 天（100.0% 的局升上来），★3 中位第 68 天（100.0% 的局升上来），★4 中位第 95 天（95.5% 的局升上来）
- idle：平均 0.00 星、0.00 座奖杯；没有升星
- good：平均 5.00 星、5.19 座奖杯；★1 中位第 4 天（100.0% 的局升上来），★2 中位第 24 天（100.0% 的局升上来），★3 中位第 48 天（100.0% 的局升上来），★4 中位第 70 天（100.0% 的局升上来），★5 中位第 91 天（100.0% 的局升上来）
- average：平均 4.99 星、5.42 座奖杯；★1 中位第 6 天（100.0% 的局升上来），★2 中位第 26 天（100.0% 的局升上来），★3 中位第 48 天（100.0% 的局升上来），★4 中位第 70 天（100.0% 的局升上来），★5 中位第 92 天（99.0% 的局升上来）
- novice：平均 4.88 星、5.21 座奖杯；★1 中位第 7 天（100.0% 的局升上来），★2 中位第 28 天（100.0% 的局升上来），★3 中位第 50 天（100.0% 的局升上来），★4 中位第 72 天（97.0% 的局升上来），★5 中位第 98 天（90.5% 的局升上来）

## 地块（W5）

- greedy：golf_west 开工 100.0%（south_courts 100.0%），开地 100.0%，中位第 49 天、施工 1.1 天；se_corner 开工 99.5%（event_plaza 99.5%），开地 94.0%，中位第 71 天、施工 0.8 天
- random：golf_west 开工 1.0%（oasis_lawn 1.0%），开地 0.0%
- cautious：golf_west 开工 100.0%（south_courts 100.0%），开地 100.0%，中位第 75 天、施工 6.8 天；se_corner 开工 95.5%（event_plaza 95.5%），开地 95.5%，中位第 98 天、施工 3.4 天
- idle：—
- good：golf_west 开工 100.0%（oasis_lawn 50.0%、south_courts 50.0%），开地 100.0%，中位第 51 天、施工 2.1 天；se_corner 开工 100.0%（academy_isle 50.5%、event_plaza 49.5%），开地 90.0%，中位第 72 天、施工 1.9 天
- average：golf_west 开工 100.0%（south_courts 55.0%、oasis_lawn 45.0%），开地 100.0%，中位第 52 天、施工 2.8 天；se_corner 开工 100.0%（event_plaza 50.0%、academy_isle 50.0%），开地 95.5%，中位第 73 天、施工 2.1 天
- novice：golf_west 开工 100.0%（oasis_lawn 51.5%、south_courts 48.5%），开地 100.0%，中位第 56 天、施工 3.7 天；se_corner 开工 97.0%（event_plaza 51.0%、academy_isle 46.0%），开地 94.5%，中位第 75 天、施工 2.9 天

## 卡出现的局数比例

| 卡 | 出现比例 |
| --- | --- |
| iw_deadline | 0.0% |
| iw_dale_sweep | 12.1% |
| iw_hiring_day_4b | 22.9% |
| iw_hiring_day_4c | 26.7% |
| iw_dale_nudge | 30.4% |
| iw_hiring_day_4 | 31.1% |
| iw_hiring_day_2b | 34.5% |
| iw_hiring_day_3b | 34.8% |
| iw_hiring_day_3 | 46.8% |
| iw_hiring_day_2 | 48.4% |
| iw_pickle_noise | 51.4% |
| iw_ending | 55.6% |
| iw_route_s4 | 70.3% |
| iw_dale_story | 71.4% |
| iw_route_s3 | 71.6% |
| iw_sponsor | 71.6% |
| iw_loan_due | 73.1% |
| iw_route_s2 | 77.2% |
| iw_rival_club | 81.9% |
| iw_reporter | 83.4% |
| iw_hiring_day_1 | 84.0% |
| iw_first_players | 85.7% |
| iw_sandstorm | 85.7% |
| iw_investor_check | 87.1% |
| iw_dale_ten_years | 99.4% |
| iw_credit_union | 99.6% |
| iw_arrival | 100.0% |

**从未出现的卡：** iw_deadline

## 分数档（W5 门设计评审，手工附录）

模拟没改，只改了 `ending.grades`：开地每局都要付，good / average / novice 中位比不开地低约 500 / 800 / 900，旧档（S 15500 / A 13800 / B 11800）下
good 只剩 15.5% S、average 中位（13565）掉进 B。整体下调约 500：S ≥ 15000、A ≥ 13300、B ≥ 11400、C ≥ 6000。

| 机器人 | 旧档 | 新档 | W4 定档时（开地以前） |
| --- | --- | --- | --- |
| good | S 15.5 / A 59 / B 22.5 / C 3 | S 27 / A 61.5 / B 10 / C 1.5 | S 30 / A 58 / B 10 / C 2 |
| average | S 10 / A 35.5 / B 46 / C 8.5 | S 16.5 / A 45 / B 32.5 / C 6 | S 21 / A 48 / B 27 / C 4 |
| novice | S 0.5 / A 14 / B 50 / C 35.5 | S 3 / A 19.5 / B 50 / C 27.5 | S 5.5 / A 27.5 / B 45.5 / C 21.5 |
| greedy | S 79.5 / A 18.5 | S 93 / A 6.5 | S 93.5 / A 6 |
| cautious | C 38.5 / D 61.5 | 不变 | C 64.5 / D 35.5 |

good S/A 88.5%、average A/B 77.5%、novice B/C 77.5%，回到 W4 定档的意图。cautious、random、idle 不变（C 的门槛 6000 没动）。
下面"地块"附录里"档的门槛没动"那一段说的是这次以前。

## 地块（W5 GM-15，手工附录）

内容版本 774f1d0e。上面"地块"一节是 sim-cli 的统计（普通玩家机器人按种子随便选路，greedy、cautious 总选路 A）。
同一批种子（1–80）强制选同一条路的中位分（临时脚本，没进 sim-cli；学院岛是加了学员押金以后的那一版）：

| 处 | 变体 | good | average | novice |
| --- | --- | --- | --- | --- |
| ★3 | 南场 | 14225 | 13400 | 12550 |
| ★3 | 绿洲草坪 | 14225 | 13450 | 12400 |
| ★4 | 赛事广场 | 14450 | 13450 | 12255 |
| ★4 | 学院岛 | 14430 | 13643 | 12440 |

- 两边都不被压制：南场会员多（平均 141 对 117，上限 +24），绿洲草坪整季服务率略高；赛事广场结束时现金多约 $1500（门票），学院岛表演赛略早。
- 南场远（离会所 47、离大门 105 分钟）不是陷阱：分数和绿洲草坪一样。学院岛最远（91–158 分钟），靠学员押金 $1200、会员 +6 和两个不算需求的岗位抵掉。
- 表演赛没被提前也没被卡住：表演赛中位第 91.5 / 92 / 98 天（good / average / novice），不开地是 89 / 92 / 97；办成表演赛的局和以前一样（见上面"打分"的 exhibition 分项）。
- 开地的代价：和不开地（在内存里拿掉地块）比，good / average / novice 中位约 −600 / −550 / −650（80 局），一半是清地的钱和人手推迟了表演赛（pace），一半是新需求岗位拉低整季服务率（service）。评语档（之前 → 现在）：

| 机器人 | 之前 | 现在 |
| --- | --- | --- |
| greedy | S 93.5 / A 6 | S 79.5 / A 18.5 / B 1.5 / C 0.5 |
| good | S 30 / A 58 / B 10 / C 2 | S 15.5 / A 59 / B 22.5 / C 3 |
| average | S 21 / A 48 / B 27 / C 4 | S 10 / A 35.5 / B 46 / C 8.5 |
| novice | S 5.5 / A 27.5 / B 45.5 / C 21.5 | S 0.5 / A 14 / B 50 / C 35.5 |
| cautious | C 64.5 / D 35.5 | C 38.5 / D 61.5 |
| random | D 96.5 / 破产 3.5 | D 94 / 破产 6 |
| idle | D 100 | D 100 |

档的门槛没动：good 多半 A、average 多半 A/B、novice 多半 B/C，仍然分得开；S 变少了。

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
