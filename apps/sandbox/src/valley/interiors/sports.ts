// 体育用品店（设计稿 S1～S5）：北墙球拍墙（S2）、东北穿线角（S3）、西墙球墙、两排 A 字货架（握把 / 球包）、东墙鞋墙和衣架、
// 门口球罐金字塔（S1 会撞塌）、门东收银（S4）、门内购物车（S1）、西南寄卖架（S5）。
// 局部坐标：x 0…30（西 → 东）、z 0…24（北 → 南），南墙正中是门（x 13.5…16.5）；框架（interiors/index.ts）画地板、墙、门。
// 只改这个文件（和 assets/sports.ts 里 in- 开头的室内资产）。
//
// 构图（俯 45°、朝北；手机竖屏一屏 ≈ 17.5 米宽，整间店的进深一屏放得下）：
// - 北墙是主墙面：球拍墙五段（按重量从西往东 260 → 320 克，每段顶上一块重量牌），东北角穿线角（墙边工作台、线卷墙、穿线机、服务台）。
// - 配色（用户 2026-11-16：和外景拉开）：浅天蓝运动地胶、俱乐部蓝的墙（signBoard）、冷白货架、深海军蓝背板，荧光黄绿 / 红强调。
// - 门口进来：一条钴蓝的地毯（推车常走的路）直通球拍墙；左边是球（门口的金字塔、西墙球墙），右边是收银和购物车。
// - 中间两排 A 字架竖着摆（过道竖着，适合竖屏）；东边留白给衣架、鞋墙、试鞋凳；西南角寄卖架。
// 大件全部合成按材质的几个大网格（draw call 少）；挡路按件 c.block；互动锚点 SPOTS（下一关接玩法）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import { makeAsset } from '../assets';
import { IN_COBALT, IN_FLOOR, IN_GREEN, IN_NAVY, type InPool, inMat, inNight } from '../assets/sports';
import type { InteriorCtx, InteriorDef } from './index';

const W = 30;
const D = 24;

/** 互动锚点（局部坐标；yaw = 总监站在这儿时的朝向，0 = 朝南 +z、π = 朝北；card = 设计稿的卡）。下一关的玩法直接按名字接 */
export interface Spot {
  x: number;
  z: number;
  yaw: number;
  card: string;
  note: string;
}
export const SPOTS: Record<string, Spot> = {
  entry: { x: 15, z: 22, yaw: Math.PI, card: '-', note: '进门站的地方（= interiors/index.ts entryAt）' },
  cartTake: { x: 18.8, z: 20.5, yaw: 0, card: 'S1', note: '门东的购物车（两列 × 3 辆，车把朝北）：拿一辆' },
  pyramid: { x: 11.6, z: 19.6, yaw: 0, card: 'S1', note: '球罐金字塔中心（半径 1 米）：推车撞上会塌，罐子满地滚' },
  ballWallCans: {
    x: 2.9,
    z: 7.0,
    yaw: -Math.PI / 2,
    card: 'S1',
    note: '西墙球墙北段：单罐 / 四罐一组，贴近点一下进车',
  },
  ballWallMid: { x: 2.9, z: 12.1, yaw: -Math.PI / 2, card: 'S1', note: '西墙球墙中段' },
  ballCases: {
    x: 2.9,
    z: 15.5,
    yaw: -Math.PI / 2,
    card: 'S1',
    note: '西墙球墙南段最外一级：72 个装的比赛球纸箱（很沉）',
  },
  grips: { x: 9.7, z: 10.5, yaw: -Math.PI / 2, card: 'S1', note: '西排 A 字架（握把、避震器、护腕），过道里' },
  bags: { x: 9.7, z: 13.0, yaw: Math.PI / 2, card: 'S1', note: '东排 A 字架（球包），过道里' },
  racketWall0: { x: 3.3, z: 1.5, yaw: Math.PI, card: 'S2', note: '球拍墙 260 克（最轻）' },
  racketWall1: { x: 6.7, z: 1.5, yaw: Math.PI, card: 'S2', note: '球拍墙 275 克' },
  racketWall2: { x: 10.1, z: 1.5, yaw: Math.PI, card: 'S2', note: '球拍墙 290 克' },
  racketWall3: { x: 13.5, z: 1.5, yaw: Math.PI, card: 'S2', note: '球拍墙 305 克' },
  racketWall4: { x: 16.9, z: 1.5, yaw: Math.PI, card: 'S2', note: '球拍墙 320 克（最重）' },
  stringer: { x: 25.6, z: 4.5, yaw: Math.PI, card: 'S3', note: '穿线机（机器在 25.6, 3.6）：自己穿线时站在凳子这儿' },
  stringDesk: { x: 23.4, z: 7.3, yaw: Math.PI, card: 'S3', note: '穿线服务台前：交给穿线师 / 取件' },
  stringerStaff: { x: 23.4, z: 5.3, yaw: 0, card: 'S3', note: '店员：穿线师站在服务台里面' },
  stringPickup: { x: 26.0, z: 1.5, yaw: Math.PI, card: 'S3', note: '待取的拍子架（东边那张工作台的墙上）' },
  checkout: { x: 21.0, z: 20.4, yaw: Math.PI, card: 'S4', note: '收银台前：推车停这儿，车里的东西一件件放上扫码台' },
  scanner: { x: 21.0, z: 19.25, yaw: 0, card: 'S4', note: '扫码台（台面上，客人这边）' },
  cashier: { x: 22.2, z: 18.0, yaw: 0, card: 'S4', note: '店员：收银员站在 L 形柜台里面' },
  consign: { x: 4.4, z: 21.5, yaw: Math.PI, card: 'S5', note: '寄卖架前：一支支挂上去、按住拖一下定价' },
  consignBox: { x: 6.6, z: 21.0, yaw: Math.PI, card: 'S5', note: '地上那箱旧拍子（从俱乐部搬来的）' },
  apparel: { x: 23.5, z: 11.0, yaw: Math.PI / 2, card: '-', note: '圆衣架之间（网球衫、裙装）' },
  shoes: { x: 27.0, z: 13.0, yaw: Math.PI / 2, card: '-', note: '东墙鞋墙前' },
  shoeBench: { x: 25.2, z: 15.4, yaw: Math.PI, card: '-', note: '试鞋凳、量脚器' },
  featureTable: { x: 18.5, z: 12.8, yaw: Math.PI, card: 'S2', note: '新品展台（三支新拍躺着）' },
  swingZone: {
    x: 10.1,
    z: 2.6,
    yaw: 0,
    card: 'S2',
    note: '球拍墙前的试挥区（外场绿、白边）：拿下拍子在这儿掂一掂、空挥',
  },
  exit: { x: 15, z: 23.4, yaw: 0, card: '-', note: '门口（出去）' },
};

