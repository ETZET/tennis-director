// #7 mist-line 喷雾管：挂在两块遮阳帆（#8 court-sail）前梁下面的一根金属管，9.6 米（本地 x −4.8…4.8），挂高 2.4，
// 每 1.2 米一个喷头（8 个，x = −4.2 + 1.2k）；东头一根竖管顺着帆的前杆下到地上的小水泵（俱乐部蓝的小箱子，侧面一个小灯）。
// 本地原点 = 管子正下方的地面，z 0 = 帆的前梁（世界 z 19.2），+z 朝镜头（南）。
//
// 雾 = 每个喷头 6 片竖着的半透明白色小团（FX 图层：不描边、不投影、不接影），从喷头冒出来、往下往顺风飘、
// 慢慢变大变淡（两层不透明度：刚冒出来 0.6、后半程 0.32；团和团叠起来的地方更白），≈ 2.4 秒一片。一共 48 片，一个 InstancedMesh 一层。
// 静止截图（pause）也有雾：建好时就按错开的年龄摆好了。
//
// userData（stage 3）：
//   setOn(on)          开 / 关：关了不再冒新的（已经冒出来的飘完），水泵的灯跟着换色
//   on                 当前开关
//   setWind([x, z])    风（米/秒，世界方向；默认 [0, 0.7] = 往南）：雾片的漂移
//   nozzles()          喷头的本地坐标（8 个）
//   landing()          雾落下来的那一条（本地 [xMin, xMax, zMin, zMax]，地面）：stage 3 每秒在这里给场地 wet(x, z, r) 一点
//   update(dt)         场景每帧调
import * as THREE from 'three';
import { Parts } from '../../clubsite/tools/kit';
import type { AssetCtx } from '../world';
import { flakeGeo } from './comfort/surface';

