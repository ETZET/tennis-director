// #1 hard-court：一片硬地场面（33 × 16.6 米，含外场绿）—— 新漆的内场青蓝 + 外场绿 + 白线 + 两种会变的状态：
// 南边吹上来的积沙（盖在线上面）、喷雾滴下来的水洼（在线下面，线透过水还看得见）。
// 一个网格（2 个三角形）+ 一个材质：状态放在一张小纹理里（hard/state.ts），shader 按状态挑八套颜色（hard/shader.ts）。
// 规格见 docs/lab/2026-11-07-3d-pixel/clubcourts.md「#1 hard-court」。本地原点 = 场地中心（y 0 = 地面），+x 朝东（长边，网在 x 0），+z 朝南。
//
// 变体（ctx.variant / 画廊 ?v=）：0 会员场 outer_1（比赛中：三条积沙舌头 + 吹薄的一截 + 四团水洼；南边敞开）·
//   1 青训场（新漆、干净；四面围网）· 2 会员场吹干净、干了（南边敞开，风一吹就开始积）· 3 沙尘暴之后（南边满是沙 + 一片水，画廊看状态）。
// 别的场景（中心球场）：import { buildHardCourt } 传自己的尺寸和颜色名（见 HardOpts）。
//
// stage 3 的 API（root.userData）。坐标都是**世界米**（内部用 root.worldToLocal 换成本地，场地怎么摆都对；画廊里 root 在原点，世界 = 本地）。
// 方向 (dirX, dirZ) 是世界方向，不用归一化。每次调用只改数组，纹理在画之前（mesh.onBeforeRender）每帧最多重传一次（270 KB，状态没变就不传）：
//   sand.at(x, z) → { depth, state: 'clean'|'thin'|'drift' }
//   sand.blow(x, z, dirX, dirZ, r = 1.8, amount = 0.05) → 推出场外的沙量
//                     吹叶机：喷口 (x, z)、朝 dir、够得着 r 米、30° 半角的锥；锥里的沙往前推 0.3～0.8 米，推出网格就没了。
//                     每帧调一次的话 amount ≈ dt × 3（总监站着吹 2～3 秒，一米宽的舌头就吹干净了）
//   sand.drift(dt, wind = [0, -1], rate = 1/300)   风积：wind = 世界方向的风（[x, z] 或 {x, y}），长度 = 风力；
//                     只有风从敞开的边（会员场南边）往里吹才补沙，沙按距离边的远近慢慢长回"自然积沙"的舌头，比吹慢得多
//   sand.sandiest() → { x, z, v } | null          积沙最多的 1.2 米块（世界坐标；总监自动吹沙的目标）
//   wet(x, z, r, amount = 1, aspect = 0.5)          加水（喷雾每秒在帆前 2～4 米调一次 amount 0.02～0.05；一下子一整团用 1）
//   squeegee(x, z, dirX, dirZ, width = 0.9) → 挪动的水量
//                     刮水板：板心 (x, z)，往 dir 推；板下面留一层潮，水往前挪 0.24 米，到外场绿上变小，推出网格（围网脚下）就没了
//   dryStep(dt, secondsToDry = 1800)                晾干（一整团水洼 1800 秒干透 ≈ 一盘干一半；潮的快三倍）
//   wettest() → { x, z, v } | null                  最大的一团水洼（0.9 米块，世界坐标）
//   waterAt(x, z) → { wet, state: 'dry'|'damp'|'puddle' }
//   reset(name)                                     'member' | 'clean' | 'blown' | 'storm'
//   stats() → { drift, thin, puddle, damp, sandVolume } 面积占比（整片场）+ 沙的总量
//   lines() → [{ id, a: [x, z], b: [x, z] }]        线的两端（世界坐标）
//   state                                           HardState（本地坐标；直接改数组后设 dirty = true）
// 代价：一片场 1 个 draw call、2 个三角形；片元里 9 条线的循环 + 水洼 / 积沙的边上 ≤ 6 次取样。
import * as THREE from 'three';
import { COURT_MARGIN, DIM, LW } from '../layout';
import { applyPreset, PRESETS, type PresetName } from './hard/presets';
import { dataTex, type HardCtx, type HardKeys, type HardUniforms, hardMaterial, paletteTexture } from './hard/shader';
import { type Edge, HardState, type V2 } from './hard/state';

export type { HardCtx };

/** 一片硬地的参数（中心球场：自己的尺寸、颜色名、不要敞开的边） */
export interface HardOpts {
  /** 整块（含外场）的宽（x）、深（z），米。默认 33 × 16.6（clubmap2 的 hx 16.5、hz 8.3） */
  w?: number;
  d?: number;
  /** 调色板名字：内场 / 外场（默认 court / surround），湿的（默认 courtWet / surroundWet；场景的表里没有就从干的推） */
  keys?: Partial<HardKeys>;
  /** 敞开的边（风从这里补沙）；默认按预设：会员场 ['s']，其余 [] */
  open?: Edge[];
  /** 初始状态（默认按 ctx.variant） */
  preset?: PresetName;
}

