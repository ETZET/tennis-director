// 龙舌兰（agave）：一圈宽厚、尖的银蓝叶（两层，外层平展、内层更竖），从中心往外往上翻。
// 每片叶是一个有厚度的弯尖舌（上面是浅 V 槽）；法线 = 叶面法线和"从植株中心往外"的球面法线混合 →
// 整丛有亮顶/暗底，每片叶又和邻叶分得开。叶尖一小截深色。
// 材质规范 v2：叶片本身就是元素（"少而胖"，不加碎纹理）；每片叶面分三条：两边 1 纹素的亮叶缘、中间的叶身、
// 叶槽里一条暗线（只在叶的前半截，那里叶够宽）。用顶点色做（1.0 / 0.91 / 0.82，规范允许的近白明暗），颜色来自手挑的三档；
// 叶缘的折边再靠描边 pass 的凸边高光（convex 0.8）提亮一点。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../world';

/** 手挑的银蓝（亮档 = 叶缘色；叶身 × 0.91、叶槽 × 0.82）：亮 #bcdcd8 → 叶身 L ≈ 194、叶槽 ≈ 175；中 #84a8c0；暗（冷靛）#4e6496 */
const RAMP: [number, number, number] = [0xbcdcd8, 0x84a8c0, 0x4e6496];
const TIP: [number, number, number] = [0x4e6496, 0x46588c, 0x3e4c80];
const VC_EDGE = 1.0;
const VC_BODY = 0.91;
const VC_CHAN = 0.82;

/**
 * 一片叶：沿 +x 长 len，基部宽 w、厚 th；pitch 抬起角（叶尖往上翻 curl）；只出第 s0..s1 段（共 5 段）。
 * 叶面截面 7 点：左缘、左缘内、槽左、槽心、槽右、右缘内、右缘；再加背脊。每条叶面带一个顶点色（非索引，边界是硬的）。
 */
function leaf(
  len: number,
  w: number,
  th: number,
  pitch: number,
  curl: number,
  s0: number,
  s1: number,
  T: number,
): THREE.BufferGeometry {
  const N = 5;
  const pos: number[] = [];
  const col: number[] = [];
  const st: THREE.Vector3[][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const half = (w / 2) * (t < 0.3 ? 0.8 + 0.67 * t : ((1 - t) / 0.7) ** 0.6) + 0.0001;
    const a = pitch + curl * t * t;
    const x = Math.cos(pitch) * len * t * (1 - 0.25 * curl * t);
    const y = Math.sin(a) * len * t * 0.95;
    const tt = th * (1 - t * 0.85);
    // 叶缘带 ≈ 1 纹素（但不超过半宽的 45%），槽 ≈ 1 纹素宽（半宽的 30% 以内）
    const m = Math.min(T * 1.05, half * 0.45);
    const ch = Math.min(T * 0.55, half * 0.3);
    // 深 V 槽：两半叶面各往两侧斜约 20°
    const vy = (u: number) => y + tt * 0.35 + Math.abs(u) * 0.4;
    // 叶面 7 点 + 背脊
    st.push([
      ...[-half, -(half - m), -ch, 0, ch, half - m, half].map((u) => new THREE.Vector3(x, vy(u), u)),
      new THREE.Vector3(x, y - tt * 0.5, 0),
    ]);
  }
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, vc: number) => {
    // a、b 在这一站，c、d 在下一站（a→b 和 c→d 同向）
    for (const p of [a, b, c, b, d, c]) {
      pos.push(p.x, p.y, p.z);
      col.push(vc, vc, vc);
    }
  };
  for (let i = s0; i < Math.min(s1, N); i++) {
    const A = st[i];
    const B = st[i + 1];
    if (i < 2) {
      // 前两段（叶最宽）：叶缘、叶身、叶槽两半、叶身、叶缘
      const strips = [VC_EDGE, VC_BODY, VC_CHAN, VC_CHAN, VC_BODY, VC_EDGE];
      for (let k = 0; k < 6; k++) quad(A[k], A[k + 1], B[k], B[k + 1], strips[k]);
    } else {
      // 往叶尖：叶缘、叶身（到槽心）、叶身、叶缘 —— 省三角形
      for (const [p, q, vc] of [
        [0, 1, VC_EDGE],
        [1, 3, VC_BODY],
        [3, 5, VC_BODY],
        [5, 6, VC_EDGE],
      ] as const)
        quad(A[p], A[q], B[p], B[q], vc);
    }
    // 背面：左缘 → 背脊 → 右缘
    quad(A[7], A[0], B[7], B[0], VC_BODY);
    quad(A[6], A[7], B[6], B[7], VC_BODY);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
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
  /** 内层、芯的竖叶：不投影（不然太阳在画面后方，它们把朝镜头的外层叶投成一块块深靛的斑） */
  const inner: THREE.BufferGeometry[] = [];
  const tips: THREE.BufferGeometry[] = [];
  const s = ctx.variant % 2 === 1 ? 0.85 : 1;
  // 外层 6 片（平展、长、宽）、内层 4 片（竖、短）、芯 2 片：少而胖，每片叶够宽才放得下叶缘和叶槽
  const rings: [number, number, number, number, number, number][] = [
    // n, len, width, pitch, curl, y
    [6, 0.98, 0.54, 0.26, 0.5, 0.06],
    [4, 0.72, 0.46, 0.72, 0.35, 0.12],
    [2, 0.5, 0.38, 1.1, 0.2, 0.18],
  ];
  const c = new THREE.Vector3(0, -0.25, 0);
  let off = rnd() * Math.PI;
  for (const [ri, [n, len, w, pitch, curl, y]] of rings.entries()) {
    for (let i = 0; i < n; i++) {
      const az = off + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.25;
      const L = len * s * (0.9 + rnd() * 0.2);
      const W = Math.max(w * s, T * 3.2);
      const P = pitch + (rnd() - 0.5) * 0.15;
      // 叶身（前 4 段）+ 叶尖（最后一段，深色，接在叶身上不会浮成一个点）
      for (const [s0, s1, out] of [
        [0, 4, ri === 0 ? leaves : inner],
        [4, 5, tips],
      ] as const) {
        const g = leaf(L, W, 0.1, P, curl, s0, s1, T);
        g.rotateY(-az);
        g.translate(0, y, 0);
        mixNormals(g, c, 0.3);
        out.push(g);
      }
    }
    off += Math.PI / n;
  }
  const g = new THREE.Group();
  // 接收投影：放在蒲葵影子里（agave-w、agave-pool）要跟着暗（整套暗档靛蓝，叶缘、叶槽照样在）
  const leafMat = ctx.mat('silverBlue', {
    ramp: RAMP,
    vertexColors: true,
    lightUp: 0.35,
    noise: 0,
    bands: [0.1, 0.56],
    edge: 0.6,
    convex: 0.8,
  });
  const innerMesh = new THREE.Mesh(mergeGeometries(inner), leafMat);
  g.add(new THREE.Mesh(mergeGeometries(leaves), leafMat), innerMesh);
  g.add(
    new THREE.Mesh(
      mergeGeometries(tips),
      ctx.mat('silverBlue', { ramp: TIP, lightUp: 0.2, edge: 0.3, convex: 0, noShadowReceive: true }),
    ),
  );
  ctx.mats.prepare(g);
  innerMesh.castShadow = false;
  return g;
}
