// 棕榈泉高中的资产（批 SC，2026-11-18 美术关卡 2，docs/lab/2026-11-07-3d-pixel/valley-civic.md「4. 棕榈泉高中」）。这个文件归学校的资产代理。
// ASSETS['<id>'] = (ctx) => THREE.Object3D：本地原点 = 落地点中心，y 0 = 地面，+z 朝南；材质只用 ctx.mat(key, extra)；随机只用 ctx.rng('<id>')。
// 画廊：/valleyassets.html?asset=<id>；场景里在 detail/east.ts 的 school() 用 makeAsset(id, d.actx) 放。
//
// 学校 = "挑人的地方"：冷灰砌块墙 + 深酒红 + 浅金（校色），校队球场边的看台、记分牌、练习墙、选拔日的帐篷，黄校车，电子字牌。
// 尺寸分两种（townscale.ts）：
// - 跟小镇缩的（教学楼、体育馆的门面、排名榜、记分牌、校车、字牌、旗杆、午餐区、车棚）照**缩之前**的原尺寸画，townwrap 统一乘 0.62；
// - 校队球场框（PLAY_KEEP）里的（看台、练习墙、风挡布上的字、选拔帐篷）照真实尺寸画，不缩。
// 画法（material-spec.md、上一批资产代理的经验）：
// - 朝南的立面永远在暗档：立面上的东西（窗、门、招牌、字）用 SIGN_FACE（schoolMaroon / schoolGold 默认就带），墙皮不接收投影；
// - 字是 5 × 7 的像素字：一格宽 c、高 c·√2（竖直面上一屏幕行），c ≥ 1 设计纹素（0.09 米）× 缩放后看得清；
// - 薄的东西（旗、看台的板、围网上的字、帐篷腿）不投影；夜里窗、字牌、记分牌的数字换暖色自发光（userData.night）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../clubsite/render/geo';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../ctx';
import { type PalKey, SIGN_FACE, TOWN_EL } from '../palette';

/** 设计纹素（米） */
const T = 0.09;
/** 竖直面上一屏幕行（俯 45°） */
const ROW = T / Math.SQRT1_2;

const FACE: ToonOpts = SIGN_FACE;
const WALL: ToonOpts = { noShadowReceive: true };
const PROP: ToonOpts = { noShadowReceive: true };
/**
 * 砌块墙的立面皮：朝南永远在暗档，暗档的冷灰（L ≈ 99）在午后金光下和市中心暗档的灰泥只差 ΔE ≈ 14；
 * 光往上偏一点（落到暗档 / 中档之间的冷灰），和灰泥拉开到 ΔE ≥ 15，砌块的横缝还在。
 */
const CMU_FACE: ToonOpts = { ...SIGN_FACE, elem: TOWN_EL.cmuGrey, bands: [-0.9, -0.2] };

type Part = { g: THREE.BufferGeometry; m: THREE.Material; cast: boolean };
/** 按（材质, 投不投影）合成网格 */
class Parts {
  list: Part[] = [];
  constructor(private ctx: AssetCtx) {}
  add(m: THREE.Material, g: THREE.BufferGeometry | THREE.BufferGeometry[], cast = true) {
    for (const x of Array.isArray(g) ? g : [g]) this.list.push({ g: x, m, cast });
  }
  build(name: string): THREE.Group {
    const out = new THREE.Group();
    out.name = name;
    const by = new Map<string, { m: THREE.Material; cast: boolean; gs: THREE.BufferGeometry[] }>();
    for (const { g, m, cast } of this.list) {
      const ng = g.index ? g.toNonIndexed() : g;
      for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal') ng.deleteAttribute(a);
      if (!ng.attributes.normal) ng.computeVertexNormals();
      const k = `${m.uuid}:${cast}`;
      const e = by.get(k) ?? { m, cast, gs: [] };
      e.gs.push(ng);
      by.set(k, e);
    }
    for (const { m, cast, gs } of by.values()) {
      const merged = mergeGeometries(gs);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.name = `${name}:${(m.userData.palKey as string | undefined) ?? m.name}`;
      if (!cast) mesh.userData.noCast = true;
      out.add(mesh);
    }
    this.ctx.mats.prepare(out);
    out.traverse((o) => {
      if (o.userData.noCast) o.castShadow = false;
    });
    return out;
  }
}

/** 夜里开关：白天材质 → 自发光材质（锁着、被压暗的不开）；pool = 本地坐标的灯光圈 */
function nightSwitch(
  root: THREE.Object3D,
  swaps: Map<THREE.Material, THREE.Material>,
  pool?: { x: number; z: number; r: number; h: number },
) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && swaps.has(m.material as THREE.Material)) {
      m.userData.schoolDay = m.material;
      meshes.push(m);
    }
  });
  let on = false;
  let lit = false;
  const v = new THREE.Vector3();
  root.userData.night = {
    setOn(o: boolean) {
      on = o;
      lit = false;
      for (const m of meshes) {
        const day = m.userData.schoolDay as THREE.Material;
        const night = swaps.get(day) as THREE.Material;
        if (m.material !== day && m.material !== night) continue;
        m.material = on ? night : day;
        lit = true;
      }
    },
    pool: pool
      ? () => {
          v.set(pool.x, 0, pool.z).applyMatrix4(root.matrixWorld);
          return on && lit ? [v.x, v.z, pool.r, pool.h] : [v.x, v.z, 0, 0];
        }
      : undefined,
  };
}
const glow = (ctx: AssetCtx, key: PalKey, extra: ToonOpts, emissive: number) => ctx.mat(key, { ...extra, emissive });

// ── 像素字（5 × 7）──
const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  G: ['.####', '#....', '#....', '#..##', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
};
const cols = (s: string) => [...s].reduce((n, ch) => n + (ch === ' ' ? 3 : 6), 0) - 1;
/**
 * 一行字（朝 +z 的平板，每行连续的格合成一块）。cx = 中线，y0 = 字底，z = 离原点，c = 一格宽（高 c·√2）。
 * drop = 掉格的比例（褪色、剥落的字），rnd 决定掉哪几格。
 */
function text(s: string, cx: number, y0: number, z: number, c: number, drop = 0, rnd?: () => number) {
  const out: THREE.BufferGeometry[] = [];
  const rh = c / Math.SQRT1_2;
  const x0 = cx - (cols(s) * c) / 2;
  let col = 0;
  for (const ch of s) {
    if (ch === ' ') {
      col += 3;
      continue;
    }
    const g = FONT[ch];
    if (g)
      for (let r = 0; r < 7; r++) {
        let k = 0;
        while (k < 5) {
          if (g[r][k] !== '#' || (drop && rnd && rnd() < drop)) {
            k++;
            continue;
          }
          let e = k;
          while (e < 5 && g[r][e] === '#') e++;
          out.push(
            new THREE.PlaneGeometry((e - k) * c, rh).translate(
              x0 + (col + (k + e) / 2) * c,
              y0 + (6 - r + 0.5) * rh,
              z,
            ),
          );
          k = e;
        }
      }
    col += 6;
  }
  return out;
}
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 6) =>
  new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y + h / 2, z);

