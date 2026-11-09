// 占位：新资产还没画时，每个位置放一个冷灰的体块（明显是占位），大小 = docs/lab/2026-11-07-3d-pixel/clubfood.md 的规格。
// 这个场景的占位比别的场景多一步：车顶 / 遮阳篷 / 伞面 / 桶盖这一块涂上提议的主色（palette.ts 的 FOOD），评审时看得到配色和饱和度；
// ?accent=0 = 全灰（和别的场景一样）。复用的资产（人、蒲葵、陶罐、龙舌兰、饮料车、拟八哥、水站）不用占位，直接是真的（reuse.ts）。
// 本地原点 = 落地点（y 0 = 地面），+z 朝镜头（南），+x 朝东；尺寸米。
import * as THREE from 'three';
import { SPECS as PLAZA_SPECS, type Spec as PlazaSpec } from '../clubplaza/placeholders';
import type { ToonOpts } from '../clubsite/render/toon';
import type { AssetCtx } from './ctx';
import { PERGOLA, TABLE, TRUCK_FLOOR, TRUCKS } from './layout';
import type { Accent, Pal } from './palette';

/** 每个资产的大致外形（米）：w 宽（x）、d 深（z）、h 高；shape 决定占位的样子；n = 清单编号（标签里显示） */
export interface Spec {
  w: number;
  d: number;
  h: number;
  shape:
    | PlazaSpec['shape']
    | 'truck'
    | 'trailer'
    | 'tricycle'
    | 'tuktuk'
    | 'cart2'
    | 'pergola'
    | 'longtable'
    | 'picnic'
    | 'umbrella'
    | 'lawngames'
    | 'bins'
    | 'rack'
    | 'crates'
    | 'dolly'
    | 'festoon'
    | 'tray'
    | 'bag';
  crown?: number;
  n?: number;
  /** 中文短名（标签） */
  name?: string;
  /** 主色（占位上涂色的那一块） */
  acc?: Accent;
  /** 计划的主体材质（?accent=2 的"颜色白模"里占位的灰换成它；资产阶段的大面积底色） */
  base?: keyof Pal;
  /** 车：服务窗 [左, 右]（本地 x，米）、做饭的东西 */
  win?: [number, number];
  kind?: 'van' | 'step' | 'oven';
}

