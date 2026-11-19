// 沙漠银行（第二批办事楼，2026-11-18 关卡 3：资产组装）。这个文件归沙漠银行的代理；资产画在 src/valley/assets/bank.ts（批 B）。
// 说明（构图、资产表、配色、关卡 3 的数字）：docs/lab/2026-11-07-3d-pixel/valley-civic.md「2. 银行」。
//
// 中世纪现代的银行：浮起来的白色薄平顶（深挑檐 + 铜色封檐字）、西三分之一一面叠石墙（ATM、夜间存款口嵌在墙上）、
// 中间玻璃门、东半边玻璃幕墙前一排铜色竖遮阳片；东墙伸出一块 drive-up 雨棚盖着车道；门前过街的停车排中间一座
// "时间 / 温度"双柱招牌（老银行的真东西，市中心远远看得见的地标）。
//
// 坐标（townscale.ts 的 FRAMES 'bank'：轴 = 门口 (292.6, −590)，门面线以北 + 3 米的东西跟楼一起按 TOWN_K 缩）：
// - 贴着楼的（bank-front、ATM、夜间存款口、东墙的取款窗）照**原尺寸**放（楼 282.6…302.6 × −614…−590，高 8），过 zone 自动缩到
//   286.4…298.8 × −604.9…−590（高 5）。资产走 d.asset（不走 kit 的车道守卫：守卫按原尺寸查，东墙原尺寸 302.6 压在
//   车道上，缩完是 298.8，离车道 2.7 米；缩完的路面零顶点由 valley-accept 查）。整件的包围盒中心要在 zone 里才跟楼走。
// - 门面线以南 3 米外（人行台、停车排、招牌、车道、雨棚）照**缩完的世界坐标**写：平铺的不动、小件绕自己缩 0.62、
//   长条（雨棚，> 4.5 米）只压低 —— 雨棚资产按缩完的真尺寸画，放的时候先 scale.y = 1 / 0.62 抵掉。
//   缩完的空当：门面线 −590 到 −588.1 只能放贴楼的件（zone 里的点会被拉回楼边）；x 298.8…303 同理（雨棚中心要 > 303）。
// - drive-up 车道（ROADS 的 'bank_drive'，归 lead）：棕榈谷大道 (274.4, −583.5) → 往东 (301, −583.5) → 斜切拐角 (304, −586.5) → 往北 (304, −628)
//   塔奎兹路。车往北开、驾驶座在左 = 西 = 银行东墙的取款窗。车道上不放任何东西（只有平的白漆）。ROADS 里没有它时这里先铺一块预览。
// 随机只用 d.rng('valley:bank')。
import type * as THREE from 'three';
import { makeAsset } from '../../assets';
import type { DetailCtx } from '../../build';
import { ROADS } from '../../layout';
import { TOWN_K } from '../../townscale';
import { siteKit, Y } from './kit';

/** 门（= townscale FRAMES 'bank' 的轴、POI p_bank 的 x）、门面线（南墙） */
const DX = 292.6;
const FZ = -590;
/** 原尺寸的楼（同 layout.ts BUILDINGS 'bank'）：东墙、北墙 */
const BX1 = 302.6;
const BZ0 = -614;
/** 原尺寸 → 缩完（贴楼的东西） */
const fx = (x: number) => DX + (x - DX) * TOWN_K;
/** 缩完 → 原尺寸 */
const rz = (z: number) => FZ + (z - FZ) / TOWN_K;

/** drive-up 车道（缩完的世界坐标；ROADS 'bank_drive' 的提议，lane 5 米） */
export const BANK_DRIVE: [number, number][] = [
  [274.4, -583.5],
  [301, -583.5],
  [304, -586.5],
  [304, -628],
];
/** 取款窗：车停的地方（车道中线上） */
const WIN_Z = -599.2;

/**
 * 玩法锚点（缩完的世界坐标）：总监站在哪儿、干什么。以后做互动用。
 */
export const SPOTS = {
  /** 进门到柜台 */
  counter: { x: DX, z: -589.4, note: '进门到柜台：贷款扩场（现在拿一笔钱，以后每周还利息）' },
  /** 叠石墙上的夜间存款口 */
  nightDrop: {
    x: fx(287.6),
    z: -589.3,
    note: '夜间存款口：收工后走路来，把当天的营业款丢进去（随时开，要走到市中心）',
  },
  /** 叠石墙上的 ATM */
  atm: { x: fx(284.7), z: -589.3, note: 'ATM：查余额、取一点零用（看这周还完利息还剩多少）' },
  /** drive-up 取款窗（车道上，坐在车里） */
  driveUp: { x: 304, z: WIN_Z, note: 'drive-up 窗口：开车来存营业款，不下车（快，但只在营业时间开）' },
} as const;

