// 果岭推杆的 3D 小东西：球、洞杯、旗杆、推杆（总监手里的）、瞄准线和回拉线的点、坡纹（一直在、很淡）、
// 看坡的流线（开了才有）。clubgolf 的旗杆、球、推杆还是白模（灰盒），这里用俱乐部底表（mg.ctx）照规格重画：
// 旗杆 1.7 米白杆红旗、球白、推杆铁灰。点、坡纹、流线都在 FX 层（不描边、不受光，像素风的实心色块）。
import * as THREE from 'three';
import type { AssetCtx } from '../../clubsite/render/ctx';
import { CUP_R, gradient, type Slope, type Surface } from './rules';

const FX = 1;
/** 果岭的高度（clubgolf/layout.ts 的 H.green）：贴地的东西放在它上面一点 */
export const GREEN_Y = 0.023;

const fxMat = (color: number, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false });
const fx = <T extends THREE.Object3D>(o: T, order = 2): T => {
  o.traverse((c) => {
    c.layers.set(FX);
    c.renderOrder = order;
    c.frustumCulled = false;
  });
  return o;
};

/** 画出来的球比算的大一点（半径 6.5 厘米 ≈ 5 个纹素），手机上一眼看得见 */
export const BALL_VIS = 0.065;

/** 球：不受光的亮白（影子里也是白的，一眼找得到），照样描边、投影 */
export function makeBall(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.IcosahedronGeometry(BALL_VIS, 1),
    new THREE.MeshBasicMaterial({ color: 0xfffbf0 }),
  );
  m.castShadow = true;
  m.name = 'golfputt:ball';
  return m;
}

/** 洞杯：一个深靛的圆（杯口）+ 一圈浅的杯沿（白色杯衬露出来的一圈） */
export function makeCup(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'golfputt:cup';
  const rim = new THREE.Mesh(new THREE.CircleGeometry(CUP_R + 0.025, 20).rotateX(-Math.PI / 2), fxMat(0xfff3d6));
  rim.position.y = 0.004;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 20).rotateX(-Math.PI / 2), fxMat(0x1c1634));
  hole.position.y = 0.006;
  g.add(fx(rim, 1), fx(hole, 2));
  return g;
}

/** 旗杆：白杆 + 红旗（旗面绕杆轻轻摆：userData.wave(t)） */
export function makeFlag(ctx: AssetCtx): THREE.Group {
  const g = new THREE.Group();
  g.name = 'golfputt:flag';
  // 比真的（2.1 米）矮一点：俯视下旗子不盖住杯前的球
  const H = 1.7;
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.045, H, 0.045).translate(0, H / 2, 0), ctx.mat('clothWhite'));
  const pivot = new THREE.Group();
  pivot.position.y = H - 0.04;
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.025).translate(0.26, -0.17, 0), ctx.mat('clothRed'));
  // 旗面中间一道黄（球场旗子的号码条）
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.03).translate(0.3, -0.17, 0), ctx.mat('ball'));
  pivot.add(flag, stripe);
  g.add(pole, pivot);
  g.traverse((o) => {
    o.castShadow = true;
  });
  ctx.mats.prepare(g);
  g.userData.wave = (t: number) => {
    pivot.rotation.y = -0.35 + Math.sin(t * 2.1) * 0.22 + Math.sin(t * 5.3) * 0.06;
  };
  return g;
}

/**
 * 推杆：握点在原点、杆头往 −y（clubsite/people 的 GripSpec）。里面套一层 swing 组：总监"挥杆"时转它（绕本地 z = 杆头左右摆），
 * 不碰总监的姿势（push 姿势的 pushTool 把它摆成右手低握、杆头落在身前地上，左手握 at2）。
 */
export function makePutter(ctx: AssetCtx): { obj: THREE.Group; swing: THREE.Group; grip: Record<string, unknown> } {
  const obj = new THREE.Group();
  obj.name = 'golfputt:putter';
  const swing = new THREE.Group();
  const L = 0.86;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, L, 0.03).translate(0, -L / 2, 0), ctx.mat('metal'));
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.24, 0.045).translate(0, -0.08, 0), ctx.mat('ironwork'));
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.05, 0.07).translate(0, -L - 0.01, 0.01),
    ctx.mat('ironwork'),
  );
  swing.add(shaft, grip, head);
  obj.add(swing);
  obj.traverse((o) => {
    o.castShadow = true;
  });
  ctx.mats.prepare(obj);
  return {
    obj,
    swing,
    grip: { at: [0, 0, 0], axis: [0, -1, 0], up: [0, 0, 1], at2: [0, -0.11, 0], tip: [0, -L - 0.01, 0.01] },
  };
}

/** 一串贴地的小方点（瞄准线、回拉线）：InstancedMesh，set(点) 摆，多的缩成 0 */
export class Dots {
  readonly mesh: THREE.InstancedMesh;
  private m4 = new THREE.Matrix4();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  constructor(
    readonly max: number,
    size: number,
    color: number,
    opacity = 1,
    private y = GREEN_Y + 0.012,
  ) {
    this.mesh = fx(
      new THREE.InstancedMesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), fxMat(color, opacity), max),
      3,
    );
    this.clear();
  }
  set(pts: readonly (readonly [number, number])[], ground?: (x: number, z: number) => number) {
    for (let i = 0; i < this.max; i++) {
      const p = pts[i];
      if (p) this.m4.makeTranslation(p[0], ground ? ground(p[0], p[1]) : this.y, p[1]);
      this.mesh.setMatrixAt(i, p ? this.m4 : this.zero);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.set([]);
  }
}

