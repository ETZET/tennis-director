// cast：人物一览 —— 用 clubsite/people 建好 Q 版人，再按 CastLook 换装（clubsite/people/dress.ts），一排排站在一块地上，脚下一个名字小牌。
// 渲染同各俱乐部场景（clubsite/render：低分辨率正交、纹素对齐、描边、三档色阶；配色默认 golden 午后金光）。
// URL：
//   set=test|named   test = 覆盖全部发型 / 帽子 / 配饰 / 下装 / 体型 / 制服的测试组（第一排是场景原样，对照）；
//                    named = cast/named.ts 的 NAMED（按 role 分排）；不给 = 有 NAMED 用 NAMED，没有用 test
//   pose=<姿势>&phase=<0..1>&prop=<道具>   全体换姿势（同 clubsite/people 的画廊参数；不给 phase = 播放）
//   yaw=<度>        人全体转过去（90 = 侧面朝镜头、180 = 背面）；转人不转镜头 = 场景里的光照下看侧面背面。右下 ⟳ 每次转 90°
//   zoom=<米/纹素>   默认 0.045 × px（同场景：px 1 时人 ≈ 40 像素高）· px=<每纹素 CSS 像素>（默认 1）· pal=<配色>
//   pitch=<度>（默认 45）· row=<n> 从第 n 排开始看 · pause=1 不动（截图）· labels=0 不要小牌 · cols=<每排几个，默认 5>
//   only=<名字片段,…>   只看这几个人（特写）
// 手机竖屏：上下拖动画面浏览（或右下 ▲ ▼ 翻页）。
import '../clubsite/render/colors';
import * as THREE from 'three';
import { CLOTH, hex } from '../clubsite/cast/colors';
import type { CastLook, CastPerson, Role } from '../clubsite/cast/types';
import { ballKid, coach, director, kid, player, umpire } from '../clubsite/people';
import { createDresser } from '../clubsite/people/dress';
import type { BaseCtx } from '../clubsite/render/ctx';
import { rngFactory } from '../clubsite/render/noise';
import { PAL, type Pal, SKY } from '../clubsite/render/palette';
import { schemeById, schemeMats, schemeOpts } from '../clubsite/render/palettes';
import { PixelPipeline } from '../clubsite/render/pipeline';
import { CLOUD_N, createMats, type ToonOpts } from '../clubsite/render/toon';
import { TEST } from './test-set';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const deg = Math.PI / 180;
const scheme = schemeById(params.get('pal'));

// ── 数据：NAMED（别的代理在写；没有就用测试组）──
const NAMED_MOD = import.meta.glob<{ NAMED?: CastPerson[] }>('../clubsite/cast/named.ts', { eager: true });
const NAMED = Object.values(NAMED_MOD)[0]?.NAMED ?? null;
const SET = params.get('set') ?? (NAMED?.length ? 'named' : 'test');

type Kind = 'player' | 'coach' | 'kid' | 'ball-kid' | 'umpire' | 'director';
export interface Entry {
  name: string;
  sub: string;
  kind: Kind;
  variant: number;
  /** 不给 = 场景原样（对照） */
  look?: CastLook;
  /** 这个人单独摆的姿势（URL 的 pose 优先） */
  pose?: string;
}
interface RowDef {
  title: string;
  people: Entry[];
}

const ROLE_ORDER: Role[] = ['member', 'guest', 'parent', 'kid', 'coach', 'staff', 'vendor', 'pro'];
const ROLE_NAME: Record<Role, string> = {
  member: '会员',
  guest: '客人',
  kid: '孩子',
  parent: '家长',
  coach: '教练',
  staff: '员工',
  vendor: '摊主',
  pro: '职业球员',
};
const hashId = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
};
function namedRows(list: CastPerson[]): RowDef[] {
  const rows: RowDef[] = [];
  for (const r of ROLE_ORDER) {
    const ps = list.filter((p) => p.role === r);
    if (!ps.length) continue;
    rows.push({
      title: `${ROLE_NAME[r]} · ${ps.length}`,
      people: ps.map((p) => ({
        name: p.name,
        sub: p.title,
        kind:
          p.look.body === 'kid' ? 'kid' : p.look.body === 'teen' ? 'ball-kid' : p.role === 'coach' ? 'coach' : 'player',
        variant: hashId(p.id) % 4,
        look: p.look,
      })),
    });
  }
  return rows;
}
const ROWS0: RowDef[] = SET === 'named' && NAMED?.length ? namedRows(NAMED) : TEST;
/** ?only=名字片段,名字片段：只看这几个人（调试、特写） */
const ONLY = params.get('only')?.split(',').filter(Boolean) ?? null;
const ROWS: RowDef[] = ONLY
  ? ROWS0.map((r) => ({
      ...r,
      people: r.people.filter((e) => ONLY.some((k) => `${e.name} ${e.sub}`.includes(k))),
    })).filter((r) => r.people.length)
  : ROWS0;

