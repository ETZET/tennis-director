// 五金大超市：盒子 x 352…400 × z −600…−572（h 8）；东头园艺棚 400…420 × −588…−572、卸货台 400…436 × −602…−588；
// 南边停车场 339…436 × −572…−524（印第安峡谷路进来的车道 hardware_lot 走 z −557.25，再到东头 x 428 拐北上卸货台 —— 汽车开得进来、停得下）。
// 构图、资产清单：docs/lab/2026-11-07-3d-pixel/valley-town.md「3. 五金大超市」。这个文件归五金店的资产代理（批 H）；资产画在 src/valley/assets/hardware.ts。
// 用户 2026-11-16 定：主色 = 芥末黄（hwMustard）+ 深海军蓝（hwNavy），不用青绿（俱乐部的颜色）。
// 规矩：入口朝南；门头正前方 3 米是旗子（p_hardware 门槛 (365, −569.5)），那一圈不放东西；挂在立面上的东西只在南面；
// 车道上不放东西：灰盒走 kit 的车道守卫，资产走这里的 place()（同一个 hitsRoad 判据，碰到就不放、记一条）。
import * as THREE from 'three';
import { box } from '../../../clubsite/render/geo';
import { REUSED } from '../../../clubsite/reuse';
import { makeAsset } from '../../assets';
import {
  arcGeo,
  BARN,
  bake,
  island,
  kerbMat,
  kerbRing,
  lotMark,
  nightSwap,
  poolAt,
  stainGeo,
} from '../../assets/hardware';
import type { DetailCtx } from '../../build';
import type { AssetFn } from '../../ctx';
import { EL, TOWN_EL } from '../../palette';
import { TOWN_K } from '../../townscale';
import { hitsRoad, siteKit, Y } from './kit';

