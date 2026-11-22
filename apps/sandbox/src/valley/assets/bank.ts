// 沙漠银行的资产（批 B，2026-11-18 美术关卡 2，docs/lab/2026-11-07-3d-pixel/valley-civic.md「2. 银行」）。这个文件归沙漠银行的资产代理。
// ASSETS['<id>'] = (ctx) => THREE.Object3D：本地原点 = 落地点中心，y 0 = 地面，+z 朝南；材质只用 ctx.mat(key, extra)；随机只用 ctx.rng('<id>')。
// 画廊：/valleyassets.html?asset=<id>；场景里在 detail/sites/bank.ts 摆。
//
// 尺寸：
// - 贴楼的（bank-front、bank-atm、bank-night-drop、bank-teller-window）和街边小件（bank-timetemp-sign、bank-driveup-sign）照**原尺寸**画，
//   townwrap 统一缩 0.62。缩完画面上一个纹素 = 0.045 × 0.75（小镇镜头）= 0.03375 米 → 原尺寸里 TR = 0.0544 米、竖直面上一屏幕行 RR = 0.077 米。
// - bank-driveup-canopy 是长条（> 4.5 米）：townwrap 只把它压低（y × 0.62）、长宽不动 → 这里按**缩完的真尺寸**画（纹素 TF = 0.03375），
//   site 文件放的时候先 scale.y = 1 / 0.62 抵掉。
//
// 配色（关卡 1 定的）：铜（bankBronze：遮阳片、铜字、门框、夜间存款口、雨棚封檐）+ 沙漠叠石（desertStone）+ 白封檐（truckWhite）；
// 屋面是暖浅色的卷材（cap）——一大块白顶在正午竖屏里占上面三分之一、整片没颜色。
// 朝南的立面永远在暗档：字、招牌、封檐用 SIGN_FACE（光往上偏 → 落中档）；墙本身留暗档。
// 夜里：玻璃（厅里的灯）、铜字（背光字）、ATM 屏、招牌数字、雨棚底的灯换成自发光的一份（userData.night.setOn），门口、雨棚下各一个灯光圈。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { AssetCtx, AssetFn } from '../ctx';
import { SIGN_FACE, TOWN_EL } from '../palette';

/** 原尺寸里一个纹素、竖直面上一屏幕行（贴楼、街边小件） */
const TR = 0.0544;
const RR = TR / Math.SQRT1_2;
/** 缩完的真尺寸（雨棚） */
const TF = 0.03375;
const RF = TF / Math.SQRT1_2;

type Part = [THREE.BufferGeometry, THREE.Material];

/** 几块几何按材质合成网格；noCast 里的材质不投影 */
function meshes(ctx: AssetCtx, parts: Part[], noCast: THREE.Material[] = []): THREE.Group {
  const g = new THREE.Group();
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const [geo, m] of parts) {
    const ng = geo.index ? geo.toNonIndexed() : geo;
    for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal') ng.deleteAttribute(a);
    by.set(m, [...(by.get(m) ?? []), ng]);
  }
  for (const [m, list] of by) {
    const merged = mergeGeometries(list);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    if (noCast.includes(m)) mesh.userData.noCast = true;
    g.add(mesh);
  }
  ctx.mats.prepare(g);
  g.traverse((o) => {
    if (o.userData.noCast) o.castShadow = false;
  });
  return g;
}

function kit() {
  const parts: Part[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => {
    parts.push([g, m]);
    return g;
  };
  /** 盒子：中心 x z、底 y */
  const bx = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    add(box(w, h, d, x, y, z), m);
  /** 朝 +z 的薄片（中心 x y z） */
  const face = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number) =>
    add(new THREE.PlaneGeometry(w, h).translate(x, y, z), m);
  /** 立着的圆柱（底 y） */
  const cyl = (m: THREE.Material, r0: number, r1: number, h: number, x: number, y: number, z: number, n = 8) =>
    add(new THREE.CylinderGeometry(r0, r1, h, n).translate(x, y + h / 2, z), m);
  return { parts, add, bx, face, cyl };
}

