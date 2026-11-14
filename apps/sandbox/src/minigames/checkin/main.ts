// 小游戏 7 · 前台签到（露天前台，clubdesk）：早上的签到高峰，会员从大门一直排到柜台。总监站在柜台转角里，
// 柜台前每站定一个人，底下滑出 3–4 张会员卡（像素肖像 + 名字 + 会籍 + 今天的预约），点和他长得一样的那张。
// - 人全来自演员表（clubsite/cast 的 CAST）：会员 = 名册里有会籍的大人，按他们的 CastLook 换装（clubsite/people/dress.ts），
//   卡上的肖像按同一份 look 画（portrait.ts）—— 看衣服颜色、帽子、眼镜、发型认人。
// - 访客（今天的客人，没有卡）：四张都不是他 → 点「访客登记」。过期的月卡：点卡上的「续费」= 签到 + 续费 +150（点卡身只签到，漏了续费）。
// - VIP（named 的老会员、球星）：插队到柜台前，6 秒内要接待好，不然气走了（掉 ♥）。
// - 点错：-60、连击断、柜台前的人跺脚，排队的每个人耐心 -3 秒。队伍越长耐心掉得越快，等不及的人出大门走掉（掉 ♥，3 条命）。
// - 分：签到 100 + 连击（4.5 秒内连着签，每多连一个 +20，最多 +100）+ 续费 150 + VIP 100 − 点错 60；结算剩下的 ♥ × 80。
// 场面：场景原样（clubdesk 的 Region，日常演出关掉、它自己的排队会员藏起来），队伍由 crowd.ts 自己控。
// 总监不走动（画面上盖一层挡住拖动；导航裁到柜台转角里），签到时按铃、转身，一条毛巾飞过柜台搭到会员肩上（clubdesk/play 的毛巾）。
import '../../clubsite/render/colors';
import * as THREE from 'three';
import { CLOUDS, SPOTS } from '../../clubdesk/layout';
import { buildTowel } from '../../clubdesk/play';
import { createDeskRegion } from '../../clubdesk/scene';
import { CAST } from '../../clubsite/cast';
import type { CastPerson } from '../../clubsite/cast/types';
import { createDresser } from '../../clubsite/people/dress';
import { schemeById } from '../../clubsite/render/palettes';
import { createMats } from '../../clubsite/render/toon';
import { mountMinigame } from '../shell';
import { createCrowd, type Walker } from './crowd';
import { createPanel } from './panel';
import {
  type Action,
  type Arrival,
  buildPools,
  COMBO_WINDOW,
  cardCountAt,
  checkinPoints,
  DURATION,
  dealCards,
  drainRate,
  hardnessAt,
  judge,
  LIVES,
  MISTAKE,
  MISTAKE_PATIENCE,
  patienceAt,
  pickPerson,
  planArrivals,
  QUEUE_CAP,
  STARS,
  settle,
  UPSELL,
  VIP_BONUS,
  VIP_LIMIT,
} from './rules';

/** 演员表分池（会员、VIP、今天的客人）：一次建好 */
const POOLS = buildPools(CAST.roster(), (i) => CAST.who('clubdesk', `walkin-${i}`, 'player', 1));

/** 点对以后面板停多久再滑下去（绿一下） */
const RESOLVE_HOLD = 0.22;

