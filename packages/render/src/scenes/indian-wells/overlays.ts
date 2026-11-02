import { mulberry32 } from '@td/shared';
import * as THREE from 'three';
import { COURT, net } from '../../props/court';
import { VoxelBatcher } from '../../voxel/batcher';
import { sign } from '../../voxel/text';
import { type BuildContext, jit, sr } from '../../world/build-context';
import { CourtFrame } from '../../world/frame';
import type { Stage } from '../../world/stage';
import { onTick } from './anim';
import { bench, boug, PAL, type PalmKind, palm, pickc, sandPile, tile, tumbleweed, umbrella } from './build';
import {
  CLUBHOUSE,
  F_O1,
  F_O2,
  F_O3,
  F_P1,
  F_P2,
  F_PB1,
  F_PB2,
  F_S1,
  FOUNTAIN,
  GROUNDS,
  PICKLE,
  POOL,
  STAD,
  TERRACE,
} from './layout';
import { createWear } from './wear';

/**
 * 设施状态的画面（ADR 0015：修好就是解锁，画面也跟着复原；ADR 0018：Palm Oasis 的八处设施）。
 * 每个 "设施.状态" 一层，模拟里设施换了状态就只显示那一层。
 * 开局的破败（积沙、倒网、褪色开裂的场地、空池子、枯棕榈）是一层；修好以后换上新场地、新网、绿草、
 * 有水的泳池和喷泉、亮灯的会所；掉档（worn）是褪色的场地、积沙、浑水。
 */

export interface FacilityOverlays {
  set(facility: string, state: string): void;
  /** 状况往下掉时的积沙、杂草、垃圾（wear.ts）：0 干净，1 快掉档，再往上已经掉档 */
  wear(facility: string, amount: number): void;
}

/** ctx 往这一层的批次里加盒子；g 是这一层（网、招牌这些单独的网格加在这里）；root 是整个场景（登记动画用） */
type Build = (ctx: BuildContext, g: THREE.Object3D, root: THREE.Object3D) => void;

function layer(root: THREE.Object3D, seed: number, build: Build): THREE.Group {
  const sc = new THREE.Scene();
  const ctx: BuildContext = { scene: sc, flat: new VoxelBatcher(), solid: new VoxelBatcher(), rand: mulberry32(seed) };
  const g = new THREE.Group();
  g.visible = false;
  build(ctx, g, root);
  if (ctx.flat.boxCount) ctx.flat.build(sc, false, true);
  if (ctx.solid.boxCount) ctx.solid.build(sc, false, true);
  g.add(...sc.children);
  root.add(g);
  return g;
}

const all =
  (...fs: Build[]): Build =>
  (ctx, g, root) => {
    for (const f of fs) f(ctx, g, root);
  };

/* ---------------- 每处设施修好以后的草地（一条深一条浅） ---------------- */

type Rect = { x0: number; x1: number; z0: number; z1: number };
const LAWNS: Readonly<Record<string, readonly Rect[]>> = {
  stadium_1: [{ x0: -34.5, x1: 34, z0: GROUNDS.z0, z1: -8.6 }],
  clubhouse: [{ x0: GROUNDS.x0, x1: -38.5, z0: GROUNDS.z0, z1: -1 }],
  stadium_2: [{ x0: GROUNDS.x0, x1: -38.5, z0: -1, z1: GROUNDS.z1 }],
  practice: [{ x0: -34.5, x1: 34, z0: -4.4, z1: 14.4 }],
  outer_1: [{ x0: -34.5, x1: 0, z0: 16.6, z1: GROUNDS.z1 }],
  outer_23: [{ x0: 0, x1: 34, z0: 16.6, z1: GROUNDS.z1 }],
  plaza: [
    { x0: 37, x1: GROUNDS.x1, z0: GROUNDS.z0, z1: -8.6 },
    { x0: 37, x1: GROUNDS.x1, z0: 16, z1: GROUNDS.z1 },
  ],
  stadium_3: [{ x0: 37, x1: GROUNDS.x1, z0: -4.4, z1: 16 }],
};

