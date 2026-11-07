// 风里的布（挡风布、遮阳帆、球网的破片）：CPU 顶点动画，不做物理。
// 每块布是一张 nu × nv 的格子，基础形状由 pos(u, v) 给出；free(u, v) 是"松开的程度"（0 = 绑死，1 = 完全自由）。
// 位移 = 顺风方向漂移 + 沿布法线的波动（从绑住的一边往自由端传）+ 一点上扬。非索引三角形，面法线（像素画里更有块面感）。
import * as THREE from 'three';

export interface ClothPiece {
  nu: number;
  nv: number;
  /** 基础形状（世界坐标或所在组的本地坐标），u、v ∈ [0,1] */
  pos(u: number, v: number): THREE.Vector3;
  /** 布面法线（波动方向） */
  normal: THREE.Vector3;
  /** 松开程度 0..1 */
  free(u: number, v: number): number;
  /** 这一格留几个三角：0 没有（破洞），1 两个，2 只留第一个，3 只留第二个 */
  keep?(i: number, j: number): 0 | 1 | 2 | 3;
  color(i: number, j: number): THREE.ColorRepresentation;
  /** 顺风漂移（米，风强 1 时完全自由处） */
  drift: number;
  /** 法线方向波动幅度（米） */
  flutter: number;
  /** 上扬（米） */
  lift?: number;
  /** 波动频率（弧度/秒）、沿布的波数（弧度/米） */
  freq?: number;
  k?: number;
  /** 只取风在法线上的分量（四边绑住的布只会鼓） */
  normalOnly?: boolean;
  /** uv（给 alphaMap 用）：每米多少个周期 */
  uvPerMeter?: number;
  /** 布的宽、高（米），uv 用 */
  size?: [number, number];
}

interface Rec {
  start: number;
  count: number;
  piece: ClothPiece;
}

export class ClothBatch {
  private pieces: ClothPiece[] = [];
  private base!: Float32Array;
  private free!: Float32Array;
  private along!: Float32Array;
  private recs: Rec[] = [];
  geo!: THREE.BufferGeometry;
  mesh!: THREE.Mesh;

  add(p: ClothPiece) {
    this.pieces.push(p);
  }

  build(material: THREE.Material): THREE.Mesh {
    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    const fr: number[] = [];
    const al: number[] = [];
    const c = new THREE.Color();
    for (const p of this.pieces) {
      const start = pos.length / 3;
      const grid: THREE.Vector3[][] = [];
      const fgrid: number[][] = [];
      for (let i = 0; i <= p.nu; i++) {
        grid.push([]);
        fgrid.push([]);
        for (let j = 0; j <= p.nv; j++) {
          grid[i].push(p.pos(i / p.nu, j / p.nv));
          fgrid[i].push(THREE.MathUtils.clamp(p.free(i / p.nu, j / p.nv), 0, 1));
        }
      }
      const [sw, sh] = p.size ?? [1, 1];
      const upm = p.uvPerMeter ?? 1;
      const push = (i: number, j: number) => {
        const v = grid[i][j];
        pos.push(v.x, v.y, v.z);
        col.push(c.r, c.g, c.b);
        uv.push((i / p.nu) * sw * upm, (j / p.nv) * sh * upm);
        fr.push(fgrid[i][j]);
        // 沿布的距离（波从绑住处往外传）：用松开程度近似
        al.push(fgrid[i][j] * Math.max(sw, sh) + (i / p.nu) * sw * 0.3);
      };
      for (let i = 0; i < p.nu; i++) {
        for (let j = 0; j < p.nv; j++) {
          const k = p.keep ? p.keep(i, j) : 1;
          if (k === 0) continue;
          c.set(p.color(i, j));
          if (k === 1 || k === 2) {
            push(i, j);
            push(i, j + 1);
            push(i + 1, j);
          }
          if (k === 1 || k === 3) {
            push(i + 1, j);
            push(i, j + 1);
            push(i + 1, j + 1);
          }
        }
      }
      this.recs.push({ start, count: pos.length / 3 - start, piece: p });
    }
    this.base = new Float32Array(pos);
    this.free = new Float32Array(fr);
    this.along = new Float32Array(al);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    if (g.boundingSphere) g.boundingSphere.radius += 2;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    return this.mesh;
  }

  /** 每帧：wind 是 xz 平面的风（uWind），gust 0..1 */
  update(t: number, wind: THREE.Vector2, gust: number) {
    const P = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const arr = P.array as Float32Array;
    const ws = wind.length();
    const g = 0.6 + 0.8 * gust;
    for (const r of this.recs) {
      const p = r.piece;
      const n = p.normal;
      const freq = p.freq ?? 7;
      const k = p.k ?? 2.2;
      const lift = p.lift ?? 0;
      let wx = wind.x;
      let wz = wind.y;
      if (p.normalOnly) {
        const d = wx * n.x + wz * n.z;
        wx = n.x * d;
        wz = n.z * d;
      }
      for (let i = r.start; i < r.start + r.count; i++) {
        const f = this.free[i];
        if (f <= 0) {
          arr[i * 3] = this.base[i * 3];
          arr[i * 3 + 1] = this.base[i * 3 + 1];
          arr[i * 3 + 2] = this.base[i * 3 + 2];
          continue;
        }
        const s = this.along[i];
        const wave = Math.sin(t * freq - s * k) + 0.45 * Math.sin(t * freq * 1.73 - s * k * 1.6 + 1.3);
        const amp = f * f;
        const dr = p.drift * amp * g * (0.85 + 0.15 * Math.sin(t * 1.7 + s));
        const fl = p.flutter * f * wave * (0.25 + ws) * g;
        arr[i * 3] = this.base[i * 3] + wx * dr + n.x * fl;
        arr[i * 3 + 1] = this.base[i * 3 + 1] + lift * amp * ws * g + n.y * fl;
        arr[i * 3 + 2] = this.base[i * 3 + 2] + wz * dr + n.z * fl;
      }
    }
    P.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

/** 平面四边形布：o 左上角，uAxis 往右（整个宽度），vAxis 往下（整个高度） */
export function quadPos(o: THREE.Vector3, uAxis: THREE.Vector3, vAxis: THREE.Vector3) {
  return (u: number, v: number) => o.clone().addScaledVector(uAxis, u).addScaledVector(vAxis, v);
}

/** 双线性四角：a 左上、b 右上、c 左下、d 右下 */
export function bilinear(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
  return (u: number, v: number) => {
    const top = a.clone().lerp(b, u);
    const bot = c.clone().lerp(d, u);
    return top.lerp(bot, v);
  };
}
