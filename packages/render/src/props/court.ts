import { lerp, pick } from '@td/shared';
import * as THREE from 'three';
import { VoxelBatcher } from '../voxel/batcher';
import { sign } from '../voxel/text';
import { type BuildContext, cbox, jit, sr } from '../world/build-context';
import type { CourtFrame } from '../world/frame';

/** 场地尺寸（米），ITF 标准。 */
export const COURT = {
  /** 半场长 */
  HL: 11.885,
  /** 双打半宽 */
  HWD: 5.485,
  /** 单打半宽 */
  HWS: 4.115,
  /** 发球线到网 */
  SL: 6.4,
} as const;

const WEED_COLORS = ['#5e7a2e', '#6d7f34', '#7d8a3c', '#4f6a2a'];

/** 一丛杂草。 */
export function weed(ctx: BuildContext, x: number, y: number, z: number, n = 3): void {
  for (let k = 0; k < n; k++) {
    ctx.solid.box(
      x + sr(ctx, -0.12, 0.12),
      y,
      z + sr(ctx, -0.12, 0.12),
      sr(ctx, 0.06, 0.12),
      sr(ctx, 0.1, 0.32),
      sr(ctx, 0.06, 0.12),
      jit(ctx, pick(WEED_COLORS, ctx.rand), 0.05),
      sr(ctx, 0, 3),
      sr(ctx, -0.3, 0.3),
      sr(ctx, -0.3, 0.3),
    );
  }
}

export interface SurfaceOptions {
  /** 磨损块比例 */
  worn?: number;
  cracks?: number;
  /** 裂缝里长草的概率 */
  weeds?: number;
  puddles?: number;
  /** 场地线缺失比例 */
  missing?: number;
  /** 场地线颜色；空字符串表示不画线 */
  lineCol?: string;
}

/** 硬地场地面：外圈、内场、场地线、裂缝和水洼。 */
export function surface(
  ctx: BuildContext,
  fr: CourtFrame,
  inner: string,
  outer: string,
  { worn = 0.15, cracks = 6, weeds = 0.2, puddles = 1, missing = 0.1, lineCol = '#d3cdb9' }: SurfaceOptions = {},
): void {
  const { flat } = ctx;
  const y = fr.oy - 0.07;
  const W = 2 * fr.hx + 0.4;
  const D = 2 * fr.hz + 0.4;
  const nx = Math.round(W / 2);
  const nz = Math.round(D / 2);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const lx = -W / 2 + (W / nx) * (i + 0.5);
      const lz = -D / 2 + (D / nz) * (j + 0.5);
      const p = fr.w({ x: lx, z: lz });
      flat.box(
        p.x,
        y,
        p.z,
        W / nx,
        0.06,
        D / nz,
        ctx.rand() < worn ? jit(ctx, '#5a5b56', 0.03) : jit(ctx, outer, 0.05),
        fr.a,
      );
    }
  const { HL, HWD } = COURT;
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 6; j++) {
      const p = fr.w({ x: -HL + (HL / 6) * (i + 0.5), z: -HWD + (HWD / 3) * (j + 0.5) });
      flat.box(
        p.x,
        y + 0.06,
        p.z,
        HL / 6,
        0.012,
        HWD / 3,
        ctx.rand() < worn ? jit(ctx, '#6b6c66', 0.03) : jit(ctx, inner, 0.05),
        fr.a,
      );
    }
  if (lineCol) courtLines(ctx, fr, lineCol, missing, y + 0.072);
  for (let k = 0; k < cracks; k++) {
    let lx = sr(ctx, -fr.hx + 1, fr.hx - 1);
    let lz = sr(ctx, -fr.hz + 1, fr.hz - 1);
    let a = sr(ctx, 0, 6.28);
    // 注意：循环条件每轮都重新取随机数，这是原型的行为，改了会改变画面
    for (let s = 0; s < Math.floor(sr(ctx, 6, 13)); s++) {
      const p = fr.w({ x: lx, z: lz });
      flat.box(p.x, y + 0.073, p.z, 0.44, 0.004, 0.06, '#363a35', fr.a + a);
      if (ctx.rand() < weeds) weed(ctx, p.x, y + 0.07, p.z, Math.floor(sr(ctx, 1, 4)));
      lx += Math.cos(a) * 0.42;
      lz -= Math.sin(a) * 0.42;
      a += sr(ctx, -0.6, 0.6);
    }
  }
  for (let k = 0; k < puddles; k++) {
    const p = fr.w({ x: sr(ctx, -10, 10), z: sr(ctx, -5, 5) });
    const w = sr(ctx, 1.2, 3);
    const d = sr(ctx, 0.8, 2);
    flat.box(p.x, y + 0.074, p.z, w, 0.004, d, '#5d6f78', fr.a);
    flat.box(p.x, y + 0.075, p.z, w * 0.4, 0.004, d * 0.3, '#8197a0', fr.a);
  }
}

