# 可玩性指标 · 内容 802c55b7 · 每种打法 60 局

## 节奏（1× 速度换算成真实时间）

| 打法 | 每局决定数 | 默认处理 | 平均几秒一个决定 | 最长空档 | 超过 90 秒的空档/局 | 同时最多开着 |
| --- | --- | --- | --- | --- | --- | --- |
| greedy | 14.0 | 0.0 | 583 s | 108 s | 20.0 | 1 |
| random | 8.2 | 2.5 | 1349 s | 78 s | 0.7 | 2 |
| cautious | 14.7 | 0.0 | 570 s | 110 s | 19.8 | 1 |
| idle | 0.0 | 2.0 | 6706 s | 0 s | 0.0 | 2 |

## 结局

- greedy：exhibition 100%
- random：deadline 91.7%，bankrupt 8.3%
- cautious：deadline 100%
- idle：deadline 100%

## 后果分叉：同一种子、不同打法见过的卡有多不同（Jaccard 距离，0 = 完全一样）

- greedy vs random：0.38
- greedy vs cautious：0.11
- greedy vs idle：0.83
- random vs cautious：0.30
- random vs idle：0.59
- cautious vs idle：0.74

## 取舍：各打法在每张卡上选了什么（玩家主动选的）

| 卡 | greedy | random | cautious | idle |
| --- | --- | --- | --- | --- |
| iw_arrival | B 100% | A 51% B 49% | A 100% | — |
| iw_dale_story | A 100% | A 100% | A 100% | — |
| iw_deadline | — | A 100% | A 100% | — |
| iw_first_players | A 100% | A 49% B 51% | A 100% | — |
| iw_hiring_day_1 | A 100% | A 39% B 31% C 31% | C 100% | — |
| iw_hiring_day_2 | B 100% | A 29% B 34% C 37% | C 100% | — |
| iw_hiring_day_3 | A 100% | A 34% B 34% C 31% | C 100% | — |
| iw_hiring_day_4 | B 100% | A 28% B 44% C 28% | C 100% | — |
| iw_investor_check | B 100% | A 43% B 57% | A 100% | — |
| iw_reporter | A 100% | A 44% B 56% | B 100% | — |
| iw_sandstorm | B 100% | A 43% B 57% | B 100% | — |
| iw_sponsor | A 100% | A 50% B 50% | B 100% | — |

## 被压制的选项（0）

没有。
