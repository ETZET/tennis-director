// #13 bin-station：三色回收站（总监倒垃圾）。世界 (−37.0, −22.85)，朝南（+z = 镜头）。
// 尺寸 2.1（x）× 1.36（高）× 0.7（深）；三角形 292（上限 400；三只袋子 96 个只在满桶时显示）。
// 一块木背板（timber，竖板条）上三个像素图标（signPaint：叉 / 瓶 / 苹果核），前面三只胖桶（桶身 carSilver），
// 桶盖：灰（其他垃圾，carSilver 的中档往下）/ 蓝（accRecycle，回收）/ 绿（accCompost，厨余）—— 盖子朝天 = 亮档，是这件的看点。
// 桶在本地 x −0.68 / 0 / 0.68。
//
// userData：
//   setFill([a, b, c])  每只 0..1；≥ 0.95 = 满：盖子前沿被顶起一条缝（歪一点），桶口露出扎好的黑袋子（ironwork）一角
//   fill                当前的 [a, b, c]
//   spots.front         [lx, lz] 总监站的地面点（中间那只桶前 ≈ 0.6 米）；spots.bins[i] = 第 i 只桶前的点
//   lid(i)              → THREE.Vector3（本地）：第 i 只桶盖顶面中心（鸟站在上面用；盖子顶起来时跟着走）
// 画廊试满桶：?asset=bin-station&fill=1,0.4,1
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';

const BIN_X = [-0.68, 0, 0.68];
/** 桶：宽（留 1 纹素的缝）、深、桶身高；盖子厚、四周出檐 */
const BIN_W = 0.59;
const BIN_D = 0.5;
const BIN_Z = 0.08;
const BODY_H = 0.53;
const LID_T = 0.07;
const LID_O = 0.02;
/** 背板 */
const PANEL_H = 1.36;
const PANEL_Z = -0.29;
const PANEL_T = 0.06;
/** 竖直面上一屏幕行 = 0.09 / cos45 米 */
const ROW = 0.09 / Math.SQRT1_2;

/** 图标（字符画，从上往下每行一个屏幕行，X = 一纹素）：灰桶 = 叉、蓝桶 = 瓶、绿桶 = 苹果（4 行里画果核读成"工"，画整只带梗的苹果） */
const ICONS = [
  ['X.X.X', 'XXXXX', '..X..', '..X..'],
  ['.X.', '.X.', 'XXX', 'XXX'],
  ['..X.', 'XXX.', 'XXXX', '.XX.'],
];

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z).toNonIndexed();
}

