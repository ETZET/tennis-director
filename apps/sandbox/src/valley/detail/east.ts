// valley 细节：学校和日出公园（高中、体育馆、操场、公共球场、游泳中心）、东谷（机场、塔奎兹溪高尔夫、向日葵小区、两片椰枣园、深井小区）。
// 接口见 build.ts 的 DetailCtx。只改这个文件。
//
// 构图（pixel-scene 的规矩：先定主角，细节成簇放在主角上，平地留白）：
// - 日出公园的主角是公共球场：四片一排、围网、网、线、灯杆、看台；一片网没了、一片裂了（"公园的公共球场要人管"）。
//   东南角一面对墙练习墙（天才少年傍晚在这儿打，墙前一块磨白的地、一地球、他的包）；南边草地上周末公开课的小场地、帐篷、锥桶；
//   游泳中心南边一个室外池（泳道绳、救生椅、遮阳伞）；篮球半场、厕所、儿童游乐场、野餐棚把公园填成"有事可做"的地方。
// - 高中：前门广场（旗杆、校牌、校际赛的两顶帐篷和横幅）、操场北边的看台、跑道分道线、球门、跳远沙坑；体育馆南边四片校队球场（教练在门口等）；
//   东边一排临时教室，西边教职工停车场。
// - 机场：跑道标线、滑行道（黄中线）、停机坪上几架小飞机、两座机库、塔台、航站楼门口的白色帆布顶、风向袋。
// - 塔奎兹溪高尔夫：六个洞（发球台、球道、果岭、旗、沙坑），两个洞跨过干河床，球车道上两座木桥，池塘，前面的球具店和球车棚。
// - 小区：每家按种子随机挑几样（车道、车、后院泳池、矮墙、柑橘树、前院草坪或砾石+仙人掌），深井小区里留着一片片老葡萄柚园。
// - 椰枣园：分块（土路十字分开），两块漫灌沟、两块树盘；水渠、拖拉机、修剪下来的叶堆；路边一个卖椰枣奶昔的小摊。
// 尺寸按"设计纹素"0.09 米：杆、柄 ≥ 0.14 米，线 0.1 米；网、围网用一条暗带，不画网眼；不撒满地的小东西。
//
// 第二轮审查（2026-11-15）定的规矩：
// - 薄的、细的东西（围网、挡风布、网、杆、栏杆、旗、横幅、机翼）不投影：傍晚它们的影子是又长又直的硬黑带（thin()）。
// - 树冠用球面法线的团（不是一面一面的宝石），棕榈用垂下来的叶子（同 build.ts）。
// - 地面一层层的高度至少错开 0.01 米（Y 表），上面那层只盖该盖的地方。
// - 电线杆、两对球场之间的矮挡风布、车棚删掉（看不懂、投长影）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { coach, kid, player } from '../../clubsite/people';
import type { BaseCtx } from '../../clubsite/render/ctx';
import { box } from '../../clubsite/render/geo';
import type { Elem } from '../../clubsite/render/toon';
import { makeAsset } from '../assets';
import { BLEACHER, MAIN_DOOR_X } from '../assets/school';
import type { DetailCtx, InstItem } from '../build';
import { ribbon } from '../build';
import {
  BUILDINGS_RAW as BUILDINGS,
  distToLine,
  GREENS,
  housesRaw as houses,
  inPoly,
  ROADS,
  S,
  type V2,
  WASH,
  washDist,
} from '../layout';
import { TOWN_EL } from '../palette';
import { DECKS, type DeckRect, type DeckStair, parkDeckY, STAIRS, stairRect } from '../parkdeck';
import type { PalKey } from '../reuse';
import { keepScale, PLAY_KEEP, TOWN_K } from '../townscale';

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
const road = (id: string) => ROADS.find((r) => r.id === id);
/** 离哪条路（不含步道）的路面边多近（< 0 = 在路上） */
function roadGap(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const r of ROADS) if (r.kind !== 'trail') best = Math.min(best, distToLine(r.pts, x, z) - r.w / 2);
  return best;
}
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
function blob(r: number, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 0);
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

