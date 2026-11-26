// 界面的字（玩家看得见的：日期、按钮名、提示）走这张小键值表，中英两种；场景的调试文字不算。
// 语言：?lang=zh|en，不给就看 <html lang>（clubwalk.html 是 zh-CN）。
export type Lang = 'zh' | 'en';

const zh = {
  weekdays: '周一,周二,周三,周四,周五,周六,周日',
  date: '第{d}天',
  dayN: 'DAY {d}',
  colon: '：',
  roster: '名册',
  map: '地图',
  debug: '调试',
  hint: '按住画面走 · 点地面走过去',
  pick: '拿 / 放',
  use: '动手',
  talk: '说话',
  clock: '时间和天气',
  money: '钱',
  w_clear: '晴',
  w_cloudy: '多云',
  w_overcast: '阴',
  w_rain: '雨',
  w_dust: '风沙',
  // 半屏卡（人物卡、名册看板）：图标按钮的读屏名和长按冒的名字
  act_chat: '聊几句',
  act_treat: '请喝一杯',
  act_rally: '打一局',
  act_ask: '听听意见',
  act_gift: '送个小礼物',
  act_message: '发条消息',
  walk: '走过去',
  more: '更多',
  less: '收起',
  close: '关上',
  board: '今天的人',
} as const;

const en: Record<keyof typeof zh, string> = {
  weekdays: 'MON,TUE,WED,THU,FRI,SAT,SUN',
  date: 'DAY {d}',
  dayN: 'DAY {d}',
  colon: ': ',
  roster: 'Roster',
  map: 'Map',
  debug: 'Debug',
  hint: 'Hold to walk · tap to go',
  pick: 'Pick / drop',
  use: 'Use',
  talk: 'Talk',
  clock: 'Time & weather',
  money: 'Money',
  w_clear: 'SUNNY',
  w_cloudy: 'CLOUDY',
  w_overcast: 'OVERCAST',
  w_rain: 'RAIN',
  w_dust: 'DUST',
  act_chat: 'Chat',
  act_treat: 'Buy a drink',
  act_rally: 'Rally',
  act_ask: 'Ask advice',
  act_gift: 'Small gift',
  act_message: 'Message',
  walk: 'Walk over',
  more: 'More',
  less: 'Less',
  close: 'Close',
  board: 'Today',
};

export type TKey = keyof typeof zh;
export const DICT: Record<Lang, Record<TKey, string>> = { zh, en };

let cur: Lang | null = null;
export function lang(): Lang {
  if (cur) return cur;
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') : null;
  const html = typeof document !== 'undefined' ? document.documentElement.lang : '';
  cur = q === 'en' || q === 'zh' ? q : html.startsWith('en') ? 'en' : 'zh';
  return cur;
}

export function t(key: TKey, vars: Record<string, string | number> = {}): string {
  return DICT[lang()][key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/** 第几天（从 1 起）→ 星期几（第 1 天 = 周一，同名册的时钟） */
export function weekday(day: number): string {
  const list = t('weekdays').split(',');
  return list[(((day - 1) % 7) + 7) % 7];
}
