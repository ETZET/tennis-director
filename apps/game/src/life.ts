import { EAST, hollowCreek, type Person, type Scheduler, type Stage, WEST } from '@td/render';
import { clamp, type XZ } from '@td/shared';
import type { GameState } from '@td/sim';
import * as THREE from 'three';

/**
 * 会所的"日常"（准则 6：玩家不操作时世界照样在动）：
 * - 会员自己来打球：营业时间、不下雨、场地能用、没被活动占着时，一对一对地上场。人数跟着会员数和时段走，
 *   修好一块场地，那块场地上就开始有人打球。
 * - 路人在会所、停车场、泳池和桥之间走来走去，会员越多人越多。
 * - 初秋落叶，刮风天落得更多。
 *
 * 只读模拟状态。谁在不在场按"哪天、哪个两小时段、哪块场地"算一个固定的值，同一时段里不会忽有忽无。
 */

const { FA, FB, FD, STANDS, routeLine } = hollowCreek;

interface Court {
  anchor: string;
  frame: typeof FA;
  /** 这块场地现在有多招人（看设施状态）：0 = 没法打，1 = 正常；裂了缝的老场地也有人凑合着打 */
  open: (s: GameState) => number;
  /** 在场地的哪一侧打（1 号场中线上有泰勒在练发球，会员打旁边） */
  z: (s: GameState) => number;
}

const COURTS: Court[] = [
  { anchor: 'court_1', frame: FA, open: (s) => (s.facilities.court_1 === 'repaired' ? 1 : 0.45), z: () => 3.4 },
  {
    anchor: 'court_2',
    frame: FB,
    open: (s) => (s.facilities.court_2 === 'tennis' || s.facilities.court_2 === 'shared' ? 1 : 0),
    z: (s) => (s.facilities.court_2 === 'shared' ? 3.4 : 0),
  },
  { anchor: 'clay_court', frame: FD, open: (s) => (s.facilities.clay === 'restored' ? 1 : 0), z: () => 0 },
];

/** 走来走去的人会去的地方 */
const SPOTS = ['deck', 'lot', 'pool', 'creek_bridge', 'court_1', 'court_2'] as const;
const LEAF = ['#d9772b', '#c8452a', '#e3a336', '#9a5a2a', '#b8662a'];

/** 一个小整数哈希：同样的输入永远给同样的 0..1 */
function hash01(...n: number[]): number {
  let h = 2166136261;
  for (const x of n) {
    h ^= x | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 10000) / 10000;
}

export interface LifeDeps {
  stage: Stage;
  sched: Scheduler;
  rnd: () => number;
  /** 一个藏着的路人（每个号码一个人） */
  person: (i: number) => Person;
  rally: (a: Person, b: Person, o?: { speed?: number; miss?: number }) => { stop(): void };
  /** 这块场地正被活动演出占着 */
  busy: (anchor: string) => boolean;
}

export interface Life {
  update(s: GameState, dt: number): void;
  /** 读档、换内容之后全部重排 */
  reset(): void;
}

