// 分图里的人和总监的活（第三轮 · 人和活）。按图的数据驱动：读每张图摆的人（MapDef.props 里的 player / coach / kid / umpire……）
// 和摆件（前台、咖啡车、饮水点、长椅、接驳车、后门），不认图的 id —— 新加的图自动有人、有活。
//
//   人位：摆在图上的每个人对上演员表里这张图的场景（text.ts 的 CAST_SCENE）的一个人位（clubsite/cast/slots.ts），
//         名字写成 'slot:<人位>'（clubsite/castui 的绑定认它）→ 分图和内场同一个地方是同一批人。
//   来去：clubsite/life/maplife.ts。摆着的人 = 有固定位置的（到点从出口 / 接驳车 / 后门进来，走到位置上，到点走）；
//         摆成 walk 姿势的、站在柜台 / 咖啡车前面排队的 = 路过的（进来 → 排队 → 歇一会儿 → 走）；另外按人位表补几个路过的。
//   兴趣点：前台（排队签到）、咖啡车（排队、拿一杯走）、饮水点、空着的长椅。
//   活（chores.ts 式的互动点，照内场的做法：直接点场景里的东西 / 右下动作键，不开菜单）：
//         有接驳车和前台的图 —— 帮刚下车的客人把行李推到前台；有桌椅的图 —— 收客人留下的空杯。
//   找总监的人（clubsite/cast/presence.ts 的 seekersNow）：头上一个"！"，当面搭上话就算接上了。
// 随机只用种子哈希（决定画面：谁带行李、杯子放哪）；钱和好感的数在 clubsite/cast 里算。
import * as THREE from 'three';
import {
  CAST,
  type CastState,
  declareMap,
  earn,
  expireSeeks,
  guessRole,
  isFixedRole,
  matchWindows,
  type MapSlot,
  memOf,
  type PersonKind,
  resolveSeek,
  type SceneId,
  SEEK_MISS,
  SEEK_REWARD,
  SLOT_TABLE,
  seekersNow,
  slotInfo,
  visitWindows,
} from '../clubsite/cast';
import { hashOf, mulberry32 } from '../clubsite/cast/rng';
import {
  createMapLife,
  type LifeActor,
  type LifeEvent,
  type LifeGate,
  type LifePerson,
  type LifePoi,
  type LifeSpot,
  type MapLife,
} from '../clubsite/life/maplife';
import type { Play } from '../clubsite/play';
import type { BuiltMap, Kit } from './build';
import { mountChores } from './chores';
import { type LifeTextKey, lt } from './life-text';
import type { Prop } from './mapdef';
import { CAST_SCENE } from './text';

type V2 = [number, number];

/** 本地偏移按摆件的朝向转到图上（rotation.y = r：本地 +z → (sin r, cos r)） */
function off(pr: Prop, dx: number, dz: number): V2 {
  const r = pr.r ?? 0;
  const s = pr.s ?? 1;
  return [pr.x + (dx * Math.cos(r) + dz * Math.sin(r)) * s, pr.z + (-dx * Math.sin(r) + dz * Math.cos(r)) * s];
}

/** 每张图最多补几个路过的人（人位表里这个场景剩下的位置） */
const EXTRA = 6;
/**
 * 人位的提示（按摆的位置和姿势认，不按第几个）：前台后面的教练 = 前台接待；公交站 / 候车亭边的 = 坐接驳车的客人；
 * 中心球场高椅上的 = 主裁判，场上拿拍的 = 两个球员。别的按种类在人位表里顺着挑。
 */
function hintOf(pr: Prop, kind: PersonKind, scene: SceneId, props: readonly Prop[], used: Set<string>): string | undefined {
  const near = (a: string, r: number) => props.some((q) => q.a === a && Math.hypot(q.x - pr.x, q.z - pr.z) < r);
  if (kind === 'coach' && near('front-desk', 2.5)) return 'desk-clerk';
  if (kind === 'player' && (near('bus-shelter', 3.2) || near('stop-pole', 3.5))) return used.has('bus-1') ? 'bus-2' : 'bus-1';
  if (scene === 'clubstadium') {
    if (kind === 'umpire' && (pr.seat?.[0] ?? 0) > 1) return 'umpire';
    if (kind === 'player' && pr.prop === 'racket' && (pr.pose === 'serve' || pr.pose === 'ready'))
      return used.has('player-a') ? 'player-b' : 'player-a';
  }
  return undefined;
}

