// 批 HS：只有外景的住宅（2026-11-21 小镇压紧 · 美术精细化，住宅代理）。
//
// 两层：
// - houseBody(look)：一栋房子的几何（本地：原点 = 脚印中心、y 0 = 地面、+z = 朝街的那面），按（材质, 几何）一块块给出。
//   四个原型（composition C4）：① 西班牙复兴（四坡红瓦 + 拱廊门廊 + 竖窗百叶）② 中世纪现代蝶形顶（V 顶、彩色封檐板、
//   朝街一段花格砖屏风墙）③ 中世纪现代平顶（前檐出挑 1.2 米 = 廊下暗带、一侧车棚）④ 单坡顶 + 毛石贴面墙（高窗一条）。
//   墙一律有 0.32 米勒脚（低一级）；每面都开窗（朝街 2 扇 + 门，背面 2 扇，两侧各 1 扇：朝街的面有一半看不见 ——
//   路南那排的正面朝北，镜头看到的是后墙），窗 = 1 纹素亮框 + 玻璃 + 窗台；夜里亮的窗用 jug（detail/town.ts §9 换暖橙）。
// - placeHouses(d)：build.ts 直接调（不过 townWrap：这里写的就是缩完的世界坐标）。每栋 = 房子 + 一块地：前院碎石（1/4 草坪）、
//   门前步道、车道（一半停车）、成簇的龙舌兰 / 仙人球 / 石头、一棵树（棕榈巷、东环每家两棵棕榈）、信箱；
//   后院 1.6 米灰泥墙围到地界（邻居的墙接上 → 一排房子连成一条带，朝南那面是暗带），1/3 有泳池（池沿 + 深青内壁 + 水），
//   其余铺地 + 草坪 / 柑橘树。相邻两栋不同原型、不同墙色。
// 规矩同 pixel-scene：可见的东西 ≥ 2 设计纹素（0.09 米），细杆不投影，平的不投影，小植物不放房子南边的影子里。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { smoothLoop, topGeo as topGeoW, wallGeo } from '../../clubsite/render/geo';
import type { DetailCtx, InstItem } from '../build';
import type { AssetFn } from '../ctx';
import { palmCrownGeo } from '../geoprep';
import { BUILDINGS, distToLine, FLOOR, GREENS, HOTEL_PLOT, houses, inPoly, ROADS, SITES, type V2 } from '../layout';
import { HOUSE_WALLS, type PalKey, TOWN_EL, TOWN_TONES } from '../palette';
import { inClubBox } from '../terrain';

const TAU = Math.PI * 2;
type P2 = [number, number];
/** 合并前统一：不带索引、只留 position + normal（BoxGeometry 有 uv、自己攒的没有 → mergeGeometries 会失败） */
function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const o = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(o.attributes)) if (k !== 'position' && k !== 'normal') o.deleteAttribute(k);
  if (!o.attributes.normal) o.computeVertexNormals();
  return o;
}
const mg = (list: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const g = mergeGeometries(list.map(clean));
  if (g) return g;
  console.error(`houses: mergeGeometries failed (${list.length} parts)`);
  const e = new THREE.BufferGeometry();
  e.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  e.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
  return e;
};

// ── 外观 ──────────────────────────────────────────────────────────────
export type Arche = 'spanish' | 'butterfly' | 'flat' | 'shed';
export const ARCHES: readonly Arche[] = ['spanish', 'butterfly', 'flat', 'shed'];
/** 原型的份额（红瓦 ≈ 一半、白碎石平顶 ≈ 四成多、板岩 ≈ 一成不到） */
/**
 * 屋顶的份额（第 3 轮：西班牙红瓦 ≤ 35%；住宅不用 roofMetal —— 像仓库）。原型跟着屋顶：红瓦 = 西班牙，
 * 板岩 = 蝶形 / 单坡，白碎石 = 平顶 / 单坡
 */
type RoofKey = 'roofTile' | 'roofGravel' | 'slate';
/** 屋顶挑选的种子（换一个就整圈重排；挑的是验收点正午饱和度都过线的那个） */
const ROOF_SEED = 1;
const ROOF_W: Record<RoofKey, number> = { roofTile: 0.28, roofGravel: 0.35, slate: 0.37 };

export interface HouseLook {
  arche: Arche;
  w: number;
  d: number;
  h: number;
  wall: PalKey;
  roof: PalKey;
  fascia: PalKey;
  door: PalKey;
  /** 百叶（西班牙）/ 花格砖屏风在哪边（-1 / 1） */
  side: number;
  /** 夜里第 i 扇窗亮不亮 */
  lit(i: number): boolean;
  /** 门廊灯 */
  porchLight: boolean;
  /** 平顶的车棚：-1 / 1 = 在哪边，0 = 没有 */
  carport: number;
  chimney: boolean;
}
export interface Part {
  key: PalKey;
  g: THREE.BufferGeometry;
  /** thin = 细杆（不投影）；flat = 贴地的（不投影） */
  mode?: 'thin' | 'flat';
}

const PLINTH: Partial<Record<PalKey, PalKey>> = {
  houseStucco: 'adobe',
  houseWhite: 'adobe',
  housePink: 'adobe',
  houseMint: 'adobe',
};
/** 门、封檐板、百叶、车、伞共用一小组颜色（材质种类少 = 绘制少） */
const DOORS: PalKey[] = ['clothTeal', 'flowerYellow', 'clothRed'];
const FASCIA: PalKey[] = ['clothTeal', 'flowerYellow', 'clothRed'];
const SHUTTER: PalKey[] = ['clothTeal', 'clothRed', 'flowerYellow'];

/** 平顶一圈 1 纹素亮压顶（宽 0.07、高 0.04，压在屋面上沿） */
function coping(W: number, D: number, y: number, z: number): THREE.BufferGeometry {
  const t = 0.07;
  return mg([
    bx(W, 0.04, t, 0, y, z + D / 2 - t / 2),
    bx(W, 0.04, t, 0, y, z - D / 2 + t / 2),
    bx(t, 0.04, D, W / 2 - t / 2, y, z),
    bx(t, 0.04, D, -W / 2 + t / 2, y, z),
  ]);
}
/** 盒子：中心 x、z，底在 y */
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

