// 占位：新资产还没画时，每个位置放一个冷灰的体块（明显是占位），大小 = docs/lab/2026-11-07-3d-pixel/clubhouse.md 的清单。
// 会所的"壳"（墙、地、屋顶）不是占位：terrain.ts 用现成材质（白灰泥、红瓦、陶砖、木地板）直接建，墙上的门窗是方洞；
// 这里只放要单独画的东西：钟楼、正门、拱窗、阳台、烟囱、招牌、三角梅、壁泉（外观）+ 里面每间房的家具。
// 复用的资产（人、长椅、陶罐、龙舌兰、蒲葵、灌木）不用占位，直接是真的（reuse.ts）。
// 本地原点 = 落地点（y 0 = 地面 / 楼板），+z = 正面（朝镜头），+x 朝东；尺寸米。
import * as THREE from 'three';
import { SPECS as PLAZA_SPECS, type Spec as PlazaSpec } from '../clubplaza/placeholders';
import type { AssetCtx } from './ctx';
import { STOREY, TOWER } from './layout';
import type { Pal } from './palette';

/** 每个资产的大致外形（米）：w 宽（本地 x）、d 深（本地 z）、h 高；shape 决定占位的样子；n = 清单编号（标签里显示） */
export interface Spec {
  w: number;
  d: number;
  h: number;
  shape:
    | PlazaSpec['shape']
    | 'tower'
    | 'doorway'
    | 'archwin'
    | 'balcony'
    | 'vine'
    | 'wallfountain'
    | 'fireplace'
    | 'flat'
    | 'sofa'
    | 'table'
    | 'counter'
    | 'shelves'
    | 'stool'
    | 'cafetable'
    | 'desk'
    | 'board'
    | 'machine'
    | 'rail'
    | 'lockers'
    | 'showers'
    | 'tub'
    | 'stairs';
  crown?: number;
  n?: number;
  /** 中文短名（标签） */
  name?: string;
  /** 在哪（清单分组） */
  where?: string;
  /** 计划的主体材质（?accent=2 的"颜色白模"里占位的灰换成它，量画完以后的饱和度用；资产阶段的大面积底色） */
  base?: keyof Pal;
}