/** 摆一件资产（局部坐标、绕 y 转 rot、变体 v；y 抬高） */
function put(c: InteriorCtx, list: THREE.Object3D[], id: string, x: number, z: number, rot = 0, v = 0, y = 0) {
  const { obj } = makeAsset(id, { ...c.actx, variant: v });
  obj.position.set(x, y, z);
  obj.rotation.y = rot;
  list.push(obj);
  return obj;
}

/** 合并：所有资产按（材质, 投不投影）合成一个网格（局部坐标），夜灯（换材质）合在一起重新挂，灯光圈用房间的 */
function mergeAll(c: InteriorCtx, objs: THREE.Object3D[], pools: InPool[]) {
  const root = new THREE.Group();
  root.name = 'interior:sports';
  const by = new Map<string, { m: THREE.Material; cast: boolean; gs: THREE.BufferGeometry[] }>();
  const swaps = new Map<THREE.Material, THREE.Material>();
  for (const o of objs) {
    o.updateMatrixWorld(true);
    const sw = o.userData.inSwaps as Map<THREE.Material, THREE.Material> | undefined;
    if (sw) for (const [a, b] of sw) swaps.set(a, b);
    o.traverse((x) => {
      const mesh = x as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material as THREE.Material;
      const cast = mesh.castShadow && !mesh.userData.noCast;
      const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(
        mesh.matrixWorld,
      );
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
      const k = `${m.uuid}:${cast}`;
      const e = by.get(k) ?? { m, cast, gs: [] };
      e.gs.push(g);
      by.set(k, e);
    });
  }
  for (const { m, cast, gs } of by.values()) {
    const merged = mergeGeometries(gs);
    for (const g of gs) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.name = `interior:sports:${(m.userData.palKey as string | undefined) ?? m.name}`;
    if (!cast) mesh.userData.noCast = true;
    root.add(mesh);
  }
  inNight(root, swaps, pools);
  c.asset(root);
}

