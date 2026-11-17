// 报社的资产（批 P，docs/lab/2026-11-07-3d-pixel/valley-town.md「1. 《沙漠太阳报》」「资产清单 批 P」）。这个文件归报社的资产代理。
// 每个资产：ASSETS['<id>'] = (ctx) => THREE.Object3D。本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头（朝南），单位米；
// 材质只用 ctx.mat(key, extra)（key 在 src/valley/palette.ts；锁着的区域按它压暗）；随机只用 ctx.rng('<id>')；变体 ctx.variant。
// 画廊：/valleyassets.html?asset=<id>；场景里在 detail/sites/paper.ts 用 makeAsset(id, d.actx) 放。
//
// 设计纹素 0.09 米：线、缝 1 纹素；竖直面上的横线按屏幕行（ROW = 0.09 / cos45 米）取整。
// 朝南的立面永远在暗档（太阳在画面后方）：立面上的招牌、字、太阳牌给 SIGN_FACE（光往上偏 → 落中档），窗玻璃留暗档（深蓝），
// 夜里窗、字、太阳牌、门灯换成自发光那套（userData.night.setOn），门口一个灯光圈。
//
// 这个文件自己手挑的元素调色板（材质规范 v2：每档 [本色, 高一级, 低一级]，缝 / 亮边各三档，暗档往冷走）—— lead 以后可以并进 palette.ts：
// - STUCCO_T：白灰泥墙的"补丁"（stones 大块、低对比 ±6～8，缝 −15，不画亮边）—— 报社的墙、塔
// - TILE_T：红瓦（瓦垄 = planks 沿 x 每 0.27 米一条，缝 −25、缝后亮条 +22）—— 拱廊顶、门头压顶、塔顶、女儿墙压顶
// - SHADE_RAMP：拱廊里的阴影（深靛紫，拱洞里"看进去"的暗面；不受投影）
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { Tones, ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../ctx';
import { type PalKey, SIGN_FACE, TOWN_EL } from '../palette';

/** 设计纹素（米） */
const T = 0.09;
/** 竖直面上一屏幕行（米）：俯 45° 下竖直 1 米 = 0.707 屏幕米 */
const ROW = T / Math.SQRT1_2;

type Ramp = [number, number, number];
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });

/** 白灰泥（stucco）的补丁：L 239/244/233 · 202/207/196 · 121/129/114（±5～8：远看一面墙，近看几块补过的灰泥；暗档比 stucco 原值 #8e7a9e 彩度高一倍：立面永远在暗档，原值过午后方案是灰粉 #947c7e S 0.16，这套是 #9c7478 S 0.26 上下）；缝 −15；亮边不用（hi 0） */
const STUCCO_T = tn(
  [0xfaeedc, 0xfef4e4, 0xf4e6d4],
  [0xdcc6c0, 0xe2ccc6, 0xd6c0ba],
  [0xa068ac, 0xa870b4, 0x9862a4],
  [0xe8d8c8, 0xc6b0ae, 0x825a8e],
  [0xfffaf2, 0xecd8d0, 0xa08cb0],
);
/** 红瓦：L 135/142/127 · 94/101/86 · 57/63/50；缝 −25；亮边 +22 */
const TILE_T = tn(
  [0xdc744e, 0xe68058, 0xd06846],
  [0xa84a48, 0xb25450, 0x9c4242],
  [0x5c2c52, 0x663458, 0x52264a],
  [0xb0543e, 0x843842, 0x461e44],
  [0xf09468, 0xc66458, 0x743c66],
);
/**
 * 门前的萨尔蒂略陶砖（墨西哥红陶方砖，棕榈泉西班牙式的门廊地面）：比人行道的 tile 更红更饱和；暗档玫瑰紫（门前整天在楼影里）。
 * L 175/184/165 · 133/142/122 · 110/117/102（暗档在楼影里一大片，彩度给足：午后方案把暗档压到 C 0.06、往玫瑰褐拉）；缝 −25；亮边 +20
 */
const SALTILLO_T = tn(
  [0xec9a64, 0xf2a66e, 0xe08e5a],
  [0xc8705a, 0xd27c62, 0xbc6652],
  [0xa25c80, 0xaa6488, 0x9a5478],
  [0xc47a50, 0xa45a4c, 0x864668],
  [0xf8b47c, 0xdc8a6c, 0xb87894],
);
/** 拱廊里的阴影（看进拱洞的暗面）：三档都暗，不受投影 */
const SHADE_RAMP: Ramp = [0x6a5684, 0x584672, 0x463a64];

/** 灰泥墙：stones 大块补丁（低对比，规则的"元素有形状"），不画亮边 */
const stuccoOpts: ToonOpts = {
  tones: STUCCO_T,
  elem: { kind: 'stones', size: [24, 13], seam: 0, hi: 0 },
  toneW: [0.3, 0.3],
};
/** 朝镜头的灰泥立面：不接收投影（阴影毛边在竖直面上是麻点），同上的补丁 */
const facadeOpts: ToonOpts = { ...stuccoOpts, noShadowReceive: true };
/** 红瓦：瓦垄沿本地 x 每 0.27 米（3 纹素）一条 */
/**
 * 档位线 [0.1, 0.4]（默认 [0.1, 0.5]）：太阳在北边，18° 的南坡 N·L 正午只有 ~0.4～0.5，照默认落中档 = 一大片暗砖红（L 98），
 * 竖屏上面三分之一读成"阴天的屋顶"；亮线往下挪一点，南坡落亮档的橙红，东西两坡、塔尖照样分得出（瓦垄方向不同 + 描边）
 */
const tileOpts: ToonOpts = {
  tones: TILE_T,
  bands: [0.1, 0.4],
  elem: { kind: 'planks', p: [1, 0, 0, 0.27], seam: 1, hi: 0.6 },
};
/**
 * 楼南边（楼自己的影子里）的小坡顶：拱廊顶、门头压顶。照实在影子里是暗档梅紫（#5c2c52），一整条看不出是红瓦 →
 * 不接收投影、档位线往上挪（朝南上方的坡落中档 = 砖红 #a84a48，不是太阳底下的橙红）
 */
const tileShadeOpts: ToonOpts = { ...tileOpts, noShadowReceive: true, bands: [0.1, 0.95] };
/**
 * 九重葛（爬在墙上、拱廊顶上的花藤）：楼南边全在楼自己的影子里 → 不接收投影（不然一团团"深色卷心菜"），
 * 光往上偏 + 档位线往上挪：顶上中档、底下暗档，不会在影子里发亮
 */
const VINE: ToonOpts = { lightUp: 0.35, noise: 0.3, bands: [0.15, 0.85], noShadowReceive: true };
/** 九重葛的洋红（新颜色：flowerPurple 的 #c47ade 是丁香紫，九重葛是洋红；accent 组会往暖拉，原值偏紫一点调完才是洋红）：L 129 / 88 / 61 */
const BOUGAIN_RAMP: Ramp = [0xec5cc0, 0xbc3e9c, 0x6a2e7a];
/** 夜里的暖光（同 town.ts 第 9 节：字 / 灯头暖白，窗暖橙） */
const GLOW_SIGN = 0x6a5a30;
const GLOW_WIN = 0x5a4424;

type Part = [THREE.BufferGeometry, THREE.Material];

/** 一件资产的零件：按材质合成一个网格（只留 position + normal） */
class Parts {
  list: Part[] = [];
  add(m: THREE.Material, ...gs: THREE.BufferGeometry[]) {
    for (const g of gs) this.list.push([g, m]);
    return this;
  }
  group(ctx: AssetCtx, name: string): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const [geo, m] of this.list) {
      const ng = geo.index ? geo.toNonIndexed() : geo;
      for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal') ng.deleteAttribute(a);
      if (!ng.attributes.normal) ng.computeVertexNormals();
      by.set(m, [...(by.get(m) ?? []), ng]);
    }
    for (const [m, list] of by) {
      const merged = mergeGeometries(list);
      if (merged) g.add(new THREE.Mesh(merged, m));
    }
    ctx.mats.prepare(g);
    return g;
  }
}

/** 这些材质的网格不投影（小件、贴在立面上的薄片；build.ts 的 asset() 认 userData.noCast） */
function noCast(g: THREE.Group, ...mats: THREE.Material[]) {
  for (const o of g.children) {
    const m = o as THREE.Mesh;
    if (m.isMesh && (mats.length === 0 || mats.includes(m.material as THREE.Material))) {
      m.castShadow = false;
      m.userData.noCast = true;
    }
  }
}

/**
 * 夜里亮的：每对 [白天的材质, 夜里的材质]，天黑换（只换现在还是白天材质的网格：锁着的区域 build.ts 换成了压暗的，不点亮）。
 * pool（本地坐标 x z、半径、高）：门灯的灯光圈，只在真的点亮了的时候给。
 */
function nightLights(
  g: THREE.Group,
  pairs: [THREE.Material, THREE.Material][],
  pool?: [number, number, number, number],
) {
  const meshes: [THREE.Mesh, THREE.Material, THREE.Material][] = [];
  for (const [day, night] of pairs)
    for (const o of g.children) {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === day) meshes.push([m, day, night]);
    }
  let lit = false;
  const v = new THREE.Vector3();
  g.userData.night = {
    setOn(on: boolean) {
      lit = false;
      for (const [m, day, night] of meshes)
        if (m.material === day || m.material === night) {
          m.material = on ? night : day;
          lit ||= on;
        }
    },
    pool: (): [number, number, number, number] => {
      if (!pool) return [0, 0, 0, 0];
      g.updateWorldMatrix(true, false);
      v.set(pool[0], 0, pool[1]).applyMatrix4(g.matrixWorld);
      return lit ? [v.x, v.z, pool[2], pool[3]] : [v.x, v.z, 0, 0];
    },
  };
}

/** 朝 +z 的竖直平面（中心 x、底 y、z） */
const quad = (w: number, h: number, x: number, y: number, z: number) =>
  new THREE.PlaneGeometry(w, h).translate(x, y + h / 2, z);

/** 圆头的拱（朝 +z 的平面）：宽 w，起拱高 s（拱脚离底），半圆 / 半椭圆的竖半径 ry（默认 w/2） */
function archGeo(w: number, s: number, x: number, y: number, z: number, ry = w / 2, seg = 8) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0);
  sh.lineTo(w / 2, 0);
  sh.lineTo(w / 2, s);
  for (let i = 1; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    sh.lineTo((Math.cos(a) * w) / 2, s + Math.sin(a) * ry);
  }
  sh.lineTo(-w / 2, 0);
  return new THREE.ShapeGeometry(sh).translate(x, y, z);
}

/** 圆（朝 +z 的扁圆柱，厚 t）：太阳牌、徽标 */
const disc = (r: number, t: number, x: number, y: number, z: number, n = 16) =>
  new THREE.CylinderGeometry(r, r, t, n).rotateX(Math.PI / 2).translate(x, y, z + t / 2);

// ── 像素字（5 × 7）：一格 = 1 纹素宽 × 1 屏幕行高，横着连成一段一段（少三角形）──
const GLYPH: Record<string, string[]> = {
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
};
/** 一个字的宽（米）：5 纹素 + 1 纹素字距 */
const CH = 6 * T;
/** 一串字（朝 +z 的平面）：左下角 (x, y)、平面 z；px 每格纹素数 */
function textGeo(s: string, x: number, y: number, z: number, px = 1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  let cx = x;
  for (const ch of s) {
    const gl = GLYPH[ch];
    if (gl)
      gl.forEach((row, r) => {
        let c = 0;
        while (c < 5) {
          if (row[c] !== '#') {
            c++;
            continue;
          }
          let e = c;
          while (e < 5 && row[e] === '#') e++;
          out.push(quad((e - c) * T * px, ROW * px, cx + ((c + e) / 2) * T * px, y + (6 - r) * ROW * px, z));
          c = e;
        }
      });
    cx += CH * px;
  }
  return out;
}
const textW = (s: string, px = 1) => (s.length * CH - T) * px;

/** 竖排一串字（每个字一行，往下排）：顶上那个字的左上角 (x, yTop) */
function textVGeo(s: string, x: number, yTop: number, z: number, gap = ROW * 2): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  let y = yTop - 7 * ROW;
  for (const ch of s) {
    out.push(...textGeo(ch, x, y, z));
    y -= 7 * ROW + gap;
  }
  return out;
}

/** 太阳：外圈（橙，中档）+ 里圈（黄，亮档）+ 一圈光芒（长短相间）。朝 +z，中心 (x, y)，立面 z */
function sunGeo(r: number, x: number, y: number, z: number, rays = 12) {
  const n = r > 1 ? 20 : 12;
  const outer: THREE.BufferGeometry[] = [disc(r * 0.72, 0.12, x, y, z, n)];
  const inner = [new THREE.CircleGeometry(r * 0.48, n - 4).translate(x, y, z + 0.14)];
  // 光芒 = 尖的楔子（盒子转斜了在像素里是一团锯齿；楔子斜着也读得出"尖"）
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const len = i % 2 ? r * 0.22 : r * 0.3;
    const b = Math.max(3 * T, r * 0.2) / 2;
    const sh = new THREE.Shape();
    sh.moveTo(-b, r * 0.7);
    sh.lineTo(b, r * 0.7);
    sh.lineTo(0, r * 0.76 + len);
    sh.lineTo(-b, r * 0.7);
    outer.push(new THREE.ShapeGeometry(sh).rotateZ(a).translate(x, y, z + 0.06));
  }
  return { outer, inner };
}

/**
 * 立面上的一扇窗（圆头）：玻璃 + 1 纹素的竖棂、起拱处一根横棂 + 窗台（往外 0.12，顶面亮 = 窗下一条亮边）。
 * 立面 z、中心 x、底 y、宽 w、高 h（含圆头）。回 [玻璃, 棂, 窗台]
 */
