// B1 的摆件（家具占位 + 里面的人）。level 都是 -1；房间的范围、门、楼梯见 layout.ts 的 ROOMS / WALLS / FLIGHTS / LIFT / GOODS_LIFT。
// 一整层健身房：区和区之间不砌墙（换地面），每个区 3～5 件大东西 + 一个"活"的信号；竖屏一帧（x −62.8…−45.2）≤ 10 个人。
// 墙的里面：北挡土墙 z −41.7、西 x −62.7、东（主区南段）x −46.5、南 z −6.5；隔墙 0.22。
// 朝镜头的墙切到 1 米 → 要看得见的东西离它南边那道墙 ≥ 1.2 米：团课房 z ≤ −25.2、自由重量（团课房北墙后面那段）≤ −34.2、
//   更衣 ≤ −11.4、有氧区 ≤ −7.2、机房 ≤ −32.2、储藏只放北沿（南边被拱廊前小院的地挡住）。
// 门（门里门外各留 0.9 米）：团课房 (−59.2, −27)、(−55.4, −24)；更衣 (−52.4, −17)、(−47.0, −17)；洗衣房 (−46, −38.5)；储藏 (−46, −29)；
//   后场之间 (−43, −35.4)、(−43, −31)。楼梯间 x −54…−50.4、z −30…−24 和楼梯脚（z −24…−22.8）、电梯井和门口 (−47.6, −18.6)、
//   货梯井和门口 (−44.8, −37.3) 1 米内什么都不放。
import { FLOOR_Y } from './layout';
import { FACE, person, type Slot } from './slot';

const F = FLOOR_Y[-1];