/** 三角形攒成的面（法线按绕向；朝下的翻过来） */
function tris(pos: number[]): THREE.BufferGeometry {
  for (let i = 0; i < pos.length; i += 9) {
    const a = new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]);
    const b = new THREE.Vector3(pos[i + 3], pos[i + 4], pos[i + 5]);
    const c = new THREE.Vector3(pos[i + 6], pos[i + 7], pos[i + 8]);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.y < 0)
      for (let k = 0; k < 3; k++) {
        const t = pos[i + 3 + k];
        pos[i + 3 + k] = pos[i + 6 + k];
        pos[i + 6 + k] = t;
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** 竖直面的一侧轮廓（x-y 平面里的多边形）沿 z 挤出 d（中心在 z 0） */
function prismZ(profile: P2[], d: number): THREE.BufferGeometry {
  const sh = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
}
/** 侧面轮廓（z-y 平面）沿 x 挤出 w */
function prismX(profile: P2[], w: number): THREE.BufferGeometry {
  // 先在 x-y 里建（x ← z），挤出沿 z，再绕 y 转 −90°：本地 z → x、x → −z
  const g = prismZ(
    profile.map(([z, y]) => [-z, y]),
    w,
  );
  return g.rotateY(Math.PI / 2);
}

type Face = 'front' | 'back' | 'left' | 'right';
/** 面的坐标（x 沿墙、y 朝上、+z 朝墙外，原点在墙面底边正中）→ 房子本地 */
function onFace(L: { w: number; d: number }, f: Face, g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (f === 'front') return g.translate(0, 0, L.d / 2);
  if (f === 'back') return g.rotateY(Math.PI).translate(0, 0, -L.d / 2);
  if (f === 'right') return g.rotateY(Math.PI / 2).translate(L.w / 2, 0, 0);
  return g.rotateY(-Math.PI / 2).translate(-L.w / 2, 0, 0);
}

/**
 * 一栋房子的几何（本地）。门在朝街那面（+z），门口一块铺地；返回门廊灯的位置（本地，没有 = null）、车棚的框。
 */
export function houseBody(L: HouseLook): {
  parts: Part[];
  porch: [number, number, number] | null;
  carport: { x: number; z: number; w: number; d: number } | null;
  door: number;
} {
  const parts: Part[] = [];
  const P = (key: PalKey, g: THREE.BufferGeometry, mode?: Part['mode']) => parts.push({ key, g, mode });
  const { w, d, h } = L;
  const trim: PalKey = 'clothWhite';
  let win = 0;
  const glass = () => (L.lit(win++) ? 'jug' : 'courtBleach') as PalKey;

  // 墙身（蝶形、单坡的墙顶跟着屋面走：挤出的轮廓）
  const rise = L.arche === 'butterfly' ? Math.min(0.9, w * 0.09) : L.arche === 'shed' ? 0.75 : 0;
  if (L.arche === 'butterfly')
    P(
      L.wall,
      prismZ(
        [
          [-w / 2, 0],
          [w / 2, 0],
          [w / 2, h + rise],
          [0, h],
          [-w / 2, h + rise],
        ],
        d,
      ),
    );
  else if (L.arche === 'shed')
    P(
      L.wall,
      prismX(
        [
          [-d / 2, 0],
          [d / 2, 0],
          [d / 2, h + rise],
          [-d / 2, h],
        ],
        w,
      ),
    );
  else P(L.wall, bx(w, h, d, 0, 0, 0));
  // 勒脚：低一级的一圈
  P(PLINTH[L.wall] ?? 'adobe', bx(w + 0.08, 0.32, d + 0.08, 0, 0, 0));

  // ── 门（朝街正中偏一侧；西班牙的在正中、拱廊后面）──
  const door = L.arche === 'spanish' ? 0 : L.side * -Math.min(1.4, w * 0.18);
  {
    const fr: THREE.BufferGeometry[] = [];
    fr.push(bx(1.22, 0.11, 0.07, door, 2.0, 0.035));
    fr.push(bx(0.11, 2.0, 0.07, door - 0.555, 0, 0.035));
    fr.push(bx(0.11, 2.0, 0.07, door + 0.555, 0, 0.035));
    P(trim, onFace(L, 'front', mg(fr)));
    P(L.door, onFace(L, 'front', bx(1.0, 2.0, 0.08, door, 0, 0.02)));
    // 门口一块铺地（陶砖）
    P('tile', bx(1.6, 0.05, 1.3, door, 0, d / 2 + 0.65), 'flat');
  }
  /** 一扇窗：u = 沿墙的中心，y0 = 窗台高，ww × wh；kind = 横窗（中世纪现代，一根竖梃）/ 竖窗（西班牙，两扇百叶） */
  const addWin = (f: Face, u: number, y0: number, ww: number, wh: number, tall: boolean) => {
    // 框 = 一块比玻璃大一圈（1 纹素）的板，玻璃贴在它前面；窗台 1 纹素亮边伸出来（三角形省：一扇窗 ≈ 40）
    const fr: THREE.BufferGeometry[] = [bx(ww + 0.18, wh + 0.18, 0.05, u, y0 - 0.09, 0.025)];
    fr.push(bx(ww + 0.34, 0.09, 0.18, u, y0 - 0.18, 0.09));
    P(trim, onFace(L, f, mg(fr)));
    const gl: THREE.BufferGeometry[] = [new THREE.PlaneGeometry(ww, wh).translate(u, y0 + wh / 2, 0.056)];
    P(glass(), onFace(L, f, mg(gl)));
    if (!tall) P(trim, onFace(L, f, new THREE.PlaneGeometry(0.09, wh).translate(u, y0 + wh / 2, 0.06)));
    if (tall)
      for (const s of [-1, 1])
        P(
          SHUTTER[(L.door.length + (s > 0 ? 1 : 0)) % SHUTTER.length],
          onFace(L, f, bx(ww * 0.5, wh + 0.09, 0.06, u + s * (ww * 0.75 + 0.14), y0 - 0.045, 0.03)),
        );
  };
  const tall = L.arche === 'spanish';
  const [ww, wh, wy] = tall ? [0.72, 1.18, 0.82] : [1.55, 0.86, 1.08];
  // 朝街：门两边各一段墙，够宽就在正中开一扇（窗离门框、离墙角都让开）
  for (const [a, b] of [
    [-w / 2 + 0.4, door - 0.75],
    [door + 0.75, w / 2 - 0.4],
  ]) {
    const extra = tall ? ww * 1.3 + 0.2 : 0.2;
    if (b - a >= ww + extra) addWin('front', (a + b) / 2, wy, ww, wh, tall);
  }
  // 背面：两扇（平顶 / 蝶形的一扇换成落地推拉门）
  if (L.arche === 'flat' || L.arche === 'butterfly') {
    addWin('back', -w * 0.22, 0.12, 1.9, 1.9, false);
    addWin('back', w * 0.26, wy, ww, wh, false);
  } else {
    addWin('back', -w * 0.25, wy, ww, wh, tall);
    addWin('back', w * 0.25, wy, ww, wh, tall);
  }
  // 两侧各一扇
  for (const f of ['left', 'right'] as const) addWin(f, 0, wy, tall ? ww : 1.1, wh, tall);

  // ── 屋顶 ──
  let porch: [number, number, number] | null = L.porchLight ? [door + 0.8, 1.95, d / 2 + 0.08] : null;
  let carport: { x: number; z: number; w: number; d: number } | null = null;
  if (L.arche === 'spanish') {
    // 四坡：屋脊沿长边，坡度 ≈ 24°；檐下一块 0.14 米的檐板（侧面 = 一条暗线）
    const ov = 0.42;
    const W = w + 2 * ov;
    const D = d + 2 * ov;
    const ye = h + 0.14;
    const along = W >= D;
    const half = (along ? D : W) / 2;
    const yr = ye + half * 0.45;
    const r = Math.max(0.01, (along ? W : D) / 2 - half);
    const pos: number[] = [];
    const quad = (a: number[], b: number[], c: number[], e: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...e);
    if (along) {
      const r0 = [-r, yr, 0];
      const r1 = [r, yr, 0];
      quad([-W / 2, ye, D / 2], [W / 2, ye, D / 2], r1, r0);
      quad([W / 2, ye, -D / 2], [-W / 2, ye, -D / 2], r0, r1);
      pos.push(-W / 2, ye, -D / 2, -W / 2, ye, D / 2, ...r0);
      pos.push(W / 2, ye, D / 2, W / 2, ye, -D / 2, ...r1);
    } else {
      const r0 = [0, yr, -r];
      const r1 = [0, yr, r];
      quad([W / 2, ye, D / 2], [W / 2, ye, -D / 2], r0, r1);
      quad([-W / 2, ye, -D / 2], [-W / 2, ye, D / 2], r1, r0);
      pos.push(-W / 2, ye, D / 2, W / 2, ye, D / 2, ...r1);
      pos.push(W / 2, ye, -D / 2, -W / 2, ye, -D / 2, ...r0);
    }
    P('roofTile', tris(pos));
    P('roofTile', bx(W, 0.14, D, 0, h, 0));
    // 拱廊门廊：朝街一段（门在正中）—— 单坡红瓦廊顶 + 墩子 + 过梁，墩子和过梁之间垫两级小方块（屏幕上读成拱）
    const pw = Math.min(w - 1.4, 5.6);
    if (pw >= 3.2) {
      const pd = 1.6;
      const yTop = h - 0.1;
      const yLo = 2.42;
      const len = Math.hypot(pd + 0.3, yTop - yLo);
      const a = Math.atan2(yTop - yLo, pd + 0.3);
      P(
        'roofTile',
        new THREE.BoxGeometry(pw + 0.5, 0.12, len)
          .rotateX(a)
          .translate(0, (yTop + yLo) / 2 + 0.06, d / 2 + (pd + 0.3) / 2),
      );
      const n = pw > 4.6 ? 3 : 1;
      const zf = d / 2 + pd - 0.16;
      const arc: THREE.BufferGeometry[] = [bx(pw, 0.4, 0.32, 0, 2.02, zf)];
      const span = (pw - 0.42) / n;
      for (let k = 0; k <= n; k++) {
        const x = -pw / 2 + 0.21 + k * span;
        arc.push(bx(0.42, 2.02, 0.32, x, 0, zf));
        for (const s of [-1, 1]) {
          if ((k === 0 && s < 0) || (k === n && s > 0)) continue;
          arc.push(bx(0.27, 0.27, 0.32, x + s * (0.21 + 0.135), 2.02 - 0.27, zf));
          arc.push(bx(0.14, 0.18, 0.32, x + s * (0.21 + 0.27 + 0.07), 2.02 - 0.18, zf));
        }
      }
      P(L.wall, mg(arc));
      P('tile', bx(pw, 0.07, pd, 0, 0, d / 2 + pd / 2), 'flat');
      if (porch) porch = [0, 2.3, d / 2 + 0.9];
    }
    if (L.chimney) {
      P('adobe', bx(0.8, 1.15, 0.8, L.side * w * 0.22, h + 0.3, -d * 0.18));
      P('roofTile', bx(0.96, 0.12, 0.96, L.side * w * 0.22, h + 1.45, -d * 0.18));
    }
  } else if (L.arche === 'butterfly') {
    // 蝶形：两片往里斜（谷沿前后走），外沿一圈彩色封檐板
    const a = Math.atan2(rise, w / 2);
    const sw = w / 2 + 0.55;
    const sd = d + 1.0;
    const len = sw / Math.cos(a);
    for (const s of [-1, 1]) {
      const cx = (s * sw) / 2;
      const cy = h + 0.09 + (s * cx * Math.tan(a)) / 1;
      // 两片分两档明暗：朝上的面法线手给（一片偏北迎光 → 亮档，一片偏东南背光 → 中档；投影照几何）
      const slab = new THREE.BoxGeometry(len, 0.18, sd).rotateZ(s * a).translate(cx, cy, 0);
      const nn = slab.attributes.normal as THREE.BufferAttribute;
      const up =
        s < 0 ? new THREE.Vector3(-0.15, 0.9, -0.42).normalize() : new THREE.Vector3(0.3, 0.86, 0.3).normalize();
      for (let i = 0; i < nn.count; i++) if (nn.getY(i) > 0.5) nn.setXYZ(i, up.x, up.y, up.z);
      P(L.roof, slab);
      for (const e of [-1, 1])
        P(
          L.fascia,
          new THREE.BoxGeometry(len, 0.26, 0.1).rotateZ(s * a).translate(cx, cy - 0.02, (e * (sd + 0.1)) / 2),
        );
      P(L.fascia, bx(0.1, 0.26, sd + 0.2, s * (sw + 0.05), h + rise + 0.55 * Math.tan(a) - 0.06, 0));
    }
    // 谷线：中间 1 纹素暗缝
    P('ironwork', bx(0.08, 0.05, sd, 0, h + 0.17, 0));
    // 朝街一段花格砖屏风墙（门的另一边，离墙 1 米）+ 压顶
    const sx = door + L.side * 2.3;
    if (Math.abs(sx) < w / 2 + 0.6) {
      P('breezeBlock', bx(2.2, 1.75, 0.24, sx, 0, d / 2 + 1.0));
      P('terrazzo', bx(2.3, 0.1, 0.32, sx, 1.75, d / 2 + 1.0));
    }
  } else if (L.arche === 'flat') {
    // 平顶：前檐出挑 1.2 米（廊下暗带），其余 0.5；封檐板一道颜色
    P(L.roof, bx(w + 1.0, 0.3, d + 1.7, 0, h, 0.35));
    P(L.fascia, bx(w + 1.08, 0.22, d + 1.78, 0, h + 0.0, 0.35));
    P('foam', coping(w + 1.0, d + 1.7, h + 0.3, 0.35));
    if (L.carport) {
      const cw = 3.5;
      const cd = 6.2;
      const cx = L.carport * (w / 2 + cw / 2 + 0.1);
      const cz = d / 2 + 0.6 - cd / 2;
      P(L.roof, bx(cw + 0.3, 0.22, cd, cx, h - 0.22, cz));
      P(L.fascia, bx(cw + 0.36, 0.18, cd + 0.06, cx, h - 0.22, cz));
      for (const dz of [-cd / 2 + 0.3, cd / 2 - 0.3])
        P('ironwork', bx(0.16, h - 0.22, 0.16, cx + L.carport * (cw / 2 - 0.05), 0, cz + dz), 'thin');
      carport = { x: cx, z: cz, w: cw, d: cd };
    }
    if (L.chimney) P('desertStone', bx(0.9, 1.0, 0.9, -L.side * w * 0.25, h + 0.3, -d * 0.2));
  } else {
    // 单坡：前高后低，板岩 / 白碎石；正面高窗一条 + 一侧毛石贴面
    const a = Math.atan2(rise, d);
    const sd = d + 1.1;
    const len = sd / Math.cos(a);
    P(
      L.roof,
      new THREE.BoxGeometry(w + 0.8, 0.2, len).rotateX(-a).translate(0, h + rise / 2 + 0.1 + 0.05 * Math.tan(a), 0.05),
    );
    P(L.fascia, bx(w + 0.86, 0.24, 0.1, 0, h + rise + 0.03, d / 2 + 0.6));
    if (L.roof === 'roofGravel')
      P(
        'clothWhite',
        coping(w + 0.8, len, 0.2, 0)
          .rotateX(-a)
          .translate(0, h + rise / 2 + 0.1 + 0.05 * Math.tan(a) - 0.1, 0.05),
      );
    P(glass(), onFace(L, 'front', bx(w * 0.7, 0.36, 0.05, 0, h + rise - 0.5, 0.025)));
    const vw = w * 0.38;
    P('desertStone', onFace(L, 'front', bx(vw, h + rise * 0.6, 0.12, L.side * (w / 2 - vw / 2), 0, 0.06)));
  }
  if (porch && L.arche !== 'spanish') P('signPaint', onFace(L, 'front', bx(0.16, 0.22, 0.12, door + 0.8, 1.9, 0.06)));
  else if (porch) P('signPaint', bx(0.18, 0.18, 0.18, 0, 2.2, d / 2 + 0.9));
  return { parts, porch, carport, door };
}

// ── 小件（本地原点，底在 y 0）────────────────────────────────────────
/** 一团：球面法线（整丛椭球法线 55% + 团自己 45%），再按轴缩放 */
export function blobG(r: number, sx = 1, sy = 1, sz = 1, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) / sx, p.getY(i) / sy, p.getZ(i) / sz).normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.deleteAttribute('uv');
  return g.scale(sx, sy, sz);
}
/** 灌木丛：3～4 团合成一丛，法线 = 团 × 0.45 + 整丛椭球 × 0.55（池塘第四轮：整丛一个圆顶、团缝里还有明暗） */
export function bushG(rnd: () => number, R = 0.7): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  const n = 3 + Math.floor(rnd() * 2);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + rnd() * 0.8;
    const rr = k === 0 ? 0 : R * (0.45 + rnd() * 0.2);
    const r = R * (k === 0 ? 0.78 : 0.55 + rnd() * 0.15);
    const g = blobG(r, 1, 0.8, 1, k === 0 ? 1 : 0).translate(
      Math.cos(a) * rr,
      r * 0.62 + (k === 0 ? 0.08 : 0),
      Math.sin(a) * rr,
    );
    list.push(g.index ? g.toNonIndexed() : g);
  }
  const g = mg(list);
  const p = g.attributes.position as THREE.BufferAttribute;
  const nn = g.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const e = new THREE.Vector3();
  const cy = R * 0.35;
  for (let i = 0; i < p.count; i++) {
    e.set(p.getX(i) / 1.3, (p.getY(i) - cy) / 0.85, p.getZ(i) / 1.3).normalize();
    v.set(nn.getX(i), nn.getY(i), nn.getZ(i)).multiplyScalar(0.45).addScaledVector(e, 0.55).normalize();
    nn.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
/** 干草丛：5 根 2 纹素宽的细叶往外斜 */
export function tuftG(rnd: () => number): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  const n = 5;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + rnd() * 0.6;
    const L = 0.42 + rnd() * 0.22;
    list.push(
      new THREE.BoxGeometry(0.09, L, 0.05)
        .translate(0, L / 2, 0)
        .rotateX(0.35 + rnd() * 0.25)
        .rotateY(a),
    );
  }
  return mg(list);
}
const agaveG = (rnd: () => number, s = 1): THREE.BufferGeometry => {
  const list: THREE.BufferGeometry[] = [];
  const a0 = rnd() * TAU;
  for (let k = 0; k < 7; k++) {
    const a = a0 + (k / 7) * TAU;
    list.push(
      new THREE.BoxGeometry(0.2 * s, 0.75 * s, 0.09)
        .translate(0, 0.375 * s, 0)
        .rotateX(0.62 + (k % 2) * 0.25)
        .rotateY(a),
    );
  }
  const c = blobG(0.2 * s, 1, 1.5, 1, 0).translate(0, 0.18 * s, 0);
  list.push(c.index ? c.toNonIndexed() : c);
  return mg(list.map((g) => (g.index ? g.toNonIndexed() : g)));
};

