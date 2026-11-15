// clubhouse（会所）：5 × 4 格 = 15 × 12 米，门格 (2, 3) = 最前排正中。整块地的地标。
// 照 clubmap2/build.ts 的小会所（白灰泥 + 红瓦四坡顶 + 钟楼）缩成开罗式的一栋：
//   主楼两层（x ±3.9，z −5.6…−0.4，檐 6.2）+ 前面一排单层拱廊（进深 1.6，三个半圆拱，正中那个对着门格），拱廊顶是二楼的阳台（女儿墙 + 花槽）；
//   西翼单层（x −7.2…−3.9）；东边一座钟楼（复用 clubhouse 的 bell-tower，缩到 0.55）+ 钟楼后面一段单层的东翼；
//   前面一片陶砖露台（z 1.2…5.9），前沿一道矮墙（正中门格开口，两边陶罐龙舌兰），两张撑伞的咖啡桌。
// 复用：clubhouse 的 bell-tower、main-door（拱廊里的正门）、arch-window（v0 拱窗、v1 二楼阳台的落地门）、club-sign（拱廊正中拱顶上）、
//   bougainvillea ×2（攀在拱廊的柱子上）、up-planter ×2（阳台女儿墙上的天竺葵花槽）、cafe-table + up-umbrella ×2、chimney；
//   clubdesk 的 pot + clubsite 的 agave。
// 新画：墙体、拱廊（带拱洞的挤出墙）、阳台、四坡红瓦顶、露台地面和矮墙（材质 stucco、cap、roofTile、tile，都是现成的）。
// 墙：朝镜头的面落中档、东西两面落亮档、不接投影（WALL_O）；拱廊里面那道墙接投影（拱廊顶的影子 = 拱洞里是暗的，读得出深度）。
import * as THREE from 'three';
import { build as pot } from '../../clubdesk/assets/pot';
import { build as archWindow } from '../../clubhouse/assets/arch-window';
import { build as bellTower } from '../../clubhouse/assets/bell-tower';
import { build as bougainvillea } from '../../clubhouse/assets/bougainvillea';
import { build as cafeTable } from '../../clubhouse/assets/cafe-table';
import { build as chimney } from '../../clubhouse/assets/chimney';
import { build as clubSign } from '../../clubhouse/assets/club-sign';
import { build as mainDoor } from '../../clubhouse/assets/main-door';
import { build as planter } from '../../clubhouse/assets/up-planter';
import { build as umbrella } from '../../clubhouse/assets/up-umbrella';
import { EL } from '../../clubhouse/palette';
import { build as agave } from '../../clubsite/nature/agave';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';
import { addRoof, Bins, bboxOf, bx, FACE, flat, put } from './bld-kit';

/** 外墙：往上偏光，正面（l ≈ −0.35）落中档、侧面（l ≈ 0）落亮档；不接投影 */
const WALL_O: ToonOpts = { elem: EL.stucco, lightUp: 0.55, bands: [-0.5, -0.12], noShadowReceive: true };
/** 拱廊里面的墙：接投影（拱廊顶的影子） */
const INNER_O: ToonOpts = { elem: EL.stucco, lightUp: 0.55, bands: [-0.5, -0.12] };
const ROOF_O: ToonOpts = { lightUp: 0.2 };

