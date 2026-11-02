#!/bin/bash
# 放置对照：开局只派一次（总监和 Dale 扫外场 1），之后只 /wait，不回答任何卡；在关键时刻截图
B=http://127.0.0.1:7371
curl -s $B/new/37 >/dev/null
curl -s $B/assign/director/o1_sweep >/dev/null
curl -s $B/assign/dale/o1_sweep >/dev/null
n=0
while true; do
  r=$(curl -s $B/wait/1440)
  read stop day card ended < <(echo "$r" | python3 -c 'import json,sys; d=json.load(sys.stdin); o=d["overview"]; print(d["waited"]["stop"], o["day"], o["cardOpen"], o["outcome"] is not None)')
  echo "$stop $day $card $ended"
  if [ "$stop" = orderFinished ] && [ "$day" = 1 ]; then
    # 扫完以后：卡还开着；再走到卡过期（第 2 天）看员工条和地点牌
    curl -s $B/shot/a1_sweep_done_day1 >/dev/null
  fi
  if [ "$stop" = cardOpened ]; then curl -s $B/shot/card_d${day}_${card} >/dev/null; fi
  if [ "$day" = 2 ] && [ $n = 0 ]; then n=1; curl -s $B/shot/a2_day2_idle_hint >/dev/null; curl -s $B/state > ${LAB:-$PWD/lab}/e7/data/state_day2.json; fi
  if [ "$ended" = True ]; then curl -s $B/shot/ending >/dev/null; break; fi
done