// ── 渲染 ──
const canvas = document.getElementById('c') as HTMLCanvasElement;
const labelsEl = document.getElementById('labels') as HTMLDivElement;
const infoEl = document.getElementById('info') as HTMLDivElement;
const uniforms = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(0.3, 0.1) },
  uGust: { value: 0.5 },
  uClouds: { value: Array.from({ length: CLOUD_N }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uCloudVel: { value: new THREE.Vector2(0, 0) },
  uCloudStrength: { value: 0 },
};
const scene = new THREE.Scene();
const sky = scheme?.sky ?? SKY;
scene.background = new THREE.Color(sky.horizon);
document.body.style.background = hex(sky.top);

const PX = num('px', 1);
const MPT = 0.09;
const zoom = num('zoom', (MPT * PX) / 2);
const designTexel = MPT;
const edges = {
  depthStrength: num('dstr', scheme?.edges?.depthStrength ?? 0.48),
  normalStrength: num('nstr', scheme?.edges?.normalStrength ?? 0.6),
  topStrength: num('tstr', scheme?.edges?.topStrength ?? 0.35),
  tint: scheme?.edgeTint,
};
const pipe = new PixelPipeline(canvas, {
  px: PX,
  fxLayer: 1,
  rig: { target: new THREE.Vector3(0, 0, 0), yaw: 0, pitch: num('pitch', 45) * deg, metersPerTexel: zoom },
  edges,
});

// 太阳：同各场景（SUN el 44、az 8：画面后方偏东一点）
const sun = new THREE.DirectionalLight(scheme?.sun ?? 0xfff0d8, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 4;
scene.add(sun, sun.target);
const SUN_DIR = (() => {
  const el = 44 * deg;
  const az = 8 * deg;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
})();

// ── 材质（同 clubpark 的 kit：调色板名字 → 参数 → 配色方案）──
const mats = createMats(uniforms, () => pipe.rig.metersPerTexel);
function palOpts(key: keyof Pal, extra?: ToonOpts): ToonOpts {
  const sw = PAL[key];
  const o: ToonOpts = {
    ramp: sw.ramp,
    edge: sw.edge,
    convex: sw.convex,
    tones: sw.tones,
    ...('opts' in sw ? sw.opts : {}),
    ...extra,
  };
  return scheme ? schemeOpts(scheme, key, o) : o;
}
/** 人物的画廊参数（pose / phase / prop）照传给 clubsite/people */
const personParams = new URLSearchParams();
for (const k of ['pose', 'phase', 'prop', 'seat', 'foot']) {
  const v = params.get(k);
  if (v !== null) personParams.set(k, v);
}
const ctxBase = {
  mats: scheme ? schemeMats(scheme, mats) : mats,
  pal: PAL,
  mat: (key: keyof Pal, extra?: ToonOpts) => mats.toon(0xffffff, palOpts(key, extra)),
  rng: rngFactory(7),
  uniforms,
  layers: { FX: 1 },
  texel: designTexel,
  params: personParams,
};
const ctxFor = (variant: number) => ({ ...ctxBase, variant }) as unknown as BaseCtx;
const dresser = createDresser({ mats, scheme });

// ── 地面 ──
const COLS = num('cols', 5);
const DX = 2.4;
const DZ = 4.4;
const ROW_GAP = 1.8;
interface Placed {
  obj: THREE.Object3D;
  e: Entry;
  at: THREE.Vector3;
}
const placed: Placed[] = [];
const rowLabels: { title: string; at: THREE.Vector3 }[] = [];
let z = 0;
const rowZ: number[] = [];
for (const row of ROWS) {
  rowLabels.push({ title: row.title, at: new THREE.Vector3(-(COLS - 1) * DX * 0.5 - 0.9, 0, z - 2.7) });
  for (let i = 0; i < row.people.length; i += COLS) {
    rowZ.push(z);
    const chunk = row.people.slice(i, i + COLS);
    chunk.forEach((e, j) => {
      const x = (j - (COLS - 1) / 2) * DX;
      placed.push({ obj: build(e), e, at: new THREE.Vector3(x, 0, z) });
    });
    z += DZ;
  }
  z += ROW_GAP;
}
const zMax = z;

function build(e: Entry): THREE.Object3D {
  const c = ctxFor(e.variant);
  const o =
    e.kind === 'coach'
      ? coach(c)
      : e.kind === 'kid'
        ? kid(c)
        : e.kind === 'ball-kid'
          ? ballKid(c)
          : e.kind === 'umpire'
            ? umpire(c)
            : e.kind === 'director'
              ? director(c)
              : player(c);
  if (e.look) dresser.dress(o, e.look);
  if (e.pose && !params.has('pose')) o.userData.pose?.(e.pose);
  return o;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(COLS * DX + 6, zMax + 10).rotateX(-Math.PI / 2),
  ctxBase.mat('sand', { edge: 0.05, convex: 0 }),
);
ground.position.set(0, 0, zMax / 2 - 2);
ground.receiveShadow = true;
scene.add(ground);

const yaw0 = num('yaw', 0) * deg;
let turn = yaw0;
for (const p of placed) {
  p.obj.position.copy(p.at);
  p.obj.rotation.y = -turn;
  scene.add(p.obj);
}
mats.prepare(scene);
for (const p of placed) p.obj.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.receiveShadow = false) : null));
const updaters = placed.map((p) => p.obj.userData.update as ((dt: number) => void) | undefined).filter(Boolean) as ((
  dt: number,
) => void)[];

