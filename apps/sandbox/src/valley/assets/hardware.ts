// 五金大超市的资产（批 H，docs/lab/2026-11-07-3d-pixel/valley-town.md「资产清单」）。这个文件归五金大超市的资产代理。
// 每个资产：ASSETS['<id>'] = (ctx) => THREE.Object3D。本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头（朝南），单位米；
// 材质只用 ctx.mat(key, extra)（key 在 src/valley/palette.ts；锁着的区域按它压暗）；随机只用 ctx.rng('<id>')；变体 ctx.variant。
// 画廊：/valleyassets.html?asset=<id>；场景里在 detail/sites/hardware.ts 摆。
//
// 品牌色（用户 2026-11-16 定）：芥末黄 hwMustard + 深海军蓝 hwNavy，不用青绿。招牌字是 3×5 的像素字（FONT），一个字像素 = 整数个游戏纹素宽
// （0.045 米）× 整数个屏幕行高（竖直 0.045 / cos45 米），按行把连着的像素并成一块薄片 —— 字边都落在纹素上，不闪。
// 朝南的立面永远在暗档：招牌底、字用 SIGN_FACE（光往上偏 → 落中档）；墙本身留暗档（暗带是构图的骨架）。
// 夜里：玻璃（店里的灯）、招牌字、灯头换成自发光的一份（userData.night.setOn；只换"白天那份"材质，锁着压暗的不亮），门口一个灯光圈。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../ctx';
import { SIGN_FACE, TOWN_EL } from '../palette';
import { breezeWallGeo } from './shared';

/** 游戏里一个纹素（米，/valley.html 默认缩放）、竖直面上一屏幕行（俯 45°） */
const T = 0.045;
const R = T / Math.SQRT1_2;

type Part = [THREE.BufferGeometry, THREE.Material];

/** 几块几何按材质合成网格；noCast 里的材质不投影（小件、薄片） */
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

/** 收集几何的小工具 */
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
  const cyl = (
    m: THREE.Material,
    r0: number,
    r1: number,
    h: number,
    x: number,
    y: number,
    z: number,
    n = 8,
    open = false,
  ) => add(new THREE.CylinderGeometry(r0, r1, h, n, 1, open).translate(x, y + h / 2, z), m);
  return { parts, add, bx, face, cyl };
}

/** 法线 = 离 c 的方向（圆的东西：桶形仙人掌、桶盖） */
function roundNormals(g: THREE.BufferGeometry, c: THREE.Vector3): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const p = ng.attributes.position as THREE.BufferAttribute;
  const n = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(c).normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  ng.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return ng;
}

/** 夜里换材质：[白天那份, 夜里那份]。锁着时网格上是压暗的一份（不在表里）→ 不亮 */
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
  // 灯光圈：子物件各一个（clubsite/daylight 遍历场景找 userData.night.pool），只在亮着、而且玻璃真的换了（没锁）时给半径
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
/** 灯光圈的挂点（本地坐标） */
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
  D: ['11.', '1.1', '1.1', '1.1', '11.'],
  E: ['111', '1..', '11.', '1..', '111'],
  G: ['.11', '1..', '1.1', '1.1', '.11'],
  H: ['1.1', '1.1', '111', '1.1', '1.1'],
  I: ['1', '1', '1', '1', '1'],
  N: ['1..1', '11.1', '1.11', '1..1', '1..1'],
  P: ['11.', '1.1', '11.', '1..', '1..'],
  R: ['11.', '1.1', '11.', '1.1', '1.1'],
  T: ['111', '.1.', '.1.', '.1.', '.1.'],
  W: ['1...1', '1...1', '1.1.1', '1.1.1', '.1.1.'],
  // 店内（in-）的牌子要的字（加字不改外观那批的字）
  B: ['11.', '1.1', '11.', '1.1', '11.'],
  C: ['.11', '1..', '1..', '1..', '.11'],
  F: ['111', '1..', '11.', '1..', '1..'],
  K: ['1.1', '1.1', '11.', '1.1', '1.1'],
  L: ['1..', '1..', '1..', '1..', '111'],
  M: ['1...1', '11.11', '1.1.1', '1...1', '1...1'],
  O: ['.1.', '1.1', '1.1', '1.1', '.1.'],
  S: ['.11', '1..', '.1.', '..1', '11.'],
  U: ['1.1', '1.1', '1.1', '1.1', '111'],
  V: ['1.1', '1.1', '1.1', '1.1', '.1.'],
  X: ['1.1', '1.1', '.1.', '1.1', '1.1'],
  Y: ['1.1', '1.1', '.1.', '.1.', '.1.'],
  '1': ['.1', '11', '.1', '.1', '.1'],
  '2': ['11.', '..1', '.1.', '1..', '111'],
  '3': ['11.', '..1', '.1.', '..1', '11.'],
  '4': ['1.1', '1.1', '111', '..1', '..1'],
  '5': ['111', '1..', '11.', '..1', '11.'],
  '6': ['.11', '1..', '11.', '1.1', '.1.'],
  '>': ['1..', '.1.', '..1', '.1.', '1..'],
};
const glyphW = (c: string) => (c === ' ' ? 2 : (FONT[c]?.[0].length ?? 3));
/** 一行字的宽（像素格数，字间空 1 格） */
const textCells = (s: string) => [...s].reduce((a, c) => a + glyphW(c), 0) + s.length - 1;
/**
 * 一行像素字：朝 +z 的薄片，中心 (cx, cy)，平面 z；px = 一格宽（米，取纹素的整数倍），py = 一格高（取屏幕行的整数倍）。
 * 每个字每行连着的像素并成一块。返回几何。
 */
function textGeo(s: string, px: number, py: number, cx: number, cy: number, z: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  let x = cx - (textCells(s) * px) / 2;
  for (const c of s) {
    const rows = FONT[c] ?? [];
    // 每行连着的像素是一段 [i, j)；上下几行同一段的并成一块高的（竖笔画一块，三角形少一半）
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

/** 立面上的品牌牌子（海军蓝底，SIGN_FACE 落中档）和字（芥末黄，自带 SIGN_FACE） */
function brand(ctx: AssetCtx) {
  const navy = ctx.mat('hwNavy', SIGN_FACE);
  const mustard = ctx.mat('hwMustard');
  const mustardNight = ctx.mat('hwMustard', { emissive: 0x6a4a10 });
  return { navy, mustard, mustardNight };
}
/** 店里的玻璃（白天 jug 暗档的蓝，夜里暖橙自发光 —— 同 town.ts 第 9 节的窗） */
function glass(ctx: AssetCtx) {
  const day = ctx.mat('jug', { noShadowReceive: true });
  const night = ctx.mat('straw', { emissive: 0x5a4424, noShadowReceive: true });
  return { day, night };
}

// ════════════════════════════ 大盒子 ════════════════════════════

/** 外墙比 build.ts 的楼体（48 × 28 × 8 + 出挑 0.25 的屋面板）每边大 0.3：把它整个包在里面，不共面 */
const SHELL_W = 48.6;
const SHELL_D = 28.6;
const PARAPET = 9.1;
const DECK = 8.5;
const BAND = 1.5;

/**
 * bigbox-shell 48 × 9.1 × 28（原点 = 楼的中心 (376, −586)）：tilt-up 预制板墙（tiltup，6 米一块竖缝 = TOWN_EL.tiltup 的 planks），
 * 南面顶上一条 1.5 米的芥末黄女儿墙带 + 带下一条 3 行的海军蓝细线（大卖场的"腰线"）；四根芥末黄落水管；东头 PAINT 小招牌 + 一扇海军蓝侧门。
 * 屋顶：女儿墙里面低 0.6 米的屋面（tiltup 的暖色涂层，1.5 米一张、一条缝；清单提议的 roofMetal 灰在午后金光里是一整块奶白，
 * 门口那帧饱和度掉 0.02）、6 排 × 3 个天窗（jug 的浅蓝方块）、6 台空调机（roofMetal 灰箱 + 顶上暗的风扇）、两个排水口。
 */
const bigboxShell: AssetFn = (ctx) => {
  const k = kit();
  const wall = ctx.mat('tiltup', { elem: TOWN_EL.tiltup, noShadowReceive: true });
  const wallTop = ctx.mat('tiltup');
  const { navy, mustard, mustardNight } = brand(ctx);
  const band = ctx.mat('hwMustard', { noShadowReceive: true });
  // 屋面：暖色涂层（tiltup 一家），1.5 米一张（0.45 米一条肋在 0.045 米/纹素下是一整片条形码），深浅少换（toneW 低）
  const deck = ctx.mat('tiltup', { elem: { ...TOWN_EL.roofMetal, p: [1, 0, 0, 1.5] }, toneW: [0.14, 0.14] });
  const unit = ctx.mat('roofMetal');
  const dark = ctx.mat('ironwork');
  const sky = ctx.mat('jug', { lightUp: 0, bands: [0.1, 0.5] });
  const { day: glassDay, night: glassNight } = glass(ctx);
  const hw = SHELL_W / 2;
  const hd = SHELL_D / 2;
  const fz = hd; // 南立面
  // 墙：南墙到女儿墙带底，带子单独一块（芥末黄）；北、东、西墙一直到女儿墙顶
  k.bx(wall, SHELL_W, PARAPET - BAND, 0.3, 0, 0, fz - 0.15);
  k.bx(band, SHELL_W, BAND, 0.3, 0, PARAPET - BAND, fz - 0.15);
  k.bx(wall, SHELL_W, PARAPET, 0.3, 0, 0, -fz + 0.15);
  for (const s of [-1, 1]) k.bx(wall, 0.3, PARAPET, SHELL_D - 0.6, s * (hw - 0.15), 0, 0);
  // 女儿墙顶的压顶（亮档的一条，三面墙顶）
  k.bx(wallTop, SHELL_W, 0.08, 0.3, 0, PARAPET, -fz + 0.15);
  for (const s of [-1, 1]) k.bx(wallTop, 0.3, 0.08, SHELL_D - 0.6, s * (hw - 0.15), PARAPET, 0);
  // 腰线：女儿墙带下面 2 行空、3 行海军蓝
  k.bx(navy, SHELL_W, 3 * R, 0.06, 0, PARAPET - BAND - 5 * R, fz + 0.03);
  // 落水管：墙角两根 + 中间两根（芥末黄，6 纹素宽；顶上一个接水斗）
  for (const x of [-hw + 0.5, -12, 12, hw - 0.5]) {
    k.bx(band, 6 * T, PARAPET - BAND - 0.5, 0.16, x, 0, fz + 0.08);
    k.bx(band, 10 * T, 0.36, 0.26, x, PARAPET - BAND - 0.6, fz + 0.13);
  }
  // 东头：一扇海军蓝侧门（双开、上面一条玻璃）+ 门上 PAINT 小招牌
  const dx = 21;
  k.bx(navy, 2.0, 2.4, 0.1, dx, 0, fz + 0.05);
  k.face(dark, T, 2.2, dx, 1.1, fz + 0.11);
  k.face(glassDay, 1.6, 2 * R, dx, 2.2, fz + 0.11);
  k.bx(navy, 4.6, 1.15, 0.12, 12, 4.7, fz + 0.06);
  for (const g of textGeo('PAINT', 5 * T, 2 * R, 12, 4.7 + 1.15 / 2, fz + 0.13)) k.add(g, mustard);
  // 屋面（女儿墙里面低 0.6 米）
  k.add(new THREE.PlaneGeometry(SHELL_W - 0.6, SHELL_D - 0.6).rotateX(-Math.PI / 2).translate(0, DECK, 0), deck);
  // 天窗：6 排 × 3 个（灰的窗框 + 顶上浅蓝的玻璃）
  const skyZ = [-9, -2.5, 4];
  for (let i = 0; i < 6; i++)
    for (const z of skyZ) {
      const x = -17.5 + i * 7;
      k.bx(unit, 1.5, 0.22, 2.3, x, DECK, z);
      k.bx(sky, 1.2, 0.1, 2.0, x, DECK + 0.22, z);
    }
  // 空调机：灰箱 + 顶上暗的风扇圆 + 一截风管
  for (const [x, z] of [
    [-20, -4],
    [-14, 4.5],
    [-6.5, -8],
    [7.5, 1.5],
    [14.5, -6],
    [20.5, 8],
  ] as const) {
    k.bx(unit, 1.8, 0.95, 1.3, x, DECK, z);
    k.cyl(dark, 0.36, 0.36, 0.06, x - 0.35, DECK + 0.95, z, 8);
    k.bx(unit, 0.5, 0.45, 0.8, x + 1.15, DECK, z - 0.1);
  }
  // 排水口（屋面上两个暗方块）
  for (const x of [-8, 16]) k.bx(dark, 0.4, 0.04, 0.4, x, DECK, hd - 1.2);
  const g = meshes(ctx, k.parts);
  nightSwap(g, [
    [glassDay, glassNight],
    [mustard, mustardNight],
  ]);
  return g;
};

/**
 * bigbox-entry 11 × 10.5 × 2.5（原点 = 门头的中心落地点，场景里 (365, −570.75)；正面在本地 z +1.25 = 门槛 −569.5）：
 * 两边 1.5 米的墙垛（tiltup），中间 8 米一跨：下面自动门 5.6 × 3（四扇玻璃、中缝、门框）+ 两侧玻璃，门上一条芥末黄雨棚（4.2 米高、出挑 1.1 米，
 * 只盖住门上的横框），雨棚上面一整片玻璃幕墙（竖梃每 1.6 米）—— 门厅；顶上 9.6 × 2.4 的海军蓝大招牌 + 芥末黄 HARDWARE（像素字，每格 5 × 4 纹素），
 * 招牌上下各一条芥末黄细边；门前一块暗的地垫。夜里：玻璃暖橙、字发光、门前一个灯光圈。
 */
const bigboxEntry: AssetFn = (ctx) => {
  const k = kit();
  const W = 11;
  const H = 10.5;
  const D = 2.5;
  const fz = D / 2;
  const wall = ctx.mat('tiltup', { elem: TOWN_EL.tiltup, noShadowReceive: true });
  const { navy, mustard, mustardNight } = brand(ctx);
  const canopy = ctx.mat('hwMustard', { lightUp: 0.3, bands: [-0.2, 0.4] });
  const frame = ctx.mat('ironwork', { noShadowReceive: true });
  const { day: glassDay, night: glassNight } = glass(ctx);
  const mat = ctx.mat('ironwork', { edge: 0, convex: 0 });
  // 墙垛 + 招牌那一截 + 顶
  for (const s of [-1, 1]) k.bx(wall, 1.5, H, D, s * (W / 2 - 0.75), 0, 0);
  k.bx(wall, W - 3, H - 7.0, D, 0, 7.0, 0);
  // 门厅里面：玻璃后面那面墙（暗，往里 0.4 米：玻璃有厚度、门框有影）
  k.bx(wall, W - 3, 7.0, D - 0.4, 0, 0, -0.2);
  // 自动门 5.6 × 3：四扇玻璃（每扇 1.4）、门框 2 纹素、中缝 1 纹素；两侧固定玻璃到墙垛
  const gz = fz - 0.35;
  k.face(glassDay, W - 3, 3.0, 0, 1.5, gz);
  for (const x of [-4, -2.8, 2.8, 4]) k.bx(frame, 4 * T, 3.0, 0.1, x, 0, gz);
  for (const x of [-1.4, 1.4]) k.bx(frame, 2 * T, 3.0, 0.08, x, 0, gz);
  k.bx(frame, 2 * T, 3.0, 0.1, 0, 0, gz + 0.02);
  k.bx(frame, W - 3, 4 * R, 0.12, 0, 3.0, gz);
  // 雨棚 4.2 米高、出挑 1.1（只挡 3.1～4.2：门露出来）；前沿一条海军蓝封边
  k.bx(canopy, 9.2, 0.22, 1.1 + 0.35, 0, 4.2, fz + 0.55 - 0.175);
  k.bx(navy, 9.2, 0.14, 0.06, 0, 4.24, fz + 1.08);
  // 雨棚上面的玻璃幕墙 4.4～7.0（竖梃每 1.6 米、中间一道横梃）
  k.face(glassDay, W - 3, 2.6, 0, 4.4 + 1.3, gz);
  for (let i = 0; i <= 5; i++) k.bx(frame, 4 * T, 2.6, 0.1, -4 + i * 1.6, 4.4, gz);
  k.bx(frame, W - 3, 2 * R, 0.1, 0, 5.75, gz);
  // 大招牌：海军蓝底 9.6 × 2.4（7.6～10.0），上下各一条芥末黄细边，HARDWARE 每格 5 纹素宽 × 4 行高
  const sy = 7.6;
  const sh = 2.4;
  k.bx(navy, 9.6, sh, 0.16, 0, sy, fz + 0.08);
  k.bx(mustard, 9.6, 2 * R, 0.17, 0, sy + 3 * R, fz + 0.09);
  k.bx(mustard, 9.6, 2 * R, 0.17, 0, sy + sh - 5 * R, fz + 0.09);
  for (const g of textGeo('HARDWARE', 5 * T, 4 * R, 0, sy + sh / 2, fz + 0.18)) k.add(g, mustard);
  // 顶：一条芥末黄压顶（亮档的顶面）
  k.bx(canopy, W + 0.1, 0.16, D + 0.1, 0, H, 0);
  // 门前的地垫（暗，贴地）
  k.add(new THREE.PlaneGeometry(5.6, 1.2).rotateX(-Math.PI / 2).translate(0, 0.075, fz + 0.65), mat);
  const g = meshes(ctx, k.parts, [mat]);
  nightSwap(
    g,
    [
      [glassDay, glassNight],
      [mustard, mustardNight],
    ],
    [poolAt(0, fz + 3.5, 6, 4.2)],
  );
  return g;
};

// ════════════════════════════ 园艺棚 ════════════════════════════

/**
 * garden-center 20 × 4.2 × 16（原点 = 院子中心，场景里 (410, −580)）：1.4 米的花砖墙（shared.ts 的 breezeWallGeo：一格 4 纹素、格心一个暗洞）
 * 东、南、北三面（西面是店的东墙）；南面中间开 6 米的门、北面东头开 4 米的门去卸货台；南门上一块海军蓝 GARDEN 拱牌（两根柱）。
 * 北半边 19.6 × 7 的遮阳网（shadeCloth + paint 布纹，6 根柱、两条边梁，网在柱之间往下垂 0.3 米）—— 网不投影（20 米宽的硬边黑块），网下面看得见货。
 */
const gardenCenter: AssetFn = (ctx) => {
  const k = kit();
  const brick = ctx.mat('breezeBlock', { noShadowReceive: true });
  const hole = ctx.mat('breezeBlock', {
    ramp: [0x8a6e8c, 0x6a5078, 0x3c3058],
    edge: 0,
    convex: 0,
    noShadowReceive: true,
  });
  const cap = ctx.mat('cap');
  // 网布一幅 1.75 米宽（沿 x 拉、幅与幅之间一条缝），每幅深浅不同
  const cloth = ctx.mat('shadeCloth', { elem: { kind: 'planks', p: [0, 0, 1, 1.75], seam: 1, hi: 0.4 } });
  const post = ctx.mat('ironwork');
  const { navy, mustard, mustardNight } = brand(ctx);
  const navyPost = ctx.mat('hwNavy');
  const wallRun = (len: number, x: number, z: number, rotY: number) => {
    const w = breezeWallGeo(len, 1.4, 0.3);
    const put = (list: THREE.BufferGeometry[], m: THREE.Material) => {
      for (const g of list) k.add(g.rotateY(rotY).translate(x, 0, z), m);
    };
    put(w.wall, brick);
    put(w.holes, hole);
    put(w.cap, cap);
  };
  // 南墙两段（门 6 米居中）、东墙、北墙（东头 4 米门）；长度取 4 纹素格（0.36）的整数倍附近
  wallRun(7.0, -6.5, 7.85, 0);
  wallRun(7.0, 6.5, 7.85, 0);
  wallRun(15.4, 9.85, 0, Math.PI / 2);
  wallRun(15.0, -2.2, -7.85, 0);
  // 南门的拱牌：两根海军蓝柱 + 牌（2.3～3.15）+ GARDEN
  for (const s of [-1, 1]) k.bx(navyPost, 0.22, 3.2, 0.22, s * 2.9, 0, 7.85);
  k.bx(navy, 5.4, 0.85, 0.14, 0, 2.3, 7.85);
  for (const g of textGeo('GARDEN', 4 * T, 2 * R, 0, 2.3 + 0.85 / 2, 7.85 + 0.08)) k.add(g, mustard);
  // 遮阳网棚：6 根柱（西边那排贴着店墙）、两条边梁、网
  const x0 = -9.6;
  const x1 = 9.6;
  const zN = -7.5;
  const zS = -0.9;
  const top = 4.0;
  for (const x of [x0, 0, x1]) for (const z of [zN, zS]) k.bx(post, 0.22, top, 0.22, x, 0, z);
  for (const z of [zN, zS]) k.bx(post, x1 - x0 + 0.22, 0.14, 0.14, 0, top - 0.14, z);
  const net = new THREE.PlaneGeometry(x1 - x0 + 0.3, zS - zN + 0.3, 16, 10).rotateX(-Math.PI / 2);
  const p = net.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const ux = ((x + x1) / x1) % 1; // 两跨，每跨 0..1
    const uz = (z + (zS - zN) / 2) / (zS - zN);
    // 网在南北两条边梁之间往下兜（北半边朝南斜 = 背光暗一档，南半边朝北斜 = 亮）、在柱之间再多垂一点
    const sx = Math.sin(Math.PI * Math.min(1, Math.max(0, ux)));
    const sag = Math.sin(Math.PI * Math.min(1, Math.max(0, uz))) * (0.32 + 0.22 * sx);
    p.setY(i, top - sag);
  }
  net.computeVertexNormals();
  net.translate(0, 0, (zN + zS) / 2);
  k.add(net, cloth);
  const g = meshes(ctx, k.parts, [cloth]);
  nightSwap(g, [[mustard, mustardNight]]);
  return g;
};

/**
 * nursery-cacti 4 × 1.0 × 1.2：一张矮木台（woodWeathered 板面 + 暗的台脚）上成簇的黑盆（锥形 6 边，盆沿亮）：
 * 桶形仙人掌（球面法线、少数顶上一点黄花）、龙舌兰（5～6 片宽叶往外翻，silverBlue）、柱形仙人掌（一两根带一条胳膊）。
 * 盆按格子撒、跳格、大小不一（成簇，不等距）。v0 桶形多、v1 龙舌兰多、v2 柱形多。
 */
const nurseryCacti: AssetFn = (ctx) => {
  const k = kit();
  const rnd = ctx.rng(`nursery-cacti:${ctx.variant}`);
  const table = ctx.mat('woodWeathered', { elem: { kind: 'planks', p: [0, 0, 1, 0.3], seam: 1, hi: 0.5 } });
  const leg = ctx.mat('ironwork');
  const pot = ctx.mat('ironwork', { convex: 0.3 });
  const cactus = ctx.mat('cactus', { lightUp: 0.3, convex: 0.3 });
  const agave = ctx.mat('silverBlue', { convex: 0.2 });
  const flower = ctx.mat('flowerYellow', { noShadowReceive: true });
  const soil = ctx.mat('ironwork', { lightUp: -0.3, edge: 0, convex: 0 });
  const TH = 0.42;
  k.bx(table, 4, 0.08, 1.2, 0, TH - 0.08, 0);
  k.bx(leg, 3.9, TH - 0.08, 0.9, 0, 0, 0); // 台子底下一整块暗的（台脚、阴影里看不出几根）
  const kinds = [
    ['barrel', 'barrel', 'agave', 'column'],
    ['agave', 'agave', 'barrel', 'column'],
    ['column', 'column', 'barrel', 'agave'],
  ][ctx.variant % 3];
  const cols = 6;
  const rows = 2;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      if (rnd() < 0.2) continue;
      const pr = 0.15 + rnd() * 0.09;
      const x = -1.75 + (c + 0.5) * (3.5 / cols) + (rnd() - 0.5) * 0.16;
      const z = -0.27 + r * 0.54 + (rnd() - 0.5) * 0.1;
      const ph = pr * 1.3;
      k.cyl(pot, pr, pr * 0.78, ph, x, TH, z, 6, true);
      k.add(new THREE.CircleGeometry(pr * 0.92, 6).rotateX(-Math.PI / 2).translate(x, TH + ph - 0.02, z), soil);
      const y = TH + ph;
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      if (kind === 'barrel') {
        const br = pr * (0.85 + rnd() * 0.2);
        const g = new THREE.IcosahedronGeometry(br, 0).scale(1, 0.95, 1).translate(x, y + br * 0.8, z);
        k.add(roundNormals(g, new THREE.Vector3(x, y + br * 0.5, z)), cactus);
        if (rnd() < 0.45) k.bx(flower, 0.14, 0.08, 0.14, x, y + br * 1.7, z);
      } else if (kind === 'agave') {
        const n = 5 + Math.floor(rnd() * 2);
        const len = 0.36 + pr;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
          const blade = new THREE.ConeGeometry(0.075, len, 3, 1, true)
            .scale(1.6, 1, 0.6)
            .translate(0, len / 2, 0)
            .rotateX(0.75 + rnd() * 0.25)
            .rotateY(a)
            .translate(x, y - 0.02, z);
          k.add(blade, agave);
        }
      } else {
        const h = 0.45 + rnd() * 0.4;
        k.cyl(cactus, 0.1, 0.11, h, x, y, z, 5);
        if (rnd() < 0.6) {
          const s = rnd() < 0.5 ? -1 : 1;
          k.cyl(cactus, 0.075, 0.075, 0.3, x + s * 0.17, y + h * 0.4, z, 5);
        }
      }
    }
  return meshes(ctx, k.parts, [flower, leg, soil]);
};

