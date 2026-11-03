import type { ArtAnim, Facing, PersonSheet, PixelArt } from '../format';
import { anim, composeGrid, type Figure, type FrameSpec, FX_PAL, finishGrid, px, rk, rotateGrid } from './gestures';

/**
 * 小朋友精灵表（ADR 0019）：身体约 7×10（含描边），和成人同一套画法（见 gestures.ts 的合成工具）。
 *
 * 网格宽 13、高 14：身体在第 4..8 列，头 4..6 行、脖子 7、上衣 8..9、短裤 10、鞋 11；
 * 肩膀在 (4,8)（右）和 (8,8)（左）。站姿锚点 (6,12)，head_top (6,3)。
 * 坐姿（seated）的锚点是屁股落座的那一行（腿垂在锚点下面），运行时把锚点放到座位高度。
 */

const KW = 13;
const BLANK = '.............';

/** 拼一个底身：从第 top 行开始放这些行，补够 14 行。 */
function fig(rows: readonly string[], top: number, head: [number, number], anchor: [number, number]): Figure {
  const out = [...Array<string>(top).fill(BLANK), ...rows];
  while (out.length < 14) out.push(BLANK);
  return { rows: out, head, anchor };
}

const HEAD_F = ['.....HHH.....', '....HHHHh....', '....HESEh....', '.....SSs.....'];
const HEAD_B = ['.....HHH.....', '....HHHHh....', '....HHHHh....', '.....SSs.....'];
const SHIRT = ['.....TTt.....', '.....TTt.....'];

/** 按头（正 / 背）拼出两个朝向。 */
function pair(make: (head: readonly string[]) => Figure): Record<Facing, Figure> {
  return { front: make(HEAD_F), back: make(HEAD_B) };
}

/** 站着 */
const STAND = pair((h) => fig([...h, ...SHIRT, '.....BBb.....', '.....F.F.....'], 4, [6, 3], [6, 12]));
/** 并步（走路中间帧） */
const CLOSE = pair((h) => fig([...h, ...SHIRT, '.....BBb.....', '......F......'], 4, [6, 3], [6, 12]));
/** 跨大步（跑） */
const STRIDE = pair((h) => fig([...h, ...SHIRT, '....BBBbb....', '....F...F....'], 4, [6, 3], [6, 12]));
/** 半蹲（准备、击球）：上身下沉一行，膝盖分开 */
const CROUCH = pair((h) => fig([...h, '.....TTt.....', '....BBBbb....', '....F...F....'], 5, [6, 4], [6, 12]));
/** 坐在长椅上：大腿朝前，小腿垂下；锚点在屁股那一行 */
const SEAT = pair((h) => fig([...h, ...SHIRT, '....BBBbb....', '....S...s....', '....F...F....'], 4, [6, 3], [6, 11]));
/** 坐在地上：身体沉下去，腿朝前伸开 */
const SITG: Record<Facing, Figure> = {
  front: fig([...HEAD_F, '.....TTt.....', '...BBBBBbb...', '...F.....F...'], 6, [6, 5], [6, 13]),
  back: fig([...HEAD_B, '.....TTt.....', '....BBBbb....'], 6, [6, 5], [6, 13]),
};

/** 右臂（正面坐标，肩在 (4,8)）；左臂由镜像得到。 */
const R = {
  down: '4,8:L 4,9:1',
  fwd: '4,8:L 3,9:1',
  back: '4,8:L 4,9:1',
  side: '4,8:L 3,8:S 2,8:1',
  up: '4,8:L 3,7:S 2,6:S 2,5:1',
  upV: '4,8:L 3,7:S 2,6:1',
  chest: '4,8:L 3,8:1',
  clap: '4,8:L 5,8:1',
  face: '4,8:L 4,7:S 5,6:1',
  hold: '4,8:L 4,9:S 5,9:1',
} as const;

function L(s: string): string {
  return px(s)
    .map(([x, y, c]) => `${KW - 1 - x},${y}:${c === '1' ? '2' : c}`)
    .join(' ');
}
function sh(s: string, dx: number, dy: number): string {
  return px(s)
    .map(([x, y, c]) => `${x + dx},${y + dy}:${c}`)
    .join(' ');
}
const j = (...p: string[]) => p.filter(Boolean).join(' ');
const on = (base: Record<Facing, Figure>, arms: string, extra: Partial<FrameSpec> = {}): FrameSpec => ({
  base,
  arms,
  ...extra,
});
/** 站着、两只手 */
const st = (r: string, l: string, extra: Partial<FrameSpec> = {}) => on(STAND, j(r, L(l)), extra);
/** 蹲着（肩膀往下一行） */
const cr = (arms: string) => on(CROUCH, arms);

