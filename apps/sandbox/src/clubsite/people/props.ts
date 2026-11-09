// 人物自己带的小道具：匹克球拍（paddle）、纸杯（cup）。挂在右手的拳头上，约定同 rig 的球拍：
// 原点 = 拳头（握把），本地 −y 顺着手臂往外（拍头那头），+z = 拍面朝外的那面。
// 还有几样"代用工具"（standIn）：工具代理的正式资产到之前，画廊和白模演出用它们试姿势；每个都带 userData.grip（见 hold.ts）。
import * as THREE from 'three';
import { blobNormals, type Mats, type ToonOpts } from '../../clubfront/toon';

type Mat = THREE.Material;
type Ramp = [number, number, number];

/** 人物模块要的 ctx（各场景的 AssetCtx 都满足：调色板是 desert3d-v2 那张表的超集） */
export interface PeopleCtx {
  mats: Mats;
  pal: object;
  // biome-ignore lint/suspicious/noExplicitAny: 各场景的调色板键不一样，这里按名字查
  mat(key: any, extra?: ToonOpts): THREE.MeshToonMaterial;
  params: URLSearchParams;
  variant: number;
}

/** 人物的明暗（同 desert3d-v2 的 PERSON）：光往上偏 → 头顶、肩亮，朝镜头的脸和胸落中档 */
export const PERSON: ToonOpts = { lightUp: 0.6, bands: [-0.45, 0.3], noShadowReceive: true, edge: 0.45 };

/**
 * 按调色板名字拿材质；这个场景的表里没有这个名字就用 fallback 三档（本地颜色，见报告"新颜色"）。
 */
export function matOr(ctx: PeopleCtx, key: string, fallback: Ramp, extra: ToonOpts = PERSON): THREE.MeshToonMaterial {
  if (key in ctx.pal) return ctx.mat(key, extra);
  return ctx.mats.toon(0xffffff, { ...extra, ramp: fallback });
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function part(geo: THREE.BufferGeometry, mat: Mat, at: THREE.Vector3, center?: THREE.Vector3): THREE.Mesh {
  geo.translate(at.x, at.y, at.z);
  blobNormals(geo, center ?? at.clone());
  return new THREE.Mesh(geo, mat);
}

// ── 匹克球拍 ──────────────────────────────────────

/** 珊瑚粉拍面（= clubpickle 调色板的 paddle 三档；别的场景没有这个键时用它） */
export const PADDLE_RAMP: Ramp = [0xff6a7a, 0xd4446a, 0x6a2a62];
/** 球员变体 → 拍面颜色（clubpickle.md：paddle / flowerYellow / counter / toolOrange） */
export const PADDLE_KEYS = ['paddle', 'flowerYellow', 'counter', 'toolOrange'] as const;
const PADDLE_FALLBACK: Record<string, Ramp> = {
  paddle: PADDLE_RAMP,
  flowerYellow: [0xffd84a, 0xe0a03a, 0x8a5a52],
  counter: [0x4a9ae0, 0x2e64b4, 0x2a3a78],
  toolOrange: [0xff9a30, 0xd8603a, 0x7a3456],
};

/** 拍面中心离拳头（本地 −y） */
export const PADDLE_FACE_Y = -0.36;

/**
 * 匹克球拍：实心的圆角矩形拍面（不画网线，和网球拍一眼分开）+ 短柄。
 * 拍面 0.3 × 0.36 米（≈ 3 × 4 设计纹素；比真拍大一点，和 Q 版的大网球拍同一个夸张程度）、厚 0.06；柄 0.16。
 * 拍面一圈 1 纹素深色护边（拍面颜色的暗档就是边框色，靠 edge 描出来），柄是深色握把布。
 */
export function buildPaddle(ctx: PeopleCtx, colorKey: string = 'paddle'): THREE.Group {
  const g = new THREE.Group();
  g.name = 'paddle';
  const face = matOr(ctx, colorKey, PADDLE_FALLBACK[colorKey] ?? PADDLE_RAMP, { ...PERSON, edge: 0.5, convex: 0.2 });
  const grip = ctx.mat('hair', { ...PERSON, edge: 0.25, convex: 0 });
  // 拍面：圆角矩形挤出（圆角 0.08 ≈ 1 纹素，低分辨率下读成切角）
  const w = 0.3;
  const h = 0.36;
  const r = 0.08;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const fg = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false, curveSegments: 2 });
  fg.translate(0, 0, -0.03);
  // 法线中心放在拍面后面很远：正面整块一个档（实心的漆面），侧边落暗档 = 一圈护边
  g.add(part(fg, face, V(0, PADDLE_FACE_Y, 0), V(0, PADDLE_FACE_Y, -0.6)));
  // 柄：从拳头往外 0.16，拍面下沿接上
  g.add(part(new THREE.BoxGeometry(0.08, 0.2, 0.07), grip, V(0, -0.1, 0)));
  return g;
}