// ════════════════════════════ 货板上的货 ════════════════════════════

/** 一个货板 1.2 × 0.14 × 1.0：顶面板（woodWeathered，板缝沿 x）、三根垫块（底板看不见，不做） */
function pallet(k: ReturnType<typeof kit>, m: THREE.Material, dark: THREE.Material, x = 0, y = 0, z = 0) {
  k.bx(m, 1.2, 0.035, 1.0, x, y + 0.105, z);
  for (const bz of [-0.42, 0, 0.42]) k.bx(dark, 1.2, 0.105, 0.16, x, y, z + bz);
}
const palletMats = (ctx: AssetCtx) => ({
  wood: ctx.mat('woodWeathered', { elem: { kind: 'planks', p: [0, 0, 1, 0.2], seam: 1, hi: 0.4 } }),
  woodDark: ctx.mat('woodWeathered', { lightUp: -0.2 }),
});

/** 枕头形的袋子：盒子，顶面四边往里收 inset（袋子两头圆一点，侧面是斜的 → 明暗分开） */
function bagGeo(w: number, h: number, d: number, inset: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > 0) {
      p.setX(i, p.getX(i) * (1 - (2 * inset) / w));
      p.setZ(i, p.getZ(i) * (1 - (2 * inset) / d));
    }
  }
  g.computeVertexNormals();
  return g.translate(0, h / 2, 0);
}

/**
 * pallet-sand 1.2 × 1.1 × 1.0：货板 + 码成三层的牛皮纸袋（每层 2 × 2 袋，枕头形，层间错一点），前排每袋一条海军蓝商标带；
 * 顶上一张芥末黄价签。变体（v0..4）：层数 2～3、错位不同、顶层少一袋。
 */
const palletSand: AssetFn = (ctx) => {
  const k = kit();
  const rnd = ctx.rng(`pallet-sand:${ctx.variant}`);
  const { wood, woodDark } = palletMats(ctx);
  const kraft = ctx.mat('kraft', { elem: { kind: 'planks', p: [1, 0, 0, 0.56], seam: 0, hi: 0 } });
  const label = ctx.mat('hwNavy', { ...SIGN_FACE });
  const tag = ctx.mat('hwMustard');
  pallet(k, wood, woodDark);
  const layers = ctx.variant % 3 === 2 ? 2 : 3;
  const BH = 0.24;
  let y = 0.14;
  for (let l = 0; l < layers; l++) {
    const ox = (rnd() - 0.5) * 0.06;
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        if (l === layers - 1 && layers === 3 && i === 1 && j === 1 && ctx.variant % 2 === 1) continue;
        const x = -0.28 + i * 0.57 + ox + (rnd() - 0.5) * 0.03;
        const z = -0.235 + j * 0.47 + (rnd() - 0.5) * 0.03;
        k.add(bagGeo(0.55, BH, 0.45, 0.04).translate(x, y, z), kraft);
        if (j === 1) k.face(label, 0.3, 2 * R, x, y + BH * 0.5, z + 0.226);
      }
    y += BH;
  }
  k.face(tag, 0.27, 2 * R, 0.3, y - 0.12, 0.5);
  return meshes(ctx, k.parts, [label, tag]);
};

/**
 * pallet-paint 1.2 × 0.9 × 1.0：货板 + 两层 3 × 3 的白桶（6 边，平面朝南；上层的桶盖亮，盖沿靠描边），前排每桶一条红标签。
 * 场地线漆（用户要买的三样之一）。
 */
const palletPaint: AssetFn = (ctx) => {
  const k = kit();
  const { wood, woodDark } = palletMats(ctx);
  const pail = ctx.mat('pvc', { convex: 0.4 });
  const lid = ctx.mat('pvc', { lightUp: 0.2, convex: 0.3 });
  const red = ctx.mat('clothRed', { noShadowReceive: true });
  pallet(k, wood, woodDark);
  const r = 0.17;
  const h = 0.34;
  const rot = Math.PI / 6;
  for (let l = 0; l < 2; l++)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const x = -0.39 + i * 0.39;
        const z = -0.33 + j * 0.33;
        const y = 0.14 + l * (h + 0.04);
        k.add(new THREE.CylinderGeometry(r, r * 0.93, h, 6, 1, true).rotateY(rot).translate(x, y + h / 2, z), pail);
        // 桶盖只有上层的看得见（下层的被上层压着）；标签 = 朝南那个平面上贴一片
        if (l === 1) k.add(new THREE.CircleGeometry(r, 6).rotateX(-Math.PI / 2).translate(x, y + h, z), lid);
        if (j === 2) k.face(red, r * 0.95, 0.11, x, y + 0.17, z + r * 0.84 + 0.01);
      }
  return meshes(ctx, k.parts, [red]);
};

/**
 * pipe-rack 4 × 1.6 × 1.2：芥末黄的 A 字铁架（两头各一个 A、顶梁、底撑），两面斜靠三层灌溉管（沿 x 横放，每层三根 Ø0.24，
 * 白 / 灰 / 蓝一层一种，两头长短错开 —— 一看就是一捆捆的管子，不画一根根细线）。
 */
const pipeRack: AssetFn = (ctx) => {
  const k = kit();
  const rnd = ctx.rng(`pipe-rack:${ctx.variant}`);
  const steel = ctx.mat('hwMustard', { lightUp: 0.2, bands: [-0.1, 0.45] });
  const white = ctx.mat('pvc', { convex: 0.3 });
  const grey = ctx.mat('roofMetal', { convex: 0.3 });
  const blue = ctx.mat('clothBlue', { convex: 0.3 });
  const H = 1.55;
  const lean = 0.42;
  // 两个 A（两条腿往外斜）+ 顶梁 + 底撑
  for (const x of [-1.9, 1.9])
    for (const s of [-1, 1]) {
      const legG = box(0.12, H / Math.cos(lean), 0.12, 0, 0, 0)
        .rotateX(s * lean)
        .translate(x, 0, s * 0.02);
      k.add(legG, steel);
    }
  k.bx(steel, 3.92, 0.12, 0.12, 0, H - 0.1, 0);
  for (const s of [-1, 1]) k.bx(steel, 3.92, 0.1, 0.1, 0, 0.18, s * 0.55);
  const tiers = [white, grey, blue];
  if (ctx.variant % 2 === 1) tiers.reverse();
  for (const s of [-1, 1])
    for (let t = 0; t < 3; t++) {
      const yb = 0.22 + t * 0.42;
      const zc = s * (0.62 - t * 0.17);
      for (let p = 0; p < 3; p++) {
        const len = 3.4 + rnd() * 0.5;
        const off = (rnd() - 0.5) * 0.3;
        k.add(
          new THREE.CylinderGeometry(0.12, 0.12, len, 6, 1, true)
            .rotateZ(Math.PI / 2)
            .translate(off, yb + 0.12 + p * 0.03, zc - s * p * 0.2 + s * 0.12),
          tiers[t],
        );
      }
    }
  return meshes(ctx, k.parts);
};

// ════════════════════════════ 门前的小件 ════════════════════════════

/**
 * cart-corral 3.2 × 1.0 × 1.4：海军蓝的钢管栏（四根柱、两条顶栏、北面一条横档，东头开口）+ 两排套在一起的购物车：
 * 每排一个胖块（灰的车筐，筐里暗；每辆车一块 = planks 0.32 米一块，深浅轮着）+ 底下一条暗的轮子 + 东头一根红把手；栏顶一块小牌（芥末黄）。
 */
const cartCorral: AssetFn = (ctx) => {
  const k = kit();
  const rail = ctx.mat('hwNavy');
  const basket = ctx.mat('roofMetal', { elem: { kind: 'planks', p: [1, 0, 0, 0.32], seam: 1, hi: 0.6 }, convex: 0.3 });
  const inside = ctx.mat('ironwork', { edge: 0, convex: 0 });
  const wheel = ctx.mat('ironwork');
  const handle = ctx.mat('clothRed');
  const sign = ctx.mat('hwMustard');
  const L = 3.2;
  const Dp = 1.4;
  for (const x of [-L / 2 + 0.06, L / 2 - 0.06])
    for (const z of [-Dp / 2 + 0.06, Dp / 2 - 0.06]) k.bx(rail, 0.12, 1.0, 0.12, x, 0, z);
  for (const z of [-Dp / 2 + 0.06, Dp / 2 - 0.06]) k.bx(rail, L, 0.1, 0.12, 0, 0.92, z);
  k.bx(rail, 0.12, 0.1, Dp, -L / 2 + 0.06, 0.92, 0);
  k.bx(rail, L, 0.08, 0.1, 0, 0.45, -Dp / 2 + 0.06);
  for (const z of [-0.3, 0.3]) {
    const n = z < 0 ? 2.75 : 2.4;
    const x0 = -L / 2 + 0.18;
    k.bx(wheel, n - 0.1, 0.16, 0.42, x0 + n / 2, 0, z);
    k.bx(basket, n, 0.48, 0.5, x0 + n / 2, 0.2, z);
    k.add(new THREE.PlaneGeometry(n - 0.16, 0.36).rotateX(-Math.PI / 2).translate(x0 + n / 2 - 0.02, 0.685, z), inside);
    k.bx(handle, 0.1, 0.1, 0.52, x0 + n + 0.06, 0.78, z);
  }
  k.face(sign, 0.54, 3 * R, 0.6, 0.93, Dp / 2 + 0.01);
  return meshes(ctx, k.parts, [sign, handle, inside]);
};

/**
 * propane-cage 2.0 × 1.8 × 1.0：海军蓝的铁笼（四角柱、顶、中间一层隔板、正面三条横档 —— 不画网眼）+ 上下两排白罐（罐身 6 边、圆肩、顶上一圈护圈），
 * 顶上正面一块红牌（两行白字块）。
 */
