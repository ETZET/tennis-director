import type { ArtAnim, Facing, PixelArt } from '../format';

/**
 * 乌鸦（约 6×5）。固定色：0 羽毛黑、1 翅膀（略亮的黑）、2 喙和脚（灰）、3 眼睛的一点亮光。
 * 底图头朝右；front / back 只差眼睛和喙露不露（太小了，背面就是没有眼睛的剪影）。锚点是脚底。
 */

const PAL = { '0': '#18181c', '1': '#30303a', '2': '#6a6a6a', '3': '#c8c8d0' } as const;
const art = (rows: string[], ox = 2, oy = rows.length - 1): PixelArt => {
  const w = Math.max(...rows.map((r) => r.length));
  return { rows: rows.map((r) => r.padEnd(w, '.')), ox, oy, pal: PAL };
};

/* ---------- 停着：转头（两帧：喙朝前 / 头往回扭） ---------- */

const F_PERCH = art(['...00.', '..0302', '00110.', '.0000.', '..2.2.']);
const F_LOOK = art(['..00..', '.2030.', '00110.', '.0000.', '..2.2.']);
const B_PERCH = art(['...00.', '..0002', '00110.', '.0000.', '..2.2.']);
const B_LOOK = art(['..00..', '.2000.', '00110.', '.0000.', '..2.2.']);

/** 啄地：头扎下去 */
const F_PECK = art(['......', '......', '00110.', '.00000', '..2.22']);
const B_PECK = art(['......', '......', '00110.', '.00000', '..2.22']);

/** 跳一下（身子离地一格，脚收起） */
const F_HOP = art(['...00.', '..0302', '00110.', '.0000.', '..22..', '......']);
const B_HOP = art(['...00.', '..0002', '00110.', '.0000.', '..22..', '......']);

/** 飞：翅膀上 / 翅膀下 */
const F_FLY1 = art(['1....1.', '11..11.', '.1001..', '..0032.', '.0000..', '..0....'], 3);
const F_FLY2 = art(['.......', '...00..', '..0032.', '00000..', '11..11.', '1....1.'], 3);
const B_FLY1 = art(['1....1.', '11..11.', '.1001..', '..0002.', '.0000..', '..0....'], 3);
const B_FLY2 = art(['.......', '...00..', '..0002.', '00000..', '11..11.', '1....1.'], 3);

const both = (front: PixelArt[], back: PixelArt[], dt: number): Record<Facing, ArtAnim> => ({
  front: { frames: front, dt },
  back: { frames: back, dt },
});

export const CROW: Readonly<Record<'perch' | 'look' | 'peck' | 'hop' | 'fly', Record<Facing, ArtAnim>>> = {
  perch: both([F_PERCH], [B_PERCH], 1),
  look: both([F_PERCH, F_LOOK], [B_PERCH, B_LOOK], 0.6),
  peck: both([F_PECK, F_PERCH], [B_PECK, B_PERCH], 0.18),
  hop: both([F_HOP], [B_HOP], 0.2),
  fly: both([F_FLY1, F_FLY2], [B_FLY1, B_FLY2], 0.07),
};
