# 归档 · 3D 之前的设计文档（pre-3d）

2026-11-08 起游戏的画面改成 three.js 3D 像素（[ADR 0027](../../adr/0027-3d-pixel-three.md)），玩法改成玩家直接操控总监（[ADR 0029](../../adr/0029-director-direct-control.md)），
用户定下"一切以 3D 场景为准"。`docs/design/` 里写在 2.5D 等距画面时期、和 3D 场景对不上的文档用 `git mv` 搬到这里（`git log --follow` 能看到历史），新版在原来的位置重写。

和 [`../iso-2.5d/`](../iso-2.5d/README.md) 的分工：那边是 2.5D 画面的**代码**（和它的画面契约 `iso-architecture.md`）；这边是那个时期的**设计文档**（玩法、架构、测试、待办、评审）。

| 归档文件 | 原来的位置 | 是什么 | 现在看哪 |
| --- | --- | --- | --- |
| `game-design-v0.5.md` | `docs/design/game-design.md` | 玩法设计 v0.5：Palm Oasis 修复主线、修复分叉和升级改造、地图怎么长大、推进结构（星级、三次选路、赛事阶梯、表演赛筹备、五种钥匙、结局）、经济、招人、事件、需要拍板的事、决定记录。**模拟仍然照它实现**，规则细节以这份和 wave 契约为准 | [game-design.md](../../design/game-design.md) |
| `architecture-v0.2.md` | `docs/design/architecture.md` | 技术架构 v0.2：`packages/iso`、Site 接口、v0.5 对架构的影响 | [architecture.md](../../design/architecture.md) |
| `testing-v0.2.md` | `docs/design/testing.md` | 测试 v0.2：含 iso 的单元测试、截图、演出测试、Indian Wells 和 v0.5 的验收用例 | [testing.md](../../design/testing.md) |
| `backlog-indian-wells.md` | `docs/design/backlog.md` | Indian Wells 的待办：四条轨道、Wave 1–5、评审记录、完成记录 | [backlog.md](../../design/backlog.md) |
| `indian-wells-migration.md` | `docs/design/indian-wells-migration.md` | 主游戏迁到 Indian Wells 的计划（当时已完成） | — |
| `reviews/gm1-2026-11-03.md` | `docs/design/reviews/` | GM-1 第一轮评审（2.5D 游戏，手机） | — |
| `v0.5-preview-deck.pdf` | `docs/design/` | v0.5 预览幻灯片（用 2.5D 渲染器和真实 HUD 拼的） | — |

只作参考：不要按这里的画面描述做新东西；玩法规则要用的话，先对照 3D 场景和 [backlog.md](../../design/backlog.md) 的"待用户拍板"。
