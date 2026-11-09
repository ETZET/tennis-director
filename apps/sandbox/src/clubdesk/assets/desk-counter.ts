// #2 desk-counter · L 形柜台（主角下半）。规格见 docs/lab/2026-11-07-3d-pixel/clubdesk.md「#2」，尺寸 layout.ts COUNTER。
// 本地原点 = 转角（世界 56.3, 9.4），+z 朝镜头（南）。东段朝东（朝大门，会员沿着它排队），南段朝南（朝镜头）。
//
// yaw 0 下只看得见南段的正面（东段的正面是侧对镜头的一条线）→ 细节都放在这一面：
// 俱乐部蓝竖板（5 块 0.28 米，1 纹素板缝 + 缝后一纹素亮条）、底下一道缩进 0.05 的深色踢脚、正中一个网球徽标
// （按屏幕画圆：竖直面在 45° 下压扁 0.707，所以世界里是竖的椭圆；白色球缝两道弧 ")("）、台面浅石面、前沿伸出 0.06（凸边亮线）。
// 台面上：东段靠转角一个铜铃（会员那一侧），南段东头一叠折好的毛巾（白 / 蓝条纹交替）—— 总监站的位置（转角里面，
// 世界 55.55, 8.6）前面空着。凉棚投影的东沿（x ≈ 56.0）正好顺着东段走：南段西半在影子里，铃和毛巾在亮处。
//
// stage 3 的钩子（userData）：
// - setTowels(n)：台面上的毛巾叠几条（0…5，默认 4），返回实际条数；towels() 读当前条数。
// - ding()：按一下服务铃（铃身压扁再弹回 0.35 秒，铃顶的按钮按下去）。
// - spots：本地坐标的站位（米）：director 总监接待位 [x, z]、member 签到的会员 [x, z]、handover 递毛巾的交接点 [x, y, z]
//   （东段台面上方，总监和会员之间）、bell 铃 [x, y, z]、towels 毛巾叠的底 [x, y, z]（每条高 towelH = 0.08，第 n 条的顶 = y + n·towelH）。世界坐标 = 本地 + (56.3, 0, 9.4)。
import * as THREE from 'three';
import { COUNTER, SPOTS } from '../layout';
import type { AssetCtx } from '../world';
import { box, boxR, type G, meshOf, quad } from './desk/kit';

/** 落地点（转角） */
const OX = 56.3;
const OZ = 9.4;
const L = (r: { x0: number; x1: number; z0: number; z1: number }) => ({
  x0: r.x0 - OX,
  x1: r.x1 - OX,
  z0: r.z0 - OZ,
  z1: r.z1 - OZ,
});
/** 东段、南段（本地）：东段 x −0.3…0.3、z −3.4…−0.3；南段 x −1.1…0.3、z −0.3…0.3 */
const E = L(COUNTER.east);
const S = L(COUNTER.south);
const H = COUNTER.h;
/** 踢脚高、缩进；台面厚、伸出 */
const KICK = 0.13;
const KICK_IN = 0.06;
const TOP_T = 0.06;
const LIP = 0.06;
const BODY_Y1 = H - TOP_T;
/** 正面竖板宽：南段正面 1.4 米 = 5 块 */
const BOARD = (S.x1 - S.x0) / 5;
/** 徽标：中心（本地）、屏幕上的半径（米） */
const EMB = { x: (S.x0 + S.x1) / 2 - 0.0, y: (KICK + BODY_Y1) / 2, r: 0.25 };
/** 竖直面 → 屏幕的压缩（45° 俯视） */
const SQ = Math.SQRT1_2;
/** 毛巾：最多几条、每条尺寸、叠的位置（南段东头，转角里柱子的南边） */
const TOWEL_MAX = 5;
const TOWEL = { w: 0.36, h: 0.08, d: 0.26, x: -0.07, z: 0.04 };
/** 每条毛巾的颜色（从下往上；默认 4 条时最上面是白的） */
const TOWEL_BLUE = [false, true, false, false, true];
/** 铃：东段靠转角、柱子东边（柱子 x −0.25…0.05 会挡住它）、会员那一侧 */
const BELL = { x: 0.16, z: -0.95, r: 0.12 };