/** 地板：浅天蓝的运动地胶（南北向卷材）+ 门到球拍墙的一条钴蓝地毯（白边 1 纹素）；都在框架的地板（顶 y 0.02）上面错开 ≥ 1 厘米 */
function floor(c: InteriorCtx, list: THREE.Object3D[]) {
  const g = new THREE.Group();
  const flat = (w: number, d: number, x: number, y: number, z: number) =>
    new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z);
  const maple = new THREE.Mesh(flat(W, D, W / 2, 0.032, D / 2), inMat(c.actx, IN_FLOOR));
  const runner = new THREE.Mesh(flat(2.6, D - 3.9, W / 2, 0.044, 3.9 + (D - 3.9) / 2), inMat(c.actx, IN_COBALT));
  const lineM = c.actx.mat('line', { edge: 0.05, convex: 0 });
  const T = 0.09;
  const lines: THREE.BufferGeometry[] = [];
  // 球拍墙前一条外场绿的"试挥区"（S2：掂一掂、空挥一下），白边；东边鞋和衣服那片铺一块深海军蓝地垫（试鞋走两步）。
  // 店内配色（2026-11-16 重做）：冷、亮、干净 —— 不用木头和红土（桃 / 赭色和外景的沙漠一家）
  const swing = new THREE.Mesh(flat(17.0, 3.2, 10.1, 0.044, 0.7 + 1.6), inMat(c.actx, IN_GREEN));
  const shoeRug = new THREE.Mesh(
    flat(7.2, 8.6, 24.3, 0.044, 12.5),
    inMat(c.actx, IN_NAVY, { elem: { kind: 'paint', size: [22, 14], density: [0, 0.02] }, edge: 0.05, convex: 0 }),
  );
  const edgeLines = [
    // 试挥区：南边一条底线、两头两条边线（白，1 纹素）
    flat(17.0 - 0.36, T, 10.1, 0.056, 0.7 + 3.2 - 0.18),
    flat(T, 3.2 - 0.36, 1.6 + 0.18, 0.056, 0.7 + 1.6),
    flat(T, 3.2 - 0.36, 18.6 - 0.18, 0.056, 0.7 + 1.6),
    // 地胶：一圈白边
    flat(7.2 - 0.36, T, 24.3, 0.056, 8.2 + 0.18),
    flat(7.2 - 0.36, T, 24.3, 0.056, 16.8 - 0.18),
    flat(T, 8.6 - 0.36, 20.7 + 0.18, 0.056, 12.5),
    flat(T, 8.6 - 0.36, 27.9 - 0.18, 0.056, 12.5),
  ];
  // 店外的"空"：一大块和 main.ts 进门换的背景色 INSIDE_BG #231c2e 一样的地（三家统一），盖住四周 —— 从门进来和直接传送（at=、验收脚本）看到的是同一个封闭的房间，
  // 不露出天空的色带。比墙脚低 3 厘米（框架的地板底 −0.02），不投影、不受影、不描边
  const voidM = inMat(c.actx, {
    ramp: [0x181532, 0x181532, 0x181532],
    edge: 0,
    convex: 0,
    noShadowReceive: true,
  });
  const around = new THREE.Mesh(flat(W + 90, D + 110, W / 2, -0.03, D / 2 + 10), voidM);
  g.add(maple, runner, swing, shoeRug, around, ...[...lines, ...edgeLines].map((x) => new THREE.Mesh(x, lineM)));
  g.traverse((o) => {
    o.userData.noCast = true;
  });
  list.push(g);
}

