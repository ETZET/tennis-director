// 出口靠布局讲（第四轮「让布局说话」，2026-11-28）：每个通到别的图的出口，路上立一道门（assets/exit-gate.ts：两根灰泥门柱 + 木横梁 + 小灯笼），
// 门外露出下一张图的一角（"预告"：球场的灯杆、公交站牌、果岭的小旗、广场的铁灯柱、泳池的遮阳伞……），不写目的地的字。
// 原来出口靠一块"← 到达 · 前台"的纸牌子；现在牌子没了（clubsite/hud/waysign.ts 只剩走近时一个小箭头）。
// 地图数据归 world（map-*.ts）；门和预告放这里按出口算，build.ts 的摆件循环拼在 def.props 后面（同 night-props.ts）。
//
// 默认摆法：门在出口里面 (出口半径 + 1 米) 处，朝向 = 出口 → 最近的入口（那就是路进来的方向）；预告摆在门外两侧。
// 东西向的出口（路横着出画面）镜头从侧面看门只是一根竖线：换成一段木架廊（assets/exit-arbor.ts，两对柱子 + 长梁 + 椽子）。
// 每个出口可以覆盖（TUNE：键 '<图>><去哪>'）：挪门、换成只有两根柱子（台阶口）、不要门（会所的门、更衣棚的门本身就是门）、换预告。
import type { MapDef, Prop } from './mapdef';

type V2 = [number, number];

/** 预告：门的本地坐标（x = 横过路，正 = 出门时的右手边；z = 往门外走多远），资产 id，朝向（相对门） */
interface Tease {
  a: string;
  x: number;
  z: number;
  r?: number;
  s?: number;
}

interface Tune {
  /** 门离出口中心多远（米，往图里）；默认 出口半径 + 1 */
  d?: number;
  /** 门再挪一下（本图坐标，米） */
  dx?: number;
  dz?: number;
  /** 门的朝向（弧度，覆盖算出来的）：本地 +z 朝图外 */
  r?: number;
  /** gate = 门；arbor = 一段木架廊（东西向的出口默认）；posts = 只有两根柱子（台阶口）；none = 不要（建筑的门自己就是门） */
  kind?: 'gate' | 'arbor' | 'posts' | 'none';
  /** 预告（不给 = 按去哪张图挑 TEASE） */
  tease?: Tease[];
}

/** 下一张图的"一角"：按去哪张图挑（门外两侧，离路 ≥ 2.2 米，不挡路） */
const TEASE: Record<string, Tease[]> = {
  // 中心球场：球场的一角（蓝地、白线、绿挡风网）
  court: [{ a: 'tease-court', x: 5, z: 3.6 }],
  // 到达：公交站牌
  arrive: [{ a: 'stop-pole', x: 2.5, z: 1.2 }],
  // 喷泉广场：铁灯柱
  plaza: [{ a: 'plaza-lamp', x: -2.5, z: 1.2 }],
  // 球场街、青训场：同上
  street: [{ a: 'tease-court', x: 5, z: 3.6 }],
  academy: [{ a: 'tease-court', x: 5, z: 3.6 }],
  // 果岭：插在洞里的小旗
  golf: [{ a: 'golf-pin', x: 2.4, z: 1.2 }],
  // 练习场：同上（练习场也是球场）
  practice: [{ a: 'tease-court', x: 5, z: 3.6 }],
  // 歇脚（泳池）：遮阳伞
  oasis: [{ a: 'parasol', x: 2.5, z: 1.4 }],
};

const TUNE: Record<string, Tune> = {
  // 建筑的门：门本身就是出口（会所的拱门、更衣棚的门、大堂的两道门）
  'plaza>lobby': { kind: 'none' },
  'oasis>lobby': { kind: 'none' },
  'lobby>plaza': { kind: 'none' },
  'lobby>oasis': { kind: 'none' },
};

/** 出口 → 门、预告的摆件（本图坐标） */
export function exitProps(def: MapDef): Prop[] {
  const out: Prop[] = [];
  const ents = Object.values(def.entries);
  for (const ex of def.exits) {
    const tune = TUNE[`${def.id}>${ex.to}`] ?? {};
    if (tune.kind === 'none' || def.interior) continue;
    // 路进来的方向：出口 → 最近的入口
    let best: V2 | null = null;
    let bd = Number.POSITIVE_INFINITY;
    for (const e of ents) {
      const d = Math.hypot(e.at[0] - ex.at[0], e.at[1] - ex.at[1]);
      if (d < bd && d > 0.5) {
        bd = d;
        best = e.at;
      }
    }
    if (!best) continue;
    const ux = (best[0] - ex.at[0]) / bd;
    const uz = (best[1] - ex.at[1]) / bd;
    const d = tune.d ?? ex.r + 1;
    const gx = ex.at[0] + ux * d + (tune.dx ?? 0);
    const gz = ex.at[1] + uz * d + (tune.dz ?? 0);
    // 本地 +z 朝图外（= −u）
    const r = tune.r ?? Math.atan2(-ux, -uz);
    // 东西向的出口（镜头从侧面看门）默认是木架廊；南北向的是门
    const kind = tune.kind ?? (Math.abs(ux) > Math.abs(uz) ? 'arbor' : 'gate');
    out.push({ a: `exit-${kind === 'gate' ? 'gate' : kind === 'arbor' ? 'arbor' : 'posts'}`, x: gx, z: gz, r });
    // 本地 (x, z) → 本图：+z = (sin r, cos r)，+x = (cos r, −sin r)
    const c = Math.cos(r);
    const s = Math.sin(r);
    for (const t of tune.tease ?? TEASE[ex.to] ?? [])
      out.push({
        a: t.a,
        x: gx + t.x * c + t.z * s,
        z: gz - t.x * s + t.z * c,
        r: r + (t.r ?? 0),
        s: t.s,
        block: false,
      });
  }
  return out;
}