const lawn =
  (facility: string, col: readonly string[] = PAL.liveGrass): Build =>
  (ctx) => {
    for (const r of LAWNS[facility] ?? [])
      for (let x = r.x0; x < r.x1 - 1e-6; x += 2)
        for (let z = r.z0; z < r.z1 - 1e-6; z += 2) {
          const w = Math.min(2, r.x1 - x);
          const d = Math.min(2, r.z1 - z);
          const stripe = col[Math.floor((x - r.x0) / 4) % 2 ? 0 : 1] as string;
          ctx.flat.box(x + w / 2, 0, z + d / 2, w, 0.03, d, jit(ctx, stripe, 0.02));
        }
  };

/* ---------------- 球场 ---------------- */

type CourtKind = 'hard' | 'clay';

/** 一块场地面：大块拼起来，只带一点色差；faded 是掉档后褪色的样子 */
const courtFace =
  (fr: CourtFrame, kind: CourtKind, faded = false): Build =>
  (ctx) => {
    const y = fr.oy - 0.07;
    const box = (lx: number, lz: number, w: number, d: number, h: number, dy: number, col: string, amt: number) => {
      const p = fr.w({ x: lx, z: lz });
      ctx.flat.box(p.x, y + dy, p.z, w, h, d, jit(ctx, col, amt), fr.a);
    };
    const W = 2 * fr.hx;
    const D = 2 * fr.hz;
    const outer = kind === 'clay' ? (faded ? PAL.clayWorn : PAL.clay[0]) : faded ? PAL.courtOutWorn : PAL.dkGreen[0];
    const inner = kind === 'clay' ? outer : faded ? PAL.courtInWorn : PAL.purple[0];
    const n = 8;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < 4; j++)
        box(
          -W / 2 + (W / n) * (i + 0.5),
          -D / 2 + (D / 4) * (j + 0.5),
          W / n,
          D / 4,
          0.06,
          0,
          outer,
          faded ? 0.05 : 0.025,
        );
    const { HL, HWD, HWS, SL } = COURT;
    if (kind === 'hard')
      for (let i = 0; i < 4; i++) box(-HL + (HL / 2) * (i + 0.5), 0, HL / 2, 2 * HWD, 0.012, 0.06, inner, 0.02);
    const L = faded ? '#d8d2c2' : '#f6f4ee';
    const line = (x0: number, z0: number, x1: number, z1: number) =>
      box(
        (x0 + x1) / 2,
        (z0 + z1) / 2,
        Math.max(0.1, Math.abs(x1 - x0)),
        Math.max(0.1, Math.abs(z1 - z0)),
        0.01,
        0.072,
        L,
        0,
      );
    line(-HL, -HWD, -HL, HWD);
    line(HL, -HWD, HL, HWD);
    line(-HL, -HWD, HL, -HWD);
    line(-HL, HWD, HL, HWD);
    line(-HL, -HWS, HL, -HWS);
    line(-HL, HWS, HL, HWS);
    line(-SL, -HWS, -SL, HWS);
    line(SL, -HWS, SL, HWS);
    line(-SL, 0, SL, 0);
    if (faded)
      for (let k = 0; k < 14; k++) {
        const p = fr.w({ x: sr(ctx, -fr.hx + 1, fr.hx - 1), z: sr(ctx, -fr.hz + 1, fr.hz - 1) });
        ctx.flat.box(p.x, y + 0.074, p.z, sr(ctx, 1, 3), 0.004, 0.08, '#4a4e48', fr.a + sr(ctx, 0, 3));
      }
  };

/** 荒废的场地：褪色、开裂、网倒在地上 */
const ruinCourt =
  (fr: CourtFrame, kind: CourtKind): Build =>
  (ctx, g, root) => {
    courtFace(fr, kind, true)(ctx, g, root);
    const p = fr.w({ x: 0, z: -6.4 });
    ctx.solid.box(p.x, fr.oy, p.z, 0.12, 0.12, 1.1, '#2a332d', fr.a);
    for (let i = 0; i < 8; i++) {
      const q = fr.w({ x: sr(ctx, -0.6, 0.6), z: -5 + i * 1.4 });
      ctx.flat.box(q.x, fr.oy, q.z, 0.8, 0.05, 1.4, jit(ctx, '#2c2f2c', 0.06), fr.a + sr(ctx, -0.3, 0.3));
    }
  };

const lift = (fr: CourtFrame, dy: number) => new CourtFrame(fr.ox, fr.oy - 0.07 + dy, fr.oz, fr.a, fr.hx, fr.hz);

