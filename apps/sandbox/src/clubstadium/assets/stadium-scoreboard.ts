// #3 stadium-scoreboard：北看台后墙正中、朝南的大记分牌（竖屏上沿的第二个看点）。
// 深色牌面（slate，朝镜头 = 暗档 → 用抬光落中档，读成"黑板"而不是黑洞）+ 一圈 1 纹素的钢框（上沿一行亮）
// + 顶上一条俱乐部蓝名牌（四条奶油色粗划 = 场馆名，左边一颗网球徽标）+ 两行比分：
//   发球点（亮黄方块）· 名字缩写 3 个字（奶油色，不发光）· 三盘的局分 3 格 · 本局分 2 格（蓝底框里）。
// 数字是亮黄的 3×5 点阵（一格 = 2 × 1 设计纹素，1× 下一个数 12 × 10 像素），灯自己发光（影子里也亮）。
// 两根 4 纹素粗的钢腿从后墙背后的地上立起来（看台后墙顶 6.8，牌底 7.1：中间露出一截腿）。
// 本地原点 = SCOREBOARD 的落地点 (0, −38.2)，牌面朝 +z。尺寸照 layout.ts 的 SCOREBOARD（7.2 × 2.8，底 7.1）。
//
// userData：
//   setScore(sets, points?, serve?)  sets = 每盘的局分 [[A, B], …]（最多 3 盘，最后一盘 = 正在打的）；
//                                    points = 本局 [A, B]（0 / 15 / 30 / 40 / 'AD' / ''）；serve = 0 | 1 谁发球。
//                                    变了的格子翻一下（0.2 秒：绕格子中线压扁再弹开，新数字在压扁时换上）
//   score                            当前的 { sets, points, serve }
//   update(dt)                       翻牌动画（场景的 collectUpdaters 已经在调）
// 画廊：?asset=stadium-scoreboard（`&score=6-4,3-2&pts=30-15&srv=1` 换比分）。
import * as THREE from 'three';
import type { AssetCtx } from '../world';
import { Bag, DU, DV, FACE_LIT, FACE_MID, glyphGeo, LED } from './court/kit';

/** 牌面（和 layout.ts SCOREBOARD 一致）：宽、高、厚、底高 */
const B = { w: 7.2, h: 2.8, d: 0.4, y0: 7.1 };
/** 牌面朝镜头那一面的 z */
const ZF = B.d / 2;
/** 一行 = 竖直面上一个设计纹素；牌面 22 行 */
const row = (r: number) => B.y0 + B.h - r * DV;

type Pt = number | string;
interface Score {
  sets: [number, number][];
  points: [Pt, Pt];
  serve: 0 | 1;
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'stadium-scoreboard';

  // ── 材质 ─────────────────────────────────────
  const face = ctx.mat('slate', { ...FACE_MID, elem: { kind: 'paint', size: [14, 6], space: 'local', seed: 3 } });
  const body = ctx.mat('ironwork', { noShadowReceive: true, convex: 0.6 });
  const steel = ctx.mat('metal', { convex: 0.6 });
  const frame = ctx.mat('metal', { ...FACE_MID, bands: [-0.55, 0.25] });
  const plate = ctx.mat('counter', { ...FACE_MID, elem: { kind: 'paint', size: [12, 5], space: 'local', seed: 5 } });
  const paint = ctx.mat('signPaint', FACE_LIT);
  // 名字缩写：奶油色落中档（比亮黄的数字暗一截，数字才是看点）
  const nameInk = ctx.mat('signPaint', { ...FACE_MID, bands: [-0.2, 0.6] });
  const ptsBox = ctx.mat('counter', { ...FACE_MID, bands: [-0.3, 0.5] });
  const ball = ctx.mat('ball', FACE_LIT);
  const led = ctx.mats.toon(0xffffff, {
    ramp: LED,
    ...FACE_LIT,
    emissive: 0x2a1c00,
    edge: 0.2,
    convex: 0,
  });

