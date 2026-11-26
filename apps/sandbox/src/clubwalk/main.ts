// clubwalk：把做好的俱乐部场景连成一个大世界，总监在里面走来走去（试验中，docs/lab/2026-11-07-3d-pixel/clubwalk.md）。
// 整个世界在 walk.ts（mountWalk）；山谷（src/valley）也用它，带着山谷的钩子。
import '../clubsite/render/colors';
import { mountWalk } from './walk';

// 开局站在大门里的长廊东头（前台西北）：竖屏一屏是广场东角、匹克球场、前台和门柱，停车场出画
//（redo-fix.md：原来站在门外，停车场是开局最大的一块安静面，焦点挤在中间一条窄路上）。
// 横屏一屏 ≈ 58 米宽：站在长廊上（匹克球场北边），停车场只剩右边不到两成（站在门里，右半屏还是一大片沥青）。
const landscape = innerWidth > innerHeight;
mountWalk({ pixelHud: true, start: landscape ? [43.2, -5] : [52.6, -5] });
