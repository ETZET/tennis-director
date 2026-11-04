# 可玩性指标 · 内容 a8eb5d56 · 每种打法 60 局

## 节奏（1× 速度换算成真实时间）

| 打法 | 每局决定数 | 默认处理 | 平均几秒一个决定 | 最长空档 | 超过 90 秒的空档/局 | 同时最多开着 |
| --- | --- | --- | --- | --- | --- | --- |
| greedy | 19.9 | 0.0 | 346 s | 107 s | 11.0 | 1 |
| random | 13.1 | 2.3 | 449 s | 78 s | 0.0 | 2 |
| cautious | 20.7 | 0.0 | 378 s | 107 s | 11.4 | 2 |
| idle | 0.0 | 7.0 | 993 s | 60 s | 0.0 | 1 |
| idle_once | 0.0 | 7.0 | 993 s | 60 s | 0.0 | 1 |

## 卡的节奏（游戏天）

| 打法 | 每局卡数 | 第 15–100 天的卡 | 最长无卡空档（中位 / 平均 / 最大） | ≥ 10 天的空档局占比 |
| --- | --- | --- | --- | --- |
| greedy | 19.9 | 16.0 | 15.8 / 15.9 / 21.1 | 100% |
| random | 15.4 | 10.8 | 22.5 / 21.1 / 30.8 | 100% |
| cautious | 20.7 | 15.7 | 19.9 / 20.1 / 26.6 | 100% |
| idle | 7.0 | 3.0 | 31.0 / 31.0 / 31.0 | 100% |
| idle_once | 7.0 | 3.0 | 31.0 / 31.0 / 31.0 | 100% |

## 每张卡的出现率（出现过的局占比）

| 卡 | greedy | random | cautious | idle | idle_once |
| --- | --- | --- | --- | --- | --- |
| iw_arrival | 100% | 100% | 100% | 100% | 100% |
| iw_credit_union | 100% | 100% | 100% | 100% | 100% |
| iw_dale_nudge | 0% | 100% | 0% | 100% | 100% |
| iw_dale_story | 100% | 0% | 88.3% | 0% | 0% |
| iw_dale_ten_years | 100% | 100% | 100% | 100% | 100% |
| iw_deadline | 0% | 80% | 100% | 100% | 100% |
| iw_first_players | 100% | 100% | 100% | 0% | 0% |
| iw_hiring_day_1 | 100% | 95% | 100% | 0% | 0% |
| iw_hiring_day_2 | 56.7% | 60% | 43.3% | 0% | 0% |
| iw_hiring_day_2b | 43.3% | 31.7% | 56.7% | 0% | 0% |
| iw_hiring_day_3 | 75% | 36.7% | 65% | 0% | 0% |
| iw_hiring_day_3b | 25% | 50% | 35% | 0% | 0% |
| iw_hiring_day_4 | 73.3% | 41.7% | 78.3% | 0% | 0% |
| iw_hiring_day_4b | 26.7% | 38.3% | 21.7% | 0% | 0% |
| iw_investor_check | 88.3% | 90% | 100% | 100% | 100% |
| iw_loan_due | 100% | 35% | 100% | 0% | 0% |
| iw_pickle_noise | 100% | 15% | 96.7% | 0% | 0% |
| iw_reporter | 100% | 78.3% | 100% | 0% | 0% |
| iw_rival_club | 96.7% | 75% | 100% | 0% | 0% |
| iw_route_s2 | 100% | 46.7% | 100% | 0% | 0% |
| iw_route_s3 | 100% | 0% | 98.3% | 0% | 0% |
| iw_route_s4 | 100% | 0% | 86.7% | 0% | 0% |
| iw_sandstorm | 100% | 100% | 100% | 0% | 0% |
| iw_sponsor | 100% | 0% | 98.3% | 0% | 0% |

## 结局

- greedy：exhibition 100%
- random：deadline 80%，bankrupt 20%
- cautious：deadline 100%
- idle：deadline 100%
- idle_once：deadline 100%

## 后果分叉：同一种子、不同打法见过的卡有多不同（Jaccard 距离，0 = 完全一样）

- greedy vs random：0.52
- greedy vs cautious：0.21
- greedy vs idle：0.81
- greedy vs idle_once：0.81
- random vs cautious：0.48
- random vs idle：0.58
- random vs idle_once：0.58
- cautious vs idle：0.76
- cautious vs idle_once：0.76
- idle vs idle_once：0.00

## 取舍：各打法在每张卡上选了什么（玩家主动选的）

| 卡 | greedy | random | cautious | idle | idle_once |
| --- | --- | --- | --- | --- | --- |
| iw_arrival | B 100% | A 51% B 49% | A 100% | — | — |
| iw_credit_union | A 100% | A 40% B 60% | A 100% | — | — |
| iw_dale_nudge | — | A 54% B 46% | — | — | — |
| iw_dale_story | A 100% | — | A 100% | — | — |
| iw_dale_ten_years | B 100% | A 50% B 50% | B 100% | — | — |
| iw_deadline | — | A 100% | A 100% | — | — |
| iw_first_players | A 100% | A 45% B 55% | A 100% | — | — |
| iw_hiring_day_1 | A 100% | A 48% B 23% C 29% | C 100% | — | — |
| iw_hiring_day_2 | B 100% | A 52% B 18% C 30% | C 100% | — | — |
| iw_hiring_day_2b | B 100% | A 36% B 43% C 21% | C 100% | — | — |
| iw_hiring_day_3 | A 100% | A 27% B 50% C 23% | C 100% | — | — |
| iw_hiring_day_3b | A 100% | A 21% B 21% C 58% | C 100% | — | — |
| iw_hiring_day_4 | B 100% | A 32% B 45% C 23% | C 100% | — | — |
| iw_hiring_day_4b | A 100% | A 55% B 35% C 10% | C 100% | — | — |
| iw_investor_check | C 100% | A 30% B 42% C 28% | A 100% | — | — |
| iw_loan_due | B 100% | B 100% | B 100% | — | — |
| iw_pickle_noise | A 2% B 92% C 7% | A 57% B 14% C 29% | A 100% | — | — |
| iw_reporter | A 100% | A 37% B 63% | B 100% | — | — |
| iw_rival_club | A 100% | A 47% B 53% | A 100% | — | — |
| iw_route_s2 | A 100% | A 50% B 50% | A 100% | — | — |
| iw_route_s3 | A 100% | — | A 100% | — | — |
| iw_route_s4 | A 100% | — | A 100% | — | — |
| iw_sandstorm | B 100% | A 48% B 52% | B 100% | — | — |
| iw_sponsor | A 100% | — | B 100% | — | — |

## 被压制的选项（0）

没有。
