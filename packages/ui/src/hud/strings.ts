import type { Trend } from './types';

/**
 * HUD 自己的界面文案。默认是英文；游戏启动时用 setHudStrings 从 i18n 表（ui.hud.*）换成当前语言。
 */
const EN = {
  quality: 'Quality',
  members: 'Members',
  courtsOpen: 'Courts open',
  salary: 'Your salary',
  details: 'Club report',
  paused: 'Paused',
  notYet: 'Not yet',
  failZone: 'Grade F below 40',
  qualityChart: 'Program quality this session',
  headCoach: 'Head coach',
  vacant: 'Vacant',
  wire: 'Club wire',
  rotateLeft: 'Rotate left (Q)',
  rotateRight: 'Rotate right (E)',
  home: 'Back to the clubhouse',
  pause: 'Pause (Space)',
  resume: 'Resume (Space)',
  speed: 'Change speed',
  story: 'How we got here',
  because: 'Because',
  so: 'so',
  more: '+{n} more',
  walkThere: 'Walks there first',
  staff: 'Your people',
  cancel: 'Put down',
  close: 'Close',
  back: 'Back',
  best: 'Strong suit',
  send: 'Send',
  stop: 'Stop',
  skill_teach: 'Coaching',
  skill_upkeep: 'Upkeep',
  skill_service: 'Service',
  skill_play: 'Play',
  next: 'Coming up',
  done: 'Done',
  rose: 'Got better today',
};

type Key = keyof typeof EN;
const TRENDS: readonly Trend[] = ['falling', 'recovering', 'flat', 'bottomed'];

interface HudStrings extends Record<Exclude<Key, 'more'>, string> {
  more: (n: number) => string;
  trend: Record<Trend, string>;
}

export const STR: HudStrings = {
  ...EN,
  more: (n) => EN.more.replace('{n}', String(n)),
  trend: { falling: 'Falling', recovering: 'Recovering', flat: 'Flat', bottomed: 'Bottomed out' },
};

/**
 * 换成当前语言：lookup('quality') 返回 ui.hud.quality 的译文，没有就保留英文。
 * 趋势用 'trend.falling' 这样的键。
 */
export function setHudStrings(lookup: (key: string) => string | undefined): void {
  for (const k of Object.keys(EN) as Key[]) {
    const v = lookup(k);
    if (v === undefined) continue;
    if (k === 'more') STR.more = (n) => v.replace('{n}', String(n));
    else STR[k] = v;
  }
  for (const t of TRENDS) {
    const v = lookup(`trend.${t}`);
    if (v !== undefined) STR.trend[t] = v;
  }
}
