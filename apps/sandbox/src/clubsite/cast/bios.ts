// 故事模板：两句话，第一句"他是谁、怎么来"，第二句一个具体的细节。按身份分组（crowd.ts 挑）。
// 模板 = (c) => 句子（不带句号）；when 不满足的不挑。要有具体细节：几点来、哪天、喝什么、哪年入会。
import type { Role } from './types';

export interface BioCtx {
  /** 中文名 */
  zh: string;
  /** 他 / 她 */
  ta: string;
  age: number;
  /** 住的镇子 */
  town: string;
  from: string;
  /** "在 Palm Desert 开牙科诊所"（员工、摊主、教练 = 来历） */
  does: string;
  job: string;
  /** 在俱乐部的位置（员工："代客泊车"） */
  title: string;
  like: string;
  dislike: string;
  /** 入会那年 */
  year: number;
  /** "周二、周四" */
  days: string;
  /** 一周来几天 */
  n: number;
  ntrp: number;
  retired: boolean;
  snowbird: boolean;
  /** 学生（孩子、少年、大学生） */
  student: boolean;
  founder: boolean;
  stay: string;
  dog: string;
}

export interface BioT {
  when?: (c: BioCtx) => boolean;
  f: (c: BioCtx) => string;
}

const T = (f: BioT['f'], when?: BioT['when']): BioT => (when ? { f, when } : { f });

/** 第一句的后半：来俱乐部的习惯（会员） */
const MEMBER_HABIT: BioT[] = [
  T(
    (c) => `每${c.days}早上七点就到，打完双打再去上班`,
    (c) => !c.retired && !c.snowbird && !c.student,
  ),
  T(
    (c) => `${c.days}午休溜出来打一小时`,
    (c) => !c.retired && !c.snowbird && !c.student,
  ),
  T(
    () => '只打双打，说单打是年轻人的事',
    (c) => c.age >= 50,
  ),
  T(
    (c) => `下班后打夜场，灯一亮${c.ta}就到`,
    (c) => !c.retired && !c.student,
  ),
  T(
    (c) => `一周来 ${c.n} 次，雷打不动`,
    (c) => c.n >= 3,
  ),
  T(() => '天一热就只打早场'),
  T(() => '打完球一定去餐车院子吃一份塔可'),
  T(() => '正在找一个固定的双打搭档'),
  T((c) => `${c.days}来，球包比别人的大一圈`),
  T(
    () => '俱乐部重开第一天就办了会籍',
    (c) => !c.founder,
  ),
  T(
    () => '把打球当上班，九点到、十二点走',
    (c) => c.retired,
  ),
];

const MEMBER_DETAIL: BioT[] = [
  T(
    (c) => `${c.year} 年就入了会，关门那十年在别处打球，心里一直惦记这里`,
    (c) => c.founder,
  ),
  T(() => '球包里永远多备一罐新球，谁缺都给'),
  T(
    () => '去年做了膝盖手术，正在一点点找回状态',
    (c) => c.age >= 40,
  ),
  T((c) => `${c.zh}最爱${c.like}，最烦${c.dislike}`),
  T(
    () => '手机里存着九十年代俱乐部比赛的老照片',
    (c) => c.age >= 50,
  ),
  T(
    (c) => `孩子都上大学了，球场成了${c.ta}新的社交圈`,
    (c) => c.age >= 45 && c.age <= 65,
  ),
  T((c) => `打球不快，但几乎不失误，搭档都说跟${c.ta}打省心`),
  T(() => '赢了球会请搭档喝一杯，输了也请'),
  T(
    (c) => `总说今年要把 NTRP 打到 ${(c.ntrp + 0.5).toFixed(1)}`,
    (c) => c.ntrp < 5,
  ),
  T(() => '周末常带朋友来，自称俱乐部的"非正式招生办"'),
  T(() => '对新铺的场地意见很多，但每次都第一个来打'),
  T((c) => `养了一条叫 ${c.dog} 的狗，常拴在场边的树荫里`),
  T(() => '前台的每个人都叫得出名字'),
  T(
    () => '家里客厅挂着 1994 年那场大赛的签名海报',
    (c) => c.age >= 45,
  ),
  T(
    (c) => `每年四月风季一来就飞回 ${c.from}，走之前把球包寄存在前台`,
    (c) => c.snowbird,
  ),
];

