// 换装（dress.ts）用的几何体：新发型、帽子、脸上的东西、按体型 / 下装种类换的身体部件。全部按样式缓存、所有人共用（不要 dispose）。
// 坐标同 rig/rig.ts：头的部件在头的后仰组（tilt）里（头心 (0, 0.33, 0)，半径 0.36，脸朝 +z），躯干的在 torso 里，臀的在 hips 里，
// 腿在腿组里。尺寸按 0.09 米/纹素：看得见的一块 ≥ 1～2 纹素厚；法线照 rig 的做法从部件中心往外（blobNormals）→ 亮顶、中腰、暗底。
// rig 原有的几何体（短发帽壳、刘海、马尾、棒球帽、草帽、太阳镜、胡子、躯干、臀、腿）照抄 rig.ts 的数字：s = 1 时和 rig 建的一模一样。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CastLook, HairStyle, Hat } from '../cast/types';
import { blobNormals } from '../render/toon';

type Geo = THREE.BufferGeometry;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** 同 rig 的 part：平移到位、法线从中心往外 */
const pg = (g: Geo, at: THREE.Vector3, center?: THREE.Vector3): Geo => {
  g.translate(at.x, at.y, at.z);
  return blobNormals(g, center ?? at.clone());
};
/** 同 rig 的 limb：只平移（胶囊自己的法线） */
const lg = (g: Geo, at: THREE.Vector3): Geo => g.translate(at.x, at.y, at.z);
/** 几个部件拼成一个几何体（同一种材质 → 一个网格） */
const merge = (gs: Geo[]): Geo => {
  const out = gs.length === 1 ? gs[0] : mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)));
  if (!out) throw new Error('dress-geo：拼不起来（属性不一致）');
  out.computeBoundingSphere();
  return out;
};

const cache = new Map<string, Geo>();
const cached = (key: string, make: () => Geo): Geo => {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
};
/** 体型系数按 0.02 一档取整（缓存不会无限长） */
const q2 = (s: number) => Math.round(s * 50) / 50;

// ── 头发 ──────────────────────────────────────────────────────────────

/** 头心（tilt 空间） */
const HC = V(0, 0.33, 0);

/** 寸头：比短发的帽壳贴头皮（半径 0.372）、发际线更高（只盖 0.46π），没有刘海；颜色由 dress 混一点肤色（发茬） */
export const buzzShell = () =>
  cached('buzz', () => {
    const g = new THREE.SphereGeometry(0.372, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.46);
    g.rotateX(-0.78);
    return pg(g, V(0, 0.35, -0.01), V(0, 0.35, 0));
  });

/**
 * 头发的"额外那一块"（短发帽壳、刘海之外）。hatted = 戴着盖住头顶的帽子（发髻放低到后颈、卷发只留下面一圈）。
 * 没有额外的一块（short、buzz）返回 null。
 */
