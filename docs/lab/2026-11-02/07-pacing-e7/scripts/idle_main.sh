#!/bin/bash
# 放置对照（GM-1 的做法），bc7d166 + 补丁：种子 37，开局只派一次（总监和 Dale 扫外场 1），之后只 /wait，不回答任何卡
B=http://127.0.0.1:7371
OUT=$1
shot() { for i in 1 2 3; do curl -s -m 70 $B/shot/$1 | grep -q path && return; done; echo "shot $1 failed"; }
curl -s $B/new/37 >/dev/null
curl -s $B/assign/director/o1_sweep >/dev/null
curl -s $B/assign/dale/o1_sweep >/dev/null
: > $OUT
hint=0
for k in $(seq 1 400); do
  r=$(curl -s $B/wait/720)
  read stop day head ended < <(echo "$r" | python3 -c 'import json,sys; d=json.load(sys.stdin); c=d.get("card") or {}; print(d["waited"]["stop"], d["day"], (c.get("headline") or "-").replace(" ","_"), d["outcome"] is not None)')
  staff=$(echo "$r" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(" | ".join(p["doing"] for p in d["people"]), "| restored", d["restored"])')
  printf "%s\t%s\t%s\t%s\n" "$day" "$stop" "$head" "$staff" >> $OUT
  if [ "$hint" = 0 ] && [ "$day" -ge 2 ] && [ "$head" = "-" ]; then hint=1; shot m2_idle_hint_day$day; fi
  if [ "$stop" = cardOpened ]; then shot m_card_d${day}; fi
  if [ "$ended" = True ]; then shot m9_ending; break; fi
done
grep -v $'\ttime\t' $OUT