// ── 纸杯（会员坐着喝饮料） ──────────────────────────────

/** 一只外带杯：白杯身 + 一圈俱乐部蓝杯套（3 × 3 纹素的小亮块），拳头握在杯身中间 */
export function buildCup(ctx: PeopleCtx): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cup';
  const white = ctx.mat('clothWhite', { ...PERSON, edge: 0.4, convex: 0.3 });
  const sleeve = matOr(ctx, 'counter', PADDLE_FALLBACK.counter, { ...PERSON, edge: 0.4, convex: 0.3 });
  g.add(part(new THREE.CylinderGeometry(0.1, 0.08, 0.24, 8, 1), white, V(0, 0.06, 0.1), V(0, 0.0, 0.1)));
  g.add(part(new THREE.CylinderGeometry(0.105, 0.095, 0.09, 8, 1), sleeve, V(0, 0.03, 0.1), V(0, 0.0, 0.1)));
  // 杯盖：顶上一片略大的白（俯视里是一个亮点）
  g.add(part(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 8, 1), white, V(0, 0.2, 0.1), V(0, 0.0, 0.1)));
  return g;
}

// ── 代用工具（正式资产到之前的替身） ──────────────────────────

export type StandIn = 'skim' | 'hose' | 'crank' | 'can' | 'brush' | 'squeegee' | 'marker';
export const STAND_INS: StandIn[] = ['skim', 'hose', 'crank', 'can', 'brush', 'squeegee', 'marker'];

/**
 * 代用工具：粗细按 ≥ 2 纹素，颜色借调色板现成的（metal 青绿漆、toolOrange、clothBlue、wood）。
 * userData.grip 就是正式工具该写的样子（握点、方向、第二只手、tip）。
 */
