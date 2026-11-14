// 前台签到的队伍（演出）：演员表里的人按 CastLook 换装（clubsite/people/dress.ts）走进大门、沿石板引导道排队、到柜台转角站定，
// 签完到肩上搭条毛巾、往小路走；等不及的气呼呼地原路出门。
// 排队的做法照 clubdesk/life.ts（那份不 import：它自己按时间表放人，这里要自己控队伍）：一条折线 QUEUE_LINE（签到位 → 引导道 →
// 门洞 → 门外），每个人在线上有一个弧长 s（0 = 签到位）；排第 i 个的目标是 s = i·GAP，前面的人走了整队往前挪。
// 人用场景的 'player' 资产建（同场景里排队的会员），建一次反复用（换人 = 重新 dress）。头顶的耐心条是 DOM（mg.project 投影）。
import * as THREE from 'three';
import { SPOTS } from '../../clubdesk/layout';
import type { CastPerson } from '../../clubsite/cast/types';
import { setStride, strideOf } from '../../clubsite/people';
import type { ArrivalKind } from './rules';

type V2 = readonly [number, number];
const P = Math.PI;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const turnTo = (a: number, b: number, k: number) => {
  let d = b - a;
  d -= Math.round(d / (P * 2)) * P * 2;
  return a + d * Math.min(1, k);
};
const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);

/** 排队的线：签到位 → 引导道 → 门洞 → 门外落客区 → 车道往东（画外）。同 clubdesk/life.ts 的 QUEUE_LINE */
export const QUEUE_LINE: V2[] = [
  SPOTS.serve,
  SPOTS.queue1,
  SPOTS.queue2,
  SPOTS.queue3,
  [58.9, 3.6],
  SPOTS.gateIn,
  [61.2, 0.5],
  SPOTS.gateOut,
  [66.0, 1.6],
  [72.0, 3.6],
  [82.0, 3.6],
];
/** 排队间距（米） */
export const GAP = 1.15;
/** 排队往前挪的速度 / 走进来的速度（早高峰，走得快） */
const STEP_UP = 2.0;
const WALK_IN = 2.4;
const WALK_OUT = 2.2;
/**
 * 签完到：先往东让开一步（镜头朝北，从柜台前直接往南走正好挡在下一位前面），再往南、拐上小路往下（进了面板底下就收起来）
 */
const TO_EXIT: V2[] = [[58.5, 9.3], [58.6, 11.0], [57.0, 11.6], SPOTS.pathTop, SPOTS.lawnPath];
/** 等不及走掉：先往东让出队伍（ANGRY_X），再沿着东墙出大门、往东北（停车场） */
const ANGRY_EXIT: V2[] = [
  [59.3, 1.2],
  [60.5, 0.0],
  [62.0, -0.8],
  [66.0, -2.4],
  [74.0, -3.0],
];
/** 气走的人先横着走到这条线（贴着东墙、队伍东边），再往北出门：不从排着的人身上穿过去 */
const ANGRY_X = 59.3;
/** 站在柜台前朝哪（大半张脸朝镜头，帽子、眼镜看得清；正西 = −π/2 是朝着总监，0 = 正对镜头） */
const COUNTER_YAW = -0.5;

interface Path {
  pts: V2[];
  cum: number[];
  len: number;
}
function mkPath(pts: V2[]): Path {
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
function pathAt(p: Path, s: number): [number, number] {
  s = clamp(s, 0, p.len);
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < s) i++;
  const k = (s - p.cum[i - 1]) / Math.max(1e-6, p.cum[i] - p.cum[i - 1]);
  return [lerp(p.pts[i - 1][0], p.pts[i][0], k), lerp(p.pts[i - 1][1], p.pts[i][1], k)];
}
const LINE = mkPath(QUEUE_LINE);
/** 门外落客区（gateOut）在线上的弧长：新来的人从这里往里走（再往外在画外） */
const S_GATE_OUT = LINE.cum[7];

