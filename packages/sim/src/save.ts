import type { LoggedCommand } from './game';
import { type GameState, SAVE_VERSION } from './state';

/**
 * 存档：带版本号的状态快照，加上最近一段命令日志（用于复现 bug）。
 * 存档格式每变一次就加一个迁移函数，旧存档读进来时逐级升级到最新版本。
 * 内容 id 不改名；要废弃就标记 deprecated，由迁移函数把旧 id 映射到新 id。
 */

export interface SaveFile {
  format: 'tennis-director-save';
  version: number;
  contentVersion: string;
  seed: number;
  state: GameState;
  /** 最近一段命令日志 */
  commands: LoggedCommand[];
}

const MAX_COMMANDS = 500;

export function toSave(state: GameState, commands: readonly LoggedCommand[]): SaveFile {
  return {
    format: 'tennis-director-save',
    version: SAVE_VERSION,
    contentVersion: state.contentVersion,
    seed: state.seed,
    state: structuredClone(state),
    commands: commands.slice(-MAX_COMMANDS).map((c) => structuredClone(c)),
  };
}

/** 迁移函数：MIGRATIONS[n] 把第 n 版升级到第 n+1 版。 */
type Migration = (save: Record<string, unknown>) => Record<string, unknown>;
export const MIGRATIONS: Record<number, Migration> = {
  // 0 → 1：最早的内部测试存档没有「谁跟我走」的 legacy 字段，也没有卡的出现次数
  0: (save) => {
    const state = { ...(save.state as Record<string, unknown>) };
    state.legacy ??= [];
    const cards = { ...(state.cards as Record<string, unknown>) };
    cards.shown ??= { ...(cards.seen as Record<string, number>) };
    state.cards = cards;
    state.version = 1;
    return { ...save, version: 1, state };
  },
  // 1 → 2（经营循环 v2）：总监精力和手上的事、主动经营的动作、季度日程、季节和天气
  1: (save) => {
    const state = { ...(save.state as Record<string, unknown>) };
    state.director = { energy: 100, task: null, ...(state.director as Record<string, unknown>) };
    state.actions ??= { cooldowns: {}, done: {} };
    state.plan ??= {};
    state.planning ??= false;
    state.season ??= '';
    state.weather ??= 'sun';
    state.version = 2;
    return { ...save, version: 2, state };
  },
  // 2 → 3（招人和排人，ADR 0012）：去掉总监走位和精力、公告板、动作；
  // 总监进人员表（站在原来的地方），每个人加上维护、服务、指派、走路、办事；设施状况、本周服务率、岗位和工单。
  2: (save) => {
    const state = { ...(save.state as Record<string, unknown>) };
    const d = (state.director as { at?: string | null; leg?: { to: string } | null } | undefined) ?? {};
    const people: Record<string, Record<string, unknown>> = {};
    for (const [id, p] of Object.entries((state.people as Record<string, Record<string, unknown>>) ?? {}))
      people[id] = { upkeep: 0, service: 0, job: null, walk: null, errand: null, ...p };
    people.director ??= {
      id: 'director',
      hired: true,
      at: d.at ?? d.leg?.to ?? 'deck',
      skill: 35,
      upkeep: 35,
      service: 45,
      morale: 100,
      fatigue: 0,
      job: null,
      walk: null,
      errand: null,
    };
    state.people = people;
    delete state.director;
    delete state.plan;
    delete state.planning;
    delete state.actions;
    state.posts ??= {};
    state.orders ??= {};
    state.orderLog ??= { cooldowns: {}, done: {} };
    state.condition ??= {};
    state.week ??= { demand: 0, served: 0, last: 0.5 };
    state.ledger ??= {};
    state.version = 3;
    return { ...save, version: 3, state };
  },
  // 3 → 4（习惯，ADR 0014）：每个人记住玩家放他上过的岗位；旧档从空的习惯开始（迁移时读不到内容，分不清岗位和工单）
  3: (save) => {
    const state = { ...(save.state as Record<string, unknown>) };
    const people: Record<string, Record<string, unknown>> = {};
    for (const [id, p] of Object.entries((state.people as Record<string, Record<string, unknown>>) ?? {}))
      people[id] = { routine: [], ...p };
    state.people = people;
    state.version = 4;
    return { ...save, version: 4, state };
  },
  // 4 → 5（单一地图，2026-11-01）：三幕去掉了，跨幕继承（「谁跟我走」）也去掉
  4: (save) => {
    const state = { ...(save.state as Record<string, unknown>) };
    delete state.legacy;
    state.version = 5;
    return { ...save, version: 5, state };
  },
  // 5 → 6（人物的作用和球员，docs/design/people.md）：每个人加上球技；新加的候选人不在旧档里，招的时候按内容补上
  5: (save) => {
    const state = { ...(save.state as Record<string, unknown>) };
    const people: Record<string, Record<string, unknown>> = {};
    for (const [id, p] of Object.entries((state.people as Record<string, Record<string, unknown>>) ?? {}))
      people[id] = { play: 0, ...p };
    state.people = people;
    state.version = 6;
    return { ...save, version: 6, state };
  },
  // 6 → 7（周结算讲清楚，GM-1）：本周的账多记缺人分钟、钱、特质声望和周初质量。
  // 旧档的 last 是真算出来的（或者开局的 50%），当作上周有过需求，保持旧档的行为。
  6: (save) => {
    const state = { ...(save.state as Record<string, unknown>) };
    const week = (state.week as Record<string, unknown>) ?? {};
    const stats = (state.stats as Record<string, number>) ?? {};
    state.week = {
      demand: 0,
      served: 0,
      last: 0,
      lastDemand: 1,
      missed: {},
      money: { dues: 0, income: 0, upkeep: 0, wages: 0 },
      traitRep: 0,
      q0: stats.quality ?? 0,
      ...week,
    };
    state.version = 7;
    return { ...save, version: 7, state };
  },
  // 7 → 8（修复变体、升级改造、牌匾，LG-14；星级和奖杯，LG-10）：旧档没有选过变体、没有升级和牌匾，从 0 星 0 奖杯开始
  // （星级在下一次检查时按清单补上，不会因为迁移掉星）
  7: (save) => {
    const state = { ...(save.state as Record<string, unknown>) };
    state.variants ??= {};
    state.upgrades ??= {};
    state.remodels ??= {};
    state.picks ??= {};
    state.plaque ??= [];
    state.stars ??= 0;
    state.trophies ??= 0;
    state.version = 8;
    return { ...save, version: 8, state };
  },
};

export class SaveError extends Error {}

/** 读档：校验格式、逐级迁移。内容版本不一致时只给警告（数据还能用，但平衡可能变了）。 */
export function fromSave(raw: unknown, contentVersion?: string): { save: SaveFile; warnings: string[] } {
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object' || (raw as { format?: unknown }).format !== 'tennis-director-save')
    throw new SaveError('not a Tennis Director save file');
  let save = raw as Record<string, unknown>;
  let v = typeof save.version === 'number' ? save.version : 0;
  if (v > SAVE_VERSION) throw new SaveError(`save is from a newer version (${v} > ${SAVE_VERSION})`);
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new SaveError(`no migration from save version ${v}`);
    save = m(save);
    v = save.version as number;
  }
  const out = save as unknown as SaveFile;
  if (contentVersion && out.contentVersion !== contentVersion)
    warnings.push(`save was made with content ${out.contentVersion}; current content is ${contentVersion}`);
  return { save: out, warnings };
}
