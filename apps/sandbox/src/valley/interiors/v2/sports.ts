// 体育用品店 · 第二版店内（?inv=2，参考 Sneaky Sasquatch 的店内重做；第一版 interiors/sports.ts 不动）。设计稿 S1～S5。
// 局部坐标：x 0…18（西 → 东）、z 0…15（北 → 南），南墙正中是门（x 7.5…10.5）；框架（interiors/index.ts）画地板、墙、门。
// 只改这个文件和 assets/in2/sports.ts（in2-sports-*）；价签、气泡、大字条、地面字从 kit.ts 调。
//
// 原则（BRIEF-IN2）怎么落的：
// 1. 镜头近（zoom 0.45：竖屏横着看得到 ≈ 7.9 米，整间店的进深一屏放下，只横着走两屏），东西少而大（真实的 1.5～2 倍）。
// 2. 每件能买的东西正下方挂价签（货架沿 / 柜子正面 / 横梁正面），ITEMS 列出来；走过去点 = 买。
// 3. 分区靠大字条：北墙上 SHOES / RACQUETS / STRINGING，货架顶 APPAREL / BAGS / USED，球堆后面 BALLS。
// 4. 人在柜台后面：收银员（门东收银台北边）、穿线师（穿线台北边），头顶"…"。
// 5. 地面一个主色（天蓝运动地胶，1.5 米两色大格），墙一个主色（浅冰蓝）+ 深海军蓝墙裙；亮的拍子衬深背板。
// 6. 地上大字框：收银台前 PAY HERE（排队）、球拍墙前 TRY ZONE（S2 掂一掂、空挥）。
// 7. 门口进来第一眼：正对门的北墙 = 球拍墙；收银在门东、购物车在门西；门 → 球拍墙一条 3 米宽的直过道（推车 ≥ 2 米）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CastLook } from '../../../clubsite/cast/types';
import { player } from '../../../clubsite/people';
import { createDresser } from '../../../clubsite/people/dress';
import type { BaseCtx } from '../../../clubsite/render/ctx';
import type { ToonOpts } from '../../../clubsite/render/toon';
import { makeAsset } from '../../assets';
import {
  APPAREL,
  BAG_STAND,
  BALL_CASE,
  FACE,
  in2Mat,
  PROD,
  PYRAMID,
  RACKET_WALL,
  SHOE_SHELF,
  STRING_BOARD,
  STRING_COUNTER,
  USED_RACK,
} from '../../assets/in2/sports';
import type { AssetCtx } from '../../ctx';
import type { PalKey } from '../../palette';
import type { InteriorCtx, InteriorDef } from '../index';
import { fascia, floorLabel, priceTag, talkBubble } from './kit';

const W = 18;
const D = 14;

// ── 摆放（局部坐标；资产原点 = 落地点中心，贴墙的东西原点在墙脚 z 0）──
const P = {
  shoes: [2.45, 0] as const,
  rackets: [9, 0] as const,
  strings: [15.6, 0] as const,
  stringDesk: [15.0, 3.6] as const,
  stringer: [17.0, 5.0] as const,
  apparel: [2.45, 5.3] as const,
  pyramid: [5.7, 8.5] as const,
  ballCase: [3.4, 8.7] as const,
  bags: [15.5, 7.8] as const,
  checkout: [12.8, 11.3] as const,
  used: [16.3, 11.4] as const,
  carts: [
    [5.4, 12.8],
    [6.3, 12.8],
  ] as const,
};