/** 夜里换材质：[白天那份, 夜里那份]；灯光圈挂点（本地坐标）各一个。锁着时网格上是压暗的一份（不在表里）→ 不亮 */
function nightSwap(obj: THREE.Object3D, pairs: [THREE.Material, THREE.Material][], pools: THREE.Object3D[] = []) {
  const on = new Map(pairs);
  const off = new Map(pairs.map(([a, b]) => [b, a]));
  let lit = false;
  obj.userData.night = {
    setOn(v: boolean) {
      lit = v;
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const cur = m.material as THREE.Material;
        const next = v ? on.get(cur) : off.get(cur);
        if (next) m.material = next;
      });
    },
  };
  for (const p of pools) {
    const r = p.userData.r as number;
    const h = p.userData.h as number;
    const w = new THREE.Vector3();
    p.userData.night = {
      pool: (): [number, number, number, number] => {
        p.getWorldPosition(w);
        let real = false;
        obj.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && off.has((o as THREE.Mesh).material as THREE.Material)) real = true;
        });
        return lit && real ? [w.x, w.z, r, h] : [w.x, w.z, 0, 0];
      },
    };
    obj.add(p);
  }
}
function poolAt(x: number, z: number, r: number, h: number): THREE.Object3D {
  const o = new THREE.Object3D();
  o.position.set(x, 0, z);
  o.userData.r = r;
  o.userData.h = h;
  return o;
}

// ── 3×5 像素字（可变宽；'1' = 有像素） ──
const FONT: Record<string, string[]> = {
  A: ['111', '1.1', '111', '1.1', '1.1'],
  B: ['11.', '1.1', '11.', '1.1', '11.'],
  D: ['11.', '1.1', '1.1', '1.1', '11.'],
  E: ['111', '1..', '11.', '1..', '111'],
  I: ['1', '1', '1', '1', '1'],
  K: ['1.1', '1.1', '11.', '1.1', '1.1'],
  M: ['1...1', '11.11', '1.1.1', '1...1', '1...1'],
  N: ['1..1', '11.1', '1.11', '1..1', '1..1'],
  P: ['11.', '1.1', '11.', '1..', '1..'],
  R: ['11.', '1.1', '11.', '1.1', '1.1'],
  S: ['.11', '1..', '.1.', '..1', '11.'],
  T: ['111', '.1.', '.1.', '.1.', '.1.'],
  U: ['1.1', '1.1', '1.1', '1.1', '111'],
  V: ['1.1', '1.1', '1.1', '1.1', '.1.'],
  '-': ['...', '...', '111', '...', '...'],
  ':': ['.', '1', '.', '1', '.'],
  '0': ['111', '1.1', '1.1', '1.1', '111'],
  '1': ['.1', '11', '.1', '.1', '.1'],
  '2': ['111', '..1', '111', '1..', '111'],
  '8': ['111', '1.1', '111', '1.1', '111'],
  '9': ['111', '1.1', '111', '..1', '111'],
  '°': ['11', '11', '..', '..', '..'],
  '^': ['.1.', '111', '1.1', '.1.', '.1.'],
};
const glyphW = (c: string) => (c === ' ' ? 2 : (FONT[c]?.[0].length ?? 3));
const textCells = (s: string) => [...s].reduce((a, c) => a + glyphW(c), 0) + s.length - 1;
/** 一行像素字：朝 +z 的薄片，中心 (cx, cy)，平面 z；px = 一格宽，py = 一格高。每个字连着的像素并成一块 */
function textGeo(s: string, px: number, py: number, cx: number, cy: number, z: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  let x = cx - (textCells(s) * px) / 2;
  for (const c of s) {
    const rows = FONT[c] ?? [];
    const open = new Map<string, { r0: number; r1: number }>();
    const flush = (key: string, b: { r0: number; r1: number }) => {
      const [i, j] = key.split(',').map(Number);
      const h = (b.r1 - b.r0 + 1) * py;
      out.push(
        new THREE.PlaneGeometry((j - i) * px, h).translate(x + ((i + j) / 2) * px, cy + (2.5 - b.r0) * py - h / 2, z),
      );
    };
    rows.forEach((row, r) => {
      const runs = new Set<string>();
      let i = 0;
      while (i < row.length) {
        if (row[i] !== '1') {
          i++;
          continue;
        }
        let j = i;
        while (j < row.length && row[j] === '1') j++;
        runs.add(`${i},${j}`);
        i = j;
      }
      for (const [key, b] of [...open])
        if (!runs.has(key)) {
          flush(key, b);
          open.delete(key);
        }
      for (const key of runs) {
        const b = open.get(key);
        if (b) b.r1 = r;
        else open.set(key, { r0: r, r1: r });
      }
    });
    for (const [key, b] of open) flush(key, b);
    x += (glyphW(c) + 1) * px;
  }
  return out;
}