const T = TRUCKS;
/** 新资产（这个场景要从零画的）的规格；和 clubfood.md 的清单一致 */
export const NEW_SPECS: Record<string, Spec> = {
  'truck-coffee': {
    w: T.coffee.len,
    d: T.coffee.dep,
    h: T.coffee.h,
    shape: 'truck',
    n: 1,
    name: '咖啡车（圆头老面包车）',
    acc: 'accCoffee',
    win: [-1.3, 0.7],
    kind: 'van',
    base: 'ironwork',
  },
  'truck-taco': {
    w: T.taco.len,
    d: T.taco.dep,
    h: T.taco.h,
    shape: 'truck',
    n: 2,
    name: '塔可车（方头厢车）',
    acc: 'accTaco',
    win: [-2.0, 1.0],
    kind: 'step',
    base: 'ironwork',
  },
  'truck-pizza': {
    w: T.pizza.len,
    d: T.pizza.dep,
    h: 4.3,
    shape: 'truck',
    n: 3,
    name: '窑烤披萨车（车尾砖窑 + 烟囱）',
    acc: 'accPizza',
    win: [-0.4, 1.9],
    kind: 'oven',
    base: 'ironwork',
  },
  'trailer-poke': {
    w: 6.4,
    d: 2.4,
    h: 2.8,
    shape: 'trailer',
    n: 4,
    name: '银色拖车（波奇碗）',
    acc: 'accPoke',
    base: 'concrete',
  },
  'cart-paletas': {
    w: 1.9,
    d: 0.9,
    h: 2.3,
    shape: 'tricycle',
    n: 5,
    name: '冰棍三轮',
    acc: 'accPaleta',
    base: 'metal',
  },
  'cart-churros': { w: 1.6, d: 0.8, h: 2.2, shape: 'cart2', n: 6, name: '吉事果车', acc: 'accChurro', base: 'timber' },
  'tuktuk-boba': {
    w: 2.9,
    d: 1.4,
    h: 2.1,
    shape: 'tuktuk',
    n: 7,
    name: '奶茶三轮摩托',
    acc: 'accBoba',
    base: 'clothWhite',
  },
  pergola: {
    base: 'timber',
    w: PERGOLA.x1 - PERGOLA.x0,
    d: PERGOLA.z1 - PERGOLA.z0,
    h: PERGOLA.h,
    shape: 'pergola',
    n: 8,
    name: '凉棚 + 串灯',
    acc: 'bulb',
  },
  'long-table': {
    w: TABLE.len,
    d: TABLE.bench * 2 + 0.36,
    h: TABLE.h,
    shape: 'longtable',
    n: 9,
    name: '长桌 + 长凳',
    base: 'timber',
  },
  'picnic-table': { w: 1.9, d: 1.6, h: 0.74, shape: 'picnic', n: 10, name: '野餐桌', base: 'timber' },
  'patio-umbrella': { w: 2.5, d: 2.5, h: 2.5, shape: 'umbrella', n: 11, name: '遮阳伞', base: 'metal' },
  'lawn-games': { w: 9, d: 3.8, h: 1.1, shape: 'lawngames', n: 12, name: '孩子的草皮角', base: 'timber' },
  'bin-station': { w: 2.1, d: 0.7, h: 1.3, shape: 'bins', n: 13, name: '三色回收站', base: 'metal' },
  'tray-return': { w: 1.2, d: 0.5, h: 1.5, shape: 'rack', n: 14, name: '回收台（还托盘）', base: 'metal' },
  'supply-stack': { w: 1.6, d: 1.0, h: 1.3, shape: 'crates', n: 15, name: '补货堆', base: 'timber' },
  'hand-truck': { w: 0.6, d: 0.8, h: 1.3, shape: 'dolly', n: 16, name: '手推车（补货）', base: 'toolOrange' },
  festoon: { w: 0.2, d: 4.5, h: 0.4, shape: 'festoon', n: 17, name: '串灯', acc: 'bulb' },
  'food-tray': { w: 0.45, d: 0.34, h: 0.1, shape: 'tray', n: 18, name: '托盘（吃的）', base: 'flowerRed' },
  'trash-bag': { w: 0.6, d: 0.6, h: 0.7, shape: 'bag', n: 19, name: '垃圾袋', base: 'ironwork' },
};

export const SPECS: Record<string, Spec> = {
  ...(PLAZA_SPECS as Record<string, Spec>),
  ...NEW_SPECS,
  // 复用的：标签高度用
  'drinks-cart': { w: 1.7, d: 0.9, h: 2.6, shape: 'stand' },
  'water-station': { w: 0.8, d: 0.6, h: 1.45, shape: 'column' },
  kid: { w: 0.4, d: 0.3, h: 1.0, shape: 'person' },
};

/** 托盘上的吃的：塔可（橙）、披萨（红）、波奇碗（绿）、薯条（黄） */
const TRAY_FOOD: Accent[] = ['accTaco', 'accPizza', 'accPoke', 'accChurro'];
/** 伞面：三把伞三种主色（和旁边的车错开） */
const UMB_ACC: Accent[] = ['accPaleta', 'accChurro', 'accCoffee'];

