// 店内场景（进门换场景，用户 2026-11-16）：三家办事的店各一间封闭的室内，摆在山谷地图外面很远的地方（世界 x ≥ 3000），
// 尺寸按玩法放大，不跟外观对齐（很多游戏都这么做）。进门：门口点"进去" → 画面暗一下 → 总监到室内南门；"出去"同理。
// 设计稿：https://claude.ai/artifact/RqDAYjwUum7gF5AKsBo6Gw（S1～S5 体育店、H1～H6 五金、P1～P3 报社）。
//
// 各店的 build 用**局部坐标**：x 0…w（西 → 东）、z 0…d（北 → 南）、y 朝上；南墙正中是门（门洞 DOOR_W 米）。
// 框架（frame）画地板、墙、门槛、门外的地垫；各店画里面的东西。镜头照旧俯视 45°、朝北：
// 北墙整面看得见（主墙面，放最重要的东西）；南墙矮（SOUTH_H，不挡视线）；东西两墙侧着看。
import type * as THREE from 'three';
import type { Shape } from '../../clubsite/play';
import { box } from '../../clubsite/render/geo';
import type { Detail, DetailCtx, InstItem } from '../build';
import type { PalKey } from '../reuse';

export type InteriorId = 'paper' | 'sports' | 'hardware' | 'cityhall' | 'bank' | 'diner';

export interface InteriorDef {
  id: InteriorId;
  /** 地名（进门后显示） */
  name: string;
  /** 室内大小（米）：x 方向 w、z 方向 d */
  w: number;
  d: number;
  /** 地板、墙的材质（valley 调色板的键） */
  floor: PalKey;
  wall: PalKey;
  /** 外面门口的 POI（layout.ts 的 POIS）：门口的"进去"就立在那面旗子那儿 */
  poi: string;
  /** 店里镜头的远近：米/纹素 = 进山谷时的默认 × zoom（越小越近；v1 0.8，v2 ≈ 0.5） */
  zoom?: number;
  /**
   * 店里能说话的人 / 能办事的地方（局部坐标；2026-11-18 第二批加）：总监走到 r 米以内，HUD 出 label 的按钮，点了在总监头顶说 line。
   * 餐馆"找人"就是这个：走到某张桌子前和人聊。以后接上模拟再换成真的卡 / 事件。
   */
  talk?: { x: number; z: number; r?: number; label: string; line: string }[];
  /** 画里面的东西（局部坐标） */
  build(c: InteriorCtx): void;
}

/** 室内在世界里的西北角（局部原点）：彼此隔开、离山谷很远 */
export const ORIGIN: Record<InteriorId, readonly [number, number]> = {
  paper: [3000, 0],
  sports: [3200, 0],
  hardware: [3400, 0],
  // 第二批（2026-11-18，只有第二版：interiors/v2/cityhall.ts、bank.ts、diner.ts）
  cityhall: [3600, 0],
  bank: [3800, 0],
  diner: [4000, 0],
};
/** 墙高、南墙高、墙厚、门洞宽 */
export const WALL_H = 4.5;
export const SOUTH_H = 0.9;
export const WALL_T = 0.4;
export const DOOR_W = 3;

/** 局部坐标的 DetailCtx：几何、资产、挡路都按局部坐标给，这里平移到世界 */
export interface InteriorCtx {
  def: InteriorDef;
  /** 局部 → 世界 */
  at(x: number, z: number): [number, number];
  /** 合并的几何（局部坐标，y 照旧） */
  put(key: PalKey, g: THREE.BufferGeometry): void;
  /** 很多件同一个形状（items 的 x / z 是局部坐标） */
  instance(g: THREE.BufferGeometry, key: PalKey, items: Omit<InstItem, 'reg'>[], cast?: boolean): void;
  /** 资产（摆在局部坐标的 Object3D；这里挪到世界） */
  asset(obj: THREE.Object3D): void;
  /** 挡路（局部坐标的形状） */
  block(s: Shape): void;
  rng(stream: string): () => number;
  mat(key: PalKey): THREE.Material;
  /** 资产的上下文（src/valley/assets 的 ASSETS[id](actx)） */
  actx: DetailCtx['actx'];
  /** 世界的根（要单独一个会动的网格时用；记得自己加 ORIGIN 的偏移） */
  root: THREE.Group;
}

const REG = 'none'; // 室内不归任何区域（不压暗）

