# 设计文档

2026-11-08 起以 3D 像素场景为准（ADR 0027、0029）。这里是现在有效的文档；3D 之前的版本在 [`docs/archive/pre-3d/`](../archive/pre-3d/README.md)。
2026-11-09 起 2.5D 时期的主线和派工（原准则 5）归档在 [main-line-2.5d.md](../archive/pre-3d/main-line-2.5d.md)，游戏流程重新设计中（game-design.md「游戏流程：重新设计中」、backlog.md 的 M-0）。

## 先读这四份

| 文件 | 内容 |
| --- | --- |
| [game-design.md](game-design.md) | 玩法设计 v1.0：玩法准则（五条）、总监在 3D 俱乐部里走着干活的循环、游戏流程：重新设计中（还站得住的、开放问题）、每个场景里发生什么、人、模拟里已经有的（每日结算、卡、场地可用度）、场景的活怎么对上模拟 |
| [architecture.md](architecture.md) | 技术架构 v1.0：分层和目录、模拟核心、内容、游戏 app、3D 像素画法、`clubsite/` 共用模块、场景的文件约定、pixel-scene 流程、性能、单文件交付、接回游戏的开放设计 |
| [testing.md](testing.md) | 测试 v1.0：测试分层、CI 和分层规则、单元测试、确定性、机器人和平衡、场景的数字验收和逐帧检查、试玩评审、接回游戏时要补的测试 |
| [backlog.md](backlog.md) | 待办：M-0 重新设计游戏流程、待用户拍板、M-A 场景美术做全（场景状态表、剩下的、缺的地方、欠账）、M-B 接回游戏、M-C 以后 |

## 模拟的契约（`packages/sim` 照这些实现，画面部分作废）

模拟的代码照旧按这些跑；其中主线（修复、星级、赛事、选路、地块、结局）和派工的部分属于归档的设计（[main-line-2.5d.md](../archive/pre-3d/main-line-2.5d.md)），游戏流程重新设计时再定删改。

| 文件 | 内容 |
| --- | --- |
| [daily-settlement-contract.md](daily-settlement-contract.md) | 每日结算（ADR 0024）：每天收盘结算钱、声望、会员，弹结算卡；`DayReport`、`rules.day`、存档 15 |
| [court-care-contract.md](court-care-contract.md) | 场地可用度（ADR 0022）：五种短期脏乱、三档、打扫工单和维护岗位、门口等人 |
| [wave1-contract.md](wave1-contract.md) | 修复变体、升级改造、星级的 schema（整份是归档的主线） |
| [wave2-5-contract.md](wave2-5-contract.md) | 赛事阶梯和选路、员工成长、结局方案 A 和第二季、地块（地图长大）的 schema（整份是归档的主线） |

## 人物

| 文件 | 内容 |
| --- | --- |
| [people.md](people.md) | 人物设计：研究、四类作用、特质、招聘日怎么出人（模拟和内容照它实现；建在归档的派工模型上，员工要不要有归 M-0） |
| [people-sim.md](people-sim.md) | 人物模拟（ADR 0028，提议，待实现）：三层人（员工、常客、人群）、行为词典、关系；把场景里的 NPC 做进模拟的方案，建在派工模型上，跟 M-0 再看 |

## 研究（2.5D 时期给归档的主线写的，重新设计游戏流程时可以参考）

| 文件 | 内容 |
| --- | --- |
| [research-kairosoft.md](research-kairosoft.md) | 开罗游戏怎么推进（等级主轴、五种钥匙、日历节拍、赛事阶梯、软结局） |
| [research-main-line.md](research-main-line.md) | 经营游戏怎么搭主线、怎么给掌控感和多样性、怎么让人觉得"我在建造" |
| [research-map-growth.md](research-map-growth.md) | 地图怎么从自己的边上长出去（ADR 0021 的依据；文中的"浮空岛"和样稿是 2.5D 时期的） |

## 别处的文档

- `docs/adr/`：架构决策（0027 画面换成 3D 像素，0029 直接操控总监；0012–0015、0017、0020、0021 随主线 / 派工归档）。
- `docs/lab/2026-11-07-3d-pixel/`：3D 像素的实验记录（按日期的历史，不再改写）：`lessons.md`（配方和教训）、`material-spec.md`（材质规范）、`boundary.md`（地图边的山）、`clubmap-layout.md` 和每个场景的 `<场景>.md`（构图、站位、玩法计划、要商量的）、`tools/`（量图和截图工具）。更早的 `docs/lab/2026-11-0*` 是 2.5D 时期的实验。
- `.claude/skills/pixel-scene/`：做一个新场景的流程。
- `docs/content-guide.md`（不写代码加卡）、`docs/balance/`（机器人跑局和可玩性报告）、`tools/playtest/brief.md`（试玩评审说明）。
- `docs/art/README.md`：还是 2.5D 时期的美术说明，待按 3D 重写（见 backlog）；3D 的画风和素材做法先看上面的 lab 文档和 `apps/sandbox/src/desert3d-v2/ASSETS.md`。
