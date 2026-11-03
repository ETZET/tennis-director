import type { ArtAnim, Facing, PixelArt } from '../format';

/**
 * 成人手势帧、摔倒帧、发型和身上覆盖物（ADR 0019）。
 *
 * 画法：每帧 = 底身（头、躯干、腿，不带手臂）+ 手臂层（像素清单），合成后自动描 1 像素 `O` 边、裁到包围盒。
 * - 字符画坐标在一张"网格"里写（成人 12×15，身体在第 3..8 列、第 3..14 行，四周留出伸手的空间）；
 * - 正面（front）：人物的右手在画面左边；背面（back）的手臂层按身体中线左右镜像，而且画在底身下面
 *   （挡在身前的手被身体挡住，举过头、伸到两边的手照样露出来）；
 * - 手臂层里 `1` = 右手（hand_r）、`2` = 左手（hand_l）、`3` = 拍面（racket），合成时换成皮肤 / 球拍色并记下挂点；
 * - `Q`（球拍）和特效像素（星星、眼泪）不描边：运行时没拍子时把 Q 设成透明，不会留下空描边；
 * - 锚点（ox, oy）= 两脚中间脚底下那一行（描边行）；head_top = 头顶描边那一像素。
 * - 跳起来的帧用 `dy`：像素整体上移，锚点不动。
 */

// ---------------------------------------------------------------- 合成工具（kid.ts 也用）

/** 一个底身：网格字符画 + 头顶点 + 锚点（网格坐标，不含描边）。 */
export interface Figure {
  readonly rows: readonly string[];
  /** 头顶描边那一像素（头顶第一行的上一行） */
  readonly head: readonly [number, number];
  /** 脚底中点下面那一行 */
  readonly anchor: readonly [number, number];
}

/** 一帧的写法。 */
export interface FrameSpec {
  /** 两个朝向的底身 */
  readonly base: Readonly<Record<Facing, Figure>>;
  /** 手臂层（正面坐标，"x,y:c" 用空格隔开）；背面镜像并画在底身下面 */
  readonly arms?: string;
  /** 永远画在最上面的像素（特效、正面也要压住身体的东西）；背面同样镜像 */
  readonly top?: string;
  /** 只在正面画在最上面、背面画在底身下面的东西已经由 arms 负责；这里是背面专用的额外像素（不镜像） */
  readonly backTop?: string;
  /** 整体上移的像素数（跳起） */
  readonly dy?: number;
}

/** 不描边的字符：球拍、星星、眼泪、闪光。 */
const NO_OUTLINE = new Set(['Q', 'q', '*', '~', '+', '.']);

/** 解析 "x,y:c x,y:c" 像素清单。 */
export function px(s: string | undefined): [number, number, string][] {
  if (!s) return [];
  const out: [number, number, string][] = [];
  for (const tok of s.trim().split(/\s+/)) {
    const m = /^(-?\d+),(-?\d+):(.)$/.exec(tok);
    if (!m) throw new Error(`像素写法不对：${tok}`);
    out.push([Number(m[1]), Number(m[2]), m[3] as string]);
  }
  return out;
}

/** 球拍：手在 (hx, hy)，往 (dx, dy) 方向伸出去：一格拍柄 + 2×2 拍面；拍面第一格记成拍面挂点。 */
export function rk(hx: number, hy: number, dx: number, dy: number): string {
  const cx = hx + dx * 2;
  const cy = hy + dy * 2;
  const sx = dx || 1;
  const sy = dy || -1;
  return [
    `${hx + dx},${hy + dy}:Q`,
    `${cx},${cy}:3`,
    `${cx + sx},${cy}:Q`,
    `${cx},${cy + sy}:Q`,
    `${cx + sx},${cy + sy}:Q`,
  ].join(' ');
}

/** 合成中间结果：字符网格 + 挂点。 */
interface Grid {
  cells: string[][];
  pts: Record<string, [number, number]>;
  ox: number;
  oy: number;
}

const MARK: Record<string, [string, string]> = { '1': ['hand_r', 'S'], '2': ['hand_l', 'S'], '3': ['racket', 'Q'] };