/** 网球场地线。missing 是每一小段缺失的概率。 */
export function courtLines(ctx: BuildContext, fr: CourtFrame, col: string, missing: number, y: number): void {
  const { HL, HWD, HWS, SL } = COURT;
  const seg = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len));
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (let i = 0; i < n; i++) {
      if (ctx.rand() < missing) continue;
      const t = (i + 0.5) / n;
      const p = fr.w({ x: lerp(x0, x1, t), z: lerp(z0, z1, t) });
      ctx.flat.box(p.x, y, p.z, along ? len / n : 0.1, 0.01, along ? 0.1 : len / n, jit(ctx, col, 0.05), fr.a);
    }
  };
  seg(-HL, -HWD, -HL, HWD);
  seg(HL, -HWD, HL, HWD);
  seg(-HL, -HWD, HL, -HWD);
  seg(-HL, HWD, HL, HWD);
  seg(-HL, -HWS, HL, -HWS);
  seg(-HL, HWS, HL, HWS);
  seg(-SL, -HWS, -SL, HWS);
  seg(SL, -HWS, SL, HWS);
  seg(-SL, 0, SL, 0);
}

export type NetMode = 'sag' | 'new' | 'normal';

/** 球网：网柱、半透明网面、网带。sag 是下垂的旧网。 */
export function net(ctx: BuildContext, fr: CourtFrame, mode: NetMode): void {
  cbox(ctx, fr, 0, 0, -6.4, 0.12, 1.0, 0.12, '#2a332d');
  cbox(ctx, fr, 0, 0, 6.4, 0.12, 1.0, 0.12, '#2a332d');
  const n = 16;
  const sw = 12.8 / n;
  // 半透明的网面合成一个网格（一块网一次绘制调用）
  const mesh = new VoxelBatcher();
  for (let i = 0; i < n; i++) {
    const lz = -6.4 + sw * (i + 0.5);
    const u = lz / 6.4;
    const top = mode === 'sag' ? 1.0 - 0.36 * (1 - u * u) : 0.92;
    const p = fr.w({ x: 0, y: 0.09, z: lz });
    mesh.box(p.x, p.y, p.z, 0.03, top - 0.12, sw, '#1c201d', fr.a);
    cbox(
      ctx,
      fr,
      0,
      top - 0.06,
      lz,
      0.065,
      0.065,
      sw + 0.02,
      mode === 'new' ? '#f3f1ea' : i % 5 === 2 ? '#bdb8a8' : '#d9d4c3',
    );
  }
  mesh.build(ctx.scene, false, false, { transparent: true, opacity: 0.5, depthWrite: false });
}

export type FenceSide = 'S' | 'N' | 'E' | 'W';

export interface PenOptions {
  /** 哪一侧中间开门 */
  gate?: FenceSide | null;
  /** 缺网的格子编号（从 1 起，按 S、N、E、W 顺序数） */
  holes?: number[];
  H?: number;
  col?: string;
  /** 立柱歪斜的概率 */
  lean?: number;
  /** 哪一格的网卷起来了 */
  peel?: number;
}

