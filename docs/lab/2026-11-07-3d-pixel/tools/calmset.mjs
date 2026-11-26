// 留白验收一套（redo-calm.md）：五个场景竖屏 + 横屏 12 点截图，再跑 hues.mjs + stats.mjs。
// node docs/lab/2026-11-07-3d-pixel/tools/calmset.mjs <输出目录> [额外查询串] [场景,场景…] [端口]
// 输出目录里：<场景>-p.png（390×844，1 px/纹素）、<场景>-l.png（1280×720，px=2）、numbers.txt。
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [out, extra = '', list = 'clubwalk,clubplaza,clubpickle,clubcourts,clubpark', port = '5342'] = process.argv.slice(2);
const dir = resolve(out);
mkdirSync(dir, { recursive: true });
const tools = import.meta.dirname;
const q = `hour=12&weather=clear&pause=1${extra ? `&${extra}` : ''}`;
const scenes = list.split(',');
const jobs = [];
for (const s of scenes) {
  jobs.push([`http://localhost:${port}/${s}.html?${q}`, `${dir}/${s}-p.png`, 390, 844, 11000]);
  jobs.push([`http://localhost:${port}/${s}.html?${q}&px=2`, `${dir}/${s}-l.png`, 1280, 720, 11000]);
}
if (process.env.NOSHOT !== '1')
  execFileSync('node', [`${tools}/shots.mjs`, JSON.stringify(jobs)], { stdio: 'inherit' });

const hues = [];
const stats = [];
for (const s of scenes) {
  hues.push([`${s}-p`, `${dir}/${s}-p.png`, 1], [`${s}-l`, `${dir}/${s}-l.png`, 2]);
  stats.push([`${s}-p`, `${dir}/${s}-p.png`, 1], [`${s}-l`, `${dir}/${s}-l.png`, 2]);
}
const root = resolve(tools, '../../../..');
const h = execFileSync('node', [`${tools}/hues.mjs`, JSON.stringify(hues)], { cwd: root }).toString();
const st = execFileSync('node', [`${tools}/stats.mjs`, JSON.stringify(stats)], { cwd: root }).toString();
const txt = `# ${q}\n## hues\n${h}\n## stats\n${st}`;
writeFileSync(`${dir}/numbers.txt`, txt);
console.log(txt);
