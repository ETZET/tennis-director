import json,sys
rows=[json.loads(l) for l in open(sys.argv[1])]
order=['greedy','cautious','idle','novice','average','good']
mo=['normal','noupkeep','nomaint']
rows.sort(key=lambda r:(order.index(r['bot']) if r['bot'] in order else 99, mo.index(r['mode'])))
print(f"{'bot':9}{'mode':9}{'win':>6}{'wDay':>6}{'upk':>6}{'tidy':>5}{'reop':>5}{'drop':>5}{'<30':>6}{'=0':>6}{'done':>5}{'mem':>6}{'q':>5}{'rep':>5}{'cash':>7}  endings")
for r in rows:
    print(f"{r['bot']:9}{r['mode']:9}{r['winRate']*100:5.0f}%{r['winDays']:6.1f}{r['upkeepCycles']:6.0f}{r['tidies']:5.1f}{r['reopens']:5.1f}{r['drops']:5.1f}{r['lowShare']*100:5.0f}%{r['zeroShare']*100:5.0f}%{r['done']:5.2f}{r['members']:6.0f}{r['quality']:5.0f}{r['rep']:5.0f}{r['cash']:7.0f}  {r['endings']}")
