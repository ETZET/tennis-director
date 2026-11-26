// 场景里的一句话 → 心情泡的字形（人头上只画一个小图标，点了才看整句）。纯函数，有单测。
// 各场景演出里的台词还是中文的调试文字（clubsite/play 的 say / bubble）；这里按关键词和标点挑图标，挑不出来就是"…"。
import type { MoodId } from './icons';

const RULES: [RegExp, MoodId][] = [
  // 坏了要修
  [/网松|网破|坏|修|断了|打不了|漏/, 'wrench'],
  // 夸、谢
  [/谢|漂亮|好球|进了|拍到|棒|太好|来了|送进去/, 'heart'],
  // 水、热
  [/水|渴|晒|热/, 'drop'],
  // 吃喝、货
  [/柠檬|咖啡|喝|饿|吃|洛神|货|毛巾/, 'cup'],
  // 球
  [/球/, 'ball'],
  // 等
  [/等|多久|排好长/, 'wait'],
  // 脏、满、臭：不耐烦
  [/臭|脏|满了|垃圾|叶子|沙|哎呀|差一点/, 'grr'],
  // 喊、唱
  [/哗啦|嘘|换边|局|♪/, 'note'],
  [/困|睡|累/, 'zzz'],
];

export function moodOf(text: string): MoodId {
  for (const [re, id] of RULES) if (re.test(text)) return id;
  if (/[?？]/.test(text)) return '?';
  if (/[!！]/.test(text)) return '!';
  return '…';
}
