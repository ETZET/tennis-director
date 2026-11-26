// clubvista 的入口：?asset=<id> = 资产画廊（gallery.ts：一块小台子上只放这件，上 / 左 = 最终缩放，下 / 右 = 放大 3 倍）；
// 不带 = 四张图的分图地图（world.ts）。
import '../clubsite/render/colors';

if (new URLSearchParams(location.search).has('asset')) void import('./gallery');
else void import('./world');
