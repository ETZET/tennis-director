// clubhouse 的调色板 = clubplaza 的整张表（= clubdesk + clubmap2 的白灰泥 stucco、红瓦 roofTile + 池水、花砖）+ 会所里面新加的（HOUSE）。
// 外观几乎都是现成的：stucco（白灰泥墙）、roofTile（红瓦）、ironwork（铁花窗栅、门洞）、tile（陶砖）、wood（家具的木头）、concrete、talavera。
// 会所的壳（stage 2，core 代理，2026-11-11）：每种地面、墙、切墙顶、土断面都手挑了 tones（tn(亮, 中, 暗, 缝, 亮边)，每档 [本色, 高一级, 低一级]），
// 元素（elem）写在 terrain.ts / EL 里。两条额外的约束（会所剖面的强边缘预算 ≤ 0.05，stats.mjs 只数横向相邻差 > 60）：
// - 地面的亮档本色 ≈ L 150～170（调完 +9），暗档本色 ≈ L 105～120：投影边上亮 / 暗差 < 60（竖着的影子边、毛边不算强边缘）；
// - 切墙顶（wallCut）亮档 L ≈ 121（调完 ≈ 130）：和亮地面差 < 60，房间轮廓靠描边 + 暗的前沿读出来，不再是一圈强边缘。
// 规则同 clubdesk/palette.ts：高/低一级差 6～12，缝 −15…−30，亮边 +15…+30（都 < 60）；暗档换冷色相，不是亮档乘系数。
// 配色方案（默认午后 golden）会再调一遍：亮档 +9、往 62° 染 25%；暗档往玫瑰褐 32° 染 70%、彩度封顶 OKLCH C 0.06（L 不变）。
// 这里的 L 是调色前的原值：L = 0.2126R + 0.7152G + 0.0722B。
//
// 给家具代理用的新名字：floorWood（深色木地板）、floorTile（会所的萨尔蒂略陶砖地 / 台阶）、floorConcrete（后场水泥地）、
// castWall（负一层的清水混凝土挡土墙）、glass（玻璃：天窗、玻璃砖、电梯门上的窗）、steel（不锈钢：电梯门、货梯）。

import { EL as PLAZA_EL, PAL as PLAZA_PAL, PROXY as PLAZA_PROXY, SKY as PLAZA_SKY } from '../clubplaza/palette';
import type { Swatch } from '../clubsite/render/palette';
import type { Elem, Tones } from '../clubsite/render/toon';

type Ramp = [number, number, number];
const s = (ramp: Ramp, edge: number, convex: number, tones?: Tones): Swatch => ({ ramp, edge, convex, tones });
/** tn(亮, 中, 暗, 缝, 亮边)：每档 [本色, 高一级, 低一级] */
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });
/** ramp = 三档的本色 */
const sw = (t: Tones, edge: number, convex: number): Swatch =>
  s([t.bands[0][0], t.bands[1][0], t.bands[2][0]] as Ramp, edge, convex, t);

