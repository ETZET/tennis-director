// 占位：新资产还没画时，每个位置放一个冷灰的体块（明显是占位），大小 = docs/lab/2026-11-07-3d-pixel/clubgolf.md 的规格。
// ?accent=2 = "颜色白模"：占位的灰换成计划的主体材质（量画完以后的饱和度用；评审默认还是灰）。
// 复用的资产（人、蒲葵、palo verde、红岩、仙人球、龙舌兰、长椅）不用占位，直接是真的（reuse.ts）。
// 本地原点 = 落地点（y 0 = 地面），+z 朝镜头（南），+x 朝东；尺寸米。
import * as THREE from 'three';
import type { GripSpec } from '../clubsite/people';
import type { AssetCtx } from './ctx';
import { GOLF_GATE } from './layout';
import type { Pal } from './palette';

/** 每个资产的大致外形（米）：w 宽（x）、d 深（z）、h 高；shape 决定占位的样子；n = 清单编号（标签里显示） */
export interface Spec {
  w: number;
  d: number;
  h: number;
  shape:
    | 'box'
    | 'person'
    | 'flag'
    | 'cart'
    | 'bag'
    | 'teeset'
    | 'rake'
    | 'gate'
    | 'ducks'
    | 'runner'
    | 'ball'
    | 'club'
    | 'putter';
  n?: number;
  /** 中文短名（标签） */
  name?: string;
  /** 计划的主体材质（?accent=2 的颜色白模里占位的灰换成它） */
  base?: keyof Pal;
  /** 第二种材质（旗面、车顶、球包的包身……）：?accent=2 才用 */
  acc?: keyof Pal;
}

/** 新资产（这个场景要从零画的）的规格；和 clubgolf.md 的清单一致 */
export const NEW_SPECS: Record<string, Spec> = {
  flagstick: { w: 0.6, d: 0.1, h: 2.3, shape: 'flag', n: 1, name: '旗杆 + 洞杯', base: 'clothWhite', acc: 'clothRed' },
  'golf-cart': { w: 2.4, d: 1.25, h: 1.9, shape: 'cart', n: 2, name: '球车', base: 'cartBody', acc: 'seat' },
  'golf-bag': {
    w: 0.4,
    d: 0.35,
    h: 1.15,
    shape: 'bag',
    n: 3,
    name: '球包（支架）',
    base: 'clothBlue',
    acc: 'ironwork',
  },
  'tee-markers': {
    w: 4.2,
    d: 0.6,
    h: 1.1,
    shape: 'teeset',
    n: 4,
    name: '发球台标志 + 洗球器',
    base: 'metal',
    acc: 'clothRed',
  },
  'bunker-rake': { w: 1.7, d: 0.5, h: 0.08, shape: 'rake', n: 5, name: '沙坑耙', base: 'clothWhite', acc: 'metal' },
  'golf-gate': {
    w: 6.5, // 门洞 4.3 + 东门柱 1.1 + 两边门扇开出去的余量
    d: 2.6,
    h: GOLF_GATE.h,
    shape: 'gate',
    n: 6,
    name: '高尔夫门（南墙）',
    base: 'ironwork',
    acc: 'adobe',
  },
  ducks: { w: 1.4, d: 0.6, h: 0.3, shape: 'ducks', n: 7, name: '水鸭 ×2', base: 'clothWhite', acc: 'seat' },
  roadrunner: { w: 0.6, d: 0.16, h: 0.35, shape: 'runner', n: 8, name: '走鹃', base: 'branch', acc: 'clothWhite' },
  'golf-ball': { w: 0.1, d: 0.1, h: 0.1, shape: 'ball', n: 9, name: '高尔夫球', base: 'clothWhite' },
  'golf-club': { w: 0.1, d: 0.12, h: 1.05, shape: 'club', n: 10, name: '球杆（手里）', base: 'metal' },
  putter: { w: 0.1, d: 0.14, h: 0.9, shape: 'putter', n: 11, name: '推杆（手里）', base: 'metal' },
};

export const SPECS: Record<string, Spec> = {
  ...NEW_SPECS,
  // 复用的：标签高度、画廊比例尺用
  player: { w: 0.5, d: 0.35, h: 1.8, shape: 'person' },
  director: { w: 0.5, d: 0.35, h: 1.8, shape: 'person' },
  'fan-palm': { w: 3, d: 3, h: 8, shape: 'box' },
  'palo-verde': { w: 4, d: 4, h: 4, shape: 'box' },
  rocks: { w: 2, d: 1.5, h: 1.2, shape: 'box' },
  bench: { w: 1.8, d: 0.6, h: 0.9, shape: 'box' },
};

