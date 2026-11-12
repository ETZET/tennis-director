// 餐车院子的导航（clubsite/play 的 NavSpec）：总监（play.ts）和院子里的客人（life.ts）共用一份。
// 能走：FOOD_COURT（整块，铺地画到哪就能走到哪）+ ARCADE_YARD + 长廊 + 西步道北头；
// 挡路：摆好的车、小推车、桌子、凉棚柱、回收站、回收台、补货堆、水站、花盆、草皮角的板和叠叠乐、地上的龙舌兰、钟楼、球员拱门的两根柱。
// 大世界（clubwalk）里 z > −30、x > −22.6 那条归中心球场（regions.ts），这份导航在那儿不管它。
// 塔可车能走进去（总监高峰帮忙）：车里的过道是一块 0.85 米高的平台，后门外的铁台阶是一段坡；客人那份（inside: false）整辆车都挡着。
import * as THREE from 'three';
import { footprint, type NavSpec, type Poly, type Ramp, type Rect, type Shape } from '../clubsite/play';
import { ARCADE_YARD, FOOD_COURT, HOUSE, PERGOLA, PLAYERS_GATE, TRUCK_FLOOR, TRUCKS } from './layout';

/** 导航网格的范围 */
export const NAV_BOUNDS: Rect = { x0: -47, x1: -19.6, z0: -42.6, z1: -2.8 };

/** 按包围盒挡路的资产（SLOTS 的 asset 名；塔可车另算） */
const BOXED = new Set([
  'truck-coffee',
  'truck-pizza',
  'trailer-burger',
  'drinks-cart',
  'cart-paletas',
  'cart-churros',
  'tuktuk-boba',
  'long-table',
  'picnic-table',
  'bin-station',
  'tray-return',
  'supply-stack',
  'water-station',
]);

type V2 = readonly [number, number];
const num2 = (v: unknown, d: V2): V2 => (Array.isArray(v) && v.length >= 2 ? [Number(v[0]), Number(v[1])] : d);
const rectOf = (v: unknown, d: Rect): Rect => (v && typeof v === 'object' && 'x0' in v ? { ...(v as Rect) } : d);

/** 塔可车的车里（本地坐标，资产的 userData 优先）：后门、过道、台阶 */
export function tacoInside(taco: THREE.Object3D | undefined) {
  const ud = taco?.userData ?? {};
  const door =
    ud.door && typeof ud.door === 'object' ? (ud.door as { x0: number; x1: number }) : { x0: -2.5, x1: -1.6 };
  const aisle = rectOf(ud.aisle, { x0: -2.6, x1: 1.2, z0: -0.6, z1: 0.8 });
  const steps = rectOf(ud.steps, { x0: door.x0, x1: door.x1, z0: -1.75, z1: -1.2 });
  const helper = num2(ud.spots?.helper, [-1.2, 0.75]);
  const back = num2(ud.spots?.back, [(door.x0 + door.x1) / 2, -1.95]);
  return { door, aisle, steps, helper, back, floor: Number(ud.floor ?? TRUCK_FLOOR) };
}

/** 贴地部件的高度上限（米，mesh 底比资产脚下高这么多的不挡路：伞面、伞杆上段、招牌） */
const LOW = 1.3;
/** rotY 是不是 90° 的整数倍（轴对齐的外框就是脚印） */
const axisAligned = (r: number) => {
  const q = r / (Math.PI / 2);
  return Math.abs(q - Math.round(q)) < 1e-3;
};
/**
 * 转了角度的资产：轴对齐的外框会把转出去的三角、头顶上的伞都算进去。
 * 改用贴地部件（mesh 底 < LOW）在资产本地坐标里的外框，每边收 shrink，四角转回世界 → 多边形。
 */