function windowGeo(x: number, y: number, w: number, h: number, z: number, bars = 1) {
  const s = h - w / 2;
  const glass = [archGeo(w, s, x, y, z + 0.02)];
  const mull: THREE.BufferGeometry[] = [];
  for (let i = 1; i <= bars; i++) mull.push(quad(T, h - 0.05, x - w / 2 + (i * w) / (bars + 1), y, z + 0.03));
  mull.push(quad(w, ROW, x, y + s - ROW / 2, z + 0.03));
  const sill = [box(w + 0.2, 0.14, 0.14, x, y - 0.14, z + 0.07)];
  return { glass, mull, sill };
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// paper-front：报社办公楼的南立面 + 屋顶边。原点 = 楼的中心（249, −659），楼 24 × 16 × 8（墙、屋顶板是 build.ts 的），立面 z = +8。
// 从西往东：西头一扇圆头窗（一楼带铁栅）+ 二楼窗 | 塔（另一件资产 paper-tower，x −8.5…−3）| 门那一跨（不盖顶：壁柱 + 门头 + 红瓦压顶 +
// 玻璃门两扇 + 半椭圆的气窗 + 三级台阶 + 两盏门灯）| 东翼拱廊（四个墩子三个拱，拱洞里是暗的、各一扇窗；红瓦单坡顶）+ 二楼三扇窗；
// 门头上方一条深蓝报头（"THE DESERT SUN" + 两头小太阳）；东墙伸出的竖招牌（板面朝南："NEWS" + 太阳）；
// 屋顶：低坡四坡红瓦顶（盖住 build.ts 的平屋顶板），檐下灰泥线脚 + 一排瓦头；三丛九重葛（洋红花，棕榈泉的招牌花：东头拱廊、门西壁柱、西墙角）；
// 门前萨尔蒂略陶砖铺地。
// ═════════════════════════════════════════════════════════════════════════════════════════
const paperFront: AssetFn = (ctx) => {
  const F = 8;
  const stucco = ctx.mat('stucco', facadeOpts);
  const stuccoTop = ctx.mat('stucco', stuccoOpts);
  const tile = ctx.mat('roofTile', tileOpts);
  const tileS = ctx.mat('roofTile', tileShadeOpts);
  const ridge = ctx.mat('roofTile', { ...tileOpts, noShadowReceive: true });
  const cap = ctx.mat('cap', { noShadowReceive: true });
  const shade = ctx.mat('stucco', {
    ramp: SHADE_RAMP,
    tones: undefined,
    edge: 0.2,
    convex: 0,
    noShadowReceive: true,
  });
  const glass = ctx.mat('jug', { noShadowReceive: true });
  const glassN = ctx.mat('straw', { noShadowReceive: true, emissive: GLOW_WIN });
  const iron = ctx.mat('ironwork', { noShadowReceive: true });
  const board = ctx.mat('signBoard', SIGN_FACE);
  const paint = ctx.mat('signPaint', SIGN_FACE);
  const paintN = ctx.mat('signPaint', { ...SIGN_FACE, emissive: GLOW_SIGN });
  const sunO = ctx.mat('sunEnamel', SIGN_FACE);
  const sunI = ctx.mat('sunEnamel', { ...SIGN_FACE, bands: [-0.9, -0.5] });
  const brass = ctx.mat('flowerYellow', SIGN_FACE);
  const steps = ctx.mat('cap', { tones: undefined });
  const p = new Parts();

  // ── 门前的萨尔蒂略陶砖铺地（x 236…262.5，从立面到 z −644.8 = SITES.paper_front；高 0.042 = kit 的 Y.pave，压在人行道 0.02 上面）。
  // 楼南边整天在楼影里：铺地落暗档的玫瑰紫（人行道的 tile 在影子里是灰粉 S 0.30）。
  // （试过台阶前一个太阳的拼花：在影子里是一块暗的梅红圆，正好在旗子底下 = "地上一滩"，删了）──
  {
    const pave = ctx.mat('cap', {
      tones: SALTILLO_T,
      elem: { kind: 'stones', size: [7, 5], seam: 0.6, hi: 0.3 },
      edge: 0.05,
      convex: 0,
    });
    const flat = (w: number, d: number, x: number, y: number, z: number) =>
      new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z);
    p.add(pave, flat(26.5, 6.2, 0.25, 0.042, F + 3.1));
  }

  // ── 立面的皮（盖住 build.ts 的白墙：灰泥补丁）+ 勒脚 ──
  p.add(stucco, quad(24, F - 0.36, 0, 0.36, F + 0.03));
  p.add(cap, box(24.1, 0.36, 0.1, 0, 0, F + 0.05));

  // ── 西头（x −12…−8.5）：一楼圆头窗 + 两根铁栅，二楼窗 ──
  {
    const w1 = windowGeo(-10.25, 0.9, 1.26, 2.0, F + 0.04, 1);
    p.add(glass, ...w1.glass)
      .add(iron, ...w1.mull)
      .add(stuccoTop, ...w1.sill);
    for (const dx of [-0.36, 0.36]) p.add(iron, quad(T, 1.6, -10.25 + dx, 0.9, F + 0.08));
    const w2 = windowGeo(-10.25, 4.4, 1.08, 1.5, F + 0.04, 1);
    p.add(glass, ...w2.glass)
      .add(iron, ...w2.mull)
      .add(stuccoTop, ...w2.sill);
  }

  // ── 门那一跨（x −2.7…2.7）：不盖顶，门看得见 ──
  // 壁柱（凸 0.5）+ 柱头一条线脚
  for (const x of [-2.4, 2.4]) {
    p.add(stucco, box(0.6, 4.6, 0.5, x, 0.36, F + 0.25));
    p.add(cap, box(0.72, 0.13, 0.6, x, 4.47, F + 0.3));
  }
  // 门头：凸 0.7、4.6…6.0；正面中间一个小太阳徽（同报头）；顶上红瓦压顶（往外 0.85，瓦垄朝南）
  p.add(stucco, box(5.4, 1.4, 0.7, 0, 4.6, F + 0.35));
  {
    const s = sunGeo(0.5, 0, 5.3, F + 0.7, 8);
    p.add(sunO, ...s.outer).add(sunI, ...s.inner);
  }
  p.add(tileS, box(5.8, 0.24, 0.9, 0, 6.0, F + 0.42));
  // 门洞：深色门框里两扇玻璃门（各 1 米宽、门框 1 纹素）+ 铜把手；门上半椭圆的气窗（三根竖棂）
  p.add(iron, quad(2.4, 2.6, 0, 0.45, F + 0.04));
  for (const sx of [-1, 1]) {
    p.add(glass, quad(0.9, 2.3, sx * 0.56, 0.6, F + 0.06));
    p.add(brass, box(T, 0.27, 0.05, sx * 0.18, 1.5, F + 0.08));
  }
  p.add(glass, archGeo(2.2, 0.02, 0, 3.05, F + 0.06, 0.75));
  p.add(iron, quad(T, 0.75, 0, 3.05, F + 0.07));
  for (const x of [-0.55, 0.55]) p.add(iron, quad(T, 0.5, x, 3.05, F + 0.07));
  p.add(cap, quad(2.6, ROW, 0, 2.95, F + 0.05)); // 门楣一条（门和气窗之间）
  // 三级台阶（陶砖）：顶面 0.45 / 0.3 / 0.15，从立面往外 1.5 米
  p.add(
    steps,
    box(5.2, 0.45, 0.7, 0, 0, F + 0.35),
    box(5.2, 0.3, 0.4, 0, 0, F + 0.9),
    box(5.2, 0.15, 0.4, 0, 0, F + 1.3),
  );
  // 两盏门灯（壁柱正面，铁框 + 灯罩；夜里亮）
  const lampGlass = ctx.mat('signPaint', { noShadowReceive: true });
  const lampGlassN = ctx.mat('signPaint', { noShadowReceive: true, emissive: GLOW_SIGN });
  for (const x of [-2.4, 2.4]) {
    p.add(iron, box(0.36, 0.09, 0.3, x, 2.98, F + 0.66), box(0.18, 0.09, 0.18, x, 2.44, F + 0.66));
    p.add(lampGlass, box(0.27, 0.45, 0.22, x, 2.53, F + 0.66));
  }

  // ── 东翼拱廊（x 2.75…11.2，前墙 z F+2.3…F+2.6）：四个墩子三个拱；拱洞里一块暗面 + 一扇窗（夜里亮）──
  {
    const x0 = 2.75;
    const x1 = 11.2;
    const pier = 0.55;
    const H = 3.3;
    const spring = 1.7;
    const ow = (x1 - x0 - 4 * pier) / 3;
    const sh = new THREE.Shape();
    sh.moveTo(x0, 0);
    sh.lineTo(x0, H);
    sh.lineTo(x1, H);
    sh.lineTo(x1, 0);
    const centers: number[] = [];
    for (let i = 2; i >= 0; i--) {
      const l = x0 + pier + i * (ow + pier);
      const r = l + ow;
      centers.unshift((l + r) / 2);
      sh.lineTo(r, 0);
      sh.lineTo(r, spring);
      for (let k = 1; k <= 8; k++) {
        const a = (k / 8) * Math.PI;
        sh.lineTo((l + r) / 2 + (Math.cos(a) * ow) / 2, spring + (Math.sin(a) * ow) / 2);
      }
      sh.lineTo(l, 0);
    }
    sh.lineTo(x0, 0);
    p.add(
      stucco,
      new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, F + 2.3),
    );
    // 墩子的柱头、柱础（往外 1 纹素，顶面亮 = 一纹素亮线）
    for (let i = 0; i < 4; i++) {
      const cx = x0 + pier / 2 + i * (ow + pier);
      p.add(cap, box(pier + 0.12, 0.13, 0.42, cx, spring - 0.13, F + 2.45));
      p.add(cap, box(pier + 0.12, 0.2, 0.42, cx, 0, F + 2.45));
    }
    // 拱洞里：暗面（拱廊里的阴影，不受投影）+ 每个拱里一扇窗
    p.add(shade, quad(x1 - x0, H - 0.05, (x0 + x1) / 2, 0, F + 2.27));
    for (const cx of centers) {
      const w = windowGeo(cx, 0.55, 0.9, 1.5, F + 2.27, 1);
      p.add(glass, ...w.glass).add(iron, ...w.mull);
    }
    // 单坡红瓦顶：墙上 3.75 → 前沿 3.3（往外 2.85），瓦垄朝南
    const len = 2.95;
    const roof = new THREE.BoxGeometry(x1 - x0 + 0.3, 0.16, len)
      .rotateX(Math.atan2(0.45, len))
      .translate((x0 + x1) / 2, 3.3 + 0.45 / 2 + 0.08, F + len / 2);
    p.add(tileS, roof);
    // 二楼三扇窗，对着三个拱
    for (const cx of centers) {
      const w = windowGeo(cx, 4.35, 1.08, 1.5, F + 0.04, 1);
      p.add(glass, ...w.glass)
        .add(iron, ...w.mull)
        .add(stuccoTop, ...w.sill);
    }
  }

  // ── 报头：门头上方一条深蓝底（x −2.75…9.25，9 行高）+ "THE DESERT SUN"（奶油金，夜里亮）+ 两头小太阳 ──
  {
    const bx0 = -2.75;
    const bx1 = 9.25;
    const y0 = 6.36;
    const h = 9 * ROW;
    p.add(board, box(bx1 - bx0, h, 0.12, (bx0 + bx1) / 2, y0, F + 0.06));
    const txt = 'THE DESERT SUN';
    const tx = (bx0 + bx1) / 2 - textW(txt) / 2;
    p.add(paint, ...textGeo(txt, tx, y0 + ROW, F + 0.13));
    for (const sx of [bx0 + 0.75, bx1 - 0.75]) {
      const s = sunGeo(0.52, sx, y0 + h / 2, F + 0.12, 8);
      p.add(sunO, ...s.outer).add(sunI, ...s.inner);
    }
  }

  // ── 东墙伸出的竖招牌（x 12.0…13.5，板面朝南，3.6…9.4）："NEWS" 竖排 + 顶上一个太阳；两根铁撑 ──
  {
    const z = F - 4.5;
    const cx = 12.75;
    p.add(board, box(1.5, 5.8, 0.24, cx, 3.6, z));
    p.add(paint, ...textVGeo('NEWS', cx - (5 * T) / 2, 7.95, z + 0.13));
    const s = sunGeo(0.62, cx, 8.65, z + 0.12, 8);
    p.add(sunO, ...s.outer).add(sunI, ...s.inner);
    p.add(paint, box(1.5, ROW, 0.26, cx, 3.6, z), box(1.5, ROW, 0.26, cx, 9.4 - ROW, z)); // 上下各一条亮边框
    for (const y of [4.0, 9.0]) p.add(iron, box(0.2, T, 0.12, 12.05, y, z));
  }

  // ── 屋顶：低坡四坡红瓦顶（18°，出檐 0.6）盖住 build.ts 的平屋顶板；檐下一圈灰泥线脚 + 一排瓦头（朝南的竖面 = 一条暗红）──
  // 原来是平顶 + 女儿墙 + 红瓦压顶：竖屏取景上面六分之一是一大块桃色的空板（饱和度 0.41），拉远看是一块空地；
  // 西班牙复兴式的两层楼本来就是低坡红瓦顶，红尖塔从屋顶里长出来，后面的锯齿顶照样露出来
  {
    const X = 12.6;
    const Zh = 8.6;
    const Ye = 8.45;
    const rise = Zh * Math.tan((18 * Math.PI) / 180);
    const Yr = Ye + rise;
    const rx = X - Zh;
    const tri = (pts: number[][]) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
      geo.computeVertexNormals();
      return geo;
    };
    const A = [-X, Ye, Zh];
    const B = [X, Ye, Zh];
    const C = [rx, Yr, 0];
    const D = [-rx, Yr, 0];
    const E = [X, Ye, -Zh];
    const W = [-X, Ye, -Zh];
    p.add(tile, tri([A, B, C, A, C, D, E, W, D, E, D, C]));
    const tileEW = ctx.mat('roofTile', { ...tileOpts, elem: { kind: 'planks', p: [0, 0, 1, 0.27], seam: 1, hi: 0.6 } });
    p.add(tileEW, tri([B, E, C, W, A, D]));
    p.add(ridge, box(2 * rx + 0.3, 0.16, 0.32, 0, Yr - 0.08, 0)); // 屋脊（不投影：脊瓦在南坡上投一条毛边的暗线）
    // 檐下：灰泥线脚（盖住屋顶板的边）+ 一排瓦头
    p.add(
      stuccoTop,
      box(2 * X - 0.2, 0.36, 0.34, 0, 7.95, Zh - 0.19),
      box(2 * X - 0.2, 0.36, 0.34, 0, 7.95, -Zh + 0.19),
    );
    p.add(
      stuccoTop,
      box(0.34, 0.36, 2 * Zh - 0.2, X - 0.19, 7.95, 0),
      box(0.34, 0.36, 2 * Zh - 0.2, -X + 0.19, 7.95, 0),
    );
    p.add(tileS, box(2 * X, 0.14, 0.2, 0, 8.31, Zh - 0.12));
  }

  // ── 三丛九重葛：一根藤（2 纹素的木色茎）从陶盆爬上去，顶上一大团花（洋红的苞片是主体，叶子只在后面垫一团）──
  // 东头爬上拱廊最东的墩子、在拱廊顶上铺开；门西壁柱爬上门头压顶（给门一个花边）；西墙角爬到二楼窗边
  {
    const rnd = ctx.rng('paper-front:bougainvillea');
    const leaf = ctx.mat('olive', { ...VINE, elem: { kind: 'leaves', size: [2.3, 2.3], hi: 0.15 } });
    const flower = ctx.mat('flowerPurple', {
      ...VINE,
      bands: [0.0, 0.6],
      ramp: BOUGAIN_RAMP,
      tones: undefined,
      elem: { kind: 'leaves', size: [2.1, 2.1], hi: 0.2 },
    });
    const stemM = ctx.mat('woodWeathered', { noShadowReceive: true });
    const pot = ctx.mat('pot', { noShadowReceive: true });
    /** 一团（压扁贴墙；球面法线 = 这一团自己的，每团有亮顶） */
    // 二十面体（20 个三角形）+ 自己算的球面法线（不然面法线 = 一颗颗多面体）：三丛 ~70 团，细分 1 级会到 5 千多个三角形
    const blob = (m: THREE.Material, x: number, y: number, z: number, r: number) => {
      const g = new THREE.IcosahedronGeometry(r, 0).scale(1, 0.8, 0.6);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const nrm = g.attributes.normal as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).normalize();
        nrm.setXYZ(i, v.x, v.y, v.z);
      }
      p.add(m, g.translate(x, y, z));
    };
    /** 一丛：盆（x, z）、茎到 y1、几大团花（每团后面垫一团叶，前面 / 上面两三小团花） */
    const vine = (x: number, z: number, y1: number, masses: [number, number, number, number][]) => {
      p.add(pot, box(0.55, 0.5, 0.55, x, 0, z));
      p.add(stemM, box(2 * T, (y1 - 0.5) / 2, 0.12, x, 0.5, z - 0.1));
      p.add(stemM, box(2 * T, (y1 - 0.5) / 2, 0.12, x + T, 0.5 + (y1 - 0.5) / 2, z - 0.12));
      // 茎上一路小叶团（左右交替），不是一根光杆
      for (let y = 0.9, k = 0; y < y1 - 0.2; y += 0.56, k++)
        blob(leaf, x + (k % 2 ? 0.12 : -0.08) + (rnd() - 0.5) * 0.1, y, z - 0.02, 0.2 + rnd() * 0.1);
      for (const [mx, my, mz, r] of masses) {
        blob(leaf, mx + (rnd() - 0.5) * r * 0.4, my + r * 0.1, mz - r * 0.25, r * 0.9);
        const n = r > 0.58 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd() * 1.2;
          blob(
            flower,
            mx + Math.cos(a) * r * 0.4,
            my + Math.sin(a) * r * 0.25 + 0.05,
            mz + 0.1,
            r * (0.6 + rnd() * 0.2),
          );
        }
      }
    };
    vine(11.55, F + 2.95, 3.3, [
      [11.0, 3.75, F + 2.2, 0.75],
      [10.1, 3.95, F + 1.6, 0.55],
      [12.0, 3.2, F + 2.45, 0.55],
    ]);
    vine(-3.3, F + 0.95, 5.2, [
      [-2.75, 5.55, F + 0.8, 0.6],
      [-1.75, 6.25, F + 0.62, 0.55],
      [-3.15, 4.55, F + 0.85, 0.42],
    ]);
    vine(-11.6, F + 0.45, 4.0, [
      [-11.6, 4.3, F + 0.4, 0.6],
      [-11.85, 3.3, F + 0.45, 0.45],
      [-11.3, 5.25, F + 0.35, 0.45],
    ]);
  }

  const g = p.group(ctx, 'valley-asset:paper-front');
  noCast(g, cap, glass, iron, board, paint, sunO, sunI, brass, lampGlass, shade, ridge);
  nightLights(
    g,
    [
      [glass, glassN],
      [paint, paintN],
      [lampGlass, lampGlassN],
    ],
    [0, F + 2.6, 4.2, 3.6],
  );
  return g;
};