/** 一个 V 形小箭头（尖朝 +x）：两根细条 */
function chevronGeo(len: number, w: number): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(len, w).translate(-len / 2, 0, 0).rotateZ(0.65);
  const b = new THREE.PlaneGeometry(len, w).translate(-len / 2, 0, 0).rotateZ(-0.65);
  const pos = [...a.toNonIndexed().attributes.position.array, ...b.toNonIndexed().attributes.position.array];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // 平放到地上（xy 平面 → xz 平面）
  g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * 坡纹：果岭上一格一格的小 V，尖朝下坡，越陡越大、越亮；平时很淡（"草纹"），看坡时亮起来。
 * at(x, z) = 这里要不要画（果岭和果岭边）。
 */
export function makeGrain(slope: Slope, at: (x: number, z: number) => boolean, box: [number, number, number, number]) {
  const pts: { x: number; z: number; a: number; s: number }[] = [];
  const step = 0.55;
  const [x0, x1, z0, z1] = box;
  for (let z = z0; z <= z1; z += step * 0.86) {
    const odd = Math.round((z - z0) / (step * 0.86)) % 2;
    for (let x = x0 + (odd ? step / 2 : 0); x <= x1; x += step) {
      if (!at(x, z)) continue;
      const [gx, gz] = gradient(slope, x, z);
      const m = Math.hypot(gx, gz);
      if (m < 0.006) continue;
      // 尖朝下坡（−梯度）：本地 +x 转到 (−gx, −gz)
      pts.push({ x, z, a: Math.atan2(gz, -gx), s: THREE.MathUtils.clamp(0.55 + m * 14, 0.6, 1.35) });
    }
  }
  const mat = fxMat(0x2f6a3a, 0.32);
  const mesh = fx(new THREE.InstancedMesh(chevronGeo(0.11, 0.028), mat, Math.max(1, pts.length)), 1);
  mesh.name = 'golfputt:grain';
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  pts.forEach((p, i) => {
    q.setFromAxisAngle(up, p.a);
    m4.compose(new THREE.Vector3(p.x, GREEN_Y + 0.006, p.z), q, new THREE.Vector3(p.s, 1, p.s));
    mesh.setMatrixAt(i, m4);
  });
  mesh.count = pts.length;
  mesh.instanceMatrix.needsUpdate = true;
  return {
    mesh,
    /** 看坡时亮起来 */
    bright(on: boolean) {
      mat.color.set(on ? 0xfff3d6 : 0x2f6a3a);
      mat.opacity = on ? 0.55 : 0.32;
    },
  };
}

/**
 * 看坡的流线：一群小短线顺着下坡方向流（越陡流得越快），流出范围或老了就在范围里随机一处重生。
 * 只在能打的地面上（果岭、果岭边、球道、长草）。rng 是种子随机流。
 */
export function makeFlow(
  slope: Slope,
  surface: (x: number, z: number) => Surface,
  box: [number, number, number, number],
  rng: () => number,
  n = 240,
) {
  const [x0, x1, z0, z1] = box;
  const ok = (x: number, z: number) => {
    const s = surface(x, z);
    return s === 'green' || s === 'fringe' || s === 'fairway';
  };
  const ps = Array.from({ length: n }, () => ({ x: 0, z: 0, age: 0, life: 1 }));
  const spawn = (p: (typeof ps)[number], age0 = 0) => {
    for (let t = 0; t < 30; t++) {
      p.x = x0 + rng() * (x1 - x0);
      p.z = z0 + rng() * (z1 - z0);
      if (ok(p.x, p.z)) break;
    }
    p.life = 1.4 + rng() * 1.4;
    p.age = age0 * p.life;
  };
  for (const p of ps) spawn(p, rng());
  const geo = new THREE.PlaneGeometry(0.13, 0.035).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const mesh = fx(new THREE.InstancedMesh(geo, mat, n), 4);
  mesh.name = 'golfputt:flow';
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const cA = new THREE.Color(0xfff3d6);
  const cB = new THREE.Color(0x8fe36a);
  const c = new THREE.Color();
  mesh.visible = false;
  return {
    mesh,
    step(dt: number) {
      if (!mesh.visible) return;
      ps.forEach((p, i) => {
        const [gx, gz] = gradient(slope, p.x, p.z);
        const m = Math.hypot(gx, gz);
        // 速度 ∝ 坡度（坡 0.03 ≈ 0.5 米/秒）
        p.x -= gx * 16 * dt;
        p.z -= gz * 16 * dt;
        p.age += dt;
        if (p.age > p.life || p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1 || !ok(p.x, p.z)) spawn(p);
        const k = p.age / p.life;
        // 生 → 死：淡入淡出（颜色往草绿里褪）
        const fade = Math.min(1, k * 4, (1 - k) * 3);
        c.copy(cB).lerp(cA, fade * THREE.MathUtils.clamp(m * 30, 0.3, 1));
        mesh.setColorAt(i, c);
        q.setFromAxisAngle(up, Math.atan2(gz, -gx));
        pos.set(p.x, GREEN_Y + 0.014, p.z);
        m4.compose(pos, q, one);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    show(on: boolean) {
      mesh.visible = on;
    },
  };
}