const propaneCage: AssetFn = (ctx) => {
  const k = kit();
  const cage = ctx.mat('hwNavy');
  const shelf = ctx.mat('ironwork');
  const tank = ctx.mat('pvc', { convex: 0.4 });
  const red = ctx.mat('clothRed', { ...SIGN_FACE });
  const chalk = ctx.mat('signPaint', { noShadowReceive: true });
  const W = 2.0;
  const H = 1.8;
  const D = 1.0;
  for (const x of [-W / 2 + 0.06, W / 2 - 0.06])
    for (const z of [-D / 2 + 0.06, D / 2 - 0.06]) k.bx(cage, 0.1, H, 0.1, x, 0, z);
  // 顶只有一圈框（从上面看得见白罐的圆肩）
  for (const z of [-D / 2 + 0.05, D / 2 - 0.05]) k.bx(cage, W, 0.08, 0.1, 0, H - 0.08, z);
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) k.bx(cage, 0.1, 0.08, D, x, H - 0.08, 0);
  k.bx(shelf, W - 0.12, 0.05, D - 0.12, 0, 0.12, 0);
  k.bx(shelf, W - 0.12, 0.05, D - 0.12, 0, 0.9, 0);
  for (const y of [0.55, 1.3, 1.62]) k.face(cage, W, 0.08, 0, y + 0.04, D / 2);
  for (const yb of [0.17, 0.95])
    for (let i = 0; i < 4; i++) {
      const x = -0.69 + i * 0.46;
      const z = (i % 2) * 0.12 - 0.04;
      // 罐身、圆肩（开口的 5 边，上下接着、护圈盖住肩口）
      k.add(new THREE.CylinderGeometry(0.16, 0.16, 0.36, 5, 1, true).translate(x, yb + 0.18, z), tank);
      k.add(new THREE.CylinderGeometry(0.08, 0.16, 0.1, 5, 1, true).translate(x, yb + 0.41, z), tank);
      k.cyl(shelf, 0.09, 0.09, 0.1, x, yb + 0.44, z, 5, true);
    }
  k.bx(red, 1.6, 0.32, 0.06, 0, H - 0.08 - 0.32, D / 2 + 0.03);
  k.face(chalk, 1.0, R, -0.1, H - 0.4 + 0.22, D / 2 + 0.065);
  k.face(chalk, 0.6, R, -0.3, H - 0.4 + 0.09, D / 2 + 0.065);
  return meshes(ctx, k.parts, [red, chalk]);
};

/** bollard 0.35 × 1.0：黄钢管桩（圆柱 + 半球顶，顶上那圈亮）、一圈暗的反光带 */
const bollard: AssetFn = (ctx) => {
  const k = kit();
  const y = ctx.mat('flowerYellow', { lightUp: 0.35, bands: [-0.2, 0.45], convex: 0.4, noShadowReceive: true });
  const band = ctx.mat('ironwork', { noShadowReceive: true });
  const r = 0.17;
  k.cyl(y, r, r, 0.86, 0, 0, 0, 6, true);
  k.add(new THREE.SphereGeometry(r, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.86, 0), y);
  k.cyl(band, r + 0.01, r + 0.01, 2 * R, 0, 0.62, 0, 6, true);
  return meshes(ctx, k.parts, [band]);
};

// ════════════════════════════ 停车场 ════════════════════════════

/**
 * lot-pylon 3.6 × 11 × 1.4（原点 = 花坛中心）：土坯花坛（两棵桶形仙人掌）+ 两根 tilt-up 柱 + 柱间一块奶白副牌（GARDEN / PAINT 海军蓝字）
 * + 顶上 3.6 × 3 的海军蓝主牌：芥末黄的方块标（里面一个海军蓝 H）+ 两行 HARD / WARE。夜里字和副牌发光。
 */
const lotPylon: AssetFn = (ctx) => {
  const k = kit();
  const base = ctx.mat('adobe');
  const soil = ctx.mat('sandPatch');
  const cactus = ctx.mat('cactus', { lightUp: 0.3, convex: 0.3 });
  const flower = ctx.mat('flowerYellow', { noShadowReceive: true });
  const col = ctx.mat('tiltup', { noShadowReceive: true });
  const { navy, mustard, mustardNight } = brand(ctx);
  const navyText = ctx.mat('hwNavy', { ...SIGN_FACE, bands: [-0.6, 0.3] });
  const panel = ctx.mat('signPaint', SIGN_FACE);
  const panelNight = ctx.mat('signPaint', { ...SIGN_FACE, emissive: 0x6a5a30 });
  k.bx(base, 3.6, 0.6, 1.4, 0, 0, 0);
  k.add(new THREE.PlaneGeometry(3.3, 1.1).rotateX(-Math.PI / 2).translate(0, 0.61, 0), soil);
  // 花坛里两棵桶形仙人掌（一棵顶上开黄花）
  for (const [x, r] of [
    [-0.75, 0.3],
    [0.85, 0.24],
  ] as const) {
    const g = new THREE.IcosahedronGeometry(r, 0).translate(x, 0.6 + r * 0.8, 0.15);
    k.add(roundNormals(g, new THREE.Vector3(x, 0.6 + r * 0.5, 0.15)), cactus);
  }
  k.bx(flower, 0.14, 0.08, 0.14, -0.75, 0.6 + 0.3 * 1.75, 0.15);
  for (const s of [-1, 1]) k.bx(col, 0.45, 7.6, 0.45, s * 1.2, 0.6, 0);
  // 副牌 5.9～7.6（两行字，每行 5 格 × 2 行高 = 0.64 米，行距 0.76）
  const py = 5.9;
  k.bx(panel, 3.5, 1.7, 0.14, 0, py, 0.3);
  for (const g of textGeo('GARDEN', 3 * T, 2 * R, 0, py + 1.23, 0.38)) k.add(g, navyText);
  for (const g of textGeo('PAINT', 3 * T, 2 * R, 0, py + 0.47, 0.38)) k.add(g, navyText);
  // 主牌 8.0～11.0
  const my = 8.0;
  k.bx(navy, 3.6, 3.0, 0.5, 0, my, 0);
  k.bx(mustard, 3.6, 2 * R, 0.51, 0, my + 3.0 - 3 * R, 0);
  // 方块标：芥末黄 1.26 × 1.15，里面海军蓝 H（每格 6 纹素 × 3 行）
  const ly = my + 2.15;
  k.face(mustard, 28 * T, 18 * R, 0, ly, 0.26);
  for (const g of textGeo('H', 6 * T, 3 * R, 0, ly, 0.27)) k.add(g, navyText);
  for (const g of textGeo('HARD', 4 * T, 2 * R, 0, my + 1.12, 0.26)) k.add(g, mustard);
  for (const g of textGeo('WARE', 4 * T, 2 * R, 0, my + 0.42, 0.26)) k.add(g, mustard);
  const g = meshes(ctx, k.parts, [flower]);
  nightSwap(g, [
    [mustard, mustardNight],
    [panel, panelNight],
  ]);
  return g;
};

/**
 * lot-light 2.4 × 8.2 × 0.6（原点 = 杆脚）：水泥墩 + 镀锌灰杆 + 横担 + 两个鞋盒灯头（暗）、灯头下面一条灯罩（白天浅色、夜里发光）。
 * 灯光圈在 sites/hardware.ts 用 kit 的 pool 登记（town.ts 第 9 节一起开关）。
 */
const lotLight: AssetFn = (ctx) => {
  const k = kit();
  const base = ctx.mat('concrete');
  const pole = ctx.mat('roofMetal', { convex: 0.3 });
  const head = ctx.mat('ironwork');
  const lens = ctx.mat('signPaint', { noShadowReceive: true });
  const lensNight = ctx.mat('signPaint', { emissive: 0x7a6a40, noShadowReceive: true });
  k.bx(base, 0.6, 0.6, 0.6, 0, 0, 0);
  k.bx(pole, 0.22, 7.5, 0.22, 0, 0.6, 0);
  k.bx(pole, 2.2, 0.14, 0.14, 0, 7.9, 0);
  for (const s of [-1, 1]) {
    k.bx(head, 0.62, 0.22, 0.46, s * 1.05, 7.82, 0);
    k.bx(lens, 0.52, 0.06, 0.4, s * 1.05, 7.76, 0.01);
  }
  const g = meshes(ctx, k.parts, [lens]);
  nightSwap(g, [[lens, lensNight]]);
  return g;
};

/**
 * pickup-lumber 2.1 × 1.9 × 5.4（本地 +z = 车头）：红皮卡（车身、驾驶室、后窗、车斗围板和尾门、暗的车斗底、四个轮子）
 * + 车斗里一捆黄木料（顶面一块一块的板），伸出尾门 0.6～0.8 米的那截一根根分开（端面看得见）+ 一面小红旗。
 */
const pickupLumber: AssetFn = (ctx) => {
  const k = kit();
  const body = ctx.mat('carRed');
  const under = ctx.mat('ironwork');
  const win = ctx.mat('jug', { noShadowReceive: true });
  const bed = ctx.mat('ironwork', { edge: 0.2, convex: 0 });
  const wood = ctx.mat('wood', { elem: { kind: 'planks', p: [1, 0, 0, 0.3], seam: 1, hi: 0.5 } });
  const woodEnd = ctx.mat('wood', { lightUp: 0.4, bands: [-0.3, 0.4], noShadowReceive: true });
  const flag = ctx.mat('flowerRed', { noShadowReceive: true });
  // 底盘、轮子
  k.bx(under, 1.8, 0.4, 4.9, 0, 0.18, 0);
  for (const x of [-0.92, 0.92]) for (const z of [-1.7, 1.75]) k.bx(under, 0.28, 0.68, 0.72, x, 0, z);
  // 车身下半截（整车长）
  k.bx(body, 2.0, 0.5, 5.3, 0, 0.5, 0);
  // 驾驶室（z 0.15～1.85）+ 后窗
  k.bx(body, 1.92, 0.78, 1.7, 0, 1.0, 1.0);
  k.face(win, 1.5, 3 * R, 0, 1.42, 0.14);
  k.bx(win, 1.94, 0.34, 1.1, 0, 1.3, 1.05);
  // 车斗：两边围板、尾门、暗底
  for (const s of [-1, 1]) k.bx(body, 0.12, 0.45, 2.75, s * 0.94, 1.0, -1.3);
  k.bx(body, 1.88, 0.45, 0.12, 0, 1.0, -2.6);
  k.add(new THREE.PlaneGeometry(1.76, 2.6).rotateX(-Math.PI / 2).translate(0, 1.0, -1.3), bed);
  // 木料：车斗里一整捆（4 × 3 根），伸出尾门那截一根根分开
  const bw = 0.27;
  const bh = 0.14;
  k.bx(wood, 4 * bw + 0.06, 3 * bh + 0.03, 2.5, 0, 1.02, -1.35);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) {
      const len = 0.6 + ((i * 7 + j * 3) % 4) * 0.06;
      k.bx(
        woodEnd,
        bw - 0.02,
        bh - 0.01,
        len,
        -1.5 * bw + i * (bw + 0.02) - 0.01,
        1.02 + j * (bh + 0.01),
        -2.6 - len / 2,
      );
    }
  k.face(flag, 0.27, 3 * R, 0.4, 0.9, -3.33);
  return meshes(ctx, k.parts, [win, flag]);
};

// ════════════════════════════ 卸货台 ════════════════════════════

/**
 * box-truck 2.5 × 3.6 × 8（本地 +z = 车头）：白车厢（6 × 2.7）、海军蓝驾驶室 + 车头、侧窗、底盘、圆轮子（前一后二）；
 * 车厢两侧一条芥末黄腰带，左侧（本地 −x，倒进卸货台以后朝南）海军蓝 HARDWARE。场景里转 +90°（车头朝东、车尾贴卸货台）。
 */
const boxTruck: AssetFn = (ctx) => {
  const k = kit();
  const white = ctx.mat('truckWhite', { lightUp: 0.4, bands: [-0.35, 0.45], noShadowReceive: true });
  const whiteTop = ctx.mat('truckWhite');
  const cab = ctx.mat('hwNavy', { lightUp: 0.3, bands: [-0.3, 0.45] });
  const under = ctx.mat('ironwork');
  const win = ctx.mat('jug', { noShadowReceive: true });
  const stripe = ctx.mat('hwMustard');
  const letters = ctx.mat('hwNavy', { ...SIGN_FACE, bands: [-0.6, 0.3] });
  k.bx(under, 2.1, 0.5, 7.6, 0, 0.3, 0);
  // 轮子：轴沿 x 的圆柱（侧面看是圆），前一后二
  for (const z of [2.9, -1.7, -2.75])
    for (const s of [-1, 1])
      k.add(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 8).rotateZ(Math.PI / 2).translate(s * 1.05, 0.46, z), under);
  // 车厢：侧面（朝镜头那面落中档）+ 顶（亮档）
  const bz0 = -4.0;
  const bz1 = 1.8;
  k.bx(white, 2.5, 2.62, bz1 - bz0, 0, 0.9, (bz0 + bz1) / 2);
  k.bx(whiteTop, 2.52, 0.08, bz1 - bz0 + 0.02, 0, 3.52, (bz0 + bz1) / 2);
  // 驾驶室 + 车头
  k.bx(cab, 2.36, 2.0, 1.75, 0, 0.75, 2.85);
  k.bx(cab, 2.3, 1.05, 0.55, 0, 0.6, 4.0 - 0.275);
  for (const s of [-1, 1]) {
    k.add(new THREE.PlaneGeometry(1.0, 0.62).rotateY((s * Math.PI) / 2).translate(s * 1.185, 2.12, 3.15), win);
    // 腰带（两侧）
    k.add(
      new THREE.PlaneGeometry(bz1 - bz0 - 0.3, 3 * R)
        .rotateY((s * Math.PI) / 2)
        .translate(s * 1.255, 1.25, (bz0 + bz1) / 2),
      stripe,
    );
    // 字只画 −x 那侧（倒进卸货台以后朝南、看得见的那侧）：本地 xy 平面朝 +z 画好，转 −90°（从外面看读得正）
    if (s < 0)
      for (const g of textGeo('HARDWARE', 4 * T, 3 * R, 0, 2.35, 0)) {
        g.rotateY(-Math.PI / 2).translate(-1.26, 0, (bz0 + bz1) / 2);
        k.add(g, letters);
      }
  }
  k.add(new THREE.PlaneGeometry(2.0, 0.5).rotateX(-0.5).translate(0, 2.35, 4.02), win);
  return meshes(ctx, k.parts, [win, stripe, letters]);
};

/**
 * dock 1.5 × 1.2 × 10（原点 = 台子中心；东沿 = 本地 +x 是倒车的那边）：水泥台 + 东沿顶上一条黄边 + 三块黑缓冲块（东面）
 * + 南头三级台阶和一根芥末黄扶手。卷帘门在东墙上，看不见，不做；雨棚也不做（4.5 米高的板在 45° 下正好盖住台子和车尾）。
 */
const dock: AssetFn = (ctx) => {
  const k = kit();
  // 台面：浇筑水泥，2 米一道切缝（深浅少换）
  const conc = ctx.mat('concrete', { elem: { kind: 'planks', p: [0, 0, 1, 2], seam: 1, hi: 0.3 }, toneW: [0.2, 0.2] });
  const yellow = ctx.mat('flowerYellow', { edge: 0.1, convex: 0 });
  const bump = ctx.mat('ironwork');
  const rail = ctx.mat('hwMustard', { lightUp: 0.2, bands: [-0.1, 0.45] });
  const W = 1.5;
  const H = 1.2;
  const L = 10;
  k.bx(conc, W, H, L, 0, 0, 0);
  k.add(new THREE.PlaneGeometry(4 * T, L).rotateX(-Math.PI / 2).translate(W / 2 - 2 * T, H + 0.005, 0), yellow);
  for (const z of [-3, 0, 3]) k.bx(bump, 0.2, 0.45, 0.35, W / 2 + 0.1, 0.5, z);
  // 南头的台阶（3 级，每级 0.4 高、0.3 深）
  for (let i = 0; i < 3; i++) k.bx(conc, W, H - (i + 1) * 0.4, 0.3, 0, 0, L / 2 + 0.15 + i * 0.3);
  for (const z of [L / 2 + 0.1, L / 2 + 0.85])
    k.bx(rail, 0.1, 0.9 + (z < L / 2 + 0.5 ? H : 0.4), 0.1, -W / 2 + 0.08, 0, z);
  k.bx(rail, 0.08, 0.08, 0.95, -W / 2 + 0.08, H + 0.85, L / 2 + 0.45);
  return meshes(ctx, k.parts, [yellow, rail]);
};

/** pallet-stack 1.2 × 0.75 × 1.0（清单外，卸货台旁边一摞空货板）：五个货板摞着、每个错一点 */
const palletStack: AssetFn = (ctx) => {
  const k = kit();
  const rnd = ctx.rng(`pallet-stack:${ctx.variant}`);
  const { wood, woodDark } = palletMats(ctx);
  for (let i = 0; i < 5; i++) pallet(k, wood, woodDark, (rnd() - 0.5) * 0.1, i * 0.145, (rnd() - 0.5) * 0.08);
  return meshes(ctx, k.parts);
};

// ════════════════════════════ 店内（in-，2026-11-16 室内关卡 1+2；interiors/hardware.ts 摆） ════════════════════════════
// 进门换场景的封闭大卖场（80 × 50 米，没有屋顶，太阳照得到；镜头俯 45°、朝北）。南北向的货架只看得见顶面、南头和往过道伸出来的底层货
// （东西两面是侧着的）：所以每排货架 = 顶上一排托盘（上层，叉车取）+ 两边一条底层货的顶（下层，顾客拿）+ 芥末黄的横梁线 + 南头的端架。
// 朝南的竖面（北墙、端架、柜台正面、牌子）永远在暗档：牌子、货的正面用 SIGN_FACE 一类的光往上偏，落中档。
// 新材质（都在这里按 material-spec 手挑 3 档 × 3 色，借老材质名的组过午后调色）：inFloor（偏蓝中灰的打磨水泥地，借 roofMetal）、inSeam（地面切缝）、
// inChip*（色卡：借各色老材质，只换 opts）—— 见 IN_TONES。夜里：地面上一格一格的灯光圈（userData.night.pool），牌子、收银灯、货架顶的灯条自发光。

