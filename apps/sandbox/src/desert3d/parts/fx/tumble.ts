// 风滚草（胖胖的低多边形球，阵风里滚、弹、跳，出了岛就从上风边回来）
// 和飞的碎片（叶子、纸、塑料袋）。
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ISLAND } from '../../layout';
import type { World } from '../../world';
import type { Wind } from './wind';

const G = 9.8;

function lumpyBall(rnd: () => number, detail: number, jitter: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (rnd() - 0.5) * 2 * jitter;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.9, p.getZ(i) * k);
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

/** 一个风滚草：一团疙疙瘩瘩的球（干草色三档，面片明暗交错像枝条） */
function tumbleGeometry(rnd: () => number): THREE.BufferGeometry {
  const outer = lumpyBall(rnd, 1, 0.22);
  const tri = outer.getAttribute('position').count / 3;
  const cols = new Float32Array(tri * 9);
  // 用了 ramp：顶点色只做接近白的明暗（像一根根枝条）
  const pal = [1, 0.93, 0.86, 0.97].map((v) => new THREE.Color(v, v, v));
  for (let f = 0; f < tri; f++) {
    const c = pal[(rnd() * pal.length) | 0];
    for (let v = 0; v < 3; v++) cols.set([c.r, c.g, c.b], (f * 3 + v) * 3);
  }
  outer.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return outer;
}

interface Weed {
  mesh: THREE.Mesh;
  r: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** 每棵对风的敏感度不同 */
  k: number;
  grounded: boolean;
}

interface Bit {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  scale: THREE.Vector3;
  active: boolean;
  resting: boolean;
  wait: number;
  phase: number;
}

const BIT_TYPES = [
  { color: 0x8a8a44, sx: 0.22, sz: 0.14 }, // 枯叶
  { color: 0xa07a40, sx: 0.2, sz: 0.16 }, // 棕叶
  { color: 0xf2ecd8, sx: 0.32, sz: 0.24 }, // 纸
  { color: 0xe4ecf0, sx: 0.46, sz: 0.36 }, // 塑料袋
  { color: 0x9a9a52, sx: 0.2, sz: 0.12 },
  { color: 0xf0e4c8, sx: 0.28, sz: 0.2 }, // 收据
];

export class Tumble {
  readonly root = new THREE.Group();
  private weeds: Weed[] = [];
  private bits: Bit[] = [];
  private bitMesh: THREE.InstancedMesh;
  private rnd: () => number;
  private tmpQ = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();
  private tmpM = new THREE.Matrix4();
  private tmpQ2 = new THREE.Quaternion();

