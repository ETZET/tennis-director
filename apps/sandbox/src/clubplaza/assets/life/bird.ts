// 大尾拟八哥（great-tailed grackle）：棕榈泉喷泉边最常见的鸟。黑身子 + 蓝紫金属光泽（只有朝天的亮档露出来）、黄眼睛、
// **和身子一样长的龙骨形上翘尾巴**——剪影就靠这条尾巴读成鸟（不然就是一颗黑豆）。
// 便宜：每只鸟只有两个网格（光泽身子一个、眼睛一个），姿势是预先烘好的几帧几何体（全模块共享），换姿势 = 换 geometry。
// 帧是离散的（像素画本来就是一帧一帧的，中间帧的转动会让像素爬）。
// 本地原点 = 两脚中间的落脚点（y 0），头朝 +z（rotY 0 = 面朝镜头；侧身朝 ±x 时尾巴的剪影最清楚）。
import * as THREE from 'three';
import type { AssetCtx } from '../../ctx';
import { merge, roundNormals, v3 } from './kit';

/** 姿势名（userData.pose 的第一个参数） */
export type BirdPose = 'stand' | 'drink' | 'hop' | 'fly';
export const BIRD_POSES: BirdPose[] = ['stand', 'drink', 'hop', 'fly'];

/** 一帧的参数：身子绕髋点低头（+ = 头往下、尾巴往上），脖子再低头，翅膀张开的角度（null = 收着），腿 */
interface Frame {
  body: number;
  head: number;
  wing: number | null;
  legs: boolean;
}

/** 光泽身子（局部新色）：亮档蓝紫金属光、中档深靛、暗档近黑的靛。借 ironwork（club 组）过配色 —— 午后的全局调色会把暗档往玫瑰褐拉 */
export const GLOSS: [number, number, number] = [0x403ea4, 0x23214c, 0x121024];

// ── 几何（米）。鸟全长 ≈ 0.47（喙尖 +0.19 → 尾尖 −0.28），站高 ≈ 0.27 ──────────
const HIP = v3(0, 0.085, 0);
const NECK = v3(0, 0.175, 0.06);

/** 三角形朝外：每个三角形的法线指向远离 c 的那边（手拼的小体块不用操心绕序） */
function solid(tri: THREE.Vector3[][], c: THREE.Vector3): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const m = new THREE.Vector3();
  for (const t of tri) {
    let [a, b, d] = t;
    e1.subVectors(b, a);
    e2.subVectors(d, a);
    n.crossVectors(e1, e2).normalize();
    m.copy(a)
      .add(b)
      .add(d)
      .multiplyScalar(1 / 3)
      .sub(c);
    if (n.dot(m) < 0) {
      [b, d] = [d, b];
      n.negate();
    }
    for (const p of [a, b, d]) pos.push(p.x, p.y, p.z);
    for (let k = 0; k < 3; k++) nor.push(n.x, n.y, n.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** 龙骨形的尾巴：根部窄浅，尾梢宽、往下深（侧面看是一把越来越宽的长扇，往上翘） */
function tail(): THREE.BufferGeometry {
  const r = v3(0, 0.155, -0.07);
  const t = v3(0, 0.3, -0.27);
  const sec = (c: THREE.Vector3, hw: number, up: number, kd: number) => [
    c.clone().add(v3(-hw, up, 0)),
    c.clone().add(v3(hw, up, 0)),
    c.clone().add(v3(0, -kd, 0)),
  ];
  const [l0, r0, k0] = sec(r, 0.026, 0.018, 0.026);
  const [l1, r1, k1] = sec(t, 0.056, 0.012, 0.115);
  const tri = [
    [l0, k0, k1],
    [l0, k1, l1],
    [r0, r1, k1],
    [r0, k1, k0],
    [l0, l1, r1],
    [l0, r1, r0],
    [l1, k1, r1],
  ];
  return solid(
    tri,
    r
      .clone()
      .lerp(t, 0.5)
      .add(v3(0, -0.02, 0)),
  );
}

/** 一只翅膀（右 = +x）：薄的楔形板，根在肩上沿身子方向；张开角 a 绕身子轴（z）转，+ = 往上 */
function wing(side: 1 | -1, a: number): THREE.BufferGeometry {
  const sh = v3(side * 0.04, 0.16, 0.02);
  // 翅膀平面里的点（x 往外、z 前后），厚 0.02
  const outline: [number, number][] = [
    [0, 0.075],
    [0.16, 0.06],
    [0.31, -0.02],
    [0.24, -0.09],
    [0.0, -0.075],
  ];
  const top: THREE.Vector3[] = [];
  const bot: THREE.Vector3[] = [];
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  for (const [ox, oz] of outline) {
    const x = ox * ca;
    const y = ox * sa;
    top.push(v3(sh.x + side * x, sh.y + y + 0.01, sh.z + oz));
    bot.push(v3(sh.x + side * x, sh.y + y - 0.01, sh.z + oz));
  }
  const tTop: THREE.Vector3[][] = [];
  const tBot: THREE.Vector3[][] = [];
  const tRim: THREE.Vector3[][] = [];
  for (let i = 1; i < outline.length - 1; i++) {
    tTop.push([top[0], top[i], top[i + 1]]);
    tBot.push([bot[0], bot[i], bot[i + 1]]);
  }
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    tRim.push([top[i], bot[i], bot[j]], [top[i], bot[j], top[j]]);
  }
  // 法线：上表面朝"翅膀的上方"，下表面朝下（参考点放在翅膀中线的下面 / 上面）
  const up = v3(-side * sa, ca, 0);
  const mid = sh.clone().add(v3(side * 0.15 * ca, 0.15 * sa, -0.01));
  const gTop = solid(tTop, mid.clone().addScaledVector(up, -0.05));
  const gBot = solid(tBot, mid.clone().addScaledVector(up, 0.05));
  const gRim = solid(tRim, mid);
  return merge([gTop, gBot, gRim]);
}

/** 绕 pivot 点、x 轴转 a 的矩阵 */
function pitchAt(pivot: THREE.Vector3, a: number): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(new THREE.Matrix4().makeRotationX(a))
    .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}

