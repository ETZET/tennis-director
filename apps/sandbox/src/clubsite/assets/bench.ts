// 长椅：两块晒白的座板（中间 1 纹素缝）+ 一块靠背 + 两个胖金属脚。风吹日晒、有点歪：靠背一头略塌、一块座板翘一点。
// 1.9 × 0.85 × 0.55 米。一种材质一个网格。
// 材质规范 v2：座板、靠背 = 木板 `planks`（每块板一个深浅、板后沿一行断续的亮条、板缝是冷暗色）；金属脚 = 青绿漆 `paint`（几乎干净）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BaseCtx as AssetCtx } from '../render/ctx';
import { boards, METAL_TONES, paint, WEATHERED_TONES } from './bench/mats';

function box(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

/** 道具的明暗：光往上（偏镜头）多一半 → 顶面亮、朝镜头的立面中档、底面和背面暗 */
const PROP = { lightUp: 0.5, bands: [-0.45, 0.5] as [number, number] };

export function build(ctx: AssetCtx): THREE.Object3D {
  const rnd = ctx.rng(`bench:${ctx.variant}`);
  const T = ctx.texel; // 0.09
  const g = new THREE.Group();
  const L = 1.9;
  const seatY = 0.46;
  const plank = 0.24; // 一块板宽（纵深）
  const thick = 0.12;
  const gap = T; // 唯一允许的 1 纹素缝
  const sag = (rnd() - 0.5) * 0.06;

  // 座板：前一块、后一块
  const seat: THREE.BufferGeometry[] = [];
  const zFront = gap / 2 + plank / 2;
  const zBack = -(gap / 2 + plank / 2);
  seat.push(box(L, thick, plank, 0, seatY, zFront, 0, 0, sag * 0.3));
  // 后座板一头翘起一点（旧木头变形）
  seat.push(box(L * 0.98, thick, plank, 0.02, seatY + 0.01, zBack, 0.03, 0, 0.025 + sag * 0.2));
  // 靠背：一块宽板，往后仰；一头塌下来一点
  const backH = 0.22;
  const back = box(L * 0.97, backH, thick, -0.02, 0.74, -0.29, -0.22, 0, -0.04);
  // 木板元素：沿 z 每 (板宽 + 缝) 一块板，板的后沿对齐到 z = k·w（几何体挪 dz、网格再挪回来）→ 每块板一个深浅、
  // 后沿一行断续的亮条（地面纵深上一纹素只有 0.7 行 → sk 0.8）。靠背和后座板在 z 上重叠，单独一个网格（自己一块板）
  const wood = (geos: THREE.BufferGeometry[], w: number, dz: number, seed: number) => {
    const m = new THREE.Mesh(
      mergeGeometries(geos).translate(0, 0, dz),
      ctx.mat('woodWeathered', {
        ...PROP,
        elem: boards([0, 0, 1], w, { seam: 0, sk: 0.8, seed }),
        tones: WEATHERED_TONES,
        toneW: [0.34, 0.33],
      }),
    );
    m.position.z = -dz;
    g.add(m);
  };
  // seed 2：后座板高一级、前座板低一级、靠背本色（相邻的三块板都不同色）
  wood(seat, plank + gap, -(gap / 2) - (plank + gap), 2 + ctx.variant);
  // 靠背：正面落在 f 1.3～1.7（不画亮条），顶面后半截是它的亮条
  wood([back], 1, 0.4, 2 + ctx.variant);

  // 金属脚：每头一个胖 "П" 侧框（腿 + 座下横档 + 靠背立柱），全 ≥ 3 纹素
  const metal: THREE.BufferGeometry[] = [];
  const leg = 0.27;
  for (const sx of [-1, 1]) {
    const x = sx * (L / 2 - 0.22);
    metal.push(box(leg * 0.8, seatY - thick / 2, leg, x, (seatY - thick / 2) / 2, 0.12)); // 前腿
    metal.push(box(leg * 0.8, seatY - thick / 2, leg, x, (seatY - thick / 2) / 2, -0.16)); // 后腿
    metal.push(box(leg * 0.8, 0.5, leg * 0.8, x, 0.62, -0.24, -0.22)); // 靠背立柱
  }
  // 一只脚锈了：脚底一截锈色
  const metalMesh = new THREE.Mesh(
    mergeGeometries(metal),
    ctx.mat('metal', { ...PROP, elem: paint([5, 4], [0, 0.04], 1), tones: METAL_TONES }),
  );
  g.add(metalMesh);
  const rx = -(L / 2 - 0.22);
  const rust = new THREE.Mesh(box(leg * 0.84, 0.14, leg * 1.04, rx, 0.07, 0.12), ctx.mat('rust', PROP));
  g.add(rust);

  // 小道具不接投影：靠背投在座板上的影只剩 1 纹素的毛边噪点
  ctx.mats.prepare(g, { receive: false });
  return g;
}
