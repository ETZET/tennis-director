// 把一个 sandbox 页面打成一个自带一切的 HTML（JS、CSS 内联，不拆包），给 artifact 用。
// node docs/lab/2026-11-24-clubsim/tools/bundle.mjs [页面名=valley] [输出=/tmp/<页面>-single.html] [默认查询串，如 "sim=1"]
import { readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { build } from 'vite';

const page = process.argv[2] ?? 'valley';
const out = process.argv[3] ?? `/tmp/${page}-single.html`;
const query = process.argv[4] ?? '';
const root = resolve(import.meta.dirname, '../../../../apps/sandbox');
const dist = '/tmp/td-single-dist';
rmSync(dist, { recursive: true, force: true });
await build({
  root,
  configFile: false,
  base: './',
  logLevel: 'warn',
  build: {
    outDir: dist,
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    rolldownOptions: { input: join(root, `${page}.html`), output: { codeSplitting: false } },
  },
});
let html = readFileSync(join(dist, `${page}.html`), 'utf8');
const assets = join(dist, 'assets');
for (const f of readdirSync(assets)) {
  const body = readFileSync(join(assets, f), 'utf8');
  if (f.endsWith('.js')) {
    const re = new RegExp(`<script[^>]*src="[^"]*${f.replace('.', '\\.')}"[^>]*></script>`);
    html = html.replace(re, () => `<script type="module">${body.replace(/<\/script/g, '<\\/script')}</script>`);
  } else if (f.endsWith('.css')) {
    const re = new RegExp(`<link[^>]*href="[^"]*${f.replace('.', '\\.')}"[^>]*>`);
    html = html.replace(re, () => `<style>${body}</style>`);
  }
}
if (query)
  html = html.replace('<head>', `<head><script>if(!location.search)history.replaceState(null,'','?${query}')</script>`);
writeFileSync(out, html);
console.log(out, (html.length / 1e6).toFixed(2), 'MB', /src="\.\/assets/.test(html) ? '(还有外链资源！)' : '');