// ═════════════════════════════════════════════════════════════════════════════════════════
// paper-tower：门西边的白灰泥方塔（5.5 × 5.5，塔身 13 米 + 四坡红瓦尖顶到 15.6 + 顶上一颗金球）。原点 = 塔底中心，南面 z = +2.75。
// 朝南：勒脚、一楼一扇窄圆头窗、太阳牌（Ø3.5：橙外圈 + 黄里圈 + 12 道长短相间的光芒，夜里亮）、一条线脚、钟室两个暗的圆拱洞、
// 两级檐口。竖招牌在 paper-front（挂在楼的东墙上，不在塔上）。
// ═════════════════════════════════════════════════════════════════════════════════════════
const paperTower: AssetFn = (ctx) => {
  const S = 5.5;
  const Z = S / 2;
  const stucco = ctx.mat('stucco', facadeOpts);
  const stuccoTop = ctx.mat('stucco', stuccoOpts);
  const tile = ctx.mat('roofTile', tileOpts);
  const cap = ctx.mat('cap', { noShadowReceive: true });
  const glass = ctx.mat('jug', { noShadowReceive: true });
  const glassN = ctx.mat('straw', { noShadowReceive: true, emissive: GLOW_WIN });
  const iron = ctx.mat('ironwork', { noShadowReceive: true });
  const shade = ctx.mat('stucco', { ramp: SHADE_RAMP, tones: undefined, edge: 0.2, convex: 0, noShadowReceive: true });
  const sunO = ctx.mat('sunEnamel', SIGN_FACE);
  const sunI = ctx.mat('sunEnamel', { ...SIGN_FACE, bands: [-0.9, -0.5] });
  const sunON = ctx.mat('sunEnamel', { ...SIGN_FACE, emissive: 0x4a2a10 });
  const sunIN = ctx.mat('sunEnamel', { ...SIGN_FACE, bands: [-0.9, -0.5], emissive: 0x5a3a14 });
  const gold = ctx.mat('flowerYellow', { lightUp: 0.3, sphereNormals: [0, 15.75, 0] });
  const p = new Parts();

  // 塔身（侧面、背面也是灰泥；朝南那面另贴一层皮好让元素对齐立面）
  p.add(stuccoTop, box(S, 13, S, 0, 0, 0));
  p.add(stucco, quad(S, 13 - 0.36, 0, 0.36, Z + 0.03));
  p.add(cap, box(S + 0.12, 0.36, S + 0.12, 0, 0, 0)); // 勒脚
  // 一楼一扇窄圆头窗
  const w = windowGeo(0, 1.4, 0.9, 1.9, Z + 0.04, 1);
  p.add(glass, ...w.glass)
    .add(iron, ...w.mull)
    .add(stuccoTop, ...w.sill);
  // 太阳牌
  const sun = sunGeo(1.75, 0, 7.0, Z + 0.04, 12);
  p.add(sunO, ...sun.outer).add(sunI, ...sun.inner);
  // 线脚（钟室下）
  p.add(cap, box(S + 0.2, 0.18, S + 0.2, 0, 9.4, 0));
  // 钟室：朝南两个圆拱洞（暗）+ 洞口下沿的小台
  for (const x of [-1.1, 1.1]) {
    p.add(shade, archGeo(1.26, 1.25, x, 10.1, Z + 0.05));
    p.add(stuccoTop, box(1.5, 0.12, 0.18, x, 9.98, Z + 0.09));
  }
  // 两级檐口
  p.add(stuccoTop, box(S + 0.3, 0.22, S + 0.3, 0, 12.55, 0));
  p.add(cap, box(S + 0.6, 0.25, S + 0.6, 0, 12.77, 0));
  // 四坡尖顶（底边 6.4 见方）+ 金球
  const R = (S + 0.9) / Math.SQRT2;
  p.add(tile, new THREE.ConeGeometry(R, 2.6, 4, 1).rotateY(Math.PI / 4).translate(0, 13.02 + 1.3, 0));
  p.add(gold, new THREE.IcosahedronGeometry(0.22, 1).translate(0, 15.75, 0), box(0.12, 0.3, 0.12, 0, 15.5, 0));

  const g = p.group(ctx, 'valley-asset:paper-tower');
  // 整座塔不投影（同 town 的市政厅钟楼）：塔在楼南边、太阳在北边，塔影只会落在楼影外面的街上 —— 15 米高的方塔
  // 在人行道和塔奎兹路上投一条 5.5 米宽、十来米长的硬边黑带；楼自己的影子已经盖住门前
  noCast(g);
  nightLights(g, [
    [glass, glassN],
    [sunO, sunON],
    [sunI, sunIN],
  ]);
  return g;
};

// ═════════════════════════════════════════════════════════════════════════════════════════
// paper-press-roof：印刷车间的锯齿顶（22 × 1.7 × 19，4 齿：南面是斜的压型板（亮档，竖的板缝），北面竖的天窗（镜头背后）；
// 齿脊一条压顶、檐口一圈压边）。原点 = 车间的中心（249, −676）地面，屋顶板顶 y 6.35（build.ts 的板 6…6.35）。
// ═════════════════════════════════════════════════════════════════════════════════════════
const pressRoof: AssetFn = (ctx) => {
  const Y0 = 6.35;
  const W = 22;
  const H = 1.7;
  const n = 4;
  const zs0 = 9.5;
  const dz = 4.8;
  const metal = ctx.mat('roofMetal', { elem: TOWN_EL.roofMetal });
  const flash = ctx.mat('roofMetal', { tones: undefined, ramp: [0xa4a6b4, 0x84869a, 0x4a4e6e] });
  const vent = ctx.mat('roofMetal', { tones: undefined, ramp: [0xc4c6c6, 0x6c7090, 0x464a6a], noShadowReceive: true });
  const glass = ctx.mat('jug', { noShadowReceive: true });
  const p = new Parts();
  const x0 = -W / 2;
  const x1 = W / 2;
  for (let i = 0; i < n; i++) {
    const zS = zs0 - i * dz;
    const zN = zS - dz;
    const P = [
      [x0, Y0, zS],
      [x1, Y0, zS],
      [x1, Y0, zN],
      [x0, Y0, zN],
      [x0, Y0 + H, zN],
      [x1, Y0 + H, zN],
    ];
    const tri = (idx: number[][]) => {
      const pos: number[] = [];
      for (const t of idx) for (const k of t) pos.push(...(P[k] as number[]));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      return geo;
    };
    p.add(
      metal,
      tri([
        [0, 1, 5],
        [0, 5, 4],
      ]),
    );
    p.add(
      flash,
      tri([
        [0, 4, 3],
        [1, 2, 5],
      ]),
    );
    // 北面：天窗（玻璃）+ 上下两条框
    p.add(
      glass,
      tri([
        [3, 4, 5],
        [3, 5, 2],
      ]),
    );
    // 齿脊上的通风罩：一条 0.3 米高的长盒子，朝南的竖面落暗档、顶面亮 —— 每齿一条"亮线 + 暗带"，远看是横条纹
    p.add(vent, box(W + 0.1, 0.32, 0.5, 0, Y0 + H - 0.14, zN + 0.25));
  }
  // 檐口压边：屋顶板一圈（南沿看得见）
  p.add(flash, box(W + 0.5, 0.18, 0.2, 0, Y0 - 0.1, 10.15), box(W + 0.5, 0.18, 0.2, 0, Y0 - 0.1, -10.15));
  p.add(flash, box(0.2, 0.18, 20.3, -W / 2 - 0.15, Y0 - 0.1, 0), box(0.2, 0.18, 20.3, W / 2 + 0.15, Y0 - 0.1, 0));
  const g = p.group(ctx, 'valley-asset:paper-press-roof');
  noCast(g, glass, flash, vent);
  return g;
};

// ═════════════════════════════════════════════════════════════════════════════════════════
// paper-newsrack：投币报箱 0.6 × 1.1 × 0.5。v0 / v1 = 太阳报（深蓝 + 小太阳），v2 = 红色（别家），v3 = 黄色（别家）。
// 箱身 + 往后斜的透明窗（看得见里面的报纸 = 亮的新闻纸）+ 右上投币口 + 顶上一块报名牌 + 四条短腿。朝南（窗朝镜头）。
// ═════════════════════════════════════════════════════════════════════════════════════════
const newsrack: AssetFn = (ctx) => {
  const v = ctx.variant;
  const key: PalKey = v <= 1 ? 'signBoard' : v === 2 ? 'carRed' : 'flowerYellow';
  const face: ToonOpts = { lightUp: 0.45, bands: [-0.35, 0.35], noShadowReceive: true };
  const body = ctx.mat(key, face);
  const paper = ctx.mat('newsprint', { lightUp: 0.3, noShadowReceive: true });
  const iron = ctx.mat('ironwork', { noShadowReceive: true });
  const plate = ctx.mat(v <= 1 ? 'sunEnamel' : 'signPaint', SIGN_FACE);
  const p = new Parts();
  const W = 0.54;
  const D = 0.45;
  // 腿
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) p.add(iron, box(T, 0.27, T, sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.05)));
  // 下半箱身
  p.add(body, box(W, 0.45, D, 0, 0.27, 0));
  // 上半：前面往后斜的窗（从 z +D/2、y 0.72 斜到 z +0.02、y 1.02），两侧、后面是箱身
  {
    const sh = new THREE.Shape();
    sh.moveTo(-D / 2, 0);
    sh.lineTo(D / 2, 0);
    sh.lineTo(0.02, 0.3);
    sh.lineTo(-D / 2, 0.3);
    sh.lineTo(-D / 2, 0);
    // 侧面轮廓在 zy 平面：挤出沿 x
    const geo = new THREE.ExtrudeGeometry(sh, { depth: W, bevelEnabled: false })
      .rotateY(-Math.PI / 2)
      .translate(W / 2, 0.72, 0);
    p.add(body, geo);
    // 斜窗里的报纸（比斜面往外 1 厘米，四周留 1 纹素的框）
    const len = Math.hypot(D / 2 - 0.02, 0.3);
    const win = new THREE.PlaneGeometry(W - 2 * T, len - 2 * T)
      .rotateX(-Math.atan2(D / 2 - 0.02, 0.3))
      .translate(0, 0.72 + 0.15, (D / 2 + 0.02) / 2 + 0.012);
    p.add(paper, win);
  }
  // 顶板 + 报名牌（朝南的一条）
  p.add(body, box(W + 0.06, 0.06, D * 0.55 + 0.04, 0, 1.02, -D / 4 + 0.01));
  p.add(plate, box(W - 0.1, 2 * ROW * 0.6, 0.02, 0, 0.5, D / 2 + 0.01));
  // 投币口（右上角一小块暗的）
  p.add(iron, box(0.1, 0.12, 0.02, W / 2 - 0.1, 0.56, D / 2 + 0.012));
  const g = p.group(ctx, `valley-asset:paper-newsrack:${v}`);
  noCast(g, iron, plate, paper);
  return g;
};

// ═════════════════════════════════════════════════════════════════════════════════════════
// paper-van：送报的方头面包车 2.2 × 2.4 × 5.4，车头朝南（+z）。白车身（顶亮）、车顶一个太阳标（镜头看得见的是车顶和车头）、
// 车头一条橙色腰线 + 挡风玻璃 + 车灯 + 格栅；底下一条暗边（保险杠、轮子）。
// ═════════════════════════════════════════════════════════════════════════════════════════
const paperVan: AssetFn = (ctx) => {
  const white = ctx.mat('truckWhite');
  const front = ctx.mat('truckWhite', { lightUp: 0.4, bands: [-0.3, 0.4], noShadowReceive: true });
  const dark = ctx.mat('ironwork');
  const glass = ctx.mat('jug', { noShadowReceive: true });
  const sunO = ctx.mat('sunEnamel');
  const sunI = ctx.mat('sunEnamel', { bands: [-0.5, 0.2] });
  const stripe = ctx.mat('sunEnamel', SIGN_FACE);
  const lamp = ctx.mat('signPaint', { noShadowReceive: true });
  const p = new Parts();
  const L = 5.4;
  const W = 2.2;
  // 底：保险杠 + 轮子（暗）
  p.add(dark, box(W - 0.1, 0.36, L - 0.3, 0, 0.12, 0));
  for (const sz of [-1, 1])
    for (const sx of [-1, 1]) p.add(dark, box(0.3, 0.66, 0.72, sx * (W / 2 - 0.2), 0, sz * 1.75));
  p.add(dark, box(W, 0.22, 0.18, 0, 0.36, L / 2 - 0.06), box(W, 0.22, 0.18, 0, 0.36, -L / 2 + 0.06));
  // 车身（货厢 + 驾驶室一个盒子，车头那面另一层朝镜头的皮）
  p.add(white, box(W, 1.92, L - 0.2, 0, 0.48, -0.05));
  p.add(front, quad(W, 1.92, 0, 0.48, L / 2 - 0.15 + 0.01));
  // 挡风玻璃、车灯、格栅、橙色腰线
  p.add(glass, quad(1.8, 0.7, 0, 1.5, L / 2 - 0.12));
  p.add(stripe, quad(W, 2 * ROW, 0, 1.08, L / 2 - 0.13));
  for (const sx of [-1, 1]) p.add(lamp, box(0.27, 0.18, 0.04, sx * 0.78, 0.72, L / 2 - 0.12));
  p.add(dark, quad(0.9, 0.27, 0, 0.68, L / 2 - 0.13));
  // 后视镜
  for (const sx of [-1, 1]) p.add(dark, box(0.12, 0.27, 0.12, sx * (W / 2 + 0.06), 1.55, L / 2 - 0.6));
  // 车顶：太阳标（平放，朝上 = 亮档）
  {
    const y = 2.4;
    p.add(sunO, new THREE.CylinderGeometry(0.52, 0.52, 0.03, 18).translate(0, y + 0.015, -0.6));
    p.add(sunI, new THREE.CylinderGeometry(0.34, 0.34, 0.03, 16).translate(0, y + 0.04, -0.6));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      p.add(
        sunO,
        new THREE.BoxGeometry(0.27, 0.03, 0.22)
          .translate(0, 0, 0.72)
          .rotateY(a)
          .translate(0, y + 0.015, -0.6),
      );
    }
  }
  const g = p.group(ctx, 'valley-asset:paper-van');
  noCast(g, glass, lamp, stripe, sunO, sunI, front);
  return g;
};

