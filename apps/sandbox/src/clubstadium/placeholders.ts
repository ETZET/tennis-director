// 占位：新资产还没画时，每个位置放一个冷灰的体块（明显是占位），大小 = docs/lab/2026-11-07-3d-pixel/clubstadium.md 的规格。
// 复用的资产（裁判椅、人、总监、蒲葵、长椅、工具架、植物）不用占位，直接是真的（reuse.ts）。
// 例外：观众（crowd）的占位直接用人物那套衣服 / 皮肤 / 草帽颜色画成最简单的坐着的小人（InstancedMesh）——
// 看台"明暗横带会不会变成一片噪点"是这个场景构图的问题本身，灰的看不出来（?crowd=grey 换成灰的）。
// 本地原点 = 落地点（y 0 = 地面），+z 朝镜头（南），+x 朝东；尺寸米。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SPECS as DESK_SPECS, type Spec as DeskSpec } from '../clubdesk/placeholders';
import type { AssetCtx } from './ctx';
import { CROWD, northTread, SCOREBOARD, STANDS, tier } from './layout';
import type { Pal } from './palette';

/** 每个资产的大致外形（米）：w 宽（x）、d 深（z）、h 高；shape 决定占位的样子；n = 清单编号（标签里显示） */
export interface Spec {
  w: number;
  d: number;
  h: number;
  shape:
    | DeskSpec['shape']
    | 'net'
    | 'umbrella'
    | 'sitter'
    | 'pbench'
    | 'drift'
    | 'crowd'
    | 'bigboard'
    | 'flag'
    | 'gate'
    | 'marker'
    | 'ball';
  crown?: number;
  n?: number;
  /** 中文短名（标签） */
  name?: string;
}

/** 新资产（这个场景要从零画的，或和别的场景共享的）的规格；和 clubstadium.md 的清单一致 */
export const NEW_SPECS: Record<string, Spec> = {
  'stadium-stands': { w: 43.6, d: 27.8, h: 6.8, shape: 'box', n: 1, name: '看台（北 / 东 / 南，色块白模）' },
  crowd: { w: 40, d: 26, h: 6.6, shape: 'crowd', n: 2, name: '观众（便宜的坐着的人）' },
  'stadium-scoreboard': {
    w: SCOREBOARD.w,
    d: SCOREBOARD.d,
    h: SCOREBOARD.y0 + SCOREBOARD.h,
    shape: 'bigboard',
    n: 3,
    name: '大记分牌',
  },
  'player-bench': { w: 1.8, d: 0.6, h: 1.05, shape: 'pbench', n: 4, name: '球员长椅（冰箱 + 毛巾）' },
  // 和 clubclay 共享（src/clubsite/assets/），尺寸照 clubclay.md
  'court-umbrella': { w: 2.4, d: 2.4, h: 2.55, shape: 'umbrella', n: 5, name: '场边遮阳伞（共享）' },
  'court-net': { w: 0.15, d: 12.8, h: 1.07, shape: 'net', n: 6, name: '球网（共享）' },
  umpire: { w: 0.7, d: 0.8, h: 1.3, shape: 'sitter', n: 7, name: '裁判（sit 姿势）' },
  'sand-drift': { w: 3.0, d: 1.0, h: 0.14, shape: 'drift', n: 8, name: '积沙' },
  'line-marker': { w: 0.7, d: 1.3, h: 0.95, shape: 'marker', n: 9, name: '划线车' },
  'players-gate': { w: 1.2, d: 6.2, h: 4.2, shape: 'gate', n: 10, name: '球员通道（拱门）' },
  'stadium-flag': { w: 1.3, d: 0.2, h: 4.2, shape: 'flag', n: 11, name: '旗杆' },
  // 和 clubplaza 共享
  'drink-fountain': { w: 0.5, d: 0.45, h: 1.0, shape: 'column', n: 12, name: '饮水点（共享）' },
  'ball-fly': { w: 0.2, d: 0.2, h: 0.2, shape: 'ball', name: '球' },
};

export const SPECS: Record<string, Spec> = {
  ...(DESK_SPECS as Record<string, Spec>),
  ...NEW_SPECS,
  'umpire-chair': { w: 1.0, d: 1.0, h: 2.3, shape: 'box' },
  'tool-rack': { w: 2.4, d: 0.9, h: 2.2, shape: 'box' },
};

