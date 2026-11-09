// crowd：看台上坐着的观众（便宜！）。每种颜色一个 InstancedMesh（衣服 5 + 皮肤 3 + 帽子 2 = 10 次 draw call），
// 动画全在顶点着色器里（stands/crowd-shader.ts）：鼓掌、站起来欢呼、人浪、转头跟球、按块进场 / 散场。
// 座位和看台的座椅条是同一个格子（stands/seats.ts：座位边 = 0.56 米的整数倍）。本地坐标 = 世界坐标（SLOTS 放在原点）。
//
// 颜色规则（防止看台变成一片彩色噪点；layout.ts CROWD 的注释）：
//  - 衣服只用 5 种：白、奶油（大多数，七成）、俱乐部蓝、红、黄；不用青绿（总监的颜色）、不用紫。块和块的主色不一样（CROWD.shirts）。
//  - 2～4 个连座一组（三成五的组后面空一个座），一组人一半同色 → 一小团一小团的人；进场 / 散场也按组。
//  - 六成戴帽子（草帽 / 白帽两种浅色）：45° 俯视里帽子就是头，每排人是一条浅色的点子带。
//  - 空位成片（两头、最上面几排的两边），露出深青绿的座椅 = 看台上安静的地方。
//  - 不投影、不接收投影（几百个小影子 = 噪点）；描边比别的人物弱一点（人群是整帧最大的强边缘来源）。
//
// stage 3 用的接口（都在返回对象的 userData 上，也打包成 userData.crowd）：
//   setMode('idle' | 'clap' | 'cheer' | 'wave')  —— 闲着（偶尔转头）/ 鼓掌 / 全场站起来欢呼 / 人浪（沿马蹄形一圈一圈地走）
//   cheer(strength = 1, seconds = 2.2, x?, r = 8)  —— 好球：站起来欢呼一下再回到原来的模式；strength = 站起来的人占多少，
//                                                    给 x 就只有 |座位 x − x| < r 的人站（一块看台为一个好球站起来）
//   wave(dir = 1)                                  —— 开始人浪（1 = 北看台从西往东，−1 反过来）；setMode('idle') 停
//   lookAt(point | x | null)                       —— 头跟着看一个点（球）；null = 不看
//   fill(f, seconds = 6)                           —— 全场坐多满 0..1（1 = layout.ts CROWD 定的上座率），按组陆续进场 / 散场
//   setFill(block, f, seconds = 6)                 —— 某一块（CROWD 的下标）坐多满：一块一块地进场 / 走空
//   count / blocks / stats                         —— 人数、每块的人数、三角形和 draw call
// URL（场景里试）：crowdMode=clap|cheer|wave、crowdFill=0..1、crowdLook=x,z（配 warm=秒 看某一刻）；crowd=grey 换成灰的。
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { CROWD } from '../layout';
import type { Pal } from '../palette';
import { build as buildStands } from './stadium-stands';
import { type CrowdUniforms, crowdMaterial, crowdUniforms, MAX_BLOCKS } from './stands/crowd-shader';
import { GeoBuf } from './stands/geo';
import { type Seat, seatList, WAVE_LOOP, waveCoord } from './stands/seats';

/** 人物的明暗（光往上偏 → 朝镜头的胸口落中档，头顶、帽顶、肩落亮档；不接收投影） */
const PERSON = { lightUp: 0.6, bands: [-0.45, 0.3] as [number, number], noShadowReceive: true };
const EDGE = 0.35;
const CONVEX = 0.3;
const SHIRTS: (keyof Pal)[] = ['clothWhite', 'canvas', 'clothBlue', 'clothRed', 'flowerYellow'];
const SKINS: (keyof Pal)[] = ['skinLight', 'skinTan', 'skinDark'];
const HATS: (keyof Pal)[] = ['straw', 'clothWhite'];
const SKIN_W = [4, 3, 2];
const HAT_W = [3, 2];
const HAT_P = 0.6;

export type CrowdMode = 'idle' | 'clap' | 'cheer' | 'wave';

/**
 * 一个人的几何体（本地：原点 = 座面中心，人朝 +z）。aRig：x = 胳膊带符号权重（左 −、右 +；0 肩 → 1 手），y = 大腿前端权重（手 = −1）。
 * 省三角形：看不见的面不画（底面、贴着身子的面）；胳膊、大腿、帽檐的左右侧面在 yaw 0 下是侧对镜头的，也不画
 * （东看台的人侧着坐，从侧面看胳膊薄成一片，正好）。一人：身子 30 + 头 10 + 两只手 8 + 帽子 12 = 60（不戴帽子 48）。
 */
