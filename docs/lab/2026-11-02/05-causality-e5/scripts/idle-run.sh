#!/bin/bash
# 放置对照：种子 37，开局派两个人扫沙，之后不再操作。用法：idle-run.sh <before|after>
set -u
TAG=$1
LANG_ARG=${2:-en}
OUT=${LAB:-$PWD/lab}/e5/shots/$TAG
B=http://127.0.0.1:7351
mkdir -p $OUT
cd ${REPO:-.}
export CHROMIUM_PATH=${CHROMIUM_PATH:?set CHROMIUM_PATH}
node tools/playtest/server.mjs --port 7351 --seed 37 --lang $LANG_ARG --out $OUT > $OUT/bridge.log 2>&1 &
PID=$!
for i in $(seq 1 60); do curl -s -m 2 $B/state >/dev/null && break; sleep 1; done
curl -s $B/assign/director/o1_sweep >/dev/null
curl -s $B/assign/dale/o1_sweep >/dev/null
for i in $(seq 1 36); do
  curl -s $B/wait/720 > $OUT/w.json
  d=$(python3 -c "import json; print(json.load(open('$OUT/w.json'))['day'])")
  python3 -c "import json; o=json.load(open('$OUT/w.json')); print(o['day'], ' | '.join(o['strip']), '|', (o.get('card') or {}).get('context', ['','','',''])[-1])" >> $OUT/days.txt
  if [ "$d" = "8" ] && [ ! -f $OUT/state-day8.json ]; then
    cp $OUT/w.json $OUT/state-day8.json
    curl -s $B/shot/$TAG-day8-hud >/dev/null
    curl -s $B/report/keep > $OUT/report-day8.json
    curl -s $B/shot/$TAG-day8-report >/dev/null
    curl -s $B/report >/dev/null
  fi
done
cp $OUT/w.json $OUT/state-day36.json
curl -s $B/shot/$TAG-day36-hud >/dev/null
curl -s $B/report/keep > $OUT/report-day36.json
curl -s $B/shot/$TAG-day36-report >/dev/null
# 截完放置局以后再关掉开局那张卡（它没有倒计时，会一直盖住明细里的"我们怎么走到这一步"），只为了截到明细
curl -s $B/report >/dev/null
curl -s $B/answer/1 >/dev/null
curl -s $B/report/keep > $OUT/report-day36-nocard.json
curl -s $B/shot/$TAG-day36-report-nocard >/dev/null
curl -s $B/quit >/dev/null
sleep 1
kill $PID 2>/dev/null; sleep 1; kill -9 $PID 2>/dev/null
echo done
