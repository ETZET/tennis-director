// 泰迪熊仙人掌（cholla）：深色的老茎干（下半截）+ 一堆金色毛茸茸的短粗节（上半截），像一个举着手的小人。
// 节 = 拉长的团，每团球面法线单独算（亮顶、中腰、紫暗底）+ 档位噪声当"毛"。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from '../palette';
import { blobNormals } from '../toon';
import type { AssetCtx } from '../world';

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
      // 金色"发光"：干草的亮档和沙子的亮档几乎一样（#e8c46c vs #eab46c），会融进沙里 →
      // 三档整体上移一档：亮 = 草帽亮档（更黄更亮）、中 = 干草亮档、暗 = 干草暗档（紫）。都是表里的颜色。
      // 亮档占大半（bands 下移），档位噪声 = 毛刺；凸边高光关掉（团与团的交界会亮成一片奶油色）。
      ctx.mat('dryGrass', {
        ramp: [PAL.straw.ramp[0], PAL.dryGrass.ramp[0], PAL.dryGrass.ramp[2]],
        lightUp: 0.55,
        noise: 0.25,
        bands: [-0.2, 0.36],
        edge: 0.35,
        convex: 0,
        noShadowReceive: true,
      }),
    ),
  );
  // 老茎：干草色的暗档往下挪一档（同一张表里的颜色：枝干的中/暗档）
  const br = PAL.branch.ramp;
  g.add(
    new THREE.Mesh(
      mergeGeometries(dark),
      ctx.mat('branch', { ramp: [br[1], br[2], br[2]], lightUp: 0.4, bands: [-0.1, 0.4], noShadowReceive: true }),
    ),
  );
  ctx.mats.prepare(g);
  return g;
}
