// 喷泉的着色片段（patch.ts 插进 toon 的元素色那一行后面）。全部按纹素：屏幕纹素 p = eScr(vElemP)，线 = 1 纹素（fwidth），
// 动的东西按拍子跳（0.15 / 0.2 秒一格），不逐帧抖；随机都按纹素 / 元素取哈希（eh），不逐片元噪声。
// 颜色只用本材质的 tones（eTone 本档三色、uHiC 亮边、uSeamC 缝）和 accent（uElX：泡沫 / 奶白花）。

/** 1 纹素宽的线：d 的零点附近（按屏幕导数） */
const LINE = /* glsl */ `
float ftnLine(float d) { return step(abs(d), fwidth(d) * 0.55); }
`;

/**
 * 池水（palm-fountain 的水面 + 两层碗里的水）：
 * 1. 池底一圈砖缝（r 3.4 的环线 + 外圈放射缝，缝色、断续）—— 透过浅水看到的池底；
 * 2. 落叶（uFtnLeaves ≥ 3）：亮边色的天光带一部分换回本色、整体往缝色压一点（水变暗、变浑）；
 * 3. 溢流帘的落水圈（帘脚外面一圈：里半圈泡沫、外半圈亮边色，0.2 秒换一次花样 = 翻腾）；
 * 4. 四股小水柱的落点：三圈涟漪（1.2 秒一循环，越大越断），落点一团泡沫；
 * 5. 闪光：按纹素哈希，每个纹素自己 0.25～0.6 秒一拍，亮档约 0.45%（泡沫色）、云影 0.3%、投影里 0.2%（暗档亮边色，
 *    蒲葵荫里的水也有一点闪）；叶子多了闪光少。
 */
export const WATER_DECL = /* glsl */ `
uniform float uFtnFlow;
uniform float uFtnLeaves;
uniform vec2 uFtnLand[4];
uniform vec4 uFtnFoot;
uniform float uFtnPoolR;
uniform float uFtnBowlY;
${LINE}
`;

export const WATER = /* glsl */ `
{
  int b = int(band + 0.5);
  vec2 q = vElemL.xz;
  float r = length(q);
  vec2 p = eScr(vElemP);
  bool bowl = vElemL.y > uFtnBowlY;
  float flow = uFtnFlow;
  float dim = clamp((uFtnLeaves - 2.0) / 3.0, 0.0, 1.0);
  bool isHi = all(equal(col, uHiC[b]));
  // 1. 池底砖缝
  if (!bowl) {
    float ring = r - (uFtnPoolR - 0.6);
    float ang = atan(q.y, q.x) / 6.2831853 + 0.5;
    float rad = ang * floor(6.2831853 * uFtnPoolR / 0.62);
    bool seamL = ftnLine(ring) > 0.5 || (ring > 0.0 && fract(rad) < fwidth(rad) * 0.8);
    if (seamL && !isHi && eh(floor(p / vec2(3.0, 1.0)) + 61.0) < 0.62) col = uSeamC[b];
  }
  // 2. 落叶
  if (dim > 0.0) {
    if (isHi && eh(floor(p / vec2(4.0, 1.0)) + 5.0) < dim * 0.8) col = eTone(b, 0);
    col = mix(col, uSeamC[b], 0.22 * dim);
  }
  // 3. 帘脚的落水圈
  vec2 foot = bowl ? uFtnFoot.zw : uFtnFoot.xy;
  if (flow > 0.04 && r > foot.x && r < foot.y) {
    float tk = floor(uTime / 0.2);
    float hh = eh(vec2(floor(p.x / 2.0), p.y) + tk * 7.13);
    if (r < mix(foot.x, foot.y, 0.5)) {
      if (hh < 0.8 * min(1.0, flow * 1.3)) col = uElX[b];
    } else if (hh < 0.5 * flow) col = uHiC[b];
  }
  // 4. 小水柱的涟漪
  if (!bowl && flow > 0.04) {
    for (int k = 0; k < 4; k++) {
      float d = length(q - uFtnLand[k]);
      if (d > 0.8) continue;
      if (d < 0.075) { col = uElX[b]; continue; }
      for (int j = 0; j < 3; j++) {
        float ph = fract(uTime / 1.2 + float(j) / 3.0 + float(k) * 0.29);
        float rr = 0.1 + 0.62 * ph;
        if (ftnLine(d - rr) > 0.5 && eh(floor(p / vec2(2.0, 1.0)) + float(j) * 3.1 + float(k) * 0.7) < (1.05 - ph) * flow)
          col = ph < 0.34 ? uElX[b] : uHiC[b];
      }
    }
  }
  // 5. 闪光
  {
    float dens = (band > 1.5 ? 0.0045 : (band > 0.5 ? 0.003 : 0.002)) * (1.0 - 0.8 * dim);
    float h1 = eh(p + 71.3);
    float per = 0.25 + 0.35 * eh(p + 72.9);
    float cyc = floor(uTime / per + h1 * 9.0);
    if (eh(p + vec2(cyc * 1.618, cyc * 0.731) + 13.0) < dens) col = band > 1.5 ? uElX[b] : uHiC[b];
  }
}
`;

