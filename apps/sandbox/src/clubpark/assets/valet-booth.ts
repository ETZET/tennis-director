// 代客岗亭（停车场的主角）：土坯小亭子，平顶（一圈女儿墙 + 陶砖压顶，屋面低下去 = 一个"托盘"），
// 正面（朝南、朝镜头）一个宽窗口：窗后一块挂钥匙的木板、窗下一块小木台；窗上一条俱乐部帆布雨篷
// （奶油 + 俱乐部蓝条纹，扇形垂边跟着条纹换色）；女儿墙正中往上起两级，挂一块深蓝小牌（奶油色钥匙图标）；
// 窗东边一盏铸铁壁灯，屋面东头一根木排水槽（canale）。
//
// 太阳在后上方：朝镜头的墙、牌子落暗档；顶面（压顶、屋面）亮，北女儿墙在屋面上投一条影子、它的内壁是一条暗带。
// 雨篷、小木台、钥匙牌不接收投影（小道具）：在亭子自己的影子里也照常亮 → 暗墙上一条亮条纹 + 一条亮台面 = 窗口。
// 雨篷垂边朝镜头，用 lightUp + 低 bands 落中档（不是暗档）：扇形在暗窗前读得出来。
//
// userData（stage 3 的演出用；坐标都是本地的，用 obj.localToWorld 换世界坐标）：
//   anchors.window  人站在窗口前（窗外 0.55 米，地面）的位置；anchors.shelf  木台面中间（递钥匙、放东西）
//   anchors.keys[i] 第 i 把钥匙牌的位置（钥匙板上，0..KEYS-1，上排从西到东、再下排）
//   keys.count / keys.has(i) / keys.take(i) / keys.hang(i) / keys.set(n) / keys.free() / keys.any()
//     —— 钥匙板上的钥匙牌：take = 摘下（返回是否摘到），hang = 挂回，set(n) = 只挂前 n 把，
//        free() = 第一个空钩的号（没有 = −1），any() = 第一把挂着的钥匙的号（没有 = −1）
//   setLamp(on)   壁灯开/关（傍晚、夜里）
//   setOpen(open) 窗口开/关（关 = 一块木百叶盖住窗口，钥匙看不见；下班）
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';
import { box, cyl, merge, polyShape, ringShape, shapeAt, WallFaces, xf } from './valet/kit';

