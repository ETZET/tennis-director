// #9 drink-fountain：西台阶顶的饮水点。陶砖底座 + 灰泥方柱（柱头一圈蓝白相间的塔拉韦拉方砖，和喷泉的花砖带呼应）
// + 顶上一只陶砖小水盘（盘里一点池水色的水）+ 一根弯过来的金属出水嘴 + 正面一颗铜按钮。
// 本地原点 = 底座中心，正面（出水嘴弯过去的方向、按钮）朝 +z。SLOTS 里 rotY = W（朝西，对着步道）→ 镜头看到的是它的本地 +x 侧面，
// 出水嘴在画面上朝左伸出去（侧面的剪影最清楚）。
// userData：
// - `setState('ok' | 'clogged')`：堵了 = 水盘积水涨到沿下、变成发绿的死水（总监来通）；ok = 浅浅一层清水
// - `setRunning(on)`：有人在喝 = 出水嘴冒一小股弧形的水（1 纹素粗，亮水色）
// - `spots.drink`：喝水的人站哪（本地 [x, z]，面朝 −z）
import * as THREE from 'three';
import type { AssetCtx } from '../world';
import { box, boxOn, merge, v3 } from './life/kit';

/** 死水（局部新色）：亮 #8ec890 L181、中 #5a9a7e L132、暗 #2e5a66 L78 —— 和池水的青拉开，一眼看出"脏了" */
const ALGAE: [number, number, number] = [0x8ec890, 0x5a9a7e, 0x2e5a66];
/** 水流：池水亮边三档 */
const STREAM: [number, number, number] = [0x8cf0ee, 0x5cc8dc, 0x3c74b8];

