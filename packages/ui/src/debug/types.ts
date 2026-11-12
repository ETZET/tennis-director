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
  /** 场地可用度：每块球场的档、可用度、五项脏乱、门口等的人；今天的天气 */
  care?: {
    weather: string;
    courts: readonly {
      id: string;
      title: string;
      active: boolean;
      level: string;
      usability: number;
      mess: Readonly<Record<string, number>>;
      waiting: number;
    }[];
  };
}

export interface DebugActions {
  setStat(id: string, value: number): void;
  setFlag(id: string, value: boolean | number | string): void;
  forceCard(id: string): void;
  skip(minutes: number): void;
  exportSave(): void;
  newGame(seed: number | null): void;
  close(): void;
  /** 把一块球场的几项脏乱直接设成给的值（debugMess） */
  mess?(court: string, mess: Readonly<Record<string, number>>): void;
  /** 今天的天气换成 weather（测酷热、下雨） */
  weather?(weather: string): void;
  /** 跳到今天收盘（每日结算）：测结算卡 */
  closeDay?(): void;
}