/** 竖直小方块（图标的一个像素）：朝 +z 的一块面 */
function pix(x: number, y: number, z: number, w: number, h: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(w, h).translate(x, y, z).toNonIndexed();
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'bin-station';
  const t = ctx.texel;

  // 朝镜头的竖直面在暗档：背板 / 桶身抬到中档或亮档（lightUp + 低 bands），小东西都不接投影（背板的影子正好落在桶盖上）
  const front: ToonOpts = { lightUp: 0.55, bands: [-0.45, 0.35], noShadowReceive: true };

  // ── 背板：木板竖拼（板宽 3 纹素，缝 1 纹素），正面抬到亮档（暖棕 L≈157）；顶上一条压顶木 ──
  const panelMat = ctx.mat('timber', {
    lightUp: 0.7,
    bands: [-0.45, -0.12],
    noShadowReceive: true,
    convex: 0.25,
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, t * 5], seam: 1, hi: 0.25 },
  });
  const panel = mergeGeometries([
    box(2.1, PANEL_H - 0.06, PANEL_T, 0, 0, PANEL_Z),
    // 压顶：和板一样厚（往前出檐会挡住图标的第一行），顶面朝天 = 一行亮边
    box(2.14, 0.06, PANEL_T + 0.02, 0, PANEL_H - 0.06, PANEL_Z - 0.01),
    // 两根落地的脚（左右，桶的外侧露出来）
    box(0.09, 0.5, 0.16, -1.0, 0, PANEL_Z + 0.08),
    box(0.09, 0.5, 0.16, 1.0, 0, PANEL_Z + 0.08),
  ]);
  g.add(new THREE.Mesh(panel, panelMat));

  // ── 图标：每只桶上方一个，奶油色（中档 L≈204，和亮档木板差 ≈ 47） ──
  const iconParts: THREE.BufferGeometry[] = [];
  const zi = PANEL_Z + PANEL_T / 2 + 0.004;
  BIN_X.forEach((bx, i) => {
    const rows = ICONS[i];
    const cols = rows[0].length;
    // 最上一行的中心放在板顶往下 1.5 行
    const top = PANEL_H - 0.06 - ROW * 1.1;
    rows.forEach((row, r) => {
      // 一行里连着的 X 合成一块（省三角形）
      for (let c = 0; c < cols; c++) {
        if (row[c] !== 'X') continue;
        let e = c;
        while (row[e + 1] === 'X') e++;
        const x = bx + ((c + e) / 2 - (cols - 1) / 2) * t;
        iconParts.push(pix(x, top - r * ROW, zi, t * (e - c + 1), ROW));
        c = e;
      }
    });
  });
  g.add(new THREE.Mesh(mergeGeometries(iconParts), ctx.mat('signPaint', { ...front, convex: 0, edge: 0.2 })));

  // ── 桶身：三只一个网格；底下一圈暗色踢脚（ironwork），桶身正面中档银 ──
  const bodies = mergeGeometries(BIN_X.map((x) => box(BIN_W, BODY_H - 0.06, BIN_D, x, 0.06, BIN_Z)));
  g.add(new THREE.Mesh(bodies, ctx.mat('carSilver', { ...front, convex: 0.3 })));
  const kick = box(BIN_X[2] - BIN_X[0] + BIN_W - 0.04, 0.06, BIN_D - 0.04, 0, 0, BIN_Z);
  g.add(new THREE.Mesh(kick, ctx.mat('ironwork', { ...front, convex: 0.2 })));

  // ── 桶盖：每只一个转轴组（铰链在桶身后沿顶上），盖子在组里往 +z 伸 ──
  const lidOpts: ToonOpts = { noShadowReceive: true, convex: 0.3, lightUp: 0.2, bands: [-0.2, 0.4] };
  const lidMats = [
    // 灰盖：carSilver 往下挪一档（亮 = 中档银，中 = 中暗之间，暗 = 暗档），盖顶读成灰、不是白
    ctx.mat('binGrey', lidOpts),
    ctx.mat('accRecycle', lidOpts),
    ctx.mat('accCompost', lidOpts),
  ];
  const lidW = BIN_W + LID_O * 2;
  const lidD = BIN_D + LID_O * 2;
  const lidGeo = mergeGeometries([
    box(lidW, LID_T, lidD, 0, 0, lidD / 2),
    // 盖子前沿的把手：一条 3 纹素宽的小檐（朝镜头，暗一档）
    box(0.27, 0.05, 0.05, 0, 0.0, lidD + 0.02),
  ]);
  const zHinge = BIN_Z - BIN_D / 2 - LID_O;
  const pivots = BIN_X.map((x, i) => {
    const p = new THREE.Group();
    p.position.set(x, BODY_H, zHinge);
    p.add(new THREE.Mesh(lidGeo, lidMats[i]));
    g.add(p);
    return p;
  });

  // ── 满了以后桶口露出来的黑袋子：一团（挤在盖子下面）+ 前角一个扎口的小揪；三只一个 InstancedMesh ──
  const rnd = ctx.rng('bin-station:bag');
  const lump = new THREE.SphereGeometry(0.3, 6, 3).scale(0.98, 0.5, 0.86).translate(0, -0.02, 0.02);
  const knot = new THREE.CylinderGeometry(0.11, 0.04, 0.17, 4, 1, true)
    .rotateY(Math.PI / 4)
    .translate(-0.17, 0.05, 0.3);
  const bagGeo = mergeGeometries([lump.toNonIndexed(), knot.toNonIndexed()]);
  const bagMat = ctx.mat('ironwork', {
    noShadowReceive: true,
    lightUp: 0.4,
    convex: 0.25,
    sphereNormals: [0, -0.15, 0],
  });
  const bags = new THREE.InstancedMesh(bagGeo, bagMat, 3);
  const bagFlip = BIN_X.map(() => (rnd() < 0.5 ? -1 : 1));
  g.add(bags);

  const fill = [0, 0, 0];
  const m4 = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const setFill = (f: ArrayLike<number>) => {
    for (let i = 0; i < 3; i++) {
      const k = THREE.MathUtils.clamp(f[i] ?? 0, 0, 1);
      fill[i] = k;
      const full = k >= 0.95;
      // 盖子：前沿顶起 ≈ 0.16 米（绕铰链抬 0.3 弧度），再往一边歪一点
      pivots[i].rotation.set(full ? -0.3 : 0, 0, full ? 0.07 * bagFlip[i] : 0);
      if (full) {
        m4.compose(
          new THREE.Vector3(BIN_X[i], BODY_H + 0.01, BIN_Z),
          new THREE.Quaternion(),
          new THREE.Vector3(1, 1, 1),
        );
        bags.setMatrixAt(i, m4);
      } else bags.setMatrixAt(i, zero);
    }
    bags.instanceMatrix.needsUpdate = true;
    bags.computeBoundingSphere();
  };

  const lid = (i: number): THREE.Vector3 => {
    const p = pivots[THREE.MathUtils.clamp(Math.round(i), 0, 2)];
    p.updateMatrix();
    return new THREE.Vector3(0, LID_T, lidD / 2).applyMatrix4(p.matrix);
  };

  const fz = BIN_Z + BIN_D / 2 + 0.6;
  g.userData.setFill = setFill;
  g.userData.fill = fill;
  g.userData.lid = lid;
  g.userData.spots = {
    front: [0, fz] as [number, number],
    bins: BIN_X.map((x) => [x, fz] as [number, number]),
  };

  const q = ctx.params.get('fill');
  setFill(q ? q.split(',').map(Number) : [0.5, 1, 0.3]);

  ctx.mats.prepare(g);
  return g;
}
