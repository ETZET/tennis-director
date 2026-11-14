// 演员表（cast）的数据契约：俱乐部里每一个人是谁、长什么样、有什么属性、和谁有牵连、什么时候在哪儿。
// 设计：docs/design/people.md（人物：3D 俱乐部里的人）。
//
// 这一层是纯数据 + 纯函数：不碰 three、DOM、Math.random（种子哈希），可序列化 —— 以后重写模拟（M-B）时整个搬进 packages/sim。
// 画面那边：clubsite/people/dress.ts 按 CastLook 给已经建好的 Q 版人换装；clubwalk/cast/ 把场景里的人对上演员表、名册、互动。
//
// 三层人（设计文档「三层人」）：
//   named   有名有姓、手写故事的人（named.ts）：员工、老会员、常客、他们的家人
//   regular 有名字、有属性、按模板生成的熟面孔（crowd.ts 生成，固定种子，名字和样子每局一样）
//   crowd   路人（今天来的客人、一次性的访客）：同样生成，属性齐全，只是没有故事
// 每一个在场景里出现的人都有一份 CastPerson —— 点到谁都能看到他是谁。

/** 场景（= clubwalk 的区域 id） */
export type SceneId =
  | 'clubpark'
  | 'clubdesk'
  | 'clubpickle'
  | 'clubplaza'
  | 'clubstadium'
  | 'clubcourts'
  | 'clubclay'
  | 'clubhouse'
  | 'clubpool'
  | 'clubgolf'
  | 'clubfood';

export const SCENES: readonly SceneId[] = [
  'clubpark',
  'clubdesk',
  'clubpickle',
  'clubplaza',
  'clubstadium',
  'clubcourts',
  'clubclay',
  'clubhouse',
  'clubpool',
  'clubgolf',
  'clubfood',
];

/** 场景的中文名（名册里"在哪儿"） */
export const SCENE_NAME: Record<SceneId, string> = {
  clubpark: '停车场',
  clubdesk: '前台',
  clubpickle: '匹克球场',
  clubplaza: '棕榈喷泉广场',
  clubstadium: '中心球场',
  clubcourts: '会员场',
  clubclay: '红土场',
  clubhouse: '会所',
  clubpool: '泳池',
  clubgolf: '高尔夫',
  clubfood: '美食广场',
};

/** 场景里那个人是用哪种 Q 版人建的（clubsite/people 的 userData.personKind） */
export type PersonKind = 'player' | 'coach' | 'director' | 'kid' | 'ball-kid' | 'umpire';

export type Tier = 'named' | 'regular' | 'crowd';

/** 在俱乐部里是什么人 */
export type Role =
  | 'member' // 会员（打球的大人）
  | 'guest' // 客人（非会员：来吃饭、来看球、度假客、第一次来）
  | 'kid' // 孩子（学员、会员的孩子）
  | 'parent' // 带孩子来的家长
  | 'coach' // 教练（网球、匹克球、健身、游泳）
  | 'staff' // 员工（前台、场地、泳池救生员、代客泊车、球童、裁判……）
  | 'vendor' // 摊主、咖啡师、厨师、酒保（美食广场、饮料车、咖啡吧）
  | 'pro'; // 职业 / 前职业球员（表演、训练）

/** 体型 */
export type Body = 'adult' | 'teen' | 'kid';

// ── 外观 ──────────────────────────────────────────────────────────────────────────

/** 肤色（6 档；dress.ts 的色阶） */
export type SkinTone = 'pale' | 'light' | 'tan' | 'olive' | 'brown' | 'deep';
/** 发色 */
export type HairColor = 'black' | 'darkBrown' | 'brown' | 'auburn' | 'red' | 'blonde' | 'gray' | 'white';
/**
 * 发型：rig 原有 short / ponytail / cap（cap = 棒球帽盖住头发，帽子颜色在 hat）。
 * 新加（dress.ts 画）：bun 头顶发髻 · long 披肩长发 · bob 齐耳短发 · bald 光头（只剩两侧一圈）· curly 蓬松卷发 · buzz 寸头 · braids 两条辫子
 */
