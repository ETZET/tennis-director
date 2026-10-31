# 可玩性指标 · 内容 d137f3c4 · 每种打法 200 局

## 节奏（1× 速度换算成真实时间）

| 打法 | 每局决定数 | 默认处理 | 平均几秒一个决定 | 最长空档 | 超过 90 秒的空档/局 | 同时最多开着 |
| --- | --- | --- | --- | --- | --- | --- |
| greedy | 23.9 | 1.0 | 154 s | 93 s | 0.7 | 2 |
| random | 12.1 | 6.6 | 179 s | 96 s | 6.4 | 3 |
| cautious | 20.6 | 0.0 | 183 s | 91 s | 0.8 | 2 |
| walker | 20.6 | 3.3 | 176 s | 106 s | 13.5 | 2 |

## 结局

- greedy：saved_with_coach 85%，club_sold 15%
- random：club_sold 48.5%，sold_to_developer 31%，saved_alone 15%，saved_with_coach 5.5%
- cautious：club_sold 81.5%，saved_with_coach 18.5%
- walker：saved_with_coach 84.5%，club_sold 15.5%

## 后果分叉：同一种子、不同打法见过的卡有多不同（Jaccard 距离，0 = 完全一样）

- greedy vs random：0.50
- greedy vs cautious：0.34
- greedy vs walker：0.16
- random vs cautious：0.43
- random vs walker：0.51
- cautious vs walker：0.36

## 取舍：各打法在每张卡上选了什么（玩家主动选的）

| 卡 | greedy | random | cautious | walker |
| --- | --- | --- | --- | --- |
| hc_board_chair | C 100% | A 17% B 49% C 34% | C 100% | A 100% |
| hc_board_memo | A 100% | A 19% B 24% C 57% | C 100% | A 100% |
| hc_board_vote | A 100% | A 40% B 60% | B 100% | A 100% |
| hc_community_match | A 100% | A 26% B 36% C 38% | A 100% | A 100% |
| hc_crow_ball | B 100% | A 31% B 25% C 44% | C 100% | B 100% |
| hc_crow_lid | B 100% | B 100% | — | B 100% |
| hc_dale_phone | A 100% | A 3% B 42% C 55% | A 100% | A 100% |
| hc_dale_relapse | — | A 57% B 38% C 6% | A 100% | — |
| hc_developer_return | — | A 59% B 41% | — | — |
| hc_developer_visit | B 100% | A 43% B 23% C 34% | — | B 100% |
| hc_discover_kid | B 100% | — | — | B 100% |
| hc_double_booked | A 100% | A 47% B 48% C 6% | A 100% | C 100% |
| hc_hire_coach | C 100% | A 30% B 40% C 30% | A 100% | C 100% |
| hc_last_chance | — | A 32% B 31% C 37% | B 100% | — |
| hc_mason_parents | A 100% | — | — | A 100% |
| hc_member_saturday | A 100% | A 43% B 18% C 39% | A 100% | B 100% |
| hc_parent_complaint | — | A 36% B 33% C 32% | B 100% | A 100% |
| hc_pickleball_lease | C 100% | A 43% B 49% C 8% | B 100% | C 100% |
| hc_pickleball_rant | A 94% B 6% | A 44% B 33% C 23% | B 100% | A 18% B 82% |
| hc_pool_closes_late | — | A 100% | — | — |
| hc_pool_closes | A 100% | A 54% B 46% | A 100% | A 100% |
| hc_rival_flyer | A 100% | B 48% C 52% | A 100% | A 100% |
| hc_rival_van | A 100% | — | B 100% | A 100% |
| hc_storm_leak | A 100% | A 28% B 33% C 40% | A 100% | A 100% |
| hc_storm_tree | B 100% | A 43% B 4% C 52% | A 100% | B 100% |
| hc_tug_of_war | B 100% | A 63% C 38% | B 100% | B 100% |
| hc_turnaround_check | — | A 100% | A 100% | — |
| hc_volunteer_coach | A 100% | A 30% B 41% C 29% | A 100% | A 100% |
| hc_who_follows | A 100% | A 44% C 56% | A 100% | A 100% |

## 被压制的选项（0）

没有。
