import { mulberry32, range } from '@td/shared';
import { hx } from '../../core/color';
import { Custom, type DrawContext, Group } from '../../core/graph';
import type { CourtFrame } from '../../world/frame';
import { CLUBHOUSE, F_O1, F_O2, F_O3, F_P1, F_P2, F_PB1, F_PB2, F_S1, PLAZA, POOL_DECK, TERRACE } from './layout';

/**
 * 状况看得见（准则 6"先出画面信号，再掉档"，照旧版 wear.ts）：修好的设施没人维护、状况往下掉时，
 * 场地上一点点长出积沙、杂草和垃圾。宿主按设施给 amount（0 干净，1 快掉档，再往上已经掉档），这里只画。
 * 每块碎屑有自己的门槛，amount 过了门槛就冒出来；积沙随后还会继续变大。
 *
 * 每个设施一个静态 Custom 节点（贴地、排序偏后，不挡网和围网）；amount 变了就让静态层重烘。
 * 位置用自己的种子随机流，不碰 Math.random。
 */

type Kind = 'sand' | 'weed' | 'litter';

interface Piece {
  kind: Kind;
  x: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
  thr: number;
  c: string;
}

const SAND = ['#e9c999', '#dfba86', '#f2d8ad'];
const LITTER = ['#f1ece0', '#e8e2d2', '#d6362f', '#3a8fd9', '#9aa0a6', '#f0a020'];
const WEEDS = ['#a3874c', '#b59757', '#6ab748', '#77c452', '#5f7f3a'];

/** 这几个设施有几块场地（和 overlays 一致） */
const COURTS: Record<string, readonly CourtFrame[]> = {
  outer_1: [F_O1],
  outer_23: [F_O2, F_O3],
  practice: [F_P1, F_P2],
  stadium_1: [F_S1],
  stadium_3: [F_PB1, F_PB2],
};

export interface WearLayer {
  /** 挂在 statics 下的根节点 */
  readonly root: Group;
  /** 返回 true = 画面变了（要重烘静态层） */
  set(facility: string, amount: number): boolean;
}

export function createWear(): WearLayer {
  const rand = mulberry32(0x3a7e);
  const R = (a: number, b: number) => range(rand, a, b);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rand() * a.length) % a.length] as T;
  const byFacility = new Map<string, Piece[]>();
  const add = (f: string, kind: Kind, x: number, z: number, s: [number, number, number], c: string, thr: number) => {
    const list = byFacility.get(f) ?? [];
    list.push({ kind, x, z, yaw: R(0, Math.PI), sx: s[0], sy: s[1], sz: s[2], thr, c });
    byFacility.set(f, list);
  };

  // 球场：风从西边来，积沙先堆在西边的围网根和底线，再往场里漫；裂缝里冒草；场边有垃圾
  for (const [f, frames] of Object.entries(COURTS))
    for (const fr of frames) {
      const at = (lx: number, lz: number) => fr.w({ x: lx, z: lz });
      for (let k = 0; k < 26; k++) {
        const west = k < 13;
        const p = west ? at(-fr.hx + R(0, 3.5), R(-fr.hz, fr.hz)) : at(R(-fr.hx, fr.hx * 0.6), R(-fr.hz, fr.hz));
        const s = R(2, 4.6);
        add(
          f,
          'sand',
          p.x,
          p.z,
          [s * R(1.2, 1.8), R(0.1, 0.26), s * R(0.6, 1)],
          pick(SAND),
          west ? R(0.02, 0.7) : R(0.25, 1.4),
        );
      }
      for (let k = 0; k < 26; k++) {
        const p =
          rand() < 0.5
            ? at(R(-fr.hx, fr.hx), (rand() < 0.5 ? -1 : 1) * R(3.8, 4.4))
            : at(R(-fr.hx, fr.hx), R(-fr.hz, fr.hz));
        add(f, 'weed', p.x, p.z, [R(0.5, 1.1), R(0.25, 0.7), R(0.5, 1.1)], pick(WEEDS), R(0.3, 1.6));
      }
      for (let k = 0; k < 10; k++) {
        const p = at(R(-fr.hx, fr.hx), (rand() < 0.5 ? -1 : 1) * R(fr.hz - 2.2, fr.hz - 0.4));
        add(f, 'litter', p.x, p.z, [R(0.2, 0.5), R(0.04, 0.22), R(0.2, 0.4)], pick(LITTER), R(0.15, 1.6));
      }
    }
  // 会所门前和广场：垃圾多、积沙在墙根；泳池：池畔积沙、落叶和垃圾
  const rect = (
    f: string,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    nSand: number,
    nWeed: number,
    nLitter: number,
  ) => {
    for (let k = 0; k < nSand; k++) {
      const s = R(1, 2.6);
      add(f, 'sand', R(x0, x1), R(z0, z1), [s * R(1.2, 1.8), R(0.1, 0.24), s * R(0.6, 1)], pick(SAND), R(0.05, 1.6));
    }
    for (let k = 0; k < nWeed; k++)
      add(f, 'weed', R(x0, x1), R(z0, z1), [R(0.25, 0.5), R(0.25, 0.6), R(0.25, 0.5)], pick(WEEDS), R(0.3, 1.6));
    for (let k = 0; k < nLitter; k++)
      add(f, 'litter', R(x0, x1), R(z0, z1), [R(0.2, 0.5), R(0.04, 0.22), R(0.2, 0.4)], pick(LITTER), R(0.05, 1.6));
  };
  rect('clubhouse', CLUBHOUSE.x1 + 0.6, TERRACE.x1, TERRACE.z0, TERRACE.z1, 14, 16, 30);
  rect('plaza', PLAZA.x0 + 1, PLAZA.x1 - 1, PLAZA.z0 + 1, PLAZA.z1 - 1, 18, 18, 36);
  rect('stadium_2', POOL_DECK.x0 + 0.5, POOL_DECK.x1 - 0.5, POOL_DECK.z0 + 0.5, POOL_DECK.z1 - 0.5, 16, 10, 30);

  const root = new Group();
  root.name = 'wear';
  const amounts = new Map<string, number>();
  for (const [f, pieces] of byFacility) {
    let x0 = 1e9;
    let x1 = -1e9;
    let z0 = 1e9;
    let z1 = -1e9;
    for (const p of pieces) {
      x0 = Math.min(x0, p.x - p.sx / 2);
      x1 = Math.max(x1, p.x + p.sx / 2);
      z0 = Math.min(z0, p.z - p.sz / 2);
      z1 = Math.max(z1, p.z + p.sz / 2);
    }
    const node = new Custom((r) => drawPieces(r, pieces, amounts.get(f) ?? 0), { x0, x1, y0: 0, y1: 0.02, z0, z1 });
    node.name = `wear:${f}`;
    // 贴地的碎屑排在同一块地上的网、围网、人之前
    node.renderOrder = -60;
    node.visible = false;
    root.add(node);
  }

  return {
    root,
    set(facility, amount) {
      const a = Math.max(0, Math.round(amount * 20) / 20);
      if ((amounts.get(facility) ?? 0) === a) return false;
      amounts.set(facility, a);
      for (const n of root.children) if (n.name === `wear:${facility}`) n.visible = a > 0;
      return byFacility.has(facility);
    },
  };
}