/** 新材质的三档（每档 [本色, 高一级, 低一级]，L = 0.2126R + 0.7152G + 0.0722B） */
const IN_TONES = {
  /**
   * 打磨水泥地（店内配色重做，用户 2026-11-16："和外景太像"）：偏蓝的中灰，荧光灯下偏冷（外景是沙、桃、赭 → 这里一点暖色都不留）。
   * 借 signBoard 的组（club：冷色不被染暖）；亮档还要乘一遍暖的顶光（G ×0.93、B ×0.85），所以原值比想要的更蓝一截。
   * 元素 = 有机形状的深浅斑（paint）+ 轮胎擦痕（缝色）
   */
  floor: {
    // 深灰绿环氧地坪（用户 2026-11-16 定：车库 / 仓库那种，半哑光）。地永远落中档（材质 bands [−2, 2]）：中档不乘暖的顶光，原值就是成品色。
    // 目标（画面里量）：L* 40～48、a* −10～−14、b* 0～+4 —— 和外景（沙桃）、体育店（浅蓝）、报社（深暖）都拉开；货、黄线在深地上跳出来
    ramp: [0x5a7a6c, 0x006a6e, 0x34483e] as Ramp3,
    tones: {
      bands: [
        [0x5a7a6c, 0x628274, 0x527264],
        [0x006a6e, 0x087276, 0x006266], // （用的这一档）深灰绿；高一级 / 低一级只差 ~7（环氧是平的，深浅斑很淡）
        [0x34483e, 0x3a4e44, 0x2e4238],
      ],
      seam: [0x40584c, 0x005258, 0x283a32], // 轮印、擦痕：比地暗 ~14
      hi: [0x6e8e80, 0x147c80, 0x40564a], // 亮边（半哑光的反光）
    } as Tones3,
  },
  /** 地面切缝（1 纹素线，比地暗；也落中档） */
  seam: { ramp: [0x004f54, 0x004f54, 0x283a32] as Ramp3 },
} as const;
type Ramp3 = [number, number, number];
type Tones3 = { bands: [Ramp3, Ramp3, Ramp3]; seam: Ramp3; hi: Ramp3 };

/** 店内共用的材质（ctx.mat 同参数复用，调多少次都是同一份） */
function inMats(ctx: AssetCtx) {
  const up = (key: Parameters<AssetCtx['mat']>[0], extra: ToonOpts = {}) =>
    ctx.mat(key, { lightUp: 0.2, bands: [-0.1, 0.45], ...extra });
  return {
    /** 钢：海军蓝立柱、栏杆（朝上的面亮、朝南的面中档） */
    navy: up('signBoard', { convex: 0.3, lightUp: 0.5, bands: [-0.4, 0.3] }),
    /** 朝南的牌子底（海军蓝，落中档） */
    board: ctx.mat('hwNavy', SIGN_FACE),
    /** 牌子上的字（芥末黄，自带 SIGN_FACE）+ 夜里发光的一份 */
    text: ctx.mat('hwMustard'),
    textNight: ctx.mat('hwMustard', { emissive: 0x6a4a10 }),
    /** 芥末黄的钢（横梁、扶手、护栏）：顶面亮档 */
    // 横梁、扶手：顶面也落中档（赭黄 L ~143；亮档 L 179 和海军蓝立柱挨着全是强边缘）
    mustard: up('hwMustard', { noShadowReceive: false, lightUp: 0, bands: [0.9, 1.5] }),
    /** 地上的漆线（芥末黄 / 海军蓝）：平的、不描边 */
    /** 地上的黄漆线（芥末黄：亮黄在蓝地上差 75 个亮度，全是强边缘） */
    lineY: ctx.mat('hwMustard', { lightUp: 0, bands: [-2, 2], noShadowReceive: false, edge: 0.05, convex: 0 }),
    lineN: ctx.mat('hwNavy', { edge: 0.05, convex: 0 }),
    dark: ctx.mat('ironwork'),
    steel: up('roofMetal', { convex: 0.4 }),
    white: up('pvc', { convex: 0.4 }),
    /** 箱子：灰白的货箱（牛皮纸色是外景的沙色一族，店里不用） */
    kraft: up('roofMetal', { elem: { kind: 'planks', p: [0, 1, 0, 0.3], seam: 1, hi: 0.4 } }),
    kraftZ: up('roofMetal', { elem: { kind: 'planks', p: [0, 0, 1, 0.42], seam: 1, hi: 0.4 } }),
    // 货板（顶面落中档：浅木色在深地上差太多，全是强边缘）
    wood: ctx.mat('woodWeathered', {
      bands: [0.7, 1.2],
      elem: { kind: 'planks', p: [0, 0, 1, 0.2], seam: 1, hi: 0.4 },
    }),
    woodDark: ctx.mat('woodWeathered', { lightUp: -0.2 }),
    top: ctx.mat('counterTop', { lightUp: 0.1 }),
  };
}
type InM = ReturnType<typeof inMats>;
type Kit = ReturnType<typeof kit>;

/** 夜里：pairs 换自发光的一份；pools = 灯光圈（本地坐标的挂点，r 半径、h 最高照到的 y）。店内不归区域、不压暗 → 亮着就给半径 */
function inNight(obj: THREE.Object3D, pairs: [THREE.Material, THREE.Material][], pools: THREE.Object3D[] = []) {
  const on = new Map(pairs);
  const off = new Map(pairs.map(([a, b]) => [b, a]));
  let lit = false;
  obj.userData.night = {
    setOn(v: boolean) {
      lit = v;
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const next = v ? on.get(m.material as THREE.Material) : off.get(m.material as THREE.Material);
        if (next) m.material = next;
      });
    },
  };
  for (const p of pools) {
    const w = new THREE.Vector3();
    p.userData.night = {
      pool: (): [number, number, number, number] => {
        p.getWorldPosition(w);
        return lit ? [w.x, w.z, p.userData.r as number, p.userData.h as number] : [w.x, w.z, 0, 0];
      },
    };
    obj.add(p);
  }
}

/** 一件店内资产画进一个 kit：几何 + 不投影的材质 + 夜里换的材质对（画廊单放一件、场景里同一种合成一份都走它） */
interface InDrawn {
  k: Kit;
  noCast: THREE.Material[];
  night: [THREE.Material, THREE.Material][];
}
type InDraw = (ctx: AssetCtx) => InDrawn;
const asAsset =
  (draw: InDraw): AssetFn =>
  (ctx) => {
    const d = draw(ctx);
    const g = meshes(ctx, d.k.parts, d.noCast);
    inNight(g, d.night);
    return g;
  };
/** 场景里一处：哪件资产（IN_DRAW 里的 id）、局部坐标、绕 y 转 rot、变体 v */
export interface InPlace {
  id: string;
  x: number;
  z: number;
  rot?: number;
  v?: number;
}
/**
 * 好几件（同一种或不同种）摆好，合成一份（一种材质一个网格：省绘制次数；店里不动的东西全合在一起）。
 * 第 i 处的 variant = v + 100·i（各处随机不同，v 的 %4 / %5 不变）。原点 = 局部原点（场景 c.asset 再挪到世界）。
 */
export function inMany(ctx: AssetCtx, places: InPlace[], name = 'in-hw-many'): THREE.Group {
  const parts: Part[] = [];
  const noCast = new Set<THREE.Material>();
  const night = new Map<THREE.Material, THREE.Material>();
  const m = new THREE.Matrix4();
  places.forEach((p, i) => {
    const draw = IN_DRAW[p.id];
    if (!draw) throw new Error(`inMany: 没有 ${p.id}`);
    const d = draw({ ...ctx, variant: (p.v ?? 0) + 100 * i });
    m.makeRotationY(p.rot ?? 0).setPosition(p.x, 0, p.z);
    for (const [g, mat] of d.k.parts) parts.push([g.applyMatrix4(m), mat]);
    for (const x of d.noCast) noCast.add(x);
    for (const [a, b] of d.night) night.set(a, b);
  });
  const g = meshes(ctx, parts, [...noCast]);
  g.name = `valley-asset:${name}`;
  inNight(g, [...night]);
  return g;
}

/** 一行像素字的几何都加进 kit（朝 +z 的平面）；返回宽（米） */
function inText(k: Kit, m: THREE.Material, s: string, px: number, py: number, cx: number, cy: number, z: number) {
  for (const g of textGeo(s, px, py, cx, cy, z)) k.add(g, m);
  return textCells(s) * px;
}

/** 朝南的牌子：海军蓝板 + 芥末黄字（上下各一条芥末黄细边）。cx/cy = 板中心，z = 板的南面 */
function inSign(
  k: Kit,
  M: InM,
  s: string,
  w: number,
  h: number,
  cx: number,
  cy: number,
  z: number,
  px = 3 * T,
  py = 2 * R,
) {
  k.bx(M.board, w, h, 0.08, cx, cy - h / 2, z - 0.04);
  k.face(M.text, w, R, cx, cy + h / 2 - R / 2, z + 0.005);
  k.face(M.text, w, R, cx, cy - h / 2 + R / 2, z + 0.005);
  inText(k, M.text, s, px, py, cx, cy, z + 0.01);
}

/** 横放的圆柱（沿 x 或 z），中心 (x, y, z) */
function lying(axis: 'x' | 'z', r: number, len: number, x: number, y: number, z: number, n = 6) {
  const g = new THREE.CylinderGeometry(r, r, len, n, 1, false);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else g.rotateX(Math.PI / 2);
  return g.translate(x, y, z);
}

// ── 货 ──
// 类别：0 A 灌溉水管、1 B 紧固件、2 C 工具、3 D 油漆、4 E 建材·沙
export type InCat = 0 | 1 | 2 | 3 | 4;
export const IN_CAT_NAME = ['HOSE', 'BOLTS', 'TOOLS', 'PAINT', 'SAND'] as const;
/** 过道牌上的字（A～F；F = 木料） */
export const IN_AISLE_NAME = [...IN_CAT_NAME, 'LUMBER'] as const;

/** 货的材质；face = 朝南摆的（端架上）：光往上偏，正面落中档（不然是一排暗块） */
function goodsMats(ctx: AssetCtx, face = false) {
  const up = (key: Parameters<AssetCtx['mat']>[0], extra: ToonOpts = {}) =>
    ctx.mat(key, {
      lightUp: 0.2,
      bands: [-0.1, 0.45],
      convex: 0.3,
      ...extra,
      ...(face ? { lightUp: 0.6, bands: [-0.45, 0.3] as [number, number] } : {}),
    });
  const boxes = (key: Parameters<AssetCtx['mat']>[0], w = 0.42) =>
    up(key, { elem: { kind: 'planks', p: [0, 0, 1, w], seam: 1, hi: 0.5 } });
  return {
    hose: up('seat', { convex: 0.4 }),
    hoseBlue: up('clothBlue', { convex: 0.4 }),
    blueBox: boxes('clothBlue'),
    greenBox: boxes('seat', 0.36),
    pipe: up('pvc', { convex: 0.5 }),
    bins: boxes('hwNavy', 0.3),
    redBox: boxes('clothRed', 0.34),
    /** 电动工具的箱子（绿：店里的工具牌子；橙色在这里只留桶和少数箱子） */
    orange: boxes('seat', 0.5),
    yellowCase: up('hwMustard', {
      noShadowReceive: false,
      elem: { kind: 'planks', p: [0, 0, 1, 0.4], seam: 1, hi: 0.5 },
    }),
    pail: up('pvc', { convex: 0.4 }),
    /** 彩色漆桶（蓝；橙色的少用：整店往暖色偏就和外景近了） */
    pailOrange: up('clothBlue', { convex: 0.4 }),
    pailGreen: up('seat', { convex: 0.4 }),
    pailNavy: up('hwNavy', { convex: 0.4 }),
    lidNavy: up('hwNavy', { lightUp: 0.4 }),
    lidRed: up('clothRed', { lightUp: 0.4 }),
    lidPurple: up('flowerPurple', { lightUp: 0.4 }),
    lidGreen: up('green', { lightUp: 0.4 }),
    can: up('roofMetal', { convex: 0.5 }),
    bag: up('pvc', { elem: { kind: 'planks', p: [1, 0, 0, 0.56], seam: 0, hi: 0 } }),
    bagGrey: up('roofMetal', { convex: 0.2 }),
    /** 店里自己牌子的袋装沙（芥末黄袋子）、草籽 / 肥料（绿袋） */
    bagBrand: up('hwMustard', { convex: 0.2, noShadowReceive: false }),
    bagGreen: up('seat', { convex: 0.2 }),
    bagClay: up('clay', { convex: 0.2 }),
    paver: boxes('pot', 0.3),
    hole: ctx.mat('ironwork', { edge: 0, convex: 0 }),
  };
}
type GM = ReturnType<typeof goodsMats>;

/**
 * 底层（顾客拿的那层）一跨的货：x 从 xi（靠背那头）到 xo（过道那头），z 从 za 到 zb。只有靠过道那 0.4 米的顶和南面看得见，
 * 所以大件 = 一整块（材质带"一箱一块"的板缝），细节只做在外沿顶上。s = 朝哪边（+1 东、−1 西）。
 */
function baseGoods(
  k: Kit,
  G: GM,
  M: InM,
  cat: InCat,
  xi: number,
  xo: number,
  za: number,
  zb: number,
  rnd: () => number,
) {
  const s = Math.sign(xo - xi);
  const xc = (xi + xo) / 2;
  const dw = Math.abs(xo - xi);
  let z = za + 0.05;
  while (z < zb - 0.3) {
    const len = Math.min(zb - 0.05 - z, 0.6 + rnd() * 0.5);
    const zc = z + len / 2;
    const pick = rnd();
    if (cat === 0) {
      if (pick < 0.45) {
        // 水管盘：靠过道一摞绿 / 蓝的扁圆（中间暗的孔），后面一箱
        const r = Math.min(len / 2 - 0.02, 0.32);
        const n = 3 + Math.floor(rnd() * 4);
        const m = rnd() < 0.6 ? G.hose : G.hoseBlue;
        const cx = xo - s * (r + 0.02);
        for (let i = 0; i < n; i++) k.cyl(m, r, r, 0.11, cx, i * 0.115, zc, 8);
        k.cyl(G.hole, r * 0.4, r * 0.4, 0.01, cx, n * 0.115, zc, 6);
        k.bx(M.kraftZ, dw - 2 * r - 0.1, 0.9, len, xc - s * r, 0, zc);
      } else if (pick < 0.75) {
        k.bx(G.blueBox, dw, 0.75 + rnd() * 0.5, len, xc, 0, zc);
      } else {
        // 一捆白水管（沿 z 横放，金字塔码）
        const h = 3;
        for (let row = 0; row < h; row++)
          for (let i = 0; i < h - row; i++)
            k.add(lying('z', 0.07, len, xo - s * (0.09 + i * 0.15 + row * 0.075), 0.07 + row * 0.13, zc), G.pipe);
        k.bx(G.greenBox, dw - 0.5, 1.0, len, xc - s * 0.25, 0, zc);
      }
    } else if (cat === 1) {
      if (pick < 0.55) {
        // 零件盒：两级台阶（外低内高），海军蓝 / 红
        const m = rnd() < 0.6 ? G.bins : G.redBox;
        k.bx(m, dw * 0.45, 0.7, len, xo - s * dw * 0.225, 0, zc);
        k.bx(m, dw * 0.55, 1.1, len, xi + s * dw * 0.275, 0, zc);
      } else k.bx(M.kraftZ, dw, 0.6 + rnd() * 0.7, len, xc, 0, zc);
    } else if (cat === 2) {
      if (pick < 0.4) {
        // 红工具柜：一块高的 + 顶上一条暗的把手
        k.bx(G.redBox, dw, 1.05, len, xc, 0, zc);
        k.bx(G.hole, 0.06, 0.04, len - 0.1, xo - s * 0.08, 1.05, zc);
      } else if (pick < 0.7) k.bx(rnd() < 0.5 ? G.orange : G.bins, dw, 0.5 + rnd() * 0.8, len, xc, 0, zc);
      else k.bx(G.yellowCase, dw, 0.45 + rnd() * 0.4, len, xc, 0, zc);
    } else if (cat === 3) {
      // 漆桶：靠过道两排白桶（6 边）码 2～3 层，桶盖彩色；后面一箱
      const lids = [G.lidNavy, G.lidRed, G.lidPurple, G.lidGreen, G.pail];
      const lid = lids[Math.floor(rnd() * lids.length)];
      const big = pick < 0.6;
      // 桶身：白 / 橙（大卖场的橙桶）/ 海军蓝（店里自己的牌子）
      const body = [G.pail, G.pailNavy, G.pailGreen, G.pailNavy, G.pailOrange][Math.floor(rnd() * 5)];
      const r = big ? 0.16 : 0.1;
      const h = big ? 0.36 : 0.2;
      const layers = big ? 2 + Math.floor(rnd() * 2) : 3 + Math.floor(rnd() * 2);
      const nz = Math.max(1, Math.floor(len / (2 * r + 0.02)));
      for (let c = 0; c < 2; c++)
        for (let i = 0; i < nz; i++) {
          const cx = xo - s * (r + 0.01 + c * (2 * r + 0.02));
          const cz = z + r + 0.02 + i * (2 * r + 0.02);
          for (let l = 0; l < layers; l++)
            k.add(
              new THREE.CylinderGeometry(r, r * 0.94, h, 6, 1, true)
                .rotateY(Math.PI / 6)
                .translate(cx, l * (h + 0.01) + h / 2, cz),
              big ? body : G.can,
            );
          k.add(
            new THREE.CircleGeometry(r, 6)
              .rotateX(-Math.PI / 2)
              .rotateY(Math.PI / 6)
              .translate(cx, layers * (h + 0.01) - 0.01, cz),
            lid,
          );
        }
      k.bx(M.kraftZ, dw - 4 * r - 0.1, 0.9, len, xi + (s * (dw - 4 * r - 0.1)) / 2, 0, zc);
    } else {
      // 袋装（沙、水泥、红土补土沙）：枕头袋码 3～5 层，层间错一点
      const m = pick < 0.12 ? G.bagBrand : pick < 0.45 ? G.bagGrey : pick < 0.9 ? G.bagGreen : G.bagClay;
      const layers = 3 + Math.floor(rnd() * 3);
      for (let l = 0; l < layers; l++) {
        const o = l % 2 ? 0.03 : -0.03;
        k.add(bagGeo(dw - 0.06, 0.16, len - 0.06, 0.03).translate(xc + o, l * 0.16, zc - o), m);
      }
    }
    z += len + 0.05;
  }
}

