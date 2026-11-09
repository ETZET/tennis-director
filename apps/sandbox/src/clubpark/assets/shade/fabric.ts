// 绷紧的帆布面：给一个高度场 y(x, z)，按列切成网格（条纹、布幅缝落在列线上，每列一个材质），法线按高度场解析地算
// （差分往列里面取：枕头之间的折痕两边各是各的法线，不被平均掉）。carport 用；以后别的遮阳棚也能用。
import * as THREE from 'three';

export interface Surface {
  y(x: number, z: number): number;
}

export interface GridOpts {
  /** 列的西沿、东沿（可以随 z 变：悬链线的自由边） */
  x0: (z: number) => number;
  x1: (z: number) => number;
  z0: number;
  z1: number;
  nx: number;
  nz: number;
}

/** 一列帆布：(nx × nz) 个格子，索引几何体，带 position / normal / uv（uv = 米，x 沿列宽、y 沿南北） */
export function fabricGrid(s: Surface, o: GridOpts): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const e = 0.01;
  for (let j = 0; j <= o.nz; j++) {
    const z = o.z0 + ((o.z1 - o.z0) * j) / o.nz;
    const a = o.x0(z);
    const b = o.x1(z);
    const mid = (a + b) / 2;
    for (let i = 0; i <= o.nx; i++) {
      const x = a + ((b - a) * i) / o.nx;
      const y = s.y(x, z);
      // 差分往列中心那边取（列线上正好是折痕）
      const xs = x + (mid > x ? e : -e);
      const dydx = (s.y(xs, z) - y) / (xs - x);
      const zs = z + (z < (o.z0 + o.z1) / 2 ? e : -e);
      const dydz = (s.y(x, zs) - y) / (zs - z);
      const n = new THREE.Vector3(-dydx, 1, -dydz).normalize();
      pos.push(x, y, z);
      nor.push(n.x, n.y, n.z);
      uv.push(x, z);
    }
  }
  const row = o.nx + 1;
  for (let j = 0; j < o.nz; j++)
    for (let i = 0; i < o.nx; i++) {
      const p = j * row + i;
      idx.push(p, p + row, p + 1, p + 1, p + row, p + row + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