// ── 地界、摆放 ─────────────────────────────────────────────────────────
/** 确定性的 0..1（按房子的 id；画廊和场景同一个结果） */
function hash(s: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
const pickW = <T extends string>(w: Record<T, number>, r: number, skip: ReadonlySet<T>): T => {
  const keys = (Object.keys(w) as T[]).filter((k) => !skip.has(k));
  const tot = keys.reduce((a, k) => a + w[k], 0);
  let x = r * tot;
  for (const k of keys) {
    x -= w[k];
    if (x <= 0) return k;
  }
  return keys[keys.length - 1];
};

/** 闭合轮廓往外（d > 0）/ 往里推（按两条相邻边法线的平均） */
function offsetLoop(pts: V2[], dist: number): V2[] {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    a += x0 * z1 - x1 * z0;
  }
  const sgn = a > 0 ? -1 : 1;
  return pts.map((p, i) => {
    const q = pts[(i - 1 + pts.length) % pts.length];
    const r = pts[(i + 1) % pts.length];
    const n1 = [-(p[1] - q[1]), p[0] - q[0]];
    const n2 = [-(r[1] - p[1]), r[0] - p[0]];
    const l1 = Math.hypot(n1[0], n1[1]) || 1;
    const l2 = Math.hypot(n2[0], n2[1]) || 1;
    let nx = n1[0] / l1 + n2[0] / l2;
    let nz = n1[1] / l1 + n2[1] / l2;
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    return [p[0] + sgn * nx * dist, p[1] + sgn * nz * dist] as V2;
  });
}
const topGeo = (pts: readonly V2[], y: number) =>
  topGeoW(
    pts.map(([x, z]) => [x, z] as [number, number]),
    y,
  );

