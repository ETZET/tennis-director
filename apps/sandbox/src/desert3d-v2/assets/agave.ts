// 龙舌兰（agave）：一圈宽厚、尖的银蓝叶（两层，外层平展、内层更竖），从中心往外往上翻。
// 每片叶是一个有厚度的弯尖舌（上面是浅 V 槽）；法线 = 叶面法线和"从植株中心往外"的球面法线混合 →
// 整丛有亮顶/暗底，每片叶又和邻叶分得开。叶尖一小截深色。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from '../palette';
import type { AssetCtx } from '../world';

/** 一片叶：沿 +x 长 len，基部宽 w、厚 th；pitch 抬起角（叶尖往上翻 curl）；只出第 s0..s1 段（共 6 段） */
function leaf(
  len: number,
  w: number,
  th: number,
  pitch: number,
  curl: number,
  s0: number,
  s1: number,
): THREE.BufferGeometry {
  const N = 6;
  const pos: number[] = [];
  const idx: number[] = [];
  // 截面 4 点：左缘、槽心（上）、右缘、背脊（下）
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const half = (w / 2) * (t < 0.3 ? 0.8 + 0.67 * t : ((1 - t) / 0.7) ** 0.8) + 0.0001;
    const a = pitch + curl * t * t;
    const x = Math.cos(pitch) * len * t * (1 - 0.25 * curl * t);
    const y = Math.sin(a) * len * t * 0.95;
    const tt = th * (1 - t * 0.85);
    // 深 V 槽：两半叶面各往两侧斜约 20°，面法线一半亮一半中 → 每片叶都有一条亮/中的分界，邻叶分得开
    const v = half * 0.4;
    pos.push(x, y + tt * 0.35 + v, -half); // 左缘
    pos.push(x, y + tt * 0.35, 0); // 槽心
    pos.push(x, y + tt * 0.35 + v, half); // 右缘
    pos.push(x, y - tt * 0.5, 0); // 背脊
  }
  for (let i = s0; i < Math.min(s1, N); i++) {
    const a = i * 4;
    const b = a + 4;
    const quad = (p: number, q: number) => idx.push(a + p, a + q, b + p, a + q, b + q, b + p);
    quad(0, 1); // 上面 左半
    quad(1, 2); // 上面 右半
    quad(3, 0); // 背面 左
    quad(2, 3); // 背面 右
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}

/** 面法线和球面法线（从 c 往外）按 k 混合 */
function mixNormals(g: THREE.BufferGeometry, c: THREE.Vector3, k: number) {
  g.computeVertexNormals();
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    a.fromBufferAttribute(n, i);
    b.fromBufferAttribute(p, i).sub(c).normalize();
    a.lerp(b, k).normalize();
    n.setXYZ(i, a.x, a.y, a.z);
  }
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const rnd = ctx.rng(`agave:${ctx.variant}`);
  const T = ctx.texel;
  const leaves: THREE.BufferGeometry[] = [];
  const tips: THREE.BufferGeometry[] = [];
  const s = ctx.variant % 2 === 1 ? 0.85 : 1;
  // 外层 8 片（平展、长）、内层 6 片（竖、短）、芯 3 片
  const rings: [number, number, number, number, number, number][] = [
    // n, len, width, pitch, curl, y
    [7, 0.98, 0.46, 0.26, 0.5, 0.06],
    [5, 0.7, 0.4, 0.72, 0.35, 0.12],
    [3, 0.5, 0.34, 1.1, 0.2, 0.18],
  ];
  const c = new THREE.Vector3(0, -0.25, 0);
  let off = rnd() * Math.PI;
  for (const [n, len, w, pitch, curl, y] of rings) {
    for (let i = 0; i < n; i++) {
      const az = off + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.25;
      const L = len * s * (0.9 + rnd() * 0.2);
      const W = Math.max(w * s, T * 3.2);
      const P = pitch + (rnd() - 0.5) * 0.15;
      // 叶身（前 5 段）+ 叶尖（最后一段，深色，接在叶身上不会浮成一个点）
      for (const [s0, s1, out] of [
        [0, 5, leaves],
        [5, 6, tips],
      ] as const) {
        const g = leaf(L, W, 0.1, P, curl, s0, s1);
        g.rotateY(-az);
        g.translate(0, y, 0);
        mixNormals(g, c, 0.3);
        out.push(g);
      }
    }
    off += Math.PI / n;
  }
  const sb = PAL.silverBlue.ramp;
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(
      mergeGeometries(leaves),
      ctx.mat('silverBlue', {
        lightUp: 0.2,
        noise: 0,
        bands: [0.1, 0.56],
        edge: 0.6,
        convex: 0.3,
        noShadowReceive: true,
      }),
    ),
  );
  g.add(
    new THREE.Mesh(
      mergeGeometries(tips),
      ctx.mat('silverBlue', { ramp: [sb[2], sb[2], sb[2]], edge: 0.3, convex: 0, noShadowReceive: true }),
    ),
  );
  ctx.mats.prepare(g);
  return g;
}
