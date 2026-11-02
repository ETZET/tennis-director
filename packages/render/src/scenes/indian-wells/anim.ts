import type * as THREE from 'three';

/**
 * 场景里会动的小东西（旗子、喷泉的水柱）：覆盖层建的时候登记，天空的 update 每帧调一次。
 * 按场景分开登记，同一页面里有两个舞台（sandbox）也互不影响。只动画面，不碰模拟。
 */
export type Tick = (now: number, dt: number) => void;

const regs = new WeakMap<THREE.Object3D, Tick[]>();

export function onTick(scene: THREE.Object3D, f: Tick): void {
  const l = regs.get(scene);
  if (l) l.push(f);
  else regs.set(scene, [f]);
}

export function ticksOf(scene: THREE.Object3D): readonly Tick[] {
  return regs.get(scene) ?? [];
}
