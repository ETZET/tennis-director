// 车（car / suv 共用）：Q 版胖车，一个材质一个合并好的网格 —— 车漆、玻璃（含反光条）、灯和黑件、前轴、后轴，一辆车 5 个 draw call。
//
// 明暗（太阳在画面后方偏东、仰角 44°；车漆的 CAR 参数 lightUp 0.3）：
// - 顶面（车顶、引擎盖、行李箱盖、腰线上的一条窄台）= 亮档，这就是这辆车在画面里的色块；
// - 侧板、车头车尾的立面 = 暗档；它们和顶面之间一圈 45° 倒角 = 中档 → 车顶、引擎盖边上一条干净的亮/中分界（不加噪声）；
// - 玻璃（glass）：朝北/朝上的那块（朝北的车 = 前挡，朝西的车 = 后窗）亮档天蓝，朝镜头的侧窗、后窗是暗档靛蓝；
//   每块窗一条斜的反光条（顶点色乘子，同一个材质），亮档近白、暗档浅一点的靛蓝；
// - 车灯 2 纹素高、包一点到侧面（车横着的时候侧面也看得到一个点），保险杠、行李架、备胎是深色的黑件。
//
// userData（stage 3 用）：
//   kind 'car' | 'suv'，paint 当前车漆名，wheelRadius；
//   setPaint(key | variant)   换车漆（只换材质，便宜）；
//   setDoor(open, side = 'both', instant = false)   前门开关（0.4 秒；side 'left' = 司机侧 = 本地 −x，'right' = +x）；
//   setBrake(on)              刹车灯；
//   setSpeed(米/秒)           轮子转（负数 = 倒车）；update(dt) 里推进轮子和车门；
//   setMotion(steer, ax, ay)  前轮转角（弧度，正 = 往左 = 本地 −x）、纵向 / 横向加速度（米/秒²，ay 正 = 朝本地 +x）：
//                             前轮两个转向节打方向；车身挂在弹簧上（1.3 Hz），刹车点头、起步抬头、转弯往外倾、停下回弹一下；
//   parts                     做 InstancedMesh 用的几何体和材质：paint / glass / trim 相对车的原点，axle 相对每根轴（at）。
//                             停着的车：每个零件一个 InstancedMesh（paint 按车漆分组，一种车漆一个），矩阵 = 车位矩阵（× 轴的平移）；
//                             材质是缓存共享的，别改材质本身（刹车灯改的是 trim 的顶点色，实例化以后用 instanceColor 或单独拿出来）。
import * as THREE from 'three';
import type { AssetCtx } from '../../ctx';
import { CAR_PAINTS } from '../../palette';
import { box, disc, frustum, merge, quad, type RGB, sideExtrude, type V3, WHITE, wheel } from './geo';
import type { VehicleSpec } from './specs';

export type CarPaint = (typeof CAR_PAINTS)[number];

// ── 顶点色乘子 ────────────────────────────────────
/** 车窗反光条：玻璃三档 × 这个（亮档 #9cc4e0 → 近白，暗档 #2c2c54 → #444276，差 < 60 不算强边缘） */
const GLINT: RGB = [1.8, 1.75, 1.55];
/** 灯和黑件共用一个材质（LAMP_RAMP 近白），靠乘子分颜色 */
const HEAD: RGB = [1, 0.98, 0.88];
const TAIL_OFF: RGB = [0.66, 0.24, 0.26];
const TAIL_ON: RGB = [1, 0.36, 0.3];
const TRIM: RGB = [0.3, 0.27, 0.36];
const RAIL: RGB = [0.38, 0.34, 0.44];
const OPENING: RGB = [0.2, 0.17, 0.26];
const SPARE_HUB: RGB = [0.8, 0.78, 0.86];
/** 轮胎：轮毂（carSilver 三档）× 这个 = 轮胎（和 tyre 那套颜色差不多：#5a5068 / #3a344e / #221e34） */
const TYRE: RGB = [0.4, 0.36, 0.44];

/**
 * 本地新颜色（调色板里没有，报告里列出来以后可以升进 palette）：灯和黑件的底色。
 * 走 'glass' 的名字只是为了吃 club 组的调色（暗档留冷色，不被染成玫瑰褐），ramp 整个换掉。
 */
const LAMP_RAMP: [number, number, number] = [0xfff4e0, 0xf0e0d0, 0xc8b8d0];

