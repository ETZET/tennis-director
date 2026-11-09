// 人造物件的小工具：按"材质类"攒几何体（每类一套手挑三档 ramp + 描边/凸边强度），每类合并成一个网格。
// 顶点色只做接近白的明暗（0.85～1）或少量色调（锈斑、条纹），不撒噪点。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Mats } from '../../toon';

type Hex = number;
export interface MatClass {
  ramp: [Hex, Hex, Hex];
  edge: number;
  convex: number;
}

/** 材质类：[亮, 中, 暗]，暗档偏冷（靛/紫/青） */
export const M = {
  rust: { ramp: [0xb0623a, 0x8a4a34, 0x5a3440], edge: 0.6, convex: 0.6 },
  rustDark: { ramp: [0x8a4a34, 0x6a3a34, 0x42283a], edge: 0.6, convex: 0.5 },
  steel: { ramp: [0xb8b8b0, 0x8a8a92, 0x545670], edge: 0.6, convex: 0.6 },
  steelDark: { ramp: [0x8e8e8a, 0x686a72, 0x3e4058], edge: 0.6, convex: 0.5 },
  /** 围栏柱、横杆、细杆：描边弱、不要凸边白线 */
  post: { ramp: [0xb0a49a, 0x86787e, 0x4e4862], edge: 0.4, convex: 0 },
  postRust: { ramp: [0xb0623a, 0x8a4a34, 0x5a3440], edge: 0.4, convex: 0 },
  paintWhite: { ramp: [0xe8e0d0, 0xc0b8b8, 0x8a8498], edge: 0.6, convex: 0.6 },
  paintGreen: { ramp: [0x7aa27a, 0x5a8068, 0x3a5258], edge: 0.6, convex: 0.6 },
  benchGreen: { ramp: [0x5f9a78, 0x467a64, 0x2e4a52], edge: 0.6, convex: 0.6 },
  wood: { ramp: [0xc08a58, 0x9a6a48, 0x64485a], edge: 0.6, convex: 0.6 },
  woodGray: { ramp: [0xbcae96, 0x928478, 0x5a5068], edge: 0.6, convex: 0.6 },
  concrete: { ramp: [0xd6ccb8, 0xaaa0a0, 0x6e6a80], edge: 0.6, convex: 0.4 },
  stone: { ramp: [0xc8b08c, 0x9e8878, 0x625468], edge: 0.8, convex: 1 },
  orange: { ramp: [0xe08a4a, 0xb86440, 0x7a4048], edge: 0.6, convex: 0.6 },
  blue: { ramp: [0x7aa6c4, 0x56789c, 0x34466e], edge: 0.6, convex: 0.6 },
  ball: { ramp: [0xdcdc72, 0xa8ae62, 0x667058], edge: 0.6, convex: 0.4 },
  dark: { ramp: [0x4a4640, 0x36323a, 0x22202e], edge: 0.6, convex: 0.3 },
  lamp: { ramp: [0xf0ead0, 0xd8d0c0, 0xa8a0a8], edge: 0.6, convex: 0.3 },
  tape: { ramp: [0xf0eadc, 0xc8c0c0, 0x8e88a0], edge: 0.6, convex: 0.4 },
} satisfies Record<string, MatClass>;
export type Cls = keyof typeof M;

/** 一个面的上色：材质类，或 [类, 明暗 0.85～1] 或 [类, 色调 rgb] */
export type Face = Cls | [Cls, number] | [Cls, [number, number, number]];
export type Paint = Face | ((p: THREE.Vector3, n: THREE.Vector3) => Face);

/** 少量色调：铁上的锈斑（乘在钢的 ramp 上偏橙） */
export const TINT = {
  rust: [1.15, 0.72, 0.55] as [number, number, number],
  bleach: [1.12, 1.1, 1.06] as [number, number, number],
};

export class Bag {
  private geos = new Map<Cls, THREE.BufferGeometry[]>();
  constructor(
    private mats: Mats,
    private rnd: () => number,
  ) {}

