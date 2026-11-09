// #1 clay-court：一片红土场面（33 × 16.6 米，含场外的红土）—— 底色 + 四种状态（起尘 / 刚拖平 / 湿 / 正常）+ 胶带线 + 记号。
// 一个网格（2 个三角形）+ 一个材质：状态放在三张小纹理里（clay/state.ts），shader 按状态挑六套颜色（clay/shader.ts）。
// 规格见 docs/lab/2026-11-07-3d-pixel/clubclay.md「#1 clay-court」。本地原点 = 场地中心（y 0 = 地面），+x 朝东（长边，网在 x 0），+z 朝南。
//
// 变体（ctx.variant / 画廊 ?v=）：0 远场 outer_2（维护到一半）· 1 近场 outer_3（比赛中）· 2 刚拖平 · 3 全起尘 · 4 刚浇过水 · 5 正常。
//
// stage 3 的 API（root.userData，也挂在 root.userData.clay 上）。坐标都是**世界米**（内部用 root.worldToLocal 换成本地，
// 所以场地怎么摆都对；画廊里 root 在原点，世界 = 本地）。方向 (dirX, dirZ) 是世界方向，不用归一化。每次调用只改数组，
// 纹理在画之前（mesh.onBeforeRender）每帧最多重传一次（网格 68 KB / 胶带 3 KB / 记号 4 KB，只传变了的那张）：
//   at(x, z) → { wet, dust, state: 'wet'|'brushed'|'normal'|'dusty' }
//   drag(x, z, dirX, dirZ, width = 2.4, len = 1.2)   拖垫压一下（拖着走就每帧调一次，或者 dragPath）
//   dragPath(pts: [x, z][], width = 2.4)              沿折线拖（每 0.1 米压一下；拐弯处扫痕跟着转）
//   sweepLine(id | 'all', from?, to?)                 扫线：id = baseW/baseE/svcW/svcE/sideN/sideS/singleN/singleS/center；
//                                                    from/to = 沿线的世界坐标（竖线是 z，横线是 x），不给 = 整条
//   sweepAt(x, z, r = 0.35)                           扫线刷在这里扫过（跟着刷子走）
//   water(x, z, r, amount = 1)                        浇水（边是弯的；浇透的地方起尘压回正常）
//   dryStep(dt, secondsToDry = 900)                   晾干 dt 秒（每格快慢不同，水洼最后干）
//   wear(x, z, r, amount)                             踩 / 打：土况往起尘走（比赛里每人每秒在脚下 wear(x, z, 0.5, 0.01)）
//   step(x, z, dirX, dirZ, side = 1)                  一个脚印；trail(pts, stride = 0.72) 一串
//   ballMark(x, z, dirX = 1, dirZ = 0)                球印（方向 = 球飞的方向，前端一纹素蹭起的亮土）
//   slide(x, z, dirX, dirZ, len = 1.3)                滑步痕（从 (x, z) 往 dir 滑 len 米）
//   reset(name)                                       'far' | 'near' | 'fresh' | 'dusty' | 'wet' | 'normal'
//   dirtiest() → { x, z, dust }                       最脏的 1.2 米块（世界坐标；湿的不算）
//   stats() → { wet, brushed, normal, dusty, tape: { id: 0..1 } }
//   lines() → [{ id, a: [x, z], b: [x, z] }]          线的两端（世界坐标；扫线路线用）
//   state                                             ClayState（本地坐标，直接改数组后设 dirtyGrid = true）
// 代价：一片场 1 个 draw call、2 个三角形；片元里 9 条线 + 记号循环（离得 > 1.6 米直接跳过）+ 湿边处 ≤ 8 次取样。
import * as THREE from 'three';
import { DIM, LW } from '../layout';
import type { AssetCtx } from '../world';
import { applyPreset, PRESETS, type PresetName } from './clay/presets';
import { type ClayMaterial, clayMaterial, dataTex, paletteTexture } from './clay/shader';
import { ClayState, MAX_MARKS, TAPE_STEP, type V2 } from './clay/state';

/** 场地（含场外红土）的尺寸：clubmap2 的 outer_2 / outer_3（hx 16.5、hz 8.3） */
const W = 33;
const D = 16.6;