/** 把底身和手臂层合成一张网格（还没描边）。 */
export function composeGrid(spec: FrameSpec, facing: Facing, width: number): Grid {
  const fig = spec.base[facing];
  const h = fig.rows.length;
  // 四周留够球拍伸出去的空间，最后会裁掉
  const pad = 4;
  const W = width + pad * 2;
  const H = h + pad * 2;
  const cells: string[][] = Array.from({ length: H }, () => Array<string>(W).fill('.'));
  const pts: Record<string, [number, number]> = {};
  const back = facing === 'back';
  const mx = (x: number) => (back ? width - 1 - x : x);
  const put = (x: number, y: number, c: string) => {
    const gx = x + pad;
    const gy = y + pad;
    if (gy < 0 || gy >= H || gx < 0 || gx >= W) return;
    (cells[gy] as string[])[gx] = c;
  };
  const layer = (s: string | undefined, mirror: boolean) => {
    for (const [x0, y, c0] of px(s)) {
      const x = mirror ? mx(x0) : x0;
      let c = c0;
      const mk = MARK[c0];
      if (mk) {
        pts[mk[0]] = [x + pad, y + pad];
        c = mk[1];
      }
      put(x, y, c);
    }
  };
  const body = () => {
    fig.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] !== '.') put(x, y, row[x] as string);
    });
  };
  if (back) {
    layer(spec.arms, true);
    body();
  } else {
    body();
    layer(spec.arms, false);
  }
  layer(spec.top, back);
  if (back) layer(spec.backTop, false);
  pts.head_top = [fig.head[0] + pad, fig.head[1] + pad];
  const dy = spec.dy ?? 0;
  if (dy) {
    // 整体上移：像素往上挪，锚点不动
    cells.splice(0, dy);
    for (let i = 0; i < dy; i++) cells.push(Array<string>(W).fill('.'));
    for (const k of Object.keys(pts)) (pts[k] as [number, number])[1] -= dy;
  }
  return { cells, pts, ox: fig.anchor[0] + pad, oy: fig.anchor[1] + pad };
}

/** 描边（4 邻接）、裁边，得到 PixelArt。 */
export function finishGrid(g: Grid, pal?: Readonly<Record<string, string>>): PixelArt {
  const H = g.cells.length;
  const W = (g.cells[0] as string[]).length;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? '.' : (g.cells[y] as string[])[x]);
  const out = g.cells.map((r) => r.slice());
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (at(x, y) !== '.') continue;
      const n = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
      if (n.some((c) => !NO_OUTLINE.has(c as string))) (out[y] as string[])[x] = 'O';
    }
  // 包围盒（锚点也要在图里）
  let x0 = g.ox;
  let x1 = g.ox;
  let y0 = g.oy;
  let y1 = g.oy;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if ((out[y] as string[])[x] !== '.') {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  const rows = out.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1).join(''));
  const pts: Record<string, readonly [number, number]> = {};
  for (const [k, [x, y]] of Object.entries(g.pts)) pts[k] = [x - x0, y - y0];
  return pal ? { rows, ox: g.ox - x0, oy: g.oy - y0, pal, pts } : { rows, ox: g.ox - x0, oy: g.oy - y0, pts };
}

/** 顺时针（cw）或逆时针转 90°：躺倒的帧由站着的帧转出来。 */
export function rotateGrid(g: Grid, cw: boolean): Grid {
  // 先裁到非空包围盒，转完锚点放在身体中间的地面上
  const H = g.cells.length;
  const W = (g.cells[0] as string[]).length;
  let x0 = W;
  let x1 = 0;
  let y0 = H;
  let y1 = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if ((g.cells[y] as string[])[x] !== '.') {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const pad = 2;
  // 转后宽 h、高 w
  const cells: string[][] = Array.from({ length: w + pad * 2 }, () => Array<string>(h + pad * 2).fill('.'));
  const map = (x: number, y: number): [number, number] => {
    const lx = x - x0;
    const ly = y - y0;
    return cw ? [h - 1 - ly + pad, lx + pad] : [ly + pad, w - 1 - lx + pad];
  };
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const c = (g.cells[y] as string[])[x] as string;
      if (c === '.') continue;
      const [nx, ny] = map(x, y);
      (cells[ny] as string[])[nx] = c;
    }
  const pts: Record<string, [number, number]> = {};
  for (const [k, [x, y]] of Object.entries(g.pts)) pts[k] = map(x, y);
  return { cells, pts, ox: pad + (h >> 1), oy: pad + w };
}

