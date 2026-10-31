import type { Trend } from './types';

/**
 * HUD 自己的界面文案。M1 起换成 i18n 键值表（技术文档），这里先集中放在一处。
 */
export const STR = {
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
  pause: 'Pause (Space)',
  resume: 'Resume (Space)',
  speed: 'Change speed',
  story: 'How we got here',
  because: 'Because',
  so: 'so',
  more: (n: number) => `+${n} more`,
  walkThere: 'Walks there first',
  trend: {
    falling: 'Falling',
    recovering: 'Recovering',
    flat: 'Flat',
    bottomed: 'Bottomed out',
  } satisfies Record<Trend, string>,
} as const;
