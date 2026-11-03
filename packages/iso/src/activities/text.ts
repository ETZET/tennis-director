import type { Rand } from '@td/shared';
import type { Lang } from './types';

/**
 * 活动动画库的文字：场景里的飘字、气泡、横幅、记分牌，以及注册表里的标题、说明、变量名。
 * 每个键一对 [中文, English]；数组表示随机挑一句。{x} 是占位符。
 * 游戏的 i18n 表在 @td/content；这些字只属于画面（ADR 0010），和模拟无关。
 */

type Line = string | readonly string[];

export const ACTIVITY_TEXT: Record<string, readonly [Line, Line]> = {
  /* ---- 注册表 ---- */
  'act.feed.title': ['底线喂球', 'Baseline feeding'],
  'act.feed.desc': [
    '教练在网前喂球，球员正反手轮换击球，偶尔打中标志桶。累了会喘气甚至累倒，酷热时要补水。',
    'The coach feeds from the net; players alternate forehands and backhands and sometimes hit the cones. Tired players pant or collapse; heat means water breaks.',
  ],
  'act.serve.title': ['发球打靶', 'Serve targets'],
  'act.serve.desc': [
    '对角发球，打中球罐会把罐子炸飞。测速牌显示球速；连续两次失误是双误，脾气差的会摔拍。',
    'Cross-court serves at ball-can targets that blow apart on a hit. A radar shows the speed; two faults make a double, and hotheads smash a racket.',
  ],
  'act.sprint.title': ['体能冲刺', 'Conditioning race'],
  'act.sprint.desc': [
    '三人同时跑绳梯、绕桩、冲刺。有速度线和冲线庆祝；疲劳高会被绳梯绊倒、冲线后直接躺平。',
    'Three players race through ladders, cones and a sprint. Speed lines and finish-line celebrations; tired runners trip and flop at the line.',
  ],
  'act.tryout.title': ['选拔试训', 'Tryouts'],
  'act.tryout.desc': [
    '报名的孩子排队上场，每人打两球，评委举牌打分。偶尔出现天才，全场起立；教练水平低时评委会打瞌睡、看走眼。',
    'Applicants line up and hit two balls each while judges raise score cards. Now and then a prodigy brings everyone to their feet; weak coaches doze off and miss them.',
  ],
  'act.fair.title': ['社团招新会', 'Club fair'],
  'act.fair.desc': [
    '几个摊位抢学生。网球摊的花式表演成功会吸引围观、报名；失手会被球砸头，大家哈哈大笑。',
    'Booths compete for students. A good trick shot at the tennis booth draws a crowd and sign-ups; a miss bonks the performer and everyone laughs.',
  ],
  'act.openday.title': ['开放日体验课', 'Open day'],
  'act.openday.desc': [
    '家长带小朋友来试打红球。打中了家长拍照，空拍会转圈晕倒，偶尔把球打到家长头上。开心的家庭会去报名。',
    'Parents bring kids to try red-ball tennis. Hits get photos, whiffs spin them dizzy, and sometimes a parent takes one to the head. Happy families sign up.',
  ],
  'act.match.title': ['正式比赛', 'Official match'],
  'act.match.desc': [
    '抢七决胜：发球、多拍、ACE、双误、飞扑救球。赢了躺地庆祝、领奖、媒体闪光灯；输了毛巾盖头。级别越高，观众越多、场面越大。',
    'A tiebreak: serves, long rallies, aces, double faults and diving gets. Winners collapse, lift a trophy and face the flashbulbs; losers hide under towels. Bigger events, bigger crowds.',
  ],
  'act.pickleball.title': ['匹克球对打', 'Pickleball rally'],
  'act.pickleball.desc': [
    '隔壁的匹克球：网前轻吊来来回回，偶尔抽杀，"啪嗒"声很响；一分打完击掌、报三个数的比分。',
    'Next door’s pickleball: soft dinks at the kitchen line, the odd drive, a loud pock on every hit; high fives and a three-number score call after each point.',
  ],
  'act.bbq.title': ['烧烤野餐', 'Team BBQ'],
  'act.bbq.desc': [
    '教练掌勺翻肉饼，球员吃饭聊天、扔飞盘。手艺差会烤糊、被熏黑脸；下雨躲进帐篷，大热天改打水球。',
    'The coach flips patties while players eat, chat and throw a frisbee. Bad cooks burn them and get a sooty face; rain sends everyone under the tent, heat turns it into a water-balloon fight.',
  ],
  'act.tug.title': ['拔河大赛', 'Tug of war'],
  'act.tug.desc': [
    '四对四。教练喊"一、二!"带节奏发力；输的一方被拽倒摔成一堆，赢的一方仰面摔倒后跳起庆祝。',
    'Four against four. The coach calls the heaves; the losing side gets dragged into a heap, the winners fall on their backs and bounce up cheering.',
  ],
  'act.cleanup.title': ['劳动日', 'Work day'],
  'act.cleanup.desc': [
    '荒掉的场地上散着断枝、杂草和垃圾，大家捡起来抱到垃圾箱；清干净了一起欢呼。也可以请外包施工队。',
    'Branches, weeds and junk litter an abandoned court; volunteers haul it all to the skip and cheer when it is clear. Or hire a contractor crew.',
  ],
  'tag.fatigue': ['疲劳', 'Fatigue'],
  'tag.weather': ['天气', 'Weather'],
  'tag.coach': ['教练', 'Coach'],
  'tag.players': ['球员人数', 'Players'],
  'tag.applicants': ['报名人数', 'Applicants'],
  'tag.budget': ['预算', 'Budget'],
  'tag.families': ['家庭数', 'Families'],
  'tag.tier': ['赛事级别', 'Event tier'],
  'tag.strength': ['实力对比', 'Strength'],
  'tag.format': ['单打/双打', 'Format'],
  'tag.crew': ['施工队', 'Crew'],
  'param.players': ['球员人数', 'Players'],
  'param.applicants': ['报名人数', 'Applicants'],
  'param.fairBudget': ['招新预算', 'Fair budget'],
  'param.budget': ['预算', 'Budget'],
  'param.families': ['家庭数', 'Families'],
  'param.tier': ['赛事级别', 'Event tier'],
  'param.strength': ['我方实力对比', 'Our strength'],
  'param.format': ['赛制', 'Format'],
  'param.finale': ['终局', 'Finale'],
  'param.pbPlayers': ['人数', 'Players'],
  'param.result': ['结果', 'Result'],
  'param.crew': ['谁来干', 'Who works'],
  'param.helpers': ['人数', 'Helpers'],
  'val.people': ['{v} 人', '{v}'],
  'val.families': ['{v} 家', '{v}'],
  'val.strength': [
    ['明显更弱', '略弱', '势均力敌', '略强', '明显更强'],
    ['Much weaker', 'Weaker', 'Even', 'Stronger', 'Much stronger'],
  ],
  'opt.low': ['低', 'Low'],
  'opt.mid': ['中', 'Mid'],
  'opt.high': ['高', 'High'],
  'opt.school': ['校内', 'School'],
  'opt.region': ['地区', 'Region'],
  'opt.state': ['州级', 'State'],
  'opt.nation': ['全国', 'National'],
  'opt.singles': ['单打', 'Singles'],
  'opt.doubles': ['双打', 'Doubles'],
  'opt.finaleShow': ['演胜负', 'Show result'],
  'opt.finaleNone': ['不演胜负', 'No result'],
  'opt.auto': ['随机', 'Auto'],
  'opt.win': ['赢', 'Win'],
  'opt.lose': ['输', 'Lose'],
  'opt.volunteers': ['义工', 'Volunteers'],
  'opt.pros': ['外包施工队', 'Contractor'],

  /* ---- 通用 ---- */
  ready: ['预备——', 'Ready…'],
  whistle: ['哔!', 'TWEET!'],
  net: ['下网', 'Net'],
  out: ['出界!', 'Out!'],
  ace: ['ACE!', 'ACE!'],
  hitTarget: ['命中!', 'Hit!'],
  winner: [
    ['制胜分!', '漂亮!', '穿越!'],
    ['Winner!', 'Beauty!', 'Passing shot!'],
  ],
  volleyWinner: ['截击得分!', 'Volley winner!'],
  doubleFault: ['双误!', 'Double fault!'],
  fault: ['失误', 'Fault'],
  dive: ['飞扑!', 'Dive!'],
  slip: ['滑倒!', 'Slipped!'],
  oops: ['哎呀!', 'Whoa!'],
  huff: ['呼…呼…', 'Huff… huff…'],
  collapse: ['累趴了…', 'Wiped out…'],
  hot: ['好热…', 'So hot…'],
  cool: ['凉快!', 'Ahh, cool!'],
  myCap: ['我的帽子!', 'My cap!'],
  gotIt: ['抓到了!', 'Got it!'],
  coachWater: ['喝点水!', 'Drink some water!'],
  coachWaterSoft: ['慢慢来，喝点水', 'Easy now, have some water'],
  coachYell1: ['起来! 别偷懒!', 'Get up! No slacking!'],
  coachYell2: ['快起来…', 'Up you get…'],
  badBounce: ['坏弹跳!', 'Bad bounce!'],
  crowBall: ['乌鸦叼走了球!', 'A crow took the ball!'],
  crowPatty: ['乌鸦偷走了肉饼!', 'A crow stole a patty!'],
  crowShout: [
    ['喂! 还给我!', '可恶的乌鸦!'],
    ['Hey! Give it back!', 'Stupid crow!'],
  ],
  pickleSound: [
    ['啪嗒!', '啪!', '嗒嗒!'],
    ['POCK!', 'PAK!', 'POK-POK!'],
  ],
  noisy: ['吵死了…', 'So noisy…'],
  bell: ['叮铃铃——', 'RIIING—'],
  passMaple: [
    ['加油!', '好帅!', '比赛加油!'],
    ['Go Ravens!', 'Looking good!', 'Good luck!'],
  ],
  passPickle: [
    ['来打匹克球吧~', '网球？还有人打啊？'],
    ['Come play pickleball~', 'Tennis? People still play that?'],
  ],
  passOld: [
    ['这地方还开着?', '当年这里可热闹了…'],
    ['This place is still open?', 'It used to be packed back in the day…'],
  ],
  vs: ['VS {opp}', 'VS {opp}'],
  victory: ['胜利!', 'Victory!'],
  defeat: ['失利…', 'Defeat…'],
  haha: ['哈哈', 'Haha'],
  hahaha: ['哈哈哈', 'Hahaha'],
  bonk: ['咚!', 'BONK!'],
  signUp: ['报名!', 'Signed up!'],
  awesome: ['太棒了!', 'Awesome!'],

  /* ---- 喂球 ---- */
  feedNet: ['喂下网了…', 'Fed it into the net…'],
  cantReach: ['够不到!', 'Can’t reach!'],
  praise: [
    ['好球!', '漂亮!', '就这样!', '转肩到位!'],
    ['Good ball!', 'Lovely!', 'That’s it!', 'Nice shoulder turn!'],
  ],
  progress: ['进步!', 'Improving!'],
  notBad: ['不错', 'Not bad'],

  /* ---- 发球 ---- */
  demo: ['看我示范!', 'Watch me!'],
  smashSfx: ['啪!', 'CRACK!'],

  /* ---- 冲刺 ---- */
  lateStart1: ['…啊？开始了？', '…huh? Are we starting?'],
  lateStart2: ['等一下…', 'Hang on…'],
  trip: ['绊倒!', 'Tripped!'],
  tripTyre: ['被轮胎绊倒!', 'Tripped on a tyre!'],
  first: ['第一!', 'First!'],
  record: ['新纪录!', 'New record!'],
  seconds: ['{s} 秒', '{s} s'],
  whatTime: ['多少秒来着?', 'What was the time again?'],
  wiped: ['累瘫…', 'Done for…'],
  goGo: [
    ['加油!', '冲!', '再快点!'],
    ['Go!', 'Push!', 'Faster!'],
  ],

  /* ---- 选拔 ---- */
  'tryoutBanner.generic': ['选拔试训 · TRYOUTS', 'TRYOUTS TODAY'],
  'tryoutBanner.maple': ['枫岭网球校队选拔', 'MAPLE RIDGE TENNIS TRYOUTS'],
  'tryoutBanner.hollow': ['免费试训 欢迎来打!', 'FREE TRYOUT · ALL WELCOME'],
  accepted: ['录取', 'IN'],
  whiff: ['空拍!', 'Whiff!'],
  goodShot: ['好球!', 'Good shot!'],
  whoosh: ['嗖!!', 'WHOOSH!!'],
  prodigy: ['天才!!', 'A prodigy!!'],
  missedIt: ['看走眼了…', 'They missed it…'],
  admitted: ['录取!', 'You’re in!'],
  rejected: ['落选…', 'Not this time…'],

  /* ---- 招新会 ---- */
  'booth.basketball': ['篮球社', 'Basketball'],
  'booth.soccer': ['足球社', 'Soccer'],
  'booth.tennis': ['网球社', 'Tennis club'],
  'booth.basketballTeam': ['篮球队', 'Basketball'],
  'booth.tennisTeam': ['网球队', 'Tennis team'],
  'booth.cheer': ['啦啦队', 'Cheer squad'],
  'booth.pickleball': ['匹克球俱乐部', 'Pickleball Club'],
  'booth.tennisClub': ['网球俱乐部', 'Tennis club'],
  'booth.yoga': ['社区瑜伽', 'Community yoga'],
  'booth.handSign': ['网球 求人!!', 'TENNIS?? PLS'],
  fairArch: ['欢迎加入{club}!', 'Join {club}!'],
  trickName: [
    ['胯下击球!', '背后接球!', '高抛停球!'],
    ['Tweener!', 'Behind the back!', 'Sky-high catch!'],
  ],
  wow: ['哇!', 'Whoa!'],
  flyers: ['传单!', 'The flyers!'],

  /* ---- 开放日 ---- */
  'opendaySign.generic': ['体验课报名', 'Try tennis · sign up'],
  'opendaySign.maple': ['家长开放日 · 报名', 'Family open day'],
  'opendaySign.hollow': ['免费体验 社区日', 'Free community day'],
  yay: ['耶!', 'Yay!'],
  click: ['咔嚓', 'Click'],
  great: ['太棒了!', 'Great job!'],
  missed: ['空了!', 'Missed!'],
  tryAgain: ['再来', 'Again'],
  tryAgainKind: ['没关系，再来!', 'No worries, again!'],
  waah: ['哇——', 'WAAAH—'],
  wantToLearn: ['想学!', 'I want to learn!'],
  maybeLater: ['再看看吧', 'We’ll think about it'],
  poachPitch: ['来打匹克球吧! 不用学!', 'Try pickleball! No lessons needed!'],
  poachYes: ['那…去看看?', 'Well… why not?'],
  poachLost: ['又被抢走一家…', 'Lost another family…'],
  poachNo: ['不了，谢谢', 'No thanks'],

  /* ---- 比赛 ---- */
  'oppName.generic': ['红队', 'Red Team'],
  'oppName.maple': ['西溪高中', 'Westbrook High'],
  'oppName.hollow': ['松冠俱乐部', 'Pinecrest Club'],
  'home.generic': ['HOME', 'HOME'],
  'home.maple': ['RAVENS', 'RAVENS'],
  'home.hollow': ['HOLLOW', 'HOLLOW'],
  'away.generic': ['AWAY', 'AWAY'],
  'away.maple': ['WESTBROOK', 'WESTBROOK'],
  'away.hollow': ['PINECREST', 'PINECREST'],
  'boards.generic': [
    ['网球联赛', 'ACE', '冠军之路', '青训计划'],
    ['TENNIS LEAGUE', 'ACE', 'ROAD TO GLORY', 'JUNIOR PROGRAM'],
  ],
  'boards.maple': [
    ['GO RAVENS', '枫岭高中', '校友会', 'RAVENS'],
    ['GO RAVENS', 'MAPLE RIDGE HS', 'ALUMNI', 'RAVENS'],
  ],
  'boards.hollow': [
    ['招租', '匹克球 $8/小时', 'HOLLOW CREEK', '欢迎赞助'],
    ['FOR LEASE', 'PICKLEBALL $8/HR', 'HOLLOW CREEK', 'SPONSOR US'],
  ],
  'fanShout.generic.0': ['好球!', 'Great shot!'],
  'fanShout.generic.1': ['漂亮!', 'Lovely!'],
  'fanShout.maple.0': ['Go Ravens!', 'Go Ravens!'],
  'fanShout.maple.1': ['Westbrook!', 'Westbrook!'],
  'fanShout.hollow.0': ['加油…?', 'Go… us?'],
  'fanShout.hollow.1': ['Pinecrest!', 'Pinecrest!'],
  'headline.generic.1': ['校内小有名气!', 'Talk of the school!'],
  'headline.generic.2': ['上了地区新闻!', 'Local news!'],
  'headline.generic.3': ['州报头条!', 'State front page!'],
  'headline.generic.4': ['全国热搜!', 'Trending nationwide!'],
  'headline.maple.1': ['全校都在讨论!', 'The whole school is talking!'],
  'headline.maple.2': ['上了校报头版!', 'School paper front page!'],
  'headline.maple.3': ['州报头条!', 'State front page!'],
  'headline.maple.4': ['全国热搜!', 'Trending nationwide!'],
  'headline.hollow.1': ['社区群里刷屏了!', 'All over the neighborhood chat!'],
  'headline.hollow.2': ['社区报登了一小块', 'A small piece in the community paper'],
  'headline.hollow.3': ['州报角落里提了一句', 'A line in the state paper'],
  'headline.hollow.4': ['全国热搜?!', 'Trending nationwide?!'],
  matchPoint: ['赛点!', 'Match point!'],
  oppMatchPoint: ['对手赛点!', 'Their match point!'],
  firstFault: ['一发失误', 'First serve fault'],
  longRally: ['多拍相持!', 'Long rally!'],
  nice: ['漂亮!', 'Beauty!'],
  good: ['好!', 'Yes!'],
  rainDelay: ['雨暂停', 'Rain delay'],
  changeEnds: ['换边休息', 'Change of ends'],
  champion: ['冠军!', 'Champion!'],
  nextTime: ['下次再来…', 'Next time…'],
  nextSet: ['下一盘', 'Next set'],

  /* ---- 匹克球 ---- */
  kitchen: ['踩厨房了!', 'Kitchen!'],
  goodGame: ['好球，再来一局', 'Good game, again!'],

  /* ---- 烧烤 ---- */
  bbqBanner: ['RAVENS 团建日', 'RAVENS TEAM DAY'],
  myPatty: ['我的肉饼!', 'My patty!'],
  burnt: ['烧焦了!', 'Burnt!'],
  perfect: ['完美!', 'Perfect!'],
  foodsUp: ['开饭啦!', 'Food’s up!'],
  stuckInTree: ['卡树上了!', 'Stuck in the tree!'],
  splashed: ['哇! 凉!', 'Ack! Cold!'],
  missedMe: ['没打中~', 'Missed me~'],
  tag: [
    ['抓到你了!', '追不上~'],
    ['Tag!', 'Can’t catch me~'],
  ],
  chat: [
    ['哈哈', '笑死', '真的假的', '再来一个!'],
    ['Haha', 'LOL', 'No way!', 'Another one!'],
  ],
  platesFly: ['盘子飞了!', 'The plates!'],

  /* ---- 拔河 ---- */
  'tugOpp.generic': ['红队', 'Red Team'],
  'tugOpp.maple': ['老师队', 'the Teachers'],
  'tugOpp.hollow': ['匹克球俱乐部', 'the Pickleball Club'],
  'tugLost.generic': ['输了…', 'Lost…'],
  'tugLost.maple': ['输给了老师…', 'Beaten by the teachers…'],
  'tugLost.hollow': ['输给了匹克球…', 'Lost to pickleball…'],
  heave1: ['一!', 'One!'],
  heave2: ['二!', 'Two!'],
  weakChant: [
    ['加…加油?', '用力啊!', '那个…拉!'],
    ['Go… team?', 'Pull harder!', 'Um… pull!'],
  ],
  mudMouth: [
    ['呸呸!', '全是泥…'],
    ['Pfft! Pfft!', 'Mud everywhere…'],
  ],

  /* ---- 劳动日 ---- */
  heavy: ['好沉…', 'Heavy…'],
  blownBack: ['又吹回来了!', 'It blew back!'],
  allClean: ['干净了!', 'All clear!'],
  prosLine: [
    ['这边搞定', '下一车', '按工时算的啊'],
    ['This bit’s done', 'Next load', 'That’s billable'],
  ],
  bossCheer: [
    ['那边还有!', '干得好!', '加把劲!'],
    ['More over there!', 'Great work!', 'Keep it up!'],
  ],
  bossMeh: [
    ['随便弄弄吧…', '差不多就行'],
    ['Eh, good enough…', 'That’ll do'],
  ],
};

/** 按语言取一句；数组随机挑一句（用传入的随机流）。没有的键原样返回。 */
export function textFor(
  lang: Lang,
  key: string,
  rand: Rand = Math.random,
  vars?: Record<string, string | number>,
): string {
  const e = ACTIVITY_TEXT[key];
  let s: string;
  if (!e) s = key;
  else {
    const v = e[lang === 'zh' ? 0 : 1];
    s = typeof v === 'string' ? v : (v[Math.floor(rand() * v.length)] ?? key);
  }
  if (vars) for (const [k, x] of Object.entries(vars)) s = s.replace(`{${k}}`, String(x));
  return s;
}

/** 取一个数组里的第 i 句（例如实力对比的五档） */
export function textAt(lang: Lang, key: string, i: number): string {
  const e = ACTIVITY_TEXT[key];
  if (!e) return key;
  const v = e[lang === 'zh' ? 0 : 1];
  return typeof v === 'string' ? v : (v[i] ?? key);
}
