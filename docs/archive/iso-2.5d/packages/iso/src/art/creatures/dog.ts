import type { ArtAnim, Facing, PixelArt } from '../format';

/**
 * 流浪狗（约 9×6）。槽位：M 毛色（m 暗面）、O 描边、E 眼睛；固定色 1 鼻头、2 舌头。
 * 底图头朝右：front 是脸朝镜头（往右下走），back 是背朝镜头（往右上走，看不到脸）；朝左由翻转得到。
 * 锚点是四脚中间的地面点。
 */

const PAL = { '1': '#1c1418', '2': '#e0707a' } as const;
/** 行补齐到同样长（字符画好写，右边的透明可以省） */
const art = (rows: string[], ox = 4, oy = 5): PixelArt => {
  const w = Math.max(...rows.map((r) => r.length));
  return { rows: rows.map((r) => r.padEnd(w, '.')), ox, oy, pal: PAL };
};

/* ---------- 脸朝镜头 ---------- */

const F_STAND = art(['......mm.', 'm.....MEM1', '.mMMMMMMm.', '..MMMMMm..', '..m.m.mm..', '..O.O.OO..']);

const F_WALK1 = art(['......mm.', '.m....MEM1', 'm.MMMMMMm.', '..MMMMMm..', '.m..m.m.m.', '.O..O.O.O.']);

const F_WALK2 = art(['......mm.', 'm.....MEM1', '.mMMMMMMm.', '..MMMMMm..', '...mm..m..', '...OO..O..']);

/** 跑：身子拉长、四腿前后撒开，两帧 */
const F_RUN1 = art(['.......mm.', 'mm.....MEM1', '..MMMMMMm2.', '.mMMMMMm...', 'm.......m..', 'O........O.']);

const F_RUN2 = art(['.......mm.', '.......MEM1', 'mmMMMMMMm2.', '..MMMMMm...', '...mmmm....', '...O..O....']);

/** 坐：后腿收起，前腿撑直，头抬高 */
const F_SIT = art(['.....mm.', '.....MEM1', '....MMMm.', '..mMMMm..', 'mmMMMMm..', '.OmmOO...'], 4, 5);

/** 低头嗅地 */
const F_SNIFF = art(['..........', 'm.........', '.mMMMMMmm.', '..MMMMMMEm', '..m.m.mm.1', '..O.O.OO..']);

/* ---------- 背朝镜头（看不到脸，耳朵在后脑勺） ---------- */

const B_STAND = art(['.....m.m.', 'm....MMMm', '.mMMMMMMm', '..mMMMMm.', '..m.m.mm.', '..O.O.OO.']);

const B_WALK1 = art(['.....m.m.', '.m...MMMm', 'm.MMMMMMm', '..mMMMMm.', '.m..m.m.m', '.O..O.O.O']);

const B_WALK2 = art(['.....m.m.', 'm....MMMm', '.mMMMMMMm', '..mMMMMm.', '...mm..m.', '...OO..O.']);

const B_RUN1 = art(['......m.m.', 'mm....MMMm', '..MMMMMMm.', '.mMMMMMm..', 'm.......m.', 'O........O']);

const B_RUN2 = art(['......m.m.', '......MMMm', 'mmMMMMMMm.', '..mMMMMm..', '...mmmm...', '...O..O...']);

const B_SIT = art(['....m.m.', '....MMMm', '....MMMm', '..mMMMm.', 'mmMMMMm.', '.OmmOO..']);

const B_SNIFF = art(['..........', 'm.........', '.mMMMMMm..', '..mMMMMMMm', '..m.m.mmm.', '..O.O.OO..']);

const both = (front: PixelArt[], back: PixelArt[], dt: number): Record<Facing, ArtAnim> => ({
  front: { frames: front, dt },
  back: { frames: back, dt },
});

/** 狗的动画：idle 站着摇尾（尾巴两帧）、walk、run、sit、sniff。 */
export const DOG: Readonly<Record<'idle' | 'walk' | 'run' | 'sit' | 'sniff', Record<Facing, ArtAnim>>> = {
  idle: both([F_STAND, F_WALK2], [B_STAND, B_WALK2], 0.22),
  walk: both([F_WALK1, F_STAND, F_WALK2, F_STAND], [B_WALK1, B_STAND, B_WALK2, B_STAND], 0.12),
  run: both([F_RUN1, F_RUN2], [B_RUN1, B_RUN2], 0.09),
  sit: both([F_SIT], [B_SIT], 1),
  sniff: both([F_SNIFF, F_STAND], [B_SNIFF, B_STAND], 0.35),
};

/** 毛色变体（填 main 槽位；暗面自动压暗） */
export const DOG_COATS: readonly string[] = ['#8a6440', '#c89a5e', '#e8dcc4', '#4a3a30', '#b0603a'];