/** 主体（墙外皮） */
const W = 2.4;
const D = 2.2;
/** 屋面顶高；女儿墙顶高；女儿墙厚；压顶厚、出檐 */
const HD = 2.3;
const HP = 2.62;
const PT = 0.24;
const COP = { t: 0.07, out: 0.06 };
/** 窗洞（朝南墙上）：x、y 范围；洞深（钥匙板离墙面） */
const WIN = { x0: -1.0, x1: 0.45, y0: 0.85, y1: 1.6, rec: 0.14 };
/** 雨篷：贴墙高、伸出、前沿高、垂边高（含扇形）、扇形深、宽出窗洞两边多少、几条（奇数：两边是奶油） */
const AWN = { yWall: 2.47, out: 0.42, yFront: 2.3, val: 0.3, sc: 0.12, side: 0.1, n: 5 };
/** 钥匙牌：两排（牌顶的高）× 每排几个；牌的宽高 */
const KEY_ROWS = [1.44, 1.2];
const KEY_COLS = 5;
const TAG = { w: 0.13, h: 0.16 };
export const KEYS = KEY_ROWS.length * KEY_COLS;

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'valet-booth';
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    g.add(m);
    return m;
  };
  const x0 = -W / 2;
  const x1 = W / 2;
  const z0 = -D / 2;
  const z1 = D / 2;
  const zr = z1 - WIN.rec;
  const wx = (WIN.x0 + WIN.x1) / 2;

  // ── 墙 + 女儿墙（土坯，墙的元素坐标按米；外皮一直到女儿墙顶）──────
  const wf = new WallFaces(HP, HP);
  // 南墙（朝镜头）：窗洞四周四块
  wf.zFace(x0, WIN.x0, 0, HP, z1, 1, 0);
  wf.zFace(WIN.x1, x1, 0, HP, z1, 1, WIN.x1 - x0);
  wf.zFace(WIN.x0, WIN.x1, 0, WIN.y0, z1, 1, WIN.x0 - x0);
  wf.zFace(WIN.x0, WIN.x1, WIN.y1, HP, z1, 1, WIN.x0 - x0);
  // 窗洞的侧壁、窗台
  wf.xFace(zr, z1, WIN.y0, WIN.y1, WIN.x0, 1, 0);
  wf.xFace(zr, z1, WIN.y0, WIN.y1, WIN.x1, -1, 0);
  wf.yFace(WIN.x0, WIN.x1, zr, z1, WIN.y0);
  // 东、北、西墙
  wf.xFace(z0, z1, 0, HP, x1, 1, W);
  wf.zFace(x0, x1, 0, HP, z0, -1, W + D);
  wf.xFace(z0, z1, 0, HP, x0, -1, 2 * W + D);
  // 女儿墙内壁（北边那面朝镜头 = 屋面后沿一条暗带；其余三面看不见，补上免得转过去漏）
  const ix0 = x0 + PT;
  const ix1 = x1 - PT;
  const iz0 = z0 + PT;
  const iz1 = z1 - PT;
  wf.zFace(ix0, ix1, HD, HP, iz0, 1, 0);
  wf.zFace(ix0, ix1, HD, HP, iz1, -1, 0);
  wf.xFace(iz0, iz1, HD, HP, ix1, -1, 0);
  wf.xFace(iz0, iz1, HD, HP, ix0, 1, 0);
  const adobe = ctx.mat('adobe', { elem: EL.adobe });
  add(wf.geometry(), adobe, 'walls');

  // ── 屋面（灰泥，几块有机形状的深浅）─────────────────
  add(
    box(ix1 - ix0, 0.1, iz1 - iz0, 0, HD - 0.1, 0),
    ctx.mat('adobe', { elem: { kind: 'paint', size: [14, 9], density: [0, 0.05], patch: 2 }, edge: 0.15, convex: 0 }),
    'roof',
  );

  // ── 正中起两级的女儿墙（贴着南墙外皮），挂牌子 ─────────────
  const CW = [0.66, 0.36];
  const CH = [0.42, 0.18];
  const crown = new WallFaces(HP + CH[0] + CH[1], CH[0] + CH[1]);
  const cz0 = z1 - PT;
  let yb = HP;
  for (let k = 0; k < 2; k++) {
    const hw = CW[k];
    const yt = yb + CH[k];
    crown.zFace(-hw, hw, yb, yt, z1, 1, 0);
    crown.zFace(-hw, hw, yb, yt, cz0, -1, 0);
    crown.xFace(cz0, z1, yb, yt, hw, 1, 0);
    crown.xFace(cz0, z1, yb, yt, -hw, -1, 0);
    yb = yt;
  }
  add(crown.geometry(), adobe, 'crown');

  // ── 压顶（陶砖）：女儿墙一圈 + 两级的顶 ────────────────
  const co = COP.out;
  const cop = [
    box(W + co * 2, COP.t, PT + co * 2, 0, HP, z0 + PT / 2),
    box(W + co * 2, COP.t, PT + co * 2, 0, HP, z1 - PT / 2),
    box(PT + co * 2, COP.t, D - PT * 2, x0 + PT / 2, HP, 0),
    box(PT + co * 2, COP.t, D - PT * 2, x1 - PT / 2, HP, 0),
    box(CW[0] * 2 + co * 2, COP.t, PT + co * 2, 0, HP + CH[0], z1 - PT / 2),
    box(CW[1] * 2 + co * 2, COP.t, PT + co * 2, 0, HP + CH[0] + CH[1], z1 - PT / 2),
  ];
  add(merge(cop), ctx.mat('cap'), 'cap');

  // ── 牌子：深蓝底 + 奶油色钥匙图标（朝南，在两级女儿墙的下级上）──
  const plW = 0.96;
  const plH = 0.34;
  const plY = HP + 0.04;
  const zPl = z1 + 0.025;
  add(
    box(plW, plH, 0.05, 0, plY, zPl),
    ctx.mat('signBoard', { lightUp: 0.55, bands: [-0.7, 0.6], noShadowReceive: true }),
    'plaque',
  );
  const ky = plY + plH / 2;
  const zIcon = zPl + 0.026;
  const rect = (a: number, b: number, c: number, d: number) =>
    polyShape([
      [a, b],
      [c, b],
      [c, d],
      [a, d],
    ]);
  const key = [
    // 钥匙圈（西边）+ 钥匙杆 + 两个齿
    shapeAt(ringShape(0.12, 0.05), -0.24, ky, zIcon),
    shapeAt(rect(-0.13, -0.035, 0.32, 0.035), 0, ky, zIcon),
    shapeAt(rect(0.14, -0.12, 0.21, -0.03), 0, ky, zIcon),
    shapeAt(rect(0.25, -0.09, 0.32, -0.03), 0, ky, zIcon),
  ];
  const paint = ctx.mat('signPaint', { noShadowReceive: true, lightUp: 0.55, bands: [-0.7, 0.6] });
  add(merge(key), paint, 'plaque-key');

  // ── 窗：木框（暗）、钥匙板（更暗）、窗下小木台（亮）──────────
  const FR = 0.08;
  const frame = [
    box(FR, WIN.y1 - WIN.y0 + FR, 0.05, WIN.x0 - FR / 2 + 0.01, WIN.y0, z1 + 0.02),
    box(FR, WIN.y1 - WIN.y0 + FR, 0.05, WIN.x1 + FR / 2 - 0.01, WIN.y0, z1 + 0.02),
    box(WIN.x1 - WIN.x0 + FR * 2, FR, 0.05, wx, WIN.y1 - 0.01, z1 + 0.02),
  ];
  // 东头的木排水槽（canale）：从女儿墙根伸出来
  const canale = box(0.12, 0.1, 0.36, x1 - 0.32, HD - 0.02, z1 + 0.12);
  add(merge([...frame, canale]), ctx.mat('timber', { noShadowReceive: true }), 'frame');
  const shelfY = WIN.y0 + 0.02;
  const shelfD = WIN.rec + 0.3;
  const shelf = [
    box(WIN.x1 - WIN.x0 + 0.26, 0.07, shelfD, wx, shelfY, zr + shelfD / 2),
    box(0.07, 0.22, 0.2, WIN.x0 + 0.1, shelfY - 0.22, z1 + 0.1),
    box(0.07, 0.22, 0.2, WIN.x1 - 0.1, shelfY - 0.22, z1 + 0.1),
  ];
  add(
    merge(shelf),
    ctx.mat('timber', { noShadowReceive: true, elem: { kind: 'planks', p: [0, 0, 1, 0.11], seam: 1, hi: 1 } }),
    'shelf',
  );
  // 钥匙板（窗洞里，横板）：比外框暗 = 窗里的深色底，钥匙牌在上面跳出来
  add(
    box(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0, 0.04, wx, WIN.y0, zr - 0.02),
    ctx.mat('timber', { elem: { kind: 'planks', p: [0, 1, 0, 0.12], seam: 1, hi: 0 }, convex: 0 }),
    'keyboard',
  );
  // 钥匙牌（奶油金的小牌，几块染成红、蓝）：一个 InstancedMesh，摘下 = 缩成 0
  const tagGeo = box(TAG.w, TAG.h, 0.03, 0, -TAG.h, 0);
  const tags = new THREE.InstancedMesh(tagGeo, ctx.mat('signPaint', { noShadowReceive: true, lightUp: 0.4 }), KEYS);
  tags.name = 'keys';
  const keyPos: THREE.Vector3[] = [];
  const span = WIN.x1 - WIN.x0 - 0.3;
  for (let r = 0; r < KEY_ROWS.length; r++)
    for (let c = 0; c < KEY_COLS; c++) {
      const drop = ((c * 7 + r * 3) % 3) * 0.02;
      keyPos.push(
        new THREE.Vector3(WIN.x0 + 0.15 + (span * c) / (KEY_COLS - 1) + (r ? 0.07 : 0), KEY_ROWS[r] - drop, zr + 0.015),
      );
    }
  const tint = new THREE.Color();
  for (let i = 0; i < KEYS; i++) {
    tint.set(i === 2 || i === 8 ? 0xff9a88 : i === 6 ? 0x9cc4ff : 0xffffff);
    tags.setColorAt(i, tint);
  }
  const hung = keyPos.map(() => true);
  // 两个空钩：这两把钥匙在外面（车被代客开走了）
  hung[1] = false;
  hung[KEY_COLS + 3] = false;
  const mtx = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const syncTags = () => {
    for (let i = 0; i < KEYS; i++) tags.setMatrixAt(i, hung[i] ? mtx.makeTranslation(keyPos[i]) : zero);
    tags.instanceMatrix.needsUpdate = true;
  };
  syncTags();
  g.add(tags);

  // ── 雨篷：斜面 + 扇形垂边，奶油 / 俱乐部蓝条纹（条纹南北走，屏幕上是竖条）──
  const aw0 = WIN.x0 - FR - AWN.side;
  const aw1 = WIN.x1 + FR + AWN.side;
  const sw = (aw1 - aw0) / AWN.n;
  const slope = Math.atan2(AWN.yWall - AWN.yFront, AWN.out);
  const slopeLen = Math.hypot(AWN.out, AWN.yWall - AWN.yFront);
  const tops: [THREE.BufferGeometry[], THREE.BufferGeometry[]] = [[], []];
  const vals: [THREE.BufferGeometry[], THREE.BufferGeometry[]] = [[], []];
  for (let i = 0; i < AWN.n; i++) {
    const cx = aw0 + sw * (i + 0.5);
    const k = i % 2;
    tops[k].push(
      xf(new THREE.BoxGeometry(sw, 0.04, slopeLen), {
        rx: slope,
        x: cx,
        y: (AWN.yWall + AWN.yFront) / 2,
        z: z1 + AWN.out / 2,
      }),
    );
    // 垂边：朝南的一块，下沿一个扇形（半椭圆，深 sc）
    const hs = sw / 2;
    const straight = AWN.val - AWN.sc;
    const s = new THREE.Shape();
    s.moveTo(-hs, 0);
    s.lineTo(-hs, -straight);
    for (let j = 1; j <= 8; j++) {
      const a = Math.PI + (Math.PI * j) / 8;
      s.lineTo(Math.cos(a) * hs, -straight + Math.sin(a) * AWN.sc);
    }
    s.lineTo(hs, 0);
    s.closePath();
    const val = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
    vals[k].push(xf(val, { x: cx, y: AWN.yFront + 0.02, z: z1 + AWN.out - 0.01 }));
  }
  const canvasEl = {
    kind: 'paint' as const,
    size: [10, 6] as [number, number],
    density: [0, 0.03] as [number, number],
  };
  const topOpts = { lightUp: 0.35, elem: canvasEl };
  // 垂边：落中档（朝镜头的面 lightUp + 低 bands）
  const valOpts = { lightUp: 0.6, bands: [-0.9, 0.9] as [number, number] };
  add(merge(tops[0]), ctx.mat('canvas', topOpts), 'awning-cream');
  add(merge(tops[1]), ctx.mat('canvasStripe', topOpts), 'awning-blue');
  add(merge(vals[0]), ctx.mat('canvas', valOpts), 'valance-cream');
  add(merge(vals[1]), ctx.mat('canvasStripe', valOpts), 'valance-blue');

  // ── 铁件：雨篷两头的撑杆、壁灯的托架和灯帽 ───────────────
  const braces = [aw0 + 0.05, aw1 - 0.05].map((x) =>
    xf(new THREE.BoxGeometry(0.04, 0.04, Math.hypot(AWN.out, 0.45)), {
      rx: -Math.atan2(0.45, AWN.out),
      x,
      y: AWN.yFront - 0.2,
      z: z1 + AWN.out / 2,
    }),
  );
  const lx = x1 - 0.3;
  const ly = 1.5;
  const lamp = [
    box(0.05, 0.05, 0.16, lx, ly + 0.3, z1 + 0.08),
    box(0.2, 0.05, 0.2, lx, ly + 0.28, z1 + 0.16),
    box(0.16, 0.04, 0.16, lx, ly - 0.03, z1 + 0.16),
    cyl(0.03, 0.06, 6, lx, ly + 0.33, z1 + 0.16),
  ];
  add(merge([...braces, ...lamp]), ctx.mat('ironwork', { noShadowReceive: true }), 'iron');
  const glassOff = ctx.mat('glass', { noShadowReceive: true, lightUp: 0.5 });
  const glassOn = ctx.mats.toon(0xffffff, {
    ramp: [0xfff4c0, 0xffd27a, 0xe8a060],
    edge: 0.4,
    convex: 0.3,
    noShadowReceive: true,
    lightUp: 1,
    emissive: 0x3a2410,
  });
  const lampGlass = add(box(0.13, 0.27, 0.13, lx, ly + 0.01, z1 + 0.16), glassOff, 'lamp');

  // ── 木百叶（关窗时盖住窗口；平时藏起来）──────────────
  const shutter = add(
    box(WIN.x1 - WIN.x0 + 0.04, WIN.y1 - WIN.y0 + 0.04, 0.04, wx, WIN.y0 - 0.02, z1 + 0.035),
    ctx.mat('timber', { noShadowReceive: true, elem: { kind: 'planks', p: [1, 0, 0, 0.16], seam: 1, hi: 1 } }),
    'shutter',
  );
  shutter.visible = false;

  // ── 东墙上的门（yaw 0 下看不见；转过去时亭子不是个实心盒子）──
  add(
    box(0.05, 1.9, 0.78, x1 + 0.02, 0, -0.35),
    ctx.mat('timber', { elem: { kind: 'planks', p: [0, 0, 1, 0.13], seam: 1, hi: 1 } }),
    'door',
  );

  ctx.mats.prepare(g);
  // 太小的东西不投影（投到墙上就是噪点）
  for (const n of ['plaque-key', 'keys', 'lamp', 'iron', 'frame', 'valance-cream', 'valance-blue']) {
    const o = g.getObjectByName(n);
    if (o) o.castShadow = false;
  }

  g.userData.anchors = {
    window: new THREE.Vector3(wx, 0, z1 + 0.55),
    shelf: new THREE.Vector3(wx, shelfY + 0.07, z1 + 0.12),
    keys: keyPos.map((p) => p.clone().setY(p.y - TAG.h / 2)),
  };
  g.userData.keys = {
    count: KEYS,
    has: (i: number) => !!hung[i],
    take(i: number) {
      if (!hung[i]) return false;
      hung[i] = false;
      syncTags();
      return true;
    },
    hang(i: number) {
      if (i < 0 || i >= KEYS) return;
      hung[i] = true;
      syncTags();
    },
    set(n: number) {
      for (let i = 0; i < KEYS; i++) hung[i] = i < n;
      syncTags();
    },
    free: () => hung.indexOf(false),
    any: () => hung.indexOf(true),
  };
  g.userData.setLamp = (on: boolean) => {
    lampGlass.material = on ? glassOn : glassOff;
  };
  g.userData.setOpen = (open: boolean) => {
    shutter.visible = !open;
    tags.visible = open;
  };
  return g;
}
