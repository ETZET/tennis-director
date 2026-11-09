// #7 drinks-cart：有摊主的饮料车（agua fresca 小推车，以后会挣钱）。
// 木车厢（竖板）+ 浅石台面 + 两个前轮 + 西头的推把；台面上一摞白杯子、两只大玻璃饮料桶（洛神花红 / 柠檬水黄）、一只白冷藏箱（珊瑚盖）；
// 车厢正面挂一块深蓝小招牌（两个圆点 = 两种喝的）。东头夹一把八角遮阳伞：**珊瑚 / 奶油**相间（不用青蓝 —— 冷色只给池水）。
//
// 伞为什么偏在东头：太阳在北偏上，伞顶在屏幕上会盖住它北边 ~2 米的地。伞正罩在车上的话，站在车后面的摊主整个被伞顶挡住。
// 伞柄夹在车厢东头（本地 x +0.62），伞的西沿在 x −0.40：摊主站在车后面偏西（userData.spots.vendor = 本地 (−0.7, −0.85)）就露得出来。
// 投影：伞顶 2.2～2.5 米 → 影子池落在车上和车前 ~2.3 米（买喝的人站的地方）；车台上的小东西（饮料桶、杯子、冷藏箱、招牌）
// 不接收投影（小道具的规矩），在伞荫里也是亮的：深色的车厢 + 亮的货 = 一眼看出卖什么。
//
// 本地原点 = 车厢脚印中心，正面（招牌、轮子）朝 +z（rotY 0 = 朝南、朝镜头）。
// userData：
// - `spots`：{ vendor, buyer, pole }（本地 [x, z] 米）：摊主站位（车后偏西，面朝 +z）、买的人站位（车前偏西，面朝 −z）、伞柄
// - `setLevel(red, yellow)`：两只饮料桶里还剩多少（0..1；卖一杯少一点，见底了要补货）
// - `setOpen(on)`：伞开 / 收（收起 = 伞柄上一卷布；收摊、大风）
import * as THREE from 'three';
import type { AssetCtx } from '../world';
import { box, boxOn, cyl, merge, roundNormals, v3 } from './life/kit';

/** 车厢 */
const BODY = { x: 0.72, y0: 0.31, y1: 0.92, z: 0.36 };
/** 台面顶 */
const TOP_Y = 0.98;
/** 伞：柄的位置、伞顶、伞沿高、半径 */
const UMB = { x: 0.62, z: -0.22, apex: 2.5, rim: 2.16, r: 1.1 };
/** 饮料桶：x、半径、高（台面以上） */
const JARS = [
  { x: -0.3, key: 'flowerRed' as const },
  { x: 0.04, key: 'flowerYellow' as const },
];
const JAR_R = 0.15;
const JAR_H = 0.4;

/** 饮料桶的鼓肚轮廓（车削）：底收、肚鼓、肩收 */
function jarLathe(r: number, h: number, seg = 8): THREE.BufferGeometry {
  const prof = [
    new THREE.Vector2(r * 0.001, 0),
    new THREE.Vector2(r * 0.82, 0),
    new THREE.Vector2(r, h * 0.18),
    new THREE.Vector2(r * 1.02, h * 0.55),
    new THREE.Vector2(r * 0.95, h * 0.9),
    new THREE.Vector2(r * 0.8, h),
    new THREE.Vector2(r * 0.001, h),
  ];
  return new THREE.LatheGeometry(prof, seg);
}

