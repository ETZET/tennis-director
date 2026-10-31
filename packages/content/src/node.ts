import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 只在 Node 里用（构建脚本、开发服务器插件）：读内容目录。
 * 不从 index.ts 导出，免得浏览器包里混进 node:fs。
 */

export const CONTENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = join(CONTENT_ROOT, 'data');
export const GENERATED_JSON = join(CONTENT_ROOT, 'src/generated/content.json');

/** data/ 下所有 YAML：相对路径 → 文本 */
export function readContentFiles(dir = DATA_DIR): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (d: string) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.ya?ml$/.test(n)) files[relative(dir, p).split('\\').join('/')] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return files;
}