/** 网：new 是新网，sag 是塌着的旧网 */
const courtNet =
  (fr: CourtFrame, mode: 'new' | 'sag'): Build =>
  (ctx, g) =>
    net({ ...ctx, scene: g as THREE.Scene }, lift(fr, 0.03), mode);

/** 沙子盖住一块地方 */
const sanded =
  (fr: CourtFrame, n: number): Build =>
  (ctx) => {
    for (let k = 0; k < n; k++) {
      const p = fr.w({ x: sr(ctx, -fr.hx, fr.hx), z: sr(ctx, -fr.hz, fr.hz) });
      sandPile(ctx, p.x, fr.oy, p.z, sr(ctx, 1.4, 3.4));
    }
    for (let k = 0; k < 3; k++) {
      const p = fr.w({ x: sr(ctx, -fr.hx, fr.hx), z: fr.hz * (ctx.rand() < 0.5 ? -1 : 1) });
      tumbleweed(ctx, p.x, fr.oy, p.z);
    }
  };

/** 深绿挡风布（围网下半截），修好的场地才挂 */
const windscreen =
  (fr: CourtFrame): Build =>
  (ctx) => {
    for (const s of [-1, 1]) {
      const p = fr.w({ x: 0, z: s * fr.hz });
      ctx.solid.box(p.x, 0, p.z, 2 * fr.hx, 1.4, 0.06, jit(ctx, '#24402e', 0.02), fr.a);
    }
    for (const s of [-1, 1]) {
      const p = fr.w({ x: s * fr.hx, z: 0 });
      ctx.solid.box(p.x, 0, p.z, 0.06, 1.4, 2 * fr.hz, jit(ctx, '#24402e', 0.02), fr.a);
    }
  };

/** 场边：长椅和遮阳伞 */
const courtside =
  (fr: CourtFrame): Build =>
  (ctx) => {
    const p = fr.w({ x: 0, z: -fr.hz + 0.9 });
    bench(ctx, p.x, p.z, 3, fr.a);
    const q = fr.w({ x: -2.4, z: -fr.hz + 0.7 });
    umbrella(ctx, q.x, q.z, '#f4efe4', PAL.navy, 2.3, 1);
  };

const palms =
  (spots: readonly (readonly [number, number])[], kind: PalmKind): Build =>
  (ctx) => {
    for (const [x, z] of spots) palm(ctx, x, z, sr(ctx, 8, 11), kind);
  };

/* ---------------- 会员双打（outer_1）：喷雾杆和遮阳帆 ---------------- */

const misters: Build = (ctx) => {
  for (let i = -2; i <= 2; i++) {
    const x = F_O1.ox + i * 6;
    ctx.solid.box(x, 0, F_O1.oz - 8.1, 0.12, 2.8, 0.12, '#c9cccd');
    ctx.solid.box(x, 2.8, F_O1.oz - 7.9, 0.5, 0.12, 0.5, '#9aa0a3');
  }
  ctx.solid.box(F_O1.ox, 3.4, F_O1.oz - 7.4, 7, 0.06, 2.4, '#f4efe4', 0, 0.12);
};

/* ---------------- 青训（practice）：发球机、球筐、招牌 ---------------- */

const academy: Build = (ctx, g) => {
  const mx = F_P1.ox + 10.6;
  const mz = F_P1.oz;
  ctx.solid.box(mx, 0.1, mz, 0.85, 0.55, 0.7, '#2f5d8a');
  ctx.solid.box(mx, 0.65, mz, 0.8, 0.32, 0.8, '#1e1e1e');
  ctx.solid.box(mx, 0.97, mz, 0.7, 0.06, 0.7, '#d7e64a');
  const bx = F_P2.ox + 6.9;
  const bz = F_P2.oz - 0.6;
  for (const [u, v] of [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2],
  ] as const)
    ctx.solid.box(bx + u, 0, bz + v, 0.04, 0.55, 0.04, '#2c2c2c');
  for (let k = 0; k < 10; k++)
    ctx.solid.box(bx + sr(ctx, -0.2, 0.2), 0.45, bz + sr(ctx, -0.2, 0.2), 0.12, 0.12, 0.12, '#d7e64a');
  sign(g, '青训学院 · ACADEMY', 5.2, 0.55, 0, 1.05, F_P1.oz - 8.26, 0, PAL.navy, PAL.champ, 20);
};