/** 互动锚点（局部坐标；yaw = 总监站在这儿时的朝向，0 = 朝南 +z、π = 朝北；card = 设计稿的卡）。下一关的玩法直接按名字接 */
export interface Spot {
  x: number;
  z: number;
  yaw: number;
  card: string;
  note: string;
}
const N = Math.PI;
export const SPOTS: Record<string, Spot> = {
  entry: { x: 9, z: 12, yaw: N, card: '-', note: '进门站的地方（= interiors/index.ts entryAt）' },
  exit: { x: 9, z: 13.6, yaw: 0, card: '-', note: '门口（出去）' },
  cartTake: { x: 5.85, z: 11.7, yaw: 0, card: 'S1', note: '门西的两辆购物车（车把朝北）：站在车把后面拿一辆' },
  pyramid: { x: 5.7, z: 10.0, yaw: N, card: 'S1', note: '球罐金字塔（方台 1.8 米）前：点一下拿一罐；推车撞上会塌' },
  ballCase: { x: 3.4, z: 9.8, yaw: N, card: 'S1', note: '72 个装的比赛球纸箱（很沉，进车以后车变慢）' },
  racketWall0: { x: 6.0, z: 1.6, yaw: N, card: 'S2', note: '球拍墙第 1 支（最轻 255 克，荧光框）' },
  racketWall1: { x: 7.2, z: 1.6, yaw: N, card: 'S2', note: '球拍墙第 2 支（270 克）' },
  racketWall2: { x: 8.4, z: 1.6, yaw: N, card: 'S2', note: '球拍墙第 3 支（285 克）' },
  racketWall3: { x: 9.6, z: 1.6, yaw: N, card: 'S2', note: '球拍墙第 4 支（300 克）' },
  racketWall4: { x: 10.8, z: 1.6, yaw: N, card: 'S2', note: '球拍墙第 5 支（305 克）' },
  racketWall5: { x: 12.0, z: 1.6, yaw: N, card: 'S2', note: '球拍墙第 6 支（最重 320 克，紫框）' },
  tryZone: { x: 9, z: 2.6, yaw: 0, card: 'S2', note: '球拍墙前地上的 TRY ZONE 框：拿下拍子在这儿掂一掂、空挥' },
  stringer: { x: 17.0, z: 6.2, yaw: N, card: 'S3', note: '穿线机（17.0, 5.0）前：自己穿线站这儿，按住拉紧' },
  stringDesk: { x: 15.0, z: 4.6, yaw: N, card: 'S3', note: '穿线服务台前：交给穿线师（付工钱、明天取）/ 取件' },
  stringerStaff: { x: 15.0, z: 2.6, yaw: 0, card: 'S3', note: '店员：穿线师站在服务台北边（台后）' },
  stringReels: {
    x: 15.6,
    z: 4.6,
    yaw: N,
    card: 'S3',
    note: '线卷墙（北墙东段，3 卷）在穿线台后面：站服务台前点线卷，穿线师递过来',
  },
  checkout: {
    x: 12.8,
    z: 12.5,
    yaw: N,
    card: 'S4',
    note: '收银台前（PAY HERE 框里）：推车停这儿，点车里的东西放上扫码台',
  },
  scanner: { x: 11.9, z: 11.4, yaw: N, card: 'S4', note: '扫码窗（台面西半边，离地 1.0）' },
  cashier: { x: 13.55, z: 10.3, yaw: 0, card: 'S4', note: '店员：收银员站在收银台北边（台后），收银机旁' },
  consign: { x: 16.3, z: 12.4, yaw: N, card: 'S5', note: '寄卖架前：一支支挂上去（第 5 个钩空着），按住拖一下定价' },
  shoes: { x: 2.45, z: 1.6, yaw: N, card: '-', note: '鞋墙前（4 双）' },
  apparel: { x: 2.45, z: 6.3, yaw: N, card: '-', note: '衣架前（3 件 Polo）' },
  bags: { x: 15.5, z: 9.0, yaw: N, card: 'S1', note: '球包 A 字架前（2 只）' },
};

/** 挂了价签的、能买的东西（局部坐标；y = 价签离地高，价签底边）。价钱：美元整数 */
export interface Item {
  id: string;
  name: string;
  price: number;
  x: number;
  z: number;
  y: number;
}
const RACKET_NAMES = ['入门轻拍 255g', '青训拍 270g', '全能拍 285g', '控制拍 300g', '力量拍 305g', '职业拍 320g'];
const RACKET_PRICES = [79, 99, 139, 169, 199, 249];
const SHOE_NAMES = ['橙色硬地鞋', '荧光硬地鞋', '红色红土鞋', '青绿全场鞋'];
const SHOE_PRICES = [89, 109, 119, 139];
const SHIRT_NAMES = ['红色 Polo', '荧光 Polo', '青绿 Polo'];
const SHIRT_PRICES = [35, 39, 35];
const REEL_NAMES = ['荧光聚酯线 200 米卷', '红色多股线 200 米卷', '白色羊肠线一副'];
const REEL_PRICES = [119, 149, 45];
const USED_PRICES = [25, 40, 60, 35];

