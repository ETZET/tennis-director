# Wave 1 接口契约：修复变体、升级改造（B1）和星级（P1）

Wave 1 的几路（模拟、内容、界面、画面）按这份同时开工。规则来源：`game-design.md` 的"修复分叉、升级和改造""星级"，ADR 0020。
**模拟这一路做完以后，把最终的 schema 和字段名回写到这里**（下游只认这份文件）。

## 名字（全局固定）

### 变体（设施 → 变体 id）

| 设施 | 变体 A | 变体 B | 画面要点 |
| --- | --- | --- | --- |
| `outer_23` 红土场 | `clay` 保留红土 | `hard` 改成硬地 | 红土 vs 蓝绿硬地 |
| `clubhouse` 会所 | `cafe` 咖啡吧 | `physio` 理疗室 | 露台遮阳伞和咖啡招牌 vs 白色理疗间、冰桶、按摩床 |
| `stadium_3` 匹克球场 | `pickle4` 四片匹克球 | `tennis2` 两片网球场 | 四片小场 vs 两片标准网球场 |
| `practice` 青训场 | `academy` 学院 | `bootcamp` 晨间训练营 | 发球机、学员看板 vs 体能器械、标志桶、跑道 |
| `plaza` 棕榈喷泉 | `nightlife` 夜场 | `shade_lawn` 遮阳观赛坡 | 串灯和吧台 vs 遮阳帆和草坡看台 |
| `stadium_2` 泳池 | `resort` 度假 | `recovery` 冷水恢复池 | 躺椅和小木屋 vs 冷水池、计时钟、毛巾架 |

`outer_1`、`stadium_1` 不分叉。

### 升级（设施 → 升级 id，每处一个）

| 设施 | 升级 id | 开的前提（草案，内容一路定数值） | 画面 |
| --- | --- | --- | --- |
| `outer_23` | `tournament_clay`（仅 clay） / `pro_hard`（仅 hard） | 维护 ≥ 75 的人 | 新线、记分牌、场边伞 |
| `clubhouse` | `pro_shop` | 服务 ≥ 65 | 球拍架和店招 |
| `stadium_3` | `league_lights` | — | 灯杆 |
| `practice` | `video_wall` | 教学 ≥ 65 | 场边大屏 |
| `plaza` | `misters` | — | 喷雾杆 |
| `stadium_2` | `cabanas` | — | 小木屋一排 |

改造 = 花钱换成同一设施的另一个变体，停用一周（状态先进入原有的停用档或新的 `remodel` 档，由模拟一路定）。

## 状态（模拟）

- 设施：`variant?: string`（第一个人到场、扣材料费时锁定）、`upgrades: string[]`。
- 牌匾：`plaque: { facility: string; variant?: string; leader: string; day: number }[]`（修好一处加一行，自动记录）。
- 星级：`stars: number`（0–5，已经达到的最高星，不往回掉）；`trophies: number`。
- 存档加版本和迁移。

计算变量（`COMPUTED_VARS` 两边一致）：`stars`、`trophies`，以及内容需要的 `variant.<facility>` 判定（写法由模拟一路定，例如条件 `variant: { facility: outer_23, is: hard }`）。

领域事件：`variant_locked {facility, variant}`、`upgrade_done {facility, upgrade}`、`remodel_started/done {facility, variant}`、`plaque_added {facility, leader, day}`、`star_up {stars, opens: string[]}`。

P1 的奖杯：现有的外出赛事 `pl_tournament` 赢了 +1；新加一张最小的"月度内赛"工单（★1 开，在球场办，办成 +1 奖杯、算"办成过 1 次内赛"）。完整的赛事日历和临时岗位留给 P2。

## 画面（iso Site 覆盖层）

`site.createOverlays(world)` 返回的对象增加（都可选，游戏判空再调）：

```ts
variant?(facility: string, variant: string | null): void;      // 这处设施修成/要修成哪个变体（影响修好以后各档的画面）
preview?(facility: string, variant: string | null): void;      // 在当前样子上叠这个变体修好后的半透明预览（Bayer 抖动溶解约 45%）；null 关掉
upgrade?(facility: string, upgrade: string, on: boolean): void;
stars?(n: number, animate: boolean): void;                      // 大门星级牌 0–5；animate 时播升星特效
plaque?(rows: readonly { facility: string; leader: string; day: number }[]): void; // 大门牌匾
```

`set(facility, state)` 不变；变体通过 `variant()` 先设好，再 `set()` 状态。升星时游戏把镜头转到大门（`site.anchors.entrance`）。

## 界面（HUD 快照，project.ts → packages/ui）

- 状态条：星级格（几颗星 + 下一星还差几项，点开明细列出每一条、满足没有），替代"复原 x/8"。
- 地点清单：有变体的修复工单显示两行变体（名字、换来、付出），点一行开预览，把人拖到那一行开工；不加面板。
- 快讯：升星、变体锁定、牌匾。