/* ---------------- 会所 ---------------- */

const { x0: CX0, x1: CX1, z0: CZ0, z1: CZ1 } = CLUBHOUSE;

const clubhouseRuined: Build = (ctx) => {
  // 东立面的拱门钉着木板，屋顶缺瓦，门口积沙
  for (let z = CZ0 + 2; z < CZ1 - 1; z += 3.2) {
    ctx.solid.box(CX1 + 0.14, 0.1, z + 1.4, 0.08, 2.5, 1.7, jit(ctx, '#a8875a', 0.06));
    ctx.solid.box(CX1 + 0.2, 1.1, z + 1.4, 0.06, 0.18, 1.9, '#8a6a42', 0, 0.4);
  }
  for (let k = 0; k < 9; k++)
    ctx.solid.box(
      sr(ctx, CX0 + 2, CX1 - 8),
      8.2 + sr(ctx, 0, 0.9),
      sr(ctx, CZ0 + 3, CZ1 - 3),
      sr(ctx, 1, 2.4),
      0.2,
      sr(ctx, 1, 2),
      '#3a2e28',
    );
  for (let k = 0; k < 6; k++) sandPile(ctx, CX1 + sr(ctx, 1, 6), 0, sr(ctx, CZ0, CZ1), sr(ctx, 1.2, 2.6));
  for (let k = 0; k < 4; k++) tumbleweed(ctx, sr(ctx, TERRACE.x0, TERRACE.x1), 0.05, sr(ctx, TERRACE.z0, TERRACE.z1));
};

const clubhouseOpen: Build = (ctx, g) => {
  const lit = new VoxelBatcher();
  for (let z = CZ0 + 2; z < CZ1 - 1; z += 3.2) {
    ctx.solid.box(CX1 + 0.12, 0.1, z + 1.4, 0.06, 2.5, 1.7, '#7fb2c9');
    lit.box(CX1 + 0.16, 0.1, z + 1.4, 0.04, 2.5, 1.7, '#ffd890');
  }
  for (let z = CZ0 + 2; z < CZ1 - 2; z += 3.2) {
    ctx.solid.box(CX1 - 2.94, 4.9, z + 1.4, 0.1, 1.8, 1.4, '#7fb2c9');
    lit.box(CX1 - 2.88, 4.9, z + 1.4, 0.04, 1.8, 1.4, '#ffd890');
  }
  boug(ctx, CX1 + 0.5, 2.2, CZ0 + 3, 10, 1);
  boug(ctx, CX1 + 0.5, 2.2, CZ1 - 3, 10, 1);
  boug(ctx, CX1 + 0.5, 3.6, (CZ0 + CZ1) / 2, 6, 0.8);
  sign(g, 'PALM OASIS RACQUET CLUB', 12, 0.8, CX1 + 0.12, 3.6, (CZ0 + CZ1) / 2, Math.PI / 2, PAL.stucco, PAL.navy, 26);
  sign(g, 'PRO SHOP', 3, 0.5, CX1 + 0.12, 3, CZ0 + 4.4, Math.PI / 2, PAL.navy, PAL.champ, 18);
  // 露台餐桌和伞
  for (const [x, z] of [
    [-33, -31],
    [-29, -31],
    [-33, -24],
    [-29, -24],
    [-33, -17],
    [-29, -17],
  ] as const) {
    ctx.solid.box(x, 0, z, 0.1, 0.75, 0.1, '#2a2f36');
    ctx.solid.box(x, 0.75, z, 1.2, 0.06, 1.2, '#f4efe4');
    for (const s of [-1, 1]) ctx.solid.box(x, 0, z + s * 0.75, 0.42, 0.45, 0.42, '#e8e2d4');
    umbrella(ctx, x, z, '#f4efe4', PAL.navy, 2.6, 1.5);
  }
  // 露台上空的串灯，夜里和窗一起亮
  for (let k = 0; k < 6; k++)
    for (let x = TERRACE.x0 + 0.5; x < TERRACE.x1; x += 2.5)
      lit.box(x, 3.2 + Math.sin(x * 1.3 + k) * 0.15, TERRACE.z0 + 2 + k * 3.6, 0.12, 0.12, 0.12, '#ffe6a0');
  litMesh(lit, g, ctx.scene);
};

