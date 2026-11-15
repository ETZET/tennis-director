// 球场这组（court-hard、court-clay、pickle、practice-wall、bleachers）共用的小工具：
// 场面（借 clubcourts 的硬地 shader、clubclay 的红土 shader：线宽按屏幕纹素取整，远看也是一纹素的白线）、
// 围网（clubdesk 的挡风布围网，美术 r1 换掉了斜格子网面）、复用的现成资产（只读 import，按别的场景的 ctx 建，所以要 cast）。
// 注意：assets/index.ts 会把导出 build 的文件都当成设施模型 —— 这个文件不导出叫 build 的函数。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyPreset as applyClayPreset } from '../../clubclay/assets/clay/presets';
import {
  type ClayMaterial,
  clayMaterial,
  paletteTexture as clayPalette,
  dataTex as clayTex,
} from '../../clubclay/assets/clay/shader';
import { ClayState, MAX_MARKS, TAPE_STEP } from '../../clubclay/assets/clay/state';
import type { AssetCtx as ClayCtx } from '../../clubclay/ctx';
import {
  type HardCtx,
  type HardKeys,
  type HardUniforms,
  hardMaterial,
  paletteTexture as hardPalette,
  dataTex as hardTex,
} from '../../clubcourts/assets/hard/shader';
import { HardState, type LineDef } from '../../clubcourts/assets/hard/state';
import { buildFences } from '../../clubdesk/assets/fence-screen';
import type { AssetCtx as DeskCtx } from '../../clubdesk/ctx';
import { build as ballHopper } from '../../clubsite/assets/ball-hopper';
import { build as bench } from '../../clubsite/assets/bench';
import { build as courtLight } from '../../clubsite/assets/court-light';
import { build as courtNet } from '../../clubsite/assets/court-net';
import { build as paddleRack } from '../../clubsite/assets/paddle-rack';
import { build as pickleNet } from '../../clubsite/assets/pickle-net';
import { build as umpireChair } from '../../clubsite/assets/umpire-chair';
import type { AssetBuild, AssetCtx } from '../ctx';

export type { LineDef };

/** 复用的现成资产（别的场景 / clubsite 的，按各自的 ctx 类型写的；clubbuild 的表是它们的超集） */
export const REUSE = {
  courtNet: courtNet as unknown as AssetBuild,
  pickleNet: pickleNet as unknown as AssetBuild,
  courtLight: courtLight as unknown as AssetBuild,
  umpireChair: umpireChair as unknown as AssetBuild,
  bench: bench as unknown as AssetBuild,
  ballHopper: ballHopper as unknown as AssetBuild,
  paddleRack: paddleRack as unknown as AssetBuild,
};

/** 建一件复用资产并摆好（本地坐标；ry = 绕 y 转多少：资产的 +z 转到 (sin ry, 0, cos ry)） */
export function put(
  ctx: AssetCtx,
  root: THREE.Object3D,
  b: AssetBuild,
  x: number,
  z: number,
  ry = 0,
  variant = 0,
): THREE.Object3D {
  const o = b({ ...ctx, variant });
  o.position.set(x, 0, z);
  o.rotation.y = ry;
  root.add(o);
  return o;
}

/**
 * 把几件静态的复用资产（长椅、裁判椅、捡球篮……没有 userData 接口要保留的）按材质合并成每种材质一个网格（手机上省 draw call）。
 * 同一个材质（ctx.mat 按参数缓存，同款资产摆两件就是同一组材质）+ 同样的投影开关 + 同样的顶点属性 → 合并；合不了的原样留着。
 * parts 必须是 root 的直接子节点；合并后从 root 里拿掉，换成合并好的网格（坐标已经是 root 的本地坐标）。
 */
