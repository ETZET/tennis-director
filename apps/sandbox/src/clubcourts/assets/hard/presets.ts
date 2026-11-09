// hard-court 的初始状态（变体 / reset 用）。会员场照 clubcourts/layout.ts 的 MEMBER_STATE（世界坐标 → 减去场地中心 = 本地）摆：
// 南边吹上来的三条积沙舌头、总监身后吹薄的一截、喷雾滴下来的四团水洼。青训场是新漆的干净场。
import { MEMBER, MEMBER_STATE } from '../../layout';
import type { HardState, V2 } from './state';

export type PresetName = 'member' | 'clean' | 'blown' | 'storm';
/** 变体编号 → 预设：v0 会员场（比赛中：积沙 + 水洼）· v1 青训场（干净）· v2 会员场吹干净、刮干了 · v3 沙尘暴之后（南边满是沙 + 水洼，画廊看状态用） */
export const PRESETS: PresetName[] = ['member', 'clean', 'blown', 'storm'];

const loc = (p: V2): V2 => [p[0] - MEMBER.x, p[1] - MEMBER.z];
/** 场地南沿（世界 z）：落在南沿上的顶点往外推 0.6 米再圆角，圆完的舌头底边还是贴着南沿（被网格切齐） */
const EDGE_Z = MEMBER.z + MEMBER.hz;

/** Chaikin 圆角两遍：白模的舌头是 6～7 个点的折线，直接填出来是一座阶梯金字塔 */
function round(poly: V2[]): V2[] {
  let p = poly.map(([x, z]): V2 => [x, z >= EDGE_Z - 0.01 ? z + 0.6 : z]);
  for (let it = 0; it < 2; it++) {
    const q: V2[] = [];
    for (let i = 0; i < p.length; i++) {
      const [ax, az] = p[i];
      const [bx, bz] = p[(i + 1) % p.length];
      q.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    p = q;
  }
  return p;
}

function member(s: HardState) {
  // 积沙：手摆的三条舌头（也算进"风会补回来"的形状）
  for (const poly of MEMBER_STATE.drift) {
    const lp = round(poly).map(loc);
    // 边上 0.25 米渐变：吹薄的那一档（0.12..0.5）只剩窄窄一圈，不在舌头四周撒一圈碎沙
    s.eqPoly(lp, 0.9, 0.25);
    s.sandPoly(lp, 0.9, 0.25);
  }
  // 吹薄的一截（总监身后）：0.3 = 吹薄（透出场地的浅沙斑）
  for (const poly of MEMBER_STATE.thinned) s.sandPoly(round(poly).map(loc), 0.34, 0.35);
  // 总监（世界 −12.6, 31.6 = 本地 4.4, 6.6）脚下往南、正在吹的那一段：一点散沙（吹叶机锥里推出来的）
  s.sandPoly(
    [
      [3.9, 7.5],
      [4.9, 7.3],
      [5.5, 8.3],
      [3.4, 8.3],
    ],
    0.3,
    0.3,
  );
  // 水洼：白模的 (x, z, rx, rz)；amount 1 一整团，半径放大一点（水洼 ≈ 0.9 r，外面一圈潮）
  for (const [x, z, rx, rz] of MEMBER_STATE.puddles) {
    const [lx, lz] = loc([x, z]);
    s.wet(lx, lz, rx / 0.9, 1, rz / rx);
  }
}

function storm(s: HardState) {
  s.fillDrift();
  for (const [x, z, rx, rz] of MEMBER_STATE.puddles) {
    const [lx, lz] = loc([x, z]);
    s.wet(lx, lz, rx / 0.8, 1, rz / rx);
  }
  // 再加两团长到一起的（喷雾开了很久）
  s.wet(-4.2, -2.6, 1.3, 1, 0.42);
  s.wet(-3.2, -2.2, 0.9, 1, 0.5);
}

export function applyPreset(s: HardState, name: PresetName) {
  s.clear('all');
  if (name === 'member') member(s);
  else if (name === 'storm') storm(s);
  // 'clean'、'blown'：什么都没有（blown 的会员场有敞开的南边，风一吹就开始积）
  s.dirty = true;
}