/** 一组帧 → 两个朝向的动画。 */
export function anim(width: number, dt: number, specs: readonly FrameSpec[], pal?: Readonly<Record<string, string>>) {
  const one = (f: Facing): ArtAnim => ({ dt, frames: specs.map((s) => finishGrid(composeGrid(s, f, width), pal)) });
  return { front: one('front'), back: one('back') } as const satisfies Record<Facing, ArtAnim>;
}

/** 固定颜色：纸箱、胶带、晕眩星星、眼泪、烟灰、泥巴。 */
export const FX_PAL: Readonly<Record<string, string>> = {
  '#': '#c99a5b',
  '%': '#9a6e3a',
  '*': '#ffe36b',
  '~': '#8fd3ff',
  '+': '#ffffff',
  '@': '#2b2522',
  '&': '#6a4a2e',
  '^': '#8a6a45',
};

// ---------------------------------------------------------------- 成人底身

/** 成人网格宽 12（身体第 3..8 列），高 15（头 3..7、躯干 8..10、下装 11..12、腿 13、鞋 14）。 */
const AW = 12;

const HEAD_F = [
  '............',
  '............',
  '............',
  '....HHHH....',
  '...HHHHHh...',
  '...HSSSSh...',
  '...SESSES...',
  '....SSSs....',
];
const HEAD_B = [
  '............',
  '............',
  '............',
  '....HHHH....',
  '...HHHHHh...',
  '...HHHHHh...',
  '...HHHHHh...',
  '....SSSs....',
];
const TORSO = ['....TTTt....', '....TTTt....', '....RRRr....'];
const LEGS = {
  stand: ['....BBBb....', '....BBBb....', '....S..s....', '....F..F....'],
  /** 并步（走路中间帧） */
  close: ['....BBBb....', '....BBBb....', '.....Ss.....', '.....FF.....'],
} as const;

/** 拼出站姿底身；drop > 0 时头往下压 drop 行（低头、弯腰），盖住脖子和躯干顶上。 */
function adult(head: readonly string[], legs: readonly string[], drop = 0): Figure {
  const rows = [...head, ...TORSO, ...legs].map((r) => r.split(''));
  if (drop > 0) {
    const src = rows.map((r) => r.slice());
    for (let y = 3; y <= 7; y++) {
      const t = y + drop;
      // 落在原来头部范围里的整行替换，落到躯干上的只盖非透明像素
      if (t <= 7) rows[t] = (src[y] as string[]).slice();
      else
        for (let x = 0; x < AW; x++)
          if ((src[y] as string[])[x] !== '.') (rows[t] as string[])[x] = (src[y] as string[])[x] as string;
    }
    for (let y = 3; y < 3 + drop; y++) rows[y] = Array<string>(AW).fill('.');
  }
  return { rows: rows.map((r) => r.join('')), head: [6, 2 + drop], anchor: [6, 15] };
}

const STAND = { front: adult(HEAD_F, LEGS.stand), back: adult(HEAD_B, LEGS.stand) } as const;
const STEP = { front: adult(HEAD_F, LEGS.close), back: adult(HEAD_B, LEGS.close) } as const;
const LEAN = { front: adult(HEAD_F, LEGS.stand, 1), back: adult(HEAD_B, LEGS.stand, 1) } as const;

