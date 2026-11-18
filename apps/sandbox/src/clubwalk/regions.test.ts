// 大世界的区域表（regions.ts）的规矩：不渲染、几毫秒跑完，配合导航体检（clubwalk/audit.ts + tools/walkaudit.mjs）。
// - 区域的范围互不重叠；
// - 区域的边不切过台阶（坡道连两边的挡路条）：切开的那半截按邻居的地形画（平地），导航也问错区域（2026-11-18 广场西沿台阶就是这样）；
// - navFrom 借的那块在自己的范围里，借给它的区域存在。
import { describe, expect, it } from 'vitest';
import { STAIRS } from '../clubdesk/layout';
import { BUNKER_RAMPS, TEE_RAMPS } from '../clubgolf/layout';
import { STADIUM_LINK_RAMP } from '../clubplaza/layout';
import { DECK_RAMPS } from '../clubpool/layout';
import { type Ramp, type Rect, rampFromStairs } from '../clubsite/play';
import { EAST_RAMPS, STAND_RAMPS } from '../clubstadium/layout';
import { inRects, REGIONS } from './regions';

/** 各场景的台阶 / 坡道（静态的；clubhouse 的楼梯在楼里，不跨区域）。cheeks = 两侧有 stairCheeks 的 0.3 米挡路条 */
const RAMPS: { id: string; r: Ramp; cheeks?: boolean }[] = [
  ...STAIRS.map((s, i) => ({ id: `desk/plaza STAIRS[${i}]`, r: rampFromStairs(s), cheeks: true })),
  { id: 'plaza STADIUM_LINK', r: STADIUM_LINK_RAMP, cheeks: true },
  ...STAND_RAMPS.map((r, i) => ({ id: `stadium STAND_RAMPS[${i}]`, r })),
  ...EAST_RAMPS.map((r, i) => ({ id: `stadium EAST_RAMPS[${i}]`, r })),
  ...Object.entries(DECK_RAMPS).map(([k, r]) => ({ id: `pool DECK_RAMPS.${k}`, r: r as Ramp })),
  ...TEE_RAMPS.map((r, i) => ({ id: `golf TEE_RAMPS[${i}]`, r })),
  ...BUNKER_RAMPS.map((r, i) => ({ id: `golf BUNKER_RAMPS[${i}]`, r })),
];
/**
 * 允许跨区域的坡道（写清楚为什么）：泳池东门台阶的脚伸进会员场的西步道 —— 两边都是平的步道，台阶在泳池那边画全了
 * （clubwalk/walk.ts 的 surface 先查坡道，伸过区域边的那一截照样按它）
 */
const CROSSING_OK = new Set(['pool DECK_RAMPS.east']);

const owner = (x: number, z: number) => REGIONS.find((d) => inRects(d.rects, x, z))?.id ?? '-';
const overlap = (a: Rect, b: Rect) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-6 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-6;

describe('clubwalk 的区域表', () => {
  it('范围互不重叠', () => {
    const bad: string[] = [];
    for (let i = 0; i < REGIONS.length; i++)
      for (let j = i + 1; j < REGIONS.length; j++)
        for (const a of REGIONS[i].rects)
          for (const b of REGIONS[j].rects) if (overlap(a, b)) bad.push(`${REGIONS[i].id} × ${REGIONS[j].id}`);
    expect(bad).toEqual([]);
  });

  it('区域的边不切过台阶（坡道和两边 0.3 米的挡路条整个归一个区域）', () => {
    const bad: string[] = [];
    for (const { id, r, cheeks } of RAMPS) {
      if (CROSSING_OK.has(id)) continue;
      // 挡路条在坡道的两侧（沿台阶方向的垂直方向）各 0.3 米
      const w = cheeks ? 0.3 : 0;
      const box = r.axis === 'x' ? { ...r, z0: r.z0 - w, z1: r.z1 + w } : { ...r, x0: r.x0 - w, x1: r.x1 + w };
      const seen = new Set<string>();
      for (let i = 0; i <= 8; i++)
        for (let j = 0; j <= 8; j++) {
          // 边上留 1 厘米：贴着区域边的不算切开
          const x = box.x0 + 0.01 + ((box.x1 - box.x0 - 0.02) * i) / 8;
          const z = box.z0 + 0.01 + ((box.z1 - box.z0 - 0.02) * j) / 8;
          seen.add(owner(x, z));
        }
      if (seen.size > 1) bad.push(`${id} 被切开：${[...seen].join(' / ')}`);
    }
    expect(bad).toEqual([]);
  });

  it('navFrom：借的那块在自己的范围里，借给它的区域存在', () => {
    const bad: string[] = [];
    const ids = new Set(REGIONS.map((d) => d.id));
    for (const d of REGIONS)
      for (const n of d.navFrom ?? []) {
        if (!ids.has(n.from)) bad.push(`${d.id}: 没有区域 ${n.from}`);
        const c = [
          [n.r.x0 + 0.01, n.r.z0 + 0.01],
          [n.r.x1 - 0.01, n.r.z1 - 0.01],
        ];
        if (!c.every(([x, z]) => inRects(d.rects, x, z))) bad.push(`${d.id}: navFrom 的范围伸出自己的范围`);
      }
    expect(bad).toEqual([]);
  });
});
