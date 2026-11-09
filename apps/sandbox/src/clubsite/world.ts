// 整座俱乐部的世界坐标：所有 club* 场景（clubmap2 的微缩地图和各处小景）共用这一份（原来在 clubmap2/layout.ts）。
// 照主游戏 2.5D 地图（Palm Oasis，已归档：docs/archive/iso-2.5d/packages/iso/src/site/indian-wells/layout.ts）的布局，
// 坐标、尺寸照抄游戏（米；y 朝上；北 = −z；东 = +x），再加上游戏里没有的露天前台（东墙大门里面）。
// 只从 layout.ts 复制常量，不 import（那边已归档，不参与构建，ADR 0027）。
//
// 不是浮空岛（2026-11-08）：地面一直铺到画外，地图四周是棕榈泉那样的光秃岩山（clubsite/mountains.ts），车道往东翻过山口出地图。
// 第二轮（同日）：最高的山挪到西北（默认视角的远边，俱乐部背后一层层山梁 + 一条天），东边敞开（科切拉谷），车道进两座山中间的山口。
//
//            北（-z）：一排棕榈、围墙外的沙漠、背后的高山（西北最高）
//   ┌──────────────────────────────────────────────┐
//   │ 会所 + 露台   中心球场（看台）       棕榈喷泉广场 │
//   │ 泳池          青训 ×2                匹克球   前台│大门 → 车道 → 两片停车场（东）→ 山口 → 鞍部 → 画外
//   │               会员场    红土 ×2      球员草坪     │
//   └──────────────────────────────────────────────┘
//            南（+z）：高尔夫球场（水塘、果岭、沙坑）、再往南是矮一点的山，东南敞开（谷地）
export type V2 = [number, number];

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** 整块地图（含围墙外的停车场、高尔夫和沙漠） */
export const SITE = { x0: -72, x1: 96, z0: -48, z1: 74 } as const;
/** 俱乐部围墙以内 */
export const GROUNDS = { x0: -64, x1: 60, z0: -43, z1: 52 } as const;
/** 东墙上的大门（门洞 z0..z1） */
export const GATE = { x: 60, z0: -5, z1: 5 } as const;

/** 场地坐标系：中心、半长（沿 x，底线到底线）、半宽（沿 z）。游戏里的场地都是东西向 */
export interface Court {
  id: string;
  x: number;
  z: number;
  hx: number;
  hz: number;
  kind: 'hard' | 'clay' | 'stadium' | 'pickle';
}
export const COURTS: Court[] = [
  { id: 'stadium_1', x: 0, z: -21, hx: 18, hz: 9, kind: 'stadium' },
  { id: 'practice_w', x: -17, z: 6, hx: 16.5, hz: 8.3, kind: 'hard' },
  { id: 'practice_e', x: 17, z: 6, hx: 16.5, hz: 8.3, kind: 'hard' },
  { id: 'outer_1', x: -17, z: 25, hx: 16.5, hz: 8.3, kind: 'hard' },
  { id: 'outer_2', x: 17, z: 25, hx: 16.5, hz: 8.3, kind: 'clay' },
  { id: 'outer_3', x: 17, z: 42.6, hx: 16.5, hz: 8.3, kind: 'clay' },
  { id: 'pickle_1', x: 44, z: 1.6, hx: 8, hz: 3.9, kind: 'pickle' },
  { id: 'pickle_2', x: 44, z: 10.4, hx: 8, hz: 3.9, kind: 'pickle' },
];
/** 匹克球的围场 */
export const PICKLE = { x0: 36, x1: 52, z0: -3, z1: 15 } as const;

/** 会所（西班牙复兴式，红瓦）和东边的露台餐厅 */
export const CLUBHOUSE = { x0: -62, x1: -40, z0: -40, z1: -10 } as const;
export const TERRACE = { x0: -37, x1: -26, z0: -36, z1: -11 } as const;
/** 泳池：池子和一圈池畔 */
export const POOL = { x0: -57, x1: -43, z0: 3, z1: 13 } as const;
export const POOL_DECK = { x0: -61, x1: -39, z0: -1, z1: 18 } as const;
/** 棕榈喷泉 */
export const FOUNTAIN = { x: 44, z: -24, r: 9, water: 4, palms: 7.5 } as const;
export const PLAZA = { x0: 32, x1: 56, z0: -36, z1: -12 } as const;
/** 球员草坪和两棵大树 */
export const LAWN = { x0: 37, x1: 56, z0: 17, z1: 34 } as const;
/**
 * 大门外：车道（平的直段）和南北两片停车场。直段铺到 x1（clubpark 的车在 x 114 出现、消失，横屏右边缘 x ≈ 108），
 * 再往东是山口那段（ROAD_OUT，clubsite/mountains.ts 的 passRoadGeo：跟着两道垭口的地面起伏，一直铺到地面尽头）。
 */