export function detailHardware(d: DetailCtx): void {
  // 随机流：同 town.ts 第 1b 节原来那条（town.ts 在第 1b 节之前不取随机数 → 新开的 'valley:town' 流和原来一个数不差，停车场的车没变）。
  // 改了这里的取数次数不影响 town.ts（它在原来第 1b 节的位置跳过固定的 153 个数）。
  const rnd = d.rng('valley:town');
  const k = siteKit(d, rnd);
  const { flat, blockRect, car, palm, lamp, pool, block, claim } = k;
  /** 放一个资产（世界坐标、绕 y 转 rot、变体 v）；有部件掉进车道就整件不放 */
  const place = (id: string, x: number, z: number, rot = 0, v = 0) => {
    const { obj } = makeAsset(id, { ...d.actx, variant: v });
    obj.position.set(x, 0, z);
    obj.rotation.y = rot;
    obj.updateMatrixWorld(true);
    let hit = false;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!hit && m.isMesh && hitsRoad(m.geometry, m.matrixWorld)) hit = true;
    });
    if (hit) {
      console.warn(`valley hardware: ${id} @ ${x},${z} 压到车道，没放`);
      return null;
    }
    d.asset(obj);
    return obj;
  };
  /** 放 + 挡路（矩形按转角） */
  const placeB = (id: string, x: number, z: number, w: number, dd: number, rot = 0, v = 0) => {
    if (place(id, x, z, rot, v)) blockRect(x, z, w, dd, rot);
  };

  // ── 大盒子 + 门头 ──
  place('bigbox-shell', 376, -586);
  placeB('bigbox-entry', 365, -570.75, 11, 2.5);
  flat('tile', 48, 6, 376, Y.pave, -569); // 门前人行台（陶砖）
  for (const x of [359.6, 362, 368, 370.4]) {
    place('bollard', x, -566.6);
    block({ x, z: -566.6, r: 0.25 });
  }
  // 入口西边的购物车栏；西侧（hardware_side）丙烷笼、购物车回收栏（竖着放）
  placeB('cart-corral', 355.4, -568.7, 3.2, 1.4);
  placeB('propane-cage', 346, -578, 2.0, 1.0);
  placeB('cart-corral', 346, -586, 3.2, 1.4, Math.PI / 2, 1);
  // 门前展销（东半边沿墙，离墙 0.6 米）：袋装沙三托、灌溉管架、线漆三托（在 PAINT 小招牌下面）
  const dz = -570.6;
  for (const [x, v] of [
    [375.4, 0],
    [376.75, 1],
    [378.3, 2],
  ] as const)
    placeB('pallet-sand', x, dz, 1.2, 1.0, 0, v);
  placeB('pipe-rack', 382.6, dz - 0.1, 4, 1.2);
  for (const [x, v] of [
    [386.4, 0],
    [387.8, 1],
    [389.3, 2],
  ] as const)
    placeB('pallet-paint', x, dz, 1.2, 1.0, 0, v);

  // ── 园艺棚（院子铺陶砖；墙、遮阳网、拱牌在资产里）──
  flat('tile', 20, 16, 410, Y.pave, -580); // 陶砖铺地（园艺棚常见的砖铺，和门前人行台一样）
  place('garden-center', 410, -580);
  for (const [x, z, w, dd] of [
    [403.5, -572.15, 7, 0.3],
    [416.5, -572.15, 7, 0.3],
    [419.85, -580, 0.3, 15.4],
    [407.8, -587.85, 15, 0.3],
  ] as const)
    blockRect(x, z, w, dd);
  for (const x of [400.4, 410, 419.6]) for (const z of [-587.5, -580.9]) block({ x, z, r: 0.2 });
  // 院子里：门两边两床盆栽（太阳下），遮阳网的南沿一排货（网下面再往北的东西在 45° 下被网盖住，看不见）
  placeB('nursery-cacti', 403.6, -575.4, 4, 1.2, 0, 0);
  placeB('nursery-cacti', 416.4, -575.8, 4, 1.2, 0, 1);
  placeB('nursery-cacti', 404.2, -582.6, 4, 1.2, 0, 2);
  placeB('pallet-sand', 408.6, -582.4, 1.2, 1.0, 0, 3);
  placeB('pallet-sand', 409.95, -582.6, 1.2, 1.0, 0, 4);
  placeB('pallet-paint', 412.0, -582.5, 1.2, 1.0, 0, 1);
  placeB('pipe-rack', 416.3, -582.7, 4, 1.2, 0, 1);

  // ── 卸货台（楼东墙北段）+ 倒进来的厢式货车 + 一摞空货板 ──
  flat('lotPave', 36, 14, 418, Y.pave, -595);
  placeB('dock', 400.75, -594, 1.5, 11);
  placeB('box-truck', 405.75, -594, 8, 2.5, Math.PI / 2);
  placeB('pallet-stack', 414, -599.2, 1.2, 1.0, 0.12);

  // 停车场、店前花池带、店后货场里摆的东西（花池岛、借来的植物、货、车、墙……）都攒进两组，最后烘成按材质合并的网格（assets/hardware.ts 的 bake）：
  // 一组几十件只要十几个绘制。真尺寸的东西（车、货、植物）绕自己的落地点缩 TOWN_K；按最终尺寸画的（建材棚、工具棚、花池岛）不缩。
  // 组的包围盒大（> LONG_M）：townwrap 当"长条"只压低（y × TOWN_K）—— 组先 scale.y = 1 / TOWN_K 抵掉。
  const LOT: THREE.Object3D[] = [];
  const YARD: THREE.Object3D[] = [];
  const add = (list: THREE.Object3D[], obj: THREE.Object3D, x: number, z: number, rot = 0, s = TOWN_K, y = 0) => {
    obj.position.set(x, y, z);
    obj.rotation.y = rot;
    obj.scale.setScalar(s);
    obj.updateMatrixWorld(true);
    let hit = false;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!hit && m.isMesh && hitsRoad(m.geometry, m.matrixWorld)) hit = true;
    });
    if (hit) {
      console.warn(`valley hardware: ${obj.name || 'part'} @ ${x},${z} 压到车道，没放`);
      return false;
    }
    list.push(obj);
    return true;
  };
  const asset = (list: THREE.Object3D[], id: string, x: number, z: number, rot = 0, s = TOWN_K, v = 0) => {
    const { obj } = makeAsset(id, { ...d.actx, variant: v });
    obj.name = id;
    return add(list, obj, x, z, rot, s);
  };
  /** 平的 / 矮的几何（世界尺寸，不缩）进组；cast = 投不投影 */
  const geo = (list: THREE.Object3D[], gs: THREE.BufferGeometry[], m: THREE.Material, cast = false) => {
    for (const g of gs) {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = cast;
      if (!cast) mesh.userData.noCast = true;
      list.push(mesh);
    }
  };
  const mark = lotMark(d.actx);
  const kerb = kerbMat(d.actx);
  const mrnd = d.rng('valley:hardware:marks');

  // ── 停车场（2026-11-21 美术：critic C3 / M5）──
  // 地面一整块 lotPave（暖铺面、1.5 米一道伸缩缝；保留原来 concrete 的色相，门口一屏的饱和度靠它），垫在车道（0.03）底下、店门口的陶砖底下：
  // 北块 = A 排 + 门前到楼脚（原来门前有 2～3 米露沙）、南块 = B、C 排、通道、D 排；西到五金进口的东沿，东到卸货道 / 东环。
  const LOT_X0 = 333;
  const LOT_X1 = 429.5;
  // 铺面同 build.ts 里 lotPave 的那一份（TOWN_EL.lotPave，核心调的缝距）：进烘的组要自己拿材质
  const pave = d.actx.mat('lotPave', { elem: TOWN_EL.lotPave });
  const slab = (x0: number, x1: number, z0: number, z1: number) =>
    new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, Y.walk, (z0 + z1) / 2);
  geo(LOT, [slab(LOT_X0, 425.5, -572.3, -559.75), slab(LOT_X0, LOT_X1, -554.75, -528.6)], pave);
  // 路缘：南沿（朝主街，一条暗线）、东沿
  geo(LOT, [box(LOT_X1 - LOT_X0, 0.14, 0.3, (LOT_X0 + LOT_X1) / 2, 0, -528.75)], kerb);
  geo(LOT, [box(0.3, 0.14, 554.75 - 528.9, LOT_X1 - 0.15, 0, (-554.75 - 528.9) / 2)], kerb);

  const rows = [
    { z0: -566, z1: -560.5, face: 1 }, // A：车头朝北（朝店）
    { z0: -554, z1: -548.5, face: -1 }, // B
    { z0: -546.1, z1: -540.6, face: 1 }, // C
    { z0: -534.1, z1: -528.6, face: -1 }, // D
  ];
  // 车位：344.5…420.1 每 2.8 米一条线（27 格）；两头是花池岛（西 340.4…344.4、东 420.6…424.6）
  const SX0 = 344.5;
  const SX1 = 420.1;
  // A 排一辆皮卡（车斗里一捆木料，五金店的记号）、B / C 排各一个购物车回收栏（占一格，竖着放）
  const PICKUP_X = 376.7;
  const CORRAL: Record<number, number> = { 1: 374.5, 2: 365.5 }; // 五金停车场默认镜头（世界 560）里都看得见
  // B、D 排中间各一个窄花池岛（占一格：x 366.9…369.7），停车场中间也有树
  const MID_X = 368.3;
  for (const [ri, r] of rows.entries()) {
    const zc = (r.z0 + r.z1) / 2;
    for (let x = SX0; x <= SX1 + 0.01; x += 2.8) {
      // 车位线刷店的芥末黄（门口一屏中午饱和度卡在 0.35 上，白线换成店的颜色）
      flat('hwMustard', 0.15, 5.0, x, Y.pave2, zc);
      const cx = x + 1.4;
      if (cx > SX1) continue;
      if ((ri === 1 || ri === 3) && Math.abs(cx - MID_X) < 0.15) continue;
      // 每排两三块油渍（车头那头，偏一点）
      if (mrnd() < 0.1)
        geo(LOT, [stainGeo(cx + (mrnd() - 0.5) * 0.6, zc - r.face * (0.9 + mrnd() * 0.8), 0.42, Y.pave, mrnd)], mark);
      // 门口那一段 A 排不停车：斑马线（行人从停车场走到门口）
      if (ri === 0 && Math.abs(cx - 365) < 6) continue;
      if (CORRAL[ri] !== undefined && Math.abs(cx - CORRAL[ri]) < 0.15) {
        if (asset(LOT, 'cart-corral', cx, zc, Math.PI / 2, TOWN_K, 1)) blockRect(cx, zc, 1.0, 2.2);
        continue;
      }
      const p = 0.9 - Math.abs(cx - 365) / 55 - (ri === 3 ? 0.25 : 0);
      const roll = rnd();
      if (ri === 0 && Math.abs(cx - PICKUP_X) < 0.15) {
        rnd();
        placeB('pickup-lumber', cx, zc - 0.3, 2.1, 5.4, Math.PI); // 往里挪 0.3：伸出车尾的木料不进车道
        continue;
      }
      if (roll > p) continue;
      car(cx, zc, r.face > 0 ? Math.PI : 0);
    }
  }
  for (let i = 0; i < 5; i++) flat('line', 0.6, 5, 360.4 + i * 2.3, Y.pave2, -563.25); // 斑马线
  // 花池岛（Sasquatch 的超市停车场：每排两头一个，水泥沿 + 碎石 + 一棵树或一丛仙人掌）。B、C 两排和中间的草带连成一个长岛
  const isl = (x0: number, x1: number, z0: number, z1: number, v: number) => {
    const o = island(d.actx, x1 - x0, z1 - z0, v);
    if (add(LOT, o, (x0 + x1) / 2, (z0 + z1) / 2, 0, 1)) blockRect((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0);
  };
  isl(340.4, 344.4, -566, -560.5, 0);
  isl(420.6, 424.6, -566, -560.5, 1);
  isl(340.4, 344.4, -554, -540.6, 2); // 高杆招牌、路灯立在里面
  isl(420.6, 424.6, -554, -540.6, 0);
  isl(340.4, 344.4, -534.1, -528.9, 1);
  isl(420.6, 424.6, -534.1, -528.9, 0);
  isl(MID_X - 1.2, MID_X + 1.2, -554, -548.5, 0);
  isl(MID_X - 1.2, MID_X + 1.2, -534.1, -528.9, 1);
  // 西头长岛里（招牌、路灯以外）两丛龙舌兰、一个桶形仙人掌
  for (const [id, x, z, s, v] of [
    ['agave', 343.2, -548.2, 1.0, 0],
    ['agave', 341.5, -545.6, 0.85, 1],
    ['barrel-cactus', 343.4, -544.3, 1.1, 2],
  ] as const) {
    const o = (REUSED[id] as unknown as AssetFn)({ ...d.actx, variant: v });
    add(LOT, o, x, z, mrnd() * 6, s * TOWN_K, 0.1);
  }
  // 中间的绿岛（B、C 之间）：草 + 棕榈 + 停车场高杆灯（8 米，双头；夜里各一个灯光圈）；一圈路缘
  flat('lawn', 420.6 - 344.4, 2.4, (344.4 + 420.6) / 2, Y.pave2, -547.3);
  geo(LOT, kerbRing(344.4, 420.6, -548.6, -546.0, 0.16, 0.25, ['w', 'e']), kerb);
  blockRect((344.4 + 420.6) / 2, -547.3, 420.6 - 344.4, 2.6);
  for (const x of [352, 371, 397, 416]) palm(x, -547.3, 0.9 + rnd() * 0.2);
  for (const x of [361, 384, 406]) {
    asset(LOT, 'lot-light', x, -547.3); // 进烘的那组（灯罩夜里的开关在烘完以后接）
    pool(x, -547.3, 9, 8);
  }
  // 轮胎印：从五金进口拐进南通道（往北开、右转往东）两道弧；B / C / D 排几个车位口的倒车弧
  {
    const keep = (x: number) => x > LOT_X0 + 0.4;
    const zc = -537.35;
    for (const rr of [5.3, 6.8])
      geo(LOT, [arcGeo(330.5 + 6, zc + 6, rr, Math.PI * 1.02, Math.PI * 1.48, 0.22, Y.pave, keep)], mark);
    for (const [x, z, a] of [
      [372.6, -540.0, 0],
      [389.4, -534.7, 1],
      [405.8, -540.0, 0],
    ] as const) {
      const s = a ? -1 : 1;
      for (const rr of [2.6, 4.0])
        geo(LOT, [arcGeo(x - 3.4, z - s * 0.2, rr, s > 0 ? -0.1 : 0.1, s > 0 ? 0.75 : -0.75, 0.2, Y.pave)], mark);
    }
  }
  // 印第安峡谷路边的高杆招牌（11 米，海军蓝主牌 + 芥末黄字），车道口南边
  placeB('lot-pylon', 341.5, -551.5, 3.6, 1.4);
  lamp(342.5, -541, Math.PI / 2);

  // ── 朝主街的行道树花池带 + 人行道（停车场南沿 −528.6 到主街人行道 −520.3）──
  // 花池带 2.7 米：碎石 + 每 12 米一个方树坑（土坯沿）一棵棕榈，树坑之间一簇仙人掌；再往南 5.3 米陶砖人行道接主街的人行道（主街那条归 town.ts）。
  // 东头停在 x 422（再往东是东环的路口）。
  {
    const S0 = -528.6;
    const S1 = -525.9;
    const W1 = -520.3;
    const SX = 422;
    flat('gravelYard', SX - LOT_X0, S1 - S0 - 0.3, (LOT_X0 + SX) / 2, Y.pave, (S0 + 0.3 + S1) / 2);
    flat('tile', SX - LOT_X0, W1 - S1, (LOT_X0 + SX) / 2, Y.pave, (S1 + W1) / 2);
    geo(LOT, [box(SX - LOT_X0, 0.14, 0.25, (LOT_X0 + SX) / 2, 0, S1 - 0.125)], kerb);
    const adobe = d.actx.mat('adobe', { elem: EL.adobe });
    for (let x = 339; x <= SX - 3; x += 12) {
      geo(LOT, kerbRing(x - 0.8, x + 0.8, S0 + 0.45, S0 + 2.05, 0.3, 0.22), adobe, true);
      palm(x, S0 + 1.25, 0.85 + rnd() * 0.2);
      if (x + 6 > SX - 2) continue;
      const v = Math.floor(mrnd() * 3);
      const o = (REUSED[v === 1 ? 'agave' : 'barrel-cactus'] as unknown as AssetFn)({ ...d.actx, variant: v });
      add(LOT, o, x + 5.4 + mrnd(), S0 + 1.3, mrnd() * 6, TOWN_K * (0.9 + mrnd() * 0.3), 0.04);
      if (mrnd() < 0.6) {
        const o2 = (REUSED['barrel-cactus'] as unknown as AssetFn)({ ...d.actx, variant: 1 });
        add(LOT, o2, x + 6.6 + mrnd(), S0 + 1.0, mrnd() * 6, TOWN_K * 0.75, 0.04);
      }
    }
    claim({ x0: LOT_X0, x1: SX, z0: S0, z1: W1 });
  }

  // ── 店后货场（critic C12：原来一整块 45 米的沙）──
  // 世界坐标 x 528…617 × z −128…−77（旧坐标 = 世界 − MOVE.hardware）：车场（沥青）、建材棚（三扇卷帘门 + 卸货台 + 倒进来的半挂车）、
  // 西头货板 + 工具棚、东头围起来的建材场（木料、砖、管子），北沿 2 米砖墙挡住住宅的后院（朝南那面是一条暗带）。
  // 都在缩放框（楼的 zone，旧 z ≥ −604）以北：东西不跟楼缩；平铺的中心也在框外（不然整块跟楼缩走）。
  {
    // 车场：暖铺面（同停车场；一整块沥青在这儿是一大片发灰的平涂），中心 z −605.8 在框外
    geo(YARD, [slab(340, 427, -622.3, -589.6)], pave); // 和停车场同一份（2.8 米一道缝），接缝处不换花纹
    geo(YARD, [slab(338, 427, -640.1, -622.3)], pave); // 建材棚、建材场、工具棚那半边也是暖铺面（冷的碎石在这儿一大片，正午饱和度掉到 0.36）
    flat('lotPave', 384 - 350, 3.0, 367, Y.pave, -623.8); // 建材棚前的水泥台
    // 建材棚（最终尺寸，原点 = 脚印中心）
    const BX = 367;
    const BZ = -629.8;
    if (asset(YARD, 'shops-barn', BX, BZ, 0, 1)) {
      blockRect(BX, BZ, BARN.W, BARN.D);
      const dk = BARN.dock;
      blockRect(BX + (dk.x0 + dk.x1) / 2, BZ + BARN.D / 2 + dk.d / 2, dk.x1 - dk.x0, dk.d);
    }
    // 半挂车：车尾贴卸货台（台沿 = 棚南墙 + 台深），车头朝南
    const rearZ = BZ + BARN.D / 2 + BARN.dock.d + 0.08;
    const semiZ = rearZ + 6.6 * TOWN_K;
    if (asset(YARD, 'shops-semi', BX + BARN.doors[1], semiZ))
      blockRect(BX + BARN.doors[1], semiZ + 1.1 * TOWN_K, 1.7, 15.6 * TOWN_K);
    block({ x: BX + BARN.doors[0] + 0.6, z: rearZ + 2.2, r: 1.0 });
    // 楼背后两个垃圾箱
    for (const [x, v] of [
      [375.2, 0],
      [377.0, 1],
    ] as const)
      asset(YARD, 'shops-dumpster', x, -592.6, 0, TOWN_K, v); // 不挡路：挡路的形状在缩放框里会跟楼缩走
    // 车场中间：两排露天托盘货架（各 7 组 × 三跨，货朝南），中间的叉车道上一辆叉车停在黄框里（critic 第 2 轮：G6 一屏还是空铺面）。
    // 排在楼的缩放框以北（旧 z < −604）：挡路的形状才不跟楼缩走
    for (const rz of [-604.9, -610.9]) {
      for (let n = 0; n < 7; n++) asset(YARD, 'shops-rack', 374.6 + n * 5.2, rz, 0, TOWN_K, n + (rz < -607 ? 7 : 0));
      block({ a: [372, rz], b: [408.3, rz], r: 0.45 });
    }
    {
      const fx = 391.6;
      const fz = -607.9;
      if (asset(YARD, 'in-hw-forklift', fx, fz, Math.PI)) block({ x: fx, z: fz, r: 0.9 });
      const yel = d.actx.mat('hwMustard', { noShadowReceive: true });
      const ln = (w: number, dd: number, x: number, z: number) =>
        geo(YARD, [new THREE.PlaneGeometry(w, dd).rotateX(-Math.PI / 2).translate(x, Y.pave2, z)], yel);
      ln(2.2, 0.09, fx, fz - 1.4);
      ln(2.2, 0.09, fx, fz + 1.4);
      ln(0.09, 2.8, fx - 1.1, fz);
      ln(0.09, 2.8, fx + 1.1, fz);
    }
    // 货架南边一条碎石花池分隔（龙舌兰），隔开车场和建材棚前的卸货区
    {
      const gravel = d.actx.mat('gravelYard', { elem: TOWN_EL.gravelYard });
      const [x0, x1, z0, z1] = [372, 409, -614.9, -613.3];
      geo(
        YARD,
        [
          new THREE.PlaneGeometry(x1 - x0, z1 - z0)
            .rotateX(-Math.PI / 2)
            .translate((x0 + x1) / 2, Y.pave, (z0 + z1) / 2),
        ],
        gravel,
      );
      geo(YARD, kerbRing(x0, x1, z0, z1, 0.18, 0.3), kerb, true);
      for (let x = x0 + 3; x < x1 - 1; x += 6.5) {
        const o = (REUSED[x % 2 < 1 ? 'agave' : 'barrel-cactus'] as unknown as AssetFn)({ ...d.actx, variant: 1 });
        add(YARD, o, x, (z0 + z1) / 2, mrnd() * 6, TOWN_K, 0.04);
      }
      blockRect((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0);
    }
    // 西头：三垛木料、一排砖、两捆管子（建材的外场，挨着五金进口那边）
    for (const [id, x, z, v] of [
      ['shops-lumber', 345.4, -603.2, 0],
      ['shops-lumber', 345.4, -607.4, 1],
      ['shops-lumber', 351.6, -603.2, 2],
      ['shops-bricks', 350.6, -607.2, 0],
      ['shops-bricks', 351.6, -607.3, 1],
      ['shops-bricks', 352.6, -607.1, 2],
      ['shops-bricks', 351.1, -606.1, 3],
      ['shops-pvc', 345.6, -611.6, 0],
      ['shops-pvc', 351.8, -611.6, 1],
    ] as const)
      if (asset(YARD, id, x, z, 0, TOWN_K, v)) block({ x, z, r: id === 'shops-lumber' ? 1.6 : 0.8 });
    // 东头五个员工车位（四辆车）
    for (let i = 0; i <= 4; i++) flat('lotPaint', 0.09, 4.2, 413.0 + i * 2.8, Y.pave2, -609.8);
    for (const x of [414.4, 417.2, 422.8]) car(x, -609.9, Math.PI);
    car(420.0, -609.6, 0);
    // 楼东边、卸货道两侧到停车场（园艺棚 / 卸货台东边原来露着一块沙）：同停车场的铺面，在缩放框里 → 进烘的那组
    geo(YARD, [slab(399, 436, -589.6, -572.3), slab(425.5, 436, -572.3, -554.75)], pave);
    // 楼背后一条 3 米的碎石花池带（土坯沿，一排假紫荆，中间留出垃圾箱那段）：把 30 米深的车场切成两半，楼背后不是一整块平地。
    // 在楼的缩放框里（旧 z ≥ −604）：不用 flat（中心在框里的平铺会跟楼缩走），进烘的那组
    {
      const gz0 = -596.4;
      const gz1 = -593.2;
      const gravel = d.actx.mat('gravelYard', { elem: TOWN_EL.gravelYard });
      for (const [x0, x1] of [
        [341, 373.4],
        [379, 412],
      ] as const) {
        geo(
          YARD,
          [
            new THREE.PlaneGeometry(x1 - x0, gz1 - gz0)
              .rotateX(-Math.PI / 2)
              .translate((x0 + x1) / 2, Y.pave, (gz0 + gz1) / 2),
          ],
          gravel,
        );
        geo(YARD, kerbRing(x0, x1, gz0, gz1, 0.18, 0.3), kerb, true);
        for (let x = x0 + 4; x < x1 - 2; x += 9) {
          const o = (REUSED['palo-verde'] as unknown as AssetFn)({ ...d.actx, variant: Math.floor(mrnd() * 2) });
          add(YARD, o, x + mrnd(), (gz0 + gz1) / 2, mrnd() * 6, TOWN_K * (0.9 + mrnd() * 0.2), 0.04);
          const c = (REUSED[mrnd() < 0.5 ? 'agave' : 'barrel-cactus'] as unknown as AssetFn)({ ...d.actx, variant: 1 });
          add(YARD, c, x + 4.4, (gz0 + gz1) / 2 + 0.3, mrnd() * 6, TOWN_K, 0.04);
        }
      }
    }
    // 车场的轮胎印（不另立高杆灯：建材棚的三盏壁灯照着车场，合批以后货场一组的绘制按材质算，少一种是一种）
    // （卸货道往北开到头、左转往西进车场：圆心在西边）
    for (const rr of [6.2, 7.8]) geo(YARD, [arcGeo(428 - 7, -590.5, rr, -0.05, -1.5, 0.22, Y.pave)], mark);
    // 车场的漆线：两条从门 2、门 3 往南的倒车引导线；几块油渍
    for (const x of [BARN.doors[1], BARN.doors[2]])
      for (const s of [-1, 1]) flat('lotPaint', 0.09, 9, 367 + x + s * 1.1, Y.pave2, -618.9);
    for (const [x, z] of [
      [366.6, -612.3],
      [367.6, -609.0],
      [376.3, -617.5],
      [355.2, -604.6],
      [348.0, -606.8],
      [412.8, -606.4],
    ] as const)
      geo(YARD, [stainGeo(x, z, 0.5, Y.pave, mrnd)], mark);
    // 西头：货板（空的摞着、沙袋）+ 工具棚
    for (const [id, x, z, v] of [
      ['pallet-stack', 341.6, -625.2, 0],
      ['pallet-stack', 342.6, -625.3, 1],
      ['pallet-stack', 341.8, -624.2, 2],
      ['pallet-stack', 344.6, -625.0, 3],
      ['pallet-sand', 342.0, -619.2, 0],
      ['pallet-sand', 342.9, -619.3, 1],
      ['pallet-sand', 345.6, -619.1, 2],
      ['pallet-stack', 346.6, -619.4, 4],
    ] as const)
      if (asset(YARD, id, x, z, (mrnd() - 0.5) * 0.12, TOWN_K, v)) block({ x, z, r: 0.5 });
    if (asset(YARD, 'shops-toolshed', 343.2, -634.0, 0, 1)) blockRect(343.2, -634.0, 3.5, 2.7);
    // 东头的建材场：南、西两面铁丝网围栏（一条暗带，不画网眼；南面中间 6 米的门），北、东是砖墙
    const chain = d.actx.mat('chainLink', { noShadowReceive: true });
    const post = d.actx.mat('ironwork', { noShadowReceive: true });
    const FZ = -623.0;
    const FX = 386;
    const runs: [number, number, number, number][] = [
      [FX, FZ, 398, FZ],
      [404, FZ, 427, FZ],
      [FX, FZ, FX, -640.1],
    ];
    for (const [ax, az, bx2, bz] of runs) {
      const L = Math.hypot(bx2 - ax, bz - az);
      const rot = Math.atan2(bx2 - ax, bz - az);
      geo(
        YARD,
        [
          box(0.06, 1.6, L, 0, 0, 0)
            .rotateY(rot)
            .translate((ax + bx2) / 2, 0, (az + bz) / 2),
        ],
        chain,
      );
      geo(
        YARD,
        [
          box(0.08, 0.08, L, 0, 1.6, 0)
            .rotateY(rot)
            .translate((ax + bx2) / 2, 0, (az + bz) / 2),
        ],
        post,
      );
      const n = Math.max(1, Math.round(L / 3));
      for (let i = 0; i <= n; i++)
        geo(YARD, [box(0.1, 1.7, 0.1, ax + ((bx2 - ax) * i) / n, 0, az + ((bz - az) * i) / n)], post);
      block({ a: [ax, az], b: [bx2, bz], r: 0.15 });
    }
    // 建材场里：三垛木料、一排砖、三捆管子、一摞空货板
    const goods: [string, number, number, number, number][] = [
      ['shops-lumber', 393.0, -635.6, 0, 0],
      ['shops-lumber', 393.0, -631.0, 0, 1],
      ['shops-lumber', 401.4, -635.6, 0, 2],
      ['shops-bricks', 410.0, -636.0, 0, 0],
      ['shops-bricks', 411.0, -636.1, 0, 1],
      ['shops-bricks', 412.0, -635.9, 0, 2],
      ['shops-bricks', 410.5, -634.7, 0, 3],
      ['shops-bricks', 411.6, -634.8, 0, 4],
      ['shops-pvc', 418.6, -629.0, 0, 0],
      ['shops-pvc', 418.6, -627.4, 0, 1],
      ['shops-pvc', 408.6, -628.2, 0, 2],
      ['pallet-stack', 423.4, -636.2, 0, 2],
    ];
    for (const [id, x, z, rot, v] of goods)
      if (asset(YARD, id, x, z, rot, TOWN_K, v)) block({ x, z, r: id === 'shops-lumber' ? 1.6 : 0.6 });
    // 北沿 2 米砖墙（挡住住宅的后院；朝南那面落暗档 = 一条暗带）+ 东沿一段（建材场的东墙）；墙顶一条压顶
    const cmu = d.actx.mat('cmuGrey', {
      elem: { kind: 'stones', size: [8, 4], seam: 1, hi: 0.3 },
      noShadowReceive: true,
    });
    const cap = d.actx.mat('cap');
    const WZ = -640.3;
    geo(YARD, [box(427.3 - 338, 2.0, 0.3, (338 + 427.3) / 2, 0, WZ)], cmu, true);
    geo(YARD, [box(427.3 - 338 + 0.1, 0.1, 0.4, (338 + 427.3) / 2, 2.0, WZ)], cap, true);
    geo(YARD, [box(0.3, 2.0, 640.3 - 612.3, 427.15, 0, (WZ - 612.3) / 2)], cmu, true);
    geo(YARD, [box(0.4, 0.1, 640.3 - 612.3, 427.15, 2.0, (WZ - 612.3) / 2)], cap, true);
    block({ a: [338, WZ], b: [427.3, WZ], r: 0.2 });
    block({ a: [427.15, WZ], b: [427.15, -612.3], r: 0.2 });
    claim({ x0: 338, x1: 427.5, z0: -640.5, z1: -589.3 }); // 中心 z −615：在缩放框外（框里的 clear 会跟楼缩走）
  }

  // ── 烘：两组（停车场、货场），按材质合并 ──
  for (const [list, name, rx, rz] of [
    [LOT, 'valley:hardware:lot', 380, -546],
    [YARD, 'valley:hardware:yard', 380, -620],
  ] as const) {
    const g = bake(list, name);
    if (name.endsWith('lot')) {
      const lens = d.actx.mat('signPaint', { noShadowReceive: true });
      const lensNight = d.actx.mat('signPaint', { emissive: 0x7a6a40, noShadowReceive: true });
      nightSwap(g, [[lens, lensNight]]);
    }
    if (name.endsWith('yard')) {
      // 建材棚的壁灯（材质同一份：烘完再接夜里的开关和灯光圈）
      const lens = d.actx.mat('signPaint', { noShadowReceive: true });
      const lensNight = d.actx.mat('signPaint', { emissive: 0x7a6a40, noShadowReceive: true });
      nightSwap(
        g,
        [[lens, lensNight]],
        BARN.doors.map((x) => poolAt(367 + x, -629.8 + BARN.D / 2 + 3, 5, 3.5)),
      );
    }
    g.scale.y = 1 / TOWN_K;
    d.asset(g, d.regionOf(rx, rz));
  }
  k.finish();
}