/** 这个场景新加的材质 */
const HOUSE = {
  // ── 墙 ────────────────────────────────────────────────
  /**
   * 白灰泥（外墙，覆盖 clubmap2 的 stucco：亮档、中档不变，加 tones；暗档原 #8e7a9e（L 128）调完 #947c7e S 0.16 发灰 → 更红、低一点的 #987484（L 124），调完 S ≈ 0.25）。
   * 朝镜头的墙面背光 → 几乎全在暗档：元素（抹灰的一块块，terrain.ts 的 EL.stucco）靠暗档三色 ±8 读出来。
   */
  stucco: sw(
    tn(
      [0xfaeedc, 0xfff9e6, 0xf1e5d4], // L 239 / 248 / 230
      [0xdcc6c0, 0xe6cfc8, 0xd3bdb8], // L 202 / 211 / 193
      [0x987484, 0xa37d8e, 0x8d6c7a], // L 124 / 134 / 116
      [0xe1d7c6, 0xc2afa9, 0x7b5e6a], // 缝 −24
      [0xffffff, 0xefd8d1, 0xae8597], // 亮边 +18
    ),
    0.5,
    0.5,
  ),
  /**
   * 隔墙的里面（暖赭石色的石灰水）：L 210 / 160 / 118。剖面里朝镜头的隔墙面在暗档：暗档提到 L 118（原 96）、更红 → 调完不是灰褐。
   * 借 terracotta 组（cap 一家）。
   */
  plaster: sw(
    tn(
      [0xf6cc94, 0xffd69b, 0xecc38e], // L 208 / 218 / 199
      [0xd8946e, 0xe49d74, 0xcc8c68], // L 159 / 169 / 151
      [0xa0688a, 0xac7095, 0x946080], // L 118 / 127 / 109
      [0xdab583, 0xb77e5d, 0x80536e], // 缝 −24
      [0xffe4a5, 0xf3a77c, 0xbb7aa1], // 亮边 +20
    ),
    0.5,
    0.4,
  ),
  /**
   * 负一层的挡土墙（清水混凝土，原来用 concrete）：暖灰褐，暗档 L 118 的灰紫。朝镜头 4 米高 = B1 画面上沿最大的一块暗面：
   * 元素是模板的一道道横板（EL.castWall）。借 wall 组（adobe 一家）。
   */
  castWall: sw(
    tn(
      [0xccaa8c, 0xdab695, 0xbe9f83], // L 175 / 187 / 163
      [0xac8c86, 0xba9891, 0x9e817b], // L 146 / 158 / 134
      [0x8c6e86, 0x9b7994, 0x7e6378], // L 118 / 130 / 106
      [0xb2957a, 0x927772, 0x725a6d], // 缝 −22
      [0xe3be9c, 0xc49f99, 0xa4819d], // 亮边 +20
    ),
    0.4,
    0.5,
  ),
  /**
   * 切墙的顶（里面模式：朝镜头的墙切到 1 米，顶上 0.1 米这一条）：梅紫，2026-11-11 调软（原 L 86 / 66 / 44）→ 顶面（亮档）L 121、
   * 前沿（暗档）L 82。顶面和亮地面（调完 L ≈ 160～180）差 < 60、和背光的墙面差 ≈ 10（靠描边分开），前沿和墙面差 ≈ 50。
   * 沿 z 的墙在画面上只剩这一条竖条：原来每行两条强边缘（2F 竖屏强边缘的一大块）。借 club 组调色（暗档往蓝紫走）。
   */
  wallCut: sw(
    tn(
      [0xaa6890, 0xb56f9a, 0x9f6187], // L 120 / 128 / 112
      [0x8a5480, 0x955b8a, 0x7f4e76], // L 98 / 106 / 91
      [0x6a4874, 0x754f7f, 0x604169], // L 82 / 90 / 74
      [0x91597b, 0x714568, 0x53395b], // 缝 −18
      [0xc378a5, 0xa36498, 0x81588d], // 亮边 +18
    ),
    0.6,
    0.2,
  ),
  /**
   * 负一层剖面的"切开的土"：看负一层时坑沿的土断面、房间之间填着的土顶面。赭褐 → 暗档靛紫（L 110 / 75 / 59）：
   * 比外面的沙地（L ≈ 200）暗一大截，一眼读出"在地面以下"。元素：土块 + 零星碎石（EL.soilCut）。借 dry 组（adobe 一家）。
   */
  soilCut: sw(
    tn(
      [0x9a6450, 0xa96d58, 0x8c5b48], // L 110 / 120 / 100
      [0x6a4250, 0x784b5a, 0x5c3a46], // L 75 / 85 / 66
      [0x4a3450, 0x573d5e, 0x3e2b42], // L 58 / 68 / 48
      [0x7e5241, 0x4e313b, 0x312335], // 缝 −20
      [0xb3755d, 0x835263, 0x614468], // 亮边 +18
    ),
    0.4,
    0.1,
  ),

  // ── 地面（亮档本色 L 150～170，暗档本色 L 105～120：投影边亮暗差 < 60）─────────
  /**
   * 会员休息室、宴会厅、专卖店、纪念品店、团课房的橡木地板：蜂蜜色宽板（L 165 / 133 / 118，S 0.58）。
   * 原来 L 190 / 138 / 82、没有 tones（autoTones 的缝 L ≈ 60 → 板缝满屏强边缘）。借 dry 组（wood 一家）。
   */
  floorOak: sw(
    tn(
      [0xdc9c5c, 0xeea963, 0xca9055], // L 164 / 178 / 152
      [0xb47a60, 0xc68669, 0xa36e57], // L 132 / 145 / 119
      [0x9a6a7e, 0xab768c, 0x895f70], // L 117 / 130 / 105
      [0xbc864f, 0x93644f, 0x7b5564], // 缝 −24
      [0xfcb369, 0xd59072, 0xb98098], // 亮边 +24
    ),
    0.1,
    0.05,
  ),
  /**
   * 酒吧、办公室、穿线吧、理疗区的深色木地板（柚木）：比橡木深一截、更红（L 148 / 114 / 105），窄板。借 dry 组（wood 一家）。
   */
  floorWood: sw(
    tn(
      [0xc07a50, 0xd38658, 0xae6e48], // L 133 / 147 / 120
      [0xa0625a, 0xb36e65, 0x8d574f], // L 110 / 124 / 97
      [0x84587a, 0x95648a, 0x734d6a], // L 99 / 113 / 87
      [0x9e6442, 0x7d4d46, 0x64435c], // 缝 −24
      [0xe3905e, 0xc3786e, 0xa46e98], // 亮边 +24
    ),
    0.1,
    0.05,
  ),
  /**
   * 会所的萨尔蒂略陶砖地（商店街、咖啡吧、门厅、拱廊、露台）和楼梯踏面：比 clubsite 的 tile（L 177 / 97）亮暗差小
   * （L 168 / 134 / 116），露台那一大片进投影不再是一圈强边缘。借 terracotta 组（tile 一家）。
   */
  floorTile: sw(
    tn(
      [0xec9a6a, 0xffa672, 0xda8e62], // L 167 / 181 / 154
      [0xc4766a, 0xd78274, 0xb16b60], // L 133 / 147 / 121
      [0x9e6680, 0xb0728e, 0x8c5b72], // L 115 / 129 / 103
      [0xcb845b, 0xa16157, 0x7d5165], // 缝 −24
      [0xffb57c, 0xe88b7d, 0xbf7c9b], // 亮边 +24
    ),
    0.05,
    0,
  ),
  /**
   * 更衣室、理疗室、洗衣房、卫生间的地：水青色釉面砖（L 170 / 135 / 118，S 0.47）。暖色调的会所里唯一的冷地面 →
   * "湿区"一眼分开。借 club 组（jug，暗档留青蓝）。原来亮档 L 196、暗档 L 82：投影边差 > 100。
   */
  floorCool: sw(
    tn(
      [0x66bcc0, 0x6ecbcf, 0x5eaeb1], // L 170 / 183 / 157
      [0x4a96a8, 0x51a5b8, 0x438898], // L 135 / 148 / 122
      [0x5a7a9c, 0x6488ad, 0x506d8b], // L 117 / 131 / 105
      [0x58a2a5, 0x3d7c8a, 0x48617d], // 缝 −24
      [0x74d7db, 0x57b1c6, 0x6c93bc], // 亮边 +24
    ),
    0.1,
    0.05,
  ),
  /**
   * 后场的水泥地（货梯厅、后厨、机房、储藏）：暖灰褐（L 161 / 135 / 119，S 0.30），一大块一大块的板，切缝。借 wall 组（concrete 一家）。
   */
  floorConcrete: sw(
    tn(
      [0xbc9c84, 0xcba98f, 0xad9079], // L 161 / 174 / 148
      [0xa08080, 0xb08d8d, 0x907474], // L 134 / 148 / 121
      [0x8a7088, 0x997d97, 0x7b6479], // L 119 / 132 / 106
      [0xa08570, 0x846a6a, 0x6e5a6d], // 缝 −24
      [0xd8b498, 0xbc9797, 0xa687a3], // 亮边 +24
    ),
    0.1,
    0.05,
  ),
  /**
   * 健身房的橡胶地垫（负一层）：深青绿（L 126 / 101 / 75，S 0.6）。地下室里唯一的饱和冷色，和水泥地分开。借 club 组（jug）。
   */
  rubber: sw(
    tn(
      [0x3a9282, 0x40a190, 0x348375], // L 126 / 139 / 113
      [0x2e7474, 0x348383, 0x286666], // L 101 / 114 / 88
      [0x2c5070, 0x345e83, 0x25425d], // L 74 / 87 / 61
      [0x2f776a, 0x235959, 0x1e374c], // 缝 −24
      [0x45ae9a, 0x399090, 0x3a6a94], // 亮边 +24
    ),
    0.1,
    0.05,
  ),
  /**
   * 健身房的功能草道（B1 西边一条 4 × 27 米）：人造草的饱和黄绿（L 151 / 132 / 108，S 0.58）—— B1 画面里最长、最绿的一条。
   * 借 plants 组（lawn：暗档跟着草的绿走，不被染成褐灰）。
   */
  turf: sw(
    tn(
      [0x6cac48, 0x75bb4e, 0x639e42], // L 151 / 164 / 138
      [0x4f9a4a, 0x57aa51, 0x478b43], // L 132 / 145 / 119
      [0x3e7a64, 0x458970, 0x376c58], // L 107 / 120 / 95
      [0x5b913c, 0x417e3d, 0x305f4d], // 缝 −24
      [0x7dc854, 0x5db658, 0x4c967b], // 亮边 +24
    ),
    0.1,
    0.05,
  ),

  // ── 屋顶（覆盖 clubmap2 的 roofTile：ramp 不变，加 tones；元素在 terrain.ts：一列列筒瓦）──
  roofTile: sw(
    tn(
      [0xdc744e, 0xec7d54, 0xcc6c48], // L 135 / 145 / 125
      [0xa84a48, 0xba5250, 0x974241], // L 93 / 103 / 83
      [0x5c2c52, 0x6c3460, 0x4c2544], // L 56 / 67 / 47
      [0xbf6544, 0x883c3a, 0x3f1e39], // 缝 −18
      [0xff885b, 0xd05c59, 0x803d72], // 亮边 +22
    ),
    0.55,
    0.45,
  ),

  // ── 小件（天窗、玻璃砖、电梯）──
  /**
   * 玻璃（天窗的斜玻璃、玻璃砖、电梯门上的小窗）：冷的青蓝。亮档的三色拉得比别的材质开（L 153 / 179 / 120）：
   * 平放的玻璃全在亮档，靠鼓面（高一级）、背光的砖（低一级）、天光（亮边 L 207）读出"玻璃"，三档明暗都有。
   * 暗档 L 90 的钴蓝（不是黑洞）。借 club 组（jug）。
   */
  glass: sw(
    tn(
      [0x48aeba, 0x5ccad0, 0x3a86a0], // L 153 / 179 / 120
      [0x3a88a8, 0x4498b4, 0x32729a], // L 122 / 137 / 103
      [0x3c5c98, 0x44689e, 0x36528c], // L 90 / 100 / 80
      [0x34749a, 0x2c6490, 0x304882], // 缝 −48 / −31 / −19（背光的砖缝；亮档的缝和低一级差 15）
      [0x8ee0e8, 0x6cbcd4, 0x5878b0], // 亮边 +54 / +51 / +27（天光）
    ),
    0.5,
    0.6,
  ),
  /**
   * 不锈钢（电梯门、货梯门、按钮面板）：带一点青的冷灰（S ≈ 0.2，金属本色就灰），亮档 L 186、暗档 L 98。借 club 组（metal 的冷）。
   */
  steel: sw(
    tn(
      [0xb4c4cc, 0xc0ced4, 0xa8b8c2], // L 192 / 202 / 182
      [0x8c9cb0, 0x96a6b8, 0x8292a6], // L 153 / 163 / 143
      [0x5c6c8c, 0x647494, 0x566484], // L 107 / 115 / 99
      [0x98a8b4, 0x76869e, 0x4a5878], // 缝 −22 / −20 / −16
      [0xdce8ec, 0xb0c0cc, 0x7888a4], // 亮边 +34 / +32 / +26
    ),
    0.6,
    0.7,
  ),
} as const satisfies Record<string, Swatch>;