export function hairExtra(style: HairStyle, hatted: boolean): Geo | null {
  switch (style) {
    case 'short':
    case 'buzz':
      return null;
    case 'ponytail':
      // 同 rig 的马尾：后脑一个发髻 + 往下垂的一团
      return cached('pony', () => {
        const a = new THREE.SphereGeometry(0.17, 8, 6);
        a.scale(1, 1.2, 1);
        const b = new THREE.SphereGeometry(0.14, 8, 6);
        b.scale(1, 1.5, 1);
        return merge([pg(a, V(0, 0.46, -0.4)), pg(b, V(0, 0.2, -0.47))]);
      });
    case 'bun':
      // 头顶偏后一个发髻（4 纹素）：正面、侧面、45° 俯视都是头顶上的一个包；戴帽子 → 后颈的低发髻
      return hatted
        ? cached('bunLow', () => {
            const g = new THREE.SphereGeometry(0.17, 9, 6);
            g.scale(1.1, 0.9, 1);
            return merge([pg(g, V(0, 0.36, -0.42))]);
          })
        : cached('bun', () => {
            const g = new THREE.SphereGeometry(0.19, 10, 7);
            g.scale(1, 0.88, 1);
            const knot = new THREE.CylinderGeometry(0.12, 0.15, 0.1, 10, 1);
            return merge([pg(g, V(0, 0.75, -0.16)), pg(knot, V(0, 0.64, -0.13), V(0, 0.5, -0.1))]);
          });
    case 'long':
      // 披肩长发：脑后、两侧一道帘子（前面留出脸），从头顶垂到肩下（头心下 0.5 米，比下巴长 2 纹素）
      return cached('long', () => curtain(0.385, 0.46, 0.66, 0.5, 0.6));
    case 'bob':
      // 齐耳短发：同一道帘子，只垂到下巴（侧面盖住耳朵），下沿外翻一点
      return cached('bob', () => curtain(0.39, 0.43, 0.42, 0.27, 0.54));
    case 'bald':
      // 光头：头顶露皮，只剩耳后到后脑的一圈（2 纹素高），帽壳、刘海都藏掉
      return cached('bald', () => {
        // 侧面比头的轮廓鼓出 1 纹素（正面看得见两鬓），后脑往上多盖一点
        // 两鬓到后脑一圈（3 纹素高，比头的轮廓鼓出 1 纹素）：正面看得见两鬓，45° 俯视看得见后脑那道弧
        const g = new THREE.CylinderGeometry(0.385, 0.39, 0.26, 16, 1, true, Math.PI * 0.34, Math.PI * 1.32);
        g.scale(1, 1, 0.97);
        return merge([pg(g, V(0, 0.31, -0.02), V(0, 0.36, 0))]);
      });
    case 'curly':
      // 蓬松卷发：一圈 2 纹素的毛团贴在头发帽壳外面 → 轮廓一颗颗鼓出来、头大一圈；戴帽子只留帽檐下面那圈
      return hatted ? cached('curlyLow', () => puffs(true)) : cached('curly', () => puffs(false));
    case 'braids':
      // 两条辫子：耳后垂到肩前（正面在下巴两边各一条，背面也看得见），三节一节比一节细
      return cached('braids', () => {
        const gs: Geo[] = [];
        for (const sx of [-1, 1]) {
          // 从耳后往前搭到肩膀前面（不然被袖子、肩膀挡住）
          const segs: [number, number, number, number][] = [
            [0.31, 0.19, 0.0, 0.11],
            [0.33, 0.04, 0.09, 0.105],
            [0.33, -0.1, 0.16, 0.095],
          ];
          for (const [x, y, z, r] of segs) {
            const g = new THREE.SphereGeometry(r, 7, 5);
            g.scale(1, 1.25, 1);
            gs.push(pg(g, V(sx * x, y, z)));
          }
        }
        return merge(gs);
      });
  }
}

/** 一道头发帘子：脑后 + 两侧（正面留 gap × π 给脸），上口半径 rTop、下口 rBot、高 h，下沿在头心下 drop 米 */
function curtain(rTop: number, rBot: number, h: number, drop: number, gap: number): Geo {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 14, 2, true, Math.PI * (gap / 2), Math.PI * (2 - gap));
  g.scale(1, 1, 0.96);
  const yc = HC.y - drop + h / 2;
  return merge([pg(g, V(0, yc, -0.02), V(0, yc + 0.1, 0))]);
}

