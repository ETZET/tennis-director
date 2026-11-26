// clubvista 一轮的数字：vistashot.mjs 拍的 8 张图（四张图 × 竖 / 横）各跑 hues.mjs（暖 / 冷 / 平静纹素）和 stats.mjs（饱和度、强边缘），
// 裁掉角上的界面（竖屏 y 70…780，横屏 y 70…660）。打一张 markdown 表；目标：平静 ≥ 65%、冷 ≥ 25%、强边缘 ≤ 0.05、饱和度 ≥ 0.42。
// node docs/lab/2026-11-07-3d-pixel/tools/vistanums.mjs <目录> [后缀]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const [dir, suffix = ''] = process.argv.slice(2);
const tools = import.meta.dirname;
const ids = ['arrive', 'court', 'oasis', 'practice'];
const rows = [];
const crop = { port: [0, 70, 390, 780], land: [0, 70, 1280, 660] };
const hueArgs = [];
for (const id of ids)
  for (const k of ['port', 'land']) {
    const f = resolve(dir, `${id}-${k}${suffix}.png`);
    if (existsSync(f)) hueArgs.push([`${id}-${k}`, f, 1, crop[k]]);
  }
const hueOut = execFileSync('node', [`${tools}/hues.mjs`, JSON.stringify(hueArgs)], { encoding: 'utf8' });
// stats.mjs 不裁：先用 ffmpeg 裁一份（界面的字是强边缘）
const statArgs = hueArgs.map(([n, f, px, [x0, y0, x1, y1]]) => {
  const c = f.replace(/\.png$/, '.crop.png');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', f, '-vf', `crop=${x1 - x0}:${y1 - y0}:${x0}:${y0}`, c]);
  return [n, c, px];
});
const statOut = execFileSync('node', [`${tools}/stats.mjs`, JSON.stringify(statArgs)], {
  encoding: 'utf8',
  cwd: resolve(tools, '../../../..'),
});
console.log(hueOut);
console.log(statOut);
void rows;
