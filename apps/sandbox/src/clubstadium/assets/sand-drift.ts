// #8 sand-drift：风从西头敞口灌进来、在场边积下的沙。一个贴地的扁沙包（极坐标格子：24 段 × 5 圈），
// 迎风（西）坡缓、背风（东）坡陡，背风脚收得干净；上面是风纹（ripples，1 纹素）。
// 颜色用 sandHigh（钙质土色：比场边绿亮、比墙外的沙亮一点 —— lessons「尘土要比沙亮」）。
// v0 = 西南（南看台脚下）：长条 + 往东拖一条尾巴；v1 / v2 = 西北 / 东北两个角：靠着看台广告板的楔形（北边厚、往南摊开）。
// 本地原点 = 沙堆中心的地面；+x 东、+z 南（朝镜头）。规格 3.0 × 0.14 × 1.0。
//
// userData（stage 3：吹叶机吹沙、阵风积回来）：
//   amount             当前沙量 0..1（只读；用 setAmount 改）
//   setAmount(a)       直接设（0 = 吹干净：网格藏起来）。沙量变小时脚印跟着缩（∝ √a），厚度 ∝ a^0.7
//   blow(dt, k = 1)    吹叶机对着吹：amount −= dt × 0.35 × k（k = 离出风口的远近，1 = 正对着、贴近）
//   regrow             阵风把沙积回来的速度（每秒，阵风 uGust = 1 时）；默认 0.004（远小于吹的 0.35）；0 = 不长
//   update(dt)         按 uGust 慢慢积回来（场景的 collectUpdaters 已经在调）
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';

const SEGS = 24;
const RINGS = 5;
/** 沙堆底面离地（盖过场边漆面 0.018 和白线 0.03） */
const Y0 = 0.034;
/** 算法线时高度夸大几倍 */
const NK = 3;

interface Shape {
  /** 半长（x）、半宽（z）、最高（米） */
  rx: number;
  rz: number;
  h: number;
  /** 最高点往哪边偏（-1..1，x / z）：背风那边 */
  cx: number;
  cz: number;
  /** 尾巴：往 +x 拖（v0）的长度（米），0 = 没有 */
  tail: number;
  /** 楔形：北边（−z）有一堵墙，沙靠墙堆（v1 / v2） */
  wedge: boolean;
}