mountMinigame({
  id: 'checkin',
  title: '前台签到',
  tag: '小游戏 7 · 前台',
  goal: '早高峰，会员从柜台排到了大门口。看清柜台前站着的是谁，点对他的会员卡！',
  howto: [
    '柜台前站定一位 → 底下滑出会员卡：点和他长得一样的那张（衣服、帽子、眼镜）',
    '没有他的卡 = 访客：点「访客登记」',
    '卡上「已过期」点「续费」多拿 150；金色 VIP 要 6 秒内接待',
    '点错扣分、全队更急；等不及的人会走（♥）',
  ],
  region: createDeskRegion,
  clouds: CLOUDS,
  life: false,
  hour: 8.2,
  weather: 'clear',
  start: { start: SPOTS.deskStand, yaw: 1.25 },
  // 拉近到三分之一多：人 100 来个像素高，帽子、眼镜看得清
  zoom: 0.36,
  // 竖屏：柜台和队伍在画面上半（底下 45% 是面板）；横向：画面中心定在 x 56.6 上下（总监、柜台、引导道、大门都在里面）
  camera: {
    lead: { portrait: 1.6, landscape: 1.0 },
    dead: [0.2, 0.2],
    view: { x0: 53.4, x1: 61.5, z0: -30, z1: 40 },
  },
  // 总监就站在柜台转角里
  nav: (n) => ({ ...n, bounds: { x0: 55.0, x1: 55.95, z0: 8.15, z1: 9.0 } }),
  duration: DURATION,
  stars: STARS,
  comboWindow: COMBO_WINDOW,
  setup(mg) {
    const { scene, play, region } = mg;

    // ── 场面：场景自己摆的排队会员收起来（队伍归这里管） ──
    for (const id of ['member-serve', 'member-q1', 'member-q2', 'member-q3', 'member-in', 'member-out']) {
      const o = scene.getObjectByName(`slot:${id}`);
      if (o) o.visible = false;
    }
    const counter = scene.getObjectByName('slot:desk-counter');
    const cud = (counter?.userData ?? {}) as {
      ding?: () => void;
      setTowels?: (n: number) => number;
      spots?: { towels: number[] };
    };
    cud.setTowels?.(5);
    const stack = new THREE.Vector3(55.6, 1.1, 9.4);
    if (counter && cud.spots?.towels) {
      counter.updateMatrixWorld(true);
      const t = cud.spots.towels;
      stack.copy(counter.localToWorld(new THREE.Vector3(t[0], t[1] + 0.25, t[2])));
    }

    // ── 换装：演员表的人按 CastLook 穿（材质库另建一份原始的，dress.ts 要没包过配色的 Mats） ──
    const dresser = createDresser({
      mats: createMats(mg.uniforms, () => mg.pipe.rig.metersPerTexel),
      scheme: schemeById(mg.params.get('pal')),
    });

    // ── 画面上盖一层：挡住拖动（总监不走），头顶的耐心条也画在这层里 ──
    const block = document.createElement('div');
    block.className = 'ci-block';
    document.body.appendChild(block);

    const crowd = createCrowd({
      scene,
      make: () => region.kit.makeAsset('player', 0).obj,
      dress: (obj, p) => dresser.dress(obj, p.look),
      groundAt: (x, z) => region.groundAt(x, z),
      project: (p) => mg.project(p),
      layer: block,
      rng: mg.rng('props'),
    });

    // 柜台前那块地上一圈（看这里）
    mg.ring(SPOTS.serve[0], SPOTS.serve[1], 0.55, 0xfff3d6);

    // ── 毛巾：从台面那叠飞过柜台搭到肩上 ──
    const shoulder = new THREE.Vector3(0.2, 1.22, -0.02);
    const flying: { obj: THREE.Object3D; w: Walker; t: number }[] = [];
    const handTowel = (w: Walker) => {
      const obj = buildTowel(region.kit.ctxFor(0));
      obj.scale.setScalar(0.85);
      scene.add(obj);
      flying.push({ obj, w, t: 0 });
    };
    mg.onStep((dt) => {
      for (const f of [...flying]) {
        f.t += dt / 0.45;
        const k = Math.min(1, f.t);
        if (!f.w.obj.visible) {
          f.obj.removeFromParent();
          flying.splice(flying.indexOf(f), 1);
          continue;
        }
        const to = f.w.obj.localToWorld(shoulder.clone());
        f.obj.position.lerpVectors(stack, to, k);
        f.obj.position.y += Math.sin(k * Math.PI) * 0.35;
        if (k >= 1) {
          flying.splice(flying.indexOf(f), 1);
          f.w.obj.add(f.obj);
          f.obj.position.copy(shoulder);
          f.obj.rotation.set(0, Math.PI / 2, 0.25);
          f.w.towel = f.obj;
        }
      }
      crowd.step(dt);
    });

    // ── 一局的账 ──
    let round = 0;
    let plan: Arrival[] = [];
    let planI = 0;
    let used = new Set<string>();
    let rngWho = mg.rng('who:0');
    let rngDeal = mg.rng('deal:0');
    let arrivals = 0;
    let lives = LIVES;
    let shownFor: Walker | null = null;
    let resolving: { w: Walker; at: number } | null = null;
    let turnedAway = 0;
    const tally = {
      checkins: 0,
      guests: 0,
      upsells: 0,
      missedUpsells: 0,
      vipOk: 0,
      vipTotal: 0,
      mistakes: 0,
      walkouts: 0,
      bestCombo: 0,
    };
    const headOf = (w: Walker) => new THREE.Vector3(w.x, w.obj.position.y + 2.0, w.z);

    const loseLife = () => {
      lives = Math.max(0, lives - 1);
      mg.setLives(lives, LIVES);
      if (lives <= 0) mg.finish('队伍散了！');
    };
    const showQueue = () => {
      const n = crowd.line().length;
      mg.stat('queue', '排队', n, n >= 7 ? 'warn' : null);
    };

    const arrive = (a: Arrival, opening: boolean) => {
      if (crowd.line().length >= QUEUE_CAP) {
        // 门口看一眼这么长的队就走了（不算命，提醒一下）
        turnedAway++;
        if (turnedAway === 1 || turnedAway % 4 === 0) mg.toast('队伍太长，门口有人扭头走了', 1.8);
        return;
      }
      const who: CastPerson = pickPerson(rngWho, a.kind, POOLS, used);
      const pmax = a.kind === 'vip' ? 999 : patienceAt(a.t);
      const w = crowd.spawn(arrivals++, who, a.kind, pmax, opening);
      if (a.kind === 'vip') {
        tally.vipTotal++;
        if (!opening) {
          mg.toast(`★ VIP ${who.name} 来了，插队到柜台！`, 2.2);
          play.say(w.obj, '早啊，总监！', 1.8);
        }
      }
    };

    // ── 面板 ──
    const resolve = (action: Action) => {
      const w = shownFor;
      if (!w || resolving || mg.state !== 'playing' || w.state !== 'counter') return;
      const v = judge(w.who.id, w.kind, action);
      const head = headOf(w);
      const pickedId = action.type === 'card' ? action.id : null;
      if (!v.ok) {
        tally.mistakes++;
        mg.comboBreak();
        panel.wrong(pickedId);
        mg.addScore(MISTAKE, head, { text: `${MISTAKE} ${v.line}`, color: 'red', big: true });
        crowd.fume(w, 1.2);
        for (const q of crowd.line()) if (q.kind !== 'vip') q.patience -= MISTAKE_PATIENCE;
        return;
      }
      tally.checkins++;
      if (w.kind === 'guest') tally.guests++;
      const combo = mg.comboHit();
      tally.bestCombo = Math.max(tally.bestCombo, combo);
      const pts = checkinPoints(combo);
      mg.addScore(pts, head, { text: combo >= 2 ? `+${pts} ×${combo}` : `+${pts}`, big: combo >= 4 });
      if (v.upsell) {
        tally.upsells++;
        mg.addScore(UPSELL, head.clone().setY(head.y + 0.5), { text: `续费 +${UPSELL}`, color: 'green', big: true });
      }
      if (v.missedUpsell) {
        tally.missedUpsells++;
        mg.pop(head.clone().setY(head.y + 0.5), '漏了续费', { color: 'cream' });
      }
      if (w.kind === 'vip') {
        tally.vipOk++;
        mg.addScore(VIP_BONUS, head.clone().setY(head.y + 0.9), {
          text: `VIP +${VIP_BONUS}`,
          color: 'gold',
          big: true,
        });
      }
      if (w.kind === 'guest') mg.toast(`访客登记 · ${w.who.name}`, 1.2);
      play.say(w.obj, v.line, 1.4);
      panel.right(pickedId);
      cud.ding?.();
      play.busy({ name: 'checkin', dur: 0.4, pose: 'idle', face: [w.x, w.z] });
      if (w.kind !== 'guest') handTowel(w);
      resolving = { w, at: mg.t };
    };
    const panel = createPanel({
      onCard: (id, renew) => resolve({ type: 'card', id, renew }),
      onGuest: () => resolve({ type: 'guest' }),
    });

    /** 柜台前的人走了（签完 / 气走）：面板滑下去 */
    const closeFor = (w: Walker) => {
      if (shownFor === w) {
        panel.hide();
        shownFor = null;
      }
    };

    return {
      reset() {
        round++;
        crowd.clear();
        for (const f of flying) f.obj.removeFromParent();
        flying.length = 0;
        panel.hide();
        shownFor = null;
        resolving = null;
        lives = LIVES;
        mg.setLives(lives, LIVES);
        arrivals = 0;
        turnedAway = 0;
        used = new Set();
        rngWho = mg.rng(`who:${mg.round}`);
        rngDeal = mg.rng(`deal:${mg.round}`);
        plan = planArrivals(mg.rng(`plan:${mg.round}`));
        planI = 0;
        for (const k of Object.keys(tally) as (keyof typeof tally)[]) tally[k] = 0;
        // 开局排着的几个人
        while (planI < plan.length && plan[planI].t <= 0) arrive(plan[planI++], true);
        showQueue();
      },
      start() {
        const first = crowd.line()[0];
        if (first) play.say(first.obj, '早上好！', 1.6);
      },
      step(dt) {
        const t = mg.elapsed;
        while (planI < plan.length && plan[planI].t <= t) arrive(plan[planI++], false);

        // 点对了：面板绿一下再滑下去，人搭着毛巾往小路走
        if (resolving && mg.t - resolving.at >= RESOLVE_HOLD) {
          closeFor(resolving.w);
          crowd.leave(resolving.w, true);
          resolving = null;
        }

        // 柜台前站定了新的人：发卡、滑上来
        const c = crowd.counter();
        if (c && c !== shownFor && !resolving) {
          shownFor = c;
          panel.show(dealCards(rngDeal, c.who, c.kind, POOLS.members, cardCountAt(t), hardnessAt(t)), c.kind === 'vip');
        }

        // 耐心：排着的人（VIP 不算）按队伍长短掉；等不及的出大门
        const line = crowd.line();
        const rate = drainRate(line.length);
        for (const w of line) {
          if (w.kind === 'vip' || w === resolving?.w) continue;
          w.patience -= dt * rate;
          if (w.patience <= 0) {
            tally.walkouts++;
            mg.comboBreak();
            play.say(w.obj, w.state === 'counter' ? '太慢了！' : '不等了！', 1.8);
            mg.pop(headOf(w), '走了 ♥-1', { color: 'red', big: true });
            closeFor(w);
            crowd.leave(w, false);
            loseLife();
            if (mg.state !== 'playing') return;
          }
        }
        // VIP 在柜台前等太久
        if (c && c.kind === 'vip' && c !== resolving?.w) {
          panel.vipLeft(VIP_LIMIT - c.atCounter, VIP_LIMIT);
          if (c.atCounter >= VIP_LIMIT) {
            play.say(c.obj, '我找经理去！', 1.8);
            mg.pop(headOf(c), 'VIP 走了 ♥-1', { color: 'red', big: true });
            mg.comboBreak();
            closeFor(c);
            crowd.leave(c, false);
            loseLife();
            if (mg.state !== 'playing') return;
          }
        }
        // 等急了的人偶尔嘟囔一句
        for (const w of line) {
          if (!w.grumbled && w.state !== 'leave' && w.patience / w.pmax < 0.3) {
            w.grumbled = true;
            play.say(w.obj, w.state === 'counter' ? '快点呀…' : '还要多久？', 1.6);
          }
        }
        showQueue();
      },
      frame() {
        panel.setVisible(mg.state === 'playing');
        crowd.frame(VIP_LIMIT);
      },
      finish() {
        panel.hide();
        return settle({ ...tally, lives });
      },
      debug: () => {
        const c = crowd.counter();
        return {
          lives,
          queue: crowd.line().length,
          panelUp: panel.isUp(),
          counter: c && shownFor === c ? { id: c.who.id, kind: c.kind, name: c.who.name } : null,
          cards: panel.isUp() ? panel.cards().map((k) => ({ id: k.id, expired: k.expired })) : [],
          tally: { ...tally },
          arrivals,
          turnedAway,
          round,
        };
      },
    };
  },
});
