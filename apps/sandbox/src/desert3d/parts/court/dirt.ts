// 球场上的积沙：0.25 米一格的厚度场（0..1）。
// 画面：一张 DataTexture 给铺面着色器混沙色（按厚度分三档、带像素噪点），厚的地方把铺面网格顶点抬高成沙堆。
// sweep/deposit 只改数组、记脏矩形；flush() 最多 10 Hz 把脏的部分推到贴图和网格。
import * as THREE from 'three';
import { COURT } from '../../layout';
import type { Dirt } from '../../world';
import { fbm, vnoise } from './noise';

export const DCELL = 0.25;
export const DNX = Math.round((COURT.padHw * 2) / DCELL);
export const DNZ = Math.round((COURT.padHl * 2) / DCELL);
/** 厚度 → 沙堆高度（米） */
export const driftH = (d: number) => Math.max(0, d - 0.35) * 0.34;

export class SandGrid implements Dirt {
  readonly v = new Float32Array(DNX * DNZ);
  readonly tex: THREE.DataTexture;
  private px = new Uint8Array(DNX * DNZ * 4);
  /** 脏矩形（格子下标，含） */
  private d0i = DNX;
  private d1i = -1;
  private d0j = DNZ;
  private d1j = -1;
  private best: { x: number; z: number; amount: number } | null = null;
  private bestDirty = true;

  constructor(wind: THREE.Vector2) {
    this.init(wind);
    for (let c = 0; c < DNX * DNZ; c++) this.px[c * 4 + 3] = 255;
    this.writeTex(0, DNX - 1, 0, DNZ - 1);
    this.tex = new THREE.DataTexture(this.px, DNX, DNZ, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
  }

  /** 初始积沙：上风围栏背风处、下风围栏前和角落堆得厚，场上有顺风的沙带 */
  private init(wind: THREE.Vector2) {
    const w = wind.lengthSq() > 1e-6 ? wind.clone().normalize() : new THREE.Vector2(0.92, 0.4);
    const { padHw, padHl } = COURT;
    for (let j = 0; j < DNZ; j++) {
      for (let i = 0; i < DNX; i++) {
        const x = -padHw + (i + 0.5) * DCELL;
        const z = -padHl + (j + 0.5) * DCELL;
        // 到四边的距离：沿风来的方向是"上风边"
        const dW = x + padHw;
        const dE = padHw - x;
        const dN = z + padHl;
        const dS = padHl - z;
        const upX = w.x > 0 ? dW : dE;
        const dnX = w.x > 0 ? dE : dW;
        const upZ = w.y > 0 ? dN : dS;
        const dnZ = w.y > 0 ? dS : dN;
        const mz = 0.25 + fbm(z * 0.22, 1, 201, 2) * 1.3;
        const mx = 0.25 + fbm(x * 0.22, 2, 202, 2) * 1.3;
        let d = 0;
        // 上风围栏背风处：一长条沙堆（宽度沿围栏起伏）
        d += Math.exp(-upX / (0.7 * mz)) * 1.1 * Math.abs(w.x);
        d += Math.exp(-upZ / (0.7 * mx)) * 1.1 * Math.abs(w.y) * 1.6;
        // 下风围栏前、下风角落
        d += Math.exp(-dnX / 0.6) * 0.7 * mz;
        d += Math.exp(-(dnX + dnZ) / 1.6) * 1.4;
        d += Math.exp(-(upX + upZ) / 1.4) * 0.9;
        // 几条顺风的沙带
        const s = x * w.x + z * w.y;
        const t = -x * w.y + z * w.x;
        const st = fbm(t * 0.45, s * 0.16, 203, 2);
        d += Math.max(0, st - 0.63) * 5.5 * (0.4 + vnoise(s * 0.25, t * 0.25, 205) * 0.9);
        this.v[j * DNX + i] = Math.min(1, Math.max(0, d));
      }
    }
  }

  private cell(x: number, z: number): [number, number] {
    return [(x + COURT.padHw) / DCELL - 0.5, (z + COURT.padHl) / DCELL - 0.5];
  }

  at(x: number, z: number): number {
    const [fx, fz] = this.cell(x, z);
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fz);
    const tx = fx - i0;
    const tz = fz - j0;
    const g = (i: number, j: number) =>
      this.v[Math.min(DNZ - 1, Math.max(0, j)) * DNX + Math.min(DNX - 1, Math.max(0, i))];
    if (fx < -1 || fz < -1 || fx > DNX || fz > DNZ) return 0;
    const a = g(i0, j0) + (g(i0 + 1, j0) - g(i0, j0)) * tx;
    const b = g(i0, j0 + 1) + (g(i0 + 1, j0 + 1) - g(i0, j0 + 1)) * tx;
    return a + (b - a) * tz;
  }

