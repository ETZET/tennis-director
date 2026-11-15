// clubbuild 的新材质（grounds 这组自己的；别的组不改这个文件）。挑色规则照 clubsite/render/palette.ts 文件头。
// 地面组（泳池、停车场、遮阳、棕榈、仙人掌花坛、喷泉）几乎全用现成的颜色：泳池的池水 / 躺椅垫、喷泉的池水 / 花砖、
// 石板、陶砖、土坯、白灰泥都已经在合并的表里。缺的只有停车场（clubpark）那一套：沥青、车位漆、路缘、连锁砖和车漆 ——
// clubpark 的表没合进 palette.ts，这里原样搬过来（只读引用，颜色以 clubpark/palette.ts 为准）。
// 名字都已经在 clubsite/render/palettes 的 GROUP 表里（沥青、漆 → court；路缘 → wall；冷色车漆 → club；暖色 → accent），配色方案照常调。
// glass、tyre、carSilver 不搬：clubfood 的表里已经有（carSilver 是 clubfood 改过中/暗档的那份），spread 在后面会盖掉它们。

import { PAL as PARK } from '../clubpark/palette';
import type { Swatch } from '../clubsite/render/palette';

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
} as const satisfies Record<string, Swatch>;
