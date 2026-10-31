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