export const ASSETS: Record<string, AssetFn> = {};

// ══ school-main-front：教学楼南立面 + 屋顶（原尺寸 70 × 9 × 40，原点 = 楼的中心；立面 z = +20）══
// 墙、屋顶板是 build.ts 的盒子（cmuGrey 墙）；这里贴一层自己的皮（画廊里自己就是一栋楼）+ 立面上的东西 + 屋顶的太阳能板。
// 一楼被连廊顶挡住（school() 里的程序几何）；正门那一跨不盖顶：两根酒红门墩 + 门头（金字 PS HIGH）+ 玻璃门。
const MW = 70;
const MH = 9;
const MD = 40;
/** 正门（离楼中线，缩之前） */
export const MAIN_DOOR_X = -27;
ASSETS['school-main-front'] = (ctx) => {
  const p = new Parts(ctx);
  const zf = MD / 2;
  const wall = ctx.mat('cmuGrey', CMU_FACE);
  const maroon = ctx.mat('schoolMaroon');
  const gold = ctx.mat('schoolGold');
  const glass = ctx.mat('jug', FACE);
  const glassN = glow(ctx, 'jug', FACE, 0xffc070);
  const frame = ctx.mat('metal', FACE);
  const sill = ctx.mat('cmuGrey', PROP);
  const rnd = ctx.rng('school-main-front');
  // 墙皮（离原面 2 厘米）+ 压顶（朝上的窄面自己就是亮边）
  p.add(wall, box(MW, MH, 0.04, 0, 0, zf + 0.02));
  p.add(sill, box(MW + 0.3, 0.22, 0.6, 0, MH - 0.05, zf - 0.2));
  // 女儿墙下一条酒红带 + 一行浅金细线
  p.add(maroon, box(MW + 0.1, 1.0, 0.12, 0, MH - 1.15, zf + 0.06), false);
  p.add(gold, box(MW + 0.1, ROW, 0.04, 0, MH - 1.15 - ROW, zf + 0.1), false);
  // 二楼窗（3.0 × 1.6，每 4.4 米；正门那一跨不开）：夜里一半亮
  const lit: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];
  for (let x = -MW / 2 + 3; x < MW / 2 - 2; x += 4.4) {
    if (Math.abs(x - MAIN_DOOR_X) < 6) continue;
    (rnd() < 0.55 ? lit : dark).push(box(3.0, 1.6, 0.06, x, 5.0, zf + 0.05));
    p.add(sill, box(3.3, ROW, 0.2, x, 4.88, zf + 0.1), false);
    p.add(frame, box(T, 1.6, 0.04, x, 5.0, zf + 0.09), false);
  }
  // 一楼：教室门（酒红）和窗交替（连廊底下，从连廊柱子之间看得到一截）
  for (let x = -MW / 2 + 4; x < MW / 2 - 3; x += 6.6) {
    if (Math.abs(x - MAIN_DOOR_X) < 6.5) continue;
    p.add(maroon, box(1.2, 2.4, 0.08, x, 0, zf + 0.05), false);
    if (Math.abs(x + 3 - MAIN_DOOR_X) > 6.5 && x + 3 < MW / 2 - 2)
      (rnd() < 0.5 ? lit : dark).push(box(2.4, 1.3, 0.06, x + 3, 1.0, zf + 0.05));
  }
  // 正门：两根门墩 + 门头 + 金字 + 玻璃门（三根竖框）+ 台阶
  const ex = MAIN_DOOR_X;
  for (const s of [-1, 1]) p.add(maroon, box(1.2, 7.4, 1.2, ex + s * 4.2, 0, zf + 0.6));
  p.add(maroon, box(9.6, 1.4, 1.5, ex, 6.0, zf + 0.75));
  p.add(gold, text('PS HIGH', ex, 6.12, zf + 1.51, 0.16), false);
  lit.push(box(5.4, 3.4, 0.08, ex, 0, zf + 0.05));
  p.add(frame, box(5.8, 0.25, 0.12, ex, 3.4, zf + 0.08), false);
  for (const dx of [-2.7, 0, 2.7]) p.add(frame, box(T * 1.5, 3.4, 0.05, ex + dx, 0, zf + 0.11), false);
  p.add(ctx.mat('campusConcrete', PROP), box(8.4, 0.16, 1.4, ex, 0, zf + 0.7));
  p.add(glass, [...lit, ...dark], false);
  // 两头的落水管
  for (const s of [-1, 1]) p.add(frame, box(0.22, MH - 0.3, 0.22, s * (MW / 2 - 0.4), 0, zf + 0.15), false);
  // 屋顶（build.ts 的屋顶板顶 = 缩完 h + 0.35 → 缩之前 h + 0.565）：四排太阳能板（斜 0.2，矮腿）、两台空调、一个检修口
  //（2026-11-21：第四排 dz 12 靠前沿 —— 正门一屏上半截原来是一整块奶白的平顶，中午饱和度 0.346 < 0.35）
  const ry = MH + 0.6;
  const solar = ctx.mat('solarBlue', { elem: TOWN_EL.solarBlue });
  for (const dz of [-12, -4, 4, 12]) {
    p.add(solar, new THREE.BoxGeometry(34, 0.16, 4.2).rotateX(0.2).translate(-1, ry + 0.75, dz));
    for (const dx of [-16, -8, 0, 8, 14]) p.add(frame, box(0.16, 0.6, 0.16, dx - 1, ry, dz + 1.2), false);
  }
  const ac = ctx.mat('metal');
  for (const dx of [-24, 22]) {
    p.add(ac, box(2.6, 1.2, 2.2, dx, ry, -14));
    p.add(ctx.mat('ironwork'), box(1.6, 0.06, 1.4, dx, ry + 1.2, -14), false);
  }
  p.add(sill, box(1.4, 0.5, 1.4, 26, ry, 8));
  const root = p.build('school-main-front');
  nightSwitch(root, new Map([[glass, glassN]]), { x: ex, z: zf + 4, r: 5, h: 4 });
  return root;
};