const a = (dt: number, specs: FrameSpec[]) => anim(KW, dt, specs, FX_PAL);

/** 摔倒：同成人，由站姿转 90°。 */
function fall(face: boolean): Record<Facing, ArtAnim> {
  const spec: FrameSpec = face
    ? { base: { front: STAND.back, back: STAND.back }, arms: j(R.up, L(R.up)) }
    : { base: { front: STAND.front, back: STAND.front }, arms: j(R.fwd, L(R.fwd)) };
  const f: PixelArt = finishGrid(rotateGrid(composeGrid(spec, 'front', KW), face), FX_PAL);
  return { front: { dt: 1, frames: [f] }, back: { dt: 1, frames: [f] } };
}

const BLINK = '5,6:s 7,6:s';

/** 小朋友精灵表。没有的帧名运行时按 FRAME_FALLBACK 往回找。 */
export const KID: PersonSheet = {
  body: 'kid',
  anims: {
    idle: a(0.5, [st(R.down, R.down), st(R.down, R.down), st(R.down, R.down), st(j(R.down, BLINK), R.down)]),
    walk: a(0.14, [
      st(R.fwd, R.back),
      on(CLOSE, j(R.down, L(R.down)), { dy: 1 }),
      st(R.back, R.fwd),
      on(CLOSE, j(R.down, L(R.down)), { dy: 1 }),
    ]),
    run: a(0.09, [
      on(STRIDE, j(R.chest, L('4,8:L 4,9:S 5,10:1'))),
      on(CLOSE, j(R.fwd, L(R.fwd)), { dy: 2 }),
      on(STRIDE, j('4,8:L 4,9:S 5,10:1', L(R.chest))),
      on(CLOSE, j(R.fwd, L(R.fwd)), { dy: 2 }),
    ]),
    hop: a(0.15, [cr(j(sh(R.down, 0, 1), L(sh(R.down, 0, 1)))), st(R.upV, R.upV, { dy: 2 })]),
    ready: a(0.4, [cr(j(sh(R.down, 0, 1), L(sh(R.down, 0, 1)), rk(4, 10, -1, -1)))]),
    relaxed: a(0.5, [st(j(R.down, rk(4, 9, -1, 1)), R.down)]),
    seated: a(0.5, [on(SEAT, j(R.down, L(R.down)))]),
    sitGround: a(0.5, [on(SITG, j('4,10:L 3,11:1', L('4,10:L 3,11:1')))]),
    // 正手：引拍 → 击球 → 收拍到左肩
    fhB: a(0.1, [cr(j('4,9:L 3,10:S 2,10:1', rk(2, 10, -1, -1), L('4,9:L 3,10:1')))]),
    fhC: a(0.1, [cr(j('4,9:L 3,10:1', rk(3, 10, -1, 0), L('4,9:L 4,10:1')))]),
    fhF: a(0.1, [cr(j('4,9:L 5,10:S 6,10:S 7,9:S 8,8:1', rk(8, 8, 1, -1), L('4,9:L 3,9:1')))]),
    // 反手（双手）：拍子引到左边 → 击球 → 收到右肩上
    bhB: a(0.1, [cr(j('4,9:L 5,10:S 6,10:S 7,10:S 8,10:1', L('4,9:L 3,10:1'), rk(8, 10, 1, -1)))]),
    bhC: a(0.1, [cr(j(L('4,9:L 4,10:1'), '4,9:L 5,10:S 6,10:S 7,10:1', rk(7, 10, 1, 0)))]),
    bhF: a(0.1, [cr(j('4,9:L 3,8:S 3,7:1', '8,9:L 7,9:S 6,9:S 5,8:S 4,7:2', rk(3, 7, -1, -1)))]),
    // 发球：抛球举拍 → 高点击球（跳起）→ 收拍到左下
    sT: a(0.15, [st(j('4,8:L 3,7:S 3,6:1', rk(3, 6, -1, -1)), '4,8:L 3,7:S 3,6:S 3,5:S 3,4:1')]),
    sC: a(0.1, [st(j('4,8:L 3,7:S 3,6:S 3,5:S 3,4:1', rk(3, 4, 0, -1)), R.down, { dy: 1 })]),
    sF: a(0.12, [cr(j('4,9:L 5,10:S 6,10:S 7,10:1', rk(7, 10, 1, 1), L('4,9:L 3,9:1')))]),
    cheer: a(0.2, [st(R.up, R.up), st(R.upV, R.upV, { dy: 1 })]),
    clap: a(0.09, [st(R.chest, R.chest), st(R.clap, sh(R.clap, 1, 0))]),
    wave: a(0.15, [st(R.up, R.down), st(R.upV, R.down)]),
    cry: a(0.15, [st(R.face, R.face, { top: '3,8:~ 9,9:~' }), st(R.face, R.face, { top: '3,9:~ 9,8:~' })]),
    carry: a(0.5, [st(R.hold, R.hold)]),
    fallFace: fall(true),
    fallBack: fall(false),
  },
};