export type HairStyle = 'short' | 'ponytail' | 'bun' | 'long' | 'bob' | 'bald' | 'curly' | 'buzz' | 'braids';
/** 衣服的颜色（dress.ts 的色阶表 CLOTH；名字就是颜色） */
export type Cloth =
  | 'white'
  | 'cream'
  | 'khaki'
  | 'tan'
  | 'brown'
  | 'red'
  | 'coral'
  | 'pink'
  | 'orange'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'teal'
  | 'sky'
  | 'blue'
  | 'navy'
  | 'purple'
  | 'lavender'
  | 'gray'
  | 'charcoal'
  | 'black';

export interface Hat {
  /** cap 棒球帽 · visor 遮阳帽檐（露头顶）· bucket 渔夫帽 · straw 宽檐草帽 · headband 头带 */
  kind: 'cap' | 'visor' | 'bucket' | 'straw' | 'headband';
  color: Cloth;
}

export interface CastLook {
  body: Body;
  /** 大人的身高系数（0.92..1.08，默认 1）；孩子、少年按 KID / TEEN 比例，不用这个 */
  height?: number;
  /** 发福（躯干横向，0.92..1.3，默认 1） */
  stout?: number;
  skin: SkinTone;
  hair: HairColor;
  hairStyle: HairStyle;
  hat?: Hat;
  shirt: Cloth;
  /** 长袖（前臂也是衣服色） */
  longSleeves?: boolean;
  /** 领口、袖口滚边（Polo、制服） */
  trim?: Cloth;
  bottom: Cloth;
  bottomKind: 'shorts' | 'skirt' | 'pants';
  shoes: Cloth;
  eyes?: 'shades' | 'glasses';
  facial?: 'mustache' | 'beard';
  /**
   * 制服：这些部位保留场景原来的样子（球童的蓝 Polo + 白帽、裁判、教练的哨子……），只换脸、发、肤色等其余部位。
   * 不给 = 全换。
   */
  keep?: ('shirt' | 'bottom' | 'shoes' | 'hat' | 'trim' | 'whistle')[];
  /** 招牌色：名册里这一行、肖像底色、名字小牌（不给 = shirt） */
  accent?: Cloth;
}

// ── 属性 ──────────────────────────────────────────────────────────────────────────

/** 数值属性，0..100（网球水平另有 NTRP） */
export interface Attrs {
  /** 网球水平 NTRP 1.0..7.0（0.5 一档；职业 ≥ 6.5；不打球的人 1.0） */
  ntrp: number;
  /** 体能 */
  fitness: number;
  /** 外向（爱聊天、主动打招呼） */
  social: number;
  /** 耐心（等多久才走、被打扰时的脾气） */
  patience: number;
  /** 消费力（会不会点贵的、买东西、请客） */
  spend: number;
  /** 对俱乐部的忠诚 */
  loyalty: number;
}

export const ATTR_NAMES: Record<Exclude<keyof Attrs, 'ntrp'>, string> = {
  fitness: '体能',
  social: '外向',
  patience: '耐心',
  spend: '消费',
  loyalty: '忠诚',
};

/** 会籍 */
export interface Membership {
  /** founder 创始会员（关门前就是）· annual 年卡 · monthly 月卡 · family 家庭卡 · junior 青少年 · day 次卡/今天的客人 · none 不是会员（员工、摊主） */
  kind: 'founder' | 'annual' | 'monthly' | 'family' | 'junior' | 'day' | 'none';
  /** 哪年入会（none / day 不填） */
  since?: number;
}

export const MEMBERSHIP_NAME: Record<Membership['kind'], string> = {
  founder: '创始会员',
  annual: '年卡会员',
  monthly: '月卡会员',
  family: '家庭会员',
  junior: '青少年会员',
  day: '今日客人',
  none: '非会员',
};