/**
 * 塔拉韦拉花砖带（池壁外立面、碗沿下一圈、池壁里面露出水面的一截）：墙的 uv（沿墙米, 离墙顶米）→ 纹素行列。
 * 行：最上面 uFtnTrim.x 行是缝色（压顶下的阴影线，大半被压顶挡住）；最下面 uFtnTrim.y 行是奶白压边（uElX）；
 * 中间一排方砖，边长 = 剩下的行数（1× 下 4×4）。两种砖交替：A = 钴蓝本色 + 中间 2×2 奶白花；
 * B = 高一级的蓝 + 四个角各一点奶白（和左右的 A 拼起来是一串菱形的花）。颜色全是本档的几个色。
 */
export const TILES_DECL = /* glsl */ `
uniform float uFtnBandH;
uniform vec2 uFtnTrim;
`;

export const TILES = /* glsl */ `
{
  int b = int(band + 0.5);
  float rpm = eRpm();
  float rows = max(floor(uFtnBandH * rpm / uTexel + 0.5), 2.0);
  float row = floor(vElemUv.y * rpm / uTexel);
  float cx = floor(vElemUv.x / uTexel);
  vec3 c;
  if (row < uFtnTrim.x) c = uSeamC[b];
  else if (row >= rows - uFtnTrim.y) c = uElX[b];
  else {
    float n = max(rows - uFtnTrim.x - uFtnTrim.y, 2.0);
    float ty = row - uFtnTrim.x;
    float ti = floor(cx / n);
    float gx = cx - ti * n;
    bool A = mod(ti, 2.0) < 0.5;
    c = A ? eTone(b, 0) : eTone(b, 1);
    float m0 = floor((n - 2.0) * 0.5);
    bool centre = n >= 3.0 && gx >= m0 && gx < n - m0 && ty >= m0 && ty < n - m0;
    bool corner = n >= 4.0 && (gx < 0.5 || gx > n - 1.5) && (ty < 0.5 || ty > n - 1.5);
    if (A && centre) c = uElX[b];
    if (!A && corner) c = uElX[b];
  }
  col = c * base;
}
`;

/**
 * 压顶 / 碗沿顶面：绕圈的条石（uFtnBlocks 块），块与块之间一纹素放射缝，每块自己一个深浅（本档三色）。
 * 里沿（挨着水的那一纹素）是湿的：缝色。
 */
export const COPING_DECL = /* glsl */ `
uniform float uFtnBlocks;
uniform float uFtnWetR;
${LINE}
`;