/** 货板（woodWeathered）：面板一块（板缝沿 x 每 3 纹素一条）+ 三根垫木；宽 w、深 d，高 0.15 */
function pallet(ctx: AssetCtx, p: Parts, w: number, d: number) {
  const wood = ctx.mat('woodWeathered', { elem: { kind: 'planks', p: [1, 0, 0, 0.27], seam: 1, hi: 0.4 } });
  const dark = ctx.mat('woodWeathered');
  p.add(wood, box(w, 0.05, d, 0, 0.1, 0));
  for (const sz of [-1, 0, 1]) p.add(dark, box(w, 0.1, 0.18, 0, 0, sz * (d / 2 - 0.09)));
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// newsprint-rolls：一托新闻纸卷（货板 2.6 × 1.3 + 下面两卷、上面一卷，Ø0.9 × 1.2，轴朝南北 → 端面朝镜头是一个圆，
// 上面是亮的白筒；端面画同心的一圈缝 + 中间纸芯（暗））。
// （清单原来写"端面朝东西"：镜头 yaw 0 下东西两面是一条线，只剩白条；转成朝南北，端面的圆 + 纸芯一眼是"纸卷"。）
// ═════════════════════════════════════════════════════════════════════════════════════════
const newsprintRolls: AssetFn = (ctx) => {
  const paper = ctx.mat('newsprint', { lightUp: 0.2 });
  const ring = ctx.mat('newsprint', {
    tones: undefined,
    ramp: [0xd2c8b8, 0xaa9ea8, 0x4a446e],
    lightUp: 0.5,
    bands: [-0.4, 0.3],
    noShadowReceive: true,
  });
  const end = ctx.mat('newsprint', { lightUp: 0.5, bands: [-0.4, 0.3], noShadowReceive: true });
  const core = ctx.mat('kraft', { lightUp: 0.5, bands: [-0.4, 0.3], noShadowReceive: true });
  const p = new Parts();
  pallet(ctx, p, 2.4, 1.3);
  const R = 0.45;
  const L = 1.2;
  const rolls: [number, number][] = [
    [-0.5, 0.15 + R],
    [0.5, 0.15 + R],
    [0, 0.15 + R + Math.sqrt((2 * R) ** 2 - 0.5 ** 2)],
  ];
  for (const [x, y] of rolls) {
    p.add(paper, new THREE.CylinderGeometry(R, R, L, 14).rotateX(Math.PI / 2).translate(x, y, 0));
    // 端面（朝南）：同心一圈缝（1 纹素宽的环）+ 纸芯
    const z = L / 2 + 0.005;
    p.add(end, new THREE.CircleGeometry(R, 16).translate(x, y, z + 0.002));
    p.add(ring, new THREE.RingGeometry(R * 0.62, R * 0.62 + T, 18).translate(x, y, z + 0.004));
    p.add(core, new THREE.CircleGeometry(R * 0.24, 10).translate(x, y, z + 0.006));
  }
  const g = p.group(ctx, 'valley-asset:newsprint-rolls');
  noCast(g, end, ring, core);
  return g;
};

// ═════════════════════════════════════════════════════════════════════════════════════════
// paper-bundles：一摞 4 层捆好的报纸（1.2 × 1.0 × 0.9）：每层两捆，层与层交叉着码（单层两捆东西排、双层两捆南北排），
// 每捆一条暗的捆绳（顶面 + 朝南那面），层与层错开 1 纹素。v1 = 三层（矮一点）。
// ═════════════════════════════════════════════════════════════════════════════════════════
const paperBundles: AssetFn = (ctx) => {
  const paper = ctx.mat('newsprint');
  // 朝南的面一层白（亮档）一层灰（中档）交替：一摞一摞的报纸
  const faces = [
    ctx.mat('newsprint', { lightUp: 0.35, bands: [-0.6, -0.2], noShadowReceive: true }),
    ctx.mat('newsprint', { lightUp: 0.35, bands: [-0.2, 0.35], noShadowReceive: true }),
  ];
  const twine = ctx.mat('ironwork', { noShadowReceive: true });
  const rnd = ctx.rng(`paper-bundles:${ctx.variant}`);
  const p = new Parts();
  const layers = ctx.variant === 1 ? 3 : 4;
  const LH = 0.24;
  for (let i = 0; i < layers; i++) {
    const y = i * LH;
    const ox = (Math.floor(rnd() * 3) - 1) * T;
    const oz = (Math.floor(rnd() * 3) - 1) * T;
    const along = i % 2 === 0;
    for (const s of [-1, 1]) {
      const [w, d, x, z] = along ? [0.57, 0.86, s * 0.3, 0] : [1.16, 0.42, 0, s * 0.22];
      const cx = x + ox;
      const cz = z + oz;
      p.add(paper, box(w, LH - 0.02, d, cx, y, cz));
      p.add(faces[i % 2], quad(w, LH - 0.02, cx, y, cz + d / 2 + 0.005));
      // 捆绳：顶面一条 + 朝南那面一条（沿短边）
      if (along) {
        p.add(twine, new THREE.PlaneGeometry(w + 0.01, T).rotateX(-Math.PI / 2).translate(cx, y + LH - 0.015, cz));
        p.add(twine, quad(T, LH - 0.02, cx, y, cz + d / 2 + 0.01));
      } else {
        p.add(twine, new THREE.PlaneGeometry(T, d + 0.01).rotateX(-Math.PI / 2).translate(cx, y + LH - 0.015, cz));
        if (s > 0) p.add(twine, quad(T, LH - 0.02, cx, y, cz + d / 2 + 0.01));
      }
    }
  }
  const g = p.group(ctx, 'valley-asset:paper-bundles');
  noCast(g, ...faces, twine);
  return g;
};

// ═════════════════════════════════════════════════════════════════════════════════════════
// 室内（in-，2026-11-16 店内关卡 1+2）：编辑部里的东西。interiors/paper.ts 摆。原点 = 落地点中心，y 0 = 地面，+z 朝镜头（朝南）。
// 头顶上的东西（梁、吊扇、吊灯）也按地面原点画、自己抬到 4.1 米（梁底），画廊里照样是真实高度。
// 新材质（这一节手挑，材质规范 v2：每档 [本色, 高一级, 低一级]、缝、亮边；暗档往冷走）：
// - FLOOR_RAMPS：深色胡桃木地板（三块板色各一个材质，板缝是底下一层缝色露出来）
// - WALNUT_T：深色胡桃木（家具、护墙板、隔断、梁）
// - GREEN_T：编辑部上半截墙（墨绿）；TEAL_T：总编室的墙（深青）；CARPET 墨绿地毯；OXBLOOD 牛血红地毯
// - CAB：文件柜、钢桌子的橄榄绿烤漆；LEATHER：总编的牛血红皮椅；BANKER：银行家台灯的绿玻璃罩
// - BEIGE：老电脑的米色机壳；SCREEN：显示器的墨绿屏；OLDPAPER：发黄的旧报；SEPIA：旧照片
// 朝镜头的面（墙皮、挂的框、柜子正面）：太阳在北边，朝南的面永远暗档 → 墙上的东西用 WALL_FACE（同 SIGN_FACE，落中档），
// 家具正面用 FRONT（光往上偏一点，暗档变中档的少一些：家具还是"顶亮、正面暗"）。
// 夜里：台灯、吊灯、画灯换自发光，各一个灯光圈（nightLights）。
// ═════════════════════════════════════════════════════════════════════════════════════════

/**
 * 室内的灯：画廊里照旧 nightLights（每件自己换材质、自己一个灯光圈）；另外把 [白天, 夜里] 材质对和灯光圈（本地坐标）记在
 * userData.inNight 上 —— interiors/paper.ts 把整间屋的资产按材质合并以后，按这个重新接灯（合并后的网格一起换、每盏灯一个圈）。
 */
export interface InNight {
  pairs: [THREE.Material, THREE.Material][];
  pool?: [number, number, number, number];
}
function inNight(g: THREE.Group, pairs: [THREE.Material, THREE.Material][], pool?: [number, number, number, number]) {
  nightLights(g, pairs, pool);
  g.userData.inNight = { pairs, pool } satisfies InNight;
}

// ── 室内配色（用户 2026-11-16：和外景太像 → 重做）：深、沉的老编辑部 —— 墨绿的墙、深色胡桃木地板 + 墨绿大地毯、
// 牛血红、黄铜；亮处只有纸的米白和台灯。外景是"沙、桃、赭、灰泥白"，这里不用那一族（色相 15°～45° 又亮又中等饱和的）。
// 店里是固定的室内顶光（main.ts INDOOR_LOOK），按渲染出来的颜色调（golden 方案还会再染一层暖）。
/** 地板：深色（染了深色的胡桃木）三种板色，色相压在 15° 以下（偏红）、明度 < 0.55：不落进外景的沙 / 桃一族 */
const FLOOR_RAMPS: Ramp[] = [
  [0x4e1c3c, 0x3c1634, 0x241034],
  [0x582244, 0x441a3a, 0x2a1438],
  [0x461834, 0x34122e, 0x1e0e32],
];
/** 板缝：比板暗 ~20 */
const FLOOR_SEAM: Ramp = [0x2e0e2a, 0x240c26, 0x140a28];
/** 胡桃木（家具、护墙板、隔断）：深、偏红；亮档 L ~84 */
const WALNUT_T = tn(
  [0x8e4a3c, 0x985242, 0x844236],
  [0x6a3436, 0x723a3c, 0x622e32],
  [0x3a2238, 0x42283e, 0x341e32],
  [0x6c3430, 0x502630, 0x281828],
  [0xa86048, 0x844444, 0x523450],
);
const WALNUT: Ramp = [0x8e4a3c, 0x6a3436, 0x3a2238];
/** 编辑部的墙：墨绿（朝镜头 → 主要落中档） */
const GREEN_T = tn(
  [0x1e7c5e, 0x248466, 0x187456],
  [0x12664e, 0x186e56, 0x0e5e48],
  [0x123a44, 0x16404a, 0x10343e],
  [0x1e604c, 0x164e46, 0x0a2a36],
  [0x44967a, 0x34806e, 0x22505a],
);
const GREEN_RAMP: Ramp = [0x1e7c5e, 0x12664e, 0x123a44];
/** 总编室的墙：更深的深青 */
const TEAL_T = tn(
  [0x2e6a72, 0x34727a, 0x28626a],
  [0x22545e, 0x285c66, 0x1e4c56],
  [0x162e40, 0x1a3446, 0x12283a],
  [0x22565e, 0x1a444e, 0x0e2232],
  [0x468a92, 0x367078, 0x24485a],
);
const TEAL_RAMP: Ramp = [0x2e6a72, 0x22545e, 0x162e40];
/** 编辑部的大地毯：墨绿（比墙深一点、带一点蓝） */
const CARPET: Ramp = [0x125c50, 0x0e4c46, 0x08303a];
/** 牛血红地毯（总编室、门口长条） */
const OXBLOOD: Ramp = [0x8a2a34, 0x6c2032, 0x3a1630];
const CAB: Ramp = [0xa8c488, 0x74946e, 0x3e5468];
const LEATHER: Ramp = [0xc0503e, 0x8a3442, 0x48203e];
const BANKER: Ramp = [0x6cd09a, 0x30946e, 0x1e5058];
const BEIGE: Ramp = [0xece0bc, 0xc4b096, 0x6e6484];
const SCREEN: Ramp = [0x3e7a62, 0x2c5a52, 0x1c3a40];
const OLDPAPER: Ramp = [0xf2dc9c, 0xd2b07e, 0x7a6480];
const SEPIA: Ramp = [0xb08a62, 0x8a6650, 0x4e3e52];
/** 夜里灯罩、灯泡的暖光；显示器的绿光 */
const GLOW_LAMP = 0x7a6838;
const GLOW_GREEN = 0x2a5a30;

/** 墙上挂的（朝南、贴墙）：落中档、不受投影 */
const WALL_FACE: ToonOpts = SIGN_FACE;
/** 家具朝镜头的正面：光往上偏一点（顶亮、正面中暗） */
const FRONT: ToonOpts = { lightUp: 0.3, bands: [-0.15, 0.5], noShadowReceive: true };

/** 平放的面（朝上） */
const flat = (w: number, d: number, x: number, y: number, z: number) =>
  new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z);
/** 竖的圆柱（底在 y） */
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, n = 10) =>
  new THREE.CylinderGeometry(r1, r0, h, n).translate(x, y + h / 2, z);

// 室内要的几个字（5 × 7）
const IN_GLYPH: Record<string, string[]> = {
  ...GLYPH,
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
};
/** 一串字（同 textGeo，字表多几个字）：左下角 (x, y)、平面 z */
function inText(s: string, x: number, y: number, z: number, px = 1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  let cx = x;
  for (const ch of s) {
    const gl = IN_GLYPH[ch];
    if (gl)
      gl.forEach((row, r) => {
        let c = 0;
        while (c < 5) {
          if (row[c] !== '#') {
            c++;
            continue;
          }
          let e = c;
          while (e < 5 && row[e] === '#') e++;
          out.push(quad((e - c) * T * px, ROW * px, cx + ((c + e) / 2) * T * px, y + (6 - r) * ROW * px, z));
          c = e;
        }
      });
    cx += CH * px;
  }
  return out;
}

/** 室内常用的材质（每件资产一份） */
function inMats(ctx: AssetCtx) {
  return {
    walnut: ctx.mat('wood', { ramp: WALNUT, tones: WALNUT_T }),
    walnutFront: ctx.mat('wood', { ramp: WALNUT, tones: WALNUT_T, ...FRONT }),
    wood: ctx.mat('wood'),
    woodFront: ctx.mat('wood', FRONT),
    paper: ctx.mat('newsprint', { noShadowReceive: true }),
    paperFront: ctx.mat('newsprint', { ...FRONT, lightUp: 0.4 }),
    iron: ctx.mat('ironwork', { noShadowReceive: true }),
    brass: ctx.mat('flowerYellow', { edge: 0.4, convex: 0.6, noShadowReceive: true }),
    brassFace: ctx.mat('flowerYellow', WALL_FACE),
    cab: ctx.mat('metal', { ramp: CAB }),
    cabFront: ctx.mat('metal', { ramp: CAB, ...FRONT }),
  };
}

/** 台灯 / 吊灯：灯罩材质白天 / 夜里两份 */
function lampMats(ctx: AssetCtx, ramp: Ramp, key: PalKey = 'metal') {
  const day = ctx.mat(key, { ramp, lightUp: 0.35, noShadowReceive: true });
  const night = ctx.mat(key, { ramp, lightUp: 0.35, noShadowReceive: true, emissive: GLOW_LAMP });
  const bulb = ctx.mat('signPaint', { noShadowReceive: true });
  const bulbN = ctx.mat('signPaint', { noShadowReceive: true, emissive: GLOW_LAMP });
  return { day, night, bulb, bulbN };
}

/** 银行家台灯（铜座 + 绿玻璃半圆罩）：放在 (x, y 桌面, z)，罩子横着（东西向） */
function bankerLamp(
  p: Parts,
  m: ReturnType<typeof inMats>,
  lm: ReturnType<typeof lampMats>,
  x: number,
  y: number,
  z: number,
) {
  p.add(m.brass, cyl(0.12, 0.1, 0.05, x, y, z, 10), box(T, 0.3, T, x, y + 0.05, z - 0.04));
  p.add(
    lm.day,
    new THREE.CylinderGeometry(0.13, 0.13, 0.42, 10, 1, false, 0, Math.PI)
      .rotateZ(Math.PI / 2)
      .translate(x, y + 0.36, z),
  );
  p.add(lm.bulb, box(0.3, T, 0.12, x, y + 0.29, z + 0.02));
}

/** 一排书 / 合订本（朝南的书脊）：x0…x1，底 y，高 h（± 变化），深 d（中心 z）；颜色按段（3～6 本一段同色） */
function bookRun(
  p: Parts,
  rnd: () => number,
  colors: THREE.Material[],
  x0: number,
  x1: number,
  y: number,
  h: number,
  d: number,
  z: number,
  band?: THREE.Material,
) {
  let x = x0;
  while (x < x1 - 0.1) {
    const n = 3 + Math.floor(rnd() * 4);
    const bw = T * (2 + Math.floor(rnd() * 2));
    const c = colors[Math.floor(rnd() * colors.length)];
    const hh = h * (0.82 + rnd() * 0.18);
    const w = Math.min(n * bw, x1 - x);
    // 偶尔一段斜靠着（不是一排整整齐齐）
    if (rnd() < 0.12 && w > 0.3) {
      p.add(
        c,
        box(w * 0.5, hh * 0.9, d, 0, 0, 0)
          .rotateZ(-0.35)
          .translate(x + w * 0.35, y, z),
      );
      x += w + T;
      continue;
    }
    p.add(c, box(w, hh, d, x + w / 2, y, z));
    if (band && rnd() < 0.6) p.add(band, quad(w, ROW, x + w / 2, y + hh * 0.72, z + d / 2 + 0.005));
    x += w + (rnd() < 0.3 ? T : 0);
  }
}

// ── in-paper-floor：编辑部的深色地板（20 × 18，板 0.36 宽 + 0.09 缝，南北向、端缝错开）+ 编辑部的墨绿大地毯 + 总编室的深蓝地毯 + 门到前台的牛血红长条地毯 ──
const inFloor: AssetFn = (ctx) => {
  const W = 20;
  const D = 18;
  const rnd = ctx.rng('in-paper-floor');
  const seam = ctx.mat('wood', { ramp: FLOOR_SEAM, edge: 0.05, convex: 0 });
  const boards = FLOOR_RAMPS.map((ramp) => ctx.mat('wood', { ramp, edge: 0.05, convex: 0 }));
  const rug = ctx.mat('signBoard', {
    ramp: [0x1e3a6a, 0x182e58, 0x101c3a],
    edge: 0.1,
    convex: 0,
    elem: { kind: 'paint', size: [14, 8] },
  });
  const rugBorder = ctx.mat('flowerYellow', { ramp: [0xb88a3a, 0x8a6434, 0x4a3834], edge: 0.1, convex: 0 });
  const runner = ctx.mat('clothRed', { ramp: OXBLOOD, edge: 0.1, convex: 0 });
  const carpet = ctx.mat('metal', { ramp: CARPET, edge: 0.1, convex: 0, elem: { kind: 'paint', size: [18, 10] } });
  const carpetEdge = ctx.mat('metal', { ramp: [0x1e4038, 0x183632, 0x10222a], edge: 0.1, convex: 0 });
  const p = new Parts();
  p.add(seam, flat(W, D, 0, 0.03, D / 2));
  const BW = 0.45;
  const n = Math.round(W / BW);
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + i * BW + T + (BW - T) / 2;
    let z = -rnd() * 2.4;
    while (z < D) {
      const len = 1.4 + Math.floor(rnd() * 4) * 0.45;
      const z0 = Math.max(0, z);
      const z1 = Math.min(D, z + len - ROW);
      if (z1 - z0 > 0.2) p.add(boards[Math.floor(rnd() * 3)], flat(BW - T, z1 - z0, x, 0.042, (z0 + z1) / 2));
      z += len;
    }
  }
  // 总编室的地毯：深海军蓝底 + 旧铜色的边（牛血红留给皮椅和门口的长条地毯）（x 13.2…18.4、z 3.0…7.2 → 本地 x 3.2…8.4）
  p.add(rugBorder, flat(5.2, 4.2, 5.8, 0.056, 5.1));
  p.add(rug, flat(4.84, 3.82, 5.8, 0.06, 5.1));
  // 编辑部的大地毯（墨绿，记者桌底下到展墙前：本地 x −9.6…0.8、z 3.6…11.6）+ 一圈深边
  p.add(carpetEdge, flat(10.4, 8.0, -4.4, 0.052, 7.6));
  p.add(carpet, flat(10.04, 7.64, -4.4, 0.056, 7.6));
  // 门到前台的长条地毯（牛血红）
  p.add(runner, flat(1.8, 3.2, 0, 0.056, 16.3));
  const g = p.group(ctx, 'valley-asset:in-paper-floor');
  noCast(g);
  ctx.mats.prepare(g, { cast: false, receive: true });
  // 本地原点放在地板的西北角那条边的中间：摆的时候 x = 10、z = 0
  return g;
};

