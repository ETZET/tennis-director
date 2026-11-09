// 占位：新资产还没画时，每个位置放一个冷灰的体块（明显是占位），大小 = docs/lab/2026-11-07-3d-pixel/clubpool.md 的规格。
// 默认全灰（和别的场景一样）；?accent=1 = 只把提议的主色那一块涂上（躺椅垫、救生浮标、浮床、帐篷条纹）；
// ?accent=2 = 颜色白模：灰的部分也换成计划的主体材质（量"画完以后"的饱和度用）。
// 复用的资产（人、蒲葵、伞、毛巾车、捞网、落叶、拟八哥）不用占位，直接是真的（reuse.ts）。
// 本地原点 = 落地点（y 0 = 地面 / 平台顶面），+z 朝镜头（南），+x 朝东；尺寸米。
import * as THREE from 'three';
import { SPECS as PLAZA_SPECS, type Spec as PlazaSpec } from '../clubplaza/placeholders';
import type { AssetCtx } from './ctx';
import { FENCE, POOL_STEPS, PUMP } from './layout';
import type { Accent, Pal } from './palette';

/** 每个资产的大致外形（米）：w 宽（x）、d 深（z）、h 高；shape 决定占位的样子；n = 清单编号（标签里显示） */
export interface Spec {
  w: number;
  d: number;
  h: number;
  shape:
    | PlazaSpec['shape']
    | 'lounger'
    | 'sidetable'
    | 'guardchair'
    | 'cabana'
    | 'shower'
    | 'hamper'
    | 'fence'
    | 'gate'
    | 'steps'
    | 'ladder'
    | 'float'
    | 'poolsteps'
    | 'shed';
  crown?: number;
  n?: number;
  /** 中文短名（标签） */
  name?: string;
  /** 主色（?accent=1 时涂色的那一块） */
  acc?: Accent;
  /** 计划的主体材质（?accent=2 的"颜色白模"里占位的灰换成它） */
  base?: keyof Pal;
}

/** 新资产（这个场景要从零画的）的规格；和 clubpool.md 的清单一致 */
export const NEW_SPECS: Record<string, Spec> = {
  lounger: { w: 0.75, d: 2.0, h: 0.9, shape: 'lounger', n: 1, name: '躺椅', acc: 'accCushion', base: 'clothWhite' },
  'side-table': { w: 0.5, d: 0.5, h: 0.5, shape: 'sidetable', n: 2, name: '小边桌', base: 'clothWhite' },
  'lifeguard-chair': {
    w: 1.1,
    d: 1.4,
    h: 3.4,
    shape: 'guardchair',
    n: 3,
    name: '救生员高椅',
    acc: 'clothRed',
    base: 'clothWhite',
  },
  cabana: { w: 3.2, d: 2.6, h: 2.8, shape: 'cabana', n: 4, name: '帐篷', acc: 'canvasStripe', base: 'canvas' },
  'pool-shower': { w: 0.6, d: 0.6, h: 2.3, shape: 'shower', n: 5, name: '淋浴', base: 'metal' },
  'towel-hamper': {
    w: 0.7,
    d: 0.5,
    h: 0.8,
    shape: 'hamper',
    n: 6,
    name: '毛巾回收筐',
    acc: 'canvasStripe',
    base: 'timber',
  },
  'pool-fence': { w: 4, d: 0.2, h: FENCE.h, shape: 'fence', n: 7, name: '矮围栏', base: 'stucco' },
  'pool-gate': { w: 1.8, d: 0.25, h: 1.4, shape: 'gate', n: 8, name: '门（自闭门 + 规则牌）', base: 'ironwork' },
  'deck-steps': { w: 2.2, d: 0.9, h: 0.45, shape: 'steps', n: 9, name: '平台台阶', base: 'flagstone' },
  'pool-ladder': { w: 0.6, d: 0.5, h: 1.0, shape: 'ladder', n: 10, name: '扶手梯', base: 'metal' },
  'pool-float': {
    w: 1.5,
    d: 0.9,
    h: 1.0,
    shape: 'float',
    n: 11,
    name: '浮床 / 游泳圈',
    acc: 'accFlamingo',
    base: 'accFlamingo',
  },
  'pool-steps': {
    w: POOL_STEPS.x1 - POOL_STEPS.x0,
    d: POOL_STEPS.z1 - POOL_STEPS.z0,
    h: 0.05,
    shape: 'poolsteps',
    n: 12,
    name: '浅水台阶',
    base: 'stucco',
  },
  'pump-house': { w: PUMP.d, d: PUMP.w, h: PUMP.h, shape: 'shed', n: 13, name: '泵房', base: 'adobe' },
};