export function placeholder(ctx: AssetCtx, asset: string): THREE.Object3D {
  const sp = SPECS[asset] ?? { w: 1, d: 1, h: 1, shape: 'box' as const };
  const tint = ctx.params.get('accent') !== '0';
  // ?accent=2 = 颜色白模：占位的灰换成计划的主体材质（量"画完以后"的饱和度用；评审默认还是灰）
  const grey = ctx.params.get('accent') === '2' && sp.base ? ctx.mat(sp.base) : ctx.mat('placeholder');
  const acc = (k?: Accent, extra?: ToonOpts) => (tint && k ? ctx.mat(k, { noShadowReceive: false, ...extra }) : grey);
  /** 车身（朝镜头的竖直面，永远在暗档）：lightUp + 低 bands 留住主色，不接投影（clubdesk 柜台的做法） */
  const paint = (k?: Accent) => acc(k, { lightUp: 0.55, bands: [-0.45, 0.35], noShadowReceive: true });
  const g = new THREE.Group();
  const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0, m: THREE.Material = grey) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y + h / 2, z);
    g.add(o);
    return o;
  };
  const mesh = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, m: THREE.Material = grey) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const wheel = (x: number, z: number, r: number, t = 0.2) =>
    mesh(new THREE.CylinderGeometry(r, r, t, 12).rotateX(Math.PI / 2), x, r, z);
  /** 伞：杆 + 圆锥伞面（主色） */
  const umbrella = (x: number, z: number, r: number, top: number, m: THREE.Material) => {
    box(0.07, top - 0.2, 0.07, x, 0, z);
    mesh(new THREE.ConeGeometry(r, 0.42, 8), x, top - 0.21, z, m);
  };
  switch (sp.shape) {
    case 'truck': {
      // 车：底盘 + 轮子 + 车厢（四面墙，南面开服务窗）+ 车顶（主色）+ 车顶线上一块近乎水平的遮阳篷（主色，伸出 0.75）。
      // 窗口里看得到摊主（人站在车地板 TRUCK_FLOOR 上）。方头厢车 / 圆头老面包车 / 披萨车（车尾一座砖窑 + 烟囱）
      const { w, d, h } = sp;
      const roofY = sp.kind === 'oven' ? 3.0 : h;
      const [wl, wr] = sp.win ?? [-1, 1];
      const y0 = TRUCK_FLOOR;
      const wall = 0.12;
      const winY0 = 1.35;
      const winY1 = 2.35;
      box(w - 0.4, y0 - 0.35, d - 0.2, 0, 0.35, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(sx * (w / 2 - 0.9), sz * (d / 2 - 0.15), 0.38, 0.24);
      // 车头（驾驶室，东头；老面包车的车头圆一点、矮一点）
      const cab = sp.kind === 'van' ? 1.2 : 1.4;
      // 车厢
      const bx0 = -w / 2;
      const bx1 = w / 2 - cab;
      const bw = bx1 - bx0;
      const bc = (bx0 + bx1) / 2;
      // 白模：车身涂主色（一辆车 = 一个颜色，资产阶段整车照这个色画；?accent=0 全灰）
      const bm = paint(sp.acc);
      box(bw, roofY - y0, wall, bc, y0, -d / 2 + wall / 2, bm); // 北墙
      box(wall, roofY - y0, d, bx0 + wall / 2, y0, 0, bm); // 西墙
      box(wall, roofY - y0, d, bx1 - wall / 2, y0, 0, bm); // 东墙（和驾驶室之间）
      // 南墙：窗下、窗上、窗左、窗右
      const zS = d / 2 - wall / 2;
      box(bw, winY0 - y0, wall, bc, y0, zS, bm);
      box(bw, roofY - winY1, wall, bc, winY1, zS, bm);
      if (wl > bx0) box(wl - bx0, winY1 - winY0, wall, (bx0 + wl) / 2, winY0, zS, bm);
      if (wr < bx1) box(bx1 - wr, winY1 - winY0, wall, (wr + bx1) / 2, winY0, zS, bm);
      // 窗台（伸出 0.25）
      box(wr - wl + 0.2, 0.06, 0.3, (wl + wr) / 2, winY0, d / 2 + 0.1);
      // 车顶（主色）
      box(bw + 0.1, 0.1, d + 0.1, bc, roofY, 0, acc(sp.acc));
      // 遮阳篷：车顶线、近乎水平、伸出 0.75（45° 俯视下不挡窗口）+ 一圈垂边
      const aw = wr - wl + 0.8;
      box(aw, 0.06, 0.75, (wl + wr) / 2, roofY - 0.12, d / 2 + 0.375, acc(sp.acc));
      box(aw, 0.18, 0.04, (wl + wr) / 2, roofY - 0.3, d / 2 + 0.74, acc(sp.acc));
      // 驾驶室
      const cabH = sp.kind === 'van' ? h - 0.35 : h - 0.5;
      box(cab - 0.1, cabH - y0 + 0.2, d - 0.1, bx1 + cab / 2, y0 - 0.2, 0, bm);
      box(cab - 0.4, 0.5, 0.04, bx1 + cab / 2 + 0.05, cabH - 0.75, d / 2 - 0.03, ctx.mat('jug'));
      // 菜单牌（窗边，图标不写字）
      box(0.9, 1.1, 0.06, wr + 0.65 < bx1 ? wr + 0.55 : wl - 0.55, winY0 - 0.1, d / 2 + 0.02);
      if (sp.kind === 'oven') {
        // 车尾（西头）一座砖窑：圆顶 + 烟囱（烟囱顶 4.3）
        mesh(new THREE.SphereGeometry(0.75, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), bx0 + 1.0, roofY + 0.05, -0.2);
        box(0.3, h - roofY - 0.4, 0.3, bx0 + 1.0, roofY + 0.4, -0.35);
      }
      break;
    }
    case 'trailer': {
      // 银色拖车：胶囊形车身（圆头圆尾）+ 两个轮子 + 拖杆；南面开一大扇翻板窗，翻板（主色）往上撑起
      const L = sp.w;
      const R = 1.15;
      const body = new THREE.CapsuleGeometry(R, L - 2 * R, 6, 12).rotateZ(Math.PI / 2).scale(1, 1.05, 1);
      mesh(body, 0, 0.55 + R, 0);
      wheel(-0.4, sp.d / 2 - 0.25, 0.36);
      wheel(0.4, sp.d / 2 - 0.25, 0.36);
      box(1.3, 0.1, 0.1, L / 2 + 0.6, 0.45, 0);
      // 翻板：窗上沿往外往上撑 30°
      const flap = box(2.4, 0.06, 0.8, 0.5, 2.15, R + 0.2, acc(sp.acc));
      flap.rotation.x = -0.5;
      box(2.2, 0.06, 0.3, 0.5, 1.15, R + 0.05);
      break;
    }
    case 'tricycle': {
      // 冰棍三轮：前面一只冷柜箱（主色）+ 两个前轮、后面一个大轮 + 车座 + 伞（主色）
      box(1.0, 0.7, 0.8, -0.35, 0.35, 0, acc(sp.acc));
      wheel(-0.6, 0.42, 0.25, 0.08);
      wheel(-0.6, -0.42, 0.25, 0.08);
      wheel(0.75, 0, 0.32, 0.08);
      box(0.08, 0.8, 0.08, 0.6, 0.3, 0);
      box(0.25, 0.08, 0.2, 0.6, 1.0, 0);
      umbrella(-0.35, -0.1, 0.95, 2.3, acc(sp.acc));
      break;
    }
    case 'cart2': {
      // 吉事果车：木车厢 + 两个大轮 + 车顶小篷（主色，两根柱）+ 车上一只玻璃柜（一排吉事果）
      box(1.4, 0.75, 0.75, 0, 0.3, 0, paint(sp.acc));
      wheel(-0.45, 0.42, 0.3, 0.08);
      wheel(0.45, 0.42, 0.3, 0.08);
      box(0.8, 0.35, 0.45, -0.15, 1.05, 0);
      for (const x of [-0.65, 0.65]) box(0.06, 1.0, 0.06, x, 1.05, -0.3);
      box(1.6, 0.08, 0.95, 0, 2.05, -0.05, acc(sp.acc));
      break;
    }
    case 'tuktuk': {
      // 三轮摩托（Ape）：前面窄车头（一个前轮）+ 后面一只小货厢改成的吧台（侧板放下 = 台面）+ 顶棚（主色）
      box(0.9, 1.4, 1.0, 1.0, 0.35, 0, paint(sp.acc));
      wheel(1.3, 0, 0.25, 0.1);
      box(1.7, 0.85, 1.3, -0.35, 0.3, 0, paint(sp.acc));
      wheel(-0.6, 0.6, 0.25, 0.1);
      wheel(-0.6, -0.6, 0.25, 0.1);
      box(1.7, 0.06, 0.45, -0.35, 1.0, 0.85);
      for (const x of [-1.15, 0.45]) box(0.06, 0.95, 0.06, x, 1.15, -0.55);
      box(1.9, 0.08, 1.5, -0.35, 2.1, 0, acc(sp.acc));
      box(0.3, 0.35, 0.3, -0.8, 1.15, 0);
      box(0.3, 0.35, 0.3, -0.3, 1.15, 0);
      break;
    }
    case 'pergola': {
      // 凉棚：柱子（四角 + 东西每 3.4 米）、东西两根主梁、南北向的板条（每 1.7 米；屏幕上是竖条，太密会出强边缘）、两道串灯（之字）
      const { w, d, h } = sp;
      const xs: number[] = [];
      for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 3) xs.push(x);
      for (const x of xs) for (const z of [-d / 2, d / 2]) box(0.24, h, 0.24, x, 0, z);
      for (const z of [-d / 2, d / 2]) box(w + 0.6, 0.26, 0.2, 0, h - 0.26, z);
      for (let x = -w / 2 + 0.85; x < w / 2; x += 1.7) box(0.14, 0.12, d + 0.8, x, h, 0);
      // 串灯：两道之字（主色 = 灯泡）
      const bulb = acc(sp.acc);
      for (const x0 of [-w / 4, w / 4])
        for (let k = 0; k < 8; k++) {
          const z = -d / 2 + ((k + 0.5) / 8) * d;
          const x = x0 + (k % 2 ? 1 : -1) * 1.1;
          mesh(new THREE.SphereGeometry(0.09, 6, 4), x, h - 0.22, z, bulb);
        }
      break;
    }
    case 'longtable': {
      // 长桌（4.2 × 0.9，高 0.76）+ 两条长凳（离桌心 ±0.65，座高 0.46）
      box(TABLE.len, 0.08, TABLE.w, 0, TABLE.h - 0.08, 0);
      for (const x of [-TABLE.len / 2 + 0.3, TABLE.len / 2 - 0.3]) box(0.1, TABLE.h - 0.08, TABLE.w - 0.2, x, 0, 0);
      for (const z of [-TABLE.bench, TABLE.bench]) box(TABLE.len, TABLE.seat, 0.34, 0, 0, z);
      break;
    }
    case 'picnic': {
      // 野餐桌：桌面 1.9 × 0.8 + 两边连着的长凳（座高 0.46）
      box(1.9, 0.06, 0.8, 0, 0.68, 0);
      box(0.12, 0.68, 0.6, 0, 0, 0);
      for (const z of [-0.62, 0.62]) box(1.9, 0.46, 0.3, 0, 0, z);
      break;
    }
    case 'umbrella': {
      // 遮阳伞：v0 / v1 撑开（主色各不同），v2 收起（一根细长的卷）
      const v = ctx.variant % 3;
      if (v === 2) {
        box(0.07, 2.4, 0.07, 0, 0, 0);
        mesh(new THREE.CylinderGeometry(0.12, 0.08, 1.2, 8), 0, 1.75, 0, acc(UMB_ACC[2]));
      } else umbrella(0, 0, 1.25, 2.5, acc(UMB_ACC[v]));
      box(0.5, 0.12, 0.5, 0, 0, 0);
      break;
    }
    case 'lawngames': {
      // 草皮在 terrain；这里：两块沙包投洞板（东西对着，斜面朝对方）+ 一座大号叠叠乐（0.5 × 0.5 × 1.1）+ 几只沙包
      for (const [x, s] of [
        [-3.4, 1],
        [1.6, -1],
      ] as [number, number][]) {
        const b = box(1.2, 0.08, 0.6, x, 0.15, 0.1);
        b.rotation.z = s * 0.25;
        box(0.08, 0.3, 0.6, x - s * 0.55, 0, 0.1);
      }
      box(0.5, 1.1, 0.5, 3.4, 0, -0.2);
      const bags: [number, number, Accent][] = [
        [1.2, 0.5, 'accRecycle'],
        [-0.6, -0.4, 'accPizza'],
        [2.2, -0.2, 'accRecycle'],
      ];
      for (const [x, z, k] of bags) box(0.16, 0.06, 0.16, x, 0, z, acc(k));
      break;
    }
    case 'bins': {
      // 三色回收站：一块背板（图标牌）+ 三只桶（盖：灰 / 蓝 / 绿）
      box(2.1, 1.3, 0.08, 0, 0, -0.3);
      const lids: (Accent | undefined)[] = [undefined, 'accRecycle', 'accCompost'];
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.68;
        box(0.56, 0.92, 0.56, x, 0, 0);
        box(0.6, 0.08, 0.6, x, 0.92, 0, acc(lids[i]));
      }
      break;
    }
    case 'rack': {
      // 回收台：三层架子（还托盘）+ 顶上一只收餐盆
      for (const y of [0.3, 0.75, 1.2]) box(1.2, 0.05, 0.5, 0, y, 0);
      for (const x of [-0.55, 0.55]) box(0.06, 1.25, 0.5, x, 0, 0);
      box(0.6, 0.22, 0.4, -0.2, 1.25, 0);
      break;
    }
    case 'crates': {
      // 补货堆：几只箱子 + 一只冰桶 + 一个煤气罐（变体换堆法）
      const v = ctx.variant % 3;
      box(0.6, 0.45, 0.45, -0.4, 0, 0);
      box(0.6, 0.45, 0.45, -0.4, 0.45, 0);
      if (v !== 2) box(0.55, 0.45, 0.45, 0.25, 0, 0.1);
      if (v === 0) box(0.5, 0.4, 0.4, -0.35, 0.9, 0);
      mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.75, 10), 0.6, 0.375, -0.2);
      break;
    }
    case 'dolly': {
      // 手推车：竖架 + 两个轮子 + 车上两只箱子
      box(0.5, 1.3, 0.06, 0, 0, -0.25);
      wheel(-0.22, -0.2, 0.12, 0.06);
      wheel(0.22, -0.2, 0.12, 0.06);
      box(0.48, 0.4, 0.42, 0, 0.05, 0);
      box(0.46, 0.38, 0.4, 0, 0.45, 0);
      break;
    }
    case 'festoon': {
      // 串灯：本地原点 = 起点；另一头在 userData.to（main.ts 填，世界坐标 → 本地）。占位先画一条直的（下面 main.ts 换成真两头）
      break;
    }
    case 'tray': {
      // 托盘 + 一块吃的（主色）
      box(0.45, 0.03, 0.34, 0, 0, 0);
      box(0.22, 0.08, 0.14, -0.06, 0.03, 0.02, acc(TRAY_FOOD[ctx.variant % 4]));
      mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.16, 8), 0.14, 0.11, -0.06);
      break;
    }
    case 'bag': {
      // 扎好的垃圾袋（一团）
      mesh(new THREE.SphereGeometry(0.3, 8, 6).scale(1, 1.15, 0.9), 0, 0.34, 0);
      break;
    }
    default:
      return plazaPlaceholder(ctx, asset, g);
  }
  ctx.mats.prepare(g);
  return g;
}

