// #12 lawn-games · 孩子的草皮角：两块沙包投洞板（cornhole）+ 地上的沙包 + 一座大号叠叠乐。
// 草皮本身由地形画（9 × 3.8 米，`lawn`），这里只画上面的东西。资产原点 = 草皮中心（世界 −32.9, −11.9），y 0 = 地面。
// 尺寸：两块板各 1.2 × 0.32 × 0.6（斜板：低端 0.07、高端 0.32），板 A 在 x −3.4（斜面朝东，高端在西），
//      板 B 在 x +1.6（斜面朝西，高端在东）；叠叠乐 0.5 × 1.1 × 0.5 在 (3.4, −0.2)，4 层 × 3 块（每层 0.275 = 3 纹素，层层交错）。
// 颜色：板面 A 回收蓝 accRecycle、板面 B 番茄红 accPizza（洞 = 同色暗档，不用黑）；板身 timber；叠叠乐 wood（每块一点深浅）；
//      沙包 2 红 2 蓝（0.2 × 0.07 × 0.2 ≈ 2 纹素）。三角形 ≈ 240（预算 600）。
// userData（stage 3：孩子扔沙包、推倒叠叠乐；坐标都是本地，米）：
//   holes: [[x, y, z], [x, y, z]]   两个洞口中心（板 A、板 B）
//   boards: [[x, y, z], [x, y, z]]  两块板板面中心
//   bags: THREE.Object3D[]          4 只沙包（life.ts 直接改 position；本地坐标）
//   bagHome(i) → THREE.Vector3      第 i 只沙包的初始位置（新的 Vector3）
//   topple(k)                       0 = 叠好 … 1 = 倒成一堆木块散在地上（往西南倒，连续）
//   towerAt: [x, z]                 叠叠乐的中心
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

/** 板：长 1.2（顺 x）、宽 0.6（顺 z）；低端 / 高端板面高 */
const BL = 1.2;
const BW = 0.6;
const H_LO = 0.07;
const H_HI = 0.32;
const SLOPE = Math.atan2(H_HI - H_LO, BL);
const HOLE_R = 0.15;
/** 洞心离高端的距离（顺板面） */
const HOLE_IN = 0.3;
const BOARD_Z = 0.1;
/** [板中心 x, 高端在哪边：+1 = 高端在 −x（斜面朝东），−1 = 高端在 +x（斜面朝西）] */
const BOARDS: [number, number][] = [
  [-3.4, 1],
  [1.6, -1],
];

/** 叠叠乐 */
const TOWER: [number, number] = [3.4, -0.2];
const LAYERS = 4;
const LAYER_H = 0.275;
const BLK_H = 0.265;
const BLK_L = 0.5;
const BLK_W = 0.16;
const BLK_STEP = 0.17;

const BAG = 0.2;
const BAG_H = 0.07;

