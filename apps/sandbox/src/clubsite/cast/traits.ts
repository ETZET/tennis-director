// 特质：每个人 1–3 个。特质是"性子"，决定他做什么、怎么回应总监（设计文档「性子」）。
// 每条都要在行为或互动里看得见（act() 读 effect，"在想什么"读 lines）；不做只改一个数的特质。
// 纯数据。新加特质加在这里（id 不改名，存档和演员表引用它）。
import type { ActionId, Activity } from './types';

export interface Trait {
  id: string;
  /** 名册上的小标签（≤ 4 字） */
  name: string;
  /** 一句说明（名册里点开） */
  note: string;
  /** 不太好的特质（标签变红） */
  bad?: boolean;
  /** 互动的倍率：这个动作的好感变化 × k（负数 = 反感） */
  likes?: Partial<Record<ActionId, number>>;
  /** 这些处境下被打扰会烦（聊天、请客 → 好感 −） */
  busyWhen?: Activity[];
  /** 想事情时的台词（"在想什么"），按处境；没有就用默认 */
  lines?: Partial<Record<Activity | 'greet', string[]>>;
}

const T = (t: Trait) => t;

export const TRAITS: Record<string, Trait> = {
  chatty: T({
    id: 'chatty',
    name: '话多',
    note: '谁路过都能聊上十分钟。聊天好感加倍，但一聊就停不下来（多花时间）。',
    likes: { chat: 2, ask: 1.5 },
    lines: { rest: ['今天谁来了？'], greet: ['哎，总监！正好跟你说'] },
  }),
  shy: T({
    id: 'shy',
    name: '腼腆',
    note: '不主动说话。头几次聊天好感涨得慢，熟了以后最忠心。',
    likes: { chat: 0.5, message: 1.5 },
    lines: { greet: ['……你好'] },
  }),
  focused: T({
    id: 'focused',
    name: '专注',
    note: '打球、干活的时候别打扰他：这时聊天、请客反而扣好感。',
    busyWhen: ['play', 'work', 'gym'],
    lines: { play: ['再来一个。'], work: ['这块还没弄完。'] },
  }),
  competitive: T({
    id: 'competitive',
    name: '好胜',
    note: '约他打一局他一定来，赢了高兴、输了不服。和水平差不多的人打好感最高。',
    likes: { rally: 2 },
    lines: { play: ['这球必须拿下', '再来，刚才不算'] },
  }),
  generous: T({
    id: 'generous',
    name: '大方',
    note: '常请别人喝东西；你请他，他下次一定请回来（请客好感高，花钱的人多）。',
    likes: { treat: 1.5 },
  }),
  frugal: T({
    id: 'frugal',
    name: '节俭',
    note: '不点贵的。被请客会不好意思（请客好感减半），送实用的东西最好。',
    likes: { treat: 0.5, gift: 1.5 },
  }),
  oldguard: T({
    id: 'oldguard',
    name: '老派',
    note: '记得俱乐部关门前的样子。听他讲以前（听听意见）好感高；改动多了他会皱眉。',
    likes: { ask: 2 },
    lines: { rest: ['以前这里不是这样的', '九几年那会儿……'] },
  }),
  gossip: T({
    id: 'gossip',
    name: '消息灵通',
    note: '谁和谁怎么了他都知道。听听意见会告诉你别人的事（名册里多出牵连）。',
    likes: { ask: 1.5, chat: 1.2 },
    lines: { rest: ['你听说了吗……'], watch: ['那俩又在一起打球'] },
  }),
  grumpy: T({
    id: 'grumpy',
    name: '爱抱怨',
    note: '什么都能挑出毛病。好感涨得慢，但他说的毛病多半是真的。',
    bad: true,
    likes: { chat: 0.6, treat: 0.8, ask: 1.5 },
    lines: { rest: ['这长椅还是晒得烫'], wait: ['怎么还没好'], greet: ['哼'] },
  }),
  cheerful: T({
    id: 'cheerful',
    name: '乐天',
    note: '心情掉得慢，谁跟他说话他都高兴。',
    likes: { chat: 1.3 },
    lines: { walk: ['今天天气真好'], play: ['好球！'] },
  }),
  impatient: T({
    id: 'impatient',
    name: '急性子',
    note: '等不了：排队、等场的时候跟他说话会被白一眼。',
    bad: true,
    busyWhen: ['wait'],
    lines: { wait: ['到底还要多久', '我约的是十点'] },
  }),
  earlybird: T({
    id: 'earlybird',
    name: '早起',
    note: '开门就到，下午犯困。上午聊天好感高。',
    lines: { rest: ['我五点就醒了'] },
  }),
  nightowl: T({
    id: 'nightowl',
    name: '夜猫子',
    note: '傍晚以后才来劲。',
    lines: { rest: ['晚上才是我的时间'] },
  }),
  perfectionist: T({
    id: 'perfectionist',
    name: '完美主义',
    note: '活干得细，看不得一点马虎。听听意见他会指出设施的毛病。',
    likes: { ask: 1.5 },
    busyWhen: ['work'],
    lines: { work: ['差一毫米也不行'], walk: ['这条线画歪了'] },
  }),
  mentor: T({
    id: 'mentor',
    name: '爱带人',
    note: '看到孩子、新手忍不住上去教。和孩子、学员有牵连。',
    likes: { ask: 1.3, rally: 1.3 },
    lines: { watch: ['手腕再放松一点'] },
  }),
  sporty: T({
    id: 'sporty',
    name: '运动狂',
    note: '一天不动就难受。约他打一局、健身都好；请他吃甜的他不领情。',
    likes: { rally: 1.5, treat: 0.6 },
    lines: { gym: ['再来一组'], rest: ['歇够了，走'] },
  }),
  foodie: T({
    id: 'foodie',
    name: '吃货',
    note: '美食广场的常客，请他吃东西好感翻倍。',
    likes: { treat: 2 },
    lines: { eat: ['这个塔可是今天最好的', '下次试试那家'], walk: ['饿了'] },
  }),
  local: T({
    id: 'local',
    name: '本地人',
    note: '谷地长大，认识半个镇。忠诚高，会带朋友来。',
    lines: { greet: ['又见面了'] },
  }),
  snowbird: T({
    id: 'snowbird',
    name: '候鸟',
    note: '每年秋天从北方飞来过冬，春天风季一到就走。',
    lines: { rest: ['明尼苏达现在零下二十度'] },
  }),
  vip: T({
    id: 'vip',
    name: '讲排场',
    note: '花钱大方，但要被当回事：送礼物、请客好感高，随口聊天他嫌你敷衍。',
    likes: { gift: 1.8, treat: 1.3, chat: 0.6, message: 0.4 },
  }),
  tired: T({
    id: 'tired',
    name: '心累了',
    note: '干了太多年，提不起劲。别人一句真心话比什么都管用（聊天好感高，送礼没用）。',
    bad: true,
    likes: { chat: 1.6, gift: 0.5 },
    lines: { rest: ['……'], work: ['又是这个'] },
  }),
  oldinjury: T({
    id: 'oldinjury',
    name: '老伤',
    note: '膝盖 / 肩膀不好。约他打一局他会推掉（打一局好感 −），坐着聊最舒服。',
    bad: true,
    likes: { rally: -0.5, chat: 1.3 },
    lines: { walk: ['膝盖又疼了'] },
  }),
  hardworking: T({
    id: 'hardworking',
    name: '干劲足',
    note: '永远在找事做，干活时被夸一句（聊天）心情大涨。',
    likes: { chat: 1.2 },
    lines: { work: ['马上好！'], rest: ['我能歇会儿吗……算了'] },
  }),
  curious: T({
    id: 'curious',
    name: '好奇',
    note: '第一次来，什么都想问。听听意见他反过来问你（好感高）。',
    likes: { ask: 1.6, chat: 1.2 },
    lines: { walk: ['那边是什么？'], watch: ['这个怎么计分？'] },
  }),
  kidplayful: T({
    id: 'kidplayful',
    name: '贪玩',
    note: '孩子：坐不住，送个球比什么都开心。',
    likes: { gift: 2, chat: 0.8, treat: 1.5 },
    lines: { walk: ['我能去喷泉那边吗'], idle: ['好无聊'] },
  }),
  star: T({
    id: 'star',
    name: '明星',
    note: '名字能卖票。走到哪都有人看；跟他打一局是件大事。',
    likes: { rally: 1.5, chat: 0.8 },
    lines: { walk: ['（假装没看见有人拍照）'] },
  }),
};

export const traitOf = (id: string): Trait | undefined => TRAITS[id];
export const TRAIT_IDS = Object.keys(TRAITS);
