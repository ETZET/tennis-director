// 画面缺口：引擎说了、画面还没有像样的样子的事（设计文档"有引擎说了、画面没有的事，再一样样补画面"）。
// 静态的一张表（pose.ts 用的代替姿势）+ 跑起来才发现的（站位表里没有的地点、规划不到的路），观察面板的页脚打出来。

export interface Gap {
  key: string;
  /** 缺什么 */
  what: string;
  /** 现在拿什么顶着 */
  now: string;
}

export const GAPS: readonly Gap[] = [
  { key: 'swim', what: '游泳', now: '站在水里（身子往下沉，腰以下在水下），没有划水的姿势' },
  { key: 'sunbathe', what: '躺椅上晒太阳', now: '坐在躺椅上（sit，座低 0.4），没有躺下的姿势' },
  { key: 'eat', what: '吃饭', now: '坐着端杯子喝（sip），桌上没有餐盘、没有吃的动作' },
  { key: 'gym', what: '健身', now: '推车的姿势（push）原地走；健身房多半在室内藏着' },
  { key: 'kidplay', what: '孩子玩水', now: '弯腰捡东西（pickup）循环，没有拨水' },
  { key: 'warmup', what: '热身拉伸', now: '拿拍子的准备姿势（ready）' },
  { key: 'golf', what: '打高尔夫', now: '站着，没有球杆、没有挥杆' },
  { key: 'shop', what: '逛店、取拍子', now: '站着' },
  { key: 'change', what: '更衣', now: '站着（更衣室在室内时藏着）' },
  { key: 'work.vendor', what: '摊主做饭、倒饮料', now: '端杯子倒水（pour + cup）' },
  { key: 'work.lifeguard', what: '救生员', now: '坐着看（sit），没有救生椅' },
  { key: 'work.golf', what: '高尔夫场地维护', now: '浇水（water + 水管代用件）' },
  { key: 'work.tidy', what: '收拾桌椅、看台', now: '扫地（sweep + 扫帚），没有擦桌子' },
  { key: 'work.idle', what: '别的岗位上的活', now: '站着' },
  { key: 'ball', what: '对打的球', now: '没有球在飞，只有挥拍' },
];

/** 跑起来才发现的缺口（地点没有站位、路规划不到……）：key → 说明 */
const found = new Map<string, string>();
/** 用到过的静态缺口 */
const used = new Set<string>(['ball']);

export function noteGap(key: string, text?: string) {
  if (text) {
    if (!found.has(key)) found.set(key, text);
  } else used.add(key);
}

/** 面板页脚：用到过的代替 + 跑起来发现的 */
export function gapLines(): string[] {
  const out = GAPS.filter((g) => used.has(g.key)).map((g) => `${g.what}：${g.now}`);
  for (const t of found.values()) out.push(t);
  return out;
}

export function gapReport() {
  return { substitutes: GAPS.filter((g) => used.has(g.key)), found: [...found.values()] };
}