function items(): Item[] {
  const out: Item[] = [];
  const [rx, rz] = P.rackets;
  RACKET_WALL.xs.forEach((x, i) => {
    out.push({
      id: `racket${i}`,
      name: RACKET_NAMES[i],
      price: RACKET_PRICES[i],
      x: rx + x,
      z: rz + RACKET_WALL.tagZ,
      y: RACKET_WALL.tagY,
    });
  });
  const [sx, sz] = P.shoes;
  let k = 0;
  for (const sy of SHOE_SHELF.shelves)
    for (const x of SHOE_SHELF.xs) {
      out.push({
        id: `shoes${k}`,
        name: SHOE_NAMES[k],
        price: SHOE_PRICES[k],
        x: sx + x,
        z: sz + SHOE_SHELF.tagZ,
        y: sy - 0.05 - SHOE_SHELF.tagDrop,
      });
      k++;
    }
  const [ax, az] = P.apparel;
  APPAREL.xs.forEach((x, i) => {
    out.push({
      id: `shirt${i}`,
      name: SHIRT_NAMES[i],
      price: SHIRT_PRICES[i],
      x: ax + x,
      z: az + APPAREL.tagZ,
      y: APPAREL.tagY,
    });
  });
  out.push({
    id: 'ballCan',
    name: '比赛球一罐（3 个）',
    price: 5,
    x: P.pyramid[0],
    z: P.pyramid[1] + PYRAMID.tagZ,
    y: PYRAMID.tagY,
  });
  out.push({
    id: 'ballCase',
    name: '比赛球一箱（72 个，24 罐）',
    price: 99,
    x: P.ballCase[0],
    z: P.ballCase[1] + BALL_CASE.tagZ,
    y: BALL_CASE.tagY,
  });
  const bagNames = ['红色 6 支装球包', '荧光 12 支装球包'];
  const bagPrices = [59, 89];
  BAG_STAND.xs.forEach((x, i) => {
    out.push({
      id: `bag${i}`,
      name: bagNames[i],
      price: bagPrices[i],
      x: P.bags[0] + x,
      z: P.bags[1] + BAG_STAND.tagZ,
      y: BAG_STAND.tagY,
    });
  });
  STRING_BOARD.xs.forEach((x, i) => {
    out.push({
      id: `reel${i}`,
      name: REEL_NAMES[i],
      price: REEL_PRICES[i],
      x: P.strings[0] + x,
      z: P.strings[1] + STRING_BOARD.tagZ,
      y: STRING_BOARD.tagY,
    });
  });
  out.push({
    id: 'stringJob',
    name: '穿线服务（交给穿线师，明天取）',
    price: 25,
    x: P.stringDesk[0] - 0.75,
    z: P.stringDesk[1] + STRING_COUNTER.tagZ,
    y: STRING_COUNTER.tagY,
  });
  USED_RACK.xs.forEach((x, i) => {
    out.push({
      id: `used${i}`,
      name: `寄卖旧拍 #${i + 1}`,
      price: USED_PRICES[i],
      x: P.used[0] + x,
      z: P.used[1] + USED_RACK.tagZ,
      y: USED_RACK.tagY,
    });
  });
  return out;
}
export const ITEMS: Item[] = items();

