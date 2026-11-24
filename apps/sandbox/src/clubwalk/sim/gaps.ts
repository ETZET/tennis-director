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
  { key: 'lesson.ball', what: '上课喂的球', now: '对打有球（fx/ball.ts），教练喂球、学员接的那一下还没有球' },
  {
    key: 'car.queue',
    what: '车让车',
    now: '车按时间表开（fx/cars.ts），同一时刻进出口有两辆车时会穿过去，不排队、不让',
  },
  {
    key: 'car.full',
    what: '停车场满了',
    now: '会员、客人只有 28 个车位：满了的那伙人没有车，从车道东头走进来；员工的车不在画面里',
  },
  {
    key: 'lounge.view',
    what: '南边躺椅上躺着的人',
    now: '躺下了（lie），但躺椅头朝镜头，45° 俯视下大头挡住身子，只看得出一颗头',
  },
];

/** 跑起来才发现的缺口（地点没有站位、路规划不到……）：key → 说明 */
const found = new Map<string, string>();
/** 用到过的静态缺口 */
const used = new Set<string>(['car.queue', 'car.full']);

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
