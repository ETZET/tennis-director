/**
 * 编译内容：data/**\/*.yaml → src/generated/content.json。
 *
 *   pnpm content          # 编译并写出 JSON
 *   pnpm content --check  # 只校验，并确认 JSON 和 YAML 一致（CI 用）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { compileContent, formatIssues } from '../src/compile';
import { GENERATED_JSON as OUT, readContentFiles } from '../src/node';

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