export interface Walker {
  /** 这一局里的第几个来的（从 0 数） */
  n: number;
  who: CastPerson;
  kind: ArrivalKind;
  obj: THREE.Object3D;
  x: number;
  z: number;
  yaw: number;
  ph: number;
  posed: string;
  /** 排队线上的弧长 */
  s: number;
  state: 'queue' | 'counter' | 'leave';
  /** 柜台前站定了多久（VIP 计时） */
  atCounter: number;
  patience: number;
  pmax: number;
  /** 走掉的路线（leave 时） */
  route: Path | null;
  rs: number;
  /** 不耐烦地跺脚到什么时候 */
  fumeUntil: number;
  /** 等急了嘟囔过一句了 */
  grumbled: boolean;
  towel: THREE.Object3D | null;
  bar: HTMLDivElement;
}

export interface CrowdOpts {
  scene: THREE.Object3D;
  /** 建一个人（场景的 player 资产） */
  make(): THREE.Object3D;
  /** 换装 */
  dress(obj: THREE.Object3D, p: CastPerson): void;
  groundAt(x: number, z: number): number;
  /** 投影到屏幕（CSS 像素） */
  project(p: THREE.Vector3): { x: number; y: number };
  /** 头顶条的层（DOM） */
  layer: HTMLElement;
  rng: () => number;
}

