#!/bin/bash
# 放置对照（GM-1 的做法）：种子 37，开局只派一次（总监和 Dale 扫外场 1），之后只 /wait，不回答任何卡
B=http://127.0.0.1:7371
OUT=${LAB:-$PWD/lab}/e7/data/bridge-idle-final.tsv
shot() { for i in 1 2 3; do curl -s -m 70 $B/shot/$1 | grep -q path && return; done; echo "shot $1 failed"; }
curl -s $B/new/37 >/dev/null
curl -s $B/assign/director/o1_sweep >/dev/null
curl -s $B/assign/dale/o1_sweep >/dev/null
: > $OUT
day2=0
while true; do
  r=$(curl -s $B/wait/720)
  read stop day hour card ended < <(echo "$r" | python3 -c 'import json,sys; d=json.load(sys.stdin); o=d["overview"]; print(d["waited"]["stop"], o["day"], round(o["open"],1), o["cardOpen"], o["outcome"] is not None)')
  staff=$(echo "$r" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(" | ".join(p["doing"] for p in d["overview"]["people"]))')
  printf "%s\t%s\t%s\t%s\t%s\n" "$day" "$hour" "$stop" "$card" "$staff" >> $OUT
  if [ "$stop" = orderFinished ]; then shot f1_sweep_done; fi
  if [ "$day" -ge 2 ] && [ $day2 = 0 ] && [ "$card" = None ]; then day2=1; shot f2_idle_hint_day$day; fi
  if [ "$stop" = cardOpened ]; then shot f_card_d${day}_${card}; fi
  if [ "$ended" = True ]; then shot f9_ending; break; fi
done
grep -v $'\ttime\t' $OUT
