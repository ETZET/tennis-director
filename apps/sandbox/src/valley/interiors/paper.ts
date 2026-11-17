// 报社：一间编辑部（设计稿 P1～P3）。总编在北边玻璃隔断里的办公桌后面（P1 登广告、P2 采访），西墙挂旧报（P3 点 1960 年那期），记者的桌子，前台。印刷车间不进。
// 局部坐标：x 0…20（西 → 东）、z 0…18（北 → 南），南墙正中是门；框架（interiors/index.ts）画地板、墙、门。只改这个文件（和 assets/paper.ts 里 in- 开头的室内资产）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CastLook } from '../../clubsite/cast/types';
import { player } from '../../clubsite/people';
import { createDresser } from '../../clubsite/people/dress';
import type { BaseCtx } from '../../clubsite/render/ctx';
import type { ToonOpts } from '../../clubsite/render/toon';
import { ASSETS } from '../assets';
import type { InNight } from '../assets/paper';
import type { AssetCtx } from '../ctx';
import type { PalKey } from '../palette';
import type { InteriorCtx, InteriorDef } from './index';

/** 摆一件：资产 id（in- 开头）、局部坐标、绕 y 转（0 = 正面朝南 / 朝镜头）、变体；灰盒的尺寸 [宽 x, 高, 深 z]；挡路收边 */
interface Place {
  id: string;
  x: number;
  z: number;
  rot?: number;
  v?: number;
  size: [number, number, number];
  /** 挡路（默认按 size 挡；false = 不挡：墙上的、头顶上的） */
  block?: boolean;
  /** 离地高（头顶上的东西） */
  y?: number;
}

const W = 20;
const D = 18;
/** 屋外的暗地（自发光、不受光照和云影）：画出来 ≈ main.ts 的 INSIDE_BG #231c2e（管线会把自发光抬亮一点，这里先压低） */
const VOID = 0x1a1424;

/**
 * 摆放（局部坐标）。北边 z 0…4 在北墙的影子里（正午太阳在北边、仰角 ~48°）：放档案架、文件柜、书架这些"暗框"；
 * 总编的桌子往南挪到影子边上（亮的）。从门进来：先看到前台，抬头是玻璃隔断里的总编（右上），左边是记者的桌子和西墙的旧报。
 */
