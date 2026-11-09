// #2 塔可车（truck-taco）：方头高厢车（step van），日落橙。主角那一排的中间，世界 (−31.4, −39.6)，朝南（服务窗朝镜头 +z），rotY 0。
// 尺寸：长 5.8（x −2.9…2.9）× 深 2.4（z −1.2…1.2）× 车顶 3.2；车地板 y 0.85。驾驶室在东头（x 1.5…2.9，车顶 2.8，前挡风斜着 →
// 俯视看得到一条映天的玻璃），车厢 x −2.9…1.5（车顶 3.2，平顶）。剪影：高平顶 + 低一截的方头 + 宽窗 + 条纹篷 + 篷下一串剪纸彩旗。
// 服务窗 x −2.0…1.0、下沿 1.35、上沿 2.35；不锈钢窗台伸出 0.27；篷挂在车顶线的卷篷盒上（铰 y 3.1）、伸出 0.54、往下 0.06 + 0.17 垂边
// （篷再长就把窗里的人盖掉：篷沿屏幕高 y − z 要 ≥ 窗上沿的 2.35 − 1.2）。窗里的暗洞 = 暗档主色（不用黑）。
// 总监能走进去：北墙 x −2.5…−1.6 开后门（门洞到 2.1，门扇开着贴在墙外东边），门外两级铁台阶；车里过道什么都不放，
// 厨具（铁板 + 油烟罩、冰柜、柜子 + 架子）贴北墙（z < −0.6），窗下台面在 z > 0.85。
// 三角形 1206、33 个网格（彩旗 6 面各一个，要各自摆）。变体：只有 v0。
//
// userData（本地坐标，米；stage 3 用）：
//   spots = { window: [0.1, 2.0], vendor: [0.2, 0.75], helper: [-1.2, 0.75], back: [-2.05, -1.95] }
//     window = 点餐客人站的地面点；vendor / helper = 窗里两个人站的点（y = floor）；back = 后门台阶下的地面点
//   floor = 0.85；sill = [-0.5, 1.35, 1.275]（窗台顶面中心）；door = { x0: -2.5, x1: -1.6 }（门洞，到 2.1 高）
//   aisle = { x0: -2.6, x1: 1.2, z0: -0.6, z1: 0.8 }（车里能走的过道，y = floor）
//   steps = { x0: -2.5, x1: -1.6, z0: -1.75, z1: -1.2 }（两级：踏面顶 0.28、0.57，再上就是车地板 0.85）
//   setStock(k 0..1)：窗台上一排 6 只食材盒（莎莎、香菜、洋葱、奶酪…）按 floor(k·6) 只剩几只，从东往西空；k < 0.3 只剩 1 只。默认 1
//   setRush(on)：高峰时篷上竖起一块斜着朝镜头的小牌（人形 + 时钟的图标），默认关
// 画廊调试：&taco=back（转 180° 看后门和台阶）、&taco=open（拿掉车顶和篷看车里）、&stock=0.2、&rush=1。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';
import type { Pal } from '../palette';

const FLOOR = 0.85;
/** 车身裙边的下沿（轮子上半截藏在后面） */
const Y0 = 0.62;
/** 车厢墙顶（车顶板 3.1…3.2） */
const WALL_TOP = 3.1;
const ROOF = 3.2;
const X0 = -2.9;
/** 车厢 / 驾驶室分界 */
const XC = 1.5;
const XF = 2.88;
const ZS = 1.2;
const T = 0.12;
const WIN = { x0: -2.0, x1: 1.0, y0: 1.35, y1: 2.35 };
const DOOR = { x0: -2.5, x1: -1.6, y1: 2.1 };
/** 篷：铰在卷篷盒前 (y 3.1, z 1.3)，前沿 (y 3.04, z 1.74)，垂边 0.17 → 篷沿 y − z = 1.13（窗上沿 1.15） */
const AWN = { x0: -2.3, x1: 1.3, yHinge: 3.1, zHinge: 1.3, yFront: 3.04, zFront: 1.74, drop: 0.17, stripe: 0.36 };

/** 盒子（按边界） */
const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

/** 朝 +z 的平面图形（菜单图标、彩旗），z 处 */
const flat = (pts: [number, number][], z: number) =>
  new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))).translate(0, 0, z);

