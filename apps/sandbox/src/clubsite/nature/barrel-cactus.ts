// 桶形仙人掌：2～3 个胖桶成组（一大一中一小，棱数 5 / 4 / 4：每个平面在屏幕上 ≥ 1.5 纹素，色带才干净）。竖向棱 = 每条棱两个平面（迎光的一半、背光的一半），
// 每个平面的法线只随高度变 → 一条条干净的竖向亮/暗带（材质规范 v2：棱是干净的色带，不碎）；
// 棱上撒稀疏的竖向刺（`blades`，淡金），暗档冷青。顶上一圈黄花（只给大的、中的）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BaseCtx as AssetCtx } from '../render/ctx';
import type { Tones } from '../render/toon';
import { blobNormals } from '../render/toon';

/** 仙人掌绿（手挑）：[亮, 中, 暗] 各 [本色, 高一级, 低一级]；亮边色 = 刺（淡金 → 灰绿 → 冷青） */
const BODY: Tones = {
  bands: [
    [0x8cc068, 0x96c870, 0x88bc64],
    [0x4e9470, 0x569c76, 0x488a6a],
    [0x2c5a6e, 0x326276, 0x285266],
  ],
  seam: [0x6a9e5a, 0x3e7a66, 0x234a60],
  hi: [0xd8d08a, 0x9aac78, 0x4a7086],
};

/**
 * 一个桶：r 半径、h 高、ribs 棱数。剖面是圆顶的桶（底略收、顶圆）。每条棱 = 棱脊 → 棱沟、棱沟 → 下一条棱脊两个平面；
 * 平面的水平法线 = 平面中线的径向往两边各转 tw（比几何上的 15° 夸大，亮暗带才分得开），竖直分量照球面法线（团心在桶中下部）。
 */
function barrel(r: number, h: number, ribs: number, phase: number, tw = 0.62): THREE.BufferGeometry {
  const rows = 4;
  const pos: number[] = [];
  const nor: number[] = [];
  const c = new THREE.Vector3(0, h * 0.42, 0);
  const at = (t: number) => {
    // 剖面：底 0.88r，腰 1.0r，顶部圆收（最后一行收到 0.2r）
    const prof =
      t < 0.6 ? 0.88 + 0.12 * Math.sin((t / 0.6) * Math.PI * 0.5) : Math.cos(((t - 0.6) / 0.4) * Math.PI * 0.44);
    const y = t < 0.6 ? t * h : h * 0.6 + Math.sin(((t - 0.6) / 0.4) * Math.PI * 0.5) * h * 0.4;
    return { rr: r * Math.max(0.2, prof), y };
  };
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const push = (a: number, depth: number, t: number, top: boolean, hmid: number, side: number) => {
    const { rr, y } = at(t);
    const rad = rr * (top ? 1 : depth);
    v.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
    pos.push(v.x, v.y, v.z);
    s.copy(v).sub(c).normalize();
    const hz = Math.hypot(s.x, s.z);
    const ha = hmid + side * tw;
    const n = new THREE.Vector3(Math.cos(ha) * hz, s.y, Math.sin(ha) * hz).normalize();
    nor.push(n.x, n.y, n.z);
  };
  const step = (Math.PI * 2) / ribs;
  for (let j = 0; j < rows; j++) {
    const t0 = j / rows;
    const t1 = (j + 1) / rows;
    const top1 = j + 1 === rows;
    for (let i = 0; i < ribs; i++) {
      const aR = i * step + phase;
      // 两个平面：棱脊 aR → 棱沟 aR + step/2（side +1，朝 +a 转），棱沟 → 下一条棱脊（side −1）
      for (const [a0, d0, a1, d1, side] of [
        [aR, 1, aR + step / 2, 0.86, 1],
        [aR + step / 2, 0.86, aR + step, 1, -1],
      ] as const) {
        const hm = (a0 + a1) / 2;
        push(a0, d0, t0, false, hm, side);
        push(a0, d0, t1, top1, hm, side);
        push(a1, d1, t0, false, hm, side);
        push(a1, d1, t0, false, hm, side);
        push(a0, d0, t1, top1, hm, side);
        push(a1, d1, t1, top1, hm, side);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
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
    [0.34, 0.9, -0.06, -0.08, 5, true],
    [0.22, 0.52, 0.27, 0.2, 4, true],
    [0.16, 0.32, -0.28, 0.22, 4, false],
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
      ctx.mat('cactus', {
        ramp: [BODY.bands[0][0], BODY.bands[1][0], BODY.bands[2][0]],
        tones: BODY,
        elem: { kind: 'blades', density: [0.03, 0.1], patch: 0.8 },
        lightUp: 0.6,
        bands: [-0.25, 0.32],
        // 不接收投影：太阳在画面后方，接收的话朝镜头的半个桶全在自己的影子里（量过：亮着的桶只剩一条亮边）。
        // 代价：放在蒲葵影子里的 barrel-s 也是亮的 —— 要"接收别人的影子、不接收自己的"得改 toon（见报告）
        noShadowReceive: true,
      }),
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