export function detailEast(d: DetailCtx): void {
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
  /** 平的椭圆 */
  const disc = (key: PalKey, x: number, z: number, rx: number, rz: number, y: number, rot = 0, seg = 14) => {
    const g = new THREE.CircleGeometry(1, seg).rotateX(-Math.PI / 2).scale(rx, 1, rz);
    if (rot) g.rotateY(rot);
    putG(reg(x, z), key, g.translate(x, y, z));
  };
  /** 折线带子（世界坐标） */
  const band = (key: PalKey, pts: V2[], half: number | number[], y: number) => {
    if (pts.length < 2) return;
    const m = pts[Math.floor(pts.length / 2)];
    putG(reg(m[0], m[1]), key, ribbon(pts, half, y));
  };
  const cyl = (key: PalKey, x: number, z: number, r: number, h: number, y = 0, seg = 8) =>
    putG(reg(x, z), key, new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z));
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
  const isFree = (x: number, z: number, pad = 0) =>
    !occ.some((b) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad);

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

  /** 小飞机（上单翼，局部 −z = 机头）；s 缩放 */
  const plane = (x: number, z: number, rot: number, stripe: PalKey, s = 1) => {
    const f: Fr = { x, z, r: rot };
    const c = (key: PalKey, lx: number, lz: number, w: number, h: number, dp: number, y: number) =>
      cube(key, f, lx * s, lz * s, w * s, h * s, dp * s, y * s);
    c('clothWhite', 0, 0, 1.25, 1.3, 7.2, 0.55);
    c('clothWhite', 0, -4.0, 1.1, 1.05, 1.0, 0.65);
    c('ironwork', 0, -4.6, 0.18, 2.0, 0.12, 0.2);
    c('jug', 0, -2.4, 1.1, 0.55, 1.0, 1.55);
    thin(() => c('clothWhite', 0, -1.4, 11, 0.16, 1.6, 2.05)); // 机翼：薄板，不投影
    c(stripe, 0, 0.3, 1.28, 0.22, 7.0, 1.05);
    c('clothWhite', 0, 4.6, 0.7, 0.75, 2.6, 0.95);
    c(stripe, 0, 5.6, 0.14, 1.5, 1.4, 1.35);
    thin(() => c('clothWhite', 0, 5.7, 3.6, 0.12, 1.0, 1.2));
    for (const sx of [-1, 1]) c('net', sx * 1.2, -0.6, 0.28, 0.55, 0.45, 0);
    c('net', 0, -3.6, 0.24, 0.6, 0.35, 0);
    blockRect(f, -0.8 * s, 0.8 * s, -4.8 * s, 6.4 * s);
    blockRect(f, -5.5 * s, 5.5 * s, -2.2 * s, -0.6 * s);
    occupy(f, -5.6 * s, 5.6 * s, -5 * s, 6.5 * s, 1);
  };

  /** 高尔夫球车 */
  const gcart = (x: number, z: number, rot: number) => {
    const f: Fr = { x, z, r: rot };
    cube('clothWhite', f, 0, 0, 1.2, 0.7, 2.4, 0.2);
    cube('clothTeal', f, 0, 0.2, 1.1, 0.25, 0.7, 0.9);
    for (const [a, b] of [
      [-0.5, -0.9],
      [0.5, -0.9],
      [-0.5, 0.9],
      [0.5, 0.9],
    ])
      cube('metal', f, a, b, 0.1, 1.1, 0.1, 0.9);
    cube('clothWhite', f, 0, 0, 1.3, 0.1, 2.1, 2.0);
    blockRect(f, -0.65, 0.65, -1.25, 1.25);
  };

  /** 长椅（局部 x 沿长） */
  const bench = (f: Fr, len = 1.8) => {
    // 旧木头色（wood 的橙太冲，竖着看是一根橙色的杆）
    cube('woodWeathered', f, 0, 0, len, 0.1, 0.45, 0.42);
    cube('woodWeathered', f, 0, 0.2, len, 0.4, 0.08, 0.55);
    for (const s of [-1, 1]) cube('ironwork', f, (s * len) / 2 - s * 0.15, 0, 0.14, 0.42, 0.4);
    blockRect(f, -len / 2, len / 2, -0.3, 0.3);
  };

  /** 野餐桌 */
  const picnic = (x: number, z: number, rot = 0) => {
    const f: Fr = { x, z, r: rot };
    cube('wood', f, 0, 0, 2.0, 0.1, 0.8, 0.72);
    for (const s of [-1, 1]) cube('wood', f, 0, s * 0.75, 2.0, 0.08, 0.3, 0.42);
    for (const s of [-1, 1]) cube('woodWeathered', f, s * 0.75, 0, 0.14, 0.72, 1.6);
    blockRect(f, -1.0, 1.0, -0.95, 0.95);
  };

  park();
  school();
  airport();
  golf();
  neighborhoods();
  groves();
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
    const pk = bbox(GREENS.find((q) => q.id === 'sunrise_park')?.poly ?? []);
    const sw = BUILDINGS.find((b) => b.id === 'swim_center') ?? { x: 847, z: -392, w: 30, d: 20 };
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
      [852, -424, 1.4],
      [872, -430, 1.2],
      [866, -404, 1.3],
      [868, -372, 1.4],
      [877, -350, 1.2],
      [858, -338, 1.3],
      [pk.x0 + 3, pk.z1 - 3, 1.2],
      [pk.x0 + 32, pk.z1 - 2, 1.2],
      [pk.x0 + 66, pk.z1 - 3, 1.4],
      [pk.x1 - 30, pk.z1 - 4, 1.2],
      [pk.x1 - 4, pk.z1 - 3, 1.3],
    ])
      inst.tree.push(it(x, z, s, rnd() * 6));

    // ── 草地的中间层（G4，lessons「组装经验」第 2 条 + material-spec 第 2、10 条）：草地本身是全山谷共用的 lawn（纯色，不改），
    // 公园里手摆 ① 十几块只比草深（墙脚、树下、背阴）或浅（晒黄：长椅前、排队的地方、空地）一点的硬边斑，斑里按 3 米的斑块撒草叶
    // （1 → 30%，blades），窗口里数得出 3 个颜色；② 三十来个草团 / 晒黄团 / 小花 / 墙脚高草（park-grass-tuft），成簇放在墙脚、长椅脚、
    // 场角、步道转弯、树脚下。东边的草地照用户说的留白（只有零星几块斑）。
    {
      const prng = d.rng('valley:east:park:grass');
      const BLADES: Elem = { kind: 'blades', density: [0.01, 0.3], patch: 3 };
      const lush = d.actx.mat('lawn', {
        ramp: [0x70a83a, 0x50904a, 0x2a5c5e],
        tones: {
          bands: [
            [0x70a83a, 0x75af3c, 0x6ba138],
            [0x50904a, 0x54974e, 0x4c8946],
            [0x2a5c5e, 0x2d6365, 0x275557],
          ],
          seam: [0x5e8c32, 0x40763c, 0x204a4c],
          hi: [0x81c143, 0x5da756, 0x347375],
        },
        elem: BLADES,
      });
      const dry = d.actx.mat('lawn', {
        ramp: [0x94b84c, 0x62904c, 0x345e5a],
        tones: {
          bands: [
            [0x94b84c, 0x99bf4f, 0x8fb149],
            [0x62904c, 0x679750, 0x5d8948],
            [0x345e5a, 0x386560, 0x305754],
          ],
          seam: [0x7e9e40, 0x507a40, 0x284c4a],
          hi: [0xa7d056, 0x71a658, 0x40746f],
        },
        elem: { ...BLADES, density: [0.01, 0.18], seed: 5 },
      });
      // 只有草叶的一层（底色 = lawn 原样，边看不出来）：主角四周的草地按 3 米的斑块撒草叶（1 → 30%，material-spec 第 10 条），
      // 东边留白的那片不铺
      const bladesOnly = d.actx.mat('lawn', {
        ramp: [0x7cb543, 0x56984f, 0x2c6262],
        tones: {
          bands: [
            [0x7cb543, 0x81bc46, 0x77ae40],
            [0x56984f, 0x5a9f53, 0x52914b],
            [0x2c6262, 0x2f6969, 0x295b5b],
          ],
          seam: [0x689a38, 0x467e42, 0x245454],
          hi: [0x8ac94b, 0x62ad5a, 0x347474],
        },
        elem: { ...BLADES, density: [0.02, 0.3], seed: 11 },
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
      const PATCH: [number, number, number, number, 0 | 1 | 2][] = [
        // 只有草叶的大块（底色同草地）：球场台的围裙、台南的草地、去对墙那条路两边、对墙台南、草台上、入口两边
        [781, -394.4, 5, 1.7, 2],
        [800, -394.4, 6, 1.7, 2],
        [783, -388.2, 6, 2.6, 2],
        [800, -387.5, 7, 2.8, 2],
        [812, -394, 3.5, 6, 2],
        [826, -401.5, 7, 3, 2],
        [823, -431, 8, 2.4, 2],
        [779.5, -378, 6, 6, 2],
        [762, -374, 4.5, 6, 2],
        [770, -363.5, 7, 3, 2],
        [770, -351.5, 9, 3.4, 2],
        [759.5, -348, 4, 4, 2],
        [781, -355, 6, 2.6, 2],
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
      const PM = [lush, dry, bladesOnly];
      PATCH.forEach(([x, z, rx, rz, k]) => {
        const kb = keepOf(x, z);
        const e = groups.get(kb) ?? { x, z, list: [] };
        e.list.push([PM[k], patchGeo(x, z, rx, rz, k === 2 ? 0 : 0.003)]);
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
      ];
      for (let kb = -1; kb < PLAY_KEEP.length; kb++) {
        const mine = TUFTS.filter(([x, z]) => keepOf(x, z) === kb);
        if (!mine.length) continue;
        begin();
        for (const [x, z, v] of mine) place('park-grass-tuft', x, z, prng() * 6, v);
        end(`valley:park:tufts:${kb}`, mine[0][0], mine[0][1]);
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
    // 这个文件的 BUILDINGS = BUILDINGS_RAW（缩之前的）；两栋都以南墙为轴缩：南墙的 z 不变，东西往中线收
    const mb = BUILDINGS.find((b) => b.id === 'school_main') ?? { x: 602, z: -558, w: 70, d: 40, h: 9 };
    const gym = BUILDINGS.find((b) => b.id === 'school_gym') ?? { x: 668, z: -513.5, w: 36, d: 30, h: 10 };
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
      o: { seat?: [number, number]; prop?: string | null; look?: [number, number, number] } = {},
    ) => {
      const p = make({ ...d.actx, variant: v } as unknown as BaseCtx);
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
    // 连廊：沿教学楼南面（正门那一跨断开）→ 往东过午餐区 → 往南一直到球场的西北场门（x 641.6）。
    // 顶板白、外沿一条酒红封檐；细钢柱每 5 米；高度写缩之前的（3.5 → 缩完 2.2）。
    {
      const CY = 3.5;
      const z0 = mz1 + 0.4;
      const z1 = mz1 + 4.0;
      const NX = 641.6; // 往南那一段的中线（教学楼缩之前的脚印 + 2 米到 639，体育馆的从 648 起：两边都不沾）
      const roof = (x0: number, x1: number, za: number, zb: number) => {
        wcube('pvc', (x0 + x1) / 2, (za + zb) / 2, x1 - x0, 0.3, zb - za, CY);
      };
      roof(fx0, EX - 3.6, z0, z1);
      roof(EX + 3.6, NX + 1.5, z0, z1);
      roof(NX - 1.5, NX + 1.5, z1, F - 0.6);
      // 封檐（酒红）：南沿、往南那段的两边
      wcube('schoolMaroon', (fx0 + EX - 3.6) / 2, z1, EX - 3.6 - fx0, 0.45, 0.14, CY - 0.15);
      wcube('schoolMaroon', (EX + 3.6 + NX - 1.5) / 2, z1, NX - 1.5 - EX - 3.6, 0.45, 0.14, CY - 0.15);
      for (const s of [-1, 1])
        wcube('schoolMaroon', NX + s * 1.5, (z1 + F - 0.6) / 2, 0.14, 0.45, F - 0.6 - z1, CY - 0.15);
      // 柱子（细的，不投影：一排柱子傍晚投出一排长条，连廊顶的影子已经够了）
      thin(() => {
        for (let x = fx0 + 1; x < NX - 1.5; x += 5)
          if (Math.abs(x - EX) > 3.8) wcube('metal', x, z1 - 0.25, 0.16, CY, 0.16);
        for (let z = z1 + 3; z < F - 1; z += 5)
          for (const s of [-1, 1]) wcube('metal', NX + s * 1.3, z, 0.16, CY, 0.16);
      });
      for (let z = z1 + 3; z < F - 1; z += 5) for (const s of [-1, 1]) d.block({ x: NX + s * 1.3, z, r: 0.15 });
      // 往南那段底下一条浅灰的路
      flat('campusConcrete', W0, NX - 1.6, NX + 1.6, z1, F - 0.2, Y.path);
      occupy(W0, NX - 1.8, NX + 1.8, z1, F, 0.5);
    }

    // ════ 4. 前门：浅灰水泥前庭（分格）、旗杆、电子字牌；前庭南边的校车湾（两辆黄校车）；东边草坪上的午餐区 ════
    // 正门、字牌、旗杆、两辆校车都挤在正门前 15 米宽里：竖屏一屏（at 587,−531）全看得到
    const PX1 = 640; // 前庭东头（接往南的连廊）
    const FZ1 = -527; // 前庭南沿 = 校车湾北沿（黄路缘）
    flat('campusConcrete', W0, 575, PX1, mz1, FZ1, Y.path);
    // 分格缝（3.5 米一格；楼脚 2 米里不画：那一条归楼的缩放框）
    for (let x = 578.5; x < PX1 - 0.5; x += 3.5) flat('ironwork', W0, x - 0.04, x + 0.04, mz1 + 2.5, FZ1, Y.line);
    for (const z of [mz1 + 3.5, mz1 + 7]) flat('ironwork', W0, 575, PX1, z - 0.04, z + 0.04, Y.line);
    occupy(W0, 575, PX1, mz1, FZ1, 0.5);
    // 正门前一条 7 米宽的路两边各一块草坪（前庭不是一整片灰；旗杆立在东边那块里）
    for (const [a, b] of [
      [575, EX - 3.5],
      [EX + 3.5, 597],
    ])
      flat('lawn', W0, a, b, mz1 + 5.5, FZ1 - 0.6, Y.crack);
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
    flat('asphalt', W0, 571, 600, FZ1, -521.5, 0.03);
    wcube('flowerYellow', 586, FZ1 + 0.1, 27, 0.02, 0.15, 0.037);
    for (const x of [582, 592.4]) {
      place('school-bus', x, -524.3, { town: true });
      blockRect(W0, x - 2.55, x + 2.55, -525.1, -523.5);
    }
    occupy(W0, 571, 600, FZ1, -521.5, 0.5);

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
      for (const s of [-1, 1]) {
        const x = TKX + s * 16;
        thin(() => {
          for (const zz of [-2.5, 2.5]) wcube('clothWhite', x, TKZ + zz, 0.14, 2.0, 0.14);
          wcube('clothWhite', x, TKZ, 0.14, 0.14, 5.14, 1.9);
          wcube('net', x + s * 0.8, TKZ, 0.06, 1.0, 5.0, 0);
        });
        for (const zz of [-2.5, 2.5]) blockSeg([x, TKZ + zz], [x + s * 0.8, TKZ + zz], 0.15);
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
      out([580, -454.5], [X0 - 0.5, -454.5]);
      out([734.5, SF], [734.5, -580]);
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

    // ── 人：烘成静态网格（世界坐标，组的原点在世界原点）──
    // 球场 / 看台框里的：包围盒中心在框里 → townwrap 不动它。跑道上的：一组十几米宽 = "长条"，townwrap 只把 y 乘 TOWN_K →
    // 先把组的 y 放大 1/TOWN_K 抵掉（人不缩）。
    const keepG = bakeCrowd(crowd.keep, 'valley:school:crowd');
    if (keepG) d.asset(keepG, reg(CXS[2], CZ));
    const townG = bakeCrowd(crowd.town, 'valley:school:crowd-track');
    if (townG) {
      townG.scale.y = 1 / K;
      d.asset(townG, reg(TKX, TKZ));
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // 机场（跑道从 GREENS.runway 推，航站楼、机场路从 layout 读）
  // ════════════════════════════════════════════════════════════════════
  function airport(): void {
    const rnd = d.rng('valley:east:airport');
    // 第三轮（山谷缩到 0.7）：跑道从 GREENS.runway 的多边形推（长 380、宽 28）；航站楼、机场路从 layout 读。
    // 机场路的尽头离航站楼北面只剩 6 米：停机坪在机场路北边、滑行道西边；机库挪到航站楼南边（原位置落在跑道上）；
    // 航站楼东边的双发客机、正在滑行的那架放不下，删了。地面多用水泥（暖、浅），整片不发灰。
    const rw = GREENS.find((q) => q.id === 'runway')?.poly ?? [];
    if (rw.length < 4) return;
    const nA: V2 = [(rw[0][0] + rw[1][0]) / 2, (rw[0][1] + rw[1][1]) / 2];
    const nB: V2 = [(rw[2][0] + rw[3][0]) / 2, (rw[2][1] + rw[3][1]) / 2];
    const RL = Math.hypot(nB[0] - nA[0], nB[1] - nA[1]) / 2; // 半长
    const R: Fr = { x: (nA[0] + nB[0]) / 2, z: (nA[1] + nB[1]) / 2, r: Math.atan2(nB[0] - nA[0], nB[1] - nA[1]) };
    const HW = (Math.hypot(rw[1][0] - rw[0][0], rw[1][1] - rw[0][1]) * Math.cos(R.r)) / 2;
    /** 跑道中线在世界 z 处的 x */
    const cx = (z: number) => nA[0] + ((nB[0] - nA[0]) * (z - nA[1])) / (nB[1] - nA[1]);
    // 跑道标线：中线虚线、两头的斑马（钢琴键）、瞄准点
    for (let lz = -RL + 35; lz < RL - 35; lz += 40) flat('line', R, -0.45, 0.45, lz, lz + 22, 0.03);
    for (const s of [-1, 1]) {
      for (let lx = 2.5; lx + 0.9 < HW - 1; lx += 3)
        for (const sx of [-1, 1]) {
          const a = s * (RL - 4);
          const b = s * (RL - 28);
          flat('line', R, sx * lx - 0.9, sx * lx + 0.9, Math.min(a, b), Math.max(a, b), 0.03);
        }
      for (const sx of [-1, 1])
        flat('line', R, sx * 6 - 1.6, sx * 6 + 1.6, s * (RL - 75) - 15, s * (RL - 75) + 15, 0.03);
      // 两头的进近灯（伸出跑道外的几排）
      for (let k = 1; k <= 3; k++) {
        const [x, z] = at(R, 0, s * (RL + k * 10));
        if (washDist(x, z) < 0 || roadGap(x, z) < 4 || reg(x, z) === 'none') continue;
        thin(() => {
          cube('flowerYellow', R, 0, s * (RL + k * 10), 6, 0.2, 0.3, 0.7);
          for (const sx of [-2.6, 0, 2.6]) cube('ironwork', R, sx, s * (RL + k * 10), 0.16, 0.7, 0.16);
        });
      }
      // 跑道头一排绿灯
      for (let k = -3; k <= 3; k++) cube('seat', R, k * 4.2, s * (RL + 0.6), 0.4, 0.3, 0.4);
    }
    // ── 平行滑行道（西边，黄中线）+ 三条联络道：水泥，压在跑道（0.02）上面 0.014 ──
    const AY = 0.034;
    const TX = -(HW + 16);
    const LINKS = [-RL + 25, 0, RL - 25];
    band('concrete', [at(R, TX, -RL + 25), at(R, TX, RL - 25)], 7, AY);
    band('flowerYellow', [at(R, TX, -RL + 25), at(R, TX, RL - 25)], 0.16, AY + 0.012);
    for (const lz of LINKS) {
      band('concrete', [at(R, TX, lz), at(R, -HW + 1, lz)], 7, AY);
      band('flowerYellow', [at(R, TX, lz), at(R, -HW + 1, lz)], 0.16, AY + 0.012);
    }
    /** 水泥坪的伸缩缝：每 6 米一条 1 纹素的暗缝（不然一整块水泥和沙一个颜色，读不出是铺过的地） */
    const joints = (x0: number, x1: number, z0: number, z1: number) => {
      for (let x = x0 + 6; x < x1 - 1; x += 6) flat('asphalt', W0, x - 0.05, x + 0.05, z0 + 0.3, z1 - 0.3, AY + 0.012);
      for (let z = z0 + 6; z < z1 - 1; z += 6) flat('asphalt', W0, x0 + 0.3, x1 - 0.3, z - 0.05, z + 0.05, AY + 0.012);
    };
    /** 滑行道西沿在世界 z 处的 x */
    const taxiW = (z: number) => cx(z) + TX / Math.cos(R.r) - 3.5;
    // 边灯（每 40 米一盏，两边；联络道口上不放）
    for (let lz = -RL + 15; lz < RL; lz += 40)
      for (const s of [-1, 1])
        if (s > 0 || LINKS.every((q) => Math.abs(q - lz) > 6))
          cube('clothWhite', R, s * (HW + 0.8), lz, 0.35, 0.4, 0.35);
    // 跑道 + 滑行道一整条：平整过的地，不长灌木
    {
      const ps = [at(R, TX - 8, -RL), at(R, HW + 2, -RL), at(R, HW + 2, RL), at(R, TX - 8, RL)];
      d.clear({
        x0: Math.min(...ps.map((p) => p[0])),
        x1: Math.max(...ps.map((p) => p[0])),
        z0: Math.min(...ps.map((p) => p[1])),
        z1: Math.max(...ps.map((p) => p[1])),
      });
    }

    const term = BUILDINGS.find((b) => b.id === 'terminal') ?? { x: 1001, z: -560, w: 60, d: 24 };
    const ar = road('airport');
    const TX0 = term.x - term.w / 2;
    const TX1 = term.x + term.w / 2;
    const TZ0 = term.z - term.d / 2;
    const TZ1 = term.z + term.d / 2;
    const roadEnd: V2 = ar ? ar.pts[ar.pts.length - 1] : [term.x, TZ0 - 18];
    const roadW = ar?.w ?? 10;
    // ── 停机坪：机场路北边、滑行道西边（水泥）；三个系留位，三架小飞机 ──
    const AZ1 = roadEnd[1] - roadW / 2 - 4;
    const AZ0 = AZ1 - 29;
    const AX0 = (ar ? Math.max(...ar.pts.map((p) => p[0]).filter((x) => x < roadEnd[0] - 10)) : TX0) + roadW / 2 + 3;
    const AX1 = taxiW(AZ1) + 3.5;
    flat('concrete', W0, AX0, AX1, AZ0, AZ1, AY);
    joints(AX0, AX1, AZ0, AZ1);
    occupy(W0, AX0, AX1, AZ0, AZ1, 1);
    const STR: PalKey[] = ['clothRed', 'clothBlue', 'flowerYellow'];
    [0, 1, 2].forEach((k) => {
      const x = AX0 + 12 + k * 16;
      if (x + 6 > AX1) return;
      // 系留点的黄 T
      flat('flowerYellow', W0, x - 0.08, x + 0.08, AZ0 + 7, AZ0 + 19, AY + 0.024);
      flat('flowerYellow', W0, x - 3, x + 3, AZ0 + 18.9, AZ0 + 19.1, AY + 0.024);
      plane(x, AZ0 + 13.5 + (rnd() - 0.5), Math.PI + (rnd() - 0.5) * 0.2, STR[k]);
    });
    // 航站楼东北角的行李车（停机坪和航站楼之间）
    for (let k = 0; k < 3; k++)
      wcube(k ? 'concrete' : 'toolOrange', TX1 - 10 + k * 2.4, AZ1 + 6, 1.6, 1.0, 2.6, 0, 0.1);

    // ── 两座机库（拱顶，门朝南开着），航站楼南边、滑行道西边；门前一块水泥坪 ──
    const HZ = TZ1 + 2 + 9;
    const HX1 = taxiW(HZ - 9) - 1;
    for (const x of [HX1 - 38, HX1 - 12]) {
      const z = HZ;
      wcube('concrete', x, z, 24, 6, 18);
      // 半个圆柱（轴沿 z、拱朝上）压扁成低拱；4 个面（10 个面的时候每面亮度都压在色阶线上，一条条闪着的抖点）
      const roof = new THREE.CylinderGeometry(12, 12, 18, 4, 1, false, Math.PI / 2, Math.PI)
        .rotateX(Math.PI / 2)
        .scale(1, 0.28, 1)
        .translate(x, 6, z);
      putG(reg(x, z), 'roofString', roof);
      wcube('net', x, z + 9.02, 18, 5.4, 0.1);
      wcube('cap', x, z + 9.05, 18, 0.5, 0.12, 5.4);
      blockRect(W0, x - 12, x + 12, z - 9, z + 9);
      occupy(W0, x - 12, x + 12, z - 9, z + 9, 2);
    }
    flat('concrete', W0, HX1 - 51, taxiW(HZ + 16) + 3.5, HZ + 9, HZ + 23, AY);
    joints(HX1 - 51, taxiW(HZ + 23), HZ + 9, HZ + 23);
    occupy(W0, HX1 - 51, HX1 + 3, HZ + 9, HZ + 23, 1);
    plane(HX1 - 38, HZ + 16, Math.PI, 'carRed'); // 机库门口

    // ── 航站楼：南立面一条玻璃带、招牌；北面（机场路尽头）一排白色帆布顶落客棚（棕榈泉机场的样子） ──
    wcube('jug', term.x, TZ1 + 0.05, term.w - 6, 2.4, 0.1, 1.2);
    wcube('signBoard', term.x, TZ1 + 0.1, 12, 1.4, 0.12, 5.2);
    wcube('signPaint', term.x, TZ1 + 0.15, 8, 0.5, 0.1, 5.65);
    for (let x = TX0 + 7; x < TX1 - 4; x += 11.5) {
      const z = TZ0 - 1.6;
      thin(() => {
        for (const s of [-1, 1]) wcube('metal', x + s * 2.2, z, 0.2, 4.2, 0.2);
      });
      putG(reg(x, z), 'clothWhite', new THREE.ConeGeometry(3.4, 2.0, 4).rotateY(Math.PI / 4).translate(x, 5.2, z - 1));
      for (const s of [-1, 1]) d.block({ x: x + s * 2.2, z, r: 0.25 });
    }
    occupy(W0, TX0, TX1, TZ0 - 4, TZ0, 0);
    // 停车场（航站楼西边），接上机场路
    {
      // 西边贴着向日葵小区的一栋房子（x 942 以西），停车场让开它
      const LX1 = TX0 - 3;
      const LX0 = LX1 - 23;
      const LZ0 = TZ0 + 2;
      const LZ1 = LZ0 + 18;
      flat('asphalt', W0, LX0, LX1, LZ0, LZ1, 0.03);
      if (ar) {
        const q = nearestOn(ar.pts, LX1 - 5, LZ0);
        band(
          'asphalt',
          [
            [LX1 - 5, LZ0 + 1],
            [q[0], q[1]],
          ],
          3.5,
          0.03,
        );
      }
      const CAR: PalKey[] = ['concrete', 'carRed', 'clothWhite', 'clothBlue', 'cap'];
      for (const [z0, z1, cz, rot] of [
        [LZ0, LZ0 + 5.4, LZ0 + 2.7, 0],
        [LZ1 - 5.4, LZ1, LZ1 - 2.7, Math.PI],
      ] as const)
        for (let k = 0; k <= 8; k++) {
          const x = LX0 + 0.5 + k * 2.75;
          flat('line', W0, x - 0.05, x + 0.05, z0, z1, Y.court);
          if (k < 8 && rnd() < 0.5 && Math.abs(x + 1.375 - (LX1 - 5)) > 3)
            car(x + 1.375, cz, rot + (rnd() - 0.5) * 0.05, CAR[Math.floor(rnd() * CAR.length)]);
        }
      occupy(W0, LX0, LX1, LZ0, LZ1, 1);
      // 塔台（停车场北边、机场路西边的空地）
      const x = LX0 + 3;
      const z = LZ0 - 8;
      wcube('concrete', x, z, 4, 16, 4);
      wcube('jug', x, z, 6.4, 2.8, 6.4, 16);
      wcube('concrete', x, z, 7.4, 0.6, 7.4, 18.8);
      thin(() => wcube('ironwork', x + 1.5, z + 1.5, 0.2, 3.2, 0.2, 19.4));
      wcube('clothRed', x + 1.5, z + 1.5, 0.5, 0.5, 0.5, 22.4);
      blockRect(W0, x - 2.2, x + 2.2, z - 2.2, z + 2.2);
      occupy(W0, x - 4, x + 4, z - 4, z + 4, 1);
      // 停车场南沿两棵棕榈
      for (const px of [LX0 + 2, LX1 - 2]) inst.palm.push(item(px, LZ1 + 3, 1.0, rnd() * 6));
    }
    // ── 风向袋 + 一圈白色标志圈（跑道西边、滑行道外） ──
    {
      const [x, z] = at(R, TX - 12, -RL * 0.4);
      thin(() => wcube('ironwork', x, z, 0.2, 6, 0.2));
      putG(
        reg(x, z),
        'toolOrange',
        new THREE.ConeGeometry(0.55, 2.8, 8)
          .rotateZ(Math.PI / 2)
          .rotateY(0.5)
          .translate(x + 1.3, 5.6, z + 0.7),
      );
      d.block({ x, z, r: 0.3 });
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        wcube('clothWhite', x + Math.cos(a) * 6, z + Math.sin(a) * 6, 1.4, 0.3, 0.6, 0, -a);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // 塔奎兹溪高尔夫（GREENS.tahquitz_golf；干河床斜穿过去）
  // ════════════════════════════════════════════════════════════════════
  function golf(): void {
    const rnd = d.rng('valley:east:golf');
    const poly = GREENS.find((q) => q.id === 'tahquitz_golf')?.poly ?? [];
    // 第三轮（山谷缩到 0.7）：球场 290 × 170 米，河床（宽度只缩到 0.85）横在中间 66 米宽，北边一条、南边一条。
    // 六个洞放不下：北边两个洞、南边两个洞往回打；球车道绕一圈，东西两头各一座木桥过河床；池塘删了。
    const CART: V2[] = [
      [775, -283],
      [790, -298],
      [900, -294],
      [1010, -288],
      [1048, -262],
      [1052, -200],
      [1035, -160],
      [930, -148],
      [830, -160],
      [795, -195],
      [785, -262],
      [775, -283],
    ];
    // 层高：球道 / 河床沙 0.027（压草 0.015）→ 果岭、剪草条、池塘 0.039 → 球车道 0.045 → 沙坑、浪花 0.051 → 洞 0.063
    const GY = { base: 0.027, green: 0.039, cart: 0.045, bunker: 0.051, cup: 0.063 };
    // 河床在球场里露出来（build 的草盖住了）：只在球场的 x 范围里再铺一层沙（不盖到日出大道的桥、球场外的河床步道）
    const xs = poly.map((v) => v[0]);
    const GX0 = Math.min(...xs);
    const GX1 = Math.max(...xs);
    const wpts: V2[] = [];
    const whs: number[] = [];
    for (let x = GX0; x <= GX1; x += 10) {
      const k = WASH.pts.findIndex((p, n) => n > 0 && p[0] >= x);
      if (k < 1) continue;
      const [ax, az] = WASH.pts[k - 1];
      const [bx, bz] = WASH.pts[k];
      const t = (x - ax) / (bx - ax);
      wpts.push([x, az + (bz - az) * t]);
      whs.push(WASH.half[k - 1] + (WASH.half[k] - WASH.half[k - 1]) * t);
    }
    band('sandPatch', wpts, whs, GY.base);
    // 河床步道在沙下面了：球场里那段再画一遍（同 build 的宽）
    const wt = road('wash_trail');
    if (wt) {
      const tp = wt.pts.filter((p) => p[0] >= GX0 - 60);
      band('path', tp, wt.w / 2 + 0.3, GY.green);
    }
    // 河床里几块石头（场上看得见的"障碍"）：躲开步道、球车道、桥，一团一团的不规则石头
    const rockG = (r: number) => {
      const g = new THREE.DodecahedronGeometry(r, 0);
      g.scale(0.85 + rnd() * 0.35, 0.5 + rnd() * 0.2, 0.85 + rnd() * 0.35);
      g.rotateY(rnd() * Math.PI * 2);
      return g;
    };
    for (let k = 0; k < 14; k++) {
      const x = GX0 + 20 + rnd() * (GX1 - GX0 - 40);
      const kk = WASH.pts.findIndex((p, n) => n > 0 && p[0] >= x);
      if (kk < 1) continue;
      const [ax, az] = WASH.pts[kk - 1];
      const [bx, bz] = WASH.pts[kk];
      const z = az + ((bz - az) * (x - ax)) / (bx - ax) + (rnd() - 0.5) * 50;
      if (washDist(x, z) > -4) continue;
      if (wt && distToLine(wt.pts, x, z) < 4) continue;
      if (distToLine(CART, x, z) < 5) continue;
      const r = 0.45 + rnd() * 0.6;
      putG(reg(x, z), 'rock', rockG(r).translate(x, r * 0.15, z));
      if (rnd() < 0.6) {
        const r2 = r * (0.4 + rnd() * 0.3);
        putG(reg(x, z), 'rock', rockG(r2).translate(x + r + r2 * 0.6, r2 * 0.1, z + (rnd() - 0.5) * r));
      }
    }
    // 六个洞：发球台 → 果岭（3、6 号跨河床）
    const HOLES: [V2, V2, number][] = [
      [[805, -285], [888, -281], 7],
      [[915, -285], [1005, -275], 7],
      [[1030, -172], [935, -165], 9],
      [[905, -170], [830, -185], 9],
    ];
    const FLAGS: PalKey[] = ['clothRed', 'flowerYellow', 'clothBlue', 'clothRed'];
    HOLES.forEach(([tee, grn, hw], i) => {
      const L = Math.hypot(grn[0] - tee[0], grn[1] - tee[1]);
      const u: V2 = [(grn[0] - tee[0]) / L, (grn[1] - tee[1]) / L];
      const rot = Math.atan2(u[0], u[1]);
      // 球道：每 6 米一个点，宽窄起伏；在河床里断开（要打过去）
      let run: V2[] = [];
      let hs: number[] = [];
      const flush = () => {
        if (run.length > 1) band('lawnStripe', run, hs, GY.base);
        run = [];
        hs = [];
      };
      for (let s = 14; s < L - 12; s += 6) {
        const x = tee[0] + u[0] * s;
        const z = tee[1] + u[1] * s;
        const h = hw * (0.75 + 0.35 * Math.sin(s * 0.05 + i * 2) + 0.1 * rnd());
        // 球道的边也不压到河床的沙上（同一层，压上就闪）
        if (washDist(x, z) < h + 1 || !inPoly(poly, x, z)) {
          flush();
          continue;
        }
        run.push([x, z]);
        hs.push(h);
        // 剪草的横条（隔一段一条亮的），球道从远处也读得出来
        if (Math.floor(s / 6) % 2 === 0 && s + 6 < L - 12)
          band(
            'green',
            [
              [x, z],
              [x + u[0] * 6, z + u[1] * 6],
            ],
            h - 1.2,
            GY.green,
          );
        // 球道两边的棕榈：每 ~40 米一簇 2～3 棵，左右交替
        if (s % 42 < 6 && s > 20) {
          const side = Math.floor(s / 42) % 2 ? 1 : -1;
          const o = h + 5 + rnd() * 4;
          const n = 2 + Math.floor(rnd() * 2);
          for (let k = 0; k < n; k++) {
            const px = x - u[1] * side * (o + k * 2.2) + u[0] * (rnd() - 0.5) * 5;
            const pz = z + u[0] * side * (o + k * 2.2) + u[1] * (rnd() - 0.5) * 5;
            if (washDist(px, pz) > 3 && inPoly(poly, px, pz) && distToLine(CART, px, pz) > 4)
              inst.palm.push(item(px, pz, 0.9 + rnd() * 0.3, rnd() * 6));
          }
        }
      }
      flush();
      // 发球台：高出一点的一块，两个白色发球标
      const T: Fr = { x: tee[0], z: tee[1], r: rot };
      cube('green', T, 0, 0, 5, 0.22, 7, 0);
      for (const s of [-1, 1]) cube('clothWhite', T, s * 1.6, -2, 0.22, 0.22, 0.22, 0.22);
      cube('woodWeathered', T, 3.4, 2.4, 0.9, 0.7, 0.14, 0.4); // 洞号牌
      thin(() => cube('woodWeathered', T, 3.4, 2.4, 0.16, 0.5, 0.16, 0));
      // 果岭 + 旗 + 洞
      disc('green', grn[0], grn[1], 9, 7, GY.green, rot, 18);
      const px = grn[0] + (rnd() - 0.5) * 5;
      const pz = grn[1] + (rnd() - 0.5) * 4;
      disc('net', px, pz, 0.22, 0.22, GY.cup, 0, 8);
      thin(() => {
        wcube('ironwork', px, pz, 0.12, 2.4, 0.12);
        wcube(FLAGS[i], px + 0.4, pz, 0.75, 0.48, 0.06, 1.85);
      });
      // 沙坑：果岭边一两个（两三个圆拼成的豆子形），一个球道沙坑
      const G: Fr = { x: grn[0], z: grn[1], r: rot };
      const bunker = (lx: number, lz: number, r: number) => {
        for (let k = 0; k < 3; k++) {
          const [x, z] = at(G, lx + (k - 1) * r * 0.9, lz + (rnd() - 0.5) * r * 0.6);
          const rr = r * (0.8 + rnd() * 0.3);
          if (distToLine(CART, x, z) > rr + 1.6) disc('sandHigh', x, z, rr, r * 0.7, GY.bunker, rot, 12);
        }
      };
      bunker(i % 2 ? 9 : -9, 2, 2.6);
      if (i % 3 !== 1) bunker(i % 2 ? -8 : 8, -4, 2.2);
      const s = L * 0.55;
      const fx = tee[0] + u[0] * s;
      const fz = tee[1] + u[1] * s;
      if (washDist(fx, fz) > 6) {
        const F: Fr = { x: fx, z: fz, r: rot };
        const [bx, bz] = at(F, (i % 2 ? -1 : 1) * hw * 0.9, 0);
        if (distToLine(CART, bx, bz) > 5) disc('sandHigh', bx, bz, 3.2, 2.0, GY.bunker, rot + 0.6, 12);
      }
    });
    // ── 球车道（浅色水泥，弯弯地连各洞），过河床的两座木桥 ──
    band('path', CART, 1.2, GY.cart);
    for (let ci = 1; ci < CART.length; ci++) {
      const a = CART[ci - 1];
      const b = CART[ci];
      // 只给穿过河床的那几段架桥
      let wet = false;
      for (let q = 0; q <= 1; q += 0.05)
        if (washDist(a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q) < 0) wet = true;
      if (!wet) continue;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const u: V2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const rot = Math.atan2(u[0], u[1]);
      const f: Fr = { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, r: rot };
      // 只在河床那段架桥
      let s0 = 0;
      let s1 = L;
      for (let s = 0; s <= L; s += 1)
        if (washDist(a[0] + u[0] * s, a[1] + u[1] * s) < 0.5) {
          s0 = s;
          break;
        }
      for (let s = L; s >= 0; s -= 1)
        if (washDist(a[0] + u[0] * s, a[1] + u[1] * s) < 0.5) {
          s1 = s;
          break;
        }
      // 桥不伸出这一段（原来两头各多 2 米，拐弯处横到下一段路上）
      const b0 = Math.max(0, s0 - 2);
      const b1 = Math.min(L, s1 + 2);
      const m = (b0 + b1) / 2 - L / 2;
      const len = b1 - b0;
      cube('wood', f, 0, m, 3.4, 0.12, len, 0.0);
      // 栏杆在河床步道穿过的地方断开（步道从桥面上横穿过去，不能被一道栏杆拦住）
      const gaps: [number, number][] = [];
      if (wt)
        for (let q = 0; q <= len; q += 0.5) {
          const [x, z] = at(f, 0, m - len / 2 + q);
          if (distToLine(wt.pts, x, z) < wt.w / 2 + 1.4) {
            const last = gaps[gaps.length - 1];
            if (last && q - last[1] < 0.6) last[1] = q;
            else gaps.push([q, q]);
          }
        }
      const pieces = cut(
        0,
        len,
        gaps.map(([a, b]) => [a - 0.5, b + 0.5] as const),
      );
      for (const sx of [-1, 1])
        for (const [p0, p1] of pieces) {
          const pm = m - len / 2 + (p0 + p1) / 2;
          const pl = p1 - p0;
          const n = Math.max(1, Math.round(pl / 4));
          thin(() => {
            cube('woodWeathered', f, sx * 1.75, pm, 0.16, 0.12, pl, 0.85);
            for (let k = 0; k <= n; k++)
              cube('woodWeathered', f, sx * 1.75, pm - pl / 2 + (pl * k) / n, 0.18, 0.95, 0.18);
          });
          blockSeg(at(f, sx * 1.75, pm - pl / 2), at(f, sx * 1.75, pm + pl / 2), 0.15);
        }
    }
    // 两辆球车停在球车道边上（不在道上）
    gcart(850, -292.4, Math.PI / 2 + 0.06);
    gcart(980, -150, -Math.PI / 2 + 0.1);
    // 球具店（球场西北角外、日出大道边），球车棚，练习果岭：位置按原来的过 S
    const [hx, hz] = S(1034, -412);
    wcube('stucco', hx, hz, 18, 4.5, 10);
    wcube('roofTile', hx, hz, 19.4, 0.4, 11.4, 4.5);
    wcube('clothTeal', hx, hz + 5.8, 8, 0.2, 1.8, 2.8);
    wcube('signBoard', hx, hz + 5.1, 6, 0.9, 0.1, 3.5);
    blockRect(W0, hx - 9, hx + 9, hz - 5, hz + 5);
    occupy(W0, hx - 10, hx + 10, hz - 6, hz + 6, 1);
    // 球车棚：铁皮顶 + 一排白球车
    const [bx, bz] = S(1034, -394.5);
    wcube('metal', bx, bz, 16, 0.25, 6, 2.6);
    thin(() => {
      for (const x of [bx - 7.5, bx, bx + 7.5])
        for (const z of [bz - 2.7, bz + 2.7]) wcube('metal', x, z, 0.18, 2.6, 0.18);
    });
    for (let k = 0; k < 6; k++) gcart(bx - 6 + k * 2.4, bz, 0);
    occupy(W0, bx - 8, bx + 8, bz - 3.5, bz + 3.5, 1);
    // 练习果岭
    const [qx, qz] = S(1036, -432);
    disc('green', qx, qz, 8, 4.5, GY.green, 0, 16);
    thin(() => {
      for (const [x, z, k] of [
        [qx - 4, qz, 'clothRed'],
        [qx + 3, qz - 1.5, 'flowerYellow'],
        [qx + 0.5, qz + 1.8, 'clothBlue'],
      ] as const) {
        wcube('ironwork', x, z, 0.1, 1.0, 0.1);
        wcube(k, x + 0.2, z, 0.35, 0.25, 0.05, 0.75);
      }
    });
    // 几棵树（球道边成团、河床边）
    for (const [x, z, s] of [
      [880, -306, 1.0],
      [1030, -299, 0.9],
      [980, -139, 0.9],
      [870, -141, 1.0],
      [1062, -182, 0.85],
      [900, -191, 0.8],
    ])
      inst.tree.push(item(x, z, s, rnd() * 6));
    for (const [x, z] of [S(1018, -428), S(1018, -398)]) inst.palm.push(item(x, z, 1.05, rnd() * 6));
  }

  // ════════════════════════════════════════════════════════════════════
  // 小区：向日葵小区（日出大道东）、深井小区（河床南）
  // ════════════════════════════════════════════════════════════════════
  function neighborhoods(): void {
    const rnd = d.rng('valley:east:yards');
    const MINE = new Set(['sunrise_park_east', 'sunrise_cul', 'deepwell', 'deepwell_cul']);
    const all = houses();
    const mine = all.filter((h) => MINE.has(h.id.slice(0, h.id.lastIndexOf('_'))));
    const foot = all.map((h) => ({ h, r: Math.max(h.w, h.d) / 2 }));
    const clear = (x: number, z: number, self: (typeof all)[number], pad: number) =>
      roadGap(x, z) > pad &&
      washDist(x, z) > 2 &&
      !foot.some(({ h, r }) => h !== self && Math.hypot(h.x - x, h.z - z) < r + pad);
    // 车的颜色只用不带噪点的材质（silverBlue、sage 是植物的，车身上一片抖点）
    const CARS: PalKey[] = ['concrete', 'carRed', 'clothWhite', 'clothBlue', 'cap', 'metal', 'flowerYellow'];
    for (const h of mine) {
      const rid = h.id.slice(0, h.id.lastIndexOf('_'));
      const deep = rid.startsWith('deepwell');
      const rd = road(rid);
      if (!rd) continue;
      const f: Fr = { x: h.x, z: h.z, r: h.rot ?? 0 };
      // 哪边朝路：最近的路点在局部 z 的哪一侧
      const q = nearestOn(rd.pts, h.x, h.z);
      const lzDir: V2 = [Math.sin(f.r), Math.cos(f.r)];
      const fz = (q[0] - h.x) * lzDir[0] + (q[1] - h.z) * lzDir[1] >= 0 ? 1 : -1;
      const toRoad = Math.hypot(q[0] - h.x, q[1] - h.z) - rd.w / 2;
      const hw = h.w / 2;
      const hd = h.d / 2;
      // 车道：房子一侧往路上去；一半停着车（车棚删了：一块悬着的铁皮顶，看不懂、投一大块方影）
      const side = rnd() < 0.5 ? -1 : 1;
      const dx = side * (hw - 2.6);
      const dz0 = fz * hd;
      const dz1 = fz * (toRoad - 0.2);
      if (Math.abs(dz1) > Math.abs(dz0) + 1) {
        flat('path', f, dx - 1.8, dx + 1.8, Math.min(dz0, dz1), Math.max(dz0, dz1), 0.034);
        const r0 = rnd();
        const cz = fz * (hd + 3.2);
        // 车整个在车道上（四个角离路面边 ≥ 0.8 米），不伸进路里
        const carOk = [-1, 1].every((a) => [-2.3, 2.3].every((b) => roadGap(...at(f, dx + a, cz + b)) > 0.8));
        if (r0 < 0.55 && carOk)
          car(...at(f, dx, cz), f.r + (fz > 0 ? 0 : Math.PI), CARS[Math.floor(rnd() * CARS.length)], rnd() < 0.25);
      }
      // 前院：三成草坪（沙漠里浇水的那几家），其余砾石 + 一团仙人掌、龙舌兰、石头
      const front = fz * (hd + 0.2);
      const yardEnd = fz * Math.min(hd + 6, toRoad - 0.5);
      // 草坪 0.022、车道 0.034：车道横穿草坪的那块错开 0.012（原来 0.03 / 0.034 闪）
      if (rnd() < 0.3) flat('lawn', f, -hw + 0.4, hw - 0.4, Math.min(front, yardEnd), Math.max(front, yardEnd), 0.022);
      else {
        const cx = -side * (hw - 2.5);
        const cz = fz * (hd + 2.4);
        const [x, z] = at(f, cx, cz);
        const ok = (px: number, pz: number) => roadGap(px, pz) > 1.2;
        if (ok(x, z)) inst.agave.push(item(x, z, 0.8 + rnd() * 0.5, rnd() * 6));
        const cxz: V2 = [x + 1.4 * (rnd() - 0.5), z + 1.2];
        if (rnd() < 0.6 && ok(...cxz)) inst.cactus.push(item(...cxz, 0.7 + rnd() * 0.6, rnd() * 6));
        if (rnd() < 0.5 && ok(x - 1.3, z)) {
          const r = 0.45 + rnd() * 0.35;
          putG(reg(x, z), 'rock', new THREE.DodecahedronGeometry(r, 0).scale(1, 0.6, 1).translate(x - 1.3, r * 0.2, z));
        }
      }
      const pxz = at(f, -side * (hw - 1), fz * (hd + 3.5));
      if (rnd() < 0.22 && roadGap(...pxz) > 2.5) inst.palm.push(item(...pxz, 0.85 + rnd() * 0.3, rnd() * 6));
      // 后院：泳池（深井六成、向日葵四成），矮土坯墙围一圈，柑橘树
      const back = -fz;
      const pool = rnd() < (deep ? 0.6 : 0.4);
      const wallOn = rnd() < 0.65;
      const yd = hd + 9;
      const corners: V2[] = [
        at(f, -hw - 1.5, 0),
        at(f, -hw - 1.5, back * yd),
        at(f, hw + 1.5, back * yd),
        at(f, hw + 1.5, 0),
      ];
      // 后院不压到别的东西（机场停车场、公园……）：四个角都要在空地上
      const backOk =
        corners.every(([x, z]) => clear(x, z, h, 1.5) && isFree(x, z, 1)) &&
        clear(...at(f, 0, back * yd), h, 1.5) &&
        isFree(...at(f, 0, back * yd), 1);
      if (!backOk) continue;
      if (wallOn) {
        const seg = (a: V2, b: V2) => {
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          // 矮墙不投影：傍晚一道十几米的墙投出来是一条长直黑带
          thin(() => {
            cube(
              'adobe',
              W0,
              (a[0] + b[0]) / 2,
              (a[1] + b[1]) / 2,
              0.3,
              1.6,
              L,
              0,
              Math.atan2(b[0] - a[0], b[1] - a[1]),
            );
            cube(
              'cap',
              W0,
              (a[0] + b[0]) / 2,
              (a[1] + b[1]) / 2,
              0.4,
              0.1,
              L + 0.1,
              1.6,
              Math.atan2(b[0] - a[0], b[1] - a[1]),
            );
          });
          blockSeg(a, b, 0.2);
        };
        seg(corners[0], corners[1]);
        seg(corners[1], corners[2]);
        // 一边留个院门
        const [c2, c3] = [corners[2], corners[3]];
        const mid: V2 = [c2[0] + (c3[0] - c2[0]) * 0.75, c2[1] + (c3[1] - c2[1]) * 0.75];
        seg(c2, mid);
      }
      const pl = (rnd() - 0.5) * (h.w - 9);
      if (pool) {
        const pz = back * (hd + 4.6);
        cube('concrete', f, pl, pz, 8.6, 0.14, 4.6);
        flat('water', f, pl - 3.9, pl + 3.9, pz - 1.9, pz + 1.9, 0.15);
        blockRect(f, pl - 4.3, pl + 4.3, pz - 2.3, pz + 2.3);
      }
      const trees = deep ? 1 + Math.floor(rnd() * 2.2) : rnd() < 0.5 ? 1 : 0;
      for (let k = 0; k < trees; k++) {
        const tx = (k % 2 ? -1 : 1) * (hw - 1.2) * (pool ? 1 : 0.4 + rnd() * 0.5);
        const tz = back * (pool ? hd + 8 : hd + 3 + rnd() * 5);
        inst.citrus.push(item(...at(f, tx, tz), 0.8 + rnd() * 0.35, rnd() * 6));
      }
      occupy(f, -hw - 1.5, hw + 1.5, Math.min(0, back * yd), Math.max(0, back * yd), 1);
    }
    for (const h of all) occupy({ x: h.x, z: h.z, r: h.rot ?? 0 }, -h.w / 2, h.w / 2, -h.d / 2, h.d / 2, 3, false);

    // ── 深井小区：老葡萄柚园的残片（环里手摆三块，一行行、缺几棵；环外沿路的不算） ──
    const dw = road('deepwell');
    if (dw) {
      const loop = dw.pts;
      // 三块园子的范围按原尺寸写、过 S（第三轮缩到 0.7；树距 7 米不缩，所以棵数少了）
      const BLOCKS = (
        [
          [588, 642, -276, -232],
          [652, 692, -252, -204],
          [556, 600, -228, -196],
        ] as const
      ).map(([a, b, c, e]) => {
        const [x0, z0] = S(a, c);
        const [x1, z1] = S(b, e);
        return [x0, x1, z0, z1] as const;
      });
      for (const [x0, x1, z0, z1] of BLOCKS) {
        for (let x = x0; x <= x1; x += 7)
          for (let z = z0; z <= z1; z += 7) {
            if (rnd() < 0.16) continue; // 死了 / 砍了的
            const jx = x + (rnd() - 0.5) * 0.8;
            const jz = z + (rnd() - 0.5) * 0.8;
            if (!inPoly(loop, jx, jz) || roadGap(jx, jz) < 4 || !isFree(jx, jz, 1)) continue;
            inst.citrus.push(item(jx, jz, 0.85 + rnd() * 0.3, rnd() * 6));
          }
        // 园子里一条灌溉沟、一个老水泵房
        band(
          'sandDrift',
          [
            [x0 - 2, (z0 + z1) / 2 + 3.5],
            [x1 + 2, (z0 + z1) / 2 + 3.5],
          ],
          0.6,
          0.022,
        );
      }
      const pump: V2 = S(612, -228);
      if (isFree(pump[0], pump[1], 2)) {
        wcube('adobe', pump[0], pump[1], 3.2, 2.6, 3.0);
        wcube('rust', pump[0], pump[1], 3.6, 0.2, 3.4, 2.6);
        wcube('rust', pump[0] + 2.2, pump[1], 0.4, 1.4, 0.4);
        d.block({ x: pump[0], z: pump[1], r: 2.0 });
        occupy(W0, pump[0] - 2, pump[0] + 2.6, pump[1] - 2, pump[1] + 2, 1);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // 椰枣园（GREENS.date_grove / date_grove_s；路边的椰枣摊按日出大道、东棕榈谷大道的路边摆）
  // ════════════════════════════════════════════════════════════════════
  function groves(): void {
    const rnd = d.rng('valley:east:grove');
    const G = (id: string) => GREENS.find((q) => q.id === id)?.poly ?? [];
    /**
     * 一片园：土路十字分成四块，两块漫灌沟（沿棕榈一列一条深色沟）、两块树盘（每棵一块方的深色土），
     * 东西土路北边一条水渠（混凝土边 + 水）、隔一段一个出水口；拖拉机、叶堆成簇放在土路边上。
     * 土路正好在两排棕榈中间（build.ts 的棕榈按 minX + 6 + 12i 种，路在 minX + 12k 上），出水口也在两列之间。
     */
    const grove = (poly: readonly V2[], tx: number, tz: number) => {
      const xs = poly.map((v) => v[0]);
      const zs = poly.map((v) => v[1]);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const z0 = Math.min(...zs);
      const z1 = Math.max(...zs);
      // 土路对准两排棕榈的正中（build.ts 的棕榈在 minX + 6 + 12i 上）
      tx = x0 + 12 * Math.max(1, Math.round((tx - x0) / 12));
      tz = z0 + 12 * Math.max(1, Math.round((tz - z0) / 12));
      // 土路：压实的浅沙（不是碎石步道那种一块块的纹）；两头收在园子里（斜边的园子，外框的角不在园子里）
      const inside = (x: number, z: number) => inPoly(poly, x, z);
      let ez0 = z0 + 1;
      while (ez0 < z1 && !inside(tx, ez0 - 1)) ez0 += 1;
      let ez1 = z1 - 1;
      while (ez1 > z0 && !inside(tx, ez1 + 1)) ez1 -= 1;
      let ex0 = x0 + 1;
      while (ex0 < x1 && !inside(ex0 - 1, tz)) ex0 += 1;
      let ex1 = x1 - 1;
      while (ex1 > x0 && !inside(ex1 + 1, tz)) ex1 -= 1;
      band(
        'sandHigh',
        [
          [ex0, tz],
          [ex1, tz],
        ],
        2.2,
        0.024,
      );
      band(
        'sandHigh',
        [
          [tx, ez0],
          [tx, ez1],
        ],
        2.2,
        0.024,
      );
      d.clear({ x0: ex0 - 2, x1: ex1 + 2, z0: tz - 3, z1: tz + 3 });
      d.clear({ x0: tx - 3, x1: tx + 3, z0: ez0 - 2, z1: ez1 + 2 });
      // 水渠：在南北土路那儿断开（路下面走暗管），两段
      for (const [a, b] of [
        [ex0, tx - 2.6],
        [tx + 2.6, ex1],
      ]) {
        band(
          'concrete',
          [
            [a, tz - 3.2],
            [b, tz - 3.2],
          ],
          0.6,
          0.03,
        );
        band(
          'water',
          [
            [a + 0.3, tz - 3.2],
            [b - 0.3, tz - 3.2],
          ],
          0.32,
          0.042,
        );
      }
      for (let x = x0 + 24; x < x1; x += 24)
        if (Math.abs(x - tx) > 3 && inPoly(poly, x, tz - 3.2)) cyl('concrete', x, tz - 3.2, 0.4, 0.5);
      // 每块按 (东/西, 南/北) 选沟或树盘
      for (let x = x0 + 6; x < x1; x += 12) {
        const west = x < tx;
        for (let z = z0 + 6; z < z1; z += 12) {
          if (!inPoly(poly, x, z)) continue;
          if (Math.abs(z - tz) < 4 || Math.abs(x - tx) < 4) continue;
          const north = z < tz;
          const furrow = west ? north : !north;
          if (furrow) flat('sandDrift', { x, z, r: 0 }, -1.1, 1.1, -6, 6, 0.022);
          else flat('sandDrift', { x, z, r: 0 }, -1.8, 1.8, -1.8, 1.8, 0.022);
        }
      }
      // 叶堆、梯子、拖拉机
      for (let k = 0; k < 7; k++) {
        const x = tx + (rnd() < 0.5 ? -1 : 1) * (12 + Math.floor(rnd() * 6) * 12);
        const z = tz + 4.2 + (rnd() - 0.5) * 0.4;
        if (!inPoly(poly, x, z)) continue;
        inst.frond.push(item(x, z, 0.8 + rnd() * 0.35, rnd() * 6));
      }
      {
        // 拖拉机停在南北土路东边的路肩上（路和棕榈列之间），不堵路
        const z = tz - 40 - Math.floor(rnd() * 3) * 12;
        const f: Fr = { x: tx + 3.4, z, r: 0 };
        cube('net', f, 0, 0, 1.6, 0.5, 2.6, 0);
        cube('seat', f, 0, 0.2, 1.4, 0.9, 2.4, 0.4);
        cube('seat', f, 0, 0.8, 1.2, 1.0, 1.0, 1.3);
        cube('jug', f, 0, 0.8, 1.15, 0.6, 1.05, 1.5);
        cube('ironwork', f, 0, -0.9, 0.14, 0.7, 0.14, 1.3);
        cube('woodWeathered', f, 0, 4.1, 1.8, 0.7, 3.6, 0.3);
        cube('palmSkirt', f, 0, 4.1, 1.6, 0.5, 3.2, 1.0);
        blockRect(f, -1, 1, -1.4, 6);
        occupy(f, -1, 1, -1.4, 6, 1);
      }
      // （梯子删了：一块 6 米的木板斜靠在空处，看不懂）
    };
    grove(G('date_grove'), ...S(866, -1106));
    grove(G('date_grove_s'), ...S(1300, 86));

    /** 路边的椰枣摊：白墙、蓝条纹雨篷、一桌一箱箱椰枣、高高的路牌、一辆皮卡；front = 朝路那面（局部 −z） */
    const stand = (x: number, z: number, rot: number, gravel: [number, number, number, number], signAt: V2) => {
      flat('sandDrift', W0, ...gravel, 0.024);
      occupy(W0, ...gravel, 0.5);
      const f: Fr = { x, z, r: rot };
      cube('stucco', f, 0, 0, 8, 3.2, 5);
      cube('roofTile', f, 0, 0, 8.8, 0.3, 5.8, 3.2);
      cube('canvasStripe', f, 0, -3.6, 8.4, 0.18, 2.4, 2.6);
      thin(() => {
        for (const s of [-1, 1]) cube('wood', f, s * 4, -4.6, 0.16, 2.6, 0.16);
      });
      cube('wood', f, 0, -3.0, 6, 0.95, 0.7);
      for (let k = 0; k < 5; k++) {
        cube('woodWeathered', f, -2.4 + k * 1.2, -3.0, 0.8, 0.3, 0.5, 0.95);
        cube('branch', f, -2.4 + k * 1.2, -3.0, 0.7, 0.08, 0.4, 1.25);
      }
      cube('signBoard', f, 0, -2.55, 4.5, 0.7, 0.1, 3.4);
      blockRect(f, -4.2, 4.2, -3.4, 2.6);
      occupy(f, -5, 5, -6, 3, 1);
      // 路牌
      // 斜着 45°：路上两个方向的车都看得见（镜头也看得见）
      const sf: Fr = { x: signAt[0], z: signAt[1], r: rot + Math.PI / 4 };
      for (const s of [-1.4, 1.4]) {
        thin(() => cube('wood', sf, s, 0, 0.22, 4.4, 0.22));
        const [px, pz] = at(sf, s, 0);
        d.block({ x: px, z: pz, r: 0.3 });
      }
      cube('signBoard', sf, 0, 0, 3.6, 1.8, 0.16, 2.8);
      cube('flowerYellow', sf, 0, -0.02, 2.6, 0.5, 0.18, 3.6);
      // 两张野餐桌、一辆皮卡
      picnic(...at(f, -6.5, -2), rot);
      picnic(...at(f, 6.2, 0.5), rot);
      car(...at(f, 9.5, -7.5), rot + Math.PI / 2, 'carRed', true);
      for (const [lx, lz] of [
        [-6, 3],
        [6.5, 4],
      ])
        inst.palm.push(item(...at(f, lx, lz), 1.0, rnd() * 6));
    };
    // 北园：日出大道边（路西），朝东；摊子离路面边 11 米
    {
      const sr = road('sunrise');
      const z = S(977, -1000)[1];
      const re = (sr ? nearestOn(sr.pts, 700, z)[0] : 742) - (sr?.w ?? 10) / 2;
      const x = re - 11;
      stand(x, z, -Math.PI / 2, [x - 10, re - 1, z - 14, z + 14], [re - 3.5, z - 17]);
    }
    // 南园：东棕榈谷大道边（路南），朝北
    {
      const ep = road('e_palm_canyon');
      const x = S(1212, -42)[0];
      const re = (ep ? nearestOn(ep.pts, x, 0)[1] : -52) + (ep?.w ?? 14) / 2;
      const z = re + 15.6;
      stand(x, z, 0, [x - 13.5, x + 14.5, re + 2, z + 6], [x + 20.6, re + 5]);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // 实例化：树、柑橘、棕榈、球、锥桶、龙舌兰、仙人掌、叶堆；最后是不投影的那批（thin）
  // ════════════════════════════════════════════════════════════════════
  function placeInstances(): void {
    const dI = (g: THREE.BufferGeometry, key: PalKey, items: InstItem[], cast = true) => {
      if (items.length) d.instance(g, key, items, cast);
    };
    // 树（牧豆树 / 遮阴树）：短干 + 三团球面法线的冠（一团大的压扁、两团小的偏开），不是一颗宝石
    {
      const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.6, 5).translate(0, 1.3, 0);
      const crown = mergeAll([
        blob(1.7, 1.2, 0.62, 1.1).translate(0, 3.2, 0),
        blob(1.15, 1, 0.7, 1).translate(1.25, 2.9, 0.55),
        blob(1.25, 1, 0.68, 1).translate(-1.05, 3.0, -0.6),
      ]);
      dI(trunk, 'branch', inst.tree, false); // 短干的影子被冠的影子盖住，不投省三角形
      dI(crown, 'olive', inst.tree);
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
