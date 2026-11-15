// clubbuild 的新材质（grounds 这组自己的；别的组不改这个文件）。挑色规则照 clubsite/render/palette.ts 文件头。
// 地面组（泳池、停车场、遮阳、棕榈、仙人掌花坛、喷泉）几乎全用现成的颜色：泳池的池水 / 躺椅垫、喷泉的池水 / 花砖、
// 石板、陶砖、土坯、白灰泥都已经在合并的表里。缺的只有停车场（clubpark）那一套：沥青、车位漆、路缘、连锁砖和车漆 ——
// clubpark 的表没合进 palette.ts，这里原样搬过来（只读引用，颜色以 clubpark/palette.ts 为准）。
// 名字都已经在 clubsite/render/palettes 的 GROUP 表里（沥青、漆 → court；路缘 → wall；冷色车漆 → club；暖色 → accent），配色方案照常调。
// glass、tyre、carSilver 不搬：clubfood 的表里已经有（carSilver 是 clubfood 改过中/暗档的那份），spread 在后面会盖掉它们。

// 美术 r1（绿洲台地）新加：地块顶面的两种割草条纹（lotLawn / lotLawnStripe）、还没买下来的台面（lotWild）。
// 这几个名字不在配色方案的 GROUP 表里 → kit.ts 的 palOpts 按下面的 PROXY 借同组材质名过调色（颜色还是自己的）：
// 草坪借 lawn（plants 组：暗档往青绿走，不往玫瑰褐走），荒地借 sandHigh（ground 组）。

import { PAL as PARK } from '../clubpark/palette';
import type { Swatch } from '../clubsite/render/palette';
import type { Tones } from '../clubsite/render/toon';

type R3 = [number, number, number];
/** tn(亮, 中, 暗, 缝, 亮边)：每档 [本色, 高一级, 低一级] */
const tn = (lit: R3, mid: R3, dark: R3, seam: R3, hi: R3): Tones => ({ bands: [lit, mid, dark], seam, hi });
const s = (ramp: R3, edge: number, convex: number, tones: Tones): Swatch => ({ ramp, edge, convex, tones });

export const EXTRA = {
  lotAsphalt: PARK.lotAsphalt,
  lotPaint: PARK.lotPaint,
  stallGravel: PARK.stallGravel,
  kerb: PARK.kerb,
  paver: PARK.paver,
  steel: PARK.steel,
  carCream: PARK.carCream,
  carRed: PARK.carRed,
  carNavy: PARK.carNavy,
  carMint: PARK.carMint,
  carGold: PARK.carGold,
  /**
   * 地块草坪（单数行，深一点的那条割草条纹）：亮档往黄挪（色相 ~85°，L ~160），和硬地外场 surround（偏青 ~140°）拉开；
   * 暗档青绿（L ~118），影子里还是草；和亮档差 < 60（树影边不算强边缘）。元素用 paint：几块有机形状的深浅（同档 3 色），没有逐纹素的点。
   */
  lotLawn: s(
    [0x94c04a, 0x5f9a4a, 0x46866a],
    0.05,
    0,
    tn(
      [0x94c04a, 0x9ec954, 0x8ab544], // L 165 / 175 / 155
      [0x5f9a4a, 0x68a450, 0x578e46], // L 125 / 134 / 116
      [0x46866a, 0x4e9072, 0x3e7a62], // L 118 / 127 / 107（影子和亮草差 < 60：树影边不出强边缘）
      [0x7eac40, 0x4e8444, 0x2c6458],
      [0xb2d866, 0x7cb45a, 0x56907a],
    ),
  ),
  /** 地块草坪（双数行，浅的那条）：比 lotLawn 亮 ~14，色相一样 —— 两条一深一浅就是开罗式的网格感，不用画线 */
  lotLawnStripe: s(
    [0xa6cf58, 0x6aa852, 0x4a8c6e],
    0.05,
    0,
    tn(
      [0xa6cf58, 0xb0d862, 0x9cc34f], // L 180 / 190 / 170
      [0x6aa852, 0x74b258, 0x619b4c], // L 138 / 147 / 128
      [0x4a8c6e, 0x529676, 0x427e64], // L 123 / 132 / 112
      [0x90bc4c, 0x58924a, 0x306a5c],
      [0xc2e274, 0x88c060, 0x5a9880],
    ),
  ),
  /**
   * 还没买下来的台面（锁着的行）：被晒得发白、长着野草的荒地 —— 比沙漠低地（sandDrift）亮、比草坪暖；
   * 比台地沙（sandHigh）灰一点、暗一点，读成"这块还不是我们的"。元素用沙地的（沙纹 + 碎石）。
   */
  lotWild: s(
    [0xe2b174, 0xbf8762, 0x8c5f8e],
    0.05,
    0,
    tn(
      [0xe2b174, 0xeabd82, 0xd6a266], // L 185 / 196 / 170
      [0xbf8762, 0xc8936c, 0xb27a58], // L 145 / 156 / 134
      [0x8c5f8e, 0x966996, 0x805484], // L 107 / 116 / 98
      [0xc89a66, 0xa06a5c, 0x684478],
      [0xf4cc92, 0xd8a27c, 0xaa80a2],
    ),
  ),
} as const satisfies Record<string, Swatch>;

/** 不在配色方案 GROUP 表里的新名字借哪个名字过调色（kit.ts 的 palOpts 用） */
export const PROXY: Record<string, string> = {
  lotLawn: 'lawn',
  lotLawnStripe: 'lawn',
  lotWild: 'sandHigh',
};