/** 车漆：variant 0…6 按 CAR_PAINTS 轮换；8 = 落客的车（前门开着） */
export function paintFor(variant: number): CarPaint {
  if (variant === 8) return 'carMint';
  return CAR_PAINTS[((variant % CAR_PAINTS.length) + CAR_PAINTS.length) % CAR_PAINTS.length];
}

type Side = 'left' | 'right' | 'both';

export function buildVehicle(ctx: AssetCtx, sp: VehicleSpec): THREE.Object3D {
  const root = new THREE.Group();
  root.name = sp.kind;
  // 画廊里看横着的车：?ry=90（只在画廊生效）
  const pivot = new THREE.Group();
  if (ctx.params.has('asset') && ctx.params.has('ry'))
    pivot.rotation.y = (Number(ctx.params.get('ry')) * Math.PI) / 180;
  root.add(pivot);

  const { cabin: cb, halfW: hw } = sp;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  // ── 车漆：下半车身（挤出 + 倒角）+ 柱子 + 车顶板 ─────────────
  const paintGeo: THREE.BufferGeometry[] = [sideExtrude(sp.profile, hw, sp.bevel)];
  const E = 0.014;
  for (const [z0, z1] of cb.pillars)
    paintGeo.push(frustum(cb.yb, [cb.hwb + E, z0, z1], cb.yt + 0.01, [cb.hwt + E, z0, z1]));
  paintGeo.push(frustum(sp.roof.y0, sp.roof.lo, sp.roof.y1, sp.roof.hi));

  // ── 玻璃：按柱子切成几段（每段一个凸包），每块窗一条反光条 ─────────────
  const glassGeo: THREE.BufferGeometry[] = [];
  const cuts = [-Infinity, ...cb.pillars.flat(), Infinity];
  const secs: [number, number][] = [];
  for (let i = 0; i < cuts.length; i += 2) secs.push([cuts[i], cuts[i + 1]]);
  for (const [a, b] of secs) {
    glassGeo.push(
      frustum(cb.yb, [cb.hwb, Math.max(a, cb.zb[0]), Math.min(b, cb.zb[1])], cb.yt, [
        cb.hwt,
        Math.max(a, cb.zt[0]),
        Math.min(b, cb.zt[1]),
      ]),
    );
  }
  const OFF = 0.006;
  /** 侧窗上的一条：下沿 z 从 za 到 za + w，往上走到顶时整条往前挪 k；夹在这一段窗里 */
  const sideGlint = (s: number, [a, b]: [number, number], za: number, w: number, k: number) => {
    const n = new THREE.Vector3(cb.yt - cb.yb, -(cb.hwt - cb.hwb), 0).normalize();
    const at = (t: number, z: number): V3 => {
      const zf = lerp(Math.max(a, cb.zb[0]), Math.max(a, cb.zt[0]), t);
      const zr = lerp(Math.min(b, cb.zb[1]), Math.min(b, cb.zt[1]), t);
      const zz = THREE.MathUtils.clamp(z, zf + 0.04, zr - 0.04);
      const x = lerp(cb.hwb, cb.hwt, t) + n.x * OFF;
      return [s * x, lerp(cb.yb, cb.yt, t) + n.y * OFF, zz];
    };
    const t0 = 0.12;
    const t1 = 0.9;
    const p = [at(t0, za - k * t0), at(t0, za + w - k * t0), at(t1, za + w - k * t1), at(t1, za - k * t1)];
    // 右边（+x）逆时针朝外；左边镜像后要反过来
    return s > 0 ? quad(p[1], p[0], p[3], p[2], GLINT) : quad(p[0], p[1], p[2], p[3], GLINT);
  };
  for (const s of [-1, 1])
    for (let i = 0; i < sp.glints.side.length && i < secs.length; i++) {
      const [za, w, k] = sp.glints.side[i];
      glassGeo.push(sideGlint(s, secs[i], za, w, k));
    }
  /** 后窗 / 前挡上的一条：x 从 xa 到 xa + w，往上斜 k */
  const endGlint = (back: boolean, xa: number, w: number, k: number) => {
    const zB = back ? cb.zb[1] : cb.zb[0];
    const zT = back ? cb.zt[1] : cb.zt[0];
    const dy = cb.yt - cb.yb;
    const dz = zT - zB;
    const n = new THREE.Vector3(0, back ? -dz : dz, back ? dy : -dy).normalize();
    const at = (t: number, x: number): V3 => {
      const h = lerp(cb.hwb, cb.hwt, t) - 0.08;
      return [THREE.MathUtils.clamp(x, -h, h), lerp(cb.yb, cb.yt, t) + n.y * OFF, lerp(zB, zT, t) + n.z * OFF];
    };
    const t0 = 0.15;
    const t1 = 0.88;
    const p = [at(t0, xa - k * t0), at(t0, xa + w - k * t0), at(t1, xa + w - k * t1), at(t1, xa - k * t1)];
    return back ? quad(p[0], p[1], p[2], p[3], GLINT) : quad(p[1], p[0], p[3], p[2], GLINT);
  };
  glassGeo.push(endGlint(true, ...sp.glints.rear), endGlint(false, ...sp.glints.front));

  // ── 灯和黑件（一个材质，顶点色分颜色）──────────────────────
  const trimGeo: THREE.BufferGeometry[] = [];
  const [by0, by1, bOut] = sp.bumper;
  const bw = hw - 0.03;
  trimGeo.push(box(-bw, bw, by0, by1, sp.nose - bOut, sp.nose + 0.3, TRIM));
  trimGeo.push(box(-bw, bw, by0, by1, sp.rear - 0.3, sp.rear + bOut, TRIM));
  // 两个轮拱之间的黑色门槛（横着的车侧板最下面一条深色，车压得住地）
  {
    const za = sp.wheel.z[0] + sp.wheel.r * 1.35;
    const zb = sp.wheel.z[1] - sp.wheel.r * 1.35;
    for (const s of [-1, 1]) {
      const [x0, x1] = s < 0 ? [-hw - 0.012, -hw + 0.1] : [hw - 0.1, hw + 0.012];
      trimGeo.push(box(x0, x1, by0, by0 + 0.13, za, zb, TRIM));
    }
  }
  const LD = 0.025; // 灯凸出车身多少
  const [hy0, hy1, hx, hwrap] = sp.head;
  for (const s of [-1, 1]) {
    const [x0, x1] = s < 0 ? [-hw - LD, -hx] : [hx, hw + LD];
    trimGeo.push(box(x0, x1, hy0, hy1, sp.nose - LD, sp.nose + hwrap, HEAD));
  }
  const tailStart = trimGeo.length;
  const [ty0, ty1, tx, twrap] = sp.tail;
  for (const s of [-1, 1]) {
    const [x0, x1] = s < 0 ? [-hw - LD, -tx] : [tx, hw + LD];
    trimGeo.push(box(x0, x1, ty0, ty1, sp.rear - twrap, sp.rear + LD, TAIL_OFF));
  }
  // 尾灯在合并后的几何体里的顶点范围（刹车灯改它的顶点色）
  let tailFrom = 0;
  for (let i = 0; i < tailStart; i++) tailFrom += trimGeo[i].getAttribute('position').count;
  let tailCount = 0;
  for (let i = tailStart; i < trimGeo.length; i++) tailCount += trimGeo[i].getAttribute('position').count;
  if (sp.rails) {
    const [rx, ry0, ry1, rz0, rz1] = sp.rails;
    for (const s of [-1, 1]) trimGeo.push(box(s * rx - 0.05, s * rx + 0.05, ry0 - 0.02, ry1, rz0, rz1, RAIL));
  }
  if (sp.spare) {
    const [r, d, y] = sp.spare;
    trimGeo.push(disc(r, d, 10, [0, y, sp.rear + d / 2], TRIM));
    trimGeo.push(disc(r * 0.5, d + 0.03, 8, [0, y, sp.rear + d / 2], SPARE_HUB));
  }

  // ── 轮子：前轴、后轴各一个网格（两只轮胎 + 两个轮毂），绕轴转 ─────────────
  const { r, w, inset } = sp.wheel;
  const xw = hw - inset - w / 2;
  const axleGeo = merge([
    wheel(r, w, 10, -xw, TYRE),
    wheel(r, w, 10, xw, TYRE),
    wheel(r * 0.48, w + 0.03, 8, -xw, WHITE),
    wheel(r * 0.48, w + 0.03, 8, xw, WHITE),
  ]);

  // ── 材质 ───────────────────────────────────────
  let paint: CarPaint = paintFor(ctx.variant);
  const gp = ctx.params.has('asset') ? ctx.params.get('paint') : null;
  if (gp && (CAR_PAINTS as readonly string[]).includes(gp)) paint = gp as CarPaint;
  const paintMat = (k: CarPaint) => ctx.mat(k);
  // 玻璃不接投影：车顶板落在后窗/侧窗上的影子正好在明暗交界附近，毛边会撒成一片噪点；窗的明暗只看朝向
  const glassMat = ctx.mat('glass', { vertexColors: true, noShadowReceive: true });
  const trimMat = ctx.mat('glass', {
    ramp: LAMP_RAMP,
    vertexColors: true,
    edge: 0.4,
    convex: 0.4,
    lightUp: 0.2,
    bands: [0.05, 0.5],
  });
  const wheelMat = ctx.mat('carSilver', { vertexColors: true });

  const body = new THREE.Mesh(merge(paintGeo), paintMat(paint));
  body.name = 'paint';
  const glass = new THREE.Mesh(merge(glassGeo), glassMat);
  glass.name = 'glass';
  const trimG = merge(trimGeo);
  const trim = new THREE.Mesh(trimG, trimMat);
  trim.name = 'trim';
  // 车身（车漆、玻璃、黑件、车门）挂在弹簧上：sprung 绕车的原点轻轻点头 / 侧倾；轮子不跟着动
  const sprung = new THREE.Group();
  sprung.name = 'sprung';
  sprung.add(body, glass, trim);
  pivot.add(sprung);
  // 后轴：一个网格；前轴：左右各一个转向节（绕竖轴打方向），里面的轮子绕横轴转
  const wheelGeo1 = merge([wheel(r, w, 10, 0, TYRE), wheel(r * 0.48, w + 0.03, 8, 0, WHITE)]);
  const spins: THREE.Group[] = [];
  const knuckles: THREE.Group[] = [];
  sp.wheel.z.forEach((z, i) => {
    if (i === 0) {
      for (const s of [-1, 1]) {
        const k = new THREE.Group();
        k.position.set(s * xw, r, z);
        const g = new THREE.Group();
        const m = new THREE.Mesh(wheelGeo1, wheelMat);
        m.name = 'wheels';
        g.add(m);
        k.add(g);
        pivot.add(k);
        knuckles.push(k);
        spins.push(g);
      }
      return;
    }
    const g = new THREE.Group();
    g.position.set(0, r, z);
    g.rotation.x = i * 0.4; // 前后轴错开一点，静止时轮子的切面不一样
    const m = new THREE.Mesh(axleGeo, wheelMat);
    m.name = 'wheels';
    g.add(m);
    pivot.add(g);
    spins.push(g);
  });

  // ── 前门（关着的时候不显示：侧板就是车门；开的时候门板 + 门窗转出来，门洞是深色）─────────────
  const dr = sp.door;
  const DT = 0.08;
  const doors = ([-1, 1] as const).map((s) => {
    const hinge = new THREE.Group();
    hinge.position.set(s * hw, 0, dr.z0);
    const len = dr.z1 - dr.z0;
    const [xi, xo] = s > 0 ? [-DT, 0] : [0, DT];
    const panel = new THREE.Mesh(box(xi, xo, dr.y0, dr.y1, 0, len), paintMat(paint));
    // 门窗：比门板薄，贴着门板外侧往里 2 厘米
    const [gi, go] = s > 0 ? [-0.06, -0.02] : [0.02, 0.06];
    const pane = new THREE.Mesh(box(gi, go, dr.y1 - 0.01, dr.yw, 0.12, len), glassMat);
    hinge.add(panel, pane);
    const xf = s * (hw + 0.004);
    const a: V3 = [xf, dr.y0, dr.z0];
    const b: V3 = [xf, dr.y0, dr.z1];
    const c: V3 = [xf, dr.y1, dr.z1];
    const d: V3 = [xf, dr.y1, dr.z0];
    const hole = new THREE.Mesh(s > 0 ? quad(b, a, d, c, OPENING) : quad(a, b, c, d, OPENING), trimMat);
    hinge.visible = hole.visible = false;
    sprung.add(hinge, hole);
    return { s, hinge, panel, hole, t: 0, goal: 0 };
  });

  ctx.mats.prepare(root);
  // 黑件不投影：行李架的影子落在车顶倒角上正好是一排毛边噪点；保险杠、灯的影子本来就在车身影子里。门洞贴在侧板上，也不投影
  trim.castShadow = false;
  for (const d of doors) d.hole.castShadow = false;

  // ── 状态 ───────────────────────────────────────
  let speed = 0;
  const OPEN = (60 * Math.PI) / 180;
  const applyDoor = (d: (typeof doors)[number]) => {
    const e = d.t * d.t * (3 - 2 * d.t);
    d.hinge.rotation.y = d.s * OPEN * e;
    d.hinge.visible = d.hole.visible = d.t > 0.001;
  };
  const sideOf = (side: Side) => doors.filter((d) => side === 'both' || (side === 'left') === d.s < 0);
  const col = trimG.getAttribute('color') as THREE.BufferAttribute;

  const ud = root.userData;
  ud.kind = sp.kind;
  ud.paint = paint;
  ud.wheelRadius = r;
  ud.setPaint = (k: CarPaint | number) => {
    const key = typeof k === 'number' ? paintFor(k) : k;
    ud.paint = key;
    const m = paintMat(key);
    body.material = m;
    for (const d of doors) d.panel.material = m;
  };
  ud.setDoor = (open: boolean, side: Side = 'both', instant = false) => {
    for (const d of sideOf(side)) {
      d.goal = open ? 1 : 0;
      if (instant) {
        d.t = d.goal;
        applyDoor(d);
      }
    }
  };
  ud.setBrake = (on: boolean) => {
    const c = on ? TAIL_ON : TAIL_OFF;
    for (let i = tailFrom; i < tailFrom + tailCount; i++) col.setXYZ(i, c[0], c[1], c[2]);
    col.needsUpdate = true;
  };
  ud.setSpeed = (mps: number) => {
    speed = mps;
  };
  // 车身的弹簧：点头（绕 x）、侧倾（绕 z）各一个二阶系统
  const SPRING_W = Math.PI * 2 * 1.3;
  const SPRING_Z = 0.45;
  const sway = { pitch: 0, pitchV: 0, pitchTo: 0, roll: 0, rollV: 0, rollTo: 0 };
  ud.setMotion = (steer: number, ax: number, ay: number) => {
    for (const k of knuckles) k.rotation.y = steer;
    // 车头 = 本地 −z：加速（ax > 0）抬头 = 绕 x 正转；横向加速度朝 +x → 车身往 −x 倒 = 绕 z 正转
    sway.pitchTo = THREE.MathUtils.clamp(ax * 0.012, -0.05, 0.05);
    sway.rollTo = THREE.MathUtils.clamp(ay * 0.016, -0.05, 0.05);
  };
  ud.update = (dt: number) => {
    if (speed !== 0) for (const a of spins) a.rotation.x -= (speed / r) * dt;
    const h = Math.min(dt, 1 / 30);
    sway.pitchV += (SPRING_W * SPRING_W * (sway.pitchTo - sway.pitch) - 2 * SPRING_Z * SPRING_W * sway.pitchV) * h;
    sway.pitch += sway.pitchV * h;
    sway.rollV += (SPRING_W * SPRING_W * (sway.rollTo - sway.roll) - 2 * SPRING_Z * SPRING_W * sway.rollV) * h;
    sway.roll += sway.rollV * h;
    sprung.rotation.set(sway.pitch, 0, sway.roll);
    for (const d of doors) {
      if (d.t === d.goal) continue;
      d.t = d.goal > d.t ? Math.min(d.goal, d.t + dt / 0.4) : Math.max(d.goal, d.t - dt / 0.4);
      applyDoor(d);
    }
  };
  /** InstancedMesh 用：静态零件（相对车的原点）+ 两根轴（相对 axle 位置）；材质名 → ctx.mat 取 */
  ud.parts = {
    paint: { geometry: body.geometry, material: body.material as THREE.Material, paintKey: paint },
    glass: { geometry: glass.geometry, material: glassMat },
    trim: { geometry: trimG, material: trimMat },
    axle: { geometry: axleGeo, material: wheelMat, at: sp.wheel.z.map((z) => [0, r, z]) },
  };

  // 落客的车：前门一开始就开着；画廊里 ?door=1 / ?brake=1 / ?speed=
  if (ctx.variant === 8 || (ctx.params.has('asset') && ctx.params.get('door') === '1')) ud.setDoor(true, 'both', true);
  if (ctx.params.has('asset')) {
    if (ctx.params.get('brake') === '1') ud.setBrake(true);
    if (ctx.params.has('speed')) speed = Number(ctx.params.get('speed'));
  }
  return root;
}