// ── 名字小牌 ──
interface Label {
  el: HTMLDivElement;
  p: THREE.Vector3;
  /** 左对齐（排名） */
  left?: boolean;
}
const labels: Label[] = [];
if (params.get('labels') !== '0') {
  for (const p of placed) {
    const el = document.createElement('div');
    el.className = 'tag';
    const acc = p.e.look ? CLOTH[p.e.look.accent ?? p.e.look.shirt][0] : 0xfff3d6;
    el.style.setProperty('--accent', hex(acc));
    el.textContent = p.e.name;
    const s = document.createElement('small');
    s.textContent = p.e.sub;
    el.append(s);
    labelsEl.append(el);
    labels.push({ el, p: p.at.clone().add(new THREE.Vector3(0, 0, 0.9)) });
  }
  for (const r of rowLabels) {
    const el = document.createElement('div');
    el.className = 'row';
    el.textContent = r.title;
    labelsEl.append(el);
    labels.push({ el, p: r.at, left: true });
  }
}
const v3 = new THREE.Vector3();
function placeLabels() {
  const cam = pipe.camera;
  const low = pipe.lowSize;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  const lowW = low.x * pipe.px;
  const lowH = low.y * pipe.px;
  for (const l of labels) {
    v3.copy(l.p).project(cam);
    const x = ((v3.x + 1) / 2) * lowW - (lowW - W) / 2;
    const y = ((1 - v3.y) / 2) * lowH - (lowH - H) / 2;
    const off = y < -60 || y > H + 20;
    l.el.style.display = off ? 'none' : '';
    if (!off)
      l.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(${l.left ? '0' : '-50%'}, 0)`;
  }
}

// ── 镜头：竖着滚（拖动 / 滚轮 / 翻页按钮）──
/** 看向点的 z（世界）；第一排在画面上方 */
const viewH = () => (canvas.clientHeight * zoom) / PX / Math.sin(pipe.rig.pitch);
let camZ = 0;
const clampZ = (v: number) =>
  THREE.MathUtils.clamp(v, viewH() * 0.5 - 4.5, Math.max(viewH() * 0.5 - 4.5, zMax - viewH() * 0.4));
function setCam(v: number) {
  camZ = clampZ(v);
  pipe.rig.target.set(0, 0, camZ);
  sun.target.position.set(0, 0, camZ);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 80);
  const r = viewH() * 0.75 + 6;
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 200 });
  sun.shadow.camera.updateProjectionMatrix();
}
function resize() {
  const dpr = Math.min(devicePixelRatio, 3);
  pipe.resize(canvas.clientWidth, canvas.clientHeight, dpr);
  setCam(camZ);
}
addEventListener('resize', resize);
resize();
setCam(params.has('row') ? (rowZ[num('row', 0)] ?? 0) + viewH() * 0.5 - 4.5 : 0);

let drag: { id: number; y: number; z: number } | null = null;
canvas.addEventListener('pointerdown', (ev) => {
  drag = { id: ev.pointerId, y: ev.clientY, z: camZ };
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag || ev.pointerId !== drag.id) return;
  // 画面往上拖 = 往下看（z 变大）；屏幕 1 像素 = zoom / PX 米 / sin(俯角)
  setCam(drag.z + ((drag.y - ev.clientY) * zoom) / PX / Math.sin(pipe.rig.pitch));
});
const endDrag = () => {
  drag = null;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (ev) => setCam(camZ + (ev.deltaY * zoom) / PX), { passive: true });
const page = (d: number) => setCam(camZ + d * viewH() * 0.8);
document.getElementById('up')?.addEventListener('click', () => page(-1));
document.getElementById('down')?.addEventListener('click', () => page(1));
document.getElementById('turn')?.addEventListener('click', () => {
  turn += Math.PI / 2;
  for (const p of placed) p.obj.rotation.y = -turn;
});

const nPeople = placed.length;
const nOwn = placed.reduce((n, p) => {
  let k = 0;
  p.obj.traverse((o) => {
    if (String(o.userData.part ?? '').startsWith('dress:')) k++;
  });
  return n + k;
}, 0);
infoEl.textContent = `cast · ${SET === 'named' && NAMED?.length ? 'named' : 'test'} · ${nPeople} 人 · 换装加的网格 ${nOwn}（每人 ${(nOwn / Math.max(1, nPeople)).toFixed(1)}）`;

// ── 循环 ──
const paused = params.get('pause') === '1';
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    uniforms.uTime.value += dt;
    for (const u of updaters) u(dt);
  }
  pipe.render(scene);
  placeLabels();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// 截图 / 调试
(window as unknown as { __cast: unknown }).__cast = { scene, placed, setCam, dresser, rows: ROWS };