/** 会所掉档：一半窗户又钉上木板，灯不亮 */
const clubhouseWorn: Build = (ctx) => {
  for (let z = CZ0 + 2; z < CZ1 - 1; z += 3.2) {
    const boarded = ctx.rand() < 0.5;
    ctx.solid.box(CX1 + 0.12, 0.1, z + 1.4, 0.06, 2.5, 1.7, boarded ? jit(ctx, '#a8875a', 0.06) : '#5a6e78');
  }
  for (let k = 0; k < 3; k++) sandPile(ctx, CX1 + sr(ctx, 1, 5), 0, sr(ctx, CZ0, CZ1), sr(ctx, 1, 2));
};

/** 夜里亮的窗和串灯：MeshBasic，跟着灯的亮度变 */
function litMesh(lit: VoxelBatcher, g: THREE.Object3D, scene: THREE.Object3D): void {
  if (!lit.boxCount) return;
  const m = lit.build(scene, false, false);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, color: '#8a8270' });
  m.material = mat;
  const off = new THREE.Color('#8a8270');
  const on = new THREE.Color('#ffffff');
  lampFns.push((v) => mat.color.copy(off).lerp(on, v));
  g.add(m);
}
let lampFns: ((v: number) => void)[] = [];

/* ---------------- 棕榈喷泉（plaza） ---------------- */

const RING = Array.from({ length: 8 }, (_, k) => {
  const an = (k / 8) * Math.PI * 2;
  return [FOUNTAIN.x + Math.cos(an) * 9, FOUNTAIN.z + Math.sin(an) * 9] as const;
});

const fountainWater =
  (col: readonly string[]): Build =>
  (ctx, g, root) => {
    const { x, z } = FOUNTAIN;
    for (let i = -4; i < 4; i++)
      for (let j = -4; j < 4; j++)
        if (Math.hypot(i + 0.5, j + 0.5) < 4)
          ctx.flat.box(x + i + 0.5, 0.06, z + j + 0.5, 1, 0.3, 1, jit(ctx, pickc(ctx, col), 0.03));
    if (col === WATER) {
      // 顶上冒水：一小柱水上下跳
      const jet = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 1, 0.3),
        new THREE.MeshLambertMaterial({ color: '#cfeaf4' }),
      );
      jet.position.set(x, 3, z);
      g.add(jet);
      onTick(root, (now) => {
        jet.scale.y = 0.8 + Math.sin(now * 5) * 0.25;
        jet.position.y = 2.56 + jet.scale.y / 2;
      });
    }
  };
const WATER = ['#4fa8c8', '#5ab4d2', '#46a0c0'];
const MURKY = ['#6f8a5a', '#748f5e', '#68825a'];

const plazaDry: Build = all(palms(RING, 'dead'), (ctx) => {
  for (let k = 0; k < 6; k++)
    sandPile(ctx, FOUNTAIN.x + sr(ctx, -10, 10), 0.05, FOUNTAIN.z + sr(ctx, -10, 10), sr(ctx, 1, 2.4));
  for (let k = 0; k < 4; k++) tumbleweed(ctx, FOUNTAIN.x + sr(ctx, -11, 11), 0.05, FOUNTAIN.z + sr(ctx, -11, 11));
});

const plazaOpen: Build = all(fountainWater(WATER), palms(RING, 'ok'), lawn('plaza'), (ctx) => {
  for (let k = 0; k < 6; k++) {
    const an = (k / 6) * Math.PI * 2 + 0.3;
    boug(ctx, FOUNTAIN.x + Math.cos(an) * 6.5, 0.4, FOUNTAIN.z + Math.sin(an) * 6.5, 6, 0.7);
  }
});

const plazaWorn: Build = all(fountainWater(MURKY), palms(RING, 'ok'), (ctx) => {
  for (let k = 0; k < 3; k++)
    sandPile(ctx, FOUNTAIN.x + sr(ctx, -10, 10), 0.05, FOUNTAIN.z + sr(ctx, -10, 10), sr(ctx, 1, 2));
});

/* ---------------- 匹克球（stadium_3） ---------------- */

const PB_FRAMES = [F_PB1, F_PB2];