export const PLACES: Place[] = [
  // ── 地板（橡木 + 总编室地毯 + 门口长条地毯）、北墙的皮（护墙板 + 报头大招牌 + 钟 + 软木板 + 总编室的窗）──
  { id: 'in-paper-floor', x: W / 2, z: 0, size: [W, 0.05, D], block: false },
  { id: 'in-paper-north-wall', x: W / 2, z: 0, size: [W, 4.4, 0.1], block: false },
  { id: 'in-paper-archive-shelf', x: 1.7, z: 0.4, size: [2.8, 2.6, 0.7] },
  { id: 'in-paper-file-cabinet', x: 4.6, z: 0.38, size: [2.2, 1.35, 0.7] },
  // ── 记者的桌子（2 × 2）：人坐在南边（镜头这边）朝北，显示器 / 打字机朝南 ──
  { id: 'in-paper-reporter-desk', x: 2.8, z: 5.4, v: 0, size: [2.4, 0.8, 1.2] },
  { id: 'in-paper-reporter-desk', x: 7.6, z: 5.4, v: 1, size: [2.4, 0.8, 1.2] },
  { id: 'in-paper-reporter-desk', x: 2.8, z: 8.9, v: 3, size: [2.4, 0.8, 1.2] },
  { id: 'in-paper-reporter-desk', x: 7.6, z: 8.9, v: 2, size: [2.4, 0.8, 1.2] },
  { id: 'in-paper-chair', x: 2.65, z: 6.45, v: 0, rot: Math.PI, size: [0.6, 1.0, 0.6] },
  { id: 'in-paper-chair', x: 7.45, z: 6.5, v: 0, rot: Math.PI - 0.3, size: [0.6, 1.0, 0.6] },
  { id: 'in-paper-chair', x: 2.65, z: 9.95, v: 0, rot: Math.PI + 0.25, size: [0.6, 1.0, 0.6] },
  { id: 'in-paper-chair', x: 7.45, z: 9.95, v: 0, rot: Math.PI, size: [0.6, 1.0, 0.6] },
  // ── 电传打字机（美联社的稿子，纸条拖到地上）、饮水机 ──
  { id: 'in-paper-teletype', x: 10.2, z: 3.2, size: [1.0, 1.1, 0.8] },
  { id: 'in-paper-piles', x: 10.9, z: 4.4, v: 1, size: [0.8, 0.5, 0.6] },
  { id: 'in-paper-water-cooler', x: 10.6, z: 10.6, size: [0.5, 1.4, 0.5] },
  // ── 总编室（玻璃隔断：南边 z 7.8、西边 x 11.6，门洞 x 15.2…16.4；挡路在 build 里按段给）──
  { id: 'in-paper-glass-office', x: 15.8, z: 7.8, size: [8.4, 2.5, 0.12], block: false },
  { id: 'in-paper-bookshelf', x: 15.2, z: 0.32, size: [3.6, 2.3, 0.55] },
  { id: 'in-paper-editor-desk', x: 15.8, z: 4.8, size: [2.8, 0.8, 1.3] },
  { id: 'in-paper-chair', x: 15.8, z: 3.62, v: 1, size: [0.8, 1.3, 0.8] },
  { id: 'in-paper-chair', x: 14.4, z: 6.5, v: 2, rot: Math.PI - 0.25, size: [0.6, 0.95, 0.6] },
  { id: 'in-paper-chair', x: 17.2, z: 6.5, v: 2, rot: Math.PI + 0.25, size: [0.6, 0.95, 0.6] },
  { id: 'in-paper-coat-rack', x: 12.4, z: 0.9, size: [0.6, 1.9, 0.6] },
  { id: 'in-paper-plant', x: 19.2, z: 1.0, v: 0, size: [0.8, 1.7, 0.8] },
  { id: 'in-paper-file-cabinet', x: 19.25, z: 4.4, v: 1, rot: -Math.PI / 2, size: [0.7, 1.35, 0.7] },
  // ── 西墙伸出来的一段展墙：一排旧报（P3）──
  { id: 'in-paper-history-wall', x: 2.3, z: 12.6, size: [4.6, 2.6, 0.3] },
  // ── 前台（接待员在北边、脸朝南）──
  { id: 'in-paper-front-counter', x: 9.4, z: 13.6, size: [6.2, 1.1, 1.0] },
  { id: 'in-paper-chair', x: 8.6, z: 12.55, v: 0, size: [0.6, 1.0, 0.6] },
  { id: 'in-paper-piles', x: 13.2, z: 12.9, v: 0, size: [0.9, 0.7, 0.7] },
  // ── 门口：等候的长椅（靠南墙、朝北）、今天的报纸架、两盆植物 ──
  { id: 'in-paper-bench', x: 4.4, z: 17.2, rot: Math.PI, size: [2.2, 0.9, 0.7] },
  { id: 'in-paper-plant', x: 0.9, z: 17.1, v: 1, size: [0.8, 1.2, 0.8] },
  { id: 'in-paper-plant', x: 19.1, z: 17.0, v: 0, size: [0.8, 1.7, 0.8] },
  { id: 'in-paper-news-rack', x: 14.4, z: 17.2, size: [1.6, 1.2, 0.5] },
  // ── 两台落地扇（编辑部、总编室）、两盏落地灯（等候区、总编室的角上）──
  { id: 'in-paper-fan', x: 5.2, z: 3.3, rot: 0.35, size: [0.5, 1.45, 0.5] },
  { id: 'in-paper-fan', x: 18.9, z: 6.6, rot: -0.6, size: [0.5, 1.45, 0.5] },
  { id: 'in-paper-floor-lamp', x: 2.6, z: 17.3, size: [0.5, 1.6, 0.5] },
  { id: 'in-paper-floor-lamp', x: 12.4, z: 2.5, size: [0.5, 1.6, 0.5] },
];

/**
 * 互动锚点（局部坐标；下一关接玩法）：at = 人站 / 坐的地方，face = 朝向（弧度，0 = 朝南 / 朝镜头，π = 朝北），
 * who = 谁在这儿（npc）或者总监站哪儿（director）
 */
export const SPOTS = {
  /** 门里（进门站的地方）；出门在门外地垫上 */
  door: { at: [W / 2, D - 1.2], face: Math.PI, who: 'director' },
  /** 前台：接待员坐在台后（北边），脸朝南 */
  receptionist: { at: [8.6, 12.6], face: 0, who: 'npc' },
  /** 前台：总监在台前问路（不用办事也能聊一句） */
  frontDesk: { at: [9.4, 14.7], face: Math.PI, who: 'director' },
  /** 总编：坐在办公桌后（北边）的高背椅上，脸朝南 —— P1、P2 点他 */
  editor: { at: [15.8, 3.6], face: 0, who: 'npc' },
  /** P1 / P2：总监站在总编桌前（南边），朝北 */
  editorDesk: { at: [15.8, 6.2], face: Math.PI, who: 'director' },
  /** P1：桌上的样张（总编当场用红笔圈广告的位置），离地 0.8 */
  adProof: { at: [15.3, 4.75], face: 0, who: 'prop' },
  /** P2：采访时总监坐的访客椅（西边那把，朝北） */
  interviewSeat: { at: [14.4, 6.5], face: Math.PI, who: 'director' },
  /** P2：记者被叫进来以后站的地方（东边那把椅子旁，拿着本子，朝西北看总监） */
  reporter: { at: [17.6, 6.9], face: Math.PI * 0.75, who: 'npc' },
  /** P2：记者平时坐的桌子（总编叫他，他从这儿起身走进总编室） */
  reporterDesk: { at: [7.45, 9.95], face: Math.PI, who: 'npc' },
  /** 总编室的门（玻璃隔断的门洞中间） */
  officeDoor: { at: [15.8, 7.8], face: Math.PI, who: 'director' },
  /** P3：西墙展墙上 1960 年那期（框的中心，离地 1.7）；总监站在它前面（南边）朝北看 */
  oldPaper1960: { at: [1.25, 12.45], face: 0, who: 'prop' },
  oldPaperView: { at: [1.4, 13.7], face: Math.PI, who: 'director' },
} as const;

