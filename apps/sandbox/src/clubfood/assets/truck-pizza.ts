// #3 窑烤披萨车（餐车一排的东头）：番茄红车厢 + 奶油红白条纹篷，车尾（西头）平台上一座圆顶砖窑 + 一根高烟囱，烟一团团往东北飘。
// 尺寸：长 5.4（x，−2.7…2.7）× 深 2.4（z，−1.2…1.2）× 车顶 3.0，烟囱顶 4.3；车地板 y 0.85。朝南（服务窗朝镜头 +z），rotY 0。
// 从西到东：车尾平台 x −2.7…−1.0（砖窑 + 窑口朝南 + 烟囱）、车厢 x −1.0…2.0（服务窗 x −0.4…1.9，y 1.35…2.35）、
// 车头 x 2.0…2.7（斜挡风玻璃的短鼻子）。车厢前面西角立一块 A 字菜单牌（图标：整个披萨、一角披萨、瓶子）。
// userData（本地坐标，米）：
//   spots = { window: [lx, lz]（点餐客人站的地面点）, vendor: [lx, lz]（摊主在车里，站在 floor 上）, back: [lx, lz]（车北面卸货） }
//   floor = 0.85；sill = [lx, ly, lz]（窗台顶面中心）
//   setStock(k 0..1)：窗台上的披萨盒、披萨板上的披萨、窗里的一摞饼坯跟着少；k < 0.3 只剩一只盒子 + 一两张饼坯（默认 1）
//   setSmoke(k 0..1)：烟囱冒烟的量（0 不冒，默认 1）；update(dt, t) 推烟和窑火
// 遮阳篷只伸出 0.62、几乎水平：45° 俯视下篷沿刚好停在摊主胸口上面（伸 0.8 + 下斜时只看得到摊主的腰）。
// 画廊里看存货 / 烟：?asset=truck-pizza&warm=3&stock=0.2&smoke=0.4。
// 变体：只有 v0。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';
import type { Pal } from '../palette';

const FLOOR = 0.85;
const ROOF = 3.0;
const HZ = 1.2; // 半深
const BX0 = -1.0; // 车厢西墙
const BX1 = 2.0; // 车厢东墙（车头从这里往东）
const WALL = 0.1;
const WX0 = -0.4;
const WX1 = 1.9;
const WY0 = 1.35;
const WY1 = 2.35;
/** 砖窑：圆顶中心（x, z）、底座顶 y、半径 */
const OX = -1.86;
const OZ = 0;
const OY = 1.28;
const OR = 0.8;
/** 烟囱口 */
const CHX = OX + 0.12;
const CHZ = OZ - 0.36;
const CHTOP = 4.3;