/**
 * 手里拿的占位（球杆、推杆）的握点（clubsite/people/hold.ts 的约定：at 握点、axis 从握点指向杆头、up 杆面朝的方向、tip 杆头）。
 * 资产阶段照这个写进 userData.grip。
 */
export const GRIPS: Record<string, GripSpec> = {
  'golf-club': { at: [0, 0, 0], axis: [0, -1, 0], up: [0, 0, 1], tip: [0, -1.0, 0.04] },
  putter: { at: [0, 0, 0], axis: [0, -1, 0], up: [0, 0, 1], tip: [0, -0.86, 0.03] },
};

export function placeholder(ctx: AssetCtx, asset: string): THREE.Object3D {
  const sp = SPECS[asset] ?? { w: 1, d: 1, h: 1, shape: 'box' as const };
  const color = ctx.params.get('accent') === '2';
  const grey = color && sp.base ? ctx.mat(sp.base) : ctx.mat('placeholder');
  const acc = color && sp.acc ? ctx.mat(sp.acc) : grey;
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
  /** 轮子（轴沿 z：车身沿 x 时） */
  const wheel = (x: number, z: number, r: number, t = 0.16) =>
    mesh(new THREE.CylinderGeometry(r, r, t, 12).rotateX(Math.PI / 2), x, r, z);
  switch (sp.shape) {
    case 'flag': {
      // 旗杆（2 纹素粗）+ 顶上一面旗（往东飘）+ 脚下的洞杯（一个暗圈）
      box(0.09, sp.h, 0.09);
      box(0.55, 0.36, 0.04, 0.3, sp.h - 0.4, 0, acc);
      mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.02, 12),
        0,
        0.012,
        0,
        ctx.mat('ironwork', { noShadowReceive: true }),
      );
      break;
    }
    case 'cart': {
      // 球车（车身沿 x，车头朝 +x）：底盘 + 四个轮子 + 车身 + 座椅（座面 0.62）+ 四根柱子撑的平顶 + 车尾的球包架
      const L = sp.w;
      const Wd = sp.d;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(sx * (L / 2 - 0.4), sz * (Wd / 2 - 0.08), 0.22);
      box(L - 0.2, 0.3, Wd - 0.1, 0, 0.22, 0);
      box(0.55, 0.45, Wd - 0.1, L / 2 - 0.38, 0.5, 0); // 车头罩
      box(0.7, 0.12, Wd - 0.2, 0.1, 0.52, 0); // 座面
      box(0.12, 0.55, Wd - 0.2, -0.28, 0.62, 0); // 靠背
      for (const sx of [-0.32, L / 2 - 0.52])
        for (const sz of [-1, 1]) box(0.06, 1.2, 0.06, sx, 0.62, sz * (Wd / 2 - 0.1));
      box(L - 0.5, 0.08, Wd + 0.05, 0.1, sp.h - 0.08, 0, acc); // 平顶
      box(0.5, 0.9, Wd - 0.3, -L / 2 + 0.3, 0.52, 0); // 车尾的球包架（立着两只包）
      break;
    }
    case 'bag': {
      // 球包：斜靠在两条支腿上的圆筒 + 顶上几根杆头
      const tube = mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.9, 10), 0, 0.5, 0);
      tube.rotation.z = 0.25;
      box(0.04, 0.6, 0.04, -0.16, 0, 0.12);
      box(0.04, 0.6, 0.04, -0.16, 0, -0.12);
      box(0.22, 0.2, 0.2, 0.12, 0.92, 0, acc);
      break;
    }
    case 'teeset': {
      // 发球台：两个发球标志（大球，发球区前沿两头）+ 东头一根洗球器柱 + 一块小牌（洞号图标）
      for (const sx of [-1.5, 1.5]) mesh(new THREE.SphereGeometry(0.13, 10, 8), sx, 0.13, -0.2, acc);
      box(0.12, 0.95, 0.12, 2.3, 0, -0.9);
      box(0.32, 0.26, 0.22, 2.3, 0.85, -0.9);
      box(0.08, 0.7, 0.08, -2.3, 0, -1.1);
      box(0.6, 0.42, 0.06, -2.3, 0.62, -1.1);
      break;
    }
    case 'rake': {
      // 沙坑耙：躺在沙坑边，长柄 + 横的耙头
      box(1.5, 0.05, 0.05, 0, 0.02, 0);
      box(0.08, 0.06, 0.5, 0.78, 0.02, 0, acc);
      break;
    }
    case 'gate': {
      // 南墙的门（本地原点 = 门洞中心、墙的中线）：东门柱（西门柱是墙上原有的壁柱，地形画）+ 门楣（铁的拱梁，正中一块旗子图标牌）
      // + 两扇铁门往外（往南）开到 75°
      const hw = (GOLF_GATE.x1 - GOLF_GATE.x0) / 2;
      const pierX = GOLF_GATE.eastPier - GOLF_GATE.x;
      const adobe = color ? ctx.mat('adobe') : grey;
      box(1.1, 2.4, 1.1, pierX, 0, 0, adobe);
      box(1.3, 0.2, 1.3, pierX, 2.4, 0, color ? ctx.mat('cap') : grey);
      box(hw * 2 + 0.4, 0.16, 0.16, 0, sp.h - 0.3, 0);
      box(0.12, 0.6, 0.12, -hw, sp.h - 0.9, 0);
      box(0.12, 0.6, 0.12, hw, sp.h - 0.9, 0);
      box(0.7, 0.5, 0.06, 0, sp.h - 0.14, 0.02, acc);
      for (const side of [-1, 1]) {
        const leaf = new THREE.Group();
        const lw = hw - 0.05;
        const bar = (w: number, h: number, x: number, y: number) => {
          const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), grey);
          o.position.set(x, y + h / 2, 0);
          leaf.add(o);
        };
        bar(lw, 0.08, (-side * lw) / 2, 0.15);
        bar(lw, 0.08, (-side * lw) / 2, 1.55);
        for (let i = 0; i <= 4; i++) bar(0.06, 1.48, -side * (0.04 + (i * (lw - 0.08)) / 4), 0.15);
        leaf.position.set(side * hw, 0, 0.4);
        leaf.rotation.y = side * -1.3;
        g.add(leaf);
      }
      break;
    }
    case 'ducks': {
      // 两只鸭子浮在水面（本地 y 0 = 水面）
      for (const [x, z, r] of [
        [-0.35, 0, 0.2],
        [0.4, 0.15, 1.9],
      ] as const) {
        const d = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8).scale(1.5, 0.7, 1), grey);
        body.position.y = 0.05;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), acc);
        head.position.set(0.22, 0.2, 0);
        d.add(body, head);
        d.position.set(x, 0, z);
        d.rotation.y = r;
        g.add(d);
      }
      break;
    }
    case 'runner': {
      // 走鹃：横着跑的小鸟（身子 + 长尾巴 + 头冠 + 两条腿）
      mesh(new THREE.SphereGeometry(0.12, 10, 8).scale(1.4, 0.8, 0.8), 0.04, 0.24, 0);
      box(0.3, 0.05, 0.06, -0.26, 0.28, 0);
      mesh(new THREE.SphereGeometry(0.06, 8, 6), 0.2, 0.33, 0, acc);
      box(0.03, 0.18, 0.03, 0.02, 0, 0.03);
      box(0.03, 0.18, 0.03, 0.08, 0, -0.03);
      break;
    }
    case 'ball': {
      mesh(new THREE.SphereGeometry(0.05, 8, 6), 0, 0.05, 0);
      break;
    }
    case 'club': {
      // 球杆（握点在原点，往 −y 是杆头）：杆身 + 杆头
      box(0.05, 1.0, 0.05, 0, -1.0, 0);
      box(0.08, 0.06, 0.16, 0, -1.04, 0.05);
      break;
    }
    case 'putter': {
      box(0.05, 0.86, 0.05, 0, -0.86, 0);
      box(0.06, 0.05, 0.2, 0, -0.9, 0.06);
      break;
    }
    case 'person': {
      mesh(new THREE.CapsuleGeometry(sp.w * 0.4, sp.h - sp.w * 0.8, 4, 8), 0, sp.h / 2, 0);
      break;
    }
    default:
      box(sp.w, sp.h, sp.d);
  }
  g.traverse((o) => {
    o.castShadow = true;
  });
  ctx.mats.prepare(g);
  return g;
}
