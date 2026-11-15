// clubbuild：思想实验 —— 开罗式建造经营版《网球总监》（catalog.ts 文件头）。
// ?asset=<id> = 画廊（gallery.ts）；否则 = 游戏（game.ts）。
import '../clubsite/render/colors';
import { runGallery } from './gallery';

const params = new URLSearchParams(location.search);
const asset = params.get('asset');
if (asset) runGallery(asset, params);
else {
  // game.ts 由框架子代理写；还没写好时只显示一块灰盒（画廊里的 court-hard）
  const mods = import.meta.glob<{ runGame: (p: URLSearchParams) => void }>('./game.ts', { eager: true });
  const game = mods['./game.ts'];
  if (game) game.runGame(params);
  else runGallery('court-hard', params);
}
