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
  { key: 'gym', what: '健身', now: '推车的姿势（push）原地走；健身房多半在室内藏着' },
  { key: 'kidplay', what: '孩子玩水', now: '弯腰捡东西（pickup）循环，没有拨水' },
  { key: 'warmup', what: '热身拉伸', now: '拿拍子的准备姿势（ready）' },
  { key: 'golf', what: '打高尔夫', now: '站着，没有球杆、没有挥杆' },
  { key: 'shop', what: '逛店、取拍子', now: '站着' },
  { key: 'change', what: '更衣', now: '站着（更衣室在室内时藏着）' },
  { key: 'work.lifeguard', what: '救生员', now: '坐着看（sit），没有救生椅' },
  { key: 'work.golf', what: '高尔夫场地维护', now: '浇水（water + 水管代用件）' },
  { key: 'work.tidy', what: '收拾桌椅、看台', now: '扫地（sweep + 扫帚），没有擦桌子' },
  { key: 'work.idle', what: '别的岗位上的活', now: '站着' },
  {
    key: 'car.lot',
    what: '停车场高峰',
    now: '停车场里一次只开一辆车（fx/cars.ts 的牌子，不穿车、不顶牛）：早高峰、散场、周六车在进出口东边的车道上排队；排得久的那伙人已经下车走开了，车还在路上',
  },
  {
    key: 'lounge.view',
    what: '南边躺椅上躺着的人',
    now: '躺椅背对镜头（靠背在南头）：靠着（recline）露出头和肩，身子被靠背挡住；要看得见整个人得把那排躺椅转过来朝南（clubpool 的 LOUNGE_S + 站位）',
  },
  {
    key: 'wall.view',
    what: '对着墙打球的孩子',
    now: '有球、有挥拍（fx/ball.ts），但站位在挡风布北边 0.95 米，45° 俯视下被 2 米高的挡风布挡住；站位往北挪到 z ≈ −5.6 就看得见',
  },
];

/** 跑起来才发现的缺口（地点没有站位、路规划不到……）：key → 说明 */
const found = new Map<string, string>();
/** 用到过的静态缺口 */
const used = new Set<string>(['car.lot', 'lounge.view', 'wall.view']);

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
