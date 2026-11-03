import {
  type CourtFrame,
  Custom,
  type DrawContext,
  EAST,
  type IsoWorld,
  type Person,
  type Scheduler,
  type Site,
  WEST,
} from '@td/iso';
import { clamp, type XZ } from '@td/shared';
import type { GameState } from '@td/sim';

/**
 * 园区的"日常"（准则 6：玩家不操作时世界照样在动）：
 * - 会员自己来打球：营业时间、不下雨、场地能用、没被活动占着时，一对一对地上场。人数跟着会员数和时段走，
 *   修好一块场地，那块场地上就开始有人打球（ADR 0015：修好就是解锁，画面也活过来）。
 * - 路人在修好的地方之间走来走去，会员越多人越多。
 * - 风沙：刮风天和春天的风季，沙子贴着地面吹过去。
 * - 等着的客人：有需求的岗位到了时段，有人在岗就有一位客人在跟他办事；没人在岗，客人就在那儿干等、摊手
 *   （和 HUD 上"有 N 处客人在等"是同一件事，只是画在场景里）。
 *
 * 只读模拟状态。谁在不在场按"哪天、哪个两小时段、哪块场地"算一个固定的值，同一时段里不会忽有忽无。
 */

interface Court {
  anchor: string;
  frame: CourtFrame;
}

const SAND = ['#e2c597', '#d9b98a', '#cfae7e', '#e8d0a6'];

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
  world: IsoWorld;
  site: Site;
  /** 这个地点现在有几块能打的场地（看设施状态） */
  courtsAt: (s: GameState, anchor: string) => number;
  sched: Scheduler;
  rnd: () => number;
  /** 一个藏着的路人（每个号码一个人） */
  person: (i: number) => Person;
  rally: (a: Person, b: Person, o?: { speed?: number; miss?: number }) => { stop(): void };
  /** 这块场地正被活动演出占着 */
  busy: (anchor: string) => boolean;
  /** 此刻有需求的岗位（按地点合并）：有没有人在接待、没接待的有几处 */
  waiting?: (s: GameState) => readonly { anchor: string; served: boolean; unserved: number }[];
}

export interface Life {
  update(s: GameState, dt: number): void;
  /** 读档、换内容之后全部重排 */
  reset(): void;
}