const clean = (g: THREE.BufferGeometry) => {
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
};

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'lawn-games';

  // ── 材质 ────────────────────────────────────────────
  // 小道具：不接投影；朝镜头的板侧面、叠叠乐正面用 lightUp + 低 bands 留住中档
  const SIDE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0.3 };
  const frameMat = ctx.mat('timber', { ...SIDE, edge: 0.5 });
  const faceMat = [
    ctx.mat('accRecycle', { noShadowReceive: true, lightUp: 0.2, convex: 0.3, edge: 0.4 }),
    ctx.mat('accPizza', { noShadowReceive: true, lightUp: 0.2, convex: 0.3, edge: 0.4 }),
  ];
  // 洞：同色的暗档（bands 推到 2 以上 = 永远暗档），不用黑
  const holeMat = [
    ctx.mat('accRecycle', { noShadowReceive: true, bands: [2, 3], convex: 0, edge: 0.2 }),
    ctx.mat('accPizza', { noShadowReceive: true, bands: [2, 3], convex: 0, edge: 0.2 }),
  ];
  const bagMat = {
    red: ctx.mat('accPizza', { ...SIDE, edge: 0.4 }),
    blue: ctx.mat('accRecycle', { ...SIDE, edge: 0.4 }),
  };
  const blockMat = ctx.mat('wood', { ...SIDE, edge: 0.5 });

  // ── 两块投洞板 ────────────────────────────────────────
  const frames: THREE.BufferGeometry[] = [];
  const holes: [number, number, number][] = [];
  const boards: [number, number, number][] = [];
  BOARDS.forEach(([cx, dir], i) => {
    // 板身：侧面是梯形（低端 H_LO、高端 H_HI）的楔形，挤出 BW
    const hAt = (u: number) => H_LO + (H_HI - H_LO) * (0.5 - (dir * u) / BL); // u = 板内 x（−0.6..0.6）
    const shape = new THREE.Shape([
      new THREE.Vector2(-BL / 2, 0),
      new THREE.Vector2(BL / 2, 0),
      new THREE.Vector2(BL / 2, hAt(BL / 2)),
      new THREE.Vector2(-BL / 2, hAt(-BL / 2)),
    ]);
    const wedge = new THREE.ExtrudeGeometry(shape, { depth: BW, bevelEnabled: false });
    wedge.translate(cx, 0, BOARD_Z - BW / 2);
    frames.push(clean(wedge));

    // 板面：一块斜的漆面（略高于板身），法线朝低端那边倾
    const rotZ = -dir * SLOPE;
    const nrm = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), rotZ);
    const hMid = (H_LO + H_HI) / 2;
    const face = new THREE.PlaneGeometry(BL / Math.cos(SLOPE), BW).rotateX(-Math.PI / 2).rotateZ(rotZ);
    face.translate(cx + nrm.x * 0.008, hMid + nrm.y * 0.008, BOARD_Z);
    const faceMesh = new THREE.Mesh(clean(face), faceMat[i]);
    faceMesh.name = `board-${i}`;
    root.add(faceMesh);
    boards.push([cx, hMid, BOARD_Z]);

    // 洞：离高端 HOLE_IN（顺板面），贴在板面上
    const u = -dir * (BL / 2 - HOLE_IN);
    const hc = new THREE.Vector3(cx + u, hAt(u), BOARD_Z);
    // 3～4 纹素的圆在像素里会碎成十字：用圆角都不要的方洞（宽 0.3 × 深 0.34），读起来更像个洞
    const hole = new THREE.PlaneGeometry(HOLE_R * 2, HOLE_R * 2.15)
      .rotateX(-Math.PI / 2)
      .rotateZ(rotZ)
      .translate(hc.x + nrm.x * 0.018, hc.y + nrm.y * 0.018, hc.z);
    const holeMesh = new THREE.Mesh(clean(hole), holeMat[i]);
    holeMesh.name = `hole-${i}`;
    root.add(holeMesh);
    holes.push([hc.x, hc.y, hc.z]);
  });
  const frameMesh = new THREE.Mesh(mergeGeometries(frames), frameMat);
  frameMesh.name = 'board-frames';
  root.add(frameMesh);

  // ── 沙包（4 只，各自一个 Object3D：life.ts 直接挪 position）────────────────
  // 0：蓝，落在板 B 的板面上（顺着斜面）；1：红，板 B 前的草上；2：蓝，板 B 后面；3：红，板 A 旁边等着扔
  const bagGeo = new THREE.BoxGeometry(BAG, BAG_H, BAG);
  bagGeo.deleteAttribute('uv');
  const rb = ctx.rng('lawn-games:bags');
  const [bx, bdir] = BOARDS[1];
  const onB = (u: number, z: number): [number, number, number, number] => {
    const rotZ = -bdir * SLOPE;
    const nrm = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), rotZ);
    const h = H_LO + (H_HI - H_LO) * (0.5 - (bdir * u) / BL);
    return [bx + u + nrm.x * (BAG_H / 2 + 0.01), h + nrm.y * (BAG_H / 2 + 0.01), z, rotZ];
  };
  const bagSpec: { c: 'red' | 'blue'; p: [number, number, number, number] }[] = [
    { c: 'blue', p: onB(-0.12, BOARD_Z + 0.08) },
    { c: 'red', p: [0.62, BAG_H / 2, 0.45, 0] },
    { c: 'blue', p: [2.62, BAG_H / 2, -0.5, 0] },
    { c: 'red', p: [-2.5, BAG_H / 2, 0.62, 0] },
  ];
  const bags: THREE.Mesh[] = [];
  const homes: THREE.Vector3[] = [];
  bagSpec.forEach(({ c, p }, i) => {
    const m = new THREE.Mesh(bagGeo, bagMat[c]);
    m.name = `bag-${i}`;
    m.position.set(p[0], p[1], p[2]);
    m.rotation.set(0, (rb() - 0.5) * 1.2, p[3], 'ZYX');
    root.add(m);
    bags.push(m);
    homes.push(m.position.clone());
  });

  // ── 叠叠乐：12 块（InstancedMesh，一个 draw call；topple 改实例矩阵）──────────────
  const blkGeo = new THREE.BoxGeometry(BLK_L, BLK_H, BLK_W);
  blkGeo.deleteAttribute('uv');
  const N = LAYERS * 3;
  const tower = new THREE.InstancedMesh(blkGeo, blockMat, N);
  tower.name = 'tower';
  tower.frustumCulled = false;
  const rt = ctx.rng('lawn-games:tower');
  const T0 = new THREE.Vector3(TOWER[0], 0, TOWER[1]);
  // 往西南倒（朝镜头偏左：倒下的木块落在草皮上、看得见）
  const F = new THREE.Vector3(-0.45, 0, 0.9).normalize();
  const side = new THREE.Vector3(F.z, 0, -F.x);
  const tiltAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), F).normalize();
  const pivot = T0.clone().addScaledVector(F, BLK_L / 2);
  const UP = new THREE.Vector3(0, 1, 0);
  const startP: THREE.Vector3[] = [];
  const startQ: THREE.Quaternion[] = [];
  const endP: THREE.Vector3[] = [];
  const endQ: THREE.Quaternion[] = [];
  const delay: number[] = [];
  const col = new THREE.Color();
  for (let L = 0; L < LAYERS; L++) {
    const alongX = L % 2 === 0;
    for (let j = 0; j < 3; j++) {
      const i = L * 3 + j;
      const off = (j - 1) * BLK_STEP;
      // 叠好：偶数层顺 x、奇数层顺 z（交错）
      startP.push(new THREE.Vector3(T0.x + (alongX ? 0 : off), L * LAYER_H + BLK_H / 2, T0.z + (alongX ? off : 0)));
      startQ.push(new THREE.Quaternion().setFromAxisAngle(UP, alongX ? 0 : Math.PI / 2));
      // 倒了：平躺（0.16 那一面朝上），顺倒的方向散开，上面的层飞得远
      const dist = 0.3 + L * 0.24 + rt() * 0.12;
      const lat = (j - 1) * 0.26 + (rt() - 0.5) * 0.16;
      const stack = L === 2 && j === 1 ? BLK_W : 0; // 一块压在别的上面
      endP.push(
        T0.clone()
          .addScaledVector(F, dist)
          .addScaledVector(side, lat)
          .setY(BLK_W / 2 + stack),
      );
      const yaw = Math.atan2(-F.z, F.x) + (rt() - 0.5) * 1.8;
      endQ.push(
        new THREE.Quaternion()
          .setFromAxisAngle(UP, yaw)
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)),
      );
      // 上面的先掉
      delay.push(0.3 + (LAYERS - 1 - L) * 0.07 + j * 0.02);
      // 每块一点深浅（接近白的明暗，颜色来自三档）
      tower.setColorAt(i, col.setScalar(0.88 + rt() * 0.12));
    }
  }
  const m4 = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const tq = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  let toppled = -1;
  const topple = (k: number) => {
    k = Math.min(1, Math.max(0, k));
    if (k === toppled) return;
    toppled = k;
    // 整座先往 F 歪（绕倒的那一边的底棱），然后一块块落到地上
    const tilt = 0.6 * smooth(0, 0.45, k);
    tq.setFromAxisAngle(tiltAxis, tilt);
    for (let i = 0; i < N; i++) {
      p.copy(startP[i]).sub(pivot).applyQuaternion(tq).add(pivot);
      q.copy(tq).multiply(startQ[i]);
      const e = smooth(delay[i], delay[i] + 0.4, k);
      if (e > 0) {
        // 下落：水平匀速、竖直加速（像掉下来）
        const ey = e * e;
        p.set(p.x + (endP[i].x - p.x) * e, p.y + (endP[i].y - p.y) * ey, p.z + (endP[i].z - p.z) * e);
        q.slerp(endQ[i], e);
      }
      tower.setMatrixAt(i, m4.compose(p, q, one));
    }
    tower.instanceMatrix.needsUpdate = true;
  };
  topple(0);
  if (tower.instanceColor) tower.instanceColor.needsUpdate = true;
  root.add(tower);

  root.userData.holes = holes;
  root.userData.boards = boards;
  root.userData.bags = bags;
  root.userData.bagHome = (i: number) => homes[i].clone();
  root.userData.topple = topple;
  root.userData.towerAt = TOWER;

  // 画廊：?topple=0..1 看倒的样子
  const tp = ctx.params.get('topple');
  if (tp !== null) topple(Number(tp));

  ctx.mats.prepare(root);
  return root;
}
