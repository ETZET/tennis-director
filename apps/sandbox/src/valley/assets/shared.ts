// 共用的小件（批 C，核心代理）：几栋楼都用的。docs/lab/2026-11-07-3d-pixel/valley-town.md「批 C」。
// - a-board：人字小黑板（报社"今日头条"、体育店的特价）。变体 v0 = 报社（白粉笔 + 一行黄的标题），v1 = 体育店（球黄的球 + 价钱）
// - breeze-wall：花砖墙一段（2 米样品，1.4 米高）：breezeBlock 墙身 + 一格一格的洞 + 压顶；园艺棚的墙用 breezeWallGeo 照着拼
// 本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头（朝南），单位米。设计纹素 0.09 米：线、缝 1 纹素，最小厚度 3 纹素以上。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { AssetCtx, AssetFn } from '../ctx';
import { type PalKey, SIGN_FACE } from '../palette';

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
  const accent: PalKey = ctx.variant === 1 ? 'ball' : 'flowerYellow';
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

export const ASSETS: Record<string, AssetFn> = {
  'a-board': aBoard,
  'breeze-wall': breezeWall,
};