// ---------------------------------------------------------------- 小朋友的发型和覆盖物（头比成人窄一格）

function ov(rows: string[], ox = 3, oy = 0, pal?: Readonly<Record<string, string>>): PixelArt {
  return pal ? { rows, ox, oy, pal } : { rows, ox, oy };
}

/**
 * 小朋友版的发型叠加（和 gestures.ts 的 HAIR_OVERLAYS 同名同义）。ox = 3 对准 head_top：
 * 第 0 行头顶描边（2..4 列）、第 1 行头发（2..4）、第 2 行（1..5）、第 3 行眼睛（第 2、4 列）、第 4 行下巴。
 */
export const KID_HAIR_OVERLAYS: Record<
  'cap' | 'visor' | 'pony' | 'long' | 'bald' | 'curly' | 'short',
  Record<Facing, PixelArt>
> = {
  cap: { front: ov(['..OOO...', '.OCCCO..', 'OccccccO']), back: ov(['..OOO..', '.OCCCO.', 'OCCCCcO']) },
  visor: { front: ov(['........', '........', 'OccccccO']), back: ov(['.......', '.......', 'OCCCCcO']) },
  pony: {
    front: ov(['........', '......O.', '.....OHO', '......HO', '......O.']),
    back: ov(['.......', '.......', '.......', '..OHO..', '..OhO..', '...O...']),
  },
  long: {
    front: ov(['.......', '.......', '.......', '.......', '.H...h.', 'OH...hO', '.O...O.']),
    back: ov(['.......', '.......', '.......', '.HHHHh.', '.HHHHh.', 'OHHHhhO', '.OOOOO.']),
  },
  bald: { front: ov(['.......', '..SWS..', '.SSSSs.']), back: ov(['.......', '..SWS..', '.SSSSs.', '.HSSsH.']) },
  curly: {
    front: ov(['..O.O..', '.OHOHO.', 'OHHHHhO', 'OHHHHhO', 'OH...hO', '.O...O.'], 3, 1),
    back: ov(['..O.O..', '.OHOHO.', 'OHHHHhO', 'OHHHHhO', 'OHHHHhO', '.OOOOO.'], 3, 1),
  },
  short: { front: ov(['.O.', 'OHO'], 1), back: ov(['.O.', 'OHO'], 1) },
};

/** 小朋友版的毛巾、黑脸、泥巴（和 BODY_OVERLAYS 同名同义）。 */
export const KID_BODY_OVERLAYS: Record<'towel' | 'soot' | 'mud', Record<Facing, PixelArt>> = {
  towel: {
    front: ov(['..OOO..', '.OWWWO.', 'OWWWWwO', 'OW...wO', 'OW...wO', '.O...O.']),
    back: ov(['..OOO..', '.OWWWO.', 'OWWWWwO', 'OWWWWwO', 'OWWWwwO', '.OOOOO.']),
  },
  soot: {
    front: ov(['.......', '.......', '.@@@@@.', '.@+@+@.', '..@@@..'], 3, 0, FX_PAL),
    back: ov(['.......', '..@....', '....@..', '..@.@..'], 3, 0, FX_PAL),
  },
  mud: {
    front: ov(['.......', '.......', '.......', '....&..', '.......', '..&&...', '...&^..', '..&....'], 3, 0, FX_PAL),
    back: ov(['.......', '.......', '..&....', '.......', '...&...', '..&^...', '....&..', '...^...'], 3, 0, FX_PAL),
  },
};
