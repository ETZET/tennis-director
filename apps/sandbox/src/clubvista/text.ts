// clubvista 的文字（中英文，跟着像素界面的语言 clubsite/hud/i18n 的 lang()）和"一张图算演员表里的哪个场景"。
import type { SceneId } from '../clubsite/cast/types';
import { lang } from '../clubsite/hud';

/** 地点名：九张分图 + 旧内场（clubgame ?inner=1 才接：clubwalk 的整座俱乐部，作对照） */
const NAMES: Record<string, { zh: string; en: string }> = {
  arrive: { zh: '到达 · 前台', en: 'Arrival · Front Desk' },
  court: { zh: '中心球场', en: 'Center Court' },
  oasis: { zh: '歇脚', en: 'The Oasis' },
  practice: { zh: '练习场', en: 'Practice Courts' },
  plaza: { zh: '喷泉广场', en: 'Fountain Plaza' },
  lobby: { zh: '会所大堂', en: 'Clubhouse Lobby' },
  street: { zh: '球场街', en: 'Court Row' },
  academy: { zh: '青训场', en: 'Academy Courts' },
  golf: { zh: '果岭', en: 'The Green' },
  club: { zh: '俱乐部内场（旧）', en: 'Old Grounds' },
};
export const mapName = (id: string): string => NAMES[id]?.[lang()] ?? id;
/** 小地图牌子底下的短名（格子窄） */
const SHORT: Record<string, { zh: string; en: string }> = {
  arrive: { zh: '到达', en: 'Arrival' },
  court: { zh: '中心球场', en: 'Center' },
  oasis: { zh: '歇脚', en: 'Oasis' },
  practice: { zh: '练习场', en: 'Practice' },
  plaza: { zh: '喷泉广场', en: 'Plaza' },
  lobby: { zh: '会所', en: 'Lobby' },
  street: { zh: '球场街', en: 'Row' },
  academy: { zh: '青训场', en: 'Academy' },
  golf: { zh: '果岭', en: 'Green' },
  club: { zh: '旧内场', en: 'Old' },
};
export const mapShort = (id: string): string => SHORT[id]?.[lang()] ?? mapName(id);

/** 一张图上摆的人按演员表的哪个场景选角（clubsite/cast 的 SceneId） */
export const CAST_SCENE: Record<string, SceneId> = {
  arrive: 'clubdesk',
  court: 'clubstadium',
  oasis: 'clubpool',
  practice: 'clubcourts',
  plaza: 'clubplaza',
  lobby: 'clubhouse',
  street: 'clubclay',
  academy: 'clubcourts',
  golf: 'clubgolf',
};
