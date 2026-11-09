// 围栏：锈柱子 + 顶横杆（实体，进描边）、铁丝网（镂空半透明，FX 图层）、褪色的绿色挡风布（风里撕开、甩动）。
// 东侧长边中间是门，只剩一个铰链吊着。
import * as THREE from 'three';
import { FENCE } from '../../layout';
import { ClothBatch, type ClothPiece } from './cloth';
import { type Bag, mat, rusty, TINT } from './kit';

type Mesh = 'ok' | 'lean' | 'bulge' | 'sag' | 'missing';
type Screen = 'none' | 'intact' | 'flap' | 'half' | 'shred';

interface Side {
  /** 柱子的 (x, z) */
  posts: [number, number][];
  /** 朝场内的法线 */
  n: THREE.Vector3;
  mesh: Mesh[];
  screen: Screen[];
  /** 倾斜的柱子：下标 → 顶部偏移（米，沿外法线、沿围栏） */
  lean?: Record<number, [number, number]>;
}

const H = FENCE.h;
const xs = (z: number, n: number) =>
  Array.from({ length: n + 1 }, (_, i) => [-FENCE.hw + (i * 2 * FENCE.hw) / n, z] as [number, number]);
const zs = (x: number, z0: number, z1: number, n: number) =>
  Array.from({ length: n + 1 }, (_, i) => [x, z0 + ((z1 - z0) * i) / n] as [number, number]);

const SIDES: Side[] = [
  {
    // 北（远处）：挡风布最完整
    posts: xs(-FENCE.hl, 6),
    n: new THREE.Vector3(0, 0, 1),
    mesh: ['ok', 'ok', 'bulge', 'ok', 'sag', 'ok'],
    screen: ['intact', 'half', 'none', 'shred', 'none', 'flap'],
  },
  {
    // 西（远处）
    posts: zs(-FENCE.hw, -FENCE.hl, FENCE.hl, 12),
    n: new THREE.Vector3(1, 0, 0),
    mesh: ['ok', 'ok', 'ok', 'lean', 'lean', 'ok', 'missing', 'ok', 'ok', 'bulge', 'ok', 'ok'],
    screen: ['intact', 'intact', 'flap', 'shred', 'none', 'intact', 'none', 'half', 'intact', 'none', 'flap', 'intact'],
    lean: { 4: [0.75, 0.15] },
  },
  {
    // 南（近处）：挡风布基本没了，网也塌了一段
    posts: xs(FENCE.hl, 6),
    n: new THREE.Vector3(0, 0, -1),
    mesh: ['ok', 'missing', 'ok', 'lean', 'lean', 'ok'],
    screen: ['shred', 'none', 'none', 'none', 'none', 'none'],
    lean: { 4: [0.9, -0.2] },
  },
  {
    // 东北半段（近处）
    posts: zs(FENCE.hw, -FENCE.hl, FENCE.gateZ - FENCE.gateW / 2, 6),
    n: new THREE.Vector3(-1, 0, 0),
    mesh: ['ok', 'ok', 'sag', 'ok', 'ok', 'ok'],
    screen: ['none', 'flap', 'none', 'none', 'shred', 'none'],
  },
  {
    // 东南半段（近处）
    posts: zs(FENCE.hw, FENCE.gateZ + FENCE.gateW / 2, FENCE.hl, 6),
    n: new THREE.Vector3(-1, 0, 0),
    mesh: ['ok', 'bulge', 'ok', 'ok', 'missing', 'ok'],
    screen: ['none', 'none', 'half', 'none', 'none', 'shred'],
  },
];

const steel = rusty('post', 0.3, 0.8, 'postRust');
const white = new THREE.Color(1, 1, 1);
const tint = (t: [number, number, number]) => new THREE.Color(t[0], t[1], t[2]);

export interface FenceCtx {
  bag: Bag;
  links: ClothBatch;
  cloth: ClothBatch;
  rnd: () => number;
  makeBag(): Bag;
  linkMat: THREE.Material;
  fxLayer: number;
}

