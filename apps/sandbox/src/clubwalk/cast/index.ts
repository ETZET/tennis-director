// clubwalk 的人物：把场景里的人对上演员表（bind.ts）、走近了头顶有名字小牌、点人 → 总监走过去 → 人物卡片（card.ts）、
// HUD 上的"名册"（roster.ts）、游戏时钟（1 秒 = 1 游戏分钟，?castspeed= 调；7:00–22:00，过了 22:00 进下一天重新选角）、
// 存档（save.ts，localStorage 'td-cast-v1'，?castreset=1 清掉）。?cast=0 整个关掉（main.ts 里判断）。
//
// 接进 main.ts（三行）：
//   const cast = params.get('cast') === '0' ? null : mountCast({ scene, lives, play, director, params, mats: dirKit.mats, scheme });
//   step() 的循环里 cast?.step(DT)；frame() 里 render 之后 cast?.frame()。
// 调试：window.__cast（state、open(id)、roster()、nextDay()、bound()…）。
import * as THREE from 'three';
import { act, activityOf, CAST, CLOSE, clockText, initState, memOf, OPEN, thought, tick } from '../../clubsite/cast';
import type { ActionId, ActResult, CastPerson, CastState } from '../../clubsite/cast/types';
import { SCENE_NAME } from '../../clubsite/cast/types';
import { createDresser } from '../../clubsite/people/dress';
import type { Play } from '../../clubsite/play';
import { Binder, type Bound, headHeight, type LiveLike } from './bind';
import { createCard } from './card';
import type { CastCtx, NowInfo } from './ctx';
import { accentMid } from './portrait';
import { createRoster } from './roster';
import { loadState, saveState } from './save';
import { injectCastCss } from './style';
import { ACTIVITY_NAME, TXT } from './text';

export type { LiveLike } from './bind';

type DresserOpts = Parameters<typeof createDresser>[0];

export interface MountCastOpts {
  scene: THREE.Scene;
  lives: readonly LiveLike[];
  play: Play;
  director: THREE.Object3D;
  params: URLSearchParams;
  /** 换装用的材质库（clubsite/people/dress.ts） */
  mats: DresserOpts['mats'];
  /** 配色方案（dress.ts 按它调色） */
  scheme: DresserOpts['scheme'] | undefined;
}

export interface CastMount {
  step(dt: number): void;
  frame(): void;
}

/** 互动点：总监多近才给人注册（米） */
const INTERACT_R = 18;
/** 当面：总监离他多近（米，水平） */
const NEAR = 3.2;
/** 名字小牌：多近、最多几个 */
const TAG_R = 6;
const TAG_N = 3;

