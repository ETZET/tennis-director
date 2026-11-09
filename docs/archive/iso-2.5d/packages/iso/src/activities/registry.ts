import type { ActivityMeta, ParamDef, ParamValue } from './types';

/**
 * 活动注册表：每个原子活动的 id、分类、标题文案键、变量（范围和默认值）、原生大小。
 * 纯数据，不碰 three.js；演出实现在 activities/<id>.ts，由 activities/index.ts 对上号。
 */

const seg = (
  key: string,
  labelKey: string,
  def: ParamValue,
  opts: readonly [ParamValue, string][],
  structural = true,
) =>
  ({
    key,
    type: 'seg',
    labelKey,
    def,
    structural,
    opts: opts.map(([v, k]) => ({ v, labelKey: k })),
  }) as const satisfies ParamDef;

const TIER3 = [
  [1, 'opt.low'],
  [2, 'opt.mid'],
  [3, 'opt.high'],
] as const satisfies readonly [ParamValue, string][];

const T = ['tag.fatigue', 'tag.weather', 'tag.coach'] as const;

export const ACTIVITY_META = [
  {
    id: 'feed',
    category: 'train',
    titleKey: 'act.feed.title',
    descKey: 'act.feed.desc',
    tags: [...T, 'tag.players'],
    params: [
      {
        key: 'players',
        type: 'range',
        min: 1,
        max: 3,
        step: 1,
        def: 1,
        structural: true,
        labelKey: 'param.players',
        valueKey: 'val.people',
      },
    ],
    size: { W: 20, D: 12 },
    ground: 'court',
    netX: 4.5,
  },
  {
    id: 'serve',
    category: 'train',
    titleKey: 'act.serve.title',
    descKey: 'act.serve.desc',
    tags: [...T],
    params: [],
    size: { W: 26, D: 12 },
    ground: 'court',
    netX: 0,
  },
  {
    id: 'sprint',
    category: 'train',
    titleKey: 'act.sprint.title',
    descKey: 'act.sprint.desc',
    tags: [...T],
    params: [],
    size: { W: 22, D: 13 },
    ground: 'track',
    noCorner: { R: true },
  },
  {
    id: 'tryout',
    category: 'recruit',
    titleKey: 'act.tryout.title',
    descKey: 'act.tryout.desc',
    tags: [...T, 'tag.applicants'],
    params: [
      {
        key: 'n',
        type: 'range',
        min: 3,
        max: 8,
        step: 1,
        def: 5,
        structural: true,
        labelKey: 'param.applicants',
        valueKey: 'val.people',
      },
    ],
    size: { W: 22, D: 13 },
    ground: 'court',
    netX: 5.2,
  },
  {
    id: 'fair',
    category: 'recruit',
    titleKey: 'act.fair.title',
    descKey: 'act.fair.desc',
    tags: [...T, 'tag.budget'],
    params: [seg('tier', 'param.fairBudget', 2, TIER3)],
    size: { W: 24, D: 14 },
    ground: 'plaza',
  },
  {
    id: 'openday',
    category: 'recruit',
    titleKey: 'act.openday.title',
    descKey: 'act.openday.desc',
    tags: [...T, 'tag.families'],
    params: [
      {
        key: 'n',
        type: 'range',
        min: 2,
        max: 5,
        step: 1,
        def: 3,
        structural: true,
        labelKey: 'param.families',
        valueKey: 'val.families',
      },
    ],
    size: { W: 20, D: 13 },
    ground: 'minicourt',
  },
  {
    id: 'match',
    category: 'match',
    titleKey: 'act.match.title',
    descKey: 'act.match.desc',
    tags: [...T, 'tag.tier', 'tag.strength', 'tag.format'],
    params: [
      seg('tier', 'param.tier', 2, [
        [1, 'opt.school'],
        [2, 'opt.region'],
        [3, 'opt.state'],
        [4, 'opt.nation'],
      ]),
      {
        key: 'diff',
        type: 'range',
        min: -2,
        max: 2,
        step: 1,
        def: 0,
        labelKey: 'param.strength',
        valueKey: 'val.strength',
      },
      seg('fmt', 'param.format', 's', [
        ['s', 'opt.singles'],
        ['d', 'opt.doubles'],
      ]),
      // 游戏里比赛结果由模拟决定：none 表示打满一盘也不演胜负，记分清零接着打
      seg(
        'finale',
        'param.finale',
        'show',
        [
          ['show', 'opt.finaleShow'],
          ['none', 'opt.finaleNone'],
        ],
        false,
      ),
    ],
    // 深 30 米：全国赛的六排看台和旗杆都在岛上
    size: { W: 34, D: 30 },
    ground: 'court',
    netX: 0,
    view: { zoom: 1.12 },
  },
  {
    id: 'pickleball',
    category: 'match',
    titleKey: 'act.pickleball.title',
    descKey: 'act.pickleball.desc',
    tags: ['tag.weather', 'tag.fatigue'],
    params: [
      seg('players', 'param.pbPlayers', 4, [
        [2, 'opt.singles'],
        [4, 'opt.doubles'],
      ]),
    ],
    size: { W: 16, D: 10 },
    ground: 'pickle',
    netX: 0,
  },
  {
    id: 'bbq',
    category: 'team',
    titleKey: 'act.bbq.title',
    descKey: 'act.bbq.desc',
    tags: [...T, 'tag.budget'],
    params: [seg('tier', 'param.budget', 2, TIER3)],
    size: { W: 20, D: 13 },
    ground: 'grass',
    noCorner: { L: true },
  },
  {
    id: 'tug',
    category: 'team',
    titleKey: 'act.tug.title',
    descKey: 'act.tug.desc',
    tags: [...T],
    params: [
      // 游戏里输赢由模拟决定（网球这边从来没赢过）
      seg(
        'result',
        'param.result',
        'auto',
        [
          ['auto', 'opt.auto'],
          ['win', 'opt.win'],
          ['lose', 'opt.lose'],
        ],
        false,
      ),
    ],
    size: { W: 20, D: 11 },
    ground: 'grass',
  },
  {
    id: 'cleanup',
    category: 'team',
    titleKey: 'act.cleanup.title',
    descKey: 'act.cleanup.desc',
    tags: [...T, 'tag.crew'],
    params: [
      seg('crew', 'param.crew', 'volunteers', [
        ['volunteers', 'opt.volunteers'],
        ['pros', 'opt.pros'],
      ]),
      {
        key: 'n',
        type: 'range',
        min: 3,
        max: 7,
        step: 1,
        def: 5,
        structural: true,
        labelKey: 'param.helpers',
        valueKey: 'val.people',
      },
    ],
    size: { W: 22, D: 13 },
    ground: 'clay',
  },
] as const satisfies readonly ActivityMeta[];

export type ActivityId = (typeof ACTIVITY_META)[number]['id'];

export const ACTIVITY_IDS: readonly ActivityId[] = ACTIVITY_META.map((m) => m.id);

const BY_ID = new Map<string, ActivityMeta>(ACTIVITY_META.map((m) => [m.id, m]));

export function activityMeta(id: string): ActivityMeta | undefined {
  return BY_ID.get(id);
}

/** 每个变量的默认值，再用 given 覆盖（超出范围的值收回到范围里，不认识的选项用默认值）。 */
export function resolveParams(
  meta: ActivityMeta,
  given: Readonly<Record<string, ParamValue>> = {},
): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const p of meta.params) {
    const v = given[p.key];
    if (p.type === 'range') {
      const n = typeof v === 'number' && Number.isFinite(v) ? v : p.def;
      out[p.key] = Math.max(p.min, Math.min(p.max, Math.round(n / p.step) * p.step));
    } else out[p.key] = p.opts.some((o) => o.v === v) ? (v as ParamValue) : p.def;
  }
  return out;
}