export function buildFence(ctx: FenceCtx): { gate: THREE.Group; update(t: number, wind: THREE.Vector2): void } {
  const { bag, links, cloth, rnd } = ctx;
  const seen = new Set<string>();
  const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  for (const side of SIDES) {
    const along =
      side.posts.length > 1
        ? v3(side.posts[1][0] - side.posts[0][0], 0, side.posts[1][1] - side.posts[0][1]).normalize()
        : v3(1, 0, 0);
    const out = side.n.clone().negate();
    const top = (i: number) => {
      const [x, z] = side.posts[i];
      const l = side.lean?.[i];
      const p = v3(x, H, z);
      if (l) p.addScaledVector(out, l[0]).addScaledVector(along, l[1]);
      return p;
    };
    const bottom = (i: number) => v3(side.posts[i][0], 0, side.posts[i][1]);

    // 柱子
    side.posts.forEach(([x, z], i) => {
      const key = `${x.toFixed(2)},${z.toFixed(2)}`;
      if (seen.has(key)) return;
      seen.add(key);
      const corner = Math.abs(Math.abs(x) - FENCE.hw) < 0.01 && Math.abs(Math.abs(z) - FENCE.hl) < 0.01;
      const gatePost = Math.abs(Math.abs(z - FENCE.gateZ) - FENCE.gateW / 2) < 0.01 && x > 0;
      const r = corner || gatePost ? 0.13 : 0.1;
      const b = bottom(i);
      const t = top(i)
        .clone()
        .add(v3(0, 0.12, 0));
      bag.rod(b.clone().setY(-0.2), t, r, steel, 6, 5);
      // 帽子、底座
      bag.rod(t, t.clone().add(v3(0, 0.08, 0)), r + 0.04, 'rustDark', 6);
      bag.rod(b.clone().setY(-0.05), b.clone().setY(0.12), r + 0.09, 'concrete', 7);
    });

    // 每一跨
    for (let k = 0; k < side.posts.length - 1; k++) {
      const st = side.mesh[k];
      const a0 = bottom(k).setY(0.06);
      const b0 = bottom(k + 1).setY(0.06);
      const a1 = top(k).addScaledVector(v3(0, 1, 0), -0.05);
      const b1 = top(k + 1).addScaledVector(v3(0, 1, 0), -0.05);
      const width = a0.distanceTo(b0);

      // 顶横杆
      if (st === 'missing') {
        // 横杆一头掉下来斜插在地上
        const hang = a1.clone().lerp(b1, 0.85).setY(0.05).addScaledVector(side.n, 0.6);
        bag.rod(a1, hang, 0.075, steel, 6, 4);
        // 卷成一团的铁丝网（实体小团，看得出是"一卷"）
        const roll = a0.clone().lerp(b0, 0.45).addScaledVector(out, 0.5);
        bag.rod(
          roll.clone().addScaledVector(along, -0.7).setY(0.22),
          roll.clone().addScaledVector(along, 0.6).setY(0.22),
          0.22,
          rusty('steelDark', 0.4, 0.5),
          7,
          3,
        );
        continue;
      }
      bag.rod(a1.clone().setY(a1.y + 0.05), b1.clone().setY(b1.y + 0.05), 0.075, steel, 6, 6);

      // 铁丝网
      const at = (u: number, v: number) => {
        const t0 = a1.clone().lerp(b1, u);
        const bt = a0.clone().lerp(b0, u);
        const p = t0.lerp(bt, v);
        if (st === 'bulge')
          p.addScaledVector(out, 0.45 * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.2)));
        if (st === 'sag') {
          // 网从横杆上脱开，右半边塌下来往外翻
          const s = THREE.MathUtils.smoothstep(u, 0.35, 0.9);
          const drop = s * 1.4 * (1 - v);
          p.y -= drop;
          p.addScaledVector(out, s * 0.55 * (1 - v) * (1 - v));
        }
        return p;
      };
      const rustSeed = rnd();
      const linkNu = Math.max(4, Math.round(width / 0.5));
      const linkPiece: ClothPiece = {
        nu: linkNu,
        nv: 6,
        pos: at,
        normal: side.n,
        free: () => 0,
        // 锈只成大块：三成的跨下半截是锈色
        color: (_i, j) => (rustSeed < 0.3 && j >= 3 ? tint(TINT.rust) : white),
        keep:
          st === 'sag' ? (i, j) => (i >= linkNu * 0.65 && j < 1 ? 0 : 1) : (_i, j) => (rnd() < 0.03 && j > 1 ? 0 : 1),
        drift: 0,
        flutter: 0,
        uvPerMeter: 1 / 0.42,
        size: [width, H],
      };
      links.add(linkPiece);

      // 挡风布
      const sc = side.screen[k];
      if (sc !== 'none') cloth.add(windscreen(sc, at, side.n, width, rnd));
    }
  }

  // 门：一扇，只剩下面一个铰链，往外开、远端耷拉到地上
  const gateW = FENCE.gateW - 0.15;
  const gateH = 2.2;
  const gate = new THREE.Group();
  gate.position.set(FENCE.hw + 0.05, 0.35, FENCE.gateZ + FENCE.gateW / 2 - 0.08);
  const leaf = new THREE.Group();
  leaf.rotation.x = -0.15;
  gate.add(leaf);
  const a = v3(0, gateH - 0.3, -0.05);
  const b = v3(0, gateH - 0.3, -gateW);
  const c = v3(0, -0.3, -0.05);
  const d = v3(0, -0.3, -gateW);
  const fb = ctx.makeBag();
  const gs = rusty('steel', 0.4, 0.7);
  fb.rod(a, b, 0.07, gs, 6, 4);
  fb.rod(c, d, 0.07, gs, 6, 4);
  fb.rod(a.clone().setY(a.y + 0.07), c.clone().setY(c.y - 0.07), 0.07, gs);
  fb.rod(b.clone().setY(b.y + 0.07), d.clone().setY(d.y - 0.07), 0.07, gs);
  fb.rod(a.clone().lerp(c, 0.5), b.clone().lerp(d, 0.5), 0.06, gs);
  fb.rod(c, b, 0.05, gs);
  // 剩下的铰链和断掉的上铰链
  fb.box(0.16, 0.14, 0.16, mat(0.02, -0.15, -0.02), 'rustDark');
  fb.box(0.12, 0.1, 0.14, mat(0.0, gateH - 0.55, -0.05, 0, 0, 35), 'rust');
  leaf.add(fb.group());
  const gl = new ClothBatch();
  gl.add({
    nu: 4,
    nv: 4,
    pos: (u, v) => a.clone().lerp(b, u).lerp(c.clone().lerp(d, u), v),
    normal: v3(1, 0, 0),
    free: () => 0,
    keep: (i, j) => (i === 3 && j === 0 ? 0 : 1),
    color: (_i, j) => (j >= 2 ? tint(TINT.rust) : white),
    drift: 0,
    flutter: 0,
    uvPerMeter: 1 / 0.42,
    size: [gateW, gateH],
  });
  const glm = gl.build(ctx.linkMat);
  glm.layers.set(ctx.fxLayer);
  leaf.add(glm);

  const base = -0.95;
  return {
    gate,
    update(t, wind) {
      const ws = wind.length();
      gate.rotation.y = base + 0.07 * ws * Math.sin(t * 0.9) + 0.03 * Math.sin(t * 2.3) * ws;
    },
  };
}