// ── in-paper-north-wall：北墙的皮（20 米宽、本地 x −10…10，墙面 z 0）：护墙板 + 奶油墙 / 总编室青绿墙 + 报头大招牌 + 钟 + 软木板 + 总编室的窗（百叶）+ 墙上的奖状 ──
const inNorthWall: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const rnd = ctx.rng('in-paper-north-wall');
  const wains = ctx.mat('wood', {
    ramp: WALNUT,
    tones: WALNUT_T,
    ...WALL_FACE,
    elem: { kind: 'planks', p: [1, 0, 0, 1.2], seam: 1, hi: 0.6 },
  });
  const cream = ctx.mat('stucco', {
    tones: GREEN_T,
    ramp: GREEN_RAMP,
    ...WALL_FACE,
    elem: { kind: 'stones', size: [26, 14], seam: 0, hi: 0 },
    toneW: [0.3, 0.3],
  });
  const teal = ctx.mat('stucco', {
    tones: TEAL_T,
    ramp: TEAL_RAMP,
    ...WALL_FACE,
    elem: { kind: 'stones', size: [26, 14], seam: 0, hi: 0 },
    toneW: [0.3, 0.3],
  });
  const rail = ctx.mat('wood', { ramp: WALNUT, noShadowReceive: true });
  const board = ctx.mat('signBoard', WALL_FACE);
  const letters = ctx.mat('signPaint', WALL_FACE);
  const sunO = ctx.mat('sunEnamel', WALL_FACE);
  const sunI = ctx.mat('sunEnamel', { ...WALL_FACE, bands: [-0.9, -0.5] });
  const cork = ctx.mat('kraft', {
    ...WALL_FACE,
    ramp: [0x8a5438, 0x744632, 0x40283a],
    elem: { kind: 'stones', size: [3, 2], seam: 0, hi: 0 },
  });
  const card = ctx.mat('newsprint', WALL_FACE);
  const cardY = ctx.mat('flowerYellow', { ...WALL_FACE, ramp: [0xffe27a, 0xf2c060, 0x9a7a6a] });
  const cardB = ctx.mat('jug', WALL_FACE);
  const pin = ctx.mat('clothRed', WALL_FACE);
  const glass = ctx.mat('jug', { ...WALL_FACE, lightUp: 0.7, bands: [-0.6, 0.2] });
  const blind = ctx.mat('newsprint', { ...WALL_FACE, lightUp: 0.7, bands: [-0.6, 0.0] });
  const face = ctx.mat('signPaint', { ...WALL_FACE, lightUp: 0.8, bands: [-0.8, -0.2] });
  const oldP = ctx.mat('newsprint', { ...WALL_FACE, ramp: OLDPAPER });
  const ink = ctx.mat('ironwork', WALL_FACE);
  const p = new Parts();
  const Z = 0.02;
  // 护墙板（0…1.0）+ 压条
  p.add(wains, quad(20, 1.0, 0, 0, Z));
  p.add(rail, box(20, 0.12, 0.1, 0, 1.0, 0.05));
  p.add(rail, box(20, 0.12, 0.06, 0, 0, 0.03)); // 踢脚
  // 上半截：编辑部奶油、总编室青绿（总编室西隔断在本地 x 1.6）
  p.add(cream, quad(11.6, 3.38, -4.2, 1.12, Z));
  p.add(teal, quad(8.4, 3.38, 5.8, 1.12, Z));
  // 墙顶一条线脚
  p.add(rail, box(20, 0.14, 0.12, 0, 4.36, 0.06));
  // ── 报头大招牌：深蓝底 + 铜边 + 太阳 + "DESERT SUN"（x −8.2…−1.0、y 2.9…4.3；字上下各空一行，不贴铜边）──
  {
    const x0 = -8.2;
    const x1 = -1.0;
    const y0 = 2.9;
    const h = 1.4;
    p.add(board, box(x1 - x0, h, 0.08, (x0 + x1) / 2, y0, 0.06));
    p.add(
      m.brassFace,
      quad(x1 - x0, ROW, (x0 + x1) / 2, y0 + h - ROW, 0.105),
      quad(x1 - x0, ROW, (x0 + x1) / 2, y0, 0.105),
    );
    const s = sunGeo(0.5, x0 + 0.62, y0 + h / 2, 0.1, 10);
    p.add(sunO, ...s.outer).add(sunI, ...s.inner);
    p.add(letters, ...inText('DESERT SUN', x0 + 1.35, y0 + (h - 7 * ROW) / 2, 0.105));
  }
  // ── 钟（档案架上方，x −9.0、y 3.45）：木框 + 白盘 + 刻度 + 指针（10:10）──
  {
    const cx = -9.0;
    const cy = 3.45;
    p.add(rail, disc(0.42, 0.08, cx, cy, 0.02, 20));
    p.add(face, new THREE.CircleGeometry(0.33, 18).translate(cx, cy, 0.11));
    for (const [dx, dy] of [
      [0, 0.26],
      [0.26, 0],
      [0, -0.26],
      [-0.26, 0],
    ])
      p.add(ink, quad(T, ROW * 0.6, cx + dx, cy + dy - ROW * 0.3, 0.115));
    p.add(
      ink,
      quad(T, 0.22, 0, 0, 0).rotateZ(0.9).translate(cx, cy, 0.12),
      quad(T, 0.28, 0, 0, 0).rotateZ(-0.95).translate(cx, cy, 0.12),
    );
  }
  // ── 软木板（x −3.9…−0.3、y 1.25…2.45）：木框 + 一张张稿子卡片 + 图钉 ──
  {
    const x0 = -3.9;
    const x1 = -0.3;
    const y0 = 1.25;
    const h = 1.2;
    p.add(rail, box(x1 - x0 + 0.12, h + 0.12, 0.05, (x0 + x1) / 2, y0 - 0.06, 0.04));
    p.add(cork, quad(x1 - x0, h, (x0 + x1) / 2, y0, 0.07));
    const cols = 6;
    const rows = 3;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        if (rnd() < 0.18) continue;
        const cw = T * (3 + Math.floor(rnd() * 2));
        const ch = ROW * 2;
        const x = x0 + 0.3 + i * ((x1 - x0 - 0.5) / (cols - 1)) + (Math.floor(rnd() * 3) - 1) * T * 0.5;
        const y = y0 + 0.15 + j * 0.36 + Math.floor(rnd() * 2) * ROW * 0.5;
        const r = rnd();
        p.add(r < 0.15 ? cardY : r < 0.25 ? cardB : card, quad(cw, ch, x, y, 0.08));
        p.add(pin, quad(T, ROW, x, y + ch - ROW, 0.085));
      }
  }
  // ── 总编室：北墙的窗（本地 x 7.6…9.6、y 1.25…3.45）：木框 + 玻璃（天）+ 上面三分之二拉下来的百叶 ──
  {
    const cx = 8.6;
    const w = 1.9;
    const y0 = 1.25;
    const h = 2.2;
    p.add(rail, box(w + 0.24, h + 0.24, 0.06, cx, y0 - 0.12, 0.05));
    p.add(glass, quad(w, h, cx, y0, 0.085));
    for (let y = y0 + h - ROW * 1.5; y > y0 + h * 0.35; y -= ROW * 2) p.add(blind, quad(w, ROW, cx, y, 0.09));
    p.add(rail, box(w, ROW, 0.04, cx, y0 + h * 0.35 - ROW, 0.1)); // 百叶的下杆
    p.add(rail, quad(T, h, cx, y0, 0.088)); // 中竖棂
    p.add(rail, box(w + 0.4, 0.1, 0.18, cx, y0 - 0.14, 0.09)); // 窗台
  }
  // ── 总编室：书架上方三个框（奖状铜牌、一张头版、一张合影）──
  {
    const y0 = 2.6;
    // 铜牌（木托 + 铜面）
    p.add(rail, box(0.8, 0.62, 0.05, 3.9, y0 + 0.1, 0.04));
    p.add(m.brassFace, quad(0.56, 0.38, 3.9, y0 + 0.22, 0.07));
    // 头版（黑框 + 发黄的报 + 报头一条、标题一条）
    p.add(ink, box(0.8, 0.98, 0.05, 5.2, y0, 0.04));
    p.add(oldP, quad(0.62, 0.8, 5.2, y0 + 0.09, 0.07));
    p.add(ink, quad(0.5, ROW, 5.2, y0 + 0.72, 0.075), quad(0.44, ROW * 2, 5.15, y0 + 0.48, 0.075));
    // 合影（木框 + 旧照片）
    p.add(rail, box(0.72, 0.56, 0.05, 6.45, y0 + 0.2, 0.04));
    p.add(ctx.mat('kraft', { ...WALL_FACE, ramp: SEPIA }), quad(0.54, 0.38, 6.45, y0 + 0.29, 0.07));
  }
  const g = p.group(ctx, 'valley-asset:in-paper-north-wall');
  noCast(g);
  return g;
};

// ── in-paper-archive-shelf：档案架（2.8 × 2.6 × 0.7）：胡桃木框、五层；合订本（几段同色、铜色的年份带）+ 最下层牛皮纸档案盒 ──
const inArchiveShelf: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const rnd = ctx.rng(`in-paper-archive-shelf:${ctx.variant}`);
  const vols = [
    ctx.mat('clothRed', { ...FRONT, ramp: [0xc0503e, 0x8a3442, 0x48203e] }),
    ctx.mat('signBoard', FRONT),
    ctx.mat('metal', { ramp: CAB, ...FRONT }),
    ctx.mat('kraft', FRONT),
  ];
  const boxM = ctx.mat('kraft', FRONT);
  const label = ctx.mat('newsprint', FRONT);
  const back = ctx.mat('wood', { ramp: [0x6a4050, 0x4e3048, 0x2e2240], noShadowReceive: true });
  const p = new Parts();
  const W = 2.8;
  const H = 2.6;
  const D = 0.62;
  p.add(back, box(W, H, 0.04, 0, 0, -D / 2 + 0.02));
  for (const sx of [-1, 1]) p.add(m.walnutFront, box(0.1, H, D, sx * (W / 2 - 0.05), 0, 0));
  p.add(m.walnut, box(W + 0.06, 0.08, D + 0.04, 0, H - 0.08, 0));
  const shelfY = [0.1, 0.6, 1.1, 1.6, 2.08];
  for (const y of shelfY) p.add(m.walnut, box(W - 0.2, 0.05, D, 0, y - 0.05, 0));
  p.add(m.walnutFront, box(W - 0.2, 0.1, 0.04, 0, 0, D / 2 - 0.02));
  shelfY.forEach((y, i) => {
    const top = (shelfY[i + 1] ?? H - 0.08) - 0.05;
    if (i === 0) {
      // 档案盒：一排牛皮纸盒子，正面一张白标签
      let x = -W / 2 + 0.14;
      while (x < W / 2 - 0.5) {
        const bw = 0.36 + (rnd() < 0.3 ? 0.09 : 0);
        p.add(boxM, box(bw - 0.04, 0.34, D - 0.1, x + bw / 2, y, 0));
        p.add(label, quad(T * 2, ROW * 1, x + bw / 2, y + 0.2, D / 2 - 0.045));
        x += bw;
      }
    } else bookRun(p, rnd, vols, -W / 2 + 0.12, W / 2 - 0.12, y, top - y - 0.04, D - 0.16, 0.02, m.brassFace);
  });
  const g = p.group(ctx, 'valley-asset:in-paper-archive-shelf');
  noCast(g, label, back);
  return g;
};

/** 一个四屉文件柜（0.7 × 1.32 × 0.66），正面朝 +z，中心 x */
function fileCabinet(p: Parts, m: ReturnType<typeof inMats>, seam: THREE.Material, x: number) {
  const w = 0.68;
  const h = 1.32;
  const d = 0.66;
  p.add(m.cab, box(w, h, d, x, 0, 0));
  p.add(m.cab, box(w + 0.02, 0.03, d + 0.02, x, h, 0));
  const dh = (h - 0.08) / 4;
  for (let i = 0; i < 4; i++) {
    const y = 0.06 + i * dh;
    p.add(m.cabFront, quad(w - 0.06, dh - ROW, x, y + ROW * 0.5, d / 2 + 0.005));
    p.add(seam, quad(w - 0.06, ROW * 0.6, x, y, d / 2 + 0.006));
    p.add(m.brass, box(0.18, ROW * 0.7, 0.04, x, y + dh * 0.45, d / 2 + 0.02));
    p.add(m.paperFront, quad(T * 2, ROW * 0.8, x, y + dh * 0.7, d / 2 + 0.008));
  }
}

// ── in-paper-file-cabinet：橄榄绿的四屉文件柜。v0 = 并排三个（2.2 宽，上面一摞卷宗、一盆小仙人掌），v1 = 一个 ──
const inFileCabinet: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const seam = ctx.mat('metal', { ramp: [0x5c7458, 0x44584e, 0x283648], noShadowReceive: true });
  const p = new Parts();
  if (ctx.variant === 1) fileCabinet(p, m, seam, 0);
  else {
    for (const x of [-0.72, 0, 0.72]) fileCabinet(p, m, seam, x);
    // 上面：一摞卷宗（牛皮纸夹 + 白纸边）、一个铁皮收文筐、一盆小仙人掌
    const folder = ctx.mat('kraft');
    p.add(folder, box(0.42, 0.12, 0.32, -0.7, 1.35, 0.02), box(0.4, 0.08, 0.3, -0.68, 1.47, 0.04));
    p.add(m.paper, box(0.38, 0.03, 0.28, -0.69, 1.46, 0.04));
    p.add(m.iron, box(0.4, 0.1, 0.3, 0.1, 1.35, 0.05));
    p.add(m.paper, box(0.34, 0.06, 0.26, 0.1, 1.38, 0.05));
    p.add(ctx.mat('pot'), cyl(0.09, 0.12, 0.16, 0.78, 1.35, 0.05, 8));
    p.add(
      ctx.mat('cactus', { sphereNormals: [0.78, 1.62, 0.05] }),
      new THREE.SphereGeometry(0.13, 8, 6).scale(1, 1.2, 1).translate(0.78, 1.62, 0.05),
    );
  }
  const g = p.group(ctx, `valley-asset:in-paper-file-cabinet:${ctx.variant}`);
  noCast(g, seam, m.paperFront, m.brass);
  return g;
};

