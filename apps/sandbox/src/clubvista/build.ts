// clubvista：把一张 MapDef（maps.ts）建成画面 + 导航数据。
// 地形 = 一块块台面（顶面 + 亮唇 + 朝外/朝里的壁）、带子（步道、马路线）、台阶 / 小桥、平涂的球场；摆件 = 资产或白模。
// 导航：每张图一张 0.25 米的高度格子（不能走 = NaN：水面、干河床、noWalk 的密林），挡路形状（树干、石头、家具）、坡道（台阶、小桥）。
import * as THREE from 'three';
import { footprint, type Ramp, type Shape } from '../clubsite/play';
import { insidePoly, smoothLine, smoothLoop, topGeo, wallGeo } from '../clubsite/render/geo';
import { rngFactory } from '../clubsite/render/noise';
import { type Scheme, schemeMats, schemeOpts } from '../clubsite/render/palettes';
import { createMats, type ToonOpts } from '../clubsite/render/toon';
import type { AssetBuild, AssetCtx, SharedUniforms } from './ctx';
import type { Court, ElKey, MapDef, Plate, Prop, Stair, Strip, V2 } from './mapdef';
import { EL, GRADE_AS, PAL, type Pal, SUN_SKIP } from './palette';
import { placeholder, SPECS } from './placeholders';
import { REUSED } from './reuse';

/** 这个场景自己画的资产（assets/<id>.ts，export function build）；同名的优先于复用的 */
const MODS = import.meta.glob<{ build: AssetBuild }>('./assets/*.ts', { eager: true });
export const OWN: Record<string, AssetBuild> = {};
for (const [path, mod] of Object.entries(MODS)) {
  const id = path.replace('./assets/', '').replace(/\.ts$/, '');
  if (typeof mod.build === 'function') OWN[id] = mod.build;
}

export type Kind = 'own' | 'reused' | 'placeholder';

export interface Kit {
  ctxFor(variant: number): AssetCtx;
  makeAsset(asset: string, variant: number): { obj: THREE.Object3D; kind: Kind };
}

export function createKit(o: {
  uniforms: SharedUniforms;
  params: URLSearchParams;
  texelMeters: () => number;
  designTexel: number;
  scheme: Scheme | null;
}): Kit {
  const { params, scheme } = o;
  const rng = rngFactory(Number(params.get('seed') ?? 23));
  const mats = createMats(o.uniforms, o.texelMeters);
  // 投影的毛边（草一样的抖动）在沙地、球场上读成锯齿：这个场景收到 0.35（每个 createMats 自己一份，不影响别的场景）
  mats.globals.uFur.value = Number(params.get('fur') ?? 0.35);
  /** 调色板名字 → 材质参数；配色方案在这里换色（新材质借 GRADE_AS 的组），水面的亮档去掉太阳色 */
  function palOpts(key: keyof Pal, extra?: ToonOpts): ToonOpts {
    const sw = PAL[key];
    const base: ToonOpts = {
      ramp: sw.ramp,
      edge: sw.edge,
      convex: sw.convex,
      tones: sw.tones,
      ...('opts' in sw ? sw.opts : {}),
      ...extra,
    };
    if (!scheme) return base;
    // biome-ignore lint/suspicious/noExplicitAny: 这个场景的材质名不全在 clubsite 的 Pal 里，按 GRADE_AS 借组调色
    const g = schemeOpts(scheme, (GRADE_AS[key] ?? key) as any, base as any) as ToonOpts;
    const k = SUN_SKIP[key];
    return k ? unSun(g, scheme.sun, k) : g;
  }
  const ctxBase = {
    mats: scheme ? schemeMats(scheme, mats) : mats,
    pal: PAL,
    mat(key: keyof Pal, extra?: ToonOpts) {
      return mats.toon(0xffffff, palOpts(key, extra));
    },
    rng,
    uniforms: o.uniforms,
    layers: { FX: 1 },
    texel: o.designTexel,
    params,
  };
  const ctxFor = (variant: number): AssetCtx => ({ ...ctxBase, variant });
  function makeAsset(asset: string, variant: number): { obj: THREE.Object3D; kind: Kind } {
    const own = OWN[asset];
    if (own) return { obj: own(ctxFor(variant)), kind: 'own' };
    const reused = REUSED[asset];
    if (reused) return { obj: reused(ctxFor(variant)), kind: 'reused' };
    const obj = placeholder(ctxFor(variant), asset);
    ctxBase.mats.prepare(obj);
    return { obj, kind: 'placeholder' };
  }
  return { ctxFor, makeAsset };
}