/** 特质 id（traits.ts 的表：名字、说明、在行为和互动里的作用） */
export type TraitId = string;

/** 牵连的种类 */
export type TieKind =
  | 'family' // 家人（夫妻、父母子女、兄弟姐妹）
  | 'partner' // 双打搭档、老球友
  | 'friend'
  | 'mentor' // 甲带过 / 在带乙
  | 'rival' // 较劲、互相看不上（摩擦）
  | 'crush' // 暗恋 / 好感（只写成年人之间）
  | 'colleague' // 同事
  | 'history'; // 一段旧事（一起锁的门、九十年代的同事）

export interface Tie {
  /** 对方的 id */
  with: string;
  kind: TieKind;
  /** 一句话（名册里显示）："九十年代的同事" */
  note: string;
}

/** 正在干什么（按场景里的姿势推断，clubwalk/cast 给出；"在想什么"按它挑台词） */
export type Activity =
  | 'play' // 打球（ready、forehand、serve、dink……）
  | 'watch' // 看球（看台、场边坐着鼓掌）
  | 'rest' // 坐着歇
  | 'eat' // 吃、喝（sip、拿杯子）
  | 'walk' // 走路
  | 'work' // 干活（扫、吹、捞、浇、推、收银、做饭）
  | 'gym' // 健身
  | 'swim' // 游泳、泡池边
  | 'wait' // 排队、站着等
  | 'idle';

/**
 * 每周来访（常客、员工的班）：哪几天、几点到几点、在哪几个场景。
 * days 0 = 周一 … 6 = 周日。不给 week = 每天都在（员工、摊主）。
 */
export interface Week {
  days: number[];
  hours: [number, number];
}

/**
 * 演员表：这个人在场景里由哪个"人"来演。
 * slot = 场景里那个人的名字（'slot:<id>' 去掉前缀）或者演出临时建的人 '#<n>'（区域里第 n 个没有槽位名的人，按建的顺序）。
 * days 不给 = 每天都是他；给了 = 只有这几天是他（别的日子那个位置是别人：人群）。
 */
export interface Home {
  scene: SceneId;
  slot: string;
  days?: number[];
}

export interface CastPerson {
  id: string;
  tier: Tier;
  role: Role;
  /** 在俱乐部里的身份（一个短词）："老会员""前台""红土场维护""饮料车摊主" */
  title: string;
  /** 名字（英文名，画面里的名字小牌用它）："Rosa Ortiz" */
  name: string;
  /** 中文叫法（名册里放在名字下面）："罗莎" */
  nameZh: string;
  age: number;
  /** 哪儿人 */
  from: string;
  /** 在外面是做什么的（员工 = 以前做什么） */
  job: string;
  member: Membership;
  attrs: Attrs;
  traits: TraitId[];
  likes: string[];
  dislikes: string[];
  /** 故事（2–5 句；named 才长） */
  bio: string;
  /** 一个看得见的小习惯（"打完每一分都要把拍线拨正"） */
  quirk?: string;
  /** 按处境的台词（≤ 16 字一句；点人、走近时冒的气泡）。不给的处境用 traits / role 的默认 */
  lines?: Partial<Record<Activity | 'greet' | 'happy' | 'upset' | 'busy', string[]>>;
  ties: Tie[];
  week?: Week;
  /** 在场景里由谁演（named / regular 才有；crowd 由 casting.ts 按位置分配） */
  homes: Home[];
  look: CastLook;
  /** 开局对总监的好感 0..10 */
  favor0: number;
}

// ── 状态（会变的，存档） ───────────────────────────────────────────────────────────

/** 一条记忆（名册里"最近"）："第 3 天 · 总监请他喝了柠檬水" */
export interface MemoryEntry {
  day: number;
  minute: number;
  text: string;
  favor: number;
}

