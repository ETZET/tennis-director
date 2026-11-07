// 极简协程：演出脚本写成生成器，每帧 next(dt)。确定性、可读。
import { COURT, FENCE, PATH } from '../../layout';
import type { Pt } from './person';

export type Co = Generator<void, void, number>;

export function* wait(s: number): Co {
  let t = 0;
  while (t < s) t += yield;
}

export function* until(cond: () => boolean, timeout = Infinity): Co {
  let t = 0;
  while (!cond() && t < timeout) t += yield;
}

/** 并行跑几个协程，全部结束才结束 */
export function* all(...cos: Co[]): Co {
  let live = cos.slice();
  while (live.length) {
    const dt = yield;
    live = live.filter((c) => !c.next(dt).done);
  }
}

export class Runner {
  private cos: Co[] = [];
  add(c: Co) {
    c.next(0);
    this.cos.push(c);
  }
  step(dt: number) {
    this.cos = this.cos.filter((c) => !c.next(dt).done);
  }
}

// —— 寻路：只有两样障碍，围栏（东侧门）和网 ——

const GATE_OUT: Pt = { x: PATH.gate.x, z: PATH.gate.z };
const GATE_IN: Pt = { x: FENCE.hw - 0.9, z: PATH.gate.z };
const NET_END = COURT.hw + 0.914 + 0.7;

const inside = (p: Pt) => Math.abs(p.x) < FENCE.hw && Math.abs(p.z) < FENCE.hl;

function aroundNet(a: Pt, b: Pt, out: Pt[]) {
  if (a.z * b.z < 0) {
    const f = a.z / (a.z - b.z);
    const x = a.x + (b.x - a.x) * f;
    if (Math.abs(x) < NET_END) out.push({ x: x < -2 ? -NET_END - 0.2 : NET_END + 0.2, z: 0 });
  }
}

export function route(from: Pt, to: Pt): Pt[] {
  const out: Pt[] = [];
  const ia = inside(from);
  const ib = inside(to);
  if (ia && ib) {
    aroundNet(from, to, out);
  } else if (!ia && ib) {
    out.push(GATE_OUT, GATE_IN);
    aroundNet(GATE_IN, to, out);
  } else if (ia && !ib) {
    aroundNet(from, GATE_IN, out);
    out.push(GATE_IN, GATE_OUT);
  }
  out.push(to);
  return out.map((p) => ({ ...p }));
}
