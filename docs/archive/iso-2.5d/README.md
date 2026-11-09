# 归档 · 2.5D 等距像素画面（iso）

2026-11-08 起，游戏的画面改走 three.js 3D 像素（低分辨率正交渲染，t3ssel8r 风格），原来的 2.5D 等距像素画面归档到这里。
决定见 [ADR 0027](../../adr/0027-3d-pixel-three.md)；它取代了 [ADR 0019](../../adr/0019-isometric-pixel-renderer.md)。

## 这里有什么

文件都是用 `git mv` 原样搬过来的，目录结构照原来的仓库路径（`git log --follow <文件>` 能看到搬家前的历史）：

| 归档路径 | 原来的位置 | 是什么 |
| --- | --- | --- |
| `packages/iso/` | `packages/iso/`（`@td/iso`） | Canvas 2D 软件光栅的等距像素画面：场景图、投影、深度缓冲、字符画素材、昼夜和灯光、`IsoWorld` / `IsoCamera`、`Site` 接口和 Indian Wells（Palm Oasis）地图、像素精灵人物、球和弹道、演出时间轴、粒子和漫画字、活动动画库（ADR 0010）、截图和单元测试 |
| `apps/sandbox/index.html`、`src/viewer/` | 同名 | 场景查看器（设施状态、昼夜、雨、风、磨损、旋转缩放） |
| `apps/sandbox/activities.html`、`src/activities/` | 同名 | 活动动画库页面 |
| `apps/sandbox/demos.html`、`demo-*.html`、`src/demos/` | 同名 | 玩法 demo 第二轮（`docs/lab/2026-11-04-playability`） |
| `apps/sandbox/chars*.html`、`src/chars/` | 同名 | 人物设计方向 a～e（`docs/lab/2026-11-04-characters`） |
| `apps/sandbox/public/shots/` | 同名 | 上面这些页面引用的截图 |
| `apps/game/src/` | `apps/game/src/` | 游戏的画面层：`main.ts`（舞台、镜头、地点牌、拖放落点、镜头跟随）、`scene.ts`（员工走位、演出、设施画面层）、`life.ts`（园区日常）、`labels.ts`、`perform.ts`、`heads.ts`、`courts.ts`、`walkpath.ts`、`idle.ts`、`care/`（亲手扫场小游戏）和它们的测试 |
| `apps/game/src/map-nav.test.ts`、`wave5-land.test.ts` | 从 `game.test.ts`、`wave5.test.ts` 里拆出来的 | 查地图站位、步道长度和内容 `nav` 分钟数对得上；地块并进站位、选路卡找地块 |
| `docs/design/iso-architecture.md` | `docs/design/` | 画面契约（包结构、投影和像素、渲染分层、接口、素材格式） |
| `docs/art/style-demos/isometric-2.5d/` | 同名（2026-11-08 晚些时候搬过来） | 定案前的 2.5D 画风样片：独立的 HTML（Palm Oasis 布局、三个复原阶段和昼夜），`packages/iso` 的光栅器照搬它；`notes.md`、`shots/` |

`apps/game` 里留下的是只用 sim / ui / content 的部分（`session.ts`、`project.ts`、`text.ts`、`chips.ts`、`settle.ts`、`persist.ts`、`debug.ts`），
`main.ts` 换成了一个没有画面的入口：HUD + 模拟 + 一排地点按钮，整局照样能玩，试玩桥（`window.__td`）也还在。

## 它不再能构建

- 这个目录不是 pnpm 工作区的包（`pnpm-workspace.yaml` 只收 `packages/*`、`apps/*`），没有 `node_modules`，`@td/shared`、`@td/sim`、`@td/ui`、`@td/iso` 都解析不了。
- 不参与 `pnpm typecheck`、`pnpm lint`（`biome.json` 排除了 `docs/archive`）、`pnpm test`（vitest 只收 `packages/*/src`、`apps/*/src`）、`pnpm build`。
- `pnpm check:deps` 的 `no-archive` 规则禁止任何包或应用引用 `docs/` 下的代码。
- 想再跑起来：检出归档之前的提交（`main` 上 `4725231` 及以前），在那里 `pnpm install && pnpm dev` / `pnpm game`。

## 它的想法现在在哪儿

- **画面本身**：`apps/sandbox` 的 club* 场景（`clubmap2`、`clubpark`、`clubdesk`、`clubpickle`、`clubclay`、`clubplaza`、`clubstadium`、`clubcourts`、`clubfood`），
  共用模块在 `src/clubsite/`（渲染核心 `render/`：toon 光照、渲染管线、调色板和配色方案；世界坐标 `world.ts`；地面、山、取景、人物、总监操控、共享素材、植物、工具）。
  做法见 `.claude/skills/pixel-scene` 和 `docs/lab/2026-11-07-3d-pixel/`（`lessons.md`、`material-spec.md`、`boundary.md`）。
- **地图和锚点**：Indian Wells / Palm Oasis 的布局（`packages/iso/src/site/indian-wells/layout.ts`）照抄进了 `apps/sandbox/src/clubsite/world.ts`（原 `clubmap2/layout.ts`），
  各个 club* 场景都用这一套世界坐标。模拟只按名字引用位置（锚点）这条没变。
- **浮空岛**（ADR 0005）：不再是岛，地面铺出画面，地图边上是低成本的山（`clubsite/ground.ts`、`clubsite/mountains.ts`、`docs/lab/2026-11-07-3d-pixel/boundary.md`）。
- **人物和演出**：像素精灵人物换成了骨骼 Q 版人（`clubsite/people/`），打球、教学、维护这些演出写在各场景的 `life.ts` 里；
  活动动画库（ADR 0010）的分类和变量范围、`Site` 接口、`perform.ts` 的"模拟 performance 名 → 演出"映射，是接回游戏时定新场景接口的参考。
- **接回游戏**：另写 ADR，定新的场景接口（锚点 → 场景里的站位，演出订阅领域事件）。到时候 `map-nav.test.ts` 那种"地图和内容 `nav` 对得上"的检查要在新场景上重建。