export function build(ctx: HardCtx): THREE.Object3D {
  return buildHardCourt(ctx);
}

export function buildHardCourt(ctx: HardCtx, opts: HardOpts = {}): THREE.Object3D {
  const W = opts.w ?? 33;
  const D = opts.d ?? 16.6;
  const preset = opts.preset ?? PRESETS[ctx.variant] ?? 'clean';
  const open = opts.open ?? (preset === 'clean' ? [] : (['s'] as Edge[]));
  const keys: HardKeys = {
    court: 'court',
    surround: 'surround',
    courtWet: 'courtWet',
    surroundWet: 'surroundWet',
    ...opts.keys,
  };
  const dims = { L: DIM.L, DW: DIM.DW, SW: DIM.SW, SVC: DIM.SVC };
  const blue = { hx: DIM.L / 2 + COURT_MARGIN.x, hz: DIM.DW / 2 + COURT_MARGIN.z };
  const s = new HardState(W, D, dims, blue, open);
  applyPreset(s, preset);

  const grid = new Uint8Array(s.nx * s.nz * 4);
  const gridTex = dataTex(grid, s.nx, s.nz, true);
  const u: HardUniforms = {
    uHardS: { value: gridTex },
    uHardP: { value: paletteTexture(ctx, keys) },
    uHardDim: { value: new THREE.Vector4(s.hw, s.hd, 0, 0) },
    uHardLines: { value: s.lines.map((l) => new THREE.Vector4(l.c, l.a0, l.a1, l.kind === 'x' ? 0 : 1)) },
    uHardK: { value: new THREE.Vector4(LW, blue.hx, blue.hz, 0) },
    uHardW2L: { value: new THREE.Vector4(1, 0, 0, 1) },
  };
  const flush = () => {
    if (!s.dirty) return;
    s.pack(grid);
    gridTex.needsUpdate = true;
    s.dirty = false;
  };
  flush();

  // 场面：一块平板，比地面高 2 厘米（盖住地形的沙和步道）
  const geo = new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2).translate(0, 0.02, 0);
  const mesh = new THREE.Mesh(geo, hardMaterial(ctx, keys.court, u));
  mesh.name = 'hard-court';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  // 每次画之前：状态变了就重传纹理（暂停时 userData.update 不跑，也照样更新）；世界 → 本地的旋转（线宽按屏幕取整要用）
  mesh.onBeforeRender = () => {
    flush();
    const e = mesh.matrixWorld.elements;
    const sx = Math.hypot(e[0], e[2]) || 1;
    const sz = Math.hypot(e[8], e[10]) || 1;
    u.uHardW2L.value.set(e[0] / sx, e[2] / sx, e[8] / sz, e[10] / sz);
  };

  const root = new THREE.Group();
  root.name = 'hard-court';
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
  const toWorld = <T extends { x: number; z: number }>(o: T | null): T | null => {
    if (!o) return null;
    const [x, z] = wld(o.x, o.z);
    return { ...o, x, z };
  };

  const sand = {
    at: (x: number, z: number) => s.sandAt(...loc(x, z)),
    blow: (x: number, z: number, dirX: number, dirZ: number, r = 1.8, amount = 0.05) =>
      s.blow(...loc(x, z), ...locDir(dirX, dirZ), r, amount),
    drift: (dt: number, wind: V2 | { x: number; y: number } = [0, -1], rate = 1 / 300) => {
      const [wx, wz] = Array.isArray(wind) ? wind : [wind.x, wind.y];
      s.drift(dt, ...locDir(wx, wz), rate);
    },
    sandiest: () => toWorld(s.sandiest()),
  };
  const api = {
    state: s,
    sand,
    wet: (x: number, z: number, r: number, amount = 1, aspect = 0.5) => s.wet(...loc(x, z), r, amount, aspect),
    squeegee: (x: number, z: number, dirX: number, dirZ: number, width = 0.9) =>
      s.squeegee(...loc(x, z), ...locDir(dirX, dirZ), width),
    dryStep: (dt: number, secondsToDry = 1800) => s.dryStep(dt, secondsToDry),
    wettest: () => toWorld(s.wettest()),
    waterAt: (x: number, z: number) => s.waterAt(...loc(x, z)),
    reset: (name: PresetName) => applyPreset(s, name),
    stats: () => s.stats(),
    lines: () =>
      s.lines.map((l) => ({
        id: l.id,
        a: l.kind === 'x' ? wld(l.c, l.a0) : wld(l.a0, l.c),
        b: l.kind === 'x' ? wld(l.c, l.a1) : wld(l.a1, l.c),
      })),
  };
  Object.assign(root.userData, api);
  root.userData.update = () => flush();
  return root;
}