// ── in-paper-reporter-desk：记者的钢桌子（2.4 × 0.76 × 1.2）。人坐在南边（镜头这边）朝北，显示器 / 打字机朝南。
// v0 / v2 = 米色老电脑（显示器 + 键盘），v1 / v3 = 打字机；都有一盏绿罩台灯、一摞摞稿子、电话或咖啡杯 ──
const inReporterDesk: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const v = ctx.variant;
  const rnd = ctx.rng(`in-paper-reporter-desk:${v}`);
  const lm = lampMats(ctx, BANKER);
  // 桌面：墨绿油毡（1960 年代钢桌子的台面），不是浅色木头
  const top = ctx.mat('metal', { ramp: [0x3e7258, 0x2e5c4c, 0x1c3a40], edge: 0.5, convex: 0.4 });
  const beige = ctx.mat('counterTop', { ramp: BEIGE });
  const beigeF = ctx.mat('counterTop', { ramp: BEIGE, ...FRONT, lightUp: 0.45 });
  const screen = ctx.mat('jug', { ramp: SCREEN, lightUp: 0.5, bands: [-0.5, 0.3], noShadowReceive: true });
  const screenN = ctx.mat('jug', {
    ramp: SCREEN,
    lightUp: 0.5,
    bands: [-0.5, 0.3],
    noShadowReceive: true,
    emissive: GLOW_GREEN,
  });
  const text = ctx.mat('cactus', {
    ramp: [0x9ce8a8, 0x6cc08a, 0x3a7a6a],
    lightUp: 0.6,
    bands: [-0.8, -0.3],
    noShadowReceive: true,
  });
  const mug = ctx.mat(v % 2 ? 'clothRed' : 'pot');
  const p = new Parts();
  const W = 2.4;
  const D = 1.2;
  const Y = 0.74;
  // 桌面 + 东边一个抽屉柜（朝南的正面三个抽屉）+ 西边两条腿 + 北边的挡板
  p.add(top, box(W, 0.04, D, 0, Y, 0));
  p.add(m.cab, box(W - 0.04, 0.05, D - 0.04, 0, Y - 0.05, 0));
  p.add(m.cab, box(0.5, Y - 0.05, D - 0.1, W / 2 - 0.3, 0, 0));
  for (let i = 0; i < 3; i++) {
    p.add(m.cabFront, quad(0.44, 0.2, W / 2 - 0.3, 0.06 + i * 0.22, D / 2 - 0.045));
    p.add(m.brass, box(0.14, ROW * 0.6, 0.03, W / 2 - 0.3, 0.17 + i * 0.22, D / 2 - 0.03));
  }
  for (const sz of [-1, 1]) p.add(m.cab, box(0.08, Y - 0.05, 0.08, -W / 2 + 0.1, 0, sz * (D / 2 - 0.1)));
  p.add(m.cab, box(W - 0.6, 0.45, 0.04, -0.25, 0.22, -D / 2 + 0.06));
  // 台灯（北边靠西的角）
  bankerLamp(p, m, lm, -W / 2 + 0.35, Y + 0.04, -D / 2 + 0.25);
  if (v % 2 === 0) {
    // 米色显示器（屏朝南）+ 键盘 + 主机箱（压在显示器底下）
    const mx = -0.15;
    p.add(beige, box(0.62, 0.12, 0.46, mx, Y + 0.04, -0.2));
    p.add(beige, box(0.52, 0.42, 0.4, mx, Y + 0.16, -0.24));
    p.add(beige, box(0.36, 0.3, 0.2, mx, Y + 0.22, -0.52));
    p.add(beigeF, quad(0.52, 0.42, mx, Y + 0.16, -0.04 + 0.002));
    p.add(screen, quad(0.38, 0.28, mx, Y + 0.22, -0.035));
    for (let i = 0; i < 3; i++)
      p.add(text, quad(T * (2 + ((i * 3) % 3)), ROW * 0.6, mx - 0.1 + i * 0.03, Y + 0.42 - i * ROW, -0.03));
    p.add(beige, box(0.56, 0.04, 0.2, mx, Y + 0.04, 0.24));
    p.add(m.paper, box(0.5, 0.01, 0.12, mx, Y + 0.08, 0.24));
  } else {
    // 打字机（黑漆 + 一张纸竖在滚筒后面 + 银色的滚筒）
    const tx = -0.15;
    p.add(m.iron, box(0.5, 0.14, 0.4, tx, Y + 0.04, 0.08));
    p.add(m.iron, box(0.56, 0.12, 0.14, tx, Y + 0.18, -0.04));
    p.add(ctx.mat('pvc', { noShadowReceive: true }), box(0.6, 0.06, 0.06, tx, Y + 0.3, -0.04));
    p.add(
      m.paper,
      box(0.34, 0.32, 0.02, 0, 0, 0)
        .rotateX(-0.25)
        .translate(tx, Y + 0.3, -0.08),
    );
    p.add(ctx.mat('signPaint', { noShadowReceive: true }), box(0.4, 0.02, 0.18, tx, Y + 0.18, 0.18));
  }
  // 一摞摞稿子（两三摞、高低不一）+ 杯子 + 电话
  for (let i = 0; i < 2 + (v % 2); i++) {
    const x = 0.55 + i * 0.32 + rnd() * 0.05;
    const h = 0.05 + rnd() * 0.16;
    p.add(
      m.paper,
      box(0.3, h, 0.24, 0, 0, 0)
        .rotateY((rnd() - 0.5) * 0.3)
        .translate(x, Y + 0.04, -0.25 + rnd() * 0.2),
    );
  }
  p.add(
    m.paper,
    box(0.34, 0.02, 0.26, 0, 0, 0)
      .rotateY(0.25)
      .translate(0.45, Y + 0.04, 0.3),
  );
  p.add(mug, cyl(0.06, 0.06, 0.12, -0.75, Y + 0.04, 0.3, 8));
  if (v < 2) {
    p.add(m.iron, box(0.24, 0.08, 0.22, 0.95, Y + 0.04, 0.25), box(0.26, 0.06, 0.08, 0.95, Y + 0.12, 0.25));
  }
  const g = p.group(ctx, `valley-asset:in-paper-reporter-desk:${v}`);
  noCast(g, m.paper, text, screen, m.brass);
  inNight(
    g,
    [
      [lm.day, lm.night],
      [lm.bulb, lm.bulbN],
      [screen, screenN],
    ],
    [-W / 2 + 0.35, -D / 2 + 0.6, 2.2, 1.5],
  );
  return g;
};

// ── in-paper-chair：椅子（正面朝 +z = 坐的人朝南）。v0 = 记者的转椅（深蓝布 + 五爪脚），v1 = 总编的高背牛血红皮椅，v2 = 访客的木椅（绿坐垫）──
const inChair: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const v = ctx.variant;
  const p = new Parts();
  if (v === 2) {
    const seat = ctx.mat('metal', { ramp: CAB });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add(m.walnut, box(0.06, 0.45, 0.06, sx * 0.22, 0, sz * 0.2));
    p.add(m.walnut, box(0.52, 0.05, 0.5, 0, 0.42, 0));
    p.add(seat, box(0.46, 0.06, 0.44, 0, 0.47, 0.01));
    for (const sx of [-1, 1]) p.add(m.walnut, box(0.06, 0.5, 0.06, sx * 0.22, 0.45, -0.22));
    p.add(m.walnut, box(0.5, 0.18, 0.05, 0, 0.72, -0.22));
  } else {
    const leather = v === 1;
    const fab = leather ? ctx.mat('clothRed', { ramp: LEATHER, edge: 0.6, convex: 0.5 }) : ctx.mat('signBoard');
    const fabF = leather ? ctx.mat('clothRed', { ramp: LEATHER, ...FRONT }) : ctx.mat('signBoard', FRONT);
    const s = leather ? 1.25 : 1;
    // 五爪脚 + 立柱
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      p.add(
        m.iron,
        box(0.3 * s, 0.05, 0.07, 0.15 * s, 0, 0)
          .rotateY(a)
          .translate(0, 0.04, 0),
      );
    }
    p.add(m.iron, cyl(0.04, 0.04, 0.36, 0, 0.05, 0, 6));
    p.add(fab, box(0.5 * s, 0.1, 0.48 * s, 0, 0.42, 0));
    const bh = leather ? 0.9 : 0.5;
    p.add(fab, box(0.48 * s, bh, 0.1, 0, 0.52, -0.22 * s));
    p.add(fabF, quad(0.4 * s, bh - 0.12, 0, 0.58, -0.22 * s + 0.051));
    if (leather) {
      // 扶手 + 靠背顶上圆一点 + 一圈铜钉（只在正面上沿：1 纹素的亮点隔一个）
      for (const sx of [-1, 1])
        p.add(fab, box(0.1, 0.2, 0.5, sx * 0.34, 0.52, 0), box(0.12, 0.05, 0.52, sx * 0.34, 0.72, 0));
      p.add(
        fab,
        new THREE.CylinderGeometry(0.3, 0.3, 0.1, 10, 1, false, -Math.PI / 2, Math.PI)
          .rotateX(Math.PI / 2)
          .translate(0, 1.42, -0.275),
      );
      for (let i = -2; i <= 2; i++) p.add(m.brass, box(T, T, 0.02, i * 0.1, 1.32, -0.21));
    }
  }
  const g = p.group(ctx, `valley-asset:in-paper-chair:${v}`);
  noCast(g, m.brass);
  return g;
};

// ── in-paper-teletype：美联社的电传打字机（1.0 × 1.1 × 0.8）：铁脚架 + 灰绿机壳（玻璃罩）+ 后面一卷纸，打出来的长纸条从前面垂到地上、折几折 ──
const inTeletype: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const hood = ctx.mat('jug', { lightUp: 0.4, noShadowReceive: true });
  const plate = ctx.mat('signBoard', WALL_FACE);
  const lettersM = ctx.mat('signPaint', WALL_FACE);
  const strip = ctx.mat('newsprint', { lightUp: 0.4, noShadowReceive: true });
  const p = new Parts();
  // 架子
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add(m.iron, box(0.07, 0.62, 0.07, sx * 0.4, 0, sz * 0.28));
  p.add(m.iron, box(0.9, 0.06, 0.66, 0, 0.6, 0));
  // 机壳：下半截 + 斜的玻璃罩 + 后面的纸卷
  p.add(m.cab, box(0.86, 0.26, 0.6, 0, 0.66, 0));
  p.add(m.cabFront, quad(0.8, 0.22, 0, 0.68, 0.302));
  p.add(hood, box(0.7, 0.18, 0.36, 0, 0.92, 0.04));
  p.add(m.cab, box(0.86, 0.06, 0.2, 0, 0.92, -0.2));
  p.add(m.paper, new THREE.CylinderGeometry(0.11, 0.11, 0.6, 10).rotateZ(Math.PI / 2).translate(0, 1.08, -0.2));
  // 铭牌（深蓝底 + 一条字）
  p.add(plate, quad(0.3, ROW * 2, -0.25, 0.71, 0.31));
  p.add(lettersM, quad(0.2, ROW * 0.6, -0.25, 0.71 + ROW * 0.7, 0.315));
  // 纸条：从罩子前沿出来，搭过前面垂到地上，地上折三折
  p.add(strip, box(0.36, 0.02, 0.2, 0.1, 1.1, 0.16));
  p.add(strip, quad(0.36, 1.08, 0.1, 0.02, 0.33));
  for (let i = 0; i < 3; i++)
    p.add(strip, box(0.36, 0.03, 0.34, 0.1 + (i % 2) * 0.05, 0.02 + i * 0.035, 0.52 + i * 0.03));
  const g = p.group(ctx, 'valley-asset:in-paper-teletype');
  noCast(g, plate, lettersM, strip);
  return g;
};

// ── in-paper-water-cooler：饮水机（0.5 × 1.4 × 0.5）：奶油色机身 + 倒扣的蓝水桶 + 侧面一摞纸杯 + 红蓝两个龙头 ──
const inWaterCooler: AssetFn = (ctx) => {
  const body = ctx.mat('pvc');
  const bodyF = ctx.mat('pvc', FRONT);
  const water = ctx.mat('jug', { sphereNormals: [0, 1.25, 0] });
  const red = ctx.mat('clothRed', { noShadowReceive: true });
  const blue = ctx.mat('clothBlue', { noShadowReceive: true });
  const p = new Parts();
  p.add(body, box(0.4, 0.95, 0.4, 0, 0, 0));
  p.add(bodyF, quad(0.34, 0.6, 0, 0.1, 0.202));
  p.add(ctx.mat('ironwork', { noShadowReceive: true }), box(0.24, 0.05, 0.12, 0, 0.62, 0.22));
  p.add(red, box(T, T, 0.06, -0.06, 0.78, 0.22));
  p.add(blue, box(T, T, 0.06, 0.06, 0.78, 0.22));
  p.add(
    water,
    cyl(0.06, 0.06, 0.06, 0, 0.95, 0, 8),
    new THREE.CylinderGeometry(0.16, 0.16, 0.36, 12).translate(0, 1.19, 0),
    new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.37, 0),
  );
  p.add(ctx.mat('newsprint', { noShadowReceive: true }), cyl(0.04, 0.05, 0.3, 0.24, 0.5, 0, 8));
  const g = p.group(ctx, 'valley-asset:in-paper-water-cooler');
  noCast(g, red, blue);
  return g;
};

// ── in-paper-glass-office：总编室的玻璃隔断。原点 = 南边门洞的中心（世界 15.8, 7.8），南边一段本地 x −4.2…4.2，西边一段 x −4.2、z −7.8…0。
// 1 米高的胡桃木裙板 + 立柱 + 顶框（2.5 米）；玻璃不画实面，只画两条斜的反光（看得进去）；门西边那段裙板上一行金字 "EDITOR"
// （字放在裙板上、不放门楣：门楣 2.5 米以上在画面上正好盖住总编的桌子）；门往里开着 ──
const inGlassOffice: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const glare = ctx.mat('jug', { ...WALL_FACE, lightUp: 0.8, bands: [-0.8, -0.4] });
  const gold = ctx.mat('flowerYellow', { ...WALL_FACE, ramp: [0xffd860, 0xf0b440, 0x9a6a5a] });
  const p = new Parts();
  const X0 = -4.2;
  const X1 = 4.2;
  const ZW = -7.8;
  const DG = 0.6; // 门洞半宽
  const BH = 1.0;
  const TH = 2.5;
  // 南边：裙板（门洞两边）
  const southSegs: [number, number][] = [
    [X0, -DG],
    [DG, X1],
  ];
  for (const [a, b] of southSegs) {
    p.add(m.walnut, box(b - a, BH, 0.08, (a + b) / 2, 0, 0));
    p.add(m.walnutFront, quad(b - a, BH - 0.1, (a + b) / 2, 0.05, 0.041));
    p.add(m.walnut, box(b - a, 0.06, 0.14, (a + b) / 2, BH, 0));
  }
  // 西边：裙板（侧着看，只看得到顶上的压条和一条边）
  p.add(m.walnut, box(0.08, BH, -ZW, X0, 0, ZW / 2));
  p.add(m.walnut, box(0.14, 0.06, -ZW, X0, BH, ZW / 2));
  // 顶框：南边一整条（过门洞）、西边一整条
  p.add(m.walnut, box(X1 - X0, 0.12, 0.12, 0, TH - 0.12, 0));
  p.add(m.walnut, box(0.12, 0.12, -ZW, X0, TH - 0.12, ZW / 2));
  // 立柱：南边每 ~1.3 米一根（含门框两根、两头），西边每 ~1.6 米
  const posts = [X0, -2.9, -1.75, -DG, DG, 1.8, 3.0, X1];
  // 两头和门框的立柱落地；中间的只是玻璃的竖框（从裙板顶上起）
  for (const x of posts) {
    const full = x === X0 || x === X1 || Math.abs(x) === DG;
    p.add(m.walnut, full ? box(0.12, TH, 0.12, x, 0, 0) : box(0.1, TH - BH, 0.1, x, BH, 0));
  }
  for (let z = ZW; z < 0; z += 1.56) p.add(m.walnut, box(0.12, TH, 0.12, X0, 0, z));
  // 反光：每格玻璃两条斜的亮条（一宽一窄），朝南
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i];
    const b = posts[i + 1];
    if (a === -DG) continue; // 门洞
    const w = b - a;
    for (const [off, bw] of [
      [0.25, T * 2],
      [0.5, T],
    ] as const) {
      const sh = new THREE.Shape();
      const x = a + 0.1 + off * (w - 0.6);
      const y0 = BH + 0.2;
      const y1 = TH - 0.35;
      const lean = (y1 - y0) * 0.45;
      sh.moveTo(x, y0);
      sh.lineTo(x + bw, y0);
      sh.lineTo(x + bw + lean, y1);
      sh.lineTo(x + lean, y1);
      sh.lineTo(x, y0);
      p.add(glare, new THREE.ShapeGeometry(sh).translate(0, 0, 0.01));
    }
  }
  // 门西边那段裙板上的金字 EDITOR（字高 7 行 = 0.89 米，裙板 1 米）
  {
    const t = 'EDITOR';
    const tw = t.length * CH - T;
    p.add(gold, ...inText(t, (X0 - DG) / 2 - tw / 2, 0.05, 0.046));
  }
  // 门：往里开 ~60°（铰链在门洞西边），下半木板、上半玻璃（框 + 一条反光）、铜把手
  {
    const door = new Parts();
    const dw = 2 * DG - 0.12;
    door.add(m.walnut, box(dw, BH, 0.05, dw / 2, 0, 0), box(dw, 0.1, 0.05, dw / 2, TH - 0.22, 0));
    door.add(m.walnut, box(0.08, TH - 0.12, 0.05, 0.04, 0, 0), box(0.08, TH - 0.12, 0.05, dw - 0.04, 0, 0));
    door.add(glare, quad(T, 0.9, dw * 0.45, BH + 0.3, 0.03));
    door.add(m.brass, box(0.1, 0.06, 0.08, dw - 0.14, 1.0, 0.04));
    for (const [g, mt] of door.list) {
      g.rotateY(Math.PI / 3);
      g.translate(-DG + 0.06, 0, -0.04);
      p.add(mt, g);
    }
  }
  const g = p.group(ctx, 'valley-asset:in-paper-glass-office');
  noCast(g, glare, gold, m.brass);
  return g;
};

