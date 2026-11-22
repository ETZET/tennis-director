// 共用的小件（批 C，核心代理）：几栋楼都用的。docs/lab/2026-11-07-3d-pixel/valley-town.md「批 C」。
// - a-board：人字小黑板（报社"今日头条"、体育店的特价）。变体 v0 = 报社（白粉笔 + 一行黄的标题），v1 = 体育店（球黄的球 + 价钱），v2 = 市政厅听证会（红标题）
// - breeze-wall：花砖墙一段（2 米样品，1.4 米高）：breezeBlock 墙身 + 一格一格的洞 + 压顶；园艺棚的墙用 breezeWallGeo 照着拼
// 本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头（朝南），单位米。设计纹素 0.09 米：线、缝 1 纹素，最小厚度 3 纹素以上。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { AssetCtx, AssetFn } from '../ctx';
import { HOUSE_WALLS, type PalKey, SIGN_FACE, TOWN_EL, TOWN_TONES } from '../palette';

/** 竖直面上一屏幕行 = 0.09 / cos45 米（俯 45°） */
const ROW = 0.09 / Math.SQRT1_2;

/** 几块几何按材质合成一个网格 */
function meshes(ctx: AssetCtx, parts: [THREE.BufferGeometry, THREE.Material][]): THREE.Group {
  const g = new THREE.Group();
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const [geo, m] of parts) {
    const ng = geo.index ? geo.toNonIndexed() : geo;
    for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal') ng.deleteAttribute(a);
    by.set(m, [...(by.get(m) ?? []), ng]);
  }
  for (const [m, list] of by) {
    const merged = mergeGeometries(list);
    if (merged) g.add(new THREE.Mesh(merged, m));
  }
  ctx.mats.prepare(g);
  return g;
}

/**
 * 人字小黑板 0.8 × 1.0 × 0.5：两片木框板，顶上合页，底脚前后叉开 0.5 米；朝南那片是看点：
 * 木框 1 纹素宽的上沿亮（wood 的 edge），板面 slate（朝镜头 → 光往上偏，落中档）；两三行粉笔块（每块 1 屏幕行高、长短不一、行间空一行）。
 * 小件不投影（影子在灰盒和人的影子里看不出来，省一个阴影 pass 的三角形）。三角形 ≈ 150。
 */
const aBoard: AssetFn = (ctx) => {
  const W = 0.72;
  const H = 0.98;
  const TH = 0.05;
  const SPREAD = 0.22; // 底脚离中线
  const lean = Math.atan2(SPREAD, H);
  const wood = ctx.mat('wood');
  const slate = ctx.mat('slate', { lightUp: 0.45, bands: [-0.3, 0.35], noShadowReceive: true });
  const chalk = ctx.mat('signPaint', { noShadowReceive: true });
  // v2 = 市政厅听证会那天（"今晚听证会"：红的标题）
  const accent: PalKey = ctx.variant === 1 ? 'ball' : ctx.variant === 2 ? 'clothRed' : 'flowerYellow';
  const hi = ctx.mat(accent, SIGN_FACE);
  const rnd = ctx.rng(`a-board:${ctx.variant}`);
  const parts: [THREE.BufferGeometry, THREE.Material][] = [];
  for (const side of [1, -1]) {
    // 一片：在本地 xz 平面立着（底在 y 0、朝 +z），再往后倒 lean、挪到底脚的位置；背面那片转 180°
    const leaf: [THREE.BufferGeometry, THREE.Material][] = [];
    leaf.push([box(W, H, TH, 0, 0, 0), wood]);
    if (side > 0) {
      const fw = W - 0.18; // 框 1 纹素
      const fh = H - 0.26; // 上框 1 纹素、下框（横撑）2 纹素
      leaf.push([box(fw, fh, 0.02, 0, 0.17, TH / 2), slate]);
      // 粉笔：第一行标题（彩色粉笔），下面两行白的；每行 2～3 块，块长 2～5 纹素，按屏幕行排
      const top = 0.17 + fh - 0.09 - ROW * 0.5;
      const rows: [number, THREE.Material][] = [
        [top, hi],
        [top - ROW * 2, chalk],
        [top - ROW * 4, chalk],
      ];
      for (const [y, m] of rows) {
        let x = -fw / 2 + 0.09;
        while (x < fw / 2 - 0.18) {
          const len = Math.min(fw / 2 - 0.09 - x, 0.09 * (2 + Math.floor(rnd() * 4)));
          if (len < 0.18) break;
          leaf.push([box(len, 0.09, 0.02, x + len / 2, y, TH / 2 + 0.01), m]);
          x += len + 0.09 * (1 + Math.floor(rnd() * 2));
        }
      }
    }
    for (const [g] of leaf) {
      g.rotateX(-lean);
      if (side < 0) g.rotateY(Math.PI);
      g.translate(0, 0, side * SPREAD);
    }
    parts.push(...leaf);
  }
  const g = meshes(ctx, parts);
  ctx.mats.prepare(g, { cast: false, receive: true });
  g.traverse((o) => {
    o.userData.noCast = true;
  });
  return g;
};