/** 店里的两个人：站的位置（局部）、朝向（0 = 朝南 / 朝镜头）、长相 */
const STAFF: { at: [number, number]; look: CastLook }[] = [
  {
    // 收银员：海军蓝店服 Polo、白领滚边、卡其短裤，马尾
    at: [SPOTS.cashier.x, SPOTS.cashier.z],
    look: {
      body: 'adult',
      height: 0.98,
      skin: 'tan',
      hair: 'auburn',
      hairStyle: 'ponytail',
      shirt: 'navy',
      bottom: 'khaki',
      bottomKind: 'shorts',
      shoes: 'white',
    },
  },
  {
    // 穿线师：荧光黄绿店服、灰短发、眼镜、炭灰长裤
    at: [SPOTS.stringerStaff.x, SPOTS.stringerStaff.z],
    look: {
      body: 'adult',
      height: 1.04,
      stout: 1.1,
      skin: 'brown',
      hair: 'gray',
      hairStyle: 'short',
      shirt: 'lime',
      bottom: 'charcoal',
      bottomKind: 'pants',
      shoes: 'black',
      eyes: 'glasses',
    },
  },
];

/** 资产上下文的材质按（键, 参数）缓存：同样的材质只建一份（整间店按材质合并时网格就少） */
function sharedMats(base: AssetCtx): AssetCtx {
  const cache = new Map<string, ReturnType<AssetCtx['mat']>>();
  return {
    ...base,
    mat(key: PalKey, extra?: ToonOpts) {
      const k = `${key}|${JSON.stringify(extra ?? null)}`;
      let m = cache.get(k);
      if (!m) cache.set(k, (m = base.mat(key, extra)));
      return m;
    },
  };
}

/** 整间店的静物按（材质）合并成一个组（局部坐标），交给 c.asset */
function mergeAll(c: InteriorCtx, objs: THREE.Object3D[]) {
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const o of objs) {
    o.updateMatrixWorld(true);
    o.traverse((x) => {
      const mesh = x as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material as THREE.Material;
      const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(
        mesh.matrixWorld,
      );
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
      if (!g.attributes.normal) g.computeVertexNormals();
      const arr = by.get(m) ?? [];
      arr.push(g);
      by.set(m, arr);
    });
  }
  const root = new THREE.Group();
  root.name = 'interior:sports:v2';
  for (const [m, gs] of by) {
    const merged = mergeGeometries(gs);
    for (const g of gs) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.name = `interior:sports:v2:${(m.userData.palKey as string | undefined) ?? m.name}`;
    mesh.userData.noCast = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    root.add(mesh);
  }
  c.asset(root);
}