export function mountCast(o: MountCastOpts): CastMount {
  injectCastCss();
  const { play, director, params } = o;
  const speed = params.has('castspeed') ? Number(params.get('castspeed')) || 1 : 1;
  let state: CastState = loadState(params, () => initState(CAST, CAST.seed));
  let saveT = 10;

  const dresser = (() => {
    try {
      return createDresser({ mats: o.mats, scheme: o.scheme ?? null });
    } catch (e) {
      console.warn('[cast] no dresser', e);
      return null;
    }
  })();
  const binder = new Binder(o.lives, director, (scene, slot, kind, day) => CAST.who(scene, slot, kind, day), dresser);

  // ── 界面 ──
  const ui = document.createElement('div');
  ui.className = 'cast-ui';
  document.body.appendChild(ui);
  const tagsEl = document.createElement('div');
  tagsEl.className = 'cast-tags cast-ui';
  document.body.appendChild(tagsEl);
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'cast-open cast-pbtn';
  openBtn.innerHTML = `<b>${TXT.rosterBtn}</b><small></small>`;
  ui.appendChild(openBtn);
  const clockEl = openBtn.querySelector('small') as HTMLElement;

  const listeners = new Set<() => void>();
  const changed = () => {
    for (const f of listeners) f();
  };

  const tv = new THREE.Vector3();
  const dirPos = () => director.position;
  const flatDist = (b: Bound) => {
    b.obj.getWorldPosition(tv);
    return Math.hypot(tv.x - dirPos().x, tv.z - dirPos().z);
  };

  const ctx: CastCtx = {
    cast: CAST,
    state: () => state,
    person: (id) => CAST.get(id),
    mem: (id) => memOf(state, id, CAST.get(id)),
    bound: (id) => binder.objOf(id),
    near: (id) => {
      const b = binder.objOf(id);
      return !!b && flatDist(b) <= NEAR;
    },
    nowOf: (id) => nowOf(id),
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    openCard: (id, list) => card.open(id, list),
    openRoster: () => roster.open(),
    walkTo: (id) => walkTo(id),
    doAct: (id, a) => doAct(id, a),
    nextDay: () => {
      // 跳到第二天早上 8 点（tick 过夜：说话次数清零、心情回落）
      advance(CLOSE - state.minute + (8 * 60 - OPEN), true);
      play.toast(TXT.nextDayToast(state.day), 2.2);
    },
    clock: () => clockText(state),
  };

  const roster = createRoster(ctx, ui);
  const card = createCard(ctx, ui);
  const panelOpen = () => roster.isOpen() || card.isOpen();

  openBtn.addEventListener('click', () => roster.open());

  // 面板开着：键盘别让总监走（输入框照常打字）；Esc 关掉最上面的
  addEventListener(
    'keydown',
    (e) => {
      if (!panelOpen()) return;
      if (e.code === 'Escape') {
        if (card.isOpen()) card.close();
        else roster.close();
        e.preventDefault();
      }
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
      e.stopImmediatePropagation();
    },
    { capture: true },
  );

  // ── 现在在哪儿、干什么 ──
  function nowOf(id: string): NowInfo {
    const p = CAST.get(id);
    const b = binder.objOf(id);
    const homes = CAST.where(id, state.day);
    if (!p) return { here: false, scene: null, activity: 'idle', text: TXT.notHereToday, thought: '' };
    if (b) {
      const ud = b.obj.userData;
      const pose = (ud.poseName?.() as string | undefined) ?? 'idle';
      const prop = (ud.prop?.() as string | null | undefined) ?? null;
      const activity = activityOf(pose, prop);
      const sceneName = SCENE_NAME[b.scene];
      const salt = Math.floor(state.minute / 20) + state.day * 97;
      return {
        here: true,
        scene: b.scene,
        activity,
        text: TXT.nowAt(sceneName, ACTIVITY_NAME[activity]),
        thought: thought(p, memOf(state, id, p), activity, sceneName, salt),
      };
    }
    if (homes.length) {
      const names = [...new Set(homes.map((h) => SCENE_NAME[h.scene]))].join('、');
      return { here: true, scene: homes[0].scene, activity: 'idle', text: TXT.offScreen(names), thought: '' };
    }
    return { here: false, scene: null, activity: 'idle', text: TXT.notHereToday, thought: '' };
  }

  // ── 时钟 ──
  let minAcc = 0;
  /** 推进游戏时钟；过了 22:00 tick 自己进下一天（7:00）→ 重新选角、重新换装 */
  function advance(minutes: number, quiet = false) {
    if (minutes <= 0) return;
    const day0 = state.day;
    state = tick(state, minutes);
    if (state.day !== day0) {
      saveState(state);
      binder.step(0, state.day, true);
      if (!quiet) play.toast(TXT.newDayToast(state.day), 2.2);
      changed();
    }
  }

  // ── 互动 ──
  function doAct(id: string, a: ActionId): ActResult {
    const p = CAST.get(id) as CastPerson;
    const b = binder.objOf(id);
    const near = !!b && flatDist(b) <= NEAR;
    const now = nowOf(id);
    const r = act(state, p, a, { near, activity: now.activity, scene: b?.scene ?? null });
    state = r.state;
    const res = r.result;
    if (res.ok) {
      advance(res.minutes);
      saveState(state);
      if (b) {
        b.obj.getWorldPosition(tv);
        if (near) {
          play.busy({
            name: 'cast-talk',
            dur: Math.min(3, Math.max(0.8, res.minutes * 0.6)),
            pose: 'idle',
            face: [tv.x, tv.z],
          });
          lookAtDirector(b);
        }
        if (res.line) play.say(b.obj, res.line, 3.2, headHeight(b.kind) + 0.3);
      }
    }
    changed();
    return res;
  }

  let looking: Bound | null = null;
  const dirHead = new THREE.Vector3();
  function lookAtDirector(b: Bound) {
    if (looking && looking !== b) looking.obj.userData.lookAt?.(null);
    looking = b;
    director.getWorldPosition(dirHead);
    dirHead.y += 1.6;
    b.obj.userData.lookAt?.(dirHead);
  }

  // ── 走过去（卡片里"走过去"；到了自动打开卡片，当面） ──
  /** far = 他在还没建好的区域里：先往那个区域走，看得见他了再走到他跟前 */
  let pending: { id: string; tries: number; t: number; tx: number; tz: number; far: boolean } | null = null;
  function walkTo(id: string): boolean {
    const b = binder.objOf(id);
    if (b && flatDist(b) <= NEAR) {
      openNear(id, b);
      return true;
    }
    card.close();
    roster.close();
    const ok = b ? planNear(b) : planScene(id);
    if (!ok) {
      play.toast(TXT.cantReach);
      return false;
    }
    if (b) b.obj.getWorldPosition(tv);
    pending = { id, tries: 0, t: 0, tx: b ? tv.x : 0, tz: b ? tv.z : 0, far: !b };
    return true;
  }
  function planNear(b: Bound): boolean {
    b.obj.getWorldPosition(tv);
    const dx = dirPos().x - tv.x;
    const dz = dirPos().z - tv.z;
    const a0 = Math.atan2(dz, dx);
    for (const r of [1.3, 2.2]) {
      for (let k = 0; k < 8; k++) {
        const a = a0 + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI) / 4;
        if (play.walkTo(tv.x + Math.cos(a) * r, tv.z + Math.sin(a) * r)) return true;
      }
    }
    return false;
  }
  /** 他今天在的区域还没建（画面外）：往那个区域里离总监近的能站的点走 */
  function planScene(id: string): boolean {
    const d = dirPos();
    for (const h of CAST.where(id, state.day)) {
      const rects = o.lives.find((l) => l.def.id === h.scene)?.def.rects;
      if (!rects) continue;
      const pts: [number, number][] = [];
      for (const r of rects)
        for (let i = 1; i < 4; i++)
          for (let j = 1; j < 4; j++) pts.push([r.x0 + ((r.x1 - r.x0) * i) / 4, r.z0 + ((r.z1 - r.z0) * j) / 4]);
      pts.sort((a, b) => Math.hypot(a[0] - d.x, a[1] - d.z) - Math.hypot(b[0] - d.x, b[1] - d.z));
      for (const [x, z] of pts.slice(0, 12)) if (play.walkTo(x, z)) return true;
    }
    return false;
  }
  function stepPending(dt: number) {
    if (!pending) return;
    pending.t += dt;
    const b = binder.objOf(pending.id);
    if (!b) {
      if (!pending.far || !play.pathLeft()) {
        if (pending.far) play.toast(TXT.cantReach);
        pending = null;
      }
      return;
    }
    if (pending.far) {
      // 看得见他了：改成走到他跟前
      pending.far = false;
      pending.t = 1;
      pending.tx = Number.POSITIVE_INFINITY;
    }
    const d = flatDist(b);
    if (d <= NEAR - 0.4 || (d <= NEAR && !play.pathLeft())) {
      const id = pending.id;
      pending = null;
      if (play.pathLeft()) play.walkTo(dirPos().x, dirPos().z); // 停下
      openNear(id, b);
      return;
    }
    // 玩家自己拿摇杆走了：不跟他抢
    if (!play.pathLeft() && play.state().speed > 0.1 && pending.t > 0.3) {
      pending = null;
      return;
    }
    // 他走开了（或者路走完了还没到）：重新规划，最多几次
    b.obj.getWorldPosition(tv);
    const moved = !(Math.hypot(tv.x - pending.tx, tv.z - pending.tz) <= 1.2);
    if ((!play.pathLeft() && pending.t > 0.3) || moved) {
      if (++pending.tries > 5 || !planNear(b)) {
        pending = null;
        play.toast(TXT.cantReach);
        return;
      }
      pending.tx = tv.x;
      pending.tz = tv.z;
      pending.t = 0;
    }
  }
  function openNear(id: string, b: Bound) {
    b.obj.getWorldPosition(tv);
    if (!play.isBusy()) play.busy({ name: 'cast-face', dur: 0.25, pose: 'idle', face: [tv.x, tv.z] });
    lookAtDirector(b);
    card.open(id, nearList());
  }
  /** 从场景里点开时，◀ ▶ 在附近的人里切换（按远近） */
  function nearList(): string[] {
    return [...binder.bound]
      .filter((b) => b.d2 < INTERACT_R * INTERACT_R)
      .sort((a, b) => a.d2 - b.d2)
      .map((b) => b.id)
      .filter((id, i, a) => a.indexOf(id) === i);
  }

  // ── 场景里点人：附近的人注册互动点 ──
  const inters = new Map<string, { obj: THREE.Object3D; at: THREE.Vector3; h: number; remove: () => void }>();
  function refreshInters() {
    const keep = new Set<string>();
    for (const b of binder.bound) {
      if (b.d2 > INTERACT_R * INTERACT_R) continue;
      const iid = `cast:${b.id}`;
      if (keep.has(iid)) continue;
      const best = binder.objOf(b.id);
      if (best && best.obj !== b.obj) continue;
      keep.add(iid);
      const cur = inters.get(iid);
      if (cur && cur.obj === b.obj) continue;
      cur?.remove();
      const p = CAST.get(b.id);
      const name = p?.name ?? '?';
      const at = new THREE.Vector3();
      const h = Math.max(0.9, headHeight(b.kind) - 0.55);
      b.obj.getWorldPosition(at);
      at.y += h;
      const id = b.id;
      const remove = play.add({
        id: iid,
        at: () => at,
        radius: 2,
        priority: -1,
        label: TXT.talkTo(name.split(' ')[0]),
        autoUse: true,
        canUse: () => !panelOpen(),
        onUse: () => {
          const bb = binder.objOf(id);
          if (bb) openNear(id, bb);
        },
      });
      inters.set(iid, { obj: b.obj, at, h, remove });
    }
    for (const [k, v] of inters)
      if (!keep.has(k)) {
        v.remove();
        inters.delete(k);
      }
  }
  function updateInterPos() {
    for (const v of inters.values()) {
      v.obj.getWorldPosition(v.at);
      v.at.y += v.h;
    }
  }

  // 点屏幕上的人：直接走到"他"跟前（play 的 autoUse 只认离总监最近的那个互动点，排队的人挤在一起时会点错人）。
  // 点到的地方离某个人的互动点 ≤ 30 像素就是点他；不然照常（地面、场景里的活）
  const origTap = play.tapScreen.bind(play);
  play.tapScreen = (x, y, W, H) => {
    if (!play.isBusy() && !panelOpen()) {
      let best = '';
      let bd = 30;
      for (const [iid, v] of inters) {
        const sp = play.project(v.at, W, H);
        const d = Math.hypot(sp.x - x, sp.y - y);
        if (d < bd) {
          bd = d;
          best = iid.slice(5);
        }
      }
      if (best && walkTo(best)) return;
    }
    origTap(x, y, W, H);
  };

  // ── 名字小牌 ──
  const tagEls: HTMLDivElement[] = [];
  const tagKey: string[] = [];
  for (let i = 0; i < TAG_N; i++) {
    const d = document.createElement('div');
    d.className = 'cast-tag';
    d.hidden = true;
    d.innerHTML = '<i></i><span></span>';
    tagsEl.appendChild(d);
    tagEls.push(d);
    tagKey.push('');
  }
  const cands: { b: Bound; d: number; p: THREE.Vector3 }[] = [];
  const tagPos: THREE.Vector3[] = Array.from({ length: 24 }, () => new THREE.Vector3());
  function drawTags() {
    cands.length = 0;
    if (!panelOpen()) {
      let k = 0;
      const seen = new Set<string>();
      for (const b of binder.bound) {
        if (b.d2 > 12 * 12 || k >= tagPos.length || seen.has(b.id)) continue;
        if (!b.obj.visible) continue;
        const p = b.obj.getWorldPosition(tagPos[k]);
        const d = Math.hypot(p.x - dirPos().x, p.z - dirPos().z);
        if (d > TAG_R) continue;
        seen.add(b.id);
        p.y += headHeight(b.kind) + 0.12;
        cands.push({ b, d, p });
        k++;
      }
      cands.sort((a, b) => a.d - b.d);
    }
    const w = innerWidth;
    const h = innerHeight;
    for (let i = 0; i < TAG_N; i++) {
      const el = tagEls[i];
      const c = cands[i];
      if (!c) {
        el.hidden = true;
        continue;
      }
      const p = CAST.get(c.b.id);
      if (!p) {
        el.hidden = true;
        continue;
      }
      const met = memOf(state, p.id, p).met;
      const key = `${p.id}|${met}`;
      if (tagKey[i] !== key) {
        tagKey[i] = key;
        (el.firstChild as HTMLElement).style.background = accentMid(p.look);
        (el.lastChild as HTMLElement).textContent = p.name.split(' ')[0];
        el.classList.toggle('unmet', !met);
        tagW[i] = 0;
      }
      const s = play.project(c.p, w, h);
      // 排队的人一个挨一个：和已经摆好的小牌重叠就往上挪
      const tw = (tagW[i] ||= el.offsetWidth || 60);
      let y = Math.round(s.y);
      for (let k = 0; k < placed.length; k++) {
        const q = placed[k];
        if (Math.abs(q.x - s.x) < (q.w + tw) / 2 + 2 && Math.abs(q.y - y) < TAG_H + 2) {
          y = q.y - TAG_H - 2;
          k = -1;
        }
      }
      placed.push({ x: s.x, y, w: tw });
      el.hidden = s.x < -40 || s.x > w + 40 || y < -20 || y > h + 20;
      el.style.transform = `translate(${Math.round(s.x)}px, ${y}px) translate(-50%, -100%)`;
    }
    placed.length = 0;
  }
  const TAG_H = 15;
  const tagW: number[] = [];
  const placed: { x: number; y: number; w: number }[] = [];

  // 走开了：卡片里当面的按钮要变；看着总监的人转回去
  let nearT = 0;
  let lastClock = '';

  const mount: CastMount = {
    step(dt) {
      binder.step(dt, state.day);
      // 时钟：1 秒 = speed 游戏分钟
      minAcc += dt * speed;
      if (minAcc >= 1) {
        const m = Math.floor(minAcc);
        minAcc -= m;
        advance(m);
      }
      nearT -= dt;
      if (nearT <= 0) {
        nearT = 0.5;
        refreshInters();
        if (looking && (!card.isOpen() || flatDist(looking) > NEAR + 2)) {
          looking.obj.userData.lookAt?.(null);
          looking = null;
        }
        card.tickNear();
      }
      updateInterPos();
      stepPending(dt);
      saveT -= dt;
      if (saveT <= 0) {
        saveT = 10;
        saveState(state);
      }
    },
    frame() {
      drawTags();
      const ct = clockText(state);
      if (ct !== lastClock) {
        lastClock = ct;
        clockEl.textContent = ct;
        roster.tickClock();
      }
    },
  };
  addEventListener('pagehide', () => saveState(state));

  (window as unknown as Record<string, unknown>).__cast = {
    ctx,
    binder,
    state: () => state,
    open: (id: string) => card.open(id),
    roster: () => roster.open(),
    close: () => {
      card.close();
      roster.close();
    },
    nextDay: ctx.nextDay,
    bound: () =>
      binder.bound.map((b) => ({ id: b.id, scene: b.scene, slot: b.slot, kind: b.kind, d: Math.sqrt(b.d2) })),
    walkTo,
    pending: () => binder.pending(),
  };
  return mount;
}