/** 共用的材质 */
function mats(ctx: AssetCtx) {
  return {
    bronze: ctx.mat('bankBronze', { convex: 0.3 }),
    bronzeFace: ctx.mat('bankBronze', SIGN_FACE),
    bronzeNight: ctx.mat('bankBronze', { ...SIGN_FACE, emissive: 0x6a4420 }),
    stone: ctx.mat('desertStone', { elem: TOWN_EL.desertStone, noShadowReceive: true }),
    stoneTop: ctx.mat('desertStone', { elem: TOWN_EL.desertStone }),
    white: ctx.mat('truckWhite', { lightUp: 0.35, bands: [-0.2, 0.4] }),
    whiteFace: ctx.mat('truckWhite', SIGN_FACE),
    glassDay: ctx.mat('jug', { noShadowReceive: true }),
    glassNight: ctx.mat('straw', { emissive: 0x5a4424, noShadowReceive: true }),
    dark: ctx.mat('ironwork'),
    paint: ctx.mat('signPaint', SIGN_FACE),
    paintNight: ctx.mat('signPaint', { ...SIGN_FACE, emissive: 0x806020 }),
    metal: ctx.mat('metal', { convex: 0.3 }),
  };
}

// ════════════════════════════ 楼的门脸 ════════════════════════════

/** 原尺寸的楼：20 × 24 × 8，原点 = 楼的中心（场景里 (292.6, −602)），南立面 z +12 */
const HW = 10;
const HD = 12;
const BH = 8;
const FZ = HD;
/** 浮顶：底 7.9、顶 8.75（要高过 build.ts 的屋顶板：缩完 h + 0.35 = 5.31 → 原尺寸 8.57）；南挑 2.4、北挑 0.6、东西各 0.4 */
const SLAB_Y = BH - 0.1;
const SLAB_T = 0.85;
const SLAB_X = HW + 0.4;
const SLAB_Z0 = -HD - 0.6;
const SLAB_Z1 = FZ + 2.4;
/** 门（本地 x 0 = 场景 x 292.6）、门那一跨、叠石墙、幕墙的 x 范围 */
const STONE_X1 = -3.7;
const BAY_X1 = 3.4;
const CURTAIN_X1 = 9.2;

/**
 * bank-front 20.8 × 8.85 × 27（原尺寸，原点 = 楼的中心）：浮起来的薄平顶（暖浅色卷材 + 一圈白封檐 + 南封檐上一排铜字 DESERT BANK
 * + 三条天窗 + 两台空调）；西三分之一叠石墙（凸 0.3，留 ATM、夜间存款口的位置）；门那一跨通高玻璃 + 铜框 + 一对门；
 * 东边玻璃幕墙前 7 片铜色竖遮阳片 + 墙根叠石花池（龙舌兰、矮灌木）。门前一块浅色台面。
 */
