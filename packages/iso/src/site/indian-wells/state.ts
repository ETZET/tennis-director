import { GROUNDS } from './layout';

/**
 * 设施状态 → 画面档位（ADR 0015 / 0018）。设施 id 和状态名沿用内容里的 `facilities.yaml`
 * （和旧版 overlays.ts 一致），游戏按设施状态调 `set(facility, state)`。
 *
 * 样片只有全局三档（荒废 / 修复中 / 全面复原），这里拆成每个设施自己的档：
 * - ruin：荒废（积沙、倒网、褪色开裂、空池子、枯棕榈、钉木板的窗）
 * - mid：清理过、还没修好（不积沙但还是旧场地；中心球场搭着脚手架）
 * - worn：修好以后没人维护掉了档（褪色、网塌、浑水、窗户又钉上一半）
 * - fresh：修好（新场地、新网、绿草、有水的泳池和喷泉、亮灯的会所）
 */
export type Look = 'ruin' | 'mid' | 'worn' | 'fresh';

export const FACILITIES = [
  'stadium_1',
  'practice',
  'outer_1',
  'outer_23',
  'clubhouse',
  'plaza',
  'stadium_3',
  'stadium_2',
] as const;
export type Facility = (typeof FACILITIES)[number];

/** 开局（荒了十年）每个设施的状态 */
export const INITIAL_STATES: Readonly<Record<Facility, string>> = {
  stadium_1: 'ruined',
  practice: 'ruined',
  outer_1: 'sanded',
  outer_23: 'ruined',
  clubhouse: 'ruined',
  plaza: 'dry',
  stadium_3: 'buried',
  stadium_2: 'ruined',
};

/** 修好以后的状态（"全部复原"用） */
export const RESTORED_STATES: Readonly<Record<Facility, string>> = {
  stadium_1: 'restored',
  practice: 'open',
  outer_1: 'resurfaced',
  outer_23: 'playable',
  clubhouse: 'open',
  plaza: 'open',
  stadium_3: 'open',
  stadium_2: 'open',
};

const LOOKS: Readonly<Record<Facility, Readonly<Record<string, Look>>>> = {
  stadium_1: { ruined: 'ruin', cleared: 'mid', restored: 'fresh', worn: 'worn' },
  practice: { ruined: 'ruin', open: 'fresh', worn: 'worn' },
  // 会员场 playable 是"能打的旧场地"：新网、褪色场面；resurfaced 才是全新
  outer_1: { sanded: 'ruin', swept: 'mid', playable: 'fresh', resurfaced: 'fresh', worn: 'worn' },
  outer_23: { ruined: 'ruin', playable: 'fresh', worn: 'worn' },
  clubhouse: { ruined: 'ruin', open: 'fresh', worn: 'worn' },
  plaza: { dry: 'ruin', open: 'fresh', worn: 'worn' },
  stadium_3: { buried: 'ruin', dug: 'mid', open: 'fresh', worn: 'worn' },
  stadium_2: { ruined: 'ruin', open: 'fresh', worn: 'worn' },
};

/**
 * 每个设施能取的状态，取自 LOOKS 的键（顺序就是开发工具"点一下换下一档"的顺序：开局 → 修好 → 掉档），
 * 和内容里的 facilities.yaml 一致。
 */
export const FACILITY_STATES: Readonly<Record<Facility, readonly string[]>> = Object.fromEntries(
  FACILITIES.map((f) => [f, Object.keys(LOOKS[f])]),
) as unknown as Record<Facility, readonly string[]>;

/**
 * 修复变体（wave1-contract.md「变体」）：每处设施修成什么样。没设（null）就是原来的样子（和以前一个像素不差）。
 * 第一个是变体 A。outer_1、stadium_1 不分叉。
 */
export const VARIANTS: Readonly<Partial<Record<Facility, readonly string[]>>> = {
  outer_23: ['clay', 'hard'],
  clubhouse: ['cafe', 'physio'],
  stadium_3: ['pickle4', 'tennis2'],
  practice: ['academy', 'bootcamp'],
  plaza: ['nightlife', 'shade_lawn'],
  stadium_2: ['resort', 'recovery'],
};

/** 升级（每处一个；only = 只在这个变体上有） */
export const UPGRADES: Readonly<Partial<Record<Facility, readonly { id: string; only?: string }[]>>> = {
  outer_23: [
    { id: 'tournament_clay', only: 'clay' },
    { id: 'pro_hard', only: 'hard' },
  ],
  clubhouse: [{ id: 'pro_shop' }],
  stadium_3: [{ id: 'league_lights' }],
  practice: [{ id: 'video_wall' }],
  plaza: [{ id: 'misters' }],
  stadium_2: [{ id: 'cabanas' }],
};

type Rect = { x0: number; x1: number; z0: number; z1: number };