interface Prepared {
  map: BuiltMap;
  scene: SceneId;
  people: { obj: THREE.Object3D; slot: string; kind: PersonKind; home: LifeSpot | null; staff: boolean }[];
  pois: LifePoi[];
  gates: LifeGate[];
  /** 桌子（杯子放桌上） */
  tables: V2[];
  desk: V2 | null;
  shuttle: LifeGate | null;
}

const isPerson = (o: THREE.Object3D) => !!(o.userData.pose && o.userData.setProp);

/**
 * 建好图以后、建导航以前调：给人起人位的名字、把人从静态挡路里拿掉（他们会走）、补路过的人、找兴趣点和出入口。
 */
export function prepareLife(built: readonly BuiltMap[], kit: Kit): Prepared[] {
  return built.map((b) => {
    const scene = CAST_SCENE[b.def.id] ?? ('clubplaza' as SceneId);
    const rows = SLOT_TABLE.filter((s) => s.scene === scene);
    const used = new Set<string>();
    let fallback = 0;
    const take = (kind: PersonKind, hint?: string): string => {
      if (hint && !used.has(hint) && rows.some((r) => r.slot === hint)) {
        used.add(hint);
        return hint;
      }
      // 普通人（player）不顶员工、球员的位置；别的种类（教练、裁判、球童）就是冲着那些位置去的
      const row = rows.find((r) => r.kind === kind && !used.has(r.slot) && (kind !== 'player' || !isFixedRole(r.role)));
      const slot = row?.slot ?? `v-${kind}-${fallback++}`;
      used.add(slot);
      return slot;
    };

    // ── 兴趣点、出入口（先找：排在柜台 / 咖啡车前面的人算路过的） ──
    const pois: LifePoi[] = [];
    const gates: LifeGate[] = [];
    const tables: V2[] = [];
    let desk: V2 | null = null;
    let shuttle: LifeGate | null = null;
    const queueZones: { at: V2; dir: V2 }[] = [];
    b.def.props.forEach((pr, i) => {
      const r = pr.r ?? 0;
      if (pr.a === 'front-desk') {
        const at = off(pr, 0, 1.55);
        const d = off({ ...pr, x: 0, z: 0 }, 0, 0.85);
        desk = at;
        pois.push({
          id: `desk${i}`,
          kind: 'desk',
          spot: { x: at[0], z: at[1], yaw: r + Math.PI, pose: 'idle' },
          sec: [4, 8],
          queue: { dx: d[0], dz: d[1], n: 4 },
        });
        queueZones.push({ at, dir: d });
      } else if (pr.a === 'kiosk') {
        const at = off(pr, -0.3, 1.9);
        const d = off({ ...pr, x: 0, z: 0 }, 0.25, 0.85);
        pois.push({
          id: `kiosk${i}`,
          kind: 'queue',
          spot: { x: at[0], z: at[1], yaw: r + Math.PI, pose: 'idle' },
          sec: [5, 9],
          queue: { dx: d[0], dz: d[1], n: 4 },
          gives: 'cup',
        });
        queueZones.push({ at, dir: d });
      } else if (pr.a === 'water-station') {
        const at = off(pr, 0, 0.8);
        pois.push({
          id: `water${i}`,
          kind: 'drink',
          spot: { x: at[0], z: at[1], yaw: r + Math.PI, pose: 'drinkTap' },
          sec: [4, 7],
        });
      } else if (pr.a === 'bench') {
        for (const dx of [-0.55, 0.55]) {
          const at = off(pr, dx, 0.1);
          pois.push({
            id: `bench${i}${dx < 0 ? 'a' : 'b'}`,
            kind: 'sit',
            spot: { x: at[0], z: at[1], yaw: r, pose: 'sit' },
            sec: [14, 30],
          });
        }
      } else if (pr.a === 'patio-table') tables.push([pr.x, pr.z]);
      else if (pr.a === 'shuttle') {
        // 接驳车停在路上：人从人行道上车门那一侧上下
        shuttle = { id: 'shuttle', x: pr.x - 3.2, z: pr.z - 4, weight: 3 };
        gates.push(shuttle);
      } else if (pr.a === 'back-door') gates.push({ id: `door${i}`, x: pr.x, z: pr.z + 1, staff: true });
      else if (pr.a === 'tunnel') gates.push({ id: `tunnel${i}`, x: pr.x, z: pr.z + 2.2, staff: true });
    });
    for (const ex of b.def.exits) gates.push({ id: `exit:${ex.to}`, x: ex.at[0], z: ex.at[1] });

    // ── world 填的站位（MapDef.spots）：rest = 坐 / 歇、watch = 站着看、queue = 排队的队头、door = 进出的门、play = 打球的位置 ──
    // 摆件已经给过的地方（0.8 米以内有兴趣点）不重复；work 是总监干活的地方（chores.ts），不给客人
    const playSpots: LifeSpot[] = [];
    const hasCourt = b.def.courts.length > 0;
    for (const sp of b.def.spots ?? []) {
      const [x, z] = sp.at;
      const yaw = sp.yaw ?? 0;
      if (pois.some((p) => Math.hypot(p.spot.x - x, p.spot.z - z) < 0.8)) continue;
      if (sp.kind === 'rest')
        pois.push({
          id: `spot:${sp.id}`,
          kind: 'sit',
          spot: { x, z, yaw, pose: sp.seat !== undefined ? 'sit' : 'idle', seat: sp.seat !== undefined ? [sp.seat, 0] : null },
          sec: [14, 30],
        });
      else if (sp.kind === 'watch')
        pois.push({ id: `spot:${sp.id}`, kind: 'look', spot: { x, z, yaw, pose: 'idle' }, sec: [8, 18] });
      else if (sp.kind === 'queue')
        pois.push({
          id: `spot:${sp.id}`,
          kind: 'queue',
          spot: { x, z, yaw, pose: 'idle' },
          sec: [4, 8],
          // 队往背后排（朝 yaw 看，后面的人站在 −朝向 上）
          queue: { dx: -Math.sin(yaw) * 0.85, dz: -Math.cos(yaw) * 0.85, n: 4 },
        });
      else if (sp.kind === 'door') {
        if (!gates.some((g) => Math.hypot(g.x - x, g.z - z) < 3)) gates.push({ id: `door:${sp.id}`, x, z });
      } else if (sp.kind === 'play')
        playSpots.push({ x, z, yaw, pose: hasCourt ? 'ready' : 'idle', prop: hasCourt ? 'racket' : null });
    }

    // ── 摆着的人 ──
    const people: Prepared['people'] = [];
    for (const pl of b.placed) {
      if (!isPerson(pl.obj)) continue;
      const pr = pl.prop;
      const kind = (pl.obj.userData.personKind as PersonKind | undefined) ?? 'player';
      const slot = take(kind, hintOf(pr, kind, scene, b.def.props, used));
      pl.obj.name = `slot:${slot}`;
      const role = slotInfo(scene, slot)?.role ?? guessRole(kind);
      // 摆成走路的、站在柜台 / 咖啡车前面排队的：路过的人（没有固定位置）
      const queued =
        pr.pose === 'idle' &&
        queueZones.some((q) => {
          const dx = pr.x - q.at[0];
          const dz = pr.z - q.at[1];
          const along = dx * q.dir[0] + dz * q.dir[1];
          return along > -0.6 && along < 3.6 && Math.hypot(dx, dz) < 4.2;
        });
      const flow = pr.pose === 'walk' || queued;
      const home: LifeSpot | null = flow
        ? null
        : {
            x: pr.x,
            z: pr.z,
            y: pr.y,
            yaw: pr.r ?? 0,
            pose: pr.pose ?? 'idle',
            prop: pr.prop === undefined ? undefined : pr.prop === 'none' ? null : pr.prop,
            seat: pr.seat ?? null,
            look: pr.look ?? null,
          };
      people.push({ obj: pl.obj, slot, kind, home, staff: isFixedRole(role) });
      // 他会走：从静态挡路里拿掉（总监绕着他现在的位置走，world.ts 的 addBlocker）
      if (pr.block !== false) {
        const wx = pr.x + b.ox;
        const k = b.blocked.findIndex((s) =>
          'r' in s && !('a' in s)
            ? Math.abs(s.x - wx) < 0.03 && Math.abs(s.z - pr.z) < 0.03
            : 'x0' in s
              ? wx > s.x0 - 0.05 && wx < s.x1 + 0.05 && pr.z > s.z0 - 0.05 && pr.z < s.z1 + 0.05 && s.x1 - s.x0 < 1.6
              : false,
        );
        if (k >= 0) b.blocked.splice(k, 1);
      }
    }
    // 长椅上已经有人坐的那一头不算空座位
    for (let i = pois.length - 1; i >= 0; i--) {
      const p = pois[i];
      if (p.kind === 'sit' && people.some((q) => q.home && Math.hypot(q.home.x - p.spot.x, q.home.z - p.spot.z) < 0.5))
        pois.splice(i, 1);
    }

    // ── 补人：人位表里这个场景剩下的普通位置。先给 play 站位各一个有固定位置的人（打球的），剩下的当路过的 ──
    const spare = rows.filter(
      (r) => !used.has(r.slot) && !isFixedRole(r.role) && (r.kind === 'player' || r.kind === 'kid'),
    );
    for (const home of playSpots) {
      const i = spare.findIndex((r) => r.kind === 'player');
      if (i < 0) break;
      const row = spare.splice(i, 1)[0];
      used.add(row.slot);
      const obj = kit.makeAsset('player', people.length + 1).obj;
      obj.name = `slot:${row.slot}`;
      obj.visible = false;
      b.root.add(obj);
      obj.traverse((c) => {
        const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
        if (u) b.updaters.push(u);
      });
      people.push({ obj, slot: row.slot, kind: row.kind, home, staff: false });
    }
    // 没有出入口以外的去处（没有柜台、没有座位）的图不补：人进来没事干
    const want = pois.length ? Math.min(EXTRA, spare.length) : Math.min(2, spare.length);
    for (let i = 0; i < want; i++) {
      const row = spare[i];
      used.add(row.slot);
      const obj = kit.makeAsset(row.kind === 'kid' ? 'kid' : 'player', i + 1).obj;
      obj.name = `slot:${row.slot}`;
      obj.visible = false;
      b.root.add(obj);
      obj.traverse((c) => {
        const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
        if (u) b.updaters.push(u);
      });
      people.push({ obj, slot: row.slot, kind: row.kind, home: null, staff: false });
    }

    declareMap(
      b.def.id,
      scene,
      people.map((p): MapSlot => ({ slot: p.slot, kind: p.kind, flow: !p.home })),
    );
    return { map: b, scene, people, pois, gates, tables, desk, shuttle };
  });
}