const bankFront: AssetFn = (ctx) => {
  const k = kit();
  const m = mats(ctx);
  const deck = ctx.mat('cap', { elem: { kind: 'planks', seam: 1, hi: 0.3, p: [1, 0, 0, 2.4] }, toneW: [0.2, 0.18] });
  const sky = ctx.mat('jug', { lightUp: 0, bands: [0.1, 0.5] });
  const unit = ctx.mat('roofMetal');
  const pad = ctx.mat('concrete', { noShadowReceive: true });
  const agave = ctx.mat('cactus', { convex: 0.25, lightUp: 0.4 });
  const sage = ctx.mat('sage', { convex: 0.2, lightUp: 0.4 });

  // ── 浮顶 ──
  const sd = SLAB_Z1 - SLAB_Z0;
  const sz = (SLAB_Z0 + SLAB_Z1) / 2;
  k.bx(deck, 2 * SLAB_X - 0.6, SLAB_T, sd - 0.6, 0, SLAB_Y, sz);
  // 白封檐：四圈 0.3 厚，高出屋面 0.1（南面正对镜头）
  const rimH = SLAB_T + 0.1;
  k.bx(m.whiteFace, 2 * SLAB_X, rimH, 0.3, 0, SLAB_Y, SLAB_Z1 - 0.15);
  k.bx(m.white, 2 * SLAB_X, rimH, 0.3, 0, SLAB_Y, SLAB_Z0 + 0.15);
  for (const s of [-1, 1]) k.bx(m.white, 0.3, rimH, sd - 0.6, s * (SLAB_X - 0.15), SLAB_Y, sz);
  // 板底一条暗缝（"浮"）：立面顶上 3 行
  k.bx(m.dark, 2 * HW, 3 * RR, 0.1, 0, SLAB_Y - 3 * RR, FZ + 0.05);
  // 铜字：南封檐正面，每格 3 纹素宽 × 2 行高（缩完 10 行高的字）
  for (const g of textGeo('DESERT BANK', 3 * TR, 2 * RR, 0, SLAB_Y + rimH / 2, SLAB_Z1 + 0.02)) k.add(g, m.bronzeFace);
  // 天窗：三条（铝框 + 浅蓝玻璃）
  const top = SLAB_Y + SLAB_T;
  for (const x of [-6.1, 0, 6.1]) {
    k.bx(unit, 4.2, 0.22, 1.3, x, top, 4);
    k.bx(sky, 3.9, 0.1, 1.0, x, top + 0.22, 4);
  }
  // 空调：两台（灰箱 + 顶上暗的风扇 + 一截风管），靠北
  for (const [x, z] of [
    [-5.6, -6],
    [5.4, -3.6],
  ] as const) {
    k.bx(unit, 1.8, 0.95, 1.3, x, top, z);
    k.cyl(m.dark, 0.36, 0.36, 0.06, x - 0.35, top + 0.95, z, 8);
    k.bx(unit, 0.5, 0.45, 0.8, x + 1.15, top, z - 0.1);
  }

  // ── 西：叠石墙（凸 0.3，从地到板底）──
  const sw = STONE_X1 + HW;
  k.bx(m.stone, sw, SLAB_Y - 3 * RR, 0.3, -HW + sw / 2, 0, FZ + 0.15);
  // 墙头一条压顶（亮的一条，叠石的收口）
  k.bx(m.stoneTop, sw + 0.1, 2 * RR, 0.4, -HW + sw / 2, SLAB_Y - 5 * RR, FZ + 0.2);

  // ── 门那一跨：通高玻璃 + 铜竖框 + 横框；中间一对门（深一点的门扇 + 铜拉手）；门头一条白梁 ──
  const bw = BAY_X1 - STONE_X1;
  const bc = (STONE_X1 + BAY_X1) / 2;
  k.face(m.glassDay, bw, 5.2, bc, 2.6, FZ + 0.05);
  for (const x of [STONE_X1 + 0.07, -1.4, 0, 1.4, BAY_X1 - 0.07]) k.bx(m.bronze, 2 * TR, 5.2, 0.12, x, 0, FZ + 0.08);
  k.bx(m.bronze, bw, 2 * RR, 0.12, bc, 2.7, FZ + 0.08);
  for (const s of [-1, 1]) {
    k.face(m.dark, 1.3, 2.6, s * 0.7, 1.3, FZ + 0.06);
    k.face(m.glassDay, 1.0, 2.2, s * 0.7, 1.4, FZ + 0.07);
    k.bx(m.bronze, 2 * TR, 0.9, 0.12, s * 0.2, 0.9, FZ + 0.14);
  }
  k.bx(m.white, bw, 0.35, 0.25, bc, 5.2, FZ + 0.12);
  // 门前台面（浅色，平的）
  k.add(new THREE.PlaneGeometry(5.2, 1.4).rotateX(-Math.PI / 2).translate(0, 0.054, FZ + 0.7), pad);

  // ── 东：玻璃幕墙（下沿一条叠石窗台）+ 铜色竖遮阳片 ──
  const cw = CURTAIN_X1 - BAY_X1;
  const cc = (BAY_X1 + CURTAIN_X1) / 2;
  k.face(m.glassDay, cw, 5.0, cc, 0.4 + 2.5, FZ + 0.05);
  k.bx(m.stoneTop, cw, 0.4, 0.2, cc, 0, FZ + 0.1);
  for (const x of [cc - 1.5, cc, cc + 1.5]) k.bx(m.bronze, 2 * TR, 5.0, 0.1, x, 0.4, FZ + 0.08);
  k.bx(m.bronze, cw, 2 * RR, 0.1, cc, 2.9, FZ + 0.08);
  for (let i = 0; i < 7; i++) k.bx(m.bronze, 0.18, SLAB_Y - 3 * RR - 0.3, 0.9, BAY_X1 + 0.4 + i * 0.9, 0.3, FZ + 0.45);
  // 墙根花池（叠石，凸到 1.85）+ 三棵龙舌兰 + 两丛矮灌木（成簇，不等距）
  k.bx(m.stoneTop, 5.6, 0.55, 0.9, cc, 0, FZ + 1.4);
  for (const [x, s] of [
    [cc - 2.0, 0.85],
    [cc - 0.5, 0.65],
    [cc + 1.9, 0.75],
  ] as const) {
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2 + x;
      const leaf = new THREE.ConeGeometry(0.1 * s, 0.9 * s, 4)
        .translate(0, 0.45 * s, 0)
        .rotateZ(0.55)
        .rotateY(a)
        .translate(x, 0.55, FZ + 1.4);
      k.add(leaf, agave);
    }
    k.add(new THREE.ConeGeometry(0.16 * s, 0.8 * s, 5).translate(x, 0.55 + 0.4 * s, FZ + 1.4), agave);
  }
  for (const x of [cc + 0.6, cc + 1.05])
    k.add(new THREE.IcosahedronGeometry(0.28, 0).scale(1, 0.7, 1).translate(x, 0.75, FZ + 1.35), sage);

  const g = meshes(ctx, k.parts, [m.bronzeFace, pad]);
  nightSwap(
    g,
    [
      [m.glassDay, m.glassNight],
      [m.bronzeFace, m.bronzeNight],
    ],
    [poolAt(0, FZ + 2.2, 4.5, 3.5)],
  );
  return g;
};