/** 店里的三个人：坐的位置（局部）、朝向（0 = 朝南）、座面高、长相 */
const NPCS: { at: [number, number]; face: number; seat: number; look: CastLook }[] = [
  {
    // 总编：发福、灰白短发、眼镜、小胡子；白衬衫长袖、炭灰裤子
    at: [15.8, 3.72],
    face: 0,
    seat: 0.52,
    look: {
      body: 'adult',
      height: 1.04,
      stout: 1.2,
      skin: 'light',
      hair: 'gray',
      hairStyle: 'short',
      shirt: 'white',
      longSleeves: true,
      bottom: 'charcoal',
      bottomKind: 'pants',
      shoes: 'black',
      eyes: 'glasses',
      facial: 'mustache',
    },
  },
  {
    // 接待员：棕色发髻、珊瑚色上衣
    at: [8.6, 12.6],
    face: 0,
    seat: 0.52,
    look: {
      body: 'adult',
      height: 0.96,
      skin: 'tan',
      hair: 'brown',
      hairStyle: 'bun',
      shirt: 'coral',
      bottom: 'navy',
      bottomKind: 'skirt',
      shoes: 'brown',
    },
  },
  {
    // 记者（P2 来采访的那个）：坐在自己桌前、背对镜头，天蓝衬衫、卡其裤
    at: [7.45, 9.9],
    face: Math.PI,
    seat: 0.52,
    look: {
      body: 'adult',
      skin: 'brown',
      hair: 'black',
      hairStyle: 'curly',
      shirt: 'sky',
      longSleeves: true,
      bottom: 'khaki',
      bottomKind: 'pants',
      shoes: 'brown',
    },
  },
];

export const INTERIOR_PAPER: InteriorDef = {
  id: 'paper',
  name: '《沙漠太阳报》编辑部',
  w: W,
  d: D,
  floor: 'tile',
  // 框架的墙（墙顶一圈、南矮墙）：深青灰的 slate，不用外景的白灰泥
  wall: 'slate',
  poi: 'p_paper',
  build(c) {
    const objs: THREE.Object3D[] = [];
    // 同一套材质参数只建一份（资产之间共用）→ 整间屋按材质合并成几十个网格（不然四十几件 × 每件五六个材质 ≈ 700 次绘制）
    const actx = sharedMats(c.actx);
    for (const p of PLACES) {
      const f = ASSETS[p.id];
      if (!f) throw new Error(`interiors/paper：没有资产 ${p.id}`);
      const rot = p.rot ?? 0;
      const obj = f({ ...actx, variant: p.v ?? 0 });
      obj.position.set(p.x, p.y ?? 0, p.z);
      obj.rotation.y = rot;
      objs.push(obj);
      if (p.block !== false) {
        const [sw, , sd] = p.size;
        const swap = Math.abs(Math.sin(rot)) > 0.7;
        const hw = (swap ? sd : sw) / 2;
        const hd = (swap ? sw : sd) / 2;
        c.block({ x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd });
      }
    }
    // 屋外：一大块和"店里的背景色"（main.ts 的 INSIDE_BG #231c2e）一样的暗地，压在地板底下 —— 从门进来时背景本来就是这个色，
    // 直接传送进来（at= / 验收脚本）时也一样，不露出山谷的天和远处的地平线
    {
      const v = new THREE.Group();
      const dark = actx.mat('ironwork', {
        ramp: [0x000000, 0x000000, 0x000000],
        emissive: VOID,
        edge: 0,
        convex: 0,
        noShadowReceive: true,
      });
      v.add(
        new THREE.Mesh(new THREE.PlaneGeometry(110, 110).rotateX(-Math.PI / 2).translate(W / 2, -0.06, D / 2), dark),
      );
      v.userData.noCast = true;
      v.children[0].userData.noCast = true;
      objs.push(v);
    }
    mergeRoom(c, objs);
    // 三个人（设计稿"人 3"）：总编坐在高背皮椅上、接待员坐在前台后面、一个记者坐在自己桌前（背对镜头）。
    // 静的（定格的坐姿；会走、会说话是下一关）。骨骼人不合并，单独放。
    const dresser = createDresser({ mats: c.actx.mats as Parameters<typeof createDresser>[0]['mats'], scheme: null });
    for (const n of NPCS) {
      const o = player({ ...c.actx, variant: 0 } as unknown as BaseCtx);
      dresser.dress(o, n.look);
      const ud = o.userData;
      ud.setProp?.(null);
      ud.setSeat?.(n.seat);
      ud.pose?.('sit', 0.25);
      o.position.set(n.at[0], 0, n.at[1]);
      o.rotation.y = n.face;
      c.asset(o);
    }
    // 总编室的玻璃隔断：南边两段（门洞 x 15.2…16.4 留着）、西边一整段。挡路故意厚一点（0.5 米）：
    // 导航格 0.2 米，0.2 米厚的薄墙可能一个格心都没压上，规划会从墙角斜着穿过去（人再被碰撞挡住、卡在墙角）
    c.block({ x0: 11.35, x1: 15.2, z0: 7.55, z1: 8.05 });
    c.block({ x0: 16.4, x1: W, z0: 7.55, z1: 8.05 });
    c.block({ x0: 11.35, x1: 11.85, z0: 0, z1: 8.05 });
  },
};

