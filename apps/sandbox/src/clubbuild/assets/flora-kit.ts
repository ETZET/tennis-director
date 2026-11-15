// flora-kit：clubbuild 自己的"开罗式"植物（不是设施模型：这个文件不 export build）。
// 美术 r1 C 条：复用的蒲葵缩到 0.6 倍以后俯视是一团圆冠，像阔叶树；开罗距离（0.149 米/纹素）下棕榈要靠"放射的叶片"认出来。
// - palmTree：一根微弯的树干（≥ 2.4 纹素粗，叶痕环）+ n 片放射、拱起再下垂的羽叶（每片 0.5～0.6 米宽、中脊折起来 → 一亮一暗两半，
//   边上每段一缩 = 锯齿状的小叶），冠下几颗椰子；老树（oldPalm）冠下再挂一圈枯叶裙。
// - blobShadow：地上一块固定在暗档的椭圆团影（小东西不投太阳影，脚下一块团影：pond 的做法）。
// 叶、干、裙用同一套风摆参数 → 整棵树一起弯。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';
import type { Pal } from '../palette';

type G = THREE.BufferGeometry;

export interface PalmOpts {
  /** 树干高（米，到冠心） */
  h: number;
  /** 叶片伸出去多远（米，水平） */
  reach: number;
  /** 几片叶 */
  n?: number;
  /** 叶尖往下垂多少（米） */
  droop?: number;
  /** 冠心相对树脚的水平偏移（树干往这边弯） */
  lean?: [number, number];
  /** 叶片最宽处（米） */
  width?: number;
  /** 枯叶裙（老蒲葵） */
  skirt?: boolean;
  /** 冠下的椰子 */
  nuts?: boolean;
  /** 干粗（米，树脚半径） */
  r0?: number;
  seed?: string;
}

