// 导航体检（?audit=1）：画面上看着能走的地方和导航真能走的地方对一对。
// 按 0.1 米一格，把场景从正上方和四个斜 35° 的方向各渲一遍（覆盖材质输出片元的世界坐标，竖着的围网、墙面斜着看才有面积），
// 每格的参考高度 R = 导航的地面高度（不能走的格子取最近能走那格的）：
//   - 身体那一层（R + 0.3 … R + 1.8）里有面片 = 挡路的东西（障碍）；
//   - R + 0.3 以下最高的面片 = 地面（R − 2 以下不算，太高的天棚 / 树冠丢掉）。
// 四种对不上的：
//   A 穿模：导航能站（含身体半径），但身体里 0.18 米内有障碍（人身子扎进东西里 ≥ 0.1 米）；
//   B 空气墙：导航不让走（中心不在能走的范围里或在挡路形状里），画面上是平的地面、0.45 米内没有障碍，
//     而且从游戏相机（yaw 0、俯角 45°）看得见这块地面（被围网、天棚挡住的地方本来就不让进，不算）；
//   C 脚不着地：导航能走、这格没障碍，地面和导航高度差 > 0.12 米（飘着 / 陷进去）；
//   D 踩空：导航能走，这格什么面都没有。
// 结果：每种连通成片（> 0.25 m²）列出来，外加一张俯视的对照图（data URL）。调试用，游戏里不加载。
import * as THREE from 'three';
import type { Play } from '../clubsite/play';
import type { Rect } from '../clubsite/world';
import { exceptionOf } from './nav-exceptions';

export interface AuditApi {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  play: Play;
  /** 把这块范围里的区域都显示出来（底图那块藏掉），世界矩阵算好 */
  show(rect: Rect): void;
}

export interface AuditOpts {
  /** 格子边长（米，默认 0.1） */
  cell?: number;
  /** 斜看的角度（度，默认 35） */
  tilt?: number;
  /** 渲染时一个像素多少米（默认 0.04） */
  px?: number;
  /** 在场景里贴标记（截图看） */
  overlay?: boolean;
  /** 量这几个点的画面地面 / 导航高度（返回 probes） */
  probe?: [number, number][];
}

export interface Cluster {
  kind: 'A' | 'B' | 'C' | 'D';
  area: number;
  cx: number;
  cz: number;
  box: Rect;
  /** C：地面 − 导航高度的平均；A：障碍顶的平均高出 R */
  dh?: number;
  /** B：这片挨着导航能走的地方（走过去会被挡住） */
  touches?: boolean;
  /** 附近有名字的东西（摆件 id、人） */
  near?: string[];
  /** 属于哪条例外（clubwalk/nav-exceptions.ts）：验收不算 */
  exc?: string;
}

const BODY_LO = 0.3;
const BODY_HI = 1.8;
const FLOOR_LO = -2;