/** 每处设施修好以后长草的地方（和旧版 overlays.ts 的 LAWNS 一致） */
export const LAWNS: Readonly<Record<Facility, readonly Rect[]>> = {
  stadium_1: [{ x0: -34.5, x1: 34, z0: GROUNDS.z0, z1: -8.6 }],
  clubhouse: [{ x0: GROUNDS.x0, x1: -38.5, z0: GROUNDS.z0, z1: -1 }],
  stadium_2: [{ x0: GROUNDS.x0, x1: -38.5, z0: -1, z1: GROUNDS.z1 }],
  practice: [{ x0: -34.5, x1: 34, z0: -4.4, z1: 14.4 }],
  outer_1: [{ x0: -34.5, x1: 0, z0: 16.6, z1: GROUNDS.z1 }],
  outer_23: [{ x0: 0, x1: 34, z0: 16.6, z1: GROUNDS.z1 }],
  plaza: [
    { x0: 37, x1: GROUNDS.x1, z0: GROUNDS.z0, z1: -8.6 },
    { x0: 37, x1: GROUNDS.x1, z0: 16, z1: GROUNDS.z1 },
  ],
  stadium_3: [{ x0: 37, x1: GROUNDS.x1, z0: -4.4, z1: 16 }],
};

/** 一次构建看到的设施状态（只读快照） */
export class Facilities {
  readonly states: Readonly<Record<string, string>>;
  /** 全园的复原程度 0..1（围墙、大门、停车场、路灯这些不属于任何设施的东西按它画） */
  readonly progress: number;
  /** 样片的全局档位 1 荒废 / 2 修复中 / 3 全面复原（只给公共部分用） */
  readonly level: 1 | 2 | 3;
  /** 设施 → 变体（没设的不在表里） */
  readonly variants: Readonly<Record<string, string>>;
  /** 设施 → 开着的升级 */
  readonly upgrades: Readonly<Record<string, readonly string[]>>;
  private readonly grassRects: { r: Rect; g: number }[] = [];

  constructor(
    states: Readonly<Record<string, string>>,
    variants: Readonly<Record<string, string | null | undefined>> = {},
    upgrades: Readonly<Record<string, readonly string[] | undefined>> = {},
  ) {
    this.states = { ...states };
    const vs: Record<string, string> = {};
    const us: Record<string, readonly string[]> = {};
    for (const f of FACILITIES) {
      const v = variants[f];
      if (v && VARIANTS[f]?.includes(v)) vs[f] = v;
      const list = (upgrades[f] ?? []).filter((u) => UPGRADES[f]?.some((d) => d.id === u)).sort();
      if (list.length) us[f] = list;
    }
    this.variants = vs;
    this.upgrades = us;
    let sum = 0;
    for (const f of FACILITIES) {
      const l = this.look(f);
      sum += l === 'fresh' ? 1 : l === 'worn' ? 0.5 : l === 'mid' ? 0.25 : 0;
      const g = l === 'fresh' ? 1 : l === 'worn' ? 0.45 : 0;
      if (g > 0) for (const r of LAWNS[f]) this.grassRects.push({ r, g });
    }
    this.progress = sum / FACILITIES.length;
    this.level = this.progress >= 0.999 ? 3 : this.progress >= 0.2 ? 2 : 1;
  }

  look(f: Facility): Look {
    return LOOKS[f][this.states[f] ?? INITIAL_STATES[f]] ?? 'ruin';
  }
  /** 修好过（fresh 或 worn）：网挂着、池子有水、灯能亮 */
  ok(f: Facility): boolean {
    const l = this.look(f);
    return l === 'fresh' || l === 'worn';
  }
  fresh(f: Facility): boolean {
    return this.look(f) === 'fresh';
  }
  /** 会员场 playable：能打但场面还是旧的 */
  state(f: Facility): string {
    return this.states[f] ?? INITIAL_STATES[f];
  }

  /** 这处设施的变体（没设 = null，画原来的样子） */
  variant(f: Facility): string | null {
    return this.variants[f] ?? null;
  }
  /**
   * 这个升级在画面上有没有：开着、设施修好过（fresh / worn），而且和当前变体对得上
   * （tournament_clay 只在红土上、pro_hard 只在硬地上；没设变体时按变体 A 算）
   */
  up(f: Facility, id: string): boolean {
    if (!this.ok(f) || !this.upgrades[f]?.includes(id)) return false;
    const d = UPGRADES[f]?.find((u) => u.id === id);
    return !d?.only || d.only === (this.variant(f) ?? VARIANTS[f]?.[0]);
  }

  /** 该处的草有多绿 0..1（修好的设施周围长草，7 米羽化，样片的 grassAmt） */
  grassAmt(x: number, z: number): number {
    let best = 0;
    for (const { r, g } of this.grassRects) {
      const dx = Math.max(r.x0 - x, 0, x - r.x1);
      const dz = Math.max(r.z0 - z, 0, z - r.z1);
      best = Math.max(best, g * (1 - Math.hypot(dx, dz) / 7));
    }
    return best;
  }

  /** 状态快照的键（缓存地面贴图用） */
  key(): string {
    return FACILITIES.map((f) => {
      const v = this.variants[f];
      const u = this.upgrades[f];
      return `${this.state(f)}${v ? `:${v}` : ''}${u ? `+${u.join('+')}` : ''}`;
    }).join('|');
  }
}
