/**
 * 开发版调试面板读的快照和发的命令。只在开发版（或 URL 带 ?debug）出现。
 */

export interface DebugStat {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
}

export interface DebugSnapshot {
  fps: number;
  seed: number;
  time: string;
  contentVersion: string;
  director: string;
  /** 导演压力 0..1 */
  pressure: number;
  stats: readonly DebugStat[];
  flags: readonly { id: string; value: boolean | number | string }[];
  /** 现在满足条件、可能被导演抽到的卡；share 是抽中的概率 */
  eligible: readonly { id: string; title: string; weight: number; share: number }[];
  /** 已经排上日程的卡 */
  scheduled: readonly { id: string; title: string; at: string }[];
  /** 全部卡（强制打开用） */
  cards: readonly { id: string; title: string }[];
  /** 内容热重载的警告和错误 */
  notes: readonly string[];
  commands: number;
}

export interface DebugActions {
  setStat(id: string, value: number): void;
  setFlag(id: string, value: boolean | number | string): void;
  forceCard(id: string): void;
  skip(minutes: number): void;
  exportSave(): void;
  newGame(seed: number | null): void;
  close(): void;
}
