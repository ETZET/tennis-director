// 场景里的"人位"表：clubwalk 每个区域里每一个人是什么身份、在干什么（选角按它把人放进去）。
// 照 clubwalk 的清点（每个区域 traverse 出来的人）和各场景的 layout.ts / life.ts（会所是 slots-*.ts、life-*.ts）写。
//
// 规则：
// - slot = 场景里那个人的名字去掉 'slot:'；演出临时建的人 = '#<n>'（区域里第 n 个没有 slot: 名字的人，按 traverse 顺序从 0 数，含藏着的）。
// - 相邻区域会把邻居的人也建出来、藏着（clubdesk 的 pickle-a..d、clubpickle 的 member-serve……）：那份不算，以邻居自己没藏的那份为准。
//   区域自己的人一开始在范围外藏着、演出会把他带进来的（中心球场通道里的球员、会员场长廊上的路人……）算。
// - kind 'director' 的位置（会所的 director-in）是总监，不在表里。
// 纯数据。场景加了人、改了演出，这张表跟着改（演员表的测试会对一遍 kind 和 role）。
import type { PersonKind, Role, SceneId, SlotInfo } from './types';

type Row = readonly [slot: string, kind: PersonKind, role: Role, title: string];

const P = 'player' as const;
const K = 'kid' as const;
const C = 'coach' as const;

const S = (scene: SceneId, rows: readonly Row[]): SlotInfo[] =>
  rows.map(([slot, kind, role, title]) => ({ scene, slot, kind, role, title }));

