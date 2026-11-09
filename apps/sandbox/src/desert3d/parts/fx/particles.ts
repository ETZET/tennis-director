// 风沙粒子：一个 THREE.Points（FX 图层，方块像素点），CPU 上模拟。
// 每个粒子两个顶点：头 + 尾（尾巴在 shader 里沿速度往回挪一个纹素 → 1～2 纹素长的沙线）。
// 种类：贴地流沙、蛇形沙带、尘团（puff）、尘卷风、空中薄尘。
// 淡入淡出不用半透明：每个粒子一个阈值，淡到阈值以下就整颗不画（像素画友好）。
import * as THREE from 'three';
import { COURT, ISLAND } from '../../layout';
import type { World } from '../../world';
import type { Wind } from './wind';

const CAP = 5000;

enum K {
  Sand = 0,
  Ribbon = 1,
  Puff = 2,
  Devil = 3,
  Haze = 4,
}

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute vec3 aVel;
attribute float aSize;
attribute float aWorld;
uniform float uTexelM;
uniform vec3 uTint;
varying vec3 vColor;
void main() {
  vColor = aColor * uTint;
  vec3 p = position;
  float vl = length(aVel);
  if (vl > 1e-4) p -= aVel / vl * min(vl * 0.06, uTexelM * 1.05);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  float s = max(aSize, floor(aWorld / uTexelM + 0.5));
  gl_PointSize = s;
  if (s < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
  #include <colorspace_fragment>
}
`;

const hexes = (a: number[]) => a.map((h) => new THREE.Color(h));
/** 尘卷风的三档（背光面朝太阳是亮档；朝镜头是暗档）+ 相间的环带 */
const DEVIL_RAMP = hexes([0xfcf4e4, 0xead8b4, 0xc8aa8a]);
const PAL = {
  sand: hexes([0xfff4dc, 0xfaecd0, 0xfff8ea]),
  ribbon: hexes([0xf6e8cc, 0xf0e0c0, 0xfaf0dc]),
  puff: hexes([0xf4e6c8, 0xeedcb8, 0xfaf0dc, 0xe4d0a8]),
  devil: hexes([0xf6e8c8]),
  debris: hexes([0x7a5a3a, 0x5f6a38, 0x4c3a2e, 0x8a7048]),
  haze: hexes([0xead2a2, 0xdcbf8c]),
};

const pad = { hw: COURT.padHw, hl: COURT.padHl };
const onPad = (x: number, z: number) => Math.abs(x) < pad.hw && Math.abs(z) < pad.hl;
const onSlab = (x: number, z: number, m = 0) =>
  x > ISLAND.x0 + m && x < ISLAND.x1 - m && z > ISLAND.z0 + m && z < ISLAND.z1 - m;

interface Ribbon {
  x: number;
  z: number;
  phase: number;
  omega: number;
  amp: number;
  life: number;
  len: number;
}

interface Devil {
  x: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  life: number;
  env: number;
  sweepT: number;
  spin: number;
}

export class Dust {
  readonly points: THREE.Points;
  private n = 0;
  // 粒子状态（结构数组，死了和最后一个交换）
  private px = new Float32Array(CAP);
  private py = new Float32Array(CAP);
  private pz = new Float32Array(CAP);
  private vx = new Float32Array(CAP);
  private vy = new Float32Array(CAP);
  private vz = new Float32Array(CAP);
  private age = new Float32Array(CAP);
  private life = new Float32Array(CAP);
  /** 每种粒子自己的参数（风速倍数 / 轨道角 / 轨道半径 / 世界尺寸） */
  private pa = new Float32Array(CAP);
  private pb = new Float32Array(CAP);
  private pc = new Float32Array(CAP);
  private thr = new Float32Array(CAP);
  /** 出生处的地面高度 */
  private gy = new Float32Array(CAP);
  private kind = new Uint8Array(CAP);
  private col = new Float32Array(CAP * 3);
  // 顶点缓冲
  private aPos: THREE.BufferAttribute;
  private aCol: THREE.BufferAttribute;
  private aVel: THREE.BufferAttribute;
  private aSize: THREE.BufferAttribute;
  private aWorld: THREE.BufferAttribute;
  private dirty = true;

  private rnd: () => number;
  private ribbons: Ribbon[] = [];
  devil: Devil | null = null;
  private devilWait: number;
  private sandAcc = 0;
  private frame = 0;
  private hazeAcc = 0;
  private depAcc = 0;
  private devilAcc = 0;
  /** 风沙堆积倍数（?sand=） */
  private sandMul: number;
  private mat: THREE.ShaderMaterial;

  constructor(
    private w: World,
    private wind: Wind,
  ) {
    this.rnd = w.rng('fx:dust');
    this.sandMul = w.params.has('sand') ? Number(w.params.get('sand')) : 1;
    this.devilWait = w.params.has('devil') ? Number(w.params.get('devil')) : 3 + this.rnd() * 5;
    const g = new THREE.BufferGeometry();
    const V = CAP * 2;
    this.aPos = new THREE.BufferAttribute(new Float32Array(V * 3), 3);
    this.aCol = new THREE.BufferAttribute(new Float32Array(V * 3), 3);
    this.aVel = new THREE.BufferAttribute(new Float32Array(V * 3), 3);
    this.aSize = new THREE.BufferAttribute(new Float32Array(V), 1);
    this.aWorld = new THREE.BufferAttribute(new Float32Array(V), 1);
    for (const a of [this.aPos, this.aCol, this.aVel, this.aSize, this.aWorld]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aVel', this.aVel);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aWorld', this.aWorld);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTexelM: { value: 0.2 }, uTint: { value: new THREE.Color(1, 1, 1) } },
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.layers.set(w.layers.FX);
    this.points.renderOrder = 10;
    this.points.onBeforeRender = (renderer, _s, camera) => {
      const rt = renderer.getRenderTarget();
      const h = rt ? rt.height : renderer.domElement.height;
      const cam = camera as THREE.OrthographicCamera;
      this.mat.uniforms.uTexelM.value = (cam.top - cam.bottom) / Math.max(1, h);
    };
    for (let i = 0; i < 7; i++) this.ribbons.push(this.newRibbon(true));
  }

  // ---------- 生成 ----------

  private spawn(k: K, x: number, y: number, z: number, life: number, pal: THREE.Color[]): number {
    if (this.n >= CAP) return -1;
    const i = this.n++;
    this.kind[i] = k;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.vz[i] = 0;
    this.age[i] = 0;
    this.life[i] = life;
    this.pa[i] = 1;
    this.pb[i] = 0;
    this.pc[i] = 0;
    this.thr[i] = this.rnd() * 0.98;
    this.gy[i] = k === K.Puff ? 0 : this.w.groundY(x, z);
    this.py[i] += this.gy[i];
    const c = pal[(this.rnd() * pal.length) | 0];
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    return i;
  }

  private kill(i: number) {
    const j = --this.n;
    if (i === j) return;
    this.px[i] = this.px[j];
    this.py[i] = this.py[j];
    this.pz[i] = this.pz[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.vz[i] = this.vz[j];
    this.age[i] = this.age[j];
    this.life[i] = this.life[j];
    this.pa[i] = this.pa[j];
    this.pb[i] = this.pb[j];
    this.pc[i] = this.pc[j];
    this.thr[i] = this.thr[j];
    this.gy[i] = this.gy[j];
    this.kind[i] = this.kind[j];
    this.col[i * 3] = this.col[j * 3];
    this.col[i * 3 + 1] = this.col[j * 3 + 1];
    this.col[i * 3 + 2] = this.col[j * 3 + 2];
  }

  /** 一团尘土：向外扩散、顺风飘、慢慢消失 */
  puff(pos: THREE.Vector3, size = 0.5, count = 10) {
    const r = this.rnd;
    const s = Math.max(0.1, size);
    for (let k = 0; k < count; k++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * s * 0.35;
      const i = this.spawn(
        K.Puff,
        pos.x + Math.cos(a) * d,
        Math.max(0.08, pos.y + r() * s * 0.3),
        pos.z + Math.sin(a) * d,
        (0.6 + r() * 0.7) * (0.7 + s * 0.6),
        PAL.puff,
      );
      if (i < 0) return;
      const sp = (0.8 + r() * 1.4) * s * 2;
      this.vx[i] = Math.cos(a) * sp;
      this.vz[i] = Math.sin(a) * sp;
      this.vy[i] = (0.3 + r() * 0.8) * s;
      this.pc[i] = Math.min(0.16, s * (0.1 + r() * 0.12));
    }
  }

  private newRibbon(initial: boolean): Ribbon {
    const r = this.rnd;
    const d = this.wind.dir;
    let x = ISLAND.x0 + 2 + r() * (ISLAND.x1 - ISLAND.x0 - 4);
    let z = ISLAND.z0 + 2 + r() * (ISLAND.z1 - ISLAND.z0 - 4);
    if (!initial) {
      // 从上风方向进来
      const back = 6 + r() * 10;
      x -= d.x * back;
      z -= d.y * back;
      x = THREE.MathUtils.clamp(x, ISLAND.x0 + 1, ISLAND.x1 - 1);
      z = THREE.MathUtils.clamp(z, ISLAND.z0 + 1, ISLAND.z1 - 1);
    }
    return {
      x,
      z,
      phase: r() * 6.28,
      omega: 0.7 + r() * 1.1,
      amp: 0.8 + r() * 1.8,
      life: initial ? 2 + r() * 8 : 5 + r() * 8,
      len: 1,
    };
  }

  private spawnDevil() {
    const r = this.rnd;
    const d = this.wind.dir;
    // 从上风那一半出生，顺风慢慢走
    const x = THREE.MathUtils.clamp((r() * 2 - 1) * 12 - d.x * 8, ISLAND.x0 + 3, ISLAND.x1 - 3);
    const z = THREE.MathUtils.clamp((r() * 2 - 1) * 18 - d.y * 10, ISLAND.z0 + 3, ISLAND.z1 - 3);
    this.devil = { x, z, vx: d.x * 1.1, vz: d.y * 1.1, age: 0, life: 9 + r() * 3, env: 0, sweepT: 0, spin: 0 };
  }

  // ---------- 每步 ----------

  update(dt: number, t: number) {
    const r = this.rnd;
    const wd = this.wind.dir;
    const gust = this.wind.gust;
    const base = this.wind.base;
    const ws = this.wind.speed;
    const windy = THREE.MathUtils.clamp(base / 0.6, 0, 1.5);

    // 贴地流沙
    this.sandAcc += dt * 45 * windy * gust ** 1.6;
    while (this.sandAcc >= 1) {
      this.sandAcc -= 1;
      let x = ISLAND.x0 + r() * (ISLAND.x1 - ISLAND.x0);
      let z = ISLAND.z0 + r() * (ISLAND.z1 - ISLAND.z0);
      if (r() < 0.35) {
        // 一部分从上风的岛边进来
        const back = r() * 6;
        x = THREE.MathUtils.clamp(x - wd.x * 30, ISLAND.x0, ISLAND.x1) + wd.x * back;
        z = THREE.MathUtils.clamp(z - wd.y * 30, ISLAND.z0, ISLAND.z1) + wd.y * back;
      }
      // 一串（2～5 颗，顺风排开）：看起来是一股股贴地流的沙
      const m = 0.75 + r() * 0.5;
      const y = 0.1 + r() * 0.2;
      const life = 1.2 + r() * 2;
      const len = 1 + Math.floor(r() * 3);
      const gap = 0.2 + r() * 0.25;
      for (let q = 0; q < len; q++) {
        const i = this.spawn(
          K.Sand,
          x - wd.x * q * gap,
          y + (r() - 0.5) * 0.04,
          z - wd.y * q * gap,
          life + r() * 0.3,
          PAL.sand,
        );
        if (i < 0) break;
        this.pa[i] = m;
        this.vx[i] = wd.x * ws * m;
        this.vz[i] = wd.y * ws * m;
      }
    }

    // 空中薄尘（大风时）
    this.hazeAcc += dt * 70 * windy * Math.max(0, gust - 0.35) ** 2 * 3;
    while (this.hazeAcc >= 1) {
      this.hazeAcc -= 1;
      const i = this.spawn(
        K.Haze,
        ISLAND.x0 + r() * (ISLAND.x1 - ISLAND.x0),
        0.5 + r() * 2.5,
        ISLAND.z0 + r() * (ISLAND.z1 - ISLAND.z0),
        1.5 + r() * 2.5,
        PAL.haze,
      );
      if (i < 0) break;
      this.pa[i] = 0.9 + r() * 0.4;
      this.pb[i] = r() * 6.28;
    }

    // 蛇形沙带：上风处的源左右摆，吹出去的沙粒连成一条蛇形线
    const ribbonOn = gust > 0.35;
    for (let k = 0; k < this.ribbons.length; k++) {
      const rb = this.ribbons[k];
      rb.life -= dt;
      rb.x += wd.x * dt * 0.8;
      rb.z += wd.y * dt * 0.8;
      if (rb.life <= 0 || !onSlab(rb.x, rb.z)) {
        this.ribbons[k] = this.newRibbon(false);
        continue;
      }
      if (!ribbonOn) continue;
      const strength = THREE.MathUtils.smoothstep(gust, 0.35, 0.65) * Math.min(1, rb.life);
      const lat = Math.sin(t * rb.omega + rb.phase) * rb.amp + Math.sin(t * rb.omega * 2.3 + rb.phase) * rb.amp * 0.3;
      const sx = rb.x - wd.y * lat;
      const sz = rb.z + wd.x * lat;
      const nEmit = dt * 75 * strength * windy;
      const count = Math.floor(nEmit) + (r() < nEmit % 1 ? 1 : 0);
      for (let e = 0; e < count; e++) {
        const j = (r() - 0.5) * 0.35;
        const i = this.spawn(K.Ribbon, sx - wd.y * j, 0.06 + r() * 0.05, sz + wd.x * j, 0.9 + r() * 0.7, PAL.ribbon);
        if (i < 0) break;
        this.pa[i] = 1.05 + r() * 0.1;
        this.vx[i] = wd.x * ws * this.pa[i];
        this.vz[i] = wd.y * ws * this.pa[i];
      }
    }

    // 尘卷风
    this.devilWait -= dt;
    if (!this.devil && this.devilWait <= 0) {
      this.spawnDevil();
      this.devilWait = 40 + r() * 20;
    }
    const dv = this.devil;
    if (dv) {
      dv.age += dt;
      dv.env = Math.min(1, dv.age / 1.5, Math.max(0, (dv.life - dv.age) / 2));
      // 乱走 + 顺风
      dv.vx += ((wd.x * 1.1 - dv.vx) * 0.3 + (r() - 0.5) * 3) * dt;
      dv.vz += ((wd.y * 1.1 - dv.vz) * 0.3 + (r() - 0.5) * 3) * dt;
      dv.x += dv.vx * dt;
      dv.z += dv.vz * dt;
      if (!onSlab(dv.x, dv.z, 2)) {
        dv.vx -= Math.sign(dv.x) * dt * 2;
        dv.vz -= Math.sign(dv.z) * dt * 2;
      }
      dv.spin += dt * 6;
      this.devilAcc += dt * 1300 * dv.env;
      while (this.devilAcc >= 1) {
        this.devilAcc -= 1;
        const debris = r() < 0.08;
        const i = this.spawn(K.Devil, dv.x, 0.05, dv.z, 1.2 + r() * 1.0, debris ? PAL.debris : PAL.devil);
        if (i < 0) break;
        // 三条螺旋臂：同一角速度一起转（臂不散），画的时候按高度再扭一圈
        const arm = Math.floor(r() * 3);
        this.pa[i] = dv.spin + arm * 2.094 + (r() - 0.5) * 0.35;
        this.pb[i] = (debris ? -1 : 1) * (0.01 + r() * 0.08); // 半径抖动；负数 = 碎屑
        this.vy[i] = 1.2 + r() * 1.6; // 上升
        this.pc[i] = debris && r() < 0.5 ? 0.15 : 0.09;
      }
      // 卷走场上的沙，丢在下风一点的地方
      dv.sweepT -= dt;
      if (dv.sweepT <= 0) {
        dv.sweepT = 0.5;
        if (onPad(dv.x, dv.z) && this.w.dirt) {
          const took = this.w.dirt.sweep(dv.x, dv.z, 0.8, 0.12 * dv.env);
          const ox = dv.x + wd.x * 2.5 + (r() - 0.5) * 2;
          const oz = dv.z + wd.y * 2.5 + (r() - 0.5) * 2;
          if (took > 0 && onPad(ox, oz)) this.w.dirt.deposit(ox, oz, 1.2, took);
        }
      }
      if (dv.age >= dv.life) this.devil = null;
    }

    // 风把沙吹上球场：上风那一侧的场边多，阵风大时往里走得远
    this.depAcc += dt * 2.5 * windy * gust ** 1.5 * (gust > 0.3 ? 1 : 0);
    while (this.depAcc >= 1) {
      this.depAcc -= 1;
      this.depositWindward(r, wd, gust);
    }

    this.step(dt, t, wd, ws, gust);
    this.dirty = true;
  }

  private depositWindward(r: () => number, wd: THREE.Vector2, gust: number) {
    const dirt = this.w.dirt;
    if (!dirt) return;
    const smin = -(pad.hw * Math.abs(wd.x) + pad.hl * Math.abs(wd.y));
    const reach = 2 + 5 * gust;
    for (let tries = 0; tries < 8; tries++) {
      const x = (r() * 2 - 1) * (pad.hw - 0.4);
      const z = (r() * 2 - 1) * (pad.hl - 0.4);
      const s = x * wd.x + z * wd.y - smin;
      if (r() < Math.exp(-s / reach)) {
        dirt.deposit(x, z, 1.1 + r() * 1.1, 0.03 * gust * this.sandMul);
        return;
      }
    }
  }

  private step(dt: number, t: number, wd: THREE.Vector2, ws: number, gust: number) {
    const r = this.rnd;
    const dv = this.devil;
    const dirt = this.w.dirt;
    this.frame = (this.frame + 1) % 12;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      // 地面高度隔几步更新一次（沙粒会翻过沙丘）
      if (i % 12 === this.frame && (this.kind[i] === K.Sand || this.kind[i] === K.Ribbon))
        this.gy[i] = this.w.groundY(this.px[i], this.pz[i]);
      if (this.age[i] >= this.life[i]) {
        if (this.kind[i] === K.Devil) {
          // 卷到顶的尘散成薄尘顺风飘走
          this.kind[i] = K.Haze;
          this.age[i] = 0;
          this.life[i] = 0.8 + r() * 1.2;
          this.pa[i] = 0.7;
          this.pb[i] = r() * 6.28;
        } else {
          this.kill(i--);
          continue;
        }
      }
      switch (this.kind[i] as K) {
        case K.Sand: {
          const m = this.pa[i];
          const tx = wd.x * ws * m;
          const tz = wd.y * ws * m;
          this.vx[i] += (tx - this.vx[i]) * Math.min(1, dt * 4);
          this.vz[i] += (tz - this.vz[i]) * Math.min(1, dt * 4);
          this.vy[i] -= 3 * dt;
          if (this.py[i] < this.gy[i] + 0.08) {
            this.py[i] = this.gy[i] + 0.08;
            this.vy[i] = r() < 0.3 ? r() * 1.1 * gust : 0;
          }
          break;
        }
        case K.Ribbon: {
          const m = this.pa[i];
          this.vx[i] += (wd.x * ws * m - this.vx[i]) * Math.min(1, dt * 3);
          this.vz[i] += (wd.y * ws * m - this.vz[i]) * Math.min(1, dt * 3);
          this.vy[i] = (this.gy[i] + 0.09 - this.py[i]) * 4;
          if (dirt && r() < dt * 0.025 && onPad(this.px[i], this.pz[i]))
            dirt.deposit(this.px[i], this.pz[i], 0.6, 0.012 * this.sandMul);
          break;
        }
        case K.Puff: {
          const drag = Math.exp(-3.2 * dt);
          this.vx[i] = this.vx[i] * drag + wd.x * ws * 0.35 * (1 - drag);
          this.vz[i] = this.vz[i] * drag + wd.y * ws * 0.35 * (1 - drag);
          this.vy[i] = this.vy[i] * drag + 0.12 * dt;
          this.pc[i] *= Math.exp(-0.4 * dt);
          break;
        }
        case K.Devil: {
          if (!dv) {
            this.kind[i] = K.Haze;
            this.age[i] = 0;
            this.life[i] = 0.6 + r();
            this.pa[i] = 0.7;
            this.pb[i] = r() * 6.28;
            break;
          }
          const h = this.py[i] - this.gy[i];
          const rad = (0.22 + Math.abs(this.pb[i]) + h * 0.3) * (0.6 + 0.4 * dv.env);
          this.pa[i] += dt * 6;
          this.py[i] += this.vy[i] * dt * (h > 3 ? 0.3 : 1);
          const ad = this.pa[i] + h * 1.7;
          const nx = dv.x + Math.cos(ad) * rad + wd.x * h * 0.15;
          const nz = dv.z + Math.sin(ad) * rad + wd.y * h * 0.15;
          // 速度只给尾巴用
          this.vx[i] = (nx - this.px[i]) / dt;
          this.vz[i] = (nz - this.pz[i]) / dt;
          this.px[i] = nx;
          this.pz[i] = nz;
          continue;
        }
        case K.Haze: {
          const m = this.pa[i];
          this.vx[i] += (wd.x * ws * m - this.vx[i]) * Math.min(1, dt * 2);
          this.vz[i] += (wd.y * ws * m - this.vz[i]) * Math.min(1, dt * 2);
          this.vy[i] = Math.sin(t * 2 + this.pb[i]) * 0.3 - 0.05;
          break;
        }
      }
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (!onSlab(this.px[i], this.pz[i])) this.kill(i--);
    }
  }

  /** 写顶点缓冲（每次渲染前一次） */
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const P = this.aPos.array as Float32Array;
    const C = this.aCol.array as Float32Array;
    const Vv = this.aVel.array as Float32Array;
    const S = this.aSize.array as Float32Array;
    const W = this.aWorld.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const k = this.kind[i] as K;
      const a = this.age[i];
      const rem = this.life[i] - a;
      let f = Math.min(1, a / 0.25, rem / 0.6);
      if (k === K.Haze) f *= 0.55;
      if (k === K.Ribbon) f = 0.85 * Math.min(1, a / 0.25, rem / 0.5);
      if (k === K.Devil && this.devil) f *= this.devil.env;
      const vis = f > this.thr[i];
      const h = i * 2;
      const t = h + 1;
      const x = this.px[i];
      const y = this.py[i];
      const z = this.pz[i];
      P[h * 3] = P[t * 3] = x;
      P[h * 3 + 1] = P[t * 3 + 1] = y;
      P[h * 3 + 2] = P[t * 3 + 2] = z;
      let cr = this.col[i * 3];
      let cg = this.col[i * 3 + 1];
      let cb = this.col[i * 3 + 2];
      if (k === K.Devil && this.pb[i] > 0) {
        // 台阶状的环带 × 背光/朝镜头 → 三档
        const hh = y - this.gy[i];
        const ring = Math.floor(hh / 0.4) & 1;
        const front = Math.sin(this.pa[i] + hh * 1.7) > 0 ? 1 : 0; // +z 朝镜头
        const c = DEVIL_RAMP[Math.min(2, ring + front)];
        cr = c.r;
        cg = c.g;
        cb = c.b;
      }
      C[h * 3] = cr;
      C[h * 3 + 1] = cg;
      C[h * 3 + 2] = cb;
      C[t * 3] = cr * 0.86;
      C[t * 3 + 1] = cg * 0.84;
      C[t * 3 + 2] = cb * 0.8;
      Vv[h * 3] = Vv[h * 3 + 1] = Vv[h * 3 + 2] = 0;
      const streak = k === K.Sand || k === K.Ribbon || k === K.Devil || k === K.Haze;
      if (streak) {
        Vv[t * 3] = this.vx[i];
        Vv[t * 3 + 1] = this.vy[i] * 0.3;
        Vv[t * 3 + 2] = this.vz[i];
      }
      const ww = k === K.Puff || k === K.Devil ? this.pc[i] : 0;
      S[h] = vis ? 1 : 0;
      W[h] = vis ? ww : 0;
      // 尾巴：快的才拖（慢的尘团不拖）
      const sp2 = this.vx[i] * this.vx[i] + this.vz[i] * this.vz[i];
      S[t] = vis && streak && sp2 > 4 ? 1 : 0;
      W[t] = 0;
    }
    for (const at of [this.aPos, this.aCol, this.aVel, this.aSize, this.aWorld]) {
      at.clearUpdateRanges();
      at.addUpdateRange(0, this.n * 2 * at.itemSize);
      at.needsUpdate = true;
    }
    this.points.geometry.setDrawRange(0, this.n * 2);
  }

  setTint(c: THREE.Color) {
    (this.mat.uniforms.uTint.value as THREE.Color).copy(c);
  }

  get count() {
    return this.n;
  }
}