  private brush(x: number, z: number, r: number, f: (c: number, k: number) => void) {
    const [fx, fz] = this.cell(x, z);
    const R = r / DCELL + 0.5;
    const i0 = Math.max(0, Math.floor(fx - R));
    const i1 = Math.min(DNX - 1, Math.ceil(fx + R));
    const j0 = Math.max(0, Math.floor(fz - R));
    const j1 = Math.min(DNZ - 1, Math.ceil(fz + R));
    if (i0 > i1 || j0 > j1) return;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i - fx, j - fz) * DCELL;
        if (d > r) continue;
        // 边上软一点
        const k = d < r * 0.6 ? 1 : 1 - (d - r * 0.6) / (r * 0.4);
        f(j * DNX + i, k);
      }
    }
    this.d0i = Math.min(this.d0i, i0);
    this.d1i = Math.max(this.d1i, i1);
    this.d0j = Math.min(this.d0j, j0);
    this.d1j = Math.max(this.d1j, j1);
    this.bestDirty = true;
  }

  /** 返回圆内每格平均扫掉的厚度（和 amount 同单位，0..amount） */
  sweep(x: number, z: number, r: number, amount: number): number {
    let removed = 0;
    let n = 0;
    this.brush(x, z, Math.max(r, DCELL * 0.6), (c, k) => {
      const take = Math.min(this.v[c], amount * k);
      this.v[c] -= take;
      removed += take;
      n++;
    });
    return n ? removed / n : 0;
  }

  deposit(x: number, z: number, r: number, amount: number): void {
    this.brush(x, z, Math.max(r, DCELL * 0.6), (c, k) => {
      this.v[c] = Math.min(1, this.v[c] + amount * k);
    });
  }

  /** 场内（双打区，避开网前）按 1 米块的平均厚度挑最脏处；底线附近和发球区优先 */
  dirtiest(): { x: number; z: number; amount: number } | null {
    if (!this.bestDirty) return this.best;
    this.bestDirty = false;
    const { hw, hl, shw, service } = COURT;
    let best: { x: number; z: number; amount: number } | null = null;
    let bestScore = 0;
    const B = 4; // 4 × 0.25 = 1 米
    for (let bz = -hl - 1; bz + 1 <= hl + 1; bz += 1) {
      for (let bx = -hw; bx + 1 <= hw; bx += 1) {
        const cz = bz + 0.5;
        const cx = bx + 0.5;
        if (Math.abs(cz) < 0.8) continue;
        const [fi, fj] = this.cell(bx, bz);
        const i0 = Math.round(fi + 0.5);
        const j0 = Math.round(fj + 0.5);
        let sum = 0;
        for (let j = j0; j < j0 + B; j++) for (let i = i0; i < i0 + B; i++) sum += this.v[j * DNX + i] ?? 0;
        const mean = sum / (B * B);
        if (mean < 0.12) continue;
        const az = Math.abs(cz);
        let wgt = 1;
        if (az > hl - 2.5) wgt = 1.5;
        else if (az < service && Math.abs(cx) < shw) wgt = 1.25;
        const score = mean * wgt;
        if (score > bestScore) {
          bestScore = score;
          best = { x: cx, z: cz, amount: mean };
        }
      }
    }
    this.best = best;
    return best;
  }

  private writeTex(i0: number, i1: number, j0: number, j1: number) {
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * DNX + i;
        this.px[c * 4] = Math.round(this.v[c] * 255);
      }
    }
  }

  /** 把脏的部分推到贴图，返回脏矩形（格子下标）或 null */
  flush(): [number, number, number, number] | null {
    if (this.d1i < 0) return null;
    const r: [number, number, number, number] = [this.d0i, this.d1i, this.d0j, this.d1j];
    this.writeTex(...r);
    this.tex.needsUpdate = true;
    this.d0i = DNX;
    this.d1i = -1;
    this.d0j = DNZ;
    this.d1j = -1;
    return r;
  }
}
