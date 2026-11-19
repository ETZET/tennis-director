// 市政厅（第二批办事楼，2026-11-18：关卡 1 构图 + 灰盒 → 关卡 2/3 资产 + 组装）。这个文件归市政厅的代理。
// 资产在 src/valley/assets/cityhall.ts（画廊 valleyassets.html?asset=<id>），这里只摆：makeAsset(id, d.actx) → 位置 → d.asset(obj)。
// ?event=hearing：听证会那天（台阶上的讲台 + 彩旗、公告栏的大红通知、小黑板、前庭站满人）；平时是排队的几个人。
// 说明、资产清单、配色：docs/lab/2026-11-07-3d-pixel/valley-civic.md「市政厅」。随机只用 d.rng('valley:cityhall')。
//
// 方向：棕榈泉 50 年代的中世纪现代市政厅 —— 一层高的平顶长楼、深挑檐、立面一排金属管格栅、檐上开圆洞让棕榈穿出来、沙色。
// 正门朝南对着塔奎兹路的尽头（路就停在门口）。门前一块前庭（楼 2026-11-18 往北退了 5 米）：
//   西 → 东：钟塔（地标 p_clock，两片立板夹着钟）· 公告栏（以后的卡从这儿来）· 正门 + 三级宽台阶（听证会的讲台）· 叫号的排队栏 ·
//   开圆洞的雨棚（两棵棕榈穿出来，底下是等候的长椅）· 三根旗杆；东边一条石板路往北接喷泉广场，楼背后一条石板路往西接酒店草坪。
//
// 坐标（小镇比例，townscale.ts / townwrap.ts）：
// - 楼 layout.ts BUILDINGS cityhall：原尺寸 40 × 18 × 7.5，中心 (434, −658)，南墙 z −649；缩完 421.6…446.4 × −660.2…−649，高 4.65。
//   缩放轴 = 南墙正中 (434, −649) = 正门。贴着楼（原尺寸脚印外扩 2 米：x 412…456、z −669…−647）的东西跟楼一起缩 ——
//   立面、挑檐、台阶、讲台这几样照**原尺寸**写（R 开头的常量）。
// - 别处（前庭 z > −647、广场 x > 456）：位置写**缩完的世界坐标**（F 开头），大小照原尺寸写（townwrap 绕各自的中心乘 0.62）；
//   宽或深 ≥ 4.5 米的长条（雨棚）只压低（高度照原尺寸写），长宽就是最终的；贴地的铺面不动。
//   比 0.15 米还薄的立件会被当成"平铺"不缩（钟的分针、排队栏的拉带都踩过）：薄片一律 ≥ 0.16。
// - 注意：缩完的 x 447.6…456（或 412…420.4）× z −669…−647 这条带里**放不进立着的东西**（落在原尺寸脚印里，会被搬到楼上），
//   铺面要么中心在带外，要么整块比 45 米宽（townwrap 不认它是"贴着楼的"）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeAsset } from '../../assets';
import { CANOPY } from '../../assets/cityhall';
import type { DetailCtx } from '../../build';
import { siteKit, Y } from './kit';

/** 楼：原尺寸（townwrap 之前） */
const RX = 434;
const RZ = -649; // 南墙 = 缩放轴
const RW = 40;
/** 楼的中心 z（原尺寸）：cityhall-front 的原点 */
const RCZ = -658;
/** 听证会那天（?event=hearing） */
const HEARING = typeof location !== 'undefined' && new URLSearchParams(location.search).get('event') === 'hearing';
/** 缩完的楼东墙（x 421.6…446.4、z −660.16…−649） */
const FX1 = RX + (RW / 2) * 0.62;

/**
 * 玩法锚点（缩完的世界坐标）：名字 → 位置 + 总监在这儿干什么。p_cityhall 的门槛 = 正门 (434, −649)，旗子在它南边 3 米。
 */
export const SPOTS = {
  window: { x: 434, z: -648.4, note: '进门办事：窗口申请办赛许可、扩建审批（以后盖酒店也过这关），排队要花总监的时间' },
  queue: { x: 438.2, z: -644.6, note: '叫号的排队栏：人多的日子总监在这儿排着，俱乐部那边没人看' },
  board: {
    x: 431,
    z: -644.4,
    note: '公告栏：听证会通知、批文附带的条件（例：22 点关灯）、居民的投诉信，事件卡从这儿来',
  },
  hearing: {
    x: 434,
    z: -644.6,
    note: '听证会台阶：夜灯被投诉开听证会时，台阶上一张讲台、前庭里站满街坊，总监上台答辩',
  },
  clock: { x: 428, z: -643.4, note: '钟塔（地标 p_clock）：市中心的约定地点，几点开听证会看它' },
  plaza: { x: 470, z: -664, note: '喷泉广场：听证会散了以后在这儿碰到投诉的邻居 / 支持的会员' },
} as const;

