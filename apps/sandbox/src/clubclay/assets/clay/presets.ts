// clay-court 的初始状态（变体 / reset 用）。全部用 state.ts 的同一套操作摆出来（拖、扫线、浇水、踩、球印、滑步），
// 所以预设本身也是 API 的演示；位置照 layout.ts 的 FAR_STATE / NEAR_STATE / SPOTS（世界坐标 → 减去场地中心 = 本地）。
import { FAR, FAR_STATE, NEAR, NEAR_STATE, SPOTS } from '../../layout';
import { type ClayState, NORMAL, type V2 } from './state';

export type PresetName = 'far' | 'near' | 'fresh' | 'dusty' | 'wet' | 'normal';
export const PRESETS: PresetName[] = ['far', 'near', 'fresh', 'dusty', 'wet', 'normal'];

const DIMS = { L: 23.77, DW: 10.97, SW: 8.23, SVC: 6.4 };

/**
 * 一道道东西向的拖：zs = 每道中心 z（从北往南），x0..x1 = 直道的范围。
 * turnAt 'w' / 'e'：两道一组，在那头 U 形拐弯（同心的弧），另一头抬起垫子；'both'：一整条蛇形，两头轮流拐。
 */
function lanes(s: ClayState, zs: number[], x0: number, x1: number, turnAt: 'w' | 'e' | 'both', width = 2.4) {
  const arc = (pts: V2[], xe: number, za: number, zb: number, dir: number) => {
    const r = Math.abs(zb - za) / 2;
    const cz = (za + zb) / 2;
    for (let k = 1; k < 12; k++) {
      const t = (k / 12) * Math.PI;
      pts.push([xe + dir * Math.sin(t) * r, cz - Math.sign(zb - za) * Math.cos(t) * r]);
    }
  };
  if (turnAt === 'both') {
    const pts: V2[] = [];
    zs.forEach((z, i) => {
      const east = i % 2 === 0;
      pts.push(east ? [x0, z] : [x1, z], east ? [x1, z] : [x0, z]);
      if (i + 1 < zs.length) arc(pts, east ? x1 : x0, z, zs[i + 1], east ? 1 : -1);
    });
    s.dragPath(pts, width);
    return;
  }
  const towardW = turnAt === 'w';
  const [s0, s1] = towardW ? [x1, x0] : [x0, x1];
  for (let i = 0; i < zs.length; i += 2) {
    const a = zs[i];
    const b = zs[i + 1];
    const pts: V2[] = [
      [s0, a],
      [s1, a],
    ];
    if (b !== undefined) {
      arc(pts, s1, a, b, towardW ? -1 : 1);
      pts.push([s1, b], [s0, b]);
    }
    s.dragPath(pts, width);
  }
}

/**
 * 远场 outer_2（v0）：维护进行到一半 —— 西半场拖完、扫完线、浇过水；东半场北边三道拖过、第 4 道拖到拖垫后面（拖垫在 x 8.5 往西走），
 * 东南一片还是打完没拖的起尘（脚印、两道滑步痕、几个淡了的球印）；拖过的地方线糊了土、东半场的线还没扫。
 */
function far(s: ClayState) {
  const ox = FAR.x;
  const oz = FAR.z;
  s.fill(0.86, { scuff: 0.55, tape: 0.45, jitter: 0.06 });
  // 打完没拖的痕迹（东南）：发球人 / 接发球的脚印、滑步、球印
  s.trail(
    [
      [14.6, 2.6],
      [12.6, 3.4],
      [11.2, 5.2],
      [10.4, 6.8],
    ],
    0.7,
    0.4,
  );
  s.trail(
    [
      [7.2, 6.4],
      [8.6, 4.6],
      [9.4, 2.8],
    ],
    0.75,
    0.4,
  );
  s.slide(12.4, 2.7, 0.15, 1, 1.35);
  s.slide(13.1, 5.6, -0.1, -1, 1.2);
  for (const [x, z, a] of [
    [10.6, 3.9, 0.2],
    [9.1, 6.1, -0.3],
    [5.2, 4.3, 0.1],
  ])
    s.ballMark(x, z, Math.cos(a), Math.sin(a), 0.3);
  // 西半场：7 道（2.4 米一道），西头 U 形拐弯；东头在网下面断开
  lanes(s, [-7.1, -4.7, -2.3, 0.1, 2.5, 4.9, 7.3], -15.0, 0.0, 'w');
  // 东半场：北边三道（道与道之间留 0.2 米没拖到 = 一条翻起的土）+ 第 4 道拖到拖垫后沿（东头 U 形拐弯）
  lanes(s, [-6.7, -4.1], 1.0, 14.8, 'e', 2.4);
  lanes(s, [-1.5, 1.1], 1.0, 14.8, 'e', 2.4);
  // 第 4 道（z 1.1）只该拖到拖垫后沿 x 9.1：上面那一组把它整道拖了，西段补回起尘（拖垫前面还没拖）
  s.forCells(-0.2, -0.1, 7.9, 2.35, (k, _x, z) => {
    if (Math.abs(z - 1.1) < 1.12) {
      s.dust[k] = 0.86;
      s.scuff[k] = 0.55;
    }
  });
  s.forTape(-0.2, -0.1, 7.9, 2.3, (li, k) => {
    s.tape[li][k] = 0.45;
  });
  // 拖垫底下和后面这一段（拖垫中心 x 8.5，宽 2.4、长 1.2，往西）
  s.drag(SPOTS.dragNow[0] + 2 - ox, SPOTS.dragNow[1] - oz, -1, 0);
  // 总监走在拖垫前面（往西）：起尘的土上一串新脚印；从北边水管那头过来
  s.trail(
    [
      [5.4, -2.0],
      [6.6, 0.2],
      [7.4, 1.0],
    ],
    0.7,
    1,
  );
  // 扫线：西半场的线（x < 0）都扫过
  for (const id of ['baseW', 'svcW']) s.sweepLine(id);
  for (const id of ['sideN', 'sideS', 'singleN', 'singleS', 'center'])
    s.sweepLine(id, Number.NEGATIVE_INFINITY, FAR_STATE.sweptX - ox);
  // 浇水：西半场手摆的一大块（边是弯的），晾了一会儿 → 深浅不匀、水洼只剩几处
  s.waterPoly(
    FAR_STATE.wet.map(([x, z]) => [x - ox, z - oz] as V2),
    1,
    0.7,
  );
  s.dryStep(160);
}