/** 按屏幕画的椭圆盘（竖直面上，朝 +z），中心 (cx, cy)，屏幕半径 r，seg 段 */
function screenDisc(cx: number, cy: number, z: number, r: number, seg = 20): G {
  const g = new THREE.CircleGeometry(r, seg);
  g.scale(1, 1 / SQ, 1).translate(cx, cy, z);
  return g.toNonIndexed();
}

/**
 * 网球的球缝：两道弧 ")("，在"屏幕圆"里画（u 横、w 屏幕竖），再按 1/0.707 拉回竖直面。
 * 每道弧是圆心在 (±1.35R, 0)、半径 0.95R 的圆的一段，只取落在球里的那段；笔画宽 t（米，≈ 1 纹素）。
 */
function seamGeo(cx: number, cy: number, z: number, R: number, t: number): G[] {
  const out: G[] = [];
  for (const side of [-1, 1]) {
    const c = side * 1.35 * R;
    const ra = 0.95 * R;
    const n = 10;
    // 中线落在球里（离边 0.6t）的角度范围
    const inside = (a: number) => {
      const u = c - side * ra * Math.cos(a);
      const w = ra * Math.sin(a);
      return Math.hypot(u, w) < R - t * 0.6;
    };
    let a1 = 0;
    while (a1 < Math.PI / 2 && inside(a1 + 0.01)) a1 += 0.01;
    const pt = (a: number, rr: number): [number, number, number] => [
      cx + c - side * rr * Math.cos(a),
      cy + (rr * Math.sin(a)) / SQ,
      z,
    ];
    for (let i = 0; i < n; i++) {
      const a = -a1 + (2 * a1 * i) / n;
      const b = -a1 + (2 * a1 * (i + 1)) / n;
      const p = [pt(a, ra - t / 2), pt(b, ra - t / 2), pt(b, ra + t / 2), pt(a, ra + t / 2)];
      out.push(quad(p[0], p[1], p[2], p[3], [0, 0, 1]));
    }
  }
  return out;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'desk-counter';

  // ── 柜身（俱乐部蓝竖板）：几何体整体挪 −S.x0，让板缝从南段正面的西头起算（5 块整板），网格再挪回来 ──
  const body: G[] = [boxR(E.x0, E.x1, KICK, BODY_Y1, E.z0, S.z1), boxR(S.x0, E.x0, KICK, BODY_Y1, S.z0, S.z1)];
  for (const g of body) g.translate(-S.x0, 0, 0);
  const mBody = meshOf(
    body,
    ctx.mat('counter', { elem: { kind: 'planks', p: [1, 0, 0, BOARD], seam: 1, hi: 1 } }),
    'counter-body',
  );
  mBody.position.x = S.x0;
  root.add(mBody);

  // 踢脚：缩进 0.05 的深色一条（铸铁色），在柜身底下读成一道暗线
  root.add(
    meshOf(
      [
        boxR(E.x0 + KICK_IN, E.x1 - KICK_IN, 0, KICK, E.z0 + KICK_IN, S.z1 - KICK_IN),
        boxR(S.x0 + KICK_IN, E.x0 + KICK_IN, 0, KICK, S.z0 + KICK_IN, S.z1 - KICK_IN),
      ],
      ctx.mat('ironwork'),
      'kick',
    ),
  );

  // 台面：浅石面，外沿伸出 LIP（前沿凸边亮线）；内侧（总监那边）也伸一点
  root.add(
    meshOf(
      [
        boxR(E.x0 - LIP, E.x1 + LIP, BODY_Y1, H, E.z0 - LIP, S.z1 + LIP),
        boxR(S.x0 - LIP, E.x0 - LIP, BODY_Y1, H, S.z0 - LIP, S.z1 + LIP),
      ],
      ctx.mat('counterTop'),
      'top',
    ),
  );

  // ── 网球徽标：球（中档，lightUp 把朝镜头的面抬到中档、不接投影）+ 白色球缝（永远亮档）──
  const zf = S.z1 + 0.012;
  root.add(
    meshOf(
      [screenDisc(EMB.x, EMB.y, zf, EMB.r)],
      ctx.mat('ball', { lightUp: 0.85, noShadowReceive: true, edge: 0.3, convex: 0 }),
      'emblem',
    ),
  );
  root.add(
    meshOf(
      seamGeo(EMB.x, EMB.y, zf + 0.006, EMB.r, 0.05),
      ctx.mat('clothWhite', { lightUp: 1, bands: [-2, -1], noShadowReceive: true, edge: 0.3, convex: 0 }),
      'emblem-seam',
    ),
  );

  // ── 毛巾叠（南段东头）：白 / 蓝条纹交替，错开 0 或 1 纹素 ─────────────────
  const towelGrp = new THREE.Group();
  towelGrp.name = 'towels';
  const mWhite = ctx.mat('clothWhite', { noShadowReceive: true });
  const mBlue = ctx.mat('canvasStripe', { noShadowReceive: true });
  const towels: THREE.Mesh[] = [];
  const shift = [0, 0.045, 0, -0.045, 0.045];
  for (let i = 0; i < TOWEL_MAX; i++) {
    const m = meshOf(
      [box(TOWEL.w, TOWEL.h, TOWEL.d, TOWEL.x + shift[i], H + i * TOWEL.h, TOWEL.z)],
      TOWEL_BLUE[i] ? mBlue : mWhite,
      `towel-${i}`,
    );
    towels.push(m);
    towelGrp.add(m);
  }
  root.add(towelGrp);
  let towelN = 4;
  const setTowels = (n: number) => {
    towelN = Math.max(0, Math.min(TOWEL_MAX, Math.round(n)));
    towels.forEach((m, i) => {
      m.visible = i < towelN;
    });
    return towelN;
  };
  setTowels(towelN);

  // ── 服务铃（东段靠转角）：深色底座 + 铜铃身（球面法线）+ 顶上的按钮 ──────────
  const bell = new THREE.Group();
  bell.name = 'bell';
  bell.position.set(BELL.x, H, BELL.z);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(BELL.r + 0.025, BELL.r + 0.025, 0.03, 10),
    ctx.mat('ironwork'),
  );
  base.position.y = 0.015;
  const domeGeo = new THREE.SphereGeometry(BELL.r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome = new THREE.Mesh(domeGeo, ctx.mat('brass', { sphereNormals: true, noShadowReceive: true }));
  dome.position.y = 0.03;
  const knob = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.05, 6),
    ctx.mat('brass', { noShadowReceive: true }),
  );
  knob.position.y = 0.03 + BELL.r + 0.015;
  bell.add(base, dome, knob);
  root.add(bell);
  let dingT = -1;
  const ding = () => {
    dingT = 0;
  };

  ctx.mats.prepare(root);
  // 小东西不投影到台面上（铃、毛巾的影子在台面上是麻点）
  for (const o of [bell, towelGrp])
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) c.castShadow = false;
    });

  root.userData.update = (dt: number) => {
    if (dingT < 0) return;
    dingT += dt;
    const k = Math.min(1, dingT / 0.35);
    // 按下去（前 0.08 秒）再弹回：铃身压扁 + 一点回弹
    const press = dingT < 0.08 ? dingT / 0.08 : Math.max(0, 1 - (dingT - 0.08) / 0.1);
    const wob = Math.sin(k * Math.PI * 3) * (1 - k) * 0.12;
    dome.scale.set(1 + press * 0.12 + wob, 1 - press * 0.22 - wob, 1 + press * 0.12 + wob);
    knob.position.y = 0.03 + 0.1 * dome.scale.y + 0.015 - press * 0.02;
    if (k >= 1) {
      dingT = -1;
      dome.scale.set(1, 1, 1);
      knob.position.y = 0.03 + BELL.r + 0.015;
    }
  };
  root.userData.setTowels = setTowels;
  root.userData.towels = () => towelN;
  root.userData.ding = ding;
  root.userData.spots = {
    director: [SPOTS.deskStand[0] - OX, SPOTS.deskStand[1] - OZ],
    member: [SPOTS.serve[0] - OX, SPOTS.serve[1] - OZ],
    handover: [0, H + 0.25, -0.6],
    bell: [BELL.x, H + 0.15, BELL.z],
    towels: [TOWEL.x, H, TOWEL.z],
    towelH: TOWEL.h,
  };
  return root;
}