export const SPECS: Record<string, Spec> = {
  ...(PLAZA_SPECS as Record<string, Spec>),
  ...NEW_SPECS,
  // 复用的：标签高度用
  'court-umbrella': { w: 2.4, d: 2.4, h: 2.6, shape: 'box' },
  'towel-cart': { w: 1.2, d: 0.6, h: 1.1, shape: 'box' },
  kid: { w: 0.4, d: 0.3, h: 1.0, shape: 'person' },
};

/** 占位（opts.len：围栏这一段的长） */
export function placeholder(ctx: AssetCtx, asset: string, opts: { len?: number } = {}): THREE.Object3D {
  const sp = SPECS[asset] ?? { w: 1, d: 1, h: 1, shape: 'box' as const };
  const mode = ctx.params.get('accent') ?? '0';
  const grey = mode === '2' && sp.base ? ctx.mat(sp.base) : ctx.mat('placeholder');
  /** 主色那一块：?accent=1 / 2 涂色，默认灰 */
  const acc = (k?: Accent) => (mode !== '0' && k ? ctx.mat(k) : grey);
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
  const v = ctx.variant;
  switch (sp.shape) {
    case 'lounger': {
      // 躺椅：白框（两条边框 + 四条腿）+ 垫子（主色）+ 靠背（头那头，−z）。v0 靠背立起 + 垫子；v1 放平 + 一条毛巾；v2 立起 + 毛巾 + 包
      const L = sp.d;
      box(0.06, 0.12, L, -0.33, 0.22, 0);
      box(0.06, 0.12, L, 0.33, 0.22, 0);
      for (const x of [-0.3, 0.3]) for (const z of [-L / 2 + 0.15, L / 2 - 0.15]) box(0.06, 0.24, 0.06, x, 0, z);
      // 座垫（脚那段 1.3 米）
      box(0.62, 0.08, 1.3, 0, 0.34, L / 2 - 0.65, acc(sp.acc));
      // 靠背（头那段 0.7 米）：v1 放平，v0 / v2 立起 50°
      const back = box(0.62, 0.08, 0.7, 0, 0.34, 0, acc(sp.acc));
      if (v % 3 === 1) back.position.set(0, 0.38, -L / 2 + 0.35);
      else {
        back.rotation.x = 0.87;
        back.position.set(0, 0.34 + 0.27, -L / 2 + 0.45);
      }
      if (v % 3 !== 0) box(0.5, 0.03, 0.9, 0, 0.42, L / 2 - 0.7, acc('canvasStripe'));
      if (v % 3 === 2) box(0.3, 0.22, 0.2, 0.55, 0, L / 2 - 0.4);
      break;
    }
    case 'sidetable': {
      // 小边桌：圆桌面 + 一根腿 + 一只杯子 / 一瓶防晒霜
      mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 12), 0, 0.48, 0);
      box(0.06, 0.46, 0.06, 0, 0, 0);
      mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.14, 8), 0.08, 0.57, 0.04, acc('flowerYellow'));
      break;
    }
    case 'guardchair': {
      // 救生员高椅：四根斜腿（脚 1.1 × 1.4，顶 0.8 × 0.8）+ 一侧的梯级（南面，三根横档）+ 座（1.8）+ 靠背 + 扶手 + 顶上一把小伞（3.4）
      // + 挂在扶手上的红色救生浮标（主色）
      const seatY = 1.8;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const leg = box(0.1, seatY, 0.1, sx * 0.45, 0, sz * 0.55);
          leg.rotation.set(sz * -0.07, 0, sx * 0.07);
        }
      for (const y of [0.55, 1.05, 1.5]) box(0.8, 0.07, 0.12, 0, y, 0.5);
      box(0.8, 0.08, 0.6, 0, seatY, 0);
      box(0.8, 0.7, 0.08, 0, seatY, -0.3);
      for (const x of [-0.4, 0.4]) box(0.06, 0.3, 0.55, x, seatY + 0.1, 0);
      box(0.05, 1.3, 0.05, 0.3, seatY, -0.36);
      mesh(new THREE.ConeGeometry(0.75, 0.3, 8), 0.3, seatY + 1.45, -0.36);
      box(0.9, 0.16, 0.16, 0.45, seatY - 0.35, 0.1, acc(sp.acc)).rotation.z = 1.2;
      break;
    }
    case 'cabana': {
      // 帐篷：四根柱 + 三面帆布（北、东、西；南面敞开朝池子）+ 四坡帆布顶（主色条纹）+ 里面一张双人垫子
      const { w, d, h } = sp;
      const wallH = h - 0.7;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) box(0.1, wallH, 0.1, (sx * (w - 0.1)) / 2, 0, (sz * (d - 0.1)) / 2);
      box(w, wallH, 0.05, 0, 0, -d / 2 + 0.03);
      for (const sx of [-1, 1]) box(0.05, wallH, d * 0.6, (sx * (w - 0.05)) / 2, 0, -d * 0.2);
      // 顶：四坡（拉长的四棱锥）
      const roof = new THREE.ConeGeometry(Math.hypot(w, d) / 2 + 0.1, 0.8, 4).rotateY(Math.PI / 4).scale(w / d, 1, 1);
      mesh(roof, 0, wallH + 0.4, 0, acc(sp.acc));
      box(w - 0.6, 0.35, 1.4, 0, 0, -d / 2 + 0.85);
      break;
    }
    case 'shower': {
      // 户外淋浴：一根立柱（2.3）+ 顶上弯出来的喷头 + 脚下一块排水格栅 + 一只踩阀
      box(0.1, sp.h, 0.1, 0, 0, -0.2);
      box(0.1, 0.08, 0.45, 0, sp.h - 0.08, 0);
      mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.08, 10), 0, sp.h - 0.16, 0.2);
      box(0.6, 0.03, 0.6, 0, 0, 0.05);
      if (v % 2 === 1) box(0.4, 1.1, 0.06, 0, 0, -0.27);
      break;
    }
    case 'hamper': {
      // 毛巾回收筐：藤筐（梯形）+ 筐口冒出来的一团用过的毛巾（主色条纹）
      mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.6, 4).rotateY(Math.PI / 4).scale(1.2, 1, 0.85), 0, 0.3, 0);
      mesh(new THREE.SphereGeometry(0.26, 8, 5).scale(1.1, 0.55, 0.8), 0, 0.62, 0, acc(sp.acc));
      break;
    }
    case 'fence': {
      // 矮围栏一段（沿本地 x，长 len）：灰泥矮墙（0.45）+ 上面一条铁艺栏板（画成一条暗带，不画细杆）+ 每 3 米一根灰泥柱（1.3）
      const L = opts.len ?? sp.w;
      box(L, 0.45, 0.24, 0, 0, 0);
      box(L, 0.6, 0.06, 0, 0.45, 0, mode === '2' ? ctx.mat('ironwork') : grey);
      box(L + 0.06, 0.06, 0.1, 0, 1.05, 0, mode === '2' ? ctx.mat('ironwork') : grey);
      const n = Math.max(1, Math.round(L / 3));
      for (let i = 0; i <= n; i++) box(0.34, 1.3, 0.34, -L / 2 + (i * L) / n, 0, 0);
      break;
    }
    case 'gate': {
      // 门：两根门柱（1.4，顶上一只灯）+ 自闭的铁门（暗带，往里开一点）+ 门柱上一块规则牌（图标：不许跳水、不许玻璃杯、救生员）
      // v1 = 工作门（窄 1.0，没有牌）
      const gw = v % 2 === 1 ? 1.0 : sp.w;
      for (const s of [-1, 1]) box(0.36, sp.h, 0.36, (s * (gw + 0.36)) / 2, 0, 0);
      const leaf = box(gw - 0.1, 0.9, 0.05, 0, 0.15, 0, mode === '2' ? ctx.mat('ironwork') : grey);
      leaf.rotation.y = 0.35;
      if (v % 2 === 0) box(0.5, 0.6, 0.05, -(gw + 0.36) / 2, 0.55, 0.2, acc('canvasStripe'));
      break;
    }
    case 'steps': {
      // 三级台阶（平台 0.45 → 地面 0）：平台在本地 +z，往 −z 下；v1 = 窄的工作门台阶（1.2）
      const sw = v % 2 === 1 ? 1.2 : sp.w;
      const run = sp.d / 3;
      for (let i = 0; i < 3; i++) box(sw, 0.15 * (3 - i), run, 0, 0, sp.d / 2 - run * (i + 0.5));
      break;
    }
    case 'ladder': {
      // 扶手梯（池沿上两根弯扶手，往池里下）：本地原点在池沿上，池子在 +z（rotY π 的那把池子在 −z）
      for (const x of [-0.25, 0.25]) {
        box(0.07, 0.75, 0.07, x, 0.08, -0.15);
        box(0.07, 0.07, 0.45, x, 0.8, 0.05);
        box(0.07, 0.95, 0.07, x, -0.3, 0.28);
      }
      break;
    }
    case 'float': {
      // v0 火烈鸟浮床：一团胖身子 + 竖起来的脖子和头（主色）；v1 游泳圈（主色 / 白相间，套在孩子腰上）
      if (v % 2 === 0) {
        mesh(new THREE.SphereGeometry(0.5, 10, 6).scale(1.5, 0.5, 0.9), 0, 0.1, 0, acc(sp.acc));
        box(0.14, 0.9, 0.14, 0.62, 0.15, 0, acc(sp.acc)).rotation.z = -0.2;
        box(0.3, 0.14, 0.16, 0.6, 1.0, 0, acc(sp.acc));
      } else mesh(new THREE.TorusGeometry(0.36, 0.12, 6, 14).rotateX(Math.PI / 2), 0, 0.05, 0, acc('clothRed'));
      break;
    }
    case 'poolsteps': {
      // 浅水台阶（池里，东头）：三级白灰泥台阶，最上一级比水面低一点（资产阶段在水的 shader 里画成水下的浅色带）；
      // 白模里贴着水面放三条浅色板，看得到位置
      const { w, d } = sp;
      for (let i = 0; i < 3; i++) box(w / 3 - 0.06, 0.02 + i * 0.01, d - i * 0.6, w / 2 - (w / 3) * (i + 0.5), 0.0, 0);
      break;
    }
    case 'shed': {
      // 泵房（本地 +z = 门那面）：土坯小房 + 平顶出檐 + 门 + 门口一只过滤罐、两只氯桶
      const { w, d, h } = sp;
      box(w, h, d, 0, 0, 0);
      box(w + 0.4, 0.15, d + 0.4, 0, h, 0);
      box(0.9, 2.0, 0.06, -0.6, 0, d / 2 + 0.02, mode === '2' ? ctx.mat('ironwork') : grey);
      mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 10), 0.9, 0.5, d / 2 + 0.45);
      for (const x of [0.2, -0.15]) mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.4, 8), x, 0.2, d / 2 + 0.35);
      break;
    }
    default:
      return plazaPlaceholder(ctx, asset);
  }
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
  g.add(o);
  ctx.mats.prepare(g);
  return g;
}
