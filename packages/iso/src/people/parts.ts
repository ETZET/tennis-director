import { Box, type Node } from '../core/graph';

/**
 * 小方块的便捷函数（旧版体素小人的 part，像素版只给活动道具用）。
 * 给 parent 挂一个方块，(x,y,z) 是方块中心；返回这个 Box。
 */
export function part(parent: Node, w: number, h: number, d: number, x: number, y: number, z: number, hex: string): Box {
  const m = new Box(w, h, d, hex);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** 节点的世界坐标。 */
export function worldPos(obj: Node): { x: number; y: number; z: number } {
  const v = obj.getWorldPosition();
  return { x: v.x, y: v.y, z: v.z };
}
