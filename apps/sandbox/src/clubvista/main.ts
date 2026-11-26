// clubvista 的入口：?asset=<id> = 资产画廊（gallery.ts：一块小台子上只放这件，上 / 左 = 最终缩放，下 / 右 = 放大 3 倍）；
// 不带 = 四张图的分图地图（world.ts）。
import '../clubsite/render/colors';

// 不用 URLSearchParams：单文件打包（single-file.sh）把第一个 URLSearchParams(location.search) 换成带默认查询串的，要落在 world.ts 上
if (/[?&]asset=/.test(location.search)) void import('./gallery');
else void import('./world');
