// 小游戏列表页（minigames.html）：十个小游戏，每个一行 → mg-<id>.html。显示本机的最高分和星（localStorage，壳写的）；
// 页面还没做出来的（构建里没有 mg-<id>.html）标"制作中"。
import { loadBest } from '../shell/score';
import { MINIGAMES } from './list';

const list = document.getElementById('list') as HTMLElement;
for (const g of MINIGAMES) {
  const a = document.createElement('a');
  a.className = 'game';
  a.href = `./mg-${g.id}.html`;
  const best = loadBest(g.id);
  const stars = best ? `${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)}` : '☆☆☆';
  a.innerHTML = `
    <span class="no">${g.n}</span>
    <span class="body">
      <span class="top"><b class="name"></b><span class="scene"></span></span>
      <span class="pitch"></span>
      <span class="best"><span class="stars${best ? '' : ' none'}">${stars}</span><span class="score"></span></span>
    </span>
    <span class="go">▸</span>`;
  (a.querySelector('.name') as HTMLElement).textContent = g.name;
  (a.querySelector('.scene') as HTMLElement).textContent = g.scene;
  (a.querySelector('.pitch') as HTMLElement).textContent = g.pitch;
  (a.querySelector('.score') as HTMLElement).textContent = best ? `最佳 ${best.score}` : '';
  list.appendChild(a);
  // 还没做出来的页面：标出来（静态托管 404；拿不到就不管）
  fetch(a.href, { method: 'HEAD' })
    .then((r) => {
      const ct = r.headers.get('content-type') ?? '';
      if (!r.ok || !ct.includes('html')) a.classList.add('soon');
    })
    .catch(() => {});
}
