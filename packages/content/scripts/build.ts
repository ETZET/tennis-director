/**
 * 编译内容：data/**\/*.yaml → src/generated/content.json。
 *
 *   pnpm content          # 编译并写出 JSON
 *   pnpm content --check  # 只校验，并确认 JSON 和 YAML 一致（CI 用）
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileContent, formatIssues } from '../src/compile';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const OUT = join(ROOT, 'src/generated/content.json');

export function readContentFiles(dir = DATA): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.ya?ml$/.test(n)) files[relative(dir, p).split('\\').join('/')] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return files;
}

const check = process.argv.includes('--check');
const r = compileContent(readContentFiles());
if (r.warnings.length) console.warn(`content warnings:\n${formatIssues(r.warnings)}`);
if (!r.bundle) {
  console.error(`content errors:\n${formatIssues(r.errors)}`);
  process.exit(1);
}
const json = `${JSON.stringify(r.bundle, null, 1)}\n`;
const b = r.bundle;
const summary = `${b.cards.length} cards, ${b.activities.length} activities, ${b.people.length} people, ${b.stats.length} stats, ${Object.keys(b.i18n).length} languages · version ${b.version}`;
if (check) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {}
  if (current !== json) {
    console.error('src/generated/content.json is out of date; run pnpm content');
    process.exit(1);
  }
  console.log(`content ok: ${summary}`);
} else {
  writeFileSync(OUT, json);
  console.log(`content compiled: ${summary}`);
}
