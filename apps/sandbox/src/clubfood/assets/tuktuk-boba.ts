// #7 tuktuk-boba：珍珠奶茶三轮摩托（意大利 Ape 小三轮的剪影），院子西南角，世界 (−40.0, −14.4)，rotY 0.35。
// 尺寸 2.9（x，长）× 2.1（顶棚）× 1.4（车身 z −0.6…0.6，南面放下来的台面伸到 z 0.92）。三角形 1406。
// 东头（+x）窄车头：一个前轮、圆鼓鼓的驾驶室（侧窗 + 前挡风 glass）。后面的小货厢改成吧台：
//   西半截是一只高柜（南面画一个珍珠奶茶杯图标，不写字），东半截是低的货台，朝南的侧板放下来 = 不锈钢台面；
//   货台上两只大玻璃桶（奶茶 = woodWeathered 亮档，桶底一层 + 一团黑珍珠 = hair），台面上一摞珍珠奶茶杯（白杯身、薰衣草杯盖、粉色胖吸管）。
//   顶棚薰衣草 / 白条纹（每条 ≈ 0.34 米 = 3.8 纹素，南北向 = 屏幕上的竖条），前沿一条垂边；顶棚只盖货厢北半，
//   45° 俯视下垂边下沿刚好压在桶盖上面，不挡桶和杯子。
// 注意：rotY +0.35 时本地 +x 指向东北偏东（背离镜头），所以画面里露出来的是南面 + 西头（货厢尾），车头的脸朝里。
// userData（本地坐标，米）：
//   spots.vendor = [0.72, −0.95]：摊主站的地面点（车北面、驾驶室和货厢交界的后面；顶棚不盖这里，头肩从驾驶室顶上露出来）
//   spots.window = [−0.08, 1.47]：买的人站的地面点（台面前沿外 0.55 米）
//   sill = [−0.08, 1.04, 0.71]：台面顶的中心
//   setStock(k)：k 0..1，两只桶里的奶茶液面跟着降（k < 0.3 快见底，k = 0 珍珠也没了）。画廊里 ?stock=0.2 可以看。
// 变体：只有 v0。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { AssetCtx } from '../ctx';

const T = 0.09; // 设计纹素
/** 朝镜头的竖直面（车身侧面）留住主色中档：clubdesk 柜台的做法 */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };

// 货厢 / 驾驶室的范围（本地 x）
const CARGO_X0 = -1.45;
const CARGO_X1 = 0.45;
const CAB_X0 = 0.47;
const CAB_X1 = 1.45;
const BODY_Z = 0.6; // 货厢半宽
const CAB_Z = 0.42; // 驾驶室半宽（窄车头）
const FLOOR = 1.0; // 货台面高
const CABINET_X1 = -0.62; // 西头高柜的东沿
const CABINET_TOP = 1.3;
// 台面（放下来的侧板）
const SILL = { x0: -0.6, x1: 0.44, z0: 0.5, z1: 0.92, y: 1.04 };
// 两只奶茶桶
const JUG_R = 0.17;
const JUG_Y0 = FLOOR + 0.02;
const JUG_H = 0.44;
const JUGS: [number, number][] = [
  [-0.33, 0.0],
  [0.11, 0.0],
];
const TEA_MAX = JUG_H - 0.13; // 满桶的液面高（桶底往上）
// 顶棚
const CAN = { x0: -1.55, x1: 0.47, z0: -0.85, z1: 0.22, yBack: 2.1, yFront: 2.06, th: 0.06, val: 0.2 };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'tuktuk-boba';
  const rnd = ctx.rng('tuktuk-boba:pearls');

  const geos: Record<string, THREE.BufferGeometry[]> = {
    body: [],
    white: [],
    silver: [],
    glass: [],
    jug: [],
    tyre: [],
    straw: [],
    dots: [],
    tea: [],
    pearls: [],
  };
  const put = (k: string, geo: THREE.BufferGeometry) => geos[k].push(geo);
  /** 合并前统一成非索引、只留 position / normal / uv（挤出体和盒子的属性不一样） */
  const merge = (list: THREE.BufferGeometry[]) =>
    mergeGeometries(
      list.map((x) => {
        const y = x.index ? x.toNonIndexed() : x;
        for (const a of Object.keys(y.attributes))
          if (a !== 'position' && a !== 'normal' && a !== 'uv') y.deleteAttribute(a);
        y.clearGroups();
        return y;
      }),
    );

  // ── 车身：货厢（低货台 + 西头高柜）────────────────────────
  put('body', box(CARGO_X1 - CARGO_X0, FLOOR - 0.42, BODY_Z * 2, (CARGO_X0 + CARGO_X1) / 2, 0.42, 0));
  put('body', box(CABINET_X1 - CARGO_X0, CABINET_TOP - FLOOR, BODY_Z * 2, (CARGO_X0 + CABINET_X1) / 2, FLOOR, 0));
  // 货台北沿一道矮挡板（台面后面那一侧没放下来）
  put('body', box(CARGO_X1 - CABINET_X1, 0.16, 0.1, (CABINET_X1 + CARGO_X1) / 2, FLOOR, -BODY_Z + 0.05));
  // 底盘：缩在车身里面（只在车身下沿露一条暗缝，不出一整条黑带）
  put('tyre', box(CAB_X1 - 0.2 - CARGO_X0, 0.14, 0.6, (CARGO_X0 + CAB_X1 - 0.2) / 2, 0.3, 0));

  // ── 驾驶室：侧面轮廓（x, y）挤出 z，圆鼓鼓的车顶 + 往后斜的挡风 ───────
  {
    const s = new THREE.Shape();
    s.moveTo(CAB_X0, 0.34);
    s.lineTo(CAB_X1 - 0.12, 0.34);
    s.quadraticCurveTo(CAB_X1, 0.36, CAB_X1, 0.5);
    s.lineTo(CAB_X1, 0.8);
    s.quadraticCurveTo(CAB_X1 - 0.02, 1.35, CAB_X1 - 0.3, 1.52);
    s.quadraticCurveTo(CAB_X1 - 0.5, 1.62, CAB_X0 + 0.22, 1.6);
    s.quadraticCurveTo(CAB_X0, 1.58, CAB_X0, 1.42);
    s.lineTo(CAB_X0, 0.34);
    const cab = new THREE.ExtrudeGeometry(s, { depth: CAB_Z * 2, bevelEnabled: false, curveSegments: 5 });
    cab.translate(0, 0, -CAB_Z);
    put('body', cab);
    // 前挡风：贴着车头的斜面（朝东、朝上；车头背着镜头，俯视能看到上半截）
    const ws = new THREE.Shape();
    ws.moveTo(CAB_X1 + 0.004, 0.86);
    ws.quadraticCurveTo(CAB_X1 - 0.014, 1.3, CAB_X1 - 0.27, 1.5);
    ws.lineTo(CAB_X1 - 0.32, 1.47);
    ws.quadraticCurveTo(CAB_X1 - 0.06, 1.28, CAB_X1 - 0.04, 0.86);
    ws.lineTo(CAB_X1 + 0.004, 0.86);
    const wsg = new THREE.ExtrudeGeometry(ws, { depth: CAB_Z * 2 - 0.18, bevelEnabled: false, curveSegments: 4 });
    wsg.translate(0, 0, -(CAB_Z - 0.09));
    put('glass', wsg);
    // 侧窗（南面 = 朝镜头，北面对称）：门上半截
    for (const sz of [1, -1]) put('glass', box(0.5, 0.42, 0.02, 0.86, 0.98, sz * (CAB_Z + 0.005)));
    // 前轮挡泥板（车头下面伸出来一截）
    put('body', box(0.36, 0.1, 0.3, CAB_X1 - 0.24, 0.5, 0));
  }

  // ── 轮子：一个前轮、两个后轮 ───────────────────────────
  const wheel = (x: number, z: number) => {
    const w = new THREE.CylinderGeometry(0.23, 0.23, 0.14, 12).rotateX(Math.PI / 2).translate(x, 0.23, z);
    put('tyre', w);
    // 轮毂（只画朝外那一面）
    const hz = z + Math.sign(z || 1) * 0.075;
    put('silver', new THREE.CylinderGeometry(0.1, 0.1, 0.02, 8).rotateX(Math.PI / 2).translate(x, 0.23, hz));
  };
  wheel(CAB_X1 - 0.3, 0);
  wheel(-0.88, BODY_Z - 0.02);
  wheel(-0.88, -(BODY_Z - 0.02));

  // ── 台面：南侧板放下来（不锈钢）+ 下面一道翻板的边 ─────────────
  put(
    'silver',
    box(SILL.x1 - SILL.x0, 0.08, SILL.z1 - SILL.z0, (SILL.x0 + SILL.x1) / 2, SILL.y - 0.08, (SILL.z0 + SILL.z1) / 2),
  );
  // 两根斜撑（2 纹素粗）
  for (const x of [SILL.x0 + 0.12, SILL.x1 - 0.12]) {
    const b = new THREE.BoxGeometry(T * 1.6, 0.42, T * 1.6);
    b.rotateX(-0.75).translate(x, SILL.y - 0.26, BODY_Z + 0.14);
    put('silver', b);
  }

  // ── 高柜南面的珍珠奶茶杯图标（贴面；竖直 1 屏幕行 = 0.127 米）─────────
  // 自下而上：杯身 2 行（5 纹素宽，杯底一团珍珠：底行三颗、上一行一颗）、杯盖沿 1 行（6 宽）、盖顶 1 行（3 宽）、粉吸管 1.5 行
  {
    const row = T / Math.SQRT1_2;
    const fz = BODY_Z + 0.012;
    const cx = (CARGO_X0 + CABINET_X1) / 2;
    const y0 = 0.56;
    const tile = (k: string, w: number, h: number, x: number, y: number, dz = 0) =>
      put(k, box(w, h, 0.025, x, y, fz + dz));
    tile('white', 5 * T, 2 * row, cx, y0);
    tile('white', 6 * T, row, cx, y0 + 2 * row);
    tile('white', 3 * T, row, cx, y0 + 3 * row);
    tile('straw', 1.5 * T, 1.5 * row, cx + 0.75 * T, y0 + 4 * row);
    for (const [c, r] of [
      [-1, 0],
      [0, 0],
      [1, 0],
      [0, 1],
    ] as [number, number][])
      tile('dots', T, row, cx + c * T, y0 + r * row + 0.01, 0.006);
  }

  // ── 两只大玻璃奶茶桶（玻璃 = 空着的上半截；奶茶、珍珠是单独的网格，setStock 缩放）─────
  const tea: THREE.BufferGeometry[] = [];
  const pearl: THREE.BufferGeometry[] = [];
  for (const [x, z] of JUGS) {
    put('jug', new THREE.CylinderGeometry(JUG_R, JUG_R, JUG_H, 12).translate(x, JUG_Y0 + JUG_H / 2, z));
    // 盖子 + 提钮
    put(
      'silver',
      new THREE.CylinderGeometry(JUG_R + 0.015, JUG_R + 0.015, 0.06, 12).translate(x, JUG_Y0 + JUG_H + 0.03, z),
    );
    put('silver', box(T * 1.2, 0.05, T * 1.2, x, JUG_Y0 + JUG_H + 0.06, z));
    // 奶茶（单位高，底在 0；网格 y 缩放 = 液面高）
    tea.push(new THREE.CylinderGeometry(JUG_R + 0.008, JUG_R + 0.008, 1, 12).translate(x, 0.5, z));
    // 珍珠：桶底前半圈一层（1 行）+ 贴着它往上鼓的两颗（一团），高 0.17
    pearl.push(
      new THREE.CylinderGeometry(JUG_R + 0.016, JUG_R + 0.016, 0.1, 12, 1, true, -1.1, 2.2).translate(x, 0.05, z),
    );
    for (let i = 0; i < 2; i++) {
      const a = (rnd() - 0.5) * 1.4;
      const px = x + Math.sin(a) * (JUG_R + 0.018);
      const pz = z + Math.cos(a) * (JUG_R + 0.018);
      pearl.push(box(T, 0.08, T * 0.6, px, 0.09, pz));
    }
  }

  // ── 台面上一摞珍珠奶茶杯（白杯身、两道杯沿、薰衣草圆盖、粉色胖吸管）────────
  {
    const cx = 0.28;
    const cz = 0.74;
    const y0 = SILL.y;
    put('white', new THREE.CylinderGeometry(0.145, 0.12, 0.34, 10).translate(cx, y0 + 0.17, cz));
    for (const y of [0.12, 0.23])
      put('white', new THREE.CylinderGeometry(0.15, 0.15, 0.03, 10).translate(cx, y0 + y, cz));
    const lid = new THREE.SphereGeometry(0.152, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    lid.scale(1, 0.55, 1).translate(cx, y0 + 0.34, cz);
    put('body', lid);
    const straw = new THREE.BoxGeometry(T * 1.3, 0.3, T * 1.3);
    straw.rotateZ(-0.18).translate(cx + 0.04, y0 + 0.52, cz - 0.01);
    put('straw', straw);
  }

  // ── 顶棚：四根杆 + 条纹篷（南北向条纹，薰衣草 / 白相间）+ 前沿垂边 ─────────
  {
    const pole = T * 1.4;
    for (const [x, z, y0] of [
      [CAN.x0 + 0.14, CAN.z1 - 0.1, CABINET_TOP],
      [CAN.x0 + 0.14, CAN.z0 + 0.3, CABINET_TOP],
      [CAN.x1 - 0.1, CAN.z1 - 0.1, FLOOR],
      [CAN.x1 - 0.1, CAN.z0 + 0.3, FLOOR],
    ] as [number, number, number][])
      put('silver', box(pole, CAN.yFront - y0, pole, x, y0, z));
    const n = 6;
    const sw = (CAN.x1 - CAN.x0) / n;
    const slope = Math.atan2(CAN.yBack - CAN.yFront, CAN.z1 - CAN.z0);
    const dep = Math.hypot(CAN.z1 - CAN.z0, CAN.yBack - CAN.yFront);
    for (let i = 0; i < n; i++) {
      const k = i % 2 === 0 ? 'body' : 'white';
      const x = CAN.x0 + (i + 0.5) * sw;
      const top = new THREE.BoxGeometry(sw, CAN.th, dep);
      top.rotateX(slope).translate(x, (CAN.yBack + CAN.yFront) / 2 - CAN.th / 2, (CAN.z0 + CAN.z1) / 2);
      put(k, top);
      // 前沿垂边
      put(k, box(sw, CAN.val, 0.03, x, CAN.yFront - CAN.val, CAN.z1 + 0.005));
    }
    // 西头垂边（货厢尾露在画面里）：两段
    const half = (CAN.z1 - CAN.z0) / 2;
    put('white', box(0.03, CAN.val, half, CAN.x0 - 0.005, CAN.yFront - CAN.val + 0.02, CAN.z0 + half * 1.5));
    put('body', box(0.03, CAN.val, half, CAN.x0 - 0.005, CAN.yFront - CAN.val + 0.03, CAN.z0 + half * 0.5));
  }

  // ── 合并成网格 ─────────────────────────────────────
  const mats = {
    body: ctx.mat('accBoba', { ...FACE, convex: 0.3, elem: { kind: 'paint', size: [10, 7], density: [0, 0.02] } }),
    white: ctx.mat('clothWhite', { ...FACE, convex: 0.3 }),
    silver: ctx.mat('carSilver', { ...FACE, convex: 0.3 }),
    glass: ctx.mat('glass', { ...FACE, convex: 0.2 }),
    // 桶的玻璃、奶茶：侧面也给亮档（映天的浅蓝 L 190、奶茶色 woodWeathered 亮档 L 182，差 < 60）
    jug: ctx.mat('glass', { ...FACE, bands: [-1.5, -1.2], convex: 0.2 }),
    tyre: ctx.mat('tyre', { noShadowReceive: true, convex: 0.2 }),
    straw: ctx.mat('accPaleta', { ...FACE, convex: 0.2 }),
    tea: ctx.mat('woodWeathered', { ...FACE, bands: [-1.5, -1.2], convex: 0.2 }),
    pearls: ctx.mat('hair', { ...FACE, bands: [-1.5, -1.2], convex: 0.1 }),
    dots: ctx.mat('hair', { ...FACE, convex: 0.1 }),
  } as const;
  for (const k of Object.keys(mats) as (keyof typeof mats)[]) {
    if (k === 'tea' || k === 'pearls') continue;
    const m = new THREE.Mesh(merge(geos[k]), mats[k]);
    m.name = k;
    g.add(m);
  }
  const teaMesh = new THREE.Mesh(merge(tea), mats.tea);
  teaMesh.name = 'tea';
  teaMesh.position.y = JUG_Y0 + 0.005;
  const pearlMesh = new THREE.Mesh(merge(pearl), mats.pearls);
  pearlMesh.name = 'pearls';
  pearlMesh.position.y = JUG_Y0 + 0.005;
  g.add(teaMesh, pearlMesh);

  const setStock = (k: number) => {
    const s = THREE.MathUtils.clamp(k, 0, 1);
    // 液面：满 = TEA_MAX，空 = 只剩桶底一层（k < 0.3 降到 1/3 以下 = 快见底）
    const h = 0.02 + s * (TEA_MAX - 0.02);
    teaMesh.scale.y = h;
    teaMesh.visible = s > 0.01;
    pearlMesh.visible = s > 0.01;
    pearlMesh.scale.y = Math.min(1, h / 0.17);
  };
  setStock(ctx.params.has('stock') ? Number(ctx.params.get('stock')) : 1);

  g.userData.spots = { vendor: [0.72, -0.95], window: [-0.08, 1.47] };
  g.userData.sill = [-0.08, SILL.y, (SILL.z0 + SILL.z1) / 2];
  g.userData.setStock = setStock;
  ctx.mats.prepare(g);
  return g;
}