/**
 * bank-atm 1.1 × 2.5 × 0.5（原尺寸；原点 = 叠石墙面的落地点，+z 朝外）：嵌在石墙里的深色机身框、铜色边、亮屏（夜里亮）、
 * 键盘台、出钞口、顶上一块铜色小檐 + 白字 ATM。
 */
const bankAtm: AssetFn = (ctx) => {
  const k = kit();
  const m = mats(ctx);
  const screenDay = ctx.mat('clothBlue', { ...SIGN_FACE });
  const screenNight = ctx.mat('clothBlue', { ...SIGN_FACE, emissive: 0x2a4a80 });
  k.bx(m.bronzeFace, 1.1, 1.85, 0.06, 0, 0.55, 0.03);
  k.bx(m.dark, 0.94, 1.7, 0.1, 0, 0.62, 0.08);
  k.face(screenDay, 0.56, 6 * RR, 0, 1.68, 0.135);
  k.bx(m.metal, 0.7, 2 * RR, 0.32, 0, 1.12, 0.22);
  k.face(m.paint, 0.4, RR, 0, 0.9, 0.135);
  k.bx(m.bronze, 1.2, 2 * RR, 0.5, 0, 2.42, 0.25);
  for (const g of textGeo('ATM', 2 * TR, RR, 0, 2.42 + RR, 0.505)) k.add(g, m.paint);
  const g = meshes(ctx, k.parts, [m.bronzeFace, m.dark, screenDay, m.metal, m.paint, m.bronze]);
  nightSwap(g, [
    [screenDay, screenNight],
    [m.paint, m.paintNight],
  ]);
  return g;
};

/**
 * bank-night-drop 0.95 × 1.9 × 0.4（原尺寸；原点 = 叠石墙面的落地点）：铜板（斜的投口 + 暗缝 + 拉手）、上面一块深底铭牌（一行白字）。
 * 收工后总监走过来，把当天的营业款丢进去。
 */
const bankNightDrop: AssetFn = (ctx) => {
  const k = kit();
  const m = mats(ctx);
  k.bx(m.bronzeFace, 0.9, 0.7, 0.08, 0, 0.95, 0.04);
  // 斜的投口（一块往外翻的铜斗 + 暗缝）
  k.add(box(0.62, 0.16, 0.22, 0, 0, 0).rotateX(-0.5).translate(0, 1.38, 0.15), m.bronze);
  k.face(m.dark, 0.56, 2 * RR, 0, 1.3, 0.085);
  // 拉手（横的一根）+ 锁眼
  k.bx(m.bronze, 0.4, 2 * RR, 0.1, 0, 1.08, 0.12);
  k.face(m.dark, 2 * TR, 2 * RR, 0.32, 1.2, 0.085);
  // 铭牌：深底 + 一行白（"NIGHT"）
  k.bx(m.dark, 0.95, 4 * RR, 0.05, 0, 1.72, 0.03);
  for (const g of textGeo('NIGHT', TR, RR * 0.6, 0, 1.72 + 2 * RR, 0.06)) k.add(g, m.paint);
  return meshes(ctx, k.parts, [m.bronzeFace, m.bronze, m.dark, m.paint]);
};