export function placeholder(ctx: AssetCtx, asset: string): THREE.Object3D {
  const sp = SPECS[asset] ?? { w: 1, d: 1, h: 1, shape: 'box' as const };
  const m = ctx.mat('placeholder');
  const g = new THREE.Group();
  const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y + h / 2, z);
    g.add(o);
    return o;
  };
  const mesh = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  switch (sp.shape) {
    case 'crowd':
      g.add(buildCrowd(ctx));
      break;
    case 'net': {
      // 沿 z 的一道网（场地东西向 → 网南北向，yaw 0 下侧对镜头：一条竖的网带 + 两根网柱），同 clubclay 的占位
      const len = sp.d - 0.6;
      box(0.08, 0.914 - 0.12, len, 0, 0.05, 0);
      box(0.12, 0.12, len, 0, 0.914 - 0.12, 0);
      for (const s of [-1, 1]) box(0.24, sp.h, 0.24, 0, 0, (s * sp.d) / 2 - s * 0.12);
      break;
    }
    case 'umbrella': {
      // 伞杆 + 底座 + 八角伞面（往下斜的扁锥），同 clubclay 的占位
      box(0.5, 0.12, 0.5);
      box(0.08, sp.h - 0.1, 0.08);
      mesh(new THREE.ConeGeometry(sp.w / 2, 0.55, 8).rotateY(Math.PI / 8), 0, sp.h - 0.35, 0);
      box(0.1, 0.18, 0.1, 0, sp.h - 0.08, 0);
      break;
    }
    case 'sitter': {
      // 坐着的人：大腿往前伸、小腿垂下，上身直，头（Q 版大头）。原点 = 座面以下 0.45（同 clubplaza 的 sitter）
      box(0.46, 0.62, 0.34, 0, 0.45, -0.1);
      box(0.42, 0.18, 0.46, 0, 0.42, 0.18);
      box(0.36, 0.42, 0.16, 0, 0.0, 0.36);
      mesh(new THREE.SphereGeometry(0.27, 10, 8), 0, 1.3, -0.08);
      break;
    }
    case 'pbench': {
      // 球员长椅：两把带靠背的椅子 + 中间一只冰箱（饮料）+ 椅背上搭一条毛巾
      for (const x of [-0.6, 0.6]) {
        box(0.55, 0.45, 0.5, x, 0, 0.02);
        box(0.55, 0.55, 0.1, x, 0.45, -0.22);
      }
      box(0.5, 0.48, 0.42, 0, 0, 0.04);
      box(0.3, 0.3, 0.1, -0.6, 0.72, -0.16);
      break;
    }
    case 'drift': {
      // 积沙：贴着地的一条扁沙包（半个压扁的球），两头尖
      const geo = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      geo.scale(sp.w / 2, sp.h, sp.d / 2);
      mesh(geo);
      if (ctx.variant === 0) {
        const tail = new THREE.SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2);
        tail.scale(0.7, sp.h * 0.6, 0.35);
        mesh(tail, sp.w / 2 + 0.4, 0, 0.15);
      }
      break;
    }
    case 'marker': {
      // 划线车：小料桶（白漆）+ 两个轮子 + 前面一只滚轮 + 往后上斜的推把（推把朝 −z）
      box(0.45, 0.4, 0.5, 0, 0.18, 0.15);
      for (const x of [-0.3, 0.3])
        mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 10).rotateZ(Math.PI / 2), x, 0.17, 0.0);
      mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8).rotateZ(Math.PI / 2), 0, 0.08, 0.5);
      const h = box(0.08, 0.08, 0.9, 0, 0.62, -0.35);
      h.rotation.x = -0.6;
      box(0.5, 0.08, 0.08, 0, 0.88, -0.7);
      break;
    }
    case 'gate': {
      // 球员通道：两根白灰泥门柱（门洞朝东西）+ 一根顺着 z 的门楣 + 红瓦小坡顶；门楣南头挂一块俱乐部蓝的牌子
      const span = sp.d - 2;
      for (const s of [-1, 1]) box(1.0, 3.2, 1.0, 0, 0, (s * (span + 1)) / 2);
      box(1.0, 0.7, sp.d, 0, 3.2, 0);
      box(1.2, 0.3, sp.d + 0.2, 0, 3.9, 0);
      box(0.14, 0.9, 1.2, 0.58, 2.2, 0);
      break;
    }
    case 'flag': {
      // 旗杆（2 纹素粗）+ 一面旗（往东飘）
      box(0.18, sp.h, 0.18);
      box(1.1, 0.75, 0.06, 0.62, sp.h - 0.85, 0);
      break;
    }
    case 'bigboard': {
      // 大记分牌：两根钢腿从看台后面的地上立起来 + 一块朝南的牌面（上面一条名牌、两行比分、右边一块局分）
      const y0 = SCOREBOARD.y0;
      for (const x of [-sp.w / 2 + 0.8, sp.w / 2 - 0.8]) box(0.4, y0 + 0.4, 0.4, x, 0, -0.1);
      box(sp.w, SCOREBOARD.h, sp.d, 0, y0, 0);
      box(sp.w - 0.6, 0.5, 0.1, 0, y0 + SCOREBOARD.h - 0.75, sp.d / 2 + 0.04);
      for (let r = 0; r < 2; r++) {
        box(3.4, 0.62, 0.1, -1.4, y0 + 0.4 + r * 0.82, sp.d / 2 + 0.04);
        for (let c = 0; c < 3; c++) box(0.5, 0.62, 0.1, 1.2 + c * 0.7, y0 + 0.4 + r * 0.82, sp.d / 2 + 0.04);
      }
      break;
    }
    case 'ball': {
      // 球（这个不用画：desert3d-v2 的球就是一颗 2 纹素的荧光黄球）
      const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), ctx.mat('ball', { noShadowReceive: true }));
      g.add(o);
      break;
    }
    case 'column':
      mesh(new THREE.CylinderGeometry(sp.w * 0.45, sp.w * 0.5, sp.h, 10), 0, sp.h / 2);
      break;
    case 'person':
      mesh(new THREE.CapsuleGeometry(sp.w * 0.4, sp.h - sp.w * 0.8, 4, 8), 0, sp.h / 2);
      break;
    default:
      box(sp.w, sp.h, sp.d);
  }
  ctx.mats.prepare(g);
  return g;
}

