// 泰迪熊仙人掌（cholla）：深色的老茎干（下半截）+ 一堆金色毛茸茸的短粗节（上半截），像一个举着手的小人。
// 节 = 拉长的团，每团球面法线单独算（亮顶、中腰、紫暗底）。
// 材质规范 v2：节上是 `blades` 竖向的刺（1 × 2～4 纹素，亮档里是逆光发白的刺、暗档里是浅紫的刺），暗档往冷紫走；
// 老茎干也带一点稀疏的刺。颜色手挑（金 → 茶金 → 冷紫）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BaseCtx as AssetCtx } from '../render/ctx';
import type { Tones } from '../render/toon';
import { blobNormals } from '../render/toon';

/** 金色的节：[亮, 中, 暗] 各 [本色, 高一级, 低一级]；亮边色 = 刺 */
const FUZZ: Tones = {
  bands: [
    [0xf4d07a, 0xfadb8a, 0xecc672],
    [0xc8985e, 0xd2a266, 0xbc8e58],
    [0x76608e, 0x806a98, 0x6c5686],
  ],
  seam: [0xe2b874, 0xae8058, 0x5c4a7e],
  hi: [0xfff0bc, 0xe2b874, 0x8a76a2],
};
/** 老茎干（枯死的节，深紫褐）：刺是灰紫 */
const OLD: Tones = {
  bands: [
    [0x8a6070, 0x946a78, 0x7e5868],
    [0x6c4c66, 0x76566e, 0x62445e],
    [0x463a68, 0x4e4270, 0x40345e],
  ],
  seam: [0x6c4c66, 0x54405e, 0x382e58],
  hi: [0xa88a94, 0x8a7088, 0x5e5280],
};

function joint(r: number, len: number, at: THREE.Vector3, dir: THREE.Vector3) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  g.scale(1, len / (2 * r), 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  g.translate(at.x, at.y, at.z);
  return blobNormals(g, at.clone().addScaledVector(new THREE.Vector3(0, -1, 0), r * 0.25));
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const rnd = ctx.rng(`cholla:${ctx.variant}`);
  const fuzz: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];
  const j = (
    out: THREE.BufferGeometry[],
    r: number,
    len: number,
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
  ) => out.push(joint(r * (0.94 + rnd() * 0.12), len, new THREE.Vector3(x, y, z), new THREE.Vector3(dx, dy, dz)));

  // 老茎干：一节粗短的深色（下半截），顶上接一大团金色
  j(dark, 0.24, 0.7, 0, 0.32, 0, 0.04, 1, 0);
  // 脚下掉落的节（一暗一亮，半埋）
  j(dark, 0.17, 0.34, 0.4, 0.1, 0.2, 1, 0.25, 0.3);
  j(fuzz, 0.18, 0.36, -0.42, 0.12, 0.18, -1, 0.35, 0.4);
  // 身子：一大团金色
  j(fuzz, 0.3, 0.62, 0.0, 0.9, 0.02, 0, 1, 0.05);
  // 头（和身子之间收一点腰）
  j(fuzz, 0.24, 0.42, 0.03, 1.34, 0.0, 0.08, 1, 0);
  // 两只"手"：先往外平伸、再往上折（肘），和身子之间留出一块空
  j(fuzz, 0.2, 0.44, -0.4, 1.0, 0.04, -1, 0.45, 0);
  j(fuzz, 0.19, 0.4, -0.62, 1.3, 0.0, -0.1, 1, 0);
  j(fuzz, 0.2, 0.42, 0.4, 0.94, 0.06, 1, 0.4, 0.1);
  j(fuzz, 0.18, 0.36, 0.6, 1.2, 0.04, 0.12, 1, 0);
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(
      mergeGeometries(fuzz),
      // 金色"发光"：亮档比沙亮、偏黄（#f4d07a vs 沙 #eab46c），亮档占一半多；中档茶金只在腰上一圈，暗档冷紫。
      // 刺 = blades（斑块里 22% → 40% 的列有一段亮划）；凸边高光关掉（团与团的交界会亮成一片奶油色）。
      ctx.mat('dryGrass', {
        ramp: [FUZZ.bands[0][0], FUZZ.bands[1][0], FUZZ.bands[2][0]],
        tones: FUZZ,
        elem: { kind: 'blades', density: [0.22, 0.4], patch: 0.8 },
        lightUp: 0.4,
        noise: 0.2,
        bands: [0.08, 0.5],
        edge: 0.35,
        convex: 0,
        noShadowReceive: true,
      }),
    ),
  );
  // 老茎：深紫褐，稀疏的灰紫刺
  g.add(
    new THREE.Mesh(
      mergeGeometries(dark),
      ctx.mat('branch', {
        ramp: [OLD.bands[0][0], OLD.bands[1][0], OLD.bands[2][0]],
        tones: OLD,
        elem: { kind: 'blades', density: [0.08, 0.18], patch: 0.8 },
        lightUp: 0.4,
        bands: [-0.1, 0.4],
        noShadowReceive: true,
      }),
    ),
  );
  ctx.mats.prepare(g);
  return g;
}