/**
 * bank-teller-window 2.7 × 2.4 × 0.9（原尺寸；原点 = 东墙面的落地点，+z 朝外 —— 场景里转 90° 朝东）：
 * 叠石的凸窗框、一扇大玻璃（夜里亮）、铜窗框、往外拉的抽屉台、扬声格栅、窗上一块铜色小檐。
 */
const bankTellerWindow: AssetFn = (ctx) => {
  const k = kit();
  const m = mats(ctx);
  k.bx(m.stoneTop, 2.7, 2.3, 0.45, 0, 0.6, 0.22);
  k.face(m.glassDay, 1.7, 1.1, 0, 1.75, 0.46);
  for (const x of [-0.87, 0, 0.87]) k.bx(m.bronze, 2 * TR, 1.2, 0.08, x, 1.15, 0.48);
  k.bx(m.bronze, 1.8, 2 * RR, 0.08, 0, 2.3, 0.48);
  k.bx(m.bronze, 1.2, 0.14, 0.55, 0, 1.12, 0.6);
  k.face(m.dark, 0.3, 3 * RR, 0.65, 0.9, 0.46);
  k.bx(m.bronze, 2.9, 2 * RR, 0.6, 0, 2.9, 0.3);
  const g = meshes(ctx, k.parts, [m.bronze, m.dark]);
  nightSwap(g, [[m.glassDay, m.glassNight]]);
  return g;
};

/**
 * bank-driveup-canopy 8.6 × 3.25 × 5.6（**缩完的真尺寸**；原点 = 雨棚中心落地点）：一块薄板（暖浅色）+ 北、东、南三面白框，
 * 南沿铜色封檐 + 一行 DRIVE-UP（白字），东沿两根细钢柱；板底两盏灯（夜里亮 + 灯光圈）。西头顶着银行东墙。
 * 板底 2.95 米：小镇里路面检查只查到 4 × 0.62 = 2.48 米（车、人都在下面），汽车（× 0.65）过得去。
 */
const bankDriveupCanopy: AssetFn = (ctx) => {
  const k = kit();
  const m = mats(ctx);
  const deck = ctx.mat('cap', { elem: { kind: 'planks', seam: 1, hi: 0.3, p: [0, 0, 1, 1.4] }, toneW: [0.2, 0.18] });
  const lampDay = ctx.mat('signPaint', { noShadowReceive: true });
  const lampNight = ctx.mat('signPaint', { emissive: 0xa08040, noShadowReceive: true });
  const W = 8.6;
  const D = 5.6;
  const Y0 = 2.95;
  const T = 0.28;
  k.bx(deck, W, T, D, 0, Y0, 0);
  // 白框（北、东一圈，高出板面一点）；南沿：铜封檐 + 顶上一条白
  k.bx(m.white, W, T + 0.06, 0.25, 0, Y0, -D / 2 + 0.125);
  k.bx(m.white, 0.25, T + 0.06, D, W / 2 - 0.125, Y0, 0);
  k.bx(m.bronzeFace, W, 0.3, 0.12, 0, Y0 - 0.02, D / 2 + 0.02);
  k.bx(m.white, W, 0.06, 0.25, 0, Y0 + T, D / 2 - 0.1);
  for (const g of textGeo('DRIVE-UP ^', 2 * TF, RF, 1.0, Y0 + 0.13, D / 2 + 0.09)) k.add(g, m.paint);
  // 东沿两根细钢柱（4 纹素宽）+ 柱脚
  for (const z of [-D / 2 + 0.3, D / 2 - 0.3]) {
    k.bx(m.metal, 4 * TF, Y0, 4 * TF, W / 2 - 0.25, 0, z);
    k.bx(m.dark, 0.26, 0.12, 0.26, W / 2 - 0.25, 0, z);
  }
  // 板底的灯（两盏，夜里亮）
  for (const x of [-1, 2]) k.bx(lampDay, 0.6, 0.05, 0.3, x, Y0 - 0.05, 0);
  const g = meshes(ctx, k.parts, [m.bronzeFace, m.paint, lampDay, m.metal, m.dark]);
  nightSwap(
    g,
    [
      [m.paint, m.paintNight],
      [m.bronzeFace, m.bronzeNight],
      [lampDay, lampNight],
    ],
    [poolAt(0.5, 0, 4, 3)],
  );
  return g;
};

