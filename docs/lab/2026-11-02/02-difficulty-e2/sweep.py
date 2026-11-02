#!/usr/bin/env python3
"""E2 扫参驱动：并行跑 sim-cli sweep 的格子，每格一行 JSON 写进 results/<tag>.jsonl。
用法: python3 sweep.py <tag> <games> <cells-file>   cells 文件每行: bot=<spec> [weeks=16] [cash=..] [decay=..] [work=..]
"""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

REPO = os.environ.get('REPO', '.')
tag, games, cells_file = sys.argv[1], sys.argv[2], sys.argv[3]
jobs = int(os.environ.get('JOBS', '28'))
chunk = int(os.environ.get('CHUNK', '50'))  # 每个进程跑多少局（一格拆成几段并行）
cells = [dict(kv.split('=', 1) for kv in l.split()) for l in open(cells_file) if l.strip() and not l.startswith('#')]
tasks = []
for c in cells:
    for s0 in range(1, int(games) + 1, chunk):
        tasks.append((c, s0, min(chunk, int(games) - s0 + 1)))

def run(t):
    c, s0, n = t
    args = ['npx', 'tsx', 'apps/sim-cli/src/main.ts', 'sweep', '--games', str(n), '--seed0', str(s0)]
    for k, v in c.items():
        args += [f'--{k}', v]
    out = subprocess.run(args, cwd=REPO, capture_output=True, text=True, check=True).stdout
    d = json.loads(out.strip().splitlines()[-1])
    d['cell'] = c
    return d

out = open(os.path.join(os.environ.get('LAB', 'lab'), f'e2/results/{tag}.jsonl'), 'w')
with ThreadPoolExecutor(jobs) as ex:
    for d in ex.map(run, tasks):
        out.write(json.dumps(d) + '\n'); out.flush()
print('done', tag, len(tasks), 'tasks')
