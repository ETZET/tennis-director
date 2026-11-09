// 球网：两根锈柱子、塌下去的网身（方格镂空，FX 图层）、白色网带（实体，断了一处，两头耷拉）、
// 网身上撕开一个洞，一片破网挂着在风里晃。
import * as THREE from 'three';
import { COURT } from '../../layout';
import type { ClothBatch } from './cloth';
import { type Bag, mat, rusty } from './kit';

const X = COURT.hw + 0.914;
const BREAK = 0.72;

/** 网带高度（u 0..1 从西到东） */
function topY(u: number): number {
  const sag = 1 - (2 * u - 1) ** 2;
  let y = 1.0 - 0.36 * sag;
  y -= 0.38 * Math.exp(-(((u - BREAK) / 0.08) ** 2));
  return y;
}
const xAt = (u: number) => -X + 2 * X * u;

export function buildNet(bag: Bag, net: ClothBatch, rnd: () => number) {
  const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const post = rusty('steelDark', 0.4, 0.5);

  // 柱子：方管，有点歪；摇把
  for (const [s, tilt] of [
    [-1, 3],
    [1, -5],
  ] as const) {
    bag.box(0.17, 1.2, 0.17, mat(s * X, 0.5, 0, 0, 0, tilt), post);
    bag.box(0.24, 0.08, 0.24, mat(s * X, 1.12, 0, 0, 0, tilt), 'rustDark');
    bag.box(0.3, 0.12, 0.3, mat(s * X, 0.04, 0, 0, 0, 0), 'concrete');
  }
  bag.box(0.08, 0.08, 0.22, mat(X + 0.13, 0.85, 0.06, 0, 0, -5), 'rust');
  bag.box(0.06, 0.22, 0.06, mat(X + 0.13, 0.78, 0.17, 0, 0, -5), 'rustDark');

  // 网带：沿曲线一段段方条；断口两头往下耷拉
  const seg = 24;
  for (let i = 0; i < seg; i++) {
    const u0 = i / seg;
    const u1 = (i + 1) / seg;
    if (u1 > BREAK - 0.012 && u0 < BREAK + 0.012) continue;
    const a = v3(xAt(u0), topY(u0), 0);
    const b = v3(xAt(u1), topY(u1), 0);
    if (u0 < BREAK && u1 > BREAK - 0.012) b.set(xAt(BREAK - 0.012), topY(BREAK - 0.012), 0);
    if (u1 > BREAK && u0 < BREAK + 0.012) a.set(xAt(BREAK + 0.012), topY(BREAK + 0.012), 0);
    const c = 'tape' as const;
    bag.bar(a, b, 0.09, 0.14, c);
  }
  const bl = v3(xAt(BREAK - 0.012), topY(BREAK - 0.012), 0);
  const br = v3(xAt(BREAK + 0.012), topY(BREAK + 0.012), 0);
  bag.bar(bl, bl.clone().add(v3(0.12, -0.42, 0.06)), 0.09, 0.14, 'tape', v3(0, 0, 1));
  bag.bar(br, br.clone().add(v3(-0.05, -0.32, -0.08)), 0.09, 0.14, 'tape', v3(0, 0, 1));
  // 中间的拉带和地钩
  const cu = 0.5;
  bag.bar(v3(0, topY(cu), 0.01), v3(0, 0.03, 0.01), 0.1, 0.05, 'tape', v3(0, 0, 1));
  bag.box(0.16, 0.05, 0.12, mat(0, 0.03, 0.01), 'rustDark');
  // 网底下卡着一个旧球
  bag.add(new THREE.IcosahedronGeometry(0.11, 1), mat(-2.2, 0.11, 0.18), ['ball', 0.8]);

  // 网身
  const nu = 40;
  const nv = 6;
  const hole = (i: number, j: number) => {
    const u = (i + 0.5) / nu;
    const v = (j + 0.5) / nv;
    return u > 0.27 && u < 0.35 && v > 0.15 && v < 0.85;
  };
  const rag = Array.from({ length: nu }, () => rnd());
  net.add({
    nu,
    nv,
    pos: (u, v) => {
      const top = topY(u) - 0.04;
      const bot = 0.06 + 0.04 * Math.sin(u * 23);
      return v3(xAt(u), top + (bot - top) * v, 0);
    },
    normal: v3(0, 0, 1),
    free: (u, v) => 0.5 * v * Math.sin(Math.PI * u),
    normalOnly: true,
    drift: 0.35,
    flutter: 0.04,
    freq: 3,
    color: () => 0xffffff,
    keep: (i, j) => {
      if (hole(i, j)) return 0;
      // 断口下面的网也撕开了一条
      const u = (i + 0.5) / nu;
      if (Math.abs(u - BREAK) < 0.02 && j < 4) return 0;
      if (j === nv - 1 && rag[i] < 0.12) return 0;
      return 1;
    },
    uvPerMeter: 1 / 0.16,
    size: [2 * X, 0.9],
  });
  // 洞边上挂着的一片破网：西边连着，往东甩
  const fx0 = xAt(0.27);
  const fy0 = topY(0.27) - 0.15;
  const fy1 = 0.2;
  net.add({
    nu: 6,
    nv: 5,
    pos: (u, v) => v3(fx0 + u * 0.95, fy0 + (fy1 - fy0) * v - 0.35 * u * u, 0.04 + 0.12 * u),
    normal: v3(0, 0, 1),
    free: (u) => Math.min(1, u * 1.3),
    drift: 0.55,
    flutter: 0.22,
    lift: 0.1,
    freq: 5.5,
    k: 3,
    color: () => 0xffffff,
    keep: (i, j) => (i === 5 && (j === 0 || j === 4) ? 0 : i === 4 && j === 4 ? 2 : 1),
    uvPerMeter: 1 / 0.16,
    size: [0.95, 0.7],
  });
}