function shapeAt(s: Shape, ox: number, oz: number): Shape {
  if ('poly' in s) return { poly: s.poly.map(([x, z]) => [x + ox, z + oz] as const) };
  if ('a' in s) return { a: [s.a[0] + ox, s.a[1] + oz], b: [s.b[0] + ox, s.b[1] + oz], r: s.r };
  if ('x0' in s) return { x0: s.x0 + ox, x1: s.x1 + ox, z0: s.z0 + oz, z1: s.z1 + oz };
  return { x: s.x + ox, z: s.z + oz, r: s.r };
}

/** 地板、四面墙（南墙矮、正中留门）、门外地垫 */
function frame(c: InteriorCtx) {
  const { w, d } = c.def;
  c.put(c.def.floor, box(w, 0.04, d, w / 2, -0.02, d / 2));
  // 北墙（整面看得见）、东西两墙
  c.put(c.def.wall, box(w + WALL_T * 2, WALL_H, WALL_T, w / 2, 0, -WALL_T / 2));
  c.put(c.def.wall, box(WALL_T, WALL_H, d, -WALL_T / 2, 0, d / 2));
  c.put(c.def.wall, box(WALL_T, WALL_H, d, w + WALL_T / 2, 0, d / 2));
  // 南墙：矮，正中留门
  const seg = (w - DOOR_W) / 2;
  c.put(c.def.wall, box(seg + WALL_T, SOUTH_H, WALL_T, (seg - WALL_T) / 2, 0, d + WALL_T / 2));
  c.put(c.def.wall, box(seg + WALL_T, SOUTH_H, WALL_T, w - (seg - WALL_T) / 2, 0, d + WALL_T / 2));
  // 门外一块地垫（出门的地方）
  c.put('flagstone', box(DOOR_W + 1, 0.04, 2.4, w / 2, -0.02, d + 1.2 + WALL_T));
  // 挡路：南墙两段（门洞留着）；别的墙靠能站的范围（rects）挡
  c.block({ x0: -WALL_T, x1: seg, z0: d, z1: d + WALL_T });
  c.block({ x0: w - seg, x1: w + WALL_T, z0: d, z1: d + WALL_T });
}

/** 一家店 → 一个细节模块（build.ts 合并前调） */
export function interiorDetail(def: InteriorDef): Detail {
  return (d) => {
    const [ox, oz] = ORIGIN[def.id];
    const c: InteriorCtx = {
      def,
      at: (x, z) => [x + ox, z + oz],
      put: (key, g) => d.put(REG, key, g.translate(ox, 0, oz)),
      instance: (g, key, items, cast) =>
        d.instance(
          g,
          key,
          items.map((it) => ({ ...it, x: it.x + ox, z: it.z + oz, reg: REG })),
          cast,
        ),
      asset: (obj) => {
        obj.position.x += ox;
        obj.position.z += oz;
        d.asset(obj, REG);
      },
      block: (s) => d.block(shapeAt(s, ox, oz)),
      rng: (s) => d.rng(`interior:${def.id}:${s}`),
      mat: d.mat,
      actx: d.actx,
      root: d.root,
    };
    frame(c);
    def.build(c);
  };
}

/** 室内能站的地方（世界坐标；山谷的导航用）：地板收 0.35 米，再加门外地垫 */
export function interiorWalk(def: InteriorDef): { x0: number; x1: number; z0: number; z1: number }[] {
  const [ox, oz] = ORIGIN[def.id];
  const { w, d } = def;
  return [
    { x0: ox + 0.35, x1: ox + w - 0.35, z0: oz + 0.35, z1: oz + d + WALL_T },
    { x0: ox + w / 2 - DOOR_W / 2 - 0.5, x1: ox + w / 2 + DOOR_W / 2 + 0.5, z0: oz + d, z1: oz + d + 2.4 + WALL_T },
  ];
}
/** 进门后站的地方（世界坐标，门里 2 米）、出门的地方（门外地垫上） */
export const entryAt = (def: InteriorDef): [number, number] => {
  const [ox, oz] = ORIGIN[def.id];
  return [ox + def.w / 2, oz + def.d - 2];
};
export const exitAt = (def: InteriorDef): [number, number] => {
  const [ox, oz] = ORIGIN[def.id];
  return [ox + def.w / 2, oz + def.d + 1.4];
};