export const DRIVE = { x0: 60, x1: 118, z0: -4, z1: 4 } as const;
export const LOT_N = { x0: 64, x1: 88, z0: -26, z1: -6 } as const;
export const LOT_S = { x0: 64, x1: 88, z0: 6, z1: 26 } as const;
/** 南墙外的高尔夫 */
export const GOLF = { x0: -64, x1: 92, z0: 53, z1: 74 } as const;
export const GOLF_POND = { x: -30, z: 66, rx: 7.5, rz: 4.5 } as const;

/**
 * 步道（碎花岗岩）：中心球场南边的长廊、两排球场之间、西边和东边各一条、青训中间一条、会员场南边一条小路。
 * 2026-11-08（用户同意）：东边那条南北步道改成 x 33.6…36（原来 34…37 压进匹克球围场 x 36 一米），一直往南接到南墙（z 51），
 * 近的红土场（outer_3）东门才有路；会员场南边加一条 1.4 米的小路（clubcourts 的提议：西接西步道，东到红土场西围网 x 0 前）。
 */
export const PATHS: Rect[] = [
  { x0: -0.5, x1: 0.5, z0: -4.4, z1: 14.4 },
  { x0: -38, x1: 60, z0: -8.6, z1: -4.4 },
  { x0: -38, x1: 36, z0: 14.4, z1: 16.6 },
  { x0: -38.5, x1: -34.5, z0: -8.6, z1: 51 },
  { x0: 33.6, x1: 36, z0: -36, z1: 51 },
  { x0: -34.5, x1: -0.3, z0: 33.6, z1: 35.0 },
];

// ── 围网（网球场的挡风布、匹克球围场）：地图和各个场景共用一份 ─────────────────
/** 一道直的围网：沿 x（z0 = z1）或沿 z（x0 = x1）；doors = 门中心（沿这道网的坐标：沿 x 的是 x，沿 z 的是 z）+ 门宽 */
export interface FenceLine {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  h: number;
  doors: { at: number; gap: number }[];
}
type Side = 'n' | 's' | 'e' | 'w';
/** 网球场围网的高 */
export const COURT_FENCE_H = 2.6;
/** 门：各片场在哪一边、哪里开门（沿那一边的世界坐标）。不在表里的 = 北边西头一个（x0 + 3，照游戏地图） */
const COURT_DOORS: Record<string, { side: Side; at: number; gap: number }[]> = {
  // 红土远场：北边西头（照地图）+ 东边（z 19.6，对着东步道和工具架）
  outer_2: [
    { side: 'n', at: 3.5, gap: 2.4 },
    { side: 'e', at: 19.6, gap: 2.4 },
  ],
  // 红土近场：北边和远场共用（不开门），东边 z 35.2（场边那一条的东头）
  outer_3: [{ side: 'e', at: 35.2, gap: 2.4 }],
};
/** 南边不拉围网的场：近的红土场（南墙离场边 1.1 米，墙就是界）、会员场（南边是小路，和红土场一致） */
const OPEN_SOUTH = new Set(['outer_1', 'outer_3']);
/** 两片场的边隔得比这个近、中间又没有步道 → 只拉一道（两边的中线） */
const SHARE_GAP = 1.2;

/**
 * 网球场（硬地、红土；中心球场没有围网）的围网，挨着的场共用一道：
 * 1. 每片场的四条边先找邻居：对面 SHARE_GAP 以内有另一片场（沿边的范围重叠或只差 SHARE_GAP，斜对角也算），
 *    中间又没有一条步道顺着缝走 → 这条边挪到两边的中线（红土两片之间 z 33.8、红土和会员场之间 x 0）；
 * 2. 每条边的两头 = 这片场相邻两条边（挪过以后）的位置（敞开不拉的那条边不挪）；
 * 3. 同一条线上的边合并成一道（首尾接上的连起来），门挂到合并后的那道上；OPEN_SOUTH 的南边不拉。
 */