/** 上层一托货（1.0 × h × 1.1，原点 = 托盘底面中心）：货板 + 一整块缠膜的货身 + 顶上一层分得开的箱 / 桶 / 袋（顶面看得见的那层） */
function palletLoad(k: Kit, G: GM, M: InM, cat: InCat | 'clay', x: number, y: number, z: number, rnd: () => number) {
  // 货板（沿 z 的板缝；三根垫块沿 x）
  k.bx(M.wood, 1.0, 0.035, 1.1, x, y + 0.105, z);
  for (const bx of [-0.42, 0, 0.42]) k.bx(M.woodDark, 0.14, 0.105, 1.1, x + bx, y, z);
  const y0 = y + 0.14;
  const h = 0.55 + rnd() * 0.45;
  if (cat === 'clay' || cat === 4) {
    // 袋子（枕头形）码满一托
    const r2 = rnd();
    const m = cat === 'clay' ? G.bagClay : r2 < 0.15 ? G.bagBrand : r2 < 0.7 ? G.bagGreen : G.bagGrey;
    const layers = 4 + Math.floor(rnd() * 2);
    for (let l = 0; l < layers; l++)
      for (let i = 0; i < 2; i++) {
        const o = l % 2 ? 0.02 : -0.02;
        k.add(bagGeo(0.47, 0.16, 1.04, 0.03).translate(x - 0.245 + i * 0.49 + o, y0 + l * 0.16, z), m);
      }
    return;
  }
  if (cat === 3) {
    // 漆桶：3 × 3 白桶两层，盖子一托一个颜色
    const lid = [G.lidNavy, G.lidRed, G.lidPurple, G.lidGreen][Math.floor(rnd() * 4)];
    const body = [G.pail, G.pailNavy, G.pailGreen, G.pailNavy][Math.floor(rnd() * 4)];
    for (let l = 0; l < 2; l++)
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          const cx = x - 0.33 + i * 0.33;
          const cz = z - 0.36 + j * 0.36;
          const yb = y0 + l * 0.37;
          k.add(
            new THREE.CylinderGeometry(0.155, 0.145, 0.36, 6, 1, true)
              .rotateY(Math.PI / 6)
              .translate(cx, yb + 0.18, cz),
            body,
          );
          if (l === 1)
            k.add(
              new THREE.CircleGeometry(0.155, 6)
                .rotateX(-Math.PI / 2)
                .rotateY(Math.PI / 6)
                .translate(cx, yb + 0.36, cz),
              lid,
            );
        }
    return;
  }
  // 箱子：缠膜的货身（一块）+ 顶层 2 × 3 箱，高低差一点（顶面一箱一块）
  const body =
    cat === 0
      ? rnd() < 0.5
        ? G.greenBox
        : G.blueBox
      : cat === 2
        ? rnd() < 0.5
          ? G.orange
          : G.redBox
        : rnd() < 0.3
          ? M.kraft
          : G.bins;
  const topM = cat === 1 ? (rnd() < 0.3 ? M.kraft : rnd() < 0.5 ? G.redBox : G.yellowCase) : body;
  k.bx(body, 0.98, h, 1.08, x, y0, z);
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 3; j++) {
      if (rnd() < 0.12) continue;
      k.bx(topM, 0.46, 0.2 + rnd() * 0.06, 0.34, x - 0.245 + i * 0.49, y0 + h, z - 0.36 + j * 0.36);
    }
}

/** 一排货架（原点 = 局部坐标原点；cx = 中心 x）的参数 */
export interface InRackSpec {
  cx: number;
  z0: number;
  bays: number;
  bay: number;
  /** 西面、东面的货（类别） */
  west: InCat;
  east: InCat;
  /** 上层哪几格换成红土补土沙（H2 叉车要取的）：[东 1 / 西 −1, 第几跨, 第几托] */
  clay?: [number, number, number][];
}
/** 货架宽（两面背靠背）、立柱高、两层横梁的高 */
export const IN_RACK = { w: 3, h: 4.8, beams: [1.75, 3.35], reach: 0.6 } as const;

/**
 * 一排或几排高货架（全部合成一份：一种材质一个网格）：海军蓝立柱 + 芥末黄横梁（两层），上层托盘（叉车取），底层货往过道多伸 0.4 米（顾客拿），
 * 南头端框的横撑、货架顶上的灯条（夜里亮）。返回 Group；挡路由场景按 [cx ± (1.5 + 0.4)] × [z0, z1] 挡。
 */
export function inRacks(ctx: AssetCtx, specs: InRackSpec[]): THREE.Group {
  const k = kit();
  const M = inMats(ctx);
  const G = goodsMats(ctx);
  const lamp = ctx.mat('roofMetal', { lightUp: 0.4, noShadowReceive: true });
  const lampOn = ctx.mat('signPaint', { emissive: 0x403422, noShadowReceive: true });
  const H = IN_RACK.h;
  const hw = IN_RACK.w / 2;
  const fi = 0.2; // 背靠背两片之间的缝（半宽）
  for (const sp of specs) {
    const rnd = ctx.rng(`in-hw-rack:${sp.cx}:${sp.z0}`);
    const z1 = sp.z0 + sp.bays * sp.bay;
    // 立柱（每跨界一组 4 根）
    for (let i = 0; i <= sp.bays; i++) {
      const z = sp.z0 + i * sp.bay;
      for (const x of [-hw + 0.07, -fi - 0.07, fi + 0.07, hw - 0.07]) k.bx(M.navy, 0.14, H, 0.14, sp.cx + x, 0, z);
      // 顶上的连杆（跨过背缝）
      k.bx(M.navy, 2 * fi + 0.28, 0.1, 0.1, sp.cx, H - 0.1, z);
    }
    // 南头端框：横撑（看得见的那面）
    for (const s of [-1, 1])
      for (const y of [0.25, 2.55, H - 0.35])
        k.bx(M.navy, hw - fi, 0.1, 0.1, sp.cx + (s * (fi + hw)) / 2, y, z1 + 0.02);
    for (let b = 0; b < sp.bays; b++) {
      const za = sp.z0 + b * sp.bay;
      const zb = za + sp.bay;
      const zc = (za + zb) / 2;
      for (const s of [-1, 1]) {
        const cat = s < 0 ? sp.west : sp.east;
        // 两层横梁（外沿、里沿各一根）
        for (const y of IN_RACK.beams)
          for (const x of [fi + 0.06, hw - 0.05]) k.bx(M.mustard, 0.09, 0.14, sp.bay - 0.14, sp.cx + s * x, y, zc);
        // 上层两托（偶尔空一格）
        for (let p = 0; p < 2; p++) {
          const isClay = sp.clay?.some(([cs, cb, cp]) => cs === s && cb === b && cp === p);
          if (!isClay && rnd() < 0.1) continue;
          palletLoad(
            k,
            G,
            M,
            isClay ? 'clay' : cat,
            sp.cx + (s * (fi + hw)) / 2,
            IN_RACK.beams[1] + 0.14,
            za + 0.72 + p * 1.31,
            rnd,
          );
        }
        // 中层：只有最南一跨看得见（端架上面露出来），别的跨不画
        if (b === sp.bays - 1)
          k.bx(
            cat === 2 ? G.orange : M.kraftZ,
            hw - fi - 0.2,
            1.1,
            sp.bay - 0.3,
            sp.cx + (s * (fi + hw)) / 2,
            IN_RACK.beams[0] + 0.14,
            zc,
          );
        // 底层货（往过道多伸 reach）
        baseGoods(k, G, M, cat, sp.cx + s * fi, sp.cx + s * (hw + IN_RACK.reach), za, zb, rnd);
      }
      // 货架顶的灯条（背缝上，每跨一段）
      k.bx(lamp, 0.2, 0.08, sp.bay * 0.6, sp.cx, H, zc);
    }
  }
  // 货架不投影：店里是天窗的顶光（没有屋顶只是为了镜头看得见），4.8 米的货架在傍晚拉出十几米长的抖动影子，
  // 整条过道的影子边全是强边缘（17.6 点 0.07）；货架自己的明暗（顶亮、南面暗）照旧
  const g = meshes(ctx, k.parts, [...new Set(k.parts.map(([, m]) => m))]);
  inNight(g, [[lamp, lampOn]]);
  return g;
}

/** in-hw-rack（画廊用）：一排 3 跨的货架，西面 = variant 类、东面 = 下一类 */
const inRack: AssetFn = (ctx) => {
  const v = (ctx.variant % 5) as InCat;
  return inRacks(ctx, [
    { cx: 0, z0: -4, bays: 3, bay: 2.75, west: v, east: ((v + 1) % 5) as InCat, clay: v === 3 ? [[1, 1, 0]] : [] },
  ]);
};

/**
 * in-hw-endcap 3 × 2.3 × 1.0（原点 = 端架落地点中心，正面朝南 +z）：货架南头的端架（促销）：海军蓝底座和背板、三层板（板沿一条芥末黄的价签槽），
 * 每层一类货的正面；顶上一块海军蓝牌子写类别。variant = 类别。
 */
const inEndcap: InDraw = (ctx) => {
  const k = kit();
  const M = inMats(ctx);
  const G = goodsMats(ctx, true);
  const cat = (ctx.variant % 5) as InCat;
  const rnd = ctx.rng(`in-hw-endcap:${ctx.variant}`);
  const W = 3;
  const D = 1.0;
  // 背板：牛皮色洞洞板（货在浅底上跳出来；海军蓝框）
  const back = ctx.mat('roofMetal', {
    lightUp: 0.45,
    bands: [-0.3, 0.4],
    elem: { kind: 'stones', size: [5, 4], seam: 0.6, hi: 0.3 },
  });
  // 底座、背板、侧板
  k.bx(M.navy, W, 0.18, D, 0, 0, 0);
  k.bx(back, W, 1.95, 0.12, 0, 0.18, -D / 2 + 0.06);
  for (const s of [-1, 1]) k.bx(M.navy, 0.08, 1.95, D, s * (W / 2 - 0.04), 0.18, 0);
  // 三层板 + 价签槽
  const shelves = [0.18, 0.8, 1.4];
  for (const y of shelves) {
    k.bx(M.steel, W - 0.16, 0.04, D - 0.15, 0, y, 0.06);
    k.face(M.lineY, W - 0.16, R, 0, y - R / 2 + 0.04, D / 2 + 0.005);
  }
  // 货（每层一排，正面朝南）
  const face = (m: THREE.Material, n: number, w: number, h: number, d: number, y: number) => {
    const step = (W - 0.3) / n;
    for (let i = 0; i < n; i++) k.bx(m, w, h, d, -W / 2 + 0.15 + step * (i + 0.5), y, 0.1 + (rnd() - 0.5) * 0.06);
  };
  shelves.forEach((y, li) => {
    const y0 = y + 0.04;
    if (cat === 0) {
      if (li === 0)
        for (let i = 0; i < 4; i++)
          for (let l = 0; l < 4; l++)
            k.cyl(li % 2 ? G.hoseBlue : G.hose, 0.28, 0.28, 0.11, -1.05 + i * 0.7, y0 + l * 0.115, 0.05, 8);
      else face(li === 1 ? G.blueBox : G.greenBox, 6, 0.38, 0.42, 0.5, y0);
    } else if (cat === 1) face(li === 2 ? G.redBox : G.bins, 8, 0.3, 0.3, 0.55, y0);
    else if (cat === 2)
      face(
        li === 0 ? G.redBox : li === 1 ? G.orange : G.yellowCase,
        li === 0 ? 3 : 5,
        li === 0 ? 0.8 : 0.45,
        li === 0 ? 0.55 : 0.35,
        0.6,
        y0,
      );
    else if (cat === 3) {
      const n = li === 2 ? 9 : 6;
      const r = li === 2 ? 0.1 : 0.15;
      const h = li === 2 ? 0.2 : 0.34;
      const lids = [G.lidNavy, G.lidRed, G.lidPurple, G.lidGreen];
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + 0.2 + ((W - 0.4) / n) * (i + 0.5);
        k.add(
          new THREE.CylinderGeometry(r, r, h, 6, 1, true).rotateY(Math.PI / 6).translate(x, y0 + h / 2, 0.15),
          li === 2 ? G.can : G.pail,
        );
        k.add(
          new THREE.CircleGeometry(r, 6)
            .rotateX(-Math.PI / 2)
            .rotateY(Math.PI / 6)
            .translate(x, y0 + h, 0.15),
          lids[(i + li) % 4],
        );
      }
    } else {
      for (let i = 0; i < 4; i++)
        for (let l = 0; l < (li === 0 ? 3 : 2); l++)
          k.add(
            bagGeo(0.6, 0.15, 0.55, 0.03).translate(-1.0 + i * 0.67, y0 + l * 0.15, 0.08),
            li === 1 ? G.bagClay : i % 2 ? G.bag : G.bagGrey,
          );
    }
  });
  // 头牌
  k.bx(M.navy, 0.1, 0.5, 0.1, -W / 2 + 0.3, 2.13, -D / 2 + 0.06);
  k.bx(M.navy, 0.1, 0.5, 0.1, W / 2 - 0.3, 2.13, -D / 2 + 0.06);
  inSign(k, M, IN_CAT_NAME[cat], W, 0.55, 0, 2.63, -D / 2 + 0.2, 3 * T, 2 * R);
  return { k, noCast: [M.text, M.lineY], night: [] };
};

/**
 * in-hw-aisle-sign 6.5 × 1.4（原点 = 过道中心、地面；牌子在 y 3.9…5.0）：跨过道的海军蓝横梁（两头搭在货架顶上）+ 吊着的过道牌：
 * 大字母（A～E，芥末黄）+ 下面一行类别。variant = 过道（0 = A）。夜里字发光。
 */
const inAisleSign: InDraw = (ctx) => {
  const k = kit();
  const M = inMats(ctx);
  // variant：个位 = 过道（0 = A … 5 = F），十位 1 = 窄过道（顾客走的 3.6 米），0 = 叉车过道（6 米）
  const v = ctx.variant % 10;
  const span = Math.floor(ctx.variant / 10) % 10 === 1 ? 3.6 : 6;
  k.bx(M.navy, span, 0.16, 0.16, 0, IN_RACK.h + 0.1, 0);
  for (const x of [-0.7, 0.7]) k.bx(M.dark, 0.05, 0.3, 0.05, x, IN_RACK.h - 0.2, 0);
  const W = 2.8;
  const Hs = 1.1;
  const cy = IN_RACK.h - 0.2 - Hs / 2;
  k.bx(M.board, W, Hs, 0.1, 0, cy - Hs / 2, 0);
  k.face(M.text, W, R, 0, cy + Hs / 2 - R / 2, 0.055);
  inText(k, M.text, 'ABCDEF'[v % 6], 5 * T, 3 * R, -0.95, cy + 0.02, 0.06);
  inText(k, M.text, IN_AISLE_NAME[v % 6], 2 * T, R, 0.45, cy + 0.02, 0.06);
  return { k, noCast: [M.text, M.navy, M.board, M.dark], night: [[M.text, M.textNight]] };
};

// ── 地面 ──

/** 地上的漆：rect = [x0, z0, x1, z1]（局部米）；dash = 折线（芥末黄虚线，每段 0.9 空 0.6）；hazard = 斑马框（芥末黄 / 海军蓝方块轮流） */
export interface InFloorMarks {
  lines?: [number, number, number, number][];
  navy?: [number, number, number, number][];
  dash?: [number, number][][];
  hazard?: [number, number, number, number][];
  /** 车道：折线两边各一条实线（宽 0.12），离中线 half 米（只认横平竖直的折线） */
  lanes?: { pts: [number, number][]; half: number }[];
  /** 铺了深蓝地砖的区：[x0, z0, x1, z1] */
  tiles?: [number, number, number, number][];
  /** 园艺区的绿色橡胶垫：[x0, z0, x1, z1] */
  garden?: [number, number, number, number][];
  /** 调漆区地上一条色带（一格一个颜色，沿 x）：[x0, z0, x1, z1] */
  paintBand?: [number, number, number, number][];
  /** 油渍（收货门、叉车位附近）：[x, z, 半径] */
  oil?: [number, number, number][];
  /** 叉车轮印：折线（两条 1 纹素的暗线，离中线 ±0.45 米，断断续续） */
  tyres?: [number, number][][];
}

/**
 * 店内的地（原点 = 局部原点；x 0…w、z 0…d）：打磨水泥（inFloor，有机深浅斑 + 擦痕），6 米一道切缝（1 纹素暗线），芥末黄 / 海军蓝的漆线。
 * 盖在框架的地板上面 1.5 厘米（不共面）。夜里：pools 里每个点一盏灯光圈。
 */