export function build(ctx: AssetCtx): THREE.Object3D {
  const dims = { L: DIM.L, DW: DIM.DW, SW: DIM.SW, SVC: DIM.SVC };
  const s = new ClayState(W, D, dims);
  const preset = PRESETS[ctx.variant] ?? 'far';
  applyPreset(s, preset);

  const grid = new Uint8Array(s.nx * s.nz * 4);
  const tape = new Uint8Array(s.tapeW * s.lines.length * 4);
  const marks = new Float32Array(MAX_MARKS * 2 * 4);
  const gridTex = dataTex(grid, s.nx, s.nz, true);
  const tapeTex = dataTex(tape, s.tapeW, s.lines.length, true);
  const markTex = dataTex(marks, MAX_MARKS, 2, false, THREE.FloatType);

  const u: ClayMaterial['uniforms'] = {
    uClayS: { value: gridTex },
    uClayT: { value: tapeTex },
    uClayM: { value: markTex },
    uClayP: { value: paletteTexture(ctx) },
    uClayDim: { value: new THREE.Vector4(s.hw, s.hd, 0, s.tapeW) },
    uClayLines: { value: s.lines.map((l) => new THREE.Vector4(l.c, l.a0, l.a1, l.kind === 'x' ? 0 : 1)) },
    uClayK: { value: new THREE.Vector4(LW, TAPE_STEP, 0, 0) },
    uClayW2L: { value: new THREE.Vector4(1, 0, 0, 1) },
  };

  const flush = () => {
    if (s.dirtyGrid) {
      s.packGrid(grid);
      gridTex.needsUpdate = true;
      s.dirtyGrid = false;
    }
    if (s.dirtyTape) {
      s.packTape(tape);
      tapeTex.needsUpdate = true;
      s.dirtyTape = false;
    }
    if (s.dirtyMarks) {
      s.packMarks(marks);
      markTex.needsUpdate = true;
      u.uClayDim.value.z = s.marks.length;
      s.dirtyMarks = false;
    }
  };
  flush();

  // 场面：一块平板，比地面高 2 厘米（盖住地图 / 地形画的旧红土和墙里的浅沙）
  const geo = new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2).translate(0, 0.02, 0);
  const mesh = new THREE.Mesh(geo, clayMaterial(ctx, u));
  mesh.name = 'clay-court';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  // 每次画之前：状态变了就重传纹理（暂停时 userData.update 不跑，也照样更新）；世界 → 本地的旋转（扫痕方向、线宽按屏幕取整要用）
  mesh.onBeforeRender = () => {
    flush();
    const e = mesh.matrixWorld.elements;
    const sx = Math.hypot(e[0], e[2]) || 1;
    const sz = Math.hypot(e[8], e[10]) || 1;
    u.uClayW2L.value.set(e[0] / sx, e[2] / sx, e[8] / sz, e[10] / sz);
  };

  const root = new THREE.Group();
  root.name = 'clay-court';
  root.add(mesh);

  // ── 世界 ↔ 本地 ──
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const loc = (x: number, z: number): V2 => {
    root.updateWorldMatrix(true, false);
    root.worldToLocal(v.set(x, 0, z));
    return [v.x, v.z];
  };
  const locDir = (dx: number, dz: number): V2 => {
    root.updateWorldMatrix(true, false);
    root.getWorldQuaternion(q).invert();
    v.set(dx, 0, dz).applyQuaternion(q);
    return [v.x, v.z];
  };
  const wld = (x: number, z: number): V2 => {
    root.updateWorldMatrix(true, false);
    root.localToWorld(v.set(x, 0, z));
    return [v.x, v.z];
  };
  /** 沿线的世界坐标 → 本地沿线坐标（竖线看 z，横线看 x） */
  const alongLocal = (id: string, a: number): number => {
    const l = s.lines.find((k) => k.id === id);
    if (!l) return a;
    const [lx, lz] = l.kind === 'x' ? wld(l.c, 0) : wld(0, l.c);
    const [px, pz] = l.kind === 'x' ? loc(lx, a) : loc(a, lz);
    return l.kind === 'x' ? pz : px;
  };

  const api = {
    state: s,
    at: (x: number, z: number) => s.at(...loc(x, z)),
    drag: (x: number, z: number, dirX: number, dirZ: number, width = 2.4, len = 1.2) =>
      s.drag(...loc(x, z), ...locDir(dirX, dirZ), width, len),
    dragPath: (pts: V2[], width = 2.4) =>
      s.dragPath(
        pts.map(([x, z]) => loc(x, z)),
        width,
      ),
    sweepLine: (id: string, from?: number, to?: number) => {
      if (id === 'all' || from === undefined || to === undefined) return s.sweepLine(id);
      const a = alongLocal(id, from);
      const b = alongLocal(id, to);
      s.sweepLine(id, Math.min(a, b), Math.max(a, b));
    },
    sweepAt: (x: number, z: number, r = 0.35) => s.sweepAt(...loc(x, z), r),
    water: (x: number, z: number, r: number, amount = 1) => s.water(...loc(x, z), r, amount),
    dryStep: (dt: number, secondsToDry = 900) => s.dryStep(dt, secondsToDry),
    wear: (x: number, z: number, r: number, amount: number) => s.wear(...loc(x, z), r, amount),
    step: (x: number, z: number, dirX: number, dirZ: number, side = 1) =>
      s.step(...loc(x, z), ...locDir(dirX, dirZ), side),
    trail: (pts: V2[], stride = 0.72) =>
      s.trail(
        pts.map(([x, z]) => loc(x, z)),
        stride,
      ),
    ballMark: (x: number, z: number, dirX = 1, dirZ = 0) => s.ballMark(...loc(x, z), ...locDir(dirX, dirZ)),
    slide: (x: number, z: number, dirX: number, dirZ: number, len = 1.3) =>
      s.slide(...loc(x, z), ...locDir(dirX, dirZ), len),
    reset: (name: PresetName) => applyPreset(s, name),
    dirtiest: () => {
      const d = s.dirtiest(dims);
      const [x, z] = wld(d.x, d.z);
      return { x, z, dust: d.dust };
    },
    stats: () => s.stats(),
    lines: () =>
      s.lines.map((l) => ({
        id: l.id,
        a: l.kind === 'x' ? wld(l.c, l.a0) : wld(l.a0, l.c),
        b: l.kind === 'x' ? wld(l.c, l.a1) : wld(l.a1, l.c),
      })),
  };
  Object.assign(root.userData, api);
  root.userData.clay = api;
  root.userData.update = () => flush();
  return root;
}
