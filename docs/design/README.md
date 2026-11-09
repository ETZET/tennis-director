# 设计文档

| 文件 | 内容 | 在线版（较旧） |
| --- | --- | --- |
| [game-design.md](game-design.md) | 玩法设计文档 v0.5：玩法准则、核心循环、Palm Oasis 地图和修复顺序、修复分叉和升级改造（提议）、地图怎么长大（提议）、节奏、胜负、推进结构（星级、三次选路、赛事阶梯、员工成长、打分加第二季）、经济、招人、事件、需要拍板的事 | [v0.4](https://claude.ai/artifact/L928nnUJivRPVhUzZXnrBi)（11-03 同步，还没到 v0.5） |
| [v0.5-preview-deck.pdf](v0.5-preview-deck.pdf) | v0.5 预览幻灯片（18 页）：用真实渲染器和真实 HUD 拼出的新设计画面，没有改游戏代码 | [Slides](https://claude.ai/artifact/ECydhwxUySjDbCvxN63e2o) |
| [people.md](people.md) | 人物设计：研究（《八十亿分之一》、RimWorld、真实网球圈）、四类作用、特质、招聘日怎么出人、第一版和以后 | — |
| [people-sim.md](people-sim.md) | 人物模拟（完稿 v1，ADR 0023）：三层人（员工、常客、人群）、行为词典、每个人的故事和一天、五位常客、人群的目的和耐心、两两关系表、数值边界、分期 | — |
| [research-main-line.md](research-main-line.md) | 研究：经营游戏怎么搭主线、怎么给掌控感和多样性、怎么让人觉得"我在建造"（11-03 问卷的依据） | — |
| [research-map-growth.md](research-map-growth.md) | 研究：地图怎么"有机"地长出去；第一版样稿为什么显得硬；★3 收回高尔夫、★4 东南角的方案（ADR 0021 的依据） | — |
| [research-kairosoft.md](research-kairosoft.md) | 研究：开罗游戏怎么推进（等级主轴、五种解锁钥匙、日历节拍、赛事阶梯、软结局），和对我们的启发 | — |
| [../art/](../art/README.md) | 美术：画风（2.5D 等距像素，已定案）、样片、素材在哪、怎么预览和改 | — |
| [testing.md](testing.md) | 测试文档 v0.2：测试分层、CI、现有测试、机器人和平衡区间、评审和试玩、验收用例 | [v0.1](https://claude.ai/artifact/Y4gjfnCQmgERrZe9dDYv7s) |
| [backlog.md](backlog.md) | 待办：按界面、玩法、逻辑、美术拆成可以派给子 agent 的任务，标了能力档位；完成记录 | [Hollow Creek 版](https://claude.ai/artifact/69umTr3eFLkUnDqbbfPUL6) |
| [architecture.md](architecture.md) | 技术架构文档 v0.2：原则、分层、模拟核心、画面（2.5D 等距像素）、Site 接口、内容管线、存档、扩展点 | [v0.1](https://claude.ai/artifact/Cy2ae8npLfYgtEwufEtr7s) |
| [iso-architecture.md](../archive/iso-2.5d/docs/design/iso-architecture.md) | **已归档**（ADR 0027）。旧的画面契约（ADR 0019）：`packages/iso` 的包结构、投影和像素、渲染分层、`IsoWorld` / `IsoCamera` / `Site` / `Person` 接口、素材格式 | — |
| [indian-wells-migration.md](indian-wells-migration.md) | 主游戏迁到 Indian Wells 的计划（已完成，留作记录） | — |
| [daily-settlement-contract.md](daily-settlement-contract.md) | 每日结算的接口契约（ADR 0024）：每天收盘结算钱、声望、会员，停下来弹结算卡；`DayReport`、`rules.day`、存档 15、两个代理的文件归属 | — |

仓库里的这几份是最新的。玩法设计文档的在线版 11-03 同步到了 v0.4（v0.5 还没同步），方便在手机上看和留评论；以后改动以仓库为准，在线版跟着同步。其他几份的在线版停在 v0.1（Hollow Creek 三幕时期）。

仓库里的其他文档：`docs/adr/`（架构决策）、`docs/content-guide.md`（写内容）、`docs/balance/`（机器人跑局和可玩性报告）、
`tools/playtest/brief.md`（试玩评审说明）。
