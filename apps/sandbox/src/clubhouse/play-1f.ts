// 一层（商店层）总监的活：互动点、手里的东西。状态（信号、货箱垛、收银台有没有人）在 life-1f.ts，这里只管"总监怎么动手"。
//   货箱垛（货梯厅）  空手 → "搬货箱"（拿一只 stock-box…，垛少一只）；拿着货箱 → "放回去"
//   四个补货点        信号亮着（空挂钩 / 卖空的一格 / 冷柜空了一排 / 空货格）而且手里是 stock-box… → "补拍子"……（货箱用掉，信号灭）
//   脏杯子（咖啡吧后段的小圆桌）  → "收杯子"（拿走 cups-1f…）→ 咖啡吧台 "放吧台"
//   沙脚印（正门里）  按住 2.5 秒 "拖地"；沙垫（钟楼南门里）按住 2 秒 "抖垫子"
//   专卖店收银台      店员走开、有人等着 → 站到柜台后面按住 2.5 秒 "收银"
// stock-box… 是跨层的约定（B1 储藏也出、2F 后吧也收）：这里的收货点只按 id 的前缀认。
import * as THREE from 'three';
import type { Item, Play, PlayState } from '../clubsite/play';
import type { AssetCtx } from './ctx';

export type JobState = 'idle' | 'signal' | 'doing' | 'cooldown';
/** 补货的四个信号 */
export const RESTOCKS = ['hooks', 'soldout', 'row', 'kiosk'] as const;
export type RestockId = (typeof RESTOCKS)[number];

/** life-1f.ts 给这里的东西 */
export interface Shop1F {
  state(id: string): JobState;
  /** 信号灭了（活干完）：进冷却 */
  clear(id: string): void;
  /** 活干到一半（杯子拿在手里）：信号道具藏起来，等送到 */
  begin(id: string): void;
  /** 活没干成（杯子没了）：信号回来 */
  raise(id: string): void;
  /** 信号 / 互动点在哪（世界坐标，建好的 Vector3） */
  at(id: string): THREE.Vector3;
  /** 总监站哪（不给 = 默认） */
  stand(id: string): readonly [number, number] | null;
  /** 货箱垛上几只 */
  boxes(): number;
  setBoxes(n: number): void;
  /** 总监替店员收了银 */
  serveTill(): void;
  /** 相关的人（说"谢谢"的那个） */
  who(id: string): THREE.Object3D | null;
  /** 新信号亮了（life 调；attach 里接上） */
  onRaise: ((id: string) => void) | null;
  /** 建一只手里拿的货箱 / 一摞脏杯子 */
  makeBox(): THREE.Object3D;
  makeCups(): THREE.Object3D;
}

export const MOP_HOLD = 2.5;
export const SHAKE_HOLD = 2;
export const TILL_HOLD = 2.5;

const PUT: Record<RestockId, string> = { hooks: '补拍子', soldout: '补纪念品', row: '补饮料', kiosk: '补零食' };
/** 信号亮的时候谁说什么 */
const ASK: Record<string, string> = {
  hooks: '拍子卖完了',
  soldout: '这格卖空了',
  row: '饮料空了一排',
  kiosk: '零食没货了',
  cups: '杯子没人收',
  till: '有人吗？',
};

export const isStockBox = (it: Item | null | undefined) => !!it?.id.startsWith('stock-box');
const isCups = (it: Item | null | undefined) => !!it?.id.startsWith('cups-1f');

/** 一只纸箱（0.44 × 0.3 × 0.34 米，原点在底面中心）：牛皮纸 + 顶上一条封箱带。总监、送货的手里拿的 */
export function buildCarryBox(ctx: AssetCtx): THREE.Object3D {
  const F = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0.3 };
  const g = new THREE.Group();
  g.name = 'stock-box';
  const kraft = ctx.mat('straw', { ...F, ramp: [0xecb878, 0xc88c58, 0x7a5068] });
  const tape = ctx.mat('straw', { ...F, ramp: [0xfff0c0, 0xc89a5a, 0x8a6a70] });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.34).translate(0, 0.15, 0), kraft));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.35).translate(0, 0.3, 0), tape));
  ctx.mats.prepare(g);
  // 握点：箱子顶面中心（拎着）
  g.userData.grip = { at: [0, 0.32, 0] };
  return g;
}