export function inFloor(
  ctx: AssetCtx,
  w: number,
  d: number,
  marks: InFloorMarks,
  pools: [number, number][] = [],
): THREE.Group {
  const k = kit();
  const M = inMats(ctx);
  const floor = ctx.mat('roofMetal', {
    ramp: IN_TONES.floor.ramp,
    tones: IN_TONES.floor.tones,
    edge: 0.05,
    convex: 0,
    elem: { kind: 'paint', size: [18, 11], density: [0.01, 0.1], patch: 4 },
    toneW: [0.2, 0.2],
    bands: [-2, 2],
  });
  const seam = ctx.mat('roofMetal', { ramp: IN_TONES.seam.ramp, edge: 0, convex: 0, bands: [-2, 2] });
  const Y = 0.07; // 框架地板顶在 0.02（它投影）：差太少，傍晚太阳低时地上满是自影麻点
  const flat = (m: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number) =>
    k.add(
      new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2),
      m,
    );
  flat(floor, 0, 0, w, d, Y);
  // 切缝：6 米一格（1 纹素）
  for (let x = 6; x < w; x += 6) flat(seam, x - T / 2, 0, x + T / 2, d, Y + 0.004);
  for (let z = 6; z < d; z += 6) flat(seam, 0, z - T / 2, w, z + T / 2, Y + 0.004);
  const y2 = Y + 0.008;
  for (const [x0, z0, x1, z1] of marks.lines ?? []) flat(M.lineY, x0, z0, x1, z1, y2);
  // 前区 / 调漆区的地砖：深蓝的方砖（stones 方块 + 1 纹素砖缝），比打磨水泥深、饱和 —— 收银、调漆两块一眼分出来
  const tile = ctx.mat('signBoard', {
    ramp: [0x3c64c8, 0x3050a8, 0x24387c],
    tones: {
      bands: [
        [0x3c64c8, 0x4670d2, 0x345abc],
        [0x3050a8, 0x385ab2, 0x2a489c],
        [0x24387c, 0x2a4084, 0x203270],
      ],
      seam: [0x2e4ea6, 0x243e88, 0x1a2a60],
      hi: [0x5a82e0, 0x4a6ac4, 0x34488e],
    },
    edge: 0.05,
    convex: 0,
    elem: { kind: 'stones', size: [13, 9], seam: 0.6, hi: 0.3 },
  });
  for (const [x0, z0, x1, z1] of marks.tiles ?? []) flat(tile, x0, z0, x1, z1, Y + 0.004);
  // 园艺区：绿橡胶垫（方块垫子 + 1 纹素缝）；地永远落中档
  const mat = ctx.mat('seat', {
    edge: 0.05,
    convex: 0,
    bands: [-2, 2],
    elem: { kind: 'stones', size: [12, 9], seam: 0.6, hi: 0.2 },
  });
  for (const [x0, z0, x1, z1] of marks.garden ?? []) flat(mat, x0, z0, x1, z1, Y + 0.004);
  // 调漆区色带：一格 1.1 米一个颜色
  const band = (['flowerRed', 'toolOrange', 'flowerYellow', 'green', 'clothBlue', 'flowerPurple'] as const).map((key) =>
    ctx.mat(key, { edge: 0.05, convex: 0, bands: [-2, 2] }),
  );
  for (const [x0, z0, x1, z1] of marks.paintBand ?? []) {
    const n = Math.max(1, Math.round((x1 - x0) / 1.1));
    for (let i = 0; i < n; i++)
      flat(band[i % band.length], x0 + ((x1 - x0) * i) / n, z0, x0 + ((x1 - x0) * (i + 1)) / n - T, z1, Y + 0.006);
  }
  // 油渍：暗灰的不规则斑（三个圆叠一块）
  const oilM = ctx.mat('roofMetal', { ramp: [0x2c3a36, 0x2c3a36, 0x202a28], edge: 0, convex: 0, bands: [-2, 2] });
  const orng = ctx.rng('in-hw-floor:oil');
  for (const [x, z, r] of marks.oil ?? [])
    for (let i = 0; i < 3; i++)
      k.add(
        new THREE.CircleGeometry(r * (0.5 + orng() * 0.5), 9)
          .rotateX(-Math.PI / 2)
          .translate(x + (orng() - 0.5) * r, Y + 0.003, z + (orng() - 0.5) * r * 0.6),
        oilM,
      );
  // 叉车轮印：沿路两条断断续续的暗线（1 纹素宽，段长 1～4 米）
  const trng = ctx.rng('in-hw-floor:tyre');
  for (const pts of marks.tyres ?? [])
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / L;
      const dz = (bz - az) / L;
      for (const s of [-0.45, 0.45])
        for (let u = trng() * 2; u < L; ) {
          const len = 1 + trng() * 3;
          const u1 = Math.min(L, u + len);
          const x0 = ax + dx * u - dz * s;
          const z0 = az + dz * u + dx * s;
          const x1 = ax + dx * u1 - dz * s;
          const z1 = az + dz * u1 + dx * s;
          flat(
            seam,
            Math.min(x0, x1) - T / 2,
            Math.min(z0, z1) - T / 2,
            Math.max(x0, x1) + T / 2,
            Math.max(z0, z1) + T / 2,
            Y + 0.005,
          );
          u = u1 + 1 + trng() * 4;
        }
    }
  for (const [x0, z0, x1, z1] of marks.navy ?? []) flat(M.lineN, x0, z0, x1, z1, y2);
  // 虚线（宽 0.12 米 ≈ 3 纹素）
  for (const pts of marks.dash ?? [])
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < L; t += 1.5) {
        const t1 = Math.min(L, t + 0.9);
        const x0 = ax + ((bx - ax) * t) / L;
        const z0 = az + ((bz - az) * t) / L;
        const x1 = ax + ((bx - ax) * t1) / L;
        const z1 = az + ((bz - az) * t1) / L;
        const hw = 0.06;
        flat(
          M.lineY,
          Math.min(x0, x1) - (ax === bx ? hw : 0),
          Math.min(z0, z1) - (az === bz ? hw : 0),
          Math.max(x0, x1) + (ax === bx ? hw : 0),
          Math.max(z0, z1) + (az === bz ? hw : 0),
          y2,
        );
      }
    }
  // 车道边线（横平竖直的折线）：每段两边各一条；拐角处外侧那条多伸 half、里侧那条少 half，正好接成一个直角
  for (const { pts, half } of marks.lanes ?? [])
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-6) continue;
      const dx = (bx - ax) / L;
      const dz = (bz - az) / L;
      const dir = (p: [number, number], q: [number, number]) => {
        const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        return [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
      };
      const prev = i > 0 ? dir(pts[i - 1], pts[i]) : null;
      const next = i + 2 < pts.length ? dir(pts[i + 1], pts[i + 2]) : null;
      for (const s of [-1, 1]) {
        // 这一边的法线（左手 = (−dz, dx)）
        const nx = -dz * s;
        const nz = dx * s;
        // 起点：法线和前一段方向同向 = 外侧 → 往回伸 half；终点：法线朝下一段拐的方向 = 里侧 → 缩 half
        const t0 = prev ? (nx * prev[0] + nz * prev[1] > 0 ? half : -half) : 0;
        const t1 = next ? (nx * next[0] + nz * next[1] > 0 ? -half : half) : 0;
        const x0 = ax - dx * t0 + nx * half;
        const z0 = az - dz * t0 + nz * half;
        const x1 = bx + dx * t1 + nx * half;
        const z1 = bz + dz * t1 + nz * half;
        const lw = 0.06;
        flat(M.lineY, Math.min(x0, x1) - lw, Math.min(z0, z1) - lw, Math.max(x0, x1) + lw, Math.max(z0, z1) + lw, y2);
      }
    }
  // 斑马框：一圈 0.3 米宽的边，0.5 米一块轮流黄 / 蓝
  for (const [x0, z0, x1, z1] of marks.hazard ?? []) {
    const b = 0.3;
    const run = (ax: number, az: number, bx: number, bz: number) => {
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(L / 0.5));
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        const m = i % 2 ? M.lineN : M.lineY;
        const xa = ax + (bx - ax) * t0;
        const xb = ax + (bx - ax) * t1;
        const za = az + (bz - az) * t0;
        const zb = az + (bz - az) * t1;
        flat(
          m,
          Math.min(xa, xb) - (ax === bx ? b / 2 : 0),
          Math.min(za, zb) - (az === bz ? b / 2 : 0),
          Math.max(xa, xb) + (ax === bx ? b / 2 : 0),
          Math.max(za, zb) + (az === bz ? b / 2 : 0),
          y2,
        );
      }
    };
    run(x0 + b / 2, z0 + b / 2, x1 - b / 2, z0 + b / 2);
    run(x0 + b / 2, z1 - b / 2, x1 - b / 2, z1 - b / 2);
    run(x0 + b / 2, z0 + b, x0 + b / 2, z1 - b);
    run(x1 - b / 2, z0 + b, x1 - b / 2, z1 - b);
  }
  const g = meshes(ctx, k.parts, [floor, seam, tile, mat, oilM, ...band, M.lineY, M.lineN]);
  g.traverse((o) => {
    o.castShadow = false;
  });
  inNight(
    g,
    [],
    pools.map(([x, z]) => poolAt(x, z, 7, 6.5)),
  );
  return g;
}

/** in-hw-floor（画廊用）：16 × 16 米的一块地，带切缝、漆线、虚线、斑马框 */
const inFloorAsset: AssetFn = (ctx) => {
  const g = inFloor(
    ctx,
    16,
    16,
    {
      lines: [[1, 1, 1.12, 15]],
      dash: [
        [
          [4, 2],
          [4, 14],
          [12, 14],
        ],
      ],
      hazard: [[8, 2, 14, 7]],
    },
    [[8, 8]],
  );
  g.position.set(-8, 0, -8);
  const o = new THREE.Group();
  o.add(g);
  return o;
};

// ── 叉车（H2）──

/**
 * in-hw-forklift 1.2 × 2.2 × 3.1（原点 = 车身中心落地点，货叉朝南 +z）：芥末黄车身 + 后面配重（圆的后背）、黑座椅、海军蓝护顶架（四根柱 + 顶框）、
 * 前面暗色门架（两根槽钢 + 横梁 + 链条那道暗缝）、货叉两根平放在地上往南伸、四个暗轮；护顶上一个橙色警示灯（夜里亮）。
 */
const inForklift: InDraw = (ctx) => {
  const k = kit();
  const M = inMats(ctx);
  const body = ctx.mat('hwMustard', { lightUp: 0.3, bands: [-0.15, 0.45], noShadowReceive: false, convex: 0.5 });
  const seat = ctx.mat('ironwork', { lightUp: 0.3 });
  const beacon = ctx.mat('toolOrange', { lightUp: 0.4 });
  const beaconOn = ctx.mat('toolOrange', { emissive: 0x8a4a10 });
  // 车身（z −1.1…0.6）、配重（后面高一截，后背倒圆）
  k.bx(body, 1.15, 0.75, 1.5, 0, 0.18, -0.25);
  k.bx(body, 1.15, 0.55, 0.55, 0, 0.93, -0.75);
  k.add(lying('x', 0.28, 1.15, 0, 1.2, -1.02, 8), body);
  // 轮子（前大后小）
  for (const s of [-1, 1]) {
    k.add(lying('x', 0.26, 0.24, s * 0.5, 0.26, 0.38, 8), M.dark);
    k.add(lying('x', 0.2, 0.22, s * 0.5, 0.2, -0.85, 8), M.dark);
  }
  // 座椅 + 方向盘柱
  k.bx(seat, 0.55, 0.12, 0.5, 0, 0.93, -0.15);
  k.bx(seat, 0.55, 0.5, 0.12, 0, 1.05, -0.4);
  k.bx(M.dark, 0.08, 0.5, 0.08, 0, 0.93, 0.35);
  k.add(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 8).translate(0, 1.45, 0.3), M.dark);
  // 护顶架：四根柱 + 顶框 + 中间两根横条
  const gy = 2.15;
  for (const x of [-0.52, 0.52]) for (const z of [-0.6, 0.5]) k.bx(M.navy, 0.08, gy - 0.93, 0.08, x, 0.93, z);
  for (const z of [-0.6, 0.5]) k.bx(M.navy, 1.12, 0.08, 0.1, 0, gy - 0.08, z);
  for (const x of [-0.52, 0.52]) k.bx(M.navy, 0.1, 0.08, 1.2, x, gy - 0.08, -0.05);
  for (const z of [-0.2, 0.1]) k.bx(M.navy, 1.0, 0.05, 0.08, 0, gy - 0.06, z);
  k.cyl(beacon, 0.07, 0.07, 0.12, 0.35, gy, -0.5, 6);
  // 门架（车身前面 z 0.7）：两根槽钢 + 上下横梁 + 中间暗缝；货架板（叉架）+ 两根货叉
  const mz = 0.72;
  for (const x of [-0.4, 0.4]) k.bx(M.dark, 0.12, 2.2, 0.14, x, 0, mz);
  k.bx(M.dark, 0.92, 0.12, 0.14, 0, 2.08, mz);
  k.bx(seat, 0.95, 0.5, 0.06, 0, 0.1, mz + 0.1);
  for (const x of [-0.3, 0.3]) {
    k.bx(M.steel, 0.12, 0.05, 1.1, x, 0.02, mz + 0.68);
    k.bx(M.steel, 0.12, 0.45, 0.05, x, 0.02, mz + 0.14);
  }
  return { k, noCast: [beacon], night: [[beacon, beaconOn]] };
};

/**
 * in-hw-forklift-bay 4 × 3 × 6.2（原点 = 车位南沿中点、地面；北边贴墙）：叉车充电位：墙上一台灰的充电柜（绿色指示灯，夜里亮）+ 电缆垂下来、
 * 一块"FORKLIFT"小牌；车位旁边一张叉车员的小登记台（海军蓝台身、台面上一块写字板、立牌 RENT）。斑马框在地上（inFloor 画）。
 */
const inForkliftBay: InDraw = (ctx) => {
  const k = kit();
  const M = inMats(ctx);
  const cab = ctx.mat('roofMetal', { lightUp: 0.4, bands: [-0.3, 0.4] });
  const led = ctx.mat('green', { lightUp: 0.5 });
  const ledOn = ctx.mat('green', { emissive: 0x2a7a2a });
  const paper = ctx.mat('pvc', { lightUp: 0.3 });
  const D = 6.2;
  const wz = -D + 0.02; // 墙面
  // 充电柜（两台）+ 电缆
  for (const x of [-1.0, 1.0]) {
    k.bx(cab, 0.8, 1.2, 0.35, x, 0.6, wz + 0.175);
    k.face(M.dark, 0.5, 4 * R, x, 1.5, wz + 0.355);
    k.face(led, 0.12, R, x - 0.2, 1.2, wz + 0.356);
    k.face(M.lineY, 0.8, R, x, 1.75, wz + 0.356);
    k.bx(M.dark, 0.06, 0.6, 0.06, x + 0.25, 0.05, wz + 0.4);
    k.bx(M.dark, 0.06, 0.04, 1.1, x + 0.25, 0.05, wz + 0.95);
  }
  inSign(k, M, 'FORKLIFT', 3.2, 0.55, 0, 2.6, wz + 0.1, 2 * T, 2 * R);
  // 登记台（车位东边，朝南）
  const dx = 2.9;
  const dz = -1.2;
  k.bx(M.navy, 1.4, 1.05, 0.7, dx, 0, dz);
  k.bx(M.top, 1.5, 0.05, 0.8, dx, 1.05, dz);
  k.bx(paper, 0.3, 0.02, 0.4, dx - 0.3, 1.1, dz);
  k.bx(M.dark, 0.08, 0.02, 0.4, dx - 0.12, 1.1, dz);
  k.face(M.lineY, 1.4, R, dx, 0.95, dz + 0.355);
  k.bx(M.navy, 0.06, 0.9, 0.06, dx + 0.55, 1.1, dz - 0.2);
  inSign(k, M, 'RENT', 0.9, 0.35, dx + 0.55, 2.15, dz - 0.15, T, R);
  return {
    k,
    noCast: [led, M.text, M.lineY],
    night: [
      [led, ledOn],
      [M.text, M.textNight],
    ],
  };
};

// ── 北墙：收货门（H3 / H4） ──

/**
 * in-hw-dock-door 7 × 4.4 × 3（原点 = 门洞中心落在墙面 z 0，+z 朝店里）：卷帘门卷到 2.7 米，下面的门洞里是倒进来的货车车厢（暗的车厢里一摞纸箱），
 * 两边门框一节芥末黄一节海军蓝（警示）、黑缓冲块、门前地上的钢板（卸货板，两边一条黄边）、门头 RECEIVING 牌、门边一盏卸货灯（夜里亮）。
 */
const inDockDoor: InDraw = (ctx) => {
  const k = kit();
  const M = inMats(ctx);
  const W = 5;
  const open = 2.7;
  const door = ctx.mat('hwNavy', {
    lightUp: 0.45,
    bands: [-0.35, 0.35],
    elem: { kind: 'planks', p: [0, 1, 0, 0.16], seam: 1, hi: 0.6 },
  });
  const hood = ctx.mat('roofMetal', { lightUp: 0.4, bands: [-0.3, 0.4] });
  const dark = ctx.mat('ironwork', { edge: 0, convex: 0, lightUp: -0.5 });
  const plate = ctx.mat('roofMetal', {
    edge: 0.1,
    convex: 0.2,
    elem: { kind: 'planks', p: [1, 0, 0, 0.22], seam: 1, hi: 0.5 },
  });
  const lampM = ctx.mat('pvc', { lightUp: 0.5 });
  const lampOn = ctx.mat('signPaint', { emissive: 0x806c44 });
  // 门洞（车厢里暗）+ 车厢地板（同店里地面高）+ 车厢里的纸箱（离门 1.2 米往里）
  k.face(dark, W, open, 0, open / 2, 0.02);
  k.bx(M.kraft, 1.1, 1.3, 0.05, -1.2, 0, 0.03);
  k.bx(M.kraft, 1.0, 0.9, 0.05, -0.1, 0, 0.03);
  k.bx(M.kraft, 0.9, 1.6, 0.05, 1.3, 0, 0.03);
  // 卷帘门（卷到 open 以上）+ 门头罩
  k.bx(door, W + 0.2, 3.6 - open, 0.12, 0, open, 0.06);
  k.bx(hood, W + 0.6, 0.45, 0.5, 0, 3.6, 0.25);
  // 门框（警示：0.3 米一节轮流黄 / 蓝）
  for (const s of [-1, 1]) {
    const x = s * (W / 2 + 0.2);
    for (let i = 0; i * 0.3 < 3.6; i++) k.bx(i % 2 ? M.board : M.mustard, 0.36, 0.3, 0.2, x, i * 0.3, 0.1);
    // 缓冲块
    k.bx(M.dark, 0.3, 0.5, 0.2, s * (W / 2 - 0.5), 0.15, 0.12);
  }
  // 卸货板（地上的钢板，两边一条黄边）
  k.bx(plate, 2.4, 0.05, 2.4, 0, 0, 1.25);
  for (const s of [-1, 1]) k.bx(M.mustard, 0.12, 0.06, 2.4, s * 1.26, 0, 1.25);
  // 门头牌
  inSign(k, M, 'RECEIVING', 4.8, 0.6, 0, 4.15, 0.55, 3 * T, 2 * R);
  // 卸货灯（门东边一根臂）
  k.bx(M.dark, 0.08, 0.08, 0.6, W / 2 + 0.7, 2.9, 0.3);
  k.bx(lampM, 0.3, 0.2, 0.25, W / 2 + 0.7, 2.75, 0.6);
  return {
    k,
    noCast: [M.text, lampM, dark],
    night: [
      [M.text, M.textNight],
      [lampM, lampOn],
    ],
  };
};