/** 烘一帧：返回 [光泽身子, 眼睛] 两个几何体 */
function bakeFrame(f: Frame): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const mBody = pitchAt(HIP, f.body);
  const mHead = mBody.clone().multiply(pitchAt(NECK, f.head));
  // 身子：一个蛋（胸口往前鼓、背上平），法线从蛋心往外
  const torsoC = v3(0, 0.135, 0.005);
  const torso = roundNormals(
    new THREE.SphereGeometry(1, 6, 4).scale(0.066, 0.066, 0.115).translate(torsoC.x, torsoC.y, torsoC.z),
    torsoC,
  );
  const body = [torso, tail()];
  if (f.wing !== null) body.push(wing(1, f.wing), wing(-1, f.wing));
  for (const g of body) g.applyMatrix4(mBody);
  // 头 + 喙（喙：尖锥，略往下勾）
  const headC = v3(0, 0.212, 0.09);
  const head = roundNormals(new THREE.SphereGeometry(0.054, 6, 4).translate(headC.x, headC.y, headC.z), headC);
  const beak = new THREE.ConeGeometry(0.019, 0.07, 4).rotateX(Math.PI / 2 + 0.12).translate(0, 0.203, 0.165);
  for (const g of [head, beak]) g.applyMatrix4(mHead);
  const parts = [...body, head, beak];
  // 腿 + 脚（不跟着身子低头）
  if (f.legs) {
    for (const s of [-1, 1]) {
      parts.push(new THREE.BoxGeometry(0.03, 0.095, 0.03).translate(s * 0.027, 0.0475, 0.0));
      parts.push(new THREE.BoxGeometry(0.035, 0.018, 0.075).translate(s * 0.027, 0.009, 0.02));
    }
  }
  // 眼睛：一根横穿头的小棍，两侧各露一点（侧面看是一纹素的黄点）
  const eye = new THREE.BoxGeometry(0.106, 0.026, 0.026).translate(0, 0.222, 0.108).applyMatrix4(mHead);
  return [merge(parts), merge([eye])];
}

/** 每个姿势的帧（模块里只烘一次，所有鸟共用） */
const FRAMES: Record<BirdPose, Frame[]> = {
  // 站着：头微抬；第二帧甩一下尾巴（身子往前一点点 = 尾巴往上翘）
  stand: [
    { body: -0.14, head: -0.12, wing: null, legs: true },
    { body: 0.06, head: -0.3, wing: null, legs: true },
  ],
  // 在池沿低头喝水：前倾 → 脖子往下 → 喙到池沿下面（尾巴跟着翘高，侧面看是一个 V）
  drink: [
    { body: 0.3, head: 0.1, wing: null, legs: true },
    { body: 0.48, head: 0.5, wing: null, legs: true },
    { body: 0.6, head: 0.95, wing: null, legs: true },
  ],
  // 跳：落地蹲一下 / 腾空（腾空的高度由 position.y 给）
  hop: [
    { body: 0.12, head: -0.05, wing: null, legs: true },
    { body: -0.2, head: -0.1, wing: 0.25, legs: false },
  ],
  // 飞：翅膀 上 / 平 / 下 三帧，腿收起
  fly: [
    { body: -0.06, head: -0.05, wing: 1.05, legs: false },
    { body: -0.06, head: -0.05, wing: 0.12, legs: false },
    { body: -0.06, head: -0.05, wing: -0.65, legs: false },
  ],
};

