// 涵洞口：干河床穿过马路的地方，马路北沿一截水泥端墙，拱形的管口朝北（−z，对着河床），管口里是深色。
// 3.2 × 0.9 × 0.7 米。本地原点 = 脚印中心的地面（管底 = 河床面 y 0）。
// 组成（少而胖）：中间一段高的端墙（挖一个拱洞，穿透）+ 管口一圈往北凸出 0.18 米的拱圈 + 两头各一段矮的翼墙（往北伸到 0.7 米深，
// 挡河床两岸的沙）+ 墙顶的浅色压顶（俯视是一条亮唇）+ 洞里一块深色（双面：从哪边看过去都是黑洞）。
// 镜头在南边：管口那面背对镜头；拱洞是穿透的，镜头看到的是端墙南面的一个黑拱洞 —— 一眼读得出"马路底下有根管子"。
// 画廊里 &r=3.1416 转过来看管口那面（拱圈、翼墙）。
// 水泥平涂（小东西，大面安静）；朝镜头的立面 lightUp + 低 bands 落中档，黑洞才拉得开。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
/**
 * 朝镜头 / 朝北的立面：光往上偏、阈值往下挪 → 中档（不管太阳在哪边，立面都是一个颜色）；不接投影
 * （太阳在后面，南面自己挡着自己 → 投影把它压回暗档，黑洞就拉不开了）
 */
const FACE = { lightUp: 0.6, bands: [-0.55, 0.3] as [number, number], noShadowReceive: true };
/** 洞里：定死在暗档（管口朝北正对着太阳，按光算会是亮档） */
const HOLE = {
  bands: [3, 4] as [number, number],
  edge: 0.05,
  convex: 0,
  noShadowReceive: true,
  side: THREE.DoubleSide,
};

/** 盒子：中心 (x, y, z) */
function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
}

/** 拱形轮廓（xy 平面）：半宽 r，直墙高 s，上面半圆（从左拱脚顺时针翻过拱顶）；y0 = 底边高 */
function archPath(path: THREE.Path, r: number, s: number, y0 = 0) {
  path.moveTo(-r, y0);
  path.lineTo(-r, s);
  path.absarc(0, s, r, Math.PI, 0, true);
  path.lineTo(r, y0);
  path.lineTo(-r, y0);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'culvert';
  const W = 3.2;
  const D = 0.7;
  const capH = T; // 压顶高（一纹素）
  const wallH = 0.9 - capH; // 中段端墙
  const wingH = 0.5 - capH; // 两头翼墙
  const midW = 2.0; // 中段宽
  const wingW = (W - midW) / 2; // 0.6
  const wallD = 0.36; // 端墙厚（z −0.18 … 0.18）
  const r = 0.44; // 管半宽（拱洞）
  const s = 0.14; // 拱脚高（拱洞直墙那段）→ 拱顶 0.58
  const ring = 0.14; // 拱圈厚
  const ringD = 2 * T;
  const zN = -wallD / 2; // 端墙北面

  // ── 中段端墙：矩形挖一个拱洞，沿 z 挤出 ──
  const shape = new THREE.Shape();
  shape.moveTo(-midW / 2, 0);
  shape.lineTo(midW / 2, 0);
  shape.lineTo(midW / 2, wallH);
  shape.lineTo(-midW / 2, wallH);
  shape.lineTo(-midW / 2, 0);
  // 洞从底边往上（ExtrudeGeometry 的洞不能碰外轮廓：底留 1 毫米）
  const hole = new THREE.Path();
  archPath(hole, r, s, 0.001);
  shape.holes.push(hole);
  const head = new THREE.ExtrudeGeometry(shape, { depth: wallD, bevelEnabled: false, curveSegments: 10 })
    .translate(0, 0, -wallD / 2)
    .toNonIndexed();

  // ── 拱圈：管口一圈往北凸出 ──
  const ringShape = new THREE.Shape();
  archPath(ringShape, r + ring, s);
  const ringHole = new THREE.Path();
  archPath(ringHole, r, s, 0.001);
  ringShape.holes.push(ringHole);
  const ringGeo = new THREE.ExtrudeGeometry(ringShape, { depth: ringD, bevelEnabled: false, curveSegments: 10 })
    .translate(0, 0, zN - ringD)
    .toNonIndexed();

  // ── 翼墙：两头各一段矮墙，南面和端墙齐，往北伸到 D ──
  const zS = wallD / 2;
  const wingZ = zS - D / 2;
  const concrete: THREE.BufferGeometry[] = [head, ringGeo];
  for (const sx of [-1, 1]) concrete.push(box(wingW, wingH, D, sx * (midW / 2 + wingW / 2), wingH / 2, wingZ));
  g.add(new THREE.Mesh(mergeGeometries(concrete), ctx.mat('concrete', FACE)));

  // ── 压顶：中段一条、翼墙各一条，比墙每边宽出半纹素 ──
  const caps: THREE.BufferGeometry[] = [box(midW + T, capH, wallD + T, 0, wallH + capH / 2, 0)];
  for (const sx of [-1, 1])
    caps.push(box(wingW + T / 2, capH, D + T, sx * (midW / 2 + wingW / 2 + T / 4), wingH + capH / 2, wingZ));
  g.add(new THREE.Mesh(mergeGeometries(caps), ctx.mat('curb', FACE)));

  // ── 洞里：管子中间一块深色（双面）+ 洞底一条 ──
  const inner = new THREE.Shape();
  archPath(inner, r, s);
  g.add(new THREE.Mesh(new THREE.ShapeGeometry(inner, 10).translate(0, 0, 0), ctx.mat('ironwork', HOLE)));
  g.add(new THREE.Mesh(box(2 * r, 0.02, wallD + ringD, 0, 0.01, -ringD / 2), ctx.mat('ironwork', HOLE)));

  ctx.mats.prepare(g);
  return g;
}
