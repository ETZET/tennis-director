// 植物挡路的半径（总监的导航用；各场景共用一份，2026-11-18 对着画面量过：clubwalk 的导航体检 ?audit=1，clubwalk/audit.ts）。
// 导航给挡路形状再加身体半径（0.28），所以挡路半径 ≈ 身体那一层里枝叶离树根多远 − 0.1（允许擦进去 0.1 米）。
// 同一种树按变体、缩放差很多（假紫荆缩放 1.3 的冠在头顶上，只挡树干；缩放 1.0 的冠压到 1.4 米，头钻进去），
// 所以摆好的植物按它自己的网格量（plantBlock 给 obj）；量不了的（静态的导航表）按下面的表。
import * as THREE from 'three';

/** 身体那一层（离脚下）：腿和身子 0.3…1.2，头 1.2…1.8（总监的头半径 ≈ 0.38，比身体 0.28 大一圈） */
const BODY: [number, number] = [0.3, 1.2];
const HEAD: [number, number] = [1.2, 1.8];

/**
 * 表（缩放 1、常见变体量的，挡路半径 = 量的 90% 分位 − 0.1）。不在表里的不是植物。
 * 蒲葵 v0 / v1 的裙子离地 1.5 米以上，身体那一段只有树干；v2 见 PALM_V2
 */
const R: Record<string, number> = {
  'fan-palm': 0.45,
  'palo-verde': 0.9,
  'smoke-tree': 1.3,
  creosote: 0.75,
  brittlebush: 0.4,
  agave: 0.57,
  'barrel-cactus': 0.35,
  ocotillo: 0.6,
  cholla: 0.4,
};
/** 蒲葵 v2（fan-palm.ts 的 VARIANTS[2]）：最矮、枯叶裙最长，垂到离地 0.2～0.9 米、离树根 ≈ 0.83～0.93 */
const PALM_V2 = 0.8;

/** 这个资产是不是挡路的植物 */
export const isPlant = (asset: string) => asset in R;

/** 表里的挡路半径（缩放 1；variant = slot 的变体）；不是植物 = null */
export function plantBlockR(asset: string, variant = 0): number | null {
  if (asset === 'fan-palm' && ((variant % 3) + 3) % 3 === 2) return PALM_V2;
  return R[asset] ?? null;
}

const v = new THREE.Vector3();
const m4 = new THREE.Matrix4();
/**
 * 按摆好的植物自己的网格量挡路半径（世界米，已经含缩放）：脚下 = obj 的世界 y。
 * 身体那一层 90% 分位 − 0.1、头那一层 90% 分位（头大一圈，不减），取大的；最小 0.2（树干）。网格是空的 = null
 */
export function measuredBlockR(obj: THREE.Object3D): number | null {
  obj.updateMatrixWorld(true);
  const o = obj.getWorldPosition(new THREE.Vector3());
  const body: number[] = [];
  const head: number[] = [];
  obj.traverse((m) => {
    const mesh = m as THREE.Mesh;
    const pos = mesh.isMesh ? mesh.geometry?.getAttribute('position') : undefined;
    if (!pos || !mesh.visible) return;
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh) : null;
    const n = inst ? inst.count : 1;
    for (let k = 0; k < n; k++) {
      if (inst) {
        inst.getMatrixAt(k, m4);
        m4.premultiply(mesh.matrixWorld);
      } else m4.copy(mesh.matrixWorld);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m4);
        const y = v.y - o.y;
        const d = Math.hypot(v.x - o.x, v.z - o.z);
        if (y >= BODY[0] && y < BODY[1]) body.push(d);
        else if (y >= HEAD[0] && y <= HEAD[1]) head.push(d);
      }
    }
  });
  if (!body.length && !head.length) return null;
  const q90 = (a: number[]) => {
    if (!a.length) return 0;
    a.sort((p, q) => p - q);
    return a[Math.min(a.length - 1, Math.floor(a.length * 0.9))];
  };
  return Math.max(0.2, q90(body) - 0.1, q90(head));
}

/** 植物的挡路半径（世界米，含缩放）：给了摆好的 obj 就按网格量，不然按表 × scale。不是植物 = null */
export function plantBlock(asset: string, variant = 0, scale = 1, obj?: THREE.Object3D | null): number | null {
  const t = plantBlockR(asset, variant);
  if (t === null) return null;
  if (!obj) return t * scale;
  const m = measuredBlockR(obj);
  return m ?? t * scale;
}