let baked: Record<BirdPose, [THREE.BufferGeometry, THREE.BufferGeometry][]> | null = null;
function frames() {
  if (!baked) {
    const b = {} as Record<BirdPose, [THREE.BufferGeometry, THREE.BufferGeometry][]>;
    for (const k of BIRD_POSES) b[k] = FRAMES[k].map(bakeFrame);
    baked = b;
  }
  return baked;
}

export interface BirdOpts {
  /** 起始姿势（默认 stand，自动播） */
  pose?: BirdPose;
  /** 自动播放的时间偏移（秒；几只鸟别同步） */
  offset?: number;
}

/**
 * 一只鸟。userData：
 * - `pose(name, phase?)`：name ∈ stand / drink / hop / fly；给 phase（0..1）= 定在那一帧，不给 = 自动播放（update 里循环）。
 *   stand 自动：偶尔甩尾；drink 自动：2.4 秒一轮（0.6 秒低头喝一口、抬头、东张西望）；hop：0.45 秒一跳（高 0.07 米）；fly：每 0.1 秒换一帧。
 * - `poses`：姿势名列表；`state()`：{ pose, phase, auto }
 * - `update(dt, t)`：自动播放（场景收集 userData.update 每帧调用）
 * 飞的路线（落到蒲葵上、飞回池沿）由 stage 3 移动整个对象；这里只管翅膀。
 */
export function makeBird(ctx: AssetCtx, o: BirdOpts = {}): THREE.Object3D {
  const F = frames();
  const gloss = ctx.mat('ironwork', { ramp: GLOSS, edge: 0.6, convex: 0.3, lightUp: 0.15, bands: [0.12, 0.55] });
  const eyeM = ctx.mat('ball', { edge: 0, convex: 0, lightUp: 0.6, noShadowReceive: true });
  const root = new THREE.Group();
  root.name = 'grackle';
  const body = new THREE.Mesh(F.stand[0][0], gloss);
  const eye = new THREE.Mesh(F.stand[0][1], eyeM);
  body.name = 'grackle-body';
  eye.name = 'grackle-eye';
  root.add(body, eye);
  ctx.mats.prepare(root);
  // 小东西不接投影（站在池沿上的黑鸟进了柱子的影子会整只消失）
  body.receiveShadow = false;
  eye.receiveShadow = false;
  eye.castShadow = false;

  const st = { pose: o.pose ?? ('stand' as BirdPose), phase: 0, auto: true };
  const off = o.offset ?? 0;
  const show = (p: BirdPose, ph: number) => {
    const fr = F[p];
    let i = Math.min(fr.length - 1, Math.floor((((ph % 1) + 1) % 1) * fr.length));
    let lift = 0;
    if (p === 'hop') {
      // 前 30% 蹲着，后 70% 腾空（抛物线）
      const q = ((ph % 1) + 1) % 1;
      i = q < 0.3 ? 0 : 1;
      lift = q < 0.3 ? 0 : 0.07 * Math.sin(((q - 0.3) / 0.7) * Math.PI);
    }
    body.geometry = fr[i][0];
    eye.geometry = fr[i][1];
    body.position.y = lift;
    eye.position.y = lift;
  };
  const pose = (name: string, phase?: number) => {
    const p = (BIRD_POSES as string[]).includes(name) ? (name as BirdPose) : 'stand';
    st.pose = p;
    st.auto = phase === undefined;
    st.phase = phase ?? 0;
    show(p, st.phase);
  };
  const update = (_dt: number, t: number) => {
    if (!st.auto) return;
    const tt = t + off;
    let ph = 0;
    switch (st.pose) {
      case 'stand': {
        // 3.2 秒里甩一次尾（0.25 秒）
        const q = (tt % 3.2) / 3.2;
        ph = q > 0.92 ? 0.75 : 0;
        break;
      }
      case 'drink': {
        // 2.4 秒一轮：0～0.3 低头（帧 0→1→2），0.3～0.55 抬头（2→1→0），之后站着看（帧 0）
        const q = (tt % 2.4) / 2.4;
        const k = q < 0.3 ? q / 0.3 : q < 0.55 ? 1 - (q - 0.3) / 0.25 : 0;
        ph = Math.min(0.99, k);
        break;
      }
      case 'hop':
        ph = (tt / 0.45) % 1;
        break;
      case 'fly': {
        // 上、平、下、平……每 0.1 秒一帧
        const seq = [0.1, 0.5, 0.9, 0.5];
        ph = seq[Math.floor(tt * 10) % 4];
        break;
      }
    }
    st.phase = ph;
    show(st.pose, ph);
  };
  pose(st.pose);
  root.userData.pose = pose;
  root.userData.poses = BIRD_POSES;
  root.userData.state = () => ({ ...st });
  root.userData.update = update;
  return root;
}