export function createCrowd(o: CrowdOpts) {
  const free: { obj: THREE.Object3D; bar: HTMLDivElement }[] = [];
  const all: Walker[] = [];
  let now = 0;

  const place = (w: Walker) => {
    w.obj.position.set(w.x, o.groundAt(w.x, w.z), w.z);
    w.obj.rotation.y = w.yaw;
  };
  const pose = (w: Walker, name: string, ph?: number) => {
    if (ph === undefined) {
      if (w.posed === name) return;
      w.posed = name;
      w.obj.userData.pose?.(name);
    } else {
      w.posed = '';
      w.obj.userData.pose?.(name, ph);
    }
  };

  /** 排着的（含柜台前那位），按弧长排好 */
  const line = () => all.filter((w) => w.state !== 'leave').sort((a, b) => a.s - b.s);

  /** 来一个人：从门外落客区往队尾走 */
  function spawn(n: number, who: CastPerson, kind: ArrivalKind, pmax: number, opening = false): Walker {
    const q = line();
    let slot = free.pop();
    if (!slot) {
      const obj = o.make();
      setStride(obj);
      const bar = document.createElement('div');
      bar.className = 'ci-bar';
      bar.innerHTML = '<i></i><b></b>';
      o.layer.appendChild(bar);
      slot = { obj, bar };
    }
    const { obj, bar } = slot;
    o.dress(obj, who);
    obj.userData.setProp?.(o.rng() < 0.5 ? 'racket' : null);
    obj.visible = true;
    if (!obj.parent) o.scene.add(obj);
    // 开局排着的直接站在队里；后来的从门外（画外）走进来
    const s = opening ? q.length * GAP : Math.max(S_GATE_OUT, q.length * GAP + 4);
    const [x, z] = pathAt(LINE, s);
    const w: Walker = {
      n,
      who,
      kind,
      obj,
      x,
      z,
      yaw: -2.6,
      ph: o.rng(),
      posed: '',
      s,
      state: 'queue',
      atCounter: 0,
      patience: pmax,
      pmax,
      route: null,
      rs: 0,
      fumeUntil: 0,
      grumbled: false,
      towel: null,
      bar,
    };
    bar.className = `ci-bar${kind === 'vip' ? ' vip' : ''}`;
    all.push(w);
    place(w);
    pose(w, 'idle');
    return w;
  }

  function recycle(w: Walker) {
    w.obj.visible = false;
    w.bar.style.display = 'none';
    if (w.towel) {
      w.towel.removeFromParent();
      w.towel = null;
    }
    all.splice(all.indexOf(w), 1);
    free.push({ obj: w.obj, bar: w.bar });
  }

  /** 走掉：happy = 签完到往小路；不然气呼呼出大门 */
  function leave(w: Walker, happy: boolean) {
    w.state = 'leave';
    w.route = mkPath([[w.x, w.z], ...(happy ? TO_EXIT : [[ANGRY_X, Math.max(w.z, 1.2)] as V2, ...ANGRY_EXIT])]);
    w.rs = 0;
  }

  /** 柜台前站定的那位（还没走到 = null） */
  function counter(): Walker | null {
    return all.find((w) => w.state === 'counter') ?? null;
  }

  function step(dt: number) {
    now += dt;
    const q = line();
    let prevS = -GAP;
    q.forEach((w, i) => {
      const want = Math.max(i * GAP, prevS + GAP * 0.85);
      if (w.s > want + 0.01) {
        // 往前走（走进来的快一点）
        const v = w.s > S_GATE_OUT - 2 ? WALK_IN : STEP_UP;
        const stepLen = Math.min(w.s - want, v * dt);
        w.s -= stepLen;
        const [x, z] = pathAt(LINE, w.s);
        const dx = x - w.x;
        const dz = z - w.z;
        if (Math.hypot(dx, dz) > 1e-4) w.yaw = turnTo(w.yaw, yawOf(dx, dz), dt * 10);
        w.x = x;
        w.z = z;
        w.ph = (w.ph + stepLen / strideOf(w.obj)) % 1;
        pose(w, 'walk', w.ph);
        if (w.state === 'counter') w.state = 'queue';
      } else if (i === 0 && w.s < 0.05) {
        // 站到柜台前
        w.state = 'counter';
        w.atCounter += dt;
        w.yaw = turnTo(w.yaw, COUNTER_YAW, dt * 8);
        if (now < w.fumeUntil) pose(w, 'ready');
        else pose(w, 'idle');
      } else {
        // 排着：朝前面的人；不耐烦了跺脚
        const [ax, az] = pathAt(LINE, Math.max(0, w.s - 0.5));
        w.yaw = turnTo(w.yaw, yawOf(ax - w.x, az - w.z), dt * 5);
        if (now < w.fumeUntil || w.patience / w.pmax < 0.3) pose(w, 'ready');
        else pose(w, 'idle');
      }
      place(w);
      prevS = w.s;
    });
    // 走掉的
    for (const w of all.filter((a) => a.state === 'leave')) {
      if (!w.route) continue;
      const v = w.towel ? WALK_OUT : WALK_OUT * 1.25;
      w.rs += v * dt;
      if (w.rs >= w.route.len) {
        recycle(w);
        continue;
      }
      const [x, z] = pathAt(w.route, w.rs);
      const dx = x - w.x;
      const dz = z - w.z;
      if (Math.hypot(dx, dz) > 1e-4) w.yaw = turnTo(w.yaw, yawOf(dx, dz), dt * 10);
      w.x = x;
      w.z = z;
      w.ph = (w.ph + (v * dt) / strideOf(w.obj)) % 1;
      pose(w, 'walk', w.ph);
      place(w);
    }
  }

  const head = new THREE.Vector3();
  /** 头顶的耐心条：VIP 一直有（金色，柜台前倒数秒）；别人耐心掉到 75% 以下才出来，绿 → 黄 → 红 */
  function frame(vipLimit: number) {
    for (const w of all) {
      const b = w.bar;
      const k = clamp(w.patience / w.pmax, 0, 1);
      const vip = w.kind === 'vip';
      const show = w.obj.visible && w.state !== 'leave' && (vip || k < 0.75);
      if (!show) {
        if (b.style.display !== 'none') b.style.display = 'none';
        continue;
      }
      head.set(w.x, w.obj.position.y + 2.25, w.z);
      const p = o.project(head);
      b.style.display = 'block';
      b.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      const fill = b.firstElementChild as HTMLElement;
      const label = b.lastElementChild as HTMLElement;
      if (vip) {
        const left = w.state === 'counter' ? Math.max(0, vipLimit - w.atCounter) : vipLimit;
        fill.style.width = `${Math.round((left / vipLimit) * 100)}%`;
        label.textContent = w.state === 'counter' ? `VIP ${left.toFixed(1)}` : 'VIP';
      } else {
        fill.style.width = `${Math.round(k * 100)}%`;
        fill.style.background = k > 0.5 ? '#8fe36a' : k > 0.25 ? '#ffd23c' : '#ff7a7a';
        label.textContent = '';
      }
    }
  }

  function clear() {
    for (const w of [...all]) recycle(w);
  }

  return {
    spawn,
    leave,
    counter,
    line,
    step,
    frame,
    clear,
    all: () => all as readonly Walker[],
    /** 跺脚一会儿（点错了 / 等急了） */
    fume(w: Walker, sec: number) {
      w.fumeUntil = now + sec;
    },
  };
}

export type Crowd = ReturnType<typeof createCrowd>;
