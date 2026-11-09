// 脆灌木（brittlebush）：银蓝灰绿的紧凑圆垫子（几团合成一个贴地的圆顶），团顶几簇黄色小菊。
// v1 是盛花：顶上一层成簇的亮黄花（"黄帽子"，簇与簇之间露出银叶）。规格 1.4 × 0.9 × 1.3 米（≈ 16 × 7 纹素），1.2k 三角形以内。
// 材质规范 v2 = 池塘第四轮灌木：整丛一个圆顶、竖向的毛（noise + blades）、底沿一圈更暗、脚下一块暗档团影；花成簇。
import * as THREE from 'three';
import { EL } from '../palette';
import type { AssetCtx } from '../world';
import {
  Bucket,
  blob,
  contactDisc,
  domeify,
  flowerCluster,
  markRim,
  place,
  shadeLight,
  surfaceY,
  tones,
} from './creosote/kit';

/** 手挑的色（银灰绿 → 灰蓝 → 靛蓝，底沿更深的靛）：[亮, 中, 暗] 各 [本色, 高一级, 低一级]；亮边色 = 竖须 */
const LIT: [number, number, number] = [0xb0ccc4, 0xbcd6cc, 0xa6c2bc];
const MID: [number, number, number] = [0x7a9cb2, 0x84a6ba, 0x7094aa];
const DARK: [number, number, number] = [0x4a5c8c, 0x52669a, 0x44548a];
/** 底沿：叶冠同一个网格，最下面那圈三角形顶点色 × 0.8（暗档 #4a5c8c × 0.8 ≈ #3b4970（L 73）） */
const RIM_K = 0.8;
const HAIR: [number, number, number] = [0xa8c4be, 0x90b0bc, 0x5a70a0];
const LEAF_TONES = tones(LIT, MID, DARK, [0x94aeb0, 0x62809e, 0x3a4a7a], HAIR);

/** 冠：光往上偏 0.5；阈值比池塘低（同 creosote 的理由） */
const LU = 0.5;
const BANDS: [number, number] = [0.25, 0.52];

export function build(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant % 2;
  const rnd = ctx.rng(`brittlebush:${v}`);
  const g = new THREE.Group();
  const B = new Bucket();
  const H = 0.9;
  const sway = { sway: 0.03, swayH: H };
  const hair = { kind: 'blades' as const, density: [0.08, 0.24] as [number, number], patch: 1.0 };
  const leaf = ctx.mat('silverBlue', {
    ...sway,
    ramp: [LIT[0], MID[0], DARK[0]],
    tones: LEAF_TONES,
    vertexColors: true,
    elem: hair,
    bands: BANDS,
    lightUp: LU,
    noise: 0.25,
    edge: 0.45,
    convex: 0.1,
  });
  const flower = ctx.mat('flowerYellow', {
    ...sway,
    bands: [-0.2, 0.55],
    lightUp: 0.6,
    edge: 0.15,
    convex: 0,
  });
  const shadeMat = ctx.mat('sand', { elem: EL.sand, bands: [9, 9], edge: 0, convex: 0 });

  // 垫子：外圈 3 团 + 中间偏后一团，底压平贴地（池塘灌木的团数和比例）
  const R = 0.56;
  const a0 = rnd() * Math.PI * 2;
  const parts: THREE.BufferGeometry[] = [];
  let sx = 0;
  let sz = 0;
  let sw = 0;
  const n = 3;
  for (let i = 0; i <= n; i++) {
    const top = i === n;
    const a = a0 + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
    const rr = top ? R * 0.66 : R * (0.58 + rnd() * 0.14);
    const bx = top ? (rnd() - 0.5) * 0.08 : Math.cos(a) * R * 0.48;
    const bz = top ? -0.05 : Math.sin(a) * R * 0.4;
    const by = top ? R * 0.92 : rr * 0.56;
    parts.push(
      place(blob(rr, rnd, { detail: 2, squash: 0.8, jitter: 0.12, flatBottom: -by / rr }), bx, by, bz, rnd() * 6),
    );
    sx += bx * rr;
    sz += bz * rr;
    sw += rr;
  }
  const cx = sx / sw;
  const cz = sz / sw;
  // 矮垫子朝镜头那一面很陡：椭球法线的中心放低、权重加大，圆顶的亮顶才够大（太阳在画面后方，Ld 往后倒 9°）
  domeify(parts, { cx, cz, base: 0, cy: 0.05, stretch: [1.12, 0.9, 1.05], ell: [1.1, 0.8, 1.0], k: 0.65 });

  // 黄花簇：v0 零星三簇；v1 盛花 —— 顶上一层六簇（黄帽子），簇间露出银叶
  const fr = ctx.rng(`brittlebush:flowers:${v}`);
  const spots: [number, number][] =
    v === 0
      ? [
          [-0.25, 0.1],
          [0.22, -0.05],
          [0.02, 0.28],
        ]
      : [
          [0, 0],
          [-0.3, -0.06],
          [0.3, 0.02],
          [-0.15, 0.24],
          [0.17, 0.26],
          [0.02, -0.24],
        ];
  for (const [dx, dz] of spots) {
    const fx = cx + dx * 1.1 + (fr() - 0.5) * 0.06;
    const fz = cz + dz + (fr() - 0.5) * 0.06;
    const fy = surfaceY(parts, fx, fz);
    if (fy === null) continue;
    B.add(flower, place(flowerCluster(fr, (v === 0 ? 3 : 4) + Math.floor(fr() * 2), 0.078, 0.1), fx, fy + 0.03, fz));
  }

  const L = shadeLight(LU);
  for (const p of parts) {
    B.add(leaf, markRim(p, L, BANDS[0] - 0.3, RIM_K));
  }
  // 团影：垫子宽一圈、往南多露一点
  B.add(shadeMat, contactDisc(R * 1.36, R * 0.95, cx, cz + 0.16));

  const meshes = B.build(g);
  ctx.mats.prepare(g);
  for (const m of meshes) if (m.material === shadeMat) m.castShadow = false;
  return g;
}