/** 围网：立柱、半透明铁丝网、上下横杆、根部杂草。 */
export function pen(
  ctx: BuildContext,
  fr: CourtFrame,
  { gate = null, holes = [], H = 3.2, col = '#55504a', lean = 0.2, peel = -1 }: PenOptions = {},
): void {
  const mat = new THREE.MeshLambertMaterial({
    color: '#1d2a24',
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
    // r150 起透明 + 双面默认分两遍画（先背面后正面）；r128 是一遍，绘制调用也少一半
    forceSinglePass: true,
  });
  const sides = [
    { ax: 'x', k: -fr.hz, a: -fr.hx, b: fr.hx, ry: 0, id: 'S' },
    { ax: 'x', k: fr.hz, a: -fr.hx, b: fr.hx, ry: 0, id: 'N' },
    { ax: 'z', k: fr.hx, a: -fr.hz, b: fr.hz, ry: Math.PI / 2, id: 'E' },
    { ax: 'z', k: -fr.hx, a: -fr.hz, b: fr.hz, ry: Math.PI / 2, id: 'W' },
  ] as const;
  let bayIdx = 0;
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';
  for (const s of sides) {
    // 一面围网的网片合成一个网格；朝外的法线（世界坐标）挂在它上面，相机这一侧的整面可以隐藏
    const parts: THREE.BufferGeometry[] = [];
    const n = Math.round((s.b - s.a) / 3);
    const bw = (s.b - s.a) / n;
    for (let i = 0; i <= n; i++) {
      const t = s.a + bw * i;
      const lx = s.ax === 'x' ? t : s.k;
      const lz = s.ax === 'x' ? s.k : t;
      const l = ctx.rand() < lean;
      cbox(
        ctx,
        fr,
        lx,
        0,
        lz,
        0.1,
        H,
        0.1,
        jit(ctx, col, 0.05),
        0,
        l ? sr(ctx, -0.1, 0.1) : 0,
        l ? sr(ctx, -0.1, 0.1) : 0,
      );
    }
    for (let i = 0; i < n; i++) {
      bayIdx++;
      const c = s.a + bw * (i + 0.5);
      const lx = s.ax === 'x' ? c : s.k;
      const lz = s.ax === 'x' ? s.k : c;
      const isGate = gate === s.id && Math.abs(c) < 1.6;
      const isHole = holes.includes(bayIdx);
      if (!isGate && !isHole) {
        const pl = bayIdx === peel;
        const p = fr.w({ x: lx, y: (pl ? 0.8 : H / 2) - 0.07, z: lz });
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(pl ? 0.9 : 0, fr.a + s.ry, 0);
        dummy.updateMatrix();
        parts.push(new THREE.PlaneGeometry(bw, pl ? H * 0.6 : H).toNonIndexed().applyMatrix4(dummy.matrix));
      }
      for (const [yy, miss] of [
        [H, 0.15],
        [0.1, 0.1],
      ] as const) {
        if (ctx.rand() < miss || (isGate && yy < 1)) continue;
        if (s.ax === 'x') cbox(ctx, fr, lx, yy - 0.07, lz, bw, 0.06, 0.06, jit(ctx, col, 0.04));
        else cbox(ctx, fr, lx, yy - 0.07, lz, 0.06, 0.06, bw, jit(ctx, col, 0.04));
      }
      for (let k = 0; k < 2; k++) {
        const u = c + sr(ctx, -bw / 2, bw / 2);
        const p = fr.w(s.ax === 'x' ? { x: u, z: s.k + sr(ctx, -0.3, 0.3) } : { x: s.k + sr(ctx, -0.3, 0.3), z: u });
        weed(ctx, p.x, fr.oy - 0.07, p.z, 3);
      }
    }
    if (parts.length) {
      const m = new THREE.Mesh(mergePositions(parts), mat);
      // 朝外的法线（世界坐标）：相机这一侧的网可以整面隐藏，场地不再像隔着一层玻璃
      const ln = s.ax === 'x' ? { x: 0, z: Math.sign(s.k) } : { x: Math.sign(s.k), z: 0 };
      m.userData.fenceNormal = { x: ln.x * fr.c + ln.z * fr.s, z: -ln.x * fr.s + ln.z * fr.c };
      ctx.scene.add(m);
    }
  }
}

/** 把几块非索引几何合成一块（只要位置和法线） */
function mergePositions(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g of parts) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

/** 在场地坐标系里立一块招牌。 */
export function frameSign(
  ctx: BuildContext,
  fr: CourtFrame,
  text: string,
  w: number,
  h: number,
  lx: number,
  ly: number,
  lz: number,
  bg: string,
  fg: string,
  px: number,
  ry = 0,
): THREE.Mesh {
  const p = fr.w({ x: lx, y: ly, z: lz });
  return sign(ctx.scene, text, w, h, p.x, p.y, p.z, fr.a + ry, bg, fg, px);
}