/** 一片匹克球场：蓝色场面、白线、矮网 */
const pickleCourt =
  (fr: CourtFrame, faded: boolean): Build =>
  (ctx, g) => {
    const y = fr.oy - 0.07;
    const col = faded ? '#8a9aa6' : PAL.pickle[0];
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 2; j++)
        ctx.flat.box(
          fr.ox - 6.705 + 3.3525 * (i + 0.5),
          y,
          fr.oz - 3.05 + 3.05 * (j + 0.5),
          3.3525,
          0.07,
          3.05,
          jit(ctx, col, 0.03),
        );
    const L = (x0: number, z0: number, x1: number, z1: number) =>
      ctx.flat.box(
        fr.ox + (x0 + x1) / 2,
        y + 0.075,
        fr.oz + (z0 + z1) / 2,
        Math.max(0.08, Math.abs(x1 - x0)),
        0.01,
        Math.max(0.08, Math.abs(z1 - z0)),
        '#f6f4ee',
      );
    L(-6.705, -3.05, -6.705, 3.05);
    L(6.705, -3.05, 6.705, 3.05);
    L(-6.705, -3.05, 6.705, -3.05);
    L(-6.705, 3.05, 6.705, 3.05);
    L(-2.13, -3.05, -2.13, 3.05);
    L(2.13, -3.05, 2.13, 3.05);
    L(-6.705, 0, -2.13, 0);
    L(2.13, 0, 6.705, 0);
    // 矮网：两根柱子和半透明网面
    for (const s of [-1, 1]) ctx.solid.box(fr.ox, 0, fr.oz + s * 3.4, 0.1, 0.9, 0.1, '#2a332d');
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, faded ? 0.5 : 0.8, 6.8),
      new THREE.MeshLambertMaterial({ color: '#1c201d', transparent: true, opacity: 0.5, depthWrite: false }),
    );
    m.position.set(fr.ox, 0.1 + (faded ? 0.25 : 0.4), fr.oz);
    g.add(m);
  };

const pickleBase =
  (col: readonly string[]): Build =>
  (ctx) =>
    tile(ctx.flat, ctx, PICKLE, col, 0.06, 1);

const pickleBuried: Build = all(pickleBase(PAL.sand), (ctx) => {
  for (let k = 0; k < 16; k++)
    sandPile(ctx, sr(ctx, PICKLE.x0, PICKLE.x1), 0.06, sr(ctx, PICKLE.z0, PICKLE.z1), sr(ctx, 1.4, 3));
  for (let k = 0; k < 3; k++) tumbleweed(ctx, sr(ctx, PICKLE.x0, PICKLE.x1), 0.06, sr(ctx, PICKLE.z0, PICKLE.z1));
});
const pickleDug: Build = all(pickleBase(['#b9b0a0', '#aea595', '#c2b9a8']), (ctx) => {
  for (let k = 0; k < 4; k++)
    sandPile(ctx, sr(ctx, PICKLE.x0, PICKLE.x1), 0.06, sr(ctx, PICKLE.z0, PICKLE.z1), sr(ctx, 0.8, 1.6));
});
const pickleOpen: Build = all(
  pickleBase(PAL.dkGreen),
  ...PB_FRAMES.map((f) => pickleCourt(f, false)),
  lawn('stadium_3'),
);
const pickleWorn: Build = all(
  pickleBase(['#7f8c80', '#76847a']),
  ...PB_FRAMES.map((f) => pickleCourt(f, true)),
  (ctx) => {
    for (let k = 0; k < 6; k++)
      sandPile(ctx, sr(ctx, PICKLE.x0, PICKLE.x1), 0.08, sr(ctx, PICKLE.z0, PICKLE.z1), sr(ctx, 0.8, 1.8));
  },
);

/* ---------------- 泳池（stadium_2） ---------------- */

const POOL_PALMS = [
  [-60, -0.5],
  [-40, -0.5],
  [-60, 17],
  [-40, 17],
  [-51, 17.5],
] as const;

const poolWater =
  (col: readonly string[]): Build =>
  (ctx) => {
    for (let x = POOL.x0; x < POOL.x1; x++)
      for (let z = POOL.z0; z < POOL.z1; z++)
        ctx.flat.box(
          x + 0.5,
          0.05,
          z + 0.5,
          1,
          0.12,
          1,
          jit(ctx, ctx.rand() < 0.15 && col === WATER ? '#7fd4ee' : pickc(ctx, col), 0.03),
        );
  };

