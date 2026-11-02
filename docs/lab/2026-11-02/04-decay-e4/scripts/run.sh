#!/bin/bash
# usage: [DROP=15] [VARIANT=income] run.sh <tag> [games] [modes]   每格一个进程，结果一行 JSON
TAG=$1; N=${2:-100}; MODES=${3:-"normal noupkeep nomaint"}
cd ${REPO:-.}
mkdir -p ${LAB:-$PWD/lab}/e4/results
OUT=${LAB:-$PWD/lab}/e4/results/$TAG.jsonl; : > $OUT
for b in greedy cautious idle novice average good; do
  for m in $MODES; do
    { [ "$b" = idle ] || [ "$b" = cautious ]; } && [ "$m" != normal ] && continue
    (npx tsx apps/sim-cli/lab/decaylab.ts $b $N $m 1 > $OUT.part.$b.$m) &
  done
done
wait
cat $OUT.part.* > $OUT; rm -f $OUT.part.*
python3 ${LAB:-$PWD/lab}/e4/table.py $OUT
