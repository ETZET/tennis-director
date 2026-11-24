// 吃饭这一串（第一轮评审「要补的画面」1、2）：
//   摊主：有人点单 / 排队时做饭（cook，翻锅铲）或摇饮料（shake）—— 姿势在 pose.ts 按岗位给；这里管"没人就站着歇"和"递出窗口"：
//     客人点单（或窗口边等餐）的最后一下，摊主和客人一起摆 handout（隔着窗口一递一接），托盘 / 杯子在摊主手里出现、到客人手里；
//   客人：拿到了以后走去桌子（引擎的 travel，从摊位出发、下一项是吃 / 喝）→ 端着托盘走（carry）或手里拿着杯子走；
//   坐下吃：托盘放在面前的桌上（clubfood 的 food-tray，和场景里桌上那些是同一个素材），eat 姿势一口口吃、左手端杯子喝一口
//   （喝的那一下托盘上的杯子藏起来）；没有桌子的座位托盘放腿上。
// 买了什么按摊位：塔可 / 披萨 / 汉堡 / 吉事果 → 托盘（food-tray v0 / v1 / v2 / v3），喝的 → 杯子。跳时刻以后不知道买了什么的，按人哈希挑一样。
import * as THREE from 'three';
import { buildCup } from '../../../clubsite/people/props';
import type { AgentId, Place, PlaceId } from '../../../clubsite/sim/types';
import { PLACES } from '../deps';
import { VENDOR_OF_POST } from '../pose';
import { bodyOf, type FxFrame, type FxKits, type FxPart, handsMid, hashOf, inRect } from './util';

/** 摊位 → 给什么（同 clubfood/life.ts 的 gives：托盘的变体 / 杯子） */
const GIVES: Record<string, number | 'cup'> = {
  'food.taco': 0,
  'food.pizza': 1,
  'food.burger': 2,
  'food.churro': 3,
};
const givesOf = (stall: PlaceId): number | 'cup' => GIVES[stall] ?? 'cup';
/** 桌面高：餐车院子的长桌 0.76、野餐桌 0.74；会所的小圆桌按 0.74 */
const tableH = (p: Place | undefined) =>
  p?.id.startsWith('food.picnic') ? 0.74 : p?.id.startsWith('food.') ? 0.76 : 0.74;
/** 递出窗口一下多久（真实秒）：handout 一遍 1.6 秒 */
const HANDOUT_S = 1.6;
const SIP: [number, number] = [0.71, 0.97];

const placeBy = new Map<PlaceId, Place>(PLACES.map((p) => [p.id, p]));
const isCounter = (p: Place | undefined) => !!p && (p.kind === 'stall' || p.kind === 'cafe' || p.kind === 'bar');

interface Prop {
  obj: THREE.Object3D;
  kind: number | 'cup';
  /** 这一帧用上了 */
  used: boolean;
  /** 托盘自己的杯子（喝的那一下藏起来） */
  cup: THREE.Object3D | null;
}