/**
 * 花砖墙一段（样品）2 × 1.4 × 0.3：墙身 breezeBlock + 压顶（cap）；朝南的墙面上一格一格的洞（棕榈泉中世纪现代的 breeze block）。
 * 一格 0.36 米宽（4 纹素）× 3 屏幕行高，格心一个 2 纹素 × 1 行的洞（洞里是暗的：洞的颜色 = breezeBlock 暗档的缝再深一级、偏紫）。
 * 洞贴在墙面外 1 厘米的薄片（不挖几何），每格同一个形状 —— 元素有形状、整齐排（花砖本来就是规整的），亮边是压顶的上沿。
 * 朝南的墙面在暗档：格子照样清楚（洞比墙面暗 ~40）。园艺棚的墙照它画；长墙按 4 纹素的整数倍截。
 */
export function breezeWallGeo(
  len: number,
  h: number,
  d: number,
): { wall: THREE.BufferGeometry[]; holes: THREE.BufferGeometry[]; cap: THREE.BufferGeometry[] } {
  const CW = 0.36;
  const CH = ROW * 3;
  const wall = [box(len, h - 0.12, d, 0, 0, 0)];
  const cap = [box(len + 0.06, 0.12, d + 0.08, 0, h - 0.12, 0)];
  const holes: THREE.BufferGeometry[] = [];
  const nx = Math.floor((len - 0.1) / CW);
  const ny = Math.floor((h - 0.12 - 0.2) / CH);
  const x0 = -(nx * CW) / 2;
  const y0 = 0.2 + (h - 0.12 - 0.2 - ny * CH) / 2;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++)
      holes.push(new THREE.PlaneGeometry(0.18, ROW).translate(x0 + (i + 0.5) * CW, y0 + (j + 0.5) * CH, d / 2 + 0.01));
  return { wall, holes, cap };
}

const breezeWall: AssetFn = (ctx) => {
  const g = breezeWallGeo(2, 1.4, 0.3);
  const wall = ctx.mat('breezeBlock');
  const hole = ctx.mat('breezeBlock', {
    ramp: [0x8a6e8c, 0x6a5078, 0x3c3058],
    edge: 0,
    convex: 0,
    noShadowReceive: true,
  });
  const cap = ctx.mat('cap');
  return meshes(ctx, [
    ...g.wall.map((x) => [x, wall] as [THREE.BufferGeometry, THREE.Material]),
    ...g.holes.map((x) => [x, hole] as [THREE.BufferGeometry, THREE.Material]),
    ...g.cap.map((x) => [x, cap] as [THREE.BufferGeometry, THREE.Material]),
  ]);
};

/**
 * 小镇地面 / 屋顶 / 住宅墙的材质小样（2026-11-21 核心调色板，palette.ts 的 street、lotPave、campusConcrete、townLawn、gravelYard、
 * roofGravel、roofTile 筒瓦、houseStucco / White / Pink / Mint）：每块 2.6 米见方（地面）或 2.6 × 0.7 米的台子（屋顶）、2 × 2 米的墙，
 * 地面那几块左半边上方 0.9 米悬一块板 → 投影落在块上（看暗档里元素还在不在）。v0 = 全部，v1.. = 只放一块（大，隔离看）：
 * 1 street（带 2 纹素 lotPaint 车位线和停止线） 2 lotPave 3 campusConcrete 4 townLawn 5 gravelYard 6 roofGravel 7 roofTile 8 住宅墙四色
 * 9 yardGravel 10 roofTar 11 adobe 墙（valley 的屏幕空间土坯层）12 court（valley 的漆面深浅）
 */