/** 镇里铺好的那几块（店的院子、学校、公园）：院子不铺进来 */
const SITE_BOX = SITES.map((s) => ({ x0: s.x0 - 1, x1: s.x1 + 1, z0: s.z0 - 1, z1: s.z1 + 1 }));

/**
 * 每栋的外观（确定性，按 id）：原型、墙色和邻居（20 米内已经挑过的）都不一样。
 */
export function houseLooks(): Map<string, HouseLook> {
  const out = new Map<string, HouseLook>();
  const done: { x: number; z: number; roof: RoofKey; wall: PalKey }[] = [];
  for (const o of houses()) {
    if (o.kind !== 'house') continue;
    const near = done.filter((q) => Math.hypot(q.x - o.x, q.z - o.z) < 19);
    // 相邻规则看屋顶（俯视屋顶占大半，墙色换了看不出）：先挑屋顶 key、避开 19 米内邻居的屋顶，再按屋顶定原型
    const roof = pickW(ROOF_W, hash(o.id, ROOF_SEED), new Set(near.map((q) => q.roof)));
    const r3 = hash(o.id, 3);
    const arche: Arche =
      roof === 'roofTile'
        ? 'spanish'
        : roof === 'slate'
          ? r3 < 0.65
            ? 'butterfly'
            : 'shed'
          : r3 < 0.72
            ? 'flat'
            : 'shed';
    const walls = (arche === 'spanish' ? ['houseWhite', 'houseStucco', 'housePink'] : [...HOUSE_WALLS]).filter(
      (k) => !near.some((q) => q.wall === k),
    ) as PalKey[];
    const wall = walls.length ? walls[Math.floor(hash(o.id, 2) * walls.length)] : 'houseStucco';
    const litP = 0.45 + hash(o.id, 4) * 0.15;
    const look: HouseLook = {
      arche,
      w: o.w,
      d: o.d,
      h: o.h,
      wall,
      roof,
      fascia: FASCIA[Math.floor(hash(o.id, 5) * FASCIA.length)],
      door: DOORS[Math.floor(hash(o.id, 6) * DOORS.length)],
      side: hash(o.id, 7) < 0.5 ? -1 : 1,
      lit: (i) => hash(o.id, 100 + i) < litP,
      porchLight: true,
      carport: arche === 'flat' && hash(o.id, 9) < 0.75 ? (hash(o.id, 10) < 0.5 ? -1 : 1) : 0,
      chimney: hash(o.id, 11) < 0.4,
    };
    out.set(o.id, look);
    done.push({ x: o.x, z: o.z, roof, wall });
  }
  return out;
}

/**
 * 住宅一整圈：房子 + 院子（build.ts 在细节模块之后直接调，d 是没包 townWrap 的 —— 坐标就是世界坐标、尺寸就是缩完的）。
 * 返回夜里的东西（门廊灯光圈、泳池灯）给 build.ts 挂到 root 上。
 */