// ══ school-gym-front：体育馆南立面（原尺寸 36 × 10 × 30，原点 = 楼的中心；立面 z = +15）══
// 酒红校名带（金字 PS PANTHERS）、一排高窗、两扇酒红大门（门头小雨棚）、门两边两排储物柜。排名榜单独一件（rank-board）。
const GW = 36;
const GH = 10;
const GD = 30;
ASSETS['school-gym-front'] = (ctx) => {
  const p = new Parts(ctx);
  const zf = GD / 2;
  const wall = ctx.mat('cmuGrey', CMU_FACE);
  const maroon = ctx.mat('schoolMaroon');
  const gold = ctx.mat('schoolGold');
  const glass = ctx.mat('jug', FACE);
  const glassN = glow(ctx, 'jug', FACE, 0xffd890);
  const frame = ctx.mat('metal', FACE);
  const dark = ctx.mat('ironwork', FACE);
  const cap = ctx.mat('cmuGrey', PROP);
  p.add(wall, box(GW, GH, 0.04, 0, 0, zf + 0.02));
  p.add(cap, box(GW + 0.3, 0.22, 0.6, 0, GH - 0.05, zf - 0.2));
  p.add(maroon, box(GW + 0.1, 1.4, 0.12, 0, GH - 1.8, zf + 0.06), false);
  p.add(gold, text('PS PANTHERS', 0, GH - 1.7, zf + 0.13, 0.13), false);
  // 高窗（体育馆采光）
  const hi: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) hi.push(box(3.0, 1.0, 0.06, -13.5 + k * 4.5, 6.4, zf + 0.05));
  p.add(glass, hi, false);
  for (let k = 0; k < 7; k++) p.add(cap, box(3.3, ROW, 0.2, -13.5 + k * 4.5, 6.3, zf + 0.1), false);
  // 两扇大门：门扇（中缝）、两块竖的小窗、门头小雨棚、出口灯
  for (const s of [-1, 1]) {
    const x = s * 5.2;
    p.add(maroon, box(3.6, 3.6, 0.1, x, 0, zf + 0.05), false);
    p.add(dark, box(T, 3.6, 0.04, x, 0, zf + 0.11), false);
    for (const dx of [-0.7, 0.7]) p.add(glass, box(0.4, 1.2, 0.04, x + dx, 1.6, zf + 0.11), false);
    p.add(frame, box(4.4, 0.2, 1.2, x, 3.9, zf + 0.6));
    p.add(ctx.mat('flowerRed', FACE), box(0.5, 0.25, 0.1, x, 4.3, zf + 0.1), false);
  }
  // 储物柜（门外侧各一排）：柜体、每 0.75 米一道缝、上下两排通风格、顶上一条压条
  for (const s of [-1, 1]) {
    const x = s * 9.6;
    p.add(maroon, box(4.5, 3.2, 0.8, x, 0, zf + 0.4));
    for (let k = 0; k <= 6; k++) p.add(dark, box(T * 0.8, 3.0, 0.03, x - 2.25 + k * 0.75, 0.1, zf + 0.81), false);
    for (let k = 0; k < 6; k++)
      for (const y of [2.6, 0.5]) p.add(dark, box(0.36, ROW, 0.03, x - 1.875 + k * 0.75, y, zf + 0.81), false);
    p.add(frame, box(4.6, 0.12, 0.85, x, 3.2, zf + 0.4), false);
  }
  // 两头的落水管、屋顶三台空调
  for (const s of [-1, 1]) p.add(frame, box(0.22, GH - 0.3, 0.22, s * (GW / 2 - 0.4), 0, zf + 0.15), false);
  for (const dx of [-11, -2, 9]) p.add(ctx.mat('metal'), box(2.4, 1.3, 2.2, dx, GH + 0.6, -4));
  const root = p.build('school-gym-front');
  nightSwitch(root, new Map([[glass, glassN]]), { x: 0, z: zf + 3.5, r: 7, h: 4 });
  return root;
};

// ══ rank-board：体育馆门口的成绩 / 排名榜（原尺寸 5.6 × 4.9 × 0.3；原点 = 底边中点，背贴墙，朝 +z）══
// 金属框玻璃柜：暗板上六张成绩单（白纸、每张几行字），第一张上一颗金星；酒红抬头金字 RANKINGS。
ASSETS['rank-board'] = (ctx) => {
  const p = new Parts(ctx);
  const frame = ctx.mat('metal', FACE);
  const board = ctx.mat('slate', FACE);
  const paper = ctx.mat('pvc', FACE);
  const ink = ctx.mat('ironwork', FACE);
  const gold = ctx.mat('schoolGold');
  const maroon = ctx.mat('schoolMaroon');
  const rnd = ctx.rng('rank-board');
  p.add(frame, box(5.4, 3.2, 0.24, 0, 1.0, 0.12));
  p.add(board, box(5.0, 2.8, 0.04, 0, 1.2, 0.26), false);
  p.add(maroon, box(5.6, 0.85, 0.3, 0, 4.2, 0.15));
  p.add(gold, text('RANKINGS', 0, 4.27, 0.31, 0.08), false);
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 2; r++) {
      const x = -1.6 + c * 1.6;
      const y = 1.4 + r * 1.35;
      p.add(paper, box(1.3, 1.1, 0.02, x, y, 0.29), false);
      for (let k = 0; k < 5; k++) {
        const w = 0.5 + rnd() * 0.6;
        p.add(ink, box(w, ROW * 0.6, 0.01, x - 0.55 + w / 2, y + 0.15 + k * 0.18, 0.305), false);
      }
    }
  // 第一名的金星（一个菱形 + 横条）
  p.add(gold, new THREE.PlaneGeometry(0.28, 0.28).rotateZ(Math.PI / 4).translate(-2.05, 3.55, 0.31), false);
  return p.build('rank-board');
};

// ══ school-bleacher：校队三号场北头的铝看台（真实尺寸 12 × 2.4 × 4.4；原点 = 脚印中心，人朝 +z 坐）══
// 五排座板（铝）+ 踏板，每排座板下一条酒红踢脚板（朝南：一条条酒红横纹 = 远看是"学校的看台"）；铁架、后栏杆、两头扶手。
// 座板、踏板、架子都不投影（一排排板子互相投影是一片抖点横条）。座面高 0.45 + 0.4 k，第 k 排的 z = 1.6 − 0.75 k。
export const BLEACHER = { len: 12, rows: 5, seat0: 0.45, rise: 0.4, z0: 1.6, step: 0.75 } as const;
ASSETS['school-bleacher'] = (ctx) => {
  const p = new Parts(ctx);
  const { len, rows, seat0, rise, z0, step } = BLEACHER;
  const alu = ctx.mat('roofMetal', PROP);
  const maroon = ctx.mat('schoolMaroon');
  const iron = ctx.mat('ironwork', PROP);
  for (let k = 0; k < rows; k++) {
    const y = seat0 + k * rise;
    const z = z0 - k * step;
    p.add(alu, box(len, 0.08, 0.38, 0, y - 0.08, z), false);
    // 踏板（在这一排前面、低一级）
    p.add(alu, box(len, 0.06, 0.32, 0, y - rise - 0.02 + (k === 0 ? 0.04 : 0), z + 0.38), false);
    // 踢脚板（座板下、朝南）
    p.add(maroon, box(len, rise - 0.12, 0.03, 0, y - rise + 0.02, z + 0.2), false);
  }
  const top = seat0 + (rows - 1) * rise;
  const back = z0 - (rows - 1) * step - 0.3;
  const slope = Math.atan2(top, z0 + 0.4 - back);
  const L = Math.hypot(top, z0 + 0.4 - back);
  for (const x of [-len / 2 + 0.15, -len / 6, len / 6, len / 2 - 0.15]) {
    p.add(
      iron,
      new THREE.BoxGeometry(0.14, 0.18, L).rotateX(slope).translate(x, top / 2, (z0 + 0.4 + back) / 2),
      false,
    );
    p.add(iron, box(0.14, top + 1.0, 0.14, x, 0, back), false);
  }
  p.add(iron, box(len, 0.08, 0.08, 0, top + 0.95, back), false);
  p.add(iron, box(len, 0.08, 0.08, 0, top + 0.5, back), false);
  // 两头的扶手（顺着坡）
  for (const s of [-1, 1])
    p.add(
      iron,
      new THREE.BoxGeometry(0.08, 0.08, L)
        .rotateX(slope)
        .translate(s * (len / 2 + 0.05), top / 2 + 0.95, (z0 + 0.4 + back) / 2),
      false,
    );
  return p.build('school-bleacher');
};