function lowFootprint(o: THREE.Object3D, shrink: number): Poly | null {
  o.updateMatrixWorld(true);
  const inv = o.matrixWorld.clone().invert();
  const y0 = o.getWorldPosition(new THREE.Vector3()).y;
  const box = new THREE.Box3();
  const wb = new THREE.Box3();
  const m = new THREE.Matrix4();
  o.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    // InstancedMesh（托盘、吉事果、汉堡）：外框要含每个实例
    const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
    if (inst) inst.computeBoundingBox();
    else if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const gb = (inst ? inst.boundingBox : mesh.geometry.boundingBox) as THREE.Box3;
    if (wb.copy(gb).applyMatrix4(mesh.matrixWorld).min.y - y0 >= LOW) return;
    box.union(wb.copy(gb).applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld)));
  });
  if (box.isEmpty()) return null;
  const { min, max } = box;
  const corners: [number, number][] = [
    [min.x + shrink, min.z + shrink],
    [max.x - shrink, min.z + shrink],
    [max.x - shrink, max.z - shrink],
    [min.x + shrink, max.z - shrink],
  ];
  return {
    poly: corners.map(([x, z]) => {
      const w = o.localToWorld(new THREE.Vector3(x, 0, z));
      return [w.x, w.z] as const;
    }),
  };
}

/** 本地矩形 → 世界（车都是 rotY 0：只平移） */
const shift = (r: Rect, x: number, z: number): Rect => ({ x0: r.x0 + x, x1: r.x1 + x, z0: r.z0 + z, z1: r.z1 + z });

/**
 * 导航规格。scene 里的资产已经摆好（名字 slot:<id>）；inside = 塔可车能不能进（总监 true，客人 false）。
 */