/** 亮档除掉太阳色的 k 份（同 clubpool/scene.ts 的 unSun：水面亮处是天光，不该被午后的太阳染成薄荷绿） */
function unSun(o: ToonOpts, sunHex: number, k: number): ToonOpts {
  const sc = new THREE.Color(sunHex);
  const m = Math.max(sc.r, sc.g, sc.b, 1e-3);
  const f = [sc.r, sc.g, sc.b].map((c) => 1 / (1 + (c / m - 1) * 0.35 * k));
  const fix = (c: THREE.ColorRepresentation) => {
    const h = new THREE.Color(c).getHex();
    const ch = [(h >> 16) & 255, (h >> 8) & 255, h & 255].map((v, i) => Math.min(255, Math.round(v * f[i])));
    return (ch[0] << 16) | (ch[1] << 8) | ch[2];
  };
  const out: ToonOpts = { ...o };
  if (o.ramp) out.ramp = [fix(o.ramp[0]), o.ramp[1], o.ramp[2]];
  if (o.tones) {
    const t = o.tones;
    out.tones = {
      bands: [t.bands[0].map(fix), t.bands[1], t.bands[2]] as typeof t.bands,
      seam: [fix(t.seam[0]), t.seam[1], t.seam[2]],
      hi: [fix(t.hi[0]), t.hi[1], t.hi[2]],
    };
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════════════════

export interface BuiltMap {
  def: MapDef;
  /** 这张图在世界里的 x 偏移 */
  ox: number;
  root: THREE.Group;
  /** 本图坐标的地面高度 */
  groundAt(x: number, z: number): number;
  /** 世界坐标：能站的高度（null = 不能走） */
  surface(x: number, z: number): number | null;
  blocked: Shape[];
  ramps: Ramp[];
  updaters: ((dt: number, t: number) => void)[];
  counts: Record<Kind, number>;
  /** 每个摆件（白模标签、调试） */
  placed: { prop: Prop; obj: THREE.Object3D; kind: Kind }[];
}

interface SPlate extends Plate {
  sp: V2[];
  bb: [number, number, number, number];
  /** 斜坡坑的坑底轮廓（坑口 sp 往里缩 深 × slope） */
  inner?: V2[];
}

const LIP_T = 1.2; // 亮唇（设计纹素）

export function buildMap(def: MapDef, ox: number, kit: Kit, params: URLSearchParams): BuiltMap {
  const ctx = kit.ctxFor(0);
  const rnd = ctx.rng(`vista:${def.id}`);
  const root = new THREE.Group();
  root.name = `map:${def.id}`;
  root.position.x = ox;
  const terrain = new THREE.Group();
  terrain.name = 'terrain';
  root.add(terrain);

  // ── 台面：平滑轮廓、包围盒 ──
  const plates: SPlate[] = def.plates.map((p) => {
    const sp = p.smooth ? smoothLoop(p.pts, p.smooth, rnd, 0.05) : p.pts;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const [x, z] of sp) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    const inner = p.slope && p.h < (p.base ?? 0) ? ringInside(sp, ((p.base ?? 0) - p.h) * p.slope) : undefined;
    return { ...p, sp, bb: [x0, x1, z0, z1], inner };
  });
  const plateAt = (x: number, z: number): SPlate | null => {
    for (let i = plates.length - 1; i >= 0; i--) {
      const p = plates[i];
      if (x < p.bb[0] || x > p.bb[1] || z < p.bb[2] || z > p.bb[3]) continue;
      if (insidePoly([x, z], p.sp)) return p;
    }
    return null;
  };
  /** 地面高度；斜坡坑的坡上按到坑口的距离插值（摆件、步道贴着坡） */
  const groundAt = (x: number, z: number) => {
    const p = plateAt(x, z);
    if (!p) return 0;
    if (p.inner && !insidePoly([x, z], p.inner)) {
      const base = p.base ?? 0;
      const run = (base - p.h) * (p.slope ?? 1);
      return base - Math.min(1, distToPoly(x, z, p.sp) / run) * (base - p.h);
    }
    return p.h;
  };
  /** 斜坡上（坑口和坑底之间）：不能走 */
  const onBank = (x: number, z: number) => {
    const p = plateAt(x, z);
    return !!p?.inner && !insidePoly([x, z], p.inner);
  };

  const LIP = ctx.texel * LIP_T;
  const elOf = (k: ElKey | undefined): ToonOpts => (k && k !== 'none' ? { elem: EL[k] } : {});
  const addMesh = (
    g: THREE.BufferGeometry,
    m: THREE.Material,
    name: string,
    o: { cast?: boolean; recv?: boolean } = {},
  ) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.castShadow = o.cast ?? false;
    mesh.receiveShadow = o.recv ?? true;
    terrain.add(mesh);
    return mesh;
  };

  plates.forEach((p, i) => {
    const base = p.base ?? 0;
    // 洞：后画的、更低的、中心在这块里的台面（坑）
    // 只要最外层的：坑里的坑（球场里的看台、池子里的水花）不另挖，否则洞和洞叠在一起三角化会坏
    const cands = plates.slice(i + 1).filter((q) => q.h < p.h && insidePoly(centroid(q.sp), p.sp));
    const holes = cands
      .filter((q, k) => !cands.some((o, k2) => k2 < k && insidePoly(centroid(q.sp), o.sp)))
      .map((q) => q.sp);
    const floor = p.inner ?? p.sp;
    const top = p.el === 'water' ? waterGeo(floor, p.h) : topGeo(floor, p.h, holes);
    addMesh(top, ctx.mat(p.top, elOf(p.el)), `top:${p.id}`, { cast: p.cast ?? p.h > base + 0.4 });
    // 水面贴着岸一圈 1 纹素的白水线（参考图的池岸都有）
    if (p.el === 'water')
      addMesh(topGeo(p.sp, p.h + 0.006, [ringInside(p.sp, ctx.texel * 1.1)]), ctx.mat('foam'), `foam:${p.id}`);
    // 池沿：坑口外一圈压顶石（rim 米宽）
    if (p.rim)
      addMesh(topGeo(ringInside(p.sp, -p.rim), base + 0.03, [p.sp]), ctx.mat('curb'), `rim:${p.id}`, {
        recv: true,
      });
    if (p.wall === 'none') return;
    const wallKey = (p.wall ?? 'bluff') as keyof Pal;
    const wallMat = ctx.mat(wallKey, wallKey === 'bluff' ? { elem: EL.bluff } : {});
    const lipMat = ctx.mat(wallKey === 'bluff' ? 'bluffLip' : 'cap');
    if (p.h > base) {
      addMesh(wallGeo(p.sp, p.h, p.h - LIP, true), lipMat, `lip:${p.id}`, { recv: false });
      const expo = (x: number, z: number, nx: number, nz: number) =>
        Math.max(0, p.h - groundAt(x + nx * 0.35, z + nz * 0.35));
      addMesh(wallGeo(p.sp, p.h - LIP, base - 0.3, true, 0, expo), wallMat, `wall:${p.id}`, {
        recv: false,
        cast: true,
      });
    } else if (p.inner) {
      // 斜坡坑：坑口到坑底一圈 45° 的坡（朝镜头的那面是暗带，东西两面按太阳分亮暗 —— 下沉读得出来）
      addMesh(bankGeo(p.sp, base, p.inner, p.h), ctx.mat(wallKey, { edge: 0.15, convex: 0.2 }), `wall:${p.id}`, {
        recv: true,
      });
    } else {
      addMesh(wallGeo(p.sp, base, base - LIP, false), lipMat, `lip:${p.id}`, { recv: false });
      addMesh(
        wallGeo(p.sp, base - LIP, p.h - 0.3, false, 0, () => base - p.h),
        wallMat,
        `wall:${p.id}`,
        { recv: false },
      );
    }
  });

  // ── 球场 ──
  for (const c of def.courts) paintCourt(c, (g, key) => addMesh(g, ctx.mat(key), `court:${c.id}:${key}`));

  // ── 带子（步道、马路线）──
  for (const s of def.strips)
    addMesh(
      s.kind === 'stones' ? stonesGeo(s, groundAt, rnd) : stripGeo(s, groundAt),
      ctx.mat(s.mat, elOf(s.el)),
      `strip:${s.id}`,
    );

  // ── 台阶、小桥 ──
  for (const st of def.stairs) {
    if (st.kind === 'stairs')
      addMesh(stairGeo(st), ctx.mat('mesa', { edge: 0.3, convex: 0.35 }), `stairs:${st.id}`, {
        cast: true,
        recv: false,
      });
    else {
      const { deck, rails } = bridgeGeo(st);
      addMesh(deck, ctx.mat('woodWeathered'), `bridge:${st.id}`, { cast: true });
      addMesh(rails, ctx.mat('wood'), `rails:${st.id}`, { cast: true, recv: false });
    }
  }
  ctx.mats.prepare(terrain);
  for (const m of terrain.children as THREE.Mesh[]) {
    if (m.name.startsWith('wall:') || m.name.startsWith('lip:') || m.name.startsWith('stairs:'))
      m.receiveShadow = false;
    if (m.name.startsWith('top:') || m.name.startsWith('strip:') || m.name.startsWith('court:'))
      m.castShadow = m.name.startsWith('top:') && m.castShadow;
  }

  // ── 摆件 ──
  const counts: Record<Kind, number> = { own: 0, reused: 0, placeholder: 0 };
  const placed: BuiltMap['placed'] = [];
  const updaters: BuiltMap['updaters'] = [];
  const blocked: Shape[] = [];
  const showPh = params.get('ph') !== '0';
  root.updateMatrixWorld(true);
  for (const pr of def.props) {
    const { obj, kind } = kit.makeAsset(pr.a, pr.v ?? 0);
    if (kind === 'placeholder' && !showPh) continue;
    counts[kind]++;
    obj.position.set(pr.x, pr.y ?? groundAt(pr.x, pr.z), pr.z);
    obj.rotation.y = pr.r ?? 0;
    obj.scale.setScalar(pr.s ?? 1);
    obj.name = `prop:${pr.a}`;
    if (pr.prop !== undefined) obj.userData.setProp?.(pr.prop);
    if (pr.pose) obj.userData.pose?.(pr.pose, 0.3);
    root.add(obj);
    obj.updateMatrixWorld(true);
    obj.traverse((c) => {
      const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
      if (u) updaters.push(u);
    });
    placed.push({ prop: pr, obj, kind });
    const b = blockOf(pr, obj);
    if (b) blocked.push(b);
  }

  // ── 导航：0.25 米的高度格子（本图坐标），NaN = 不能走 ──
  const CELL = 0.25;
  const gx0 = -18;
  const gz0 = -8;
  const nx = Math.ceil((def.W + 36) / CELL);
  const nz = Math.ceil((def.D + 16) / CELL);
  const grid = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = gx0 + (i + 0.5) * CELL;
      const z = gz0 + (j + 0.5) * CELL;
      const p = plateAt(x, z);
      let h = p ? p.h : 0;
      if (p && p.walk === false) h = Number.NaN;
      else if (onBank(x, z)) h = Number.NaN;
      else if (def.noWalk.some((poly) => insidePoly([x, z], poly))) h = Number.NaN;
      grid[j * nx + i] = h;
    }
  const surface = (wx: number, wz: number): number | null => {
    const i = Math.floor((wx - ox - gx0) / CELL);
    const j = Math.floor((wz - gz0) / CELL);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return null;
    const h = grid[j * nx + i];
    return Number.isNaN(h) ? null : h;
  };
  const ramps: Ramp[] = def.stairs.map((s) => ({
    x0: s.x0 + ox,
    x1: s.x1 + ox,
    z0: s.z0,
    z1: s.z1,
    from: s.h0,
    to: s.h1,
    axis: s.axis,
  }));
  return { def, ox, root, groundAt, surface, blocked, ramps, updaters, counts, placed };
}