export function createLife(d: LifeDeps): Life {
  const { site } = d;
  const COURTS: Court[] = Object.entries(site.courts).flatMap(([anchor, frames]) =>
    frames.map((frame) => ({ anchor, frame })),
  );
  const SPOTS = Object.keys(site.stands);
  /** 一个地点上第 k 块场地能不能打 */
  const open = (s: GameState, c: Court) => {
    const k = (site.courts[c.anchor] ?? []).indexOf(c.frame);
    return k < d.courtsAt(s, c.anchor) ? 1 : 0;
  };
  /** 路人只去开着的地方（有场地能打的、或者设施修好了的），再加大门和停车场 */
  const spotOpen = (s: GameState, a: string) =>
    a === 'entrance' || a === 'parking' || d.courtsAt(s, a) > 0 || s.facilities[a] === 'open';

  /* ---------- 来打球的会员 ---------- */
  const players = COURTS.map((_, i) => [d.person(i * 2), d.person(i * 2 + 1)] as const);
  const playing: ({ stop(): void } | null)[] = COURTS.map(() => null);

  function courtWanted(s: GameState, c: Court, i: number): boolean {
    const draw = open(s, c);
    if (!draw || d.busy(c.anchor)) return false;
    if (s.weather === 'rain') return false;
    const min = s.t % 1440;
    if (min < 7 * 60 || min > 20 * 60) return false;
    const day = Math.floor(s.t / 1440);
    const block = Math.floor(min / 120);
    const members = s.stats.members ?? 0;
    const weekend = day % 7 >= 5 ? 0.2 : 0;
    const p = clamp(members / 40 + weekend, 0.15, 0.9) * draw;
    return hash01(day, block, i) < p;
  }

  function startCourt(i: number): void {
    const c = COURTS[i] as Court;
    const [a, b] = players[i] as readonly [Person, Person];
    const pa = c.frame.w({ x: -9.5, z: 0 });
    const pb = c.frame.w({ x: 9.5, z: 0 });
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
  const walkers = [0, 1, 2, 3].map((k) => ({
    p: d.person(COURTS.length * 2 + k),
    on: false,
    at: 'entrance' as string,
  }));

  function walkOn(w: (typeof walkers)[number], s: GameState): void {
    const choices = SPOTS.filter((x) => x !== w.at && spotOpen(s, x));
    const to = choices[Math.floor(d.rnd() * choices.length)] ?? 'entrance';
    const line = site.routeLine(w.at, to) ?? [site.stands[to] as XZ];
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
    const members = s.stats.members ?? 0;
    const want = !open ? 0 : clamp(Math.round(members / 20) - (s.weather === 'rain' ? 1 : 0), 0, walkers.length);
    walkers.forEach((w, k) => {
      const on = k < want;
      if (on === w.on) return;
      w.on = on;
      w.p.clearMoves();
      if (on) {
        const from = d.rnd() < 0.5 ? 'entrance' : 'parking';
        const at = site.stands[from] as XZ;
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

  /* ---------- 等着的客人 ---------- */
  const guests = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => ({
    p: d.person(COURTS.length * 2 + 4 + k),
    slot: '',
    next: 0,
    mood: 'wait' as 'wait' | 'served',
  }));
  function syncGuests(s: GameState): void {
    const want: { key: string; at: XZ; face: XZ; mood: 'wait' | 'served' }[] = [];
    const members = s.stats.members ?? 0;
    for (const x of d.waiting?.(s) ?? []) {
      const st = site.stands[x.anchor];
      if (!st) continue;
      const fr = site.courts[x.anchor]?.[0];
      const c = fr ? { x: fr.ox, z: fr.oz } : (site.anchors[x.anchor] ?? st);
      const L = Math.hypot(c.x - st.x, c.z - st.z) || 1;
      const ux = (c.x - st.x) / L;
      const uz = (c.z - st.z) / L;
      // 有人接待：一位客人站在员工跟前；没人接待：几位客人隔几步排着（会员越多人越多）
      if (x.served)
        want.push({ key: `${x.anchor}:s`, at: { x: st.x - uz * 1.6, z: st.z + ux * 1.6 }, face: st, mood: 'served' });
      const n = x.unserved ? Math.min(3, x.unserved + (members >= 15 ? 1 : 0) + (members >= 40 ? 1 : 0)) : 0;
      for (let k = 0; k < n; k++) {
        const side = (k - (n - 1) / 2) * 1.2;
        want.push({
          key: `${x.anchor}:w${k}`,
          at: { x: st.x - ux * 2.6 - uz * (side + 2.4), z: st.z - uz * 2.6 + ux * (side + 2.4) },
          face: st,
          mood: 'wait',
        });
      }
    }
    const keys = new Set(want.map((x) => x.key));
    for (const g of guests)
      if (g.slot && !keys.has(g.slot)) {
        g.slot = '';
        g.p.clearMoves();
        g.p.root.visible = false;
      }
    for (const x of want) {
      if (guests.some((g) => g.slot === x.key)) continue;
      const g = guests.find((q) => !q.slot);
      if (!g) break;
      g.slot = x.key;
      g.mood = x.mood;
      g.next = 0;
      g.p.clearMoves();
      g.p.pos.x = x.at.x;
      g.p.pos.z = x.at.z;
      g.p.base = 'relaxed';
      g.p.lock = null;
      g.p.seatY = null;
      g.p.idleFace = Math.atan2(x.face.x - x.at.x, x.face.z - x.at.z);
      g.p.yaw = g.p.idleFace;
      g.p.root.visible = true;
    }
  }
  function animGuests(): void {
    const now = d.sched.now;
    for (const g of guests) {
      if (!g.slot || now < g.next) continue;
      g.next = now + 2 + d.rnd() * 2.5;
      const pool =
        g.mood === 'served' ? (['talk', 'hand', 'point'] as const) : (['shrug', 'facepalm', 'shrug', 'hand'] as const);
      g.p.gesture(pool[Math.floor(d.rnd() * pool.length)] ?? 'shrug', now, 1.4);
    }
  }

  /* ---------- 风沙：贴着地面吹过去的沙粒（一粒一个像素点的 Custom 节点） ---------- */
  const leaves: { m: Custom; c: string; vy: number; ph: number; life: number; ground: number }[] = [];
  let leafT = 0;
  const { x0, x1, z0, z1 } = site.bounds;
  /** 一粒沙：1×1 缓冲像素（拉近时按精灵档位放大）；快消失时隔帧闪掉（像素版不做半透明） */
  const grain = (l: { c: string; life: number }) =>
    new Custom(
      (r: DrawContext, self: Custom) => {
        if (l.life < 1.5 && Math.floor(r.t * 12) % 3 === 0) return;
        const m = self.matrixWorld;
        const [sx, sy] = r.P(m[9] as number, m[10] as number, m[11] as number);
        const n = Math.max(1, r.spriteScale);
        r.rect(Math.round(sx), Math.round(sy), n, n, r.col(l.c));
      },
      { x0: -0.15, x1: 0.15, y0: 0, y1: 0.1, z0: -0.15, z1: 0.15 },
    );
  function spawnLeaf(): void {
    let l = leaves.find((q) => q.life <= 0);
    if (!l) {
      if (leaves.length >= 120) return;
      const rec = { c: SAND[leaves.length % SAND.length] as string, vy: 0, ph: 0, life: 0, ground: 0 };
      const m = grain(rec);
      d.world.scene.add(m);
      l = Object.assign(rec, { m });
      leaves.push(l);
    }
    const x = x0 + 4 + d.rnd() * (x1 - x0 - 8);
    const z = z0 + 4 + d.rnd() * (z1 - z0 - 8);
    l.ground = site.groundY(x, z) + 0.04;
    l.m.position.set(x, l.ground + 0.3 + d.rnd() * 1.2, z);
    l.vy = 0.15 + d.rnd() * 0.2;
    l.ph = d.rnd() * 6;
    l.life = 9;
    l.m.visible = true;
  }
  function updateLeaves(s: GameState, dt: number): void {
    const windy = s.weather === 'wind';
    const season = s.season === 'spring';
    if ((windy || season) && dt > 0) {
      leafT -= dt;
      if (leafT <= 0) {
        leafT = windy ? 0.05 : 0.3;
        spawnLeaf();
      }
    }
    const drift = windy ? 6 : 2.5;
    for (const l of leaves) {
      if (l.life <= 0) continue;
      l.life -= dt;
      const p = l.m.position;
      if (p.y > l.ground) {
        l.ph += dt * 3;
        p.y = Math.max(l.ground, p.y - l.vy * dt);
        p.x += (Math.sin(l.ph) * 0.6 + drift) * dt;
        p.z += Math.cos(l.ph * 0.7) * 0.4 * dt;
      }
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
          if (want && !playing[i]) startCourt(i);
          else if (!want && playing[i]) stopCourt(i);
        });
        syncWalkers(s);
        syncGuests(s);
      }
      if (dt > 0) animGuests();
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
      for (const g of guests) {
        g.slot = '';
        g.p.clearMoves();
        g.p.root.visible = false;
      }
      check = 0;
    },
  };
}