// ── 调漆台（H6） ──

/**
 * in-hw-paint-counter 12 × 3.8 × 3.1（原点 = 柜台中心落地点；北边贴墙 z −2.6，柜台后面 2 米是店员）：墙上三层白漆桶（板沿芥末黄）+ PAINT 大牌；
 * 柜台（海军蓝正面、奶白台面）：西头一台调色机（转盘上一圈彩色色浆罐）、两台摇漆机（灰箱 + 暗的夹桶口；H6 放桶的地方）、电脑屏、几桶调好的漆。
 */
const inPaintCounter: InDraw = (ctx) => {
  const k = kit();
  const M = inMats(ctx);
  const G = goodsMats(ctx);
  const W = 12;
  const wz = -2.6;
  const machine = ctx.mat('roofMetal', { lightUp: 0.45, bands: [-0.3, 0.4], convex: 0.4 });
  const screen = ctx.mat('jug', { lightUp: 0.5, bands: [-0.3, 0.3] });
  const screenOn = ctx.mat('jug', { emissive: 0x2a5a7a });
  const front = ctx.mat('hwNavy', { lightUp: 0.4, bands: [-0.3, 0.4] });
  const colorants = (
    ['clothRed', 'flowerYellow', 'clothBlue', 'green', 'flowerPurple', 'toolOrange', 'pvc', 'ironwork'] as const
  ).map((key) => ctx.mat(key, { lightUp: 0.5, bands: [-0.2, 0.4], convex: 0.5 }));
  // 墙上的漆架：三层板，每层一排白桶（正面一条海军蓝标签）
  k.bx(M.navy, W - 1, 0.1, 0.6, 0, 0, wz + 0.3);
  for (const [li, y] of [0.12, 0.85, 1.58].entries()) {
    k.bx(M.steel, W - 1, 0.04, 0.6, 0, y, wz + 0.3);
    k.face(M.lineY, W - 1, R, 0, y - R / 2 + 0.04, wz + 0.605);
    const r = li === 2 ? 0.11 : 0.16;
    const h = li === 2 ? 0.22 : 0.34;
    const n = Math.floor((W - 1.2) / (2 * r + 0.04));
    for (let i = 0; i < n; i++) {
      const x = -(W - 1.2) / 2 + (i + 0.5) * ((W - 1.2) / n);
      k.add(
        new THREE.CylinderGeometry(r, r, h, 6, 1, true).rotateY(Math.PI / 6).translate(x, y + 0.04 + h / 2, wz + 0.32),
        li === 2 ? G.can : [G.pailOrange, G.pailNavy, G.pail, G.pailOrange, G.pailNavy][i % 5],
      );
      if (i % 3 !== 1) k.face(G.lidNavy, r * 1.2, R, x, y + 0.04 + h * 0.5, wz + 0.32 + r * 0.88);
    }
  }
  for (const x of [-(W - 1) / 2, (W - 1) / 2]) k.bx(M.navy, 0.08, 2.3, 0.6, x, 0, wz + 0.3);
  inSign(k, M, 'PAINT', 4.6, 0.9, 0, 3.3, wz + 0.12, 5 * T, 3 * R);
  // 柜台（z −0.45…0.45）
  k.bx(front, W, 0.95, 0.9, 0, 0, 0);
  k.bx(M.top, W + 0.1, 0.06, 1.0, 0, 0.95, 0);
  k.face(M.lineY, W, 2 * R, 0, 0.8, 0.455);
  // 调色机（西头）：底柜 + 转盘上一圈色浆罐
  const tx = -4.6;
  k.bx(machine, 1.0, 0.45, 0.8, tx, 1.01, -0.05);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.cyl(
      colorants[i % colorants.length],
      0.085,
      0.085,
      0.32,
      tx + Math.cos(a) * 0.32,
      1.46,
      -0.05 + Math.sin(a) * 0.28,
      6,
    );
  }
  k.cyl(machine, 0.12, 0.12, 0.42, tx, 1.46, -0.05, 6);
  // 摇漆机两台（H6）：灰箱、正面一扇暗窗（夹着桶）、顶上一条芥末黄
  for (const x of [-1.6, -0.2]) {
    k.bx(machine, 0.9, 1.0, 0.8, x, 1.01, -0.05);
    k.face(M.dark, 0.6, 0.55, x, 1.5, 0.355);
    k.add(new THREE.CylinderGeometry(0.15, 0.15, 0.32, 6, 1, true).translate(x, 1.4, 0.15), G.pail);
    k.bx(M.mustard, 0.9, 0.06, 0.8, x, 2.01, -0.05);
  }
  // 电脑、几桶调好的漆（盖子彩色）
  k.bx(M.dark, 0.08, 0.35, 0.08, 1.6, 1.01, -0.2);
  k.bx(screen, 0.6, 0.4, 0.06, 1.6, 1.3, -0.15);
  const lids = [G.lidRed, G.lidPurple, G.lidGreen, G.lidNavy];
  for (let i = 0; i < 4; i++) {
    const x = 2.6 + i * 0.42;
    k.add(
      new THREE.CylinderGeometry(0.16, 0.16, 0.34, 6, 1, true).rotateY(Math.PI / 6).translate(x, 1.18, 0.1),
      G.pail,
    );
    k.add(
      new THREE.CircleGeometry(0.16, 6)
        .rotateX(-Math.PI / 2)
        .rotateY(Math.PI / 6)
        .translate(x, 1.35, 0.1),
      lids[i],
    );
  }
  return {
    k,
    noCast: [M.text, M.lineY, screen],
    night: [
      [M.text, M.textNight],
      [screen, screenOn],
    ],
  };
};

/**
 * in-hw-paint-chips 4.4 × 2.4 × 0.6（原点 = 落地点中心，正面朝南）：色卡墙：海军蓝框里 14 列色卡（每列一个色相、上浅下深 6 格），
 * 底下一层放色卡的小格、顶上一块 COLORS 牌。色卡是店里最鲜的一块（饱和度主要靠它和货）。
 */
const inPaintChips: InDraw = (ctx) => {
  const k = kit();
  const M = inMats(ctx);
  const W = 4.4;
  const hues = [
    'flowerRed',
    'clothRed',
    'roofTile',
    'toolOrange',
    'flowerYellow',
    'hwMustard',
    'yellowGreen',
    'green',
    'seat',
    'pickle',
    'clothBlue',
    'hwNavy',
    'flowerPurple',
    'navMark',
  ] as const;
  // 每列一个色相、一个网格：元素 = 一张卡（沿 y 每 0.25 米一块，块与块之间 1 纹素缝），每张卡在本色 / 高一级 / 低一级里挑 → 一列有深有浅
  const chips = hues.map((key) =>
    ctx.mat(key, {
      lightUp: 0.6,
      bands: [-0.45, 0.3],
      noShadowReceive: true,
      edge: 0.2,
      convex: 0,
      elem: { kind: 'planks', p: [0, 1, 0, 0.25], seam: 1, hi: 0 },
      toneW: [0.34, 0.33],
    }),
  );
  k.bx(M.navy, W, 0.2, 0.6, 0, 0, 0);
  k.bx(M.board, W, 2.0, 0.12, 0, 0.2, -0.24);
  for (const s of [-1, 1]) k.bx(M.navy, 0.1, 2.2, 0.5, s * (W / 2 - 0.05), 0, -0.05);
  const cw = (W - 0.4) / hues.length;
  for (let i = 0; i < hues.length; i++) k.face(chips[i], cw - T * 1.2, 1.5, -W / 2 + 0.2 + cw * (i + 0.5), 1.37, -0.17);
  // 底下放色卡的格子（一排浅盒）
  k.bx(M.white, W - 0.3, 0.25, 0.35, 0, 0.2, 0.05);
  inSign(k, M, 'COLORS', 2.4, 0.4, 0, 2.55, -0.18, 2 * T, 2 * R);
  return { k, noCast: [...chips, M.text], night: [] };
};

// ── 喷头对号墙（H5） ──

/**
 * in-hw-parts-wall 7 × 2.6 × 1.4（原点 = 落地点中心，正面朝南）：一面朝南的零件墙：牛皮色洞洞板背 + 6 排 × 18 格的小零件盒（每排一种颜色：蓝喷头、黑喷嘴、
 * 绿阀门、红盖、白接头、芥末黄……；盒里冒一个零件头），每排下面一条芥末黄价签槽；墙前一张比对台（H5：拿着坏喷头往格子上一贴）；顶上 PARTS 牌。
 */
const inPartsWall: InDraw = (ctx) => {
  const k = kit();
  const M = inMats(ctx);
  const W = 7;
  const peg = ctx.mat('roofMetal', {
    lightUp: 0.45,
    bands: [-0.3, 0.4],
    elem: { kind: 'stones', size: [5, 4], seam: 0.6, hi: 0.3 },
  });
  const rows = (['clothBlue', 'ironwork', 'green', 'clothRed', 'pvc', 'hwMustard'] as const).map((key) =>
    ctx.mat(key, { lightUp: 0.5, bands: [-0.3, 0.4], convex: 0.4 }),
  );
  const tray = ctx.mat('pvc', { lightUp: 0.5, bands: [-0.3, 0.4] });
  k.bx(M.navy, W, 0.15, 0.5, 0, 0, 0);
  k.bx(peg, W, 2.25, 0.08, 0, 0.15, -0.2);
  for (const s of [-1, 1]) k.bx(M.navy, 0.1, 2.5, 0.5, s * (W / 2 - 0.05), 0, 0);
  const nc = 18;
  const cw = (W - 0.4) / nc;
  for (let r = 0; r < 6; r++) {
    const y = 0.35 + r * 0.33;
    k.bx(M.steel, W - 0.2, 0.03, 0.35, 0, y - 0.03, -0.02);
    k.face(M.lineY, W - 0.2, R, 0, y - 0.015, 0.16);
    for (let c = 0; c < nc; c++) {
      const x = -W / 2 + 0.2 + cw * (c + 0.5);
      // 盒子（浅色前脸）+ 冒出来的零件头（这一排的颜色）
      k.bx(tray, cw - 0.04, 0.14, 0.3, x, y, -0.02);
      k.bx(rows[r], cw * 0.5, 0.1, 0.16, x, y + 0.12, -0.02);
    }
  }
  inSign(k, M, 'PARTS', 3.0, 0.5, 0, 2.75, -0.15, 3 * T, 2 * R);
  // 比对台（H5）：墙前 0.9 米，一张矮台 + 台面上一块浅的托盘
  k.bx(M.navy, 1.6, 0.95, 0.6, 1.6, 0, 0.95);
  k.bx(M.top, 1.7, 0.05, 0.7, 1.6, 0.95, 0.95);
  k.bx(tray, 0.6, 0.04, 0.4, 1.4, 1.0, 0.95);
  k.bx(rows[0], 0.12, 0.1, 0.12, 1.3, 1.04, 0.95);
  return { k, noCast: [M.lineY, M.text], night: [] };
};

// ── 长料架（H1：网柱、长水管） ──

/**
 * in-hw-long-rack 12 × 3.3 × 1.6（原点 = 立柱那条线的中点、地面；悬臂朝南 +z）：悬臂架：4 根海军蓝立柱 + 往南伸的底脚、4 层芥末黄悬臂，
 * 每层横放一捆长料（沿 x 6 米：白 PVC 管、灰镀锌管、深绿网柱、木方）。variant 换层的顺序。
 */
const inLongRack: InDraw = (ctx) => {
  const k = kit();
  const M = inMats(ctx);
  const G = goodsMats(ctx);
  const rnd = ctx.rng(`in-hw-long-rack:${ctx.variant}`);
  const L = 12;
  const post = ctx.mat('olive', { lightUp: 0.3, bands: [-0.1, 0.45], convex: 0.5 });
  const lumber = ctx.mat('wood', { lightUp: 0.2, elem: { kind: 'planks', p: [0, 0, 1, 0.1], seam: 1, hi: 0.5 } });
  for (let i = 0; i < 4; i++) {
    const x = -L / 2 + 0.3 + i * ((L - 0.6) / 3);
    k.bx(M.navy, 0.2, 3.3, 0.25, x, 0, 0);
    k.bx(M.navy, 0.2, 0.15, 1.5, x, 0, 0.75);
    for (const y of [0.15, 0.95, 1.75, 2.55]) k.bx(M.mustard, 0.12, 0.12, 1.3, x, y, 0.7);
  }
  const loads = [
    (y: number) => {
      // 网柱（深绿，粗、带一个顶帽）
      for (let i = 0; i < 4; i++) {
        k.add(
          lying(
            'x',
            0.055,
            3.6,
            -3 + (i % 2) * 0.2,
            y + 0.06 + Math.floor(i / 2) * 0.11,
            0.3 + (i % 2 ? 0.55 : 0.15) + i * 0.08,
            6,
          ),
          post,
        );
        k.add(
          lying(
            'x',
            0.075,
            0.1,
            -4.85 + (i % 2) * 0.2,
            y + 0.06 + Math.floor(i / 2) * 0.11,
            0.3 + (i % 2 ? 0.55 : 0.15) + i * 0.08,
            6,
          ),
          M.dark,
        );
      }
      // 橙色电线管（PVC 电工管）
      for (let i = 0; i < 5; i++) k.add(lying('x', 0.06, 4.8, 2.6, y + 0.07, 0.25 + i * 0.22, 6), G.pailOrange);
    },
    (y: number) => {
      for (let i = 0; i < 9; i++)
        k.add(
          lying('x', 0.065, 5.8 + rnd() * 0.4, -2.9 + (rnd() - 0.5) * 0.3, y + 0.07 + (i % 2) * 0.1, 0.2 + i * 0.12, 6),
          i % 3 === 2 ? G.pailOrange : G.pipe,
        );
      for (let i = 0; i < 6; i++) k.add(lying('x', 0.05, 5.6, 3.1, y + 0.06, 0.25 + i * 0.18, 6), G.hoseBlue);
    },
    (y: number) => {
      for (let i = 0; i < 6; i++) k.bx(lumber, 5.4, 0.1, 0.18, -2.9, y + (i % 2) * 0.1, 0.25 + i * 0.18);
      for (let i = 0; i < 7; i++)
        k.add(lying('x', 0.045, 5.9, 3.0, y + 0.05, 0.22 + i * 0.15, 6), i % 3 ? G.can : G.hose);
    },
    (y: number) => {
      for (let i = 0; i < 8; i++)
        k.add(lying('x', 0.08, 5.6, -3.0, y + 0.09, 0.2 + i * 0.15, 6), i % 2 ? G.pailNavy : G.yellowCase);
      for (let i = 0; i < 4; i++) k.add(lying('x', 0.055, 5.2, 3.2, y + 0.06, 0.3 + i * 0.25, 6), post);
    },
  ];
  const order = ctx.variant % 2 ? [1, 3, 0, 2] : [3, 1, 2, 0];
  for (const [i, y] of [0.27, 1.07, 1.87, 2.67].entries()) loads[order[i]](y);
  return { k, noCast: [], night: [] };
};

// ── 收银、服务台 ──

/**
 * in-hw-checkout 1.0 × 2.6 × 4.6（原点 = 收银台中心落地点，台子沿 z；顾客从北边来、走台子西边那条道）：海军蓝台身、黑传送带、奶白扫码 / 装袋台面，
 * 南头收银机（屏 + 刷卡机）、北头一根灯柱（顶上海军蓝号牌、芥末黄数字，夜里亮）、北头一个小货架（糖、电池：小彩盒）。variant 个位 = 道号（0 = 1 号 … 5 = 6 号）。
 */