export const COPING = /* glsl */ `
{
  int b = int(band + 0.5);
  vec2 q = vElemL.xz;
  float a = (atan(q.y, q.x) / 6.2831853 + 0.5) * uFtnBlocks;
  float id = floor(a);
  vec3 c = eToneOf(b, eh(vec2(id, 5.0)));
  if (fract(a) < fwidth(a) * 0.8) c = uSeamC[b];
  if (uFtnWetR > 0.0 && length(q) < uFtnWetR) c = uSeamC[b];
  col = c * base;
}
`;

/**
 * 溢流帘 / 顶上的水柱：竖条纹按拍子滚（uFtnDir 1 往下、−1 往上；0.15 秒挪 1 纹素）。
 * 每 7 纹素两条（2 + 3 纹素宽）、各留 1 纹素空（看得到后面的柱子），空有三成被水连上；每条按段（3～6 行）
 * 挑三档：中档本色 / 亮档低一级 / 亮档本色，偶尔一段亮边色。顶上一行亮边（碗沿溢出来的那一棱），帘脚两行泡沫。
 * 水量小 → 断的段多；关水 → 全空。帘子不吃投影（逆光的水是亮的），也不描边。
 */
export const CURTAIN_DECL = /* glsl */ `
uniform float uFtnFlow;
uniform vec2 uFtnY;
uniform float uFtnK;
uniform float uFtnDir;
`;

export const CURTAIN = /* glsl */ `
{
  if (uFtnFlow < 0.04) discard;
  vec2 p = eScr(vElemP);
  float rpm = eRpm();
  float fromBot = floor((vElemL.y - uFtnY.x) * rpm / uTexel);
  float fromTop = floor((uFtnY.y - vElemL.y) * rpm / uTexel);
  float tick = floor(uTime / 0.15);
  float sx = p.x + floor(uFtnK * 5.0);
  float pi = floor(sx / 7.0);
  float gx = sx - pi * 7.0;
  float si = pi * 2.0 + (gx < 3.0 ? 0.0 : 1.0);
  bool gapCol = gx == 6.0 || (gx == 2.0 && mod(pi, 3.0) < 0.5);
  float sh0 = eh(vec2(si, 3.0 + uFtnK));
  float segL = 3.0 + floor(sh0 * 4.0);
  float s = p.y + uFtnDir * tick + floor(sh0 * 17.0);
  float seg = floor(s / segL);
  float hs = eh(vec2(si, seg) + 5.0 + uFtnK);
  bool top = fromTop < 0.5;
  if (!top) {
    if (gapCol && eh(vec2(si, seg) + 8.0 + uFtnK) > 0.45) discard;
    if (eh(vec2(si, seg) + 9.0 + uFtnK) > 0.06 + 0.9 * uFtnFlow) discard;
  }
  vec3 c;
  band = 2.0;
  // 往下越来越白（落下来的水打散了）：帘子下三分之一亮边色多一倍
  float low = clamp(fromBot / max(fromBot + fromTop, 1.0), 0.0, 1.0);
  float hiP = low < 0.33 ? 0.86 : 0.93;
  if (hs < 0.3) { c = eTone(1, 0); band = 1.0; }
  else if (hs < 0.62) c = eTone(2, 2);
  else if (hs < hiP) c = eTone(2, 0);
  else c = uHiC[2];
  if (top) c = uHiC[2];
  if (fromBot < 1.5) {
    float fh = eh(vec2(floor(p.x / 2.0), floor(uTime / 0.2)) + 31.0 + uFtnK);
    if (fromBot < 0.5) c = fh < 0.7 ? uElX[2] : uHiC[2];
    else if (fh < 0.35) c = uElX[2];
    band = 2.0;
  }
  col = c * base;
}
`;

/** 水珠（小水柱、顶上溅出来的）：2×2 纹素的方块，上一行泡沫白、下一行暗档的高一级（钴蓝：和水面上一纹素的闪光分得开，浅水前面也看得见） */
export const DROP = /* glsl */ `
{
  band = 2.0;
  col = (vElemL.y > 0.0 ? uElX[2] : eTone(0, 1)) * base;
}
`;
