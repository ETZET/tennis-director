// 小游戏 6 · 餐车出餐（餐车院子，clubfood）：午饭高峰，凉棚下的六张长桌坐满了人。120 秒里客人举手点单（头顶像素气泡：一样吃的 +
// 耐心条），总监去做这样东西的窗口下单 → 摊主做几秒递过来 → 端到那桌上菜。
// - 四个窗口各做一样：鲜果水车 = 冰柠檬水（1.5 秒）、塔可车 = 卷饼（3.5 秒）、咖啡车 = 冰沙（3 秒，18 秒起）、披萨车 = 窑烤披萨（5 秒，42 秒起）。
//   做得久的小费高：先去下单，趁摊主做的时候送别的（提前备餐）；做好的放 25 秒会凉（倒掉，−4）。
// - 托盘开局端一份，30 秒起端两份（端两份走慢一点）。
// - 气泡绿 → 橙 → 红：红之前送到 = 准时（小费 = 底数 + 底数 × 剩下的耐心 + 连击）；红了才到 = 迟了（没小费）；
//   等到头 = 客人不等了（差评，♥ −1，5 个差评收摊）；送错 = 客人退回（这份白做，耐心再扣两成）。
// - 标记：最急的那桌（金边气泡 + 箭头）；空手时指着做它的那个窗口。
// 场面：场景原样（clubfood 的 Region），日常演出关掉（客人由这里管：坐着的就是"我的"客人，别的都不动）；
// 三个窗口前排队的、走着的人收起来（不挡路、不定格在半步上）；桌上原来的托盘收起来，送到一份才摆一份。
import '../../clubsite/render/colors';
import * as THREE from 'three';
import { CLOUDS, TABLE, TABLE_ROWS, TRUCKS } from '../../clubfood/layout';
import { createFoodRegion } from '../../clubfood/scene';
import type { Item } from '../../clubsite/play';
import { mountMinigame } from '../shell';
import { buildCarryTray, buildDish } from './dishes';
import { createOverlay } from './overlay';
import {
  COMBO_WINDOW,
  DURATION,
  fracOf,
  ITEM_IDS,
  ITEMS,
  type ItemId,
  MAX_WALKOUTS,
  maxOrders,
  newStation,
  type Order,
  patienceFor,
  pickOrder,
  STARS,
  type Station,
  serve,
  settle,
  spawnGap,
  startCook,
  stepStation,
  TABLE_REST,
  TRAY2_AT,
  takeReady,
  tipFor,
  toneOf,
  trayCap,
  wrongLost,
} from './rules';

/** 资产本地 (lx, lz) → 世界（同 clubfood/layout 的 local） */
const local = (x: number, z: number, r: number, lx: number, lz: number): [number, number] => [
  x + lx * Math.cos(r) + lz * Math.sin(r),
  z - lx * Math.sin(r) + lz * Math.cos(r),
];
/** 鲜果水车（clubfood/layout 的 AGUA，没导出：照抄） */
const AGUA = { x: -24.3, z: -34.2, rot: -0.5 };

/** 四个窗口：做哪样、窗台（东西摆在这、箭头指这）、站哪、摊主是谁 */
interface StationDef {
  item: ItemId;
  name: string;
  counter: THREE.Vector3;
  stand: [number, number];
  vendor: string;
}
const truckWin = (t: { x: number; z: number; dep: number }, lx: number, standZ: number) => ({
  counter: new THREE.Vector3(t.x + lx, 1.08, t.z + t.dep / 2 + 0.12),
  stand: [t.x + lx, t.z + standZ] as [number, number],
});
const STATION_DEFS: StationDef[] = [
  { item: 'smoothie', name: '咖啡车', vendor: 'vendor-coffee', ...truckWin(TRUCKS.coffee, -0.3, 1.9) },
  { item: 'wrap', name: '塔可车', vendor: 'vendor-taco', ...truckWin(TRUCKS.taco, 0.15, 2.0) },
  { item: 'pizza', name: '披萨车', vendor: 'vendor-pizza', ...truckWin(TRUCKS.pizza, 0.75, 2.0) },
  {
    item: 'lemon',
    name: '鲜果水车',
    vendor: 'vendor-agua',
    counter: new THREE.Vector3(...xyz(local(AGUA.x, AGUA.z, AGUA.rot, -0.2, 0.25), 0.98)),
    stand: local(AGUA.x, AGUA.z, AGUA.rot, -0.25, 1.0),
  },
];
function xyz([x, z]: [number, number], y: number): [number, number, number] {
  return [x, y, z];
}