/** 坐在地上（晕眩）：头和身体往下沉 3 行，腿朝前伸开。 */
const SITG: Record<Facing, Figure> = {
  front: {
    rows: [
      ...Array(6).fill('............'),
      '....HHHH....',
      '...HHHHHh...',
      '...HSSSSh...',
      '...SESSES...',
      '....SSSs....',
      '....TTTt....',
      '....RRRr....',
      '..BBBBBBbb..',
      '..FF....FF..',
    ],
    head: [6, 5],
    anchor: [6, 15],
  },
  back: {
    rows: [
      ...Array(6).fill('............'),
      '....HHHH....',
      '...HHHHHh...',
      '...HHHHHh...',
      '...HHHHHh...',
      '....SSSs....',
      '....TTTt....',
      '....RRRr....',
      '...BBBBbb...',
      '............',
    ],
    head: [6, 5],
    anchor: [6, 15],
  },
};

// ---------------------------------------------------------------- 成人手臂（右手、正面坐标；左手 = 镜像）

/** 右臂的样子：肩在 (3,8)。 */
const R = {
  down: '3,8:L 3,9:S 3,10:1',
  hip: '3,8:L 2,9:S 3,10:1',
  low: '3,8:L 2,9:S 1,10:1',
  side: '3,8:L 2,8:S 1,8:S 0,8:1',
  sideUp: '3,8:L 2,7:S 1,6:S 0,5:1',
  up: '3,8:L 2,7:S 1,6:S 1,5:S 1,4:S 1,3:1',
  upOut: '3,8:L 2,7:S 1,6:S 0,5:S 0,4:1',
  upIn: '3,8:L 2,7:S 2,6:S 2,5:S 2,4:S 2,3:1',
  fwd: '3,8:L 2,9:S 1,9:1',
  fwdHi: '3,8:L 2,8:S 1,7:1',
  fwdLo: '3,8:L 2,9:S 1,10:1',
  chest: '3,8:L 3,9:S 4,9:1',
  clapIn: '3,8:L 3,9:S 4,9:S 5,9:1',
  face: '3,8:L 2,7:S 3,6:S 4,6:1',
  mouth: '3,8:L 2,7:S 3,7:S 4,7:1',
  ear: '3,8:L 2,7:S 2,6:1',
  head: '3,8:L 2,7:S 2,6:S 2,5:S 3,4:1',
  over: '3,8:L 2,7:S 2,6:S 2,5:S 2,4:S 3,3:S 4,2:1',
  shrug: '3,8:L 2,9:S 1,8:1',
  shrug2: '3,8:L 2,9:S 1,9:1',
} as const;

/** 把右臂写法镜像成左臂（左手的标记换成 2）。 */
function L(s: string): string {
  return px(s)
    .map(([x, y, c]) => `${AW - 1 - x},${y}:${c === '1' ? '2' : c}`)
    .join(' ');
}
/** 任意像素清单整体平移。 */
function sh(s: string, dx: number, dy: number): string {
  return px(s)
    .map(([x, y, c]) => `${x + dx},${y + dy}:${c}`)
    .join(' ');
}
const arms = (...parts: string[]) => parts.filter(Boolean).join(' ');

/** 常用：站着、两手位置。 */
const st = (r: string, l: string, extra: Partial<FrameSpec> = {}): FrameSpec => ({
  base: STAND,
  arms: arms(r, L(l)),
  ...extra,
});

/** 纸箱：抱在胸前（背面被身体挡住，只露出肩上的一角）。 */
const BOX =
  '4,7:# 5,7:% 6,7:% 7,7:# 3,8:# 4,8:# 5,8:# 6,8:# 7,8:# 8,8:# 3,9:# 4,9:# 5,9:# 6,9:# 7,9:# 8,9:# 4,10:% 5,10:% 6,10:% 7,10:%';

// ---------------------------------------------------------------- 手势

const a = (dt: number, specs: FrameSpec[]) => anim(AW, dt, specs, FX_PAL);