/** 一道带半圆拱洞的墙（朝 +z，挤出 d）：外框 x0…x1 × 0…h，拱洞 [圆心 x, 宽] 落地，拱脚高 spring */
function arcadeWall(
  x0: number,
  x1: number,
  h: number,
  arches: [number, number][],
  spring: number,
  z0: number,
  d: number,
) {
  const s = new THREE.Shape();
  s.moveTo(x0, 0);
  for (const [cx, w] of arches) {
    const r = w / 2;
    s.lineTo(cx - r, 0);
    s.lineTo(cx - r, spring);
    const seg = 10;
    for (let i = 1; i <= seg; i++) {
      const a = Math.PI - (i / seg) * Math.PI;
      s.lineTo(cx + Math.cos(a) * r, spring + Math.sin(a) * r);
    }
    s.lineTo(cx + r, 0);
  }
  s.lineTo(x1, 0);
  s.lineTo(x1, h);
  s.lineTo(x0, h);
  s.lineTo(x0, 0);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, z0);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'clubhouse';
  const B = new Bins(ctx);

  // ── 尺寸 ──
  const AX = 3.9; // 主楼半宽
  const AZ0 = -5.6;
  const AZ1 = -0.4; // 主楼正面（二楼的墙、拱廊里的墙）
  const AH = 6.2; // 主楼檐高
  const LH = 3.3; // 拱廊 / 阳台地面高
  const LZ1 = 0.85; // 拱廊正面墙的里皮（拱廊进深 1.25：45° 往下看，拱洞里看得到里面那道墙和正门的下半截）
  const LD = 0.35; // 拱廊正面墙厚
  const LF = LZ1 + LD; // 拱廊正面
  const ARCH_W = 1.7;
  const SPRING = 1.75;
  const arches: [number, number][] = [
    [-2.45, ARCH_W],
    [0, ARCH_W],
    [2.45, ARCH_W],
  ];
  const WX0 = -7.2; // 西翼
  const WZ0 = -5.0;
  const WZ1 = 0.4;
  const WH = 3.6;
  const EX1 = 7.2; // 东翼
  const EZ0 = -5.4;
  const EZ1 = -1.4;
  const EH = 3.4;
  const TF = 0.9; // 钟楼正面 z
  const TX = 5.35; // 钟楼中心 x
  const TS = 0.55; // 钟楼缩放
  const FRONT = 5.9; // 露台前沿

  // ── 主楼（两层）──
  B.add('stucco', bx(2 * AX, AH, AZ1 - AZ0, 0, 0, (AZ0 + AZ1) / 2), WALL_O);
  // 拱廊里的那段墙（一楼正面）：另一个材质参数，接投影
  B.add('stucco', bx(2 * AX - 0.02, LH, 0.04, 0, 0, AZ1 + 0.02), INNER_O, 'inner');
  addRoof(B, [-AX, AX, AZ0, AZ1], AH, 2.0, 0.25, ROOF_O);
  B.add(
    'cap',
    bx(2 * AX + 0.2, 0.14, AZ1 - AZ0 + 0.2, 0, AH - 0.14, (AZ0 + AZ1) / 2),
    { ...FACE, convex: 0.3 },
    'eave',
  );

  // ── 拱廊（三个拱）+ 拱廊顶的阳台 ──
  B.add('stucco', arcadeWall(-AX, AX, LH, arches, SPRING, LZ1, LD), WALL_O, 'arcade');
  // 两头的侧墙（拱廊的东西两面）
  for (const x of [-AX + 0.15, AX - 0.15]) B.add('stucco', bx(0.3, LH, LZ1 - AZ1, x, 0, (AZ1 + LZ1) / 2), WALL_O);
  // 拱廊顶板 + 阳台地面
  B.add('stucco', bx(2 * AX, 0.3, LF - AZ1, 0, LH - 0.3, (AZ1 + LF) / 2), WALL_O);
  B.add(
    'tile',
    flat(-AX + 0.3, AX - 0.3, AZ1, LF - 0.3, LH + 0.005),
    { elem: { ...EL.terrace, seed: 52 }, edge: 0.1 },
    'deck',
    false,
  );
  // 阳台女儿墙（前 + 两头）+ 陶砖压顶
  const PH = 0.55;
  B.add('stucco', bx(2 * AX, PH, 0.3, 0, LH, LF - 0.15), WALL_O, 'parapet');
  for (const x of [-AX + 0.15, AX - 0.15])
    B.add('stucco', bx(0.3, PH, LF - AZ1, x, LH, (AZ1 + LF) / 2), WALL_O, 'parapet');
  const capO = { lightUp: 0.4, convex: 0.4 };
  B.add('cap', bx(2 * AX + 0.12, 0.1, 0.42, 0, LH + PH, LF - 0.15), capO, 'pcap');
  for (const x of [-AX + 0.15, AX - 0.15])
    B.add('cap', bx(0.42, 0.1, LF - AZ1, x, LH + PH, (AZ1 + LF) / 2), capO, 'pcap');

  // ── 西翼（单层）──
  B.add('stucco', bx(-AX - WX0, WH, WZ1 - WZ0, (WX0 - AX) / 2, 0, (WZ0 + WZ1) / 2), WALL_O);
  addRoof(B, [WX0, -AX, WZ0, WZ1], WH, 1.4, 0.2, ROOF_O);
  B.add(
    'cap',
    bx(-AX - WX0 + 0.16, 0.12, WZ1 - WZ0 + 0.16, (WX0 - AX) / 2, WH - 0.12, (WZ0 + WZ1) / 2),
    { ...FACE, convex: 0.3 },
    'eave',
  );

  // ── 东翼（单层，钟楼后面）──
  B.add('stucco', bx(EX1 - AX, EH, EZ1 - EZ0, (AX + EX1) / 2, 0, (EZ0 + EZ1) / 2), WALL_O);
  addRoof(B, [AX, EX1, EZ0, EZ1], EH, 1.3, 0.2, ROOF_O);
  B.add(
    'cap',
    bx(EX1 - AX + 0.16, 0.12, EZ1 - EZ0 + 0.16, (AX + EX1) / 2, EH - 0.12, (EZ0 + EZ1) / 2),
    { ...FACE, convex: 0.3 },
    'eave',
  );

  // 墙脚一圈陶砖踢脚（看得见的正面）
  const base = { ...FACE, convex: 0.3, bands: [-0.5, -0.12] as [number, number] };
  B.add('cap', bx(2 * AX, 0.3, 0.05, 0, 0, LF + 0.025), base, 'base');
  B.add('cap', bx(-AX - WX0, 0.3, 0.05, (WX0 - AX) / 2, 0, WZ1 + 0.025), base, 'base');
  B.add('cap', bx(0.05, 0.3, WZ1 - WZ0, WX0 - 0.025, 0, (WZ0 + WZ1) / 2), base, 'base');
  B.add('cap', bx(0.05, 0.3, EZ1 - EZ0, EX1 + 0.025, 0, (EZ0 + EZ1) / 2), base, 'base');

  // ── 露台：陶砖地（拱廊里、露台）+ 前沿矮墙（正中门格开口）──
  const T = 7.35;
  B.add(
    'tile',
    flat(-T, T, WZ1, FRONT, 0.012),
    { elem: { ...EL.terrace, seed: 51 }, edge: 0.1, convex: 0 },
    'floor',
    false,
  );
  B.add(
    'tile',
    flat(-AX, AX, AZ1, WZ1, 0.012),
    { elem: { ...EL.terrace, seed: 51 }, edge: 0.1, convex: 0 },
    'floor',
    false,
  );
  const GAP = 1.5;
  const LW = 0.5;
  for (const s of [-1, 1]) {
    const x0 = s * GAP;
    const x1 = s * T;
    const cx = (x0 + x1) / 2;
    const w = Math.abs(x1 - x0);
    B.add('stucco', bx(w, LW, 0.25, cx, 0, FRONT - 0.13), WALL_O, 'low');
    B.add('cap', bx(w + 0.08, 0.08, 0.33, cx, LW, FRONT - 0.13), capO, 'lowcap');
    // 两头的侧矮墙（沿 z 往回一段）
    B.add('stucco', bx(0.25, LW, 1.6, x1 - s * 0.13, 0, FRONT - 0.95), WALL_O, 'low');
    B.add('cap', bx(0.33, 0.08, 1.68, x1 - s * 0.13, LW, FRONT - 0.95), capO, 'lowcap');
  }

  B.build(root, 'clubhouse:shell');

  // ── 钟楼（复用，缩小，落在东前角）──
  const tower = put(ctx, root, bellTower, 0, 0, 0, 0, TS, 0);
  const tb = bboxOf(tower);
  tower.position.set(TX - (tb.min.x + tb.max.x) / 2, 0, TF - tb.max.z);
  // 塔身换成会所外墙的那套（原件朝镜头的南面在暗档：和这里落中档的白墙放在一起像一根灰柱子）。
  // bell-tower 的第一个网格是塔身（build 里 g.add 的顺序）；对不上就不换
  const shaft = tower.children[0] as THREE.Mesh;
  if (shaft?.isMesh && (shaft.material as THREE.Material).type === 'MeshToonMaterial')
    shaft.material = ctx.mat('stucco', { ...WALL_O, elem: { kind: 'stones', size: [16, 10], seam: 0, hi: 0 } });

  // ── 门窗 ──
  // 正门：不放在拱廊里面那道墙上（45° 往下看，拱洞里只露得出那道墙的下半截），而是直接站在正中那个拱洞里（拱廊墙的里皮后面），
  // 拱洞框着门；两边的拱洞照旧是空的拱廊
  put(ctx, root, mainDoor, 0, 0.01, LZ1 - 0.06, 0, 0.6, 0);
  for (const x of [-2.45, 2.45]) put(ctx, root, archWindow, x, 0.55, AZ1 + 0.1, 0, 0.9, 0);
  // 二楼：正中阳台落地门 + 两边拱窗
  put(ctx, root, archWindow, 0, LH + 0.01, AZ1 + 0.12, 0, 0.82, 1);
  for (const x of [-2.45, 2.45]) put(ctx, root, archWindow, x, LH + 0.75, AZ1 + 0.12, 0, 0.9, 0);
  // 西翼正面一扇拱窗
  put(ctx, root, archWindow, (WX0 - AX) / 2, 0.6, WZ1 + 0.12, 0, 0.9, 0);

  // ── 招牌、花 ──
  put(ctx, root, clubSign, 0, SPRING + ARCH_W / 2 + 0.06, LF + 0.06, 0, 0.66, 0);
  put(ctx, root, bougainvillea, -1.225, 0, LF, 0, 0.82, 0);
  put(ctx, root, bougainvillea, -AX + 0.25, 0, LF, 0, 0.78, 1);
  for (const x of [-2.2, 2.2]) put(ctx, root, planter, x, LH + PH + 0.1, LF - 0.15, 0, 0.8, 0);
  // 烟囱：主楼屋顶的西坡上
  put(ctx, root, chimney, -2.6, AH - 0.6, -3.6, 0, 0.6, 0);

  // ── 露台的两张咖啡桌（撑伞）+ 门口两只陶罐龙舌兰 ──
  for (const [x, z] of [
    [-4.7, 3.7],
    [4.7, 3.9],
  ]) {
    put(ctx, root, cafeTable, x, 0.012, z, 0, 1, 0);
    put(ctx, root, umbrella, x, 0.012, z, 0, 1, 0);
  }
  for (const s of [-1, 1]) {
    put(ctx, root, pot, s * (GAP + 0.45), 0.012, FRONT - 0.7, 0, 0.8, 0);
    put(ctx, root, agave, s * (GAP + 0.45), 0.012 + 0.85 * 0.8, FRONT - 0.7, s, 0.48, s > 0 ? 1 : 2);
  }

  return root;
}
