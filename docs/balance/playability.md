# 可玩性指标 · 内容 a428ae39 · 每种打法 200 局

## 节奏（1× 速度换算成真实时间）

| 打法 | 每局决定数 | 默认处理 | 平均几秒一个决定 | 最长空档 | 超过 90 秒的空档/局 | 同时最多开着 |
| --- | --- | --- | --- | --- | --- | --- |
| greedy | 58.8 | 0.0 | 19 s | 69 s | 0.0 | 2 |
| random | 31.6 | 19.1 | 28 s | 55 s | 0.0 | 4 |
| cautious | 60.5 | 0.0 | 17 s | 48 s | 0.0 | 2 |
| walker | 58.6 | 0.1 | 21 s | 67 s | 0.0 | 3 |

## 结局

- greedy：saved_with_coach 82%，club_sold 18%
- random：club_sold 83%，sold_to_developer 7%，saved_alone 5.5%，saved_with_coach 4%，saved_with_kid 0.5%
- cautious：club_sold 63.5%，saved_with_coach 36.5%
- walker：saved_with_coach 88.5%，club_sold 11.5%

## 后果分叉：同一种子、不同打法见过的卡有多不同（Jaccard 距离，0 = 完全一样）

- greedy vs random：0.37
- greedy vs cautious：0.21
- greedy vs walker：0.05
- random vs cautious：0.32
- random vs walker：0.38
- cautious vs walker：0.19

## 取舍：各打法在每张卡上选了什么（玩家主动选的）

| 卡 | greedy | random | cautious | walker |
| --- | --- | --- | --- | --- |
| hc_ball_order | A 99% C 1% | A 31% B 32% C 37% | A 100% | A 100% |
| hc_board_chair | C 100% | A 7% B 45% C 48% | C 100% | A 100% |
| hc_board_memo | A 100% | A 12% B 23% C 65% | C 100% | A 100% |
| hc_board_vote | A 100% | A 18% B 82% | B 100% | A 100% |
| hc_bubble_quote | B 100% | A 9% B 41% C 49% | B 100% | B 100% |
| hc_clay_workday | A 100% | B 53% C 47% | C 100% | A 100% |
| hc_coach_feedback | A 11% B 89% | A 14% B 47% C 39% | B 100% | A 100% |
| hc_community_match | A 100% | A 32% B 40% C 28% | A 100% | A 100% |
| hc_crow_ball | B 100% | A 34% B 32% C 34% | C 100% | B 100% |
| hc_crow_lid | A 7% B 93% | A 42% B 38% C 19% | — | B 100% |
| hc_dale_phone | A 100% | B 51% C 49% | A 100% | A 100% |
| hc_dale_relapse | — | A 46% B 47% C 7% | A 100% | — |
| hc_developer_return | — | A 20% B 80% | — | — |
| hc_developer_visit | B 100% | A 38% B 28% C 34% | — | B 100% |
| hc_discover_kid | B 100% | A 29% B 41% C 29% | B 100% | B 100% |
| hc_double_booked | A 100% | A 41% B 42% C 17% | A 100% | C 100% |
| hc_fix_court1 | A 100% | A 34% B 32% C 34% | B 100% | A 100% |
| hc_hire_coach | C 100% | A 34% B 34% C 31% | A 100% | C 100% |
| hc_junior_hit | A 100% | A 15% B 44% C 41% | B 100% | A 100% |
| hc_last_chance | — | A 31% B 35% C 34% | — | — |
| hc_lot_pothole | A 100% | A 42% B 4% C 53% | A 100% | B 100% |
| hc_mason_parents | A 5% B 95% | A 50% B 17% C 33% | A 100% | A 100% |
| hc_member_saturday | A 100% | A 42% B 12% C 46% | A 100% | B 100% |
| hc_parent_complaint | — | A 35% B 35% C 30% | B 100% | — |
| hc_pickleball_lease | C 100% | A 62% B 38% | B 100% | C 100% |
| hc_pickleball_rant | A 100% | A 32% B 42% C 26% | B 100% | B 100% |
| hc_pool_kids | A 100% | A 3% B 46% C 50% | C 100% | A 100% |
| hc_rival_flyer | A 100% | B 44% C 56% | A 100% | A 100% |
| hc_rival_van | A 100% | — | B 100% | A 100% |
| hc_storm_leak | A 100% | A 34% B 36% C 30% | A 100% | A 100% |
| hc_storm_tree | B 100% | B 100% | A 100% | B 100% |
| hc_trial_day | B 100% | A 30% B 36% C 34% | B 100% | B 100% |
| hc_tug_of_war | B 100% | A 60% C 40% | B 100% | B 100% |
| hc_turnaround_check | — | A 100% | — | — |
| hc_volunteer_coach | A 100% | A 43% B 43% C 14% | A 100% | A 100% |
| hc_who_follows | A 100% | A 53% B 7% C 40% | A 100% | A 100% |

## 被压制的选项（0）

没有。
