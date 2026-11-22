// 小镇压紧（2026-11-21，用户："车开到小镇之后步行小镇的其他地方完全不可能，像 Sasquatch 一样搞紧凑一点"）。
//
// 八个做好的模块（六家店、高中、日出公园）的细节代码都按它们**原来的世界坐标**写（"旧坐标"：整体缩到 0.7 以后、
// 压紧以前的位置）。压紧不改那些数：每个模块整块平移一个 MOVE，在三个地方套上：
// - layout.ts / townscale.ts / parkdeck.ts 的数据（楼、院子、POI、缩放框、真尺寸的球场框、台地、模块自己的小路）：
//   原坐标常量留着，导出的世界表 = 原坐标 + MOVE。
// - 细节：build.ts 给每个模块的细节函数包一层平移的 DetailCtx（shiftCtx），套在 townWrap 外面：
//   模块代码（旧坐标）→ 平移 → townWrap（按新的缩放框缩）→ build。
// - 模块代码里查世界的地方（车道守卫、离路多远……）：跑模块代码的时候 CUR 是这个模块的平移，查之前先加上（atWorld）。
// 以后要再挪哪家，只改 MOVE 这一行（再对一下新路，见 layout.ts 的 ROADS）。
//
// 新布局（世界坐标，米；北 = −z、镜头朝北，只看得见朝南的立面 → 店门一律朝南、坐在街的北边）：
//   俱乐部门口 (118, 0) 往东就是**主街**（z 0，东西向，10 米宽）。主街北边一排：报社 · [横街 x 274.4] · 银行 · 餐馆 ·
//   高中的校队球场（贴着主街）· 学校车道 · 跑道（教学楼在它北边）· 五金大超市（主街东头，停车场对着主街）。
//   横街往北 52 米到**后街**（z −51.7）就到头：正对着**市政厅**（钟塔是从主街往北看横街的尽头）；体育店在市政厅西边、也对着后街。
//   主街南边：店的对面一排车位，车位后面是住宅的后院；中间一段是日出公园。住宅（只有外景）围在外面一圈。
//
// 2026-11-21 关卡 2 第一步（结构）：市政厅挪到横街北头、五金挪到主街东头；高中拆成两块（schoolCourts = 校队球场 + 看台 +
// 练习墙 + 报名桌 + 体育馆，挪到校园西边贴主街；school = 教学楼、前庭、校车湾、教职工停车场、跑道），按旧坐标的位置分（SCHOOL_COURTS_OLD）。
import type * as THREE from 'three';

export type ModuleId =
  | 'paper'
  | 'sports'
  | 'hardware'
  | 'cityhall'
  | 'bank'
  | 'diner'
  | 'school'
  | 'schoolCourts'
  | 'park';

/** 每个模块的平移（旧坐标 → 世界坐标）：dx, dz */
export const MOVE: Record<ModuleId, readonly [number, number]> = {
  // 报社：主街北边的西头（横街西边），门前人行道 + 报箱贴着主街北沿（原来贴着塔奎兹路，同一个关系：主街比塔奎兹路窄 4 米，门面离中线 16 米）
  paper: [0, 635],
  // 体育店：后街北边、市政厅西边，门前的陶砖前场贴着后街北边的人行道
  //（原来门前还有一大块空院子 sports_yard，用户 2026-11-16 定了不放试拍小场；压紧时不要这块空地）
  sports: [-17, 650.7],
  // 银行：横街东边，门前停车排的南沿贴主街人行道；drive-up 从横街进、贴东墙往北出到后街
  bank: [0, 565],
  // 餐馆：银行东边
  diner: [7, 534],
  // 市政厅：横街北头，正门 = 横街的中线（x 274.4），门到后街中线 16.2 米（原来门到塔奎兹路中线，同一个关系）
  cityhall: [-159.6, 581.1],
  // 五金大超市：主街东头北边，停车场南沿贴主街人行道；停车场的车道从西边一条短车道（hardware_in）从主街拐进来
  //（原来从印第安峡谷路进，同一个关系）
  hardware: [190, 512.3],
  // 高中（教学楼、前庭、校车湾、教职工停车场、跑道）：学校车道从主街拐进去（原来从拉蒙路，同一种路）
  school: [-124, 448],
  // 高中的校队球场那块（旧坐标 SCHOOL_COURTS_OLD 里的：四片场、看台、练习墙、报名桌、体育馆）：挪到餐馆东边，
  // 南围网离主街北沿 4 米（原来离拉蒙路 4 米）；西北场门对着后街东头
  schoolCourts: [-305.5, 448],
  // 日出公园：主街东头南边，球场的台地离主街南边的人行道 1 米；西边一段日出大道（公园西路）从主街往南接公园路
  park: [-406, 445],
};

