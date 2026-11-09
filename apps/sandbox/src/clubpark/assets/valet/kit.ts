// 代客站（岗亭、代客台、立牌、球包车）共用的几何小工具：盒子、圆柱、按米给 uv 的土坯墙面、合并。
// 单位米，本地原点 = 落地点中心（y 0 = 地面），+z 朝镜头（南）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type G = THREE.BufferGeometry;

interface Xf {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

/** 摆放：先转（x → y → z 顺序的欧拉角），再平移 */
export function xf(g: G, t: Xf): G {
  if (t.rx || t.ry || t.rz) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0));
    g.applyMatrix4(m);
  }
  g.translate(t.x ?? 0, t.y ?? 0, t.z ?? 0);
  return g;
}

/** 盒子：y 是底面高度（不是中心） */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): G {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}

/** 竖直圆柱：y 是底面高度 */
export function cyl(r: number, h: number, seg: number, x = 0, y = 0, z = 0, rTop = r): G {
  return new THREE.CylinderGeometry(rTop, r, h, seg).translate(x, y + h / 2, z);
}

/** 合并：统一成非索引、只留 position / normal / uv（不同来源的几何体属性才对得上） */
export function merge(gs: G[]): G {
  const clean = gs.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes))
      if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    if (!n.getAttribute('uv'))
      n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.getAttribute('position').count * 2), 2));
    return n;
  });
  const m = mergeGeometries(clean, false);
  if (!m) throw new Error('valet kit: merge failed');
  return m;
}

/**
 * 土坯墙面（材质规范的墙 = `space: 'wall'`）：一组竖直/水平的矩形，uv = [沿墙米, 离墙顶米]，
 * aElem.x = 墙露出的高度（米，决定"矮墙实心一条"还是"一层层砖"）。
 */
export class WallFaces {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private ex: number[] = [];
  constructor(
    private top: number,
    private expo: number,
  ) {}

  /** 朝 ±z 的面：x0..x1、y0..y1，平面 z；along0 = 这面墙的 x0 在周长上的米数 */
  zFace(x0: number, x1: number, y0: number, y1: number, z: number, nz: 1 | -1, along0 = 0) {
    const a = (x: number) => along0 + (nz > 0 ? x - x0 : x1 - x);
    const P: [number, number, number][] = [
      [x0, y0, z],
      [x1, y0, z],
      [x1, y1, z],
      [x0, y1, z],
    ];
    this.quad(
      P,
      [0, 0, nz],
      P.map((p) => [a(p[0]), this.top - p[1]]),
      nz < 0,
    );
  }

  /** 朝 ±x 的面：z0..z1、y0..y1，平面 x */
  xFace(z0: number, z1: number, y0: number, y1: number, x: number, nx: 1 | -1, along0 = 0) {
    const a = (z: number) => along0 + (nx > 0 ? z1 - z : z - z0);
    const P: [number, number, number][] = [
      [x, y0, z0],
      [x, y0, z1],
      [x, y1, z1],
      [x, y1, z0],
    ];
    this.quad(
      P,
      [nx, 0, 0],
      P.map((p) => [a(p[2]), this.top - p[1]]),
      nx > 0,
    );
  }

  /** 朝上的面（窗台）：x0..x1、z0..z1，高 y */
  yFace(x0: number, x1: number, z0: number, z1: number, y: number) {
    const P: [number, number, number][] = [
      [x0, y, z1],
      [x1, y, z1],
      [x1, y, z0],
      [x0, y, z0],
    ];
    this.quad(
      P,
      [0, 1, 0],
      P.map((p) => [p[0] - x0, this.top - y + (z1 - p[2])]),
      false,
    );
  }

  private quad(P: [number, number, number][], n: [number, number, number], uv: number[][], flip: boolean) {
    const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const i of order) {
      this.pos.push(...P[i]);
      this.nor.push(...n);
      this.uv.push(uv[i][0], uv[i][1]);
      this.ex.push(this.expo, 0, 0, 0);
    }
  }

  geometry(): G {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aElem', new THREE.Float32BufferAttribute(this.ex, 4));
    return g;
  }
}

/** 平面图形（牌子上的图标）：朝 +z，贴在 z 处 */
export function shapeAt(s: THREE.Shape, x: number, y: number, z: number, seg = 10): G {
  return new THREE.ShapeGeometry(s, seg).translate(x, y, z);
}

/** 圆环（钥匙圈、轮子的图标） */
export function ringShape(r: number, rIn: number, seg = 16): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  const h = new THREE.Path();
  h.absarc(0, 0, rIn, 0, Math.PI * 2, true);
  s.holes.push(h);
  void seg;
  return s;
}

/** 多边形 */
export function polyShape(pts: [number, number][]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
  s.closePath();
  return s;
}

/** 数三角形（报告用） */
export function tris(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    const k = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    n += k * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
  });
  return n;
}
