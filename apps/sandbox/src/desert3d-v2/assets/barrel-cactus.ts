// 桶形仙人掌：2～3 个胖桶成组（一大一中一小）。竖向棱 = 法线在棱脊/棱沟之间来回摆 → 一条条亮暗带；
// 顶上一圈黄花（只给大的、中的）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blobNormals } from '../toon';
import type { AssetCtx } from '../world';

/**
 * 一个桶：r 半径、h 高、ribs 棱数。剖面是圆顶的桶（底略收、顶圆），
 * 法线 = 球面法线（团心在桶中下部）+ 绕竖轴的棱向偏转（棱脊朝外、棱沟两侧往里斜）。
 */
function barrel(r: number, h: number, ribs: number, phase: number): THREE.BufferGeometry {
  const seg = ribs * 4; // 每条棱 4 段：脊、斜、沟、斜
  const rows = 4;
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Vector3(0, h * 0.42, 0);
  const v = new THREE.Vector3();
  const nn = new THREE.Vector3();
  for (let j = 0; j <= rows; j++) {
    const t = j / rows; // 0 底 → 1 顶
    // 剖面：底 0.88r，腰 1.0r，顶部圆收（最后一行收到 0.2r）
    const prof =
      t < 0.6 ? 0.88 + 0.12 * Math.sin((t / 0.6) * Math.PI * 0.5) : Math.cos(((t - 0.6) / 0.4) * Math.PI * 0.44);
    const y = t < 0.6 ? t * h : h * 0.6 + Math.sin(((t - 0.6) / 0.4) * Math.PI * 0.5) * h * 0.4;
    const rr = r * Math.max(0.2, prof);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2 + phase;
      const k = i % 4; // 0 脊 1 斜 2 沟 3 斜
      const depth = k === 0 ? 1 : k === 2 ? 0.86 : 0.93;
      const rad = rr * (j === rows ? 1 : depth);
      v.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
      pos.push(v.x, v.y, v.z);
      // 球面法线 + 切向偏转：1 号斜面往 +a 方向偏，3 号往 -a 偏（棱的两侧一亮一暗）
      nn.copy(v).sub(c).normalize();
      const tw = k === 1 ? 0.75 : k === 3 ? -0.75 : 0;
      const tx = -Math.sin(a);
      const tz = Math.cos(a);
      nn.x += tx * tw;
      nn.z += tz * tw;
      nn.normalize();
      nor.push(nn.x, nn.y, nn.z);
    }
  }
  const W = seg + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * W + i;
      const b = a + W;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** 顶上一圈花：n 个小团围一圈 */
function crown(r: number, y: number, n: number, fr: number, rnd: () => number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
    const p = new THREE.Vector3(Math.cos(a) * r, y + rnd() * 0.03, Math.sin(a) * r);
    const g = new THREE.IcosahedronGeometry(fr, 0);
    g.scale(1, 0.75, 1);
    g.translate(p.x, p.y, p.z);
    out.push(blobNormals(g, p.clone().setY(p.y - fr * 0.5)));
  }
  return out;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const rnd = ctx.rng(`barrel-cactus:${ctx.variant}`);
  const T = ctx.texel;
  const bodies: THREE.BufferGeometry[] = [];
  const flowers: THREE.BufferGeometry[] = [];
  // 一大（后）、一中（右前）、一小（左前）
  const set: [number, number, number, number, number, boolean][] = [
    [0.34, 0.9, -0.06, -0.08, 6, true],
    [0.22, 0.52, 0.27, 0.2, 5, true],
    [0.16, 0.32, -0.28, 0.22, 5, false],
  ];
  for (const [r, h, x, z, ribs, fl] of set) {
    const rr = r * (0.92 + rnd() * 0.16);
    const hh = h * (0.9 + rnd() * 0.2);
    const b = barrel(rr, hh, ribs, rnd() * Math.PI);
    b.translate(x, 0, z);
    bodies.push(b);
    if (fl) {
      const fr = Math.max(T * 1.6, rr * 0.3);
      for (const f of crown(rr * 0.42, hh - fr * 0.1, rr > 0.3 ? 5 : 3, fr, rnd)) {
        f.translate(x, 0, z);
        flowers.push(f);
      }
    }
  }
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(
      mergeGeometries(bodies),
      ctx.mat('cactus', { lightUp: 0.6, bands: [-0.25, 0.32], noShadowReceive: true }),
    ),
  );
  g.add(
    new THREE.Mesh(
      mergeGeometries(flowers),
      ctx.mat('flowerYellow', { lightUp: 0.5, bands: [-0.2, 0.3], edge: 0.5, noShadowReceive: true }),
    ),
  );
  ctx.mats.prepare(g);
  return g;
}