  const bag = new Bag();
  // ── 腿：两根 0.36 米的钢腿（后墙背后落地），顶上一根横梁托住牌子 ──
  for (const x of [-2.6, 2.6]) bag.box(steel, 0.36, B.y0 + 0.2, 0.36, x, 0, -0.12);
  bag.box(steel, B.w - 1.2, 0.27, 0.3, 0, B.y0 - 0.27, -0.12);
  // ── 牌身（背、顶、侧）+ 朝镜头的牌面（分开：牌面抬光落中档，顶面照常受光）──
  bag.box(body, B.w, B.h, B.d - 0.06, 0, B.y0, -0.03);
  bag.add(face, new THREE.PlaneGeometry(B.w - 2 * DU, B.h - 2 * DV).translate(0, B.y0 + B.h / 2, ZF));
  // 钢框：上下两条（1 行）、左右两条（1 纹素），比牌面凸出一点；顶上再压一条帽檐（上沿亮）
  const fz = ZF + 0.02;
  bag.box(frame, B.w, DV, 0.06, 0, B.y0 + B.h - DV, fz - 0.03);
  bag.box(frame, B.w, DV, 0.06, 0, B.y0, fz - 0.03);
  for (const s of [-1, 1]) bag.box(frame, DU, B.h - 2 * DV, 0.06, s * (B.w / 2 - DU / 2), B.y0 + DV, fz - 0.03);
  bag.box(body, B.w + 0.18, 0.1, B.d + 0.1, 0, B.y0 + B.h, 0);

  // ── 名牌（第 2..5 行）：俱乐部蓝、左边网球徽标、四条奶油粗划（= 场馆名，不写真字）──
  const pz = ZF + 0.03;
  const plateW = 50 * DU;
  bag.box(plate, plateW, 4 * DV, 0.05, 0, row(6), pz - 0.025);
  // 徽标：一颗 4 × 3 行的网球（圆角：上下两行窄一格）
  const lx = -plateW / 2 + 4 * DU;
  bag.quad(ball, 2 * DU, DV, lx, row(2.5), pz + 0.004);
  bag.quad(ball, 4 * DU, 2 * DV, lx, row(4), pz + 0.004);
  bag.quad(ball, 2 * DU, DV, lx, row(5.5), pz + 0.004);
  // 四条粗划：2 行高，长短不一（像两个词）
  let x = lx + 4 * DU;
  for (const n of [9, 7, 11, 8]) {
    bag.quad(paint, n * DU, 2 * DV, x + (n * DU) / 2, row(4), pz + 0.004);
    x += (n + (n === 7 ? 4 : 2)) * DU;
  }

  // ── 比分区：两行（第 8..12 行、第 15..19 行）──
  const rowsY = [row(10.5), row(17.5)];
  /** 一个字的格子：2 × 1 设计纹素；字宽 6 纹素 */
  const CW = 2 * DU;
  const CH = DV;
  const colX = {
    serve: -36 * DU,
    name: [-29 * DU, -21 * DU, -13 * DU],
    sets: [-3 * DU, 5 * DU, 13 * DU],
    pts: [23 * DU, 30 * DU],
  };
  // 本局分的蓝底框（两行一起，比字高出一行）
  bag.box(ptsBox, 15 * DU, 13 * DV, 0.04, (colX.pts[0] + colX.pts[1]) / 2, row(20), pz - 0.02);
  // 局分格子之间 1 纹素的竖分隔线（钢框色）
  for (const sx of [-7 * DU, 1 * DU, 9 * DU, 17 * DU]) bag.box(frame, DU, 13 * DV, 0.04, sx, row(20), pz - 0.02);
  // 名字缩写（不发光，奶油色）
  const NAMES = ['RIO', 'SAM'];
  NAMES.forEach((nm, r) => {
    [...nm].forEach((c, i) => {
      const g = glyphGeo(c, CW, CH, 0.03);
      if (g) bag.add(nameInk, g.translate(colX.name[i], rowsY[r], pz));
    });
  });
  bag.into(root);