// ── in-paper-bookshelf：总编室的书架（3.6 × 2.3 × 0.6）：胡桃木、五层书（几段同色），一层摆着铜奖杯和一个地球仪 ──
const inBookshelf: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const rnd = ctx.rng('in-paper-bookshelf');
  const books = [
    ctx.mat('clothRed', { ...FRONT, ramp: LEATHER }),
    ctx.mat('signBoard', FRONT),
    ctx.mat('metal', { ramp: CAB, ...FRONT }),
    ctx.mat('newsprint', { ...FRONT, ramp: OLDPAPER }),
    ctx.mat('sunEnamel', FRONT),
  ];
  const back = ctx.mat('wood', { ramp: [0x6a4050, 0x4e3048, 0x2e2240], noShadowReceive: true });
  const globe = ctx.mat('jug', { sphereNormals: [1.25, 2.52, 0], edge: 0.5, convex: 0.3 });
  const p = new Parts();
  const W = 3.6;
  const H = 2.3;
  const D = 0.5;
  p.add(back, box(W, H, 0.04, 0, 0, -D / 2 + 0.02));
  for (const x of [-W / 2 + 0.05, 0, W / 2 - 0.05]) p.add(m.walnutFront, box(0.1, H, D, x, 0, 0));
  p.add(m.walnut, box(W + 0.08, 0.08, D + 0.06, 0, H - 0.08, 0));
  const ys = [0.12, 0.56, 1.0, 1.44, 1.86];
  for (const y of ys) p.add(m.walnut, box(W - 0.1, 0.05, D, 0, y - 0.05, 0));
  ys.forEach((y, i) => {
    const t = (ys[i + 1] ?? H - 0.08) - 0.05;
    for (const [a, b] of [
      [-W / 2 + 0.1, -0.05],
      [0.05, W / 2 - 0.1],
    ] as const) {
      if (i === 2 && a > 0) {
        // 奖杯（铜杯 + 木座）
        p.add(m.walnut, box(0.26, 0.1, 0.2, 0.9, y, 0));
        p.add(m.brass, cyl(0.04, 0.04, 0.12, 0.9, y + 0.1, 0, 6), cyl(0.05, 0.13, 0.18, 0.9, y + 0.22, 0, 10));
        bookRun(p, rnd, books, 1.2, b, y, t - y - 0.04, D - 0.12, 0.02);
        continue;
      }
      bookRun(p, rnd, books, a, b, y, t - y - 0.04, D - 0.12, 0.02);
    }
  });
  // 书架顶上：地球仪
  p.add(m.brass, cyl(0.12, 0.08, 0.06, 1.25, H, 0, 8), box(T, 0.12, T, 1.25, H + 0.06, 0));
  p.add(globe, new THREE.SphereGeometry(0.2, 12, 8).translate(1.25, H + 0.22 + 0.0, 0));
  const g = p.group(ctx, 'valley-asset:in-paper-bookshelf');
  noCast(g, back);
  return g;
};

// ── in-paper-editor-desk：总编的胡桃木大办公桌（2.8 × 0.78 × 1.3）。总编坐北朝南，访客在南边（镜头这边）。
// 两个抽屉柜 + 正面的挡板（金色名牌）；桌上：绿皮桌垫、样张（红笔圈的广告位，P1）、银行家台灯、黑色转盘电话、收发文筐、一摞稿子、烟斗缸 ──
const inEditorDesk: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const lm = lampMats(ctx, BANKER);
  const top = ctx.mat('wood', {
    ramp: WALNUT,
    tones: WALNUT_T,
    elem: { kind: 'planks', p: [1, 0, 0, 0.35], seam: 1, hi: 0.5 },
  });
  const blotter = ctx.mat('metal', {
    ramp: [0x5aa47a, 0x3a7a66, 0x22485a],
    edge: 0.1,
    convex: 0,
    noShadowReceive: true,
  });
  const proof = ctx.mat('newsprint', { noShadowReceive: true });
  const proofInk = ctx.mat('ironwork', { noShadowReceive: true, ramp: [0x8a86a0, 0x6a6688, 0x3a3858] });
  const red = ctx.mat('clothRed', { noShadowReceive: true, ramp: [0xff4a3a, 0xd83442, 0x7a2048] });
  const p = new Parts();
  const W = 2.8;
  const D = 1.3;
  const Y = 0.74;
  p.add(top, box(W, 0.05, D, 0, Y, 0));
  p.add(m.walnut, box(W + 0.04, 0.03, D + 0.04, 0, Y - 0.03, 0));
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.4);
    p.add(m.walnut, box(0.74, Y - 0.03, D - 0.08, x, 0, 0));
    for (let i = 0; i < 3; i++) {
      p.add(m.walnutFront, quad(0.62, 0.2, x, 0.06 + i * 0.22, D / 2 - 0.035));
      p.add(m.brass, box(0.16, ROW * 0.6, 0.03, x, 0.17 + i * 0.22, D / 2 - 0.02));
    }
  }
  // 正面挡板（两个柜子中间，往里退 0.1）+ 名牌（黑底铜字条）
  p.add(m.walnut, box(W - 1.6, Y - 0.15, 0.05, 0, 0.12, D / 2 - 0.12));
  p.add(m.walnutFront, quad(W - 1.7, Y - 0.25, 0, 0.17, D / 2 - 0.09));
  p.add(m.iron, box(0.5, 0.1, 0.1, 0, Y + 0.05, D / 2 - 0.12));
  p.add(m.brassFace, quad(0.4, ROW * 0.6, 0, Y + 0.08, D / 2 - 0.065));
  // 桌垫（总编那边）+ 样张（P1：红笔一圈）
  p.add(blotter, flat(1.2, 0.6, -0.1, Y + 0.056, -0.2));
  {
    const sx = -0.5;
    const sz = -0.05;
    const s = new Parts();
    s.add(proof, flat(0.5, 0.66, 0, 0, 0));
    s.add(
      proofInk,
      flat(0.4, ROW, 0, 0.003, -0.25),
      flat(0.18, 0.22, -0.1, 0.003, -0.03),
      flat(0.14, 0.09, 0.12, 0.003, 0.0),
    );
    s.add(proofInk, flat(0.16, 0.06, 0.12, 0.003, 0.12), flat(0.36, 0.06, 0.0, 0.003, 0.24));
    s.add(
      red,
      new THREE.RingGeometry(0.1, 0.1 + T, 14)
        .rotateX(-Math.PI / 2)
        .scale(1.3, 1, 1)
        .translate(0.1, 0.006, 0.17),
    );
    for (const [g, mt] of s.list) p.add(mt, g.rotateY(0.18).translate(sx, Y + 0.062, sz));
    p.add(
      red,
      box(0.16, 0.025, 0.025, 0, 0, 0)
        .rotateY(-0.7)
        .translate(sx + 0.38, Y + 0.06, sz + 0.12),
    );
  }
  // 台灯（东北角）、电话（西北角）、收发文筐（东边，两层）、一摞稿子、烟斗缸
  bankerLamp(p, m, lm, 0.95, Y + 0.05, -0.38);
  p.add(m.iron, box(0.26, 0.1, 0.24, -1.05, Y + 0.05, -0.3), box(0.3, 0.07, 0.09, -1.05, Y + 0.15, -0.3));
  p.add(m.walnut, box(0.38, 0.08, 0.3, 0.55, Y + 0.05, 0.1), box(0.38, 0.08, 0.3, 0.55, Y + 0.17, 0.1));
  p.add(m.paper, box(0.32, 0.04, 0.26, 0.55, Y + 0.1, 0.1), box(0.32, 0.03, 0.26, 0.55, Y + 0.23, 0.1));
  p.add(
    m.paper,
    box(0.34, 0.14, 0.27, 0, 0, 0)
      .rotateY(-0.2)
      .translate(1.1, Y + 0.05, 0.15),
  );
  p.add(ctx.mat('jug'), cyl(0.09, 0.09, 0.04, 0.2, Y + 0.05, 0.38, 10));
  const g = p.group(ctx, 'valley-asset:in-paper-editor-desk');
  noCast(g, blotter, proof, proofInk, red, m.brass, m.brassFace);
  inNight(
    g,
    [
      [lm.day, lm.night],
      [lm.bulb, lm.bulbN],
    ],
    [0.4, 0.5, 2.8, 1.8],
  );
  return g;
};

/** 一张旧报（朝 +z 的平面上）：中心 x、底 y、宽 w、高 h；报头一条、标题粗条、照片块、几列字；yellow 越大越黄 */
function oldPage(
  p: Parts,
  mats: { page: THREE.Material; ink: THREE.Material; photo: THREE.Material; line: THREE.Material },
  rnd: () => number,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  photo?: (px: number, py: number, pw: number, ph: number) => void,
) {
  p.add(mats.page, quad(w, h, x, y, z));
  const l = x - w / 2 + 0.07;
  const r = x + w / 2 - 0.07;
  const top = y + h - 0.08;
  // 报头（两行粗，比版心窄一点、居中）+ 空一行 + 大标题（一行，长短不一）
  p.add(mats.ink, quad((r - l) * 0.86, ROW * 2, x, top - ROW * 2, z + 0.004));
  const hl = 0.6 + rnd() * 0.3;
  p.add(mats.ink, quad((r - l) * hl, ROW, l + ((r - l) * hl) / 2, top - ROW * 4, z + 0.004));
  // 照片（左边一块）+ 右边、下面几列字（1 行的灰线，每两行一条）
  const pw = (r - l) * 0.55;
  const ph = h * 0.32;
  const py = top - ROW * 6 - ph;
  p.add(mats.photo, quad(pw, ph, l + pw / 2, py, z + 0.004));
  photo?.(l + pw / 2, py, pw, ph);
  for (let yy = top - ROW * 6; yy > y + 0.08; yy -= ROW * 2) {
    if (yy > py - ROW) p.add(mats.line, quad(r - l - pw - 0.05, ROW * 0.5, r - (r - l - pw - 0.05) / 2, yy, z + 0.004));
    else {
      const cw = (r - l - 0.05) / 2;
      p.add(mats.line, quad(cw * (0.8 + rnd() * 0.2), ROW * 0.5, l + cw / 2, yy, z + 0.004));
      p.add(mats.line, quad(cw * (0.7 + rnd() * 0.3), ROW * 0.5, r - cw / 2, yy, z + 0.004));
    }
  }
}

// ── in-paper-history-wall：从西墙伸出来的一段展墙（4.6 × 2.6 × 0.3），朝南那面挂一排旧报（P3）：
// 最西边一框最大、金框 = 1960 年俱乐部开张那天（照片里是新球场和一棵棕榈），下面一块铜牌、上面一盏画灯（夜里亮）；另外三框黑框、纸一张比一张白 ──
const inHistoryWall: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const rnd = ctx.rng('in-paper-history-wall');
  const wains = ctx.mat('wood', {
    ramp: WALNUT,
    tones: WALNUT_T,
    ...WALL_FACE,
    elem: { kind: 'planks', p: [1, 0, 0, 1.15], seam: 1, hi: 0.6 },
  });
  const cream = ctx.mat('stucco', {
    tones: GREEN_T,
    ramp: GREEN_RAMP,
    ...WALL_FACE,
    elem: { kind: 'stones', size: [26, 14], seam: 0, hi: 0 },
    toneW: [0.3, 0.3],
  });
  const body = ctx.mat('stucco', { tones: GREEN_T, ramp: GREEN_RAMP });
  // 旧报的纸、字、线：暖色（kraft 那组调色，不被调成灰），字和纸的亮度差 < 60（强边缘预算）；纸一张比一张白（1960 最黄）
  const frameDark = ctx.mat('wood', { ramp: WALNUT, ...WALL_FACE });
  const gilt = ctx.mat('flowerYellow', { ...WALL_FACE, ramp: [0xffd860, 0xf0b440, 0x9a6a5a] });
  const ink = ctx.mat('kraft', { ...WALL_FACE, ramp: [0xc49a7c, 0xb08a70, 0x6a5068] });
  const line = ctx.mat('kraft', { ...WALL_FACE, ramp: [0xdcbc94, 0xc8a882, 0x7a6278] });
  const pages = [
    ctx.mat('kraft', { ...WALL_FACE, ramp: [0xf4cc8a, 0xe0b878, 0x8a6a7c] }),
    ctx.mat('kraft', { ...WALL_FACE, ramp: [0xf6dca4, 0xe2c690, 0x8a7282] }),
    ctx.mat('kraft', { ...WALL_FACE, ramp: [0xf8e8c0, 0xe8d4a8, 0x8a7a8c] }),
    ctx.mat('kraft', { ...WALL_FACE, ramp: [0xfaf2e0, 0xece4d0, 0x8a8296] }),
  ];
  const photo = ctx.mat('kraft', { ...WALL_FACE, ramp: [0xc49c76, 0xa8866a, 0x5e4a5a] });
  const photoLt = ctx.mat('kraft', { ...WALL_FACE, ramp: [0xe0be8a, 0xc09a74, 0x6a5266] });
  const photoDk = ctx.mat('kraft', { ...WALL_FACE, ramp: [0x7a5a48, 0x5e4440, 0x3a2c40] });
  const lm = lampMats(ctx, [0xffd860, 0xf0b440, 0x9a6a5a], 'flowerYellow');
  const p = new Parts();
  const W = 4.6;
  const H = 2.6;
  const Z = 0.15;
  p.add(body, box(W, H, 0.3, 0, 0, 0));
  p.add(m.walnut, box(W + 0.06, 0.1, 0.36, 0, H, 0));
  p.add(wains, quad(W, 1.0, 0, 0, Z + 0.01));
  p.add(m.walnut, box(W, 0.1, 0.08, 0, 1.0, Z + 0.03));
  p.add(cream, quad(W, H - 1.1, 0, 1.1, Z + 0.01));
  // 1960（最大、金框）：中心 x −1.15
  {
    const x = -1.15;
    const w = 1.1;
    const h = 1.32;
    const y = 1.18;
    p.add(gilt, box(w + 0.14, h + 0.14, 0.05, x, y - 0.07, Z + 0.035));
    oldPage(p, { page: pages[0], ink, photo, line }, rnd, x, y, w, h, Z + 0.065, (px, py, pw, ph) => {
      // 照片：新球场（浅色一块 + 一条深的网）+ 一棵棕榈（深色竖干 + 一团冠）+ 地平线
      p.add(photoLt, quad(pw * 0.7, ph * 0.35, px + pw * 0.08, py + ph * 0.12, Z + 0.07));
      p.add(photoDk, quad(pw * 0.7, ROW * 0.6, px + pw * 0.08, py + ph * 0.28, Z + 0.072));
      p.add(photoDk, quad(T, ph * 0.55, px - pw * 0.34, py + ph * 0.25, Z + 0.072));
      p.add(photoDk, quad(T * 3, ROW * 1.5, px - pw * 0.34, py + ph * 0.75, Z + 0.072));
    });
    // 铜牌 + 画灯
    p.add(m.brassFace, quad(0.4, ROW * 1.2, x, y - 0.32, Z + 0.02));
    p.add(m.brass, box(0.06, 0.06, 0.24, x, y + h + 0.2, Z + 0.12));
    p.add(lm.day, box(0.5, 0.1, 0.12, x, y + h + 0.14, Z + 0.26));
    p.add(lm.bulb, box(0.42, T * 0.5, 0.08, x, y + h + 0.12, Z + 0.26));
  }
  // 另外三框（黑框）
  const xs = [-0.05, 0.9, 1.85];
  xs.forEach((x, i) => {
    const w = 0.78;
    const h = 0.98;
    const y = 1.36 + (i === 1 ? 0.06 : 0);
    p.add(frameDark, box(w + 0.1, h + 0.1, 0.05, x, y - 0.05, Z + 0.035));
    oldPage(p, { page: pages[i + 1], ink, photo, line }, rnd, x, y, w, h, Z + 0.065);
  });
  const g = p.group(ctx, 'valley-asset:in-paper-history-wall');
  noCast(g, gilt, frameDark, ink, line, photo, photoLt, photoDk, ...pages, m.brassFace, lm.day, lm.bulb);
  inNight(
    g,
    [
      [lm.day, lm.night],
      [lm.bulb, lm.bulbN],
    ],
    [-0.6, 1.6, 2.6, 2.9],
  );
  return g;
};

