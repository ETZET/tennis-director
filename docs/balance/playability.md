# 可玩性指标 · 内容 3171144d · 每种打法 100 局

## 节奏（1× 速度换算成真实时间）

| 打法 | 每局决定数 | 默认处理 | 平均几秒一个决定 | 最长空档 | 超过 90 秒的空档/局 | 同时最多开着 |
| --- | --- | --- | --- | --- | --- | --- |
| greedy | 18.8 | 0.0 | 406 s | 107 s | 16.5 | 1 |
| random | 15.3 | 3.4 | 407 s | 86 s | 0.4 | 3 |
| cautious | 19.0 | 0.0 | 465 s | 111 s | 28.9 | 1 |
| idle | 0.0 | 9.0 | 782 s | 60 s | 0.0 | 1 |
| idle_once | 0.0 | 9.0 | 782 s | 60 s | 0.0 | 1 |

## 卡的节奏（游戏天）

| 打法 | 每局卡数 | 第 15–100 天的卡 | 最长无卡空档（中位 / 平均 / 最大） | ≥ 10 天的空档局占比 |
| --- | --- | --- | --- | --- |
| greedy | 18.8 | 14.8 | 14.8 / 14.7 / 26.6 | 93% |
| random | 18.8 | 13.9 | 20.0 / 20.1 / 29.0 | 99% |
| cautious | 19.0 | 14.3 | 19.9 / 20.3 / 26.6 | 100% |
| idle | 9.0 | 5.0 | 31.0 / 31.0 / 31.0 | 100% |
| idle_once | 9.0 | 5.0 | 31.0 / 31.0 / 31.0 | 100% |

## 每张卡的出现率（出现过的局占比）

| 卡 | greedy | random | cautious | idle | idle_once |
| --- | --- | --- | --- | --- | --- |
| iw_arrival | 100% | 100% | 100% | 100% | 100% |
| iw_credit_union | 97% | 100% | 79% | 100% | 100% |
| iw_dale_nudge | 0% | 99% | 0% | 100% | 100% |
| iw_dale_story | 100% | 0% | 59% | 0% | 0% |
| iw_dale_ten_years | 97% | 100% | 100% | 100% | 100% |
| iw_deadline | 1% | 95% | 100% | 100% | 100% |
| iw_first_players | 100% | 100% | 100% | 0% | 0% |
| iw_hiring_day_1 | 100% | 99% | 100% | 0% | 0% |
| iw_hiring_day_2 | 44% | 47% | 44% | 0% | 0% |
| iw_hiring_day_2b | 56% | 49% | 56% | 0% | 0% |
| iw_hiring_day_3 | 55% | 38% | 45% | 0% | 0% |
| iw_hiring_day_3b | 45% | 50% | 55% | 0% | 0% |
| iw_hiring_day_4 | 53% | 34% | 47% | 0% | 0% |
| iw_hiring_day_4b | 47% | 42% | 53% | 0% | 0% |
| iw_investor_call | 0% | 79% | 10% | 100% | 100% |
| iw_investor_check | 97% | 97% | 100% | 100% | 100% |
| iw_loan_due | 94% | 36% | 79% | 0% | 0% |
| iw_loan_final | 93% | 35% | 78% | 0% | 0% |
| iw_reporter | 100% | 92% | 100% | 0% | 0% |
| iw_rival_club | 99% | 90% | 100% | 0% | 0% |
| iw_sandstorm | 100% | 100% | 100% | 0% | 0% |
| iw_sponsor | 100% | 20% | 99% | 0% | 0% |

## 结局

- greedy：exhibition 99%，deadline 1%
- random：deadline 95%，bankrupt 5%
- cautious：deadline 100%
- idle：deadline 100%
- idle_once：deadline 100%

## 后果分叉：同一种子、不同打法见过的卡有多不同（Jaccard 距离，0 = 完全一样）

- greedy vs random：0.47
- greedy vs cautious：0.27
- greedy vs idle：0.79
- greedy vs idle_once：0.79
- random vs cautious：0.39
- random vs idle：0.56
- random vs idle_once：0.56
- cautious vs idle：0.73
- cautious vs idle_once：0.73
- idle vs idle_once：0.00

## 取舍：各打法在每张卡上选了什么（玩家主动选的）

| 卡 | greedy | random | cautious | idle | idle_once |
| --- | --- | --- | --- | --- | --- |
| iw_arrival | B 100% | A 48% B 52% | A 100% | — | — |
| iw_credit_union | A 100% | A 44% B 56% | A 100% | — | — |
| iw_dale_nudge | — | A 39% B 31% C 30% | — | — | — |
| iw_dale_story | A 100% | — | A 100% | — | — |
| iw_dale_ten_years | B 100% | A 48% B 52% | B 100% | — | — |
| iw_deadline | A 100% | A 100% | A 100% | — | — |
| iw_first_players | A 100% | A 42% B 58% | A 100% | — | — |
| iw_hiring_day_1 | A 100% | A 27% B 32% C 41% | C 100% | — | — |
| iw_hiring_day_2 | B 100% | A 36% B 42% C 22% | C 100% | — | — |
| iw_hiring_day_2b | B 100% | A 39% B 32% C 29% | C 100% | — | — |
| iw_hiring_day_3 | A 100% | A 25% B 46% C 29% | C 100% | — | — |
| iw_hiring_day_3b | A 100% | A 29% B 31% C 40% | C 100% | — | — |
| iw_hiring_day_4 | B 100% | A 29% B 42% C 29% | C 100% | — | — |
| iw_hiring_day_4b | A 100% | A 51% B 24% C 24% | C 100% | — | — |
| iw_investor_call | — | A 46% B 54% | B 100% | — | — |
| iw_investor_check | A 100% | A 49% B 51% | A 99% B 1% | — | — |
| iw_loan_due | B 100% | B 100% | B 100% | — | — |
| iw_loan_final | A 100% | A 100% | A 100% | — | — |
| iw_reporter | A 100% | A 43% B 57% | B 100% | — | — |
| iw_rival_club | A 100% | A 59% B 41% | A 100% | — | — |
| iw_sandstorm | B 100% | A 49% B 51% | B 100% | — | — |
| iw_sponsor | A 100% | A 63% B 37% | B 100% | — | — |

## 被压制的选项（0）

没有。
