#!/usr/bin/env bash
# 把 sandbox 的一个页面打成单个 HTML（JS 内联），用来发布成在线可玩页面（Artifact）。
# 用法（仓库根目录）：bash .claude/skills/pixel-scene/scripts/single-file.sh <页面名，如 desert3d-v2> <输出.html> [默认查询串，如 "?labels=0"]
set -euo pipefail
PAGE="$1"; OUT="$2"; DEFQ="${3:-}"
TMP="$(mktemp -d)"
CFGFILE="$(pwd)/apps/sandbox/vite.one.config.ts"
trap 'rm -f "$CFGFILE"' EXIT
cd apps/sandbox
cat > "$CFGFILE" <<CFG
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { target: 'es2022', outDir: '$TMP', emptyOutDir: true, modulePreload: false,
  rollupOptions: { input: resolve(import.meta.dirname, '$PAGE.html'), output: { inlineDynamicImports: true } } } });
CFG
npx vite build -c "$CFGFILE" >/dev/null 2>&1
cd - >/dev/null
python3 - "$TMP" "$PAGE" "$OUT" "$DEFQ" <<'PY'
import sys, re, glob
tmp, page, out, defq = sys.argv[1:5]
js = open(glob.glob(f'{tmp}/assets/*.js')[0]).read()
assert '</script' not in js, 'bundle contains </script'
if defq:
    js = js.replace('URLSearchParams(location.search)', f'URLSearchParams(location.search||"{defq}")', 1)
html = open(f'{tmp}/{page}.html').read()
title = re.search(r'<title>(.*?)</title>', html, re.S)
style = re.search(r'<style>(.*?)</style>', html, re.S)
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
body = re.sub(r'<script[^>]*src=[^>]*></script>', '', body)
open(out, 'w').write(
    f"<title>{title.group(1) if title else page}</title>\n<style>\n{style.group(1) if style else ''}\n</style>\n{body}\n<script type=\"module\">\n{js}\n</script>\n")
print('wrote', out, round(len(js) / 1e6, 2), 'MB js')
PY
