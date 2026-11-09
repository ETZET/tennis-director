// 石炭酸灌木（creosote）：几根短粗的暗枝从地面放射，顶着一个橄榄 / 鼠尾草绿的圆顶冠（4～5 团合成一个圆顶），
// 冠顶零星几簇黄花。规格 2.0 × 1.5 × 1.8 米（≈ 22 × 12 纹素），1.5k 三角形以内。
// 材质规范 v2 = 池塘第四轮灌木：整丛一个圆顶（顶亮、腰中、下三分之一暗）、档位交界是竖向的毛（noise + blades 竖须）、
// 底沿一圈更暗（同一个网格，顶点色 × 0.8）、脚下一块暗档团影；花是成簇的小形状。
import * as THREE from 'three';
import type { BaseCtx as AssetCtx } from '../render/ctx';
import { EL } from '../render/palette-base';
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

/** 手挑的色（橄榄鼠尾草绿，暗档往青、底沿往靛青）：[亮, 中, 暗] 各 [本色, 高一级, 低一级]；亮边色 = 竖须的颜色 */
const LIT: [number, number, number] = [0xa4c068, 0xaec872, 0x9cb866];
const MID: [number, number, number] = [0x6c9862, 0x76a268, 0x648e5c];
const DARK: [number, number, number] = [0x3c6866, 0x44706c, 0x36605f];
/** 底沿：叶冠同一个网格，最下面那圈三角形顶点色 × 0.8（暗档 #3c6866 × 0.8 ≈ #30524f（L 76）） */
const RIM_K = 0.8;
/** 竖须：亮档里是深一点的橄榄毛，中档里是往上一档的亮毛，暗档里是青绿毛（< 120） */
const HAIR: [number, number, number] = [0x9eba64, 0x8cb46c, 0x4e7e6a];
const LEAF_TONES = tones(LIT, MID, DARK, [0x8ca85a, 0x5a8456, 0x2e5462], HAIR);

/**
 * 冠：光往上偏 0.5，阈值 [暗|中, 中|亮]。池塘是 [0.5, 0.76]；这里太阳在画面后方（明暗光往后倒约 9°，朝镜头的面 l 低 0.15），
 * 阈值整体放低 → 场景里量过：亮着的丛 冠 ≈ 150 · 24/28/48（池塘亮丛 158～165 · 24/27/49）。
 */
const LU = 0.5;
const BANDS: [number, number] = [0.26, 0.52];

export function build(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant % 2;
  const rnd = ctx.rng(`creosote:${v}`);
  const g = new THREE.Group();
  const B = new Bucket();
  const H = 1.5;
  const sway = { sway: 0.05, swayH: H };
  const hair = { kind: 'blades' as const, density: [0.08, 0.24] as [number, number], patch: 1.0 };
  const leaf = ctx.mat('sage', {
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
  const stem = ctx.mat('branch', { ...sway, edge: 0.4, convex: 0.2 });
  const flower = ctx.mat('flowerYellow', {
    ...sway,
    bands: [-0.2, 0.55],
    lightUp: 0.6,
    edge: 0.15,
    convex: 0,
  });
  // 团影：地面暗档（沙的暗档那套 + 沙纹元素），和真投影接得上
  const shadeMat = ctx.mat('sand', { elem: EL.sand, bands: [9, 9], edge: 0, convex: 0 });

  // 冠：外圈几团 + 中间一团最高，合成一个圆顶
  const n = v === 0 ? 3 : 4;
  const a0 = rnd() * Math.PI * 2;
  const clumps: { x: number; y: number; z: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const d = 0.42 + rnd() * 0.08;
    const r = (n === 3 ? 0.44 : 0.4) + rnd() * 0.05;
    clumps.push({ x: Math.cos(a) * d, y: 0.88 + rnd() * 0.12, z: Math.sin(a) * d * 0.8, r });
  }
  clumps.push({ x: (rnd() - 0.5) * 0.16, y: 1.1, z: -0.06, r: 0.44 });

  const parts: THREE.BufferGeometry[] = [];
  let sx = 0;
  let sz = 0;
  let sw = 0;
  for (const c of clumps) {
    parts.push(place(blob(c.r, rnd, { detail: 2, squash: 0.8, jitter: 0.12 }), c.x, c.y, c.z, rnd() * 6));
    sx += c.x * c.r;
    sz += c.z * c.r;
    sw += c.r;
    // 枝：从地面中心附近斜着伸到团底，3 纹素粗，下粗上细（冠底以下露出来）
    const from = new THREE.Vector3((rnd() - 0.5) * 0.15, 0, (rnd() - 0.5) * 0.15);
    const to = new THREE.Vector3(c.x * 0.8, c.y - c.r * 0.45, c.z * 0.8);
    const len = from.distanceTo(to);
    const sg = new THREE.CylinderGeometry(0.1, 0.14, len, 5, 1, true);
    sg.translate(0, len / 2, 0);
    sg.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()),
    );
    sg.translate(from.x, from.y, from.z);
    B.add(stem, sg);
  }
  const cx = sx / sw;
  const cz = sz / sw;
  // 冠底约 0.5 米：横向拉宽、竖向压扁都以冠底为基准（枝还在下面露着）
  domeify(parts, { cx, cz, base: 0.5, cy: 0.86, stretch: [1.14, 0.9, 1.05], ell: [1.1, 0.8, 1.0] });
  // 花：几簇（每簇 4～5 个点挤成一个 3～4 纹素的小扁团），只在圆顶的上半、偏镜头一侧，贴在冠面上
  const fr = ctx.rng(`creosote:flowers:${v}`);
  const nClusters = v === 0 ? 3 : 4;
  for (let k = 0; k < nClusters; k++) {
    const th = (k / Math.max(nClusters - 1, 1) - 0.5) * 2.4 + (fr() - 0.5) * 0.4; // 绕竖轴，0 = 朝镜头
    const rr = 0.25 + fr() * 0.4; // 离冠心的水平距离（米）
    const fx = cx + Math.sin(th) * rr * 1.1;
    const fz = cz + Math.cos(th) * rr * 0.8;
    const fy = surfaceY(parts, fx, fz);
    if (fy === null) continue;
    B.add(flower, place(flowerCluster(fr, 4 + Math.floor(fr() * 2), 0.078, 0.1), fx, fy + 0.02, fz));
  }

  const L = shadeLight(LU);
  for (const p of parts) {
    B.add(leaf, markRim(p, L, BANDS[0] - 0.3, RIM_K));
  }

  // 团影：冠宽一圈、往南多露一点
  B.add(shadeMat, contactDisc(0.95, 0.55, cx, cz + 0.22));

  const meshes = B.build(g);
  ctx.mats.prepare(g);
  for (const m of meshes) if (m.material === shadeMat) m.castShadow = false;
  return g;
}