export function foodNavSpec(
  scene: THREE.Object3D,
  groundAt: (x: number, z: number) => number,
  inside: boolean,
): NavSpec {
  const blocked: Shape[] = [];
  const ramps: Ramp[] = [];
  scene.traverse((o) => {
    if (!o.name.startsWith('slot:')) return;
    const asset = o.userData.asset as string | undefined;
    if (asset && BOXED.has(asset)) {
      // 转了角度的（东边的小推车、拖车、回收台）按贴地部件转好的多边形挡；摆正的照旧按外框
      const r = axisAligned(o.rotation.y) ? footprint(o, 0.06) : lowFootprint(o, 0.06);
      // 咖啡车车头（东头）的保险杠、大灯比车身凸出 0.1–0.15 米：挡路收到车身，
      // 咖啡车和塔可车之间那条去车背后的小道（车西头离东翼墙只有 0.4 米，过不去）才有两格宽
      if (r && asset === 'truck-coffee' && 'x1' in r)
        r.x1 = Math.min(r.x1, o.position.x + TRUCKS.coffee.len / 2 - 0.06);
      if (r) blocked.push(r);
    }
  });
  const slot = (id: string) => scene.getObjectByName(`slot:${id}`) ?? undefined;
  // 塔可车：客人那份整辆挡；总监那份留出后门、过道，墙、驾驶室、窗下台面挡住
  const T = TRUCKS.taco;
  const taco = slot('truck-taco');
  const L = { x0: -T.len / 2, x1: T.len / 2, z0: -T.dep / 2, z1: T.dep / 2 };
  if (!inside) blocked.push(shift({ x0: L.x0 - 0.05, x1: L.x1 + 0.05, z0: L.z0 - 0.05, z1: L.z1 + 0.3 }, T.x, T.z));
  else {
    const t = tacoInside(taco);
    const a = t.aisle;
    const wall = 0.12;
    const parts: Rect[] = [
      // 北墙（后门两边）
      { x0: L.x0, x1: t.door.x0, z0: L.z0, z1: a.z0 },
      { x0: t.door.x1, x1: L.x1, z0: L.z0, z1: a.z0 },
      // 西墙、驾驶室（含过道东头的隔板）
      { x0: L.x0 - 0.05, x1: a.x0, z0: L.z0, z1: L.z1 + 0.3 },
      { x0: a.x1, x1: L.x1 + 0.05, z0: L.z0, z1: L.z1 + 0.3 },
      // 窗下的台面、窗台（过道南边）
      { x0: a.x0 - wall, x1: a.x1 + wall, z0: a.z1, z1: L.z1 + 0.3 },
    ];
    for (const r of parts) blocked.push(shift(r, T.x, T.z));
    // 过道（车地板高）+ 门洞 + 台阶（坡）：坡长 0.95 米（A* 每格高差要 ≤ stepUp / 2）
    ramps.push({ ...shift({ x0: a.x0, x1: a.x1, z0: a.z0 - 0.4, z1: a.z1 }, T.x, T.z), from: t.floor, to: t.floor });
    ramps.push({
      ...shift({ x0: t.door.x0, x1: t.door.x1, z0: L.z0 - 0.8, z1: a.z0 - 0.4 }, T.x, T.z),
      from: 0,
      to: t.floor,
      axis: 'z',
    });
  }
  // 凉棚的柱子（资产给的 posts 优先）
  const perg = slot('pergola');
  const own = perg?.userData.posts as V2[] | undefined;
  const posts =
    own && perg ? own.map(([lx, lz]) => [perg.position.x + lx, perg.position.z + lz] as V2) : defaultPosts();
  for (const [x, z] of posts) blocked.push({ x, z, r: 0.2 });
  // 草皮角：两块板 + 叠叠乐（不是整块草皮）
  const lawn = slot('lawn-games');
  if (lawn) {
    const boards = (lawn.userData.boards as number[][] | undefined) ?? [
      [-3.4, 0, 0.1],
      [1.6, 0, 0.1],
    ];
    for (const b of boards) {
      const x = lawn.position.x + b[0];
      const z = lawn.position.z + (b.length > 2 ? b[2] : b[1]);
      blocked.push({ x0: x - 0.65, x1: x + 0.65, z0: z - 0.35, z1: z + 0.35 });
    }
    const tw = num2(lawn.userData.towerAt, [3.4, -0.2]);
    blocked.push({ x: lawn.position.x + tw[0], z: lawn.position.z + tw[1], r: 0.4 });
  }
  // 花盆（陶罐 + 龙舌兰）
  scene.traverse((o) => {
    if (o.name.startsWith('slot:pot-') && !o.name.startsWith('slot:pot-agave'))
      blocked.push({ x: o.position.x, z: o.position.z, r: 0.42 });
  });
  // 地上的龙舌兰（不在花盆里的那几棵）：叶子铺开 ≈ 0.7 米半径，挡芯 0.4·s（加上身体半径正好到叶尖）
  scene.traverse((o) => {
    if (o.name.startsWith('slot:agave-')) blocked.push({ x: o.position.x, z: o.position.z, r: 0.4 * o.scale.x });
  });
  // 钟楼
  const tw = HOUSE.tower;
  blocked.push({ x0: tw.x - tw.w / 2, x1: tw.x + tw.w / 2, z0: tw.z - tw.w / 2, z1: tw.z + tw.w / 2 });
  // 球员拱门的两根柱（terrain.ts 画的体块：1.0 × 0.9 米，门洞南北两边）
  const G = PLAYERS_GATE;
  for (const s of [-1, 1]) {
    const z = G.z + s * (G.span / 2 + 0.45);
    blocked.push({ x0: G.x - 0.5, x1: G.x + 0.5, z0: z - 0.45, z1: z + 0.45 });
  }

  return {
    groundAt,
    bounds: NAV_BOUNDS,
    walkable: [
      { ...FOOD_COURT },
      // 球员通道往东接 clubstadium 的球员拱门
      { x0: -26, x1: -20.2, z0: -22.4, z1: -19.6 },
      { ...ARCADE_YARD },
      // 长廊（东西出画）+ 西步道北头
      { x0: NAV_BOUNDS.x0, x1: NAV_BOUNDS.x1, z0: FOOD_COURT.z1, z1: -4.4 },
      { x0: -38.5, x1: -34.5, z0: -4.4, z1: NAV_BOUNDS.z1 },
    ],
    blocked,
    ramps,
    stepUp: 0.45,
  };
}

/** 凉棚柱子（资产没给 posts 时）：四角 + 东西每 3.4 米，北南两排 */
function defaultPosts(): V2[] {
  const out: V2[] = [];
  const w = PERGOLA.x1 - PERGOLA.x0;
  for (let i = 0; i <= 3; i++) for (const z of [PERGOLA.z0, PERGOLA.z1]) out.push([PERGOLA.x0 + (w * i) / 3, z] as V2);
  return out;
}

/** 本地点 → 世界（资产转了 rotY） */
export function toWorld(obj: THREE.Object3D, lx: number, lz: number, ly = 0): THREE.Vector3 {
  obj.updateMatrixWorld(true);
  return obj.localToWorld(new THREE.Vector3(lx, ly, lz));
}