/** 卷发的毛团（方向 × 半径贴在头心外面） */
function puffs(low: boolean): Geo {
  const dirs: [number, number, number, number][] = [
    [0, 1, -0.1, 0.19],
    [0.55, 0.8, -0.12, 0.18],
    [-0.55, 0.8, -0.12, 0.18],
    [0, 0.72, -0.62, 0.19],
    [0.62, 0.42, -0.55, 0.18],
    [-0.62, 0.42, -0.55, 0.18],
    [0.9, 0.3, -0.12, 0.17],
    [-0.9, 0.3, -0.12, 0.17],
    [0, 0.2, -0.95, 0.18],
    [0.32, 0.86, 0.36, 0.16],
    [-0.32, 0.86, 0.36, 0.16],
    [0.62, 0.02, -0.6, 0.15],
    [-0.62, 0.02, -0.6, 0.15],
  ];
  const gs: Geo[] = [];
  const c = V(0, 0.36, -0.03);
  for (const [x, y, z, r] of dirs) {
    if (low && y > 0.5) continue;
    const d = V(x, y, z).normalize();
    const g = new THREE.SphereGeometry(r, 7, 5);
    gs.push(pg(g, c.clone().addScaledVector(d, 0.35)));
  }
  return merge(gs);
}

// ── 帽子 ──────────────────────────────────────────────────────────────