export function placeHouses(d: DetailCtx): void {
  const HS = houses();
  const looks = houseLooks();
  const SOLIDS = [...BUILDINGS, ...HS];
  const nearRoad = (x: number, z: number, pad: number) =>
    ROADS.some((q) => q.kind !== 'trail' && distToLine(q.pts, x, z) < q.w / 2 + pad);
  const inBldg = (x: number, z: number, pad: number, skip?: object) =>
    SOLIDS.some((o) => {
      if (o === skip) return false;
      const R = Math.max(o.w, o.d) / 2 + pad;
      if (Math.abs(o.x - x) > R || Math.abs(o.z - z) > R) return false;
      const c = Math.cos(o.rot ?? 0);
      const s = Math.sin(o.rot ?? 0);
      const X = x - o.x;
      const Z = z - o.z;
      return Math.abs(X * c - Z * s) < o.w / 2 + pad && Math.abs(X * s + Z * c) < o.d / 2 + pad;
    });
  const inHotel = (x: number, z: number) =>
    x > HOTEL_PLOT.x0 - 2 && x < HOTEL_PLOT.x1 + 2 && z > HOTEL_PLOT.z0 - 2 && z < HOTEL_PLOT.z1 + 2;
  const inSite = (x: number, z: number) => SITE_BOX.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  const groundOk = (x: number, z: number, pad = 0.3, skip?: object) =>
    inPoly(FLOOR, x, z) &&
    !inClubBox(x, z) &&
    !inHotel(x, z) &&
    !inSite(x, z) &&
    !GREENS.some((q) => inPoly(q.poly, x, z)) &&
    !nearRoad(x, z, pad) &&
    !inBldg(x, z, 0.3, skip);
  const main = ROADS.find((r) => r.id === 'main');

  const CELL = 48;
  /** 住宅区的实例（几何上记一笔 hs：探针拿它算这一区占多少绘制 / 三角形） */
  const instH: DetailCtx['instance'] = (g, key, items, cast) => {
    g.userData.hs = true;
    // 按 48 米一格分开（build.ts 的实例按 160 米分：一格里的包围球太大，镇中心也剔不掉）
    const by = new Map<string, InstItem[]>();
    for (const it of items) {
      const k = `${Math.floor(it.x / CELL)}|${Math.floor(it.z / CELL)}`;
      const l = by.get(k);
      if (l) l.push(it);
      else by.set(k, [it]);
    }
    for (const list of by.values()) d.instance(g, key, list, cast);
  };
  // 几何按（区域, 材质, 投不投影, 96 米一格）攒，最后每格合成一个、走 d.instance（一件放在原点）：视锥外的格子整块不画
  //（d.put 按区域合并，整圈一百多栋永远全画，三角形超预算）
  const chunks = new Map<string, THREE.BufferGeometry[]>();
  // 投不投影按材质定（不按件）：一种材质一格一个网格；只有墙、屋顶、院墙投（绘制次数：投影的每个网格阴影 pass 再画一次）
  const CASTS = new Set<PalKey>([
    ...HOUSE_WALLS,
    'roofTile',
    'roofGravel',
    'roofMetal',
    'adobe',
    'stucco',
    'breezeBlock',
    'cmuGrey',
    'desertStone',
  ]);
  const acc = (reg: string, key: PalKey, cast: boolean, cell: string, g: THREE.BufferGeometry) => {
    const k = `${reg}|${key}|${CASTS.has(key) && cast ? 1 : 0}|${cell}`;
    const l = chunks.get(k);
    if (l) l.push(g);
    else chunks.set(k, [g]);
  };
  // 夜里：门廊灯光圈、泳池灯（青）
  const porchPools: { x: number; z: number; reg: string }[] = [];
  const poolLights: THREE.BufferGeometry[] = [];
  // 树：实例
  const palms: InstItem[] = [];
  const trees: InstItem[] = [];
  const agaves: InstItem[] = [];
  const barrels: InstItem[] = [];
  const rocks: InstItem[] = [];
  const bushes: InstItem[] = [];
  const citrus: InstItem[] = [];
  const waterG: { cell: string; reg: string; g: THREE.BufferGeometry }[] = [];

  for (const o of HS) {
    const L0 = looks.get(o.id);
    if (!L0) continue;
    const rid = o.id.slice(0, o.id.lastIndexOf('_'));
    const road =
      ROADS.find((q) => q.id === rid) ??
      ROADS.reduce((a, q) => (distToLine(q.pts, o.x, o.z) < distToLine(a.pts, o.x, o.z) ? q : a));
    const reg = d.regionOf(o.x, o.z);
    const rnd = d.rng(`valley:houses:${o.id}`);
    // 本地 +z = 朝街：楼的 rot 的本地 +z 朝哪边看最近的路点
    const th0 = o.rot ?? 0;
    let best = Number.POSITIVE_INFINITY;
    let qx = o.x;
    let qz = o.z;
    for (let i = 1; i < road.pts.length; i++) {
      const [ax, az] = road.pts[i - 1];
      const [cx, cz] = road.pts[i];
      const dx = cx - ax;
      const dz = cz - az;
      const LL = dx * dx + dz * dz;
      const t = LL > 0 ? Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / LL)) : 0;
      const px = ax + dx * t;
      const pz = az + dz * t;
      const dd = Math.hypot(px - o.x, pz - o.z);
      if (dd < best) {
        best = dd;
        qx = px;
        qz = pz;
      }
    }
    const lz0 = (qx - o.x) * Math.sin(th0) + (qz - o.z) * Math.cos(th0);
    const th = lz0 >= 0 ? th0 : th0 + Math.PI;
    const c = Math.cos(th);
    const s = Math.sin(th);
    /** 本地 → 世界 */
    const W = (lx: number, lz: number): V2 => [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
    const D = Math.abs(lz0);
    const hw = o.w / 2;
    const hd = o.d / 2;
    const ok = (lx: number, lz: number, pad = 0.3) => {
      const [x, z] = W(lx, lz);
      return groundOk(x, z, pad, o);
    };
    const okLine = (ax: number, az: number, bx2: number, bz: number, pad = 0.3) => {
      const n = Math.max(2, Math.ceil(Math.hypot(bx2 - ax, bz - az) / 1.2));
      for (let k = 0; k <= n; k++) if (!ok(ax + ((bx2 - ax) * k) / n, az + ((bz - az) * k) / n, pad)) return false;
      return true;
    };
    const cell = `${Math.floor(o.x / CELL)}_${Math.floor(o.z / CELL)}`;
    const put = (key: PalKey, g: THREE.BufferGeometry, mode?: Part['mode']) => {
      g.rotateY(th).translate(o.x, 0, o.z);
      acc(reg, key, !mode, cell, g);
    };
    /** 已经是世界坐标的平面 */
    const putW = (key: PalKey, g: THREE.BufferGeometry) => acc(reg, key, false, cell, g);
    /** 已经是世界坐标的几何：put 会再转一次 → 先逆回本地 */
    const toLocal = (g: THREE.BufferGeometry) => g.translate(-o.x, 0, -o.z).rotateY(-th);
    const polyW = (pts: P2[]): V2[] => pts.map(([x, z]) => W(x, z));
    const seg = (ax: number, az: number, bx2: number, bz: number, r = 0.2) =>
      d.block({ a: W(ax, az), b: W(bx2, bz), r });
    const flat = (key: PalKey, x0: number, x1: number, z0: number, z1: number, y: number) => {
      if (x1 - x0 < 0.3 || z1 - z0 < 0.3) return;
      putW(
        key,
        topGeo(
          polyW([
            [x0, z0],
            [x1, z0],
            [x1, z1],
            [x0, z1],
          ]),
          y,
        ),
      );
    };
    /** 圆角的草坪（≥ 20 段）+ 1 纹素暗草边 + 外 0.2 米水泥镶边 */
    const lawnIn = (x0: number, x1: number, z0: number, z1: number) => {
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const ax = (x1 - x0) / 2;
      const az = (z1 - z0) / 2;
      const ctrl: P2[] = [];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        ctrl.push([cx + Math.sign(ca) * Math.abs(ca) ** 0.7 * ax, cz + Math.sign(sa) * Math.abs(sa) ** 0.7 * az]);
      }
      const loop = smoothLoop(polyW(ctrl) as P2[], 0.55, rnd, 0) as V2[];
      putW('terrazzo', topGeo(offsetLoop(loop, 0.2), 0.022));
      putW('surroundCrack', topGeo(offsetLoop(loop, 0.07), 0.028));
      putW('townLawn', topGeo(loop, 0.034));
    };

    // ── 地界：左右到邻居的一半，后面到背靠背那家的一半 ──
    let Lr = hw + 3.4;
    let Ll = hw + 3.4;
    let back = 8 + rnd() * 3;
    let rightNbr = false;
    let backNbr = false;
    for (const q of HS) {
      if (q === o || Math.hypot(q.x - o.x, q.z - o.z) > 26) continue;
      const X = (q.x - o.x) * c - (q.z - o.z) * s;
      const Z = (q.x - o.x) * s + (q.z - o.z) * c;
      const qr = Math.max(q.w, q.d) / 2;
      if (Math.abs(Z) < hd + qr - 1) {
        if (X > 0) {
          Lr = Math.min(Lr, X / 2);
          rightNbr = true;
        } else Ll = Math.min(Ll, -X / 2);
      } else if (Z < 0 && Math.abs(X) < hw + qr) {
        const half = (-Z - hd - qr) / 2;
        if (half < back) {
          back = half;
          backNbr = true;
        }
      }
    }
    Lr = Math.max(Lr, hw + 0.6);
    Ll = Math.max(Ll, hw + 0.6);
    // 背靠背的两家：中线上只要一道墙 —— 后墙朝南的那家画（它正好是一条暗带），朝北的不画
    let backWall = !backNbr || c < 0;
    // 主街南沿（后院墙那条线归 street 代理）：后院收到那条线、自己的后墙不画（两道墙挤在一起）
    if (main) {
      const [bxw, bzw] = W(0, -hd - back);
      const [cxw, czw] = W(0, -hd);
      const dm = distToLine(main.pts, bxw, bzw);
      const dc = distToLine(main.pts, cxw, czw);
      // 街墙在主街中线外 ≈ 14.2 米：后墙离它 < 6.5 米就不生成（两道平行墙中间夹一条沙），后院收到街墙（用街墙封口）
      if (dm < 14.2 + 6.5 && dc > 15) {
        back = dc - 14.45;
        backWall = false;
      }
    }
    while (back > 3 && !okLine(-Ll + 0.3, -hd - back, Lr - 0.3, -hd - back, 0.4)) back -= 0.8;
    const sideOk = (x: number) => okLine(x, -hd - 0.2, x, -hd - back, 0.4);
    const hasBack = back > 3 && sideOk(-Ll) && sideOk(Lr);
    // 前院深度：到路边留 0.6
    // 离路远的（手摆在停车场北边那几栋）：前院最多 8 米
    let front = Math.min(8, D - road.w / 2 - hd - 0.6);
    while (front > 1 && !okLine(-Ll + 0.3, hd + front, Lr - 0.3, hd + front, 0.3)) front -= 0.5;
    const zF = hd + Math.max(0, front);
    // 车道哪一边：车棚那边；没车棚的看哪边宽。车棚那边地不够 → 不要车棚
    const room = (sd: number) => (sd > 0 ? Lr : Ll) - hw;
    const L: HouseLook = L0.carport && room(L0.carport) < 3.8 ? { ...L0, carport: 0 } : L0;
    const dside = L.carport || (Lr >= Ll ? 1 : -1);
    const sideRoom = room(dside) >= 3.3;

    // ── 房子 ──
    const body = houseBody(L);
    for (const p of body.parts) put(p.key, p.g, p.mode);
    if (body.porch) {
      const [x, z] = W(body.porch[0], body.porch[2] + 0.6);
      porchPools.push({ x, z, reg });
    }

    // ── 车道 lotPave（3 米）：侧院里从车棚 / 房子中腰到路；侧院不够就在前院 ──
    const driveIn: [number, number] = sideRoom
      ? dside > 0
        ? [hw + 0.25, hw + 3.25]
        : [-hw - 3.25, -hw - 0.25]
      : dside > 0
        ? [hw - 3.2, hw - 0.2]
        : [-hw + 0.2, -hw + 3.2];
    const driveZ0 = sideRoom ? (body.carport ? body.carport.z - body.carport.d / 2 : -hd + 1) : hd + 0.4;
    const hasDrive = sideRoom || front > 3.4;
    const freeX = (x: number, m = 1) =>
      Math.abs(x - body.door) > 0.55 + m && !(hasDrive && x > driveIn[0] - m && x < driveIn[1] + m);
    /** 本地车（缩过的：1.25 × 2.9 米） */
    const car = (lx: number, lz: number) => {
      const key = (['clothRed', 'clothTeal', 'flowerYellow', 'clothWhite'] as PalKey[])[Math.floor(hash(o.id, 31) * 4)];
      put('ironwork', bx(1.18, 0.22, 2.7, lx, 0.04, lz));
      put(key, bx(1.25, 0.42, 2.9, lx, 0.2, lz));
      put('ironwork', bx(1.06, 0.38, 1.5, lx, 0.62, lz - 0.12));
      put(key, bx(1.08, 0.08, 1.4, lx, 1.0, lz - 0.12));
      seg(lx, lz - 1.3, lx, lz + 1.3, 0.7);
    };

    // 草坪只给有泳池的人家（后院池边 + 一半的前院）
    const pool = hasBack && hash(o.id, 23) < 0.36 && back >= 5.5 && Ll + Lr >= 9.5;
    // ── 地面：前院碎石（白碎石顶的一半配冷灰碎石，其余暖碎石）、侧院暖碎石、门前步道、车道 ──
    const frontG: PalKey = L.roof === 'roofGravel' && hash(o.id, 37) < 0.5 ? 'gravelYard' : 'yardGravel';
    if (front > 0.5) {
      flat(frontG, -Ll, Lr, hd, zF, 0.012);
      if (pool && hash(o.id, 20) < 0.5 && front > 3.4) {
        const [a, b] =
          dside > 0
            ? [-Ll + 0.5, Math.min(Lr - 0.5, hasDrive ? driveIn[0] - 0.4 : Lr)]
            : [Math.max(-Ll + 0.5, hasDrive ? driveIn[1] + 0.4 : -Ll), Lr - 0.5];
        if (b - a > 2.4) lawnIn(a, b, hd + 1.7, zF - 0.4);
      }
    }
    if (hasBack) {
      flat('yardGravel', -Ll, -hw, -hd, hd, 0.012);
      flat('yardGravel', hw, Lr, -hd, hd, 0.012);
    }
    if (front > 1) flat('terrazzo', body.door - 0.55, body.door + 0.55, hd + 1.3, zF + 0.5, 0.03);
    // 门前步道两边一溜花（黄 / 紫，团 0.3 米）：颜色放在东西上
    if (front > 2.6) {
      const fk: PalKey = hash(o.id, 36) < 0.5 ? 'flowerYellow' : 'flowerPurple';
      const fl: THREE.BufferGeometry[] = [];
      for (const sd of [-1, 1])
        for (let k = 0; k < 3; k++) {
          const z = hd + 1.6 + k * 0.55;
          if (z > zF - 0.3) break;
          fl.push(blobG(0.26, 1.2, 0.7, 1, 0).translate(body.door + sd * 0.85, 0.2, z));
        }
      if (fl.length) put(fk, mg(fl));
    }
    if (hasDrive) {
      flat('lotPave', driveIn[0], driveIn[1], driveZ0, zF + 0.5, 0.026);
      if (hash(o.id, 21) < (L.carport ? 0.75 : 0.68)) {
        const cx = (driveIn[0] + driveIn[1]) / 2;
        const cz = body.carport ? body.carport.z : Math.min(zF - 1.6, Math.max(driveZ0 + 1.6, hd + 1.8));
        car(cx, cz);
      }
    }

    // ── 后院：墙围到地界、泳池 1/3 / 铺地 + 草坪 / 柑橘 ──
    if (hasBack) {
      const wk: PalKey = (['adobe', 'adobe', 'breezeBlock'] as PalKey[])[Math.floor(hash(o.id, 22) * 3)];
      const wh = 1.6;
      const zb = -hd - back;
      const wallG: THREE.BufferGeometry[] = [];
      const capG: THREE.BufferGeometry[] = [];
      const run = (x0: number, z0: number, x1: number, z1: number) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        if (len < 0.3) return;
        const a = Math.atan2(x1 - x0, z1 - z0);
        const mx = (x0 + x1) / 2;
        const mz = (z0 + z1) / 2;
        wallG.push(
          new THREE.BoxGeometry(0.28, wh, len)
            .rotateY(a)
            .translate(mx, wh / 2, mz)
            .toNonIndexed(),
        );
        capG.push(new THREE.BoxGeometry(0.4, 0.1, len + 0.12).rotateY(a).translate(mx, wh, mz).toNonIndexed());
        seg(x0, z0, x1, z1, 0.22);
      };
      if (backWall) run(-Ll, zb, Lr, zb);
      // 两家之间一道：左边每家都画，右边只在右边没邻居时画
      run(-Ll, zb, -Ll, hd - 1);
      if (!rightNbr) run(Lr, zb, Lr, hd - 1);
      if (wallG.length) {
        put(wk, mg(wallG));
        put('terrazzo', mg(capG));
      }
      // 后院：暖碎石 yardGravel 打底，贴房子 2 米一条陶砖平台；有泳池的池边铺陶砖、四周草坪
      flat('yardGravel', -Ll, Lr, zb, -hd, 0.012);
      flat('tile', -hw - 0.4, hw + 0.4, -hd - 2.0, -hd, 0.03);
      if (pool) {
        const pw = Math.min(6.2, Ll + Lr - 3.4);
        const pd = Math.min(3.4, back - 2.6);
        const px = (Lr - Ll) / 2;
        const pz = -hd - back / 2 - 0.1;
        let shape: P2[];
        if (hash(o.id, 24) < 0.45) {
          // 肾形
          const k: P2[] = [
            [px - pw / 2, pz - pd * 0.1],
            [px - pw * 0.3, pz - pd / 2],
            [px + pw * 0.15, pz - pd * 0.42],
            [px + pw / 2, pz - pd * 0.3],
            [px + pw * 0.45, pz + pd / 2],
            [px + pw * 0.05, pz + pd * 0.2],
            [px - pw * 0.3, pz + pd / 2],
          ];
          shape = smoothLoop(k, 0.3, rnd, 0) as P2[];
        } else {
          const r = 0.45;
          const k: P2[] = [];
          for (const [ox, oz, a0] of [
            [pw / 2 - r, pd / 2 - r, 0],
            [-pw / 2 + r, pd / 2 - r, Math.PI / 2],
            [-pw / 2 + r, -pd / 2 + r, Math.PI],
            [pw / 2 - r, -pd / 2 + r, Math.PI * 1.5],
          ] as [number, number, number][])
            for (let q = 0; q <= 4; q++) {
              const a = a0 + (q / 4) * (Math.PI / 2);
              k.push([px + ox + Math.cos(a) * r, pz + oz + Math.sin(a) * r]);
            }
          shape = k;
        }
        // 池子四周草坪（浇水的后院）
        lawnIn(-Ll + 0.6, Lr - 0.6, zb + 0.6, -hd - 2.3);
        const P = polyW(shape) as P2[];
        const rim = offsetLoop(P, 0.38) as P2[];
        const deck = offsetLoop(P, 1.1) as P2[];
        // 池边一圈陶砖铺地（高 0.06）、池沿浅色（高 0.12，前沿一条亮 / 暗线）、内壁深青、水
        putW('tile', topGeoW(deck, 0.06, [P]));
        put('tile', toLocal(wallGeo(deck, 0.06, 0, true)), 'thin');
        putW('terrazzo', topGeoW(rim, 0.12, [P]));
        put('terrazzo', toLocal(wallGeo(rim, 0.12, 0.06, true)), 'thin');
        put('ironwork', toLocal(wallGeo(P, 0.12, 0.0, false)), 'thin');
        waterG.push({ cell, reg, g: topGeo(P, 0.048) });
        // 水面亮划（3 条，2 纹素厚）
        for (let k = 0; k < 3; k++) {
          const u = (k - 1) * pw * 0.25 + (rnd() - 0.5) * 0.4;
          const v = (rnd() - 0.5) * pd * 0.4;
          if (inPoly(P, ...W(px + u, pz + v)))
            put('clothWhite', bx(0.5 + rnd() * 0.3, 0.012, 0.09, px + u, 0.05, pz + v), 'flat');
        }
        const [lx, lz] = W(px, pz);
        poolLights.push(new THREE.CircleGeometry(1.2, 14).rotateX(-Math.PI / 2).translate(lx, 0.052, lz));
        d.block({ poly: rim });
        // 躺椅两张（池子和房子之间）、一把遮阳伞
        const lzc = pz + pd / 2 + 1.0;
        if (lzc < -hd - 0.6)
          for (const k of [0, 1]) {
            const x = px - 1.6 + k * 1.1;
            put('clothWhite', bx(0.62, 0.26, 1.5, x, 0, lzc));
            put('clothWhite', new THREE.BoxGeometry(0.62, 0.09, 0.7).rotateX(-0.6).translate(x, 0.5, lzc - 0.55));
          }
        const ux = px + pw / 2 + 0.55;
        if (ux < Lr - 0.7) {
          put('ironwork', bx(0.09, 2.0, 0.09, ux, 0, pz + pd / 2 + 0.4), 'thin');
          put(
            DOORS[Math.floor(hash(o.id, 25) * DOORS.length)],
            new THREE.ConeGeometry(1.15, 0.42, 8).translate(ux, 2.1, pz + pd / 2 + 0.4),
          );
        }
      } else {
        // 没泳池的：平台上一张小桌 + 一把伞，碎石院里一棵柑橘（一半）或假紫荆 —— 颜色靠东西
        put('ironwork', bx(0.8, 0.7, 0.8, 0.9, 0, -hd - 1.3));
        const ux = -hw * 0.45;
        put('ironwork', bx(0.09, 2.0, 0.09, ux, 0, -hd - 1.2), 'thin');
        put(
          DOORS[Math.floor(hash(o.id, 25) * DOORS.length)],
          new THREE.ConeGeometry(1.0, 0.38, 8).translate(ux, 2.05, -hd - 1.2),
        );
        if (back > 4) {
          const [x, z] = W((Lr - Ll) / 2 + (rnd() - 0.5) * 2, -hd - Math.max(3.2, back * 0.62));
          if (hash(o.id, 26) < 0.5) citrus.push({ x, z, s: 0.9 + rnd() * 0.15, reg, rot: rnd() * TAU });
          else trees.push({ x, z, s: 0.8 + rnd() * 0.15, reg, rot: rnd() * TAU });
          d.block({ x, z, r: 0.3 });
        }
      }
      // 后院墙脚一丛（后院朝北的才种：朝南的墙脚在房子的影子外，但这里一律种在离房子最远的角上）
      const [bx0, bz0] = W(-Ll + 1.0, zb + 0.9);
      if (groundOk(bx0, bz0, 0.3, o)) bushes.push({ x: bx0, z: bz0, s: 0.8 + rnd() * 0.3, reg, rot: rnd() * TAU });
    }
    // ── 九重葛：两家之间那道墙的前头一大丛（玫红 / 橙红），墙头再冒一丛 —— 颜色放在东西上，地面安静 ──
    {
      const bk: PalKey = hash(o.id, 33) < 0.65 ? 'flowerPurple' : 'clothRed';
      for (const [lx, on] of [
        [-Ll, true],
        [Lr, !rightNbr],
      ] as [number, boolean][]) {
        if (!on || !hasBack || hash(o.id, lx < 0 ? 34 : 35) > 0.9) continue;
        const sgn = lx < 0 ? 1 : -1;
        const fz = hd - 1.6;
        if (!ok(lx + sgn * 0.6, fz, 0.2)) continue;
        put(bk, blobG(0.62, 1.1, 0.85, 1, 0).translate(lx + sgn * 0.55, 0.55, fz));
        put(bk, blobG(0.5, 1.2, 0.7, 1, 0).translate(lx + sgn * 0.2, 1.75, fz - 0.9));
        const [x, z] = W(lx + sgn * 0.55, fz);
        d.block({ x, z, r: 0.6 });
      }
    }
    // ── 前院：一簇龙舌兰 / 仙人球 / 石头（避开步道、车道；朝南的前院离墙 2.6 米外 = 出了房子的影子）──
    const southFront = c > 0.5;
    if (front > 2.2) {
      const zc = Math.max(hd + (southFront ? 2.6 : 1.4), zF - 1.4);
      const xs = [-Ll + 1.4, Lr - 1.4, -hw * 0.5, hw * 0.5].filter((x) => freeX(x));
      if (xs.length && zc < zF - 0.5) {
        const xc = xs[Math.floor(rnd() * xs.length)];
        if (ok(xc, zc, 0.6)) {
          const [x, z] = W(xc, zc);
          agaves.push({ x, z, s: 0.75 + rnd() * 0.35, reg, rot: rnd() * TAU });
          const [x2, z2] = W(xc + 0.9, zc - 0.5);
          if (rnd() < 0.7) barrels.push({ x: x2, z: z2, s: 0.8 + rnd() * 0.3, reg, rot: 0 });
          const [x3, z3] = W(xc - 0.9, zc + 0.3);
          if (rnd() < 0.6) rocks.push({ x: x3, z: z3, s: 0.6 + rnd() * 0.5, reg, rot: rnd() * TAU });
          d.block({ x, z, r: 0.5 });
        }
      }
      // 树：棕榈巷、东环每家门口两棵棕榈；别家一半一棵棕榈或一棵假紫荆
      const two = rid === 'res_w' || rid === 'res_e';
      const tz = Math.min(zF - 0.8, hd + 2.2 + rnd());
      const spots: number[] = two
        ? [-Ll + 0.9, Lr - 0.9]
        : hash(o.id, 27) < 0.75
          ? [hash(o.id, 28) < 0.5 ? -Ll + 1 : Lr - 1]
          : [];
      for (const lx of spots) {
        if (!freeX(lx, 0.8) || !ok(lx, tz, 0.9)) continue;
        const [x, z] = W(lx, tz);
        if (two || hash(o.id, 29) < 0.5) palms.push({ x, z, s: 0.62 + rnd() * 0.12, reg, rot: rnd() * TAU });
        else trees.push({ x, z, s: 0.8 + rnd() * 0.15, reg, rot: rnd() * TAU });
        d.block({ x, z, r: 0.3 });
      }
    }
    // 信箱：车道旁、路边
    if (hasDrive && front > 1.5 && hash(o.id, 30) < 0.7) {
      const lx = dside > 0 ? driveIn[0] - 0.5 : driveIn[1] + 0.5;
      if (ok(lx, zF - 0.2, 0.15)) {
        put('ironwork', bx(0.12, 0.95, 0.12, lx, 0, zF - 0.2), 'thin');
        put(L.door, bx(0.26, 0.24, 0.42, lx, 0.95, zF - 0.2));
        const [x, z] = W(lx, zF - 0.2);
        d.block({ x, z, r: 0.15 });
      }
    }
    // 撒点让开整块地（AABB）
    {
      const cs = [W(-Ll, zF), W(Lr, zF), W(-Ll, -hd - back), W(Lr, -hd - back)];
      d.clear({
        x0: Math.min(...cs.map((p) => p[0])),
        x1: Math.max(...cs.map((p) => p[0])),
        z0: Math.min(...cs.map((p) => p[1])),
        z1: Math.max(...cs.map((p) => p[1])),
      });
    }
  }
  for (const [k, list] of chunks) {
    const [reg, key, cast] = k.split('|');
    instH(mg(list), key as PalKey, [{ x: 0, z: 0, s: 1, reg }], cast === '1');
  }
  const LEAF = { lightUp: 0.4, convex: 0.3, elem: { kind: 'leaves', size: [2.1, 2.1], hi: 0.15 } } as const;
  const instA = (geo: THREE.BufferGeometry, key: PalKey, items: InstItem[], name: string, cast: boolean) => {
    const m = d.actx.mat(key, { ...LEAF, elem: { ...LEAF.elem, size: [2.1, 2.1] } });
    const by = new Map<string, InstItem[]>();
    for (const it of items) {
      const k = `${it.reg}|${Math.floor(it.x / CELL)}|${Math.floor(it.z / CELL)}`;
      const l = by.get(k);
      if (l) l.push(it);
      else by.set(k, [it]);
    }
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [k, list] of by) {
      const reg = k.split('|')[0];
      const im = new THREE.InstancedMesh(geo, m, list.length);
      list.forEach((it, i) => {
        Q.setFromAxisAngle(up, it.rot ?? 0);
        M.compose(new THREE.Vector3(it.x, it.y ?? 0, it.z), Q, new THREE.Vector3(it.s, it.s, it.s));
        im.setMatrixAt(i, M);
      });
      im.computeBoundingSphere();
      im.name = `valley:${reg}:${name}`;
      im.userData.noCast = !cast;
      im.userData.hs = true;
      d.asset(im, reg);
    }
  };
  // ── 实例：树、多肉、石头、墙脚灌木 ──
  {
    const rnd = d.rng('valley:houses:kinds');
    const t = new THREE.CylinderGeometry(0.16, 0.24, 6, 5).translate(0, 3, 0);
    instH(t, 'palmTrunk', palms, false);
    instH(palmCrownGeo(8, 2.6, 6), 'palm', palms);
    // 假紫荆（palo verde）：三根绿干 + 一团扁冠（球面法线）
    const limbs: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++)
      limbs.push(
        new THREE.CylinderGeometry(0.08, 0.13, 2.0, 5)
          .translate(0, 1.0, 0)
          .rotateZ(0.4)
          .rotateY((k / 3) * TAU)
          .toNonIndexed(),
      );
    instH(mg(limbs), 'cactus', trees, false);
    const crown: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + rnd() * 0.5;
      const rr = k === 0 ? 0 : 0.75;
      const g = blobG(0.72, 1, 0.6, 1, k === 0 ? 1 : 0).translate(
        Math.cos(a) * rr,
        1.45 + rnd() * 0.3,
        Math.sin(a) * rr,
      );
      crown.push(g.index ? g.toNonIndexed() : g);
    }
    // 树冠、灌木：叶团元素 + lightUp 0.4（池塘配方：亮顶、暗底），走资产材质（锁着的区域照样压暗）
    instA(mg(crown), 'olive', trees, 'paloCrown', true);
    // 柑橘：一根短干 + 一团圆冠 + 九个橙子（颜色放在东西上）
    instH(new THREE.CylinderGeometry(0.1, 0.14, 1.0, 5).translate(0, 0.5, 0), 'branch', citrus, false);
    instA(blobG(1.05, 1, 0.9, 1).translate(0, 1.75, 0), 'olive', citrus, 'citrusCrown', true);
    const fruit: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU + rnd() * 0.4;
      const y = 1.35 + rnd() * 0.9;
      const rr = Math.sqrt(Math.max(0.05, 1 - ((y - 1.75) / 0.95) ** 2)) * 1.02;
      fruit.push(new THREE.BoxGeometry(0.16, 0.16, 0.16).translate(Math.cos(a) * rr, y, Math.sin(a) * rr));
    }
    instH(mg(fruit), 'toolOrange', citrus, false);
    // 泳池水：亮档往饱和的青推（#5cc8d0；共用的 water 正午只有 0.19）—— 资产材质，按格合并
    {
      const wm = d.actx.mat('water', { ramp: [0x5cc8d0, 0x36a2bc, 0x2a5e94], edge: 0.1, convex: 0 });
      const by = new Map<string, THREE.BufferGeometry[]>();
      for (const w of waterG) {
        const k = `${w.reg}|${w.cell}`;
        const l = by.get(k);
        if (l) l.push(w.g);
        else by.set(k, [w.g]);
      }
      for (const [k, list] of by) {
        const reg = k.split('|')[0];
        const m = new THREE.Mesh(mg(list), wm);
        m.name = `valley:${reg}:poolWater`;
        m.userData.noCast = true;
        m.userData.hs = true;
        d.asset(m, reg);
      }
    }
    instH(agaveG(rnd), 'silverBlue', agaves, false);
    const bar = blobG(0.3, 1, 1.15, 1, 1).translate(0, 0.34, 0);
    instH(bar, 'cactus', barrels, false);
    instH(blobG(0.11, 1, 0.6, 1, 0).translate(0, 0.68, 0), 'flowerYellow', barrels, false);
    instH(new THREE.DodecahedronGeometry(0.4, 0).scale(1, 0.55, 0.9).translate(0, 0.12, 0), 'rockCool', rocks, false);
    instA(bushG(rnd, 0.6), 'sage', bushes, 'yardBush', false);
  }

  // ── 夜里：门廊灯光圈（r 2.5、h 2.6）、泳池灯（青，自发光）。锁着的区域不开（看那片房子的墙是不是原色材质）──
  {
    const lights = new THREE.Group();
    lights.name = 'valley:houses:lights';
    lights.userData.hs = true;
    let on = false;
    const lit = new Set<string>();
    const regionLit = (reg: string) => {
      let yes = false;
      d.root.traverse((ob) => {
        if (yes || !(ob as THREE.Mesh).isMesh) return;
        const m = /^valley:([^:]+):(house\w+)(:inst)?$/.exec(ob.name);
        if (m && m[1] === reg && (ob as THREE.Mesh).material === d.mat(m[2] as PalKey)) yes = true;
      });
      return yes;
    };
    const base = d.mat('jug') as THREE.MeshToonMaterial;
    const night = base.clone();
    night.onBeforeCompile = base.onBeforeCompile;
    night.customProgramCacheKey = base.customProgramCacheKey;
    night.userData = { ...base.userData };
    night.emissive = new THREE.Color(0x2a8aa0);
    const pg = poolLights.length ? mg(poolLights) : null;
    const pm = pg ? new THREE.Mesh(pg, base) : null;
    if (pm) {
      pm.name = 'valley:houses:poolLights';
      pm.visible = false;
      pm.receiveShadow = false;
      lights.add(pm);
    }
    lights.userData.night = {
      setOn(v: boolean) {
        on = v;
        lit.clear();
        for (const r of new Set(porchPools.map((p) => p.reg))) if (regionLit(r)) lit.add(r);
        if (pm) {
          pm.visible = v && lit.size > 0;
          pm.material = night;
        }
      },
    };
    for (const p of porchPools) {
      const ob = new THREE.Object3D();
      const pool: [number, number, number, number] = [p.x, p.z, 2.5, 2.6];
      const none: [number, number, number, number] = [p.x, p.z, 0, 0];
      ob.userData.night = { pool: () => (on && lit.has(p.reg) ? pool : none) };
      lights.add(ob);
    }
    d.root.add(lights);
  }
}

