// 风和沙：阵风（uWind/uGust）、贴地吹过的一纹素奶油色沙线、风滚草、风把沙吹回球场（court.userData.sand.deposit）、尘团（puff）、吹叶机的沙流（spray）。
// 演出随机只用种子随机流；画面不决定任何数值（这里也没有数值）。
import * as THREE from 'three';
import type { SandGrid } from './assets/court';
import { COURT, H } from './layout';
import type { AssetCtx } from './world';

export interface Fx {
  /** 一团尘土：pos 地面点，size 米（0.15 小 ～ 0.4 大），n 团数 */
  puff(pos: THREE.Vector3, size?: number, n?: number): void;
  /** 吹叶机喷出的沙流：从 pos 沿 dir（世界）喷，dt = 这一帧的秒数（按时间匀速出粒子） */
  spray(pos: THREE.Vector3, dir: THREE.Vector3, dt: number): void;
  update(dt: number, t: number): void;
  /** 当前阵风 0..1 */
  gust(): number;
}

/**
 * 云影（手摆：构图级的大形状不用 fbm，池塘第二轮的教训）。每团云是两个椭圆的并集 (x, z, rx, rz)，米，t = 0 时的位置；
 * toon.ts 用低频噪声把边扰成云的样子，硬边 + 最多一纹素的棋盘抖动，云里亮档整档换中档（纹理照画）。
 * 云顺着风沿 +x 慢慢飘（CLOUD_VEL 米/秒），飘到 x ±48 绕回来（CLOUD_W）。只走两条带：
 * 北台（z −23.5…−17.5）和低地（z 18…25.5）—— 永远碰不到球场（铺面 z ±14.2），主角一直是干净的
 * （噪声最多把椭圆撑大 1.5 倍，rz 按这个留了余量）。
 * 每条带两团，错开半圈：画面里通常同时有一两团。
 */
export const CLOUDS: [number, number, number, number][] = [
  // 低地（台阶脚下往东，盖住步道的开头：竖屏右下、横屏下沿中间）
  [6.5, 21.8, 4.8, 2.4],
  [10.2, 22.5, 3.0, 1.9],
  // 低地，半圈以外
  [-41, 21.2, 4.2, 2.2],
  [-37.8, 21.9, 2.6, 1.7],
  // 北台西（蒲葵林脚下：竖屏左上、横屏上沿）
  [-6.5, -20.6, 4.4, 2.0],
  [-2.8, -20.2, 2.6, 1.6],
  // 北台，半圈以外
  [40, -20.4, 3.8, 1.9],
  [43, -20.8, 2.6, 1.6],
];
export const CLOUD_VEL = 0.12;

/** 沙线能出现的平地（矩形 + 高度）：只在大块平地上，不跨台地边 */
const LANES: { x0: number; x1: number; z0: number; z1: number; y: number }[] = [
  { x0: -8, x1: 10.5, z0: -15.5, z1: 15, y: H.court },
  { x0: -24, x1: 24, z0: 17.5, z1: 25, y: H.low },
  { x0: -20, x1: 22, z0: -26, z1: -18.5, y: H.north },
  { x0: -26, x1: -10, z0: -13, z1: 6, y: H.west },
  { x0: 16, x1: 25, z0: -11, z1: 7, y: H.west },
];