  // ── 会变的格子：每格一个网格（翻牌时单独缩放）──
  interface Cell {
    mesh: THREE.Mesh;
    text: string;
    next: string | null;
    t: number;
  }
  const cells: Cell[] = [];
  const cell = (cx: number, cy: number): Cell => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), led);
    mesh.position.set(cx, cy, pz);
    root.add(mesh);
    const c = { mesh, text: '', next: null, t: 0 };
    cells.push(c);
    return c;
  };
  const setText = (c: Cell, s: string) => {
    c.mesh.geometry.dispose();
    c.mesh.geometry = (s && glyphGeo(s, CW, CH, 0.04)) || new THREE.BufferGeometry();
    c.text = s;
  };
  // 每行：发球点 1 格（单独一个 2×2 的方块）、局分 3 格、本局分 2 格
  const serveDots = rowsY.map((y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2 * DU, 2 * DV, 0.04).translate(0, 0, 0.02), led);
    m.position.set(colX.serve, y, pz);
    root.add(m);
    return m;
  });
  const setCells = rowsY.map((y) => colX.sets.map((sx) => cell(sx, y)));
  const ptCells = rowsY.map((y) => colX.pts.map((px) => cell(px, y)));

  const FLIP = 0.2;
  const show = (c: Cell, s: string, animate: boolean) => {
    if (s === c.text && c.next === null) return;
    if (!animate) {
      setText(c, s);
      c.next = null;
      c.mesh.scale.y = 1;
      return;
    }
    c.next = s;
    c.t = 0;
  };
  const ptStr = (p: Pt): [string, string] => {
    const s = String(p).toUpperCase();
    if (s === '' || s === 'NULL') return ['', ''];
    if (s === 'AD' || s === 'A') return ['A', 'D'];
    const n = s.padStart(2, ' ');
    return [n[0], n[1]];
  };
  const score: Score = { sets: [], points: [0, 0], serve: 0 };
  const apply = (s: Score, animate: boolean) => {
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < 3; k++) {
        const v = s.sets[k]?.[r];
        show(setCells[r][k], v === undefined ? '' : String(Math.max(0, Math.min(9, Math.round(v)))), animate);
      }
      const [a, b] = ptStr(s.points[r]);
      show(ptCells[r][0], a, animate);
      show(ptCells[r][1], b, animate);
      serveDots[r].visible = s.serve === r;
    }
    Object.assign(score, s);
  };

  root.userData.setScore = (sets: [number, number][], points: [Pt, Pt] = [0, 0], serve: 0 | 1 = 0) =>
    apply({ sets: sets.slice(0, 3), points, serve }, true);
  root.userData.score = score;
  root.userData.update = (dt: number) => {
    for (const c of cells) {
      if (c.next === null) continue;
      c.t += dt;
      const k = Math.min(1, c.t / FLIP);
      // 前半压扁（绕格子中线），压到底换字，后半弹开
      if (k >= 0.5 && c.next !== c.text) setText(c, c.next);
      c.mesh.scale.y = Math.max(0.001, Math.abs(1 - 2 * k));
      if (k >= 1) {
        c.mesh.scale.y = 1;
        c.next = null;
      }
    }
  };

  // 初始比分（画廊可以用 URL 换）：6-4, 3-2，本局 30-15，A 发球
  const parsePair = (s: string): [number, number] => {
    const [a, b] = s.split('-').map((v) => Number(v));
    return [a || 0, b || 0];
  };
  const q = ctx.params;
  const sets = (q.get('score') ?? '6-4,3-2').split(',').map(parsePair);
  const pts = (q.get('pts') ?? '30-15').split('-') as [Pt, Pt];
  apply({ sets, points: [pts[0] ?? 0, pts[1] ?? 0], serve: (Number(q.get('srv') ?? 0) ? 1 : 0) as 0 | 1 }, false);

  ctx.mats.prepare(root);
  return root;
}
