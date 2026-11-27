// clubvista 的文字（中英文，跟着像素界面的语言 clubsite/hud/i18n 的 lang()）和"一张图算演员表里的哪个场景"。
import type { SceneId } from '../clubsite/cast/types';
import { lang } from '../clubsite/hud';

/** 地点名：四张图 + 内场（clubgame 把 clubwalk 的整座俱乐部接成第五张） */
const NAMES: Record<string, { zh: string; en: string }> = {
  arrive: { zh: '到达 · 前台', en: 'Arrival · Front Desk' },
  court: { zh: '中心球场', en: 'Center Court' },
  oasis: { zh: '歇脚', en: 'The Oasis' },
  practice: { zh: '练习场', en: 'Practice Courts' },
  club: { zh: '俱乐部内场', en: 'Club Grounds' },
};
export const mapName = (id: string): string => NAMES[id]?.[lang()] ?? id;

/** 一张图上摆的人按演员表的哪个场景选角（clubsite/cast 的 SceneId） */
export const CAST_SCENE: Record<string, SceneId> = {
  arrive: 'clubdesk',
  court: 'clubstadium',
  oasis: 'clubpool',
  practice: 'clubcourts',
};
