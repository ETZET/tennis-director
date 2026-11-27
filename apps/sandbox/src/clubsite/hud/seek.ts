// "有人在找你"：人物界面（clubsite/castui）往这里报，像素界面（index.ts）从这里读 —— 两边不用在场景的 main 里多接一根线。
// 按 Play 对上：同一页里两个世界（分图 + 内场）各有一个 play、一份界面、一份人物界面，各读各的。
// 画法（第三轮）：
//   - 这张图上有人在找你、他在画面外：屏幕边上一个小人头（他的发色、肤色、衣服色）+ 一个朝他的小箭头，贴着他那一边；点它 = 总监走过去。
//   - 他在画面里：头顶一个草帽色小点（不吵，同右下名册键上的点）。
//   - 在别的图上：右下名册键右上角一个草帽色小点；名册里他排在最前、头像带同样的点。
import type * as THREE from 'three';
import type { Who } from './index';

export interface Seeker {
  id: string;
  who: Who;
  /** 在这张图上：他的身体（屏幕边的小人头指向他）；不在 = null */
  obj: THREE.Object3D | null;
  /** 头顶多高（米） */
  dy: number;
}

export interface SeekSource {
  /** 现在在找你的人（这一帧） */
  list(): Seeker[];
  /** 点了屏幕边的小人头：总监走过去 */
  go(id: string): void;
  /** 在找你的人在哪个场景（演员表的 SceneId；小地图换成图） */
  scenes(): string[];
}

const sources = new Map<object, SeekSource>();

/** 人物界面挂上时报一下（key = 它的 play） */
export function provideSeekers(play: object, src: SeekSource) {
  sources.set(play, src);
}

export function seekersOf(play: object): SeekSource | null {
  return sources.get(play) ?? null;
}

/** 所有世界里在找你的人在的场景（小地图用：它不属于哪一个世界） */
export function seekScenes(): string[] {
  const out = new Set<string>();
  for (const s of sources.values()) for (const x of s.scenes()) out.add(x);
  return [...out];
}
