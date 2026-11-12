// gym-kb-plyo · 功能草道北头：壶铃架 + 一摞软跳箱（B1，slots-b1 的 gym-kb-plyo）。
// 尺寸：2.16 × 0.99 × 0.72 米（24 × 11 × 8 纹素，w × h × d）；规格 2.2 × 0.9 × 0.7。正面朝 +z（镜头）。
// 西边是一个矮的两层阶梯架（前低后高，两层都看得见；灰钢搁板 + 两块端板），前层三个大壶铃、后层三个小壶铃，
//   按重量上色（比赛壶铃的色标：粉 8、蓝 12、黄 16、紫 20、橙 28、红 32 kg），圆身子（八棱柱 + 球面法线）+ 深色提手（∩，1 纹素粗）。
// 东头三个软跳箱叠成一摞（蓝 / 红 / 黄，每个往里错一纹素）。颜色都避开草皮的黄绿。
// 元素：跳箱 `paint`（泡棉面上的深浅块）；壶铃、架子不加（太小）。
// 三角形：壶铃 6 × (身子 24 + 提手 28) = 312，架子 4 个盒子 + 跳箱 3 个（去掉底面）× 10 = 70，共 382（预算 400）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blobNormals } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';

type Ramp = [number, number, number];

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, edge: 0.3 };
  const steel = ctx.mat('metal', { ...face, ramp: [0xa8baf6, 0x7686d2, 0x40449a], convex: 0.25 });
  /** 壶铃的漆：圆身子，光往上偏一点（顶亮、腰中、底暗） */
  const bell = (
    key: 'clothRed' | 'toolOrange' | 'clothPurple' | 'flowerYellow' | 'clothBlue' | 'flowerPurple',
    ramp?: Ramp,
  ) =>
    ctx.mat(key, {
      lightUp: 0.35,
      bands: [-0.6, 0.4],
      noShadowReceive: true,
      edge: 0.3,
      convex: 0.2,
      ...(ramp ? { ramp } : {}),
    });
  const foam = (key: 'clothBlue' | 'clothRed' | 'flowerYellow', ramp: Ramp) =>
    ctx.mat(key, { ...face, ramp, convex: 0.3, elem: { kind: 'paint', size: [5, 3], density: [0, 0.03], patch: 1.5 } });

  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  /** 提手（挤出的几何体没有索引，和钢架的盒子分开合并；同一个灰钢材质） */
  const handles: THREE.BufferGeometry[] = [];
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const l = parts.get(m) ?? [];
    l.push(g);
    parts.set(m, l);
  };
  /** 盒子（纹素坐标的最小 / 最大），去掉底面 */
  const b = (m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const g = new THREE.BoxGeometry((x1 - x0) * T, (y1 - y0) * T, (z1 - z0) * T);
    const idx = Array.from(g.index!.array);
    idx.splice(18, 6);
    g.setIndex(idx);
    g.clearGroups();
    put(m, g.translate(((x0 + x1) / 2) * T, ((y0 + y1) / 2) * T, ((z0 + z1) / 2) * T));
  };
  /**
   * 一个壶铃：身子 w 纹素宽（八棱柱，平面朝前，去掉底盖，球面法线）、高 w；提手 ∩（外宽 w、高 2、1 纹素粗、1 纹素深）。
   * (x, y, z) = 底面中心（纹素）。
   */
  const kettlebell = (m: THREE.Material, w: number, x: number, y: number, z: number) => {
    const r = ((w / 2) * T) / Math.cos(Math.PI / 8);
    const body = new THREE.CylinderGeometry(r * 0.92, r, w * T, 8, 1, false, Math.PI / 8);
    // 去掉底盖：CylinderGeometry 的索引 = 侧面、顶盖、底盖
    const side = 8 * 6;
    const idx = Array.from(body.index!.array).slice(0, side + 8 * 3);
    body.setIndex(idx);
    body.clearGroups();
    body.translate(x * T, (y + w / 2) * T, z * T);
    blobNormals(body, new THREE.Vector3(x * T, (y + w * 0.25) * T, z * T));
    put(m, body);
    // 提手：外框 w × 2，中间开 (w − 2) × 1 的口
    const hw = (w / 2) * T;
    const s = new THREE.Shape();
    s.moveTo(-hw, 0);
    s.lineTo(-hw, 2 * T);
    s.lineTo(hw, 2 * T);
    s.lineTo(hw, 0);
    s.lineTo(hw - T, 0);
    s.lineTo(hw - T, T);
    s.lineTo(-hw + T, T);
    s.lineTo(-hw + T, 0);
    s.closePath();
    const h = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false });
    h.translate(x * T, (y + w) * T, Math.floor(z - 0.5) * T);
    handles.push(h);
  };

  // ── 阶梯架（x −12…6）：两块端板 + 前低后高两层搁板 ──
  b(steel, -12, -10, 0, 6, -4, 4);
  b(steel, 4, 6, 0, 6, -4, 4);
  b(steel, -10, 4, 1, 2, 0, 4); // 前层（低）
  b(steel, -10, 4, 5, 6, -4, 0); // 后层（高）
  // 前层三个大的（紫 20 / 橙 28 / 红 32）
  kettlebell(bell('clothPurple'), 4, -8, 2, 2);
  kettlebell(bell('toolOrange'), 4, -3, 2, 2);
  kettlebell(bell('clothRed', [0xf4523e, 0xc42e42, 0x6a1e54]), 4, 2, 2, 2);
  // 后层三个小的（黄 16 / 粉 8 / 蓝 12），和前层错开
  kettlebell(bell('flowerYellow'), 3, -8.5, 6, -2.5);
  kettlebell(bell('flowerPurple', [0xf48ad0, 0xc85aa8, 0x6a2e7a]), 3, -4.5, 6, -2.5);
  kettlebell(bell('clothBlue'), 3, -0.5, 6, -2.5);

  // ── 软跳箱一摞（x 6…12）：蓝 / 红 / 黄，每层往里错一纹素 ──
  b(foam('clothBlue', [0x4a8af0, 0x3460c4, 0x262e7c]), 6, 12, 0, 3, -4, 3);
  b(foam('clothRed', [0xf4523e, 0xc42e42, 0x6a1e54]), 6, 12, 3, 6, -4, 2);
  b(foam('flowerYellow', [0xffd23c, 0xe49c34, 0x8a5466]), 7, 12, 6, 9, -3, 2);

  const root = new THREE.Group();
  for (const [m, gs] of parts) root.add(new THREE.Mesh(mergeGeometries(gs), m));
  root.add(new THREE.Mesh(mergeGeometries(handles), steel));
  ctx.mats.prepare(root);
  return root;
}
