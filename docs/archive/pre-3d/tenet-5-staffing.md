# 归档 · 原玩法准则 5「日常经营靠招人和排人」

2026-11-09 归档。用户定下：派工（把人拖到岗位和工单上）这套玩法模型不要了，员工要不要有、怎么有，跟整个游戏流程一起重新设计
（[game-design.md](../../design/game-design.md)「游戏流程：重新设计中」）。`CLAUDE.md` 和设计文档里删掉这一条，后面的准则 6 改号成 5，措辞不变。

**改号对照：** 2026-11-09 以前写的 ADR、契约、代码注释和测试里，"准则 5"指的是这里这条（已归档），"准则 6"指的是现在的准则 5（不操作时世界照样运转……）。

## 原文（`CLAUDE.md` 和 `docs/design/game-design.md`，2026-11-01 起）

> 5. **日常经营靠招人和排人。** 提升会所靠玩家主动把人（总监也是一个可指派的劳动力）拖到场景里的岗位和工单上；没有日程表画面，排班藏在随时拖动里（ADR 0012）。

试玩说明 `tools/playtest/brief.md` 里的英文版：

> 5. **Day-to-day management is hiring people and placing them** (drag or tap people onto posts and jobs; no schedule
>    screen — the schedule is implicit in where you put people).

## 来历

- [ADR 0011](../../adr/0011-management-loop-v2.md)（2026-10-31）：第一轮试玩后负责人给了准则 4–6，当时第 5 条是"日常经营靠和界面互动"（日程公告板、动作圈）。
- [ADR 0012](../../adr/0012-staffing-loop.md)（2026-11-01）：核心玩法转向招人和排人，准则 5、6 改写成上面的样子（提交 `5f94aa2`）。
- [ADR 0013](../../adr/0013-place-hubs.md)（地点牌）、[0014](../../adr/0014-routines.md)（习惯："排班藏在拖动里"的落实）、[0015](../../adr/0015-jobs-unlock-from-repairs.md)（修设施开出工单）：都是这条准则下的细则。
- [ADR 0028](../../adr/0028-people-simulation.md)（提议）：想在后面加一句"没排的人按自己的性子找事做……产出只有排人的一小截"（措辞在 [people-sim.md](../../design/people-sim.md) 第零节），没有落地。
- [ADR 0029](../../adr/0029-director-direct-control.md)（2026-11-08）：玩家直接操控总监以后，"总监也是一个可指派的劳动力"对不上了，措辞留给接回游戏时定。

## 为什么归档

3D 场景里玩家直接操控总监，走到哪儿干到哪儿（ADR 0029）；"拖头像到岗位"在 3D 里没有地方放，也和 2.5D 主线一起失去了依托
（主线归档见 [main-line-2.5d.md](main-line-2.5d.md)）。用户 2026-11-09 决定整个游戏流程重新设计，员工是不是要有、要怎么派，是其中一个开放问题。

`packages/sim` 里派工的实现（`staff.ts` 的指派、岗位、工单、习惯，内容的 `posts/`、`orders/`）照旧在、照旧跑，每日结算的服务率还按它算；重新设计定了以后再删改。