const TW = TOWER.x1 - TOWER.x0;
/** 新资产（这个场景要从零画的）的规格；和 clubhouse.md 的清单一致（#2 南拱廊、红瓦是墙体 / 材质，不在这里） */
export const NEW_SPECS: Record<string, Spec> = {
  // ── 外观 ──
  'bell-tower': {
    w: TW,
    d: TW,
    h: TOWER.h + TOWER.roof,
    shape: 'tower',
    n: 1,
    name: '钟楼',
    where: '外观',
    base: 'stucco',
  },
  'main-door': {
    w: 2.8,
    d: 0.3,
    h: 3.7,
    shape: 'doorway',
    n: 3,
    name: '正门（拱门 + 门框）',
    where: '东立面',
    base: 'timber',
  },
  'arch-window': {
    w: 1.3,
    d: 0.3,
    h: 2.0,
    shape: 'archwin',
    n: 4,
    name: '拱窗 + 铁花窗栅',
    where: '外观',
    base: 'ironwork',
  },
  balcony: {
    w: 2.6,
    d: 0.7,
    h: 1.1,
    shape: 'balcony',
    n: 5,
    name: '铁艺阳台（二楼）',
    where: '外观',
    base: 'ironwork',
  },
  chimney: { w: 1.1, d: 0.9, h: 4.6, shape: 'box', n: 6, name: '烟囱（壁炉的）', where: '外观', base: 'stucco' },
  'club-sign': { w: 3.0, d: 0.12, h: 0.6, shape: 'box', n: 7, name: '会所招牌', where: '外观', base: 'signBoard' },
  bougainvillea: {
    w: 1.2,
    d: 0.5,
    h: 3.8,
    shape: 'vine',
    n: 8,
    name: '三角梅（攀柱）',
    where: '外观',
    base: 'flowerPurple',
  },
  'wall-fountain': {
    w: 1.6,
    d: 0.6,
    h: 2.2,
    shape: 'wallfountain',
    n: 9,
    name: '花砖壁泉',
    where: '南拱廊',
    base: 'talavera',
  },
  // ── 会员休息室 ──
  fireplace: { w: 2.2, d: 0.8, h: 2.6, shape: 'fireplace', n: 10, name: '壁炉', where: '会员休息室', base: 'adobe' },
  rug: { w: 4.6, d: 3.6, h: 0.03, shape: 'flat', n: 11, name: '地毯', where: '会员休息室', base: 'clothRed' },
  sofa: { w: 2.4, d: 0.95, h: 0.85, shape: 'sofa', n: 12, name: '沙发', where: '会员休息室', base: 'clothTeal' },
  'coffee-table': { w: 1.3, d: 0.7, h: 0.42, shape: 'table', n: 13, name: '茶几', where: '会员休息室', base: 'wood' },
  piano: { w: 1.5, d: 0.6, h: 1.3, shape: 'box', n: 14, name: '立式钢琴', where: '会员休息室', base: 'ironwork' },
  // ── 咖啡吧 ──
  'bar-counter': { w: 0.8, d: 6.2, h: 1.1, shape: 'counter', n: 15, name: '吧台', where: '咖啡吧', base: 'timber' },
  'back-bar': {
    w: 3.2,
    d: 0.55,
    h: 2.2,
    shape: 'shelves',
    n: 16,
    name: '酒柜 + 咖啡机',
    where: '咖啡吧',
    base: 'wood',
  },
  'bar-stool': { w: 0.42, d: 0.42, h: 0.75, shape: 'stool', n: 17, name: '吧凳', where: '咖啡吧', base: 'metal' },
  'cafe-table': {
    w: 1.6,
    d: 0.8,
    h: 0.75,
    shape: 'cafetable',
    n: 18,
    name: '小圆桌 + 两把椅子',
    where: '咖啡吧',
    base: 'metal',
  },
  // ── 后厨 ──
  'kitchen-line': {
    w: 5.0,
    d: 0.8,
    h: 0.95,
    shape: 'counter',
    n: 19,
    name: '灶台一排（带油烟罩）',
    where: '后厨',
    base: 'metal',
  },
  shelves: { w: 3.6, d: 0.5, h: 2.0, shape: 'shelves', n: 20, name: '储物架', where: '后厨', base: 'wood' },
  'prep-table': { w: 2.0, d: 0.9, h: 0.9, shape: 'table', n: 21, name: '备餐台', where: '后厨', base: 'metal' },
  // ── 行政办公室 ──
  desk: {
    w: 1.6,
    d: 0.8,
    h: 0.76,
    shape: 'desk',
    n: 22,
    name: '办公桌（总监的）',
    where: '行政办公室',
    base: 'timber',
  },
  'schedule-board': {
    w: 2.0,
    d: 0.08,
    h: 1.2,
    shape: 'board',
    n: 23,
    name: '场地排班板',
    where: '行政办公室',
    base: 'slate',
  },
  'filing-cabinet': { w: 0.9, d: 0.5, h: 1.3, shape: 'box', n: 24, name: '文件柜', where: '行政办公室', base: 'metal' },
  // ── 会员前厅 ──
  'trophy-case': { w: 3.0, d: 0.5, h: 2.0, shape: 'shelves', n: 25, name: '奖杯柜', where: '会员前厅', base: 'timber' },
  'honours-board': {
    w: 2.4,
    d: 0.3,
    h: 2.0,
    shape: 'box',
    n: 26,
    name: '荣誉榜（落地展板）',
    where: '会员前厅',
    base: 'timber',
  },
  // ── 穿线台 ──
  'stringing-machine': {
    w: 0.9,
    d: 0.9,
    h: 1.15,
    shape: 'machine',
    n: 27,
    name: '穿线机',
    where: '穿线台',
    base: 'metal',
  },
  workbench: {
    w: 3.0,
    d: 0.7,
    h: 0.9,
    shape: 'table',
    n: 28,
    name: '工作台（线盘、工具）',
    where: '穿线台',
    base: 'wood',
  },
  'racket-rack': {
    w: 2.4,
    d: 0.3,
    h: 1.8,
    shape: 'shelves',
    n: 29,
    name: '拍子架（穿好待取）',
    where: '穿线台',
    base: 'wood',
  },
  // ── 专卖店 ──
  'racket-wall': { w: 4.0, d: 0.4, h: 2.2, shape: 'shelves', n: 30, name: '拍子墙', where: '专卖店', base: 'timber' },
  'shop-counter': { w: 2.0, d: 0.6, h: 1.0, shape: 'box', n: 31, name: '收银台', where: '专卖店', base: 'counter' },
  'clothes-rack': {
    w: 1.4,
    d: 0.5,
    h: 1.5,
    shape: 'rail',
    n: 32,
    name: '衣架（球衣、帽子）',
    where: '专卖店',
    base: 'clothBlue',
  },
  'window-display': {
    w: 1.6,
    d: 0.6,
    h: 1.7,
    shape: 'box',
    n: 33,
    name: '橱窗展台（模特 + 拍子）',
    where: '专卖店',
    base: 'clothWhite',
  },
  // ── 走廊 ──
  'notice-board': {
    w: 1.6,
    d: 0.08,
    h: 1.1,
    shape: 'board',
    n: 34,
    name: '会员公告板',
    where: '球员走廊',
    base: 'woodWeathered',
  },
  // ── 更衣室 ──
  lockers: { w: 5.4, d: 0.5, h: 2.0, shape: 'lockers', n: 35, name: '储物柜一排', where: '更衣室', base: 'seat' },
  'locker-bench': { w: 0.4, d: 4.0, h: 0.45, shape: 'box', n: 36, name: '更衣长凳', where: '更衣室', base: 'wood' },
  showers: { w: 4.0, d: 1.0, h: 2.1, shape: 'showers', n: 37, name: '淋浴间', where: '更衣室', base: 'clothWhite' },
  // ── 理疗室 ──
  'physio-table': {
    w: 0.75,
    d: 1.9,
    h: 0.75,
    shape: 'table',
    n: 38,
    name: '理疗床',
    where: '理疗室',
    base: 'clothTeal',
  },
  'ice-bath': { w: 0.9, d: 1.5, h: 0.7, shape: 'tub', n: 39, name: '冰浴桶', where: '理疗室', base: 'metal' },
  // ── 钟楼底 ──
  stairs: {
    w: 1.3,
    d: 3.2,
    h: STOREY.gf,
    shape: 'stairs',
    n: 40,
    name: '楼梯（上二楼、钟楼）',
    where: '钟楼底',
    base: 'tile',
  },
};