/** 成人手势帧：名字和 people/poses.ts 的 GESTURES 一致，另加 fallFace、fallBack、dizzy、carryBox。 */
export const ADULT_GESTURES: Record<string, Record<Facing, ArtAnim>> = {
  /** 吵架：两手轮流往上挥 */
  argue: a(0.12, [st(R.up, R.sideUp), st(R.sideUp, R.upOut)]),
  /** 说话：右手在身前比划 */
  talk: a(0.2, [st(R.fwd, R.down), st(R.fwdHi, R.down), st(R.fwd, R.down), st(R.low, R.down)]),
  /** 摊手 */
  shrug: a(0.35, [st(R.shrug, R.shrug, { dy: 0 }), st(R.shrug2, R.shrug2)]),
  /** 伸手 */
  hand: a(0.5, [st(R.fwd, R.down), st(R.fwd, R.hip)]),
  /** 指 */
  point: a(0.4, [st(R.side, R.down), st(sh(R.side, 0, 0), R.hip)]),
  /** 挥手 */
  wave: a(0.14, [st(R.up, R.down), st(R.upOut, R.down)]),
  /** 欢呼：双手举高，跳一下 */
  cheer: a(0.2, [st(R.up, R.up), st(R.upOut, R.upOut, { dy: 1 })]),
  /** 鼓掌 */
  clap: a(0.09, [st(R.chest, R.chest), st(R.clapIn, sh(R.chest, 1, 0))]),
  /** 左手拿瓶喝水：仰头 */
  drink: a(0.4, [st(R.down, R.mouth), st(R.down, sh(R.mouth, 0, -1))]),
  /** 往头上浇水 */
  pour: a(0.3, [st(R.down, R.over), st(R.hip, R.over)]),
  /** 吹哨 */
  whistle: a(0.18, [st(R.down, R.mouth), st(R.hip, R.mouth, { top: '9,5:+' })]),
  /** 扔东西：后摆 → 抡起 → 甩出 */
  throw: a(0.14, [st(R.low, R.down), st(R.up, R.fwd), st(R.fwdHi, R.side)]),
  /** 摔拍：举过头，往地上砸 */
  smash: a(0.13, [
    { base: STAND, arms: arms(R.upIn, rk(2, 3, 0, -1), L(R.side)) },
    { base: LEAN, arms: arms(sh(R.fwdLo, 0, 1), rk(1, 11, -1, 1), L(R.low)) },
    { base: LEAN, arms: arms(sh(R.fwdLo, 0, 1), rk(1, 11, -1, 1), L(R.low)), top: '0,14:* 2,14:*' },
  ]),
  /** 用铲子翻肉饼 */
  flip: a(0.18, [st(R.fwdLo, R.chest), st(R.fwdHi, R.chest)]),
  /** 弯腰签字 */
  sign: a(0.12, [
    { base: LEAN, arms: arms(sh(R.chest, 0, 1), L(sh(R.chest, 0, 1))) },
    { base: LEAN, arms: arms(sh(R.clapIn, 0, 1), L(sh(R.chest, 0, 1))) },
  ]),
  /** 握手：上下晃 */
  shake: a(0.1, [st(R.fwd, R.down), st(R.fwdLo, R.down)]),
  /** 捂脸 */
  facepalm: a(0.5, [
    { base: LEAN, arms: arms(sh(R.face, 0, 1), L(R.hip)) },
    { base: LEAN, arms: arms(sh(R.face, 0, 1), L(R.down)) },
  ]),
  /** 双手举手机拍照 */
  photo: a(0.3, [st(R.mouth, R.mouth), st(R.mouth, R.mouth, { top: '5,4:+' })]),
  /** 用手扇风 */
  fan: a(0.1, [st(R.down, R.ear), st(R.down, sh(R.ear, 1, -1))]),
  /** 跳舞 */
  dance: a(0.18, [
    st(R.up, R.sideUp),
    { base: STEP, arms: arms(R.side, L(R.upOut)), dy: 1 },
    st(R.sideUp, R.up),
    { base: STEP, arms: arms(R.upOut, L(R.side)), dy: 1 },
  ]),
  /** 被砸到头，双手捂头 */
  bonk: a(0.1, [st(R.head, R.head), { base: LEAN, arms: arms(sh(R.head, 0, 1), L(sh(R.head, 0, 1))) }]),
  /** 花式击球：原地转一圈 */
  trick: a(0.12, [
    { base: STAND, arms: arms(R.side, rk(0, 8, -1, -1), L(R.down)) },
    { base: { front: STAND.back, back: STAND.front }, arms: arms(R.down, L(R.side), rk(11, 8, 1, -1)) },
    { base: STAND, arms: arms(R.upOut, rk(0, 4, -1, -1), L(R.down)), dy: 1 },
  ]),
  /** 举分数牌 */
  cardUp: a(0.5, [st(R.upIn, R.down), st(R.upIn, R.hip)]),
  /** 拥抱：张开 → 抱紧 */
  hug: a(0.35, [st(R.side, R.side), st(R.clapIn, sh(R.chest, 1, 0))]),
  /** 哭：双手揉眼，眼泪往下掉 */
  cry: a(0.15, [
    st(R.face, R.face, { top: '3,8:~ 8,9:~' }),
    st(sh(R.face, 0, 0), R.face, { top: '3,9:~ 8,8:~', dy: 0 }),
  ]),
  /** 耙地 / 扫地：弯腰，双手前后拉 */
  rake: a(0.25, [
    { base: LEAN, arms: arms(sh(R.fwdLo, 0, 1), L(sh(R.chest, 0, 1))) },
    { base: LEAN, arms: arms(sh(R.low, 1, 1), L(sh(R.clapIn, 0, 1))) },
  ]),
  /** 晕眩：坐在地上，头顶星星打转 */
  dizzy: a(0.16, [
    { base: SITG, arms: arms(sh(R.down, 0, 3), L(sh(R.down, 0, 3))), top: '2,5:* 9,3:*' },
    { base: SITG, arms: arms(sh(R.down, 0, 3), L(sh(R.down, 0, 3))), top: '5,2:* 9,6:*' },
    { base: SITG, arms: arms(sh(R.down, 0, 3), L(sh(R.down, 0, 3))), top: '9,4:* 2,3:*' },
  ]),
  /** 抱着纸箱：第 0 帧站着，第 1 帧并步（走路时轮流） */
  carryBox: a(0.22, [
    { base: STAND, arms: arms(BOX, '3,8:L 3,9:1', L('3,8:L 3,9:1')) },
    { base: STEP, arms: arms(BOX, '3,8:L 3,9:1', L('3,8:L 3,9:1')), dy: 1 },
  ]),
  fallFace: fall(true),
  fallBack: fall(false),
};