const COL = { w: 0.32, d: 0.3, y0: 0.08, y1: 0.78 };
const BASIN = { w: 0.5, d: 0.46, y0: 0.78, floor: 0.06, rimH: 0.14, t: 0.065 };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'drink-fountain';
  // 朝镜头的竖直面：抬光 + 低 bands → 侧面落中档、不发黑；小道具不接收投影（不然背光的侧面被自己的水盘压成一条条暗纹）
  const FACE = { lightUp: 0.5, bands: [-0.45, 0.42] as [number, number], noShadowReceive: true };

  // ── 陶砖：底座 + 水盘（盘底 + 四面盘沿）──────────────────
  const top = BASIN.y0 + BASIN.floor + BASIN.rimH;
  const { w, d, t } = BASIN;
  const rimY = BASIN.y0 + BASIN.floor;
  const cap = merge([
    boxOn(0.46, COL.y0, 0.42, 0, 0, 0),
    boxOn(w, BASIN.floor, d, 0, BASIN.y0, 0),
    boxOn(w, BASIN.rimH, t, 0, rimY, d / 2 - t / 2),
    boxOn(w, BASIN.rimH, t, 0, rimY, -d / 2 + t / 2),
    boxOn(t, BASIN.rimH, d - 2 * t, w / 2 - t / 2, rimY, 0),
    boxOn(t, BASIN.rimH, d - 2 * t, -w / 2 + t / 2, rimY, 0),
  ]);
  g.add(new THREE.Mesh(cap, ctx.mat('cap', { ...FACE, convex: 0.8 })));

  // ── 灰泥方柱（local 的灰泥斑）──────────────────────────
  g.add(
    new THREE.Mesh(
      merge([boxOn(COL.w, COL.y1 - COL.y0, COL.d, 0, COL.y0, 0)]),
      ctx.mat('adobe', { ...FACE, elem: { kind: 'paint', space: 'local', size: [6, 5], density: [0, 0.03] } }),
    ),
  );

  // ── 柱头一圈方砖（每面两块，蓝白相间，凸出 1 厘米）────────────
  const blue: THREE.BufferGeometry[] = [];
  const cream: THREE.BufferGeometry[] = [];
  const ty = COL.y1 - 0.19;
  const th = 0.14;
  const pr = 0.012;
  for (let face = 0; face < 4; face++) {
    for (let k = 0; k < 2; k++) {
      const alongX = face < 2;
      const span = alongX ? COL.w : COL.d;
      const tw = span / 2;
      const off = -span / 2 + tw * (k + 0.5);
      const sgn = face % 2 === 0 ? 1 : -1;
      const geo = alongX
        ? boxOn(tw - 0.01, th, pr * 2, off, ty, sgn * (COL.d / 2))
        : boxOn(pr * 2, th, tw - 0.01, sgn * (COL.w / 2), ty, off);
      ((face + k) % 2 === 0 ? blue : cream).push(geo);
    }
  }
  g.add(new THREE.Mesh(merge(blue), ctx.mat('talavera', { ...FACE, noShadowReceive: true })));
  g.add(new THREE.Mesh(merge(cream), ctx.mat('signPaint', { ...FACE, noShadowReceive: true })));

  // ── 金属出水嘴（从盘后沿立起来、往前弯过盘心）+ 正面的铜按钮 ─────
  const metal = merge([
    boxOn(0.045, 0.13, 0.045, 0, rimY, -0.11),
    box(0.045, 0.045, 0.15, 0, rimY + 0.13, -0.05),
    box(0.045, 0.06, 0.045, 0, rimY + 0.11, 0.02),
  ]);
  g.add(new THREE.Mesh(metal, ctx.mat('metal', { lightUp: 0.3, convex: 0.8 })));
  g.add(new THREE.Mesh(merge([box(0.07, 0.07, 0.03, 0, rimY + 0.06, d / 2 + 0.01)]), ctx.mat('brass', { ...FACE })));

  // ── 水：清水（浅）/ 死水（满）两块，按状态换 ────────────────
  const inner = (y: number) => box(w - 2 * t - 0.005, 0.02, d - 2 * t - 0.005, 0, y, 0);
  const clean = new THREE.Mesh(merge([inner(rimY + 0.03)]), ctx.mat('fountainWater', { edge: 0, convex: 0 }));
  const murky = new THREE.Mesh(
    merge([inner(top - 0.03)]),
    ctx.mat('fountainWater', { ramp: ALGAE, edge: 0, convex: 0 }),
  );
  murky.visible = false;
  // 一小股水：从嘴里往上冒一点再落回盘里（两段 1 纹素的条）
  const tip = v3(0, rimY + 0.09, 0.02);
  const stream = new THREE.Mesh(
    merge([
      box(0.04, 0.09, 0.04, tip.x, tip.y + 0.06, tip.z + 0.03),
      box(0.04, 0.04, 0.09, tip.x, tip.y + 0.1, tip.z + 0.08),
      box(0.04, 0.1, 0.04, tip.x, tip.y + 0.04, tip.z + 0.13),
    ]),
    ctx.mat('fountainWater', { ramp: STREAM, edge: 0, convex: 0, noShadowReceive: true }),
  );
  stream.visible = false;
  g.add(clean, murky, stream);

  ctx.mats.prepare(g);
  stream.castShadow = false;

  const st = { state: 'ok' as 'ok' | 'clogged', running: false };
  g.userData.setState = (s: 'ok' | 'clogged') => {
    st.state = s;
    clean.visible = s === 'ok';
    murky.visible = s === 'clogged';
    // 堵了就不出水
    if (s === 'clogged') stream.visible = false;
    else stream.visible = st.running;
  };
  g.userData.setRunning = (on: boolean) => {
    st.running = on;
    stream.visible = on && st.state === 'ok';
  };
  g.userData.state = () => ({ ...st });
  g.userData.spots = { drink: [0, 0.55] };
  // 画廊：?v=1 看堵了的样子，?v=2 看正在出水
  if (ctx.variant === 1) g.userData.setState('clogged');
  if (ctx.variant === 2) g.userData.setRunning(true);
  return g;
}