// ══ school-scoreboard：看台背后的记分牌（原尺寸 4.4 × 5.2 × 0.4，跟小镇缩；原点 = 两根柱子中间）══
ASSETS['school-scoreboard'] = (ctx) => {
  const p = new Parts(ctx);
  const post = ctx.mat('metal');
  const board = ctx.mat('ironwork', FACE);
  const maroon = ctx.mat('schoolMaroon');
  const gold = ctx.mat('schoolGold');
  const goldN = glow(ctx, 'schoolGold', FACE, 0xffb040);
  const white = ctx.mat('pvc', FACE);
  for (const s of [-1, 1]) p.add(post, box(0.22, 2.6, 0.22, s * 1.7, 0, 0));
  p.add(board, box(4.2, 1.8, 0.3, 0, 2.6, 0));
  p.add(maroon, box(4.4, 0.8, 0.34, 0, 4.4, 0));
  p.add(gold, text('PANTHERS', 0, 4.43, 0.18, 0.08), false);
  p.add(white, text('HOME', -1.05, 3.95, 0.16, 0.05), false);
  p.add(white, text('GUEST', 1.05, 3.95, 0.16, 0.05), false);
  const digits = ctx.mat('schoolGold', FACE);
  p.add(digits, [...text('15', -1.05, 2.75, 0.16, 0.1), ...text('30', 1.05, 2.75, 0.16, 0.1)], false);
  const root = p.build('school-scoreboard');
  nightSwitch(root, new Map([[digits, goldN]]));
  return root;
};

// ══ hit-wall：练习墙（真实尺寸 8.5 × 3.0 × 0.4；原点 = 墙脚中心，打球的一面朝 +z）══
// 浇筑混凝土（3.5 米一块的模板缝）、白的网高线（0.91 米）、几块球印擦痕、酒红压顶、顶上正中一块酒红底金字 PS。背后三道扶壁。
ASSETS['hit-wall'] = (ctx) => {
  const p = new Parts(ctx);
  const rnd = ctx.rng('hit-wall');
  const W = 8.5;
  // 墙面不用 stones 元素（3.5 米一格在 8.5 米的墙上读成裂纹）：平的混凝土 + 两道模板缝
  const conc = ctx.mat('campusConcrete', WALL);
  p.add(conc, box(W, 3.0, 0.4, 0, 0, 0));
  for (const x of [-W / 6, W / 6]) p.add(ctx.mat('campusConcrete', FACE), box(T * 0.6, 3.0, 0.01, x, 0, 0.2), false);
  for (const x of [-3, 0, 3]) p.add(ctx.mat('campusConcrete'), box(0.3, 2.6, 1.0, x, 0, -0.7));
  p.add(ctx.mat('schoolMaroon', PROP), box(W + 0.2, 0.2, 0.5, 0, 3.0, 0));
  p.add(ctx.mat('line', FACE), box(W, ROW, 0.02, 0, 0.91 - ROW / 2, 0.21), false);
  // 球印：网高线以上一片（孩子打得最多的那一块），每块 2～4 纹素
  const scuff = ctx.mat('courtBleach', FACE);
  for (let k = 0; k < 9; k++) {
    const w = T * (2 + Math.floor(rnd() * 3));
    p.add(scuff, box(w, ROW * (1 + Math.floor(rnd() * 2)), 0.01, -2.2 + rnd() * 4.4, 1.0 + rnd() * 0.9, 0.205), false);
  }
  p.add(ctx.mat('schoolMaroon'), box(1.3, 0.75, 0.04, 0, 2.05, 0.21), false);
  p.add(ctx.mat('schoolGold'), text('PS', 0, 2.12, 0.235, 0.075), false);
  return p.build('hit-wall');
};

// ══ school-banner：挂在围网 / 栏杆上的横幅（真实尺寸，朝 +z，原点 = 底边中点在地上）══
// v0：风挡布上褪色的校名 PS TENNIS（9 米，离地 1.0 米）；v1：南围网对着拉蒙路一长条 PALM SPRINGS HIGH TENNIS（30 米）；
// v2：选拔日挂在北边矮栏杆上的 TRYOUTS（新的，6.4 米，离地 0.12 米）。褪色 = 底色发白 + 字掉格。
ASSETS['school-banner'] = (ctx) => {
  const p = new Parts(ctx);
  const v = ((ctx.variant % 3) + 3) % 3;
  const rnd = ctx.rng(`school-banner:${v}`);
  const spec = [
    { s: 'PS TENNIS', w: 9, h: 1.2, y: 1.0, c: 0.15, fade: true },
    { s: 'PALM SPRINGS HIGH TENNIS', w: 30, h: 1.4, y: 0.9, c: 0.18, fade: true },
    { s: 'TRYOUTS', w: 6.4, h: 0.85, y: 0.12, c: 0.08, fade: false },
  ][v];
  const bg = spec.fade ? ctx.mat('schoolMaroon', { ...FACE, lightUp: 0.9 }) : ctx.mat('schoolMaroon');
  p.add(bg, box(spec.w, spec.h, 0.03, 0, spec.y, 0), false);
  const ty = spec.y + (spec.h - 7 * (spec.c / Math.SQRT1_2)) / 2;
  p.add(ctx.mat('schoolGold'), text(spec.s, 0, ty, 0.02, spec.c, spec.fade ? 0.18 : 0, rnd), false);
  if (!spec.fade)
    for (const s of [-1, 1])
      p.add(ctx.mat('pvc', FACE), box(0.1, 0.1, 0.02, s * (spec.w / 2 - 0.15), spec.y + spec.h - 0.15, 0.02), false);
  return p.build(`school-banner-v${v}`);
};