/** 摔倒：由站姿转 90° 得到。face 脸朝下扑倒（头朝画面右、双手前伸），back 仰面躺倒（头朝左、脸朝上）。 */
function fall(face: boolean): Record<Facing, ArtAnim> {
  const make = (): PixelArt => {
    const spec: FrameSpec = face
      ? { base: { front: STAND.back, back: STAND.back }, arms: arms(R.upIn, L(R.upIn)) }
      : { base: { front: STAND.front, back: STAND.front }, arms: arms(R.low, L(R.low)) };
    return finishGrid(rotateGrid(composeGrid(spec, 'front', AW), face), FX_PAL);
  };
  const f = make();
  return { front: { dt: 1, frames: [f] }, back: { dt: 1, frames: [f] } };
}

// ---------------------------------------------------------------- 发型和覆盖物（锚点 = 帧的 head_top）

/** 叠加图：ox/oy 对准帧的 head_top（头顶描边那一像素，正好在头顶中线右边一格）。 */
function ov(rows: string[], ox: number, oy = 0, pal?: Readonly<Record<string, string>>): PixelArt {
  return pal ? { rows, ox, oy, pal } : { rows, ox, oy };
}

/**
 * 发型叠加：画在底身的短发上面。头在叠加图里的位置：第 0 行是头顶描边（第 2..5 列），
 * 第 1 行头发（2..5），第 2..3 行发际（1..6），第 4 行眼睛（第 2、5 列），第 5 行下巴，ox = 4。
 */
export const HAIR_OVERLAYS: Record<
  'cap' | 'visor' | 'pony' | 'long' | 'bald' | 'curly' | 'short',
  Record<Facing, PixelArt>
