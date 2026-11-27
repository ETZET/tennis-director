// clubgame 自己的文字（中英文，跟着像素界面的语言）。地点名在 clubvista/text.ts（mapName）。
import { lang } from '../clubsite/hud';

const zh = {
  loading: '加载中…',
  here: '你在这里',
  inner: '内场',
  n: '北',
  s: '南',
  e: '东',
  w: '西',
};
const en: typeof zh = {
  loading: 'Loading…',
  here: 'You are here',
  inner: 'Grounds',
  n: 'N',
  s: 'S',
  e: 'E',
  w: 'W',
};
export const gt = (k: keyof typeof zh): string => (lang() === 'en' ? en : zh)[k];