function drawPieces(r: DrawContext, pieces: readonly Piece[], a: number): void {
  // 先沙后草再垃圾（草和垃圾在沙上）
  for (const kind of ['sand', 'weed', 'litter'] as const)
    for (const p of pieces) {
      if (p.kind !== kind) continue;
      const grow = Math.min(1, Math.max(0, (a - p.thr) / 0.12));
      if (grow <= 0) continue;
      const lit = r.litAt(p.x, p.z);
      if (kind === 'sand') {
        // 一摊斜放的沙：八边形贴地，前半边亮一点
        const more = 0.7 + 0.5 * Math.min(1, Math.max(0, (a - p.thr) / 0.6));
        const hx2 = (p.sx / 2) * grow * more;
        const hz2 = (p.sz / 2) * grow * more;
        const c = Math.cos(p.yaw);
        const s = Math.sin(p.yaw);
        const pts: [number, number, number][] = [];
        for (let i = 0; i < 8; i++) {
          const an = (i / 8) * Math.PI * 2;
          const u = Math.cos(an) * hx2;
          const v = Math.sin(an) * hz2;
          pts.push([p.x + u * c - v * s, 0.03, p.z + u * s + v * c]);
        }
        const c1 = r.col(p.c, 1, lit);
        const rgb = hx(p.c);
        const c2 = r.col(p.c, rgb[0] > 230 ? 0.96 : 1.05, lit);
        const mid = r.P(p.x, 0, p.z)[1];
        r.wpoly(pts, 0, (_x, y) => (y < mid ? c2 : c1));
      } else if (kind === 'weed') {
        // 一丛草：几根竖的像素
        const g = r.P(p.x, 0, p.z);
        const h = Math.max(1, Math.round(p.sy * grow * r.k * 1.2));
        const w = Math.max(1, Math.round(p.sx * r.k * 0.5));
        const c1 = r.col(p.c, 1, lit);
        const c2 = r.col(p.c, 0.8, lit);
        for (let i = -w; i <= w; i += 1) {
          const hh = Math.max(1, h - Math.abs(i) * (h / (w + 1)));
          r.rect(g[0] + i, g[1] - hh, 1, hh, i & 1 ? c2 : c1);
        }
      } else {
        const g = r.P(p.x, 0, p.z);
        const w = Math.max(1, Math.round(p.sx * r.k * 0.7));
        r.rect(g[0], g[1] - 1, w, 1, r.col(p.c, 1, lit));
      }
    }
}