/** 八角伞：8 片三角布（中间一圈略塌，像绷在伞骨上）+ 每片一块尖角垂边。k 偶数一组、奇数一组（两种颜色） */
function canopy(group: 0 | 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const { apex, rim, r } = UMB;
  const midY = apex - (apex - rim) * 0.58;
  const at = (phi: number, rr: number, y: number) => v3(Math.cos(phi) * rr, y, Math.sin(phi) * rr);
  const c = v3(0, apex, 0);
  for (let k = 0; k < 8; k++) {
    if (k % 2 !== group) continue;
    // 第 k 片：从顶点 k 到 k+1（顶点在 22.5° + k·45°）；k = 1 那片的中线朝 +z（正前方）
    const p0 = (k - 0.5) * (Math.PI / 4) + Math.PI / 8;
    const p1 = p0 + Math.PI / 4;
    const a0 = at(p0, r, rim);
    const a1 = at(p1, r, rim);
    const m0 = at(p0, r * 0.5, midY);
    const m1 = at(p1, r * 0.5, midY);
    const tri: THREE.Vector3[][] = [
      [c, m1, m0],
      [m0, m1, a1],
      [m0, a1, a0],
    ];
    // 垂边：一条 0.09 高的布 + 中间往下一个尖（0.16）
    const pm = (p0 + p1) / 2;
    const b0 = at(p0, r, rim - 0.09);
    const b1 = at(p1, r, rim - 0.09);
    const tip = at(pm, r * Math.cos(Math.PI / 8), rim - 0.17);
    tri.push([a0, a1, b1], [a0, b1, b0], [b0, b1, tip]);
    const pos: number[] = [];
    for (const t of tri) for (const p of t) pos.push(p.x, p.y, p.z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    // 法线朝外（朝上 / 朝外）：翻掉朝里的三角形
    const n = g.getAttribute('normal');
    const P = g.getAttribute('position');
    for (let i = 0; i < P.count; i += 3) {
      const cx = (P.getX(i) + P.getX(i + 1) + P.getX(i + 2)) / 3;
      const cz = (P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2)) / 3;
      const out = n.getX(i) * cx + n.getZ(i) * cz + n.getY(i) * 0.3;
      if (out < 0) {
        for (const a of ['x', 'y', 'z'] as const) {
          const get = a === 'x' ? P.getX.bind(P) : a === 'y' ? P.getY.bind(P) : P.getZ.bind(P);
          const v1 = get(i + 1);
          const v2 = get(i + 2);
          const set = a === 'x' ? P.setX.bind(P) : a === 'y' ? P.setY.bind(P) : P.setZ.bind(P);
          set(i + 1, v2);
          set(i + 2, v1);
        }
      }
    }
    g.computeVertexNormals();
    parts.push(g);
    // 背面一份（法线朝下）：单面的布在阴影 pass 里不投影（three 用背面画阴影），伞的影子池要有
    const back = g.clone();
    const bp = back.getAttribute('position');
    for (let i = 0; i < bp.count; i += 3) {
      const x = bp.getX(i + 1);
      const y = bp.getY(i + 1);
      const z = bp.getZ(i + 1);
      bp.setXYZ(i + 1, bp.getX(i + 2), bp.getY(i + 2), bp.getZ(i + 2));
      bp.setXYZ(i + 2, x, y, z);
    }
    back.computeVertexNormals();
    parts.push(back);
  }
  return merge(parts).translate(UMB.x, 0, UMB.z);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'drinks-cart';
  // 朝镜头的竖直面（车厢正面、招牌）：低 bands，正面落中档（不发黑）、顶面亮
  const FACE: [number, number] = [-0.45, 0.42];
  const LU = 0.5;

  // ── 木车厢（竖板，板宽 0.24 米）────────────────────────
  const timber = ctx.mat('timber', {
    bands: FACE,
    lightUp: LU,
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 0.24], q: [1, 0, 0, 0], seam: 1, hi: 1 },
  });
  g.add(new THREE.Mesh(merge([boxOn(BODY.x * 2, BODY.y1 - BODY.y0, BODY.z * 2, 0, BODY.y0, 0)]), timber));

  // ── 台面（浅石，前沿伸出 → 凸边亮线）──────────────────
  g.add(
    new THREE.Mesh(
      merge([boxOn(1.58, TOP_Y - BODY.y1, 0.82, 0, BODY.y1, 0.01)]),
      ctx.mat('counterTop', { convex: 0.9 }),
    ),
  );

  // ── 铁件：底盘、轮子、推把、伞柄、伞顶的小球 ────────────
  const iron: THREE.BufferGeometry[] = [
    boxOn(1.5, 0.06, 0.66, 0, 0.25, 0),
    // 推把：两根斜杆 + 一根横杆（西头）
    box(0.34, 0.045, 0.045, -0.88, 0.9, -0.26).rotateZ(0),
    box(0.34, 0.045, 0.045, -0.88, 0.9, 0.26),
    box(0.05, 0.05, 0.6, -1.04, 0.9, 0),
    // 伞柄（1 纹素粗，从台面穿到伞顶）
    cyl(0.03, 0.03, UMB.apex - TOP_Y + 0.04, 6, UMB.x, TOP_Y, UMB.z),
    // 伞柄夹子
    boxOn(0.1, 0.12, 0.1, UMB.x, TOP_Y, UMB.z),
  ];
  for (const x of [-0.5, 0.5]) {
    iron.push(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 12).rotateX(Math.PI / 2).translate(x, 0.24, BODY.z + 0.05));
  }
  g.add(new THREE.Mesh(merge(iron), ctx.mat('ironwork', { bands: FACE, lightUp: LU })));

  // ── 黄铜：轮毂、龙头、伞顶 ─────────────────────────────
  const brass: THREE.BufferGeometry[] = [
    roundNormals(
      new THREE.SphereGeometry(0.055, 6, 4).translate(UMB.x, UMB.apex + 0.05, UMB.z),
      v3(UMB.x, UMB.apex + 0.05, UMB.z),
    ),
  ];
  for (const x of [-0.5, 0.5])
    brass.push(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 8).rotateX(Math.PI / 2).translate(x, 0.24, BODY.z + 0.1));
  for (const j of JARS) brass.push(box(0.05, 0.05, 0.08, j.x, TOP_Y + 0.07, JAR_R + 0.02));
  g.add(new THREE.Mesh(merge(brass), ctx.mat('brass', { lightUp: 0.3, noShadowReceive: true })));

  // ── 珊瑚：车厢上沿一道漆条、冷藏箱的盖 ───────────────────
  const coral: THREE.BufferGeometry[] = [
    box(BODY.x * 2 + 0.02, 0.09, 0.02, 0, BODY.y1 - 0.08, BODY.z + 0.005),
    boxOn(0.36, 0.06, 0.3, 0.43, TOP_Y + 0.26, 0.08),
  ];
  g.add(new THREE.Mesh(merge(coral), ctx.mat('fabricStripe', { bands: FACE, lightUp: LU, noShadowReceive: false })));

  // ── 白：一摞杯子、冷藏箱 ──────────────────────────────
  const white: THREE.BufferGeometry[] = [
    cyl(0.07, 0.055, 0.26, 8, -0.6, TOP_Y, 0.06),
    cyl(0.07, 0.055, 0.16, 8, -0.6, TOP_Y, -0.14),
    boxOn(0.34, 0.26, 0.28, 0.43, TOP_Y, 0.08),
  ];
  g.add(new THREE.Mesh(merge(white), ctx.mat('clothWhite', { bands: [-0.3, 0.45], noShadowReceive: true })));

  // ── 招牌（深蓝）+ 两个圆点（两种喝的）─────────────────────
  g.add(
    new THREE.Mesh(
      merge([box(0.62, 0.27, 0.03, -0.2, 0.6, BODY.z + 0.02)]),
      ctx.mat('signBoard', { lightUp: 0.55, bands: FACE, noShadowReceive: true }),
    ),
  );
  const dot = (x: number) =>
    new THREE.CylinderGeometry(0.075, 0.075, 0.03, 10).rotateX(Math.PI / 2).translate(x, 0.6, BODY.z + 0.04);
  g.add(
    new THREE.Mesh(merge([dot(-0.35)]), ctx.mat('flowerRed', { lightUp: 0.55, bands: FACE, noShadowReceive: true })),
  );
  g.add(
    new THREE.Mesh(merge([dot(-0.05)]), ctx.mat('flowerYellow', { lightUp: 0.55, bands: FACE, noShadowReceive: true })),
  );

  // ── 两只饮料桶：液体（按 setLevel 缩放）+ 上面的空玻璃 + 盖 ───
  const unit = jarLathe(JAR_R, 1, 8);
  const glassM = ctx.mat('jug', { convex: 0.8, noShadowReceive: true });
  const lids: THREE.BufferGeometry[] = [];
  const jars: { liquid: THREE.Mesh; glass: THREE.Mesh }[] = [];
  for (const j of JARS) {
    // 液体：单位高的车削体（底在 0），scale.y = 液面高；球面法线（桶心）→ 亮顶、中腰、暗底
    const lg = roundNormals(unit.clone(), v3(0, 0.45, 0));
    const liquid = new THREE.Mesh(
      lg,
      ctx.mat(j.key, { lightUp: 0.3, convex: 0.6, bands: [0.0, 0.5], noShadowReceive: true }),
    );
    liquid.position.set(j.x, TOP_Y, 0);
    const glass = new THREE.Mesh(roundNormals(unit.clone(), v3(0, 0.45, 0)), glassM);
    glass.position.set(j.x, TOP_Y, 0);
    g.add(liquid, glass);
    jars.push({ liquid, glass });
    lids.push(cyl(JAR_R * 0.82, JAR_R * 0.82, 0.04, 8, j.x, TOP_Y + JAR_H, 0));
    lids.push(cyl(0.03, 0.03, 0.04, 6, j.x, TOP_Y + JAR_H + 0.04, 0));
  }
  g.add(new THREE.Mesh(merge(lids), glassM));

  // ── 伞：两组布（奶油 / 珊瑚）+ 收起来时的一卷布 ─────────────
  const fab = {
    lightUp: 0.35,
    bands: [-0.6, 0.5] as [number, number],
    elem: {
      kind: 'paint' as const,
      space: 'local' as const,
      size: [9, 6] as [number, number],
      density: [0, 0] as [number, number],
    },
  };
  const cream = new THREE.Mesh(canopy(0), ctx.mat('fabric', fab));
  const stripe = new THREE.Mesh(canopy(1), ctx.mat('fabricStripe', fab));
  const furled = new THREE.Mesh(
    merge([cyl(0.07, 0.12, 0.9, 8, UMB.x, UMB.apex - 0.95, UMB.z)]),
    ctx.mat('fabricStripe', { lightUp: 0.3 }),
  );
  furled.visible = false;
  g.add(cream, stripe, furled);

  ctx.mats.prepare(g);
  // 伞布接收投影会把自己的伞骨影子打成碎块：不接收（palette 里 fabric 本来就是 THIN）
  cream.receiveShadow = false;
  stripe.receiveShadow = false;

  const level = { red: 0.8, yellow: 0.65 };
  const setLevel = (red: number, yellow: number) => {
    level.red = THREE.MathUtils.clamp(red, 0, 1);
    level.yellow = THREE.MathUtils.clamp(yellow, 0, 1);
    [level.red, level.yellow].forEach((lv, i) => {
      // 液面最低留 1 纹素（桶底一层）；液体 = 0..h，玻璃 = h..JAR_H
      const h = Math.max(0.03, lv * JAR_H * 0.92);
      const { liquid, glass } = jars[i];
      liquid.scale.y = h;
      glass.position.y = TOP_Y + h;
      glass.scale.y = JAR_H - h;
      // 玻璃那截的车削轮廓按整桶算：只取上半截 → 用 scale 的近似（肩收得少一点，看不出来）
    });
  };
  setLevel(level.red, level.yellow);
  const setOpen = (on: boolean) => {
    cream.visible = on;
    stripe.visible = on;
    furled.visible = !on;
  };

  g.userData.spots = { vendor: [-0.7, -0.85], buyer: [-0.25, 0.95], pole: [UMB.x, UMB.z] };
  g.userData.setLevel = setLevel;
  g.userData.setOpen = setOpen;
  g.userData.level = level;
  return g;
}