/** 资产上下文的材质按（键, 参数）缓存：同样的材质只建一份 */
function sharedMats(base: AssetCtx): AssetCtx {
  const cache = new Map<string, ReturnType<AssetCtx['mat']>>();
  return {
    ...base,
    mat(key: PalKey, extra?: ToonOpts) {
      const k = `${key}|${JSON.stringify(extra ?? null)}`;
      let m = cache.get(k);
      if (!m) {
        m = base.mat(key, extra);
        cache.set(k, m);
      }
      return m;
    },
  };
}

/**
 * 整间屋的资产按（材质, 投不投影）合并（局部坐标），一个组交给 c.asset；
 * 灯：资产的 userData.inNight（[白天, 夜里] 材质对 + 本地的灯光圈）→ 合并后的网格天黑一起换，每盏灯一个灯光圈（世界坐标）
 */
function mergeRoom(c: InteriorCtx, objs: THREE.Object3D[]) {
  const by = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const swap = new Map<THREE.Material, THREE.Material>();
  const pools: [number, number, number, number][] = [];
  const v = new THREE.Vector3();
  let matId = 0;
  const ids = new Map<THREE.Material, number>();
  for (const obj of objs) {
    obj.updateMatrixWorld(true);
    const night = obj.userData.inNight as InNight | undefined;
    if (night) {
      for (const [day, nightM] of night.pairs) swap.set(day, nightM);
      if (night.pool) {
        const [px, pz, r, h] = night.pool;
        v.set(px, 0, pz).applyMatrix4(obj.matrixWorld);
        pools.push([v.x, v.z, r, h + obj.position.y]);
      }
    }
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.Material;
      // 画廊的 nightLights 可能已经换过（不会：场景里还没天黑）；按白天那份归
      const cast = !m.userData.noCast && m.castShadow !== false;
      if (!ids.has(mat)) ids.set(mat, matId++);
      const k = `${ids.get(mat)}|${cast}`;
      const e = by.get(k) ?? { mat, cast, geos: [] };
      e.geos.push(m.geometry.clone().applyMatrix4(m.matrixWorld));
      by.set(k, e);
    });
  }
  const room = new THREE.Group();
  room.name = 'valley:interior:paper';
  const lampMeshes: THREE.Mesh[] = [];
  for (const { mat, cast, geos } of by.values()) {
    const g = mergeGeometries(geos);
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mat);
    if (!cast) mesh.userData.noCast = true;
    if (swap.has(mat)) lampMeshes.push(mesh);
    room.add(mesh);
  }
  let lit = false;
  room.userData.night = {
    setOn(on: boolean) {
      lit = on;
      for (const m of lampMeshes) {
        const day = (m.userData.lampDay ??= m.material) as THREE.Material;
        m.material = on ? (swap.get(day) ?? day) : day;
      }
    },
  };
  for (const [x, z, r, h] of pools) {
    const o = new THREE.Object3D();
    const [wx, wz] = c.at(x, z);
    o.userData.night = { pool: (): [number, number, number, number] => (lit ? [wx, wz, r, h] : [wx, wz, 0, 0]) };
    room.add(o);
  }
  c.asset(room);
}