function build(c: InteriorCtx) {
  const actx = sharedMats(c.actx);
  const list: THREE.Object3D[] = [];
  const put = (id: string, x: number, z: number, rot = 0, y = 0) => {
    const { obj } = makeAsset(id, { ...actx, variant: 0 });
    obj.position.set(x, y, z);
    obj.rotation.y = rot;
    list.push(obj);
    return obj;
  };
  /** kit 的东西（局部坐标，原点按 kit 的约定） */
  const kit = (o: THREE.Object3D, x: number, y: number, z: number) => {
    o.position.set(x, y, z);
    list.push(o);
  };
  const tag = (price: number, x: number, y: number, z: number, sm = false) =>
    kit(priceTag(actx, price, sm ? { size: 'sm' } : {}), x, y, z);
  const bgNavy = in2Mat(actx, 'navy', FACE);
  const bgWhite = in2Mat(actx, 'white', FACE);
  const inkNeon = in2Mat(actx, 'neon', PROD);
  const inkNavy = in2Mat(actx, 'navy', PROD);
  const sign = (text: string, x: number, y: number, z: number, w: number, dark = true, h = 0.5) =>
    kit(fascia(actx, text, { w, h, bg: dark ? bgNavy : bgWhite, ink: dark ? inkNeon : inkNavy }), x, y, z);

  // ── 地：天蓝地胶，1.5 米两色大格（地板盒子顶 y 0.02 → 这层 0.026）；墙外一圈暗地（= main.ts 的 INSIDE_BG）──
  {
    const A: THREE.BufferGeometry[] = [];
    const B: THREE.BufferGeometry[] = [];
    const S = 1.5;
    for (let i = 0; i < W / S; i++)
      for (let j = 0; j < D / S; j++)
        ((i + j) % 2 ? B : A).push(
          new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2).translate((i + 0.5) * S, 0.026, (j + 0.5) * S),
        );
    const g = new THREE.Group();
    g.add(new THREE.Mesh(mergeGeometries(A), in2Mat(actx, 'floorA', { noShadowReceive: true })));
    g.add(new THREE.Mesh(mergeGeometries(B), in2Mat(actx, 'floorB', { noShadowReceive: true })));
    const voidM = actx.mat('surround', {
      ramp: [0x181532, 0x181532, 0x181532],
      edge: 0,
      convex: 0,
      noShadowReceive: true,
    });
    g.add(
      new THREE.Mesh(
        new THREE.PlaneGeometry(W + 90, D + 110).rotateX(-Math.PI / 2).translate(W / 2, -0.03, D / 2 + 10),
        voidM,
      ),
    );
    list.push(g);
  }

  // ── 北墙：墙皮（浅冰蓝 + 海军蓝墙裙）；西段鞋墙、正中球拍墙、东段线卷墙，各一条大字条 ──
  put('in2-sports-wall', W / 2, 0);
  put('in2-sports-shoe-shelf', P.shoes[0], P.shoes[1]);
  sign('SHOES', P.shoes[0], 2.36, 0.08, 2.4, true, 0.7);
  put('in2-sports-racket-wall', P.rackets[0], P.rackets[1]);
  sign('RACQUETS', P.rackets[0], 3.1, 0.08, 4.6, true, 0.8);
  put('in2-sports-string-board', P.strings[0], P.strings[1]);
  sign('STRINGING', P.strings[0], 2.56, 0.08, 3.4, true, 0.7);
  c.block({ x0: 0, x1: 4.4, z0: 0, z1: 0.6 });
  c.block({ x0: 5.1, x1: 12.9, z0: 0, z1: 0.65 });

  // ── 价签：球拍墙（柜子正面）、鞋墙（隔板下沿）、线卷（线卷下面的托条）──
  for (const it of ITEMS)
    if (it.id.startsWith('racket') || it.id.startsWith('shoes') || it.id.startsWith('reel'))
      tag(it.price, it.x, it.y, it.z, it.id.startsWith('shoes'));

  // ── 球拍墙前：TRY ZONE（S2 掂一掂、空挥）──
  kit(
    floorLabel(actx, 'TRY ZONE', { w: 4.2, d: 1.6, ink: in2Mat(actx, 'white', { noShadowReceive: true }) }),
    9,
    0.03,
    2.4,
  );

  // ── 东北：穿线台（S3）——服务台（穿线师在台后）、穿线机 ──
  put('in2-sports-string-counter', P.stringDesk[0], P.stringDesk[1]);
  c.block({
    x0: P.stringDesk[0] - 1.35,
    x1: P.stringDesk[0] + 1.35,
    z0: P.stringDesk[1] - 0.45,
    z1: P.stringDesk[1] + 0.45,
  });
  // 台后（穿线师那一格）不让进：台北边到墙
  c.block({ x0: 13.6, x1: 16.4, z0: 0.6, z1: P.stringDesk[1] });
  {
    const it = ITEMS.find((i) => i.id === 'stringJob');
    if (it) tag(it.price, it.x, it.y, it.z);
  }
  put('in2-sports-stringer', P.stringer[0], P.stringer[1]);
  c.block({ x0: P.stringer[0] - 0.85, x1: P.stringer[0] + 0.85, z0: P.stringer[1] - 0.55, z1: P.stringer[1] + 0.55 });

  // ── 西：衣架（APPAREL）──
  put('in2-sports-apparel', P.apparel[0], P.apparel[1]);
  sign('APPAREL', P.apparel[0], APPAREL.barY + 0.06, P.apparel[1] + 0.05, 2.6, true, 0.7);
  c.block({ x0: P.apparel[0] - 1.75, x1: P.apparel[0] + 1.75, z0: P.apparel[1] - 0.35, z1: P.apparel[1] + 0.35 });
  for (const it of ITEMS) if (it.id.startsWith('shirt')) tag(it.price, it.x, it.y, it.z);

  // ── 中西：球罐金字塔（BALLS 牌在它后面两根杆上）+ 72 个装的纸箱 ──
  put('in2-sports-pyramid', P.pyramid[0], P.pyramid[1]);
  sign('BALLS', P.pyramid[0], 1.7, P.pyramid[1] - 0.8, 1.9, true, 0.7);
  {
    const post = in2Mat(actx, 'white');
    const g = new THREE.Group();
    for (const s of [-1, 1])
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 0.06).translate(s * 0.85, 1.15, 0), post));
    g.position.set(P.pyramid[0], 0, P.pyramid[1] - 0.83);
    list.push(g);
  }
  c.block({ x0: P.pyramid[0] - 1.0, x1: P.pyramid[0] + 1.0, z0: P.pyramid[1] - 1.0, z1: P.pyramid[1] + 1.0 });
  put('in2-sports-ball-case', P.ballCase[0], P.ballCase[1]);
  c.block({ x0: P.ballCase[0] - 0.65, x1: P.ballCase[0] + 0.65, z0: P.ballCase[1] - 0.4, z1: P.ballCase[1] + 0.4 });
  for (const it of ITEMS) if (it.id === 'ballCan' || it.id === 'ballCase') tag(it.price, it.x, it.y, it.z);

  // ── 中东：球包 A 字架（BAGS）──
  put('in2-sports-bag-stand', P.bags[0], P.bags[1]);
  sign('BAGS', P.bags[0], 1.74, P.bags[1] + 0.02, 1.8, true, 0.7);
  c.block({ x0: P.bags[0] - 1.45, x1: P.bags[0] + 1.45, z0: P.bags[1] - 0.55, z1: P.bags[1] + 0.55 });
  for (const it of ITEMS) if (it.id.startsWith('bag')) tag(it.price, it.x, it.y, it.z);

  // ── 门东：收银台（S4）+ 地上 PAY HERE；东南角寄卖架（S5，USED）──
  put('in2-sports-checkout', P.checkout[0], P.checkout[1]);
  c.block({ x0: P.checkout[0] - 1.45, x1: P.checkout[0] + 1.45, z0: P.checkout[1] - 0.5, z1: P.checkout[1] + 0.5 });
  // 收银员那一格（台后）
  c.block({ x0: P.checkout[0] - 1.45, x1: P.checkout[0] + 1.45, z0: P.checkout[1] - 1.6, z1: P.checkout[1] - 0.5 });
  kit(
    floorLabel(actx, 'PAY HERE', { w: 2.8, d: 1.3, ink: in2Mat(actx, 'white', { noShadowReceive: true }) }),
    P.checkout[0],
    0.03,
    P.checkout[1] + 1.35,
  );
  put('in2-sports-used-rack', P.used[0], P.used[1]);
  sign('USED', P.used[0], 2.08, P.used[1] + 0.05, 1.8, false, 0.7);
  c.block({ x0: P.used[0] - 1.45, x1: P.used[0] + 1.45, z0: P.used[1] - 0.35, z1: P.used[1] + 0.35 });
  for (const it of ITEMS) if (it.id.startsWith('used')) tag(it.price, it.x, it.y, it.z, true);

  // ── 门西：两辆购物车（S1），车把朝北 ──
  for (const [x, z] of P.carts) put('in2-sports-cart', x, z);
  c.block({ x0: 4.95, x1: 6.75, z0: 12.2, z1: 13.4 });

  mergeAll(c, list);

  // ── 人（不合并：骨骼人）+ 头顶的"…"（不合并：userData.bob 以后会浮）──
  const dresser = createDresser({ mats: c.actx.mats as Parameters<typeof createDresser>[0]['mats'], scheme: null });
  for (const s of STAFF) {
    const o = player({ ...c.actx, variant: 0 } as unknown as BaseCtx);
    dresser.dress(o, s.look);
    o.userData.setProp?.(null);
    o.userData.pose?.('idle', 0);
    o.position.set(s.at[0], 0, s.at[1]);
    o.rotation.y = 0;
    c.asset(o);
    const b = talkBubble(c.actx);
    b.position.set(s.at[0], 2.05, s.at[1]);
    c.asset(b);
  }
}

export const INTERIOR_SPORTS: InteriorDef = {
  id: 'sports',
  name: '体育用品店',
  w: W,
  d: D,
  floor: 'tile',
  wall: 'signBoard',
  poi: 'p_sports',
  zoom: 0.4,
  build,
};