const SHAPES: Shape[] = [
  { rx: 1.5, rz: 0.5, h: 0.14, cx: 0.35, cz: 0.1, tail: 0.9, wedge: false },
  { rx: 1.35, rz: 0.6, h: 0.16, cx: 0.15, cz: -0.55, tail: 0, wedge: true },
  { rx: 1.25, rz: 0.55, h: 0.15, cx: -0.15, cz: -0.55, tail: 0, wedge: true },
];

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'sand-drift';
  const v = ((ctx.variant % 3) + 3) % 3;
  const sh = SHAPES[v];
  const rnd = ctx.rng(`sand-drift:${v}`);
  // 每个角度的半径抖一点（轮廓不是一个完美椭圆），三段谐波，按变体固定
  const wob = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const radius = (a: number) => {
    let r = 1 + 0.08 * Math.sin(2 * a + wob[0]) + 0.06 * Math.sin(3 * a + wob[1]) + 0.04 * Math.sin(5 * a + wob[2]);
    // 尾巴：朝 +x（a ≈ 0）那边伸出去一条
    if (sh.tail > 0) r += (sh.tail / sh.rx) * Math.max(0, Math.cos(a)) ** 6;
    return r;
  };
  const mat = ctx.mat('sandHigh', {
    edge: 0.12,
    convex: 0,
    elem: { kind: 'ripples', size: [9, 3], density: [0.25, 0.55], patch: 1.2, mottle: 0.25, seed: 11 + v },
  });

  // ── 极坐标格子：中心一个点 + RINGS 圈 × SEGS 段 ──
  const n = 1 + RINGS * SEGS;
  const pos = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const idx: number[] = [];
  for (let s = 0; s < SEGS; s++) idx.push(0, 1 + ((s + 1) % SEGS), 1 + s);
  for (let r = 0; r < RINGS - 1; r++)
    for (let s = 0; s < SEGS; s++) {
      const a = 1 + r * SEGS + s;
      const b = 1 + r * SEGS + ((s + 1) % SEGS);
      const c = 1 + (r + 1) * SEGS + s;
      const d = 1 + (r + 1) * SEGS + ((s + 1) % SEGS);
      idx.push(a, b, c, b, d, c);
    }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sand-drift';
  root.add(mesh);

  /** 高度剖面：t = 离中心的归一化距离 0..1；迎风（西）缓、背风（东）陡 */
  const height = (x: number, z: number, t: number) => {
    // 最高点偏向背风：用偏心后的距离
    const dx = x / sh.rx - sh.cx;
    const dz = z / sh.rz - sh.cz;
    let d = Math.sqrt(dx * dx + dz * dz) / (1 + Math.abs(sh.cx) + Math.abs(sh.cz) * 0.6);
    if (sh.wedge) d = Math.max(d, 0) * 0.8 + Math.max(0, z / sh.rz + 1) * 0.25;
    const k = Math.max(0, 1 - Math.min(1, d));
    const lee = x / sh.rx - sh.cx > 0 ? 1.6 : 1.0; // 背风坡陡
    return Math.max(0, 1 - t ** 2.2) * k ** (0.9 * lee);
  };
  let amount = -1;
  const setAmount = (a: number) => {
    a = Math.min(1, Math.max(0, a));
    if (Math.abs(a - amount) < 1e-4) return;
    amount = a;
    root.userData.amount = a;
    mesh.visible = a > 0.02;
    if (!mesh.visible) return;
    const foot = 0.35 + 0.65 * Math.sqrt(a);
    const H = sh.h * a ** 0.7;
    pos.set([sh.cx * sh.rx * 0.3 * foot, Y0 + H * height(sh.cx * sh.rx * 0.3, 0, 0), 0], 0);
    for (let r = 0; r < RINGS; r++) {
      const t = (r + 1) / RINGS;
      for (let s = 0; s < SEGS; s++) {
        const ang = (s / SEGS) * Math.PI * 2;
        const rr = radius(ang) * t;
        const x = Math.cos(ang) * rr * sh.rx;
        const z = Math.sin(ang) * rr * sh.rz;
        const y = r === RINGS - 1 ? Y0 : Y0 + H * height(x, z, t);
        const i = 1 + r * SEGS + s;
        pos.set([x * foot, y, z * foot], i * 3);
      }
    }
    // 法线按夸大 NK 倍的高度算（0.14 米高的沙包，真实法线几乎全朝上 = 一块平涂）：
    // 朝北（背着镜头、朝太阳）的坡落亮档，朝南的坡和背风脚落中档 —— 读得出"一个包"，还是一块安静的颜色
    for (let i = 0; i < n; i++) pos[i * 3 + 1] = Y0 + (pos[i * 3 + 1] - Y0) * NK;
    geo.computeVertexNormals();
    for (let i = 0; i < n; i++) pos[i * 3 + 1] = Y0 + (pos[i * 3 + 1] - Y0) / NK;
    geo.getAttribute('position').needsUpdate = true;
    geo.computeBoundingSphere();
  };
  setAmount(Number(ctx.params.get('amount') ?? 1));

  root.userData.setAmount = setAmount;
  root.userData.blow = (dt: number, k = 1) => setAmount(amount - dt * 0.35 * k);
  root.userData.regrow = 0.004;
  root.userData.update = (dt: number) => {
    const g = Math.max(0, ctx.uniforms.uGust.value - 0.5) * 2;
    const rate = root.userData.regrow as number;
    if (rate > 0 && amount < 1 && g > 0) setAmount(amount + dt * rate * g);
  };

  ctx.mats.prepare(root, { cast: false });
  return root;
}
