// valley 细节：学校和日出公园（高中、体育馆、操场、校队球场、公共球场、对墙、公开课、游泳中心）。
// 两个模块：detail/index.ts 各跑一次（part = 'school' / 'park'），套着 relocate.ts 的平移 —— 这里的坐标都是**旧坐标**
// （2026-11-21 小镇压紧以前的世界坐标），layout 的世界表（楼、绿地）减掉 MOVE 再用（bldgSrc / greenSrc）。
// 2026-11-21：东谷（机场、塔奎兹溪高尔夫、向日葵和深井小区、椰枣园）删了。
//
// 构图（pixel-scene 的规矩：先定主角，细节成簇放在主角上，平地留白）：
// - 日出公园的主角是公共球场、对墙练习场、周末公开课（三处各抬成一个台，parkdeck.ts）。
// - 高中：体育馆南边四片校队球场（教练在北场门等、看台、选拔日的报名桌）；前门广场、校车湾、跑道、教职工停车场。
// 尺寸按"设计纹素"0.09 米：杆、柄 ≥ 0.14 米，线 0.1 米；网、围网用一条暗带，不画网眼；不撒满地的小东西。
//
// 第二轮审查（2026-11-15）定的规矩：
// - 薄的、细的东西（围网、挡风布、网、杆、栏杆、旗、横幅）不投影：傍晚它们的影子是又长又直的硬黑带（thin()）。
// - 树冠用球面法线的团（不是一面一面的宝石），棕榈用垂下来的叶子（同 build.ts）。
// - 地面一层层的高度至少错开 0.01 米（Y 表），上面那层只盖该盖的地方。
// - 电线杆、两对球场之间的矮挡风布、车棚删掉（看不懂、投长影）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { coach, kid, player, setStride, WALK_STRIDE } from '../../clubsite/people';
import type { BaseCtx } from '../../clubsite/render/ctx';
import { box, smoothLine } from '../../clubsite/render/geo';
import type { Elem } from '../../clubsite/render/toon';
import { makeAsset } from '../assets';
import { BLEACHER, MAIN_DOOR_X } from '../assets/school';
import type { DetailCtx, InstItem } from '../build';
import { ribbon } from '../build';
import { type Bldg, BUILDINGS_RAW, GREENS, ROADS_SRC, S, type V2 } from '../layout';
import { TOWN_EL } from '../palette';
import { DECKS, type DeckRect, type DeckStair, parkDeckYSrc as parkDeckY, STAIRS, stairRect } from '../parkdeck';
import { MOVE, schoolPart } from '../relocate';
import type { PalKey } from '../reuse';
import {
  keepScaleSrc as keepScale,
  keepScale as keepScaleW,
  LONG_M,
  PLAY_KEEP_SRC as PLAY_KEEP,
  TOWN_K,
} from '../townscale';

/** 局部坐标系：原点 (x, z)、绕 y 转 r（同 rbox：局部 z 轴 = 世界 (sin r, cos r)） */
interface Fr {
  x: number;
  z: number;
  r: number;
}
const W0: Fr = { x: 0, z: 0, r: 0 };
const at = (f: Fr, lx: number, lz: number): V2 => {
  const c = Math.cos(f.r);
  const s = Math.sin(f.r);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
};
/** 区间减去洞 */
function cut(s0: number, s1: number, holes: readonly (readonly [number, number])[]): [number, number][] {
  let out: [number, number][] = [[s0, s1]];
  for (const [h0, h1] of holes) {
    const next: [number, number][] = [];
    for (const [a, b] of out) {
      if (h1 <= a || h0 >= b) next.push([a, b]);
      else {
        if (h0 > a) next.push([a, h0]);
        if (h1 < b) next.push([h1, b]);
      }
    }
    out = next;
  }
  return out.filter(([a, b]) => b - a > 0.05);
}
// 这个文件只画学校、公园两个模块，坐标都是旧坐标（relocate.ts）：layout 的世界表减掉这个模块的 MOVE 再用
/** 模块自己的小路（旧坐标） */
const road = (id: string) => ROADS_SRC.find((r) => r.id === id);
/** 模块的楼：缩之前、平移以前（旧坐标） */
const bldgSrc = (id: string): Bldg | undefined => {
  const o = BUILDINGS_RAW.find((b) => b.id === id);
  if (!o?.mod) return o;
  const [dx, dz] = MOVE[o.mod];
  return { ...o, x: o.x - dx, z: o.z - dz };
};
/** 模块的绿地（旧坐标） */
const greenSrc = (id: string): V2[] => {
  const q = GREENS.find((g) => g.id === id);
  if (!q) return [];
  const [dx, dz] = MOVE[q.mod];
  return q.poly.map(([x, z]) => [x - dx, z - dz] as V2);
};
/** 折线上最近的点 */
function nearestOn(pts: readonly V2[], x: number, z: number): V2 {
  let best = Number.POSITIVE_INFINITY;
  let out: V2 = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const dx = bx - ax;
    const dz = bz - az;
    const L = dx * dx + dz * dz;
    const t = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
    const px = ax + dx * t;
    const pz = az + dz * t;
    const dd = Math.hypot(x - px, z - pz);
    if (dd < best) {
      best = dd;
      out = [px, pz];
    }
  }
  return out;
}

interface Box2 {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** 折线在 x 处的 z（按 x 单调的路；x 超出两头取端点） */
function zAt(pts: readonly V2[], x: number): number {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    if ((x - ax) * (x - bx) <= 0 && ax !== bx) return az + ((bz - az) * (x - ax)) / (bx - ax);
  }
  return Math.abs(x - pts[0][0]) < Math.abs(x - pts[pts.length - 1][0]) ? pts[0][1] : pts[pts.length - 1][1];
}
/** 折线在 z 处的 x（按 z 单调的路；z 超出两头取端点） */
function zAtX(pts: readonly V2[], z: number): number {
  return zAt(
    pts.map(([x, zz]) => [zz, x] as V2),
    z,
  );
}
/** 多边形的外框 */
function bbox(poly: readonly V2[]): Box2 {
  const xs = poly.map((v) => v[0]);
  const zs = poly.map((v) => v[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

/**
 * 地面一层层的高度（米）。build.ts 的：河床 0.012、草地 / 高尔夫 0.015、步道 / 跑道 0.02、跑道（操场）0.025、路 0.03。
 * 这里的每层和压着的那层至少差 0.01（共面闪烁）。
 */
const Y = {
  /** 压在路下面的接驳（停车带、机场停车场的车道） */
  under: 0.018,
  /** 草地上的铺地（球场外场、硬地、广场、池边） */
  pad: 0.03,
  /** 铺地上的一层（内场、匹克球场面、罚球区） */
  court: 0.042,
  /** 线、晒白的斑 */
  line: 0.054,
  /** 线上的裂缝 */
  crack: 0.066,
  /** 人走的小路（压在路边、铺地边上：比路 0.03、铺地 Y.pad 都高 0.012） */
  path: 0.042,
} as const;

/**
 * 一团（树冠）：球面法线（亮顶、中腰、暗底，不是一面一面的宝石），再按轴缩放。
 * 20 个面（detail 0）就够：法线是球面的，读起来是圆的；detail 1 是 80 个面，深井一片柑橘园三角形超预算
 */
function blob(r: number, sx = 1, sy = 1, sz = 1, detail = 0): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.deleteAttribute('uv');
  return g.scale(sx, sy, sz);
}
/** 合并前统一：不带索引、只留 position + normal */
function flatAttrs(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const o = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(o.attributes)) if (k !== 'position' && k !== 'normal') o.deleteAttribute(k);
  if (!o.attributes.normal) o.computeVertexNormals();
  return o;
}
const mergeAll = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map(flatAttrs)) as THREE.BufferGeometry;

// ── 棕榈泉高中（2026-11-18 用户定：学校的任务 = 选拔青训队球员；总监来学校就是来看球、挑人）──────────────
// 版图常数（缩完的世界坐标，米）。校队球场那一块按真实尺寸（townscale.ts 的 PLAY_KEEP 同一个框，往外 0.5 米）。
// 教学楼、体育馆在 layout.ts（两栋都以南墙为轴缩）：教学楼缩完 580…624 × −563…−538，体育馆 657…679 × −517…−498.5。
const SCH = {
  /** 校队球场的北围网（看台、场门、报名桌都挨着它） */
  F: -491.5,
  /** 南围网（对着拉蒙路，风挡布上印着校名） */
  SF: -457,
  /** 西围网（练习墙那一条 640…653） */
  X0: 640,
  /** 一号场的西沿（四片场 653…727，每片 18.5） */
  CX0: 653,
  /** 东围网 */
  X1: 727,
} as const;

/**
 * 学校的玩法锚点（以后做互动用）：名字 → 世界坐标（缩完的）+ 总监在这儿干什么。
 * 挑人的地方都在校队球场一圈：看台、围网边、场门口的教练、练习墙、体育馆门口的排名榜、一号场的选拔日。
 */
export const SCHOOL_SPOTS: Record<string, { x: number; z: number; note: string }> = {
  coach_gate: { x: 691.4, z: -490.4, note: '三号场北场门：校队教练拿着夹板，问他推荐谁、哪个孩子值得看' },
  stand: { x: 699.4, z: -493.6, note: '三号场的看台：坐下看队内赛（不打扰），看完点人' },
  fence_rail: {
    x: 686,
    z: -492.8,
    note: '二号场北围网外：站着隔网看（裂了的场、塌了的网就在眼前 —— 青训要去俱乐部练的理由）',
  },
  hit_wall: { x: 647.5, z: -484, note: '练习墙前：一个天才孩子自己对墙打；和他说话 = 单独试一试' },
  rank_board: { x: 668, z: -497.6, note: '体育馆门口的成绩 / 排名榜：先看数据，再去场上看人' },
  tryout_desk: {
    x: 663.5,
    z: -487.5,
    note: '青训选拔日（一号场）：报名桌、号码布、锥桶、排队的孩子；挑几个进俱乐部青训',
  },
  track: { x: 624, z: -488, note: '跑道东弯：体育课跑圈的孩子，跑得快的也是苗子' },
  front_door: { x: 585.3, z: -536.5, note: '教学楼正门（以后：校长办公室，签青训合作）' },
  bus_bay: { x: 588, z: -521, note: '校车湾：放学 / 选拔完，孩子们在这儿上校车' },
};

/**
 * 摆好姿势的骨骼人 → 按（材质, 投不投影）合并的静态网格（世界坐标）。看不见的部件（收起来的球拍）不要。
 * 学校的人是画面上的人（不动、不是镇上的真人），一人十几块网格太费绘制。
 */
function bakeCrowd(list: THREE.Object3D[], name: string): THREE.Group | null {
  if (!list.length) return null;
  const by = new Map<string, { m: THREE.Material; cast: boolean; gs: THREE.BufferGeometry[] }>();
  const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent));
  for (const p of list) {
    p.updateMatrixWorld(true);
    p.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material) || !shown(m)) return;
      const g = flatAttrs(m.geometry.clone().applyMatrix4(m.matrixWorld));
      const k = `${m.material.uuid}:${m.castShadow}`;
      const e = by.get(k) ?? { m: m.material, cast: m.castShadow, gs: [] };
      e.gs.push(g);
      by.set(k, e);
    });
  }
  const out = new THREE.Group();
  out.name = name;
  for (const { m, cast, gs } of by.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(gs) as THREE.BufferGeometry, m);
    mesh.castShadow = cast;
    if (!cast) mesh.userData.noCast = true;
    out.add(mesh);
  }
  return out;
}

/**
 * 日出公园的版图（2026-11-18 公园美术关卡 1）。缩完的世界坐标：公园 756…882 × −434…−315，北边拉蒙路、西边日出大道、
 * 公园路从西边 (745, −336) 斜进来到游泳中心门前 (826, −364)。三处主角都是真尺寸（townscale.ts 的 PLAY_KEEP 用同一组框）：
 * - 公共球场（野球局）：北边一排三片，南北向；1 号场（西）网被偷、路障；2 号场有局；3 号场网塌了还能打。场门在南围网 2、3 号场之间，
 *   门西边一排挂拍的钩子（"拍子排队"）+ "胜者留场"牌、两条等着上场的长椅。
 * - 对墙练习场（天才少年）：球场东边，墙面朝南（镜头只看得见朝南的面）；他站在墙前 8 米磨白的那块。
 * - 公开课：西南草地上一排两张小网（两块 36 英尺的小场），南边一排锥桶，俱乐部的青绿帐篷 + 报名桌、横幅。
 */
const PK_C = { x0: 758, x1: 806.84, z0: -433, z1: -396.4, cx: [767.15, 782.42, 797.69], gate: 790.06 } as const;
const PK_W = { x: 823, z: -427, len: 9, x0: 815, x1: 831, z1: -408, kidX: 823.8, kidZ: -419 } as const;
const PK_L = { x: 770, net: -377, half: 5.485, canopy: [765.5, -364.5] as V2, banner: [774.5, -364.6] as V2 } as const;
/** 玩法锚点（以后做互动用）：名字 → 世界坐标（缩完的）+ 总监在这儿干什么 */
export const PARK_SPOTS: Record<string, { x: number; z: number; note: string }> = {
  entrance: { x: 757, z: -356, note: '入口：公交站下车、公园路口的园牌，往东一条小路穿过公开课到球场门' },
  kid_watch: { x: 821.4, z: -410.6, note: '对墙看少年：练习场南边的长椅，坐着看他打（傍晚）' },
  kid_talk: { x: 825.6, z: -418.5, note: '对墙边搭话：站在他右后方，等他停下来捡球时开口、请他来俱乐部' },
  kid_spot: { x: PK_W.kidX, z: PK_W.kidZ, note: '少年站的地方（墙前 8 米磨白的那块）—— 演出用，不是总监站的' },
  clinic_stand: { x: PK_L.x, z: -374, note: '公开课站位：两张小网中间、学员对面，总监 / 教练在这儿喂球讲课' },
  clinic_line: { x: PK_L.x, z: -369.5, note: '公开课学员排队的地方（锥桶那排）—— 演出用' },
  clinic_table: { x: 765.5, z: -362.6, note: '公开课报名桌：俱乐部青绿帐篷底下，路过的人在这儿登记、领会员传单' },
  pickup_bench: { x: 781.1, z: -393.9, note: '野球局场边长椅：南围网外两条长椅中间，等着上场的人坐这儿、总监坐下来看' },
  racquet_queue: { x: 787.3, z: -395.4, note: '排队挂拍处：场门西边围网上一排钩子，挂上拍子 = 排下一局（胜者留场）' },
  court_gate: { x: PK_C.gate, z: -395.2, note: '被叫下场的场门：2、3 号场之间，有人喊"下一个"总监就从这儿进场' },
  pickup_court: { x: PK_C.cx[1], z: -404, note: '野球局那片场（2 号）的南底线后面：被叫下场以后站这儿发球' },
};

/**
 * 学校、公园各跑一次（detail/index.ts 给每次包一层平移的 DetailCtx：这里的坐标都是旧坐标，见 relocate.ts）。
 * part = 只画哪一块。
 */