/**
 * bank-timetemp-sign 3.0 × 8.2 × 0.9（原尺寸，街边小件缩 0.62 → 缩完 5 米）：叠石座、两根白柱、黑牌两行琥珀数字
 * （12:00 / 98°；夜里亮）、铜色压顶 + 正面一个铜圆标。老银行门口的时间 / 温度牌 —— 市中心远远看得见的地标。
 */
const bankTimetempSign: AssetFn = (ctx) => {
  const k = kit();
  const m = mats(ctx);
  const board = ctx.mat('ironwork', { lightUp: 0.4, bands: [-0.3, 0.4], noShadowReceive: true });
  const amber = ctx.mat('flowerYellow', SIGN_FACE);
  const amberNight = ctx.mat('flowerYellow', { ...SIGN_FACE, emissive: 0x8a5a10 });
  // 叠石座
  k.bx(m.stoneTop, 1.7, 0.9, 1.0, 0, 0, 0);
  k.bx(m.stoneTop, 1.85, 2 * RR, 1.1, 0, 0.9, 0);
  // 两根白柱
  for (const s of [-1, 1]) k.bx(m.white, 0.3, 5.3, 0.3, s * 0.6, 0.9 + 2 * RR, 0);
  // 黑牌 + 两行数字（每格 2 纹素 × 2 行）
  const by = 6.2;
  k.bx(board, 2.8, 1.75, 0.45, 0, by, 0);
  for (const g of textGeo('12:00', 2 * TR, 2 * RR, 0, by + 1.25, 0.24)) k.add(g, amber);
  for (const g of textGeo('98°', 2 * TR, 2 * RR, 0, by + 0.5, 0.24)) k.add(g, amber);
  // 铜压顶 + 圆标
  k.bx(m.bronze, 3.0, 0.25, 0.6, 0, by + 1.75, 0);
  k.add(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12).rotateX(Math.PI / 2).translate(0, by + 2.4, 0), m.bronzeFace);
  k.bx(m.bronze, 0.12, 0.3, 0.12, 0, by + 2.0, 0);
  // 白柱缩完 0.19 米：不投影（傍晚是两条长长的麻点细线，critic M12）；牌子照投
  const g = meshes(ctx, k.parts, [amber, m.bronzeFace, m.white]);
  nightSwap(g, [
    [amber, amberNight],
    [m.bronzeFace, m.bronzeNight],
  ]);
  return g;
};

/**
 * bank-driveup-sign 1.3 × 2.5 × 0.2（原尺寸，街边小件）：一根细杆 + 深底牌（白字 DRIVE-UP + 一个绿色往上的箭头）。≤ 100 三角形
 */
const bankDriveupSign: AssetFn = (ctx) => {
  const k = kit();
  const m = mats(ctx);
  const board = ctx.mat('signBoard', SIGN_FACE);
  const arrow = ctx.mat('green', SIGN_FACE);
  k.bx(m.dark, 3 * TR, 1.6, 3 * TR, 0, 0, 0);
  k.bx(board, 1.3, 0.9, 0.1, 0, 1.6, 0);
  for (const g of textGeo('DRIVE-UP', TR, RR, -0.12, 1.6 + 0.6, 0.06)) k.add(g, m.paint);
  for (const g of textGeo('^', 2 * TR, RR, 0.42, 1.6 + 0.45, 0.06)) k.add(g, arrow);
  return meshes(ctx, k.parts, [board, m.paint, arrow]);
};

export const ASSETS: Record<string, AssetFn> = {
  'bank-front': bankFront,
  'bank-atm': bankAtm,
  'bank-night-drop': bankNightDrop,
  'bank-teller-window': bankTellerWindow,
  'bank-driveup-canopy': bankDriveupCanopy,
  'bank-timetemp-sign': bankTimetempSign,
  'bank-driveup-sign': bankDriveupSign,
};