/** 一片羽叶：沿方向 (cos a, sin a) 从冠心伸出去，拱起再下垂；中脊折起（两半一亮一暗），边每段一缩 */
function frond(top: THREE.Vector3, a: number, reach: number, droop: number, width: number, rise: number): G {
  const N = 7;
  const dx = Math.cos(a);
  const dz = Math.sin(a);
  // 侧向（水平，垂直于叶的方向）
  const sx = -dz;
  const sz = dx;
  const pos: number[] = [];
  const ctr: THREE.Vector3[] = [];
  const left: THREE.Vector3[] = [];
  const right: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const d = 0.15 + reach * t;
    const y = top.y + rise * Math.sin(Math.PI * t * 0.75) - droop * t * t;
    const c = new THREE.Vector3(top.x + dx * d, y + 0.06, top.z + dz * d);
    // 宽：根部窄、中间最宽、叶尖收成一点；奇数段缩一点 = 锯齿小叶
    let w = width * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) * (i % 2 ? 0.72 : 1);
    if (i === N) w = 0.02;
    const edgeY = y - 0.1 - 0.12 * t;
    ctr.push(c);
    left.push(new THREE.Vector3(c.x + sx * w * 0.5, edgeY, c.z + sz * w * 0.5));
    right.push(new THREE.Vector3(c.x - sx * w * 0.5, edgeY, c.z - sz * w * 0.5));
  }
  const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) => {
    // 让法线朝上（俯视逆时针）
    const n = new THREE.Vector3().subVectors(q, p).cross(new THREE.Vector3().subVectors(r, p));
    if (n.y < 0) pos.push(p.x, p.y, p.z, r.x, r.y, r.z, q.x, q.y, q.z);
    else pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  };
  for (let i = 0; i < N; i++) {
    tri(ctr[i], left[i], ctr[i + 1]);
    tri(left[i], left[i + 1], ctr[i + 1]);
    tri(ctr[i], ctr[i + 1], right[i]);
    tri(right[i], ctr[i + 1], right[i + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // 法线往上偏一半：叶面大多落亮档，垂下去的叶尖、背光那半边落中/暗档
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i);
    v.y += 0.55;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/** 两点之间一节圆柱（半径 r0 → r1） */
function seg(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, sides = 6): G {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), sides, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  g.deleteAttribute('uv');
  return g;
}

/** 开罗式棕榈：本地原点 = 树脚 */
export function palmTree(ctx: AssetCtx, o: PalmOpts): THREE.Group {
  const root = new THREE.Group();
  root.name = 'palm-tree';
  const rnd = ctx.rng(`palm-tree:${o.seed ?? ''}:${ctx.variant}`);
  const n = o.n ?? 7;
  const [lx, lz] = o.lean ?? [0, 0];
  const r0 = o.r0 ?? 0.26;
  const top = new THREE.Vector3(lx, o.h, lz);
  // 风摆：整棵树一套参数（冠在 h 处摆 0.14 米）
  const sway: ToonOpts = { sway: 0.14, swayH: o.h };

  // ── 树干：二次曲线（脚下直、往上弯向 lean），一节节圆柱 ──
  const trunk: G[] = [];
  const S = 6;
  const P = (t: number) => new THREE.Vector3(lx * t * t, o.h * t, lz * t * t);
  for (let i = 0; i < S; i++) {
    const t0 = i / S;
    const t1 = (i + 1) / S;
    trunk.push(seg(P(t0), P(t1 + 0.02), r0 * (1 - 0.32 * t0), r0 * (1 - 0.32 * t1)));
  }
  // 脚下一圈根（粗一点的矮台）
  trunk.push(seg(new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0, 0.35, 0), r0 * 1.45, r0 * 1.05));
  const trunkMesh = new THREE.Mesh(
    mergeGeometries(trunk),
    ctx.mat('palmTrunk', {
      ...sway,
      lightUp: 0.35,
      edge: 0.5,
      convex: 0.2,
      // 叶痕环：沿本地 y 每 0.32 米一道缝 + 缝下一纹素亮条
      elem: { kind: 'planks', space: 'local', seam: 1, hi: 1, p: [0, 1, 0, 0.32], q: [1, 0, 0, 0] },
    }),
  );
  trunkMesh.name = 'palm:trunk';
  root.add(trunkMesh);

  // ── 枯叶裙（老树）：冠下一圈往下收的草秆色"裙" ──
  if (o.skirt) {
    const sk = seg(
      new THREE.Vector3(lx * 0.85, o.h - 2.1, lz * 0.85),
      new THREE.Vector3(lx, o.h - 0.1, lz),
      r0 * 1.25,
      r0 * 2.6,
      8,
    );
    const skirt = new THREE.Mesh(
      sk,
      ctx.mat('palmSkirt', {
        ...sway,
        lightUp: 0.4,
        edge: 0.4,
        convex: 0.1,
        elem: { kind: 'blades', density: [0.2, 0.5] },
      }),
    );
    skirt.name = 'palm:skirt';
    root.add(skirt);
  }

  // ── 冠：n 片放射的羽叶（一圈低的往下垂、两三片高的往上翘） ──
  const leaves: G[] = [];
  const a0 = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
    const k = 0.85 + rnd() * 0.25;
    leaves.push(frond(top, a, o.reach * k, (o.droop ?? 1.3) * k, o.width ?? 0.6, 0.45 + rnd() * 0.25));
  }
  // 冠心朝上两片短的（俯视冠心不是一个洞）
  for (let i = 0; i < 2; i++) {
    const a = a0 + Math.PI * (0.3 + i);
    leaves.push(frond(top, a, o.reach * 0.45, 0.1, (o.width ?? 0.6) * 0.8, 0.7));
  }
  const crown = new THREE.Mesh(
    mergeGeometries(leaves),
    ctx.mat('palm', {
      ...sway,
      side: THREE.DoubleSide,
      bands: [-0.05, 0.42],
      edge: 0.45,
      convex: 0.15,
      noShadowReceive: true,
    }),
  );
  crown.name = 'palm:crown';
  root.add(crown);

  // ── 椰子：冠心下面三颗（2 纹素的深色点，开罗式棕榈的记号） ──
  if (o.nuts !== false) {
    const nuts: G[] = [];
    for (let i = 0; i < 3; i++) {
      const a = a0 + i * 2.1;
      nuts.push(
        new THREE.IcosahedronGeometry(0.2, 0).translate(
          top.x + Math.cos(a) * 0.22,
          top.y - 0.12,
          top.z + Math.sin(a) * 0.22,
        ),
      );
    }
    const nutMesh = new THREE.Mesh(
      mergeGeometries(nuts),
      ctx.mat('palmTrunk', {
        ...sway,
        lightUp: 0.3,
        sphereNormals: [top.x, top.y - 0.12, top.z],
        edge: 0.4,
        convex: 0,
      }),
    );
    nutMesh.name = 'palm:nuts';
    root.add(nutMesh);
  }
  ctx.mats.prepare(root);
  return root;
}

/**
 * 地上的团影：固定在暗档的椭圆盘（rx × rz 米，y 高），材质用脚下那块地面的（影子里那套颜色、元素照画）。
 * 小人、小植物不投太阳影，脚下一块这个（毛边投影在 0.149 米/纹素下是一团紫色污渍）。
 */
export function blobShadow(
  ctx: AssetCtx,
  key: keyof Pal,
  rx: number,
  rz: number,
  y = 0.02,
  extra: ToonOpts = {},
): THREE.Mesh {
  const g = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
  g.scale(rx, 1, rz);
  g.translate(0, y, 0);
  g.deleteAttribute('uv');
  const m = new THREE.Mesh(g, ctx.mat(key, { bands: [9, 9], edge: 0, convex: 0, ...extra }));
  m.name = 'blob-shadow';
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}