const poolRuined: Build = all(palms(POOL_PALMS, 'dead'), (ctx) => {
  for (let k = 0; k < 8; k++)
    sandPile(ctx, sr(ctx, POOL.x0, POOL.x1), 0.05, sr(ctx, POOL.z0, POOL.z1), sr(ctx, 0.8, 2));
  for (let k = 0; k < 12; k++) {
    const x = sr(ctx, POOL.x0, POOL.x1);
    const z = sr(ctx, POOL.z0, POOL.z1);
    ctx.flat.box(x, 0.06, z, sr(ctx, 1, 2.6), 0.004, 0.08, '#4a4e48', sr(ctx, 0, 3));
  }
  // 翻倒的躺椅
  for (const x of [-56, -50]) ctx.solid.box(x, 0, 0.6, 0.7, 0.3, 1.9, '#b8b0a2', 0.6, 0, 1.2);
  tumbleweed(ctx, -45, 0.05, 15);
});

const poolOpen: Build = all(poolWater(WATER), palms(POOL_PALMS, 'ok'), lawn('stadium_2'), (ctx) => {
  for (const x of [-56, -53, -50, -47]) {
    ctx.solid.box(x, 0, 0.6, 0.7, 0.3, 1.9, '#f6f2e8');
    ctx.solid.box(x, 0.3, -0.15, 0.7, 0.4, 0.4, '#f6f2e8', 0, -0.5);
    umbrella(ctx, x + 0.9, 0.2, '#f4efe4', PAL.champ, 2.2, 0.9);
  }
  // 小木屋（cabana）
  for (const [x, z] of [
    [-59, 15.5],
    [-55, 15.5],
  ] as const) {
    for (const [u, v] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const)
      ctx.solid.box(x + u * 1.3, 0, z + v * 1, 0.1, 2.4, 0.1, '#e8e2d4');
    ctx.solid.box(x, 2.4, z, 2.9, 0.14, 2.3, '#f4efe4');
    ctx.solid.box(x, 2.54, z, 2.4, 0.14, 1.8, PAL.navy);
    ctx.solid.box(x, 0, z, 2.2, 0.4, 1.6, '#e8e2d4');
  }
});

const poolWorn: Build = all(poolWater(MURKY), palms(POOL_PALMS, 'ok'), (ctx) => {
  for (let k = 0; k < 4; k++) sandPile(ctx, sr(ctx, POOL.x0 - 3, POOL.x1 + 3), 0.05, sr(ctx, -1, 1), sr(ctx, 0.8, 1.6));
});

/* ---------------- 中心球场（stadium_1） ---------------- */

/** 东北角的看台塌了一截：碎块堆在场边 */
const s1Rubble: Build = (ctx) => {
  const { cx, cz } = STAD;
  for (let k = 0; k < 40; k++)
    ctx.solid.box(
      cx + sr(ctx, 10, 19),
      sr(ctx, 0, 1.2),
      cz - sr(ctx, 8, 14),
      sr(ctx, 0.6, 1.8),
      sr(ctx, 0.4, 0.9),
      sr(ctx, 0.6, 1.4),
      jit(ctx, pickc(ctx, PAL.stand), 0.08),
      sr(ctx, 0, 3),
      sr(ctx, -0.4, 0.4),
    );
  for (let k = 0; k < 6; k++) sandPile(ctx, cx + sr(ctx, -16, 16), 0.06, cz + sr(ctx, -8, 8), sr(ctx, 1.4, 3));
};

const s1Restored: Build = (ctx, g) => {
  const { cx, cz } = STAD;
  sign(g, 'PALM OASIS INVITATIONAL', 14, 0.75, cx, 0.55, cz - 9.12, 0, PAL.navy, PAL.champ, 26);
  // 北看台上的遮阳布、蓝色座位条、西头的大屏
  ctx.solid.box(cx, 9.5, cz - 14.5, 38, 0.12, 8.4, '#f4efe4', 0, -0.12);
  for (let r = 0; r < 8; r += 2)
    ctx.solid.box(cx, 0.55 * (r + 1) + 0.01, cz - 9.6 - r * 0.95, 37.5, 0.06, 0.5, PAL.navy);
  ctx.solid.box(cx - 19.5, 5.5, cz, 0.4, 3.2, 6.4, '#14223a');
  ctx.solid.box(cx - 19.28, 5.8, cz, 0.04, 2.6, 5.8, '#2f7a49');
};