export const SLOT_TABLE: readonly SlotInfo[] = [
  // ── 停车场：代客泊车、门童，演出里来来去去的会员（车池 + 会员池）──
  ...S('clubpark', [
    ['#0', P, 'staff', '代客泊车'],
    ['#1', P, 'staff', '门童'],
    ['#2', P, 'member', '刚停好车的会员'],
    ['#3', P, 'guest', '下车的客人'],
    ['#4', P, 'member', '走去大门的会员'],
  ]),
  // ── 露天前台：凉棚下排队签到（总监在柜台里）──
  ...S('clubdesk', [
    ['member-serve', P, 'member', '在柜台签到的会员'],
    ['member-q1', P, 'member', '排队签到的会员'],
    ['member-q2', P, 'member', '排队签到的会员'],
    ['member-q3', P, 'member', '排队签到的会员'],
    ['member-in', P, 'member', '刚进门的会员'],
    ['member-out', P, 'member', '签完到去球场的会员'],
    ['#0', P, 'member', '从大门进来的会员'],
    ['#1', P, 'guest', '第一次来的客人'],
    ['#2', P, 'member', '去球场的会员'],
  ]),
  // ── 匹克球场：2 号场双打、拍架边等场、场边看球、长廊和步道上走的 ──
  ...S('clubpickle', [
    ['lawn-player', P, 'member', '草坪上拉伸的球友'],
    ['rally-w1', P, 'member', '匹克球双打'],
    ['rally-w2', P, 'member', '匹克球双打'],
    ['rally-e1', P, 'member', '匹克球双打'],
    ['rally-e2', P, 'member', '匹克球双打'],
    ['wait-1', P, 'member', '拍架边等场的球友'],
    ['fan-a1', P, 'member', '伞下看球的球友'],
    ['fan-a2', P, 'guest', '伞下看球的客人'],
    ['fan-b1', P, 'member', '长椅上歇着的球友'],
    ['prom-1', P, 'member', '长廊上去球场的会员'],
    ['prom-2', P, 'member', '长廊上走的会员'],
    ['path-w', P, 'member', '等着上场的球友'],
    ['path-s', P, 'member', '打完球回来的球友'],
    ['#0', P, 'member', '拍架边等场的球友'],
    ['#1', P, 'guest', '来试打匹克球的客人'],
    ['#2', P, 'member', '捡球的球友'],
    ['#3', P, 'member', '拿着球拍来的会员'],
    ['#4', P, 'member', '来打匹克球的会员'],
    ['#5', P, 'guest', '来打匹克球的客人'],
    ['#6', P, 'member', '来打匹克球的会员'],
    ['#7', P, 'member', '来打匹克球的会员'],
    ['#8', P, 'guest', '来打匹克球的客人'],
    ['#9', P, 'member', '来打匹克球的会员'],
  ]),
  // ── 棕榈喷泉广场：喷泉边的孩子和家长、长椅、饮料车、走动的会员 ──
  ...S('clubplaza', [
    ['kid', K, 'kid', '在喷泉边玩水的孩子'],
    ['parent', P, 'parent', '带孩子来的家长'],
    ['sit-w1', P, 'member', '长椅上喝水的会员'],
    ['sit-w2', P, 'guest', '长椅上歇脚的客人'],
    ['sit-n1', P, 'guest', '树荫下坐着的客人'],
    ['sit-n2', P, 'member', '找长椅的会员'],
    ['vendor', P, 'vendor', '饮料车摊主'],
    ['member-drinks', P, 'member', '去饮料车的会员'],
    ['member-up', P, 'member', '上台阶的会员'],
    ['member-cross', P, 'member', '横穿广场的会员'],
    ['member-prom', P, 'member', '长廊上往西走的会员'],
  ]),
  // ── 中心球场：比赛（裁判、两个球员、六个球童）、看台、卖水的、长廊 ──
  ...S('clubstadium', [
    ['umpire', 'umpire', 'staff', '主裁判'],
    ['player-a', P, 'pro', '表演赛球员'],
    ['player-b', P, 'pro', '表演赛球员'],
    ['kid-net-n', 'ball-kid', 'staff', '网前球童'],
    ['kid-net-s', 'ball-kid', 'staff', '网前球童'],
    ['kid-nw', 'ball-kid', 'staff', '底线球童'],
    ['kid-ne', 'ball-kid', 'staff', '底线球童'],
    ['kid-sw', 'ball-kid', 'staff', '底线球童'],
    ['kid-se', 'ball-kid', 'staff', '底线球童'],
    ['spec-aisle-w', P, 'guest', '走道上找座位的观众'],
    ['vendor', P, 'vendor', '看台上卖水的'],
    ['spec-south', P, 'guest', '站着看球的观众'],
    ['member-drink', P, 'member', '饮水点喝水的会员'],
    ['member-prom-1', P, 'member', '长廊上的会员'],
    ['member-prom-2', P, 'member', '长廊上的会员'],
    ['spec-link-1', P, 'guest', '从广场来看球的观众'],
    ['spec-link-2', P, 'guest', '从广场来看球的观众'],
  ]),
  // ── 会员场 · 青训：教练喂球、排队的孩子、家长、会员双打、等场的、自己练发球的少年 ──
  ...S('clubcourts', [
    ['coach', C, 'coach', '青训教练'],
    ['kid-hit', K, 'kid', '青训学员'],
    ['kid-q1', K, 'kid', '排队打球的学员'],
    ['kid-q2', K, 'kid', '排队打球的学员'],
    ['kid-q3', K, 'kid', '排队打球的学员'],
    ['parent-1', P, 'parent', '看孩子上课的家长'],
    ['parent-2', P, 'parent', '看孩子上课的家长'],
    ['parent-3', P, 'parent', '给孩子鼓掌的家长'],
    ['member-wait-1', P, 'member', '等场的会员'],
    ['member-wait-2', P, 'member', '等场的会员'],
    ['member-wait-3', P, 'member', '等场的会员'],
    ['m-e1', P, 'member', '会员双打'],
    ['m-e2', P, 'member', '会员双打'],
    ['m-w1', P, 'member', '会员双打'],
    ['m-w2', P, 'member', '会员双打'],
    ['teen', P, 'kid', '自己练发球的少年'],
    ['walker', P, 'member', '长廊上路过的会员'],
    ['walker-2', P, 'guest', '长廊上路过的客人'],
  ]),
  // ── 红土场：裁判椅上的裁判（coach 的样子）、场边观众、近场双打、东步道 ──
  ...S('clubclay', [
    ['umpire', C, 'staff', '红土场裁判'],
    ['spectator-1', P, 'member', '伞下看球的会员'],
    ['spectator-2', P, 'guest', '伞下看球的客人'],
    ['spectator-3', P, 'member', '站着看球的会员'],
    ['server', P, 'member', '红土双打'],
    ['net-e', P, 'member', '红土双打'],
    ['net-w', P, 'member', '红土双打'],
    ['returner', P, 'member', '红土双打'],
    ['walker', P, 'member', '东步道上的会员'],
  ]),
  // ── 会所：拱廊、一楼的店、二楼休息室和酒吧、地下健身房 ──
  ...S('clubhouse', [
    ['loggia-sit-1', P, 'member', '拱廊下歇着的会员'],
    ['loggia-sip-1', P, 'member', '拱廊下喝咖啡的会员'],
    ['pool-walker', P, 'member', '去泳池的会员'],
    ['shop-clerk', P, 'staff', '球拍店店员'],
    ['shop-queue', P, 'member', '等着取拍子的会员'],
    ['shop-stringer', C, 'staff', '穿线师'],
    ['shop-barista', P, 'vendor', '咖啡吧咖啡师'],
    ['merch-clerk', P, 'staff', '纪念品店店员'],
    ['nutri-clerk', P, 'vendor', '果昔吧饮品师'],
    ['kiosk-clerk', P, 'staff', '小卖部店员'],
    ['kiosk-buyer', P, 'guest', '小卖部买东西的客人'],
    ['delivery', P, 'vendor', '送货员'],
    ['2f-lounge-a', P, 'member', '休息室看比赛的会员'],
    ['2f-lounge-b', P, 'member', '休息室喝茶的会员'],
    ['2f-bartender', P, 'vendor', '二楼酒保'],
    ['2f-bar-sit', P, 'member', '吧台喝一杯的会员'],
    ['2f-bar-stand', P, 'guest', '吧台边站着的客人'],
    ['2f-cook', P, 'vendor', '会所厨师'],
    ['2f-terrace-a', P, 'member', '露台上喝东西的会员'],
    ['2f-terrace-b', P, 'member', '露台上坐着的会员'],
    ['gym-presser', P, 'member', '卧推的会员'],
    ['gym-spotter', P, 'member', '给人保护的健身搭子'],
    ['gym-squatter', P, 'member', '深蹲的会员'],
    ['gym-sled-pusher', P, 'member', '推雪橇的会员'],
    ['gym-coach', C, 'coach', '团课教练'],
    ['gym-patient', P, 'member', '做理疗的会员'],
    ['gym-physio', P, 'staff', '理疗师'],
    ['gym-boxer', P, 'member', '打沙袋的会员'],
    ['gym-desk-clerk', P, 'staff', '健身房前台'],
    ['gym-runner', P, 'member', '跑步机上的会员'],
    ['gym-cyclist', P, 'member', '动感单车上的会员'],
    ['gym-rower', P, 'member', '划船机上的会员'],
    ['gym-laundry', P, 'staff', '洗衣房的员工'],
    ['#0', P, 'member', '休息室的会员'],
    ['#1', P, 'guest', '去泳池的客人'],
    ['#2', C, 'staff', '会所服务员'],
    ['#3', P, 'member', '逛球拍店的会员'],
    ['#4', P, 'member', '健身房跟练的会员'],
    ['#5', P, 'member', '健身房跟练的会员'],
  ]),
  // ── 泳池：救生员、游泳的、池边、躺椅、凉亭、东门进来的会员 ──
  ...S('clubpool', [
    ['cabana-w-sit', P, 'guest', '凉亭里喝东西的客人'],
    ['lifeguard', P, 'staff', '救生员'],
    ['swim-lap', P, 'member', '游泳的会员'],
    ['swim-2', P, 'guest', '泡在水里的客人'],
    ['swim-parent', P, 'parent', '陪孩子游泳的家长'],
    ['swim-kid', K, 'kid', '浅水台阶边的孩子'],
    ['edge-sit', P, 'guest', '池边泡脚的客人'],
    ['sun-1', P, 'member', '躺椅上晒太阳的会员'],
    ['sun-2', P, 'guest', '躺椅上喝东西的客人'],
    ['sun-3', P, 'member', '躺椅上晒太阳的会员'],
    ['sun-4', P, 'guest', '躺椅上晒太阳的客人'],
    ['sun-w1', P, 'member', '西边躺椅上喝东西的会员'],
    ['sun-w2', P, 'guest', '西边躺椅上看书的客人'],
    ['member-in', P, 'member', '打完球来游泳的会员'],
    ['kid-shower', K, 'kid', '冲凉的孩子'],
  ]),
  // ── 高尔夫：果岭推杆、扶旗、发球台、球车、沙漠里找球 ──
  ...S('clubgolf', [
    ['putter', P, 'member', '果岭上推杆的会员'],
    ['pin-tender', P, 'member', '扶旗的球友'],
    ['teer', P, 'member', '发球台开球的会员'],
    ['tee-wait', P, 'member', '等开球的球友'],
    ['cart-driver', P, 'member', '坐在球车上的球友'],
    ['ball-hunter', P, 'member', '沙漠里找球的会员'],
  ]),
  // ── 餐车院子：八个摊主、三队排队的、凉棚下吃饭的、野餐桌、孩子的草皮角、长廊、高峰的客人 ──
  ...S('clubfood', [
    ['vendor-coffee', P, 'vendor', '咖啡车咖啡师'],
    ['vendor-taco', P, 'vendor', '塔可车厨师'],
    ['vendor-pizza', P, 'vendor', '披萨车师傅'],
    ['q-coffee-1', P, 'member', '排队买咖啡的会员'],
    ['q-coffee-2', P, 'guest', '排队买咖啡的客人'],
    ['q-taco-1', P, 'guest', '排队买塔可的客人'],
    ['q-taco-2', P, 'member', '排队买塔可的会员'],
    ['q-taco-3', P, 'parent', '带孩子排队的家长'],
    ['q-taco-kid', K, 'kid', '跟着排队的孩子'],
    ['q-pizza-1', P, 'guest', '排队买披萨的客人'],
    ['q-pizza-2', P, 'member', '排队买披萨的会员'],
    ['vendor-agua', P, 'vendor', '鲜果水摊主'],
    ['q-agua', P, 'guest', '买鲜果水的客人'],
    ['vendor-paleta', P, 'vendor', '冰棍车摊主'],
    ['kid-paleta', K, 'kid', '买冰棍的孩子'],
    ['parent-paleta', P, 'parent', '买冰棍的家长'],
    ['vendor-burger', P, 'vendor', '汉堡拖车厨师'],
    ['q-burger', P, 'guest', '买汉堡的客人'],
    ['d-0n1', P, 'member', '凉棚下吃饭的会员'],
    ['d-0n2', P, 'guest', '凉棚下吃饭的客人'],
    ['d-0s1', P, 'guest', '凉棚下吃饭的客人'],
    ['d-0n3', P, 'member', '边吃边看球的会员'],
    ['d-0n4', P, 'guest', '凉棚下吃饭的客人'],
    ['d-1n1', P, 'member', '凉棚下喝东西的会员'],
    ['d-1s1', P, 'guest', '凉棚下吃饭的客人'],
    ['d-1s2', P, 'member', '凉棚下吃饭的会员'],
    ['d-1n2', P, 'guest', '凉棚下吃饭的客人'],
    ['d-1n3', P, 'member', '凉棚下喝东西的会员'],
    ['d-2n1', P, 'guest', '凉棚下吃饭的客人'],
    ['d-2s1', P, 'member', '凉棚下吃饭的会员'],
    ['d-2s2', P, 'guest', '凉棚下喝东西的客人'],
    ['walk-tray-1', P, 'guest', '端着托盘找座位的客人'],
    ['walk-tray-2', P, 'member', '端着托盘找座位的会员'],
    ['player-out-1', P, 'pro', '去中心球场的球员'],
    ['player-out-2', C, 'coach', '跟着球员的教练'],
    ['fam-1', P, 'parent', '带两个孩子吃饭的家长'],
    ['fam-kid1', K, 'kid', '跟家里人吃饭的孩子'],
    ['fam-kid2', K, 'kid', '跟家里人吃饭的孩子'],
    ['pic-1a', P, 'member', '野餐桌边的会员'],
    ['pic-1b', P, 'member', '野餐桌边的会员'],
    ['kid-throw', K, 'kid', '草皮角扔沙包的孩子'],
    ['kid-wait', K, 'kid', '草皮角排着玩的孩子'],
    ['kid-jenga', K, 'kid', '搭大积木的孩子'],
    ['parent-lawn', P, 'parent', '草皮角看孩子的家长'],
    ['vendor-boba', P, 'vendor', '奶茶三轮摊主'],
    ['q-boba', P, 'guest', '买奶茶的客人'],
    ['vendor-churro', P, 'vendor', '吉事果车摊主'],
    ['q-churro', P, 'guest', '吃吉事果的客人'],
    ['prom-1', P, 'member', '长廊上路过的会员'],
    ['prom-2', P, 'member', '长廊上歇脚的会员'],
    ['stadium-walker', P, 'guest', '端着杯子去看球的客人'],
    ...Array.from({ length: 16 }, (_, i): Row => {
      const kid = i % 4 === 3;
      return [`#${i}`, kid ? K : P, kid ? 'kid' : 'guest', kid ? '跟大人来吃饭的孩子' : '饭点来的客人'];
    }),
  ]),
];

/** 'scene:slot' → SlotInfo */
const BY_KEY = new Map(SLOT_TABLE.map((s) => [slotKey(s.scene, s.slot), s]));

export function slotKey(scene: SceneId, slot: string): string {
  return `${scene}:${slot}`;
}

/** 表里的这个位置（没有 = undefined） */
export const slotInfo = (scene: SceneId, slot: string): SlotInfo | undefined => BY_KEY.get(slotKey(scene, slot));

/** 员工位置（每天都是同一个人：员工、摊主、教练、职业球员） */
export const isFixedRole = (role: Role) => role === 'staff' || role === 'vendor' || role === 'coach' || role === 'pro';

/** 表里没有的位置按 kind 猜身份（选角兜底） */
export function guessRole(kind: PersonKind): Role {
  switch (kind) {
    case 'kid':
      return 'kid';
    case 'ball-kid':
    case 'umpire':
      return 'staff';
    case 'coach':
      return 'coach';
    default:
      return 'guest';
  }
}