const townSwatches: AssetFn = (ctx) => {
  const parts: [THREE.BufferGeometry, THREE.Material][] = [];
  const el = (k: keyof typeof TOWN_EL) => ({ elem: TOWN_EL[k] });
  const shade = ctx.mat('placeholder');
  const S = 2.6;
  /** 一块地：中心 (x, z)，左半边头顶 1.6 米一块板（投影）；extra = 块上再放的东西 */
  const flat = (key: PalKey, x: number, z: number, s = S) => {
    parts.push([box(s, 0.03, s, x, 0, z), ctx.mat(key, el(key as keyof typeof TOWN_EL))]);
    // 正午太阳在北边高处，0.9 米高的板投影往南挪 ~0.8 米：影子落在块的左半边中间
    parts.push([box(s / 2, 0.06, s * 0.45, x - s / 4, 0.9, z - s * 0.3), shade]);
  };
  const v = ctx.variant;
  const all = v === 0;
  const big = all ? S : 5;
  if (all || v === 1) {
    const x = all ? -3 : 0;
    const z = 0;
    flat('street', x, z, big);
    // 车位线（2 纹素 = 0.09 米，沿 z）+ 停止线（沿 x，靠南）
    const paint = ctx.mat('lotPaint');
    for (const dx of [-0.25, 0.25]) parts.push([box(0.09, 0.035, big * 0.7, x + dx * big, 0, z - big * 0.1), paint]);
    parts.push([box(big * 0.8, 0.035, 0.09, x, 0, z + big * 0.38), paint]);
  }
  if (all || v === 2) flat('lotPave', all ? 0 : 0, 0, big);
  if (all || v === 3) flat('campusConcrete', all ? 3 : 0, 0, big);
  if (all || v === 4) flat('townLawn', all ? -3 : 0, all ? 3 : 0, big);
  if (all || v === 5) flat('gravelYard', all ? 0 : 0, all ? 3 : 0, big);
  // 屋顶：0.7 米高的台子（顶面亮档、朝南的面暗档），放在沙上看和沙的亮度差
  const roof = (key: 'roofGravel' | 'roofTile', x: number, z: number, s: number) => {
    const m =
      key === 'roofTile'
        ? ctx.mat('roofTile', { elem: TOWN_EL.roofTile, tones: TOWN_TONES.roofTile })
        : ctx.mat(key, el(key));
    parts.push([box(s, 0.7, s, x, 0, z), m]);
  };
  if (all || v === 6) roof('roofGravel', all ? 3 : 0, all ? 3 : 0, big);
  if (v === 9) flat('yardGravel', 0, 0, big);
  if (v === 10) parts.push([box(big, 0.7, big, 0, 0, 0), ctx.mat('roofTar', el('roofTar'))]);
  if (v === 11) parts.push([box(4, 2.2, 1.2, 0, 0, 0), ctx.mat('adobe', el('adobe'))]);
  if (v === 12) flat('court', 0, 0, big);
  if (all || v === 7) roof('roofTile', all ? -3 : 0, all ? -3.4 : 0, all ? S : big);
  // 住宅墙四色：2 × 2 米的方盒（朝南的面 = 画面上的暗档墙）
  if (all || v === 8) {
    HOUSE_WALLS.forEach((k, i) => {
      const w = all ? 1.3 : 2;
      const x = all ? -0.6 + i * 1.5 : -3.3 + i * 2.2;
      parts.push([box(w, 2, 1.2, x, 0, all ? -3.4 : 0), ctx.mat(k, el(k))]);
    });
  }
  return meshes(ctx, parts);
};

export const ASSETS: Record<string, AssetFn> = {
  'a-board': aBoard,
  'breeze-wall': breezeWall,
  'town-swatches': townSwatches,
};
