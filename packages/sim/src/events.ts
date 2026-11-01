import type { OptionKey } from '@td/content';
import type { CausalEntry } from './state';

/**
 * 领域事件：模拟每一步发出来，画面和界面订阅它们来演出、提示。
 * 它们只是通知；真正的数据都在 GameState 里。
 */
export type SimEvent =
  | { type: 'cardOpened'; uid: number; card: string; pause: boolean }
  | {
      type: 'cardResolved';
      uid: number;
      card: string;
      option: OptionKey | null;
      by: 'player' | 'default';
      success?: boolean;
    }
  | { type: 'requestPause'; reason: string }
  | { type: 'activityStarted'; uid: number; activity: string; anchor: string; performance: string; end: number }
  | { type: 'activityFinished'; uid: number; activity: string }
  | { type: 'personDeparted'; person: string; from: string; to: string; route: string[]; arrive: number }
  | { type: 'personArrived'; person: string; at: string }
  | { type: 'assigned'; person: string; target: string | null }
  /** 按习惯自己走去一个岗位（ADR 0014） */
  | { type: 'routine'; person: string; target: string }
  | { type: 'postCycle'; post: string; person: string }
  | { type: 'postInterrupted'; post: string; person: string; lost: number }
  | { type: 'orderStarted'; order: string; at: string; performance: string | null }
  | { type: 'orderFinished'; order: string; people: string[]; success?: boolean }
  | { type: 'orderCancelled'; order: string }
  | { type: 'errandStarted'; person: string; at: string; minutes: number }
  | { type: 'errandFinished'; person: string }
  | { type: 'log'; entry: CausalEntry }
  | { type: 'dayEnded'; day: number }
  | { type: 'actEnded'; result: 'won' | 'lost'; ending: string }
  | { type: 'seasonStarted'; season: string }
  | { type: 'weather'; weather: 'sun' | 'cloud' | 'rain' | 'wind' }
  | { type: 'weekSettled'; serviceRate: number };
