import type { XZ } from '@td/shared';
import { Box, Custom, Group, type Node } from '../core/graph';

export interface Car {
  readonly g: Group;
  /** 发动，沿路径开走 */
  start(): void;
  update(dt: number, now: number): void;
}

/** 几种车漆和配色（车身、点缀），游戏随便挑 */
export const CAR_COLORS: readonly (readonly [string, string])[] = [
  ['#d8443a', '#f2e6d0'],
  ['#3a7fc8', '#e8e8e8'],
  ['#e8c44a', '#3a3a3a'],
  ['#f2efe6', '#c8443a'],
  ['#4a8a5a', '#e8dcc4'],
  ['#5a5a66', '#c8c8d0'],
];

const GLASS = '#2c3a44';
const TIRE = '#1c1c1c';

/**
 * 一辆方块小汽车（Box 节点拼的，等距下随车头方向一起转），开动时排尾气。
 * 车头朝本地 +x（和旧版一样：rotation.y = atan2(-dz, dx)）。车灯是自发光的小方块，夜里在车头前的地上打一片光。
 * carY 给出路面高度。
 */
export function createCar(
  scene: Node,
  carY: (x: number, z: number) => number,
  x: number,
  z: number,
  col: string,
  trim: string,
  path: readonly XZ[],
  /** 开到路线尽头就缩小消失（浮空岛：路在岛边断开，边外什么都没有） */
  vanishAtEnd = false,
): Car {
  const g = new Group();
  g.name = 'car';
  g.position.set(x, carY(x, z), z);
  scene.add(g);
  const put = (n: Box, px: number, py: number, pz: number): Box => {
    n.position.set(px, py, pz);
    g.add(n);
    return n;
  };
  // 轮子在车身两侧外面（不和车身相交，排序才稳）
  for (const [a, b] of [
    [1.3, 0.88],
    [-1.3, 0.88],
    [1.3, -0.88],
    [-1.3, -0.88],
  ] as const)
    put(new Box(0.66, 0.6, 0.14, TIRE, { edge: false }), a, 0.3, b);
  // 车身、车窗一圈、车顶
  put(new Box(4.2, 0.5, 1.6, col, { top: col }), 0, 0.55, 0);
  put(new Box(2.2, 0.42, 1.48, GLASS, { edge: false }), -0.25, 1.01, 0);
  put(new Box(2.36, 0.14, 1.6, col), -0.25, 1.29, 0);
  // 引擎盖上的条纹（点缀色）
  put(new Box(1.2, 0.04, 0.4, trim, { edge: false }), 1.3, 0.82, 0);
  // 车灯：前白后红，夜里自发光
  for (const s of [0.55, -0.55]) {
    put(new Box(0.06, 0.16, 0.34, '#fff2b0', { emissive: true, edge: false }), 2.13, 0.62, s);
    put(new Box(0.06, 0.14, 0.34, '#d2382c', { emissive: true, edge: false }), -2.13, 0.62, s);
  }
  // 夜里车头前的光：画在车前的地上
  const beam = new Custom(
    (r, self) => {
      if (r.night < 0.15 || !g.visible) return;
      const m = self.matrixWorld;
      const p = r.P(m[9] as number, m[10] as number, m[11] as number);
      r.glow(p[0], p[1], Math.max(4, r.k * 2.2), [120, 104, 60], r.night * 0.9);
    },
    { x0: -1.2, x1: 1.2, y0: 0, y1: 0.1, z0: -1.2, z1: 1.2 },
  );
  beam.position.set(3.6, 0, 0);
  beam.lit = 1;
  g.add(beam);

  /* 尾气：每团一个 Custom 节点，挂在场景上（不跟着车走），像素抖动着变淡 */
  const puffs: { n: Custom; t: number; s: number }[] = [];
  for (let k = 0; k < 8; k++) {
    const p = { n: null as unknown as Custom, t: -9, s: 1 };
    p.n = new Custom(
      (r, self) => {
        if (p.s <= 0) return;
        const m = self.matrixWorld;
        const c = r.P(m[9] as number, m[10] as number, m[11] as number);
        const R = Math.max(1, r.k * 0.16 * p.s);
        const keep = 0.75 * (1 - (p.s - 1) / 1.8);
        const lit = r.litAt(m[9] as number, m[11] as number);
        const c1 = r.col('#b4b8b6', 1, lit);
        const c2 = r.col('#8e9392', 1, lit);
        for (let yy = -Math.ceil(R); yy <= R; yy++)
          for (let xx = -Math.ceil(R); xx <= R; xx++) {
            if (xx * xx + yy * yy > R * R) continue;
            // 固定图案的抖动：越旧的烟留下的像素越少（不做半透明）
            const h = (((xx * 73856093) ^ (yy * 19349663) ^ k) >>> 0) % 100;
            if (h < keep * 100) r.pix(Math.round(c[0] + xx), Math.round(c[1] + yy), yy < 0 ? c1 : c2);
          }
      },
      { x0: -0.3, x1: 0.3, y0: 0, y1: 0.6, z0: -0.3, z1: 0.3 },
    );
    p.n.visible = false;
    scene.add(p.n);
    puffs.push(p);
  }

  let moving = false;
  let v = 0;
  let pi = 0;
  let pt = 0;
  let goneT: number | null = null;
  return {
    g,
    start() {
      moving = true;
    },
    update(dt, now) {
      for (const p of puffs) {
        const a = now - p.t;
        if (a < 0 || a > 1.2) {
          p.n.visible = false;
          continue;
        }
        p.n.visible = true;
        p.s = 1 + a * 1.5;
        p.n.position.y += dt * 0.5;
      }
      if (moving && vanishAtEnd && pi >= path.length) {
        goneT ??= now;
        const k = Math.min(1, (now - goneT) / 0.8);
        g.scale.setScalar(Math.max(0.001, 1 - k));
        if (k >= 1) g.visible = false;
        return;
      }
      if (!moving || pi >= path.length) return;
      const tg = path[pi] as XZ;
      const dx = tg.x - g.position.x;
      const dz = tg.z - g.position.z;
      const d = Math.hypot(dx, dz);
      v = Math.min(10, v + 3 * dt);
      const s = v * dt;
      if (d < Math.max(s, 0.3)) pi++;
      else {
        g.position.x += (dx / d) * s;
        g.position.z += (dz / d) * s;
        const ty = Math.atan2(-dz, dx);
        let dy = ty - g.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        g.rotation.y += dy * Math.min(1, dt * 3);
      }
      g.position.y = carY(g.position.x, g.position.z);
      pt -= dt;
      if (pt < 0 && v > 0.3) {
        pt = 0.14;
        const p = puffs.find((q) => now - q.t > 1.2) || (puffs[0] as (typeof puffs)[number]);
        p.t = now;
        p.s = 1;
        const c = Math.cos(g.rotation.y);
        const sn = -Math.sin(g.rotation.y);
        p.n.position.set(g.position.x - c * 2.3, g.position.y + 0.35, g.position.z - sn * 2.3);
      }
    },
  };
}