function bodyGeo(): THREE.BufferGeometry {
  const b = new GeoBuf();
  b.box(-0.17, 0.17, 0, 0.44, -0.15, 0.07, ['ny']); // 上身
  b.rigAt = (p) => [0, Math.max(0, (p.z - 0.07) / 0.26)];
  b.box(-0.16, 0.16, 0, 0.13, 0.07, 0.33, ['ny', 'nz', 'px', 'nx']); // 大腿（膝盖朝前）
  for (const side of [-1, 1]) {
    b.rigAt = (p) => [side * Math.min(1, Math.max(0, (0.44 - p.y) / 0.34)), 0];
    const [x0, x1] = side < 0 ? [-0.26, -0.17] : [0.17, 0.26];
    b.box(x0, x1, 0.1, 0.44, -0.1, 0.0, ['px', 'nx']); // 胳膊（垂在身侧，肩 → 手）
  }
  return b.geo(true);
}
/** 大头（Q 版：0.34 见方，球面法线 → 亮顶、中腰、暗下巴）+ 两只手（皮肤色，跟着胳膊走：鼓掌合在胸前、欢呼举过头顶） */
function headGeo(): THREE.BufferGeometry {
  const b = new GeoBuf();
  b.box(-0.17, 0.17, 0.44, 0.78, -0.15, 0.17, ['ny']);
  const nHead = b.pos.length / 3;
  for (const side of [-1, 1]) {
    b.rigAt = () => [side, -1];
    const [x0, x1] = side < 0 ? [-0.255, -0.175] : [0.175, 0.255];
    b.faceZ(x0, x1, 0.1, 0.17, 0.03);
    b.faceY(x0, x1, -0.05, 0.03, 0.17);
  }
  const g = b.geo(true);
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const c = new THREE.Vector3(0, 0.58, 0.01);
  const v = new THREE.Vector3();
  for (let i = 0; i < nHead; i++) {
    v.fromBufferAttribute(p, i).sub(c).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
/** 帽子：宽檐（前面多伸一点）+ 帽顶；檐的上沿在描边里是一纹素亮边 */
function hatGeo(): THREE.BufferGeometry {
  const b = new GeoBuf();
  b.box(-0.24, 0.24, 0.73, 0.77, -0.2, 0.27, ['ny', 'px', 'nx']);
  b.box(-0.15, 0.15, 0.77, 0.88, -0.14, 0.15, ['ny', 'px', 'nx']);
  return b.geo(true);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const grey = ctx.params.get('crowd') === 'grey';
  const rnd = ctx.rng('crowd:people');
  const root = new THREE.Group();
  root.name = 'crowd';
  const U: CrowdUniforms = crowdUniforms(ctx.texel / 2);

  // ── 谁坐哪：按段（同一排连续的座位）切成 2～4 人一组，组的名次一样（一起进场、一起走），组后面空 0～1 个座 ──
  const pick = (w: number[]) => {
    const sum = w.reduce((a, b) => a + b, 0);
    let r = rnd() * sum;
    for (let i = 0; i < w.length; i++) {
      r -= w[i];
      if (r <= 0) return i;
    }
    return w.length - 1;
  };
  interface Person {
    s: Seat;
    shirt: number;
    skin: number;
    hat: number; // −1 = 不戴
    rank: number;
    ph: number;
  }
  const people: Person[] = [];
  // 画廊（?asset=crowd）：只坐北看台，底下垫上看台（stadium-stands 的画廊版），不然几百个人悬在半空
  const gallery = ctx.params.get('asset') === 'crowd';
  const all = seatList().filter((s) => !gallery || s.stand === 'north');
  let i = 0;
  while (i < all.length) {
    const s0 = all[i];
    if (s0.block < 0) {
      i++;
      continue;
    }
    const b = CROWD[s0.block];
    const base = b.fill[s0.row] ?? 0;
    const n = 2 + Math.floor(rnd() * 3);
    const r = rnd();
    const groupShirt = pick(b.shirts);
    const groupHat = rnd() < 0.5 ? pick(HAT_W) : -1;
    for (let j = 0; j < n && i < all.length; j++, i++) {
      const s = all[i];
      if (s.run !== s0.run || s.block !== s0.block) break;
      if (r >= base) continue;
      const hat = rnd() < HAT_P ? (groupHat >= 0 && rnd() < 0.6 ? groupHat : pick(HAT_W)) : -1;
      people.push({
        s,
        shirt: rnd() < 0.5 ? groupShirt : pick(b.shirts),
        skin: pick(SKIN_W),
        hat,
        rank: (r / base) * 0.92,
        ph: rnd(),
      });
    }
    if (rnd() < 0.35 && i < all.length && all[i].run === s0.run) i++;
  }

  // ── 每种颜色一个 InstancedMesh ──
  const mats = new Map<string, THREE.MeshToonMaterial>();
  const matFor = (key: keyof Pal, part: number) => {
    const id = `${key}:${part}`;
    let m = mats.get(id);
    if (!m) {
      m = crowdMaterial(
        ctx.mat(grey ? 'placeholder' : key, { ...PERSON, edge: EDGE, convex: CONVEX }),
        U,
        part,
        EDGE,
        CONVEX,
      );
      mats.set(id, m);
    }
    return m;
  };
  const geos = { body: bodyGeo(), head: headGeo(), hat: hatGeo() };
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const jit = people.map(() => ({ dx: (rnd() - 0.5) * 0.06, yaw: (rnd() - 0.5) * 0.08, s: 0.92 + rnd() * 0.14 }));
  let tris = 0;
  let calls = 0;
  const inst = (geo: THREE.BufferGeometry, key: keyof Pal, part: number, who: number[], name: string) => {
    if (!who.length) return;
    const g = geo.clone();
    const aCr = new Float32Array(who.length * 4);
    const im = new THREE.InstancedMesh(g, matFor(key, part), who.length);
    who.forEach((pi, k) => {
      const p = people[pi];
      const j = jit[pi];
      pos.set(p.s.x + j.dx, p.s.y, p.s.z);
      q.setFromEuler(e.set(0, p.s.rotY + j.yaw, 0));
      mtx.compose(pos, q, scl.setScalar(j.s));
      im.setMatrixAt(k, mtx);
      aCr.set([p.ph, p.s.block, waveCoord(p.s), p.rank], k * 4);
    });
    g.setAttribute('aCr', new THREE.InstancedBufferAttribute(aCr, 4));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = false;
    im.receiveShadow = false;
    im.frustumCulled = false;
    im.name = name;
    root.add(im);
    tris += (g.getAttribute('position').count / 3) * who.length;
    calls++;
  };
  const idx = people.map((_, k) => k);
  SHIRTS.forEach((k, j) => {
    inst(
      geos.body,
      k,
      0,
      idx.filter((p) => people[p].shirt === j),
      `crowd:body:${k}`,
    );
  });
  SKINS.forEach((k, j) => {
    inst(
      geos.head,
      k,
      1,
      idx.filter((p) => people[p].skin === j),
      `crowd:head:${k}`,
    );
  });
  HATS.forEach((k, j) => {
    inst(
      geos.hat,
      k,
      2,
      idx.filter((p) => people[p].hat === j),
      `crowd:hat:${k}`,
    );
  });

  // ── stage 3 的接口：模式、看球、上座率（CPU 只缓动几个 uniform） ──
  const st = {
    mode: 'idle' as CrowdMode,
    target: new THREE.Vector4(0, 0, 0, 1),
    cheerUntil: -1,
    cheerK: 0,
    waveDir: 1,
    lookK: 0,
    look: null as THREE.Vector3 | null,
    fillAll: 1,
    fillAllTo: 1,
    fillAllRate: 1 / 6,
    blocks: CROWD.map(() => ({ f: 1, to: 1, rate: 1 / 6 })),
    t: 0,
  };
  const MODES: Record<CrowdMode, [number, number, number, number]> = {
    idle: [0, 0, 0, 1],
    clap: [1, 0, 0, 0],
    cheer: [0.4, 1, 0, 0],
    wave: [0, 0, 1, 0.5],
  };
  const setMode = (m: CrowdMode) => {
    st.mode = m;
    st.target.set(...MODES[m]);
    if (m === 'wave' && U.uCrWave.value.x < -100) U.uCrWave.value.x = st.waveDir > 0 ? -4 : WAVE_LOOP + 4;
    if (m !== 'wave') U.uCrWave.value.x = -999;
  };
  const toward = (a: number, b: number, d: number) => (a < b ? Math.min(b, a + d) : Math.max(b, a - d));
  const api = {
    setMode,
    cheer(strength = 1, seconds = 2.2, x?: number, radius = 8) {
      st.cheerK = 1;
      st.cheerUntil = st.t + seconds;
      U.uCrCheer.value.set(x ?? 0, x === undefined ? 0 : radius, THREE.MathUtils.clamp(strength, 0, 1));
    },
    wave(dir = 1) {
      st.waveDir = dir >= 0 ? 1 : -1;
      U.uCrWave.value.x = -999;
      setMode('wave');
    },
    lookAt(p: THREE.Vector3 | { x: number; y?: number; z?: number } | number | null) {
      if (p === null) {
        st.look = null;
        return;
      }
      st.look = typeof p === 'number' ? new THREE.Vector3(p, 1, -21) : new THREE.Vector3(p.x, p.y ?? 1, p.z ?? -21);
      U.uCrLook.value.x = st.look.x;
      U.uCrLook.value.y = st.look.y;
      U.uCrLook.value.z = st.look.z;
    },
    fill(f: number, seconds = 6) {
      st.fillAllTo = THREE.MathUtils.clamp(f, 0, 1);
      st.fillAllRate = seconds > 0 ? 1 / seconds : 1e9;
      if (seconds <= 0) st.fillAll = st.fillAllTo;
    },
    setFill(block: number, f: number, seconds = 6) {
      const b = st.blocks[block];
      if (!b) return;
      b.to = THREE.MathUtils.clamp(f, 0, 1);
      b.rate = seconds > 0 ? 1 / seconds : 1e9;
      if (seconds <= 0) b.f = b.to;
    },
    get mode() {
      return st.mode;
    },
    count: people.length,
    blocks: CROWD.map((_, bi) => people.filter((p) => p.s.block === bi).length),
    stats: {
      people: people.length,
      triangles: tris,
      drawCalls: calls,
      perPerson: Math.round(tris / Math.max(1, people.length)),
    },
  };
  const update = (dt: number) => {
    st.t += dt;
    U.uCrT.value = st.t;
    // 模式权重缓动（0.5 秒）；cheer() 的那一下叠在上面
    const m = U.uCrMode.value;
    const k = dt / 0.5;
    const cheering = st.t < st.cheerUntil;
    m.x = toward(m.x, cheering ? st.target.x * 0.3 : st.target.x, k);
    m.y = toward(m.y, cheering ? Math.max(st.target.y, st.cheerK) : st.target.y, k * 1.2);
    // 欢呼模式（setMode('cheer')）是全场；cheer() 那一下结束、落座以后把范围还原
    if (!cheering && m.y <= st.target.y) U.uCrCheer.value.set(0, 0, 1);
    m.z = toward(m.z, st.target.z, k);
    m.w = toward(m.w, st.target.w, k);
    if (st.mode === 'wave') {
      const w = U.uCrWave.value;
      w.x += st.waveDir * 12 * dt;
      if (w.x > WAVE_LOOP) w.x -= WAVE_LOOP;
      if (w.x < 0) w.x += WAVE_LOOP;
    }
    st.lookK = toward(st.lookK, st.look ? 1 : 0, dt / 0.3);
    U.uCrLook.value.w = st.lookK;
    st.fillAll = toward(st.fillAll, st.fillAllTo, st.fillAllRate * dt);
    let moving = st.fillAll !== st.fillAllTo;
    st.blocks.forEach((b, bi) => {
      b.f = toward(b.f, b.to, b.rate * dt);
      if (b.f !== b.to) moving = true;
      if (bi < MAX_BLOCKS) U.uCrFill.value[bi] = b.f * st.fillAll;
    });
    U.uCrBand.value = toward(U.uCrBand.value, moving ? 0.08 : 0, dt / 0.6);
  };
  Object.assign(root.userData, api, { crowd: api, update: (dt: number) => update(dt) });

  // 场景里试：?crowdMode=clap|cheer|wave、crowdFill=0..1、crowdLook=x,z
  const pm = ctx.params.get('crowdMode') as CrowdMode | null;
  if (pm && pm in MODES) setMode(pm);
  if (ctx.params.has('crowdFill')) api.fill(Number(ctx.params.get('crowdFill')), 0);
  const pl = ctx.params.get('crowdLook');
  if (pl) {
    const [x, z] = pl.split(',').map(Number);
    api.lookAt({ x, y: 1, z: z ?? -21 });
  }
  update(0);
  if (gallery) root.add(buildStands(ctx));
  return root;
}