/** 别的形状（column、person、box…）照 clubplaza 的占位 */
function plazaPlaceholder(ctx: AssetCtx, asset: string, _g: THREE.Group): THREE.Object3D {
  const sp = SPECS[asset] ?? { w: 1, d: 1, h: 1, shape: 'box' as const };
  const m = ctx.mat('placeholder');
  const g = new THREE.Group();
  const o =
    sp.shape === 'column'
      ? new THREE.Mesh(new THREE.CylinderGeometry(sp.w * 0.45, sp.w * 0.5, sp.h, 10), m)
      : sp.shape === 'person'
        ? new THREE.Mesh(new THREE.CapsuleGeometry(sp.w * 0.4, sp.h - sp.w * 0.8, 4, 8), m)
        : new THREE.Mesh(new THREE.BoxGeometry(sp.w, sp.h, sp.d), m);
  o.position.y = sp.h / 2;
  g.add(o);
  ctx.mats.prepare(g);
  return g;
}

/** 串灯（两头世界坐标）：一条下垂的线（每 0.5 米一颗灯泡）；占位和资产阶段都按这个两头建 */
export function festoonBetween(ctx: AssetCtx, a: THREE.Vector3, b: THREE.Vector3, sag = 0.45): THREE.Object3D {
  const g = new THREE.Group();
  const tint = ctx.params.get('accent') !== '0';
  const bulb = tint ? ctx.mat('bulb') : ctx.mat('placeholder');
  const wire = ctx.mat('ironwork', { noShadowReceive: true });
  const n = Math.max(2, Math.round(a.distanceTo(b) / 0.5));
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    if (prev) {
      const len = prev.distanceTo(p);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, len), wire);
      seg.position.copy(prev).add(p).multiplyScalar(0.5);
      seg.lookAt(p);
      g.add(seg);
    }
    if (i > 0 && i < n) {
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), bulb);
      o.position.copy(p).y -= 0.08;
      g.add(o);
    }
    prev = p;
  }
  g.traverse((o) => {
    o.castShadow = true;
  });
  ctx.mats.prepare(g);
  return g;
}
