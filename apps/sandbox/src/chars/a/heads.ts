/**
 * 手画的头（正面 / 背面）。每个头的 7×6 脸框左上角在 (fx, fy)：
 * 第 0 行头顶、1 眉毛（或刘海 / 帽檐）、2 眼睛（眼白 W + 瞳孔 E，看向右下）、3 鼻子（受光 1 + 鼻影 s）、4 嘴、5 下巴。
 * 头发、帽子、胡子可以超出脸框（马尾、帽檐、发髻、胡子垂到脖子上）。字符见 format.ts。
 * 光从左上来：左边受光，右边一列背光。
 */
import type { HeadArt } from './body';

const H = (fx: number, fy: number, rows: string[]): HeadArt => ({ rows, fx, fy });

export const HEADS: Record<string, { front: HeadArt; back: HeadArt }> = {
  // Dale：深色棒球帽、白头发、白胡子、宽脸、眼角皱纹
  dale: {
    front: H(1, 1, [
      '..CC5CCc....',
      '.C55CCCCCc..',
      '.H6CCCCCCCC5',
      '.HWESWEsh...',
      '.KxS1sxk....',
      '.KKxxxKk....',
      '.KKKKKKk....',
      '..KKKK0.....',
    ]),
    back: H(1, 1, [
      '..CC5CCc...',
      '.C55CCCCCc.',
      '.CCCCCCCCc5',
      'SHCHvHCCh..',
      'sHHHHHHHhs.',
      '.HHHHHHhh..',
      '..vhhhv....',
    ]),
  },
  // Rosa：宽檐草帽、粗眉、晒出来的眼角纹、黑辫子垂在背后
  rosa: {
    front: H(3, 1, [
      '.....C5CCc.....',
      '....C5CCCCCc...',
      '5CCCCCCCCCCCCc.',
      '..HhvSvvh......',
      '..SWESWEs......',
      '..xSS1sxs......',
      '..SSSxxSs......',
      '...sSSSs.......',
    ]),
    back: H(3, 1, [
      '.....C5CCc.....',
      '....C5CCCCCc...',
      '5CCCCCCCCCCCCc.',
      '...HHHHHHh.....',
      '..sHHiHHHhs....',
      '...HHHHHHh.....',
      '....hHHhv......',
      '.....HHh.......',
      '.....hHv.......',
      '.....HHh.......',
      '.....vh........',
      '.....AA........',
    ]),
  },
  // Ben：蓬乱的黑发、翘起一撮、年轻光脸、笑眯眯
  ben: {
    front: H(1, 2, [
      '...H..H.....',
      '..HiHHHHh...',
      '.HiHHHHHHh..',
      '.HHHvHHvHHh.',
      '.SWESWEsh...',
      '.SSS1sSs....',
      '.SSxxxSs....',
      '..sSSSs.....',
    ]),
    back: H(1, 2, [
      '...H..H....',
      '..HiHHHHh..',
      '.HiHHHHHHh.',
      'sHHHHHHHHhs',
      '.HHHHHHHhh.',
      '.HHHHHHhhh.',
      '..hhHhhv...',
      '...sss.....',
    ]),
  },
  // Jess：遮阳帽檐 + 高马尾、晒黑、干劲十足的大眼睛
  jess: {
    front: H(3, 1, [
      '...HiHHHh.....',
      '..HiHHHHHh....',
      'hHUUUUUUUUU=..',
      'HhSvvSvvs.....',
      'v.SWESWEs.....',
      'H.SSS1sSs.....',
      'h.SSMxMSs.....',
      'v..sSSSs......',
    ]),
    back: H(3, 1, [
      '...HiHHHh....',
      '..HiHHHHHh...',
      '..UUUUUUUU=..',
      '..HHHHHHHh...',
      '..sHHHHHhs...',
      '...HHHHHh....',
      '....hAhh.....',
      '.....Hh......',
      '.....hHh.....',
      '......Hh.....',
      '......v......',
    ]),
  },
  // Gus：灰白稀疏的头发（头顶秃了）、垂眼皮、眼袋、胡茬、下垂的灰胡子
  gus: {
    front: H(1, 1, [
      '...1SSs....',
      '.HS1SSSsh..',
      '.HhhSxhhh..',
      '.HxEsxEsh..',
      '.0SsS1s0...',
      '.0KKKKK0...',
      '..0KxK0....',
    ]),
    back: H(1, 1, [
      '...1SSs....',
      '.HS1SSSsH..',
      '.HHHSSHHh..',
      'sHHHHHHHhs.',
      '.HHHHHHHh..',
      '.HHHHHhh...',
      '..0hhh0....',
    ]),
  },
  // Lily：齐刘海黑长直、金耳钉、口红
  lily: {
    front: H(2, 1, [
      '...HiHHHh....',
      '..HiHHHHHHh..',
      '.HHHHHHHHHHh.',
      '.HhSWESWEsH..',
      '.HHSSS1sSHh..',
      '.HhASSMMsHh..',
      '.HH.sSSs.Hh..',
      '.Hh......hH..',
      '.hh......hh..',
    ]),
    back: H(2, 1, [
      '...HiHHHh....',
      '..HiHHHHHHh..',
      '.HHHHHHHHHHh.',
      '.HHiHHHHHHHh.',
      '.HHHHHHHHHhh.',
      '.HHHHHHHHHhh.',
      '.HHHHHHHHhhh.',
      '.HHHHHHHHhhv.',
      '.hHHHHHHhhv..',
      '..vhhhhhvv...',
    ]),
  },
  // Teodora：利落的斜波波头、粗黑框眼镜、挺鼻子、嘴角往下（挑剔）
  teodora: {
    front: H(1, 1, [
      '..HHiHHHh...',
      '.HiHHHHHHHh.',
      'HGGGGGGGHhh.',
      'HGWEGWEGhh..',
      'HhSS1sSsh...',
      'HhSxxxsHv...',
      'v.sSSsSv....',
    ]),
    back: H(1, 1, [
      '..HHiHHHh...',
      '.HiHHHHHHHh.',
      'HHHHHHHHHHhh',
      'HHHHHHHHHHh.',
      'HHHHHHHHHhh.',
      'HhHHHHHHhhv.',
      'v.vsSSsvvv..',
    ]),
  },
  // Nadia：白金高马尾、推到头顶的墨镜、高颧骨、明星的笑
  nadia: {
    front: H(3, 1, [
      '...iHH9GG9....',
      '..HiHHHHHHh...',
      'iHHHHHHHHHh...',
      'HiHSvvSvvh....',
      'H.SWESWEs.....',
      'h.1SS1sSs.....',
      '..SSMxMSs.....',
      '...sSSSs......',
    ]),
    back: H(3, 1, [
      '...iHH9GG9...',
      '..HiHHHHHHh..',
      '..HHHHHHHHh..',
      '..HHiHHHHHh..',
      '..sHHHHHHhs..',
      '...HHHHHh....',
      '....hAhh.....',
      '.....iHh.....',
      '.....HHh.....',
      '......Hh.....',
      '......h......',
    ]),
  },
  // Ray：秃顶发亮、两侧一圈灰发、浓黑灰八字胡、方下巴
  ray: {
    front: H(1, 1, [
      '..1+1SSs...',
      '.S11SSSSs..',
      '.HSvSSvSH..',
      '.HWESWEsH..',
      '.SSS1sSs...',
      '.SKKKKKs...',
      '.sSSxSSs...',
    ]),
    back: H(1, 1, [
      '..111SSs...',
      '.S11SSSSs..',
      '.SSSSSSSs..',
      'sHHHHHHHHs.',
      '.HHHHHHHh..',
      '.HHHHHHhh..',
      '..sSSSs....',
    ]),
  },
  // Mateo：一头卷发（轮廓蓬起来）、少年的脸
  mateo: {
    front: H(1, 2, [
      '..H.HH.H....',
      '.HiHiHHiHh..',
      'HiHHiHHHiHh.',
      'HHHHHHHHHHh.',
      'h.SWESWEsh..',
      '..SSS1sSs...',
      '..SSxxSSs...',
      '...sSSs.....',
    ]),
    back: H(1, 2, [
      '..H.HH.H...',
      '.HiHiHHiHh.',
      'HiHHiHHHiHh',
      'HHiHHHiHHHh',
      'HHHHiHHHHhh',
      'hHHHHHHHhhv',
      '.hHhHhHhv..',
      '...sss.....',
    ]),
  },
  // 总监：整齐的侧分短发、干净的脸
  director: {
    front: H(1, 1, [
      '..HiiHHHh..',
      '.HiHHHHHHh.',
      '.HHHhvSvHh.',
      '.SWESWEsh..',
      '.SSS1sSs...',
      '.SSSxxSs...',
      '..sSSSs....',
    ]),
    back: H(1, 1, [
      '..HiiHHHh..',
      '.HiHHHHHHh.',
      '.HHHHHHHHh.',
      'sHHHHHHHHhs',
      '.HHHHHHHhh.',
      '.hHHHHHhh..',
      '..sSSSs....',
    ]),
  },
  // 小孩 1：男孩，吸汗头带、短发、大眼睛
  kidA: {
    front: H(1, 1, [
      '..HiHHHh...',
      '.HiHHHHHh..',
      '.AAAAAAAa..',
      '.SWESWEs...',
      '.SSS1sSs...',
      '.SSxxSSs...',
      '..sSSs.....',
    ]),
    back: H(1, 1, [
      '..HiHHHh...',
      '.HiHHHHHh..',
      '.AAAAAAAa..',
      'sHHHHHHHs..',
      '.HHHHHHh...',
      '.hHHHHhh...',
      '..sSSs.....',
    ]),
  },
  // 小孩 2：女孩，两个小辫子、雀斑
  kidB: {
    front: H(2, 1, [
      '...HiHHh....',
      '..HiHHHHh...',
      'AHHHvHHvHhA.',
      'HhSWESWEsHh.',
      'h.SsS1sSs.h.',
      '..SSMxSSs...',
      '...sSSs.....',
    ]),
    back: H(2, 1, [
      '...HiHHh....',
      '..HiHHHHh...',
      'AHHHHHHHHhA.',
      'HhHHHvHHHhHh',
      'h.HHHvHHHh.h',
      '..hHHvHHh...',
      '...sSSs.....',
    ]),
  },
  // 退休老人：白色遮阳帽檐、白发、晒红的脸、深眼窝和法令纹
  retiree: {
    front: H(1, 1, [
      '..HiHHHh....',
      '.HHHHHHHh...',
      '.UUUUUUUUU=.',
      '.HxESxEsH...',
      '.SxS1sxs....',
      '.SxSxxxs....',
      '..sSSSs.....',
    ]),
    back: H(1, 1, [
      '..HiHHHh...',
      '.HHHHHHHh..',
      '.UUUUUUUU=.',
      'sHHHHHHHHs.',
      '.HHHHHHHh..',
      '.hHHHHHh...',
      '..sSSSs....',
    ]),
  },
  // 网球妈妈：头顶乱丸子头、大墨镜、口红
  mom: {
    front: H(1, 3, [
      '...HiHh.....',
      '..HiHHHh....',
      '...hHHh.....',
      '..HiHHHHh...',
      '.HiHHHHHHh..',
      '.GGGGGGG9h..',
      '.S9GG9GG9...',
      '.SSSSMMSs...',
      '..sSSSs.....',
    ]),
    back: H(1, 3, [
      '...HiHh....',
      '..HiHHHh...',
      '...hHHh....',
      '..HiHHHHh..',
      '.HiHHHHHHh.',
      '.HHHHHHHHh.',
      'sHHHHHHHHhs',
      '.HHHHHHHhh.',
      '..hHHHHhh..',
      '..sSSSs....',
    ]),
  },
  // 游客：卡其渔夫帽、晒伤的鼻子、傻笑
  tourist: {
    front: H(2, 1, [
      '...C5CCCc....',
      '..C5CCCCCc...',
      '.5CCCCCCCCCc.',
      '..HSWESWEsH..',
      '..SSSMMsSs...',
      '..SSxxxSs....',
      '...sSSSs.....',
    ]),
    back: H(2, 1, [
      '...C5CCCc....',
      '..C5CCCCCc...',
      '.5CCCCCCCCCc.',
      '..HHHHHHHHh..',
      '..HHHHHHHh...',
      '...hHHHHh....',
      '....sSSs.....',
    ]),
  },
};