export function buildStandIn(ctx: PeopleCtx, kind: StandIn): THREE.Group {
  const g = new THREE.Group();
  g.name = `standin-${kind}`;
  const metal = ctx.mat('metal', { ...PERSON, edge: 0.4, convex: 0.3 });
  const orange = ctx.mat('toolOrange', { ...PERSON, edge: 0.45, convex: 0.4 });
  const dark = ctx.mat('hair', { ...PERSON, edge: 0.3, convex: 0 });
  const wood = ctx.mat('wood', { ...PERSON, edge: 0.4, convex: 0.3 });
  const cyl = (r: number, len: number, mat: Mat, from: THREE.Vector3, to: THREE.Vector3, seg = 6) => {
    const geo = new THREE.CylinderGeometry(r, r, len, seg, 1);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), to.clone().sub(from).normalize());
    return m;
  };
  switch (kind) {
    case 'skim': {
      // 捞网：2.6 米杆沿 +z 平放（本地原点 = 杆尾），网圈在 +z 末端（0.5 × 0.4 的扁圈 + 垂下的网兜）
      g.add(cyl(0.05, 2.6, metal, V(0, 0, 0), V(0, 0, 2.6)));
      const hoop = new THREE.TorusGeometry(0.24, 0.04, 4, 10);
      hoop.rotateX(Math.PI / 2);
      hoop.scale(1, 1, 0.85);
      g.add(part(hoop, metal, V(0, 0, 2.82), V(0, 0.3, 2.82)));
      const bag = new THREE.SphereGeometry(0.22, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      bag.scale(1, 0.9, 0.85);
      g.add(part(bag, ctx.mat('clothWhite', { ...PERSON, edge: 0.3, convex: 0.2 }), V(0, 0, 2.82)));
      g.userData.grip = { at: [0, 0, 0.25], axis: [0, 0, 1], up: [0, 1, 0], at2: [0, 0, 0.85], tip: [0, 0, 2.82] };
      break;
    }
    case 'hose': {
      // 喷枪：握把（竖）+ 枪管沿 +z（0.32 米、橙色）+ 枪尾垂下一段深色水管
      g.add(cyl(0.05, 0.18, dark, V(0, -0.02, 0), V(0, 0.14, 0.03)));
      g.add(cyl(0.06, 0.34, orange, V(0, 0.14, -0.04), V(0, 0.14, 0.3), 8));
      g.add(cyl(0.075, 0.08, dark, V(0, 0.14, 0.28), V(0, 0.14, 0.36), 8));
      g.add(cyl(0.05, 0.5, dark, V(0, -0.02, 0), V(0, -0.35, -0.35)));
      g.userData.grip = {
        at: [0, 0.04, 0],
        axis: [0, 0, 1],
        up: [0, 1, 0],
        at2: [0, -0.2, -0.2],
        tip: [0, 0.14, 0.38],
      };
      break;
    }
    case 'crank': {
      // 摇把：手柄（握的那截，竖）+ 曲柄臂 0.3 米沿 −y 到转轴（转轴上一个方头套筒）
      g.add(cyl(0.05, 0.16, wood, V(0, 0, -0.08), V(0, 0, 0.08)));
      g.add(cyl(0.035, 0.3, metal, V(0, 0, 0.06), V(0, -0.3, 0.06)));
      g.add(part(new THREE.BoxGeometry(0.1, 0.1, 0.14), metal, V(0, -0.3, 0.02)));
      g.userData.grip = { at: [0, 0, 0], axis: [0, -1, 0], up: [0, 0, 1], tip: [0, -0.3, 0.02] };
      break;
    }
    case 'can': {
      // 浇水壶：壶身（0.34 宽的扁桶）、顶上的提手、往 +z 斜伸出去的长壶嘴 + 莲蓬头
      g.add(part(new THREE.CylinderGeometry(0.16, 0.17, 0.3, 8, 1), metal, V(0, -0.3, 0), V(0, -0.2, 0)));
      g.add(cyl(0.035, 0.3, metal, V(0, -0.12, -0.15), V(0, -0.12, 0.15)));
      g.add(cyl(0.04, 0.44, metal, V(0, -0.38, 0.12), V(0, -0.12, 0.46)));
      g.add(part(new THREE.CylinderGeometry(0.08, 0.05, 0.06, 8, 1), orange, V(0, -0.1, 0.48)));
      g.userData.grip = {
        at: [0, -0.1, 0],
        axis: [0, -1, 0],
        up: [0, 0, 1],
        at2: [0, -0.4, -0.14],
        tip: [0, -0.08, 0.5],
      };
      break;
    }
    case 'brush': {
      // 扫线刷：1.4 米木柄沿 +z，末端一个 0.6 米宽的横刷头（蓝壳 + 一条刷毛）
      g.add(cyl(0.045, 1.4, wood, V(0, 0, 0), V(0, 0, 1.4)));
      g.add(part(new THREE.BoxGeometry(0.6, 0.1, 0.14), matOr(ctx, 'counter', PADDLE_FALLBACK.counter), V(0, 0, 1.45)));
      g.add(part(new THREE.BoxGeometry(0.58, 0.08, 0.1), ctx.mat('dryGrass', PERSON), V(0, -0.08, 1.45)));
      g.userData.grip = { at: [0, 0, 0.1], axis: [0, 0, 1], up: [0, 1, 0], at2: [0, 0, 0.55], tip: [0, -0.12, 1.45] };
      break;
    }
    case 'squeegee': {
      // 刮水板：1.5 米柄沿 +z，末端 0.9 米宽的刮头（蓝壳 + 深色橡胶条）
      g.add(cyl(0.045, 1.5, metal, V(0, 0, 0), V(0, 0, 1.5)));
      g.add(
        part(new THREE.BoxGeometry(0.9, 0.12, 0.12), matOr(ctx, 'counter', PADDLE_FALLBACK.counter), V(0, 0, 1.52)),
      );
      g.add(part(new THREE.BoxGeometry(0.88, 0.08, 0.06), dark, V(0, -0.09, 1.54)));
      g.userData.grip = { at: [0, 0, 0.1], axis: [0, 0, 1], up: [0, 1, 0], at2: [0, 0, 0.55], tip: [0, -0.13, 1.54] };
      break;
    }
    case 'marker': {
      // 划线车（推车）：立在地上，两个轮子 + 白漆桶 + 往 −z 伸出的推把（横杆中点 (0, 0.88, −0.7)）
      const white = ctx.mat('clothWhite', { ...PERSON, edge: 0.4, convex: 0.3 });
      g.add(part(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 8, 1), white, V(0, 0.42, 0.05), V(0, 0.6, 0.05)));
      for (const sx of [-0.3, 0.3]) {
        const w = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 8, 1);
        w.rotateZ(Math.PI / 2);
        g.add(part(w, dark, V(sx, 0.16, 0.05)));
      }
      g.add(cyl(0.04, 0.6, metal, V(-0.3, 0.16, 0.05), V(0.3, 0.16, 0.05)));
      for (const sx of [-0.2, 0.2]) g.add(cyl(0.035, 0.95, metal, V(sx, 0.3, 0.05), V(sx, 0.88, -0.7)));
      g.add(cyl(0.04, 0.5, dark, V(-0.25, 0.88, -0.7), V(0.25, 0.88, -0.7)));
      g.userData.grip = {
        at: [-0.18, 0.88, -0.7],
        at2: [0.18, 0.88, -0.7],
        axis: [0, 0, 1],
        up: [0, 1, 0],
        cart: true,
      };
      break;
    }
  }
  ctx.mats.prepare(g);
  return g;
}