// ══ tryout-tent：青训选拔日的报名处（真实尺寸，帐篷 3 × 2.9 × 3；原点 = 帐篷中心）══
// 酒红折叠帐篷（四坡顶 + 一圈帷边，南面帷边金字 TRYOUTS）、白桌（一摞号码布、一箱号码布、夹板）、两把折叠椅、一个蓝冷藏箱。
ASSETS['tryout-tent'] = (ctx) => {
  const p = new Parts(ctx);
  const maroon = ctx.mat('schoolMaroon', { lightUp: 0.3 });
  const legs = ctx.mat('metal', PROP);
  const S = 3;
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    p.add(legs, box(0.08, 2.2, 0.08, (a * S) / 2 - a * 0.05, 0, (b * S) / 2 - b * 0.05), false);
  p.add(maroon, new THREE.ConeGeometry(S * Math.SQRT1_2, 0.7, 4).rotateY(Math.PI / 4).translate(0, 2.2 + 0.35, 0));
  // 帷边：四面一圈 0.4 米
  p.add(ctx.mat('schoolMaroon'), box(S, 0.4, 0.03, 0, 1.82, S / 2), false);
  p.add(ctx.mat('schoolMaroon'), box(S, 0.4, 0.03, 0, 1.82, -S / 2), false);
  for (const s of [-1, 1]) p.add(ctx.mat('schoolMaroon'), box(0.03, 0.4, S, (s * S) / 2, 1.82, 0), false);
  p.add(ctx.mat('schoolGold'), text('TRYOUTS', 0, 1.86, S / 2 + 0.02, 0.04), false);
  // 桌子
  const top = ctx.mat('clothWhite', PROP);
  p.add(top, box(2.2, 0.06, 0.75, 0, 0.72, 0.5));
  p.add(ctx.mat('clothWhite', FACE), box(2.2, 0.5, 0.02, 0, 0.24, 0.875), false);
  for (const s of [-1, 1]) p.add(legs, box(0.06, 0.72, 0.6, s * 1.0, 0, 0.5), false);
  p.add(ctx.mat('pvc', PROP), box(0.4, 0.12, 0.3, -0.6, 0.78, 0.45), false);
  p.add(ctx.mat('schoolMaroon', PROP), box(0.3, 0.02, 0.22, -0.6, 0.9, 0.45), false);
  p.add(ctx.mat('kraft', PROP), box(0.55, 0.3, 0.4, 0.35, 0.78, 0.45));
  p.add(ctx.mat('pvc', PROP), box(0.25, 0.02, 0.32, 0.85, 0.78, 0.55), false);
  // 椅子（桌子北边）、冷藏箱
  for (const x of [-0.55, 0.55]) {
    p.add(legs, box(0.45, 0.05, 0.42, x, 0.45, -0.25), false);
    p.add(legs, box(0.45, 0.45, 0.05, x, 0.45, -0.48), false);
  }
  p.add(ctx.mat('clothBlue', PROP), box(0.6, 0.42, 0.4, 1.15, 0, -0.9));
  p.add(ctx.mat('clothWhite', PROP), box(0.62, 0.06, 0.42, 1.15, 0.42, -0.9), false);
  return p.build('tryout-tent');
};

// ══ school-bus：黄校车（原尺寸 8 × 3.1 × 2.5，跟小镇缩到 ≈ 5 米；原点 = 车底中心，车头朝 +x，车身南面朝 +z）══
// 车身、车顶都是黄（俯视一眼是校车；用户定）；南面一条窗带（车窗间的黄窗柱）、两道黑腰线、车头短鼻、黑保险杠、红停车臂、顶上四个灯。
// 南面的车身永远在暗档 → 车身用 SIGN_FACE 让黄落中档。
ASSETS['school-bus'] = (ctx) => {
  const p = new Parts(ctx);
  const yel = ctx.mat('flowerYellow', { ...FACE, noShadowReceive: false });
  const glass = ctx.mat('jug', FACE);
  const black = ctx.mat('ironwork', FACE);
  p.add(yel, box(6.9, 2.3, 2.4, -0.5, 0.5, 0));
  p.add(yel, box(1.0, 1.15, 2.3, 3.45, 0.5, 0));
  p.add(ctx.mat('flowerYellow'), box(6.8, 0.14, 2.3, -0.5, 2.8, 0));
  // 窗带 + 窗柱
  p.add(glass, box(6.0, 0.7, 0.04, -0.75, 1.75, 1.215), false);
  for (let x = -3.6; x < 2.4; x += 0.75) p.add(yel, box(0.12, 0.7, 0.05, x, 1.75, 1.22), false);
  p.add(glass, box(0.04, 0.9, 2.0, 2.97, 1.7, 0), false);
  for (const y of [0.95, 1.38]) p.add(black, box(6.9, 0.1, 0.04, -0.5, y, 1.22), false);
  p.add(black, box(0.2, 0.3, 2.5, 4.0, 0.35, 0));
  p.add(black, box(0.2, 0.3, 2.5, -4.0, 0.35, 0));
  const wheel = ctx.mat('ironwork');
  for (const x of [-2.6, 2.4])
    for (const s of [-1, 1])
      p.add(wheel, new THREE.CylinderGeometry(0.48, 0.48, 0.3, 8).rotateX(Math.PI / 2).translate(x, 0.48, s * 1.08));
  // 停车臂（南面，驾驶座后面）：红八角 + 白边
  p.add(ctx.mat('clothWhite', FACE), new THREE.CircleGeometry(0.3, 8).translate(2.2, 1.55, 1.29), false);
  p.add(ctx.mat('clothRed', FACE), new THREE.CircleGeometry(0.25, 8).translate(2.2, 1.55, 1.3), false);
  for (const x of [-3.8, 2.7])
    for (const s of [-1, 1]) p.add(ctx.mat('flowerRed'), box(0.2, 0.12, 0.2, x, 2.94, s * 0.9), false);
  return p.build('school-bus');
};

// ══ school-marquee：前门的电子字牌（原尺寸 4.4 × 3.2 × 0.9；原点 = 底座中心，朝 +z）══
// 砌块底座 + 两根墩子、暗屏两行字（琥珀 TRYOUTS SAT、白 GO PANTHERS；夜里亮）、酒红顶（金字 PALM SPRINGS HIGH）。
ASSETS['school-marquee'] = (ctx) => {
  // 宽 4.4（< townwrap 的 LONG_M 4.5）：整件跟小镇缩；再宽就成了"长条"，只压低不缩宽
  const p = new Parts(ctx);
  const cmu = ctx.mat('cmuGrey', { elem: TOWN_EL.cmuGrey });
  p.add(cmu, box(4.2, 0.9, 0.9, 0, 0, 0));
  for (const s of [-1, 1]) p.add(cmu, box(0.45, 1.7, 0.6, s * 1.85, 0.9, 0));
  p.add(ctx.mat('ironwork', FACE), box(3.3, 1.4, 0.4, 0, 1.05, 0));
  const amber = ctx.mat('flowerYellow', FACE);
  const white = ctx.mat('pvc', FACE);
  p.add(amber, text('TRYOUTS SAT', 0, 1.82, 0.21, 0.048), false);
  p.add(white, text('GO PANTHERS', 0, 1.2, 0.21, 0.048), false);
  p.add(ctx.mat('schoolMaroon'), box(4.4, 0.6, 0.8, 0, 2.6, 0));
  p.add(ctx.mat('schoolGold'), text('PALM SPRINGS HIGH', 0, 2.68, 0.41, 0.04), false);
  const root = p.build('school-marquee');
  nightSwitch(
    root,
    new Map([
      [amber, glow(ctx, 'flowerYellow', FACE, 0xffa030)],
      [white, glow(ctx, 'pvc', FACE, 0xfff0d0)],
    ]),
    { x: 0, z: 1.6, r: 3, h: 2.5 },
  );
  return root;
};

