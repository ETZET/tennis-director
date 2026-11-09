// 场边遮阳伞（一份实现，两种款式）：
//   pickle（clubpickle 的 shade-umbrella）：⌀ 2.1 米、顶 2.4 米，8 片奶白 / 俱乐部蓝相间，金属细杆 + 方水泥配重，整把往北（朝太阳）斜 9°，
//     影子往回收、落在伞下的长椅和观众身上。v0 正面朝镜头是一整片；v1 转半片（棱朝镜头），两把不一模一样。
//   clay（clubclay 的 court-umbrella）：⌀ 2.4 米、顶 2.55 米，同一块帆布（蓝白相间，每片 ≥ 10 纹素宽），胖木杆 + 铸铁方底座，
//     垂边深一点（≥ 3 纹素）。v0 正；v1 转半片、往东歪 4°；v2 收起一半（伞面变陡变小）。
// 伞面是 8 个平的三角面（一片一个颜色，多切面 → convex 0.25），伞缘一圈扇形垂边（每片中间深、两头浅），顶上一个小尖；
// 伞面不接投影（帆布 THIN）、要投影：开口的伞面朝下那一面另画一层反向的三角形（投影 pass 画背面，单面伞面投不出影子）。
// 原点 = 伞杆落地点（底座中心），+z 朝镜头。
//
// userData（stage 3）：
//   setOpen(k)  0..1：1 = 撑开，0.5 ≈ 收起一半，0 = 收拢（伞面绕顶点合拢，垂边跟着）；只在调用时重建伞面几何（一次 < 0.5k 三角形）
//   open        当前开合
import * as THREE from 'three';
import { Bag, type CourtKey, disposeTree, type KitCtx, tris } from './courtside/kit';

interface Style {
  /** 撑开时伞缘角点的半径 */
  R: number;
  /** 伞顶（伞面顶点）离地高 */
  top: number;
  /** 伞面顶点到伞缘的落差（撑开时） */
  rise: number;
  /** 垂边深度 [角上, 每片中间] */
  val: [number, number];
  pole: { key: CourtKey; w: number };
  base: { key: CourtKey; w: number; h: number };
  /** 顶上的小尖 */
  finial: { key: CourtKey; r: number; h: number };
  /** 整把往北斜（弧度） */
  tiltN: number;
}

const PICKLE: Style = {
  R: 1.06,
  top: 2.3,
  rise: 0.46,
  val: [0.1, 0.2],
  pole: { key: 'metal', w: 0.14 },
  base: { key: 'concrete', w: 0.56, h: 0.16 },
  finial: { key: 'metal', r: 0.08, h: 0.16 },
  tiltN: (9 * Math.PI) / 180,
};

const CLAY: Style = {
  R: 1.2,
  top: 2.42,
  rise: 0.52,
  val: [0.16, 0.3],
  pole: { key: 'timber', w: 0.22 },
  base: { key: 'ironwork', w: 0.62, h: 0.22 },
  finial: { key: 'timber', r: 0.1, h: 0.16 },
  tiltN: 0,
};

const N = 8;