  /** 加一个几何体（会被吃掉），按面分到各材质类；jitter 每个面的明暗抖动（默认 0：不要噪点） */
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, paint: Paint, jitter = 0): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(m);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const per = new Map<Cls, { p: number[]; n: number[]; c: number[] }>();
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      p.set(0, 0, 0);
      n.set(0, 0, 0);
      for (let k = 0; k < 3; k++) {
        p.x += pos.getX(i + k) / 3;
        p.y += pos.getY(i + k) / 3;
        p.z += pos.getZ(i + k) / 3;
        n.x += nor.getX(i + k);
        n.y += nor.getY(i + k);
        n.z += nor.getZ(i + k);
      }
      n.normalize();
      const f = typeof paint === 'function' ? paint(p, n) : paint;
      const cls = typeof f === 'string' ? f : f[0];
      let rgb: [number, number, number] = [1, 1, 1];
      if (typeof f !== 'string') rgb = typeof f[1] === 'number' ? [f[1], f[1], f[1]] : f[1];
      const j = jitter ? 1 + (this.rnd() - 0.5) * 2 * jitter : 1;
      let o = per.get(cls);
      if (!o) per.set(cls, (o = { p: [], n: [], c: [] }));
      for (let k = 0; k < 3; k++) {
        o.p.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
        o.n.push(nor.getX(i + k), nor.getY(i + k), nor.getZ(i + k));
        o.c.push(rgb[0] * j, rgb[1] * j, rgb[2] * j);
      }
    }
    g.dispose();
    if (g !== geo) geo.dispose();
    for (const [cls, o] of per) {
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
      out.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
      out.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
      let list = this.geos.get(cls);
      if (!list) this.geos.set(cls, (list = []));
      list.push(out);
    }
  }

  box(w: number, h: number, d: number, m: THREE.Matrix4, paint: Paint, jitter?: number) {
    this.add(new THREE.BoxGeometry(w, h, d), m, paint, jitter);
  }

  /** 两点之间的圆杆（seg 段，hs 段高度，方便分段上锈） */
  rod(a: THREE.Vector3, b: THREE.Vector3, r: number, paint: Paint, seg = 6, hs = 1) {
    const len = a.distanceTo(b);
    if (len < 1e-4) return;
    const geo = new THREE.CylinderGeometry(r, r, len, seg, hs, false);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    this.add(geo, m, paint);
  }

  /** 两点之间的方杆，up 决定方杆的朝向 */
  bar(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, paint: Paint, up = new THREE.Vector3(0, 1, 0)) {
    const len = a.distanceTo(b);
    if (len < 1e-4) return;
    const z = b.clone().sub(a).normalize();
    let x = new THREE.Vector3().crossVectors(up, z);
    if (x.lengthSq() < 1e-6) x = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), z);
    x.normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(a.clone().add(b).multiplyScalar(0.5));
    this.add(new THREE.BoxGeometry(w, h, len, 1, 1, Math.max(1, Math.round(len / 0.5))), m, paint);
  }

  /** 每个材质类一个网格 */
  group(): THREE.Group {
    const g = new THREE.Group();
    for (const [cls, list] of this.geos) {
      const geo = mergeGeometries(list, false)!;
      for (const x of list) x.dispose();
      geo.computeBoundingSphere();
      const c = M[cls];
      const mesh = new THREE.Mesh(
        geo,
        this.mats.toon(0xffffff, { vertexColors: true, ramp: c.ramp, edge: c.edge, convex: c.convex }),
      );
      mesh.name = `structures:${cls}`;
      g.add(mesh);
    }
    this.geos.clear();
    return g;
  }
}

/** 从位置、欧拉角（度）、缩放拼矩阵 */
export function mat(
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  s: number | THREE.Vector3 = 1,
): THREE.Matrix4 {
  const d = Math.PI / 180;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx * d, ry * d, rz * d, 'YXZ'));
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : s;
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, sc);
}

/** 按位置的伪随机（同一位置同一结果），0..1 */
export function hash3(p: THREE.Vector3): number {
  const s = Math.sin(p.x * 12.9898 + p.y * 78.233 + p.z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

const cellOf = (p: THREE.Vector3, cell: number) =>
  new THREE.Vector3(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell));

/** 生锈：大块（cell 米）的斑，amount 比例变成 rust 类，其余是 base */
export function rusty(base: Cls, amount = 0.35, cell = 0.7, rust: Cls = 'rust'): Paint {
  return (p) => (hash3(cellOf(p, cell)) < amount ? rust : base);
}

/** 掉漆：漆面上几块露出底色 */
export function peeling(paint: Cls, under: Cls, amount = 0.3, cell = 0.4): Paint {
  return (p) => (hash3(cellOf(p, cell)) < amount ? under : paint);
}