// ── 观众：每种颜色一个 InstancedMesh（衣服 5 + 皮肤 3 + 帽子 2 = 10 次 draw call，≈ 450 人、2 万三角形）──
/** 人物的明暗（同 desert3d-v2 的 PERSON：光往上偏 → 朝镜头的胸口落中档、头顶和帽顶落亮档；不接收投影） */
const PERSON = { lightUp: 0.6, bands: [-0.45, 0.3] as [number, number], noShadowReceive: true, edge: 0.45 };
const SHIRTS: (keyof Pal)[] = ['clothWhite', 'canvas', 'clothBlue', 'clothRed', 'flowerYellow'];
const SKINS: (keyof Pal)[] = ['skinLight', 'skinTan', 'skinDark'];
const HATS: (keyof Pal)[] = ['straw', 'clothWhite'];

/** 一个座位：世界位置（座面高）、朝向 */
interface Seat {
  x: number;
  y: number;
  z: number;
  rotY: number;
  block: number;
}

/** 所有看台的座位（按 CROWD 的块切），座面 = 踏面 + 座高；北看台走道上不放 */
export function seats(): Seat[] {
  const out: Seat[] = [];
  const P = STANDS.seatPitch;
  const aisleHalf = STANDS.aisleW / 2 + 0.12;
  CROWD.forEach((b, bi) => {
    if (b.stand === 'north') {
      for (let k = 0; k < STANDS.north.n; k++) {
        const t = northTread(k);
        const z = t.zb + STANDS.seatD / 2 + 0.04;
        for (let x = b.a0 + P / 2; x < b.a1; x += P) {
          if (STANDS.aisles.some((a) => Math.abs(x - a) < aisleHalf + P / 2 - 0.05)) continue;
          out.push({ x, y: t.y + STANDS.seatH, z, rotY: 0, block: bi * 10 + k });
        }
      }
    } else if (b.stand === 'east') {
      const e = STANDS.east;
      for (let k = 0; k < e.n; k++) {
        const t = tier(k, e.rise, e.deep);
        const x = e.front + t.b - STANDS.seatD / 2 - 0.04;
        for (let z = b.a0 + P / 2; z < b.a1; z += P)
          out.push({ x, y: t.top + STANDS.seatH, z, rotY: -Math.PI / 2, block: bi * 10 + k });
      }
    } else {
      const s = STANDS.south;
      for (let k = 0; k < s.n; k++) {
        const t = tier(k, s.rise, s.deep);
        const z = s.front + t.b - STANDS.seatD / 2 - 0.04;
        for (let x = b.a0 + P / 2; x < b.a1; x += P)
          out.push({ x, y: t.top + STANDS.seatH, z, rotY: Math.PI, block: bi * 10 + k });
      }
    }
  });
  return out;
}