/**
 * 近场 outer_3（v1）：比赛中 —— 底色正常；底线后、发球线 T 附近踩出来的起尘（NEAR_STATE.worn）；球印、滑步痕（NEAR_STATE）；
 * 发球人、网前两人脚下一圈脚印；赛前拖过的痕迹只在没人踩的双打走廊和场角还剩一点（低土况 → 扫痕）。线全白。
 */
function near(s: ClayState) {
  const ox = NEAR.x;
  const oz = NEAR.z;
  s.fill(NORMAL, { scuff: 0.25, jitter: 0.07 });
  // 赛前拖过：两条双打走廊的外半边（没人踩）还看得出扫痕
  for (const z of [-7.0, 7.0])
    s.dragPath(
      [
        [-15.6, z],
        [15.6, z],
      ],
      2.0,
    );
  s.sweepLine('all');
  // 场里比赛磨出来的：发球区、底线中段，正常偏上一点、擦痕多
  for (const [x, z, r, a] of [
    [-12.6, 0, 3.2, 0.12],
    [12.6, 0, 3.2, 0.12],
    [-6.4, 0, 2.4, 0.1],
    [6.4, 0, 2.4, 0.1],
    [0, -3, 3, 0.06],
    [0, 3, 3, 0.06],
  ] as [number, number, number, number][])
    s.wear(x, z, r, a);
  for (const poly of NEAR_STATE.worn)
    s.wearPoly(
      poly.map(([x, z]) => [x - ox, z - oz] as V2),
      0.84,
      0.5,
      0.75,
    );
  // 脚印：发球人（东底线后）、两个网前的、西边接发球的
  const sx = SPOTS.server[0] - ox;
  const sz = SPOTS.server[1] - oz;
  s.trail(
    [
      [sx + 0.4, sz - 2.4],
      [sx - 0.2, sz - 1.0],
      [sx, sz + 0.2],
    ],
    0.66,
  );
  s.trail(
    [
      [sx - 1.4, sz + 1.6],
      [sx - 0.6, sz + 0.9],
    ],
    0.6,
    0.4,
  );
  for (const [px, pz] of [SPOTS.netE, SPOTS.netW, SPOTS.returner]) {
    const x = px - ox;
    const z = pz - oz;
    s.trail(
      [
        [x - 0.9, z - 0.7],
        [x + 0.3, z - 0.1],
        [x - 0.2, z + 0.8],
      ],
      0.62,
      0.8,
    );
  }
  for (const [x, z, len, rot] of NEAR_STATE.slides)
    s.slide(x - ox, z - oz - len / 2, Math.sin(rot), Math.cos(rot), len);
  for (const [x, z, rot] of NEAR_STATE.marks) s.ballMark(x - ox, z - oz, Math.cos(rot), Math.sin(rot));
}

/** 刚拖平 + 扫完线（一整片东西向的道，两头 U 形拐弯） */
function fresh(s: ClayState) {
  s.fill(0.5, { scuff: 0.2 });
  const zs: number[] = [];
  for (let z = -s.hd + 1.2; z < s.hd; z += 2.4) zs.push(z);
  lanes(s, zs, -s.hw + 1.4, s.hw - 1.4, 'both');
  s.sweepLine('all');
}

/** 打了一整天没拖：全起尘，线盖了一层薄土，到处是脚印和几道滑步 */
function dusty(s: ClayState) {
  s.fill(0.86, { scuff: 0.7, tape: 0.5, jitter: 0.05 });
  for (const sx of [-1, 1]) {
    s.trail(
      [
        [sx * 13.4, -3.2],
        [sx * 12.2, -1.0],
        [sx * 12.8, 1.4],
        [sx * 11.4, 3.6],
      ],
      0.7,
      0.8,
    );
    s.slide(sx * 12.6, -2.4, 0.1 * sx, 1, 1.3);
    s.ballMark(sx * 9.8, 2.2, -sx, 0.2, 0.8);
  }
}

/** 刚浇过一遍水（整片湿，晾了一下：深浅不匀、几处水洼） */
function wet(s: ClayState) {
  s.fill(NORMAL, { scuff: 0.2 });
  s.sweepLine('all');
  s.waterPoly(
    [
      [-s.hw + 0.6, -s.hd + 0.6],
      [s.hw - 0.6, -s.hd + 0.6],
      [s.hw - 0.6, s.hd - 0.6],
      [-s.hw + 0.6, s.hd - 0.6],
    ],
    1,
    1.2,
  );
  s.dryStep(120);
}

/** 正常（打过一阵）：线干净 */
function normal(s: ClayState) {
  s.fill(NORMAL, { scuff: 0.35, jitter: 0.06 });
}

export function applyPreset(s: ClayState, name: PresetName) {
  ({ far, near, fresh, dusty, wet, normal })[name](s);
}

export { DIMS };
