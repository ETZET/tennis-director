// 界面的中文点阵字（第三轮）：Fusion Pixel Font 12px（简体，比例宽）—— https://github.com/TakWolf/fusion-pixel-font
// v2026.11.10，SIL Open Font License 1.1（含 Ark Pixel、Cubic 11、Galmuri 三部分，也都是 OFL；都没有声明保留字体名），
// 许可证全文在 font-zh/OFL.txt 和 font-zh/LICENSES/。
// 只打包用到的字：font-zh/subset-chars.py 扫 clubsite/hud、castui、cast、clubvista、clubgame 里的汉字和全角标点（+ ASCII），
// 用 fonttools 的 pyftsubset 切出子集（约 1800 字，56 KB）：
//   python3 font-zh/subset-chars.py apps/sandbox/src chars.txt
//   pyftsubset fusion-pixel-12px-proportional-zh_hans.otf.woff2 --text-file=chars.txt --flavor=woff2 \
//     --output-file=font-zh/fusion-pixel-12px-zh_hans-subset.woff2 --layout-features='*' --no-hinting
// 加了新文字（新台词、新地名）没进子集的字会落回系统字体：重跑上面两行。
//
// 一种字号：12 px 的字按界面纹素（hudScale() = 2）放大 → 24 CSS 像素，字的一个像素 = 界面一个纹素，
// 和 5×7 点阵数字、图标在同一个网格上（第 6 轮评判："三套字"）。描边也是一个纹素。
import fontUrl from './font-zh/fusion-pixel-12px-zh_hans-subset.woff2?inline';
import { hudScale } from './scale';

export const PX_FAMILY = '"TD Pixel 12", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", system-ui, sans-serif';

/** 字号（CSS 像素）：12 × 纹素 */
export const pxFontSize = (k = 1) => 12 * hudScale() * k;
/** 行高：14 × 纹素（字 12 + 上下各 1 纹素） */
export const pxLineHeight = (k = 1) => 14 * hudScale() * k;
/** CSS 的 font 简写 */
export const pxFont = (k = 1) => `400 ${pxFontSize(k)}px/${pxLineHeight(k)}px ${PX_FAMILY}`;

let done = false;
/** 把 @font-face 塞进 <head>（一次）。字体是内联的 data URL：单文件 demo 也能用 */
export function ensurePixelFont() {
  if (done || typeof document === 'undefined') return;
  done = true;
  if (document.getElementById('td-pxfont')) return;
  const st = document.createElement('style');
  st.id = 'td-pxfont';
  st.textContent = `@font-face { font-family: "TD Pixel 12"; src: url(${fontUrl}) format("woff2"); font-display: block; }`;
  document.head.appendChild(st);
}

/** 墨色描边（一纹素）+ 下面一纹素深影：浮在场景上的字 */
export const pxOutline = (ink: string, shadow: string) => {
  const s = hudScale();
  return `text-shadow: ${s}px 0 0 ${ink}, -${s}px 0 0 ${ink}, 0 ${s}px 0 ${ink}, 0 -${s}px 0 ${ink}, ${s}px ${s}px 0 ${ink}, -${s}px ${s}px 0 ${ink}, ${s}px -${s}px 0 ${ink}, -${s}px -${s}px 0 ${ink}, 0 ${s * 2}px 0 ${shadow};`;
};
