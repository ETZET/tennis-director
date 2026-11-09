// 提交前检查：PNG 里是否混进了参考图（参考图是 JPEG 截图，颜色数成千上万；我们的渲染图通常几百色）。
// 用法：node refcheck.mjs <png 或目录> ...   颜色数 ≥ 1000 的标 REF?，这类图只放本地，不进仓库。
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { load } from './lib.mjs';
const files = process.argv.slice(2).flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith('.png')).map((f) => join(p, f)) : [p]));
let bad = 0;
for (const f of files) {
  const im = load(f);
  const set = new Set();
  for (let i = 0; i < im.data.length; i += 4) set.add((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2]);
  const ref = set.size >= 1000;
  if (ref) bad++;
  console.log(ref ? 'REF? ' : 'ok   ', String(set.size).padStart(7), f);
}
if (bad) { console.log(`\n${bad} 张疑似含参考图：移到 ~/workspace/tennis-director-refs/ 下，不要提交。`); process.exit(1); }