/** 桌子：坐在上面的客人（clubfood 的 SLOTS id）、桌面高、桌心 z */
interface TableDef {
  seats: string[];
  top: number;
  z: number;
}
const TABLES: TableDef[] = [
  { seats: ['d-0n1', 'd-0n2', 'd-0s1'], top: TABLE.h, z: TABLE_ROWS[0] },
  { seats: ['d-0n3', 'd-0n4'], top: TABLE.h, z: TABLE_ROWS[0] },
  { seats: ['d-1n1', 'd-1s1', 'd-1s2'], top: TABLE.h, z: TABLE_ROWS[1] },
  { seats: ['d-1n2', 'd-1n3'], top: TABLE.h, z: TABLE_ROWS[1] },
  { seats: ['d-2n1'], top: TABLE.h, z: TABLE_ROWS[2] },
  { seats: ['d-2s1', 'd-2s2'], top: TABLE.h, z: TABLE_ROWS[2] },
];

/** 收起来的场景人物 / 东西：窗口前排队的、走路定格的、桌上原来的托盘 */
const HIDE = /^(q-(coffee|taco|pizza|agua)|walk-tray-|player-out-|prom-|stadium-walker|tray-\d)/;

/** 总监开局：塔可车窗口前，朝南看着凉棚 */
const START: [number, number] = [-31.2, -35.6];
/** 端一份 / 两份走多快 */
const SPEED_1 = 3.2;
const SPEED_2 = 2.8;
/** 放凉 / 倒掉一份扣多少 */
const WASTE = 4;