export function createFx(
  ctx: AssetCtx,
  scene: THREE.Scene,
  court: THREE.Object3D | undefined,
  tumble: THREE.Object3D | undefined,
): Fx {
  const rnd = ctx.rng('fx');
  const u = ctx.uniforms;
  const baseWind = u.uWind.value.clone();
  const windDir = baseWind.clone().normalize();
  const windStrength = baseWind.length();
  const sand = court?.userData.sand as SandGrid | undefined;

  // ── 阵风：每 6～12 秒一阵，1 秒起、2 秒停、3 秒落 ─────────────
  let gust = 0.3;
  let nextGust = 3;
  let gustT = -1;
  const gustShape = (t: number) => (t < 1 ? t : t < 3 ? 1 : t < 6 ? 1 - (t - 3) / 3 : 0);

  // ── 尘团：实例化的小团块（不描边、不投影） ─────────────
  const PUFFS = 48;
  const puffGeo = new THREE.IcosahedronGeometry(1, 0);
  const puffMat = ctx.mat('path', { noShadowReceive: true, lightUp: 0.6, bands: [-0.4, 0.3], sphereNormals: true });
  const puffMesh = new THREE.InstancedMesh(puffGeo, puffMat, PUFFS);
  puffMesh.layers.set(ctx.layers.FX);
  puffMesh.castShadow = false;
  puffMesh.frustumCulled = false;
  const puffs = Array.from({ length: PUFFS }, () => ({
    life: 0,
    max: 1,
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    s: 0.2,
  }));
  let puffNext = 0;
  scene.add(puffMesh);

  // ── 吹叶机的沙流：1.5 纹素的小方块，比沙亮（钙质土色），一锥喷出去、贴地滑、很快没 ─────
  const SPRAY = 90;
  const sprayGeo = new THREE.BoxGeometry(ctx.texel * 1.5, ctx.texel * 1.5, ctx.texel * 1.5);
  const sprayMat = ctx.mat('path', { noShadowReceive: true, bands: [-2, -1] });
  const sprayMesh = new THREE.InstancedMesh(sprayGeo, sprayMat, SPRAY);
  sprayMesh.layers.set(ctx.layers.FX);
  sprayMesh.castShadow = false;
  sprayMesh.frustumCulled = false;
  const specks = Array.from({ length: SPRAY }, () => ({
    life: 1,
    max: 1,
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    s: 1,
  }));
  let sprayNext = 0;
  let sprayAcc = 0;
  scene.add(sprayMesh);

  // ── 沙线：一纹素高、6～14 纹素长的奶油色细条，顺风贴地飞 ─────
  const STREAKS = 28;
  const streakGeo = new THREE.BoxGeometry(1, 0.02, ctx.texel * 0.9);
  const streakMat = ctx.mat('line', { noShadowReceive: true, bands: [-2, -1] });
  const streakMesh = new THREE.InstancedMesh(streakGeo, streakMat, STREAKS);
  streakMesh.layers.set(ctx.layers.FX);
  streakMesh.castShadow = false;
  streakMesh.frustumCulled = false;
  const streaks = Array.from({ length: STREAKS }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), len: 1 }));
  scene.add(streakMesh);
  const yawWind = Math.atan2(-windDir.y, windDir.x);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  const puff = (pos: THREE.Vector3, size = 0.22, n = 3) => {
    for (let k = 0; k < n; k++) {
      const P = puffs[puffNext];
      puffNext = (puffNext + 1) % PUFFS;
      P.life = 0;
      P.max = 0.5 + rnd() * 0.5;
      P.s = size * (0.6 + rnd() * 0.6);
      P.p.copy(pos).add(new THREE.Vector3((rnd() - 0.5) * size, 0.05, (rnd() - 0.5) * size));
      P.v.set(windDir.x * 0.6 + (rnd() - 0.5) * 0.6, 0.35 + rnd() * 0.3, windDir.y * 0.6 + (rnd() - 0.5) * 0.6);
    }
  };

  // ── 风滚草：从西台上滚下来，横穿球场台地北半，到东沿掉下去 ──
  type TW = { x: number; y: number; z: number; vy: number; wait: number; active: boolean };
  const tw: TW = { x: 0, y: 0, z: 0, vy: 0, wait: 2, active: false };
  if (tumble) tumble.visible = false;
  const twGround = (x: number, z: number) => {
    if (x < -8.4) return H.west;
    if (x < 11.4) return Math.abs(x) <= COURT.padHw && Math.abs(z) <= COURT.padHl ? 0.04 : H.court;
    return H.low;
  };

  // ── 风把沙吹回来 ─────────────
  let depAcc = 0;

  const spray = (pos: THREE.Vector3, dir: THREE.Vector3, dt: number) => {
    sprayAcc += dt * 70;
    const d = dir.clone().normalize();
    const side = new THREE.Vector3(-d.z, 0, d.x).normalize();
    while (sprayAcc >= 1) {
      sprayAcc -= 1;
      const P = specks[sprayNext];
      sprayNext = (sprayNext + 1) % SPRAY;
      P.life = 0;
      P.max = 0.3 + rnd() * 0.4;
      P.s = 0.7 + rnd() * 0.6;
      P.p.copy(pos).addScaledVector(side, (rnd() - 0.5) * 0.15);
      const sp = 5 + rnd() * 3;
      P.v
        .copy(d)
        .multiplyScalar(sp)
        .addScaledVector(side, (rnd() - 0.5) * sp * 0.6);
      P.v.y = Math.max(P.v.y, 0) * 0.3 + 0.4 + rnd() * 1.2;
    }
  };

  return {
    puff,
    spray,
    gust: () => gust,
    update(dt, t) {
      // 阵风
      nextGust -= dt;
      if (nextGust <= 0) {
        gustT = 0;
        nextGust = 6 + rnd() * 6;
      }
      let g = 0.3 + 0.08 * Math.sin(t * 0.9) * Math.sin(t * 0.37);
      if (gustT >= 0) {
        gustT += dt;
        g += 0.7 * gustShape(gustT);
        if (gustT > 6) gustT = -1;
      }
      gust = THREE.MathUtils.clamp(g, 0, 1);
      u.uGust.value = gust;
      const wob = Math.sin(t * 0.21) * 0.12;
      u.uWind.value
        .set(
          windDir.x * Math.cos(wob) - windDir.y * Math.sin(wob),
          windDir.x * Math.sin(wob) + windDir.y * Math.cos(wob),
        )
        .multiplyScalar(windStrength * (0.7 + 0.6 * gust));

      // 尘团
      for (let i = 0; i < PUFFS; i++) {
        const P = puffs[i];
        if (P.life >= P.max) {
          puffMesh.setMatrixAt(i, zero);
          continue;
        }
        P.life += dt;
        P.p.addScaledVector(P.v, dt);
        P.v.multiplyScalar(1 - dt * 1.5);
        const k = P.life / P.max;
        const s = P.s * Math.sin(Math.min(1, k * 1.3) * Math.PI) * (k < 1 ? 1 : 0);
        m4.compose(P.p, q.identity(), sc.set(s, s * 0.8, s));
        puffMesh.setMatrixAt(i, m4);
      }
      puffMesh.instanceMatrix.needsUpdate = true;

      // 吹叶机的沙流
      for (let i = 0; i < SPRAY; i++) {
        const P = specks[i];
        if (P.life >= P.max) {
          sprayMesh.setMatrixAt(i, zero);
          continue;
        }
        P.life += dt;
        P.v.y -= 4 * dt;
        P.p.addScaledVector(P.v, dt);
        if (P.p.y < 0.07) {
          P.p.y = 0.07;
          P.v.y = Math.abs(P.v.y) * 0.3;
        }
        P.v.multiplyScalar(1 - dt * 2.5);
        const k = P.life / P.max;
        const s = P.s * (k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25);
        m4.compose(P.p, q.identity(), sc.set(s, s, s));
        sprayMesh.setMatrixAt(i, m4);
      }
      sprayMesh.instanceMatrix.needsUpdate = true;

      // 沙线：活着的数量跟阵风走
      const want = Math.round(3 + gust * 14);
      let alive = 0;
      for (const S of streaks) if (S.life < S.max) alive++;
      for (let i = 0; i < STREAKS; i++) {
        const S = streaks[i];
        if (S.life >= S.max && alive < want && rnd() < dt * 6) {
          const L = LANES[Math.floor(rnd() * LANES.length)];
          S.p.set(L.x0 + rnd() * (L.x1 - L.x0), L.y + 0.06, L.z0 + rnd() * (L.z1 - L.z0));
          if (L.y === H.court && Math.abs(S.p.x) <= COURT.padHw && Math.abs(S.p.z) <= COURT.padHl) S.p.y += 0.04;
          S.life = 0;
          S.max = 0.8 + rnd() * 1.2;
          S.len = (6 + rnd() * 8) * ctx.texel;
          alive++;
        }
        if (S.life >= S.max) {
          streakMesh.setMatrixAt(i, zero);
          continue;
        }
        S.life += dt;
        const sp = 5 + 4 * gust;
        S.p.x += windDir.x * sp * dt;
        S.p.z += windDir.y * sp * dt;
        const k = S.life / S.max;
        const len = S.len * Math.sin(Math.min(1, k) * Math.PI);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawWind);
        m4.compose(S.p, q, sc.set(Math.max(0.001, len), 1, 1));
        streakMesh.setMatrixAt(i, m4);
      }
      streakMesh.instanceMatrix.needsUpdate = true;

      // 风滚草
      if (tumble) {
        if (!tw.active) {
          tw.wait -= dt;
          if (tw.wait <= 0) {
            tw.active = true;
            tw.x = -11;
            tw.z = -12 + rnd() * 6;
            tw.y = H.west;
            tw.vy = 0;
            tumble.visible = true;
          }
        } else {
          const sp = 1.2 + 2.6 * gust;
          const vx = sp;
          const vz = sp * 0.12 * Math.sin(t * 0.7);
          tw.x += vx * dt;
          tw.z += vz * dt;
          const gy = twGround(tw.x, tw.z);
          // 下落 + 落地小跳
          tw.vy -= 9.8 * dt;
          tw.y += tw.vy * dt;
          if (tw.y <= gy) {
            const hard = tw.vy < -2.5;
            tw.y = gy;
            tw.vy = 0.6 + 1.2 * gust * rnd();
            if (hard) puff(new THREE.Vector3(tw.x, gy, tw.z), 0.3, 3);
          }
          tumble.position.set(tw.x, tw.y, tw.z);
          tumble.userData.roll?.(dt, { x: vx, z: vz });
          if (tw.x > 15 || tw.y < H.low - 0.5) {
            tw.active = false;
            tw.wait = 6 + rnd() * 8;
            tumble.visible = false;
          }
        }
      }

      // 风把沙堆回原来的沙丘上（越大风越快）
      if (sand) {
        depAcc += dt;
        if (depAcc > 1) {
          depAcc = 0;
          const h = sand.homes[Math.floor(rnd() * sand.homes.length)];
          const r = 0.7 + rnd() * 0.5;
          sand.deposit(h.x + (rnd() - 0.5) * 1.6, h.z + (rnd() - 0.5) * 1.0, r, 0.002 + 0.005 * gust);
          if (gust > 0.7 && rnd() < 0.3) puff(new THREE.Vector3(h.x, 0.05, h.z), 0.2, 1);
        }
      }
    },
  };
}