export function bakeStatic(root: THREE.Object3D, parts: THREE.Object3D[]) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { mesh: THREE.Mesh; geos: THREE.BufferGeometry[] }>();
  const keep: THREE.Mesh[] = [];
  for (const p of parts) {
    p.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (
        Array.isArray(m.material) ||
        m.layers.mask !== 1 ||
        m.onBeforeRender !== THREE.Mesh.prototype.onBeforeRender
      ) {
        keep.push(m);
        return;
      }
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld),
      );
      const attrs = Object.keys(g.attributes).sort().join(',');
      const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${attrs}`;
      let e = groups.get(key);
      if (!e) {
        e = { mesh: m, geos: [] };
        groups.set(key, e);
      }
      e.geos.push(g);
    });
  }
  for (const p of parts) root.remove(p);
  for (const m of keep) {
    m.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.parent ? m.parent.matrixWorld : m.matrixWorld));
    root.add(m);
  }
  for (const { mesh, geos } of groups.values()) {
    const merged = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    if (!merged) continue;
    const out = new THREE.Mesh(merged, mesh.material);
    out.castShadow = mesh.castShadow;
    out.receiveShadow = mesh.receiveShadow;
    out.customDepthMaterial = mesh.customDepthMaterial;
    out.name = `baked:${mesh.name}`;
    root.add(out);
  }
}

/** 让资产的 +z 朝向 (dx, dz) 的 ry */
export const face = (dx: number, dz: number) => Math.atan2(dx, dz);

// ── 场面 ──────────────────────────────────────────────────────────────

/** 没用的线位：沿线范围是空的（shader 里直接跳过） */
export const NO_LINE: LineDef = { id: '-', kind: 'x', c: 0, a0: 1e4, a1: -1e4 };

/**
 * 一块硬地漆面（clubcourts 的 hard shader，干净、没有积沙和水）：本地 x 是长边（w），z 是短边（d）。
 * blue = 内场色（keys.court）的半长、半宽，外面是外场色（keys.surround）；lines ≤ 9 条（不够的补 NO_LINE），lw = 线宽（米，最少一纹素）。
 * 一个网格（2 个三角形）。建在 y 0.02。
 */
export function hardSurface(
  ctx: AssetCtx,
  o: {
    w: number;
    d: number;
    blue: { hx: number; hz: number };
    keys: HardKeys;
    lines: LineDef[];
    lw: number;
    /** 材质底子（法线 pass 的描边参数从它来）；默认 keys.court。内场色借的是道具色（描边重）时换成地面色 */
    baseKey?: string;
  },
): THREE.Mesh {
  const hctx = ctx as unknown as HardCtx;
  // dims 只给 HardState 算它自己的线（我们不用），随便给一套网球的
  const s = new HardState(o.w, o.d, { L: 23.77, DW: 10.97, SW: 8.23, SVC: 6.4 }, o.blue, []);
  const grid = new Uint8Array(s.nx * s.nz * 4);
  s.pack(grid);
  const lines = [...o.lines];
  while (lines.length < 9) lines.push(NO_LINE);
  const u: HardUniforms = {
    uHardS: { value: hardTex(grid, s.nx, s.nz, true) },
    uHardP: { value: hardPalette(hctx, o.keys) },
    uHardDim: { value: new THREE.Vector4(s.hw, s.hd, 0, 0) },
    uHardLines: { value: lines.slice(0, 9).map((l) => new THREE.Vector4(l.c, l.a0, l.a1, l.kind === 'x' ? 0 : 1)) },
    uHardK: { value: new THREE.Vector4(o.lw, o.blue.hx, o.blue.hz, 0) },
    uHardW2L: { value: new THREE.Vector4(1, 0, 0, 1) },
  };
  const geo = new THREE.PlaneGeometry(o.w, o.d).rotateX(-Math.PI / 2).translate(0, 0.02, 0);
  const mesh = new THREE.Mesh(geo, hardMaterial(hctx, o.baseKey ?? o.keys.court, u));
  mesh.name = 'hard-surface';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  // 世界 → 本地的旋转（线宽按屏幕取整要用；设施转了 rot 也对）
  mesh.onBeforeRender = () => {
    const e = mesh.matrixWorld.elements;
    const sx = Math.hypot(e[0], e[2]) || 1;
    const sz = Math.hypot(e[8], e[10]) || 1;
    u.uHardW2L.value.set(e[0] / sx, e[2] / sx, e[8] / sz, e[10] / sz);
  };
  return mesh;
}

/**
 * 一块红土场面（clubclay 的 clay shader，'normal' 预设：打过一阵、线干净）：本地 x 长边。
 * 9 条网球线（clubclay 的胶带线），一个网格。建在 y 0.02。
 */
export function claySurface(ctx: AssetCtx, w: number, d: number): THREE.Mesh {
  const cctx = ctx as unknown as ClayCtx;
  const s = new ClayState(w, d, { L: 23.77, DW: 10.97, SW: 8.23, SVC: 6.4 });
  applyClayPreset(s, 'normal');
  const grid = new Uint8Array(s.nx * s.nz * 4);
  const tape = new Uint8Array(s.tapeW * s.lines.length * 4);
  const marks = new Float32Array(MAX_MARKS * 2 * 4);
  s.packGrid(grid);
  s.packTape(tape);
  s.packMarks(marks);
  const u: ClayMaterial['uniforms'] = {
    uClayS: { value: clayTex(grid, s.nx, s.nz, true) },
    uClayT: { value: clayTex(tape, s.tapeW, s.lines.length, true) },
    uClayM: { value: clayTex(marks, MAX_MARKS, 2, false, THREE.FloatType) },
    uClayP: { value: clayPalette(cctx) },
    uClayDim: { value: new THREE.Vector4(s.hw, s.hd, s.marks.length, s.tapeW) },
    uClayLines: { value: s.lines.map((l) => new THREE.Vector4(l.c, l.a0, l.a1, l.kind === 'x' ? 0 : 1)) },
    // 线宽 0.18（clubclay 的 LW）：一纹素以下的按一纹素画
    uClayK: { value: new THREE.Vector4(0.18, TAPE_STEP, 0, 0) },
    uClayW2L: { value: new THREE.Vector4(1, 0, 0, 1) },
  };
  const geo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(0, 0.02, 0);
  const mesh = new THREE.Mesh(geo, clayMaterial(cctx, u));
  mesh.name = 'clay-surface';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.onBeforeRender = () => {
    const e = mesh.matrixWorld.elements;
    const sx = Math.hypot(e[0], e[2]) || 1;
    const sz = Math.hypot(e[8], e[10]) || 1;
    u.uClayW2L.value.set(e[0] / sx, e[2] / sx, e[8] / sz, e[10] / sz);
  };
  return mesh;
}

/** 平地上的一块（y 高），用来铺场边一圈 */
export function flat(ctx: AssetCtx, key: Parameters<AssetCtx['mat']>[0], w: number, d: number, y = 0.012) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(0, y, 0),
    ctx.mat(key, { edge: 0.05, convex: 0 }),
  );
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

// ── 围网 ──────────────────────────────────────────────────────────────

/** 一段直的围网（本地米）：从 a 到 b，高 h；门 = 离起点 at 米处留 gap 米宽的口子 */
export interface Run {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  h: number;
  door?: { at: number; gap: number };
}

/** 矩形四边（半宽 hw、半深 hd），前边（+z）在 x = doorX 处留门 */
export function rectRuns(hw: number, hd: number, h: number, doorX: number, gap: number, hFront = h): Run[] {
  return [
    { x0: -hw, z0: -hd, x1: hw, z1: -hd, h },
    { x0: -hw, z0: -hd, x1: -hw, z1: hd, h },
    { x0: hw, z0: -hd, x1: hw, z1: hd, h },
    { x0: -hw, z0: hd, x1: hw, z1: hd, h: hFront, door: { at: doorX + hw, gap } },
  ];
}

/**
 * 围网（美术 r1：斜格子网面在 0.149 米/纹素下是一条橙色棋盘带 → 换成实心的深绿挡风布）。
 * 直接用 clubdesk 的 fence-screen（buildFences：柱 + 顶杆 + 一窄条暗网 + 一兜一兜的挡风布 + 底杆，所有段合并成每种材质一个网格），
 * 和红土场同一套，开罗距离下是一圈干净的深绿暗带。o 保留旧参数（不用了）。
 */
export function chainFence(ctx: AssetCtx, runs: Run[], _o: { postGap?: number; period?: number } = {}): THREE.Object3D {
  const g = buildFences(
    ctx as unknown as DeskCtx,
    runs.map((r) => ({ ...r })),
  );
  g.name = 'chain-fence';
  return g;
}