export function createFood(scene: THREE.Scene): FxPart {
  const root = new THREE.Group();
  root.name = 'sim:fx:food';
  scene.add(root);
  /** 谁买了什么（点完单记下，吃完 / 喝完清掉） */
  const bought = new Map<AgentId, number | 'cup'>();
  /** 托盘 / 杯子：按人借用（同一个人这一帧到下一帧用同一个，不闪） */
  const held = new Map<AgentId, Prop>();
  const free: Prop[] = [];
  const v3 = new THREE.Vector3();
  /** trays / cups = 建了几个；其余是这一帧的数 */
  const st = { trays: 0, cups: 0, handouts: 0, carriers: 0, eaters: 0 };

  let made = 0;
  function take(k: FxKits, id: AgentId, kind: number | 'cup'): Prop | null {
    let p = held.get(id);
    if (p && p.kind !== kind) {
      p.obj.visible = false;
      free.push(p);
      held.delete(id);
      p = undefined;
    }
    if (!p) {
      const i = free.findIndex((q) => q.kind === kind);
      if (i >= 0) p = free.splice(i, 1)[0];
      else {
        // 新建一个托盘 ~2 毫秒：一下子看到坐满的院子时分几帧建（这一帧没轮上的下一帧再摆）
        if (made >= 2) return null;
        made++;
        let obj: THREE.Object3D;
        let cup: THREE.Object3D | null = null;
        if (kind === 'cup') {
          obj = buildCup(k.people);
          // 杯子的原点在拳头（同人手里的杯子）：杯身往前 0.1、往上 0.06
          obj.position.set(0, 0, 0);
        } else {
          obj = k.food.makeAsset('food-tray', kind).obj;
          // food-tray：最后一个网格是杯子（clothWhite，v0–v3）
          cup = obj.children[obj.children.length - 1] ?? null;
        }
        root.add(obj);
        p = { obj, kind, used: false, cup };
        if (kind === 'cup') st.cups++;
        else st.trays++;
      }
      held.set(id, p);
    }
    p.used = true;
    p.obj.visible = true;
    if (p.cup) p.cup.visible = true;
    return p;
  }

  /** 摆一个托盘：底面中心在 (x, y, z)，朝 yaw（托盘的 +z = 人的前方） */
  const putTray = (p: Prop, x: number, y: number, z: number, yaw: number) => {
    p.obj.position.set(x, y, z);
    p.obj.rotation.set(0, yaw, 0);
  };
  /** 摆一只杯子：拳头在 (x, y, z)，杯身朝 yaw 的前方（同 buildCup 的约定：杯身在拳头前 0.1） */
  const putCup = (p: Prop, at: THREE.Vector3, yaw: number) => {
    p.obj.position.copy(at);
    p.obj.rotation.set(0, yaw, 0);
  };

  /** 递出窗口：客人在 at 的最后 W 游戏分钟（W = 1.6 真实秒，最多占这一项的 45%）→ 0..1；不在这一段 = −1 */
  function handPhase(f: FxFrame, since: number, until: number): number {
    const W = Math.min(HANDOUT_S * Math.max(f.speed, 0.05), (until - since) * 0.45);
    if (W <= 0) return -1;
    const left = until - f.now;
    if (left > W || left < 0) return -1;
    return 1 - left / W;
  }

  /** 改姿势（mount 已经摆过这一帧了：这里在上面再摆一次） */
  const pose = (o: THREE.Object3D, name: string, ph: number) => o.userData.pose?.(name, ((ph % 1) + 1) % 1);

  return {
    frame(f, k) {
      for (const p of held.values()) p.used = false;
      made = 0;
      st.handouts = st.carriers = st.eaters = 0;
      const { s, actors } = f;

      // ── 摊主和点单的人 ──
      for (const [post, v] of VENDOR_OF_POST) {
        const stall = v.stall;
        const vendors = s.occupants[post] ?? [];
        const buyers = s.occupants[stall.id] ?? [];
        const queue = s.queues[stall.id] ?? [];
        // 点单的人：记下买了什么（一伙人都算：带头的点，大家一人一份）
        for (const id of buyers) {
          const a = s.agents[id];
          if (a?.doing !== 'order') continue;
          const g = givesOf(stall.id);
          if (a.party) for (const m of s.parties[a.party]?.members ?? []) bought.set(m, g);
          else bought.set(id, g);
        }
        const vid = vendors[0];
        const va = vid ? actors.get(vid) : undefined;
        const vo = bodyOf(va);
        // 正在递的那一个
        let hand: { id: AgentId; ph: number } | null = null;
        for (const id of buyers) {
          const a = s.agents[id];
          const w = a?.where;
          if (a?.doing !== 'order' || w?.kind !== 'at') continue;
          const ph = handPhase(f, w.since, w.until);
          if (ph >= 0 && (!hand || ph > hand.ph)) hand = { id, ph };
        }
        if (vo && va && inRect(f.view, va.x, va.z, 4)) {
          if (hand) pose(vo, 'handout', hand.ph);
          else if (!buyers.length && !queue.length) pose(vo, 'idle', f.rt / 3 + va.hash);
        }
        if (hand) {
          st.handouts++;
          const ca = actors.get(hand.id);
          const co = bodyOf(ca);
          if (co) pose(co, 'handout', hand.ph);
          // 东西：前半段在摊主手里，后半段在客人手里
          const from = hand.ph < 0.5 ? vo : co;
          const fa = hand.ph < 0.5 ? va : ca;
          if (from && fa) {
            const g = givesOf(stall.id);
            const p = take(k, `hand:${stall.id}`, g);
            handsMid(from, v3);
            if (p && g === 'cup') putCup(p, v3.setY(v3.y - 0.02), fa.yaw);
            else if (p) putTray(p, v3.x, v3.y - 0.06, v3.z, fa.yaw);
          }
        }
      }

      // ── 端着走、坐下吃 ──
      for (const v of f.views) {
        const a = actors.get(v.id);
        const o = bodyOf(a);
        if (!a || !o) continue;
        if (!inRect(f.view, a.x, a.z, 3)) continue;
        const w = v.where;
        if (w.kind === 'travel') {
          const g = bought.get(v.id);
          const from = placeBy.get(w.from);
          if (g === undefined || !isCounter(from)) continue;
          if (!a.moving) continue;
          st.carriers++;
          const p = take(k, v.id, g);
          if (!p) continue;
          if (g === 'cup') {
            // 杯子在右手：走路的手臂照摆，杯子跟着拳头
            const hp = o.userData.handPoint as (s: 'R' | 'L') => THREE.Vector3;
            putCup(p, hp('R'), a.yaw);
          } else {
            pose(o, 'carry', a.walkPh);
            handsMid(o, v3);
            putTray(p, v3.x, v3.y - 0.05, v3.z, a.yaw);
          }
          continue;
        }
        if (w.kind !== 'at') continue;
        const place = placeBy.get(w.at);
        if (v.doing === 'eat' && !a.moving && place && !isCounter(place)) {
          let g = bought.get(v.id);
          // 跳时刻以后不知道买了什么：按人挑一样吃的
          if (g === undefined || g === 'cup') g = Math.floor(hashOf(v.id) * 4);
          st.eaters++;
          const table = place.kind === 'table';
          const th = tableH(place);
          o.userData.setEat?.({ table: table ? th : null });
          const p = take(k, v.id, g);
          if (!p) continue;
          const fx = Math.sin(a.yaw);
          const fz = Math.cos(a.yaw);
          const base = o.position.y;
          if (table) putTray(p, a.x + fx * 0.45, base + th, a.z + fz * 0.45, a.yaw);
          else putTray(p, a.x + fx * 0.24, base + 0.52 + 0.13, a.z + fz * 0.24, a.yaw);
          // 喝的那一下：托盘上的杯子在他左手里
          const ph = (o.userData.posePhase?.() as number | undefined) ?? 0;
          if (p.cup) p.cup.visible = !(o.userData.poseName?.() === 'eat' && ph > SIP[0] && ph < SIP[1]);
        }
      }

      // 吃完、喝完（不在吃喝、也不在去吃喝的路上）：清掉买过的
      if (bought.size > 400) bought.clear();
      for (const id of bought.keys()) {
        const a = s.agents[id];
        if (!a || a.where.kind === 'away') bought.delete(id);
        else if (a.where.kind === 'at' && a.doing !== 'order' && a.doing !== 'eat' && a.doing !== 'drink')
          bought.delete(id);
      }
      // 这一帧没用上的收回来
      for (const [id, p] of held) {
        if (p.used) continue;
        p.obj.visible = false;
        free.push(p);
        held.delete(id);
      }
    },
    off() {
      for (const p of held.values()) {
        p.obj.visible = false;
        free.push(p);
      }
      held.clear();
      bought.clear();
    },
    stats() {
      return { ...st, held: held.size, bought: bought.size };
    },
  };
}