/** 朝镜头的竖直面：留住中档（车身、篷的垂边、菜单牌…） */
const FACE: ToonOpts = { lightUp: 0.55, bands: [-0.45, 0.35], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'truck-pizza';

  // ── 按材质收几何体，最后每个材质合并成一个网格 ─────────────────
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const put = (id: string, key: keyof Pal, extra: ToonOpts | undefined, g: THREE.BufferGeometry) => {
    let b = buckets.get(id);
    if (!b) {
      b = { mat: ctx.mat(key, extra), geos: [] };
      buckets.set(id, b);
    }
    b.geos.push(g.index ? g.toNonIndexed() : g);
  };
  /** 盒子：x0..x1, y0..y1, z0..z1 */
  const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

  const bodyOpts: ToonOpts = { ...FACE, elem: { kind: 'paint', size: [22, 12], density: [0, 0.03] } };
  const body = (g: THREE.BufferGeometry) => put('body', 'accPizza', bodyOpts, g);
  const iron = (g: THREE.BufferGeometry) => put('iron', 'ironwork', FACE, g);

  // ── 底盘、轮子 ────────────────────────────────────────────
  iron(bx(-2.62, 2.0, 0.5, FLOOR - 0.12, -1.06, 1.06));
  // 车尾平台（窑坐在上面）
  put(
    'deck',
    'timber',
    { convex: 0.3, elem: { kind: 'planks', p: [1, 0, 0, 0.27], seam: 1, hi: 1 } },
    bx(-2.7, BX0, FLOOR - 0.1, FLOOR, -HZ, HZ),
  );
  // 平台东南角一小摞柴（端面朝南）
  for (const [x, y] of [
    [-1.33, 0],
    [-1.11, 0],
    [-1.22, 0.19],
  ] as const)
    put(
      'logs',
      'timber',
      { ...FACE, convex: 0.4 },
      new THREE.CylinderGeometry(0.11, 0.11, 0.5, 8).rotateX(Math.PI / 2).translate(x, FLOOR + 0.1 + y, 0.88),
    );
  const wheel = (x: number, z: number) => {
    const t = 0.26;
    put(
      'tyre',
      'tyre',
      FACE,
      new THREE.CylinderGeometry(0.4, 0.4, t, 14).rotateX(Math.PI / 2).translate(x, 0.4, z - Math.sign(z) * 0.02),
    );
    if (z > 0)
      put(
        'silver',
        'carSilver',
        undefined,
        new THREE.CylinderGeometry(0.17, 0.17, 0.04, 10)
          .rotateX(Math.PI / 2)
          .translate(x, 0.4, z - 0.02 + t / 2 + 0.02),
      );
  };
  for (const z of [-HZ + 0.13, HZ - 0.13]) {
    wheel(-1.85, z);
    wheel(2.2, z);
  }

  // ── 车厢：四面墙（南墙开服务窗）+ 车顶 ────────────────────────
  const zs0 = HZ - WALL;
  body(bx(BX0, BX1, FLOOR, WY0, zs0, HZ)); // 窗下
  body(bx(BX0, BX1, WY1, ROOF, zs0, HZ)); // 窗上
  body(bx(BX0, WX0, WY0, WY1, zs0, HZ)); // 窗左
  body(bx(WX1, BX1, WY0, WY1, zs0, HZ)); // 窗右（一纹素的窗框柱）
  body(bx(BX0, BX1, FLOOR, ROOF, -HZ, -HZ + WALL)); // 北墙
  body(bx(BX0, BX0 + WALL, FLOOR, ROOF, -HZ, HZ)); // 西墙
  body(bx(BX1 - WALL, BX1, FLOOR, ROOF, -HZ, HZ)); // 东墙
  // 奶油腰线（窗台下面一条，车头也接上）
  put('belt', 'clothWhite', FACE, bx(BX0, BX1, 0.98, 1.27, HZ, HZ + 0.015));
  put('belt', 'clothWhite', FACE, bx(BX1, 2.7, 0.98, 1.27, HZ - 0.06, HZ - 0.045));
  // 车顶（主色最亮的一块：朝天，不加 lightUp）
  put(
    'roof',
    'accPizza',
    { elem: { kind: 'paint', size: [22, 12], density: [0, 0.03] } },
    bx(BX0 - 0.05, BX1 + 0.05, ROOF, ROOF + 0.1, -HZ - 0.05, HZ + 0.05),
  );
  // 车顶一只抽风口（不锈钢）
  put('silver', 'carSilver', undefined, bx(0.0, 0.45, ROOF + 0.1, ROOF + 0.32, -0.75, -0.3));
  // 窗里：暗档主色的内衬（后墙内面、地板），不要黑
  const inner: ToonOpts = { bands: [2, 3], noShadowReceive: true };
  put('inner', 'accPizza', inner, bx(BX0 + WALL, BX1 - WALL, FLOOR, ROOF, -HZ + WALL, -HZ + WALL + 0.02));
  put('inner', 'accPizza', inner, bx(BX0 + WALL, BX1 - WALL, FLOOR, FLOOR + 0.02, -HZ + WALL, zs0));
  // 窗里的案台（饼坯放在上面）
  put('steel', 'carSilver', FACE, bx(-0.36, 0.42, FLOOR, 1.24, 0.66, zs0));

  // ── 车头（东头的短鼻子：侧面轮廓挤出）+ 玻璃 ─────────────────
  {
    const pts: [number, number][] = [
      [BX1, 0.5],
      [2.7, 0.5],
      [2.7, 1.46],
      [2.6, 1.58],
      [2.4, 1.62],
      [2.16, 2.62],
      [BX1, 2.66],
    ];
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const cz = HZ - 0.06;
    const g = new THREE.ExtrudeGeometry(sh, { depth: cz * 2, bevelEnabled: false }).translate(0, 0, -cz);
    body(g);
    // 挡风玻璃（斜面）
    const a = new THREE.Vector2(2.4, 1.62);
    const b = new THREE.Vector2(2.16, 2.62);
    const len = a.distanceTo(b);
    const ws = new THREE.BoxGeometry(0.02, len - 0.12, cz * 2 - 0.2)
      .rotateZ(Math.atan2(b.x - a.x, b.y - a.y) * -1)
      .translate((a.x + b.x) / 2 + 0.012, (a.y + b.y) / 2, 0);
    put('glass', 'glass', undefined, ws);
    // 车门窗（朝南）
    put('glassF', 'glass', FACE, bx(2.07, 2.5, 1.78, 2.42, cz, cz + 0.02));
  }

  // ── 服务窗：窗台（伸出 0.25）+ 遮阳篷（红白条纹）──────────────
  const SILL_Y = WY0;
  put('silver', 'carSilver', undefined, bx(WX0 - 0.04, WX1, SILL_Y - 0.06, SILL_Y, 0.96, HZ + 0.25));
  {
    const AW0 = -0.55;
    const AW1 = 2.05;
    const n = 9;
    const sw = (AW1 - AW0) / n;
    const dep = 0.62;
    const tilt = Math.atan2(0.03, dep);
    const yTop = ROOF - 0.04;
    for (let i = 0; i < n; i++) {
      const x0 = AW0 + i * sw;
      const red = i % 2 === 0;
      const top = new THREE.BoxGeometry(sw, 0.05, dep).rotateX(tilt).translate(x0 + sw / 2, yTop, HZ + dep / 2);
      put(red ? 'awnR' : 'awnC', red ? 'accPizza' : 'clothWhite', { noShadowReceive: true }, top);
      const fy = yTop - Math.sin(tilt) * (dep / 2) - 0.02;
      const val = bx(x0, x0 + sw, fy - 0.18, fy, HZ + dep - 0.02, HZ + dep + 0.02);
      put(red ? 'valR' : 'valC', red ? 'accPizza' : 'clothWhite', FACE, val);
    }
  }

  // ── 砖窑：灰泥底座 + 砖圆顶 + 朝南的拱形窑口 + 烟囱 ─────────────
  put(
    'plinth',
    'adobe',
    { ...FACE, convex: 0.2 },
    new THREE.CylinderGeometry(OR + 0.04, OR + 0.06, OY - FLOOR, 16).translate(OX, (OY + FLOOR) / 2, OZ),
  );
  // 圆顶和底座之间一圈浅色压顶（亮唇）
  put(
    'lip',
    'cap',
    { convex: 0.4 },
    new THREE.CylinderGeometry(OR + 0.08, OR + 0.08, 0.06, 16).translate(OX, OY - 0.03, OZ),
  );
  put(
    'brick',
    'tile',
    {
      sphereNormals: [OX, OY - 0.25, OZ],
      lightUp: 0.3,
      bands: [-0.2, 0.45],
      convex: 0.2,
      noShadowReceive: true,
      elem: { kind: 'stones', size: [6, 3], seam: 0.6, hi: 0.35 },
    },
    new THREE.SphereGeometry(OR, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.12, 1).translate(OX, OY, OZ),
  );
  // 窑口：拱形门洞挤出（外拱 0.8 宽、内洞 0.5 宽）
  const archZ1 = OZ + OR + 0.12;
  const archZ0 = archZ1 - 0.26;
  {
    const ow = 0.45;
    const iw = 0.3;
    const sh = new THREE.Shape();
    // 倒 U 形（门洞落地，看进去是窑膛不是门槛）
    sh.moveTo(-ow, 0);
    sh.lineTo(-iw, 0);
    sh.lineTo(-iw, 0.4);
    sh.absarc(0, 0.4, iw, Math.PI, 0, true);
    sh.lineTo(iw, 0);
    sh.lineTo(ow, 0);
    sh.lineTo(ow, 0.42);
    sh.absarc(0, 0.42, ow, 0, Math.PI, false);
    sh.lineTo(-ow, 0);
    const g = new THREE.ExtrudeGeometry(sh, {
      depth: archZ1 - archZ0,
      bevelEnabled: false,
      curveSegments: 6,
    }).translate(OX, OY, archZ0);
    put('arch', 'adobe', { ...FACE, convex: 0.2 }, g);
    // 窑膛（暗：铁色中档，不要黑）
    const hs = new THREE.Shape();
    hs.moveTo(-iw, 0);
    hs.lineTo(iw, 0);
    hs.lineTo(iw, 0.4);
    hs.absarc(0, 0.4, iw, 0, Math.PI, false);
    hs.lineTo(-iw, 0);
    put(
      'mouth',
      'ironwork',
      { bands: [-2, 2], noShadowReceive: true, edge: 0.2, convex: 0 },
      new THREE.ShapeGeometry(hs, 6).translate(OX, OY, archZ0 + 0.04),
    );
  }
  // 烟囱 + 一道箍到车厢西墙的拉杆
  put(
    'chim',
    'ironwork',
    FACE,
    new THREE.CylinderGeometry(0.17, 0.17, CHTOP - 0.18 - (OY + 0.6), 8).translate(
      CHX,
      (CHTOP - 0.18 + OY + 0.6) / 2,
      CHZ,
    ),
  );
  put('chim', 'ironwork', FACE, new THREE.CylinderGeometry(0.25, 0.22, 0.18, 8).translate(CHX, CHTOP - 0.09, CHZ));
  put('chim', 'ironwork', FACE, bx(CHX + 0.15, BX0, 2.84, 2.93, CHZ - 0.05, CHZ + 0.05));

  // ── A 字菜单牌（西角，图标不写字）─────────────────────────────
  const menu = new THREE.Group();
  menu.position.set(-2.72, 0, 1.66);
  menu.rotation.y = 0.22;
  {
    const tilt = 0.26;
    const front = new THREE.Group();
    front.rotation.x = -tilt;
    menu.add(front);
    const mg: Record<string, THREE.BufferGeometry[]> = { wood: [], board: [], bun: [], red: [], bottle: [] };
    const W = 0.74;
    const H = 1.02;
    mg.wood.push(bx(-W / 2, W / 2, 0, H, -0.03, 0.03));
    mg.board.push(bx(-W / 2 + 0.07, W / 2 - 0.07, 0.07, H - 0.07, 0.03, 0.045));
    // 整个披萨（上）
    mg.bun.push(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 14).rotateX(Math.PI / 2).translate(0, 0.72, 0.05));
    mg.red.push(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 14).rotateX(Math.PI / 2).translate(0, 0.72, 0.065));
    // 一角披萨（左下）：饼边 + 红色三角
    mg.bun.push(bx(-0.3, -0.04, 0.4, 0.47, 0.045, 0.065));
    const tri = new THREE.Shape([
      new THREE.Vector2(-0.29, 0.4),
      new THREE.Vector2(-0.05, 0.4),
      new THREE.Vector2(-0.17, 0.15),
    ]);
    mg.red.push(new THREE.ShapeGeometry(tri).translate(0, 0, 0.06));
    // 瓶子（右下）
    mg.bottle.push(bx(0.08, 0.27, 0.14, 0.38, 0.045, 0.065));
    mg.bottle.push(bx(0.13, 0.22, 0.38, 0.49, 0.045, 0.065));
    const keys: [string, keyof Pal][] = [
      ['wood', 'timber'],
      ['board', 'ironwork'],
      ['bun', 'bun'],
      ['red', 'accPizza'],
      ['bottle', 'accBurger'],
    ];
    for (const [k, pk] of keys) {
      const m = new THREE.Mesh(
        mergeGeometries(mg[k].map((g) => (g.index ? g.toNonIndexed() : g))),
        ctx.mat(pk, { ...FACE, convex: 0.2 }),
      );
      front.add(m);
    }
    // 后腿
    const back = new THREE.Mesh(
      bx(-W / 2, W / 2, 0, H - 0.04, -0.03, 0.03)
        .rotateX(tilt)
        .translate(0, 0, -0.04),
      ctx.mat('timber', FACE),
    );
    menu.add(back);
  }
  root.add(menu);

  // 合并
  for (const [, b] of buckets) {
    const m = new THREE.Mesh(mergeGeometries(b.geos), b.mat);
    root.add(m);
  }

  // ── 存货：窗台上的披萨盒、披萨板 + 披萨，窗里案台上一摞饼坯 ─────────
  const stock = new THREE.Group();
  root.add(stock);
  const BOXES = 3;
  const boxMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.44, 0.07, 0.42),
    ctx.mat('clothWhite', { noShadowReceive: true, convex: 0.3 }),
    BOXES,
  );
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < BOXES; i++) {
    mtx.makeTranslation(1.62 + (i === 1 ? 0.03 : 0), SILL_Y + 0.035 + i * 0.075, 1.24);
    boxMesh.setMatrixAt(i, mtx);
  }
  stock.add(boxMesh);
  const pizza = new THREE.Group();
  pizza.add(
    new THREE.Mesh(bx(0.3, 0.82, SILL_Y, SILL_Y + 0.03, 1.02, 1.44), ctx.mat('timber', { noShadowReceive: true })),
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.21, 0.05, 14).translate(0.56, SILL_Y + 0.055, 1.24),
      ctx.mat('bun', { noShadowReceive: true }),
    ),
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.05, 14).translate(0.56, SILL_Y + 0.065, 1.24),
      ctx.mat('accPizza', { noShadowReceive: true }),
    ),
  );
  stock.add(pizza);
  const DOUGH = 8;
  const dough = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.06, 12),
    ctx.mat('bun', { ...FACE, convex: 0.3 }),
    DOUGH,
  );
  for (let i = 0; i < DOUGH; i++) {
    const col = i < 5 ? 0 : 1;
    const h = col === 0 ? i : i - 5;
    mtx.makeTranslation(col === 0 ? -0.12 : 0.22, 1.24 + 0.03 + h * 0.065, 0.86);
    dough.setMatrixAt(i, mtx);
  }
  stock.add(dough);
  const setStock = (k: number) => {
    k = THREE.MathUtils.clamp(k, 0, 1);
    boxMesh.count = k <= 0 ? 0 : Math.max(1, Math.round(k * BOXES));
    pizza.children[1].visible = pizza.children[2].visible = k >= 0.3;
    dough.count = Math.round(k * DOUGH);
  };
  // 画廊里看：?stock=0.2&smoke=0.4
  setStock(Number(ctx.params.get('stock') ?? 1));

  // ── 窑火（一点暖色，闪）─────────────────────────────────────
  const fireOpts: ToonOpts = { bands: [-2, 2], noShadowReceive: true, edge: 0.1, convex: 0 };
  const flame = new THREE.Mesh(bx(-0.22, 0.22, 0, 0.16, -0.04, 0.04), ctx.mat('toolOrange', fireOpts));
  const core = new THREE.Mesh(bx(-0.09, 0.09, 0, 0.1, -0.03, 0.03), ctx.mat('flowerYellow', fireOpts));
  flame.position.set(OX, OY, archZ0 + 0.1);
  core.position.set(OX, OY, archZ0 + 0.16);
  root.add(flame, core);

  // ── 烟：2～3 团方块，往上飘、往东北歪、变大再缩没 ─────────────────
  const T = ctx.texel;
  const puffGeo = mergeGeometries([
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.BoxGeometry(0.6, 0.6, 0.6).translate(-0.42, 0.28, 0.1),
  ]);
  const smokeA = ctx.mat('smoke', { noShadowReceive: true, lightUp: 0.4, bands: [-0.5, 0.3], edge: 0.2, convex: 0 });
  const smokeB = ctx.mat('smoke', { noShadowReceive: true, bands: [-2, 2], edge: 0.2, convex: 0 });
  const PUFFS = 3;
  const PERIOD = 3.6;
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < PUFFS; i++) {
    const p = new THREE.Mesh(puffGeo, smokeA);
    puffs.push(p);
    root.add(p);
  }
  let smoke = THREE.MathUtils.clamp(Number(ctx.params.get('smoke') ?? 1), 0, 1);
  const setSmoke = (k: number) => {
    smoke = THREE.MathUtils.clamp(k, 0, 1);
  };
  const snap = (v: number) => Math.round(v / T) * T;
  const ss = (a: number, b: number, x: number) => {
    const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const update = (_dt: number, t: number) => {
    for (let i = 0; i < PUFFS; i++) {
      const p = puffs[i];
      const u = (t / PERIOD + i / PUFFS) % 1;
      // k 小时只冒前几团，团也小
      const on = smoke > 0 && i < Math.ceil(smoke * PUFFS);
      const size = (0.3 + 0.3 * ss(0, 0.5, u)) * (1 - ss(0.62, 1, u)) * (0.65 + 0.35 * smoke);
      const s = snap(size);
      p.visible = on && s >= T;
      if (!p.visible) continue;
      p.scale.setScalar(s);
      p.position.set(snap(CHX + 1.15 * u ** 1.4), snap(CHTOP + 0.15 + 1.8 * u), snap(CHZ - 0.55 * u));
      p.material = u > 0.6 ? smokeB : smokeA;
    }
    // 火苗：每 0.15 秒跳一下高度
    const step = Math.floor(t / 0.15);
    const h = 0.8 + 0.35 * (((step * 7919) % 5) / 4);
    flame.scale.y = h;
    core.scale.y = 1.3 - h * 0.4;
  };

  ctx.mats.prepare(root);
  // 烟不投影、不接影
  for (const p of puffs) {
    p.castShadow = false;
    p.receiveShadow = false;
  }
  flame.castShadow = core.castShadow = false;
  update(0, 0);

  root.userData = {
    spots: { window: [0.75, 2.0], vendor: [1.0, 0.75], back: [0.4, -1.7] },
    floor: FLOOR,
    sill: [0.75, SILL_Y, 1.32],
    setStock,
    setSmoke,
    update,
  };
  return root;
}