export function detailEast(d: DetailCtx, part: 'school' | 'park'): void {
  // ── 不投影的东西：按（区域, 材质, 160 米一块）攒，最后各合并成一个实例（cast = false；锁着照样压暗） ──
  const ncBuckets = new Map<string, { reg: string; key: PalKey; list: THREE.BufferGeometry[] }>();
  let thinMode = false;
  const bb = new THREE.Box3();
  const ctr = new THREE.Vector3();
  const putG = (region: string, key: PalKey, g: THREE.BufferGeometry) => {
    if (!thinMode) {
      d.put(region, key, g);
      return;
    }
    // 有 putThin（build.ts 给的，外面包着小镇比例的 townWrap）就交给它：跟车身、杆子的别的部件一起缩
    if (d.putThin) {
      d.putThin(region, key, g);
      return;
    }
    g.computeBoundingBox();
    bb.copy(g.boundingBox as THREE.Box3).getCenter(ctr);
    const k = `${region}|${key}|${Math.floor(ctr.x / 160)}|${Math.floor(ctr.z / 160)}`;
    const b = ncBuckets.get(k) ?? { reg: region, key, list: [] };
    b.list.push(g);
    ncBuckets.set(k, b);
  };
  /** 里面放的都不投影（围网、网、杆、栏杆、旗、横幅、机翼） */
  const thin = (fn: () => void) => {
    const was = thinMode;
    thinMode = true;
    try {
      fn();
    } finally {
      thinMode = was;
    }
  };

  // ── 小工具（都按局部坐标系） ──
  const reg = (x: number, z: number) => d.regionOf(x, z);
  /** 盒子：局部中心 (lx, lz)、底 y、再绕自己转 rr */
  const cube = (key: PalKey, f: Fr, lx: number, lz: number, w: number, h: number, dp: number, y = 0, rr = 0) => {
    const [x, z] = at(f, lx, lz);
    const g = box(w, h, dp, 0, y, 0);
    if (f.r + rr) g.rotateY(f.r + rr);
    putG(reg(x, z), key, g.translate(x, 0, z));
  };
  /** 世界坐标的盒子 */
  const wcube = (key: PalKey, x: number, z: number, w: number, h: number, dp: number, y = 0, rot = 0) =>
    cube(key, { x, z, r: rot }, 0, 0, w, h, dp, y);
  /** 平铺的矩形（局部范围），法线朝上 */
  const flat = (key: PalKey, f: Fr, lx0: number, lx1: number, lz0: number, lz1: number, y: number) => {
    const g = new THREE.PlaneGeometry(lx1 - lx0, lz1 - lz0)
      .rotateX(-Math.PI / 2)
      .translate((lx0 + lx1) / 2, y, (lz0 + lz1) / 2);
    if (f.r) g.rotateY(f.r);
    g.translate(f.x, 0, f.z);
    const [cx, cz] = at(f, (lx0 + lx1) / 2, (lz0 + lz1) / 2);
    putG(reg(cx, cz), key, g);
  };
  /** 折线带子（世界坐标） */
  const band = (key: PalKey, pts: V2[], half: number | number[], y: number) => {
    if (pts.length < 2) return;
    const m = pts[Math.floor(pts.length / 2)];
    putG(reg(m[0], m[1]), key, ribbon(pts, half, y));
  };
  const blockRect = (f: Fr, lx0: number, lx1: number, lz0: number, lz1: number) =>
    d.block({ poly: [at(f, lx0, lz0), at(f, lx1, lz0), at(f, lx1, lz1), at(f, lx0, lz1)] });
  const blockSeg = (a: V2, b: V2, r = 0.25) => d.block({ a, b, r });
  /** 占地（撒树、电线杆时躲开） */
  const occ: Box2[] = [];
  /** 占地；clr = 同时告诉 build 这块别撒灌木、行道棕榈（铺了、摆了东西的地方） */
  const occupy = (f: Fr, lx0: number, lx1: number, lz0: number, lz1: number, pad = 0, clr = true) => {
    const ps = [at(f, lx0, lz0), at(f, lx1, lz0), at(f, lx1, lz1), at(f, lx0, lz1)];
    const b = {
      x0: Math.min(...ps.map((p) => p[0])) - pad,
      x1: Math.max(...ps.map((p) => p[0])) + pad,
      z0: Math.min(...ps.map((p) => p[1])) - pad,
      z1: Math.max(...ps.map((p) => p[1])) + pad,
    };
    occ.push(b);
    if (clr) d.clear(b);
  };

  // 实例化的小东西：攒起来最后一起放
  const inst = {
    tree: [] as InstItem[],
    citrus: [] as InstItem[],
    palm: [] as InstItem[],
    ball: [] as InstItem[],
    cone: [] as InstItem[],
    agave: [] as InstItem[],
    cactus: [] as InstItem[],
    frond: [] as InstItem[],
  };
  const item = (x: number, z: number, s = 1, rot = 0, y = 0): InstItem => ({ x, z, s, reg: reg(x, z), rot, y });

  /**
   * 围网：局部 a → b 的一道。下面 2.6 米是绿色挡风布（实心暗带），上面一条更暗的"铁丝网"带；gaps = 门洞（沿线距离区间），
   * bare = 挡风布破了的那段（只剩铁丝网）。立柱每 ~6 米一根（≥ 2 纹素），挡路按段。
   */
  const fence = (
    f: Fr,
    a: V2,
    b: V2,
    h: number,
    gaps: (readonly [number, number])[] = [],
    bare: (readonly [number, number])[] = [],
  ) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / L;
    const uz = (b[1] - a[1]) / L;
    const rr = Math.atan2(ux, uz);
    const P = (s: number): [number, number] => [a[0] + ux * s, a[1] + uz * s];
    const low = Math.min(2.6, h);
    // 挡风布、铁丝网、立柱都不投影：傍晚一道 3.6 米的围网投出来是一整条又长又直的黑带
    thin(() => {
      for (const [s0, s1] of cut(0, L, gaps)) {
        for (const [p, q] of cut(s0, s1, bare)) cube('windscreen', f, ...P((p + q) / 2), 0.1, low, q - p, 0, rr);
        for (const [p, q] of bare) {
          const lo = Math.max(p, s0);
          const hi = Math.min(q, s1);
          if (hi > lo) cube('net', f, ...P((lo + hi) / 2), 0.06, low, hi - lo, 0, rr);
        }
        if (h > low) cube('net', f, ...P((s0 + s1) / 2), 0.08, h - low, s1 - s0, low, rr);
        const n = Math.max(1, Math.round((s1 - s0) / 6));
        for (let k = 0; k <= n; k++) cube('ironwork', f, ...P(s0 + ((s1 - s0) * k) / n), 0.16, h + 0.1, 0.16, 0, rr);
        blockSeg(at(f, ...P(s0)), at(f, ...P(s1)), 0.22);
      }
    });
  };
  /** 矩形围网：门 = { side, at（沿那边从左/上量的局部坐标）, w } */
  const fenceRect = (
    f: Fr,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    h: number,
    doors: { side: 'n' | 's' | 'e' | 'w'; at: number; w?: number }[],
    bare: { side: 'n' | 's' | 'e' | 'w'; s0: number; s1: number }[] = [],
  ) => {
    const sides = {
      n: [[x0, z0] as V2, [x1, z0] as V2, x0],
      s: [[x0, z1] as V2, [x1, z1] as V2, x0],
      w: [[x0, z0] as V2, [x0, z1] as V2, z0],
      e: [[x1, z0] as V2, [x1, z1] as V2, z0],
    } as const;
    for (const k of ['n', 's', 'w', 'e'] as const) {
      const [a, b, o] = sides[k];
      const gaps = doors
        .filter((q) => q.side === k)
        .map((q) => [q.at - o - (q.w ?? 1.6) / 2, q.at - o + (q.w ?? 1.6) / 2] as const);
      const br = bare.filter((q) => q.side === k).map((q) => [q.s0 - o, q.s1 - o] as const);
      fence(f, a, b, h, gaps, br);
    }
  };

  /**
   * 一片网球场（局部 z = 长轴），标准尺寸：双打 10.97 × 23.77、单打边线 8.23、发球线离网 6.40、网柱在双打边线外 0.914。
   * 内场（双打线以内）青蓝、外场绿（外场那块由调用方在 Y.pad 整块铺，围网以内都是）—— 和俱乐部的硬地一个样子，手机上一眼认得出。
   * 网（ok / sag 下垂 / none 没了）：暗带 + 白网带 + 中间一条白中带；网和柱子不投影。裂缝只在内场里。
   */
  const court = (f: Fr, net: 'ok' | 'sag' | 'none' = 'ok', cracks = 0, rnd?: () => number) => {
    const LW = 0.1;
    const HL = 11.885;
    const HD = 5.485;
    const HS = 4.115;
    const SV = 6.4;
    flat('court', f, -HD - LW / 2, HD + LW / 2, -HL - LW / 2, HL + LW / 2, Y.court);
    const ln = (lx0: number, lx1: number, lz0: number, lz1: number) => flat('line', f, lx0, lx1, lz0, lz1, Y.line);
    for (const s of [-1, 1]) {
      ln(-HD - LW / 2, HD + LW / 2, s * HL - LW / 2, s * HL + LW / 2);
      ln(s * HD - LW / 2, s * HD + LW / 2, -HL + LW / 2, HL - LW / 2);
      ln(s * HS - LW / 2, s * HS + LW / 2, -HL + LW / 2, HL - LW / 2);
      ln(-HS + LW / 2, HS - LW / 2, s * SV - LW / 2, s * SV + LW / 2);
      ln(-LW / 2, LW / 2, s * (HL - 0.3), s * (HL - LW / 2));
    }
    ln(-LW / 2, LW / 2, -SV + LW / 2, SV - LW / 2);
    const gy = Y.court;
    thin(() => {
      for (const s of [-1, 1]) cube('ironwork', f, s * 6.4, 0, 0.18, 1.07, 0.18, gy);
      if (net !== 'none') {
        const nh = net === 'sag' ? 0.74 : 0.914;
        // 网身朝镜头、永远在背光面：用水桶蓝（暗档 L ~100，和场地同一家蓝）而不是 net 的深靛（L 36），读成透光的网而不是一堵墙
        cube('jug', f, 0, 0, 12.8, nh - 0.12, 0.06, gy);
        cube('netTape', f, 0, 0, 12.82, 0.14, 0.14, gy + nh - 0.12);
        cube('netTape', f, 0, 0, 0.1, nh - 0.12, 0.1, gy);
        blockSeg(at(f, -6.4, 0), at(f, 6.4, 0), 0.15);
      }
    });
    // 裂缝：2 纹素宽的折线 + 下沿（朝镜头）一纹素翘起的亮漆；只在内场的漆面上
    if (cracks && rnd) {
      for (let k = 0; k < cracks; k++) {
        const pts: V2[] = [];
        let lx = -HD + 0.6 + rnd() * 4;
        let lz = (rnd() < 0.5 ? -1 : 1) * (1.5 + rnd() * 8.5);
        for (let i = 0; i < 5; i++) {
          pts.push(at(f, lx, lz));
          lx += 1.2 + rnd() * 1.6;
          lz = Math.max(-HL + 0.5, Math.min(HL - 0.5, lz + (rnd() - 0.5) * 2.4));
          if (lx > HD - 0.4) break;
        }
        if (pts.length < 2) continue;
        band(
          'courtBleach',
          pts.map(([x, z]) => [x, z + 0.1] as V2),
          0.06,
          Y.crack,
        );
        band('courtCrack', pts, 0.09, Y.crack + 0.012);
      }
    }
  };

  /** 小汽车：局部 z = 车头方向的长轴 */
  const car = (x: number, z: number, rot: number, key: PalKey, truck = false) => {
    const f: Fr = { x, z, r: rot };
    thin(() => cube('net', f, 0, 0, 1.7, 0.3, 3.8, 0)); // 底盘：影子被车身的盖住，不投
    cube(key, f, 0, 0, 1.85, 0.72, 4.3, 0.28);
    if (truck) {
      cube(key, f, 0, -0.9, 1.75, 0.66, 1.7, 1.0);
      cube('jug', f, 0, -1.78, 1.6, 0.42, 0.06, 1.12);
      cube('net', f, 0, 1.1, 1.6, 0.08, 1.9, 1.0);
    } else {
      cube(key, f, 0, 0.25, 1.65, 0.58, 2.2, 1.0);
      cube('jug', f, 0, -0.88, 1.5, 0.42, 0.06, 1.08);
    }
    blockRect(f, -0.95, 0.95, -2.2, 2.2);
    occupy(f, -1, 1, -2.3, 2.3, 0.5);
  };

  /** 长椅（局部 x 沿长） */
  const bench = (f: Fr, len = 1.8) => {
    // 旧木头色（wood 的橙太冲，竖着看是一根橙色的杆）
    cube('woodWeathered', f, 0, 0, len, 0.1, 0.45, 0.42);
    cube('woodWeathered', f, 0, 0.2, len, 0.4, 0.08, 0.55);
    for (const s of [-1, 1]) cube('ironwork', f, (s * len) / 2 - s * 0.15, 0, 0.14, 0.42, 0.4);
    blockRect(f, -len / 2, len / 2, -0.3, 0.3);
  };

  /**
   * 几件资产按材质合成一组网格（材质按参数缓存，同一个 key 就是同一个对象）：围网三十来节、球场几块平的一件一件放是一百多次绘制。
   * 合完的组在原点，几何是世界坐标 → 区域按 (rx, rz) 给。只合没有夜灯、没有动画的东西。
   */
  const placeMerged = (objs: THREE.Object3D[], name: string, rx: number, rz: number) => {
    const by = new Map<string, { m: THREE.Mesh; noCast: boolean; list: THREE.BufferGeometry[] }>();
    for (const o of objs) {
      o.updateMatrixWorld(true);
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.Material;
        const noCast = !!m.userData.noCast || !m.castShadow;
        const k = `${mat.uuid}|${noCast}|${m.receiveShadow}|${m.layers.mask}`;
        const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
        // uv / aElem 留着（墙面的砌块图案按 uv 画：wall 空间）；同一组里不是每块都有的，合并前再删
        for (const a of Object.keys(g.attributes))
          if (a !== 'position' && a !== 'normal' && a !== 'uv' && a !== 'aElem') g.deleteAttribute(a);
        const e = by.get(k) ?? { m, noCast, list: [] };
        e.list.push(g);
        by.set(k, e);
      });
    }
    const grp = new THREE.Group();
    grp.name = name;
    for (const { m, noCast, list } of by.values()) {
      for (const a of ['uv', 'aElem'])
        if (!list.every((g) => g.attributes[a])) for (const g of list) if (g.attributes[a]) g.deleteAttribute(a);
      const merged = mergeGeometries(list);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m.material);
      mesh.receiveShadow = m.receiveShadow;
      mesh.layers.mask = m.layers.mask;
      mesh.userData.noCast = noCast;
      grp.add(mesh);
    }
    d.asset(grp, reg(rx, rz));
  };

  /**
   * 树合成一组（按模块：高中拆两块各一组）：冠 + 干两块网格，几何是旧坐标（shiftCtx 平移）。PLAY_KEEP 框里的树真尺寸，别处先乘 TOWN_K；
   * 一组比 LONG_M 大 → townwrap 当长条只把 y 乘 TOWN_K → 组先放大 1/TOWN_K 抵掉（组的中心落在真尺寸框里就不抵）。
   * 一组太小（< LONG_M）townwrap 会当小件再缩一遍 → 那组照旧走实例。
   */
  const placeTrees = (trunk: THREE.BufferGeometry, crown: THREE.BufferGeometry) => {
    if (!inst.tree.length) return;
    const crownMat = d.actx.mat('olive', {
      ramp: [0xaed25a, 0x6a9a46, 0x2c605c],
      lightUp: 0.4,
      bands: [0.18, 0.74],
      noise: 0.36,
      edge: 0.3,
      convex: 0.2,
      elem: { kind: 'leaves', size: [2.4, 2.4], hi: 0.15 },
    });
    const trunkMat = d.actx.mat('branch');
    // 按模块、再按 60 米一格分组（一组跨整个校园 / 公园 = 哪儿都看得见它）
    const byMod = new Map<string, InstItem[]>();
    for (const t of inst.tree) {
      const m = part === 'park' ? 'park' : schoolPart(t.x, t.z);
      const k = `${m}|${Math.floor(t.x / 60)}|${Math.floor(t.z / 60)}`;
      const l = byMod.get(k) ?? [];
      l.push(t);
      byMod.set(k, l);
    }
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const UP = new THREE.Vector3(0, 1, 0);
    for (const [key, list] of byMod) {
      const mod = key.split('|')[0];
      const xs = list.map((t) => t.x);
      const zs = list.map((t) => t.z);
      const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
      if (x1 - x0 < LONG_M && z1 - z0 < LONG_M) {
        d.instance(trunk.clone(), 'branch', list, false);
        d.instance(crown.clone(), 'olive', list);
        continue;
      }
      const cs: THREE.BufferGeometry[] = [];
      const ts: THREE.BufferGeometry[] = [];
      for (const t of list) {
        const k = t.s * (keepScale(t.x, t.z) ? 1 : TOWN_K);
        Q.setFromAxisAngle(UP, t.rot ?? 0);
        M.compose(new THREE.Vector3(t.x, t.y ?? 0, t.z), Q, new THREE.Vector3(k, k, k));
        cs.push(crown.clone().applyMatrix4(M));
        ts.push(trunk.clone().applyMatrix4(M));
      }
      const grp = new THREE.Group();
      grp.name = `valley:${part}:trees:${key}`;
      const cm = new THREE.Mesh(mergeAll(cs), crownMat);
      const tm = new THREE.Mesh(mergeAll(ts), trunkMat);
      tm.userData.noCast = true; // 短干的影子被冠的影子盖住
      grp.add(cm, tm);
      const [dx, dz] = MOVE[mod as keyof typeof MOVE];
      grp.scale.y = keepScaleW((x0 + x1) / 2 + dx, (z0 + z1) / 2 + dz) ? 1 : 1 / TOWN_K;
      d.asset(grp, reg((x0 + x1) / 2, (z0 + z1) / 2));
    }
  };

  if (part === 'park') park();
  else school();
  placeInstances();

  // ════════════════════════════════════════════════════════════════════
  // 日出公园（GREENS.sunrise_park；游泳中心、公园路从 layout 读）
  // ════════════════════════════════════════════════════════════════════
  function park(): void {
    const rnd = d.rng('valley:east:park');
    // 2026-11-18 公园美术关卡 1（版图见文件头的 PK_C / PK_W / PK_L 和 PARK_SPOTS）：总监来公园就三件事 —— 公共球场的野球局、
    // 对墙找天才少年、周末公开课。三处真尺寸（townscale.ts 的 PLAY_KEEP），别的照小镇比例缩（townWrap）。
    // 和网球无关的只留野餐棚 + 游乐场（公园路南边，讲"这是社区公园"）；篮球场、厕所、游泳中心南边的室外池删了，空出来的是草地和树。
    // 竖屏只有 13 米宽（小镇镜头 0.75）：每处主角按一个竖屏关键帧摆（主角在上半屏、锚点在中下、右上小地图那块不放要看的东西）。
    const pk = bbox(greenSrc('sunrise_park'));
    const sw = bldgSrc('swim_center') ?? { x: 847, z: -392, w: 30, d: 20 };
    const lane = road('park_lane');
    const laneZ = (x: number) => (lane ? zAt(lane.pts, x) : pk.z1 - 20);
    const laneN = (x: number) => laneZ(x) - (lane?.w ?? 7) / 2; // 公园路的北沿

    // 2026-11-18 公园美术关卡 2：灰盒换成 assets/park/{court,wall,life}.ts 的资产（批 KC / KW / KL）。位置、PARK_SPOTS、POI 照关卡 1；
    // 挡路、占地照关卡 1，按资产的实际轮廓对上。d.asset 走 townWrap：包围盒中心在 PLAY_KEEP 里的真尺寸，框外照小镇比例。
    /** 一件资产：本地原点放在 (x, y, z)、绕 y 转 rot */
    const mk = (id: string, x: number, z: number, rot = 0, v = 0, y = 0): THREE.Object3D => {
      const { obj } = makeAsset(id, { ...d.actx, variant: v });
      // 台地（parkdeck.ts）上的东西：整体抬到台面
      obj.position.set(x, y + parkDeckY(x, z), z);
      obj.rotation.y = rot;
      return obj;
    };
    /** 平的资产（地面漆、场地）：d.asset 里的 prepare 会把投影打开 → 标成不投影（平面投到自己身上是一片麻点） */
    const flatOnly = (o: THREE.Object3D) => {
      o.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) c.userData.noCast = true;
      });
      return o;
    };
    /** 合成一组时攒在这儿（merged()），否则直接 d.asset */
    let into: THREE.Object3D[] | null = null;
    const place = (id: string, x: number, z: number, rot = 0, v = 0, y = 0) => {
      const o = mk(id, x, z, rot, v, y);
      if (into) into.push(o);
      else d.asset(o);
      return o;
    };
    /**
     * begin() … end() 之间 place 的合成一组。一处主角一组：包围盒中心落在同一个 PLAY_KEEP 框里（或都在框外），townWrap 的判断和一件一件放一样。
     * 灯杆不进组（夜里换灯面材质、灯光圈挂在它身上）
     */
    const begin = () => {
      into = [];
    };
    const end = (name: string, rx: number, rz: number) => {
      const list = into ?? [];
      into = null;
      placeMerged(list, name, rx, rz);
    };

    /** 实例（球、锥桶、树）：落在台上的抬到台面 */
    const it = (x: number, z: number, s = 1, rot = 0, y = 0) => item(x, z, s, rot, y + parkDeckY(x, z));

    // ════ 0. 台地（2026-11-18 美术返工 G4，parkdeck.ts）：三处主角各抬成一个台 ════
    // 平地一整片亮绿没有骨架 → 朝南的挡土墙（太阳在画面后方：永远落暗档 = 一条暗带）+ 墙下一条投影（lessons「沙漠失败复盘」第 2 条）。
    // 墙露出 1 米 = 21 行、0.7 米 = 15 行：矮墙规则（material-spec 第 9 条）—— 实心的石砌墙（岩层石块，不挂缕、不淌沙）+ 顶沿一行亮唇。
    // 立面不接收投影（沙漠复盘第 8 条）；墙本身投影（台下那条影子）。颜色 = hitWall（市政混凝土那一家，暗档冷石板蓝 L 81）。
    {
      /** 小镇镜头一个纹素（米）、竖直面上一屏幕行 */
      const TX = 0.03375;
      const RW = TX / Math.SQRT1_2;
      const RET: Elem = { kind: 'strata', space: 'wall', size: [14, 4], hi: 0.5, q: [9, 999, 0, 0], attr: true };
      const retMat = d.actx.mat('hitWall', { elem: RET, noShadowReceive: true });
      const stepMat = d.actx.mat('hitWall', { noShadowReceive: true, edge: 0.2, convex: 0.15 });
      /** 顶沿的亮唇（一行）：草台 = 比草亮的草沿，外场台 = 外场的亮边色；永远落亮档、不接收投影 */
      const lipMat = (key: PalKey, c: number) =>
        d.actx.mat(key, {
          ramp: [c, c, c],
          tones: undefined,
          bands: [-9, -8],
          noShadowReceive: true,
          edge: 0.05,
          convex: 0,
        });
      /** 一面竖直墙（a → b，法线朝 (nx, nz)）：uv = [沿墙米, 离墙顶米]，aElem.x = 露出的高度（矮墙规则） */
      const face = (a: V2, b: V2, h: number, nx: number, nz: number): THREE.BufferGeometry => {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const hb = -0.05;
        const g = new THREE.BufferGeometry();
        // 两个三角形：a 顶、a 底、b 顶、b 底（正面朝 n）
        const P = [a[0], h, a[1], a[0], hb, a[1], b[0], h, b[1], b[0], hb, b[1]];
        // 从法线那边看，a → b 朝右（t · (nz, −nx) > 0）就是逆时针 0 1 2
        const right = (b[0] - a[0]) * nz - (b[1] - a[1]) * nx;
        const idx = right > 0 ? [0, 1, 2, 2, 1, 3] : [0, 2, 1, 2, 3, 1];
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, h - hb, L, 0, L, h - hb], 2));
        g.setAttribute('aElem', new THREE.Float32BufferAttribute(Array(4).fill([h, 0, 0, 0]).flat(), 4));
        g.setIndex(idx);
        return g;
      };
      // 压顶：浅石，亮档压到 L ≈ 190（和草差 < 60：一条长长的强边缘就是噪点，沙漠复盘第 7 条）
      const copeMat = d.actx.mat('campusConcrete', {
        ramp: [0xc8beb2, 0x9c90a2, 0x5c4c7e],
        tones: undefined,
        elem: TOWN_EL.campusConcrete,
        edge: 0.5,
        convex: 0.3,
      });
      const deck = (dk: DeckRect, top: 'lawn' | 'muniOuter', lip: number) => {
        const { x0, x1, z0, z1, h } = dk;
        const grp = new THREE.Group();
        grp.name = `valley:park:deck:${dk.id}`;
        const walls = mergeGeometries([
          face([x0, z1], [x1, z1], h, 0, 1),
          face([x1, z0], [x0, z0], h, 0, -1),
          face([x1, z1], [x1, z0], h, 1, 0),
          face([x0, z0], [x0, z1], h, -1, 0),
        ]);
        if (walls) grp.add(new THREE.Mesh(walls, retMat));
        // 顶沿亮唇：朝南那面最上一行（只有朝南的面看得见）
        const lipG = new THREE.PlaneGeometry(x1 - x0, RW).translate((x0 + x1) / 2, h - RW / 2, z1 + 0.004);
        const lipM = new THREE.Mesh(lipG, lipMat(top, lip));
        lipM.userData.noCast = true;
        grp.add(lipM);
        // 台面：外场台自己铺一块（外场漆，比草地低一档的铁锈红 = 对墙场地的框）；草台的草走地面那套（put 进区域桶，同一个 lawn）
        if (top === 'muniOuter') {
          const tg = new THREE.PlaneGeometry(x1 - x0, z1 - z0)
            .rotateX(-Math.PI / 2)
            .translate((x0 + x1) / 2, h + 0.005, (z0 + z1) / 2);
          const tm = new THREE.Mesh(
            tg,
            d.actx.mat('muniOuter', { elem: { ...TOWN_EL.muniOuter, density: [0, 0.02] } }),
          );
          tm.userData.noCast = true;
          grp.add(tm);
        } else flat('lawn', W0, x0, x1, z0, z1, h + 0.015);
        // 压顶（2026-11-21 材质批判 M9：草台北沿从远处看是一条横穿草地的 1 纹素暗线，像两块网格没对齐）：
        // 北、东、西三边台面上一条 0.24 米的浅石压顶（高出台面 0.06：上沿提亮），台沿读成"台"，不是一道缝。台阶那段断开
        {
          const CW = 0.24;
          const gs: THREE.BufferGeometry[] = [];
          const holes = (side: 'e' | 'w') =>
            STAIRS.filter(
              (st) => st.dir === 'e' && Math.abs((side === 'e' ? x1 : x0) - st.x) < 0.5 && st.z > z0 && st.z < z1,
            ).map((st) => [st.z - st.w / 2 - 0.05, st.z + st.w / 2 + 0.05] as const);
          gs.push(box(x1 - x0, 0.06, CW, (x0 + x1) / 2, h, z0 + CW / 2));
          for (const [sd, xx] of [
            ['w', x0 + CW / 2],
            ['e', x1 - CW / 2],
          ] as const)
            for (const [a, b] of cut(z0 + CW, z1, holes(sd))) gs.push(box(CW, 0.06, b - a, xx, h, (a + b) / 2));
          const cg = mergeGeometries(gs.map((q) => q.toNonIndexed()));
          if (cg) {
            for (const a of Object.keys(cg.attributes)) if (a !== 'position' && a !== 'normal') cg.deleteAttribute(a);
            const cm = new THREE.Mesh(cg, copeMat);
            cm.userData.noCast = true;
            grp.add(cm);
          }
        }
        // 台阶（一级一级的盒子：踏面亮档、立面暗档）
        for (const st of STAIRS) {
          const r = stairRect(st);
          const cx = (r.x0 + r.x1) / 2;
          const cz = (r.z0 + r.z1) / 2;
          if (cx < x0 - 3 || cx > x1 + 3 || cz < z0 - 3 || cz > z1 + 3) continue;
          grp.add(stairs(st));
        }
        d.asset(grp, reg((x0 + x1) / 2, (z0 + z1) / 2));
        occupy(W0, x0, x1, z0, z1, 0.3);
      };
      const stairs = (st: DeckStair): THREE.Mesh => {
        const gs: THREE.BufferGeometry[] = [];
        for (let k = 0; k < st.steps; k++) {
          const top = (st.h * (st.steps - k)) / (st.steps + 1);
          const a = k * st.run;
          if (st.dir === 's') gs.push(box(st.w, top, st.run, st.x, 0, st.z + a + st.run / 2));
          else gs.push(box(st.run, top, st.w, st.x + a + st.run / 2, 0, st.z));
        }
        const g = mergeGeometries(gs.map((q) => q.toNonIndexed())) as THREE.BufferGeometry;
        for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
        return new THREE.Mesh(g, stepMat);
      };
      const D = Object.fromEntries(DECKS.map((q) => [q.id, q]));
      // 草沿：比草亮一截（lawn 亮档 #7cb543 → 画面 #8ab044，这条 → 画面约 #a6cc5c）；外场台的唇 = muniOuter 的亮边
      deck(D.courts, 'lawn', 0x98cf55);
      deck(D.wall, 'muniOuter', 0xdc9c82);
      deck(D.clinic, 'lawn', 0x98cf55);
    }

    // ════ 1. 公共球场（野球局）：三片一排，南北向（真实的公园球场都这么摆，下午不晃眼） ════
    const { x0: BX0, x1: BX1, z0: BZ0, z1: BZ1, cx: cxs, gate: GX } = PK_C;
    const CZ = (BZ0 + BZ1) / 2;
    /** 资产的平铺层（外场 0.005、内场 0.015、线 0.025……）整体抬到草地（0.015）上面：外场落在 Y.pad */
    const LIFT = Y.pad - 0.005;
    /** 场面的高度（站在场上的东西：网、路障、球筐） */
    const ONC = LIFT + 0.015;
    begin();
    // 外场（三片场的外场 + 场间，原点 = 围网中心）+ 三片内场：1 号场（西）v1 三道裂缝；2 号场（野球局）v0 后场一块补丁；3 号场 v2 一道裂缝 + 补丁
    place('park-court-bed', (BX0 + BX1) / 2, CZ, 0, 0, LIFT);
    [1, 0, 2].forEach((v, i) => {
      place('park-court', cxs[i], CZ, 0, v, LIFT);
    });
    // 网：1 号场网被偷了（v2 只剩网柱 + 垂到地上的钢缆）、2 号场好的、3 号场塌着（v1，中间 0.62）
    [2, 0, 1].forEach((v, i) => {
      place('park-net', cxs[i], CZ, 0, v, ONC);
      for (const s of [-1, 1]) d.block({ x: cxs[i] + s * 6.4, z: CZ, r: 0.15 });
      if (v !== 2) blockSeg([cxs[i] - 6.4, CZ], [cxs[i] + 6.4, CZ], 0.15);
    });
    // 1 号场的锯马路障（南半场，网南边 4 米）
    place('park-barricade', cxs[0], CZ + 4, 0, 0, ONC);
    blockRect({ x: cxs[0], z: CZ + 4, r: 0 }, -1.3, 1.3, -0.32, 0.32);

    // 围网 3.6 米：一节 6 米（相邻两节共用立柱），每条边按长度平分、本地 x 拉到正好。南北两边转 0°、东西两边转 90°（本地 +x = 世界 −z）。
    // 门：南边 2、3 号场之间（GX，被叫下场走的门，对着从公园路上来的小路）一节 v3 居中；东边（去对墙）最南那节 v3。
    // 破的照关卡 1：挡风布没了只剩铁丝网（v2）—— 南边 1 号场前面那段（正对镜头）、北边 3 号场后面；旁边各一节撕开的（v1）+ 西边一节
    const EG = BZ1 - 36.6 / 12; // 东门 = 东边最南那节的中心（关卡 1 是 BZ1 − 5，挪 2 米到整节上）
    const run = (a: V2, b: V2, vs: number[], rot: number) => {
      const n = vs.length;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      vs.forEach((v, i) => {
        const t = (i + 0.5) / n;
        place('park-fence', a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, rot, v).scale.x = L / n / 6;
      });
    };
    run([BX0, BZ1], [GX - 3, BZ1], [0, 2, 1, 0, 0], 0);
    place('park-fence', GX, BZ1, 0, 3);
    run([GX + 3, BZ1], [BX1, BZ1], [0, 0], 0);
    run([BX0, BZ0], [BX1, BZ0], [0, 0, 0, 0, 0, 0, 1, 2], 0);
    run([BX0, BZ0], [BX0, BZ1], [0, 0, 0, 1, 0, 0], Math.PI / 2);
    run([BX1, BZ0], [BX1, BZ1], [0, 0, 0, 0, 0, 3], Math.PI / 2);
    // 挡路：四边按段（门洞 1.8 米空出来）+ 两扇往场里开着 70° 的门扇
    for (const [x0, x1] of cut(BX0, BX1, [[GX - 0.9, GX + 0.9]])) blockSeg([x0, BZ1], [x1, BZ1], 0.22);
    blockSeg([BX0, BZ0], [BX1, BZ0], 0.22);
    blockSeg([BX0, BZ0], [BX0, BZ1], 0.22);
    for (const [z0, z1] of cut(BZ0, BZ1, [[EG - 0.92, EG + 0.92]])) blockSeg([BX1, z0], [BX1, z1], 0.22);
    blockSeg([GX - 0.82, BZ1], [GX - 0.23, BZ1 - 1.62], 0.08);
    blockSeg([BX1, EG + 0.83], [BX1 - 1.62, EG + 0.24], 0.08);
    occupy(W0, BX0, BX1, BZ0, BZ1, 1.5);
    // 1 号场南围网上一块封场牌（橙底，挂在撕开的那节西半边；原点 = 围网朝外那面）
    place('park-closed-sign', cxs[0] + 4, BZ1 + 0.05);
    // 灯杆（9 米，自带夜里的灯光圈）：围网四角 + 北边中间 + 南边场门东边（让开野球局的关键帧：场门西边是挂拍处）。灯面朝 +z：北排 0°、南排 180°
    for (const [x, z, rot] of [
      [BX0 - 0.8, BZ0 - 0.8, 0],
      [(BX0 + BX1) / 2, BZ0 - 0.8, 0],
      [BX1 + 0.8, BZ0 - 0.8, 0],
      [BX0 - 0.8, BZ1 + 0.8, Math.PI],
      [BX1 + 0.8, BZ1 + 0.8, Math.PI],
      [GX + 3.2, BZ1 + 0.8, Math.PI],
    ]) {
      d.asset(mk('park-light', x, z, rot));
      d.block({ x, z, r: 0.3 });
    }
    // ── 野球局的"这里有局"：场门西边围网上的挂拍处（挂上拍子 = 排下一局 + "胜者留场"木牌）、两条等着上场的长椅、垃圾桶 ──
    place('park-racquet-queue', GX - 2.7, BZ1 + 0.05);
    // 长椅朝北看场里（靠背在 +z）；一条靠背断了一截、一条换过一块新板
    place('park-bench', GX - 6.7, BZ1 + 2.5, 0, 2);
    place('park-bench', GX - 11.2, BZ1 + 2.5, 0, 1);
    for (const x of [GX - 6.7, GX - 11.2]) blockRect({ x, z: BZ1 + 2.5, r: 0 }, -1, 1, -0.34, 0.34);
    place('park-trash', GX + 2.2, BZ1 + 1.2, 0, 1);
    d.block({ x: GX + 2.2, z: BZ1 + 1.2, r: 0.35 });
    // 2 号场后场一筐球
    place('park-ball-hopper', cxs[1] + 3.2, BZ1 - 2.2, 0, 0, LIFT + 0.005);
    d.block({ x: cxs[1] + 3.2, z: BZ1 - 2.2, r: 0.4 });
    // 球：攒在围网脚下（一堆一堆，不撒满）
    const pile = (x: number, z: number, n: number, rx: number, rz: number) => {
      for (let k = 0; k < n; k++) inst.ball.push(it(x + (rnd() - 0.5) * rx, z + (rnd() - 0.5) * rz));
    };
    pile(cxs[1] - 3, BZ1 - 0.5, 5, 3, 0.5);
    pile(cxs[2] + 4, BZ0 + 0.6, 6, 3, 0.6);
    pile(cxs[1] + 1, CZ - 1.2, 3, 2.5, 1);
    end('valley:park:courts', (BX0 + BX1) / 2, CZ);

    // ════ 2. 对墙练习场：天才少年傍晚在这儿打 ════
    {
      const { x: WX, z: WZ, len, x0, x1, z1: SZ, kidX, kidZ } = PK_W;
      begin();
      // 场地 16 × 19（原点 = 场地中心，北沿 = 墙脚）：市政绿 + 离墙 6.4 米的线 + 中线 + 他站的地方磨白（本地 (0.8, −1.5) = kid_spot）
      flatOnly(place('park-wall-court', (x0 + x1) / 2, (WZ + SZ) / 2, 0, 0, LIFT));
      // 墙 9.6 × 3.2（墙面在本地 z 0.2 → 世界 WZ；背后两根扶壁往北伸 1.1 米）。整件不投影：傍晚一道墙投出来是又长又直的黑带
      place('park-wall', WX, WZ - 0.2);
      blockRect(W0, WX - len / 2 - 0.35, WX + len / 2 + 0.35, WZ - 1.55, WZ + 0.1);
      occupy(W0, x0 - 0.6, x1 + 0.6, WZ - 1, SZ + 0.6, 1);
      // 墙脚一排球、场上散的几个
      for (let k = 0; k < 8; k++) inst.ball.push(it(WX - 4 + rnd() * 8, WZ + 0.4 + rnd() * 0.7));
      for (let k = 0; k < 4; k++) inst.ball.push(it(WX - 3.5 + rnd() * 7, WZ + 2.5 + rnd() * 3));
      // 他的红包 + 一筐球（他左手边）
      place('park-kid-gear', kidX - 2.4, kidZ + 0.6, 0, 0, LIFT + 0.006);
      blockRect({ x: kidX - 2.4, z: kidZ + 0.6, r: 0 }, -0.6, 0.6, -0.4, 0.4);
      // 南边一条长椅（朝北看他打）+ 一个垃圾桶；东南一根 6 米老路灯（v1，灯光圈在本地 (−3, −4) → 他站的地方，傍晚就靠它）
      place('park-bench', WX - 1.6, SZ - 2.6, 0, 0, LIFT + 0.006);
      blockRect({ x: WX - 1.6, z: SZ - 2.6, r: 0 }, -1, 1, -0.34, 0.34);
      place('park-trash', WX + 0.4, SZ - 2.4, 0, 0, LIFT + 0.006);
      d.block({ x: WX + 0.4, z: SZ - 2.4, r: 0.35 });
      end('valley:park:wall', WX, (WZ + SZ) / 2);
      d.asset(mk('park-light', x1 - 0.6, kidZ + 7, 0, 1));
      d.block({ x: x1 - 0.6, z: kidZ + 7, r: 0.3 });
    }

    // ════ 3. 公开课（周末）：西南草地上一排两张小网，俱乐部的青绿帐篷 + 报名桌 ════
    {
      const { x: LX, net: NZ, half: H } = PK_L;
      begin();
      // 两块 36 英尺的小场（10.97 × 5.5，红球）：草地上贴的白胶带线，共用中间那条边线
      const LW = 0.1;
      const ln = (x0: number, x1: number, z0: number, z1: number) =>
        flat('line', W0, x0, x1, z0, z1, Y.line + parkDeckY(LX, NZ));
      for (const s of [-1, 1]) ln(LX - 5.55, LX + 5.55, NZ + s * H - LW / 2, NZ + s * H + LW / 2);
      for (const x of [LX - 5.5, LX, LX + 5.5]) ln(x - LW / 2, x + LW / 2, NZ - H + LW / 2, NZ + H - LW / 2);
      // 两张俱乐部的便携小网（5.5 米、青绿管架）：西边那张拉直、东边那张网带中间松一行
      place('park-mini-net', LX - 2.75, NZ, 0, 0);
      place('park-mini-net', LX + 2.75, NZ, 0, 1);
      blockSeg([LX - 5.5, NZ], [LX + 5.5, NZ], 0.15);
      // 锥桶：小场四角各一个、南边一排折线（学员排队做步伐）
      for (const x of [LX - 5.5, LX + 5.5])
        for (const s of [-1, 1]) inst.cone.push(it(x + Math.sign(x - LX) * 0.3, NZ + s * (H + 0.3)));
      for (let k = 0; k < 8; k++) inst.cone.push(it(LX - 4.9 + k * 1.4, NZ + H + 2.6 + (k % 2) * 0.7));
      // 两筐球：教练站的地方（两张网中间的南边，冒尖 + 滚出来两个）、东边网柱旁（平的）
      for (const [x, z, v] of [
        [LX + 0.9, NZ + 2.2, 2],
        [LX + 6.4, NZ - 0.6, 1],
      ]) {
        place('park-ball-hopper', x, z, 0, v);
        d.block({ x, z, r: 0.4 });
      }
      for (let k = 0; k < 6; k++) inst.ball.push(it(LX - 4 + rnd() * 8, NZ - 1.5 - rnd() * 3));
      // 俱乐部的帐篷（青绿 = 俱乐部的颜色）：底下的报名桌（本地 (−0.3, 0.95)）、借拍子的桶（本地 (1.15, 1.15)）都在帐篷里。
      // 挡路包住桌子和桶（到本地 z 1.35），报名桌的站位 clinic_table (765.5, −362.6) 在帐篷南沿外
      const [TX, TZ] = PK_L.canopy;
      place('park-clinic-tent', TX, TZ);
      blockRect({ x: TX, z: TZ, r: 0 }, -1.7, 1.7, -1.7, 1.35);
      for (const s of [-1, 1]) d.block({ x: TX + s * 1.6, z: TZ + 1.6, r: 0.12 });
      // 横幅（两根杆子 + 一块青绿布，朝南：从公园路、公交站过来先看到它）
      const [BXn, BZn] = PK_L.banner;
      place('park-clinic-banner', BXn, BZn);
      for (const s of [-1, 1]) d.block({ x: BXn + s * 1.65, z: BZn, r: 0.22 });
      occupy(W0, LX - 6.2, LX + 6.8, NZ - H - 0.6, TZ + 2, 1);
      end('valley:park:clinic', LX, NZ);
    }

    // ════ 公园里的路（步道，压在草地上）：公交站 → 公开课南边 → 场门；场门前分一条去对墙；公园路尽头 → 游泳中心门口 ════
    const PZ = -356.5; // 从公交站进来那条
    band(
      'path',
      [
        [750.2, PZ],
        [GX, PZ],
      ],
      1.1,
      Y.path,
    );
    // 场门这条：公园路 → 南台阶脚下（地面）；台阶顶 → 场门（台面上，抬 0.8）
    const cs = stairRect(STAIRS[0]);
    const ws = stairRect(STAIRS[2]);
    const DH = parkDeckY(GX, BZ1 + 1);
    band(
      'path',
      [
        [GX, laneN(GX) + 0.4],
        [GX, cs.z1 + 0.1],
      ],
      1.1,
      Y.path,
    );
    band(
      'path',
      [
        [GX, cs.z0 - 0.05],
        [GX, BZ1 + 0.4],
      ],
      1.1,
      Y.path + DH,
    );
    // 去对墙：南台阶脚下往东，沿着球场台的墙脚、再往北上到对墙练习场的台阶（地面）
    band(
      'path',
      [
        [GX + 1.3, cs.z1 + 0.6],
        [PK_W.x0 + 4, cs.z1 + 0.6],
        [ws.x0 + 1.2, ws.z1 + 0.1],
      ],
      1.0,
      Y.path,
    );
    occupy(W0, GX - 1.2, GX + 1.2, PZ - 1.2, laneN(GX), 0);
    occupy(W0, 750, GX, PZ - 1.2, PZ + 1.2, 0);
    // 公园入口的园牌（喷漆的木牌，朝南对着小路；市政的东西：旧木头 + 白字）
    // 公园入口的园牌（市政公园棕的木牌，朝南对着小路）：真尺寸（townscale.ts 的 PLAY_KEEP 单给它一个小框 —— 缩到 0.62 字不到 1 纹素）
    {
      const f: Fr = { x: 762.5, z: PZ - 2.2, r: 0 };
      place('park-sign', f.x, f.z);
      blockRect(f, -1.3, 1.3, -0.2, 0.2);
      occupy(f, -1.5, 1.5, -0.4, 0.4, 0.5);
    }

    // ── 游泳中心（别的区域的楼，不动）：门头招牌 + 雨篷；门前一小块铺地、公园路尽头一条小路过去。南边的室外池删了 ──
    {
      const fz = sw.z + sw.d / 2;
      wcube('signBoard', sw.x, fz + 0.1, 9, 1.3, 0.12, 3.9);
      wcube('signPaint', sw.x, fz + 0.2, 6.5, 0.5, 0.1, 4.3);
      wcube('clothTeal', sw.x, fz + 1.6, 6, 0.24, 3.2, 3.0);
      thin(() => {
        for (const s of [-1, 1]) wcube('metal', sw.x + s * 2.8, fz + 2.9, 0.16, 3.0, 0.16);
      });
      occupy(W0, sw.x - sw.w / 2 - 1, sw.x + sw.w / 2 + 1, sw.z - sw.d / 2, fz + 3.2, 1);
      // 门前铺地（缩完的楼门口在 z −382）
      const [ax0, ax1, az0, az1] = [840, 854, -382, -377.5];
      flat('concrete', W0, ax0, ax1, az0, az1, Y.pad);
      occupy(W0, ax0, ax1, az0, az1, 0.5);
      if (lane) {
        const e = lane.pts[lane.pts.length - 1];
        band(
          'path',
          [
            [e[0] + lane.w / 2, e[1] - 1],
            [ax0 + 2, az1 - 0.6],
          ],
          1.1,
          Y.path,
        );
      }
    }

    // ── 公交站（日出大道边，朝西）、公园路口的斑马线（横过日出大道） ──
    const sr = road('sunrise');
    if (sr && lane) {
      const j = lane.pts[0];
      const bz = j[1] - 17.5;
      const [rx] = nearestOn(sr.pts, j[0], bz);
      const f: Fr = { x: rx + sr.w / 2 + 2, z: bz, r: Math.PI / 2 };
      cube('clothTeal', f, 0, 0.2, 4.2, 0.14, 1.8, 2.4);
      cube('signBoard', f, 0, 0.9, 4.2, 1.8, 0.1, 0.4);
      thin(() => {
        for (const s of [-1, 1]) cube('metal', f, s * 2, 0.9, 0.14, 2.4, 0.14);
        cube('metal', f, 2.6, -0.4, 0.14, 2.6, 0.14);
      });
      cube('wood', f, 0, 0.5, 3.2, 0.1, 0.45, 0.45);
      cube('signBoard', f, 2.6, -0.4, 0.5, 0.5, 0.08, 2.2);
      blockRect(f, -2.1, 2.1, 0.6, 1.0);
      occupy(f, -2.6, 2.6, -0.5, 1.2, 1);
      const cz = j[1] - 7;
      const [cx] = nearestOn(sr.pts, j[0], cz);
      for (let k = 0; k < 6; k++) wcube('line', cx - 4 + k * 1.6, cz, 0.7, 0.02, 3.2, 0.035);
    }
    // 公园路南边一条停车带（三辆车）
    if (lane) {
      const [a, b] = [lane.pts[1], lane.pts[2]];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const u: V2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const n: V2 = [-u[1], u[0]]; // 朝东南（公园南边）
      const rot = Math.atan2(u[0], u[1]);
      const P = (t: number, o: number): V2 => [a[0] + u[0] * t + n[0] * o, a[1] + u[1] * t + n[1] * o];
      // 贴着路边（和路同一层同一个材质：接缝看不出来、也不闪）
      band('asphalt', [P(L * 0.18, lane.w / 2 + 1.4), P(L * 0.9, lane.w / 2 + 1.4)], 1.4, 0.03);
      const CAR: PalKey[] = ['concrete', 'carRed', 'clothWhite'];
      [0.3, 0.45, 0.75].forEach((t, i) => {
        const [x, z] = P(L * t, lane.w / 2 + 1.5);
        car(x, z, rot, CAR[i], i === 2);
      });
    }

    // ── 讲"这是社区公园"的背景：野餐棚 + 儿童游乐场（公园路南边，离镜头最近的一排，不和三处主角抢） ──
    {
      // 野餐棚（四根木柱 + 四坡陶瓦顶 + 两张野餐桌 + 烧烤架）、游乐场（沙坑 + 平台塔 + 滑梯 + 秋千）：都在 PLAY_KEEP 外，照小镇比例走
      // （townWrap：比 LONG_M 大的整件只压低、不缩长宽 → 挡路照资产原尺寸；小的挡路形状会绕自己的中心缩，所以桌子、塔、秋千各用一个 ≥ LONG_M 的框）
      const f: Fr = { x: pk.x0 + 14, z: pk.z1 - 10, r: 0.08 };
      begin();
      place('park-shelter', f.x, f.z, f.r);
      for (const [a, b] of [
        [-3.9, -2.8],
        [3.9, -2.8],
        [-3.9, 2.8],
        [3.9, 2.8],
      ])
        d.block({ x: at(f, a, b)[0], z: at(f, a, b)[1], r: 0.3 });
      blockRect(f, -2.85, 2.65, 1.1, 2.6); // 两张野餐桌（含凳）
      occupy(f, -4.5, 4.5, -3.4, 3.4, 1);
      const gx = pk.x0 + 46;
      const gz = pk.z1 - 11;
      const t: Fr = { x: gx, z: gz, r: 0 };
      place('park-playground', gx, gz);
      blockRect(t, -4.45, 1.1, -1.95, 0.5); // 平台塔 + 梯子 + 滑梯
      blockRect(t, 1.3, 5.9, -0.45, 1.65); // 秋千（A 字架叉开 ±1）
      occupy(W0, gx - 9, gx + 9, gz - 6.5, gz + 6.5, 1);
      end('valley:park:play', gx, gz);
    }

    // ── 树：手摆几团，草地大片留白。G4：每个竖屏关键帧的角上一团高的（框，lessons「组装经验」第 3 条：叶冠屏幕高 v = (地面高 + 树高)·cos45 − z·sin45），
    // 投影不压主角（正午影子落在树南边 1～2 米；傍晚往东 —— 对墙那几棵都在墙北边或台南边，压不到少年站的地方）
    for (const [x, z, s] of [
      [819.5, -433.8, 1.4], // 对墙 左上（墙后）
      [PK_W.x1 + 3.5, PK_W.z - 6, 1.4], // 对墙 右上（墙后）
      [819.6, -401.6, 1.4], // 对墙 左下（台南边、去对墙的小路西边）
      [780.2, -388.6, 1.4], // 野球局 左下（球场台的墙脚南边）
      [764, -385.2, 1.2], // 公开课 左上（草台西北角，影子落在小场北边、不上小网）
      [776, -351.5, 1.3], // 公开课 右下（小路南边）
      [758, -371.5, 1.2], // 入口 左上（草台西沿）
      [806, -382, 1.3],
      [pk.x0 + 3, pk.z1 - 3, 1.2],
      [pk.x0 + 32, pk.z1 - 2, 1.2],
      [pk.x0 + 66, pk.z1 - 3, 1.4],
    ])
      inst.tree.push(it(x, z, s, rnd() * 6));

    // ── 草地的中间层（G4，lessons「组装经验」第 2 条 + material-spec 第 2、10 条）：草地本身是全山谷共用的 lawn（纯色，不改），
    // 公园里手摆 ① 十几块只比草深（墙脚、树下、背阴）或浅（晒黄：长椅前、排队的地方、空地）一点的硬边斑，斑里按 3 米的斑块撒草叶
    // （1 → 30%，blades），窗口里数得出 3 个颜色；② 三十来个草团 / 晒黄团 / 小花 / 墙脚高草（park-grass-tuft），成簇放在墙脚、长椅脚、
    // 场角、步道转弯、树脚下。东边的草地照用户说的留白（只有零星几块斑）。
    {
      const prng = d.rng('valley:east:park:grass');
      const BLADES: Elem = { kind: 'blades', density: [0.01, 0.3], patch: 3 };
      // 2026-11-21：地面的草换成 townLawn（中档往青绿走 #389a74、自带草叶）—— 斑跟着换同一家的三档（深的偏蓝绿、晒黄的偏黄），
      // 只撒草叶的那层（bladesOnly）不要了（底下的草自己有草叶，两层的中档不一样，云影 / 树影里斑的边会露出来）
      const lush = d.actx.mat('lawn', {
        ramp: [0x6ea83c, 0x2e8c6c, 0x225660],
        tones: {
          bands: [
            [0x6ea83c, 0x74b040, 0x68a038],
            [0x2e8c6c, 0x339472, 0x2a8466],
            [0x225660, 0x265d66, 0x1e505a],
          ],
          seam: [0x5c8e30, 0x247a5e, 0x1a4a56],
          hi: [0x84c04c, 0x44a482, 0x346e76],
        },
        elem: BLADES,
      });
      const dry = d.actx.mat('lawn', {
        ramp: [0x9cbc4c, 0x4e9a6e, 0x2c6066],
        tones: {
          bands: [
            [0x9cbc4c, 0xa2c350, 0x96b548],
            [0x4e9a6e, 0x53a173, 0x499369],
            [0x2c6066, 0x30676c, 0x285960],
          ],
          seam: [0x86a240, 0x40845e, 0x22525a],
          hi: [0xb0d25c, 0x62b082, 0x3c747a],
        },
        elem: { ...BLADES, density: [0.01, 0.18], seed: 5 },
      });
      /** 一块硬边斑：n 个角、半径按两道低频起伏（有机形状），高 = 地面（台上的抬到台面）+ 0.007（压在草上、步道下）；铺满的那层 + 0.003 */
      const patchGeo = (x: number, z: number, rx: number, rz: number, lift = 0) => {
        const pts: THREE.Vector2[] = [];
        const n = 18;
        const a0 = prng() * Math.PI * 2;
        const [p1, p2, q1, q2] = [prng() * 6, prng() * 6, 0.1 + prng() * 0.1, 0.06 + prng() * 0.08];
        for (let i = 0; i < n; i++) {
          const a = a0 + (i / n) * Math.PI * 2;
          const k = 1 + q1 * Math.sin(2 * a + p1) + q2 * Math.sin(3 * a + p2) + (prng() - 0.5) * 0.08;
          pts.push(new THREE.Vector2(x + Math.cos(a) * rx * k, -(z + Math.sin(a) * rz * k)));
        }
        const g = new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(-Math.PI / 2);
        g.deleteAttribute('uv');
        return g.translate(0, parkDeckY(x, z) + 0.019 + lift, 0);
      };
      const PATCH: [number, number, number, number, 0 | 1][] = [
        // 野球局：球场台墙脚（背阴、长得好）、台阶两边、长椅前磨黄
        [782.6, -389.7, 2.8, 1.2, 0],
        [786.6, -387.4, 1.9, 1.0, 1],
        [796.5, -389.4, 2.4, 1.3, 0],
        [779.2, -393.3, 1.4, 0.55, 1],
        [783.6, -393.2, 1.5, 0.55, 1],
        // 对墙：台南边一块深的、东南一块晒黄；墙后
        [826.6, -403.6, 2.9, 1.4, 0],
        [831.4, -401.2, 1.7, 1.0, 1],
        [823.5, -430.8, 3.0, 1.3, 0],
        // 公开课草台：小场东边晒黄、西南角深、学员排队那条磨黄、北边背阴
        [781.4, -372.4, 2.4, 2.0, 1],
        [760.6, -367.6, 2.0, 1.5, 0],
        [770.3, -366.9, 4.2, 0.75, 1],
        [779.6, -383.4, 2.2, 1.2, 0],
        [759.8, -379.5, 1.6, 2.2, 1],
        // 入口：小路南边两块、草台墙脚
        [771.8, -353.4, 3.0, 1.4, 0],
        [765.8, -352.4, 1.8, 1.0, 1],
        [758.6, -348.6, 2.4, 1.4, 1],
        [767.4, -347.4, 2.0, 1.1, 0],
        [780.5, -358.6, 2.4, 0.7, 0],
        // 东边留白的草地：零星两块
        [846, -404, 3.2, 1.6, 0],
        [860, -390, 2.6, 1.3, 1],
      ];
      // 按 PLAY_KEEP 的框分组合并（townWrap 按整组包围盒的中心判断：框里的真尺寸；台上的东西要是和地上的合成一组、中心落在框外，
      // 整组 y 乘 0.62，台面上的就沉进台里了）
      const keepOf = (x: number, z: number) =>
        PLAY_KEEP.findIndex((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
      const groups = new Map<number, { x: number; z: number; list: [THREE.Material, THREE.BufferGeometry][] }>();
      const PM = [lush, dry];
      PATCH.forEach(([x, z, rx, rz, k]) => {
        const kb = keepOf(x, z);
        const e = groups.get(kb) ?? { x, z, list: [] };
        e.list.push([PM[k], patchGeo(x, z, rx, rz, 0.003)]);
        groups.set(kb, e);
      });
      for (const [kb, { x, z, list }] of groups) {
        const grp = new THREE.Group();
        grp.name = `valley:park:grass:${kb}`;
        for (const m of PM) {
          const mine = list.filter((q) => q[0] === m);
          if (!mine.length) continue;
          const g = mergeGeometries(mine.map((q) => q[1].toNonIndexed()));
          if (!g) continue;
          const mesh = new THREE.Mesh(g, m);
          mesh.userData.noCast = true;
          grp.add(mesh);
        }
        d.asset(grp, reg(x, z));
      }
      // 草团：[x, z, 变体]（v0 深绿团、v1 晒黄团、v2 小花、v3 墙脚高草）
      const TUFTS: [number, number, number][] = [
        // 球场台墙脚、长椅脚、台阶脚、树脚
        [779.6, -392.0, 0],
        [783.8, -392.0, 3],
        [787.3, -391.9, 2],
        [793.4, -392.0, 0],
        [797.6, -391.9, 1],
        [776.3, -393.5, 1],
        [785.3, -393.4, 2],
        [788.4, -390.1, 0],
        [791.8, -390.0, 2],
        [779.3, -388.0, 0],
        [781.1, -387.8, 2],
        // 去对墙的小路转弯、对墙台的墙脚、墙脚两头
        [817.8, -388.6, 2],
        [820.4, -391.0, 0],
        [816.0, -406.2, 3],
        [819.3, -406.2, 0],
        [824.5, -406.2, 2],
        [828.6, -406.1, 1],
        [818.9, -401.0, 1],
        [818.0, -426.6, 3],
        [829.6, -426.7, 0],
        // 公开课草台的墙脚、小场四角外、帐篷脚
        [760.5, -359.2, 0],
        [764.6, -359.2, 2],
        [773.7, -359.2, 3],
        [778.4, -359.2, 0],
        [783.0, -359.2, 2],
        [763.2, -383.7, 0],
        [777.0, -383.4, 2],
        [777.0, -370.6, 1],
        [767.8, -362.4, 0],
        [762.9, -362.7, 1],
        // 小路转弯（场门那条往北拐的地方）、园牌脚下
        [788.7, -357.9, 2],
        [791.5, -355.1, 0],
        [760.9, -358.3, 2],
        [764.3, -358.2, 0],
        // 东半边（2026-11-21）：步道转弯、长椅脚、墙脚
        [864.6, -403.5, 2],
        [868.6, -399.5, 0],
        [863.8, -364.2, 1],
        [858.2, -362.6, 2],
        [846.6, -366, 0],
        [873.8, -342.5, 0],
        [880.6, -380, 3],
        [880.6, -352, 3],
        [880.6, -326, 0],
        [855.2, -431.6, 3],
        [866.6, -431.6, 0],
      ];
      for (let kb = -1; kb < PLAY_KEEP.length; kb++) {
        const mine = TUFTS.filter(([x, z]) => keepOf(x, z) === kb);
        if (!mine.length) continue;
        begin();
        for (const [x, z, v] of mine) place('park-grass-tuft', x, z, prng() * 6, v);
        end(`valley:park:tufts:${kb}`, mine[0][0], mine[0][1]);
      }
    }

    // ── 东半边（2026-11-21 小镇压紧 · 关卡 2，构图批判 C11）：用户 11-18 定的"东边留白（树 + 草）"不变 —— 不加游乐场（公园路南边已有一座）。
    // 只给这片草地骨架：朝主街的入口（两根石柱）→ 一条步道往南 → 绕一圈的环形步道（2 米），环外一圈树（树影 = 暗块），
    // 环里三张带伞的野餐桌；东沿一道矮石墙（G5，0.5 米），墙外一排棕榈接主街的行道树；北沿（主街那边）一道矮墙到入口。
    {
      // 环形步道：中心 (858, −344)，长短半径 14 × 17（旧坐标）；外圈、内圈各 1 米
      const LC: V2 = [858, -344];
      const ring = (dr: number): V2[] => {
        const out: V2[] = [];
        for (let i = 0; i < 72; i++) {
          const a = (i / 72) * Math.PI * 2;
          // 两道低频起伏：不是一个正椭圆
          const k = 1 + 0.06 * Math.sin(2 * a + 0.7) + 0.04 * Math.sin(3 * a + 2.1);
          out.push([LC[0] + Math.cos(a) * (14 * k + dr), LC[1] + Math.sin(a) * (17 * k + dr)]);
        }
        return out;
      };
      const pathG = (outer: V2[], inner: V2[], y: number) => {
        const g = new THREE.ShapeGeometry(
          Object.assign(new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z))), {
            holes: [new THREE.Path(inner.map(([x, z]) => new THREE.Vector2(x, -z)))],
          }),
        ).rotateX(-Math.PI / 2);
        g.deleteAttribute('uv');
        return g.translate(0, y, 0);
      };
      putG(reg(...LC), 'path', pathG(ring(1), ring(-1), Y.path));
      // 入口 → 环的北头：主街人行道南沿（−434）往南，贴着游泳中心东边
      const north = smoothLine(
        [
          [860, -434.6],
          [860.5, -420],
          [866, -402],
          [867, -385],
          [862.5, -361],
        ],
        1.5,
      );
      band('path', north, 1.0, Y.path);
      // 环的西边 → 游泳中心门前的铺地
      band(
        'path',
        smoothLine(
          [
            [845.2, -350],
            [844, -364],
            [847, -377.6],
          ],
          1.2,
        ),
        1.0,
        Y.path,
      );
      // 树：环外一圈 7 棵（北头、西头接步道的地方让开），北边沿入口步道两边 4 棵（树下的影子落在步道上 = 一条明暗交替的林荫道）
      for (const [x, z, sc] of [
        [878.5, -356, 1.35],
        [877, -331, 1.25],
        [864, -320.5, 1.4],
        [845, -322, 1.2],
        [836.5, -340, 1.35],
        [878, -373, 1.2],
        [840, -366.5, 1.15],
        [853.5, -425, 1.3],
        [869.5, -426, 1.2],
        [855.5, -405, 1.25],
        [874, -401, 1.35],
        [840, -431, 1.15],
      ])
        inst.tree.push(it(x, z, sc, rnd() * 6));
      // 野餐桌（伞：红、黄、蓝）：环里三张，一张在北边树下
      begin();
      for (const [x, z, v] of [
        [852.5, -347, 0],
        [861.5, -337.5, 1],
        [864.5, -350.5, 2],
        [849, -415.5, 1],
      ]) {
        place('campus-picnic', x, z, (rnd() - 0.5) * 0.5, v);
        d.block({ x, z, r: 1.2 });
      }
      // 长椅：入口步道两边各一条（朝步道）、环的东南外沿一条（朝环里）；垃圾桶
      for (const [x, z, rot] of [
        [863.2, -412, -Math.PI / 2],
        [856.8, -393, Math.PI / 2],
        [872.6, -340, -Math.PI / 2 + 0.25],
      ]) {
        place('park-bench', x, z, rot, 0);
        blockRect({ x, z, r: rot }, -1, 1, -0.34, 0.34);
      }
      place('park-trash', 863, -416.5, 0, 0);
      d.block({ x: 863, z: -416.5, r: 0.35 });
      end('valley:park:east', 860, -380);

      // 夜里：入口步道中段、环的东南各一根 6 米老路灯（park-light v1，灯光圈落在步道上）
      for (const [x, z, rot] of [
        [869.2, -394, Math.PI / 2],
        [873.4, -333.5, Math.PI / 2],
      ]) {
        d.asset(mk('park-light', x, z, rot, 1));
        d.block({ x, z, r: 0.3 });
      }
      // 入口：两根石柱（campus-gate，夜里柱顶的灯亮），柱间 3.9 米 = 步道 + 两边草
      d.asset(mk('campus-gate', 860, -433.3));
      for (const s of [-1, 1]) d.block({ x: 860 + s * 2.3, z: -433.3, r: 0.45 });
      // 矮墙（0.8 米 → 跟小镇压低到 0.5）：叠石 + 浅色压顶。北沿 833…入口…882、东沿 882 一路到南沿
      const WH = 0.8;
      const wall = (a: V2, b: V2) => {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const f: Fr = { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, r: Math.atan2(b[0] - a[0], b[1] - a[1]) };
        cube('desertStone', f, 0, 0, 0.45, WH, L, 0);
        cube('civicSand', f, 0, 0, 0.6, 0.14, L + 0.15, WH);
        blockSeg(a, b, 0.3);
      };
      wall([833, -433.6], [858, -433.6]);
      wall([862, -433.6], [881.8, -433.6]);
      // 东墙在世界 z 28（旧 −417）开一个口：停车场过来的人从这儿进公园，一条小路往西接入口步道
      wall([881.8, -433.6], [881.8, -419]);
      wall([881.8, -415], [881.8, -316]);
      band(
        'path',
        [
          [881.6, -417],
          [870, -417.4],
          [861.2, -418],
        ],
        1.0,
        Y.path,
      );
      d.clear({ x0: 832, x1: 888, z0: -436, z1: -314 });

      // ── G5（2026-11-21 第 3 轮，构图批判 2：一刀直边 + 种在沙里的一排棕榈 + 一条断头路）──
      // 墙外一条 3 米陶砖人行道（接主街南边的人行道），棕榈进 1.4 米方树坑（adobe 沿 + 碎石）；
      // 日落巷西段（layout 的 res_se2，世界 z 45 往西到 x 482 就断头）的头上开一个公园停车场（世界 481…507 × 18…38），断头路成了停车场入口
      const SW: [number, number] = [882.1, 885.1];
      flat('tile', W0, SW[0], SW[1], -434.5, -315, Y.pad + 0.004);
      for (let z = -428; z <= -320; z += 12) {
        if (z > -407 && z < -393) continue; // 让开日落巷的路头
        inst.palm.push(item(884.0, z, 1.0, rnd() * 6));
        cube('adobe', { x: 884.0, z, r: 0 }, 0, 0, 1.4, 0.1, 1.4, 0);
        flat('gravelYard', W0, 883.4, 884.6, z - 0.6, z + 0.6, Y.path + 0.02);
        d.block({ x: 884.0, z, r: 0.6 });
      }
      // 公园停车场：lotPave（板缝 + 碎石），四周 0.15 米路缘，北、南两排车位（2.7 米一格，lotPaint 2 纹素线），
      // 两头花池岛（碎石 + 棕榈），一半车位停着车；南沿中间 6 米口子接日落巷的路头
      {
        const [L0, L1, Z0, Z1] = [887, 913, -427, -407];
        flat('lotPave', W0, L0, L1, Z0, Z1, Y.under);
        flat('lotPave', W0, 896, 904, Z1, -403.3, Y.under);
        const kerb = (a: V2, b: V2) => {
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          cube(
            'concrete',
            { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, r: Math.atan2(b[0] - a[0], b[1] - a[1]) },
            0,
            0,
            0.25,
            0.15,
            L,
            0,
          );
        };
        kerb([L0, Z0], [L1, Z0]);
        kerb([L0, Z0], [L0, Z1]);
        kerb([L1, Z0], [L1, Z1]);
        kerb([L0, Z1], [896, Z1]);
        kerb([904, Z1], [L1, Z1]);
        const CARS: PalKey[] = ['carRed', 'clothBlue', 'clothWhite', 'concrete', 'flowerYellow', 'metal'];
        let ci = 0;
        for (const [za, zb, rot] of [
          [Z0, Z0 + 5, Math.PI],
          [Z1 - 5, Z1, 0],
        ] as const) {
          for (let k = 0; k <= 8; k++) {
            const x = L0 + 3 + k * 2.7;
            flat('lotPaint', W0, x - 0.05, x + 0.05, za, zb, Y.under + 0.008);
            if (k < 8 && (k + (rot ? 1 : 0)) % 2 === 0 && !(rot === 0 && x > 894 && x < 904))
              car(x + 1.35, (za + zb) / 2, rot + (rnd() - 0.5) * 0.05, CARS[ci++ % CARS.length]);
          }
        }
        // 花池岛（西头两个）：adobe 沿 + 碎石 + 棕榈
        for (const z of [Z0 + 2.5, Z1 - 2.5]) {
          cube('adobe', { x: L0 + 1.4, z, r: 0 }, 0, 0, 2.2, 0.25, 4.2, 0);
          flat('gravelYard', W0, L0 + 0.4, L0 + 2.4, z - 2, z + 2, 0.26);
          inst.palm.push(item(L0 + 1.4, z, 0.95, rnd() * 6, 0.25));
          blockRect({ x: L0 + 1.4, z, r: 0 }, -1.1, 1.1, -2.1, 2.1);
        }
        occupy(W0, L0, L1, Z0, -403.3, 0.5);
      }

      // ── 公园西路东沿（构图批判 C16：贴公园那边还是沙、没有行道树）：路边 3 米陶砖人行道 + 树坑棕榈（10 米一棵），
      // 人行道和公园之间一条草；两个台之间、草台南边到公园路那两段公园边上一道矮石墙 + 铁栏杆 ──
      {
        const sr2 = road('sunrise');
        if (sr2) {
          const ex = (z: number) => zAtX(sr2.pts, z) + sr2.w / 2;
          const strip = (z0: number, z1: number) => {
            const pts: V2[] = [];
            const pin: V2[] = [];
            for (let z = z0; z <= z1 + 0.01; z += 2) {
              pts.push([ex(z) + 1.8, z]);
              pin.push([(ex(z) + 3.3 + 756) / 2, z]);
            }
            band('tile', pts, 1.5, Y.pad + 0.004);
            band(
              'lawn',
              pin,
              pin.map(([x]) => 756 - x + 0.05),
              Y.pad,
            );
          };
          strip(-434.5, -340);
          strip(-332, -315.5);
          for (let z = -428; z <= -320; z += 10) {
            if ((z > -359 && z < -348) || (z > -341 && z < -331)) continue; // 公交站、园门小路、公园路口
            const x = ex(z) + 2.4;
            inst.palm.push(item(x, z, 0.95, rnd() * 6));
            cube('adobe', { x, z, r: 0 }, 0, 0, 1.4, 0.1, 1.4, 0);
            flat('gravelYard', W0, x - 0.6, x + 0.6, z - 0.6, z + 0.6, Y.path + 0.02);
            d.block({ x, z, r: 0.6 });
          }
          for (const [z0, z1] of [
            [-392.2, -386.8],
            [-354.9, -341],
          ]) {
            const f: Fr = { x: 755.7, z: (z0 + z1) / 2, r: 0 };
            cube('desertStone', f, 0, 0, 0.45, 0.8, z1 - z0, 0);
            cube('civicSand', f, 0, 0, 0.6, 0.14, z1 - z0 + 0.15, 0.8);
            thin(() => cube('ironwork', f, 0, 0, 0.08, 0.08, z1 - z0, 1.7));
            thin(() => {
              for (let z = z0; z <= z1 + 0.01; z += 1.8)
                cube('ironwork', { x: 755.7, z, r: 0 }, 0, 0, 0.08, 0.8, 0.08, 0.94);
            });
            blockSeg([755.7, z0], [755.7, z1], 0.3);
          }
          d.clear({ x0: 742, x1: 756, z0: -436, z1: -314 });
        }
      }
    }

    // 学校东边那块（第 3 轮，世界 514.4…518 × −66…−10，贴五金进口路）：学校模块的旧坐标在这一条落进 schoolCourts 的框、够不着，
    // 公园模块的平移是整块的（没有分块），在这儿按世界坐标减 MOVE.park 补上（校车车库的停车坪、往南的草）
    {
      const w = (x: number, z: number): V2 => [x - MOVE.park[0], z - MOVE.park[1]];
      const [ax, az] = w(514.4, -66);
      const [bx, bz] = w(518, -40);
      flat('yardGravel', W0, ax, bx, az, bz, Y.under);
      const [, cz] = w(0, -10);
      flat('lawn', W0, ax, bx, bz, cz, Y.pad);
      occupy(W0, ax, bx, az, cz, 0);
      // 再往北到围网（世界 514.4…528.5 × −131…−66）：碎石
      const [gx0, gz0] = w(514.4, -131.3);
      const [gx1, gz1] = w(528.5, -66);
      flat('gravelYard', W0, gx0, gx1, gz0, gz1, Y.pad);
      occupy(W0, gx0, gx1, gz0, gz1, 0);
      // 车库东边到五金那条（世界 518…528.5 × −66…−48，五金停车场车道北边）
      const [hx0, hz0] = w(518, -66);
      const [hx1, hz1] = w(528.5, -48);
      flat('gravelYard', W0, hx0, hx1, hz0, hz1, Y.pad);
      occupy(W0, hx0, hx1, hz0, hz1, 0);
      for (const [x, z] of [w(521, -100), w(524.5, -80), w(518.5, -122)]) {
        inst.agave.push(item(x, z, 0.85, rnd() * 6));
        inst.agave.push(item(x + 1.2, z + 0.7, 0.6, rnd() * 6));
        inst.cactus.push(item(x - 0.9, z + 0.3, 0.9, rnd() * 6));
      }
    }

    // 公园入口那对棕榈（公园路两边）
    if (lane) {
      const x = pk.x0 + 1;
      for (const s of [-1, 1]) inst.palm.push(item(x, laneZ(x) + s * 6.5, 1.0, rnd() * 6));
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // 棕榈泉高中（2026-11-18 青训选拔；关卡 3：资产 assets/school.ts 组装进来；版图常数在文件头的 SCH，锚点 SCHOOL_SPOTS）
  // ════════════════════════════════════════════════════════════════════
  // 构图：主角 = 校队球场（四片，真实尺寸）+ 三号场北头的看台（也是真实尺寸，PLAY_KEEP 第二个框）。总监来学校先到这儿：
  // 看台上坐着看队内赛、栏杆外站着看、场门口的教练、西头练习墙一个孩子自己打；体育馆门口贴着排名榜。
  // 平时 = 校队训练（三片场上三对孩子对打）；?event=tryout = 青训选拔日（一号场：报名帐篷、横幅、锥桶、排队的孩子、拿夹板的老师）。
  // 学校本身：冷灰砌块墙（build.ts）+ 酒红 + 浅金（school-main-front / school-gym-front）；白色平顶连廊（程序几何：
  // 长条跨 70 米，按材质合并进区域桶比一跨一件资产省绘制）从正门一路通到球场；前庭、旗杆、电子字牌、两辆黄校车；
  // 午餐区（遮阳帆 + 长桌）；停车场太阳能车棚；外圈围网（暗带、不投影）；足球场两绿割草条纹。
  // 人是画面上的人（clubsite/people 的骨骼人，定格的姿势），不是镇上的真人。
  // 小镇的比例：贴着教学楼、体育馆（缩之前的脚印 + 2 米）的照缩之前写，townwrap 跟楼一起缩；别处照缩完的坐标写；
  // 球场 / 看台框（PLAY_KEEP）里的不缩。长条（连廊顶、外圈围网、遮阳帆、车棚）townwrap 只压低（高度写缩之前的）。
  function school(): void {
    const rnd = d.rng('valley:east:school');
    const K = TOWN_K;
    const { F, SF, X0, CX0, X1 } = SCH;
    const CZ = (F + SF) / 2;
    const EVENT = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('event');
    const TRYOUT = EVENT === 'tryout';
    // 缩之前、旧坐标的楼；两栋都以南墙为轴缩：南墙的 z 不变，东西往中线收
    const mb = bldgSrc('school_main') ?? { x: 602, z: -558, w: 70, d: 40, h: 9 };
    const gym = bldgSrc('school_gym') ?? { x: 668, z: -513.5, w: 36, d: 30, h: 10 };
    const [TKX, TKZ] = S(795, -700);
    const mz1 = mb.z + mb.d / 2; // 教学楼南墙（= 缩完的南墙）
    const gz1 = gym.z + gym.d / 2; // 体育馆南墙
    /** 缩完的教学楼西头、正门 */
    const fx0 = mb.x - (mb.w * K) / 2;
    const EX = mb.x + MAIN_DOOR_X * K;

    /** 放一件资产（原点 = 落地点）。town = 跟小镇缩、比 LONG_M 长的（校车）：先把长宽缩好，townwrap 当长条只压低 → 三个方向都是 TOWN_K */
    const place = (id: string, x: number, z: number, o: { rot?: number; v?: number; town?: boolean } = {}) => {
      const { obj } = makeAsset(id, o.v ? { ...d.actx, variant: o.v } : d.actx);
      obj.position.set(x, 0, z);
      obj.rotation.y = o.rot ?? 0;
      if (o.town) obj.scale.set(K, 1, K);
      d.asset(obj);
      return obj;
    };
    /**
     * 画面上的人（骨骼人定格一个姿势）：rot 0 = 脸朝南；seat = [座面高, 脚踏高]（坐着）；look = 头转向的世界点。
     * 骨骼人一个人十几块网格（一个人十几次绘制，影子再来一遍）：摆好姿势以后不放进场景，攒着，最后（bakeCrowd）
     * 按材质烘成几块静态网格（全校二十来个人 ≈ 二三十次绘制）。人不跟小镇缩（见 bakeCrowd）。
     */
    const crowd: { keep: THREE.Object3D[]; town: THREE.Object3D[] } = { keep: [], town: [] };
    type Make = (c: BaseCtx) => THREE.Object3D;
    const person = (
      make: Make,
      v: number,
      x: number,
      z: number,
      rot: number,
      pose: string,
      phase: number,
      o: { seat?: [number, number]; prop?: string | null; look?: [number, number, number]; stride?: number } = {},
    ) => {
      const p = make({ ...d.actx, variant: v } as unknown as BaseCtx);
      if (o.stride) setStride(p, WALK_STRIDE * o.stride);
      if (o.prop !== undefined) p.userData.setProp?.(o.prop);
      if (o.seat) p.userData.setSeat?.(o.seat[0], o.seat[1]);
      p.userData.pose?.(pose, phase);
      p.position.set(x, o.seat ? o.seat[0] : 0, z);
      p.rotation.y = rot;
      p.updateMatrixWorld(true);
      if (o.look) p.userData.lookAt?.(new THREE.Vector3(...o.look));
      (keepScale(x, z) ? crowd.keep : crowd.town).push(p);
      return p;
    };

    // ════ 1. 主角：校队球场（真实尺寸，PLAY_KEEP 框里不缩）════
    flat('surround', W0, X0, X1, F, SF, Y.pad);
    // 四片场：一号 = 训练 / 选拔日、二号 = 面裂了、三号 = 看台那片（最好的场，队内赛）、四号 = 网塌了
    const CXS = [0, 1, 2, 3].map((i) => CX0 + 9.25 + i * 18.5);
    court({ x: CXS[0], z: CZ, r: 0 }, 'ok');
    court({ x: CXS[1], z: CZ, r: 0 }, 'ok', 6, rnd);
    court({ x: CXS[2], z: CZ, r: 0 }, 'ok');
    court({ x: CXS[3], z: CZ, r: 0 }, 'sag', 2, rnd);
    // 三号场北头：场门（教练站的地方）+ 看台
    const STX = CXS[2] + 0.15; // 看台中线
    const SL = BLEACHER.len;
    const gateA = 690.5;
    const railA = STX - SL / 2 - 0.4;
    const railB = STX + SL / 2 + 0.4;
    fenceRect(
      W0,
      X0,
      X1,
      F,
      SF,
      3.6,
      [
        // 北边（看球的那一边）从西头到看台东头不立挡风布，换成 1 米的矮栏杆（下面画）：
        // 3.6 米的暗带会把它后面 2.6 米里的东西（体育馆门口、看台下两排、站着看的人）整个挡住
        { side: 'n', at: (X0 + railB) / 2, w: railB - X0 },
        { side: 'w', at: CZ - 6, w: 2.0 }, // 西门：跑道过来
        { side: 's', at: 646.5, w: 2.0 }, // 南门：拉蒙路人行道
        { side: 'e', at: CZ, w: 2.0 },
      ],
      [
        // 四号场的挡风布破了两段（只剩铁丝网）
        { side: 's', s0: 711, s1: 716.5 },
        { side: 'n', s0: 719.5, s1: 724 },
      ],
    );
    // 北边的矮栏杆：三个场门 = 连廊进来的（练习墙西头）、一二号场之间的（对着体育馆门口）、教练站的（三号场看台西边）
    const GATES: (readonly [number, number])[] = [
      [640.6, 642.6],
      [CX0 + 17.5, CX0 + 19.5],
      [gateA, railA],
    ];
    thin(() => {
      for (const [a, b] of cut(X0, railB, GATES)) {
        wcube('ironwork', (a + b) / 2, F, b - a, 0.1, 0.1, 1.0);
        const n = Math.max(1, Math.round((b - a) / 2.5));
        for (let k = 0; k <= n; k++) wcube('ironwork', a + ((b - a) * k) / n, F, 0.12, 1.05, 0.12);
      }
    });
    for (const [a, b] of cut(X0, railB, GATES)) blockSeg([a, F], [b, F], 0.2);
    // 风挡布上褪色的校名（朝镜头的南面）：北围网四号场一段、南围网对着拉蒙路一长条
    place('school-banner', 717, F + 0.08);
    place('school-banner', 672, SF + 0.08, { v: 1 });
    occupy(W0, X0, X1, F, SF, 1);

    // ── 三号场：看台（真实尺寸，朝南）、看台上的人、教练、队内赛、队员长椅；看台背后的记分牌（跟小镇缩）──
    const SZC = F - 1.0 - BLEACHER.z0; // 看台脚印中心：第一排座板在北网北边 1 米
    place('school-bleacher', STX, SZC);
    blockRect(W0, STX - SL / 2 - 0.1, STX + SL / 2 + 0.1, SZC - 1.7, SZC + 2.1);
    occupy(W0, STX - SL / 2, STX + SL / 2, SZC - 2, SZC + 2.2, 1);
    // 看台上的人（家长、别的学校的探子）：坐在第 1、2、4 排，看三号场
    const seatAt = (k: number): [number, number] => {
      const y = BLEACHER.seat0 + k * BLEACHER.rise;
      return [y, y - BLEACHER.rise + 0.04];
    };
    for (const [lx, k, v] of [
      [-4.4, 1, 1],
      [-3.6, 1, 2],
      [-1.0, 2, 3],
      [1.4, 3, 0],
    ] as const)
      person(player, v, STX + lx, SZC + BLEACHER.z0 - k * BLEACHER.step, 0, k === 2 ? 'clap' : 'sit', 0.15 * k, {
        seat: seatAt(k),
        prop: null,
        look: [CXS[2], 1, CZ - 4],
      });
    // 教练：场门里面，侧身看着三号场（以后头顶冒"…"）
    person(coach, 0, gateA + 0.9, F + 1.2, 0.6, 'idle', 0.3, { prop: null, look: [CXS[2], 1, CZ - 6] });
    // 队内赛：北边底线的孩子（正手）、南边上网的孩子（准备）
    person(player, 0, CXS[2] + 2.0, CZ - 12.6, 0, 'forehand', 0.45);
    person(player, 2, CXS[2] - 1.4, CZ + 5.0, Math.PI, 'ready', 0.2);
    wcube('ball', CXS[2] + 0.9, CZ - 6.5, 0.12, 0.12, 0.12, 1.15);
    bench({ x: CXS[2] + 7.4, z: CZ + 2.6, r: Math.PI / 2 }, 2.4);
    bench({ x: CXS[2] + 7.4, z: CZ - 2.6, r: Math.PI / 2 }, 2.4);
    // 二号场：一对孩子对打（裂了的场上）
    person(player, 1, CXS[1] + 1.2, CZ - 11.2, 0, 'backhand', 0.4);
    person(player, 3, CXS[1] - 2.0, CZ + 10.8, Math.PI, 'ready', 0.6);
    // 记分牌（看台背后，朝南；中线偏西，不进右上角的小地图）
    {
      const x = STX - 4.6;
      const z = F - 8.2;
      place('school-scoreboard', x, z);
      blockRect(W0, x - 2.2, x + 2.2, z - 0.3, z + 0.3);
      occupy(W0, x - 2.2, x + 2.2, z - 0.5, z + 0.5, 0.5);
    }

    // ── 一号场：平时校队训练（一对孩子对打）；选拔日（?event=tryout）= 报名帐篷、横幅、排队的孩子、锥桶、球车、老师 ──
    if (TRYOUT) {
      const tx = CX0 + 10.5; // 报名桌（一、二号场之间的场门进来往西 8 米）
      const tz = F + 3.4;
      place('tryout-tent', tx, tz);
      d.block({ x: tx, z: tz + 0.5, r: 1.3 });
      place('school-banner', CX0 + 5.5, F + 0.08, { v: 2 });
      // 排队的孩子：从场门进来，朝西对着桌子
      for (let i = 0; i < 5; i++)
        person(kid, i % 3, tx + 2.6 + i * 0.95, tz + 0.7 + (rnd() - 0.5) * 0.3, -Math.PI / 2, 'idle', rnd(), {
          prop: null,
        });
      // 锥桶两排（绕桩跑），球车，拿夹板的老师，一个正在绕桩跑的孩子
      for (let j = 0; j < 6; j++) {
        inst.cone.push(item(CXS[0] - 3.4 + j * 1.35, CZ - 9.4));
        inst.cone.push(item(CXS[0] - 3.4 + j * 1.35, CZ - 5.6));
      }
      wcube('metal', CXS[0] + 4.2, CZ - 7.5, 0.8, 0.8, 0.6);
      wcube('ball', CXS[0] + 4.2, CZ - 7.5, 0.7, 0.25, 0.5, 0.8);
      person(coach, 1, CXS[0] + 4.4, CZ - 9.3, -Math.PI / 2, 'idle', 0.5, { prop: null });
      person(kid, 1, CXS[0] - 1.4, CZ - 7.5, Math.PI / 2, 'walk', 0.3, { prop: null });
      for (let k = 0; k < 7; k++) inst.ball.push(item(CXS[0] - 4 + rnd() * 9, CZ - 4 + rnd() * 2.5));
    } else {
      person(player, 1, CXS[0] + 3.0, CZ - 11.0, 0, 'forehand', 0.3);
      person(player, 0, CXS[0] + 1.5, CZ + 11.4, Math.PI, 'ready', 0.4);
      wcube('metal', CX0 + 17.2, CZ - 13.4, 0.8, 0.8, 0.6);
      wcube('ball', CX0 + 17.2, CZ - 13.4, 0.7, 0.25, 0.5, 0.8);
    }

    // ── 西头一条：练习墙（一个天才孩子自己打，墙前一块蓝硬地、一块磨白的地）──
    {
      // 墙 643.5…652（西头让出连廊进来的场门）
      const w0 = X0 + 3.5;
      const w1 = CX0 - 1;
      const wx = (w0 + w1) / 2;
      flat('court', W0, w0 - 0.5, w1 + 0.5, F + 1.5, F + 10.5, Y.court);
      place('hit-wall', wx, F + 1.2);
      blockRect(W0, w0, w1, F + 1.0, F + 1.4);
      flat('courtBleach', W0, wx - 1.9, wx + 1.9, F + 6.2, F + 8.6, Y.line);
      person(kid, 0, wx - 0.2, F + 7.4, Math.PI, 'forehand', 0.55);
      wcube('clothBlue', CX0 - 2.6, F + 9.8, 0.8, 0.3, 0.35);
      for (let k = 0; k < 6; k++) inst.ball.push(item(wx - 4 + rnd() * 8, F + 1.8 + rnd() * 1.2));
    }

    // ════ 2. 体育馆：门面（贴着楼，照缩之前写：门、高窗、校名带、储物柜）+ 排名榜 ════
    place('school-gym-front', gym.x, gym.z);
    place('rank-board', gym.x, gz1 + 0.04);
    // 体育馆门口到球场北边栏杆之间的一条（缩完的坐标）：两条长椅朝南
    for (const x of [661, 675.5]) bench({ x, z: F - 3.6, r: 0 }, 2.2);
    occupy(W0, 655, 682, F - 7, F, 0, true);

    // ════ 3. 教学楼：南立面 + 屋顶（贴着楼，照缩之前写）+ 室外平顶连廊（缩完的坐标，只压低）════
    place('school-main-front', mb.x, mb.z);
    // 连廊：沿教学楼南面（正门那一跨断开）→ 往东过午餐区。
    // 2026-11-21：原来还往南一直到球场的西北场门（x 641.6）；校队球场那块（relocate.ts 的 schoolCourts）挪到校园西边以后，这一段删了。
    // 顶板白、外沿一条酒红封檐；细钢柱每 5 米；高度写缩之前的（3.5 → 缩完 2.2）。
    {
      const CY = 3.5;
      const z0 = mz1 + 0.4;
      const z1 = mz1 + 4.0;
      // 东头停在午餐区东沿（x 638）：再往东是校队球场那块的旧坐标（schoolCourts，挪走了）
      const NX = 636.5;
      const roof = (x0: number, x1: number, za: number, zb: number) => {
        wcube('pvc', (x0 + x1) / 2, (za + zb) / 2, x1 - x0, 0.3, zb - za, CY);
      };
      roof(fx0, EX - 3.6, z0, z1);
      roof(EX + 3.6, NX + 1.5, z0, z1);
      // 封檐（酒红）：南沿、往南那段的两边
      wcube('schoolMaroon', (fx0 + EX - 3.6) / 2, z1, EX - 3.6 - fx0, 0.45, 0.14, CY - 0.15);
      wcube('schoolMaroon', (EX + 3.6 + NX - 1.5) / 2, z1, NX - 1.5 - EX - 3.6, 0.45, 0.14, CY - 0.15);
      // 柱子（细的，不投影：一排柱子傍晚投出一排长条，连廊顶的影子已经够了）
      thin(() => {
        for (let x = fx0 + 1; x < NX - 1.5; x += 5)
          if (Math.abs(x - EX) > 3.8) wcube('metal', x, z1 - 0.25, 0.16, CY, 0.16);
      });
    }

    // ════ 4. 前门：浅灰水泥前庭（分格）、旗杆、电子字牌；前庭南边的校车湾（两辆黄校车）；东边草坪上的午餐区 ════
    // 正门、字牌、旗杆、两辆校车都挤在正门前 15 米宽里：竖屏一屏（at 587,−531）全看得到
    const PX1 = 640; // 前庭东头（接往南的连廊）
    const FZ1 = -527; // 前庭南沿 = 校车湾北沿（黄路缘）
    flat('campusConcrete', W0, 575, PX1, mz1, FZ1, Y.path);
    // 分格缝：材质自己画（TOWN_EL.campusConcrete，1.6 米一道 + 缝后亮条，阴影里也在）。原来这里手摆的 3.5 米 ironwork 细线
    // 和元素的缝两套叠在一起、阴影里是一条条硬黑线（材质批判 M11），2026-11-21 删了
    occupy(W0, 575, PX1, mz1, FZ1, 0.5);
    // 正门前一条 7 米宽的路两边各一块草坪（前庭不是一整片灰；旗杆立在东边那块里）。2026-11-22：草坪北沿离楼 5.5 → 3.5 米
    // （楼影里那条紫灰水泥窄一半，正午饱和度 0.38 → 0.4x）
    for (const [a, b] of [
      [575, EX - 3.5],
      [EX + 3.5, 597],
    ])
      flat('lawn', W0, a, b, mz1 + 3.5, FZ1 - 0.6, Y.crack);
    // 草坪（前庭以南、校车湾以东，到操场北沿）
    flat('lawn', W0, 600, PX1, FZ1, -518.2, Y.path);
    occupy(W0, 600, PX1, FZ1, -518.2, 0.5);
    place('school-flagpole', 591, -530.5);
    d.block({ x: 591, z: -530.5, r: 0.6 });
    place('school-marquee', 583.4, -530.4);
    blockRect(W0, 583.4 - 1.4, 583.4 + 1.4, -530.7, -530.1);
    // 连廊前的花池 + 棕榈
    for (const x of [600, 613, 626]) {
      const z = mz1 + 8.4;
      wcube('cmuGrey', x, z, 2.4, 0.5, 2.0);
      // 池里的土：0.2 米厚的一块（比 FLAT_M 高，跟花池一起缩；平铺的不缩会浮在缩过的池子上）
      wcube('lawn', x, z, 2.0, 0.2, 1.6, 0.32);
      inst.palm.push(item(x, z, 0.9, rnd() * 6, 0.5));
      d.block({ x, z, r: 1.2 });
    }
    // 午餐区（草坪东头，连廊拐角里）：四张长桌、两片遮阳帆
    for (const [x, z] of [
      [630.8, -525.2],
      [630.8, -520.9],
      [636.6, -525.2],
      [636.6, -520.9],
    ]) {
      place('lunch-table', x, z);
      blockRect(W0, x - 1, x + 1, z - 0.9, z + 0.9);
    }
    place('lunch-shade', 630.8, -523.05);
    place('lunch-shade', 636.6, -523.05, { v: 1 });
    // 校车湾：暖碎石（同校车车库的停车坪，yardGravel）。沥青在这一屏是一整条灰，正午饱和度 0.38（2026-11-22）
    flat('yardGravel', W0, 571, 600, FZ1, -521.5, 0.03);
    wcube('flowerYellow', 586, FZ1 + 0.1, 27, 0.02, 0.15, 0.037);
    for (const x of [582, 592.4]) {
      place('school-bus', x, -524.3, { town: true });
      blockRect(W0, x - 2.55, x + 2.55, -525.1, -523.5);
    }
    occupy(W0, 571, 600, FZ1, -521.5, 0.5);
    // 校车湾南沿到操场草地之间一条草（原来露出 3.5 米一条沙；铺浅水泥这一屏饱和度掉到 0.34）
    flat('lawn', W0, 571, 600, -521.5, -517.6, Y.pad);
    occupy(W0, 571, 600, -521.5, -517.6, 0.2);

    // ════ 5. 跑道、足球场（割草条纹）、体育课的孩子 ════
    {
      // 分道线：和 build.ts 的跑道一样大（RingGeometry 13…17、x 方向 × 1.6）
      for (const r of [14, 15, 16]) {
        const g = new THREE.RingGeometry(r - 0.05, r + 0.05, 48)
          .rotateX(-Math.PI / 2)
          .scale(1.6, 1, 1)
          .translate(TKX, 0.037, TKZ);
        putG(reg(TKX, TKZ), 'line', g);
      }
      wcube('line', TKX, TKZ + 15, 0.18, 0.02, 4.0, 0.037);
      // 内场：32 × 16 的足球场，深浅两绿 4 米一条
      const P: Fr = { x: TKX, z: TKZ, r: 0 };
      for (let i = 0; i < 8; i += 2) flat('lawnStripe', P, -16 + i * 4, -12 + i * 4, -8, 8, Y.pad);
      const ln = (a: number, b: number, c: number, e: number) => flat('line', P, a, b, c, e, Y.court);
      for (const s of [-1, 1]) {
        ln(-16, 16, s * 8 - 0.05, s * 8 + 0.05);
        ln(s * 16 - 0.05, s * 16 + 0.05, -8, 8);
      }
      ln(-0.05, 0.05, -8, 8);
      putG(
        reg(TKX, TKZ),
        'line',
        new THREE.RingGeometry(2.9, 3.0, 24).rotateX(-Math.PI / 2).translate(TKX, Y.court, TKZ),
      );
      // 两个球门（campus-goal：白框 ≥ 2 纹素、网是一片浅灰蓝的面；原来 0.14 米的白杆在画面上时有时无）
      for (const s of [-1, 1]) {
        const x = TKX + s * 16;
        place('campus-goal', x, TKZ, { rot: -s * (Math.PI / 2) });
        for (const zz of [-2.6, 2.6]) blockSeg([x, TKZ + zz], [x + s * 1.5, TKZ + zz], 0.15);
      }
      // 体育课：东弯上跑圈的三个孩子（逆时针）+ 看表的老师
      for (const [a, v] of [
        [-0.45, 0],
        [-0.1, 2],
        [0.3, 1],
      ] as const) {
        const x = TKX + Math.cos(a) * 15 * 1.6;
        const z = TKZ + Math.sin(a) * 15;
        // 前进方向（逆时针 = 角度减小）：切线 (sin a · 1.6, −cos a)
        person(player, v, x, z, Math.atan2(Math.sin(a) * 1.6, -Math.cos(a)), 'walk', 0.25 + v * 0.3, { prop: null });
      }
      person(coach, 1, TKX + 19, TKZ - 2, -Math.PI / 2, 'idle', 0.7, { prop: null });
      // 2026-11-21（构图批判 C13：跑道一屏没人）：南北两条直道上再四个跑圈的（步子大一号 = 跑），北边直道外一座看台（真尺寸，人坐得下）
      for (const [dx, sgn, v, ph] of [
        [-2.6, -1, 3, 0.1],
        [0.8, -1, 1, 0.55],
        [1.4, 1, 2, 0.3],
        [4.2, 1, 0, 0.8],
      ] as const) {
        const z = TKZ + sgn * 15 * Math.sqrt(1 - (dx / 24) ** 2);
        person(player, v, TKX + dx, z, sgn * (Math.PI / 2), 'walk', ph, { prop: null, stride: 1.7 });
      }
      {
        const bz = TKZ - 20.6;
        const { obj } = makeAsset('school-bleacher', d.actx);
        obj.position.set(TKX, 0, bz);
        // 12 米长 = 长条：townwrap 只把 y 乘 TOWN_K → 先放大抵掉（真尺寸：座板高 0.45 起，人坐得下）
        obj.scale.y = 1 / K;
        d.asset(obj);
        blockRect(W0, TKX - BLEACHER.len / 2 - 0.1, TKX + BLEACHER.len / 2 + 0.1, bz - 1.8, bz + 2.0);
        occupy(W0, TKX - BLEACHER.len / 2, TKX + BLEACHER.len / 2, bz - 2, bz + 2.2, 1);
        for (const [lx, k, v] of [
          [-3.8, 0, 0],
          [-2.9, 0, 2],
          [1.6, 1, 3],
          [3.9, 3, 1],
        ] as const)
          person(
            player,
            v,
            TKX + lx,
            bz + BLEACHER.z0 - k * BLEACHER.step,
            0,
            k === 1 ? 'clap' : 'sit',
            0.2 * k + 0.1,
            {
              seat: seatAt(k),
              prop: null,
            },
          );
      }
    }

    // ════ 6. 教职工停车场（太阳能车棚）、外圈围网、遮阴树 ════
    {
      const LX0 = 518;
      const LX1 = 562;
      const LZ0 = -578;
      const LZ1 = -546;
      flat('asphalt', W0, LX0, LX1, LZ0, LZ1, 0.03);
      const sl = road('school_lane');
      const cx = 553.5;
      band(
        'asphalt',
        [
          [cx, LZ1 - 1],
          [cx, sl ? nearestOn(sl.pts, cx, LZ1)[1] : LZ1 + 6],
        ],
        1.6,
        0.03,
      );
      const CAR: PalKey[] = ['concrete', 'carRed', 'clothWhite', 'clothBlue', 'metal', 'cap'];
      for (const [z0, z1, cz, rot] of [
        [LZ0, LZ0 + 5.4, LZ0 + 2.7, 0],
        [LZ1 - 5.4, LZ1, LZ1 - 2.7, Math.PI],
      ] as const) {
        for (let k = 0; k <= 15; k++) {
          const x = LX0 + 2 + k * 2.75;
          flat('line', W0, x - 0.05, x + 0.05, z0, z1, Y.court);
          if (k < 15 && rnd() < 0.5 && Math.abs(x + 1.375 - cx) > 3)
            car(x + 1.375, cz, rot + (rnd() - 0.5) * 0.06, CAR[Math.floor(rnd() * CAR.length)]);
        }
        // 太阳能车棚：一整排斜板（南低北高），柱子在中线上每 8 米；townwrap 只压低（3.6 → 2.2）
        place('solar-carport', (LX0 + LX1) / 2, cz);
        for (let x = (LX0 + LX1) / 2 - 19; x < LX1 - 1; x += 8) d.block({ x, z: cz, r: 0.2 });
      }
      occupy(W0, LX0, LX1, LZ0, LZ1, 1);
      for (const dx of [4, 16, 31, 43]) inst.tree.push(item(LX0 + dx, LZ0 - 3, 0.9 + rnd() * 0.25, rnd() * 6));
    }
    // 外圈围网（暗带，不投影；townwrap 只压低）：拉蒙路北边、日出大道西边
    {
      const out = (a: V2, b: V2) => {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const rr = Math.atan2(b[0] - a[0], b[1] - a[1]);
        thin(() => {
          cube('net', { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, r: rr }, 0, 0, 0.06, 2.0, L);
          const n = Math.max(1, Math.round(L / 6));
          for (let k = 0; k <= n; k++)
            wcube('ironwork', a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, 0.14, 2.1, 0.14);
        });
        blockSeg(a, b, 0.2);
      };
      // 2026-11-21：校队球场那块挪到校园西边（relocate.ts 的 schoolCourts），这条只围跑道前面；原来沿日出大道的东边那条删了
      out([580, -454.5], [638, -454.5]);
    }
    // 遮阴树：拉蒙路围网里一排、看台东边
    for (const [x, z] of [
      [588, -458],
      [600, -457.5],
      [612, -458],
      [624, -457.5],
      [712, -497],
      [722, -499],
    ])
      inst.tree.push(item(x, z, 0.95 + rnd() * 0.2, rnd() * 6));

    // ════ 7. 校园北半边（2026-11-21 小镇压紧 · 关卡 2，构图批判 C13 的 G7）：活动教室区、篮球半场、饮水台、练习场、北沿围网 ════
    // 世界坐标 = 这里 + MOVE.school（−124, 448）。教职工停车场南边、学校车道西边那块（世界 384…424 × −96…−62）：2×2 四间活动教室
    // 坐在一块浅色水泥地上（两排之间一条走道，坡道顺着自己的门面下），东边一块篮球半场 + 一排饮水台；
    // 体育馆北边那块空沙（世界 349…375 × −124…−78）铺成练习场（两绿割草条纹 + 两个小门）；校园北沿一道 2.4 米围网（暗带，不画网眼）。
    {
      const fr = (wx: number, wz: number): V2 => [wx + 124, wz - 448];
      // 活动教室区的地：教室坐在草上，两排之间、两列之间各一条浅水泥走道（十字），南头接出去
      {
        const [ax, az] = fr(384.5, -95.5);
        const [bx, bz] = fr(409.5, -71.5);
        flat('lawn', W0, ax, bx, az, bz, Y.pad);
        const [w0, wz0] = fr(384.5, -86.6);
        const [w1, wz1] = fr(409.5, -81.4);
        flat('campusConcrete', W0, w0, w1, wz0, wz1, Y.path);
        const [cx0] = fr(395.4, 0);
        const [cx1] = fr(398.6, 0);
        flat('campusConcrete', W0, cx0, cx1, az, bz, Y.path + 0.006);
        occupy(W0, ax, bx, az, bz, 0.5);
      }
      const objs: THREE.Object3D[] = [];
      const put1 = (id: string, wx: number, wz: number, rot = 0, v = 0) => {
        const [x, z] = fr(wx, wz);
        const { obj } = makeAsset(id, v ? { ...d.actx, variant: v } : d.actx);
        obj.position.set(x, 0, z);
        obj.rotation.y = rot;
        objs.push(obj);
        return [x, z] as V2;
      };
      for (const [wx, wz, v] of [
        [391, -91, 0],
        [403, -91, 1],
        [391, -79, 0],
        [403, -79, 1],
      ]) {
        const [x, z] = put1('campus-portable', wx, wz, 0, v);
        blockRect(W0, x - 4.3, x + 4.3, z - 2.7, z + 2.7);
        // 坡道 + 门前平台（门那头往另一头下，见 assets/school.ts）
        const m = v ? -1 : 1;
        blockRect(W0, Math.min(x - m * 3.5, x + m * 2.9), Math.max(x - m * 3.5, x + m * 2.9), z + 2.6, z + 4.0);
      }
      // 篮球半场（市政绿的场面，照缩完的尺寸 10 × 10）：篮板朝南、罚球区、罚球圈、三分弧
      {
        const [cx, cz0] = fr(417, -95);
        const cz1 = cz0 + 10;
        flat('muniCourt', W0, cx - 5, cx + 5, cz0, cz1, Y.pad);
        const ln = (a: number, b: number, c: number, e: number) => flat('line', W0, a, b, c, e, Y.court);
        ln(cx - 5, cx + 5, cz0, cz0 + 0.1);
        ln(cx - 5, cx - 4.9, cz0, cz1);
        ln(cx + 4.9, cx + 5, cz0, cz1);
        ln(cx - 5, cx + 5, cz1 - 0.1, cz1);
        ln(cx - 1.5, cx - 1.4, cz0, cz0 + 4.6);
        ln(cx + 1.4, cx + 1.5, cz0, cz0 + 4.6);
        ln(cx - 1.5, cx + 1.5, cz0 + 4.5, cz0 + 4.6);
        const arc = (r: number, t0: number, t1: number, z: number) =>
          putG(
            reg(cx, z),
            'line',
            new THREE.RingGeometry(r - 0.07, r + 0.07, 48, 1, t0, t1 - t0)
              .rotateX(-Math.PI / 2)
              .translate(cx, Y.court, z),
          );
        arc(1.5, Math.PI, Math.PI * 2, cz0 + 4.55);
        arc(4.4, Math.PI * 1.08, Math.PI * 1.92, cz0 + 1.2);
        put1('campus-hoop', 417, -94.6);
        d.block({ x: cx, z: cz0 - 0.2, r: 0.4 });
        occupy(W0, cx - 5, cx + 5, cz0, cz1, 0.5);
        // 一个在投篮的、一个等着抢篮板的，球在空中
        person(kid, 1, cx - 0.6, cz0 + 4.2, Math.PI, 'serve', 0.42, { prop: null });
        person(kid, 2, cx + 1.6, cz0 + 2.6, Math.PI - 0.5, 'ready', 0.2, { prop: null });
        wcube('toolOrange', cx - 0.2, cz0 + 2.0, 0.26, 0.26, 0.26, 2.2);
      }
      // 饮水台（篮球场南边、走道口）
      {
        const [x, z] = put1('campus-fountain', 417, -80.2);
        blockRect(W0, x - 1.5, x + 1.5, z - 0.55, z + 0.55);
      }
      placeMerged(objs, 'valley:school:portables', ...fr(400, -84));
      // 人：老师站在一间教室门口，两个孩子从走道穿过去
      {
        const [x, z] = fr(388.6, -75.2);
        person(coach, 0, x, z, 0.3, 'idle', 0.5, { prop: null });
        const [ax, az] = fr(396.5, -84.6);
        person(kid, 0, ax, az, Math.PI / 2, 'walk', 0.3, { prop: null });
        person(kid, 2, ax + 1.3, az + 0.6, Math.PI / 2, 'walk', 0.8, { prop: null });
      }
      // 活动教室区和校队球场之间一块草坪（记分牌、看台背后），几棵遮阴树
      {
        const [ax, az] = fr(384, -70.5);
        const [bx, bz] = fr(423.5, -50);
        flat('lawn', W0, ax, bx, az, bz, Y.pad);
        occupy(W0, ax, bx, az, bz, 0.3);
      }
      for (const [wx, wz, sc] of [
        [412.5, -75, 1.05],
        [386.5, -66.5, 0.95],
        [419.5, -64, 1.0],
        [404, -60.5, 1.1],
        [345.5, -114, 1.0],
        [345.5, -95, 1.1],
        [378.5, -120, 0.95],
        [378.5, -100, 1.05],
      ]) {
        const [x, z] = fr(wx, wz);
        inst.tree.push(item(x, z, sc, rnd() * 6));
      }

      // 练习场（世界 349…375 × −124…−78）：两绿割草条纹 4 米一条、白边线 + 中线、两头各一个门；两边各两棵树
      {
        const [ax, az] = fr(349, -124);
        const [bx, bz] = fr(375, -78);
        flat('lawn', W0, ax, bx, az, bz, Y.pad);
        for (let x = ax + 4; x < bx - 0.1; x += 8)
          flat('lawnStripe', W0, x, Math.min(x + 4, bx), az, bz, Y.pad + 0.006);
        const ln = (a: number, b: number, c: number, e: number) => flat('line', W0, a, b, c, e, Y.court);
        ln(ax + 1, bx - 1, az + 1, az + 1.1);
        ln(ax + 1, bx - 1, bz - 1.1, bz - 1);
        ln(ax + 1, ax + 1.1, az + 1, bz - 1);
        ln(bx - 1.1, bx - 1, az + 1, bz - 1);
        ln(ax + 1, bx - 1, (az + bz) / 2 - 0.05, (az + bz) / 2 + 0.05);
        occupy(W0, ax, bx, az, bz, 0.5);
        const gx = (ax + bx) / 2;
        place('campus-goal', gx, az + 1.05);
        place('campus-goal', gx, bz - 1.05, { rot: Math.PI });
        for (const s of [-1, 1]) {
          blockSeg([gx + s * 2.6, az + 1], [gx + s * 2.6, az - 0.6], 0.15);
          blockSeg([gx + s * 2.6, bz - 1], [gx + s * 2.6, bz + 0.6], 0.15);
        }
        // 两个孩子在南门前踢球，一个守门
        person(kid, 0, gx - 1.8, bz - 7.5, Math.PI - 0.4, 'walk', 0.15, { prop: null, stride: 1.5 });
        person(kid, 1, gx + 0.4, bz - 2.0, Math.PI, 'ready', 0.5, { prop: null });
        wcube('clothWhite', gx - 1.2, bz - 6.6, 0.24, 0.24, 0.24);
        for (const [cx, cz] of [
          [gx - 6, bz - 12],
          [gx - 3, bz - 12],
          [gx, bz - 12],
          [gx + 3, bz - 12],
        ])
          inst.cone.push(item(cx, cz));
      }

      // ── 第 3 轮（构图批判 2）：围网南边、教学楼背后那条沙（G7）→ 碎石院子 + 成簇的龙舌兰 / 仙人掌、楼背后的垃圾箱和空调机组；
      // 练习场北边、停车场西边同样铺碎石 ──
      {
        const gravel = (x0: number, x1: number, z0: number, z1: number) => {
          const [ax, az] = fr(x0, z0);
          const [bx, bz] = fr(x1, z1);
          flat('gravelYard', W0, ax, bx, az, bz, Y.pad);
          occupy(W0, ax, bx, az, bz, 0);
        };
        gravel(334.5, 394, -131.3, -124.2);
        gravel(375.2, 394, -124.2, -96);
        gravel(438.2, 514.4, -131.3, -115.2);
        gravel(438.2, 455.6, -115.2, -91);
        gravel(500.4, 514.4, -115.2, -79.4);
        // 植物成簇（5～8 米一团，团间留空）
        for (const [wx, wz] of [
          [341, -128],
          [362, -127.5],
          [386, -114],
          [384, -103],
          [446, -126],
          [468, -128.5],
          [491, -127],
          [508, -122],
        ]) {
          const [x, z] = fr(wx, wz);
          inst.agave.push(item(x, z, 0.8 + rnd() * 0.3, rnd() * 6));
          inst.agave.push(item(x + 1.3, z + 0.6, 0.6 + rnd() * 0.2, rnd() * 6));
          inst.cactus.push(item(x - 0.9, z + 0.4, 0.8 + rnd() * 0.3, rnd() * 6));
          if (rnd() < 0.5) inst.agave.push(item(x + 0.4, z - 1.0, 0.55, rnd() * 6));
        }
        // 教学楼背后：两个大垃圾箱（深绿）+ 三台空调机组（灰盒子，朝南的面在暗档）
        for (const wx of [462, 465]) {
          const [x, z] = fr(wx, -117.8);
          wcube('windscreenOld', x, z, 2.2, 1.6, 1.6);
          d.block({ x, z, r: 1.2 });
        }
        for (const wx of [476, 480, 484]) {
          const [x, z] = fr(wx, -117.6);
          wcube('metal', x, z, 2.4, 1.6, 2.0);
          wcube('roofMetal', x, z, 1.6, 0.2, 1.4, 1.6);
          d.block({ x, z, r: 1.3 });
        }
      }

      // ── 第 3 轮：学校东边 / 五金西边那块沙（世界 502…518 × −70…−10）→ 校车车库：一块停车坪、北头一座两开间的维修棚（开口朝南）、
      // 四辆校车两两一排；车库东沿接五金进口那条路（hardware_in，x 520.5）。再往南到主街是一块草 + 两棵树。
      // 世界 x > 514.5 的那条在旧坐标里落进 schoolCourts 的框（relocate.ts 的 schoolPart 按旧坐标分块）→ 那一条按 schoolCourts 的平移写
      {
        // 世界 x 514.5 以东：旧坐标落进 schoolCourts 的框（relocate.ts 的 schoolPart），这个模块够不着 → 那一条（到五金进口路边）在 park() 里补
        const area = (key: PalKey, x0: number, x1: number, z0: number, z1: number, y: number) => {
          const [ax, az] = fr(x0, z0);
          const [bx, bz] = fr(Math.min(x1, 514.4), z1);
          flat(key, W0, ax, bx, az, bz, y);
          occupy(W0, ax, bx, az, bz, 0);
        };
        // 停车坪：暖碎石（yardGravel），不铺沥青 —— 一屏都是冷灰沥青 + 灰顶，正午饱和度 0.30（2026-11-22 性能收尾）
        area('yardGravel', 502.5, 518, -66, -40, Y.under);
        area('lawn', 502.5, 518, -40, -10, Y.pad);
        // 车位线（四格，两两相对）
        for (const wx of [503.5, 508.7, 514.0]) {
          const [x, z] = fr(wx, -53);
          flat('lotPaint', W0, x - 0.05, x + 0.05, z - 12, z + 12, Y.under + 0.008);
        }
        // 维修棚：后墙（砌块）+ 两根柱 + 一块单坡金属顶，开口朝南（里面一块暗）；在世界 503…514 × −70…−66
        {
          const [cx, cz] = fr(508.6, -68);
          wcube('cmuGrey', cx, cz - 1.9, 11, 3.6, 0.3);
          for (const dx of [-5.3, 0, 5.3]) wcube('metal', cx + dx, cz + 1.8, 0.3, 3.4, 0.3);
          wcube('roofMetal', cx, cz, 11.6, 0.25, 4.4, 3.5);
          wcube('schoolMaroon', cx, cz + 2.2, 11.6, 0.5, 0.12, 3.15);
          blockRect(W0, cx - 5.6, cx + 5.6, cz - 2.1, cz + 2.0);
        }
        const buses: THREE.Object3D[] = [];
        for (const [wx, wz] of [
          [506, -60],
          [511.4, -60],
          [506, -47.5],
          [511.4, -47.5],
        ]) {
          const [x, z] = fr(wx, wz);
          const { obj } = makeAsset('school-bus', d.actx);
          obj.position.set(x, 0, z);
          obj.rotation.y = Math.PI / 2;
          obj.scale.set(K, 1, K);
          buses.push(obj);
          blockRect(W0, x - 0.85, x + 0.85, z - 2.6, z + 2.6);
        }
        placeMerged(buses, 'valley:school:busbarn', ...fr(509, -54));
        // 一个司机在棚口
        {
          const [x, z] = fr(504.2, -64.6);
          person(coach, 1, x, z, 0.4, 'idle', 0.2, { prop: null });
        }
        for (const [wx, wz] of [
          [505, -24],
          [512.5, -16],
        ]) {
          const [x, z] = fr(wx, wz);
          inst.tree.push(item(x, z, 1.0, rnd() * 6));
        }
      }

      // 北沿围网（世界 z −131.5，334.5…514）：一条 2.4 米的暗带（跟小镇压低到 1.5）、立柱 6 米一根、顶上一根横杆；不投影
      {
        const [ax, z] = fr(334.5, -131.5);
        const [bx] = fr(514, -131.5);
        const f: Fr = { x: (ax + bx) / 2, z, r: Math.PI / 2 };
        thin(() => {
          cube('chainLink', f, 0, 0, 0.06, 2.3, bx - ax, 0.05);
          cube('ironwork', f, 0, 0, 0.12, 0.12, bx - ax, 2.35);
          const n = Math.round((bx - ax) / 6);
          for (let k = 0; k <= n; k++) wcube('ironwork', ax + ((bx - ax) * k) / n, z, 0.16, 2.5, 0.16);
        });
        blockSeg([ax, z], [bx, z], 0.2);
      }
    }

    // ── 人：烘成静态网格（世界坐标，组的原点在世界原点）──
    // 球场 / 看台框里的：包围盒中心在框里 → townwrap 不动它。跑道上的：一组十几米宽 = "长条"，townwrap 只把 y 乘 TOWN_K →
    // 先把组的 y 放大 1/TOWN_K 抵掉（人不缩）。
    const keepG = bakeCrowd(crowd.keep, 'valley:school:crowd');
    if (keepG) d.asset(keepG, reg(CXS[2], CZ));
    // 2026-11-21：跑道、活动教室区、练习场各烘一组（一组跨整个校园 = 校园里哪儿都看得见它，十几块网格每屏都画）
    const ZONES: [string, number, number][] = [
      ['track', TKX, TKZ],
      ['portables', 524, -532],
      ['field', 486, -549],
    ];
    const zoneOf = (o: THREE.Object3D) => {
      let best = 0;
      ZONES.forEach(([, x, z], i) => {
        const [, bx, bz] = ZONES[best];
        if (Math.hypot(o.position.x - x, o.position.z - z) < Math.hypot(o.position.x - bx, o.position.z - bz)) best = i;
      });
      return best;
    };
    ZONES.forEach(([name, x, z], i) => {
      const townG = bakeCrowd(
        crowd.town.filter((o) => zoneOf(o) === i),
        `valley:school:crowd-${name}`,
      );
      if (!townG) return;
      // 一组比 LONG_M 小 townwrap 会当小件再缩：每组都摆得比它大（跑道一圈、教室区、练习场两头）
      townG.scale.y = 1 / K;
      d.asset(townG, reg(x, z));
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // 实例化：树、柑橘、棕榈、球、锥桶、龙舌兰、仙人掌、叶堆；最后是不投影的那批（thin）
  // ════════════════════════════════════════════════════════════════════
  function placeInstances(): void {
    const dI = (g: THREE.BufferGeometry, key: PalKey, items: InstItem[], cast = true) => {
      if (items.length) d.instance(g, key, items, cast);
    };
    // 树（牧豆树 / 遮阴树）：短干 + 三团球面法线的冠（一团大的压扁、两团小的偏开），不是一颗宝石。
    // 2026-11-21（材质批判 M15：冠 153 · 9/86/5，几乎全是中档）：不再走 build 的 olive 实例（材质改不了），按模块合成一组，
    // 冠自己挑材质 —— 光往上偏 0.4、档位往下挪（亮顶占一半）、亮档偏黄、叶簇元素（2.4 纹素一团 + 15% 亮边）、交界的竖向毛。
    {
      const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.6, 5).translate(0, 1.3, 0);
      const crown = mergeAll([
        blob(1.7, 1.2, 0.62, 1.1, 1).translate(0, 3.2, 0),
        blob(1.15, 1, 0.7, 1, 1).translate(1.25, 2.9, 0.55),
        blob(1.25, 1, 0.68, 1, 1).translate(-1.05, 3.0, -0.6),
      ]);
      placeTrees(trunk, crown);
    }
    // 柑橘：矮、圆、深绿
    {
      const trunk = new THREE.CylinderGeometry(0.12, 0.16, 0.9, 5).translate(0, 0.45, 0);
      // 一团就够（深井一片园子几百棵，三角形预算紧）
      const crown = blob(1.45, 1, 0.9, 1).translate(0, 1.7, 0);
      dI(trunk, 'branch', inst.citrus, false);
      dI(crown, 'palm', inst.citrus);
    }
    // 棕榈（同 build.ts 的样子：八片往下垂的叶子 + 中间一小团）
    {
      const trunk = new THREE.CylinderGeometry(0.22, 0.34, 8, 5).translate(0, 4, 0);
      const fronds: THREE.BufferGeometry[] = [blob(0.55).translate(0, 8.1, 0)];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + (k % 2) * 0.2;
        const droop = k % 2 ? 0.55 : 0.32;
        fronds.push(
          new THREE.BoxGeometry(0.55, 0.08, 3.1).translate(0, 0, 1.45).rotateX(droop).rotateY(a).translate(0, 8.15, 0),
        );
      }
      // 干不投影（8 米的干傍晚投出 30 多米的直黑带），冠照样投
      dI(trunk, 'palmTrunk', inst.palm, false);
      dI(mergeAll(fronds), 'palm', inst.palm);
    }
    dI(new THREE.BoxGeometry(0.11, 0.11, 0.11).translate(0, 0.055, 0), 'ball', inst.ball, false);
    dI(new THREE.ConeGeometry(0.2, 0.42, 6).translate(0, 0.21, 0), 'toolOrange', inst.cone, false);
    dI(new THREE.OctahedronGeometry(0.75, 0).scale(1, 0.55, 1).translate(0, 0.35, 0), 'silverBlue', inst.agave, false);
    {
      const g = new THREE.BoxGeometry(0.36, 1.5, 0.36).translate(0, 0.75, 0);
      const arm = new THREE.BoxGeometry(0.26, 0.6, 0.26).translate(0.32, 0.9, 0);
      const merged = [g, arm].map((x) => x.toNonIndexed());
      const pos = merged.flatMap((x) => Array.from(x.attributes.position.array as Float32Array));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      dI(geo, 'cactus', inst.cactus, false);
    }
    dI(
      new THREE.IcosahedronGeometry(1.2, 0).scale(1.4, 0.35, 0.9).translate(0, 0.2, 0),
      'palmSkirt',
      inst.frond,
      false,
    );
    // 不投影的那批：每（区域, 材质, 160 米一块）合并成一个实例
    for (const { reg: r, key, list } of ncBuckets.values()) {
      if (!list.length) continue;
      d.instance(mergeAll(list), key, [{ x: 0, z: 0, s: 1, reg: r }], false);
      for (const g of list) g.dispose();
    }
  }
}