const LEN = 9.6;
const PIPE_Y = 2.4;
/** 管子：0.1 米粗（1× 下屏幕上 2 纹素，稳定不闪） */
const PIPE_T = 0.1;
const NOZZLES = Array.from({ length: 8 }, (_, k) => -4.2 + 1.2 * k);
/** 每个喷头几片雾 */
const PER = 6;
/** 一片雾飘多久（秒） */
const LIFE = 2.4;
/** 前多少比例算"浓"（不透明度高的那一层） */
const THICK = 0.45;
/** 风把雾片带走多远（风速 × 寿命 × 这个比例）：看得见的雾只飘 ≈ 1 米，更细的水珠落得更远（landing） */
const DRIFT = 0.6;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'mist-line';

  // ── 管子、喷头、卡箍、竖管、水泵 ─────────────────
  const p = new Parts<'metal' | 'ironwork' | 'counter' | 'concrete'>();
  p.box('metal', LEN, PIPE_T, PIPE_T, 0, PIPE_Y, 0);
  // 两头的堵头（胖一点）
  for (const s of [-1, 1]) p.box('ironwork', 0.12, 0.13, 0.13, (s * LEN) / 2, PIPE_Y, 0);
  // 喷头：管子下面一个往前（南）下斜的小黄铜色……用铸铁色的胖块，1 设计纹素多一点
  for (const x of NOZZLES) p.box('ironwork', 0.11, 0.11, 0.12, x, PIPE_Y - 0.09, 0.04);
  // 卡箍：挂在帆的前梁上（梁底 ≈ 2.445）；两块帆之间的空当（x −0.3…0.3）没有梁，不挂
  for (const x of [-4.2, -2.4, -0.9, 0.9, 2.4, 4.2]) p.box('ironwork', 0.08, 0.06, 0.12, x + 0.3, PIPE_Y + 0.07, 0);
  // 东头：竖管顺着帆的前杆（本地 x +4.5，杆在 z 0）北边下到地上，接一个小水泵
  const DROP_X = 4.62;
  p.box('metal', 0.09, PIPE_Y, 0.09, DROP_X, PIPE_Y / 2, -0.16);
  p.box('metal', 0.2, 0.09, 0.16, DROP_X - 0.06, PIPE_Y, -0.08);
  p.box('counter', 0.42, 0.34, 0.32, DROP_X + 0.1, 0.17, -0.42);
  p.box('concrete', 0.5, 0.05, 0.4, DROP_X + 0.1, 0.025, -0.42);
  const frame = p.build(
    (k) =>
      ctx.mat(k, {
        noShadowReceive: k !== 'concrete',
        // 管子朝镜头的一面 / 水泵正面：光往上偏 + 低 bands → 落中档
        ...(k === 'metal' || k === 'counter' ? { lightUp: 0.3, bands: [-0.5, 0.45] as [number, number] } : {}),
      }),
    'mist-line',
  );
  root.add(frame);
  // 细管子不投影：0.1 米的管子投在场上是一串断断续续的毛边点（噪点）；它的影子本来也落在帆影里
  ctx.mats.prepare(frame, { cast: false });

  // 水泵的小灯：一个 1.5 设计纹素的方块，开 = 青绿亮、关 = 深色（两种材质换）
  const lampOn = ctx.mat('clothTeal', { bands: [-2, -1.1], edge: 0, convex: 0, noShadowReceive: true });
  const lampOff = ctx.mat('ironwork', { noShadowReceive: true });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.04), lampOn);
  lamp.position.set(DROP_X + 0.1, 0.24, -0.42 + 0.17);
  lamp.castShadow = false;
  root.add(lamp);

  // ── 雾 ────────────────────────────────
  // 每层一个专用材质（独特的 bands 让缓存给一个只有雾在用的实例 → 可以放心改成半透明）
  const fogMat = (bandsHi: number, opacity: number) => {
    const m = ctx.mat('clothWhite', {
      bands: [-2, bandsHi],
      edge: 0,
      convex: 0,
      lightUp: 0,
      noShadowReceive: true,
    });
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = false;
    return m;
  };
  const N = NOZZLES.length * PER;
  const geo = flakeGeo();
  const tiers = [fogMat(-1.27, 0.6), fogMat(-1.31, 0.32)].map((m) => {
    const im = new THREE.InstancedMesh(geo, m, N);
    im.layers.set(ctx.layers.FX);
    im.castShadow = false;
    im.receiveShadow = false;
    im.frustumCulled = false;
    im.renderOrder = 2;
    root.add(im);
    return im;
  });

  const rnd = ctx.rng('mist-line:flakes');
  const phase = NOZZLES.map(() => rnd() * LIFE);
  const flakes = Array.from({ length: N }, (_, i) => {
    // 错开的相位：同一个喷头的几片均匀分开（每个喷头一个随机相位），再抖一点
    const offset = (((i % PER) / PER) * LIFE + phase[Math.floor(i / PER)] + rnd() * 0.2) % LIFE;
    return {
      nozzle: NOZZLES[Math.floor(i / PER)],
      offset,
      age: offset,
      jx: rnd() - 0.5,
      jz: rnd(),
      s: 0.85 + rnd() * 0.3,
      alive: true,
    };
  });
  const wind = new THREE.Vector2(0, 0.7);
  let on = true;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  const place = () => {
    const counts = [0, 0];
    for (const f of flakes) {
      if (!f.alive || f.age < 0) continue;
      const k = Math.min(1, f.age / LIFE);
      const tier = k < THICK ? 0 : 1;
      // 位置：喷头下面一点冒出来，先往下喷，再顺风飘（风 × 时间，开始慢），慢慢往下沉
      const ease = k * k * 0.6 + k * 0.4;
      pos.set(
        f.nozzle + f.jx * (0.12 + 0.7 * k) + wind.x * ease * LIFE * DRIFT,
        PIPE_Y - 0.16 - k * 0.6 - k * k * 0.35,
        0.12 + f.jz * 0.15 + 0.25 * k + wind.y * ease * LIFE * DRIFT,
      );
      // 大小：0.26 → 0.68 米宽，最后一段缩回去（散了）
      const w = (0.26 + 0.42 * Math.min(1, k * 1.5)) * f.s * (k > 0.82 ? 1 - (k - 0.82) / 0.18 : 1);
      scl.set(w, w, 1);
      m4.compose(pos, q, scl);
      tiers[tier].setMatrixAt(counts[tier]++, m4);
    }
    tiers.forEach((im, t) => {
      for (let i = counts[t]; i < N; i++) im.setMatrixAt(i, zero);
      im.count = counts[t];
      im.instanceMatrix.needsUpdate = true;
    });
  };

  const update = (dt: number) => {
    for (const f of flakes) {
      if (!f.alive) continue;
      f.age += dt;
      if (f.age >= LIFE) {
        if (on) f.age -= LIFE;
        else f.alive = false;
      }
    }
    place();
  };
  place();

  root.userData.update = (dt: number) => update(Math.min(dt, 0.1));
  root.userData.on = true;
  root.userData.setOn = (v: boolean) => {
    // 重新打开：停了的片按自己的相位排队（年龄为负 = 还没冒出来），不会一下子全喷出来
    if (v && !on) for (const f of flakes) if (!f.alive) Object.assign(f, { alive: true, age: -f.offset });
    on = v;
    root.userData.on = v;
    lamp.material = v ? lampOn : lampOff;
  };
  root.userData.setWind = (w: [number, number] | THREE.Vector2) => {
    if (Array.isArray(w)) wind.set(w[0], w[1]);
    else wind.copy(w);
  };
  root.userData.nozzles = () => NOZZLES.map((x) => new THREE.Vector3(x, PIPE_Y - 0.12, 0.06));
  // 雾落下来的那一条：喷头下风 ≈ 2～4 米（默认风往南 → z +2…+4）
  root.userData.landing = () => {
    const reach = wind.length() * LIFE * DRIFT;
    const dir = wind.lengthSq() > 1e-6 ? wind.clone().normalize() : new THREE.Vector2(0, 1);
    const cx = dir.x * (reach + 2);
    const cz = dir.y * (reach + 2);
    return [-LEN / 2 + cx, LEN / 2 + cx, cz - 1, cz + 1];
  };
  return root;
}
