# 2026-11-02 实验成果（E1–E7）

2026-11-02 在一台本地开发机上做的实验，每个实验在自己的 repo 副本里改，基线是 `bc7d166`（main 上 #8–#11 之后）。GM-1 和 E2 的数据基于更早的 `8a150c1`，结论要在新版上复核。

**补丁都已经合进主线**（这个目录不再放 `.patch`）：机器人和 `sim sweep`、E3（three.js r187）、E6（会动的世界）直接合；E5（周结算）、E4（周日掉档，ADR 0017）、E7（节奏）按这个顺序合，冲突手动解决，`content.json` 用 `pnpm content` 重新生成。合完后重跑了测试、确定性检查和两份平衡报告（`docs/balance/`）。

这个目录只留能复刻结论的东西：报告、跑实验的脚本、两张对比图。原始数据、截图和 repo 副本都没带。脚本里原来写死的本机路径已经换成环境变量：`REPO`（repo 根目录，默认当前目录）、`LAB`（放结果的目录，默认 `./lab`）、`CHROMIUM_PATH`（Playwright 的 chromium）、`DIST`（游戏构建目录）。报告里的 `lab/…` 指当时的本地工作目录，不在 repo 里。

## 目录

| 目录 | 实验 | 对应 backlog | 主线里的提交 |
| --- | --- | --- | --- |
| `01-gm1-review/` | GM-1 第一轮评审：老手、新手、放置对照三局 | GM-1 | 无代码 |
| `02-difficulty-e2/` | 难度曲线：普通玩家机器人 × 期限 × 杠杆，约 9900 局 | 人-2、GM-7、LG-9 | 机器人见 `shared-bot` |
| `03-threejs-e3/` | three.js r128 → r187 | ART-6 | `chore(render): upgrade three.js …` |
| `04-decay-e4/` | 衰减有后果：周日掉档、重开工单，ADR 0017 | 准则 6、ART-8 | `feat(sim): neglected facilities drop a grade …` |
| `05-causality-e5/` | 周结算；服务率 50% 和雨天砍会员两个 bug | 准则 3、6 | `fix(sim): weekly settlement …` |
| `06-living-world-e6/` | 状况的画面信号、风力、客人、闲人小动作 | ART-7、8、9 | `feat(game): living world …` |
| `07-pacing-e7/` | 球机卡加倒计时、"复原"计数修正、"下一步"提示、停滞卡 | UI-4、GM-3 | `feat: pacing …` |
| `shared-bot`（无目录） | 普通玩家机器人（novice、average、good），附 `sim sweep` | LG-9 | `feat(sim-cli): novice/average/good player bots …` |

每个目录里先看 `REPORT.md`（E3 是 `ART6-notes.md`）：开头 5 行是结论，后面是根因、方案对比、数据和遗留问题。报告里提到的 `*.patch` 就是上面这些提交。

## 合并时怎么接的

- 掉档（E4）放在周结算（E5 的 `settleWeek`）之后：周日收盘先结算会员声望，再看哪处设施没撑住。
- 快讯里"状况跌到 N"用 E4 的写法（带阈值），周结算一行用 E5 的写法；两边新加的 `ui.*` 文案和计算变量（`service_demand`、`service_pass`、`courts_built`、`idle_days`、`quiet_days`）都保留。
- 存档版本 v7（E5 的迁移）；E4 不改存档，E7 只加可选字段。

## 还没做的

1. 新开两个任务（这批实验没做）：
   - **习惯系统**：习惯会抢走正在做的工单，人会守在已经关门的岗位上（GM-1 第 1 条，违反准则 5）；
   - **终局花费提示**：重建 $9000、表演赛 $3000，界面上看不到。
2. 合并后：在新版上重跑 E2 的难度曲线，再做第二轮 GM-1 评审。

## 复刻要点（踩过的坑）

- **环境**：机器上没有 pnpm 时：
  - sim：`npx tsx apps/sim-cli/src/main.ts bots|playability|determinism ...`
  - 构建：`cd apps/game && npx vite build --configLoader runner`（不加 `--configLoader runner` 会报 `ERR_MODULE_NOT_FOUND`）
  - 装依赖：`npx pnpm@10.18.3 install --offline`
- **试玩桥**：
  - 用 `CHROMIUM_PATH` 指向 Playwright 的 chromium；每个 agent 用不同的端口和 `--out` 目录；只绑 127.0.0.1。
  - 两次调用之间游戏是暂停的，画面一帧不走，截图看起来像"世界定住了"。E6 的补丁加了补帧。
  - `targets` 会被卡片遮住，评审代理可能误判"没有工单"。
  - `/quit` 有时关不掉进程，要手动 kill。
- **评审代理**：
  - 每局大约 200–450 次请求，工具调用预算要让它把多个 curl 串在一个 Bash 里发。
  - 不许读源码和内容。
  - 要强制它看截图（Read 工具）。
- **截图对比**：
  - 先关掉剧情镜头。不关的话，同一个构建在手机上连拍两次都会差 30–50%（见 `03-threejs-e3/scripts/shoot2.mjs`）。
  - 截图进程最多并行 2 个。
- **性能**：r187 的 `renderer.info.render.calls` 把阴影通道也算进去了，新旧版本不能直接比。要数实际的 GL 调用（见 `measure3.mjs`）。
- **平衡**：
  - greedy 的结果代表不了真人，用 average 档机器人，每格至少 100 局（300 局误差约 ±5 个百分点）。
  - 钱是最陡的杠杆，修复工时几乎没有影响。
- **脚本里的路径**：用 `REPO`、`LAB`、`CHROMIUM_PATH`、`DIST` 环境变量指过去；试玩桥端口还是写死的，并行时要改。

## 需要你拍板的（来自各份报告）

1. 期限：要不要分三档（20、16、15 周）？（E2，数据要在新版上重跑）
2. 每局目标卡数：维持约 12 张，还是放宽到 16–20 张？（E7）
3. Court 1 新场面掉档的代价是不是太狠？（E4）
4. 有客人但没人在岗时，声望还扣不扣？（E5）
5. 贷款利息要不要提高？现在机器人借款几乎白送。（E7）

## 两张图

- `06-living-world-e6/compare-art8-court1.png`：状况 40 → 0 时，场地画面改前（上）和改后（下）。
- `03-threejs-e3/compare-r128-vs-naive-vs-recommended.png`：r128、只升版本不调色彩、推荐设置三者对比。