const GUEST_FIRST: BioT[] = [
  T(
    (c) => `从 ${c.from} 来度假，住在${c.stay}`,
    (c) => c.from !== c.town,
  ),
  T(
    (c) => `${c.does}，今天跟朋友来试打`,
    (c) => !c.retired && !c.student,
  ),
  T(() => '第一次来，听说这座老俱乐部重新开了'),
  T(() => '来参加朋友的生日聚会，顺便看看球场'),
  T((c) => `住在 ${c.town}，买了张次卡先试试`),
  T(() => '开车路过看到大门开着，就进来了'),
  T(
    (c) => `从 ${c.from} 来看女儿一家，女儿是这里的会员`,
    (c) => c.age >= 55,
  ),
  T(
    (c) => `从 ${c.from} 来过冬，还没决定办哪种卡`,
    (c) => c.snowbird,
  ),
];
const GUEST_DETAIL: BioT[] = [
  T(() => '还没想好要不要办会籍，想先看看夏天这里有多热'),
  T(() => '一进门就问了三个人哪里能买到防晒霜'),
  T((c) => `${c.zh}最爱${c.like}，最烦${c.dislike}`),
  T(() => '拍了很多棕榈树的照片'),
  T(() => '说自己以前也打球，"大学的时候"'),
  T(() => '在餐车院子排了二十分钟队，觉得值'),
  T(() => '对会所走廊里的老照片墙很感兴趣'),
  T(() => '已经在打听附近的房价了'),
];

const KID_FIRST: BioT[] = [
  T((c) => `${c.job}，每周末跟爸妈来`),
  T((c) => `${c.job}，放学后来上青训课`),
  T(
    (c) => `${c.job}，最喜欢俱乐部的泳池`,
    (c) => c.age <= 12,
  ),
  T(
    (c) => `${c.job}，在学打网球，拍子比胳膊还长`,
    (c) => c.age <= 9,
  ),
  T((c) => `${c.job}，暑假几乎天天泡在俱乐部`),
];
const KID_DETAIL: BioT[] = [
  T((c) => `${c.zh}最爱${c.like}，最怕${c.dislike}`),
  T(() => '梦想是当球童，站在中心球场的网前'),
  T(() => '会把捡到的球一个个塞进口袋'),
  T(() => '能背出所有餐车的菜单'),
  T(
    () => '有一本总也贴不满的恐龙贴纸本',
    (c) => c.age <= 10,
  ),
  T(() => '跟谁都能聊起来，问题一个接一个'),
  T(
    () => '偷偷在练反手，想下次赢过教练',
    (c) => c.age >= 10,
  ),
  T(
    () => '手机壳上贴着自己最喜欢的球员',
    (c) => c.age >= 12,
  ),
];

const PARENT_FIRST: BioT[] = [
  T((c) => `${c.does}，周末带孩子来上课，自己在场边等`),
  T((c) => `${c.does}，送完孩子就去健身房`),
  T((c) => `${c.does}，孩子上课时在餐车院子回邮件`),
  T(() => '两个孩子都在俱乐部的青训班'),
];
const PARENT_DETAIL: BioT[] = [
  T(() => '场边鼓掌最响的那个'),
  T(() => '总在问教练孩子什么时候能参加比赛'),
  T(() => '自己年轻时也打过球，现在只在场边比划'),
  T(() => '包里永远装着防晒霜、零食和创可贴'),
  T((c) => `${c.zh}最爱${c.like}，最烦${c.dislike}`),
  T(() => '和别的家长建了个群，每天消息上百条'),
];