/* ---------------- 各设施的层 ---------------- */

export function createFacilityOverlays(stage: Stage): FacilityOverlays {
  lampFns = (stage.scene.userData.tdLamps ??= []) as ((v: number) => void)[];
  const L = (seed: number, b: Build) => layer(stage.scene, seed, b);
  const hardOk = (fr: CourtFrame) => all(courtFace(fr, 'hard'), courtNet(fr, 'new'), windscreen(fr), courtside(fr));
  const clayOk = (fr: CourtFrame) => all(courtFace(fr, 'clay'), courtNet(fr, 'new'), windscreen(fr), courtside(fr));
  const wornCourt = (fr: CourtFrame, kind: CourtKind) =>
    all(courtFace(fr, kind, true), courtNet(fr, 'sag'), sanded(fr, 4));
  const layers: Record<string, THREE.Group> = {
    'outer_1.sanded': L(0x1f01, all(ruinCourt(F_O1, 'hard'), sanded(F_O1, 14))),
    'outer_1.swept': L(0x1f02, ruinCourt(F_O1, 'hard')),
    'outer_1.playable': L(
      0x1f03,
      all(courtFace(F_O1, 'hard', true), courtNet(F_O1, 'new'), lawn('outer_1'), courtside(F_O1)),
    ),
    'outer_1.resurfaced': L(0x1f04, all(hardOk(F_O1), lawn('outer_1'), misters)),
    'outer_1.worn': L(0x1f15, wornCourt(F_O1, 'hard')),
    'outer_23.ruined': L(
      0x1f05,
      all(ruinCourt(F_O2, 'clay'), ruinCourt(F_O3, 'clay'), sanded(F_O2, 10), sanded(F_O3, 12)),
    ),
    'outer_23.playable': L(0x1f06, all(clayOk(F_O2), clayOk(F_O3), lawn('outer_23'))),
    'outer_23.worn': L(0x1f16, all(wornCourt(F_O2, 'clay'), wornCourt(F_O3, 'clay'))),
    'practice.ruined': L(
      0x1f07,
      all(ruinCourt(F_P1, 'hard'), ruinCourt(F_P2, 'hard'), sanded(F_P1, 8), sanded(F_P2, 8)),
    ),
    'practice.open': L(0x1f08, all(hardOk(F_P1), hardOk(F_P2), lawn('practice'), academy)),
    'practice.worn': L(0x1f17, all(wornCourt(F_P1, 'hard'), wornCourt(F_P2, 'hard'))),
    'clubhouse.ruined': L(0x1f09, clubhouseRuined),
    'clubhouse.open': L(0x1f0a, all(clubhouseOpen, lawn('clubhouse'))),
    'clubhouse.worn': L(0x1f18, clubhouseWorn),
    'plaza.dry': L(0x1f0b, plazaDry),
    'plaza.open': L(0x1f0c, plazaOpen),
    'plaza.worn': L(0x1f19, plazaWorn),
    'stadium_3.buried': L(0x1f0d, pickleBuried),
    'stadium_3.dug': L(0x1f13, pickleDug),
    'stadium_3.open': L(0x1f0e, pickleOpen),
    'stadium_3.worn': L(0x1f1a, pickleWorn),
    'stadium_2.ruined': L(0x1f0f, poolRuined),
    'stadium_2.open': L(0x1f10, poolOpen),
    'stadium_2.worn': L(0x1f1b, poolWorn),
    'stadium_1.ruined': L(0x1f11, all(ruinCourt(F_S1, 'hard'), s1Rubble)),
    'stadium_1.cleared': L(0x1f14, all(courtFace(F_S1, 'hard', true), courtNet(F_S1, 'sag'))),
    'stadium_1.restored': L(0x1f12, all(hardOk(F_S1), lawn('stadium_1'), s1Restored)),
    'stadium_1.worn': L(0x1f1c, wornCourt(F_S1, 'hard')),
  };
  // 新东西加在最后：碎屑层用自己的种子，不影响上面各层的画面
  const wear = createWear(stage);
  return {
    set(facility, state) {
      for (const [key, g] of Object.entries(layers))
        if (key.startsWith(`${facility}.`)) g.visible = key === `${facility}.${state}`;
    },
    wear: (facility, amount) => wear.set(facility, amount),
  };
}