export function detailCityhall(d: DetailCtx): void {
  const k = siteKit(d, d.rng('valley:cityhall'));
  const { put, blockRect, block, claim, palm, bench, lamp, cyl } = k;
  const prnd = d.rng('valley:cityhall:people');
  /** 放一件资产（原点 = 落地点中心，转 rot 弧度）；v = 变体 */
  const place = (id: string, x: number, z: number, rot = 0, v = 0): THREE.Object3D => {
    const { obj } = makeAsset(id, v ? { ...d.actx, variant: v } : d.actx);
    obj.position.set(x, 0, z);
    obj.rotation.y = rot;
    d.asset(obj);
    return obj;
  };
  /** 画面上的人（不是镇上的真人）：rot π = 面朝北（背对镜头） */
  const person = (x: number, z: number, rot: number, v: number) => {
    place('civic-person', x, z, rot, v);
    block({ x, z, r: 0.3 });
  };

  // ══ 1. 贴着楼的（原尺寸，跟楼一起缩）═══════════════════════════════
  // 立面 + 挑檐 + 屋面（原点 = 楼的中心）；三级宽台阶（原点 = 门槛 = 缩放轴）
  place('cityhall-front', RX, RCZ);
  place('cityhall-steps', RX, RZ, 0, HEARING ? 1 : 0);
  if (HEARING) blockRect(RX - 3.6, RZ + 0.7, 1.4, 0.9); // 讲台
  blockRect(RX - 8.7, RZ + 1.86, 1.4, 3.72); // 台阶两头的花池
  blockRect(RX + 8.7, RZ + 1.86, 1.4, 3.72);

  // ══ 2. 前庭（缩完的世界坐标：位置照写，大小原尺寸）════════════════════
  // 铺地：前庭 409…461.2 × −649…−642.3（压住人行道最北的一条；路灯、人行道上的长椅不动）
  place('cityhall-forecourt', 435.1, -645.65); // 萨尔蒂略陶砖（平铺的资产：townwrap 不动）
  // 只占前庭的北半（人行道上 z −642.7 的长椅 / 垃圾桶 / 路灯照旧：town.ts 的随机流不变）
  claim({ x0: 409, x1: 461.2, z0: -649, z1: -644.2 });

  // 前庭南沿两个矮花池（九重葛、龙舌兰），中间留 5.5 米的路对着门；避开人行道上的长椅（x ≈ 442）
  place('cityhall-planter', 431, -643.1);
  blockRect(431, -643.1, 3.4, 1.2);
  place('cityhall-planter', 438.6, -643.1, 0, 1);
  blockRect(438.6, -643.1, 3.4, 1.2);
  // 钟塔（地标 p_clock）：原尺寸 27 米 → 缩完 16.7 米；不投影
  place('clock-pylon', 428, -644.6);
  blockRect(428, -644.6, 4.4, 2.8);
  // 公告栏（门西边，正对前庭）：v1 = 听证会的大红通知
  place('notice-board', 431, -645.3, 0, HEARING ? 1 : 0);
  blockRect(431, -645.3, 3.4, 0.5);
  // 叫号的排队栏（门东边，往雨棚底下排；长条：长宽是最终的）
  place('queue-rail', 438.4, -644.6);
  blockRect(438.4, -645.22, 4.6, 0.15);
  blockRect(438.4, -643.98, 4.6, 0.15);
  // 开圆洞的雨棚（长条：长宽是最终的，高度原尺寸）；两棵棕榈从洞里穿出来；前沿三根柱
  {
    const [cx, cz] = [444.05, -646.7];
    place('cityhall-canopy', cx, cz);
    for (const x of CANOPY.cols) block({ x: cx + x, z: cz + CANOPY.d / 2 - 0.3, r: 0.2 });
    for (const [hx, hz] of CANOPY.holes) palm(cx + hx, cz + hz, 1.05);
    // 雨棚底下：等候的长椅（面朝南）
    bench(442.6, -646.6, 0);
    bench(449.2, -646.6, 0);
  }
  // 三根旗杆（前庭东头，雨棚和东边铺面之间）：蓝、白、红
  for (let i = 0; i < 3; i++) {
    place('flagpole', 453.6 + i * 2.6, -644, 0, i);
    block({ x: 453.6 + i * 2.6, z: -644, r: 0.3 });
  }

  // 画面上的人
  if (!HEARING) {
    // 平时：排队栏里三个人（背对镜头面朝门）、长椅上方一个在看公告栏的
    for (const [i, [x, z]] of [
      [437.0, -644.6],
      [438.3, -644.65],
      [439.7, -644.55],
    ].entries())
      person(x, z, Math.PI + (prnd() - 0.5) * 0.4, i * 3 + 1);
    person(432.7, -644.3, Math.PI - 0.5, 6);
  } else {
    // 听证会：台阶上讲台后一个人（面朝南），前庭里一群街坊（面朝北，三排错开，有人举手、有人拿着纸）
    person(RX - 2.2, -648.5, 0, 9);
    let v = 0;
    for (const [z, x0, n] of [
      [-646.1, 429.0, 6],
      [-645.0, 428.6, 7],
      [-643.9, 429.4, 6],
    ] as const)
      for (let i = 0; i < n; i++) {
        const x = x0 + i * 1.45 + (prnd() - 0.5) * 0.5;
        if (Math.abs(x - 434) < 0.9 && z > -646.6) continue; // 旗子跟前留空
        if (x > 436.2 && z > -645.4) continue; // 排队栏
        person(x, z + (prnd() - 0.5) * 0.3, Math.PI + (prnd() - 0.5) * 0.7, v++);
      }
    // 前庭西头一块"今晚听证会"小黑板（共用 a-board v2）
    place('a-board', 423.6, -643.4, 0.2, 2);
    block({ x: 423.6, z: -643.4, r: 0.4 });
  }

  // ══ 3. 楼东的石板路 + 楼背后的石板路 + 喷泉广场（缩完的世界坐标）═══════════
  // 一整块铺面（比 45 米宽：townwrap 不把它当"贴着楼的"搬走）：楼背后 408…446.4 × −667…−660.2（西接酒店草坪）、
  // 楼东 446.4…461.2 × −667…−649（前庭往北）、广场 456…487.8 × −683…−661（东边铺面背后那块往北让一让）
  {
    const plates: [number, number, number, number][] = [
      [408, FX1, -667, -660.2],
      [FX1, 461.2, -667, -649],
      [456, 487.8, -683, -667],
      [461.2, 487.8, -667, -661],
    ];
    const g = mergeGeometries(
      plates.map(([a, b, c, e]) =>
        new THREE.PlaneGeometry(b - a, e - c).rotateX(-Math.PI / 2).translate((a + b) / 2, Y.pave, (c + e) / 2),
      ),
    );
    put('flagstone', g, 448, -666);
    // 占地的矩形也要躲开"贴着楼"的判定（中心在带外，或比 45 米宽）
    claim({ x0: 408, x1: 456, z0: -667, z1: -660.2 });
    claim({ x0: 446.4, x1: 466, z0: -667, z1: -649 });
    claim({ x0: 456, x1: 487.8, z0: -683, z1: -661 });
  }
  // 喷泉（同原来 town.ts 的：池沿一圈 + 低一截的水 + 中间的柱子和小盆）
  const [fx, fz] = [475.9, -670];
  put('cap', new THREE.CylinderGeometry(3.7, 3.8, 0.55, 20, 1, true).translate(fx, 0.275, fz), fx, fz);
  put('cap', new THREE.RingGeometry(3.15, 3.7, 20).rotateX(-Math.PI / 2).translate(fx, 0.55, fz), fx, fz);
  put('water', new THREE.CircleGeometry(3.2, 20).rotateX(-Math.PI / 2).translate(fx, 0.4, fz), fx, fz);
  put('adobe', new THREE.CylinderGeometry(0.45, 0.6, 1.7, 8).translate(fx, 0.85, fz), fx, fz);
  put('cap', new THREE.CylinderGeometry(1.35, 0.9, 0.3, 12).translate(fx, 1.85, fz), fx, fz);
  put('water', new THREE.CircleGeometry(1.15, 12).rotateX(-Math.PI / 2).translate(fx, 2.01, fz), fx, fz);
  put('foam', new THREE.CylinderGeometry(0.16, 0.24, 0.7, 6).translate(fx, 2.0, fz), fx, fz);
  put('foam', new THREE.RingGeometry(1.5, 2.0, 14).rotateX(-Math.PI / 2).translate(fx, 0.412, fz), fx, fz);
  block({ x: fx, z: fz, r: 3.9 });
  // 喷泉旁三条长椅（面朝喷泉）、圆花池里五棵棕榈（散在广场边上）、三盏灯
  for (const [x, z] of [
    [481.2, -666.1],
    [470.0, -667.0],
    [474.7, -677.3],
  ])
    bench(x, z, Math.atan2(fx - x, fz - z));
  for (const [x, z, s] of [
    [463.4, -680.0, 1.1],
    [466.2, -673.5, 0.95],
    [462.8, -666.0, 1.05],
    [481.8, -678.0, 1.0],
    [483.6, -667.5, 1.15],
  ]) {
    cyl('adobe', 1.1, 0.5, x, 0, z, 'y', 10);
    palm(x, z, s, 0.5);
    block({ x, z, r: 1.3 });
  }
  for (const [x, z] of [
    [468.1, -662.6],
    [481.1, -664.0],
    [474.4, -680.5],
  ])
    lamp(x, z, Math.atan2(fx - x, fz - z));

  k.finish();
}