const STAFF_FIRST: BioT[] = [T((c) => `在俱乐部当${c.title}，${c.does}`), T((c) => `${c.title}，${c.does}`)];
const STAFF_DETAIL: BioT[] = [
  T(() => '能记住每个常客的名字和习惯'),
  T(() => '每天最早到、最晚走'),
  T(
    () => '在攒钱读护理学校',
    (c) => c.age <= 35,
  ),
  T(() => '下了班也会留下来打一会儿球'),
  T(() => '跟餐车的摊主们混得很熟，午饭从不重样'),
  T((c) => `${c.zh}最爱${c.like}，最烦${c.dislike}`),
  T(
    () => '俱乐部关门那年还是个孩子，就住在这条街上',
    (c) => c.age <= 30,
  ),
  T(() => '在手机里记着每天出的状况，说以后要写本书'),
];

const VENDOR_FIRST: BioT[] = [T((c) => `${c.title}，${c.does}`)];
const VENDOR_DETAIL: BioT[] = [
  T(() => '凌晨四点开始备料'),
  T(() => '配方是外婆传下来的，谁问都不说'),
  T(() => '记得每个常客的口味'),
  T(() => '车上贴满了小顾客画的画'),
  T(() => '想在俱乐部里开一家正式的店'),
  T(() => '夏天最热的时候也不歇业，车里装了两台风扇'),
  T((c) => `${c.zh}最爱${c.like}，最烦${c.dislike}`),
];

const COACH_FIRST: BioT[] = [T((c) => `${c.title}，${c.does}`)];
const COACH_DETAIL: BioT[] = [
  T(() => '训练时嗓门大，下了场说话很轻'),
  T(() => '记得每个学员第一次把球打过网的那天'),
  T(() => '每天早上先自己发一小时球'),
  T(() => '把打旧的球攒起来捐给谷地的小学'),
  T((c) => `${c.zh}最爱${c.like}，最烦${c.dislike}`),
];

const PRO_FIRST: BioT[] = [T((c) => `${c.title}，${c.does}`)];
const PRO_DETAIL: BioT[] = [
  T(() => '来谷地是为了三月的大赛提前适应场地'),
  T(() => '在俱乐部训练，作为交换，每周给青训的孩子上一堂课'),
  T(() => '走到哪都有人认出来，但还是自己背球包'),
  T((c) => `${c.zh}最爱${c.like}，最烦${c.dislike}`),
];

/** 第一句（会员：做什么 + 来的习惯） */
const MEMBER_FIRST: BioT[] = [
  T(
    (c) => `${c.does}，`,
    (c) => !c.retired && !c.snowbird && !c.student,
  ),
  T(
    (c) => `以前${c.does}，退休后`,
    (c) => c.retired && !c.snowbird,
  ),
  T(
    (c) => `从 ${c.from} 来过冬，`,
    (c) => c.snowbird,
  ),
  T(
    (c) => `${c.job}，`,
    (c) => c.student,
  ),
];

export const BIO: Record<Role, { first: BioT[]; habit?: BioT[]; detail: BioT[] }> = {
  member: { first: MEMBER_FIRST, habit: MEMBER_HABIT, detail: MEMBER_DETAIL },
  guest: { first: GUEST_FIRST, detail: GUEST_DETAIL },
  kid: { first: KID_FIRST, detail: KID_DETAIL },
  parent: { first: PARENT_FIRST, detail: PARENT_DETAIL },
  staff: { first: STAFF_FIRST, detail: STAFF_DETAIL },
  vendor: { first: VENDOR_FIRST, detail: VENDOR_DETAIL },
  coach: { first: COACH_FIRST, detail: COACH_DETAIL },
  pro: { first: PRO_FIRST, detail: PRO_DETAIL },
};

/** 模板总数（测试：≥ 40） */
export const BIO_TEMPLATE_COUNT = Object.values(BIO).reduce(
  (n, b) => n + b.first.length + (b.habit?.length ?? 0) + b.detail.length,
  0,
);