/** 一块挡风布：at(u, v) 是这一跨铁丝网的形状 */
function windscreen(
  kind: Screen,
  at: (u: number, v: number) => THREE.Vector3,
  n: THREE.Vector3,
  width: number,
  rnd: () => number,
): ClothPiece {
  // 布覆盖 v ∈ [v0, v1]（离地 0.3 到 2.7 米左右），u 两边留一点
  const v0 = 0.12;
  const v1 = 0.88;
  const u0 = 0.03;
  const u1 = 0.97;
  const nu = Math.max(8, Math.round(width / 0.25));
  const nv = 10;
  const pos = (u: number, v: number) => at(u0 + (u1 - u0) * u, v0 + (v1 - v0) * v).addScaledVector(n, 0.07);
  // 破洞：不撒小洞，最多一个成块的洞（2×2 格）
  const holes = new Set<number>();
  if (rnd() < 0.6) {
    const hi = 1 + Math.floor(rnd() * (nu - 3));
    const hj = 2 + Math.floor(rnd() * (nv - 5));
    for (const [di, dj] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ])
      holes.add((hi + di) * nv + hj + dj);
  }
  const rag = Array.from({ length: nu + 1 }, () => rnd());
  // 撕开的一侧：上风（默认风朝 +x）那边绑着，下风那边甩出去
  const tiedLeft = n.z !== 0 ? true : rnd() < 0.5;
  // 整块一个颜色：有的晒褪了（偏浅），上沿包边深一档
  const body = rnd() < 0.35 ? tint(TINT.bleach) : new THREE.Color(0.97, 0.97, 0.97);
  const binding = new THREE.Color(0.72, 0.74, 0.78);
  const color = (_i: number, j: number) => (j === 0 ? binding : body);

  const base: Omit<ClothPiece, 'free' | 'drift' | 'flutter'> = { nu, nv, pos, normal: n, color, size: [width, 2.4] };

  switch (kind) {
    case 'intact':
      return {
        ...base,
        free: (u, v) => 0.6 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v),
        normalOnly: true,
        drift: 0.55,
        flutter: 0.06,
        freq: 3.5,
        keep: (i, j) => {
          if (holes.has(i * nv + j)) return 0;
          if (j === nv - 1 && rag[i] < 0.3) return rag[i] < 0.15 ? 2 : 3;
          return 1;
        },
      };
    case 'flap':
      // 下面的绑绳全断了：上沿绑着，下摆整片甩
      return {
        ...base,
        free: (_u, v) => v ** 1.1,
        drift: 0.9,
        flutter: 0.22,
        lift: 0.35,
        freq: 6,
        k: 2.5,
        keep: (i, j) => {
          const cut = nv - 1 - Math.floor(rag[i] * 3);
          if (j > cut) return 0;
          if (j === cut) return rag[i] < 0.5 ? 2 : 3;
          return holes.has(i * nv + j) && j > 2 ? 0 : 1;
        },
      };
    case 'half': {
      // 只剩一边绑着，像旗子一样顺风甩，甩出去的那头撕得参差不齐
      return {
        ...base,
        free: (u) => {
          const d = tiedLeft ? u : 1 - u;
          return Math.min(1, d * 1.15);
        },
        drift: 1.3,
        flutter: 0.3,
        lift: 0.2,
        freq: 7.5,
        k: 2.2,
        keep: (i, j) => {
          const d = tiedLeft ? i / nu : 1 - (i + 1) / nu;
          // 自由端的轮廓：越远越短
          const len = 1 - Math.max(0, d - 0.55) * 1.6 - rag[j % rag.length] * 0.12;
          if (j / nv > len || 1 - j / nv > len + 0.25) return 0;
          if (d > 0.88) return rag[j] < 0.5 ? 0 : 2;
          return holes.has(i * nv + j) ? 0 : 1;
        },
      };
    }
    case 'shred':
      // 撕成一条条，从上沿挂下来
      return {
        ...base,
        free: (_u, v) => v ** 0.9,
        drift: 0.8,
        flutter: 0.25,
        lift: 0.25,
        freq: 8,
        k: 3,
        keep: (i, j) => {
          if (i % 3 === 2) return 0;
          const len = Math.floor(nv * (0.35 + rag[Math.floor(i / 3) % rag.length] * 0.6));
          if (j > len) return 0;
          if (j === len) return i % 3 === 0 ? 3 : 2;
          return 1;
        },
      };
    default:
      throw new Error(kind);
  }
}
