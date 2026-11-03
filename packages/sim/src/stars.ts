import { type Ctx, run } from './effects';
import type { GameState } from './state';
import { test } from './vars';
import type { World } from './world';

/**
 * 星级（LG-10，ADR 0020）：地图配置 stars 的第 i 项是升到 ★(i+1) 的清单，每一条是一个条件。
 * 下一星的清单全部满足就升星：只往上，不往回掉；写一条因果日志，发 star_up（画面转到大门，快讯列出开了什么）。
 * 门槛随时间放宽（橡皮筋）写在条件里，例如 { expr: "stat.members >= (day >= 78 ? 36 : 45)" }。
 */

export interface StarItem {
  /** 清单里这一条的 id（文案在 stars.items.<id>） */
  id: string;
  met: boolean;
}

export interface StarStatus {
  /** 现在几星 */
  stars: number;
  /** 这张地图最多几星（stars 清单有几项） */
  max: number;
  /** 下一星：几星、每一条满足没有、升上来开出什么；已经满星是 null */
  next: { level: number; items: StarItem[]; missing: number; opens: string[] } | null;
}

export function starStatus(s: GameState, w: World): StarStatus {
  const levels = w.act.stars ?? [];
  const stars = s.stars ?? 0;
  const lv = levels[stars];
  if (!lv) return { stars, max: levels.length, next: null };
  const items = Object.entries(lv.requires).map(([id, c]) => ({ id, met: test(s, w, c) }));
  return {
    stars,
    max: levels.length,
    next: { level: stars + 1, items, missing: items.filter((x) => !x.met).length, opens: [...lv.opens] },
  };
}

/** 看一眼下一星的清单，满足就升（一次可以连升几星，每一星各写一条日志） */
export function checkStars(ctx: Ctx): void {
  const { s, w } = ctx;
  const levels = w.act.stars;
  if (!levels?.length) return;
  for (;;) {
    const stars = s.stars ?? 0;
    const lv = levels[stars];
    if (!lv || !Object.values(lv.requires).every((c) => test(s, w, c))) return;
    s.stars = stars + 1;
    run(ctx, { kind: 'star', stars: s.stars, opens: [...lv.opens] }, null, []);
    ctx.events.push({ type: 'star_up', stars: s.stars, opens: [...lv.opens] });
  }
}