/**
 * 观众（占位版）：每个块按 fill 一组一组地坐（2～4 个连座一组，组之间空 1～3 个），一组人一半同色；六成的人戴帽子。
 * 本地坐标 = 世界坐标（SLOTS 里放在原点）。userData.count = 人数。
 */
export function buildCrowd(ctx: AssetCtx): THREE.Object3D {
  const grey = ctx.params.get('crowd') === 'grey';
  const rnd = ctx.rng('stadium:crowd');
  const g = new THREE.Group();
  g.name = 'crowd';
  // 一个人：上身 + 大腿（一个几何体，衣服色），头（皮肤），帽子（檐 + 顶）。原点 = 座面中心，人朝 +z
  const body = mergeGeometries([
    new THREE.BoxGeometry(0.4, 0.42, 0.26).translate(0, 0.21, -0.06),
    new THREE.BoxGeometry(0.36, 0.14, 0.38).translate(0, 0.07, 0.17),
  ]);
  const head = new THREE.BoxGeometry(0.34, 0.32, 0.32).translate(0, 0.58, -0.05);
  const hat = mergeGeometries([
    new THREE.BoxGeometry(0.46, 0.05, 0.46).translate(0, 0.72, -0.04),
    new THREE.BoxGeometry(0.32, 0.12, 0.32).translate(0, 0.8, -0.05),
  ]);
  const lists = {
    body: SHIRTS.map(() => [] as THREE.Matrix4[]),
    head: SKINS.map(() => [] as THREE.Matrix4[]),
    hat: HATS.map(() => [] as THREE.Matrix4[]),
  };
  const pick = (w: number[]) => {
    const sum = w.reduce((a, b) => a + b, 0);
    let r = rnd() * sum;
    for (let i = 0; i < w.length; i++) {
      r -= w[i];
      if (r <= 0) return i;
    }
    return w.length - 1;
  };
  const all = seats();
  let i = 0;
  let count = 0;
  while (i < all.length) {
    const s0 = all[i];
    const b = CROWD[Math.floor(s0.block / 10)];
    const row = s0.block % 10;
    const fill = b.fill[row] ?? 0;
    // 一组：2～4 个连座（同一排），坐不坐按 fill；组后面空 0～2 个
    const n = 2 + Math.floor(rnd() * 3);
    const sit = rnd() < fill;
    const groupShirt = pick(b.shirts);
    for (let j = 0; j < n && i < all.length && all[i].block === s0.block; j++, i++) {
      if (!sit) continue;
      const s = all[i];
      const shirt = rnd() < 0.5 ? groupShirt : pick(b.shirts);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(s.x + (rnd() - 0.5) * 0.06, s.y, s.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.rotY + (rnd() - 0.5) * 0.3, 0)),
        new THREE.Vector3().setScalar(0.92 + rnd() * 0.14),
      );
      lists.body[shirt].push(m);
      lists.head[pick([4, 3, 2])].push(m);
      if (rnd() < 0.62) lists.hat[pick([3, 2])].push(m);
      count++;
    }
    if (rnd() < 0.5) i += Math.floor(rnd() * 2);
  }
  const inst = (geo: THREE.BufferGeometry, key: keyof Pal, ms: THREE.Matrix4[], name: string) => {
    if (!ms.length) return;
    const mat = grey ? ctx.mat('placeholder', PERSON) : ctx.mat(key, PERSON);
    const im = new THREE.InstancedMesh(geo, mat, ms.length);
    ms.forEach((m, k) => {
      im.setMatrixAt(k, m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = false;
    im.name = name;
    g.add(im);
  };
  SHIRTS.forEach((k, j) => {
    inst(body, k, lists.body[j], `crowd:body:${k}`);
  });
  SKINS.forEach((k, j) => {
    inst(head, k, lists.head[j], `crowd:head:${k}`);
  });
  HATS.forEach((k, j) => {
    inst(hat, k, lists.hat[j], `crowd:hat:${k}`);
  });
  g.userData.count = count;
  return g;
}
