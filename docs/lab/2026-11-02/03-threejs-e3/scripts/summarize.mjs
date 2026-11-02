// 用法：node summarize.mjs v1 v2 ...（读 diff/<v>/summary.json，输出 markdown 表格行）
import fs from 'node:fs';
for (const v of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(`diff/${v}/summary.json`));
  const g = (pred) => r.filter((x) => pred(x.f));
  const avg = (rows, k) => (rows.reduce((a, x) => a + x[k], 0) / rows.length).toFixed(2);
  const max = (rows, k) => Math.max(...rows.map((x) => x[k])).toFixed(2);
  const luma = (x, k) => (x[k][0] * 0.2126 + x[k][1] * 0.7152 + x[k][2] * 0.0722);
  const dl = (rows) => (rows.reduce((a, x) => a + luma(x, 'meanB') - luma(x, 'meanA'), 0) / rows.length).toFixed(1);
  const M = g((f) => f.startsWith('mobile')), D = g((f) => f.startsWith('desktop'));
  console.log(`| ${v} | ${avg(r, 'diffPct')} | ${max(r, 'diffPct')} | ${avg(r, 'meanAbs')} | ${max(r, 'meanAbs')} | ${dl(r)} | ${avg(M, 'diffPct')} / ${avg(D, 'diffPct')} |`);
}
