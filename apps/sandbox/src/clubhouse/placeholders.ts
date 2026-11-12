// 占位：新资产还没画时，每个位置放一个冷灰的体块（明显是占位），大小 = docs/lab/2026-11-07-3d-pixel/clubhouse.md 的清单。
// 会所的"壳"（墙、地、屋顶）不是占位：terrain.ts 用现成材质（白灰泥、红瓦、陶砖、木地板）直接建，墙上的门窗是方洞；
// 这里只放要单独画的东西：钟楼、正门、拱窗、阳台、烟囱、招牌、三角梅、壁泉（外观）+ 里面每间房的家具。
// 复用的资产（人、长椅、陶罐、龙舌兰、蒲葵、灌木）不用占位，直接是真的（reuse.ts）。
// 本地原点 = 落地点（y 0 = 地面 / 楼板），+z = 正面（朝镜头），+x 朝东；尺寸米。
import * as THREE from 'three';
import { SPECS as PLAZA_SPECS } from '../clubplaza/placeholders';
import type { AssetCtx } from './ctx';
import { TOWER } from './layout';
import type { Pal } from './palette';
import type { Spec } from './spec';
import { SPECS_1F } from './specs-1f';
import { SPECS_2F } from './specs-2f';
import { SPECS_B1 } from './specs-b1';
import { BASE_SPECS } from './specs-base';

export type { Spec } from './spec';
/** 新资产（这个场景要从零画的）的规格：#1…#41 原来的 + 三层各组的 */
export const NEW_SPECS: Record<string, Spec> = { ...BASE_SPECS, ...SPECS_1F, ...SPECS_2F, ...SPECS_B1 };

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