// ── 挡路：按资产给默认 ──
const TRUNK: Record<string, number> = {
  'fan-palm': 0.55,
  'palo-verde': 0.5,
  'smoke-tree': 0.7,
  creosote: 0.85,
  brittlebush: 0.65,
  agave: 0.7,
  cholla: 0.55,
  'barrel-cactus': 0.6,
  ocotillo: 0.45,
  player: 0.32,
  coach: 0.32,
  'umbrella-hot': 0.18,
  umbrella: 0.18,
  'stop-pole': 0.15,
};
function blockOf(pr: Prop, obj: THREE.Object3D): Shape | null {
  if (pr.block === false) return null;
  const wx = obj.getWorldPosition(new THREE.Vector3());
  if (typeof pr.block === 'number') return { x: wx.x, z: wx.z, r: pr.block };
  const r = TRUNK[pr.a];
  if (r !== undefined && pr.block !== 'box') return { x: wx.x, z: wx.z, r: r * (pr.s ?? 1) };
  const sp = SPECS[pr.a];
  if (sp?.shape === 'roof') {
    // 有顶棚的（候车亭、凉棚、前台）：人能走进去，只挡后墙
    const back = new THREE.Box3(
      new THREE.Vector3(-sp.w * 0.4, 0, -sp.d / 2 + 0.15),
      new THREE.Vector3(sp.w * 0.4, 1.1, -sp.d / 2 + 0.65),
    ).applyMatrix4(obj.matrixWorld);
    return { x0: back.min.x, x1: back.max.x, z0: back.min.z, z1: back.max.z };
  }
  if (sp?.shape === 'fall') return null;
  return footprint(obj, 0.12);
}

