import { createRequire } from 'node:module';
const require = createRequire(`${process.env.REPO ?? process.cwd()}/package.json`);
const { chromium } = require('playwright-core');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const path of ['/', '/activities.html']) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  const logs = []; p.on('console', (m) => { if (m.type() !== 'log' && m.type() !== 'debug') logs.push(`${m.type()}: ${m.text()}`); }); p.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await p.goto('http://127.0.0.1:7334' + path); await p.waitForTimeout(6000);
  await p.screenshot({ path: `sb${path === '/' ? '-index' : '-activities'}.png` });
  console.log(path, JSON.stringify(logs.slice(0, 10)));
}
await b.close();