export interface PersonMem {
  /** 好感 0..10（一位小数） */
  favor: number;
  /** 心情 0..100 */
  mood: number;
  /** 见过面（总监和他说过话）：名册里没见过的人只显示外观和身份 */
  met: boolean;
  /** 今天说过几次话（同一天说多了会烦） */
  talksToday: number;
  /** 上一次送礼物是第几天（一周一次） */
  giftDay: number;
  /** 一起打过几局 */
  rallies: number;
  memory: MemoryEntry[];
}

export interface CastState {
  seed: number;
  /** 第几天（从 1 开始）；周几 = (day - 1) % 7（第 1 天是周一） */
  day: number;
  /** 一天里的分钟（营业 7:00–22:00 → 420..1320） */
  minute: number;
  /** 总监手里的零用钱（请客、送礼物） */
  money: number;
  people: Record<string, PersonMem>;
}

// ── 互动 ──────────────────────────────────────────────────────────────────────────

export type ActionId = 'chat' | 'treat' | 'rally' | 'ask' | 'gift' | 'message';

export interface ActionDef {
  id: ActionId;
  /** 按钮上的字："聊几句" */
  label: string;
  /** 代价一行："1 分钟" "$6 · 2 分钟" */
  cost: string;
  /** 要当面（总监在他 ≤ 3 米）才行；不当面的按钮变成"走过去" */
  inPerson: boolean;
  /** 花多少游戏分钟（总监站着做这个动作） */
  minutes: number;
  money: number;
}

/** 一次互动的结果（act() 返回；界面照着演：气泡、好感变化、记忆一行） */
export interface ActResult {
  ok: boolean;
  /** 不能做的原因（钱不够、这周送过了、他正忙……） */
  reason?: string;
  /** 他说的一句（气泡） */
  line: string;
  /** 结果说明（卡片下方一行）："好感 +0.8 · 他喜欢柠檬水" */
  note: string;
  /** 好感、心情的变化量（不是新值）；ok 为 false 时都是 0、状态不变 */
  favor: number;
  mood: number;
  minutes: number;
  money: number;
}

/** act() 要知道的处境 */
export interface ActCtx {
  /** 总监就在他旁边 */
  near: boolean;
  /** 他此刻在干什么 */
  activity: Activity;
  /** 在哪个场景 */
  scene: SceneId | null;
}

// ── 选角（casting.ts） ────────────────────────────────────────────────────────────

/** 场景里的一个"人位"：哪个场景、哪个槽位、用什么人建的、这个位置是什么身份（slots.ts 的表，按场景和演出写的） */
export interface SlotInfo {
  scene: SceneId;
  /** 'slot:<id>' 去掉前缀；演出临时建的人 = '#<n>'（区域里第 n 个没有槽位名的人，按建的顺序，从 0 数） */
  slot: string;
  kind: PersonKind;
  /** 这个位置上的人是什么身份 */
  role: Role;
  /** 这个位置的人在干什么（一个短词，名册里"在哪儿"后面）："饮料车摊主""看台上的观众""排队签到" */
  title: string;
}

/** 演员表（buildCast(seed) 建；纯数据） */
export interface Cast {
  seed: number;
  /** 按 id 找人（named、regular、生成过的客人） */
  get(id: string): CastPerson | undefined;
  /** 名册：named + regular（客人不进名册，除非已经见过面 —— 界面自己决定） */
  roster(): CastPerson[];
  /**
   * 这一天这个位置是谁。顺序：named 的 homes（days 对得上）→ regular（他今天来、这个位置是他的）→ 当天的客人（按 scene/slot/day 生成，同一天同一位置永远是同一个人）。
   * slot 不在 slots.ts 的表里也行（按 kind 当客人生成）。day = 游戏第几天（从 1 开始，不是周几）；每周的安排按 (day − 1) % 7 重复。
   */
  who(scene: SceneId, slot: string, kind: PersonKind, day: number): CastPerson;
  /** 这个人这一天在哪些位置（名册"今天在哪儿"、"走过去"） */
  where(id: string, day: number): Home[];
}
