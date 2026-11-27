// 分图里人和活的字（中英文，跟着像素界面的语言）。心情泡的图标按标点 / 关键词挑（clubsite/hud/mood.ts）：
// 带"！"= 感叹号泡，带"谢"= 爱心，带"等"= 沙漏。英文那边也留着这些标点。
import { lang } from '../clubsite/hud';

const zh = {
  suitcase: '行李',
  luggageAsk: '行李好沉！',
  luggagePut: '放行李',
  luggageThanks: '谢谢你，帮大忙了',
  luggageDone: '帮客人拎行李 +${n}',
  luggageGone: '客人自己把行李拖走了',
  cupTake: '收杯子',
  cupDone: '收了一只空杯 +${n}',
  greet: '迎客',
  greetDone: '接驳车到站，迎了客人 +${n}',
  greetLine: '谢谢，这儿真漂亮',
  seek_reception: '请问在哪儿签到？等了一会儿了！',
  seek_complaint: '总监！有件事得跟你说说',
  seek_booking: '总监！想跟你约个场',
  seekDone_reception: '接待了 {name} · 好感 +{f}',
  seekDone_complaint: '听了 {name} 的意见 · 好感 +{f}',
  seekDone_booking: '给 {name} 约了场 · 好感 +{f}',
  seekMissed: '{name} 没等到你，走了 · 好感 −{f}',
  money: ' · +${n}',
} as const;

const en: Record<keyof typeof zh, string> = {
  suitcase: 'Luggage',
  luggageAsk: 'This bag is heavy!',
  luggagePut: 'Drop luggage',
  luggageThanks: 'Thanks, that was a big help',
  luggageDone: 'Carried a guest’s bag +${n}',
  luggageGone: 'The guest dragged the bag off alone',
  cupTake: 'Clear cup',
  cupDone: 'Cleared an empty cup +${n}',
  greet: 'Greet',
  greetDone: 'Met the shuttle guests +${n}',
  greetLine: 'Thanks — lovely place',
  seek_reception: 'Where do I check in? I’ve been waiting!',
  seek_complaint: 'Director! A word, please',
  seek_booking: 'Director! Can I book a court?',
  seekDone_reception: 'Welcomed {name} · favor +{f}',
  seekDone_complaint: 'Heard {name} out · favor +{f}',
  seekDone_booking: 'Booked a court for {name} · favor +{f}',
  seekMissed: '{name} gave up waiting · favor −{f}',
  money: ' · +${n}',
};

export type LifeTextKey = keyof typeof zh;
export function lt(key: LifeTextKey, vars: Record<string, string | number> = {}): string {
  let s: string = (lang() === 'en' ? en : zh)[key];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