export function createLife(d: LifeDeps): Life {
  /* ---------- 来打球的会员 ---------- */
  const players = COURTS.map((_, i) => [d.person(i * 2), d.person(i * 2 + 1)] as const);
  const playing: ({ stop(): void } | null)[] = COURTS.map(() => null);

  function courtWanted(s: GameState, c: Court, i: number): boolean {
    const draw = c.open(s);
    if (!draw || d.busy(c.anchor)) return false;
    if (s.weather === 'rain') return false;
    const min = s.t % 1440;
    if (min < 7 * 60 || min > 20 * 60) return false;
    const day = Math.floor(s.t / 1440);
    const block = Math.floor(min / 120);
    const members = s.stats.members ?? 40;
    const weekend = day % 7 >= 5 ? 0.2 : 0;
    const p = clamp((members - 25) / 70 + weekend, 0.12, 0.9) * draw;
    return hash01(day, block, i) < p;
  }

  function startCourt(s: GameState, i: number): void {
    const c = COURTS[i] as Court;
    const [a, b] = players[i] as readonly [Person, Person];
    const z = c.z(s);
    const pa = c.frame.w({ x: -9.5, z });
    const pb = c.frame.w({ x: 9.5, z: -z * 0.3 });
    for (const [p, at, face] of [
      [a, pa, EAST],
      [b, pb, WEST],
    ] as const) {
      p.clearMoves();
      p.pos.x = at.x;
      p.pos.z = at.z;
      p.base = 'ready';
      p.lock = c.frame.yaw(face);
      p.seatY = null;
      p.root.visible = true;
    }
    playing[i] = d.rally(a, b, { speed: 8 + d.rnd() * 3, miss: 0.2 });
  }

  function stopCourt(i: number): void {
    playing[i]?.stop();
    playing[i] = null;
    for (const p of players[i] ?? []) {
      p.clearMoves();
      p.root.visible = false;
    }
  }

  /* ---------- 走来走去的人 ---------- */
  const walkers = [0, 1, 2].map((k) => ({ p: d.person(COURTS.length * 2 + k), on: false, at: 'deck' as string }));

  function walkOn(w: (typeof walkers)[number], s: GameState): void {
    const choices = SPOTS.filter((x) => x !== w.at && (x !== 'pool' || s.facilities.pool === 'open'));
    const to = choices[Math.floor(d.rnd() * choices.length)] ?? 'deck';
    const line = routeLine(w.at, to) ?? [STANDS[to] as XZ];
    w.at = to;
    w.p
      .path(line, 1.1 + d.rnd() * 0.5)
      .wait(2 + d.rnd() * 5)
      .call(() => {
        if (w.on && cur) walkOn(w, cur);
      });
  }

  function syncWalkers(s: GameState): void {
    const min = s.t % 1440;
    const open = min >= 7 * 60 && min <= 21 * 60;
    const members = s.stats.members ?? 40;
    const want = !open ? 0 : clamp(Math.round(members / 35) - (s.weather === 'rain' ? 1 : 0), 0, walkers.length);
    walkers.forEach((w, k) => {
      const on = k < want;
      if (on === w.on) return;
      w.on = on;
      w.p.clearMoves();
      if (on) {
        const from = SPOTS[Math.floor(d.rnd() * 3)] ?? 'deck';
        const at = STANDS[from] as XZ;
        w.at = from;
        w.p.pos.x = at.x + (d.rnd() - 0.5) * 2;
        w.p.pos.z = at.z + (d.rnd() - 0.5) * 2;
        w.p.base = 'relaxed';
        w.p.lock = null;
        w.p.root.visible = true;
        walkOn(w, s);
      } else w.p.root.visible = false;
    });
  }

  /* ---------- 落叶 ---------- */
  const leafGeo = new THREE.BoxGeometry(0.22, 0.05, 0.16);
  const leaves: { m: THREE.Mesh; vy: number; ph: number; life: number; ground: number }[] = [];
  const mats = LEAF.map((c) => new THREE.MeshLambertMaterial({ color: c, transparent: true }));
  let leafT = 0;
  const { x0, x1, z0, z1 } = hollowCreek.ISLAND;
  function spawnLeaf(): void {
    let l = leaves.find((q) => q.life <= 0);
    if (!l) {
      if (leaves.length >= 60) return;
      const m = new THREE.Mesh(leafGeo, (mats[leaves.length % mats.length] as THREE.MeshLambertMaterial).clone());
      d.stage.scene.add(m);
      l = { m, vy: 0, ph: 0, life: 0, ground: 0 };
      leaves.push(l);
    }
    const x = x0 + 4 + d.rnd() * (x1 - x0 - 8);
    const z = z0 + 4 + d.rnd() * (z1 - z0 - 8);
    l.ground = hollowCreek.groundY(x, z) + 0.04;
    l.m.position.set(x, l.ground + 3 + d.rnd() * 3, z);
    l.vy = 0.5 + d.rnd() * 0.4;
    l.ph = d.rnd() * 6;
    l.life = 9;
    l.m.visible = true;
    (l.m.material as THREE.MeshLambertMaterial).opacity = 1;
  }
  function updateLeaves(s: GameState, dt: number): void {
    const autumn = s.season === 'early_autumn';
    const windy = s.weather === 'wind';
    if (autumn && dt > 0) {
      leafT -= dt;
      if (leafT <= 0) {
        leafT = windy ? 0.12 : 0.45;
        spawnLeaf();
      }
    }
    const drift = windy ? 1.6 : 0.4;
    for (const l of leaves) {
      if (l.life <= 0) continue;
      l.life -= dt;
      const p = l.m.position;
      if (p.y > l.ground) {
        l.ph += dt * 3;
        p.y = Math.max(l.ground, p.y - l.vy * dt);
        p.x += (Math.sin(l.ph) * 0.6 + drift) * dt;
        p.z += Math.cos(l.ph * 0.7) * 0.4 * dt;
        l.m.rotation.set(Math.sin(l.ph) * 0.6, l.ph, Math.cos(l.ph) * 0.4);
      }
      if (l.life < 1.5) (l.m.material as THREE.MeshLambertMaterial).opacity = Math.max(0, l.life / 1.5);
      if (l.life <= 0) l.m.visible = false;
    }
  }

  let cur: GameState | null = null;
  let check = 0;
  return {
    update(s, dt) {
      cur = s;
      check -= dt;
      if (check <= 0) {
        check = 0.5;
        COURTS.forEach((c, i) => {
          const want = courtWanted(s, c, i);
          if (want && !playing[i]) startCourt(s, i);
          else if (!want && playing[i]) stopCourt(i);
        });
        syncWalkers(s);
      }
      updateLeaves(s, dt);
    },
    reset() {
      COURTS.forEach((_, i) => {
        stopCourt(i);
      });
      for (const w of walkers) {
        w.on = false;
        w.p.clearMoves();
        w.p.root.visible = false;
      }
      check = 0;
    },
  };
}
