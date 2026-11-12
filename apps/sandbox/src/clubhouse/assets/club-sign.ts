// club-sign：南拱廊上沿的会所招牌（#7）。3.0 × 0.86 × 0.12 米（33 × 10 × 1 设计纹素；比规格高 0.26，会徽才画得下），不写字：
// 俱乐部蓝的漆板（signBoard）+ 一圈深色木框（timber）+ 中间的会徽：一颗网球（ball）+ 两把交叉的球拍（奶油金的实心拍头、拍柄交叉在球下面）
// + 两头各一个奶油金的菱形。
// 挂在背光的墙上：漆板、会徽的阈值压低 → 朝镜头也落亮档（漆板 L ≈ 126 的蓝，会徽 L ≈ 180），木框落中档（L 118）：
// 会徽和漆板差 < 60（1 纹素的拍框不出强边缘），漆板和背光的白墙（L 125）分得开靠色相 + 铜框。都不接投影。
// 材质：signBoard、timber、signPaint、ball（都借原名，ramp 覆盖）。没有元素（小件）。三角形 ≈ 70。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type G = THREE.BufferGeometry;
type V = THREE.Vector2;
const v = (x: number, y: number) => new THREE.Vector2(x, y);
function merge(geos: G[]): G {
  const m = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
  if (!m) throw new Error('club-sign: merge failed');
  return m;
}
/** 椭圆（中心 c、沿 dir 的半轴 a、垂直的半轴 b）的点 */
function ellipse(c: V, dir: V, a: number, b: number, seg: number): V[] {
  const n = v(-dir.y, dir.x);
  return Array.from({ length: seg }, (_, i) => {
    const t = (i / seg) * Math.PI * 2;
    return c
      .clone()
      .addScaledVector(dir, Math.cos(t) * a)
      .addScaledVector(n, Math.sin(t) * b);
  });
}
/** 一段粗线（p0 → p1，宽 w）的四边形 */
function bar(p0: V, p1: V, w: number): THREE.Shape {
  const d = p1.clone().sub(p0).normalize();
  const n = v(-d.y, d.x).multiplyScalar(w / 2);
  return new THREE.Shape([p0.clone().add(n), p0.clone().sub(n), p1.clone().sub(n), p1.clone().add(n)]);
}
const flat = (s: THREE.Shape, z: number) => new THREE.ShapeGeometry(s, 8).translate(0, 0, z);

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const W = 3.0;
  const H = 0.86; // 比规格的 0.6 高：0.6 米在画廊（0.09 米/纹素）只有 5 行，会徽画不下；拱顶 3.0 到檐 4.0 之间放得下
  const D = 0.1;
  const Z0 = -0.06; // 背面（贴墙）
  const ZF = Z0 + D; // 漆板正面
  const lit = {
    lightUp: 0.55,
    bands: [-0.95, -0.7] as [number, number],
    noShadowReceive: true,
    edge: 0.4,
    convex: 0.2,
  };
  const board = ctx.mat('signBoard', { ...lit, ramp: [0x4a86d0, 0x3a70b8, 0x26468a] });
  const paint = ctx.mat('signPaint', { ...lit, edge: 0.2, convex: 0, ramp: [0xd8b884, 0xc8a070, 0x8a7090] });
  const ball = ctx.mat('ball', { ...lit, edge: 0.2, convex: 0, ramp: [0xb8c848, 0xa0b040, 0x6a8a5a] });
  const frame = ctx.mat('timber', { lightUp: 0.55, bands: [-0.45, 0.35], noShadowReceive: true, convex: 0.4 });

  // 漆板
  g.add(new THREE.Mesh(new THREE.BoxGeometry(W, H, D).translate(0, H / 2, Z0 + D / 2), board));
  // 木框：外 W × H，里面横向退 1 纹素、竖向退 1 行（0.13）
  const fr = new THREE.Shape([v(-W / 2, 0), v(W / 2, 0), v(W / 2, H), v(-W / 2, H)]);
  fr.holes.push(
    new THREE.Path([
      v(-W / 2 + 0.09, 0.13),
      v(-W / 2 + 0.09, H - 0.13),
      v(W / 2 - 0.09, H - 0.13),
      v(W / 2 - 0.09, 0.13),
    ]),
  );
  g.add(new THREE.Mesh(flat(fr, ZF + 0.004), frame));

  // 会徽：两把交叉的球拍（拍头在上外侧，拍柄交叉在球下面）+ 中间一颗球 + 两头的菱形
  const zp = ZF + 0.006;
  const parts: G[] = [];
  for (const s of [-1, 1]) {
    const head = v(s * 0.46, 0.55);
    const end = v(-s * 0.24, 0.1);
    const dir = head.clone().sub(end).normalize();
    const A = 0.26;
    const B = 0.18;
    const ring = new THREE.Shape(ellipse(head, dir, A, B, 10));
    // 拍头画实心的（1 纹素的拍框在画廊 0.09 米/纹素下断成碎点；实心的椭圆 + 拍柄一眼是球拍）
    parts.push(flat(ring, zp));
    parts.push(flat(bar(head.clone().addScaledVector(dir, -A + 0.02), end, 0.09), zp));
  }
  for (const s of [-1, 1]) {
    const c = v(s * 1.12, H / 2);
    parts.push(
      flat(new THREE.Shape([v(c.x, c.y - 0.2), v(c.x + 0.14, c.y), v(c.x, c.y + 0.2), v(c.x - 0.14, c.y)]), zp),
    );
  }
  g.add(new THREE.Mesh(merge(parts), paint));
  g.add(new THREE.Mesh(new THREE.CircleGeometry(0.22, 8).scale(1, 1.15, 1).translate(0, 0.42, zp + 0.003), ball));
  g.traverse((o) => {
    o.castShadow = true;
  });
  ctx.mats.prepare(g);
  return g;
}