// ── 画廊：四个原型（v0 西班牙、v1 蝶形、v2 平顶 + 车棚、v3 单坡）──
const matOf = (ctx: Parameters<AssetFn>[0], key: PalKey) => {
  const el = (TOWN_EL as Partial<Record<PalKey, (typeof TOWN_EL)[keyof typeof TOWN_EL]>>)[key];
  const tones = (TOWN_TONES as Partial<Record<PalKey, (typeof TOWN_TONES)['roofTile']>>)[key];
  return ctx.mat(key, el ? { elem: el, ...(tones ? { tones } : {}) } : undefined);
};
const house: AssetFn = (ctx) => {
  const v = ctx.variant ?? 0;
  const arche = ARCHES[v % 4];
  const L: HouseLook = {
    arche,
    w: 8.6,
    d: 7.6,
    h: 3.0,
    wall: (['houseWhite', 'houseMint', 'houseStucco', 'housePink'] as PalKey[])[v % 4],
    roof: arche === 'spanish' ? 'roofTile' : arche === 'flat' ? 'roofGravel' : 'slate',
    fascia: FASCIA[v % FASCIA.length],
    door: DOORS[v % DOORS.length],
    side: 1,
    lit: (i) => i % 2 === 0,
    porchLight: true,
    carport: arche === 'flat' ? 1 : 0,
    chimney: true,
  };
  const g = new THREE.Group();
  const by = new Map<PalKey, THREE.BufferGeometry[]>();
  for (const p of houseBody(L).parts) {
    const gg = p.g.index ? p.g.toNonIndexed() : p.g;
    for (const a of Object.keys(gg.attributes)) if (a !== 'position' && a !== 'normal') gg.deleteAttribute(a);
    by.set(p.key, [...(by.get(p.key) ?? []), gg]);
  }
  for (const [k, list] of by) g.add(new THREE.Mesh(mg(list), matOf(ctx, k)));
  ctx.mats.prepare(g);
  return g;
};
const scrub: AssetFn = (ctx) => {
  const rnd = ctx.rng('hs-scrub');
  const g = new THREE.Group();
  const leaves = ctx.mat('sage', { lightUp: 0.4, elem: { kind: 'leaves', size: [2.1, 2.1], hi: 0.15 }, convex: 0.3 });
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(bushG(rnd, 0.6 + k * 0.15), leaves);
    m.position.set(-1.6 + k * 1.6, 0, 0);
    g.add(m);
  }
  const tuft = new THREE.Mesh(tuftG(rnd), ctx.mat('dryTuft'));
  tuft.position.set(0, 0, 1.2);
  const stone = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.35, 0).scale(1, 0.55, 1).translate(0, 0.1, 0),
    ctx.mat('rock', { edge: 0.25, convex: 0.3, elem: { kind: 'stones', size: [7, 5], seam: 0.6, hi: 0.4 } }),
  );
  stone.position.set(1.2, 0, 1.2);
  g.add(tuft, stone);
  ctx.mats.prepare(g);
  return g;
};
export const ASSETS: Record<string, AssetFn> = { 'hs-house': house, 'hs-scrub': scrub };
