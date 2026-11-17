// 五金大超市：盒子 x 352…400 × z −600…−572（h 8）；东头园艺棚 400…420 × −588…−572、卸货台 400…436 × −602…−588；
// 南边停车场 339…436 × −572…−524（印第安峡谷路进来的车道 hardware_lot 走 z −557.25，再到东头 x 428 拐北上卸货台 —— 汽车开得进来、停得下）。
// 构图、资产清单：docs/lab/2026-11-07-3d-pixel/valley-town.md「3. 五金大超市」。这个文件归五金店的资产代理（批 H）；资产画在 src/valley/assets/hardware.ts。
// 用户 2026-11-16 定：主色 = 芥末黄（hwMustard）+ 深海军蓝（hwNavy），不用青绿（俱乐部的颜色）。
// 规矩：入口朝南；门头正前方 3 米是旗子（p_hardware 门槛 (365, −569.5)），那一圈不放东西；挂在立面上的东西只在南面；
// 车道上不放东西：灰盒走 kit 的车道守卫，资产走这里的 place()（同一个 hitsRoad 判据，碰到就不放、记一条）。
import type * as THREE from 'three';
import { makeAsset } from '../../assets';
import type { DetailCtx } from '../../build';
import { hitsRoad, siteKit, Y } from './kit';

export function detailHardware(d: DetailCtx): void {
  // 随机流：同 town.ts 第 1b 节原来那条（town.ts 在第 1b 节之前不取随机数 → 新开的 'valley:town' 流和原来一个数不差，停车场的车没变）。
  // 改了这里的取数次数不影响 town.ts（它在原来第 1b 节的位置跳过固定的 153 个数）。
  const rnd = d.rng('valley:town');
  const k = siteKit(d, rnd);
  const { flat, blockRect, car, palm, lamp, pool, block } = k;
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
  flat('concrete', 36, 14, 418, Y.pave, -595);
  placeB('dock', 400.75, -594, 1.5, 11);
  placeB('box-truck', 405.75, -594, 8, 2.5, Math.PI / 2);
  placeB('pallet-stack', 414, -599.2, 1.2, 1.0, 0.12);

  // ── 停车场：车位带（水泥，车道那一条留给 build.ts 的沥青）+ 白线 + 车（离门越近停得越满）；中间一条绿岛（棕榈 + 高杆灯）──
  const rows = [
    { z0: -566, z1: -560.5, face: 1 }, // A：车头朝北（朝店）
    { z0: -554, z1: -548.5, face: -1 }, // B
    { z0: -546.1, z1: -540.6, face: 1 }, // C
    { z0: -534.1, z1: -528.6, face: -1 }, // D
  ];
  const LX0 = 344;
  const LX1 = 424;
  flat('concrete', LX1 - LX0, 5.5, (LX0 + LX1) / 2, Y.pave, -563.25); // A 带
  flat('concrete', LX1 - LX0, 5.5, (LX0 + LX1) / 2, Y.pave, -551.25); // B
  flat('concrete', LX1 - LX0, 5.5, (LX0 + LX1) / 2, Y.pave, -543.35); // C
  flat('concrete', LX1 - LX0, 6.5 + 5.5, (LX0 + LX1) / 2, Y.pave, -534.1 + 5.5 / 2 - 6.5 / 2); // 南边通道 + D
  // A 排一辆皮卡（车斗里一捆木料，五金店的记号）：占 A 排 x 377.2 那个车位（随机流照旧取两个数：停不停、车色）
  const PICKUP_X = 377.2;
  for (const r of rows) {
    const zc = (r.z0 + r.z1) / 2;
    for (let x = LX0 + 1; x <= LX1 - 1; x += 2.8) {
      flat('line', 0.15, 5.0, x, Y.pave2, zc);
      const cx = x + 1.4;
      if (cx > LX1 - 1) continue;
      // 门口那一段 A 排不停车：斑马线（行人从停车场走到门口）
      if (r === rows[0] && Math.abs(cx - 365) < 6) continue;
      const p = 0.9 - Math.abs(cx - 365) / 55 - (r === rows[3] ? 0.25 : 0);
      const roll = rnd();
      if (r === rows[0] && Math.abs(cx - PICKUP_X) < 0.1) {
        rnd();
        placeB('pickup-lumber', cx, zc - 0.3, 2.1, 5.4, Math.PI); // 往里挪 0.3：伸出车尾的木料不进车道
        continue;
      }
      if (roll > p) continue;
      car(cx, zc, r.face > 0 ? Math.PI : 0);
    }
  }
  for (let i = 0; i < 5; i++) flat('line', 0.6, 5, 360.4 + i * 2.3, Y.pave2, -563.25); // 斑马线
  // 绿岛（B、C 之间）：草 + 棕榈 + 停车场高杆灯（8 米，双头；夜里各一个灯光圈）
  flat('lawn', LX1 - LX0 - 4, 2.4, (LX0 + LX1) / 2, Y.pave2, -547.3);
  blockRect((LX0 + LX1) / 2, -547.3, LX1 - LX0 - 4, 2.6);
  for (const x of [352, 371, 397, 416]) palm(x, -547.3, 0.9 + rnd() * 0.2);
  for (const x of [361, 384, 406]) {
    place('lot-light', x, -547.3);
    pool(x, -547.3, 9, 8);
  }
  // 印第安峡谷路边的高杆招牌（11 米，海军蓝主牌 + 芥末黄字），车道口南边
  placeB('lot-pylon', 341.5, -551.5, 3.6, 1.4);
  lamp(LX0 - 1.5, -541, Math.PI / 2);
  k.finish();
}
