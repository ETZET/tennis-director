// 餐馆（第二批办事楼；2026-11-18 关卡 1 灰盒 → 关卡 2/3 资产）。这个文件归餐馆的代理；资产在 src/valley/assets/diner.ts。
// 说明、资产表、配色：docs/lab/2026-11-07-3d-pixel/valley-civic.md「餐馆」。
//
// 用途：找人（镇上人吃饭聊天的地方：招场地工、教练，听别处的线索）。看点：从街上隔着整面玻璃看得到里面坐着的人。
// 形式：Googie 咖啡店 —— 往南翘的斜屋顶（珊瑚红封檐）、整面玻璃、门西一根斜着的高杆招牌（DINER + CAFE + 星芒）、
// 门东石墩上一块招聘 / 寻人软木板；门前一排车位。
//
// 坐标：layout.ts 的 diner 那一行只是个底座（h 0.2 + build.ts 的屋顶板 = 0.47 米的地坪）；墙、玻璃、屋顶、店堂都是资产。
// 小镇的比例（townscale.ts）：楼按缩放框 FRAMES 'diner'（轴 = 南门门口 318.6, −556）缩 TOWN_K，人不缩。
// 资产按**缩完的真米数**画（卡座、吧台凳、人是真人尺寸）：贴着楼的（框里）位置过 toRaw()（框的逆变换）、scale = 1 / k，
// townwrap 再缩回来正好落在写的地方。框外的（停车场、车、棕榈、挡车石）直接写最终坐标：平铺的 townwrap 不动，
// 立着的小件绕自己的落地点缩 TOWN_K（挡车石的尺寸先除 TOWN_K，车和棕榈同镇上别的）。
// 随机只用 d.rng('valley:diner')。
import * as THREE from 'three';
import { box } from '../../../clubsite/render/geo';
import { makeAsset } from '../../assets';
import { DINER } from '../../assets/diner';
import { bake, kerbMat, kerbRing, lotMark, stainGeo } from '../../assets/hardware';
import type { DetailCtx } from '../../build';
import { BUILDINGS, distToLine, ROADS } from '../../layout';
import { atWorld, MOVE } from '../../relocate';
import { FRAMES_SRC, TOWN_K } from '../../townscale';
import { siteKit, Y } from './kit';

/** 缩完的楼（底座）：x 310.2…320.2 × z −562.5…−556（旧坐标：layout 的世界坐标减掉 relocate.ts 的 MOVE.diner） */
const B = (() => {
  const o = BUILDINGS.find((q) => q.id === 'diner');
  if (!o) return { x: 315.2, z: -559.25, w: DINER.W, d: DINER.D, h: 0.124 };
  return { ...o, x: o.x - MOVE.diner[0], z: o.z - MOVE.diner[1] };
})();
const BX0 = B.x - B.w / 2;
const BX1 = B.x + B.w / 2;
/** 朝南的门面线（玻璃） */
const FZ = B.z + B.d / 2;
const BZ0 = B.z - B.d / 2;
/** 门（世界 x）—— 同 layout.ts 的 p_diner 门槛 */
const DOOR_X = B.x + DINER.DOOR_X;

/**
 * 玩法锚点（缩完的世界坐标）：总监在这儿干什么。以后做互动用。
 */
export const SPOTS = {
  /** 门口的旗子（build.ts 立的）：进门 */
  door: { x: DOOR_X, z: FZ + 3, note: '进门：餐馆是找人的地方（总监的时间花在这儿，俱乐部那边没人看）' },
  /** 门东石墩上的软木板 */
  board: {
    x: DOOR_X + 1.1,
    z: FZ + 0.9,
    note: '看软木板：招聘启事（场地工、教练来应聘的条子）、寻人、别处的消息（卡从这儿来）',
  },
  /** 靠窗卡座（站在玻璃外面看得到谁坐在里面） */
  booth: {
    x: BX0 + 3.2,
    z: FZ + 0.9,
    note: '隔着玻璃看卡座：今天谁在（找的人坐在这儿），点一个人 → 进去拼桌聊（花时间，换线索 / 人）',
  },
  /** 吧台（店内） */
  counter: {
    x: BX0 + 4.0,
    z: FZ - 2.4,
    note: '坐吧台：跟老板 / 服务员打听镇上的事（谁在找工作、哪儿出了事），要一杯咖啡的工夫',
  },
} as const;

