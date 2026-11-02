#!/bin/bash
# 用法：build-variants.sh <repo> name:cm:outColorSpace:lightUnit ...
# 临时改 color.ts 三个开关 + 加 LAB-ONLY 钩子（__labStage/__labCam），构建到 lab3/dist-<name>，最后还原
set -e
R=$1; shift; L=${LAB:-$PWD/lab}/e3
C=$R/packages/render/src/world/color.ts; M=$R/apps/game/src/main.ts
cp $M $L/main.ts.orig; [ -f $C ] && cp $C $L/color.ts.orig
trap 'cp $L/main.ts.orig $M; [ -f $L/color.ts.orig ] && cp $L/color.ts.orig $C; true' EXIT
sed -i 's|^camera.bindPointer(stage.renderer.domElement);$|&\nObject.assign(window, { __labStage: stage, __labCam: camera }); // LAB-ONLY|' $M
grep -q __labCam $M
for spec in "$@"; do
  IFS=: read name cm out pi <<<"$spec"
  if [ -f $L/color.ts.orig ] && [ "$cm" != "-" ]; then
    cp $L/color.ts.orig $C
    sed -i "s|^THREE.ColorManagement.enabled = false;|THREE.ColorManagement.enabled = $cm;|; s|^export const LIGHT_UNIT = Math.PI;|export const LIGHT_UNIT = $pi;|; s|renderer.outputColorSpace = THREE.LinearSRGBColorSpace;|renderer.outputColorSpace = THREE.$out;|" $C
    grep -E "^THREE.ColorManagement|^export const LIGHT_UNIT|outputColorSpace =" $C | tr '\n' ' '
  fi
  echo " -> $name"
  (cd $R/apps/game && npx vite build --configLoader runner --outDir $L/dist-$name --emptyOutDir > $L/build-$name.log 2>&1)
  grep -E "assets/.*\.js" $L/build-$name.log | sed 's|.*assets/|assets/|'
done