export interface VistaLifeOpts {
  prepared: Prepared[];
  kit: Kit;
  play: Play;
  director: THREE.Object3D;
  /** 现在在哪张图 */
  cur(): BuiltMap;
  /** 游戏时钟：第几天、几分（带小数） */
  clock(): { day: number; minute: number };
  state(): CastState;
  setState(s: CastState): void;
  /** 反馈：上方一行字（带金币图标） */
  pop(text: string, icon: 'coin' | null): void;
  /** 看台坐满 / 空场跟着比赛走（false = 调试里手动切，?crowd=） */
  autoCrowd?: boolean;
}

export interface VistaLife {
  step(dt: number): void;
  /** 换到一张图那一刻：按时钟把这张图的人摆好 */
  enter(): void;
  of(id: string): MapLife | undefined;
  debug(): unknown;
}

export function mountVistaLife(o: VistaLifeOpts): VistaLife {
  const { play } = o;
  const lives = new Map<string, MapLife>();
  const preps = new Map<string, Prepared>();
  const handlers = new Map<string, ((ev: LifeEvent) => void)[]>();
  const steppers = new Map<string, ((dt: number) => void)[]>();
  const done: Record<string, number> = {};

  for (const p of o.prepared) {
    const b = p.map;
    const id = b.def.id;
    preps.set(id, p);
    const nav = {
      findPath: (ax: number, az: number, bx: number, bz: number) => {
        const path = play.nav.findPath(ax + b.ox, az, bx + b.ox, bz);
        return path ? path.map(([x, z]): [number, number] => [x - b.ox, z]) : null;
      },
      height: (x: number, z: number) => play.nav.height(x + b.ox, z),
      nearestFree: (x: number, z: number, r?: number) => {
        const q = play.nav.nearestFree(x + b.ox, z, r);
        return q ? ([q[0] - b.ox, q[1]] as [number, number]) : null;
      },
    };
    const people: LifePerson[] = p.people.map((q) => ({
      obj: q.obj,
      key: q.slot,
      home: q.home,
      staff: q.staff,
      speed: q.kind === 'kid' ? 1.5 : 1.35,
      windows: (day) => visitWindows(CAST.seed, p.scene, q.slot, day, { kind: q.kind, flow: !q.home }),
    }));
    const hs: ((ev: LifeEvent) => void)[] = [];
    handlers.set(id, hs);
    steppers.set(id, []);
    lives.set(
      id,
      createMapLife({
        id,
        seed: CAST.seed,
        people,
        pois: p.pois,
        gates: p.gates,
        nav: () => nav,
        groundAt: b.groundAt,
        clock: o.clock,
        director: o.director,
        wander: [b.def.start.at, ...Object.values(b.def.entries).map((e) => e.at)],
        on: (ev) => {
          for (const h of hs) h(ev);
        },
      }),
    );
  }

  const curLife = () => lives.get(o.cur().def.id);
  // 总监绕着在场的人走
  play.addBlocker(() => {
    const L = curLife();
    if (!L) return null;
    const ox = o.cur().ox;
    return L.circles().map((c) => ({ x: c.x + ox, z: c.z, r: c.r }));
  });

  const count = (k: string) => {
    done[k] = (done[k] ?? 0) + 1;
  };
  /** 干完一件活：钱进账 + 上方一行字 + 原地冒一个数 */
  function reward(key: LifeTextKey, money: number, at: THREE.Vector3) {
    o.setState(earn(o.state(), money));
    o.pop(lt(key, { n: money }), 'coin');
    play.say(at.clone(), `+$${money}`, 1.4, 0.5);
    count(key);
  }
  function favor(id: string, d: number) {
    const s = o.state();
    const p = CAST.get(id);
    const mem = memOf(s, id, p);
    const f = Math.round(Math.min(10, Math.max(0, mem.favor + d)) * 10) / 10;
    o.setState({ ...s, people: { ...s.people, [id]: { ...mem, favor: f, met: true } } });
  }
  const castIdOf = (a: LifeActor) => a.obj.userData.castId as string | undefined;

  // ── 活一：帮刚下接驳车的客人推行李（有接驳车、有前台的图） ──
  for (const p of o.prepared) {
    if (!p.shuttle || !p.desk) continue;
    const b = p.map;
    const id = b.def.id;
    const L = lives.get(id) as MapLife;
    const deskAt = new THREE.Vector3(p.desk[0] + b.ox, b.groundAt(p.desk[0], p.desk[1]) + 0.9, p.desk[1]);
    let job: { a: LifeActor; item: ReturnType<Play['addItem']>; t: number; taken: boolean } | null = null;
    let serial = 0;
    const rng = mulberry32(hashOf(CAST.seed, 'luggage', id));
    const end = () => {
      if (!job) return;
      play.bubble('luggage', null);
      job = null;
    };
    handlers.get(id)?.push((ev) => {
      if (ev.type !== 'spawn' || ev.gate !== p.shuttle || job || ev.actor.person.home || ev.actor.person.staff) return;
      if (o.cur() !== b || rng() > 0.6) return;
      const a = ev.actor;
      const obj = o.kit.makeAsset('suitcase', 0).obj;
      b.root.add(obj);
      const item = play.addItem({
        id: `luggage-${serial++}`,
        name: lt('suitcase'),
        obj,
        radius: 1.3,
        carryPose: 'push',
        carrySpeed: 2.2,
        grip: { at: [0, 0.89, -0.12], cart: true },
      });
      item.place(a.x + b.ox + 0.55, a.z + 0.15, 0.3);
      a.hold = true;
      a.obj.userData.pose?.('call');
      play.bubble('luggage', a.obj, lt('luggageAsk'));
      job = { a, item, t: 0, taken: false };
    });
    steppers.get(id)?.push((dt) => {
      if (!job) return;
      job.t += dt;
      const j = job;
      if (!j.taken && j.item.where === 'held') {
        // 总监接手了：客人空着手先往前台走
        j.taken = true;
        j.a.hold = false;
        j.a.obj.userData.pose?.('idle');
        play.bubble('luggage', null);
      }
      if (!j.taken && j.t > 40) {
        // 没人帮：自己拖走
        j.item.remove();
        j.a.hold = false;
        o.pop(lt('luggageGone'), null);
        end();
      } else if (j.item.where === 'gone') end();
    });
    play.add({
      id: `luggage-desk:${id}`,
      at: () => deskAt,
      radius: 2.2,
      noMark: true,
      canUse: () => o.cur() === b,
      accepts: (item) => o.cur() === b && item.id.startsWith('luggage-'),
      putLabel: lt('luggagePut'),
      onPutDown: (item) => {
        const j = job;
        item.remove();
        reward('luggageDone', 5, deskAt);
        if (j) {
          const cid = castIdOf(j.a);
          if (cid) favor(cid, 0.3);
          if (j.a.state !== 'away') play.say(j.a.obj, lt('luggageThanks'), 2.6);
        }
        end();
      },
    });
  }

  // ── 活二：收客人留下的空杯（有桌子 / 长椅的图） ──
  const cupMats = (() => {
    const ctx = o.kit.ctxFor(0);
    return { white: ctx.mat('parasolWhite'), sleeve: ctx.mat('awning') };
  })();
  function makeCup(): THREE.Object3D {
    const g = new THREE.Group();
    g.name = 'cup-left';
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.22, 8, 1), cupMats.white);
    body.position.y = 0.11;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.095, 0.09, 8, 1), cupMats.sleeve);
    band.position.y = 0.1;
    g.add(body, band);
    return g;
  }
  for (const p of o.prepared) {
    const b = p.map;
    const id = b.def.id;
    const cups = new Map<LifeSpot, { obj: THREE.Object3D; remove: () => void }>();
    let serial = 0;
    handlers.get(id)?.push((ev) => {
      if (ev.type !== 'unsit' || !ev.spot || cups.has(ev.spot) || cups.size >= 5) return;
      const u = ev.actor.obj.userData;
      if (u.prop?.() !== 'cup') return;
      // 走的时候杯子留在桌上（旁边有桌子）或者座位边上
      const s = ev.spot;
      u.setProp?.(null);
      const tb = p.tables.find((t) => Math.hypot(t[0] - s.x, t[1] - s.z) < 1.4);
      const cx = tb ? s.x + (tb[0] - s.x) * 0.62 : s.x + Math.cos(s.yaw) * 0.32;
      const cz = tb ? s.z + (tb[1] - s.z) * 0.62 : s.z - Math.sin(s.yaw) * 0.32;
      const obj = makeCup();
      obj.position.set(cx, b.groundAt(s.x, s.z) + (tb ? 0.74 : 0.5), cz);
      b.root.add(obj);
      const at = new THREE.Vector3(cx + b.ox, obj.position.y + 0.1, cz);
      const key = `cup:${id}:${serial++}`;
      const remove = play.add({
        id: key,
        at: () => at,
        radius: 1.5,
        label: lt('cupTake'),
        autoUse: true,
        canUse: () => o.cur() === b,
        onUse: (pl) =>
          pl.busy({
            name: 'cup',
            dur: 0.6,
            pose: 'pickup',
            face: [at.x, at.z],
            mid: () => {
              obj.removeFromParent();
              remove();
              cups.delete(s);
              reward('cupDone', 2, at);
            },
          }),
      });
      cups.set(s, { obj, remove });
    });
  }

  // ── 找总监的人：头上一个"！"；当面搭上话（说话次数涨了）= 接上了 ──
  let seekT = 0;
  let lastMin = o.clock().minute;
  const talks = new Map<string, number>();
  const shown = new Set<string>();
  function stepSeek() {
    const s0 = o.state();
    // 过点没接上的
    const ex = expireSeeks(CAST, s0, lastMin);
    lastMin = s0.minute;
    if (ex.missed.length) {
      o.setState(ex.state);
      for (const k of ex.missed)
        o.pop(lt('seekMissed', { name: CAST.get(k.id)?.nameZh ?? '', f: SEEK_MISS.toFixed(1) }), null);
    }
    let s = o.state();
    const now = seekersNow(CAST, s);
    // 给界面的镜像（CastState.seeking）：变了才写
    const ids = now.map((k) => k.id);
    if ((s.seeking ?? []).join() !== ids.join()) {
      s = { ...s, seeking: ids };
      o.setState(s);
    }
    const here = o.cur().def.id;
    const L = curLife();
    const live = new Set<string>();
    for (const k of now) {
      const n = memOf(s, k.id, CAST.get(k.id)).talksToday;
      const n0 = talks.get(k.id);
      if (n0 === undefined) talks.set(k.id, n);
      else if (n > n0) {
        const r = resolveSeek(CAST, o.state(), k.id);
        if (r) {
          o.setState(r.state);
          const rw = SEEK_REWARD[k.kind];
          const name = CAST.get(k.id)?.nameZh ?? '';
          o.pop(
            lt(`seekDone_${k.kind}`, { name, f: rw.favor.toFixed(1) }) + (rw.money ? lt('money', { n: rw.money }) : ''),
            rw.money ? 'coin' : null,
          );
          count(`seek_${k.kind}`);
        }
        talks.delete(k.id);
        continue;
      }
      if (k.map !== here || !L) continue;
      const a = L.actors.find((x) => x.person.key === k.slot && x.state !== 'away');
      if (!a) continue;
      live.add(k.id);
      play.bubble(`seek:${k.id}`, a.obj, lt(`seek_${k.kind}`));
      shown.add(k.id);
    }
    for (const id of shown)
      if (!live.has(id)) {
        play.bubble(`seek:${id}`, null);
        shown.delete(id);
      }
    for (const id of talks.keys()) if (!now.some((k) => k.id === id)) talks.delete(id);
  }

  // ── 站位上的活（拉网、扫场、换水、补毛巾）和练习场的捡球、补球：chores.ts ──
  const chores = mountChores({
    built: o.prepared.map((p) => p.map),
    kit: o.kit,
    play,
    director: o.director,
    cur: o.cur,
    clock: o.clock,
    reward,
  });

  // ── 看台：比赛前半小时开始进人、比赛时坐满、散场以后慢慢走空（只看时钟，换图回来也对） ──
  const fills = new Map<BuiltMap, ((f: number) => void)[]>();
  for (const p of o.prepared) {
    const list: ((f: number) => void)[] = [];
    p.map.root.traverse((x) => {
      const f = x.userData.setFill as ((f: number) => void) | undefined;
      if (f) list.push(f);
    });
    if (list.length) fills.set(p.map, list);
  }
  let lastFill = -1;
  let lastFillMap: BuiltMap | null = null;
  function crowdFill(day: number, m: number): number {
    let f = 0.08;
    for (const w of matchWindows(CAST.seed, day)) {
      if (m >= w[0] - 30 && m < w[0]) f = Math.max(f, 0.3 + ((m - (w[0] - 30)) / 30) * 0.7);
      else if (m >= w[0] && m < w[1]) f = 1;
      else if (m >= w[1] && m < w[1] + 20) f = Math.max(f, 1 - ((m - w[1]) / 20) * 0.92);
    }
    return Math.round(f * 10) / 10;
  }
  function stepCrowd() {
    if (o.autoCrowd === false) return;
    const b = o.cur();
    const list = fills.get(b);
    if (!list) return;
    const t = o.clock();
    const f = crowdFill(t.day, t.minute);
    if (f === lastFill && b === lastFillMap) return;
    lastFill = f;
    lastFillMap = b;
    for (const set of list) set(f);
  }

  return {
    step(dt) {
      chores.step(dt);
      stepCrowd();
      const id = o.cur().def.id;
      lives.get(id)?.step(dt);
      for (const f of steppers.get(id) ?? []) f(dt);
      seekT -= dt;
      if (seekT <= 0) {
        seekT = 0.5;
        stepSeek();
      }
    },
    enter() {
      curLife()?.settle();
      lastFill = -1;
      stepCrowd();
    },
    of: (id) => lives.get(id),
    debug: () => ({
      map: o.cur().def.id,
      done: { ...done },
      chores: chores.debug(),
      stats: curLife()?.stats,
      actors: curLife()?.debug(),
      pois: preps.get(o.cur().def.id)?.pois.map((p) => ({ id: p.id, kind: p.kind, x: p.spot.x, z: p.spot.z })),
      gates: preps.get(o.cur().def.id)?.gates,
      seekers: seekersNow(CAST, o.state()),
    }),
  };
}