// ── 球童的东西：滚的球、给球员撑的伞 ─────────────────────────

/** 球童手里的球（挂在右拳上，bkRoll 出手前显示）：亮黄一颗，0.2 米（同 rig 的大球一样夸张） */
export function buildBall(ctx: PeopleCtx): THREE.Mesh {
  const m = part(
    new THREE.SphereGeometry(0.1, 8, 6),
    ctx.mat('ball', { lightUp: 0.5, bands: [-0.3, 0.45], noShadowReceive: true }),
    V(0, -0.06, 0.08),
  );
  m.visible = false;
  return m;
}

/**
 * 球童撑的伞（换边时给坐着的球员遮阳）：1.8 米的杆 + 直径 1.3 米的八瓣伞面（俱乐部蓝 / 白相间，同球场伞的配色思路）。
 * 本地原点 = 杆底，杆沿 +y；userData.grip：右手在杆上 0.5 米、左手 0.25 米，axis 朝伞面（+y）。
 */
export function buildUmbrella(ctx: PeopleCtx): THREE.Group {
  const g = new THREE.Group();
  g.name = 'umbrella';
  const blue = matOr(ctx, 'counter', PADDLE_FALLBACK.counter, {
    lightUp: 0.5,
    bands: [-0.3, 0.45],
    edge: 0.5,
    convex: 0.2,
  });
  const white = ctx.mat('clothWhite', { lightUp: 0.5, bands: [-0.3, 0.45], edge: 0.5, convex: 0.2 });
  const pole = ctx.mat('hair', { ...PERSON, edge: 0.3, convex: 0 });
  g.add(part(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6, 1), pole, V(0, 0.9, 0)));
  // 伞面：八瓣浅锥，蓝白相间（法线中心放低 → 顶面亮、伞沿一圈暗）
  for (let i = 0; i < 8; i++) {
    const w = new THREE.CylinderGeometry(0.03, 0.66, 0.24, 2, 1, true, (i * Math.PI) / 4, Math.PI / 4);
    g.add(part(w, i % 2 ? white : blue, V(0, 1.72, 0), V(0, 0.9, 0)));
  }
  g.add(part(new THREE.SphereGeometry(0.05, 6, 4), pole, V(0, 1.86, 0)));
  g.userData.grip = { at: [0, 0.5, 0], at2: [0, 0.25, 0], axis: [0, 1, 0], up: [0, 0, 1], tip: [0, 1.72, 0] };
  ctx.mats.prepare(g);
  return g;
}