/** 缩放框（旧坐标，轴 = 门口） */
function frameOf(): { px: number; pz: number; k: number } {
  const f = FRAMES_SRC.find((q) => q.id === 'diner');
  return f ? { px: f.px, pz: f.pz, k: TOWN_K } : { px: 0, pz: 0, k: 1 };
}

export function detailDiner(d: DetailCtx): void {
  const rnd = d.rng('valley:diner');
  const k = siteKit(d, rnd);
  const { claim, car, palm, addInst } = k;
  const F = frameOf();
  const toRaw = (x: number, z: number): [number, number] => [F.px + (x - F.px) / F.k, F.pz + (z - F.pz) / F.k];
  /** 贴着楼的资产：最终坐标 (x, y, z)，绕 y 转 rot */
  const placeA = (id: string, x: number, z: number, y = 0, rot = 0, v = 0): THREE.Object3D => {
    const { obj } = makeAsset(id, v ? { ...d.actx, variant: v } : d.actx);
    const [rx, rz] = toRaw(x, z);
    obj.position.set(rx, y / F.k, rz);
    obj.rotation.y = rot;
    obj.scale.setScalar(1 / F.k);
    d.asset(obj);
    return obj;
  };
  /** 贴着楼的挡路矩形（最终坐标） */
  const blockA = (x0: number, x1: number, z0: number, z1: number) => {
    const [a, b] = toRaw(x0, z0);
    const [c, e] = toRaw(x1, z1);
    d.block({ poly: [[a, b] as const, [c, b] as const, [c, e] as const, [a, e] as const] });
  };

  // ══ 楼 + 店堂（原点都是楼的中心）══════════════════════════════════
  for (const id of ['diner-shell', 'diner-floor', 'diner-booths', 'diner-counter', 'diner-pendants', 'diner-patrons'])
    placeA(id, B.x, B.z);
  blockA(BX0 - 0.25, BX1 + 0.25, BZ0 - 0.25, FZ + 0.25);

  // 门东石墩上的软木板（板底离地坪 0.8 米，贴在墩子的南面）+ 一个站在板前看的路人
  const pierX = (DOOR_X + DINER.DOOR_W / 2 + 0.1 + BX1) / 2;
  placeA('diner-corkboard', pierX, FZ + 0.03, DINER.FLOOR + 0.8);
  placeA('diner-reader', pierX + 0.15, FZ + 0.9);

  // 高杆招牌：门西、楼西南角前（往东斜 10°，主牌伸到屋顶西头前面）
  const pylonX = BX0 - 1.0;
  const pylonZ = FZ + 0.5;
  placeA('diner-pylon', pylonX, pylonZ);
  blockA(pylonX - 0.75, pylonX + 0.75, pylonZ - 0.55, pylonZ + 0.55);

  // ══ 门前：一条陶砖人行（贴着楼，框里）+ 停车场（框外，最终坐标）══════
  const WALK1 = FZ + 1.8;
  {
    const [x0, z0] = toRaw(BX0 - 1.6, FZ);
    const [x1, z1] = toRaw(BX1 + 1.0, WALK1);
    k.flat('tile', x1 - x0, z1 - z0, (x0 + x1) / 2, Y.pave2 / F.k, (z0 + z1) / 2);
  }
  // 停车场：一块水泥（中心在框外 → townwrap 不动），不压印第安峡谷路（含弯道）
  const LOT = { x0: BX0 - 4.5, x1: BX1 + 1.3, z0: WALK1, z1: WALK1 + 10 };
  const roadClear = (x: number, z: number) => {
    const [wx, wz] = atWorld(x, z);
    return ROADS.filter((r) => r.kind !== 'trail').every((r) => distToLine(r.pts, wx, wz) > r.w / 2 + 0.6);
  };
  for (const [x, z] of [
    [LOT.x0, LOT.z0],
    [LOT.x1, LOT.z0],
    [LOT.x0, LOT.z1],
    [LOT.x1, LOT.z1],
  ])
    if (!roadClear(x, z)) console.warn(`valley diner: 停车场的角 ${x.toFixed(1)},${z.toFixed(1)} 压到路`);
  // 铺面 lotPave（暖铺面、1.5 米一道伸缩缝，2026-11-21 critic M5）+ 一圈路缘（西、东、南；南沿西头留 5 米的车道口接主街）+ 车位里的油渍：
  // 原来一块平涂水泥、没有边，像贴在沙上的一张纸。路缘、油渍矮于 0.15 米（townwrap 当平铺的不缩），烘成一组
  k.flat('lotPave', LOT.x1 - LOT.x0, LOT.z1 - LOT.z0, (LOT.x0 + LOT.x1) / 2, Y.pave, (LOT.z0 + LOT.z1) / 2);
  claim(LOT);
  const marks: THREE.Object3D[] = [];
  const kerb = kerbMat(d.actx);
  const mark = lotMark(d.actx);
  const addG = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.userData.noCast = true;
    marks.push(mesh);
  };
  for (const g of kerbRing(LOT.x0, LOT.x1, LOT.z0, LOT.z1, 0.14, 0.3, ['n', 's'])) addG(g, kerb);
  addG(box(LOT.x1 - LOT.x0 - 5.3, 0.14, 0.3, (LOT.x0 + 5 + LOT.x1 - 0.3) / 2, 0, LOT.z1 - 0.15), kerb);
  // 一排车头朝店的车位（门口那段不停车：旗子 + 进门的路）；车位头一块挡车石（离框 0.05 米：框里的东西会跟着楼缩）
  const ROW_Z = WALK1 + 2.6;
  const SLOT = 2.3;
  const STOP_Z = F.pz + 3.05;
  const slots: number[] = [];
  for (let x = LOT.x0 + 0.3 + SLOT / 2; x + SLOT / 2 < DOOR_X - 1.4; x += SLOT) slots.push(x);
  for (let i = 0; i <= slots.length; i++) {
    const lx = LOT.x0 + 0.3 + i * SLOT;
    k.flat('lotPaint', 0.09, 4.4, lx, Y.pave2, ROW_Z); // 车位线只一条 2 纹素的漆线（critic M13）
  }
  // 车（离门近的多停）：一辆固定的奶油黄敞篷在靠门的那格；一半车位一块油渍（车头那头）
  const mrnd = d.rng('valley:diner:marks');
  for (const x of slots)
    if (mrnd() < 0.6)
      addG(stainGeo(x + (mrnd() - 0.5) * 0.5, ROW_Z - 0.9 - mrnd() * 0.6, 0.4, Y.pave + 0.006, mrnd), mark);
  {
    const g = bake(marks, 'valley:diner:lot');
    d.asset(g, d.regionOf((LOT.x0 + LOT.x1) / 2, (LOT.z0 + LOT.z1) / 2));
  }
  for (const [i, x] of slots.entries()) {
    k.bx('concrete', 1.6 / TOWN_K, 0.15 / TOWN_K, 0.27 / TOWN_K, x, 0, STOP_Z); // 挡车石（框外的小件 townwrap 缩 TOWN_K）
    const near = i === slots.length - 1;
    const roll = rnd();
    if (near) car(x, ROW_Z + 0.6, Math.PI, 'flowerYellow');
    else if (roll < 0.55) car(x, ROW_Z + 0.6, Math.PI);
  }
  // 停车场西南角一棵棕榈 + 两丛龙舌兰（框外，最终坐标）
  palm(LOT.x0 - 0.8, LOT.z1 - 1.5, 0.9 + rnd() * 0.15);
  for (const [ax, az] of [
    [LOT.x0 - 1.6, LOT.z1 - 0.4],
    [LOT.x0 - 0.2, LOT.z1 + 0.3],
  ])
    addInst('agave', { x: ax, z: az, s: 0.8 + rnd() * 0.3, rot: rnd() * 6, reg: d.regionOf(ax, az) });
  k.finish();
}
