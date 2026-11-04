# 可玩性指标 · 内容 1b64cdf5 · 每种打法 60 局

## 节奏（1× 速度换算成真实时间）

| 打法 | 每局决定数 | 默认处理 | 平均几秒一个决定 | 最长空档 | 超过 90 秒的空档/局 | 同时最多开着 |
| --- | --- | --- | --- | --- | --- | --- |
| greedy | 18.8 | 0.0 | 355 s | 97 s | 5.3 | 1 |
| random | 12.3 | 2.7 | 478 s | 79 s | 0.1 | 2 |
| cautious | 19.9 | 0.0 | 376 s | 82 s | 0.0 | 2 |
| idle | 0.0 | 7.0 | 993 s | 60 s | 0.0 | 1 |
| idle_once | 0.0 | 7.0 | 993 s | 60 s | 0.0 | 1 |

## 卡的节奏（游戏天）

| 打法 | 每局卡数 | 第 15–100 天的卡 | 最长无卡空档（中位 / 平均 / 最大） | ≥ 10 天的空档局占比 |
| --- | --- | --- | --- | --- |
| greedy | 18.8 | 15.0 | 15.3 / 15.6 / 19.8 | 100% |
| random | 15.0 | 10.0 | 26.0 / 24.8 / 38.1 | 100% |
| cautious | 19.9 | 15.4 | 16.3 / 16.6 / 24.9 | 100% |
| idle | 7.0 | 3.0 | 31.0 / 31.0 / 31.0 | 100% |
| idle_once | 7.0 | 3.0 | 31.0 / 31.0 / 31.0 | 100% |

## 每张卡的出现率（出现过的局占比）

| 卡 | greedy | random | cautious | idle | idle_once |
| --- | --- | --- | --- | --- | --- |
| iw_arrival | 100% | 100% | 100% | 100% | 100% |
| iw_credit_union | 100% | 100% | 100% | 100% | 100% |
| iw_dale_nudge | 0% | 100% | 0% | 100% | 100% |
| iw_dale_story | 100% | 0% | 100% | 0% | 0% |
| iw_dale_sweep | 0% | 93.3% | 0% | 0% | 0% |
| iw_dale_ten_years | 98.3% | 100% | 100% | 100% | 100% |
| iw_deadline | 0% | 93.3% | 100% | 100% | 100% |
| iw_first_players | 100% | 100% | 100% | 0% | 0% |
| iw_hiring_day_1 | 100% | 81.7% | 100% | 0% | 0% |
| iw_hiring_day_2 | 73.3% | 38.3% | 76.7% | 0% | 0% |
| iw_hiring_day_2b | 26.7% | 38.3% | 23.3% | 0% | 0% |
| iw_hiring_day_3 | 86.7% | 31.7% | 66.7% | 0% | 0% |
| iw_hiring_day_3b | 13.3% | 35% | 33.3% | 0% | 0% |
| iw_hiring_day_4 | 88.3% | 43.3% | 80% | 0% | 0% |
| iw_hiring_day_4b | 11.7% | 23.3% | 20% | 0% | 0% |
| iw_investor_check | 83.3% | 95% | 100% | 100% | 100% |
| iw_loan_due | 100% | 38.3% | 100% | 0% | 0% |
| iw_pickle_noise | 100% | 1.7% | 100% | 0% | 0% |
| iw_reporter | 100% | 85% | 100% | 0% | 0% |
| iw_rival_club | 100% | 78.3% | 100% | 0% | 0% |
| iw_route_s2 | 100% | 48.3% | 100% | 0% | 0% |
| iw_route_s3 | 100% | 0% | 100% | 0% | 0% |
| iw_route_s4 | 100% | 0% | 93.3% | 0% | 0% |
| iw_sandstorm | 100% | 98.3% | 100% | 0% | 0% |
| iw_sponsor | 100% | 0% | 100% | 0% | 0% |

## 结局

- greedy：exhibition 100%
- random：deadline 93.3%，bankrupt 6.7%
- cautious：deadline 100%
- idle：deadline 100%
- idle_once：deadline 100%

## 后果分叉：同一种子、不同打法见过的卡有多不同（Jaccard 距离，0 = 完全一样）

- greedy vs random：0.55
- greedy vs cautious：0.16
- greedy vs idle：0.82
- greedy vs idle_once：0.82
- random vs cautious：0.50
- random vs idle：0.58
- random vs idle_once：0.58
- cautious vs idle：0.76
- cautious vs idle_once：0.76
- idle vs idle_once：0.00

## 取舍：各打法在每张卡上选了什么（玩家主动选的）

| 卡 | greedy | random | cautious | idle | idle_once |
| --- | --- | --- | --- | --- | --- |
| iw_arrival | B 100% | A 51% B 49% | A 100% | — | — |
| iw_credit_union | A 100% | A 47% B 53% | A 100% | — | — |
| iw_dale_nudge | — | A 56% B 44% | — | — | — |
| iw_dale_story | A 100% | — | A 100% | — | — |
| iw_dale_sweep | — | A 50% B 50% | — | — | — |
| iw_dale_ten_years | B 100% | A 51% B 49% | B 100% | — | — |
| iw_deadline | — | A 100% | A 100% | — | — |
| iw_first_players | A 100% | A 37% B 63% | A 100% | — | — |
| iw_hiring_day_1 | A 100% | A 26% B 43% C 31% | C 100% | — | — |
| iw_hiring_day_2 | B 100% | A 26% B 53% C 21% | C 100% | — | — |
| iw_hiring_day_2b | B 100% | A 41% B 18% C 41% | C 100% | — | — |
| iw_hiring_day_3 | A 100% | A 37% B 58% C 5% | C 100% | — | — |
| iw_hiring_day_3b | B 100% | A 21% B 53% C 26% | C 100% | — | — |
| iw_hiring_day_4 | B 100% | A 17% B 22% C 61% | C 100% | — | — |
| iw_hiring_day_4b | A 100% | A 36% B 45% C 18% | C 100% | — | — |
| iw_investor_check | A 98% C 2% | A 32% B 38% C 30% | A 100% | — | — |
| iw_loan_due | A 8% B 92% | B 100% | A 18% B 82% | — | — |
| iw_pickle_noise | A 8% B 90% C 2% | C 100% | A 100% | — | — |
| iw_reporter | A 100% | A 49% B 51% | B 100% | — | — |
| iw_rival_club | A 100% | A 37% B 63% | A 100% | — | — |
| iw_route_s2 | A 100% | A 56% B 44% | A 100% | — | — |
| iw_route_s3 | A 100% | — | A 100% | — | — |
| iw_route_s4 | A 100% | — | A 100% | — | — |
| iw_sandstorm | B 100% | A 57% B 43% | B 100% | — | — |
| iw_sponsor | A 100% | — | B 100% | — | — |

## 被压制的选项（0）

没有。
