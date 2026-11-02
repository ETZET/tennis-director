#!/usr/bin/env python3
"""汇总 results/<tag>.jsonl：每格通关率、结局分布、复原、差一点。"""
import json, os, sys
from collections import defaultdict

def load(tag):
    cells = defaultdict(list)
    for l in open(os.path.join(os.environ.get('LAB', 'lab'), f'e2/results/{tag}.jsonl')):
        d = json.loads(l)
        key = tuple(sorted(d['cell'].items()))
        cells[key] += d['rows']
    return cells

def summarize(rows):
    n = len(rows)
    won = [r for r in rows if r['won']]
    lost = [r for r in rows if not r['won']]
    dl = [r for r in lost if r['ending'] == 'deadline']
    bk = [r for r in lost if r['ending'] == 'bankrupt']
    # 失败的原因细分（期限到的）：Stadium 1 没重建好 / 重建好了但声望不到 / 办过但冷场 / 重建好了没钱办
    st1_no = [r for r in dl if r['ms']['st1'] is None]
    st1_yes = [r for r in dl if r['ms']['st1'] is not None]
    flop = [r for r in st1_yes if r['exhibitions'] > 0]
    noex = [r for r in st1_yes if r['exhibitions'] == 0]
    avg = lambda xs: sum(xs) / len(xs) if xs else float('nan')
    return dict(
        n=n, win=len(won) / n, bankrupt=len(bk) / n, deadline=len(dl) / n,
        done=avg([r['done'] for r in rows]), touched=avg([r['restored'] for r in rows]),
        winday=avg([r['days'] for r in won]),
        lost_done7=sum(1 for r in lost if r['done'] == 7) / max(1, len(lost)),
        lost_done8=sum(1 for r in lost if r['done'] == 8) / max(1, len(lost)),
        dl_st1_missing=len(st1_no) / n, dl_flop=len(flop) / n, dl_noex=len(noex) / n,
        st2=avg([r['ms']['st2'] for r in rows if r['ms']['st2']]),
        st1=avg([r['ms']['st1'] for r in rows if r['ms']['st1']]),
        hires=avg([r['hires'] for r in rows]),
        trap=sum(1 for r in lost if r['done'] <= 3) / n,
    )

if __name__ == '__main__':
    for tag in sys.argv[1:]:
        print(f'## {tag}')
        print('| cell | n | win | bankrupt | deadline | done/8 | win day | lost@7 | lost@8 | dl:st1缺 | dl:冷场 | dl:没办 | st2天 | st1天 | 招人 | 锁死 |')
        for k, rows in sorted(load(tag).items()):
            s = summarize(rows)
            name = ' '.join(f'{a}={b}' for a, b in k)
            print(f"| {name} | {s['n']} | {s['win']:.0%} | {s['bankrupt']:.0%} | {s['deadline']:.0%} | {s['done']:.2f} | {s['winday']:.0f} | {s['lost_done7']:.0%} | {s['lost_done8']:.0%} | {s['dl_st1_missing']:.0%} | {s['dl_flop']:.0%} | {s['dl_noex']:.0%} | {s['st2']:.0f} | {s['st1']:.0f} | {s['hires']:.1f} | {s['trap']:.0%} |")