/** 模块的旧坐标框（世界里这块地归哪个模块：只给调试 / 测试用；细节按模块调用分，不按这个框） */
export const MOD_OLD_BOX: Record<ModuleId, { x0: number; x1: number; z0: number; z1: number }> = {
  paper: { x0: 222, x1: 266, z0: -692, z1: -640 },
  sports: { x0: 238, x1: 266, z0: -736, z1: -706 },
  bank: { x0: 274, x1: 308, z0: -628, z1: -574 },
  diner: { x0: 300, x1: 323, z0: -572, z1: -543 },
  cityhall: { x0: 405, x1: 470, z0: -684, z1: -644 },
  hardware: { x0: 330, x1: 438, z0: -604, z1: -523 },
  school: { x0: 515, x1: 640, z0: -585, z1: -452 },
  schoolCourts: { x0: 638.5, x1: 736, z0: -530, z1: -450 },
  park: { x0: 735, x1: 882, z0: -446, z1: -300 },
};

/** 高中拆块：旧坐标里这块的归 schoolCourts（校队球场 + 看台 + 练习墙 + 报名桌 + 体育馆），别的归 school */
export const SCHOOL_COURTS_OLD = { x0: 638.5, x1: 740, z0: -530, z1: -440 } as const;
export const schoolPart = (x: number, z: number): ModuleId =>
  x >= SCHOOL_COURTS_OLD.x0 && x <= SCHOOL_COURTS_OLD.x1 && z >= SCHOOL_COURTS_OLD.z0 && z <= SCHOOL_COURTS_OLD.z1
    ? 'schoolCourts'
    : 'school';

/** 旧坐标 → 世界 */
export const mv = (id: ModuleId, x: number, z: number): [number, number] => [x + MOVE[id][0], z + MOVE[id][1]];
export const mvPts = (id: ModuleId, pts: readonly (readonly [number, number])[]): [number, number][] =>
  pts.map(([x, z]) => mv(id, x, z));
export const mvRect = <R extends { x0: number; x1: number; z0: number; z1: number }>(id: ModuleId, r: R): R => ({
  ...r,
  x0: r.x0 + MOVE[id][0],
  x1: r.x1 + MOVE[id][0],
  z0: r.z0 + MOVE[id][1],
  z1: r.z1 + MOVE[id][1],
});

// ── 正在跑哪个模块的细节代码（build.ts 的 shiftCtx 设、跑完清零）──
const CUR = { dx: 0, dz: 0 };
/** 模块代码里的旧坐标 → 世界（不在模块代码里 = 原样） */
export const atWorld = (x: number, z: number): [number, number] => [x + CUR.dx, z + CUR.dz];
export const curShift = (): Readonly<{ dx: number; dz: number }> => CUR;
/** 跑 fn 的时候 CUR = 这个模块的平移 */
export function withModule<T>(id: ModuleId, fn: () => T): T {
  const was = { ...CUR };
  [CUR.dx, CUR.dz] = MOVE[id];
  try {
    return fn();
  } finally {
    CUR.dx = was.dx;
    CUR.dz = was.dz;
  }
}

/** 调试 / 验收：每个模块真放下去的东西的世界外框（detail/shift.ts 记，main.ts 的 __valley.modBounds 读） */
export const MOD_BOUNDS: Partial<Record<ModuleId, { x0: number; x1: number; z0: number; z1: number }>> = {};
export function growBounds(id: ModuleId, x0: number, x1: number, z0: number, z1: number): void {
  if (![x0, x1, z0, z1].every(Number.isFinite)) return;
  const b = MOD_BOUNDS[id];
  if (!b) MOD_BOUNDS[id] = { x0, x1, z0, z1 };
  else {
    b.x0 = Math.min(b.x0, x0);
    b.x1 = Math.max(b.x1, x1);
    b.z0 = Math.min(b.z0, z0);
    b.z1 = Math.max(b.z1, z1);
  }
}

/** 把一块几何 / 一个物体（旧坐标）挪到世界：平移 (dx, 0, dz) */
export const shiftGeo = (g: THREE.BufferGeometry, id: ModuleId): THREE.BufferGeometry =>
  g.translate(MOVE[id][0], 0, MOVE[id][1]);
