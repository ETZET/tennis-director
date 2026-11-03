# 经营游戏怎么搭主线，怎么让人觉得"我在建造"

Nov 3, 2026 · 研究笔记 · 给 game-design.md v0.4 的"推进结构"（ADR 0020 提议）做参考，接着 [research-kairosoft.md](research-kairosoft.md) 往下查

## 结论

1. **网球总监现在缺的不是"完成"，而是"我做的决定"。** 修复已经有完成的瞬间，画面也真的变回来。但每个玩家修的是同一组设施、同一个顺序、同一个结果。实验里，自制品的溢价来自"成就感"和"我是作者"，不来自花了多少工夫（[Franke 等 2010](https://www.wu.ac.at/fileadmin/wu/d/i/entrep/4_forschung/full-text-papers/franke_schreier_kaiser_2010_designed_it_myself.pdf)）。所以多加修复工单没用，要加的是**结果看得见的选择**。
2. **"固定清单 + 自由选择"会收敛成一种打法。** Against the Storm 早期让玩家开局选建筑，结果每个聚落都长一个样。改成"到门槛时从一小把随机选项里挑一个"才修好（[Eremite devlog 6](https://eremitegames.com/devlog-6/)）。Islanders 每到门槛只给二选一。最便宜的多样性，是在已有的节拍上二选一。
3. **掌控感先坏在反馈和自动化上，不是选项不够。** 理论上的四个条件是：自己选目标；看得懂选项；结果看得见、能归因；想做的事游戏支持。GM-1 的几个问题各坏了一条：习惯抢走工单，终局花费看不见，衰减没后果。The Sims 的自动行为只在玩家的安排上"接着做"，从不推翻玩家（[Sims AI 讲解](https://amara.org/subtitles/cVoJS4OdmVql/en/1/download/The%20Genius%20AI%20Behind%20The%20Sims.en.txt)）。这几条修起来便宜，收益最大。
4. **后期垮掉，是因为每一级只给更大的数字。** 撑得住的游戏，每一级都带一种新的约束：Two Point 每张图有"自己的机制性格"，Anno 每个人口层有自己的劳动力，Factorio 新科技要玩家亲手碰到新资源才解锁。ADR 0020"每一星开一个新机制"方向对。但提议里的内赛、地区赛、邀请赛，动作都是"把人拖到临时岗位"，需要各自再带一条新约束。
5. **赛事阶梯是体育题材现成的中段节奏器，开罗自己就做过网球版。** Tennis Club Story 的单打从 F 到 B 按累计积分解锁，四个大满赛各配一种场地，重复打同一赛事积分减半（[Kairosoft wiki](https://kairosoft.wiki.gg/wiki/Matches_(Tennis_Club_Story))）。但它的比赛只能看、不能管，评论一致说无聊。表演赛要给玩家能动的东西。
6. **结局方面，证据支持"已知的高潮 + 分档评价"，不支持"打完接着无限经营"。** Frostpunk 试过风暴之后还能接着盖，觉得虎头蛇尾，砍掉了。Stardew 在第 3 年用"爷爷的评价"把整局打成 1–4 根蜡烛。Two Point 发现玩家拿到 3 星就走、很少回来。方案 A 的"打分"有据，"之后接着经营"证据偏弱。
7. **修复顺序完全固定，就是清单。** Stardew 的收集包可以任选顺序做，Two Point 一个区的两家医院可以任选先后，Cities: Skylines II 让玩家自己定解锁顺序。但完全放开也会出问题：ONI 玩家说"什么都能做，那我就什么都不做"。折中办法是同时摆出 2–3 处可修，下一步始终有一个高亮。
8. **六条玩法准则大体都有证据撑着。** 准则 1（不做菜单）有 Two Point Campus、Pocket City 2、Clash of Clans 改版的证据。准则 4（卡要少）要配两样东西：提前一周预告，卡的状态持续一阵。唯一要明说的例外在准则 2：纯外观的选择本来就没有取舍。

**证据最支持的三处改动：**

- **修复时选"它变成什么"。** 八处设施里，至少五六处在修复工单上给出 2 个变体。玩家把人拖到哪个变体上，就修成哪个。不加卡，也不加菜单。
- **玩家的拖动高于习惯；承诺之前先看到代价。** 被拖去的人不会被习惯拉走。松手前预览这一步动哪些东西。HUD 上写出终局还差什么、要多少钱。
- **赛事阶梯保留，但每一级换一条规则。** 例如占场、双打名单、场地类型、看台和灯光。表演赛改成分几期准备的大工程，从 ★3 起就看得见。

## 研究范围和方法

**材料：** 六份研究笔记，2026-11-03 整理：

- 主线结构
- 扩张与后期
- 掌控感
- 多样性
- 建造感
- 体育和度假类经营游戏

笔记引用的页面都打开过。另外读了仓库里的 game-design.md v0.4、research-kairosoft.md 和 GM-1 评审报告。开罗的八个推进零件已经写在 research-kairosoft.md 里，这里不重复，只补 Tennis Club Story、Pocket Stables 这些新查到的作品。

**来源：** 按可信程度排：

1. 设计者本人的访谈、开发日志和会议纪要：Eremite、11 bit、Two Point、Wube、Toukana、Sylvester。
2. 同行评审的心理学论文：Norton、Franke、Ryan，以及 Wardrip-Fruin 和 Mateas 等人。
3. wiki 上的数据：开罗、Factorio、RimWorld、ONI、Motorsport Manager。
4. 媒体评测。
5. Steam 讨论和 Vaporlens 汇总。Vaporlens 是机器汇总的评论，只拿来看趋势。

**没做到的：**

- 没有亲自玩。
- 下面几处页面连不上，相关细节没有核实：Stardew 主 wiki、Hooded Horse 的 Against the Storm wiki、Quantic Foundry 博客、Tennis Club Story 主页面。
- 没找到任何一种主线结构对留存影响的数据。只有一个量化数字：2018 年 Steam 上约 11% 的 Factorio 玩家发射过火箭（[FFF #245](https://factorio.com/blog/post/fff-245)）。
- 没找到哪款"固定单地图"经营游戏只靠建筑变体做多样性的案例。"修复分叉"是从 Against the Storm、Islanders、Fallout Shelter 和 Homescapes 推出来的。
- Hades 和 Fallout Shelter 只查了装修和房间系统，它们的主线没查。

## 主线怎么搭

### 八种结构

| 类型 | 例子 | 看得见的目标 | 什么卡住进度 | 节奏 | 结局 | 新手 / 老手 |
| --- | --- | --- | --- | --- | --- | --- |
| A 关卡 + 星级 | Two Point Hospital 15 家医院、Campus 12 关；Theme Hospital；RCT | 每关一张清单：1 星过关，2–3 星精通 | 1 星开下一关 | 每关一个新花样 | 软：每关都能接着玩 | 新手有及格线，老手有精通线；但每关都从零开始，被批"任务糊成一片" |
| B 单局 + 等级 + 日历上限 | Game Dev Story、Pocket League Story（10 级，评价 25→650） | 下一级的门槛、下一个比赛或奖项 | 评价分 | 每年固定的节拍 | 到期打分，之后可以接着玩 | 上手极顺；后期只剩大数字 |
| C 沙盒 + 里程碑 | Cities: Skylines（13 个人口里程碑）；CS II（20 个经验里程碑） | 下一个人口或经验数 | 人口 / 经验 | 自然增长 | 没有 | 自由度高，戏剧性弱 |
| D 叙事 / 复原清单 | Frostpunk（已知的大风暴）；Stardew 社区中心（6 个房间、30 个收集包） | 剧情目标；收集包清单 | 剧情节点、收集包 | 写好的事件、期限 | 写好的高潮，或一次评价 | 有意义、记得住；重玩时剧情一样 |
| E 赛季 + 外部评判 | Football Manager 董事会期望 | 每个赛季的董事会目标 | 董事会信心 | 赛季 | 不结束；失败就被炒 | 长线身份感 |
| F 巨型工程 | Factorio 火箭；Satisfactory 太空电梯 5 期 | 下一期要交的货 | 产量 | 科技层级 | 硬结局（发射） | 几百小时都有一个北极星 |
| G 跑团 + 外层成长 | Against the Storm（一局约 1–2 小时）；Cult of the Lamb | 赢下这一局：声望条先满，女王的耐心条后满 | 胜负 + 外层货币 | 局内两条计时条 | 一局结束；一个大循环结束 | 紧张，重玩价值高 |
| H 分数门槛 | Islanders、Dorfromantik | 下一个分数线 | 分数 | 手上的建筑不够用 | 无步可走就结束 | 放松、短局 |

来源：[Two Point Hospital 评测](https://www.nintendoworldreport.com/review/52928)、[Two Point Campus 关卡表](https://kosgames.com/?p=30069)、[Pocket League Story](https://kairosoft.wiki.gg/wiki/Pocket_League_Story)、[CS 里程碑](https://segmentnext.com/cities-skylines-milestones-guide/)、[CS II](https://www.neowin.net/news/cities-skylines-2-doesnt-solely-rely-on-population-numbers-for-progression/)、[Stardew 收集包](https://wiki.stardewvalley.net/Bundles)、[Satisfactory 太空电梯](https://satisfactory.wiki.gg/wiki/Space_Elevator)、[Against the Storm](https://en.wikipedia.org/wiki/Against_the_Storm_(video_game))、[Islanders](https://en.wikipedia.org/wiki/Islanders_(video_game))。

成功的游戏多半叠两种。Stardew 是复原清单（D）叠上第 3 年的评价。Against the Storm 是局内计时（G）叠上外层的世界地图阶段。

### 设计者自己怎么说

每种结构都是为了解决一个具体问题：

| 谁 | 遇到的问题 | 改成什么 |
| --- | --- | --- |
| Eremite（Against the Storm） | 城建游戏重玩没意思；局面一稳就无聊 | 每局都不一样的跑团；用季节和事件把玩家从稳态里"戳出来"（[Game Developer](https://www.gamedeveloper.com/road-to-igf-2023/how-against-the-storm-managed-to-mix-city-building-and-roguelite-play)） |
| 11 bit（Frostpunk） | "太阳回来了，接着盖"的沙盒结尾太平淡 | 像小说一样收尾，结局早早定下（[PC Gamer](https://www.pcgamer.com/au/frostpunk-developers-on-hope-misery-and-the-ultimately-terrifying-book-of-laws)） |
| 11 bit（Solski） | 新手和老手要的不一样 | 人人都要完成的主目标，加给老手的可选难目标；限制本身就是玩法（[Inven Global](https://labs.invenglobal.com/articles/6528/igc-2018-empathize-with-numbers-the-process-of-frostpunk-scenario-writing)） |
| Two Point（Huskins） | 玩家拿到 3 星就走，很少回来 | Museum 里各馆共享进度，加上会回来的目标（[Shacknews](https://shacknews.com/article/140974/two-point-museum-interview)） |
| Wube（Factorio） | 每关重开一座工厂，玩家投入不进去；教程教的是步骤不是概念 | 一张不断扩大的地图；所有配方都要靠科技拿到；在实验中学（[FFF #241](https://factorio.com/blog/post/fff-241)） |
| Colossal Order（CS II） | 人口门槛逼人造大城 | 改成经验门槛，解锁顺序自选 |
| Grizzly Games（Islanders） | 系统太多 | 每个决定都问一句"能不能更简单"，砍掉资源、交通、研究和支线 |

Wube 的 FFF #329 还记下了两难：连续地图上，玩家的状态很难预测；分开的关卡又让人重复劳动（[FFF #329](https://direct.factorio.com/blog/post/fff-329)）。

### 网球总监在哪一格

- **现在的修复链属于 D 型，最像 Stardew 社区中心：** 一张复原清单，每完成一项世界就变一块。16 周期限加表演赛，是 Frostpunk 那种"已知的高潮"。两种都有设计者亲口给的理由，底子是对的。
- **ADR 0020 的星级加赛事阶梯，是把 B 型叠上去。** 风险是两个钟同时走：星级想让人一直往上爬，期限想让人冲向终点。Game Dev Story 的处理是期限只管打分，等级管日常。Frostpunk 是只留一个钟。
- **新手要的是一个短期、看得见、和解锁绑在一起的下一步。** 例如 Two Point 的预备目标、Satisfactory 的下一期。在不做菜单的游戏里，最强的形式是场景里高亮的下一处修复。文字任务列表要弱得多（Wube 的结论）。
- **老手要的是可选的更高一档和顺序上的自由。** 例如 2–3 星、Frostpunk 的可选目标、Against the Storm 的成就目标（Deeds）。

## 游戏怎么越做越大

### 加新机制，而不是加大数字

| 做法 | 例子 | 关键点 |
| --- | --- | --- |
| 每一层带一种新约束 | Anno 1800：每个人口层有自己的劳动力，新的一层先只开几栋建筑，人多了再开（[Anno Union](https://www.anno-union.com/en/devblog-residential-tiers/)） | 新需求而不是更多同样的需求；城市的样子也跟着变 |
| 每张图一种机制性格 | Two Point Museum：海洋馆要管水温，太空馆要解外星文字（[Shacknews](https://www.shacknews.com/article/150023/two-point-studios-10th-anniversary-interview)）；Campus 每关一个主题挑战 | 设计者说这让游戏几十小时后还新鲜 |
| 碰到了才解锁 | Factorio 的"触发科技"：亲手采到、造出某样东西才算研究完成（[FFF #376](https://direct.factorio.com/blog/post/fff-376)） | 以前玩家还没见过原油就研究炼油，设计者觉得这让人泄气 |
| 逐步升级的危机 | Frostpunk 三幕：生存 → 内部冲突 → 大风暴；法典一条比一条狠；New Manchester 中途来一批病人 | 张力在升，玩家看得见它在升 |
| 每一级规则不同 | Motorsport Manager 三级赛事：加不加油、统一零件、不许开发车（[Autosport](https://www.autosport.com/other/news/125659/more-details-for-motorsport-manager-revealed)） | 往上走换的是规则，不只是规模 |

### 扩张会出的问题

- **范围变大但没有重点，就乱。** ONI 的多小行星版本里，玩家说切来切去"全乱了"，还说什么都能做，那就什么都不做（[Steam](https://steamcommunity.com/app/457140/discussions/0/3105765614220863818)）。
- **后期加一层和核心没关系的系统，没人买账。** Kairosoft 的 Magazine Mogul 后期加了一层小镇经营，评测说它"浅、多余"（[TouchArcade](https://toucharcade.com/2015/02/06/magazine-mogul-review/)）。
- **对网球总监：** 16 周的手机局不适合加第二座俱乐部。"区域层"可以是赛事巡回。新东西出现时要带一个具体目标，例如"第 9 周前办成青少年训练营"，不能只是开放一片沙盒。

### 后期的六种失败，和我们对上的症状

| 失败模式 | 证据 | 网球总监的对应症状 |
| --- | --- | --- |
| 中段循环重复 | Game Dev Tycoon 评论里最重的负面是"中段重复"（[Vaporlens](https://vaporlens.app/app/239820/game_dev_tycoon.md)）；Two Point"任务糊成一片" | GM-1：第 52–84 天一张卡也没有 |
| 钱花不完 | Big Ambitions 玩家说"我不需要更多钱了"；CS 人口过 7.5 万后"钱多到用不完" | 修完中心球场后钱没处花 |
| 只是数字往上走 | 开罗系作品："只有数字往上涨"（[TouchArcade](https://toucharcade.com/2015/02/06/magazine-mogul-review/)） | 声望后期顶到 100 |
| 没有压力 | TechRadar 评 Two Point Campus："一关都没输过"，怀念压力（[TechRadar](https://www.techradar.com/features/like-me-in-freshman-year-two-point-campus-is-far-too-relaxed)） | 方案 A 去掉"输"以后的风险 |
| 范围开放没有重点 | ONI Spaced Out | 完全放开修复顺序的风险 |
| 事件只改数字 | Epic Pirate's Story：事件只改属性，没有有意思的效果；钱从来不紧（[Pocket Gamer](https://www.pocketgamer.com/epic-pirates-story/review)） | 起风卡原样来 4 次 |

### 试过的修法

| 修法 | 例子 |
| --- | --- |
| 已知的高潮，打完就结束 | Frostpunk 砍掉了风暴后接着盖的设计，无尽模式单独做 |
| 分期的巨型工程 | Satisfactory 的太空电梯 5 期；DSP 的戴森球被玩家称为终极目标 |
| 越顺越难 | RimWorld 的"适应度"在玩家顺的时候加难度；财富越多，袭击越强（[RimWorld wiki](https://rimworldwiki.com/wiki/AI_Storytellers)） |
| 可选的难目标 | Frostpunk 的可选目标；Against the Storm 的 Deeds |
| 不断冒出来的挑战，不说"你完事了" | Two Point Hospital |
| 完成度追踪和后期委托 | Stardew 1.5 的完美度、齐先生的特别委托 |

### 对 ADR 0020 的两点补充

1. **每一星开的新机制，最好各带一条新约束，而不只是新的临时岗位。** 现在月度内赛、邀请赛、表演赛的动作都是"开临时岗位、把人拖上去"，本质是同一个动词。可以借的约束：

   | 赛事 | 加什么约束 | 借谁的 |
   | --- | --- | --- |
   | 内赛 | 占用两块场一整天，当天不租场，日常收入归零 | Resort Boss: Golf：办赛时球场对普通客人关闭（[WorthPlaying](https://www.worthplaying.com/article/2019/5/10/news/114245-resort-boss-golf-early-access-update-adds-golf-carts-tournaments-wildlife-and-more/)） |
   | 地区赛 | 双打要两名球员 | Tennis Club Story 到 D 级才开双打，逼你招第二个球员 |
   | 邀请赛 | 要特定的场地类型 | Tennis Club Story 四个大满赛各一种场地 |

2. **钱的去处，可以给表演赛做成 Satisfactory 式的分期工程。** 例如看台、夜场灯、球童、转播或赞助，分几期，从 ★3 起就挂在中心球场的地点牌上。它同时回答 GM-1 #2"终局看不见"。ADR 0020 不做第二种货币，证据支持。Eremite 发现把"新内容"和"数值强化"放进同一棵树，玩家不买账，后来拆开了（[Eremite](https://eremitegames.com/progression-update/)）。开罗的 Dream Town Island 因为货币和等级太多，被评为东一块西一块钉上去的（[TouchArcade](https://toucharcade.com/2023/06/27/dream-town-island-mobile-kairosoft-game-review-iphone-ipad-android/)）。

## 掌控感

### 理论：四个条件缺一不可

| 条件 | 出处 | 一句话 |
| --- | --- | --- |
| 自主：自己选目标和打法 | 自我决定论 / PENS（[Ryan 等 2006](https://www.rochester.edu/warner/lida/wp-content/uploads/2022/11/02bfe513dd59366750000000.pdf)） | 一项多款游戏的研究里，自主感预测"还想再玩"的系数是 0.96，胜任感是 0.65；直觉的操作是"守门员"，前两样在时它才起作用 |
| 看得懂的选择 | Sid Meier（[Buteau 汇编](https://www.antoinebuteau.com/lessons-from-sid-meier/)） | 选项不能有明显的高下，玩家要能做"知情的选择" |
| 反馈闭环 | Daniel Cook 的技能原子（[Lostgarden](https://lostgarden.com/2021/03/13/the-chemistry-of-game-design-2/)）；Sylvester 的"玩家模型"（[Game Developer](https://gamedeveloper.com/design/the-simulation-dream)） | 决定 → 动作 → 模拟 → 反馈 → 玩家更新脑中的模型；没进玩家脑子的模拟等于没有 |
| 想做的和能做的对得上 | Wardrip-Fruin、Mateas 等（[Agency Reconsidered](https://www.cs.uky.edu/~sgware/reading/papers/wardripfruin2009agency.pdf)） | 玩家想做的动作，就是游戏支持的动作 |

Murray 对能动性（agency）的定义：采取有意义的行动，并且看到自己选择的结果。只是"参与"或"忙活"不算。

### 让因果看得见：三层

- **场景里。**
  - Two Point 用头顶图标、环境线索、叠加层：地上有垃圾说明缺垃圾桶，病人闲晃说明缺座位（[GamesRadar](https://gamesradar.com/two-point-hospital-tips)）。
  - Cities: Skylines 有 19 种信息视图，把交通、治安等直接染在地图上（[Paradox 开发日志](https://admin-forum.paradoxplaza.com/forum/developer-diary/cities-skylines-dev-diary-9-info-views.833752/post-18849702)）。
  - SimCity BuildIt 测试发现玩家看不到模拟里的事，就加了市民的意见气泡（[EA](https://www.ea.com/amp/news/taking-simcity-to-mobile)）。
- **对象上。** RimWorld 的心情条：
  - 0–100% 的条上有一个"目标"三角，是各条想法加加减减的和。
  - 目标值立刻变，实际值慢慢追：涨每小时最多 12 点，跌每小时最多 8 点。
  - 条上标着三条崩溃线：5%、20%、35%（[RimWorld wiki](https://rimworldwiki.com/wiki/Mood)）。
  - 窍门是：先给目的地，再给构成，再标危险线。
  - Football Manager 用大小不同的箭头表示属性在涨，数字没变也看得出进步；还把士气刻度加倍，好让玩家看出差别（[Game Informer](https://gameinformer.com/b/features/archive/2017/11/06/the-sports-desk-inside-the-dynamics-of-football-manager-2018)）。
- **事后。** 报告和日志。Frostpunk 的结局日志会点出"不太好的选择"，但不直接下判断。

**随机放在决定之前。** Keith Burgun 区分了两种随机：决定前揭晓的"输入随机"，和决定后才掷骰的"输出随机"。输出随机切断了决定和结果之间的链（[Burgun](https://keithburgun.net/three-types-of-bad-randomness-and-one-good-one/)）。Into the Breach 预告敌人的每一次攻击，目标是让每次失败都像玩家自己的错。

**惩罚要讲原因。** Meier 发现：玩家优势 3:1 时输了，会觉得被骗；2:1 时输了，能接受（[Game Informer](https://gameinformer.com/b/news/archive/2010/03/12/sid-meier-gamers-arent-logical.aspx)）。他的结论是：玩家接受好处不问来由，惩罚就要讲清原因。

### 自动化什么时候帮忙，什么时候抢走掌控

- **The Sims 的原则是"是的，而且"：** 自动行为接着玩家的安排往下做，不推翻它；小人也不会自己辞职或自己谈恋爱。早期小人的 AI 好到玩家怎么操作都不如放着，团队故意把它改差了（[Mein-MMO](https://mein-mmo.de/die-sims-ki-zu-gut-schlechter/)）。
- **ONI 有明确的覆盖层级（[ONI wiki](https://oxygennotincluded.wiki.gg/wiki/Priority)）：**
  - 每人每类活的优先级；
  - 每件活 1–9 的子优先级；
  - 黄色警报能压过日程（睡觉除外）；
  - 只有红色警报能让小人连吃饭睡觉都不顾。
- **Two Point 是直接拎起员工扔进房间，扔进去就在那儿干。**
- **一家殖民地模拟工作室的观察：** 玩即时战略的人会把"不听话"当成 bug（[Choost Games](https://choostgames.com/blog/why-colony-sim-colonists-ignore-you/)）。网球总监是拖人上岗的直接控制。玩家拖过去的人被习惯拉走，读起来就是 bug，而不是"涌现"。

### 计划的视野

- **让玩家选"什么时候做"。** Frostpunk 早期的法令由事件触发，团队发现玩家没法决定什么时候立法，于是改成玩家自己翻法典（[PC Gamer](https://www.pcgamer.com/au/frostpunk-developers-on-hope-misery-and-the-ultimately-terrifying-book-of-laws)）。
- **失败之前先给警告和期限。** Prison Architect 的失败都先给警告和修复的时限，失败本身在场景里演出来（[PC Invasion](https://pcinvasion.com/prison-architect-alpha-20-adds-fail-states)）。
- **让崩溃慢下来。** RimWorld 让下滑拖成一条长弧线，甚至能逆转；殖民地人少时叙事者会松手（[Game Developer](https://gamedeveloper.com/design/how-i-rimworld-i-fleshes-out-the-i-dwarf-fortress-i-formula)）。
- **不做突然的大灾难。** Meier 砍掉了"大灾难后复苏"的机制，因为玩家一察觉失败就读档。

### 手机上不靠菜单的控制

- **Pocket City：** 拖手指连片划区，评测说从没误建过（[Destructoid](https://www.destructoid.com/reviews/review-pocket-city/)）。Pocket City 2 被批评"有些东西埋在菜单里太深"（[TouchArcade](https://toucharcade.com/2023/04/18/pocket-city-2-review-mobile-iphone-ipad-premium-city-builder/)）。
- **Two Point Campus 做主机版：** 让玩家留在世界里，点对象看信息，不开单独的菜单（[Vooks](https://vooks.net/interview-bringing-two-point-campus-to-the-nintendo-switch)）。
- **Clash of Clans 改版：** 点升级卡，镜头直接转到那栋建筑并弹出确认；点锁住的项，镜头转到卡住它的建筑（[Supercell](https://supercell.com/en/games/clashofclans/blog/news/weve-revamped-the-clash-of-clans-user-interface/)）。

### 对上 GM-1 的问题

| GM-1 问题 | 坏的是哪一环 | 怎么修（证据） |
| --- | --- | --- |
| #1 习惯抢走工单、守着关门的岗位 | 想做的和能做的对不上；结果不是"我的" | 玩家亲手拖的安排高于习惯，习惯只填空档（Sims）；需要打断时先冒气泡，在因果日志里写"会回来"；长按把人"钉住"，钉住的人不受习惯影响，代价是累得快（ONI 黄色警报） |
| #2 终局花费看不见 | 不是知情的选择 | HUD 写"下一步：重建中心球场 · $9000"；拖人到工单上、松手之前，场景里预览这一步动哪些东西（Islanders 落子前预览分数） |
| #4 衰减没后果 | 系统没进玩家模型 | 地点牌上显示"目标值"和当前值（RimWorld）；周结算加一行"照这样下去，下周……"；ADR 0017 的掉档要先在画面上看到 |
| #5 卡的取舍弱、原样重复 | 无意义的选择 | 每个选项写出代价；起风卡改成提前一天预告的"输入随机" |
| #7 周结算说不清原因 | 惩罚没讲原因 | 先讲每一项损失的"为什么"，再讲收获 |

## 多样性

### 证据最强的一条：小范围随机二选一

- **Against the Storm 的转向。** 开发日志说，最根本的支柱是核心玩法要能反复玩。早期让玩家开局挑建筑套装，这一点正好伤到支柱：坚持一套最优解是理性选择，解锁越多越选不过来，每个聚落都长一个样。改成开局给一小套固定的基础建筑，每拿到一次声望，从几个随机选项里挑一个。设计者说小池子减轻了选择困难，也让难题没有唯一解（[Eremite devlog 6](https://eremitegames.com/devlog-6/)）。
- **Islanders 是最简版：** 每到分数线，从两个主题建筑包里挑一个。
- **反面意见。** 一篇评测说，后来"盖出来的基地都一个样"：50 多种建筑里 30 多种只是相近的二级建筑。"不准种庄稼"这类修饰只是一刀切的禁令，不是会演变的难题（[radiator 博客](https://www.blog.radiator.debacle.us/2023/06/design-review-of-against-storm-by.html)）。所以变体要在种类上不同，不能只差数字。

### 方向：可以放下一条线

- **FM 的俱乐部理念。** 例如"靠青训培养球员""签 23 岁以下的年轻人"。每种都是一条约束，会决定你被不被炒（[Passion4FM](https://www.passion4fm.com/football-philosophies-board-expectations/)）。FM2020 起，董事会在开局的欢迎会议上定下多赛季愿景，每个存档因此"手感不同"（[SI](https://www.si.com/soccer/2019/09/19/football-manager-2020-new-features-unveiled-focus-player-development-club-identity)）。
- **JWE 的反例。** 科学、安保、娱乐三个部门必须同时照顾好，评论说这"很随意"，每座公园都没有个性（[Wikipedia: JWE](https://en.wikipedia.org/wiki/Jurassic_World_Evolution)）。
- **Frostpunk 的信仰和秩序** 能改变出现哪些内容，也会逐步升级。但战役的剧情节点不变，评论说重玩价值有限。
- **ATS 设计者自己承认，玩家会从每条声望来源里挑最容易的那部分，团队需要"加强专精"。** 换句话说，要奖励押注一个方向，否则玩家每样都挑最便宜的。

### 起始条件和节奏

- Against the Storm 一共 7 个种族，每个聚落只住 3 个。网球总监的"14 个候选人里见到 8 个"是同一种做法。要学的是让每个候选人改变打法，而不只是数值不同。
- RimWorld 的叙事者换的是同一副事件牌的节奏。Cassandra 是逐渐上升的张力曲线，Phoebe 在灾难之间留长空档，Randy 纯随机（[RimWorld wiki](https://rimworldwiki.com/wiki/AI_Storytellers)）。
- Sylvester 说，故事的丰富来自几件事互相作用；事件持续越久，重叠越常发生（[Game Developer](https://gamedeveloper.com/design/how-i-rimworld-i-fleshes-out-the-i-dwarf-fortress-i-formula)）。卡少的游戏更该让卡留下一段持续的状态。

### 多样性该服务谁

Quantic Foundry 的动机模型（[参考 PDF](https://quanticfoundry.com/wp-content/uploads/2019/04/Gamer-Motivation-Model-Reference.pdf)）：

- **"设计"** 是在游戏世界里表达自我。代表作是 The Sims、Animal Crossing，城建也在高分一侧。
- **"策略"** 是 12 种动机里唯一 9 年来明显下降的，67% 的玩家比 2015 年的平均玩家更不在乎策略规划（[Multiplayer.it 转述](https://multiplayer.it/notizie/giocatori-vogliono-sempre-meno-preoccuparsi-strategia-videogiochi.html)）。
- **GDC 2021 的幻灯片里，约 61% 的人想要更多"设计"**（[QF 幻灯片](https://quanticfoundry.com/wp-content/uploads/2021/07/GDC-2021-Slides-Universals-vs-Differentiators-Quantic-Foundry.pdf)）。这个比例是工具从表格里读出来的，只当约数。

对网球总监的意思是：多样性要做成**看得见的表达**（俱乐部长得不一样）和**能发现的组合**，不要再加一层规划。

## "我在建造"的感觉

### 心理学：四个条件

| 条件 | 证据 | 数字 |
| --- | --- | --- |
| 必须完成 | IKEA 效应（[Norton 等](https://dash.harvard.edu/bitstream/handle/1/12136084/norton%20mochon%20ariely%20third%20round[1].pdf)）：作者说，劳动只有在任务成功完成时才会变成喜爱 | 拼完乐高 $0.84 对 $0.42；拼完再拆掉，差距不显著（$0.43 对 $0.29）；IKEA 盒子差两步没拼完，出价从 $1.46 掉到 $0.59 |
| 证明我能干 | 胜任感是中介（[Mochon 等](https://dash.harvard.edu/bitstream/1/11320608/1/mochon,norton,ariely_bolstering.pdf)） | 先做自我肯定的人，溢价消失 |
| 我是作者 | "我自己设计的"效应（[Franke 等](https://www.wu.ac.at/fileadmin/wu/d/i/entrep/4_forschung/full-text-papers/franke_schreier_kaiser_2010_designed_it_myself.pdf)） | 自己设计的 T 恤 €6.85 对 €4.75；中介是成就感，**花了多少工夫不是中介**；设计自由大的手表 €30.34 对小的 €19.21；结果合自己口味时溢价更大 |
| 控制、熟悉、投入自我 | 心理所有权的三条路径（[Gardner 等 2023](https://www.mdpi.com/2673-8104/3/1/3)） | 三条都能预测"这是我的" |

另有二手综述提到：创作空间有限时，满意度反而更高（Dahl 与 Moreau 2007，转引自 [Wikipedia](https://en.wikipedia.org/wiki/IKEA_effect)）。

**网球总监现在的情况：**

- 完成：有。
- 胜任：有一部分。工单做完有快讯，但没说"你的人三天就干完了，没超预算"。
- 作者：没有。
- 投入自我：几乎没有。没有名字、牌匾，也没有谁修好了哪里的记录。

### 自由放置不是必要的

- **自由太大反而趋同。** Two Point 的 Hymers 说，开放沙盒里自由给满了，大家反而都按同一种方式做（[TheSixthAxis](https://www.thesixthaxis.com/?p=318888)）。
- **自由太大让人不知所措。** Animal Crossing 玩家面对地形改造，说"完全被压垮"（[Bell Tree](https://www.belltreeforums.com/threads/feeling-very-overwhelmed-by-island-design-and-terraforming.638104/)）。
- **玩家定大形状，系统补细节。** Townscaper 的 Stålberg 想让玩家掌控大的形状，细节由系统补齐，而且大规则可以预料：围起来的地方一定长出花园（[Game Developer](https://gamedeveloper.com/blogs/how-townscaper-works-a-story-four-games-in-the-making)）。
- **固定格子也能有作者感，有三种做法：**

  | 做法 | 例子 |
  | --- | --- |
  | 选格子里放什么 | Fallout Shelter 每层 8 个单位，同类房间相邻最多 3 间合并，能升到 3 级（[Fallout Wiki](https://fallout.wiki/wiki/Fallout_Shelter_rooms)） |
  | 相邻组合 | 开罗：礼品店和便利店挨着租车行，使用费 +300（[Kairosoft wiki](https://kairosoft.wiki.gg/wiki/Tips_(Tropical_Resort_Story))） |
  | 每完成一项挑一个样式 | Homescapes 每完成一项任务，从三种设计里挑一种（[PocketGamer.biz](https://www.pocketgamer.biz/how-does-homescapes-monetise/)） |

- **Hades 把功能和外观分开。** 装修大多只是外观，不影响玩法；单独的"工单"一栏放功能升级，有的工单会把角色请回家里（[Prima Games](https://primagames.com/gaming/hades-guide-house-of-hades-house-contractor-upgrades/3)）。

### 看着它变

- **手游里的证据。** GameRefinery 说，手游休闲玩家最大的动力是完成里程碑；"装修"同时满足自我表达，排名前 20% 的三消里有 42% 用了这一层（[Mobidictum](https://mobidictum.com/game-industry/case-study-why-renovation-favorite-in-casual-games/)）。
- **玩家的评价。** PowerWash Simulator 收到的反馈里最常见的一个词是"解压、满足"（satisfying）（[Kotaku](https://kotaku.com/powerwash-sim-devs-on-making-cleaning-fun-advanced-cro-1847319502)）。
- **不能拖。** House Flipper 2 的设计者说，动作做太久就会无聊；声音不对，沉浸感就破了（[Game Developer](https://www.gamedeveloper.com/design/house-flipper-2-interview)）。
- **让人看着它热闹起来。** Dorfromantik 想让玩家光看自己的作品、发现小细节被填满，就觉得开心（[Game Developer](https://www.gamedeveloper.com/disciplines/sparking-joy-through-tile-placement-in-idyllic-village-builder-i-dorfromantik-i-)）。Cozy Grove 每帮一个灵魂，岛就恢复一块颜色。
- **完成有仪式，世界跟着变。** Stardew 社区中心每完成一个大目标，牌匾上多一颗星，世界跟着变，开出新区域（[Siliconera](https://www.siliconera.com/stardew-valley-community-center-concept-art-shared/)）。
- **人要有名字。** Fallout Shelter 的居民各有名字和属性，被形容成"自己的大娃娃屋"（[GamesRadar](https://gamesradar.com/fallout-shelter-info)）。

### 复原从"清单"变成"建造"的条件

1. 每一步马上在画面和声音上改变这个地方。
2. 复原带回生命和故事：人、颜色、一段剧情的收尾。
3. 完成开出新的可能，而不只是一个数字。
4. 玩家对结果有发言权，至少在修好之后。
5. 工作不拖。

网球总监已经有第 1 条，第 2、3 条有一半（Dale 的故事、新岗位），第 4 条完全没有。

## 案例深挖

| 游戏 | 主线 | 掌控感 | 多样性 | 建造感 | 对我们的借鉴 |
| --- | --- | --- | --- | --- | --- |
| Tennis Club Story（开罗） | 单打 F→B 按累计积分 70/500/2,750/7,500/14,300 解锁；四个按场地分的 A 级大满赛，奖金 15,000；S 级要赢团体赛 Dennis Cup（[wiki](https://kairosoft.wiki.gg/wiki/Matches_(Tennis_Club_Story))） | 比赛不能直接操作，只能从 4 种战术里选，评测说战术"作用很有限"（[Bonus Stage](https://www.bonusstage.co.uk/archives/165079)） | 每季最多 3 项俱乐部活动，每项一季一次；很多活动挂在赞助商等级上（[wiki](https://kairosoft.wiki.gg/wiki/Club_activities_(Tennis_Club_Story))） | 扩建场地 +1 块场 +3 个设施位，按赛事等级解锁 | 积分门槛、按场地分的大满赛、重复打积分减半都能直接用；表演赛不能只看不管 |
| Pocket League Story（开罗） | 10 级球队等级，每级开设施、训练法或赞助；赢联赛开下一个联赛 | 评测说建造"很低调"，比赛自己踢 | 33 种阵型开局 8 种，每签一个教练加一种 | 换草皮、扩场、翻新球场 | 人是钥匙（ADR 0020 已采纳） |
| SimGolf | 设施随进度解锁；赤字太久就输（[Wikipedia](https://en.wikipedia.org/wiki/Sid_Meier%27s_SimGolf)） | 球场"光环"叠加层显示好坏位置；评测批评比赛中误点会买错东西（[GameSpot](https://www.gamespot.com/reviews/simgolf-review/1900-2843958/)） | 16 个地区；球手成对聊天，故事各不相同 | 心情好的球手投资或捐地标；自己的职业球员赢的奖金回到球场；口号是看着难、打着容易 | 会员捐钱修某一处；球员奖金养俱乐部；赛事进行中锁住建造 |
| Two Point 系列 | 1 星开下一关，2–3 星精通；Museum 改为各馆共享进度 | 拎起员工直接扔进房间；图标、叠加层、环境线索 | 每关一种机制性格；但"每关开局都一样"（[PCGamesN](https://www.pcgamesn.com/two-point-campus/review)） | 房间可拆可换；装饰算进房间威望，影响员工心情 | 1 星及格线 / 3 星精通线；每一星带新约束；装饰要有功能 |
| Against the Storm | 声望条先满就赢，女王耐心先满就输；外层世界地图按阶段推进 | 季节和事件把玩家从稳态里戳出来 | 7 个种族每局 3 个；声望门槛上随机挑建筑，取代开局挑套装 | 设计支柱之一是把被遗忘的废墟恢复往日荣光（[Game Developer](https://www.gamedeveloper.com/road-to-igf-2023/how-against-the-storm-managed-to-mix-city-building-and-roguelite-play)） | 修复时小范围二选一；候选人要改变打法 |
| Frostpunk | 三幕，结局是已知的大风暴；打完不续盖 | 法典由玩家决定何时签；每条法令写明对希望和不满的影响 | 信仰 / 秩序互斥，一条比一条狠；剧情节点不变，重玩价值有限 | — | 表演赛当高潮，早早预告；"什么时候做"也是选择 |
| Stardew Valley | 社区中心 6 个房间 30 个收集包；第 3 年爷爷评价，0–21 分换 1–4 根蜡烛 | 收集包任选顺序；Joja 会员可以花钱跳过 | 1.5 版加姜岛、特别委托、完美度 | 每个房间修好，世界就变一块；牌匾上的星；Junimo 在完成后离开 | 分档评价当结局；任选顺序；修好时有仪式 |
| Factorio | 发射火箭算赢，之后可以接着玩；2018 年只有约 11% 的 Steam 玩家发射过 | 在实验中学；玩家讨厌被"告诉"要重开 | Space Age 四颗星球，各有机制身份 | — | 碰到了才解锁；"下一步"放在世界里而不是文字任务里 |
| Football Manager | 每赛季的董事会期望；长线理念决定去留 | 士气刻度加倍以便看清；训练箭头 | 8 种俱乐部理念；FM2020 起的五年愿景 | 设施升级要向董事会申请，看声望和战绩 | 开局"愿景"定方向，可以放下别的线 |
| Motorsport Manager | 三级赛事，开局选一个起点 | 联合会里有影响力，可以投票定赛历 | 各级规则不同：加油、统一零件、不许开发车 | 总部按价格分档，最后是 6,500 万的整车工厂和 1 亿的主题乐园（[wiki](https://motorsportmanagerpc.fandom.com/wiki/Headquarters)） | 赛事每升一级换规则；最后的大件当终局去处 |
| Islanders | 分数满了换新岛，门槛越来越高 | 选中建筑时显示半径，落子前预览分数 | 每到门槛二选一主题包 | 放下就不能拆；邻居加分减分 | 二选一就够；落子前预览 |
| Fallout Shelter | （笔记没覆盖） | — | 每格放什么房间、合并、升级、主题 | 自己的"大娃娃屋"；居民各有名字 | 固定格子也能有作者感：选功能 + 外观 |
| Hades（家里的装修） | （笔记只覆盖装修） | — | 外观装修 / 功能工单分开 | 有的工单把角色请回家 | 功能和外观分两层；修复可以请人回来 |
| RimWorld | 没有固定目标，叙事者出事件 | 心情目标三角、具名的加减项、崩溃线 | 叙事者换节奏，6 档难度 | 角色少，让玩家认识每一个 | 地点牌显示目标值；卡留下持续的状态 |
| Anno 1800 | 人口层就是推进系统 | — | 每层有自己的劳动力和需求 | 每一层是一个阶层的样子，城市越来越有结构 | 会员分层，各带新需求 |

## 对网球总监的启发

### 现在的设计和 ADR 0020，证据怎么看

| 设计 | 证据支持 | 证据质疑 |
| --- | --- | --- |
| 废墟复原的主题 | Stardew、Against the Storm、Cozy Grove 都把复原当核心；手游装修层的商业数据 | — |
| 修复解锁岗位（ADR 0015） | Stardew 修好开新区域；Hades 工单请人回家 | — |
| 修复的**结果**固定 | — | 没有作者感（Franke）；固定清单会收敛（ATS）；"每关开局都一样"（Two Point） |
| 修复**顺序**固定（一主两支） | 优先级清楚（ONI 的反例） | 纯清单；Stardew、Two Point、CS II 都给顺序选择 |
| 16 周硬期限、判输 | 有张力（TechRadar 的反面） | 一辈子在最后一步输掉；Meier 的读档；开罗和 Stardew 都用打分 |
| 表演赛当终点 | Frostpunk：结局早定、像小说一样收尾 | 只看不管的比赛被评无聊（Tennis Club Story、PLS） |
| 习惯（ADR 0014） | 自动化处理杂活是对的（Sims） | 推翻了玩家的拖动，违背"是的，而且" |
| 星级 0–5、复合清单 | 开罗、Two Point 的星级都这样做；每级能看到下一级要什么 | 门槛要求面面俱到，有 JWE"随意"的风险；★5 = 表演赛，和期限是两个钟 |
| 每一星开新机制 | Two Point 机制性格；Anno；开罗后期的教训 | 提议里的新机制动词相同，需要新约束 |
| 赛事阶梯、不是卡 | Tennis Club Story、PLS、USTA 联赛的真实路径；准则 4 | 重复打要减少回报，否则成了刷子 |
| 人是钥匙（员工成长） | GDS、PLS；Wright 的"所有权" | — |
| 不做第二种货币、不做星级选择卡 | Eremite 把新内容和强化拆开；Dream Town Island 货币太多 | 方向选择本身有证据（FM、Islanders），可以不用卡来做 |
| 结局方案 A | 打分有据（开罗、Stardew） | "之后接着经营"无据（Frostpunk 砍掉；Two Point 拿 3 星就走） |
| 结局方案 B | 保留张力 | "差一点就全输"的问题只缓解了一半 |

### 先修的：掌控感的地基

这几条不论选哪个方向都要做，便宜，直接对着 GM-1 的问题：

1. **拖动高于习惯。**
   - 玩家亲手拖去的人，不会被习惯拉走。习惯只填他闲着的时段。
   - 硬需求（以后的士气、酷热）要打断时，先冒气泡，在因果日志里写"Rosa 热得不行，去会所歇 20 分钟，会回来"，场景里画一条虚线连回原岗位。
   - 长按一个人可以"钉住"他：不受习惯影响，代价是士气掉得快一点。这是 ONI 黄色警报的做法，覆盖本身变成一个有代价的选择。
2. **松手之前看到代价。**
   - 拿着人悬在地点牌上时，牌上浮出这一步会动哪些东西，例如"拉走会员场的看场：这一圈作废 −$4，服务率 −3%"。
   - 对工单则显示"$2000 材料 · 约 2 天 · 修好开出 3 个岗位"。
3. **终局要什么写在 HUD 上。**
   - 用星级或复原那一格写"下一步"，例如"★4 还差：邀请赛 1 次、会员 12 人"或"重建中心球场 · $9000"。
   - 点它，镜头转到那一处的地点牌（Clash 的做法），只读，不违反准则 1。
4. **目标值和预报。**
   - 地点牌上的状况条加一个目标刻度（RimWorld），周结算加一行"照这样下去，下周会员场会掉一档"。
   - 罕见的事件提前一天到一周在季节栏上预告，例如"周四有风""下周 The Desert Sun 来"，把输出随机变成输入随机。

### 五个可选方向

#### 方向 1：修复分叉，选"它变成什么"

**做法：**

- 修复工单在地点清单里显示成 2 个变体，偶尔 3 个。
- 点一个变体，镜头转过去，在废墟上叠一层这个变体修好后的半透明预览（借 Islanders 的落子预览、Clash 的转镜头）。
- 把人拖到哪个变体上，就开哪个工单。第一个人到场、扣材料费时锁定，沿用现有规则。
- 以后可以花钱开"改造"工单换回另一个（借 Two Point 的房间可拆可换）。
- **不加事件卡，也不加菜单。**

**变体例子（初值，都要校准）：**

| 设施 | 变体 A | 变体 B | 取舍 |
| --- | --- | --- | --- |
| 会员场 | 不分叉（新手的第一步，人人都一样，借 Frostpunk 的"人人都要完成的主目标"） | — | — |
| 红土场 | 保留红土：成人班收入 +，青训成长 +，衰减 5，大风天掉得更多 | 改硬地：衰减 3，赛事可用；红土邀请赛不能办 | 养护工时 vs 赛事资格 |
| 青训场 | 青少年学院（工作日 14–18） | 晨间训练营（每天 7–10，冬天会员加成） | 家长会员 vs 早起的冬季会员；沙漠里早上 8 点比 11 点好打（[Your Resort Home](https://yourresorthome.com/the-new-residents-guide-to-desert-tennis-pickleball/)） |
| 会所 | 咖啡吧：午餐收入，会员上限 +15 | 理疗室：球员恢复，开体能师岗位，会员上限 +8 | 收入 vs 球员线 |
| 棕榈喷泉 | 喷泉广场：周末夜场 | 遮阳观赛坡：表演赛和邀请赛的到场上限 + | 日常收入 vs 赛事 |
| 匹克球场 | 匹克球 4 片：联赛收入高，网球老会员不满（声望 −，La Quinta 的卡来得更早） | 恢复成两片网球场：会员上限 +12，内赛可用场 + | 真实的两难：Hyatt Regency Indian Wells 把 1 片网球场改成 4 片匹克球（[CoStar](https://www.costar.com/article/233516311/pickleballs-popularity-has-resorts-scrambling-to-convert-tennis-courts-seize-revenue-opportunities)）；各地有噪音诉讼，Boise 还改了回去（[Boise](https://www.cityofboise.org/news/parks-and-recreation/2025/september/city-of-boise-settles-lawsuit-pickleball-courts-at-two-city-parks-transitioning-back-to-tennis-only/)） |
| 泳池 | 泳池 + 小木屋：周末度假客 | 冷水恢复池 + 球员休息区：球员练球 +，外出赛成功率 + | 度假线 vs 竞技线 |
| 中心球场 | 不分叉功能；修好时由玩家给它起名，名字可以选 Dale、带队修复的人或俱乐部名 | — | 个人印记（见方向 4） |

**修复链怎么变：** 链的形状可以不动，只是每一环多一个分叉。星级门槛改成"修好 N 处"，不论哪个变体。

**代价：**

- 约 12–14 个变体，各要一套画面层和岗位 YAML。
- 美术量大约翻倍，只算分叉的六处。
- 平衡要保证没有一个变体被压制。

**依据：** Franke（作者感）、ATS（门槛上小范围挑选）、Fallout Shelter 和 Homescapes（固定格子里的功能和样式）、开罗（组合）。

**准则：** 准则 1 满足，选择是拖人到工单上。准则 2、3 加强：变体有取舍，后面的赛事和卡会认它。准则 4 不受影响。

#### 方向 2：放开顺序，同时摆出 2–3 处可修

**做法：** 修复分三圈。

- **第一圈：** 会员场。
- **第二圈：** 红土场、会所、青训场，任选顺序。会所仍是招聘的前提，因为不招人修不完。
- **第三圈：** 棕榈喷泉、匹克球场、泳池。第二圈修好 2 处就开，任选顺序。
- **中心球场：** 第三圈修好 2 处就开。

**加触发式解锁（借 Factorio）。** 例如：

- 学院岗位跑满 10 圈，才在青训场冒出"发球机"工单；
- 第一次有球员外出比赛，才冒出"冷水恢复池"的变体。

**怎么防 ONI 式的"不知道做什么"：**

- 同时最多摆 3 处；
- 员工条的"下一步"轻提示照旧，只是变成高亮最便宜的那一处。

**代价：** 机器人的平衡区间会变宽，要验证有没有一种顺序压倒其他顺序。和方向 1 一起做，组合数是"顺序 × 变体"。

**依据：** Stardew 收集包任选顺序；Two Point 一个区两家医院任选先后；CS II 的解锁顺序自选；ONI 的反例。

**准则：** 和准则 1、5 都兼容。

#### 方向 3：赛事阶梯，每一级换一条规则（ADR 0020 改良）

| 赛事 | ADR 0020 现在 | 加的新约束 | 依据 |
| --- | --- | --- | --- |
| 月度内赛 | 签到、裁判两个临时岗位 | 占用两块场一整天：当天这两块不租场、不上课 | Resort Boss: Golf 办赛时关场 |
| 地区业余赛 | 一次判定 | ★3 起开双打组：要两名球员，或球员 + 教练；赢了算 2 座奖杯 | Tennis Club Story 到 D 级才开双打，逼你招第二个人 |
| 地区青少年赛 | 学院岗位 ≥ 10 圈 | 不变；如果方向 1 选了晨间训练营，换成"冬季常青赛"（会员 ≥ 50 岁组） | 变体要有后果（准则 3） |
| 邀请赛 | 红土 + 会所 + 喷泉 | 按变体分两种：红土邀请赛（要红土场）或硬地邀请赛（要硬地）；遮阳观赛坡让到场上限 + | Tennis Club Story 每个大满赛一种场地 |
| 重复参赛 | 每次奖励相同 | 同一赛事第二次起，声望和会员奖励减半；附加目标换一个 | Tennis Club Story 重复积分减半 |
| 表演赛 | 一张工单 | 分四期准备：看台（重建）→ 夜场灯 → 球童和场边服务 → 赞助或转播。每期是一张中心球场的工单，★3 起就挂出来，牌上写总价 | Satisfactory 分期工程；Frostpunk 早早预告风暴；回答 GM-1 #2 |
| 表演赛当天 | 一次判定 | 当天每两个小时有一个"换人"时刻：把谁拖到场边（Dale 当裁判、球童、服务），影响下一段的判定 | Tennis Club Story 和 PLS 的比赛只能看，被批无聊；不加菜单，用拖人做 |

**代价：** 赛事的平衡要重跑。表演赛分期以后，总花费要和现在的约 $28,000 对齐，否则钱的曲线会变。

**准则：** 赛事不是卡（准则 4）；当天换人还是拖人（准则 1、5）。

#### 方向 4：开局方向 + 个人印记

**开局方向：** 第 1 周投资方来一个电话，借 FM 的欢迎会议。问"这家俱乐部是做什么的"，三选一：

| 方向 | 偏向的变体 | 招聘日权重 | 星级的一条要求换成 |
| --- | --- | --- | --- |
| 青训学院 | 青训场学院、理疗室 | 教练和体能师 | 青少年赛奖杯 |
| 度假名园 | 咖啡吧、泳池、遮阳观赛坡 | 前台和服务 | 周末度假客人数 |
| 赛事中心 | 硬地、冷水恢复池 | 球员 | 外出赛奖杯 |

- **可以不照方向走。** 照着走有奖励：同方向的变体修满 3 处，表演赛成功率 +5%，借 ATS 的"加强专精"。
- **卡的数量：** 只占 1 张卡，可以和开局的发球机卡合并成同一个早晨。总数不超过现在的 15–19 张。

**个人印记：**

- 每修好一处，大门的牌匾上多一行，写着谁带队、第几天修好，借 Stardew 的牌匾星和心理所有权的"投入自我"。
- 修好时的快讯用胜任感的写法，例如"Rosa 和 Gus 两天修完红土场，比预计快 6 小时"。
- 会员在修好的地方冒对话气泡，说的是玩家选的变体，例如"终于有地方躲太阳看球了"，借 SimCity BuildIt 的意见气泡。

**代价：** 方向会让招聘日的 14 人池子显得小，可能要补人。外观类的牌匾和名字没有取舍，**是准则 2 的明确例外**：建议在文档里写明"纯外观和命名不受准则 2 约束"，或者干脆只做功能变体。

**依据：** FM 理念和五年愿景；JWE 的反例（不能逼人三线全顾）；Franke；Pierce；Fallout Shelter 的具名居民。

#### 方向 5：结局，"已知的高潮 + 分档评价"（方案 A 的变体）

**做法：**

- 第 112 天 18 点按几项打分，分成 4 档。借 Stardew 爷爷评价的写法：分几类，每类有上限，总分换档。
- 档名用故事，不用字母，例如"沙漠名园 / 社区俱乐部 / 再给一季 / 交出钥匙"。
- 表演赛办成，直接进最高档的候选。提前办成就提前结算，Frostpunk 式的收尾。
- **不续玩。** 重玩的理由交给方向 1、2、4 的组合，再加一个可以分享的种子码（借 ONI）。
- **保留真正的失败：** 最低档"交出钥匙"就是失败结局，有自己的结尾文字。破产照旧，但要先警告：现金低于 $0 起，季节栏亮红，写出"再过 N 天低于 −$2000 就结束"，借 Prison Architect。

**和 A、B 的区别：**

- A 打完可以接着经营。这里不续，避开开罗后期的老毛病和 Two Point"拿完就走"的问题。
- B 只看表演赛办没办成。这里 7/8 的局落在"再给一季"，不再是"什么都没有"。

**张力的风险：** 和方案 A 一样，只有真人能判断（TechRadar 对 Two Point Campus 的批评）。建议把"交出钥匙"的门槛定在复原不足 5 处、或会员不足 30。这样放置局和乱打的局会输，认真打的局不会在最后一步全输。Mini Motorways 的开发者说，游戏得老实告诉你"这局打得不够好"（[Pocket Tactics](https://www.pockettactics.com/dinosaur-polo-club/interview)）。

#### 五个方向放在一起

| 方向 | 解决什么 | 工作量 | 主要风险 | 和准则的关系 |
| --- | --- | --- | --- | --- |
| 1 修复分叉 | 建造感、多样性、准则 3 | 中高（美术 × 2） | 有变体被压制 | 全部兼容 |
| 2 放开顺序 | 掌控感、重玩 | 中 | 有一种顺序压倒其他；新手不知道先修哪 | 兼容 |
| 3 赛事带规则 | 中段、后期空心 | 中 | 平衡重跑；钱的曲线变 | 兼容 |
| 4 方向 + 印记 | 身份、多样性、所有权 | 低到中 | 候选人池子不够；准则 2 的外观例外 | 只占 1 张卡 |
| 5 分档评价 | 输在最后一步 | 低到中 | 张力 | 兼容 |

建议的次序：先做"掌控感的地基"，再做方向 1 和 3（证据最强，也最直接对着三个已测出来的问题），然后是方向 5，用来替代人-10 的 A/B 之争。方向 2 和 4 等第一轮真人试玩后再定。

### 要验证的

**机器人（`pnpm sim bots`）：**

| 指标 | 目标（初值） |
| --- | --- |
| 拖动被习惯推翻的次数 | 0 |
| 每个变体在 novice、average、good 三种机器人里的选择率 | 都在 20–80% 之间；有被压制的就改，不删 |
| 不同局之间"变体组合"的 Jaccard 距离 | 明显高于现在只看卡牌时的 0.27–0.47；三个方向各自的终局要能分开 |
| 放开顺序后，各种顺序到 ★3 的中位天数 | 差距 ≤ 7 天，没有一种顺序独大 |
| 第 52–84 天"既没有卡也没有赛事"的空档 | ≤ 7 天（沿用 ADR 0020） |
| 重复参赛减半后，中段的收入曲线 | 不低于现在；没有"只刷内赛"的最优解 |
| 分档评价下各档的分布 | 放置局落在最低档；average 落在中间两档；"7/8 却最低档"的局接近 0 |
| 表演赛分期后的总花费和办成日 | 和现在的第 91–111 天区间对齐 |

**真人试玩（GM-1 第二轮，手机竖屏）：**

1. **"后果看得懂"：** 从 4–7 分提到 7 分以上。问玩家："上周会员为什么少了？"他能不能说出一个自己做过的动作。
2. **建造感：** 打完以后让两名玩家各用一句话描述自己的俱乐部。两句话要明显不同，并且提到自己选的东西。
3. **分叉的可读性：** 在 390 宽的屏幕上，玩家能不能不翻别处就比较两个变体（准则 4 的检验）。
4. **分档评价的张力：** 最后两周还冲不冲；"再给一季"读起来像输还是像赢。
5. **表演赛当天：** 换人时刻有没有让人想管，还是嫌烦。
6. **开局方向：** 玩家会不会照着走；不照着走会不会觉得被罚（JWE 的风险）。

**这次没法回答的：**

- 固定顺序和自由顺序对留存的影响，没有找到数据。
- 手机上每次挑选给几个选项最好，也没有找到数据。最接近的证据是 Islanders 的二选一和 ATS 的"小池子"。
- 两者都只能靠自己的试玩来定。

## 来源

**主线怎么搭**

1. [Wikipedia: Theme Hospital](https://en.wikipedia.org/wiki/Theme_Hospital)
2. [Nintendo World Report: Two Point Hospital review](https://www.nintendoworldreport.com/review/52928)
3. [PC Gamer: Two Point Hospital review](https://www.pcgamer.com/two-point-hospital-review/)
4. [KosGames: Two Point Campus level list](https://kosgames.com/?p=30069)
5. [Shacknews: Two Point Museum interview](https://shacknews.com/article/140974/two-point-museum-interview)
6. [Shacknews: Two Point Studios 10th anniversary interview](https://www.shacknews.com/article/150023/two-point-studios-10th-anniversary-interview)
7. [Kairosoft wiki: Pocket League Story](https://kairosoft.wiki.gg/wiki/Pocket_League_Story)
8. [SegmentNext: Cities: Skylines milestones](https://segmentnext.com/cities-skylines-milestones-guide/)
9. [Neowin: Cities: Skylines II progression](https://www.neowin.net/news/cities-skylines-2-doesnt-solely-rely-on-population-numbers-for-progression/)
10. [PC Gamer: Frostpunk developers on hope, misery and the Book of Laws](https://www.pcgamer.com/au/frostpunk-developers-on-hope-misery-and-the-ultimately-terrifying-book-of-laws)
11. [Inven Global: IGC 2018 Frostpunk scenario writing](https://labs.invenglobal.com/articles/6528/igc-2018-empathize-with-numbers-the-process-of-frostpunk-scenario-writing)
12. [Stardew wiki mirror: Bundles](https://wiki.stardewvalley.net/Bundles)
13. [Satisfactory wiki: Space Elevator](https://satisfactory.wiki.gg/wiki/Space_Elevator)
14. [Factorio FFF #245](https://factorio.com/blog/post/fff-245)
15. [Factorio FFF #241](https://factorio.com/blog/post/fff-241)
16. [Factorio FFF #329](https://direct.factorio.com/blog/post/fff-329)
17. [Wikipedia: Against the Storm](https://en.wikipedia.org/wiki/Against_the_Storm_(video_game))
18. [Game Developer: How Against the Storm mixed city building and roguelite](https://www.gamedeveloper.com/road-to-igf-2023/how-against-the-storm-managed-to-mix-city-building-and-roguelite-play)
19. [Wikipedia: Islanders](https://en.wikipedia.org/wiki/Islanders_(video_game))

**游戏怎么越做越大**

20. [Anno Union: Residential Tiers](https://www.anno-union.com/en/devblog-residential-tiers/)
21. [Factorio FFF #376](https://direct.factorio.com/blog/post/fff-376)
22. [Autosport: Motorsport Manager details](https://www.autosport.com/other/news/125659/more-details-for-motorsport-manager-revealed)
23. [Steam: ONI Spaced Out discussion](https://steamcommunity.com/app/457140/discussions/0/3105765614220863818)
24. [TouchArcade: Magazine Mogul review](https://toucharcade.com/2015/02/06/magazine-mogul-review/)
25. [Vaporlens: Game Dev Tycoon](https://vaporlens.app/app/239820/game_dev_tycoon.md)
26. [TechRadar: Two Point Campus is far too relaxed](https://www.techradar.com/features/like-me-in-freshman-year-two-point-campus-is-far-too-relaxed)
27. [Pocket Gamer: Epic Pirate's Story review](https://www.pocketgamer.com/epic-pirates-story/review)
28. [RimWorld wiki: AI Storytellers](https://rimworldwiki.com/wiki/AI_Storytellers)
29. [Eremite: Progression Update](https://eremitegames.com/progression-update/)
30. [TouchArcade: Dream Town Island review](https://toucharcade.com/2023/06/27/dream-town-island-mobile-kairosoft-game-review-iphone-ipad-android/)
31. [WorthPlaying: Resort Boss: Golf tournaments update](https://www.worthplaying.com/article/2019/5/10/news/114245-resort-boss-golf-early-access-update-adds-golf-carts-tournaments-wildlife-and-more/)

**掌控感**

32. [Ryan, Rigby & Przybylski 2006 (PDF)](https://www.rochester.edu/warner/lida/wp-content/uploads/2022/11/02bfe513dd59366750000000.pdf)
33. [Antoine Buteau: Lessons from Sid Meier](https://www.antoinebuteau.com/lessons-from-sid-meier/)
34. [Game Informer: Sid Meier, gamers aren't logical](https://gameinformer.com/b/news/archive/2010/03/12/sid-meier-gamers-arent-logical.aspx)
35. [Lostgarden: The Chemistry of Game Design](https://lostgarden.com/2021/03/13/the-chemistry-of-game-design-2/)
36. [Game Developer: The Simulation Dream](https://gamedeveloper.com/design/the-simulation-dream)
37. [Wardrip-Fruin, Mateas et al.: Agency Reconsidered (PDF)](https://www.cs.uky.edu/~sgware/reading/papers/wardripfruin2009agency.pdf)
38. [RimWorld wiki: Mood](https://rimworldwiki.com/wiki/Mood)
39. [GamesRadar: Two Point Hospital tips](https://gamesradar.com/two-point-hospital-tips)
40. [Paradox: Cities: Skylines dev diary #9, Info Views](https://admin-forum.paradoxplaza.com/forum/developer-diary/cities-skylines-dev-diary-9-info-views.833752/post-18849702)
41. [Game Informer: Inside the dynamics of FM2018](https://gameinformer.com/b/features/archive/2017/11/06/the-sports-desk-inside-the-dynamics-of-football-manager-2018)
42. [Transcript: The Genius AI Behind The Sims](https://amara.org/subtitles/cVoJS4OdmVql/en/1/download/The%20Genius%20AI%20Behind%20The%20Sims.en.txt)
43. [Mein-MMO: Sims AI made worse](https://mein-mmo.de/die-sims-ki-zu-gut-schlechter/)
44. [ONI wiki: Priority](https://oxygennotincluded.wiki.gg/wiki/Priority)
45. [Choost Games: Why colony sim colonists ignore you](https://choostgames.com/blog/why-colony-sim-colonists-ignore-you/)
46. [Keith Burgun: Three types of bad randomness](https://keithburgun.net/three-types-of-bad-randomness-and-one-good-one/)
47. [PC Invasion: Prison Architect fail states](https://pcinvasion.com/prison-architect-alpha-20-adds-fail-states)
48. [Game Developer: How RimWorld fleshes out the Dwarf Fortress formula](https://gamedeveloper.com/design/how-i-rimworld-i-fleshes-out-the-i-dwarf-fortress-i-formula)
49. [Destructoid: Pocket City review](https://www.destructoid.com/reviews/review-pocket-city/)
50. [TouchArcade: Pocket City 2 review](https://toucharcade.com/2023/04/18/pocket-city-2-review-mobile-iphone-ipad-premium-city-builder/)
51. [Vooks: Bringing Two Point Campus to Switch](https://vooks.net/interview-bringing-two-point-campus-to-the-nintendo-switch)
52. [Supercell: Clash of Clans UI revamp](https://supercell.com/en/games/clashofclans/blog/news/weve-revamped-the-clash-of-clans-user-interface/)
53. [EA: Taking SimCity to mobile](https://www.ea.com/amp/news/taking-simcity-to-mobile)

**多样性**

54. [Eremite devlog 6](https://eremitegames.com/devlog-6/)
55. [Radiator blog: Design review of Against the Storm](https://www.blog.radiator.debacle.us/2023/06/design-review-of-against-storm-by.html)
56. [Passion4FM: Philosophies and board expectations](https://www.passion4fm.com/football-philosophies-board-expectations/)
57. [Sports Illustrated: FM2020 club vision](https://www.si.com/soccer/2019/09/19/football-manager-2020-new-features-unveiled-focus-player-development-club-identity)
58. [Wikipedia: Jurassic World Evolution](https://en.wikipedia.org/wiki/Jurassic_World_Evolution)
59. [PCGamesN: Two Point Campus review](https://www.pcgamesn.com/two-point-campus/review)
60. [Quantic Foundry: Gamer Motivation Model Reference (PDF)](https://quanticfoundry.com/wp-content/uploads/2019/04/Gamer-Motivation-Model-Reference.pdf)
61. [Quantic Foundry: GDC 2021 slides (PDF)](https://quanticfoundry.com/wp-content/uploads/2021/07/GDC-2021-Slides-Universals-vs-Differentiators-Quantic-Foundry.pdf)
62. [Multiplayer.it: Quantic Foundry on strategy decline](https://multiplayer.it/notizie/giocatori-vogliono-sempre-meno-preoccuparsi-strategia-videogiochi.html)

**"我在建造"的感觉**

63. [Norton, Mochon & Ariely: The IKEA effect (PDF)](https://dash.harvard.edu/bitstream/handle/1/12136084/norton%20mochon%20ariely%20third%20round[1].pdf)
64. [Mochon, Norton & Ariely: Bolstering and restoring feelings of competence (PDF)](https://dash.harvard.edu/bitstream/1/11320608/1/mochon,norton,ariely_bolstering.pdf)
65. [Franke, Schreier & Kaiser 2010: The "I designed it myself" effect (PDF)](https://www.wu.ac.at/fileadmin/wu/d/i/entrep/4_forschung/full-text-papers/franke_schreier_kaiser_2010_designed_it_myself.pdf)
66. [Gardner, Pierce & Lv 2023: Psychological ownership routes](https://www.mdpi.com/2673-8104/3/1/3)
67. [Wikipedia: IKEA effect](https://en.wikipedia.org/wiki/IKEA_effect)
68. [TheSixthAxis: Two Point Hospital interview](https://www.thesixthaxis.com/?p=318888)
69. [Bell Tree Forums: overwhelmed by island design](https://www.belltreeforums.com/threads/feeling-very-overwhelmed-by-island-design-and-terraforming.638104/)
70. [Game Developer: How Townscaper works](https://gamedeveloper.com/blogs/how-townscaper-works-a-story-four-games-in-the-making)
71. [Fallout Wiki: Fallout Shelter rooms](https://fallout.wiki/wiki/Fallout_Shelter_rooms)
72. [Kairosoft wiki: Tropical Resort Story tips](https://kairosoft.wiki.gg/wiki/Tips_(Tropical_Resort_Story))
73. [PocketGamer.biz: How does Homescapes monetise](https://www.pocketgamer.biz/how-does-homescapes-monetise/)
74. [Prima Games: Hades House Contractor](https://primagames.com/gaming/hades-guide-house-of-hades-house-contractor-upgrades/3)
75. [Mobidictum: Why renovation is a favorite in casual games](https://mobidictum.com/game-industry/case-study-why-renovation-favorite-in-casual-games/)
76. [Kotaku: PowerWash Simulator devs](https://kotaku.com/powerwash-sim-devs-on-making-cleaning-fun-advanced-cro-1847319502)
77. [Game Developer: House Flipper 2 interview](https://www.gamedeveloper.com/design/house-flipper-2-interview)
78. [Game Developer: Dorfromantik](https://www.gamedeveloper.com/disciplines/sparking-joy-through-tile-placement-in-idyllic-village-builder-i-dorfromantik-i-)
79. [Siliconera: Stardew Valley Community Center concept art](https://www.siliconera.com/stardew-valley-community-center-concept-art-shared/)
80. [GamesRadar: Fallout Shelter](https://gamesradar.com/fallout-shelter-info)

**案例深挖和对网球总监的启发**

81. [Kairosoft wiki: Matches (Tennis Club Story)](https://kairosoft.wiki.gg/wiki/Matches_(Tennis_Club_Story))
82. [Kairosoft wiki: Club activities (Tennis Club Story)](https://kairosoft.wiki.gg/wiki/Club_activities_(Tennis_Club_Story))
83. [Bonus Stage: Tennis Club Story review](https://www.bonusstage.co.uk/archives/165079)
84. [Wikipedia: Sid Meier's SimGolf](https://en.wikipedia.org/wiki/Sid_Meier%27s_SimGolf)
85. [GameSpot: SimGolf review](https://www.gamespot.com/reviews/simgolf-review/1900-2843958/)
86. [Motorsport Manager wiki: Headquarters](https://motorsportmanagerpc.fandom.com/wiki/Headquarters)
87. [Your Resort Home: Desert tennis and pickleball](https://yourresorthome.com/the-new-residents-guide-to-desert-tennis-pickleball/)
88. [CoStar: Resorts converting tennis courts to pickleball](https://www.costar.com/article/233516311/pickleballs-popularity-has-resorts-scrambling-to-convert-tennis-courts-seize-revenue-opportunities)
89. [City of Boise: Pickleball courts transitioning back to tennis](https://www.cityofboise.org/news/parks-and-recreation/2025/september/city-of-boise-settles-lawsuit-pickleball-courts-at-two-city-parks-transitioning-back-to-tennis-only/)
90. [Pocket Tactics: Dinosaur Polo Club interview](https://www.pockettactics.com/dinosaur-polo-club/interview)