// ══ school-flagpole：前庭的旗杆（原尺寸 10.6 米，跟小镇缩；原点 = 底座中心）══
// 砌块底座、渐细的杆、金顶球；上面国旗（七道红白 + 蓝角），下面校旗（酒红底金 P）。全部不投影（10 米的杆傍晚一条长黑带）。
ASSETS['school-flagpole'] = (ctx) => {
  const p = new Parts(ctx);
  p.add(ctx.mat('cmuGrey', { elem: TOWN_EL.cmuGrey }), box(1.6, 0.4, 1.6, 0, 0, 0));
  p.add(ctx.mat('ironwork'), cyl(0.07, 0.1, 10, 0, 0.4, 0), false);
  p.add(ctx.mat('schoolGold', {}), new THREE.IcosahedronGeometry(0.16, 0).translate(0, 10.5, 0), false);
  const fx = 1.05;
  const rw = 0.14;
  for (let k = 0; k < 7; k++)
    p.add(ctx.mat(k % 2 ? 'clothWhite' : 'clothRed', FACE), box(1.9, rw, 0.04, fx, 9.6 - (k + 1) * rw, 0), false);
  p.add(ctx.mat('clothBlue', FACE), box(0.8, 4 * rw, 0.06, 0.5, 9.6 - 4 * rw, 0), false);
  p.add(ctx.mat('schoolMaroon'), box(1.6, 1.0, 0.04, 0.9, 7.2, 0), false);
  p.add(ctx.mat('schoolGold'), text('P', 0.9, 7.35, 0.03, 0.1), false);
  return p.build('school-flagpole');
};

// ══ lunch-shade：午餐区的遮阳帆（原尺寸 5.6 × 3.8 × 7.4；长条 → townwrap 只压低）══
// 斜拉的一片帆（东西方向斜一点）+ 四根细柱；帆投影（那块阴影就是午餐区）、柱子不投。
ASSETS['lunch-shade'] = (ctx) => {
  const p = new Parts(ctx);
  const tilt = ctx.variant % 2 ? -0.12 : 0.12;
  p.add(ctx.mat('canvas'), new THREE.BoxGeometry(5.6, 0.06, 7.4).rotateZ(tilt).translate(0, 3.6, 0));
  for (const [a, b] of [
    [-2.75, -3.65],
    [2.75, -3.65],
    [-2.75, 3.65],
    [2.75, 3.65],
  ])
    p.add(ctx.mat('metal'), box(0.12, 3.6 - Math.sin(tilt) * a, 0.12, a, 0, b), false);
  return p.build('lunch-shade');
};

// ══ lunch-table：学校的长桌（原尺寸 2.0 × 0.75 × 1.8，跟小镇缩）：白桌面、两条酒红长凳、A 字铁腿 ══
ASSETS['lunch-table'] = (ctx) => {
  const p = new Parts(ctx);
  p.add(ctx.mat('pvc', PROP), box(2.0, 0.06, 0.8, 0, 0.72, 0));
  for (const s of [-1, 1]) p.add(ctx.mat('schoolMaroon', PROP), box(2.0, 0.06, 0.3, 0, 0.42, s * 0.65));
  for (const x of [-0.8, 0.8]) p.add(ctx.mat('metal', PROP), box(0.08, 0.72, 1.6, x, 0, 0), false);
  return p.build('lunch-table');
};

// ══ solar-carport：教职工停车场的太阳能车棚（原尺寸 42 × 4.1 × 5.8；长条 → townwrap 只压低）══
// 一整条斜板（南低北高，每 1 米一道电池格缝）、北沿一根横梁、中线上每 8 米一根柱子（柱顶一根悬臂）。
ASSETS['solar-carport'] = (ctx) => {
  const p = new Parts(ctx);
  const L = 42;
  p.add(
    ctx.mat('solarBlue', { elem: TOWN_EL.solarBlue }),
    new THREE.BoxGeometry(L, 0.14, 5.8).rotateX(0.17).translate(0, 3.6, 0),
  );
  p.add(ctx.mat('metal'), box(L, 0.22, 0.22, 0, 3.3, 0));
  for (let x = -L / 2 + 2; x < L / 2 - 1; x += 8) {
    p.add(ctx.mat('metal'), box(0.26, 3.4, 0.26, x, 0, 0), false);
    p.add(ctx.mat('metal'), new THREE.BoxGeometry(0.16, 0.16, 5.2).rotateX(0.17).translate(x, 3.45, 0), false);
  }
  return p.build('solar-carport');
};

// ════ 批 CP（campus，2026-11-21 小镇压紧 · 关卡 2 美术）：学校北边的活动教室区、篮球半场、饮水台；日出公园东半边的野餐桌、入口石柱 ════
// 除了 campus-goal，都在 PLAY_KEEP 外：小件（< 4.5 米）跟小镇缩（townwrap 乘 0.62）→ 照缩之前的尺寸画；
// 活动教室是长条（> 4.5 米）→ townwrap 只压低 y：长宽照缩完写、高照缩之前写。

/** 一块竖直的三角形面（伞面、坡顶）：三个点 + 往外的法线（球面：从 c 指向面心） */
function tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, up: THREE.Vector3): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  const flip = n.dot(up) < 0;
  const P = flip ? [a, c, b] : [a, b, c];
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      P.flatMap((p) => [p.x, p.y, p.z]),
      3,
    ),
  );
  g.computeVertexNormals();
  return g;
}

