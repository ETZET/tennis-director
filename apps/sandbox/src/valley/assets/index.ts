// 市中心三栋办事楼 + 日出公园的资产表：各栋的资产文件（paper / sports / hardware，各归一个资产代理）+ 共用的（shared，核心代理）合在一起。
// makeAsset(id, ctx)：画了的用资产；清单（specs.ts）里有、还没画的 → 灰盒（placeholder 灰 + 顶上一条提议的主色）。
// 画廊（gallery.ts）和场景（detail/sites/*.ts 的 d.asset(makeAsset(id, d.actx).obj)）都走这里。
import * as THREE from 'three';
import { box } from '../../clubsite/render/geo';
import type { AssetCtx, AssetFn } from '../ctx';
import { ASSETS as KIT2 } from '../interiors/v2/kit';
import { ASSETS as BANK } from './bank';
import { ASSETS as CITYHALL } from './cityhall';
import { ASSETS as DINER } from './diner';
import { ASSETS as HARDWARE } from './hardware';
import { ASSETS as BANK2 } from './in2/bank';
import { ASSETS as CITYHALL2 } from './in2/cityhall';
import { ASSETS as DINER2 } from './in2/diner';
import { ASSETS as HARDWARE2 } from './in2/hardware';
import { ASSETS as PAPER2 } from './in2/paper';
import { ASSETS as SPORTS2 } from './in2/sports';
import { ASSETS as PAPER } from './paper';
import { ASSETS as PARK_COURT } from './park/court';
import { ASSETS as PARK_LIFE } from './park/life';
import { ASSETS as PARK_WALL } from './park/wall';
import { ASSETS as SCHOOL } from './school';
import { ASSETS as SHARED } from './shared';
import { type Batch, SPECS } from './specs';
import { ASSETS as SPORTS } from './sports';

export { BATCH_NAME, type Batch, SPECS, type Spec } from './specs';

/** 每批的资产（批 → id → 函数） */
export const BY_BATCH: Record<Batch, Record<string, AssetFn>> = {
  P: PAPER,
  S: SPORTS,
  H: HARDWARE,
  C: SHARED,
  P2: PAPER2,
  S2: SPORTS2,
  H2: HARDWARE2,
  K2: KIT2,
  CH: CITYHALL,
  B: BANK,
  D: DINER,
  SC: SCHOOL,
  CH2: CITYHALL2,
  B2: BANK2,
  D2: DINER2,
  KC: PARK_COURT,
  KW: PARK_WALL,
  KL: PARK_LIFE,
};
export const ASSETS: Record<string, AssetFn> = {
  ...SHARED,
  ...PAPER,
  ...SPORTS,
  ...HARDWARE,
  ...KIT2,
  ...PAPER2,
  ...SPORTS2,
  ...HARDWARE2,
  ...CITYHALL,
  ...BANK,
  ...DINER,
  ...SCHOOL,
  ...CITYHALL2,
  ...BANK2,
  ...DINER2,
  ...PARK_COURT,
  ...PARK_WALL,
  ...PARK_LIFE,
};

/** 全部 id：清单的顺序，再加清单里没有的（资产代理新加的） */
export function assetIds(): { id: string; batch: Batch | '?'; drawn: boolean }[] {
  const out = Object.entries(SPECS).map(([id, s]) => ({ id, batch: s.batch as Batch | '?', drawn: !!ASSETS[id] }));
  for (const [b, rec] of Object.entries(BY_BATCH))
    for (const id of Object.keys(rec)) if (!SPECS[id]) out.push({ id, batch: b as Batch, drawn: true });
  return out;
}

export type AssetKind = 'own' | 'placeholder' | 'unknown';

/** 清单尺寸的灰盒：placeholder 灰的体块 + 顶上一条提议的主色（0.1 米厚，宽深各收 10%） */
function greybox(ctx: AssetCtx, id: string): THREE.Object3D {
  const s = SPECS[id];
  const g = new THREE.Group();
  g.name = `valley-asset:${id}:greybox`;
  const w = s?.w ?? 1;
  const h = s?.h ?? 1;
  const d = s?.d ?? 1;
  g.add(new THREE.Mesh(box(w, h - 0.1, d, 0, 0, 0), ctx.mat('placeholder')));
  g.add(new THREE.Mesh(box(w * 0.9, 0.1, d * 0.9, 0, h - 0.1, 0), ctx.mat(s?.key ?? 'placeholder')));
  ctx.mats.prepare(g);
  return g;
}

export function makeAsset(id: string, ctx: AssetCtx): { obj: THREE.Object3D; kind: AssetKind } {
  const f = ASSETS[id];
  if (f) {
    const obj = f(ctx);
    obj.name ||= `valley-asset:${id}`;
    return { obj, kind: 'own' };
  }
  return { obj: greybox(ctx, id), kind: SPECS[id] ? 'placeholder' : 'unknown' };
}
