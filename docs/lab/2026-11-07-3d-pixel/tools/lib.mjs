// pngjs 读写（从仓库的 pnpm store 里找 pngjs）
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const store = resolve(import.meta.dirname, '../../../../node_modules/.pnpm');
const require = createRequire(import.meta.url);
export const { PNG } = require(`${store}/${readdirSync(store).find((d) => d.startsWith('pngjs@'))}/node_modules/pngjs`);
export const load = (f) => PNG.sync.read(readFileSync(f));
export const save = (f, p) => writeFileSync(f, PNG.sync.write(p, { deflateLevel: 9, colorType: 2 }));