export function installAudit(api: AuditApi) {
  const { scene, renderer, play } = api;
  const nav = play.nav;

  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const uni = {
    uR: { value: null as THREE.DataTexture | null },
    uRB: { value: new THREE.Vector4() },
    /** 1 = 游戏相机那一遍：不按身体那层丢面片（天棚、树冠照样挡） */
    uAll: { value: 0 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvW = (inverse(viewMatrix) * mvPosition).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vW;\nuniform sampler2D uR;\nuniform vec4 uRB;\nuniform float uAll;',
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec2 uv = (vW.xz - uRB.xy) / uRB.zw;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
        float R = texture2D(uR, uv).r;
        if (uAll < 0.5 && (vW.y > R + ${BODY_HI.toFixed(2)} || vW.y < R + ${FLOOR_LO.toFixed(2)})) discard;
        vec4 diffuseColor = vec4( diffuse, opacity );`,
      )
      .replace(/}\s*$/, 'gl_FragColor = vec4(vW, 1.0);\n}');
  };
  mat.customProgramCacheKey = () => 'nav-audit';

  /** 不算进画面的：总监（连手里的）、线 / 点 / 精灵、山和天幕 */
  function skip(o: THREE.Object3D): boolean {
    // 人（演出里的、底图的）照样算：画面上看得见、会动的有挡路圆。只拿掉总监自己
    if (o === play.director) return true;
    if ((o as THREE.Line).isLine || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) return true;
    if (o.name.startsWith('mtn') || o.name === 'sky' || o.name === 'dome') return true;
    if (o.name === 'nav-audit-overlay') return true;
    return false;
  }

  async function run(area: Rect, opts: AuditOpts = {}) {
    const cell = opts.cell ?? 0.1;
    const tilt = ((opts.tilt ?? 35) * Math.PI) / 180;
    const pxM = opts.px ?? 0.04;
    api.show(area);
    // ── 导航 ──
    const M = 4; // R 的范围比体检范围宽这么多（斜着看会看到外面）
    const RA: Rect = { x0: area.x0 - M, x1: area.x1 + M, z0: area.z0 - M, z1: area.z1 + M };
    const nx = Math.ceil((RA.x1 - RA.x0) / cell);
    const nz = Math.ceil((RA.z1 - RA.z0) / cell);
    const N = nx * nz;
    const navH = new Float32Array(N).fill(Number.NaN);
    const free = new Uint8Array(N);
    const stand = new Uint8Array(N);
    const cx = (i: number) => RA.x0 + (i + 0.5) * cell;
    const cz = (j: number) => RA.z0 + (j + 0.5) * cell;
    // 会动的挡路圆（停着的车、人）：这一刻的
    const circ = play.blockerCircles();
    const inCirc = (x: number, z: number, r: number) => circ.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + r);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const x = cx(i);
        const z = cz(j);
        const h = nav.height(x, z);
        const k = j * nx + i;
        if (h === null) continue;
        navH[k] = h;
        if (!nav.hitsBlocked(x, z, 0) && !inCirc(x, z, 0)) free[k] = 1;
        if (nav.standAt(x, z) !== null && !inCirc(x, z, nav.body)) stand[k] = 1;
      }
    // R：能走的格子 = 导航高度；别的取最近的能走格子的（多源 BFS，4 邻）
    const R = new Float32Array(N).fill(Number.NaN);
    const q = new Int32Array(N);
    let qh = 0;
    let qt = 0;
    for (let k = 0; k < N; k++)
      if (!Number.isNaN(navH[k])) {
        R[k] = navH[k];
        q[qt++] = k;
      }
    while (qh < qt) {
      const k = q[qh++];
      const i = k % nx;
      const j = (k / nx) | 0;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const kk = b * nx + a;
        if (!Number.isNaN(R[kk])) continue;
        R[kk] = R[k];
        q[qt++] = kk;
      }
    }
    for (let k = 0; k < N; k++) if (Number.isNaN(R[k])) R[k] = 0;
    const tex = new THREE.DataTexture(R, nx, nz, THREE.RedFormat, THREE.FloatType);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    uni.uR.value = tex;
    uni.uRB.value.set(RA.x0, RA.z0, nx * cell, nz * cell);

    // ── 渲染：正上方 + 四个斜的 ──
    const obst = new Uint16Array(N);
    const obstTop = new Float32Array(N);
    const floor = new Float32Array(N).fill(Number.NaN);
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.visible && skip(o)) {
        o.visible = false;
        hidden.push(o);
      }
    });
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    const prevFog = scene.fog;
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevShadow = renderer.shadowMap.enabled;
    scene.overrideMaterial = mat;
    scene.background = null;
    scene.fog = null;
    renderer.shadowMap.enabled = false;
    renderer.setClearColor(0x000000, 0);
    scene.updateMatrixWorld(true);
    const center = new THREE.Vector3((area.x0 + area.x1) / 2, 0, (area.z0 + area.z1) / 2);
    const views: THREE.Vector3[] = [new THREE.Vector3(0, 1, 0)];
    for (let a = 0; a < 4; a++) {
      const ang = (a * Math.PI) / 2;
      views.push(new THREE.Vector3(Math.sin(tilt) * Math.cos(ang), Math.cos(tilt), Math.sin(tilt) * Math.sin(ang)));
    }
    // 最后一遍：游戏相机的方向（yaw 0、俯角 45°：相机在南边往北看），看得见的地面
    const GAME = new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2);
    views.push(GAME);
    const seen = new Uint8Array(N);
    const cam = new THREE.OrthographicCamera();
    const corners: THREE.Vector3[] = [];
    for (const x of [area.x0, area.x1])
      for (const z of [area.z0, area.z1]) for (const y of [-3, 12]) corners.push(new THREE.Vector3(x, y, z));
    let samples = 0;
    for (const d of views) {
      const game = d === GAME;
      uni.uAll.value = game ? 1 : 0;
      cam.position.copy(center).addScaledVector(d, 120);
      cam.up.set(0, 0, -1);
      if (Math.abs(d.y) > 0.999) cam.up.set(0, 0, -1);
      else cam.up.set(0, 1, 0);
      cam.lookAt(center);
      cam.updateMatrixWorld(true);
      const inv = cam.matrixWorldInverse;
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const c of corners) {
        const p = c.clone().applyMatrix4(inv);
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
      }
      const W = Math.ceil((x1 - x0) / pxM);
      const H = Math.ceil((y1 - y0) / pxM);
      Object.assign(cam, { left: x0, right: x1, top: y1, bottom: y0, near: 1, far: 260 });
      cam.updateProjectionMatrix();
      // 大图分块渲（每块 ≤ 1024²）
      const TS = 1024;
      const rt = new THREE.WebGLRenderTarget(TS, TS, { type: THREE.FloatType, format: THREE.RGBAFormat });
      const buf = new Float32Array(TS * TS * 4);
      for (let ty = 0; ty < H; ty += TS)
        for (let tx = 0; tx < W; tx += TS) {
          const w = Math.min(TS, W - tx);
          const h = Math.min(TS, H - ty);
          const sub = cam.clone();
          Object.assign(sub, {
            left: x0 + tx * pxM,
            right: x0 + (tx + w) * pxM,
            bottom: y0 + ty * pxM,
            top: y0 + (ty + h) * pxM,
          });
          sub.updateProjectionMatrix();
          rt.setSize(w, h);
          renderer.setRenderTarget(rt);
          renderer.clear(true, true, true);
          renderer.render(scene, sub);
          renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
          for (let p = 0; p < w * h; p++) {
            if (buf[p * 4 + 3] < 0.5) continue;
            const x = buf[p * 4];
            const y = buf[p * 4 + 1];
            const z = buf[p * 4 + 2];
            const i = Math.floor((x - RA.x0) / cell);
            const j = Math.floor((z - RA.z0) / cell);
            if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
            const k = j * nx + i;
            samples++;
            const r = R[k];
            if (game) {
              if (Math.abs(y - r) <= 0.15) seen[k] = 1;
              continue;
            }
            if (y > r + BODY_LO) {
              if (y <= r + BODY_HI) {
                obst[k]++;
                if (y > obstTop[k] || obst[k] === 1) obstTop[k] = y;
              }
            } else if (y >= r + FLOOR_LO && !(y <= floor[k])) floor[k] = y;
          }
        }
      rt.dispose();
    }
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    scene.fog = prevFog;
    renderer.shadowMap.enabled = prevShadow;
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    for (const o of hidden) o.visible = true;
    tex.dispose();

    // ── 离障碍多远（格，8 邻倒角距离 ×10 取整） ──
    const isObst = (k: number) => obst[k] > 0;
    const dist = chamfer(nx, nz, isObst);
    const dm = (k: number) => (dist[k] / 10) * cell;
    // 离导航能站的多远（B 的"挨着"用）
    const distStand = chamfer(nx, nz, (k) => stand[k] === 1);

    const kind = new Uint8Array(N); // 0 无 1 A 2 B 3 C 4 D
    const inArea = (i: number, j: number) => {
      const x = cx(i);
      const z = cz(j);
      return x >= area.x0 && x <= area.x1 && z >= area.z0 && z <= area.z1;
    };
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        if (!inArea(i, j)) continue;
        const k = j * nx + i;
        const fl = floor[k];
        if (stand[k] && dm(k) < 0.18) kind[k] = 1;
        else if (free[k] && !isObst(k) && Number.isNaN(fl)) kind[k] = 4;
        else if (free[k] && !isObst(k) && Math.abs(fl - navH[k]) > 0.12) kind[k] = 3;
        else if (!free[k] && seen[k] && !Number.isNaN(fl) && Math.abs(fl - R[k]) <= 0.15 && dm(k) > 0.45) kind[k] = 2;
      }

    // ── 连通成片 ──
    const clusters: Cluster[] = [];
    const done = new Uint8Array(N);
    const KINDS = ['', 'A', 'B', 'C', 'D'] as const;
    for (let k0 = 0; k0 < N; k0++) {
      if (!kind[k0] || done[k0]) continue;
      const t = kind[k0];
      let n = 0;
      let sx = 0;
      let sz = 0;
      let sdh = 0;
      let touches = false;
      const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
      const st = [k0];
      done[k0] = 1;
      while (st.length) {
        const k = st.pop() as number;
        const i = k % nx;
        const j = (k / nx) | 0;
        const x = cx(i);
        const z = cz(j);
        n++;
        sx += x;
        sz += z;
        if (t === 3) sdh += floor[k] - navH[k];
        if (t === 1) sdh += obstTop[k] - R[k];
        if (t === 2 && distStand[k] / 10 <= 1.5) touches = true;
        box.x0 = Math.min(box.x0, x);
        box.x1 = Math.max(box.x1, x);
        box.z0 = Math.min(box.z0, z);
        box.z1 = Math.max(box.z1, z);
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const a = i + di;
            const b = j + dj;
            if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
            const kk = b * nx + a;
            if (done[kk] || kind[kk] !== t) continue;
            done[kk] = 1;
            st.push(kk);
          }
      }
      const areaM = n * cell * cell;
      if (areaM < 0.25) continue;
      const r2 = (v: number) => Math.round(v * 100) / 100;
      clusters.push({
        kind: KINDS[t] as Cluster['kind'],
        area: r2(areaM),
        cx: r2(sx / n),
        cz: r2(sz / n),
        box: {
          x0: r2(box.x0 - cell / 2),
          x1: r2(box.x1 + cell / 2),
          z0: r2(box.z0 - cell / 2),
          z1: r2(box.z1 + cell / 2),
        },
        ...(t === 3 || t === 1 ? { dh: r2(sdh / n) } : {}),
        ...(t === 2 ? { touches } : {}),
      });
    }
    // 每片最近的有名字的东西（摆件 slot:*、人）：看报告时知道是什么
    const named: { n: string; x: number; z: number }[] = [];
    const v = new THREE.Vector3();
    scene.traverse((o) => {
      if (!o.visible) return;
      const person = o.userData.personKind as string | undefined;
      if (!person && !o.name.startsWith('slot:')) return;
      if (o === play.director) return;
      o.getWorldPosition(v);
      if (v.x < RA.x0 || v.x > RA.x1 || v.z < RA.z0 || v.z > RA.z1) return;
      named.push({ n: person ? `人:${person}` : o.name.slice(5), x: v.x, z: v.z });
    });
    for (const c of clusters) {
      const d = (q: { x: number; z: number }) =>
        Math.hypot(Math.max(0, c.box.x0 - q.x, q.x - c.box.x1), Math.max(0, c.box.z0 - q.z, q.z - c.box.z1));
      c.near = named
        .filter((q) => d(q) < 1.5)
        .sort((a, b) => d(a) - d(b))
        .slice(0, 3)
        .map((q) => q.n);
    }
    for (const c of clusters) {
      const e = exceptionOf(c.kind, c.cx, c.cz, c.area);
      if (e) c.exc = e;
    }
    clusters.sort((a, b) => b.area - a.area);

    // ── 对照图：只画体检范围，1 格 = scale 像素 ──
    const scale = 2;
    const i0 = Math.round(M / cell);
    const j0 = i0;
    const W = Math.round((area.x1 - area.x0) / cell);
    const H = Math.round((area.z1 - area.z0) / cell);
    const cv = document.createElement('canvas');
    cv.width = W * scale;
    cv.height = H * scale;
    const g = cv.getContext('2d') as CanvasRenderingContext2D;
    const img = g.createImageData(W * scale, H * scale);
    const COL: Record<number, [number, number, number]> = {
      1: [235, 30, 40],
      2: [40, 90, 255],
      3: [255, 150, 0],
      4: [255, 240, 0],
    };
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const k = (j + j0) * nx + (i + i0);
        let c: [number, number, number];
        if (kind[k]) c = COL[kind[k]];
        else {
          const fl = floor[k];
          const base = Number.isNaN(fl) ? 20 : 90 + Math.max(-60, Math.min(80, (fl - R[k]) * 60 + ((fl * 8) % 40)));
          if (isObst(k)) c = [60, 45, 40];
          else if (stand[k]) c = [base * 0.7, base, base * 0.7];
          else if (free[k]) c = [base * 0.85, base * 0.95, base * 0.6];
          else c = [base, base * 0.9, base * 0.9];
        }
        for (let b = 0; b < scale; b++)
          for (let a = 0; a < scale; a++) {
            const o = ((j * scale + b) * W * scale + (i * scale + a)) * 4;
            img.data[o] = c[0];
            img.data[o + 1] = c[1];
            img.data[o + 2] = c[2];
            img.data[o + 3] = 255;
          }
      }
    g.putImageData(img, 0, 0);
    // 右半边：正上方的真实画面（正交，1 格 = scale 像素），叠上对不上的格子（半透明）+ 导航能站的边
    const photo = topPhoto(area, W * scale, H * scale);
    const cv2 = document.createElement('canvas');
    cv2.width = W * scale * 2 + 8;
    cv2.height = H * scale;
    const g2 = cv2.getContext('2d') as CanvasRenderingContext2D;
    g2.fillStyle = '#000';
    g2.fillRect(0, 0, cv2.width, cv2.height);
    g2.drawImage(cv, 0, 0);
    const pd = photo.data;
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const k = (j + j0) * nx + (i + i0);
        const edge = stand[k] && (!stand[k - 1] || !stand[k + 1] || !stand[k - nx] || !stand[k + nx]);
        const c = kind[k] ? COL[kind[k]] : edge ? ([120, 255, 120] as [number, number, number]) : null;
        if (!c) continue;
        const a = kind[k] ? 0.55 : 0.8;
        for (let b = 0; b < scale; b++)
          for (let s = 0; s < scale; s++) {
            const o = ((j * scale + b) * W * scale + (i * scale + s)) * 4;
            pd[o] = pd[o] * (1 - a) + c[0] * a;
            pd[o + 1] = pd[o + 1] * (1 - a) + c[1] * a;
            pd[o + 2] = pd[o + 2] * (1 - a) + c[2] * a;
          }
      }
    g2.putImageData(photo, W * scale + 8, 0);
    g.canvas.width = cv2.width;
    g.canvas.height = cv2.height;
    g.drawImage(cv2, 0, 0);
    for (const off of [0, W * scale + 8]) {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let x = Math.ceil(area.x0 / 5) * 5; x <= area.x1; x += 5)
        g.fillRect(off + ((x - area.x0) / cell) * scale, 0, 1, H * scale);
      for (let z = Math.ceil(area.z0 / 5) * 5; z <= area.z1; z += 5)
        g.fillRect(off, ((z - area.z0) / cell) * scale, W * scale, 1);
      g.fillStyle = '#fff';
      g.font = '10px monospace';
      for (let x = Math.ceil(area.x0 / 10) * 10; x <= area.x1; x += 10)
        g.fillText(`x${x}`, off + ((x - area.x0) / cell) * scale + 2, 10);
      for (let z = Math.ceil(area.z0 / 10) * 10; z <= area.z1; z += 10)
        g.fillText(`z${z}`, off + 2, ((z - area.z0) / cell) * scale - 2);
    }
    if (opts.overlay)
      drawOverlay(
        nx,
        nz,
        (k) => {
          if (kind[k]) return kind[k];
          if (!stand[k]) return 0;
          const i = k % nx;
          const j = (k / nx) | 0;
          const edge =
            i > 0 &&
            j > 0 &&
            i < nx - 1 &&
            j < nz - 1 &&
            (!stand[k - 1] || !stand[k + 1] || !stand[k - nx] || !stand[k + nx]);
          return edge ? 5 : 0;
        },
        (k) => (Number.isNaN(navH[k]) ? R[k] : navH[k]),
        cx,
        cz,
        cell,
      );
    const probes = (opts.probe ?? []).map(([x, z]) => {
      const k = Math.floor((z - RA.z0) / cell) * nx + Math.floor((x - RA.x0) / cell);
      const f = (v: number) => (Number.isNaN(v) ? null : Math.round(v * 1000) / 1000);
      return { x, z, floor: f(floor[k]), nav: f(navH[k]), obst: obst[k], stand: stand[k] };
    });
    return { clusters, samples, png: g.canvas.toDataURL('image/png'), cell, scale, probes };
  }

  /** 正上方的真实画面（正交，w×h 像素铺满 area） */
  function topPhoto(area: Rect, w: number, h: number): ImageData {
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.visible && (o.name.startsWith('mtn') || o.name === 'sky' || o.name === 'dome')) {
        o.visible = false;
        hidden.push(o);
      }
    });
    const cam = new THREE.OrthographicCamera(area.x0, area.x1, -area.z0, -area.z1, 1, 300);
    cam.position.set(0, 150, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    // 相机朝下、上方 = −z：屏幕 x = 世界 x，屏幕 y = −世界 z
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    const rt = new THREE.WebGLRenderTarget(w, h);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    const buf = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    renderer.setRenderTarget(prev);
    rt.dispose();
    for (const o of hidden) o.visible = true;
    const img = new ImageData(w, h);
    // 读出来是下到上：翻过来（上 = 北 = z0）
    for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    return img;
  }

  /** 画面里的标记：对不上的格子（同对照图的颜色）、导航能站的边（绿）；贴在导航高度上 2 厘米 */
  let overlay: THREE.Mesh | null = null;
  function drawOverlay(
    nx: number,
    nz: number,
    kindAt: (k: number) => number,
    hAt: (k: number) => number,
    cx: (i: number) => number,
    cz: (j: number) => number,
    cell: number,
  ) {
    if (overlay) {
      overlay.removeFromParent();
      overlay.geometry.dispose();
    }
    const COL = [null, [1, 0.1, 0.15], [0.15, 0.35, 1], [1, 0.6, 0], [1, 0.95, 0], [0.3, 1, 0.3]];
    const pos: number[] = [];
    const col: number[] = [];
    const h2 = cell / 2;
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const t = kindAt(k);
        if (!t) continue;
        const x = cx(i);
        const z = cz(j);
        const y = hAt(k) + 0.03;
        pos.push(
          x - h2,
          y,
          z - h2,
          x - h2,
          y,
          z + h2,
          x + h2,
          y,
          z + h2,
          x - h2,
          y,
          z - h2,
          x + h2,
          y,
          z + h2,
          x + h2,
          y,
          z - h2,
        );
        const c = COL[t] as number[];
        for (let v = 0; v < 6; v++) col.push(c[0], c[1], c[2]);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    overlay = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        depthTest: false,
      }),
    );
    overlay.name = 'nav-audit-overlay';
    overlay.renderOrder = 10;
    scene.add(overlay);
  }

  /** 到最近的 hit 格子的倒角距离（直 10、斜 14） */
  function chamfer(nx: number, nz: number, hit: (k: number) => boolean): Uint16Array {
    const N = nx * nz;
    const d = new Uint16Array(N).fill(65535);
    for (let k = 0; k < N; k++) if (hit(k)) d[k] = 0;
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        let v = d[k];
        if (i > 0) v = Math.min(v, d[k - 1] + 10);
        if (j > 0) {
          v = Math.min(v, d[k - nx] + 10);
          if (i > 0) v = Math.min(v, d[k - nx - 1] + 14);
          if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + 14);
        }
        d[k] = v;
      }
    for (let j = nz - 1; j >= 0; j--)
      for (let i = nx - 1; i >= 0; i--) {
        const k = j * nx + i;
        let v = d[k];
        if (i < nx - 1) v = Math.min(v, d[k + 1] + 10);
        if (j < nz - 1) {
          v = Math.min(v, d[k + nx] + 10);
          if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + 14);
          if (i > 0) v = Math.min(v, d[k + nx - 1] + 14);
        }
        d[k] = v;
      }
    return d;
  }

  /**
   * 互动点够不够得着：每个登记着的互动点（这一刻显示着的区域的），从 from 出发找路走到它的站位（stand()，不给 = at()），
   * 走到的地方离 at() 不超过 radius 才算够得着。返回够不着的（id、at、为什么）。
   */
  function reach(from: [number, number]) {
    const bad: { id: string; at: [number, number]; why: string }[] = [];
    let n = 0;
    for (const it of play.interactables()) {
      const a = it.at();
      // 收起来的互动点（藏起来的区域的）挂在很远的地方
      if (Math.abs(a.x) > 5000 || Math.abs(a.z) > 5000) continue;
      n++;
      const st = it.stand?.() ?? [a.x, a.z];
      const r2 = (v: number) => Math.round(v * 100) / 100;
      const path = nav.findPath(from[0], from[1], st[0], st[1]);
      const end = path?.[path.length - 1];
      if (!end) bad.push({ id: it.id, at: [r2(a.x), r2(a.z)], why: '找不到路' });
      else if (Math.hypot(end[0] - a.x, end[1] - a.z) > it.radius + 0.05)
        bad.push({
          id: it.id,
          at: [r2(a.x), r2(a.z)],
          why: `走到的地方离它 ${r2(Math.hypot(end[0] - a.x, end[1] - a.z))} > ${it.radius}`,
        });
    }
    return { n, bad };
  }

  (window as unknown as Record<string, unknown>).__navAudit = run;
  (window as unknown as Record<string, unknown>).__navReach = (rect: Rect, from: [number, number]) => {
    api.show(rect);
    return reach(from);
  };
  return run;
}
