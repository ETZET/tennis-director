// 外观 + 四周的摆件（钟楼、门窗、招牌、拱廊、四周的植物、邻居的人）+ 电梯 / 货梯（三层各一个）+ 地面上看得到的 B1 天光
// （格栅、玻璃砖、天窗、树池）。三层的家具在 slots-1f / 2f / b1.ts。
// B1 比会所大：压在 B1 上面的东西（巷子、拱廊前沙地里的）看负一层时要藏起来 → GROUND（外观、一层、二层）。
import {
  DOORS,
  FLOOR_Y,
  GLASS_S,
  GLASS_W,
  GOODS_LIFT,
  GRATE,
  LIFT,
  LOGGIA_ARCHES,
  MASS,
  SKYLIGHTS,
  TOWER,
} from './layout';
import { FACE, person, type Slot } from './slot';
import type { HouseView } from './view';

const M = MASS.main;
/** 地面上、压在 B1 上面的东西：看负一层时藏起来 */
const GROUND: HouseView[] = ['out', '1f', '2f'];
const mid = (a: number, b: number) => (a + b) / 2;

export const SLOTS_EXT: Slot[] = [
  // ═════ 外观（剖面里隐藏）═════
  { id: 'tower', asset: 'bell-tower', x: mid(TOWER.x0, TOWER.x1), z: mid(TOWER.z0, TOWER.z1), views: ['out'] },
  // 烟囱：二层休息室的壁炉的烟道，从两排屋顶之间那道台阶上出去
  { id: 'chimney', asset: 'chimney', x: -58.0, z: -30.3, y: MASS.upperFront.eave + 0.2, views: ['out'] },
  // 招牌：南拱廊上沿（露台女儿墙下面）
  { id: 'sign', asset: 'club-sign', x: -54.0, z: MASS.south.z1 + 0.05, y: 3.1, mode: 'out' },
  // 二层南墙（z −19.6，露台上）：三扇拱形落地门（门洞在墙里）；东立面二层：酒吧的拱窗
  ...[-60.0, -56.5, -52.0].map(
    (x, i): Slot => ({
      id: `up-door-${i}`,
      asset: 'arch-window',
      x,
      z: M.z1 + 0.3,
      y: FLOOR_Y[2],
      variant: 1,
      views: ['out'],
      label: '#4 拱形落地门（二层 → 露台）',
      noLabel: i > 0,
    }),
  ),
  {
    id: 'up-win-e',
    asset: 'arch-window',
    x: M.x1 + 0.1,
    z: -22.5,
    y: FLOOR_Y[2] + 1.0,
    rotY: FACE.E,
    views: ['out'],
    noLabel: true,
  },
  // ═════ 东立面（拱廊立面：沿 z，外观和一层、二层剖面都在）═════
  { id: 'main-door', asset: 'main-door', x: M.x1 - 0.08, z: DOORS.main.z, rotY: FACE.E },
  {
    id: 'cafe-window',
    asset: 'arch-window',
    x: M.x1 - 0.08,
    z: -25.5,
    y: 0.95,
    rotY: FACE.E,
    variant: 1,
    label: '#4 拱窗（咖啡吧外卖窗）',
  },
  // 三角梅（攀在拱廊的柱子上）
  { id: 'bougainvillea-1', asset: 'bougainvillea', x: LOGGIA_ARCHES[1].at + 1.27, z: MASS.south.z1 + 0.15 },
  {
    id: 'bougainvillea-2',
    asset: 'bougainvillea',
    x: LOGGIA_ARCHES[4].at + 1.27,
    z: MASS.south.z1 + 0.15,
    noLabel: true,
  },
  // ═════ 南拱廊（一层，外面：外观和一层剖面都在；看二层时在露台下面，也在）═════
  { id: 'wall-fountain', asset: 'wall-fountain', x: M.x0 + 0.8, z: -11.5, rotY: FACE.E },
  { id: 'loggia-bench-1', asset: 'bench', x: -60.4, z: -10.85, label: '长椅（复用）' },
  { id: 'loggia-bench-2', asset: 'bench', x: -47.8, z: -12.0, rotY: FACE.W, noLabel: true },
  person('loggia-sit-1', -60.7, -10.9, 0, 1, 'sit', 0.3, { seat: [0.46] }),
  person('loggia-sip-1', -54.3, -11.6, FACE.N, 2, 'sip', 0.5, { prop: 'cup' }),
  // 拱廊前的陶罐（压在 B1 上面）
  { id: 'pot-l1', asset: 'pot', x: -61.2, z: -9.2, label: '陶罐（复用）', views: GROUND },
  { id: 'pot-l1-agave', asset: 'agave', x: -61.2, z: -9.2, y: 0.85, s: 0.55, noLabel: true, views: GROUND },
  { id: 'pot-l2', asset: 'pot', x: -46.8, z: -9.2, noLabel: true, views: GROUND },
  { id: 'pot-l2-agave', asset: 'agave', x: -46.8, z: -9.2, y: 0.85, s: 0.55, noLabel: true, views: GROUND },
  // 总监：外观在正门口（往里走），剖面里在商店街
  {
    id: 'director',
    asset: 'director',
    x: -45.4,
    z: -21.0,
    rotY: FACE.W,
    mode: 'out',
    pose: ['walk', 0.3],
    label: '总监（进门）',
  },
  {
    id: 'director-in',
    asset: 'director',
    x: -51.2,
    z: -21.4,
    rotY: FACE.W,
    mode: 'in',
    pose: ['walk', 0.6],
    label: '总监',
  },

  // ═════ 电梯（钟楼里）、货梯（东翼，后门边上）：三层同一格 ═════
  ...LIFT.levels.map(
    (level, i): Slot => ({
      id: `lift-${level}`,
      asset: 'lift',
      x: mid(LIFT.x0, LIFT.x1),
      z: mid(LIFT.z0, LIFT.z1),
      rotY: FACE.E,
      level,
      mode: 'in',
      noLabel: i > 0,
    }),
  ),
  ...GOODS_LIFT.levels.map(
    (level): Slot => ({
      id: `goods-lift-${level}`,
      asset: 'lift',
      x: mid(GOODS_LIFT.x0, GOODS_LIFT.x1),
      z: mid(GOODS_LIFT.z0, GOODS_LIFT.z1),
      level,
      mode: 'in',
      noLabel: true,
    }),
  ),
  // ═════ B1 的天光（地面上：外观、一层、二层看得到；看负一层时藏起来，B1 里画成亮的一块）═════
  {
    id: 'grate-band',
    asset: 'grate-band',
    x: mid(GRATE.x0, GRATE.x1),
    z: mid(GRATE.z0, GRATE.z1),
    views: GROUND,
    noBlock: true,
    noLabel: true,
  },
  {
    id: 'glass-w',
    asset: 'glass-block',
    x: mid(GLASS_W.x0, GLASS_W.x1),
    z: mid(GLASS_W.z0, GLASS_W.z1),
    views: GROUND,
    noBlock: true,
    noLabel: true,
  },
  {
    id: 'glass-s',
    asset: 'glass-block',
    x: mid(GLASS_S.x0, GLASS_S.x1),
    z: mid(GLASS_S.z0, GLASS_S.z1),
    rotY: FACE.E,
    s: 0.37,
    views: GROUND,
    noBlock: true,
    noLabel: true,
  },
  ...SKYLIGHTS.map(
    (r, i): Slot => ({
      id: `skylight-${i}`,
      asset: 'skylight',
      x: mid(r.x0, r.x1),
      z: mid(r.z0, r.z1),
      views: GROUND,
      noLabel: i > 0,
    }),
  ),

  // ═════ 四周 ═════
  // 北墙外一排蒲葵（叶冠从屋脊后面露出来）、西北角一丛灌木（压在 B1 上）、拱廊前两棵蒲葵（西边那棵压在 B1 南边的土上：树池）
  { id: 'palm-n-1', asset: 'fan-palm', x: -59.0, z: -46.6, variant: 1, s: 1.15, noLabel: true },
  { id: 'palm-n-2', asset: 'fan-palm', x: -47.5, z: -46.2, variant: 0, s: 1.05, noLabel: true },
  // 灌木 2 米宽、西巷只有 1.5 米：放在西北角（fix/nav-walkability 的 HOUSE-2 同一个位置），西巷、北巷都通
  { id: 'creosote-w', asset: 'creosote', x: -63.0, z: -42.0, variant: 1, noLabel: true, views: GROUND },
  // 会所和泳池之间的两棵蒲葵：照 clubpool 的位置（clubpool.md「共享坐标」7，两个场景统一）
  { id: 'palm-s-planter', asset: 'tree-planter', x: -60.2, z: -4.8, views: GROUND },
  { id: 'palm-s-1', asset: 'fan-palm', x: -60.2, z: -4.8, y: 0.6, variant: 2, s: 1.0, noLabel: true, views: GROUND },
  { id: 'palm-s-2', asset: 'fan-palm', x: -41.4, z: -3.6, variant: 1, s: 0.95, noLabel: true },
  // 泳池边（邻居）一个人走过来（石板小路压在 B1 南边的土上）
  person('pool-walker', -47.6, -5.2, FACE.N, 1, 'walk', 0.2, { views: GROUND }),
];