  constructor(
    private w: World,
    private wind: Wind,
    private puff: (p: THREE.Vector3, size: number, count: number) => void,
  ) {
    const r = (this.rnd = w.rng('fx:tumble'));
    const n = 2 + Math.floor(r() * 3);
    const mat = w.mats.toon(0xffffff, {
      vertexColors: true,
      ramp: [0xdcc088, 0xb08c5a, 0x6e5468],
      sphereNormals: true,
      lightUp: 0.35,
      noise: 0.3,
      edge: 0.6,
      convex: 0.4,
    });
    for (let i = 0; i < n; i++) {
      const rad = 0.2 + r() * 0.1;
      const mesh = new THREE.Mesh(tumbleGeometry(r), mat);
      mesh.scale.setScalar(rad);
      const pos = new THREE.Vector3(
        ISLAND.x0 + 2 + r() * (ISLAND.x1 - ISLAND.x0 - 4),
        rad,
        ISLAND.z0 + 2 + r() * (ISLAND.z1 - ISLAND.z0 - 4),
      );
      mesh.position.copy(pos);
      mesh.quaternion.setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6));
      this.root.add(mesh);
      this.weeds.push({ mesh, r: rad, pos, vel: new THREE.Vector3(), k: 0.75 + r() * 0.4, grounded: true });
    }

    // 碎片：一个 InstancedMesh（FX 图层，不描边），双面
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.bitMesh = new THREE.InstancedMesh(geo, w.mats.toon(0xffffff, { side: THREE.DoubleSide }), BIT_TYPES.length);
    this.bitMesh.layers.set(w.layers.FX);
    this.bitMesh.frustumCulled = false;
    BIT_TYPES.forEach((b, i) => {
      this.bitMesh.setColorAt(i, new THREE.Color(b.color));
      this.bits.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
        scale: new THREE.Vector3(b.sx, 1, b.sz),
        active: false,
        resting: false,
        wait: r() * 6,
        phase: r() * 6.28,
      });
    });
    this.root.add(this.bitMesh);
    w.mats.prepare(this.root);
    this.bitMesh.receiveShadow = false;
  }

  /** 上风的岛边上随便一个点 */
  private windwardEntry(out: THREE.Vector3, margin: number) {
    const r = this.rnd;
    const d = this.wind.dir;
    // 岛内随机一点，逆着风往回推到岛边
    let x = ISLAND.x0 + margin + r() * (ISLAND.x1 - ISLAND.x0 - 2 * margin);
    let z = ISLAND.z0 + margin + r() * (ISLAND.z1 - ISLAND.z0 - 2 * margin);
    const tx = d.x > 1e-3 ? (x - (ISLAND.x0 + margin)) / d.x : d.x < -1e-3 ? (x - (ISLAND.x1 - margin)) / d.x : 1e9;
    const tz = d.y > 1e-3 ? (z - (ISLAND.z0 + margin)) / d.y : d.y < -1e-3 ? (z - (ISLAND.z1 - margin)) / d.y : 1e9;
    const back = Math.min(tx, tz);
    x -= d.x * back;
    z -= d.y * back;
    out.set(x, 0, z);
  }

  update(dt: number, t: number) {
    const r = this.rnd;
    const d = this.wind.dir;
    const gust = this.wind.gust;
    const ws = this.wind.speed;

    for (const wd of this.weeds) {
      const { pos, vel } = wd;
      // 风推（只有阵风够大才推得动；地面摩擦）
      const push = Math.max(0, gust - 0.18) / 0.82;
      const target = ws * 0.55 * wd.k * push;
      const kx = wd.grounded ? 1.6 : 0.6;
      vel.x += (d.x * target - vel.x) * kx * dt;
      vel.z += (d.y * target - vel.z) * kx * dt;
      // 左右乱晃一点
      vel.x += -d.y * Math.sin(t * 1.7 + wd.k * 9) * 0.6 * push * dt;
      vel.z += d.x * Math.sin(t * 1.7 + wd.k * 9) * 0.6 * push * dt;
      vel.y -= G * dt;
      pos.addScaledVector(vel, dt);
      const floor = this.w.groundY(pos.x, pos.z) + wd.r * 0.9;
      if (pos.y <= floor) {
        const impact = -vel.y;
        pos.y = floor;
        if (impact > 1.6) {
          this.puff(this.tmpV.set(pos.x, pos.y - wd.r * 0.8, pos.z), 0.25 + wd.r * 0.6, 4 + Math.floor(impact * 2));
          vel.y = impact * 0.42;
        } else vel.y = 0;
        wd.grounded = vel.y < 0.5;
        // 随机蹦一下（地上的小坎）
        const sp = Math.hypot(vel.x, vel.z);
        if (sp > 1.2 && r() < dt * (0.6 + 2.2 * gust)) {
          vel.y = 1 + r() * 2.8 * gust + sp * 0.12;
          wd.grounded = false;
        }
      } else if (pos.y > floor + 0.05) wd.grounded = false;

      // 出岛 → 从上风边回来，从半空掉进来
      if (
        pos.x < ISLAND.x0 - wd.r ||
        pos.x > ISLAND.x1 + wd.r ||
        pos.z < ISLAND.z0 - wd.r ||
        pos.z > ISLAND.z1 + wd.r
      ) {
        this.windwardEntry(pos, wd.r + 0.2);
        pos.y = wd.r + 0.6 + r() * 0.8;
        vel.set(d.x * ws * 0.3, 0, d.y * ws * 0.3);
      }

      // 滚：绕 (vz, 0, -vx) 转 |v|·dt / r
      const sp = Math.hypot(vel.x, vel.z);
      if (sp > 1e-3) {
        this.tmpV.set(vel.z / sp, 0, -vel.x / sp);
        this.tmpQ.setFromAxisAngle(this.tmpV, (sp * dt) / wd.r);
        wd.mesh.quaternion.premultiply(this.tmpQ);
      }
      wd.mesh.position.copy(pos);
    }

    // 碎片
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i];
      if (!b.active) {
        b.wait -= dt;
        if (b.wait <= 0 && gust > 0.45) {
          b.active = true;
          b.resting = false;
          this.windwardEntry(b.pos, 0.5);
          b.pos.y = 0.6 + r() * 2.2;
          b.vel.set(d.x * ws, 0, d.y * ws);
          b.spin.set((r() - 0.5) * 9, (r() - 0.5) * 5, (r() - 0.5) * 9);
        }
      } else {
        const lift = gust > 0.5;
        if (b.resting) {
          b.vel.set(0, 0, 0);
          if (lift && r() < dt * 1.5) {
            b.resting = false;
            b.vel.y = 1.5 + r() * 2;
          }
        } else {
          const heavy = i === 3 ? 0.5 : 1; // 塑料袋飘得久
          b.vel.x += (d.x * ws * 0.9 - b.vel.x) * dt * 1.5;
          b.vel.z += (d.y * ws * 0.9 - b.vel.z) * dt * 1.5;
          b.vel.y += (-1.4 * heavy + Math.sin(t * 3.1 + b.phase) * 3.2 * gust + (gust - 0.45) * 2.4) * dt;
          b.vel.y *= Math.exp(-1.2 * dt);
          b.pos.addScaledVector(b.vel, dt);
          b.rot.x += b.spin.x * dt * (0.3 + gust);
          b.rot.y += b.spin.y * dt * (0.3 + gust);
          b.rot.z += b.spin.z * dt * (0.3 + gust);
          const fl = this.w.groundY(b.pos.x, b.pos.z) + 0.06;
          if (b.pos.y < fl) {
            b.pos.y = fl;
            b.vel.y = 0;
            if (!lift) {
              b.resting = true;
              b.rot.x = 0;
              b.rot.z = 0;
            }
          }
          if (b.pos.y > 6) b.vel.y -= 2 * dt;
        }
        if (b.pos.x < ISLAND.x0 || b.pos.x > ISLAND.x1 || b.pos.z < ISLAND.z0 || b.pos.z > ISLAND.z1) {
          b.active = false;
          b.wait = 3 + r() * 12;
        }
      }
      if (b.active) {
        this.tmpQ2.setFromEuler(b.rot);
        this.tmpM.compose(b.pos, this.tmpQ2, b.scale);
      } else this.tmpM.makeScale(0, 0, 0);
      this.bitMesh.setMatrixAt(i, this.tmpM);
    }
    this.bitMesh.instanceMatrix.needsUpdate = true;
  }
}