function build(c: InteriorCtx) {
  const list: THREE.Object3D[] = [];
  floor(c, list);

  // ── 北墙：球拍墙五段（S2），西 → 东 = 轻 → 重；背贴墙（z 0），原点 z 0.3 ──
  for (let i = 0; i < 5; i++) put(c, list, 'in-sports-racket-wall', 3.3 + 3.4 * i, 0.3, 0, i);
  c.block({ x0: 1.6, x1: 18.6, z0: 0, z1: 0.7 });

  // ── 东北：穿线角（S3）——墙边两张工作台（线卷墙 / 待取的拍子）、穿线机、服务台（东头留口子进去）──
  put(c, list, 'in-sports-string-bench', 22.4, 0.4, 0, 0);
  put(c, list, 'in-sports-string-bench', 26.0, 0.4, 0, 1);
  c.block({ x0: 20.55, x1: 27.85, z0: 0, z1: 0.85 });
  put(c, list, 'in-sports-stringer', 25.6, 3.6);
  c.block({ x: 25.85, z: 3.5, r: 0.8 });
  put(c, list, 'in-sports-string-desk', 23.4, 6.3);
  c.block({ x0: 20.75, x1: 26.05, z0: 5.9, z1: 6.7 });

  // ── 西墙：球墙四段（台阶式，往墙升高），南头一块 BALLS 牌 ──
  for (let i = 0; i < 4; i++) put(c, list, 'in-sports-ball-wall', 1.1, 5.3 + 3.4 * i, 0, i);
  put(c, list, 'in-sports-sign', 1.15, 17.18, 0, 2, 1.62);
  for (const x of [0.35, 1.95]) c.put('ironwork', box(0.09, 1.62, 0.09, x, 0, 17.2));
  c.block({ x0: 0, x1: 2.3, z0: 3.6, z1: 17.3 });

  // ── 中间：两排 A 字架（西 = 握把配件、东 = 球包），南头端架朝门 ──
  put(c, list, 'in-sports-gondola', 7.4, 11.4, 0, 0);
  put(c, list, 'in-sports-gondola', 12.0, 11.4, 0, 1);
  c.block({ x0: 6.6, x1: 8.2, z0: 6.65, z1: 16.6 });
  c.block({ x0: 11.2, x1: 12.8, z0: 6.65, z1: 16.6 });

  // ── 门口右前方的空地里：新品展台 ──
  put(c, list, 'in-sports-feature-table', 18.5, 11.5);
  c.block({ x0: 17.55, x1: 19.45, z0: 10.85, z1: 12.15 });

  // ── 东边：鞋墙两段（贴东墙）+ SHOES 牌、两个圆衣架、试鞋凳 ──
  put(c, list, 'in-sports-shoe-wall', 29.1, 11.0, 0, 0);
  put(c, list, 'in-sports-shoe-wall', 29.1, 15.0, 0, 1);
  put(c, list, 'in-sports-sign', 28.95, 17.08, 0, 4, 1.45);
  for (const x of [28.1, 29.8]) c.put('ironwork', box(0.09, 1.45, 0.09, x, 0, 17.1));
  c.block({ x0: 28.15, x1: 30, z0: 9, z1: 17.2 });
  put(c, list, 'in-sports-clothes-rack', 25.2, 9.6, 0, 0);
  put(c, list, 'in-sports-clothes-rack', 22.0, 12.0, 0.6, 1);
  c.block({ x: 25.2, z: 9.6, r: 0.85 });
  c.block({ x: 22.0, z: 12.0, r: 0.85 });
  put(c, list, 'in-sports-shoe-bench', 25.2, 14.6);
  c.block({ x0: 24.15, x1: 26.25, z0: 14.3, z1: 14.9 });
  c.block({ x: 26.52, z: 14.68, r: 0.3 });

  // ── 门口：左边球罐金字塔（S1），右边收银（S4）和购物车（S1）──
  put(c, list, 'in-sports-pyramid', 11.6, 19.6);
  c.block({ x: 11.6, z: 19.6, r: 1.05 });
  c.block({ x: 12.75, z: 19.85, r: 0.2 });
  put(c, list, 'in-sports-checkout', 22.6, 19.2);
  put(c, list, 'in-sports-sign', 20.4, 18.95, 0, 5, 1.9);
  c.put('ironwork', box(0.09, 0.9, 0.09, 20.4, 1.0, 18.92));
  c.block({ x0: 19.55, x1: 25.65, z0: 18.7, z1: 19.7 });
  c.block({ x0: 24.65, x1: 25.65, z0: 16.3, z1: 19.7 });
  // 购物车两列 × 3，套在一起、车把朝北（拿车的人站在北边）
  for (const x of [18.4, 19.2]) for (const z of [21.7, 22.15, 22.6]) put(c, list, 'in-sports-cart', x, z, Math.PI);
  c.block({ x0: 18.0, x1: 19.6, z0: 21.15, z1: 23.2 });

  // ── 西南：寄卖架（S5）+ 地上一箱旧拍子 ──
  put(c, list, 'in-sports-consign-rack', 5.0, 20.0);
  c.block({ x0: 2.35, x1: 7.65, z0: 19.55, z1: 20.45 });
  c.block({ x: 6.6, z: 20.95, r: 0.45 });

  // ── 墙顶的射灯：北墙 5 盏，东西墙各 3 盏（灯头朝屋里）──
  for (const x of [4, 9.5, 15, 20.5, 26]) put(c, list, 'in-sports-wall-lamp', x, -0.2, 0, 0, 4.5);
  for (const z of [6, 12, 18]) {
    put(c, list, 'in-sports-wall-lamp', -0.2, z, Math.PI / 2, 0, 4.5);
    put(c, list, 'in-sports-wall-lamp', W + 0.2, z, -Math.PI / 2, 0, 4.5);
  }

  // 夜里的灯光圈：房间铺 12 个（daylight 一次最多挑 12 个离镜头最近的）
  const pools: InPool[] = [];
  for (const [x, z] of [
    [4, 2.6],
    [11, 2.6],
    [18, 2.6],
    [25.5, 3],
    [4.5, 11.5],
    [10, 11.5],
    [17.5, 11.5],
    [25.5, 11.5],
    [5, 20.2],
    [12, 20.2],
    [19, 20.6],
    [25.5, 20.2],
  ] as const)
    pools.push({ x, z, r: 5.6, h: 4.6 });
  mergeAll(c, list, pools);
}

export const INTERIOR_SPORTS: InteriorDef = {
  id: 'sports',
  name: '体育用品店',
  w: W,
  d: D,
  floor: 'tile',
  wall: 'signBoard',
  poi: 'p_sports',
  build,
};