/** 合并成一个网格（全部转成非索引，盒子、圆柱、挤出体能混着合） */
function merged(list: THREE.BufferGeometry[], m: THREE.Material): THREE.Mesh {
  const geo = mergeGeometries(
    list.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(n.attributes))
        if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
      return n;
    }),
  );
  return new THREE.Mesh(geo, m);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'truck-taco';
  const g = new THREE.Group();
  root.add(g);

  /** 朝镜头的竖直面（车身侧面、垂边、牌子、彩旗）：lightUp + 低 bands 留住中档，不接投影 */
  const UP: ToonOpts = { lightUp: 0.55, bands: [-0.45, 0.35], noShadowReceive: true };
  /** 永远暗档（窗里的暗洞：车地板、台面、厨具） */
  const DARK: ToonOpts = { bands: [1.5, 2], noShadowReceive: true };
  const mat = (k: keyof Pal, o?: ToonOpts) => ctx.mat(k, o);
  const mBody = mat('accTaco', { ...UP, elem: { kind: 'paint', size: [20, 14], density: [0, 0.03] } });
  const mRoof = mat('accTaco', { elem: { kind: 'paint', size: [22, 14], density: [0, 0.03] } });
  const mInside = mat('accTaco', DARK);
  const mSteel = mat('carSilver', { noShadowReceive: true });
  const mSteelUp = mat('carSilver', UP);
  const mCloth = mat('clothWhite');
  const mClothUp = mat('clothWhite', UP);
  const mGlass = mat('glass', { lightUp: 0.6, bands: [-0.45, 0.35], noShadowReceive: true });
  const mTyre = mat('tyre', UP);
  const mIron = mat('ironwork', { noShadowReceive: true });
  const mIronUp = mat('ironwork', UP);

  const add = (m: THREE.Mesh, name: string, parent: THREE.Object3D = g) => {
    m.name = name;
    parent.add(m);
    return m;
  };

  // ── 车身（车厢四面墙 + 驾驶室，主色中档）─────────────────────
  const body: THREE.BufferGeometry[] = [
    // 北墙（背面）：后门洞 x −2.5…−1.6、车地板到 2.1
    bx(X0, DOOR.x0, Y0, WALL_TOP, -ZS, -ZS + T),
    bx(DOOR.x1, XC, Y0, WALL_TOP, -ZS, -ZS + T),
    bx(DOOR.x0, DOOR.x1, Y0, FLOOR, -ZS, -ZS + T),
    bx(DOOR.x0, DOOR.x1, DOOR.y1, WALL_TOP, -ZS, -ZS + T),
    // 西墙（车尾）、东隔墙（和驾驶室之间）
    bx(X0, X0 + T, Y0, WALL_TOP, -ZS + T, ZS - T),
    bx(XC - T, XC, Y0, WALL_TOP, -ZS + T, ZS - T),
    // 南墙（朝镜头）：窗下、窗上、窗左、窗右
    bx(X0, XC, Y0, WIN.y0, ZS - T, ZS),
    bx(X0, XC, WIN.y1, WALL_TOP, ZS - T, ZS),
    bx(X0, WIN.x0, WIN.y0, WIN.y1, ZS - T, ZS),
    bx(WIN.x1, XC, WIN.y0, WIN.y1, ZS - T, ZS),
  ];
  // 驾驶室：方头，车顶 2.8；前挡风往后斜（x 2.88 → 2.48），俯视看得到一条玻璃
  const cabShape = new THREE.Shape(
    [
      [XC, Y0],
      [XF, Y0],
      [XF, 1.7],
      [2.48, 2.8],
      [XC, 2.8],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
  );
  body.push(
    new THREE.ExtrudeGeometry(cabShape, { depth: 2 * ZS, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -ZS),
  );
  // 后门扇：开着，贴在北墙外（铰在 x −1.6，扇往东）
  body.push(bx(DOOR.x1 + 0.02, DOOR.x1 + 0.9, FLOOR, DOOR.y1, -ZS - 0.06, -ZS - 0.01));
  add(merged(body, mBody), 'body');

  // 车顶、驾驶室顶（亮档：画面正中最亮的橙）
  const roofTop = [
    new THREE.PlaneGeometry(XC - X0 + 0.1, 2 * ZS + 0.1)
      .rotateX(-Math.PI / 2)
      .translate((X0 + XC) / 2, ROOF + 0.002, 0),
  ];
  const roofMesh = add(merged(roofTop, mRoof), 'roof');
  // 车顶板（侧面中档）
  const roofSlab = add(merged([bx(X0 - 0.05, XC + 0.05, WALL_TOP, ROOF, -ZS - 0.05, ZS + 0.05)], mBody), 'roof-slab');

  // 车顶上的油烟罩出口 + 空调（不锈钢，影子落在车顶上）+ 卷篷的盒子（把篷和车顶分开一条灰）
  const roofKit = add(
    merged(
      [
        bx(-0.4, -0.05, ROOF, ROOF + 0.3, -0.85, -0.5),
        bx(0.5, 1.16, ROOF, ROOF + 0.27, -0.6, 0.0),
        bx(AWN.x0 - 0.06, AWN.x1 + 0.06, 3.04, ROOF, ZS, AWN.zHinge + 0.02),
      ],
      mSteelUp,
    ),
    'roof-kit',
  );

  // ── 窗里（暗档主色的洞）：车地板、窗下台面、贴北墙的厨具 ─────────────
  add(
    merged(
      [
        bx(X0 + T, XC - T, FLOOR - 0.1, FLOOR, -ZS + T, ZS - T), // 车地板
        bx(-1.5, -0.8, FLOOR, 1.6, -ZS + T, -0.62), // 柜子
        bx(-1.5, -0.8, 2.15, 2.25, -ZS + T, -0.75), // 架子
        bx(-0.75, 0.5, 2.55, WALL_TOP, -ZS + T, -0.65), // 油烟罩
        bx(WIN.x0, WIN.x1, FLOOR, 1.29, 0.86, ZS - T), // 窗下台面
        bx(-0.7, 0.45, FLOOR, 1.0, -ZS + T, -0.62), // 铁板（台子 + 板面）
        bx(-0.7, 0.45, 1.0, 1.05, -ZS + T, -0.62),
        bx(0.6, 1.36, FLOOR, 2.3, -ZS + T, -0.62), // 冰柜
      ],
      mInside,
    ),
    'inside',
  );

  // ── 不锈钢：窗台（伸出 0.27）、前保险杠、后视镜、轮毂、台阶踏板 ─────────────
  const steel: THREE.BufferGeometry[] = [
    bx(WIN.x0 - 0.1, WIN.x1 + 0.1, WIN.y0 - 0.06, WIN.y0, ZS - T, ZS + 0.27),
    bx(XF - 0.08, XF + 0.04, 0.38, 0.64, -ZS + 0.02, ZS - 0.02),
    bx(2.6, 2.84, 1.85, 2.3, ZS + 0.12, ZS + 0.24),
    // 后门台阶的两块踏板（顶 0.28、0.57）
    bx(DOOR.x0, DOOR.x1, 0.22, 0.28, -1.75, -1.48),
    bx(DOOR.x0, DOOR.x1, 0.51, 0.57, -1.48, -1.2),
  ];
  for (const x of [-1.85, 2.15]) {
    for (const s of [-1, 1]) {
      steel.push(
        new THREE.CylinderGeometry(0.18, 0.18, 0.04, 10).rotateX(Math.PI / 2).translate(x, 0.42, s * (ZS + 0.005)),
      );
    }
  }
  add(merged(steel, mSteel), 'steel');

  // 轮子（炭灰，朝镜头的面留中档）
  const tyres: THREE.BufferGeometry[] = [];
  for (const x of [-1.85, 2.15])
    for (const s of [-1, 1])
      tyres.push(
        new THREE.CylinderGeometry(0.42, 0.42, 0.24, 14).rotateX(Math.PI / 2).translate(x, 0.42, s * (ZS - 0.12)),
      );
  add(merged(tyres, mTyre), 'tyres');

  // 底盘、车尾保险杠、后视镜的支架、后门外两级铁台阶（地面 0 → 0.28 → 0.57 → 车地板 0.85）
  add(
    merged(
      [
        bx(-2.6, 2.6, 0.3, Y0, -0.95, 0.95),
        bx(X0 - 0.06, X0 + 0.05, 0.36, Y0, -1.1, 1.1),
        bx(2.68, 2.77, 2.04, 2.13, ZS, ZS + 0.12),
        bx(DOOR.x0, DOOR.x1, 0, 0.22, -1.75, -1.2),
        bx(DOOR.x0, DOOR.x1, 0.22, 0.51, -1.48, -1.2),
      ],
      mIron,
    ),
    'chassis',
  );

  // ── 玻璃：前挡风（斜面，映天）、驾驶室侧窗、后门上的小窗 ─────────────
  const ws = (() => {
    // 斜面上 (x 2.88, y 1.7) → (2.48, 2.8) 往里收 0.08 / 0.12 的边框
    const a = new THREE.Vector3(XF - 0.37 * 0.09, 1.7 + 0.09, 0);
    const b = new THREE.Vector3(2.48 + 0.37 * 0.07, 2.8 - 0.07, 0);
    const n = new THREE.Vector3(1.1, 0.4, 0).normalize().multiplyScalar(0.01);
    const z0 = -ZS + 0.14;
    const z1 = ZS - 0.14;
    const p = [a.x, a.y, z0, a.x, a.y, z1, b.x, b.y, z1, b.x, b.y, z0].map((v, i) =>
      i % 3 === 0 ? v + n.x : i % 3 === 1 ? v + n.y : v,
    );
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    geo.computeVertexNormals();
    return geo;
  })();
  add(
    merged(
      [
        ws,
        flat(
          [
            [1.66, 1.82],
            [2.62, 1.82],
            [2.42, 2.6],
            [1.66, 2.6],
          ],
          ZS + 0.005,
        ),
        flat(
          [
            [-1.42, 1.5],
            [-0.98, 1.5],
            [-0.98, 1.92],
            [-1.42, 1.92],
          ],
          0,
        )
          .rotateY(Math.PI)
          .translate(-2.4, 0, -ZS - 0.065),
      ],
      mGlass,
    ),
    'glass',
  );

  // ── 遮阳篷：主色 / 奶油相间的条纹（顶面亮档），前沿 0.18 垂边 ─────────
  const awnTilt = Math.atan2(AWN.yHinge - AWN.yFront, AWN.zFront - AWN.zHinge);
  const awnLen = Math.hypot(AWN.yHinge - AWN.yFront, AWN.zFront - AWN.zHinge);
  const awnOr: THREE.BufferGeometry[] = [];
  const awnWh: THREE.BufferGeometry[] = [];
  const valOr: THREE.BufferGeometry[] = [];
  const valWh: THREE.BufferGeometry[] = [];
  const nStripe = Math.round((AWN.x1 - AWN.x0) / AWN.stripe);
  for (let i = 0; i < nStripe; i++) {
    const x = AWN.x0 + (i + 0.5) * AWN.stripe;
    const top = new THREE.BoxGeometry(AWN.stripe, 0.05, awnLen)
      .rotateX(awnTilt)
      .translate(x, (AWN.yHinge + AWN.yFront) / 2, (AWN.zHinge + AWN.zFront) / 2);
    const val = bx(
      x - AWN.stripe / 2,
      x + AWN.stripe / 2,
      AWN.yFront - AWN.drop,
      AWN.yFront,
      AWN.zFront,
      AWN.zFront + 0.04,
    );
    (i % 2 ? awnWh : awnOr).push(top);
    (i % 2 ? valWh : valOr).push(val);
  }
  const awning = new THREE.Group();
  awning.name = 'awning';
  g.add(awning);
  add(merged(awnOr, mRoof), 'awning-orange', awning);
  add(merged(awnWh, mCloth), 'awning-cream', awning);
  add(merged(valOr, mBody), 'valance-orange', awning);
  add(merged(valWh, mClothUp), 'valance-cream', awning);

  // ── 剪纸彩旗（papel picado）：篷沿下一串 6 面，黄 / 红 / 薄荷 / 白轮换，轻轻随风摆 ─────
  const FLAG_W = 0.36;
  const FLAG_H = 0.32;
  const flagGeo = flat(
    [
      [-FLAG_W / 2, 0],
      [FLAG_W / 2, 0],
      [FLAG_W / 2, -FLAG_H],
      [0, -FLAG_H + 0.1],
      [-FLAG_W / 2, -FLAG_H],
    ],
    0,
  );
  // 摆的时候法线跟着转：档位固定在亮档（不然一摆就在两档之间闪；中档的黄会读成橙，和车身混）
  const flagSide: ToonOpts = { side: THREE.DoubleSide, bands: [-3, -2], noShadowReceive: true };
  const flagMats = [
    mat('flowerYellow', flagSide),
    mat('flowerRed', flagSide),
    mat('accCoffee', flagSide),
    mat('clothWhite', flagSide),
  ];
  const flags: THREE.Mesh[] = [];
  const rnd = ctx.rng('truck-taco:flags');
  for (let i = 0; i < 6; i++) {
    // 间隔 0.6：窗里两个人（x 0.2、−1.2）正好在两面旗之间的空当里
    const f = new THREE.Mesh(flagGeo, flagMats[i % 4]);
    f.position.set(-2.0 + i * 0.6, AWN.yFront - AWN.drop, AWN.zFront + 0.07);
    f.userData.phase = rnd() * Math.PI * 2;
    f.userData.rate = 1.6 + rnd() * 0.8;
    f.name = `flag-${i}`;
    awning.add(f);
    flags.push(f);
  }

  // ── 菜单牌（窗西边的墙上，深色板 + 三个图标：塔可、玉米片、瓶子；不写字）─────────
  const menu = new THREE.Group();
  menu.name = 'menu';
  g.add(menu);
  add(merged([bx(-2.8, -2.1, 1.02, 2.3, ZS, ZS + 0.04)], mIronUp), 'menu-board', menu);
  const zi = ZS + 0.045;
  const shell: [number, number][] = [];
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI + (k / 8) * Math.PI;
    shell.push([-2.45 + Math.cos(a) * 0.26, 2.14 + Math.sin(a) * 0.26]);
  }
  add(merged([flat(shell, zi)], mat('bun', UP)), 'icon-taco', menu);
  add(
    merged(
      [
        flat(
          [
            [-2.68, 2.14],
            [-2.22, 2.14],
            [-2.26, 2.25],
            [-2.64, 2.25],
          ],
          zi,
        ),
      ],
      mat('accCompost', UP),
    ),
    'icon-taco-fill',
    menu,
  );
  add(
    merged(
      [
        flat(
          [
            [-2.7, 1.5],
            [-2.2, 1.5],
            [-2.45, 1.8],
          ],
          zi,
        ),
      ],
      mat('flowerYellow', UP),
    ),
    'icon-chips',
    menu,
  );
  add(
    merged(
      [
        flat(
          [
            [-2.585, 1.08],
            [-2.315, 1.08],
            [-2.315, 1.3],
            [-2.405, 1.36],
            [-2.405, 1.44],
            [-2.495, 1.44],
            [-2.495, 1.36],
            [-2.585, 1.3],
          ],
          zi,
        ),
      ],
      mat('accCoffee', UP),
    ),
    'icon-bottle',
    menu,
  );

  // ── 窗台上的食材盒（存货）：6 只，按槽位顺序合并，setStock 用 drawRange 只画前 n 只 ─────────
  const N_STOCK = 6;
  const stockX = (i: number) => -1.85 + i * 0.3;
  const tubY = WIN.y0;
  const tubGeo: THREE.BufferGeometry[] = [];
  for (let i = 0; i < N_STOCK; i++)
    tubGeo.push(bx(stockX(i) - 0.135, stockX(i) + 0.135, tubY, tubY + 0.13, 1.13, 1.37));
  const tubs = add(merged(tubGeo, mSteelUp), 'stock-tubs');
  const tubVerts = tubs.geometry.attributes.position.count / N_STOCK;
  const fillKeys: (keyof Pal)[] = ['flowerRed', 'accCompost', 'clothWhite', 'flowerYellow', 'flowerRed', 'accCompost'];
  const fills: { mesh: THREE.Mesh; slots: number[]; per: number }[] = [];
  for (const key of new Set(fillKeys)) {
    const slots = fillKeys.map((k, i) => (k === key ? i : -1)).filter((i) => i >= 0);
    const geos = slots.map((i) =>
      new THREE.PlaneGeometry(0.2, 0.18).rotateX(-Math.PI / 2).translate(stockX(i), tubY + 0.135, 1.25),
    );
    const mesh = add(merged(geos, mat(key, { noShadowReceive: true })), `stock-${String(key)}`);
    fills.push({ mesh, slots, per: mesh.geometry.attributes.position.count / slots.length });
  }
  const setStock = (k: number) => {
    const n = Math.max(0, Math.min(N_STOCK, Math.floor(Math.max(0, Math.min(1, k)) * N_STOCK + 1e-6)));
    tubs.geometry.setDrawRange(0, n * tubVerts);
    tubs.visible = n > 0;
    for (const f of fills) {
      const c = f.slots.filter((i) => i < n).length;
      f.mesh.geometry.setDrawRange(0, c * f.per);
      f.mesh.visible = c > 0;
    }
  };

  // ── 高峰牌：篷上竖起一块斜 45°（正对镜头）的小牌，人形 + 时钟 ─────────
  const rush = new THREE.Group();
  rush.name = 'rush';
  rush.position.set(-0.45, AWN.yFront + 0.03, AWN.zFront - 0.08);
  rush.rotation.x = -Math.PI / 4;
  awning.add(rush);
  const RW = 0.8;
  const RH = 0.56;
  add(merged([bx(-RW / 2, RW / 2, 0, RH, -0.04, 0)], mClothUp), 'rush-board', rush);
  // 人形：头 2×2 纹素 + 肩膀一块
  add(
    merged(
      [
        flat(
          [
            [-0.3, 0.33],
            [-0.12, 0.33],
            [-0.12, 0.5],
            [-0.3, 0.5],
          ],
          0.005,
        ),
        flat(
          [
            [-0.36, 0.07],
            [-0.06, 0.07],
            [-0.06, 0.2],
            [-0.12, 0.28],
            [-0.3, 0.28],
            [-0.36, 0.2],
          ],
          0.005,
        ),
      ],
      mIronUp,
    ),
    'rush-person',
    rush,
  );
  const clock: [number, number][] = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    clock.push([0.17 + Math.cos(a) * 0.19, 0.28 + Math.sin(a) * 0.19]);
  }
  add(merged([flat(clock, 0.005)], mat('flowerRed', UP)), 'rush-clock', rush);
  add(
    merged(
      [
        flat(
          [
            [0.13, 0.26],
            [0.21, 0.26],
            [0.21, 0.42],
            [0.13, 0.42],
          ],
          0.01,
        ),
        flat(
          [
            [0.13, 0.26],
            [0.3, 0.26],
            [0.3, 0.33],
            [0.13, 0.33],
          ],
          0.01,
        ),
      ],
      mClothUp,
    ),
    'rush-hands',
    rush,
  );
  rush.visible = false;
  const setRush = (on: boolean) => {
    rush.visible = on;
  };

  // ── 画廊调试 ─────────
  const dbg = ctx.params.get('taco');
  if (dbg === 'back') g.rotation.y = Math.PI;
  if (dbg === 'open') {
    for (const o of [roofMesh, roofSlab, roofKit, awning]) o.visible = false;
  }

  ctx.mats.prepare(root);
  for (const f of flags) f.castShadow = false;

  setStock(ctx.params.has('stock') ? Number(ctx.params.get('stock')) : 1);
  setRush(ctx.params.get('rush') === '1');

  const u = ctx.uniforms;
  Object.assign(root.userData, {
    spots: { window: [0.1, 2.0], vendor: [0.2, 0.75], helper: [-1.2, 0.75], back: [-2.05, -1.95] },
    floor: FLOOR,
    sill: [(WIN.x0 + WIN.x1) / 2, WIN.y0, (ZS - T + ZS + 0.27) / 2],
    door: { x0: DOOR.x0, x1: DOOR.x1 },
    aisle: { x0: -2.6, x1: 1.2, z0: -0.6, z1: 0.8 },
    steps: { x0: DOOR.x0, x1: DOOR.x1, z0: -1.75, z1: -1.2 },
    setStock,
    setRush,
    update: (_dt: number, t: number) => {
      const w = Math.min(1, u.uWind.value.length() + 0.3);
      const amp = (0.1 + 0.22 * u.uGust.value) * w;
      for (const f of flags) f.rotation.x = Math.sin(t * f.userData.rate + f.userData.phase) * amp - amp * 0.4;
    },
  });
  return root;
}