function buildCourtFences(): FenceLine[] {
  const cells = COURTS.filter((c) => c.kind === 'hard' || c.kind === 'clay').map((c) => ({
    id: c.id,
    x0: c.x - c.hx,
    x1: c.x + c.hx,
    z0: c.z - c.hz,
    z1: c.z + c.hz,
  }));
  type Cell = (typeof cells)[number];
  const near = (a0: number, a1: number, b0: number, b1: number) => Math.max(a0, b0) - Math.min(a1, b1) <= SHARE_GAP;
  /** 缝里有没有一条步道顺着走（步道横穿缝的整个宽度、沿缝走了 1 米以上） */
  const pathIn = (gx0: number, gx1: number, gz0: number, gz1: number, alongX: boolean) =>
    PATHS.some((p) =>
      alongX
        ? p.z0 <= gz0 + 0.01 && p.z1 >= gz1 - 0.01 && Math.min(p.x1, gx1) - Math.max(p.x0, gx0) > 1
        : p.x0 <= gx0 + 0.01 && p.x1 >= gx1 - 0.01 && Math.min(p.z1, gz1) - Math.max(p.z0, gz0) > 1,
    );
  /** 一条边挪过以后的位置 */
  const sidePos = (c: Cell, side: Side): number => {
    const edge = { n: c.z0, s: c.z1, w: c.x0, e: c.x1 }[side];
    for (const o of cells) {
      if (o === c) continue;
      if (side === 'n' || side === 's') {
        const other = side === 'n' ? o.z1 : o.z0;
        const gap = side === 'n' ? edge - other : other - edge;
        if (gap <= 0 || gap > SHARE_GAP || !near(c.x0, c.x1, o.x0, o.x1)) continue;
        const [g0, g1] = side === 'n' ? [other, edge] : [edge, other];
        if (pathIn(Math.max(c.x0, o.x0), Math.min(c.x1, o.x1), g0, g1, true)) continue;
        return (edge + other) / 2;
      }
      const other = side === 'w' ? o.x1 : o.x0;
      const gap = side === 'w' ? edge - other : other - edge;
      if (gap <= 0 || gap > SHARE_GAP || !near(c.z0, c.z1, o.z0, o.z1)) continue;
      const [g0, g1] = side === 'w' ? [other, edge] : [edge, other];
      if (pathIn(g0, g1, Math.max(c.z0, o.z0), Math.min(c.z1, o.z1), false)) continue;
      return (edge + other) / 2;
    }
    return edge;
  };
  // 每条边：方向（沿 x / 沿 z）、线的位置、两头、门
  const segs: { alongX: boolean; pos: number; a0: number; a1: number; doors: { at: number; gap: number }[] }[] = [];
  for (const c of cells) {
    // 不拉的那条边（南边敞开）不挪：两边的网到场地自己的边就停
    const open = (side: Side) => side === 's' && OPEN_SOUTH.has(c.id);
    const posOf = (side: Side) => (open(side) ? { n: c.z0, s: c.z1, w: c.x0, e: c.x1 }[side] : sidePos(c, side));
    const p = { n: posOf('n'), s: posOf('s'), w: posOf('w'), e: posOf('e') };
    const doors = COURT_DOORS[c.id] ?? [{ side: 'n' as Side, at: c.x0 + 3, gap: 2.4 }];
    for (const side of ['n', 's', 'w', 'e'] as Side[]) {
      if (open(side)) continue;
      const alongX = side === 'n' || side === 's';
      segs.push({
        alongX,
        pos: p[side],
        a0: alongX ? p.w : p.n,
        a1: alongX ? p.e : p.s,
        doors: doors.filter((d) => d.side === side).map(({ at, gap }) => ({ at, gap })),
      });
    }
  }
  // 同一条线上首尾接上（或重叠）的合并
  const out: FenceLine[] = [];
  const used = new Set<number>();
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i)) continue;
    const m = { ...segs[i], doors: [...segs[i].doors] };
    used.add(i);
    for (let grew = true; grew; ) {
      grew = false;
      for (let j = 0; j < segs.length; j++) {
        const s = segs[j];
        if (used.has(j) || s.alongX !== m.alongX || Math.abs(s.pos - m.pos) > 0.01) continue;
        if (s.a0 > m.a1 + 0.05 || s.a1 < m.a0 - 0.05) continue;
        m.a0 = Math.min(m.a0, s.a0);
        m.a1 = Math.max(m.a1, s.a1);
        m.doors.push(...s.doors);
        used.add(j);
        grew = true;
      }
    }
    out.push(
      m.alongX
        ? { x0: m.a0, z0: m.pos, x1: m.a1, z1: m.pos, h: COURT_FENCE_H, doors: m.doors }
        : { x0: m.pos, z0: m.a0, x1: m.pos, z1: m.a1, h: COURT_FENCE_H, doors: m.doors },
    );
  }
  return out;
}
/** 网球场的围网（合并以后的直线段） */
export const COURT_FENCES: FenceLine[] = buildCourtFences();