const inCheckout: InDraw = (ctx) => {
  const k = kit();
  const M = inMats(ctx);
  const G = goodsMats(ctx);
  const L = 4.6;
  const belt = ctx.mat('ironwork', { lightUp: 0.2, elem: { kind: 'planks', p: [0, 0, 1, 0.3], seam: 1, hi: 0.3 } });
  const screen = ctx.mat('jug', { lightUp: 0.5, bands: [-0.3, 0.3] });
  const screenOn = ctx.mat('jug', { emissive: 0x2a5a7a });
  const front = ctx.mat('hwNavy', { lightUp: 0.4, bands: [-0.3, 0.4] });
  k.bx(front, 0.9, 0.85, L, 0, 0, 0);
  k.bx(belt, 0.6, 0.06, L * 0.55, -0.05, 0.85, -L * 0.2);
  k.bx(M.top, 0.95, 0.05, L * 0.45, 0, 0.85, L * 0.27);
  k.face(M.lineY, 0.9, 2 * R, 0, 0.7, L / 2 + 0.005);
  // 收银机（南头）
  k.bx(M.dark, 0.08, 0.35, 0.08, 0.2, 0.9, L / 2 - 0.5);
  k.bx(screen, 0.45, 0.32, 0.05, 0.2, 1.25, L / 2 - 0.45);
  k.bx(M.dark, 0.18, 0.12, 0.25, -0.25, 0.9, L / 2 - 0.35);
  // 装袋架（南头外面）
  k.bx(M.steel, 0.6, 0.05, 0.5, 0.0, 0.85, L / 2 + 0.3);
  for (const x of [-0.25, 0.25]) k.bx(M.steel, 0.04, 0.85, 0.04, x, 0, L / 2 + 0.5);
  // 北头：小货架（彩色小盒）+ 灯柱
  k.bx(M.navy, 0.9, 1.2, 0.45, 0, 0, -L / 2 - 0.25);
  const smalls = [G.redBox, G.yellowCase, G.blueBox, G.orange, G.lidGreen];
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < 4; i++)
      k.bx(
        smalls[(r + i + ctx.variant) % smalls.length],
        0.17,
        0.14,
        0.12,
        -0.3 + i * 0.2,
        0.25 + r * 0.32,
        -L / 2 + 0.03,
      );
  k.bx(M.navy, 0.08, 2.2, 0.08, 0.35, 0, -L / 2 + 0.2);
  k.bx(M.board, 0.5, 0.42, 0.1, 0.35, 2.2, -L / 2 + 0.2);
  k.face(M.text, 0.5, R, 0.35, 2.6, -L / 2 + 0.255);
  inText(k, M.text, String((ctx.variant % 10) + 1), 3 * T, 2 * R, 0.35, 2.4, -L / 2 + 0.26);
  return {
    k,
    noCast: [M.text, M.lineY, screen],
    night: [
      [M.text, M.textNight],
      [screen, screenOn],
    ],
  };
};

/**
 * in-hw-service-desk 10 × 2.9 × 3（原点 = 柜台中心落地点，柜台沿 x，顾客在南边）：海军蓝柜台（正面一条芥末黄、SERVICE 字）、奶白台面、
 * 台上收银屏；后面 1 米一道矮隔墙：配钥匙机（灰机身 + 暗夹口）、钥匙墙（洞洞板上一排排铜色钥匙）、KEYS 牌。
 */
const inServiceDesk: InDraw = (ctx) => {
  const k = kit();
  const M = inMats(ctx);
  const W = 10;
  const front = ctx.mat('hwNavy', { lightUp: 0.4, bands: [-0.3, 0.4] });
  const brass = ctx.mat('flowerYellow', { lightUp: 0.6, bands: [-0.3, 0.3], convex: 0.4 });
  const peg = ctx.mat('roofMetal', {
    lightUp: 0.45,
    bands: [-0.3, 0.4],
    elem: { kind: 'stones', size: [5, 4], seam: 0.6, hi: 0.3 },
  });
  const machine = ctx.mat('roofMetal', { lightUp: 0.45, bands: [-0.3, 0.4], convex: 0.4 });
  const screen = ctx.mat('jug', { lightUp: 0.5, bands: [-0.3, 0.3] });
  const screenOn = ctx.mat('jug', { emissive: 0x2a5a7a });
  k.bx(front, W, 1.0, 0.9, 0, 0, 0);
  k.bx(M.top, W + 0.1, 0.06, 1.0, 0, 1.0, 0);
  k.face(M.lineY, W, R, 0, 0.92, 0.455);
  inText(k, M.text, 'SERVICE', 3 * T, 2 * R, -2.5, 0.55, 0.46);
  for (const x of [-1.5, 2.5]) {
    k.bx(M.dark, 0.08, 0.3, 0.08, x, 1.06, -0.2);
    k.bx(screen, 0.45, 0.32, 0.05, x, 1.32, -0.15);
  }
  // 后面的隔墙（z −1.6）+ 背柜
  const bz = -1.6;
  k.bx(M.navy, W, 1.0, 0.6, 0, 0, bz);
  k.bx(M.top, W, 0.05, 0.65, 0, 1.0, bz);
  k.bx(peg, 4.0, 1.5, 0.08, 1.5, 1.05, bz - 0.22);
  for (let r = 0; r < 5; r++)
    for (let i = 0; i < 16; i++) k.bx(brass, 0.08, 0.14, 0.04, -0.3 + i * 0.24, 1.15 + r * 0.27, bz - 0.15);
  inSign(k, M, 'KEYS', 2.2, 0.42, 1.5, 2.85, bz - 0.15, 3 * T, 2 * R);
  // 配钥匙机两台（背柜上）
  for (const x of [-3.4, -2.3]) {
    k.bx(machine, 0.6, 0.45, 0.45, x, 1.05, bz);
    k.bx(M.dark, 0.3, 0.12, 0.1, x, 1.3, bz + 0.2);
    k.bx(M.mustard, 0.6, 0.05, 0.45, x, 1.5, bz);
  }
  return {
    k,
    noCast: [M.text, M.lineY, screen],
    night: [
      [M.text, M.textNight],
      [screen, screenOn],
    ],
  };
};

// ── 推车、东门 ──

/**
 * in-hw-flatbed 0.8 × 1.1 × 1.8（原点 = 车中心落地点，车长沿 z，把手在北头）：平板推车（H1）：钢板车面（横纹）、海军蓝车架、四个暗的小轮、
 * 北头一个芥末黄的 U 形把手。
 */
const inFlatbed: InDraw = (ctx) => {
  const k = kit();
  const M = inMats(ctx);
  const deck = ctx.mat('roofMetal', {
    lightUp: 0.2,
    convex: 0.3,
    elem: { kind: 'planks', p: [0, 0, 1, 0.18], seam: 1, hi: 0.5 },
  });
  const L = 1.6;
  const Wd = 0.75;
  k.bx(deck, Wd, 0.05, L, 0, 0.2, 0);
  k.bx(M.navy, Wd, 0.08, 0.06, 0, 0.13, L / 2 - 0.03);
  for (const s of [-1, 1]) k.bx(M.navy, 0.06, 0.08, L, s * (Wd / 2 - 0.03), 0.13, 0);
  for (const x of [-0.28, 0.28]) for (const z of [-0.65, 0.65]) k.add(lying('x', 0.08, 0.06, x, 0.08, z, 6), M.dark);
  // U 形把手（北头）
  for (const s of [-1, 1]) k.bx(M.mustard, 0.06, 0.95, 0.06, s * (Wd / 2 - 0.05), 0.2, -L / 2 + 0.05);
  k.bx(M.mustard, Wd, 0.06, 0.06, 0, 1.1, -L / 2 + 0.05);
  k.bx(M.mustard, Wd - 0.1, 0.05, 0.05, 0, 0.7, -L / 2 + 0.05);
  return { k, noCast: [], night: [] };
};

/**
 * in-hw-garden-door 1.2 × 3.4 × 6.6（原点 = 东墙里面 x 0、门中心 z 0，−x 朝店里）：东墙上的玻璃门（海军蓝门框盖住那段墙顶、门头上一条芥末黄），
 * 门里一块绿地垫、往西伸出来的一块 GARDEN 吊牌（朝南）、门边两盆仙人掌。
 */
const inGardenDoor: InDraw = (ctx) => {
  const k = kit();
  const M = inMats(ctx);
  const D = 6;
  const mat = ctx.mat('seat', { edge: 0.05, convex: 0, elem: { kind: 'planks', p: [0, 0, 1, 0.3], seam: 1, hi: 0 } });
  const glassM = ctx.mat('jug', { lightUp: 0.3, noShadowReceive: true });
  const glassOn = ctx.mat('straw', { emissive: 0x5a4424, noShadowReceive: true });
  const pot = ctx.mat('pot', { lightUp: 0.3, convex: 0.5 });
  const cactus = ctx.mat('cactus', { lightUp: 0.4, convex: 0.5 });
  // 门框：两根门柱 + 门头（盖住墙顶那段）+ 中间玻璃
  for (const s of [-1, 1]) k.bx(M.navy, 0.7, 3.2, 0.25, 0.05, 0, s * (D / 2 + 0.12));
  k.bx(M.navy, 0.7, 0.5, D + 0.5, 0.05, 2.9, 0);
  k.bx(M.mustard, 0.72, 0.12, D + 0.5, 0.05, 3.4, 0);
  k.bx(glassM, 0.3, 2.9, D, 0.05, 0, 0);
  // 地垫
  k.bx(mat, 2.4, 0.03, D - 0.4, -1.3, 0.035, 0);
  // GARDEN 吊牌（门南头，往西伸）
  k.bx(M.navy, 2.6, 0.1, 0.1, -1.2, 3.55, D / 2 - 0.3);
  inSign(k, M, 'GARDEN >', 3.0, 0.45, -1.4, 3.2, D / 2 - 0.25, 2 * T, 2 * R);
  // 两盆仙人掌（门两边）
  for (const s of [-1, 1]) {
    const z = s * (D / 2 + 0.7);
    k.cyl(pot, 0.32, 0.26, 0.5, -0.6, 0, z, 8);
    k.cyl(cactus, 0.14, 0.16, 0.9, -0.6, 0.5, z, 6);
    k.add(new THREE.SphereGeometry(0.14, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(-0.6, 1.4, z), cactus);
    k.cyl(cactus, 0.08, 0.08, 0.35, -0.45, 0.85, z, 6);
  }
  return {
    k,
    noCast: [M.text, glassM],
    night: [
      [M.text, M.textNight],
      [glassM, glassOn],
    ],
  };
};

/**
 * in-hw-wall-band 80 × 4.5 × 0.1（原点 = 北墙面中点、地面；+z 朝店里）：北墙（主墙面）的装饰：墙脚一条 0.9 米高的海军蓝护墙板（上沿芥末黄），
 * 墙顶下一条芥末黄线、墙脚 0.9 米浅钢灰护墙板。gap = 护墙板不画的段（收货门、调漆台、充电位前面）：[x0, x1]（相对原点）。
 */
export function inWallBand(ctx: AssetCtx, len: number, gaps: [number, number][] = []): THREE.Group {
  const k = kit();
  const M = inMats(ctx);
  // 护墙板：浅钢灰（墙是压型钢板，朝南在暗档；护墙板光往上偏落中档，墙脚亮一截，店里不压暗）
  const kick = ctx.mat('roofMetal', { lightUp: 0.5, bands: [-0.4, 0.3] });
  const band = ctx.mat('hwMustard', { noShadowReceive: true });
  // 墙顶下 0.6 米一条芥末黄线（3 行）
  k.face(band, len, 3 * R, 0, 3.9 - 1.5 * R, 0.02);
  // 护墙板：按 gaps 切段
  const segs: [number, number][] = [];
  let x = -len / 2;
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (a > x) segs.push([x, a]);
    x = Math.max(x, b);
  }
  if (x < len / 2) segs.push([x, len / 2]);
  for (const [a, b] of segs) {
    k.bx(kick, b - a, 0.9, 0.06, (a + b) / 2, 0, 0.03);
    k.face(M.lineY, b - a, R, (a + b) / 2, 0.9 - R / 2, 0.065);
  }
  return meshes(ctx, k.parts, [band, M.lineY]);
}
const inWallBandAsset: AssetFn = (ctx) => inWallBand(ctx, 12, [[-1, 1]]);

/** in-hw-power-pallet 1.4 × 1.6 × 1.2（门口的促销堆头：货板 + 一托货 + 立着的芥末黄价牌）。variant = 类别 */
const inPowerPallet: InDraw = (ctx) => {
  const k = kit();
  const M = inMats(ctx);
  const G = goodsMats(ctx);
  const rnd = ctx.rng(`in-hw-power-pallet:${ctx.variant}`);
  // variant 个位：0～4 = 五类货的一托；5 = 一捆灌溉管（白 / 蓝 / 绿横放）；6 = 一垛木方；7 = 园艺（绿袋土 + 一排小盆栽）
  const kind = ctx.variant % 10;
  if (kind < 5) palletLoad(k, G, M, kind as InCat, 0, 0, 0, rnd);
  else {
    k.bx(M.wood, 1.0, 0.035, 1.1, 0, 0.105, 0);
    for (const bx of [-0.42, 0, 0.42]) k.bx(M.woodDark, 0.14, 0.105, 1.1, bx, 0, 0);
    if (kind === 5) {
      const ms = [G.pipe, G.hoseBlue, G.pipe, G.hose];
      for (let l = 0; l < 4; l++)
        for (let i = 0; i < 7 - (l % 2); i++)
          k.add(lying('z', 0.065, 1.3, -0.4 + i * 0.135 + (l % 2) * 0.067, 0.21 + l * 0.12, 0), ms[(l + i) % 4]);
    } else if (kind === 6) {
      const lumber = ctx.mat('wood', { lightUp: 0.2, elem: { kind: 'planks', p: [1, 0, 0, 0.12], seam: 1, hi: 0.5 } });
      for (let l = 0; l < 6; l++) k.bx(lumber, 1.0, 0.1, 1.5, 0, 0.14 + l * 0.11, 0);
    } else {
      for (let l = 0; l < 3; l++)
        for (let i = 0; i < 2; i++)
          k.add(
            bagGeo(0.47, 0.16, 1.04, 0.03).translate(-0.245 + i * 0.49, 0.14 + l * 0.16, 0),
            l === 2 ? G.bagBrand : G.bagGreen,
          );
      const pot = ctx.mat('pot', { lightUp: 0.3, convex: 0.5 });
      const leaf = ctx.mat('cactus', { lightUp: 0.4, convex: 0.5 });
      for (let i = 0; i < 3; i++) {
        k.cyl(pot, 0.14, 0.11, 0.2, -0.3 + i * 0.3, 0.62, 0.1, 6);
        k.add(new THREE.SphereGeometry(0.15, 6, 3).translate(-0.3 + i * 0.3, 0.92, 0.1), leaf);
      }
    }
  }
  k.bx(M.navy, 0.05, 1.5, 0.05, 0.45, 0, 0.5);
  k.bx(M.mustard, 0.6, 0.4, 0.04, 0.45, 1.3, 0.52);
  k.face(M.board, 0.4, 2 * R, 0.45, 1.5, 0.545);
  return { k, noCast: [], night: [] };
};

/**
 * in-hw-dept-sign 3.4 × 5.6 × 0.3（原点 = 两根立柱中间落地；牌子朝南）：部门吊牌：两根海军蓝细柱 + 顶上 3.2 × 0.8 的海军蓝牌、芥末黄字。
 * variant = 哪个部门（IN_DEPT）。
 */
export const IN_DEPT = ['GARDEN', 'LUMBER', 'PLUMBING', 'CHECKOUT', 'TOOLS', 'PAINT'] as const;
const inDeptSign: InDraw = (ctx) => {
  const k = kit();
  const M = inMats(ctx);
  const s = IN_DEPT[(ctx.variant % 10) % IN_DEPT.length];
  for (const x of [-1.5, 1.5]) k.bx(M.navy, 0.1, 5.2, 0.1, x, 0, 0);
  inSign(k, M, s, 3.4, 0.8, 0, 5.0, 0.06, 2 * T, 2 * R);
  return { k, noCast: [M.text, M.board, M.navy], night: [[M.text, M.textNight]] };
};

/** 店内能合成摆的资产（inMany） */
const IN_DRAW: Record<string, InDraw> = {
  'in-hw-dept-sign': inDeptSign,
  'in-hw-endcap': inEndcap,
  'in-hw-aisle-sign': inAisleSign,
  'in-hw-forklift': inForklift,
  'in-hw-forklift-bay': inForkliftBay,
  'in-hw-dock-door': inDockDoor,
  'in-hw-paint-counter': inPaintCounter,
  'in-hw-paint-chips': inPaintChips,
  'in-hw-parts-wall': inPartsWall,
  'in-hw-long-rack': inLongRack,
  'in-hw-checkout': inCheckout,
  'in-hw-service-desk': inServiceDesk,
  'in-hw-flatbed': inFlatbed,
  'in-hw-garden-door': inGardenDoor,
  'in-hw-power-pallet': inPowerPallet,
};

export const ASSETS: Record<string, AssetFn> = {
  'bigbox-shell': bigboxShell,
  'bigbox-entry': bigboxEntry,
  'garden-center': gardenCenter,
  'nursery-cacti': nurseryCacti,
  'pallet-sand': palletSand,
  'pallet-paint': palletPaint,
  'pipe-rack': pipeRack,
  'cart-corral': cartCorral,
  'propane-cage': propaneCage,
  'box-truck': boxTruck,
  dock,
  bollard,
  'lot-pylon': lotPylon,
  'lot-light': lotLight,
  'pickup-lumber': pickupLumber,
  'pallet-stack': palletStack,
  // 店内（in-）
  'in-hw-floor': inFloorAsset,
  'in-hw-rack': inRack,
  'in-hw-endcap': asAsset(inEndcap),
  'in-hw-aisle-sign': asAsset(inAisleSign),
  'in-hw-forklift': asAsset(inForklift),
  'in-hw-forklift-bay': asAsset(inForkliftBay),
  'in-hw-dock-door': asAsset(inDockDoor),
  'in-hw-paint-counter': asAsset(inPaintCounter),
  'in-hw-paint-chips': asAsset(inPaintChips),
  'in-hw-parts-wall': asAsset(inPartsWall),
  'in-hw-long-rack': asAsset(inLongRack),
  'in-hw-checkout': asAsset(inCheckout),
  'in-hw-service-desk': asAsset(inServiceDesk),
  'in-hw-flatbed': asAsset(inFlatbed),
  'in-hw-garden-door': asAsset(inGardenDoor),
  'in-hw-wall-band': inWallBandAsset,
  'in-hw-power-pallet': asAsset(inPowerPallet),
  'in-hw-dept-sign': asAsset(inDeptSign),
};