// ── in-paper-front-counter：前台（6.2 × 1.1 × 1.0）。客人在南边（镜头这边）：高的台面（0.35 深、1.1 高）在南沿，里面是 0.76 的工作台面。
// 正面竖条木板 + 正中一个太阳徽；台上：铜铃、一摞今天的报纸、登广告的单子、绿罩台灯、电话、一瓶黄花 ──
const inFrontCounter: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const lm = lampMats(ctx, BANKER);
  const slats = ctx.mat('wood', {
    ramp: WALNUT,
    tones: WALNUT_T,
    ...FRONT,
    elem: { kind: 'planks', p: [1, 0, 0, 0.27], seam: 1, hi: 0.5 },
  });
  const topM = ctx.mat('counterTop');
  const sunO = ctx.mat('sunEnamel', WALL_FACE);
  const sunI = ctx.mat('sunEnamel', { ...WALL_FACE, bands: [-0.9, -0.5] });
  const mast = ctx.mat('signBoard', { noShadowReceive: true });
  const flowers = ctx.mat('flowerYellow', { sphereNormals: [2.5, 1.48, -0.05], lightUp: 0.3 });
  const p = new Parts();
  const W = 6.2;
  const D = 1.0;
  // 外壳
  p.add(m.walnut, box(W, 1.04, 0.3, 0, 0, D / 2 - 0.15));
  p.add(m.walnut, box(0.12, 0.74, D - 0.3, -W / 2 + 0.06, 0, -0.15), box(0.12, 0.74, D - 0.3, W / 2 - 0.06, 0, -0.15));
  p.add(slats, quad(W - 0.1, 0.92, 0, 0.1, D / 2 + 0.005));
  p.add(m.walnut, box(W, 0.1, 0.06, 0, 0, D / 2)); // 踢脚
  // 高台面（南沿，往外挑）+ 工作台面（北边）
  p.add(topM, box(W + 0.1, 0.06, 0.42, 0, 1.04, D / 2 - 0.16));
  p.add(topM, box(W - 0.24, 0.05, D - 0.36, 0, 0.72, -0.16));
  // 太阳徽（正面正中）
  {
    const s = sunGeo(0.32, 0, 0.58, D / 2 + 0.01, 10);
    p.add(sunO, ...s.outer).add(sunI, ...s.inner);
  }
  // 高台面上：铜铃、今天的报纸（一摞，最上面一张报头深蓝）、广告单子
  p.add(
    m.brass,
    cyl(0.08, 0.08, 0.02, 1.4, 1.1, D / 2 - 0.15, 10),
    new THREE.SphereGeometry(0.07, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(1.4, 1.12, D / 2 - 0.15),
  );
  p.add(m.paper, box(0.5, 0.12, 0.34, -2.2, 1.1, D / 2 - 0.16));
  p.add(mast, flat(0.44, 0.08, -2.2, 1.225, D / 2 - 0.27));
  p.add(m.paper, flat(0.26, 0.3, -0.6, 1.105, D / 2 - 0.16), flat(0.26, 0.3, -0.25, 1.106, D / 2 - 0.15));
  p.add(m.iron, box(0.14, 0.02, 0.02, -0.4, 1.11, D / 2 - 0.08));
  // 工作台面上：台灯、电话、一摞稿子、一瓶黄花（布里托灌木的花）
  bankerLamp(p, m, lm, -1.2, 0.77, -0.3);
  p.add(m.iron, box(0.26, 0.1, 0.24, 0.5, 0.77, -0.25), box(0.3, 0.07, 0.09, 0.5, 0.87, -0.25));
  p.add(m.paper, box(0.34, 0.1, 0.26, -0.3, 0.77, -0.3));
  p.add(ctx.mat('pot'), cyl(0.07, 0.09, 0.3, 2.5, 0.77, -0.05, 8));
  p.add(flowers, new THREE.SphereGeometry(0.2, 10, 6).scale(1.2, 0.8, 1).translate(2.5, 1.18, -0.05));
  const g = p.group(ctx, 'valley-asset:in-paper-front-counter');
  noCast(g, sunO, sunI, mast, m.paper, m.brass);
  inNight(
    g,
    [
      [lm.day, lm.night],
      [lm.bulb, lm.bulbN],
    ],
    [-0.8, 0.4, 2.6, 1.6],
  );
  return g;
};

// ── in-paper-news-rack：今天的报纸架（1.6 × 1.2 × 0.5，门边）：木架三层斜板，每层两份摊开的报（报头深蓝、标题、照片），底下一捆 ──
const inNewsRack: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const rnd = ctx.rng('in-paper-news-rack');
  const page = ctx.mat('newsprint', { lightUp: 0.4, noShadowReceive: true });
  const mast = ctx.mat('signBoard', { lightUp: 0.4, noShadowReceive: true });
  const ink = ctx.mat('ironwork', { lightUp: 0.4, noShadowReceive: true });
  const photo = ctx.mat('jug', { lightUp: 0.4, noShadowReceive: true, ramp: [0x9ab4c4, 0x7890a8, 0x4a5a7a] });
  const p = new Parts();
  for (const sx of [-1, 1]) p.add(m.walnut, box(0.08, 1.2, 0.48, sx * 0.76, 0, 0));
  for (let i = 0; i < 3; i++) {
    const y = 0.32 + i * 0.36;
    const z = 0.12 - i * 0.12;
    const sh = new Parts();
    sh.add(m.walnut, box(1.44, 0.04, 0.34, 0, 0, 0));
    for (const x of [-0.36, 0.36]) {
      sh.add(page, box(0.6, 0.02, 0.32, x, 0.04, 0));
      sh.add(mast, flat(0.52, 0.06, x, 0.065, -0.1));
      sh.add(ink, flat(0.4 + rnd() * 0.1, 0.05, x - 0.03, 0.065, -0.02));
      sh.add(photo, flat(0.24, 0.12, x - 0.12, 0.065, 0.08));
    }
    sh.add(m.walnut, box(1.44, 0.08, 0.03, 0, 0.02, 0.17));
    for (const [g, mt] of sh.list) p.add(mt, g.rotateX(0.5).translate(0, y, z));
  }
  p.add(m.paper, box(1.0, 0.22, 0.36, 0, 0, 0.02));
  p.add(m.iron, box(T, 0.23, 0.37, -0.2, 0, 0.02), box(T, 0.23, 0.37, 0.2, 0, 0.02));
  const g = p.group(ctx, 'valley-asset:in-paper-news-rack');
  noCast(g, page, mast, ink, photo);
  return g;
};

// ── in-paper-bench：等候的长椅（2.2 × 0.9 × 0.7，正面朝 +z）：胡桃木框 + 太阳橙的坐垫 + 靠背；一头放着两本杂志 ──
const inBench: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const cushion = ctx.mat('clothRed', { ramp: LEATHER, edge: 0.5, convex: 0.4 });
  const cushionF = ctx.mat('clothRed', { ramp: LEATHER, ...FRONT });
  const p = new Parts();
  for (const sx of [-1, 1]) {
    p.add(m.walnut, box(0.08, 0.62, 0.6, sx * 1.04, 0, 0));
    p.add(m.walnut, box(0.1, 0.06, 0.64, sx * 1.04, 0.62, 0));
  }
  p.add(m.walnut, box(2.0, 0.08, 0.56, 0, 0.32, 0));
  p.add(cushion, box(1.96, 0.1, 0.52, 0, 0.4, 0.02));
  p.add(cushionF, quad(1.9, 0.08, 0, 0.41, 0.285));
  p.add(m.walnut, box(2.0, 0.42, 0.06, 0, 0.48, -0.27));
  p.add(cushion, box(1.9, 0.3, 0.06, 0, 0.54, -0.22));
  p.add(ctx.mat('clothBlue'), box(0.3, 0.02, 0.36, 0, 0, 0).rotateY(0.3).translate(0.72, 0.5, 0.05));
  p.add(m.paper, box(0.3, 0.02, 0.36, 0, 0, 0).rotateY(-0.2).translate(0.75, 0.52, 0.07));
  const g = p.group(ctx, 'valley-asset:in-paper-bench');
  return g;
};

// ── in-paper-plant：盆栽。v0 = 琴叶榕（陶盆 + 细干 + 几团大叶，1.7 高），v1 = 金琥（釉盆里一个大圆仙人掌、顶上一圈黄刺，1.0 高）──
const inPlant: AssetFn = (ctx) => {
  const p = new Parts();
  const pot = ctx.mat('pot');
  if (ctx.variant === 1) {
    const glaze = ctx.mat('jug', { ramp: [0x5aa8c8, 0x3a78a8, 0x2a447a] });
    p.add(glaze, cyl(0.28, 0.36, 0.5, 0, 0, 0, 12));
    p.add(ctx.mat('path'), cyl(0.33, 0.33, 0.02, 0, 0.48, 0, 12));
    p.add(
      ctx.mat('cactus', { sphereNormals: [0, 0.72, 0], noise: 0.2 }),
      new THREE.SphereGeometry(0.32, 12, 8).scale(1, 0.85, 1).translate(0, 0.72, 0),
    );
    p.add(ctx.mat('flowerYellow', { lightUp: 0.3 }), cyl(0.12, 0.1, 0.06, 0, 0.98, 0, 8));
  } else {
    p.add(pot, cyl(0.24, 0.32, 0.5, 0, 0, 0, 12));
    p.add(ctx.mat('path'), cyl(0.3, 0.3, 0.02, 0, 0.48, 0, 12));
    p.add(ctx.mat('branch'), box(0.08, 0.8, 0.08, 0, 0.48, 0));
    const leaf = ctx.mat('olive', { lightUp: 0.4, noise: 0.3, elem: { kind: 'leaves', size: [2.4, 2.4], hi: 0.15 } });
    const blobs: [number, number, number, number][] = [
      [0, 1.42, 0, 0.32],
      [-0.24, 1.18, 0.06, 0.26],
      [0.25, 1.24, -0.04, 0.27],
      [0.06, 1.0, 0.18, 0.22],
    ];
    for (const [x, y, z, r] of blobs) {
      const s = new THREE.SphereGeometry(r, 10, 7).translate(x, y, z);
      p.add(leaf, s);
    }
  }
  const g = p.group(ctx, `valley-asset:in-paper-plant:${ctx.variant}`);
  return g;
};

// ── in-paper-piles：地上的纸。v0 = 两捆报 + 一个档案盒（前台边上），v1 = 两摞散稿子（电传机边上，歪着）──
const inPaperStack: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const rnd = ctx.rng(`in-paper-piles:${ctx.variant}`);
  const twine = ctx.mat('ironwork', { noShadowReceive: true });
  const side = ctx.mat('newsprint', { lightUp: 0.35, bands: [-0.2, 0.35], noShadowReceive: true });
  const p = new Parts();
  if (ctx.variant === 1) {
    for (const [x, z, n] of [
      [-0.18, 0, 5],
      [0.2, 0.08, 3],
    ] as const) {
      let y = 0;
      for (let i = 0; i < n; i++) {
        const h = 0.06 + rnd() * 0.04;
        p.add(
          m.paper,
          box(0.36, h, 0.28, 0, 0, 0)
            .rotateY((rnd() - 0.5) * 0.5)
            .translate(x, y, z),
        );
        y += h;
      }
    }
  } else {
    for (const [x, y, z, r] of [
      [-0.2, 0, 0, 0.1],
      [0.22, 0, 0.05, -0.15],
      [0, 0.26, 0.02, 0.3],
    ] as const) {
      const s = new Parts();
      s.add(m.paper, box(0.42, 0.26, 0.32, 0, 0, 0));
      s.add(side, quad(0.42, 0.24, 0, 0.01, 0.162));
      s.add(twine, flat(T, 0.33, 0, 0.262, 0), quad(T, 0.26, 0, 0, 0.165));
      for (const [g, mt] of s.list) p.add(mt, g.rotateY(r).translate(x, y, z));
    }
    p.add(ctx.mat('kraft'), box(0.4, 0.3, 0.3, 0, 0, 0).rotateY(0.1).translate(0.18, 0, -0.32));
  }
  const g = p.group(ctx, `valley-asset:in-paper-piles:${ctx.variant}`);
  noCast(g, twine, side);
  return g;
};

// ── in-paper-coat-rack：衣帽架（胡桃木立柱 + 三脚 + 顶上的挂钩）：挂着总编的风衣，顶上一顶礼帽 ──
const inCoatRack: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const coat = ctx.mat('straw', { ramp: [0xe0b880, 0xb08a6a, 0x5e4a6e], edge: 0.6, convex: 0.3 });
  const hat = ctx.mat('hair', { ramp: [0x6a5a5a, 0x4a3c48, 0x2a2436] });
  const p = new Parts();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    p.add(m.walnut, box(0.4, 0.06, 0.08, 0.2, 0, 0).rotateY(a));
  }
  p.add(m.walnut, box(0.12, 1.85, 0.12, 0, 0, 0));
  p.add(m.walnut, cyl(0.1, 0.06, 0.12, 0, 1.85, 0, 8));
  // 风衣：挂在西南的钩上，一个上窄下宽的长条（肩 + 下摆）
  p.add(coat, cyl(0.26, 0.16, 1.05, 0, 0, 0, 8).scale(1, 1, 0.6).translate(-0.08, 0.6, 0.14));
  // 礼帽：帽檐 + 帽身
  p.add(hat, cyl(0.22, 0.22, 0.03, 0.05, 1.86, 0, 12), cyl(0.13, 0.12, 0.15, 0.05, 1.89, 0, 10));
  const g = p.group(ctx, 'valley-asset:in-paper-coat-rack');
  return g;
};

// ── in-paper-fan：落地摇头扇（1960 年代的，0.6 × 1.45 × 0.5）：铁圆座 + 立杆 + 橄榄绿电机 + 一圈浅色护网（实心圆面）里三片深色扇叶，朝南偏一点 ──
// （屋顶拆掉以后吊扇没处挂 —— 挂在半空是"浮空"，所以编辑部用落地扇）
const inFan: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const cage = ctx.mat('pvc', { lightUp: 0.5, bands: [-0.4, 0.3], noShadowReceive: true });
  const blade = ctx.mat('metal', { ramp: CAB, lightUp: 0.5, bands: [-0.4, 0.3], noShadowReceive: true });
  const hub = ctx.mat('ironwork', { noShadowReceive: true });
  const p = new Parts();
  p.add(m.iron, cyl(0.26, 0.24, 0.05, 0, 0, 0, 12));
  p.add(m.iron, box(0.07, 1.05, 0.07, 0, 0.05, 0));
  p.add(m.cab, box(0.2, 0.2, 0.26, 0, 1.06, -0.08));
  const head = new Parts();
  head.add(cage, new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16).rotateX(Math.PI / 2));
  head.add(m.cab, new THREE.RingGeometry(0.27, 0.3, 16).translate(0, 0, 0.027));
  for (let i = 0; i < 3; i++) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.04);
    sh.lineTo(0.09, 0.2);
    sh.lineTo(-0.05, 0.25);
    sh.lineTo(0, 0.04);
    head.add(blade, new THREE.ShapeGeometry(sh).rotateZ((i / 3) * Math.PI * 2 + 0.3).translate(0, 0, 0.03));
  }
  head.add(hub, new THREE.CircleGeometry(0.06, 8).translate(0, 0, 0.032));
  for (const [g, mt] of head.list) p.add(mt, g.rotateX(-0.15).translate(0, 1.16, 0.08));
  const g = p.group(ctx, 'valley-asset:in-paper-fan');
  noCast(g, cage, blade, hub);
  return g;
};

// ── in-paper-floor-lamp：落地灯（1.6 高）：铁三脚 + 铜杆 + 奶油色鼓形灯罩。夜里灯罩亮、地上一个灯光圈（等候区、总编室的角上）──
const inFloorLamp: AssetFn = (ctx) => {
  const m = inMats(ctx);
  const lm = lampMats(ctx, [0xfaf0d8, 0xd8c4c0, 0x7c6e98], 'newsprint');
  const p = new Parts();
  p.add(m.iron, cyl(0.2, 0.18, 0.04, 0, 0, 0, 10));
  p.add(m.brass, box(0.06, 1.3, 0.06, 0, 0.04, 0));
  p.add(lm.day, cyl(0.26, 0.2, 0.32, 0, 1.28, 0, 12));
  p.add(lm.bulb, cyl(0.17, 0.17, 0.02, 0, 1.27, 0, 10));
  const g = p.group(ctx, 'valley-asset:in-paper-floor-lamp');
  inNight(
    g,
    [
      [lm.day, lm.night],
      [lm.bulb, lm.bulbN],
    ],
    [0, 0, 2.8, 1.4],
  );
  return g;
};

const IN_ASSETS: Record<string, AssetFn> = {
  'in-paper-floor': inFloor,
  'in-paper-north-wall': inNorthWall,
  'in-paper-archive-shelf': inArchiveShelf,
  'in-paper-file-cabinet': inFileCabinet,
  'in-paper-reporter-desk': inReporterDesk,
  'in-paper-chair': inChair,
  'in-paper-teletype': inTeletype,
  'in-paper-water-cooler': inWaterCooler,
  'in-paper-glass-office': inGlassOffice,
  'in-paper-bookshelf': inBookshelf,
  'in-paper-editor-desk': inEditorDesk,
  'in-paper-history-wall': inHistoryWall,
  'in-paper-front-counter': inFrontCounter,
  'in-paper-news-rack': inNewsRack,
  'in-paper-bench': inBench,
  'in-paper-plant': inPlant,
  'in-paper-piles': inPaperStack,
  'in-paper-coat-rack': inCoatRack,
  'in-paper-fan': inFan,
  'in-paper-floor-lamp': inFloorLamp,
};

export const ASSETS: Record<string, AssetFn> = {
  'paper-front': paperFront,
  'paper-tower': paperTower,
  'paper-press-roof': pressRoof,
  'paper-newsrack': newsrack,
  'paper-van': paperVan,
  'newsprint-rolls': newsprintRolls,
  'paper-bundles': paperBundles,
  ...IN_ASSETS,
};