export const SPECS: Record<string, Spec> = {
  ...(PLAZA_SPECS as Record<string, Spec>),
  ...NEW_SPECS,
  // 复用的：标签高度、导航脚印用
  bench: { w: 1.7, d: 0.6, h: 0.9, shape: 'box' },
  pot: { w: 0.75, d: 0.75, h: 0.85, shape: 'column' },
  director: { w: 0.5, d: 0.4, h: 1.8, shape: 'person' },
  player: { w: 0.5, d: 0.4, h: 1.8, shape: 'person' },
  coach: { w: 0.5, d: 0.4, h: 1.8, shape: 'person' },
};

export function placeholder(ctx: AssetCtx, asset: string): THREE.Object3D {
  const base = SPECS[asset] ?? { w: 1, d: 1, h: 1, shape: 'box' as const };
  // 拱窗的变体 1 = 专卖店的拱形橱窗（大一号）
  const sp = asset === 'arch-window' && ctx.variant === 1 ? { ...base, w: 1.8, h: 2.5 } : base;
  // ?accent=2 = 颜色白模：占位的灰换成计划的主体材质（量"画完以后"的饱和度用；评审默认还是灰）
  const key: keyof Pal = ctx.params.get('accent') === '2' && sp.base ? sp.base : 'placeholder';
  const m = ctx.mat(key);
  /** 朝镜头的竖直面（门、窗、招牌、柜子正面）：留住灰的中档，不接投影（同 clubfood 车身的做法） */
  const face = ctx.mat(key, { lightUp: 0.55, bands: [-0.45, 0.35], noShadowReceive: true });
  const dark = ctx.mat('ironwork', { noShadowReceive: true });
  const g = new THREE.Group();
  const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0, mm: THREE.Material = m) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mm);
    o.position.set(x, y + h / 2, z);
    g.add(o);
    return o;
  };
  const mesh = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, mm: THREE.Material = m) => {
    const o = new THREE.Mesh(geo, mm);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  /** 半圆拱顶（竖直的半个圆柱，轴沿 z）：拱窗、拱门的上半 */
  const archTop = (r: number, d: number, x: number, y: number, z: number, mm: THREE.Material = m) =>
    mesh(
      new THREE.CylinderGeometry(r, r, d, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(-Math.PI / 2),
      x,
      y,
      z,
      mm,
    );
  const { w, d, h } = sp;
  switch (sp.shape) {
    case 'tower': {
      // 钟楼：塔身（9.6 以下实心）+ 钟室（四面各一个拱洞：四根角柱 + 中间挂一口钟）+ 檐口 + 红瓦尖顶（四坡锥）
      const [b0, b1] = TOWER.belfry;
      box(w, b0, d);
      box(w + 0.3, 0.3, d + 0.3, 0, b0 - 0.3);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) box(0.7, b1 - b0, 0.7, (sx * (w - 0.7)) / 2, b0, (sz * (d - 0.7)) / 2);
      box(w - 1.4, 0.2, d - 1.4, 0, b0, 0);
      mesh(new THREE.CylinderGeometry(0.35, 0.6, 0.9, 10), 0, b1 - 0.9, 0);
      box(w, TOWER.h - b1, d, 0, b1);
      box(w + 0.4, 0.25, d + 0.4, 0, TOWER.h - 0.25);
      const cone = key === 'placeholder' ? m : ctx.mat('roofTile');
      mesh(
        new THREE.ConeGeometry((w + 0.5) * 0.71, TOWER.roof, 4).rotateY(Math.PI / 4),
        0,
        TOWER.h + TOWER.roof / 2,
        0,
        cone,
      );
      // 朝镜头的一面：一道窄窗 + 南门（拱廊转角里看得到的门洞）
      box(0.5, 1.6, 0.05, 0, 5.6, d / 2 + 0.01, dark);
      box(1.4, 2.6, 0.05, 0.4, 0, d / 2 + 0.01, dark);
      break;
    }
    case 'doorway': {
      // 正门：两边壁柱 + 拱券门框 + 门洞（深色）+ 门楣上的小盾牌
      for (const sx of [-1, 1]) box(0.38, 3.0, d, (sx * (w - 0.38)) / 2, 0, 0, face);
      archTop(w / 2, d, 0, 3.0, 0, face);
      box(w - 0.76, 3.0, 0.04, 0, 0, d / 2 + 0.01, dark);
      box(0.5, 0.45, 0.1, 0, 3.0 + w / 2 - 0.1, d / 2, face);
      break;
    }
    case 'archwin': {
      // 拱窗：窗框 + 半圆拱顶 + 深色玻璃 + 铁花窗栅（三根竖条）
      const r = w / 2;
      const hr = h - r;
      box(w, 0.12, d + 0.06, 0, 0, 0, face); // 窗台
      for (const sx of [-1, 1]) box(0.14, hr, d, (sx * (w - 0.14)) / 2, 0, 0, face);
      archTop(r, d, 0, hr, 0, face);
      box(w - 0.28, hr, 0.04, 0, 0.12, d / 2 - 0.05, dark);
      for (const sx of [-1, 0, 1]) box(0.06, hr - 0.1, 0.06, sx * (w / 4), 0.12, d / 2, m);
      break;
    }
    case 'balcony': {
      // 铁艺阳台：托架 + 板 + 栏杆（顶扶手 + 竖条）+ 后面的落地门
      box(w, 0.15, d, 0, 0, 0);
      for (const sx of [-1, 1]) box(0.15, 0.4, 0.5, sx * (w / 2 - 0.3), -0.4, -0.05);
      box(w, 0.07, 0.07, 0, h - 0.07, d / 2 - 0.04);
      for (let i = 0; i <= 8; i++) box(0.05, h - 0.15, 0.05, -w / 2 + 0.05 + (i * (w - 0.1)) / 8, 0.15, d / 2 - 0.04);
      box(1.1, 2.1, 0.05, 0, 0.15, -d / 2 + 0.02, dark);
      break;
    }
    case 'vine': {
      // 三角梅：顺着柱子往上爬的几团（以后是洋红花团），顶上在拱券上沿铺开一片
      for (let i = 0; i < 4; i++)
        mesh(
          new THREE.SphereGeometry(0.32 + i * 0.04, 8, 6),
          (i % 2 ? 0.12 : -0.12) * (i + 1) * 0.6,
          0.6 + i * 0.85,
          0,
        );
      mesh(new THREE.SphereGeometry(0.5, 8, 6).scale(1.6, 0.7, 0.8), 0.1, h - 0.3, 0);
      break;
    }
    case 'wallfountain': {
      // 花砖壁泉：贴墙的一块花砖背板（顶上半圆）+ 出水口 + 半圆小池
      box(w, h - w / 2, 0.15, 0, 0, -d / 2 + 0.075, face);
      archTop(w / 2, 0.15, 0, h - w / 2, -d / 2 + 0.075, face);
      box(0.12, 0.12, 0.25, 0, 1.3, -d / 2 + 0.25);
      mesh(
        new THREE.CylinderGeometry(w / 2, w / 2, 0.55, 12, 1, false, -Math.PI / 2, Math.PI),
        0,
        0.275,
        -d / 2 + 0.15,
      );
      break;
    }
    case 'fireplace': {
      // 壁炉：炉身（贴北墙）+ 深色炉口 + 炉台板 + 上面的烟道（到顶）
      box(w, 1.3, d);
      box(w + 0.2, 0.1, d + 0.15, 0, 1.3, 0.02);
      box(1.2, 0.85, 0.05, 0, 0.1, d / 2 + 0.01, dark);
      box(w * 0.6, h - 1.4, d * 0.7, 0, 1.4, -d * 0.15);
      break;
    }
    case 'flat':
      box(w, Math.max(h, 0.02), d);
      break;
    case 'sofa': {
      // 沙发：座 + 靠背（本地 −z 那边）+ 两边扶手
      box(w, 0.42, d - 0.2, 0, 0, 0.1);
      box(w, h, 0.25, 0, 0, -d / 2 + 0.125);
      for (const sx of [-1, 1]) box(0.22, 0.62, d, (sx * (w - 0.22)) / 2, 0, 0);
      break;
    }
    case 'table': {
      // 桌：桌面 + 四条腿
      box(w, 0.06, d, 0, h - 0.06, 0);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) box(0.08, h - 0.06, 0.08, (sx * (w - 0.16)) / 2, 0, (sz * (d - 0.16)) / 2);
      break;
    }
    case 'counter': {
      // 柜台：柜身 + 台面（出沿 0.05）；灶台另加一块油烟罩
      box(w, h - 0.06, d, 0, 0, 0, face);
      box(w + 0.1, 0.06, d + 0.1, 0, h - 0.06, 0);
      if (asset === 'kitchen-line') box(w * 0.9, 0.5, 0.6, 0, 1.9, -d / 2 + 0.3);
      break;
    }
    case 'shelves': {
      // 架子 / 柜：背板 + 四层板 + 两侧板（正面敞开）
      box(w, h, 0.06, 0, 0, -d / 2 + 0.03);
      for (const sx of [-1, 1]) box(0.06, h, d, (sx * (w - 0.06)) / 2, 0, 0);
      for (let i = 0; i < 4; i++) box(w - 0.12, 0.05, d - 0.06, 0, 0.1 + (i * (h - 0.2)) / 3, 0.03);
      // 架上的东西（几块小盒）
      for (let i = 0; i < 3; i++)
        for (let k = -1; k <= 1; k++) box(0.22, 0.28, 0.2, (k * w) / 3.5, 0.15 + (i * (h - 0.2)) / 3, 0.02);
      break;
    }
    case 'stool': {
      mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.08, 10), 0, h - 0.04, 0);
      mesh(new THREE.CylinderGeometry(0.05, 0.05, h - 0.08, 6), 0, (h - 0.08) / 2, 0);
      mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 10), 0, 0.02, 0);
      break;
    }
    case 'cafetable': {
      // 小圆桌（中间）+ 东西两把椅子
      mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12), 0, h - 0.025, 0);
      mesh(new THREE.CylinderGeometry(0.05, 0.05, h - 0.05, 6), 0, (h - 0.05) / 2, 0);
      for (const sx of [-1, 1]) {
        box(0.42, 0.45, 0.42, sx * 0.62, 0, 0);
        box(0.06, 0.45, 0.42, sx * 0.8, 0.45, 0);
      }
      break;
    }
    case 'desk': {
      // 办公桌（正面朝镜头）+ 后面的椅子 + 桌上一台显示器（背对镜头）+ 一摞文件
      box(w, 0.06, d, 0, h - 0.06, 0);
      for (const sx of [-1, 1]) box(0.06, h - 0.06, d, (sx * (w - 0.06)) / 2, 0, 0);
      box(w - 0.12, h - 0.3, 0.04, 0, 0.2, d / 2 - 0.04, face);
      box(0.5, 0.45, 0.5, 0, 0, -d / 2 - 0.45);
      box(0.5, 0.5, 0.08, 0, 0.45, -d / 2 - 0.7);
      box(0.55, 0.38, 0.05, -0.2, h, -0.15, dark);
      box(0.3, 0.12, 0.22, 0.5, h, 0.1);
      break;
    }
    case 'board':
      // 挂墙的板（板底 = 放置点的 y）
      box(w, h, d, 0, 0, 0, face);
      break;
    case 'machine': {
      // 穿线机：立柱 + 底座 + 转台 + 夹着的一把拍子（竖着）
      box(0.5, 0.06, 0.5, 0, 0, 0);
      mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.85, 8), 0, 0.45, 0);
      mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.06, 12), 0, 0.9, 0);
      box(0.3, 0.02, 0.68, 0, 0.95, 0);
      break;
    }
    case 'rail': {
      // 衣架：两根立柱 + 横杆 + 一排挂着的衣服（一条块）
      for (const sx of [-1, 1]) box(0.05, h, 0.05, (sx * (w - 0.05)) / 2, 0, 0);
      box(w, 0.05, 0.05, 0, h - 0.05, 0);
      box(w - 0.2, 0.75, 0.4, 0, h - 0.85, 0);
      break;
    }
    case 'lockers': {
      // 储物柜一排：柜体（正面每 0.45 米一道竖缝，深色）
      box(w, h, d, 0, 0, 0, face);
      for (let x = -w / 2 + 0.45; x < w / 2 - 0.1; x += 0.45) box(0.03, h - 0.1, 0.02, x, 0.05, d / 2 + 0.005, dark);
      break;
    }
    case 'showers': {
      // 淋浴间：背墙 + 隔板（每 1 米一块）+ 顶上的花洒杆
      box(w, h, 0.08, 0, 0, -d / 2 + 0.04);
      for (let i = 0; i <= 4; i++) box(0.05, h - 0.2, d, -w / 2 + (i * w) / 4, 0, 0);
      for (let i = 0; i < 4; i++) box(0.06, 0.06, 0.3, -w / 2 + (i + 0.5) * (w / 4), h - 0.3, -d / 2 + 0.2);
      break;
    }
    case 'tub':
      // 冰浴桶：一只圆角的大桶（壁 + 深色的水）
      mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 14).scale(1, 1, d / w), 0, h / 2, 0);
      mesh(new THREE.CylinderGeometry(w / 2 - 0.08, w / 2 - 0.08, 0.02, 14).scale(1, 1, d / w), 0, h + 0.005, 0, dark);
      break;
    case 'stairs': {
      // 楼梯：从南（本地 +z）往北（−z）上，一级 0.18 米高；上到一层顶
      const n = Math.round(h / 0.2);
      const run = d / n;
      for (let i = 0; i < n; i++) box(w, ((i + 1) * h) / n, run, 0, 0, d / 2 - (i + 0.5) * run);
      break;
    }
    default:
      return plazaPlaceholder(ctx, asset);
  }
  g.traverse((o) => {
    o.castShadow = true;
  });
  ctx.mats.prepare(g);
  return g;
}

/** 别的形状（column、person、box…）照 clubplaza 的占位 */
function plazaPlaceholder(ctx: AssetCtx, asset: string): THREE.Object3D {
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
  o.castShadow = true;
  g.add(o);
  ctx.mats.prepare(g);
  return g;
}