// ── 几何 ──

function centroid(pts: V2[]): V2 {
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p[0];
    z += p[1];
  }
  return [x / pts.length, z / pts.length];
}

/** 带子：中心线平滑后左右各 w/2，每个顶点贴着地面 */
function stripGeo(s: Strip, groundAt: (x: number, z: number) => number): THREE.BufferGeometry {
  const c = s.pts.length > 2 ? smoothLine(s.pts, 0.5) : s.pts;
  const pos: number[] = [];
  const idx: number[] = [];
  const lift = s.lift ?? 0.012;
  for (let i = 0; i < c.length; i++) {
    const a = c[Math.max(0, i - 1)];
    const b = c[Math.min(c.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * (s.w / 2);
    const nz = (dx / l) * (s.w / 2);
    const [x, z] = c[i];
    for (const k of [1, -1]) {
      const px = x + nx * k;
      const pz = z + nz * k;
      pos.push(px, groundAt(x, z) + lift, pz);
    }
    if (i > 0) {
      const v = i * 2;
      idx.push(v - 2, v - 1, v, v - 1, v + 1, v);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 法线一律朝上（带子是平的；computeVertexNormals 的绕向可能朝下）
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return fixWinding(g);
}

/** 踏脚石：沿中心线每 ~1 米一块扁圆石（左右错开、大小有变化），贴着地面 */
function stonesGeo(s: Strip, groundAt: (x: number, z: number) => number, rnd: () => number): THREE.BufferGeometry {
  const c = s.pts.length > 2 ? smoothLine(s.pts, 0.25) : s.pts;
  const geos: THREE.BufferGeometry[] = [];
  let acc = 0;
  let k = 0;
  for (let i = 1; i < c.length; i++) {
    const [x0, z0] = c[i - 1];
    const [x1, z1] = c[i];
    const l = Math.hypot(x1 - x0, z1 - z0);
    acc += l;
    if (acc < 1.05) continue;
    acc = 0;
    const nx = -(z1 - z0) / (l || 1);
    const nz = (x1 - x0) / (l || 1);
    const off = (k++ % 2 ? 1 : -1) * s.w * 0.16;
    const x = x1 + nx * off;
    const z = z1 + nz * off;
    const r = s.w * (0.3 + rnd() * 0.08);
    const pts: V2[] = [];
    for (let j = 0; j < 9; j++) {
      const a = (j / 9) * Math.PI * 2;
      const w = 1 + (rnd() - 0.5) * 0.2;
      pts.push([x + Math.cos(a) * r * 1.15 * w, z + Math.sin(a) * r * 0.85 * w]);
    }
    const y = groundAt(x, z) + (s.lift ?? 0.04);
    geos.push(topGeo(pts, y));
    // 一纹素厚的边（石头比地面高一点，下沿出一条暗线）
    geos.push(wallGeo(pts, y, y - 0.06, true));
  }
  for (const g of geos) if (!g.getAttribute('normal')) g.computeVertexNormals();
  return merge(geos);
}

/** 保证三角形朝上（从上往下看是逆时针），否则背面剔除会把它剔掉 */
function fixWinding(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const idx = g.getIndex();
  if (!idx) return g;
  const a = idx.array as unknown as number[];
  const out: number[] = [];
  for (let t = 0; t < a.length; t += 3) {
    const [i, j, k] = [a[t], a[t + 1], a[t + 2]];
    const ux = p.getX(j) - p.getX(i);
    const uz = p.getZ(j) - p.getZ(i);
    const vx = p.getX(k) - p.getX(i);
    const vz = p.getZ(k) - p.getZ(i);
    // 朝上的面：(u × v).y > 0 ⇔ uz·vx − ux·vz > 0
    if (uz * vx - ux * vz > 0) out.push(i, j, k);
    else out.push(i, k, j);
  }
  g.setIndex(out);
  return g;
}

/** 台阶：一级级的方块（顶在 h，底埋到低的那头以下）；朝镜头的立面是暗条 */
function stairGeo(s: Stair): THREE.BufferGeometry {
  const dh = Math.abs(s.h1 - s.h0);
  const n = Math.max(2, Math.round(dh / 0.26));
  const lo = Math.min(s.h0, s.h1) - 0.3;
  const geos: THREE.BufferGeometry[] = [];
  const len = s.axis === 'z' ? s.z1 - s.z0 : s.x1 - s.x0;
  const run = len / n;
  for (let k = 0; k < n; k++) {
    const t = s.h0 + ((s.h1 - s.h0) * (k + (s.h1 > s.h0 ? 1 : 0))) / n;
    const h = t - lo;
    if (s.axis === 'z') {
      const z = s.z0 + run * (k + 0.5);
      geos.push(new THREE.BoxGeometry(s.x1 - s.x0, h, run).translate((s.x0 + s.x1) / 2, lo + h / 2, z));
    } else {
      const x = s.x0 + run * (k + 0.5);
      geos.push(new THREE.BoxGeometry(run, h, s.z1 - s.z0).translate(x, lo + h / 2, (s.z0 + s.z1) / 2));
    }
  }
  return merge(geos);
}

/** 平的木桥：桥面 + 两侧矮栏（沿长轴） */
function bridgeGeo(s: Stair): { deck: THREE.BufferGeometry; rails: THREE.BufferGeometry } {
  const h = s.h0;
  const w = s.x1 - s.x0;
  const d = s.z1 - s.z0;
  const cx = (s.x0 + s.x1) / 2;
  const cz = (s.z0 + s.z1) / 2;
  const deck = new THREE.BoxGeometry(w, 0.3, d).translate(cx, h - 0.15, cz);
  // 两侧：每 1.6 米一根 0.18 米的立柱 + 0.85 米高的扶手（俯视 45° 扶手和桥面边分成两条线，读得出是桥）
  const rails: THREE.BufferGeometry[] = [];
  const t = 0.18;
  const along = s.axis === 'x' ? w : d;
  const n = Math.max(2, Math.round(along / 1.6));
  for (const side of [0, 1]) {
    const off = side ? (s.axis === 'x' ? s.z1 - t / 2 : s.x1 - t / 2) : s.axis === 'x' ? s.z0 + t / 2 : s.x0 + t / 2;
    for (let k = 0; k <= n; k++) {
      const u = -along / 2 + t / 2 + ((along - t) * k) / n;
      rails.push(
        s.axis === 'x'
          ? new THREE.BoxGeometry(t, 0.85, t).translate(cx + u, h + 0.425, off)
          : new THREE.BoxGeometry(t, 0.85, t).translate(off, h + 0.425, cz + u),
      );
    }
    rails.push(
      s.axis === 'x'
        ? new THREE.BoxGeometry(w, 0.14, t + 0.04).translate(cx, h + 0.85, off)
        : new THREE.BoxGeometry(t + 0.04, 0.14, d).translate(off, h + 0.85, cz),
    );
  }
  return { deck, rails: merge(rails) };
}

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** 一块场：外场（已经是台面就不画）、内场、白线 */
function paintCourt(c: Court, add: (g: THREE.BufferGeometry, key: keyof Pal) => void) {
  const L = 23.77;
  const DW = 10.97;
  const SW = 8.23;
  const SVC = 6.4;
  const LW = 0.1;
  const cx = (c.x0 + c.x1) / 2;
  const cz = (c.z0 + c.z1) / 2;
  /** 场的本地 (u 沿长轴, v 沿短轴) → 世界矩形 */
  const r = (u0: number, u1: number, v0: number, v1: number) =>
    c.axis === 'x'
      ? { x0: cx + u0, x1: cx + u1, z0: cz + v0, z1: cz + v1 }
      : { x0: cx + v0, x1: cx + v1, z0: cz + u0, z1: cz + u1 };
  const q = (rr: { x0: number; x1: number; z0: number; z1: number }, y: number) => {
    const g = new THREE.PlaneGeometry(rr.x1 - rr.x0, rr.z1 - rr.z0).rotateX(-Math.PI / 2);
    g.translate((rr.x0 + rr.x1) / 2, c.h + y, (rr.z0 + rr.z1) / 2);
    g.deleteAttribute('uv');
    return g;
  };
  add(q({ x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1 }, 0.008), c.look === 'practice' ? 'practiceOut' : 'courtOut');
  const m = 1.4;
  add(
    q(r(-L / 2 - m, L / 2 + m, -DW / 2 - m * 0.6, DW / 2 + m * 0.6), 0.014),
    c.look === 'practice' ? 'practiceIn' : 'courtIn',
  );
  const lines: THREE.BufferGeometry[] = [];
  const line = (u0: number, u1: number, v0: number, v1: number) => lines.push(q(r(u0, u1, v0, v1), 0.02));
  for (const s of [-1, 1]) {
    line((s * L) / 2 - LW / 2, (s * L) / 2 + LW / 2, -DW / 2, DW / 2);
    line(-L / 2, L / 2, (s * DW) / 2 - LW / 2, (s * DW) / 2 + LW / 2);
    line(-L / 2, L / 2, (s * SW) / 2 - LW / 2, (s * SW) / 2 + LW / 2);
    line(s * SVC - LW / 2, s * SVC + LW / 2, -SW / 2, SW / 2);
  }
  line(-SVC, SVC, -LW / 2, LW / 2);
  add(merge(lines), 'line');
}

/** 点到闭合折线的距离 */
function distToPoly(x: number, z: number, pts: V2[]): number {
  let best = Infinity;
  for (let k = 0; k < pts.length; k++) {
    const [ax, az] = pts[k];
    const [bx, bz] = pts[(k + 1) % pts.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/** 斜坡：上沿 outer（高 yTop）到下沿 inner（高 yBot），两圈点数一样；面法线朝坑里 */
function bankGeo(outer: V2[], yTop: number, inner: V2[], yBot: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const n = outer.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = [outer[i][0], yTop, outer[i][1]];
    const b = [outer[j][0], yTop, outer[j][1]];
    const c = [inner[j][0], yBot, inner[j][1]];
    const d = [inner[i][0], yBot, inner[i][1]];
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // 法线要朝上（朝坑里、朝天）：反了就整体翻
  const nrm = g.getAttribute('normal');
  let up = 0;
  for (let i = 0; i < nrm.count; i++) up += nrm.getY(i);
  if (up < 0) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i += 3) {
      const t = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)];
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, t[0], t[1], t[2]);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** 往多边形里缩 d 米（按顶点法线，小 d 够用；同 desert3d-v2 的 ringInside，这里重写） */
function ringInside(pts: V2[], d: number): V2[] {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    a += x0 * z1 - x1 * z0;
  }
  const s = a > 0 ? -1 : 1;
  const n = pts.length;
  return pts.map((p, i) => {
    const q0 = pts[(i - 1 + n) % n];
    const q1 = pts[(i + 1) % n];
    const dx = q1[0] - q0[0];
    const dz = q1[1] - q0[1];
    const l = Math.hypot(dx, dz) || 1;
    return [p[0] + ((s * dz) / l) * d, p[1] + ((s * -dx) / l) * d] as V2;
  });
}

/** 水面：一块格子网格，顶点带"到北岸 / 到岸的距离"（材质规范 v2 的 water 元素要；做法同 desert3d-v2 的 waterGeo，这里重写） */
function waterGeo(pool: V2[], y: number): THREE.BufferGeometry {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of pool) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  const m = 0.4;
  const g = new THREE.PlaneGeometry(
    x1 - x0 + 2 * m,
    z1 - z0 + 2 * m,
    Math.ceil((x1 - x0) / 0.3),
    Math.ceil((z1 - z0) / 0.3),
  );
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  const ex = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let north = 0;
    let shore = 0;
    if (insidePoly([x, z], pool)) {
      let best = Infinity;
      shore = Infinity;
      for (let k = 0; k < pool.length; k++) {
        const [ax, az] = pool[k];
        const [bx, bz] = pool[(k + 1) % pool.length];
        if (ax > x !== bx > x) {
          const zc = az + ((x - ax) / (bx - ax)) * (bz - az);
          if (zc < z) best = Math.min(best, z - zc);
        }
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        shore = Math.min(shore, Math.hypot(x - ax - dx * t, z - az - dz * t));
      }
      north = Number.isFinite(best) ? best : 0;
    }
    ex.set([north, shore, 0, 0], i * 4);
  }
  g.setAttribute('aElem', new THREE.BufferAttribute(ex, 4));
  return g;
}