mountMinigame({
  id: 'foodtruck',
  title: '餐车出餐',
  tag: '小游戏 6 · 餐车院子',
  goal: '午饭高峰，院子坐满了。120 秒里把客人点的东西端上桌，赚小费！',
  howto: [
    '客人举手冒出气泡：想要冰柠檬水 / 卷饼 / 冰沙 / 披萨',
    '去做它的窗口按「做」，摊主做好递给你（做得久的先下单）',
    '端到那桌按「上菜」：气泡变红前送到才有小费，连着准时有连击',
    '30 秒起托盘能端两份 · 让客人等跑了 = 差评，5 个收摊',
  ],
  region: (host) => createFoodRegion(host),
  clouds: CLOUDS,
  life: false,
  attach: false,
  hour: 12.5,
  weather: 'clear',
  start: { start: START, yaw: 0 },
  // 拉近一点（竖屏 16.5 米宽 = 四个窗口都在画面里）：镜头不动（死区 9 × 14 米，定在 x −31.2、z −32）——
  // 三辆车和窗口牌在顶栏下面，长桌在画面中间，下面球员通道、野餐桌那一条空着给拇指（摇杆、按钮）
  zoom: 0.94,
  camera: {
    lead: { portrait: 3.6, landscape: 3.6 },
    dead: [9, 14],
    view: { x0: -42, x1: -20.4, z0: -60, z1: 0 },
  },
  // 能走的裁到院子里（北到车背后、南到球员通道）
  nav: (n) => ({
    ...n,
    bounds: {
      x0: Math.max(n.bounds.x0, -41.2),
      x1: Math.min(n.bounds.x1, -21.2),
      z0: n.bounds.z0,
      z1: Math.min(n.bounds.z1, -20.4),
    },
  }),
  duration: DURATION,
  stars: STARS,
  scoreLabel: '小费',
  comboWindow: COMBO_WINDOW,
  setup(mg) {
    const { scene, play, region } = mg;
    const D = play.director;
    const kctx = region.kit.ctxFor(0);
    const slot = (id: string) => scene.getObjectByName(`slot:${id}`) ?? null;

    // ── 场面 ──
    scene.traverse((o) => {
      if (o.name.startsWith('slot:') && HIDE.test(o.name.slice(5))) o.visible = false;
    });
    const away = new THREE.Group();
    away.visible = false;
    scene.add(away);

    // ── 客人（坐着的）──
    interface Seat {
      id: string;
      obj: THREE.Object3D;
      table: number;
      head: THREE.Vector3;
      /** 平时的姿势（sit / sip）、临时姿势到什么时候 */
      base: string;
      until: number;
      /** 送到的那份（摆在桌上） */
      dish: THREE.Object3D | null;
      dishAt: THREE.Vector3;
      /** 上菜站哪：客人那一侧的过道（长凳外） */
      stand: [number, number];
    }
    const seats: Seat[] = [];
    TABLES.forEach((t, ti) => {
      for (const id of t.seats) {
        const obj = slot(id);
        if (!obj) continue;
        const p = obj.position;
        const side = p.z < t.z ? -1 : 1;
        seats.push({
          id,
          obj,
          table: ti,
          head: new THREE.Vector3(p.x, p.y + 1.12, p.z),
          base: obj.userData.prop?.() === 'cup' ? 'sip' : 'sit',
          until: 0,
          dish: null,
          dishAt: new THREE.Vector3(p.x, t.top, t.z + side * 0.2),
          stand: play.nav.nearestFree(p.x, t.z + side * 1.25, 1.2) ?? [p.x, t.z + side * 1.25],
        });
      }
    });
    const seatOf = new Map(seats.map((s) => [s.id, s]));
    const posePerson = (s: Seat, name: string, sec: number) => {
      s.obj.userData.pose?.(name);
      s.until = mg.t + sec;
    };
    // 送到的吃的：每样一个小池子
    const dishPool = new Map<ItemId, THREE.Object3D[]>(ITEM_IDS.map((id) => [id, []]));
    const placeDish = (s: Seat, item: ItemId) => {
      clearDish(s);
      const pool = dishPool.get(item) ?? [];
      const d = pool.pop() ?? buildDish(kctx, item, 0.85);
      d.userData.item = item;
      d.position.copy(s.dishAt);
      d.visible = true;
      scene.add(d);
      s.dish = d;
    };
    const clearDish = (s: Seat) => {
      if (!s.dish) return;
      s.dish.removeFromParent();
      dishPool.get(s.dish.userData.item as ItemId)?.push(s.dish);
      s.dish = null;
    };

    // ── 窗口 ──
    interface St {
      def: StationDef;
      s: Station;
      vendor: THREE.Object3D | null;
      ready: THREE.Object3D;
      chip: THREE.Vector3;
    }
    const stations: St[] = STATION_DEFS.map((def) => {
      const ready = buildDish(kctx, def.item, 1.1);
      ready.position.copy(def.counter);
      ready.visible = false;
      scene.add(ready);
      return {
        def,
        s: newStation(def.item),
        vendor: slot(def.vendor),
        ready,
        chip: def.counter.clone().setY(def.counter.y + (def.item === 'lemon' ? 1.9 : 2.3)),
      };
    });
    const stationOf = (item: ItemId) => stations.find((s) => s.def.item === item) as St;
    const vendorPose = (st: St) => st.vendor?.userData.pose?.(st.s.state === 'cook' ? 'feed' : 'idle');

    // ── 端的托盘：手里"拿着"一个看不见的把手（push = 两手在身前），看得见的托盘每步跟到两手中间 ──
    const carry = buildCarryTray(kctx);
    carry.obj.visible = false;
    carry.obj.userData.followsDirector = true;
    scene.add(carry.obj);
    const handle = new THREE.Group();
    const trayItem: Item = play.addItem({
      id: 'tray',
      name: '托盘',
      obj: handle,
      grip: { at: [0, 0, 0], axis: [0, 0, 1], up: [0, 1, 0] },
      carryPose: 'push',
      carrySpeed: SPEED_1,
      droppable: false,
    });
    trayItem.stow(away);
    let hand: ItemId[] = [];
    const cap = () => trayCap(mg.elapsed);
    const handText = () => {
      const c = cap();
      const names = hand.map((id) => ITEMS[id].short);
      while (names.length < c) names.push('空');
      return names.join(' · ');
    };
    const syncHand = () => {
      carry.show(hand);
      carry.obj.visible = hand.length > 0;
      trayItem.spec.carrySpeed = hand.length >= 2 ? SPEED_2 : SPEED_1;
      if (hand.length && play.held() !== trayItem) play.give(trayItem);
      else if (!hand.length && play.held() === trayItem) {
        play.take();
        trayItem.stow(away);
      }
      mg.stat('tray', '托盘', handText(), hand.length >= cap() ? 'warn' : null);
    };
    const followTray = () => {
      if (!carry.obj.visible) return;
      const hp = D.userData.handPoint as ((s: 'R' | 'L') => THREE.Vector3) | undefined;
      const yaw = D.rotation.y;
      if (hp) {
        const p = hp('R').add(hp('L')).multiplyScalar(0.5);
        carry.obj.position.set(p.x, p.y + 0.02, p.z);
      } else
        carry.obj.position.set(
          D.position.x + Math.sin(yaw) * 0.4,
          D.position.y + 0.95,
          D.position.z + Math.cos(yaw) * 0.4,
        );
      carry.obj.rotation.y = yaw;
    };
    mg.onStep(followTray);

    // ── 一局的账 ──
    let round = 0;
    let orders: Order[] = [];
    let nextId = 1;
    let nextSpawn = 1;
    const tableRest: number[] = TABLES.map(() => 0);
    const tally = { ontime: 0, late: 0, wrong: 0, walkouts: 0, wasted: 0, bestCombo: 0, tips: 0 };
    /** 客人头顶的反应（笑脸 / 生气），画在气泡的位置 */
    let reacts: { seat: Seat; icon: 'happy' | 'angry'; until: number; key: number }[] = [];
    let reactKey = 0;
    const react = (s: Seat, icon: 'happy' | 'angry', sec: number) => {
      reacts = reacts.filter((r) => r.seat !== s);
      reacts.push({ seat: s, icon, until: mg.t + sec, key: reactKey++ });
    };
    let rng = mg.rng('orders:1');
    const said = { smoothie: false, tray2: false, pizza: false, first: false };

    const showLives = () => mg.setLives(MAX_WALKOUTS - tally.walkouts, MAX_WALKOUTS);

    // ── 互动：窗口 ──
    for (const st of stations) {
      const { def } = st;
      const nm = ITEMS[def.item].short;
      play.add({
        id: `station-${def.item}`,
        at: () => def.counter,
        stand: () => def.stand,
        radius: 1.7,
        priority: 1,
        label: () => {
          if (mg.state !== 'playing') return '';
          if (st.s.state === 'idle') return `做${nm}`;
          if (st.s.state === 'ready' && hand.length < cap()) return `拿${nm}`;
          return '';
        },
        canUse: () =>
          mg.state === 'playing' && (st.s.state === 'idle' || (st.s.state === 'ready' && hand.length < cap())),
        onUse: () => {
          if (mg.state !== 'playing') return;
          if (st.s.state === 'ready') take(st);
          else if (startCook(st.s)) {
            vendorPose(st);
          }
        },
      });
    }
    const take = (st: St) => {
      if (!takeReady(st.s) || hand.length >= cap()) return;
      hand.push(st.def.item);
      st.ready.visible = false;
      vendorPose(st);
      syncHand();
      mg.pop(st.def.counter.clone().setY(st.def.counter.y + 0.6), `接好 ${ITEMS[st.def.item].short}`, {
        color: 'cream',
      });
    };

    // ── 互动：回收站倒掉手上多的 ──
    const binAt = new THREE.Vector3(-37.0, 1.0, -22.85);
    play.add({
      id: 'bin',
      at: () => binAt,
      radius: 1.8,
      label: () => (mg.state === 'playing' && hand.length ? `倒掉${ITEMS[hand[hand.length - 1] as ItemId].short}` : ''),
      canUse: () => mg.state === 'playing' && hand.length > 0,
      onUse: (p) => {
        const r = round;
        p.busy({
          name: 'bin',
          dur: 0.6,
          pose: 'dump',
          face: binAt,
          mid: () => {
            if (r !== round || !hand.length) return;
            hand.pop();
            tally.wasted++;
            tally.tips -= WASTE;
            mg.addScore(-WASTE, binAt.clone().setY(1.6), { text: `倒掉 −${WASTE}` });
            syncHand();
          },
        });
      },
    });

    // ── 来单 ──
    const spare = (): ItemId[] => {
      const want = orders.map((o) => o.item);
      const have = [...hand, ...stations.filter((s) => s.s.state !== 'idle').map((s) => s.def.item)];
      return have.filter((id) => !want.includes(id));
    };
    const spawn = () => {
      const t = mg.elapsed;
      const busyT = new Set(orders.map((o) => o.table));
      const free = TABLES.map((_, i) => i).filter((i) => !busyT.has(i) && t >= (tableRest[i] ?? 0));
      const pk = pickOrder(rng, t, free, spare());
      if (!pk) return false;
      const cand = seats.filter((s) => s.table === pk.table);
      const seat = cand[Math.floor(rng() * cand.length)] as Seat;
      const o: Order = {
        id: nextId++,
        table: pk.table,
        seat: seat.id,
        item: pk.item,
        t0: mg.t,
        patience: patienceFor(t, pk.item),
        lost: 0,
      };
      orders.push(o);
      clearDish(seat);
      posePerson(seat, 'call', 1.6);
      addOrderPoint(o, seat);
      return true;
    };
    const addOrderPoint = (o: Order, seat: Seat) => {
      const name = ITEMS[o.item].short;
      play.add({
        id: `order-${o.id}`,
        at: () => seat.head,
        stand: () => seat.stand,
        radius: 1.95,
        // 手上有它点的东西：比旁边别的单优先（过道两边的长凳背靠背，两单常常同时在范围里）
        get priority() {
          return hand.includes(o.item) ? 3 : 2;
        },
        label: () => {
          if (mg.state !== 'playing' || !hand.length) return '';
          return hand.includes(o.item) ? `上${name}` : `给${ITEMS[hand[0] as ItemId].short}?`;
        },
        canUse: () => mg.state === 'playing' && hand.length > 0,
        onUse: (p) => {
          const r = round;
          p.busy({
            name: 'serve',
            dur: 0.45,
            pose: 'pickup',
            face: seat.head,
            mid: () => {
              if (r !== round || mg.state !== 'playing') return;
              deliver(o, seat);
            },
          });
        },
      });
    };
    const closeOrder = (o: Order) => {
      orders = orders.filter((x) => x !== o);
      play.remove(`order-${o.id}`);
      tableRest[o.table] = mg.elapsed + TABLE_REST;
    };
    const deliver = (o: Order, seat: Seat) => {
      if (!orders.includes(o) || !hand.length) return;
      const item = hand.includes(o.item) ? o.item : (hand[0] as ItemId);
      hand.splice(hand.indexOf(item), 1);
      syncHand();
      const at = seat.head.clone().setY(seat.head.y + 0.9);
      const res = serve(o, item, mg.t);
      if (res === 'ontime') {
        const frac = fracOf(o, mg.t);
        const combo = mg.comboHit();
        tally.bestCombo = Math.max(tally.bestCombo, combo);
        const tip = tipFor(item, frac, combo);
        tally.ontime++;
        tally.tips += tip;
        mg.addScore(tip, at, { text: combo >= 2 ? `+${tip} 小费 ×${combo}` : `+${tip} 小费`, big: combo >= 3 });
        placeDish(seat, item);
        posePerson(seat, 'clap', 1.2);
        react(seat, 'happy', 1.1);
        closeOrder(o);
      } else if (res === 'late') {
        mg.comboBreak();
        tally.late++;
        mg.pop(at, '太慢了…没小费', { color: 'red' });
        placeDish(seat, item);
        react(seat, 'angry', 1.2);
        closeOrder(o);
      } else {
        mg.comboBreak();
        tally.wrong++;
        o.lost = wrongLost(o);
        mg.pop(at, `不是${ITEMS[item].short}！要${ITEMS[o.item].short}`, { color: 'red' });
        react(seat, 'angry', 1.0);
        play.say(seat.obj, '我点的不是这个', 1.4, 1.9);
      }
    };
    const walkout = (o: Order) => {
      const seat = seatOf.get(o.seat);
      tally.walkouts++;
      mg.comboBreak();
      showLives();
      closeOrder(o);
      if (seat) {
        mg.pop(seat.head.clone().setY(seat.head.y + 0.9), '不等了！差评', { color: 'red', big: true });
        react(seat, 'angry', 2.2);
        posePerson(seat, 'call', 1.4);
      }
      if (tally.walkouts >= MAX_WALKOUTS) mg.finish('差评太多，收摊了');
      else mg.toast(`${ITEMS[o.item].name}没等到，客人走了（差评 ${tally.walkouts}/${MAX_WALKOUTS}）`, 1.8);
    };

    // ── 标记：最急的那单；空手 → 做它的窗口 ──
    let urgentKey = '';
    let urgentOff: (() => void) | null = null;
    let winKey = '';
    let winOff: (() => void) | null = null;
    const markPt = new THREE.Vector3();
    const winPt = new THREE.Vector3();
    let urgent: Order | null = null;
    let winSt: St | null = null;
    const syncMarks = () => {
      const now = mg.t;
      // 手上有东西：先指能送的（手上有它的单里最急的）
      const pool = hand.length ? orders.filter((o) => hand.includes(o.item)) : [];
      const list = pool.length ? pool : orders;
      urgent = list.reduce<Order | null>((a, o) => (!a || fracOf(o, now) < fracOf(a, now) ? o : a), null);
      const tone = urgent ? toneOf(fracOf(urgent, now)) : '';
      const uk = urgent && mg.state === 'playing' ? `${urgent.id}:${tone}` : '';
      if (uk !== urgentKey) {
        urgentOff?.();
        urgentOff = null;
        urgentKey = uk;
        const u = urgent;
        const s = u ? seatOf.get(u.seat) : null;
        if (u && s) {
          const color = tone === 'red' ? '#ff7a7a' : tone === 'orange' ? '#ffb347' : '#ffd23c';
          urgentOff = mg.marker('urgent', () => markPt.copy(s.head).setY(s.head.y + 2.9), { color });
        }
      }
      // 空手：最急的一单（还没有窗口在做 / 做好它的话就是它的窗口）
      winSt = null;
      if (!hand.length && mg.state === 'playing' && orders.length) {
        const byUrg = [...orders].sort((a, b) => fracOf(a, now) - fracOf(b, now));
        const first = byUrg.find((o) => stationOf(o.item).s.state === 'ready') ?? byUrg[0];
        if (first) winSt = stationOf(first.item);
      }
      const wk = winSt ? `${winSt.def.item}:${winSt.s.state}` : '';
      if (wk !== winKey) {
        winOff?.();
        winOff = null;
        winKey = wk;
        const w = winSt;
        if (w) {
          // 箭头在窗口牌上面（不带字：牌子上写着做什么、做到哪）
          winOff = mg.marker('window', () => winPt.copy(w.chip).setY(w.chip.y + 2.9), { color: '#8fe36a' });
        }
      }
    };

    // ── 叠层：气泡、窗口牌 ──
    const ov = createOverlay((p) => mg.project(new THREE.Vector3(p.x, p.y, p.z)));
    const bubAt = new THREE.Vector3();
    mg.onFrame(() => {
      const c = document.getElementById('c');
      const W = c?.clientWidth || innerWidth;
      const H = c?.clientHeight || innerHeight;
      ov.begin(W, H);
      const now = mg.t;
      // 窗口牌：开局卡、玩的时候都在（开局卡上面就看得到哪个窗口做什么）；结算卡时收起来
      for (const st of mg.state === 'result' ? [] : stations) {
        const it = ITEMS[st.def.item];
        const locked = mg.state === 'playing' && mg.elapsed < it.from;
        const s = st.s;
        ov.draw(
          `st-${st.def.item}`,
          st.chip,
          {
            icon: st.def.item,
            frac: s.state === 'cook' ? 1 - s.t / it.prep : null,
            cls: s.state,
            text: locked
              ? `${Math.ceil(it.from - mg.elapsed)}秒后上新`
              : s.state === 'ready'
                ? '好了！'
                : s.state === 'cook'
                  ? `${it.short} ${s.t.toFixed(1)}`
                  : `${it.short} ${it.prep}秒`,
            want: winSt === st,
            edge: false,
          },
          'st',
        );
      }
      if (mg.state === 'playing') {
        for (const o of orders) {
          const s = seatOf.get(o.seat);
          if (!s) continue;
          const f = fracOf(o, now);
          const r = reacts.find((x) => x.seat === s && x.until > now);
          ov.draw(`o-${o.id}`, bubAt.copy(s.head).setY(s.head.y + 0.8), {
            icon: r ? r.icon : o.item,
            frac: f,
            cls: toneOf(f),
            urgent: o === urgent,
          });
        }
        for (const r of reacts) {
          if (r.until <= now || orders.some((o) => o.seat === r.seat.id)) continue;
          ov.draw(`r-${r.key}`, bubAt.copy(r.seat.head).setY(r.seat.head.y + 0.8), {
            icon: r.icon,
            frac: null,
            cls: r.icon,
            edge: false,
          });
        }
      }
      ov.end();
    });

    return {
      reset() {
        round++;
        rng = mg.rng(`orders:${mg.round}`);
        for (const o of orders) play.remove(`order-${o.id}`);
        orders = [];
        nextId = 1;
        nextSpawn = 1.0;
        tableRest.fill(0);
        Object.assign(tally, { ontime: 0, late: 0, wrong: 0, walkouts: 0, wasted: 0, bestCombo: 0, tips: 0 });
        reacts = [];
        Object.assign(said, { smoothie: false, tray2: false, pizza: false, first: false });
        hand = [];
        syncHand();
        for (const st of stations) {
          st.s = newStation(st.def.item);
          st.ready.visible = false;
          vendorPose(st);
        }
        for (const s of seats) {
          clearDish(s);
          s.until = 0;
          s.obj.userData.pose?.(s.base);
        }
        // 开局几张桌上已经在吃（先来的客人）
        const r0 = mg.rng(`plates:${mg.round}`);
        for (const s of seats) if (r0() < 0.35) placeDish(s, ITEM_IDS[Math.floor(r0() * 4)] as ItemId);
        showLives();
        urgentOff?.();
        urgentOff = null;
        urgentKey = '';
        winOff?.();
        winOff = null;
        winKey = '';
      },
      start() {
        mg.toast('客人举手了 → 去做它的窗口按「做」', 2.6);
      },
      step(dt) {
        const t = mg.elapsed;
        const now = mg.t;
        // 来单
        if (t >= nextSpawn) {
          if (orders.length < maxOrders(t) && spawn()) nextSpawn = t + spawnGap(t);
          else nextSpawn = t + 0.5;
        }
        // 窗口
        const s = play.state();
        for (const st of stations) {
          const ev = stepStation(st.s, dt);
          if (ev === 'done') {
            st.ready.visible = true;
            vendorPose(st);
            const near = Math.hypot(s.x - st.def.counter.x, s.z - st.def.counter.z) <= 1.9;
            if (near && hand.length < cap() && !s.busy) take(st);
          } else if (ev === 'stale') {
            st.ready.visible = false;
            tally.wasted++;
            tally.tips -= WASTE;
            mg.addScore(-WASTE, st.def.counter.clone().setY(st.def.counter.y + 0.6), {
              text: `${ITEMS[st.def.item].short}凉了 −${WASTE}`,
            });
          }
        }
        // 客人的耐心
        for (const o of [...orders]) if (mg.state === 'playing' && fracOf(o, now) <= 0) walkout(o);
        if (mg.state !== 'playing') return;
        // 临时姿势放完 → 回平时的
        for (const st of seats)
          if (st.until && now >= st.until) {
            st.until = 0;
            st.obj.userData.pose?.(st.base);
          }
        reacts = reacts.filter((r) => r.until > now);
        // 节奏提示
        if (!said.smoothie && t >= ITEMS.smoothie.from) {
          said.smoothie = true;
          mg.toast('冰沙上新：咖啡车做（3 秒）', 2.4);
        }
        if (!said.tray2 && t >= TRAY2_AT) {
          said.tray2 = true;
          mg.toast('托盘升级：一次能端两份！', 2.4, true);
          syncHand();
        }
        if (!said.pizza && t >= ITEMS.pizza.from) {
          said.pizza = true;
          mg.toast('窑烤披萨上新：要 5 秒，先去下单！', 2.6);
        }
        syncMarks();
      },
      finish() {
        urgentOff?.();
        urgentOff = null;
        urgentKey = '';
        winOff?.();
        winOff = null;
        winKey = '';
        return settle(tally);
      },
      debug: () => {
        const now = mg.t;
        return {
          hand: [...hand],
          cap: cap(),
          tally: { ...tally },
          orders: orders.map((o) => {
            const s = seatOf.get(o.seat) as Seat;
            return {
              id: o.id,
              item: o.item,
              seat: o.seat,
              table: o.table,
              frac: +fracOf(o, now).toFixed(3),
              x: +s.head.x.toFixed(2),
              z: +s.head.z.toFixed(2),
              sx: +s.stand[0].toFixed(2),
              sz: +s.stand[1].toFixed(2),
            };
          }),
          stations: stations.map((st) => ({
            item: st.def.item,
            state: st.s.state,
            t: +st.s.t.toFixed(2),
            x: st.def.stand[0],
            z: st.def.stand[1],
          })),
        };
      },
    };
  },
});
