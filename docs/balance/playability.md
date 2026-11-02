# 可玩性指标 · 内容 200cda0d · 每种打法 100 局

## 节奏（1× 速度换算成真实时间）

| 打法 | 每局决定数 | 默认处理 | 平均几秒一个决定 | 最长空档 | 超过 90 秒的空档/局 | 同时最多开着 |
| --- | --- | --- | --- | --- | --- | --- |
| greedy | 18.9 | 0.0 | 413 s | 107 s | 17.5 | 1 |
| random | 15.0 | 3.5 | 418 s | 88 s | 0.7 | 2 |
| cautious | 18.8 | 0.0 | 472 s | 111 s | 30.1 | 1 |
| idle | 0.0 | 9.0 | 782 s | 60 s | 0.0 | 1 |
| idle_once | 0.0 | 9.0 | 782 s | 60 s | 0.0 | 1 |

## 卡的节奏（游戏天）

| 打法 | 每局卡数 | 第 15–100 天的卡 | 最长无卡空档（中位 / 平均 / 最大） | ≥ 10 天的空档局占比 |
| --- | --- | --- | --- | --- |
| greedy | 18.9 | 14.9 | 15.0 / 15.5 / 26.6 | 97% |
| random | 18.5 | 13.3 | 21.5 / 20.3 / 26.6 | 100% |
| cautious | 18.8 | 14.2 | 19.9 / 20.3 / 26.6 | 100% |
| idle | 9.0 | 5.0 | 33.0 / 33.0 / 33.0 | 100% |
| idle_once | 9.0 | 5.0 | 33.0 / 33.0 / 33.0 | 100% |

## 每张卡的出现率（出现过的局占比）

| 卡 | greedy | random | cautious | idle | idle_once |
| --- | --- | --- | --- | --- | --- |
| iw_arrival | 100% | 100% | 100% | 100% | 100% |
| iw_credit_union | 99% | 100% | 83% | 100% | 100% |
| iw_dale_nudge | 0% | 100% | 0% | 100% | 100% |
| iw_dale_story | 100% | 0% | 48% | 0% | 0% |
| iw_dale_ten_years | 99% | 100% | 100% | 100% | 100% |
| iw_deadline | 0% | 95% | 100% | 100% | 100% |
| iw_first_players | 100% | 100% | 100% | 0% | 0% |
| iw_hiring_day_1 | 100% | 97% | 100% | 0% | 0% |
| iw_hiring_day_2 | 39% | 48% | 44% | 0% | 0% |
| iw_hiring_day_2b | 61% | 41% | 56% | 0% | 0% |
| iw_hiring_day_3 | 47% | 40% | 54% | 0% | 0% |
| iw_hiring_day_3b | 53% | 47% | 46% | 0% | 0% |
| iw_hiring_day_4 | 50% | 44% | 54% | 0% | 0% |
| iw_hiring_day_4b | 50% | 33% | 46% | 0% | 0% |
| iw_investor_call | 0% | 66% | 4% | 100% | 100% |
| iw_investor_check | 98% | 97% | 100% | 100% | 100% |
| iw_loan_due | 98% | 38% | 82% | 0% | 0% |
| iw_loan_final | 97% | 37% | 78% | 0% | 0% |
| iw_reporter | 100% | 92% | 100% | 0% | 0% |
| iw_rival_club | 100% | 86% | 100% | 0% | 0% |
| iw_sandstorm | 100% | 100% | 100% | 0% | 0% |
| iw_sponsor | 100% | 25% | 85% | 0% | 0% |

## 结局

- greedy：exhibition 100%
- random：deadline 95%，bankrupt 5%
- cautious：deadline 100%
- idle：deadline 100%
- idle_once：deadline 100%

## 后果分叉：同一种子、不同打法见过的卡有多不同（Jaccard 距离，0 = 完全一样）

- greedy vs random：0.45
- greedy vs cautious：0.27
- greedy vs idle：0.79
- greedy vs idle_once：0.79
- random vs cautious：0.40
- random vs idle：0.56
- random vs idle_once：0.56
- cautious vs idle：0.73
- cautious vs idle_once：0.73
- idle vs idle_once：0.00

## 取舍：各打法在每张卡上选了什么（玩家主动选的）

| 卡 | greedy | random | cautious | idle | idle_once |
| --- | --- | --- | --- | --- | --- |
| iw_arrival | B 100% | A 48% B 52% | A 100% | — | — |
| iw_credit_union | A 100% | A 46% B 54% | A 100% | — | — |
| iw_dale_nudge | — | A 36% B 36% C 29% | — | — | — |
| iw_dale_story | A 100% | — | A 100% | — | — |
| iw_dale_ten_years | B 100% | A 48% B 52% | B 100% | — | — |
| iw_deadline | — | A 100% | A 100% | — | — |
| iw_first_players | A 100% | A 51% B 49% | A 100% | — | — |
| iw_hiring_day_1 | A 100% | A 35% B 32% C 33% | C 100% | — | — |
| iw_hiring_day_2 | B 100% | A 34% B 30% C 36% | C 100% | — | — |
| iw_hiring_day_2b | B 100% | A 33% B 36% C 31% | C 100% | — | — |
| iw_hiring_day_3 | A 100% | A 44% B 21% C 35% | C 100% | — | — |
| iw_hiring_day_3b | A 100% | A 21% B 36% C 43% | C 100% | — | — |
| iw_hiring_day_4 | B 100% | A 26% B 46% C 28% | C 100% | — | — |
| iw_hiring_day_4b | A 100% | A 37% B 30% C 33% | C 100% | — | — |
| iw_investor_call | — | A 55% B 45% | B 100% | — | — |
| iw_investor_check | A 100% | A 60% B 40% | A 100% | — | — |
| iw_loan_due | B 100% | A 7% B 93% | B 100% | — | — |
| iw_loan_final | A 100% | A 100% | A 100% | — | — |
| iw_reporter | A 100% | A 51% B 49% | B 100% | — | — |
| iw_rival_club | A 100% | A 40% B 60% | A 100% | — | — |
| iw_sandstorm | B 100% | A 50% B 50% | B 100% | — | — |
| iw_sponsor | A 100% | A 60% B 40% | B 100% | — | — |

## 被压制的选项（0）

没有。