function build(ctx: KitCtx, st: Style, opts: { phase: number; lean: number; open: number }): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'umbrella';

  // ── 底座 + 杆（不动）────────────────────────────────
  const fixed = new Bag();
  const mBase = ctx.mat(st.base.key, { convex: 0.8 });
  const bw = st.base.w;
  fixed.box(mBase, bw, st.base.h * 0.6, bw, 0, 0, 0);
  // 上面收一圈（压低的台阶）+ 插杆的套筒：轮廓不是一块砖
  fixed.box(mBase, bw * 0.7, st.base.h * 0.4, bw * 0.7, 0, st.base.h * 0.6, 0);
  fixed.box(mBase, st.pole.w + 0.08, 0.12, st.pole.w + 0.08, 0, st.base.h, 0);
  fixed.into(root);

  // 杆以上整体斜（往北 tiltN、往东 lean），转轴在底座顶
  const tilt = new THREE.Group();
  tilt.position.y = st.base.h;
  tilt.rotation.set(-st.tiltN, 0, -opts.lean, 'XYZ');
  root.add(tilt);

  const apexY = st.top - st.base.h; // tilt 组里的伞面顶点高
  const pole = new Bag();
  const mPole = ctx.mat(st.pole.key, { convex: 0.4 });
  pole.add(
    mPole,
    new THREE.CylinderGeometry(st.pole.w / 2, st.pole.w / 2, apexY + 0.02, 8).translate(0, (apexY + 0.02) / 2, 0),
  );
  // 杆上的收伞滑套（撑开时在伞面下 0.5 米）：杆上一个胖一点的节
  pole.add(
    mPole,
    new THREE.CylinderGeometry(st.pole.w * 0.75, st.pole.w * 0.75, 0.12, 8).translate(0, apexY - st.rise - 0.45, 0),
  );
  // 小尖
  const mFin = ctx.mat(st.finial.key, { convex: 0.6 });
  pole.add(mFin, new THREE.ConeGeometry(st.finial.r, st.finial.h, 6).translate(0, apexY + st.finial.h / 2 + 0.02, 0));
  pole.add(
    mFin,
    new THREE.CylinderGeometry(st.finial.r * 0.9, st.finial.r * 0.9, 0.05, 6).translate(0, apexY + 0.02, 0),
  );
  pole.into(tilt);

  // ── 伞面（开合时重建）────────────────────────────────
  const head = new THREE.Group();
  tilt.add(head);
  // 伞面：几乎干净的漆面（paint 元素：大块轻微深浅，没有擦痕），多切面 convex 0.25；档位分界上提一点，
  // 让朝镜头那几片落中档、两侧和北边几片亮着（伞读成一个顶，不是一块平的亮片）
  // 收起一半时伞面陡（朝镜头那几片几乎竖着）：光往上偏一点、档位放宽，不然整把落暗档、读成一团紫
  const closed = opts.open < 0.8;
  const face: Parameters<typeof ctx.mat>[1] = {
    convex: 0.25,
    bands: closed ? [-0.15, 0.55] : [0.1, 0.56],
    lightUp: closed ? 0.35 : 0,
    elem: { kind: 'paint', size: [14, 9], density: [0, 0], patch: 4 },
  };
  const mA = ctx.mat('canvas', face);
  const mB = ctx.mat('canvasStripe', face);
  // 垂边：竖直、朝外；朝镜头那几段落暗档（和凉棚垂边一样，是伞面下沿的一道深边）
  const mVA = ctx.mat('canvas', { convex: 0.2 });
  const mVB = ctx.mat('canvasStripe', { convex: 0.2 });

  const L = Math.hypot(st.R, st.rise); // 伞骨长（顶点到角点），开合时不变
  const phase0 = -Math.PI / N + opts.phase * (Math.PI / N); // 0：第 0 片正对 +z（镜头）

  const rebuild = (k: number) => {
    for (const c of [...head.children]) {
      head.remove(c);
      disposeTree(c);
    }
    const r = st.R * (0.32 + 0.68 * k);
    const drop = Math.sqrt(Math.max(L * L - r * r, 0.01));
    const rimY = apexY - drop;
    const apex = new THREE.Vector3(0, apexY, 0);
    const corner = (j: number) => {
      const a = phase0 + (j * 2 * Math.PI) / N;
      return new THREE.Vector3(Math.sin(a) * r, rimY, Math.cos(a) * r);
    };
    const bag = new Bag();
    const under: THREE.Vector3[] = [];
    const vd = st.val.map((v) => v * (0.55 + 0.45 * k)) as [number, number];
    for (let i = 0; i < N; i++) {
      const c0 = corner(i);
      const c1 = corner(i + 1);
      const stripe = i % 2 === 1;
      // 正面朝上朝外：apex → c0 → c1 的绕向按角度定（a 从 +z 往 +x 转），法线 y 要 > 0
      const n = new THREE.Vector3().subVectors(c0, apex).cross(new THREE.Vector3().subVectors(c1, apex));
      const tri = n.y > 0 ? [apex, c0, c1] : [apex, c1, c0];
      bag.add(stripe ? mB : mA, tris(tri));
      // 投影用的底面（反向、往下 1 厘米）
      const dn = new THREE.Vector3(0, -0.012, 0);
      under.push(tri[0].clone().add(dn), tri[2].clone().add(dn), tri[1].clone().add(dn));
      // 垂边：这一片的边分 6 段，下沿 = 角上浅、中间深（扇形）
      const seg = 6;
      const out = new THREE.Vector3().addVectors(c0, c1).setY(0).normalize();
      const vt: THREE.Vector3[] = [];
      for (let s = 0; s < seg; s++) {
        const t0 = s / seg;
        const t1 = (s + 1) / seg;
        const p0 = new THREE.Vector3().lerpVectors(c0, c1, t0).addScaledVector(out, 0.004);
        const p1 = new THREE.Vector3().lerpVectors(c0, c1, t1).addScaledVector(out, 0.004);
        const d0 = vd[0] + (vd[1] - vd[0]) * Math.sin(Math.PI * t0);
        const d1 = vd[0] + (vd[1] - vd[0]) * Math.sin(Math.PI * t1);
        const q0 = p0.clone().setY(rimY - d0);
        const q1 = p1.clone().setY(rimY - d1);
        // 朝外：(p1 - p0) × (q0 - p0) 和 out 同向
        const nn = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(q0, p0));
        if (nn.dot(out) > 0) vt.push(p0, p1, q0, p1, q1, q0);
        else vt.push(p0, q0, p1, p1, q0, q1);
      }
      bag.add(stripe ? mVB : mVA, tris(vt));
    }
    bag.add(mA, tris(under));
    bag.into(head);
    ctx.mats.prepare(head);
    // 伞面不接投影由材质（THIN）管；底面只为投影：本身朝下，镜头看不到
    head.userData.open = k;
  };

  rebuild(opts.open);
  ctx.mats.prepare(root);
  root.userData.open = opts.open;
  root.userData.setOpen = (k: number) => {
    const kk = Math.min(1, Math.max(0, k));
    rebuild(kk);
    root.userData.open = kk;
  };
  return root;
}

/** clubpickle 的 shade-umbrella：v0 正、v1 转半片 */
export function buildPickle(ctx: KitCtx): THREE.Object3D {
  return build(ctx, PICKLE, { phase: ctx.variant % 2, lean: 0, open: 1 });
}

/** clubclay 的 court-umbrella：v0 正、v1 转半片 + 往东歪 4°、v2 收起一半 */
export function buildClay(ctx: KitCtx): THREE.Object3D {
  const v = ctx.variant % 3;
  return build(ctx, CLAY, {
    phase: v === 1 ? 1 : 0,
    lean: v === 1 ? (4 * Math.PI) / 180 : 0,
    open: v === 2 ? 0.55 : 1,
  });
}