> = {
  /** 棒球帽：帽顶 + 朝前的帽檐 */
  cap: {
    front: ov(['..OOOO...', '.OCCCCO..', 'OCCCCCcO.', 'OcccccccO'], 4),
    back: ov(['..OOOO..', '.OCCCCO.', 'OCCCCCcO', 'OHcRRcHO'], 4),
  },
  /** 遮阳帽檐：一圈帽带 + 帽檐，头顶露头发 */
  visor: {
    front: ov(['.........', '.........', 'OCCCCCcO.', 'OcccccccO'], 4),
    back: ov(['........', '........', 'OCCCCCcO'], 4),
  },
  /** 马尾：正面从脑后一侧露出来，背面垂在脑后 */
  pony: {
    front: ov(['.......O..', '......OHO.', '.......OHO', '.......OHO', '........O.'], 4),
    back: ov(['........', '........', '........', '........', '...OHhO.', '...OHhO.', '....OhO.', '.....O..'], 4),
  },
  /** 长发：两边垂到肩上 */
  long: {
    front: ov(['........', '........', '........', '.H....h.', 'OH....hO', 'OHh..hhO', 'OHh..hhO', '.OO..OO.'], 4),
    back: ov(['........', '........', '........', '........', '.HHHHHh.', 'OHHHHHhO', 'OHHHHhhO', '.OOOOOO.'], 4),
  },
  /** 光头：头顶换成皮肤，留一点高光，两侧一圈头发 */
  bald: {
    front: ov(['........', '..SWSS..', '.SSSSSs.'], 4),
    back: ov(['........', '..SWSS..', '.SSSSSs.', '.HSSSsH.'], 4),
  },
  /** 卷发：比头大一圈，边上起伏 */
  curly: {
    front: ov(['..O.O.O...', '.OHOHOHO..', 'OHHHHHHhO.', 'OHHHHHHhO.', 'OH......hO', '.O......O.'], 5),
    back: ov(['..O.O.O...', '.OHOHOHO..', 'OHHHHHHhO.', 'OHHHHHHhO.', 'OHHHHHHhO.', 'OHhhhhhhO.', '.OOOOOOO..'], 5),
  },
  /** 短发：底身本来就是短发，只加一撮翘起的头发 */
  short: {
    front: ov(['.O.', 'OHO'], 1, 0),
    back: ov(['.O.', 'OHO'], 1, 0),
  },
};

/** 身上的覆盖物：毛巾盖头、烟熏黑脸、一身泥。同样对准 head_top。 */
export const BODY_OVERLAYS: Record<'towel' | 'soot' | 'mud', Record<Facing, PixelArt>> = {
  /** 毛巾：盖住头顶，两边垂下来 */
  towel: {
    front: ov(['..OOOO..', '.OWWWWO.', 'OWWWWWwO', 'OWSSSSwO', 'OW....wO', 'OW....wO', '.OO..OO.'], 4),
    back: ov(['..OOOO..', '.OWWWWO.', 'OWWWWWwO', 'OWWWWWwO', 'OWWWWWwO', 'OWWWWwwO', 'OwwwwwwO', '.OOOOOO.'], 4),
  },
  /** 烟熏黑脸：黑脸白眼 */
  soot: {
    front: ov(['........', '........', '..@@@@..', '.@@@@@@.', '.@+@@+@.', '..@@@@..'], 4, 0, FX_PAL),
    back: ov(['........', '........', '..@..@..', '.@.@@...', '..@...@.', '...@@...'], 4, 0, FX_PAL),
  },
  /** 一身泥：脸上一点，衣服和腿上几块 */
  mud: {
    front: ov(
      [
        '........',
        '........',
        '........',
        '........',
        '......&.',
        '........',
        '..&&....',
        '..&^..&.',
        '....&&&.',
        '.&......',
        '..&..^..',
        '......&.',
      ],
      4,
      0,
      FX_PAL,
    ),
    back: ov(
      [
        '........',
        '........',
        '...&....',
        '........',
        '........',
        '........',
        '....&&..',
        '..&&^...',
        '.....&..',
        '..&&....',
        '......&.',
        '..^.....',
      ],
      4,
      0,
      FX_PAL,
    ),
  },
};