export function attachShopPlay(play: Play, shop: Shop1F): { step(dt: number): void } {
  let boxN = 0;
  let cupsN = 0;
  const thanks = (id: string, text = '谢谢！') => {
    const w = shop.who(id);
    if (w) play.say(w, text, 2);
  };

  // ── 货箱垛：拿 / 放回 ──
  play.add({
    id: 'box-stack',
    at: () => shop.at('boxes'),
    radius: 1.5,
    stand: () => shop.stand('boxes'),
    pickLabel: '搬货箱',
    onPickUp(p) {
      const obj = shop.makeBox();
      const it = p.addItem({
        id: `stock-box-1f-${boxN++}`,
        name: '货箱',
        obj,
        grip: obj.userData.grip,
        carrySpeed: 2.8,
        radius: 1.1,
      });
      p.give(it);
      // 垛上至少留一只（货梯厅总有货可搬）
      if (shop.boxes() > 1) shop.setBoxes(shop.boxes() - 1);
    },
    accepts: (it) => isStockBox(it),
    putLabel: '放回去',
    onPutDown(it) {
      it.remove();
      shop.setBoxes(shop.boxes() + 1);
    },
  });

  // ── 四个补货点 ──
  for (const id of RESTOCKS) {
    play.add({
      id,
      at: () => shop.at(id),
      radius: 1.4,
      stand: () => shop.stand(id),
      priority: 1,
      accepts: (it) => isStockBox(it) && shop.state(id) === 'signal',
      putLabel: PUT[id],
      onPutDown(it, p) {
        it.remove();
        shop.clear(id);
        p.toast('补货 ✓');
        thanks(id);
      },
    });
  }

  // ── 脏杯子 → 咖啡吧台 ──
  play.add({
    id: 'cups',
    at: () => shop.at('cups'),
    radius: 1.4,
    stand: () => shop.stand('cups'),
    priority: 1,
    pickLabel: () => (shop.state('cups') === 'signal' ? '收杯子' : ''),
    canPickUp: () => shop.state('cups') === 'signal',
    onPickUp(p) {
      const it = p.addItem({
        id: `cups-1f-${cupsN++}`,
        name: '脏杯子',
        obj: shop.makeCups(),
        grip: { at: [0, 0.2, 0] },
      });
      p.give(it);
      shop.begin('cups');
    },
  });
  play.add({
    id: 'cafe-bar',
    at: () => shop.at('cafeBar'),
    radius: 1.6,
    stand: () => shop.stand('cafeBar'),
    accepts: (it) => isCups(it),
    putLabel: '放吧台',
    onPutDown(it, p) {
      it.remove();
      shop.clear('cups');
      p.toast('杯子收了 ✓');
      thanks('cups');
    },
  });

  // ── 按住的活：拖沙脚印、抖沙垫、收银 ──
  const holdJob = (o: {
    id: string;
    label: string;
    pose: string;
    sec: number;
    radius: number;
    prop?: string;
    done(p: Play): void;
  }) => {
    let t = 0;
    let prop = false;
    const up = (s: PlayState) => shop.state(o.id) === 'signal' && !s.held;
    const end = (p: Play) => {
      t = 0;
      if (prop) p.director.userData.setProp?.(null);
      prop = false;
    };
    play.add({
      id: o.id,
      at: () => shop.at(o.id),
      radius: o.radius,
      stand: () => shop.stand(o.id),
      priority: 2,
      label: (s) => (up(s) ? o.label : ''),
      canUse: up,
      pose: o.pose,
      onHold(dt, p) {
        if (shop.state(o.id) !== 'signal') return false;
        if (o.prop && !prop) {
          p.director.userData.setProp?.(o.prop);
          prop = true;
        }
        t += dt;
        if (t < o.sec) return;
        o.done(p);
        return false;
      },
      onRelease: end,
    });
  };
  holdJob({
    id: 'prints',
    label: '拖地',
    pose: 'sweep',
    prop: 'broom',
    sec: MOP_HOLD,
    radius: 1.3,
    done(p) {
      shop.clear('prints');
      p.toast('地拖干净了 ✓');
    },
  });
  holdJob({
    id: 'mat',
    label: '抖垫子',
    pose: 'dump',
    sec: SHAKE_HOLD,
    radius: 1.3,
    done(p) {
      shop.clear('mat');
      p.toast('垫子抖干净了 ✓');
    },
  });
  holdJob({
    id: 'till',
    label: '收银',
    pose: 'feed',
    sec: TILL_HOLD,
    radius: 1.0,
    done(p) {
      shop.serveTill();
      p.toast('收银 ✓');
      thanks('till');
    },
  });

  // ── 信号亮的那一刻：相关的人说一句；等收银的人头上一直挂着气泡 ──
  shop.onRaise = (id) => {
    const w = shop.who(id);
    if (w && ASK[id] && id !== 'till') play.say(w, ASK[id], 3);
  };
  let tillUp = false;
  return {
    step() {
      const up = shop.state('till') === 'signal';
      if (up !== tillUp) {
        tillUp = up;
        const w = shop.who('till');
        play.bubble('till', up ? w : null, ASK.till);
      }
      // 杯子拿走以后没了（被别的地方删了）：信号回来，别卡在"干到一半"
      if (shop.state('cups') === 'doing') {
        const it = play.item(`cups-1f-${cupsN - 1}`);
        if (!it || it.where === 'gone') shop.raise('cups');
      }
    },
  };
}