/** 帽子的主体（一种颜色一个网格）；草帽的帽带另外一个（strawBand） */
export function hatGeo(kind: Hat['kind']): Geo {
  switch (kind) {
    case 'cap':
      // 同 rig 的棒球帽：帽壳盖住头发上半 + 朝前的帽舌（3 纹素深）
      return cached('cap', () => {
        const c = new THREE.SphereGeometry(0.4, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
        c.rotateX(-0.12);
        const bill = new THREE.CylinderGeometry(0.24, 0.26, 0.05, 10, 1, false, -Math.PI / 2, Math.PI);
        bill.scale(1.15, 1, 1.3);
        return merge([pg(c, V(0, 0.38, 0), V(0, 0.34, 0)), pg(bill, V(0, 0.5, 0.28), V(0, 0.9, 0.28))]);
      });
    case 'visor':
      // 遮阳帽檐：一圈帽箍（1 纹素多粗）+ 比棒球帽更大更往前的帽舌，头顶露头发
      return cached('visor', () => {
        const band = new THREE.TorusGeometry(0.355, 0.06, 5, 18);
        band.rotateX(Math.PI / 2);
        band.scale(1, 1, 0.96);
        const bill = new THREE.CylinderGeometry(0.27, 0.29, 0.05, 10, 1, false, -Math.PI / 2, Math.PI);
        bill.scale(1.2, 1, 1.45);
        return merge([pg(band, V(0, 0.5, -0.01), V(0, 0.38, -0.01)), pg(bill, V(0, 0.5, 0.3), V(0, 0.9, 0.3))]);
      });
    case 'headband':
      // 头带：额头上一道（1 纹素多），绕到后脑；头发照常
      return cached('headband', () => {
        const band = new THREE.TorusGeometry(0.335, 0.055, 5, 18);
        band.rotateX(Math.PI / 2 - 0.12);
        band.scale(1, 1, 0.97);
        return merge([pg(band, V(0, 0.48, -0.01), V(0, 0.36, -0.01))]);
      });
    case 'bucket':
      // 渔夫帽：比草帽小、往下耷拉的一圈帽檐 + 高一点的筒形帽冠 + 平顶（没有帽带）
      return cached('bucket', () => {
        const brim = new THREE.CylinderGeometry(0.39, 0.53, 0.13, 16, 1);
        const crown = new THREE.CylinderGeometry(0.31, 0.37, 0.24, 14, 1);
        const top = new THREE.SphereGeometry(0.31, 14, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
        top.scale(1, 0.3, 1);
        return merge([
          pg(brim, V(0, 0.5, 0), V(0, 0.15, 0)),
          pg(crown, V(0, 0.66, 0), V(0, 0.5, 0)),
          pg(top, V(0, 0.78, 0), V(0, 0.6, 0)),
        ]);
      });
    case 'straw':
      // 同 rig 总监的宽檐草帽（帽带另外一个网格）
      return cached('straw', () => {
        const brim = new THREE.CylinderGeometry(0.36, 0.58, 0.1, 18, 1);
        const crown = new THREE.CylinderGeometry(0.26, 0.3, 0.17, 12, 1);
        const top = new THREE.SphereGeometry(0.26, 12, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
        top.scale(1, 0.35, 1);
        return merge([
          pg(brim, V(0, 0.5, 0), V(0, 0.2, 0)),
          pg(crown, V(0, 0.715, 0), V(0, 0.55, 0)),
          pg(top, V(0, 0.8, 0), V(0, 0.6, 0)),
        ]);
      });
  }
}
export const strawBand = () =>
  cached('strawBand', () => merge([pg(new THREE.CylinderGeometry(0.31, 0.315, 0.11, 12, 1), V(0, 0.59, 0))]));

// ── 脸 ────────────────────────────────────────────────────────────────

/** 两只眼睛（同 rig：1 纹素的深色小块） */
export const eyesGeo = () =>
  cached('eyes', () => merge([-0.13, 0.13].map((ex) => pg(new THREE.BoxGeometry(0.1, 0.13, 0.08), V(ex, 0.3, 0.34)))));
/** 太阳镜（同 rig：横贯两眼的深色条，4 × 1.5 纹素） */
export const shadesGeo = () =>
  cached('shades', () => merge([pg(new THREE.BoxGeometry(0.44, 0.14, 0.1), V(0, 0.3, 0.33), V(0, 0.5, 0.2))]));
/**
 * 眼镜的框：每只眼外面一个方框（上沿粗一点）+ 鼻梁 —— 框是浅一档的颜色，中间透出眼睛（眼睛另外画）。
 * 框的边 0.04～0.05 米：在 1 纹素下读成"眼睛外面一圈亮边 + 眉上一道线"，和一整条太阳镜分得开。
 */
export const glassesGeo = () =>
  cached('glasses', () => {
    const gs: Geo[] = [];
    const z = 0.36;
    for (const ex of [-0.14, 0.14]) {
      gs.push(pg(new THREE.BoxGeometry(0.22, 0.05, 0.05), V(ex, 0.395, z)));
      gs.push(pg(new THREE.BoxGeometry(0.22, 0.04, 0.05), V(ex, 0.215, z)));
      gs.push(pg(new THREE.BoxGeometry(0.04, 0.2, 0.05), V(ex - 0.095, 0.3, z)));
      gs.push(pg(new THREE.BoxGeometry(0.04, 0.2, 0.05), V(ex + 0.095, 0.3, z)));
    }
    gs.push(pg(new THREE.BoxGeometry(0.08, 0.04, 0.05), V(0, 0.36, z)));
    return merge(gs);
  });
/** 胡子（同 rig：鼻子下面 3 × 1 纹素）；络腮胡 = 胡子 + 下巴到两腮一圈 */
export function facialGeo(kind: NonNullable<CastLook['facial']>): Geo {
  if (kind === 'mustache')
    return cached('mustache', () =>
      merge([pg(new THREE.BoxGeometry(0.3, 0.09, 0.1), V(0, 0.13, 0.31), V(0, 0.3, 0.2))]),
    );
  return cached('beard', () => {
    const jaw = new THREE.SphereGeometry(0.375, 12, 5, Math.PI * 0.06, Math.PI * 0.88, Math.PI * 0.6, Math.PI * 0.34);
    jaw.scale(1, 0.95, 0.98);
    const m = new THREE.BoxGeometry(0.32, 0.09, 0.1);
    return merge([pg(jaw, V(0, 0.34, 0.01), V(0, 0.4, 0)), pg(m, V(0, 0.15, 0.32), V(0, 0.3, 0.2))]);
  });
}

// ── 身子（按体型 s、下装种类）─────────────────────────────────────────────

/** 躯干（同 rig：八棱柱，平的一面朝前，上宽下窄，前后压扁；发福 = 横向放大） */
export const torsoGeo = (s: number) =>
  cached(`torso:${q2(s)}`, () => {
    const g = new THREE.CylinderGeometry(0.25, 0.22, 0.46, 8, 1);
    g.rotateY(Math.PI / 8);
    g.scale(q2(s), 1, 0.74 * q2(s));
    return pg(g, V(0, 0.25, 0), V(0, 0.18, 0));
  });
/** 哨子（同 rig；跟着胸口往前） */
export const whistleGeo = (s: number) =>
  cached(`whistle:${q2(s)}`, () =>
    pg(new THREE.BoxGeometry(0.2, 0.14, 0.12), V(-0.06, 0.3, 0.2 * q2(s)), V(-0.06, 0.4, 0.1)),
  );
/** 领口、下摆的滚边（同 rig 的两圈，跟着发福放大）；which = 0 领口、1 下摆、2 两圈拼在一起 */
export const trimGeo = (s: number, which: 0 | 1 | 2) =>
  cached(`trim${which}:${q2(s)}`, () => {
    const k = q2(s);
    const collar = () => {
      const c = new THREE.CylinderGeometry(0.17, 0.24, 0.1, 8, 1);
      c.rotateY(Math.PI / 8);
      c.scale(k, 1, 0.78 * k);
      return pg(c, V(0, 0.47, 0), V(0, 0.3, 0));
    };
    const hem = () => {
      const h = new THREE.CylinderGeometry(0.225, 0.225, 0.08, 8, 1);
      h.rotateY(Math.PI / 8);
      h.scale(k, 1, 0.78 * k);
      return pg(h, V(0, 0.02, 0), V(0, 0.15, 0));
    };
    return which === 0 ? collar() : which === 1 ? hem() : merge([collar(), hem()]);
  });
/** 袖口（同 rig） */
export const cuffGeo = () =>
  cached('cuff', () => pg(new THREE.CylinderGeometry(0.15, 0.15, 0.07, 8, 1), V(0, -0.2, 0)));

type BottomKind = CastLook['bottomKind'];
/** 臀（同 rig：短裤 / 裙子 / 长裤的裤腰；发福时跟着放大七成） */
export const bottomGeo = (kind: BottomKind, s: number) =>
  cached(`bottom:${kind}:${q2(s)}`, () => {
    const k = 1 + (q2(s) - 1) * 0.7;
    const g =
      kind === 'skirt'
        ? new THREE.CylinderGeometry(0.23, 0.34, 0.3, 8, 1)
        : new THREE.CylinderGeometry(0.235, 0.25, kind === 'pants' ? 0.2 : 0.26, 8, 1);
    g.rotateY(Math.PI / 8);
    g.scale(k, 1, 0.8 * k);
    return pg(g, V(0, kind === 'skirt' ? -0.04 : 0.02, 0), V(0, 0.15, 0));
  });
/** 腿的粗细：长裤 0.135（裤管），光腿 0.115 */
export const legR = (kind: BottomKind) => (kind === 'pants' ? 0.135 : 0.115);
/** 直腿（同 rig：一根胶囊） */
export const legGeo = (kind: BottomKind) =>
  cached(`leg:${legR(kind)}`, () => lg(new THREE.CapsuleGeometry(legR(kind), 0.26, 2, 8), V(0, -0.24, 0)));
/** 膝盖腿（同 legs.ts）：大腿、小腿、短裤 / 裙子盖住的大腿上半 */
export const thighGeo = (kind: BottomKind) =>
  cached(`thigh:${legR(kind)}`, () => lg(new THREE.CapsuleGeometry(legR(kind), 0.05, 2, 8), V(0, -0.11, 0)));
export const shinGeo = (kind: BottomKind) =>
  cached(`shin:${legR(kind)}`, () => lg(new THREE.CapsuleGeometry(legR(kind) * 0.95, 0.02, 2, 8), V(0, -0.085, 0)));
export const thighCoverGeo = (kind: Exclude<BottomKind, 'pants'>) =>
  cached(`cover:${kind}`, () => {
    const len = kind === 'skirt' ? 0.1 : 0.06;
    const r = legR(kind) + (kind === 'skirt' ? 0.035 : 0.02);
    return lg(new THREE.CapsuleGeometry(r, len, 2, 8), V(0, -0.02 - len / 2, 0));
  });