/** 整张表：clubplaza（含 clubdesk、clubmap2、clubfront、desert3d-v2）+ HOUSE（stucco、roofTile 以这里为准） */
export const PAL = { ...PLAZA_PAL, ...HOUSE } as const;
export type Pal = typeof PAL;
export const SKY = PLAZA_SKY;

/**
 * 元素预设（尺寸 = 屏幕纹素；会所默认像素 1× → 1 纹素 = 0.045 米、地面纵深一行 = 0.064 米）：
 * - 木地板用 strata（墙空间：terrain.ts 给地面写 uv = (x, 离这一条北沿的米数)）= 一行行板、每行一种板长、错缝的端缝；
 * - 陶砖、水青砖、地垫、水泥板用 stones（屏幕 Voronoi，带缝、上沿亮边）；
 * - 墙面（白灰泥、石灰水、清水混凝土）用 stones 屏幕空间：抹灰的一块块（没有缝、没有亮边，只靠暗档三色）/ 模板横板。
 */
export const EL = {
  ...PLAZA_EL,
  /** 橡木宽板：一行 5 行高（≈ 0.32 米宽），板长 14 × (0.75～1.35) 纹素（≈ 0.5～0.85 米），错缝的端缝，缝下一行亮（45% 的板） */
  floorOak: { kind: 'strata', space: 'wall', size: [14, 5], hi: 0.45, q: [0, 1e6, 0, 0] } as Elem,
  /** 柚木窄板：一行 4 行高（≈ 0.25 米），板长 14 纹素 */
  floorWood: { kind: 'strata', space: 'wall', size: [14, 4], hi: 0.35, q: [0, 1e6, 0, 0] } as Elem,
  /** 室内陶砖：Voronoi 10 × 7 纹素（≈ 0.45 米见方）*/
  floorTile: { kind: 'stones', size: [10, 7], seam: 0.55, hi: 0.4 } as Elem,
  /** 露台陶砖：大一号（12 × 9 纹素 ≈ 0.55 米；原来 tile 的 9 × 6） */
  terrace: { kind: 'stones', size: [12, 9], seam: 0.5, hi: 0.35 } as Elem,
  floorCool: { kind: 'stones', size: [8, 8], seam: 0.55, hi: 0.25 } as Elem,
  /** 后场水泥地：大板（22 × 15 纹素 ≈ 1 米），切缝细 */
  floorConcrete: { kind: 'stones', size: [22, 15], seam: 0.45, hi: 0.25 } as Elem,
  /** 健身房的橡胶地垫：大块方垫（14 × 11 纹素 ≈ 0.65 米见方） */
  rubber: { kind: 'stones', size: [14, 11], seam: 0.5, hi: 0.2 } as Elem,
  /** 人造草：有机形状的深浅块（paint，20 × 10 纹素）+ 很少的擦痕（缝色） */
  turf: { kind: 'paint', size: [20, 10], density: [0, 0.05], patch: 3 } as Elem,
  /** 白灰泥墙面：抹灰的一大块一大块（24 × 12 纹素，±9 的深浅），没有缝、没有亮边（±13 + 18 × 10 读成乱石墙） */
  stucco: { kind: 'stones', size: [24, 12], seam: 0, hi: 0 } as Elem,
  plaster: { kind: 'stones', size: [18, 10], seam: 0, hi: 0 } as Elem,
  /** 清水混凝土：模板横板（26 × 6 纹素），缝细，三成的板上沿亮 */
  castWall: { kind: 'stones', size: [26, 6], seam: 0.45, hi: 0.3 } as Elem,
  /** 切墙顶：一点点深浅（10 × 6），没有缝 */
  wallCut: { kind: 'stones', size: [10, 6], seam: 0, hi: 0 } as Elem,
  /** 切开的土：土块（8 × 5，有缝）+ 零星碎石 */
  soilCut: { kind: 'stones', size: [8, 5], seam: 0.5, hi: 0.3 } as Elem,
};

/** 这个场景新加的材质借哪个材质名过配色方案的 grade（main.ts 的 palOpts 用）；clubplaza 的池水、花砖照旧 */
export const PROXY: Partial<Record<keyof Pal, keyof Pal>> = {
  ...(PLAZA_PROXY as Partial<Record<keyof Pal, keyof Pal>>),
  wallCut: 'ironwork',
  floorCool: 'jug',
  plaster: 'cap',
  castWall: 'adobe',
  floorOak: 'wood',
  floorWood: 'wood',
  floorTile: 'tile',
  floorConcrete: 'concrete',
  soilCut: 'adobe',
  rubber: 'jug',
  turf: 'lawn',
  glass: 'jug',
  steel: 'metal',
};