export function detailBank(d: DetailCtx): void {
  const rnd = d.rng('valley:bank');
  const k = siteKit(d, rnd);
  const { flat, blockRect, block, claim, car, palm, bench, addInst } = k;

  /** 放一件资产（原点 = 落地点，转 rot 弧度）；sy = y 方向先乘多少（长条的雨棚：townwrap 会乘 K，先除掉） */
  const place = (id: string, x: number, z: number, rot = 0, sy = 1): THREE.Object3D => {
    const { obj } = makeAsset(id, d.actx);
    obj.position.set(x, 0, z);
    obj.rotation.y = rot;
    obj.scale.y = sy;
    d.asset(obj);
    return obj;
  };

  // ── 贴楼的件（原尺寸，跟楼一起缩；资产不走 kit 的车道守卫，见头注）──
  // 门脸：浮顶 + 白封檐 + 铜字 + 天窗 + 空调；叠石墙；门那一跨；幕墙 + 遮阳片 + 花池（原点 = 楼的中心）
  place('bank-front', DX, (BZ0 + FZ) / 2);
  blockRect(299.0, FZ + 1.4, 5.6, 0.9); // 花池
  // 叠石墙面（凸 0.3）上的 ATM、夜间存款口
  place('bank-atm', 284.7, FZ + 0.3);
  place('bank-night-drop', 287.6, FZ + 0.3);
  // 东墙的 drive-up 取款窗（转 90° 朝东；缩完在 298.8 上，车道西沿 301.5 以西）
  // 原点往墙里收 0.15：整件的包围盒中心要落在银行 zone（x ≤ 303）里才跟楼走（否则当小件留在原尺寸的 303 上 = 车道上）
  place('bank-teller-window', BX1 - 0.15, rz(WIN_Z), Math.PI / 2);

  // ── 门前（缩完的世界坐标）：人行台（垫在车道下面）、停车排、时间温度招牌 ──
  // 人行台：从门面线到车道南沿，西到大道人行道
  flat('flagstone', 20.2, 9.0, 292.0, Y.walk, -585.5);
  // 停车排（过了车道、车头朝北冲着银行）：水泥 + 白线；中间一格是招牌的花岛
  const LZ0 = -581;
  const LZ1 = -575.3;
  const LZC = (LZ0 + LZ1) / 2;
  flat('concrete', 17.6, LZ1 - LZ0, 292.4, Y.pave, LZC);
  const lines = [283.6, 286.4, 289.2, 292.0, 294.8, 297.6, 300.4];
  for (const x of lines) flat('line', 0.15, 4.8, x, Y.pave2, LZC + 0.2);
  const ISL = 290.6;
  for (const x of [285.0, 287.8, 293.4, 296.2, 299.0]) if (rnd() < 0.7) car(x, LZC + 0.1, Math.PI);
  // 花岛：矮石沿（平铺，不缩）+ 沙 + 两棵龙舌兰；中间时间 / 温度双柱招牌（一件小件，绕自己缩 0.62）
  flat('rock', 2.6, LZ1 - LZ0 - 0.3, ISL, Y.pave2, LZC);
  flat('sandHigh', 2.2, LZ1 - LZ0 - 0.7, ISL, Y.pave3, LZC);
  addInst('agave', { x: ISL - 0.7, z: LZC + 1.6, s: 0.7, rot: 1, reg: d.regionOf(ISL, LZC) });
  addInst('agave', { x: ISL + 0.6, z: LZC + 1.9, s: 0.55, rot: 2, reg: d.regionOf(ISL, LZC) });
  place('bank-timetemp-sign', ISL, LZC - 0.9);
  block({ x: ISL, z: LZC - 0.9, r: 0.6 });
  blockRect(ISL, LZC, 2.6, LZ1 - LZ0 - 0.3);

  // 人行台上：门东边一条长椅（玻璃幕墙前），西头大道边一棵棕榈
  bench(296.8, -586.7, 0);
  palm(283.4, -586.6, 1);

  // ── drive-up 雨棚（长条，只压低：高度写 /K）：东墙伸出去盖住车道，东沿两根细柱；南沿铜色封檐 + "DRIVE-UP" 字 ──
  const ccx = 303.2; // 雨棚 298.9…307.5 的中心：要在银行 zone（x ≤ 303）外，否则会被当成贴楼的件拉回去
  place('bank-driveup-canopy', ccx, WIN_Z, 0, 1 / TOWN_K);
  for (const z of [WIN_Z - 2.5, WIN_Z + 2.5]) block({ x: 307.25, z, r: 0.2 });
  // 车道上的白漆（平的，不算"东西"）：窗口前一道停车线、南边一个往北的箭头
  flat('line', 4.2, 0.3, 304, Y.pave2, WIN_Z + 1.9);
  flat('line', 0.4, 2.2, 304, Y.pave2, -590.6);
  flat('line', 1.5, 0.35, 304, Y.pave2, -591.8);
  // 车道口（人行台东头、车道拐角西北）一块小立牌 DRIVE-UP ↑（街边小件，绕自己缩）
  place('bank-driveup-sign', 299.8, -586.8);
  block({ x: 299.8, z: -586.8, r: 0.3 });

  // ── 车道预览：ROADS 里还没有 'bank_drive' 时先铺一块（lead 加了以后自动不铺）──
  if (!ROADS.some((r) => r.id === 'bank_drive')) {
    // 每段一条 5 米宽的带（两头各多 2.5 米盖住拐角），段和段错开 1 毫米高（叠着共面会闪）；西头从大道东沿起
    const pts = BANK_DRIVE.map(([x, z], i) => [i === 0 ? 281.4 : x, z] as const);
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [cx, cz] = pts[i];
      const len = Math.hypot(cx - ax, cz - az) + (i === 1 ? 2.5 : 5);
      const mx = (ax + cx) / 2 + (i === 1 ? (1.25 * (cx - ax)) / Math.hypot(cx - ax, cz - az) : 0);
      const mz = (az + cz) / 2 + (i === 1 ? (1.25 * (cz - az)) / Math.hypot(cx - ax, cz - az) : 0);
      flat('asphalt', 5, len, mx, 0.03 + i * 0.002, mz, Math.atan2(cx - ax, cz - az));
    }
  }

  // 占地：人行台 + 停车排；车道那一条（街边家具、build.ts 的灌木和大道棕榈不进来）
  claim({ x0: 282.6, x1: 301.4, z0: -590.2, z1: -575 });
  claim({ x0: 301.4, x1: 307.6, z0: -628, z1: -581 });
  k.finish();
}
