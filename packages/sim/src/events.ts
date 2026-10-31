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
  | { type: 'directorDeparted'; from: string; to: string; route: string[]; arrive: number }
  | { type: 'directorArrived'; at: string }
  | { type: 'log'; entry: CausalEntry }
  | { type: 'dayEnded'; day: number }
  | { type: 'actEnded'; result: 'won' | 'lost'; ending: string }
  | { type: 'seasonStarted'; season: string }
  | { type: 'weather'; weather: 'sun' | 'cloud' | 'rain' | 'wind' }
  | { type: 'planOpened'; season: string }
  | { type: 'planLocked'; season: string }
  | { type: 'actionStarted'; action: string; at: string; performance: string | null; end: number }
  | { type: 'actionFinished'; action: string; success?: boolean };