/** 匹克球围场的高、门：西门（z 4.5…7.5，对着南北步道）+ 东围网北头的员工小门（z −2.0…−0.8，总监从到达小院进来） */
export const PICKLE_FENCE_H = 2.2;
export const PICKLE_DOORS: { side: Side; at: number; gap: number }[] = [
  { side: 'w', at: 6, gap: 3 },
  { side: 'e', at: -1.4, gap: 1.2 },
];

/** 一道围网按门切成几段（沿这道网的坐标 [起, 止]） */
export function fencePieces(a0: number, a1: number, doors: { at: number; gap: number }[]): [number, number][] {
  const cuts = [...doors].sort((a, b) => a.at - b.at);
  const out: [number, number][] = [];
  let p = a0;
  for (const d of cuts) {
    const q = d.at - d.gap / 2;
    if (q > p) out.push([p, q]);
    p = Math.max(p, d.at + d.gap / 2);
  }
  if (a1 > p) out.push([p, a1]);
  return out.filter(([x, y]) => y - x >= 0.2);
}

/**
 * 新加：露天前台（游戏里前台在会所里面，ch_desk）。放在东墙大门里面、门洞南边：
 * 柜台朝东（朝大门、也朝镜头），进门的人在门和柜台之间排队签到、拿毛巾和水，再沿长廊往西去球场。
 * 凉棚东西 4 米（w，沿 x）、南北 7 米（d，沿 z）。
 */
export const DESK = { x: 54.4, z: 5.8, w: 4, d: 7, h: 3.4 } as const;
/** 大门里面的到达小院（陶砖）：大门、前台、长廊东头连在一起 */
export const FORECOURT: Rect = { x0: 52.2, x1: 60, z0: -8.6, z1: 10.6 };

/**
 * 地图的边：这一圈里面是平的沙漠（俱乐部、停车场、高尔夫、撒的植物都在里面），山从这圈往外起（clubsite/mountains.ts）。
 * 西、北两边只比 SITE 大 8～10 米（默认视角的远边：山离俱乐部近，才能在画面顶上放下一层层山梁和一条天），
 * 东、南两边大 5～16 米。山脚都在这圈外面，转到哪个方向近处的山都不挡地图（山高 ≤ 离边的距离）。
 */
export const DESERT = { x0: -80, x1: 101, z0: -58, z1: 90 } as const;
/**
 * 车道出地图：东边山梁正对车道 z ± half 的一段是垭口 —— 第二道山梁（mid）在这里断开成两座山中间的山口，
 * 最外一道（far）压成一个低鞍部；车道从 DRIVE.x1 接着往东，翻过两道垭口，一直铺到 x1（地面尽头，画外）。
 * half 要 ≥ 车道半宽 4 + 最粗的截面间距，车道底下的山面才是平整的鞍部。
 */
export const ROAD_OUT = { z: 0, half: 24, x1: 380 } as const;
/**
 * 自动取景框住的范围（围墙、停车场、高尔夫；地图边的沙漠和山可以出画）。
 * 东南角收到高尔夫的角上（默认视角里它是画面最下沿），上面留给远边的山和天（clubsite/framing.ts）。
 */
export const FIT = { x0: -70, x1: 94, z0: -52, z1: 76 } as const;