// ══ campus-picnic：公园的野餐桌 + 遮阳伞（原尺寸 2.4 × 2.7 × 3.2，跟小镇缩）══
// 旧木桌面 + 两条长凳 + A 字腿；伞：八瓣，一瓣色一瓣白（v0 红、v1 黄、v2 蓝 —— 不用青绿：公园里青绿只给俱乐部的帐篷）。
// 伞面投影（桌子落在伞影里 = 一块暗块，lessons「树影暗块」），伞杆、桌腿不投。
ASSETS['campus-picnic'] = (ctx) => {
  const p = new Parts(ctx);
  const v = ctx.variant % 3;
  const wood = ctx.mat('woodWeathered', { ...PROP, elem: { kind: 'planks', seam: 1, hi: 0.4, p: [0, 1, 0, 0.16] } });
  const legs = ctx.mat('ironwork', PROP);
  p.add(wood, box(2.4, 0.08, 0.92, 0, 0.74, 0));
  for (const s of [-1, 1]) p.add(wood, box(2.4, 0.07, 0.34, 0, 0.44, s * 0.74));
  for (const x of [-0.9, 0.9]) {
    p.add(legs, box(0.1, 0.74, 0.1, x, 0, 0), false);
    p.add(legs, box(0.1, 0.08, 1.8, x, 0.36, 0), false);
  }
  // 伞
  const H = 2.55;
  const R = 1.6;
  p.add(ctx.mat('metal', PROP), box(0.09, H + 0.25, 0.09, 0, 0, 0), false);
  const col = (['clothRed', 'flowerYellow', 'clothBlue'] as const)[v];
  const canopyOpts: ToonOpts = { lightUp: 0.35, bands: [-0.35, 0.35], convex: 0.25, edge: 0.6, noShadowReceive: true };
  const ca = ctx.mat(col, canopyOpts);
  const cb = ctx.mat('clothWhite', canopyOpts);
  const apex = new THREE.Vector3(0, H + 0.5, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a0 = ((i + 0.5) / N) * Math.PI * 2;
    const a1 = ((i + 1.5) / N) * Math.PI * 2;
    const r0 = new THREE.Vector3(Math.cos(a0) * R, H, Math.sin(a0) * R);
    const r1 = new THREE.Vector3(Math.cos(a1) * R, H, Math.sin(a1) * R);
    p.add(i % 2 ? cb : ca, tri(apex, r0, r1, up));
    // 垂边（一圈 0.14 米的帷边，朝南那几瓣看得见 = 伞的下沿一条亮色）
    const d0 = r0.clone().setY(H - 0.14);
    const d1 = r1.clone().setY(H - 0.14);
    const out = new THREE.Vector3((r0.x + r1.x) / 2, 0, (r0.z + r1.z) / 2).normalize();
    p.add(i % 2 ? cb : ca, tri(r0, d0, r1, out), false);
    p.add(i % 2 ? cb : ca, tri(r1, d0, d1, out), false);
  }
  return p.build('campus-picnic');
};

// ══ campus-gate：公园朝主街的入口，两根石柱（长条 5.3 米：xz 照缩完写、高照缩之前写，townwrap 只把高压到 0.62）══
// 叠石柱身（desertStone，同银行的花池石）+ 浅色压顶 + 顶上一盏方灯（夜里亮、柱间地上一圈光）；朝南那面一块搪瓷太阳圆牌（图标，不写字）。
// 两根柱子一件资产（一起合材质：两根各放一件是两倍的绘制）。柱心距 4.6 米（中间 3.9 米 = 步道 + 两边草）
ASSETS['campus-gate'] = (ctx) => {
  const p = new Parts(ctx);
  const stone = ctx.mat('desertStone', { ...SIGN_FACE, elem: TOWN_EL.desertStone, bands: [-0.55, 0.3] });
  const cap = ctx.mat('civicSand', { edge: 0.6, convex: 0.4 });
  const sun = ctx.mat('sunEnamel', SIGN_FACE);
  const iron = ctx.mat('ironwork', PROP);
  const glass = ctx.mat('jug', PROP);
  const glassN = glow(ctx, 'flowerYellow', PROP, 0xffc060);
  const W = 0.7;
  for (const s of [-1, 1]) {
    const x = s * 2.3;
    p.add(stone, box(W, 2.5, W, x, 0, 0));
    p.add(cap, box(W + 0.16, 0.22, W + 0.16, x, 2.5, 0));
    p.add(cap, box(W - 0.14, 0.14, W - 0.14, x, 2.72, 0));
    // 太阳圆牌：一块圆 + 四道光芒（朝南，贴在柱身上；高照缩之前写，圆在画面上压成扁的 → 圆牌本身先竖着拉长 1/0.62）
    p.add(
      sun,
      new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12)
        .rotateX(Math.PI / 2)
        .scale(1, 1 / 0.62, 1)
        .translate(x, 1.6, W / 2 + 0.025),
      false,
    );
    for (const [dx, dy, w, h] of [
      [0, 0.5, 0.07, 0.2],
      [0, -0.5, 0.07, 0.2],
      [0.3, 0, 0.1, 0.12],
      [-0.3, 0, 0.1, 0.12],
    ])
      p.add(sun, box(w, h, 0.04, x + dx, 1.6 + dy - h / 2, W / 2 + 0.02), false);
    p.add(iron, box(0.34, 0.06, 0.34, x, 2.86, 0), false);
    p.add(glass, box(0.26, 0.42, 0.26, x, 2.92, 0), false);
    p.add(iron, box(0.38, 0.08, 0.38, x, 3.34, 0), false);
  }
  const root = p.build('campus-gate');
  nightSwitch(root, new Map([[glass, glassN]]), { x: 0, z: 1.2, r: 3.2, h: 3.2 });
  return root;
};

