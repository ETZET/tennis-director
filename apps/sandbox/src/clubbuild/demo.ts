// clubbuild 的自动演示（?demo=1）：照玩家的操作一步步来（开托盘 → 选卡 → 拖影子 → 转 → 建造 → 刷步道……），
// 大约 20 秒把开罗式的循环演一遍（凑出三个组合），截图和录屏不用手点。走的是和手点一样的控制器接口（game.ts 的 Game）。
import type { Game } from './game';

type Step = [number, (g: Game) => void];

/** 影子一格一格挪过去（像手指拖着走）：每步走剩下距离的 1/(剩几步) */
function glide(to: [number, number], t0: number, out: Step[], dt = 0.08) {
  for (let i = 1; i <= 6; i++)
    out.push([
      t0 + i * dt,
      (g) => {
        const gh = g.ghostAt();
        if (!gh) return;
        const k = 1 / (7 - i);
        g.moveGhost(Math.round(gh[0] + (to[0] - gh[0]) * k), Math.round(gh[1] + (to[1] - gh[1]) * k));
      },
    ]);
}

export function runDemo(game: Game) {
  const steps: Step[] = [
    [0.6, (g) => g.openTray()],
    [1.3, (g) => g.selectTab('facility')],
    [1.9, (g) => g.selectCard('cafe')],
    [2.9, (g) => g.rotate()],
    [3.3, (g) => g.rotate()],
  ];
  glide([2, 15], 3.6, steps);
  steps.push(
    [4.6, (g) => g.confirm()],
    [5.4, (g) => g.selectTab('court')],
    [6.0, (g) => g.selectCard('practice-wall')],
  );
  glide([9, 2], 6.4, steps);
  steps.push([7.4, (g) => g.confirm()], [8.0, (g) => g.selectTab('road')], [8.5, (g) => g.selectCard('path')]);
  const tiles: [number, number][] = [[11, 5]];
  for (let r = 5; r <= 14; r++) tiles.push([10, r]);
  tiles.forEach(([c, r], i) => {
    steps.push([9.0 + i * 0.14, (g) => g.paint(c, r)]);
  });
  steps.push(
    [10.9, (g) => g.done()],
    [11.3, (g) => g.selectTab('facility')],
    [11.8, (g) => g.selectCard('pro-shop')],
    [12.3, (g) => g.rotate()],
    [12.6, (g) => g.rotate()],
    [12.9, (g) => g.rotate()],
  );
  glide([11, 8], 13.1, steps);
  steps.push([13.9, (g) => g.confirm()], [14.4, (g) => g.selectTab('deco')], [14.9, (g) => g.selectCard('shade')]);
  glide([0, 6], 15.2, steps);
  steps.push([16.0, (g) => g.confirm()], [16.6, (g) => g.selectCard('palm')]);
  glide([13, 12], 16.9, steps);
  steps.push(
    [17.6, (g) => g.confirm()],
    [18.1, (g) => g.selectCard('palm')],
    [18.4, (g) => g.moveGhost(14, 22)],
    [18.8, (g) => g.confirm()],
    [19.6, (g) => g.closeTray()],
    [20.2, (g) => g.setSpeed(2)],
  );
  steps.sort((a, b) => a[0] - b[0]);
  // 按游戏的帧走（每帧的真实秒，封顶 0.1）：机器慢（无头浏览器的软件渲染）时整段一起放慢，截图里的进度和帧数对得上
  let t = 0;
  let i = 0;
  game.onFrame = (dt) => {
    t += dt;
    while (i < steps.length && steps[i][0] <= t) {
      try {
        steps[i][1](game);
      } catch (e) {
        console.warn('demo step', i, e);
      }
      i++;
    }
    if (i >= steps.length) game.onFrame = null;
  };
}