export const SLOTS_B1: Slot[] = [
  // ═════ 自由重量（x −62.7…−54.6、z −41.7…−33）：北墙一整条镜墙，镜前两个深蹲架 + 哑铃架，卧推凳在南边 ═════
  { id: 'gym-mirror', asset: 'gym-mirror', x: -58.7, z: -41.66, y: F + 0.35, noBlock: true },
  { id: 'gym-rack-1', asset: 'gym-squat-rack', x: -61.4, z: -39.9 },
  { id: 'gym-rack-2', asset: 'gym-squat-rack', x: -58.9, z: -39.9, noLabel: true },
  { id: 'gym-dumbbell-rack', asset: 'gym-dumbbell-rack', x: -56.3, z: -41.3 },
  // 信号：两个架子之间的片树脚下丢着一摞片（→ 挂回去）；哑铃架前散着哑铃（哑铃架那一件，→ 拣回去）
  { id: 'gym-plate-tree', asset: 'gym-plate-tree', x: -60.15, z: -37.6 },
  // 卧推凳（南北放）：练的人坐在北头，保护的站在东边看着；凳子南半一滩汗（→ 擦）
  { id: 'gym-bench', asset: 'gym-bench', x: -56.3, z: -36.6 },
  // 卧推：躺在凳子上（root = 凳子中心，头朝北）；保护的也放在凳子中心（spot 自己站到凳头的东北角），同一个 phase 跟着杠铃（clubhouse/people.ts）
  person('gym-presser', -56.3, -36.6, FACE.S, 2, 'benchPress', 0.3),
  person('gym-spotter', -56.3, -36.6, FACE.S, 4, 'spot', 0.3),
  // 深蹲：站在 1 号架子里（杠铃扛在背上）
  person('gym-squatter', -61.4, -39.8, FACE.S, 1, 'squat', 0.1),

  // ═════ 器械循环（x −54.6…−46.1、z −41.7…−33）：器械两排（各三台）+ 龙门架；两排之间是去洗衣房 (−46, −38.5) 的路 ═════
  { id: 'gym-machines-1', asset: 'gym-machines', x: -51.9, z: -40.6 },
  { id: 'gym-machines-2', asset: 'gym-machines', x: -51.9, z: -36.4, noLabel: true },
  { id: 'gym-cable', asset: 'gym-cable', x: -48.0, z: -40.9 },

  // ═════ 功能草道（x −62.7…−59.2、z −33…−6.5，4 × 27 米草皮）：北头壶铃架 → 战绳 → 跳箱 → 南头雪橇 ═════
  { id: 'gym-kb-plyo', asset: 'gym-kb-plyo', x: -61.4, z: -32.1 },
  { id: 'gym-ropes', asset: 'gym-ropes', x: -62.0, z: -27.6, noBlock: true },
  // 雪橇推到南头了，推的人脸朝镜头
  { id: 'gym-sled', asset: 'gym-sled', x: -61.0, z: -12.2 },
  person('gym-sled-pusher', -61.0, -13.5, FACE.S, 3, 'sledPush', 0.3),

  // ═════ 团课房（x −59.1…−54.1、z −32.9…−24.1，玻璃墙）：教练台在北头朝南，瑜伽垫两排；台边立着课表板 + 上课铃 ═════
  { id: 'gym-stage', asset: 'gym-stage', x: -56.6, z: -32.1 },
  person('gym-coach', -56.6, -32.0, FACE.S, 0, 'coachLead', 0.4, {
    asset: 'coach',
    y: F + 0.3,
    label: '教练',
    noLabel: false,
  }),
  { id: 'gym-class-board', asset: 'gym-class-board', x: -54.75, z: -32.3 },
  { id: 'gym-mats', asset: 'gym-mats', x: -56.6, z: -28.4, noBlock: true },

  // ═════ 拉伸 · 理疗（x −59.2…−54、z −24…−17）：两张理疗床（理疗师 + 坐着的病人）、冰浴桶、拉伸垫、泡沫轴架 ═════
  { id: 'gym-roller-rack', asset: 'gym-roller-rack', x: -58.6, z: -23.3 },
  { id: 'gym-physio-1', asset: 'physio-table', x: -58.2, z: -20.6 },
  { id: 'gym-physio-2', asset: 'physio-table', x: -56.9, z: -20.6, noLabel: true },
  // 病人坐在理疗床南半体前屈（seat = 床面 0.75），理疗师站在床边示范股四头拉伸（stretch 不设座位 = 站着）
  person('gym-patient', -56.9, -20.3, FACE.S, 5, 'stretch', 0.2, { seat: [0.75, 0.35] }),
  person('gym-physio', -56.05, -20.7, FACE.W, 6, 'stretch', 0.7),
  { id: 'gym-ice-bath', asset: 'ice-bath', x: -55.0, z: -18.6 },
  { id: 'gym-stretch-mats', asset: 'gym-stretch-mats', x: -58.0, z: -18.1, noBlock: true },

  // ═════ 拳击角（x −59.2…−54、z −17…−10.3）：台垫在北，沙袋架在南沿（高的放南边，不挡北边的理疗）；打沙袋的站在架子南边（背对镜头，整个人看得见）；东北角手套架 ═════
  { id: 'gym-ring-mat', asset: 'gym-ring-mat', x: -56.8, z: -14.6, noBlock: true },
  { id: 'gym-bag-rack', asset: 'gym-bag-rack', x: -56.8, z: -11.4 },
  person('gym-boxer', -56.8, -10.6, FACE.N, 7, 'punch', 0.5),
  { id: 'gym-glove-rack', asset: 'gym-glove-rack', x: -54.75, z: -16.4 },

  // ═════ 前台大厅（x −54…−46.5、z −33…−17 减楼梯间）：楼梯脚南边的前台 · 毛巾台（朝南），东墙饮水机 + 长椅 ═════
  { id: 'gym-desk', asset: 'gym-desk', x: -51.8, z: -21.2 },
  person('gym-desk-clerk', -51.8, -21.75, FACE.S, 1, 'deskServe', 0.1, { label: '前台', noLabel: false }),
  // 信号：毛巾台东头的脏毛巾筐冒尖（→ 去洗衣房推干净的来）；饮水机的桶空了（→ 去储藏扛一桶）
  { id: 'gym-water', asset: 'gym-water', x: -46.85, z: -23.2 },
  { id: 'gym-lobby-bench', asset: 'bench', x: -46.95, z: -25.8, rotY: FACE.W, label: '长椅（复用）' },

  // ═════ 男 / 女更衣（x −53.9…−50.1 / −49.9…−46.1、z −16.9…−10.4）：储物柜一排 + 长凳，南头淋浴 + 厕位；门在北墙 ═════
  { id: 'gym-lockers-m', asset: 'gym-lockers', x: -52.65, z: -15.0 },
  { id: 'gym-bench-m', asset: 'bench', x: -52.65, z: -13.9, s: 0.8, noLabel: true },
  { id: 'gym-wet-m', asset: 'gym-wet', x: -52.0, z: -12.1 },
  { id: 'gym-lockers-w', asset: 'gym-lockers', x: -48.65, z: -15.0, variant: 1, noLabel: true },
  { id: 'gym-bench-w', asset: 'bench', x: -48.65, z: -13.9, s: 0.8, noLabel: true },
  { id: 'gym-wet-w', asset: 'gym-wet', x: -48.0, z: -12.1, variant: 1, noLabel: true },

  // ═════ 有氧区（x −59.2…−46.5、z −10.2…−6.5）：一组单车、三台跑步机（朝南，在东边天窗下面）、划船机（东头被楼层按钮挡，往西挪）；北边留 1 米的路 ═════
  { id: 'gym-bikes', asset: 'gym-bikes', x: -57.6, z: -8.3 },
  { id: 'gym-treadmill-1', asset: 'gym-treadmill', x: -55.0, z: -8.2 },
  { id: 'gym-treadmill-2', asset: 'gym-treadmill', x: -53.85, z: -8.2, noLabel: true },
  { id: 'gym-treadmill-3', asset: 'gym-treadmill-fault', x: -52.7, z: -8.2 },
  // 跑的人 root 在楼板上（run 自己把脚放到跑带顶 0.28）
  person('gym-runner', -53.85, -8.4, FACE.S, 0, 'run', 0.2),
  // 骑单车的：中间那台（座在单车中心 z −0.27）
  person('gym-cyclist', -57.6, -8.57, FACE.S, 6, 'cycle', 0.4),
  // 划船机东边留着站位 cardio (−49.6, −8.0)（总监修跑步机、来练的人排队）
  { id: 'gym-rowers', asset: 'gym-rowers', x: -51.3, z: -8.3 },
  // 划船的人 root = 西边那台的座静止位（划船机中心 x −0.4、座 z −0.3）；row 让座跟着臀滑
  person('gym-rower', -51.7, -8.6, FACE.S, 3, 'row', 0.6),

  // ═════ 后场 · 洗衣房（x −45.9…−40.5、z −41.7…−35.5）：北墙洗衣机 + 烘干机一排（闪灯），叠衣台，干净毛巾车；西北角滑槽出口 ═════
  { id: 'gym-washers', asset: 'gym-washers', x: -42.0, z: -41.25 },
  { id: 'gym-wash-blink', asset: 'gym-wash-blink', x: -41.0, z: -40.8, y: F + 0.75, noBlock: true },
  { id: 'gym-fold-table', asset: 'gym-fold-table', x: -41.6, z: -38.9 },
  person('gym-laundry', -41.6, -39.6, FACE.S, 5, 'idle', 0.4),
  { id: 'gym-towel-cart', asset: 'gym-towel-cart', x: -41.2, z: -37.0 },
  { id: 'gym-chute', asset: 'gym-chute', x: -44.9, z: -41.0 },

  // ═════ 机房 · 配电（x −45.9…−40.5、z −35.3…−31.1）：中间 x −43 是洗衣房 ↔ 储藏的路 ═════
  { id: 'gym-panel', asset: 'gym-panel', x: -45.1, z: -34.95 },
  { id: 'gym-ac', asset: 'gym-ac', x: -41.5, z: -32.5 },
  { id: 'gym-boiler', asset: 'gym-boiler', x: -41.3, z: -34.3 },

  // ═════ 储藏（x −45.9…−40.5、z −30.9…−27.5）：东西都靠北墙 ═════
  { id: 'gym-store-shelves', asset: 'gym-store-shelves', x: -44.75, z: -30.5 },
  { id: 'gym-firewood-kegs', asset: 'gym-firewood-kegs', x: -41.4, z: -30.35 },
];