// ══ campus-portable：活动教室（长条：8.4 × 5.2 的脚印照缩完写；高照缩之前写，townwrap 乘 0.62 → 落地 ≈ 2.8 米）══
// 抬高的底座（裙板一条暗带）+ 浅色 T1-11 竖缝板墙 + 酒红封檐 + 平顶；朝南一扇门、两扇窗、门前平台 + 往东下的坡道和栏杆，西头一台空调。
// v0 门在西、坡道往东；v1 门在东、坡道往西（2×2 摆成一组，两排之间对着一条走道）。
ASSETS['campus-portable'] = (ctx) => {
  const p = new Parts(ctx);
  const m = ctx.variant % 2 ? -1 : 1;
  const W = 8.4;
  const D = 5.2;
  const B = 1.0; // 底座高（缩之前）
  const WH = 3.3; // 墙高
  const wall = ctx.mat('pvc', { ...WALL, elem: { kind: 'planks', seam: 1, hi: 0.25, p: [1, 0, 0, 0.6] } });
  const skirt = ctx.mat('ironwork', { ...WALL, elem: { kind: 'planks', seam: 1, hi: 0.2, p: [1, 0, 0, 0.3] } });
  const trim = ctx.mat('schoolMaroon', FACE);
  // 顶：暖褐的压型板（冷灰白一大块平顶 = 一屏饱和度掉到 0.33；教室坐在草上，褐顶和沙不挨着）
  const roof = ctx.mat('civicSand', { elem: TOWN_EL.roofMetal, edge: 0.7, convex: 0.3 });
  p.add(skirt, box(W - 0.3, B, D - 0.3, 0, 0, 0), false);
  p.add(wall, box(W, WH, D, 0, B, 0));
  p.add(roof, box(W + 0.4, 0.22, D + 0.4, 0, B + WH, 0));
  p.add(trim, box(W + 0.44, 0.34, 0.06, 0, B + WH - 0.08, D / 2 + 0.22), false);
  // 门（酒红）+ 门框，两扇窗（玻璃 + 白框）
  const dx = -m * 2.6;
  p.add(ctx.mat('pvc', FACE), box(1.2, 2.45, 0.05, dx, B, D / 2 + 0.01), false);
  p.add(trim, box(0.95, 2.25, 0.06, dx, B, D / 2 + 0.03), false);
  const glass = ctx.mat('jug', FACE);
  for (const wx of [m * 0.2, m * 2.6]) {
    p.add(ctx.mat('pvc', FACE), box(1.7, 1.3, 0.05, wx, B + 1.1, D / 2 + 0.01), false);
    p.add(glass, box(1.5, 1.1, 0.06, wx, B + 1.2, D / 2 + 0.03), false);
  }
  // 门前平台 + 坡道（往门的另一边下）+ 栏杆
  const deck = ctx.mat('woodWeathered', { elem: { kind: 'planks', seam: 1, hi: 0.4, p: [1, 0, 0, 0.18] } });
  const rail = ctx.mat('metal', PROP);
  const PD = 1.3;
  p.add(deck, box(1.8, 0.1, PD, dx, B - 0.1, D / 2 + PD / 2));
  p.add(skirt, box(1.7, B - 0.1, PD - 0.1, dx, 0, D / 2 + PD / 2), false);
  const RL = 4.6;
  const rx0 = dx + m * 0.9;
  const slope = Math.atan2(B, RL);
  const rampG = new THREE.BoxGeometry(Math.hypot(RL, B), 0.1, 1.1)
    .rotateZ(-m * slope)
    .translate(rx0 + (m * RL) / 2, B / 2 - 0.05, D / 2 + PD - 0.55);
  p.add(deck, rampG);
  const railG = new THREE.BoxGeometry(Math.hypot(RL, B), 0.07, 0.07)
    .rotateZ(-m * slope)
    .translate(rx0 + (m * RL) / 2, B / 2 + 0.85, D / 2 + PD + 0.02);
  p.add(rail, railG, false);
  p.add(rail, box(1.8, 0.07, 0.07, dx, B + 0.85, D / 2 + PD + 0.02), false);
  for (const x of [dx - m * 0.9, rx0, rx0 + m * RL * 0.5]) {
    const h = B + 0.9 - (Math.max(0, (x - rx0) * m) / RL) * B;
    p.add(rail, box(0.08, h, 0.08, x, 0, D / 2 + PD + 0.02), false);
  }
  // 空调（门那头的山墙外，朝南的侧面看得见一块灰盒子）
  p.add(ctx.mat('metal'), box(0.6, 0.9, 1.0, -m * (W / 2 + 0.3), B + 0.6, -0.8));
  return p.build('campus-portable');
};

// ══ campus-hoop：篮球架（原尺寸 1.9 × 4.0 × 1.6，跟小镇缩；原点 = 篮筐下的地面，篮板朝南）══
ASSETS['campus-hoop'] = (ctx) => {
  const p = new Parts(ctx);
  const pole = ctx.mat('schoolMaroon');
  p.add(pole, box(0.2, 3.5, 0.2, 0, 0, -1.3), false);
  p.add(pole, box(0.14, 0.14, 1.1, 0, 3.25, -0.8), false);
  p.add(ctx.mat('pvc', FACE), box(1.8, 1.05, 0.08, 0, 2.85, -0.25));
  p.add(ctx.mat('schoolMaroon', FACE), box(0.6, 0.46, 0.09, 0, 3.0, -0.24), false);
  p.add(ctx.mat('pvc', FACE), box(0.46, 0.32, 0.1, 0, 3.07, -0.24), false);
  // 篮筐：四根 2 纹素的橙条 + 一截白网（梯形）
  const rim = ctx.mat('toolOrange', PROP);
  p.add(rim, box(0.46, 0.05, 0.05, 0, 3.05, 0.2), false);
  p.add(rim, box(0.46, 0.05, 0.05, 0, 3.05, -0.2), false);
  for (const s of [-1, 1]) p.add(rim, box(0.05, 0.05, 0.4, s * 0.21, 3.05, 0), false);
  p.add(ctx.mat('clothWhite', PROP), box(0.36, 0.34, 0.04, 0, 2.72, 0.18), false);
  return p.build('campus-hoop');
};

// ══ campus-fountain：一排三个饮水台（原尺寸 2.8 × 1.0 × 0.9，跟小镇缩）══
// 水泥垫 + 三个方柱（浅灰水泥）+ 不锈钢碗；一个碗旁边一小摊水（深一档的水泥）。
ASSETS['campus-fountain'] = (ctx) => {
  const p = new Parts(ctx);
  p.add(ctx.mat('campusConcrete', { elem: TOWN_EL.campusConcrete }), box(2.8, 0.08, 1.0, 0, 0, 0), false);
  const post = ctx.mat('campusConcrete', { ...PROP, lightUp: 0.4, bands: [-0.6, 0.2] });
  const bowl = ctx.mat('roofMetal', { ...PROP, lightUp: 0.4, bands: [-0.4, 0.3] });
  for (const x of [-0.9, 0, 0.9]) {
    p.add(post, box(0.42, 0.82, 0.42, x, 0.08, 0));
    p.add(bowl, box(0.56, 0.14, 0.5, x, 0.9, 0.04));
  }
  p.add(ctx.mat('jug', { noShadowReceive: true, bands: [0.2, 0.6] }), box(0.6, 0.02, 0.36, 0.5, 0.08, 0.42), false);
  return p.build('campus-fountain');
};

// ══ campus-goal：足球门（5.4 × 2.0 × 1.6；跑道内场、练习场都是照缩完写的场，门是长条 → townwrap 只压低到 1.24 米）══
// 白门框 2 纹素以上 + 网是一片斜着的浅灰蓝（同网球网身的 jug，一块透光的面，不画网眼）；薄的都不投影。
ASSETS['campus-goal'] = (ctx) => {
  const p = new Parts(ctx);
  const white = ctx.mat('clothWhite', { ...PROP, lightUp: 0.4, bands: [-0.5, 0.2] });
  for (const s of [-1, 1]) p.add(white, box(0.2, 2.0, 0.2, s * 2.6, 0, 0), false);
  p.add(white, box(5.4, 0.2, 0.2, 0, 1.9, 0), false);
  const net = ctx.mat('jug', { noShadowReceive: true, lightUp: 0.5, bands: [-0.6, 0.3] });
  p.add(net, new THREE.BoxGeometry(5.2, 0.04, 2.1).rotateX(-1.0).translate(0, 1.0, -0.85), false);
  for (const s of [-1, 1]) p.add(net, box(0.04, 1.9, 1.5, s * 2.6, 0, -0.8), false);
  return p.build('campus-goal');
};
