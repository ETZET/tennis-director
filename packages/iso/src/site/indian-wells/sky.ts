import { mulberry32, range } from '@td/shared';
import { hash } from '../../core/color';
import { Custom, type DrawContext, Group, type Node } from '../../core/graph';
import type { Weather } from './build';
import { drawTumble } from './build';
import { FORE } from './foreshadow';
import { SLAB } from './ground';

/**
 * Indian Wells 的天空和环境动画（照旧版 ambient.ts）：岛上空飘的云、偶尔飞过的一行鸟、
 * 风从西边来，风滚草顺着几条空旷的走廊滚过去。风力 wind（0..1）同时让棕榈和旗子摆得更厉害（build.ts 读 Weather）。
 * 下雨时云变多变灰、风滚草停下（雨点本身和整体压暗归 ambient/rain 和 daylight）。
 * 只动画面，用自己的种子随机流，不碰 Math.random 和模拟。
 */

/** 风滚草走的几条走廊：z 固定，x 从 x0 滚到 x1（避开看台和楼） */
const LANES: readonly { z: number; x0: number; x1: number }[] = [
  { z: -6.5, x0: -36, x1: 58 },
  { z: 15.5, x0: -36, x1: 34 },
  { z: -45.5, x0: -70, x1: 94 },
  { z: 0, x0: 62, x1: 94 },
  { z: 30, x0: 62, x1: 94 },
  { z: -30, x0: 62, x1: 94 },
];

interface Weed {
  node: Custom;
  lane: (typeof LANES)[number];
  x: number;
  v: number;
  phase: number;
  roll: number;
  gust: boolean;
}

interface Cloud {
  node: Custom;
  x: number;
  z: number;
  y: number;
  w: number;
  seed: number;
}

export interface SkyLayer {
  update(dt: number, now: number, rain: number, wind?: number): void;
}

/** 鸟画在所有东西前面（深度偏置很大），它们在高空 */
const FRONT = 1e4;

export function createIndianWellsSky(scene: Node, weather: Weather): SkyLayer {
  const rand = mulberry32(0x7e11);
  const R = (a: number, b: number) => range(rand, a, b);
  const root = new Group();
  root.name = 'site-sky';
  scene.add(root);

  /* 风滚草：每条走廊一棵，大风天再多一批 */
  const mkWeed = (lane: (typeof LANES)[number], i: number, gust: boolean): Weed => {
    const rad = R(0.45, 0.7) * (gust ? 0.8 : 1);
    const w: Weed = {
      node: new Custom((r, self) => drawTumble(r, self.position.x, self.position.y, self.position.z, rad, w.roll), {
        x0: -rad,
        x1: rad,
        y0: 0,
        y1: rad * 2,
        z0: -rad,
        z1: rad,
      }),
      lane,
      x: lane.x0 + ((i * (gust ? 53 : 37) + (gust ? 29 : 0)) % (lane.x1 - lane.x0)),
      v: gust ? R(3, 4.5) : R(2.2, 4),
      phase: R(0, 6),
      roll: 0,
      gust,
    };
    // drawTumble 用世界坐标：节点自己的变换只用来排序，画的时候按 position 画
    w.node.name = 'tumbleweed';
    root.add(w.node);
    return w;
  };
  const weeds = LANES.map((l, i) => mkWeed(l, i, false));
  const gusts = LANES.map((l, i) => mkWeed(l, i, true));

  /* 云：一团团像素云，在岛四周自西往东飘 */
  const clouds: Cloud[] = [];
  for (let i = 0; i < 7; i++) {
    const c: Cloud = {
      node: new Custom((r) => drawCloud(r, c, weather.rain), { x0: -1, x1: 1, y0: 0, y1: 1, z0: -1, z1: 1 }),
      // 浮空岛四周（ADR 0005）：岛的南北两侧外面，比地面低一点到高一点，不飘到岛上的建筑前面
      x: R(SLAB.x0 - 20, SLAB.x1 + 20),
      z: i % 2 ? R(SLAB.z0 - 26, SLAB.z0 - 12) : R(SLAB.z1 + 12, SLAB.z1 + 26),
      y: R(-4, 10),
      w: R(7, 14),
      seed: i * 31 + 7,
    };
    c.node.name = 'cloud';
    root.add(c.node);
    clouds.push(c);
  }

  /* 鸟：一小群，隔一阵从西往东飞过去 */
  const birds = { x: SLAB.x0 - 40, z: 0, y: 24, wait: R(5, 20), n: 5 };
  const flock = new Custom((r) => drawBirds(r, birds), { x0: -1, x1: 1, y0: 0, y1: 1, z0: -1, z1: 1 });
  flock.renderOrder = FRONT;
  flock.name = 'birds';
  root.add(flock);

  let wind = 0.3;
  return {
    update(dt, now, rain, windIn = 0.3) {
      const step = Math.min(dt, 0.1);
      // 风力平滑地跟过去，棕榈不会一下子甩起来
      wind += (Math.max(0, Math.min(1, windIn)) - wind) * Math.min(1, step * 0.8);
      weather.wind = wind;
      weather.rain = Math.max(0, Math.min(1, rain));
      const calm = 1 - Math.min(1, weather.rain * 1.5);
      const W = wind * calm;
      const roll = (w: Weed, i: number, on: boolean) => {
        w.node.visible = on;
        if (!on) return;
        const v = w.v * (0.35 + 1.5 * W);
        w.x += v * step * (0.4 + 0.6 * calm);
        if (w.x > w.lane.x1) w.x = w.lane.x0;
        const hop = Math.abs(Math.sin(now * (2 + 2.4 * W) + w.phase)) * (0.3 + 1.1 * W) * calm;
        w.node.position.set(w.x, hop, w.lane.z + Math.sin(now * 0.4 + w.phase + i) * 1.5);
        w.roll -= (v * step) / 0.5;
      };
      weeds.forEach((w, i) => {
        roll(w, i, i % 2 === 0 || W > 0.35);
      });
      gusts.forEach((w, i) => {
        roll(w, i, W > 0.7);
      });

      // 地台往东南长出去以后（ADR 0021），南边那一圈云跟着往南让开，不压在新地和学院岛上
      let south = 0;
      for (const R of FORE.slab) south = Math.max(south, R.z1 - SLAB.z1);
      for (const c of clouds) {
        c.x += step * (0.6 + 2.4 * wind);
        if (c.x - c.w > SLAB.x1 + 20) c.x = SLAB.x0 - 20 - c.w;
        // 下雨时云更多：平时一半的云藏着
        c.node.visible = c.seed % 2 === 1 || weather.rain > 0.2 || wind > 0.6;
        // 让开的云也压低一点（高处的云投到屏幕上正好落在新地上）
        const away = c.z > SLAB.z1 && south > 0;
        c.node.position.set(c.x, away ? Math.min(c.y, 0) : c.y, away ? c.z + south : c.z);
      }

      if (birds.wait > 0) {
        birds.wait -= step;
        flock.visible = false;
        if (birds.wait <= 0) {
          birds.x = SLAB.x0 - 30;
          birds.z = R(SLAB.z0, SLAB.z1 - 30);
          birds.y = R(18, 30);
          birds.n = 3 + Math.floor(R(0, 4));
        }
      } else {
        flock.visible = calm > 0.3;
        birds.x += step * (7 + 3 * wind);
        if (birds.x > SLAB.x1 + 30) birds.wait = R(15, 40);
      }
      flock.position.set(birds.x, birds.y, birds.z);
    },
  };
}

/** 一团云：几个椭圆叠起来，底下一条暗边；雨天变灰 */
function drawCloud(r: DrawContext, c: Cloud, rain: number): void {
  const grey = Math.min(1, rain * 1.4);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * grey);
  const hexOf = (v: number[]) => `#${v.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  const top = r.col(hexOf([mix(255, 176), mix(250, 178), mix(240, 184)]), 1, 0);
  const mid = r.col(hexOf([mix(244, 150), mix(232, 152), mix(222, 160)]), 1, 0);
  const bot = r.col(hexOf([mix(220, 120), mix(206, 122), mix(204, 132)]), 1, 0);
  // 按节点的位置画（地台长大以后南边的云让开了，见 update）
  const q = c.node.position;
  const p = r.P(q.x, q.y, q.z);
  const W = c.w * r.k * 0.7;
  const H = W * 0.22;
  for (let i = 0; i < 5; i++) {
    const u = (i / 4 - 0.5) * 1.4;
    const rr = (0.32 + hash(c.seed, i, 5) * 0.25) * W;
    const cx = p[0] + u * W * 0.55;
    const cy = p[1] - hash(c.seed, i, 6) * H - (1 - Math.abs(u)) * H;
    r.ell(cx, cy + rr * 0.15, rr, rr * 0.5, bot);
    r.ell(cx, cy, rr, rr * 0.45, mid);
    r.ell(cx - rr * 0.1, cy - rr * 0.12, rr * 0.75, rr * 0.3, top);
  }
}

/** 一行鸟：小小的 V 字，翅膀一上一下 */
function drawBirds(r: DrawContext, b: { x: number; y: number; z: number; n: number }): void {
  const c = r.col('#2a2430', 1, 0);
  for (let i = 0; i < b.n; i++) {
    const row = i === 0 ? 0 : Math.ceil(i / 2);
    const side = i % 2 ? 1 : -1;
    const p = r.P(b.x - row * 2.2, b.y + (i % 3) * 0.3, b.z + side * row * 1.8);
    const up = Math.sin(r.t * 9 + i * 1.7) > 0;
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    r.pix(x, y, c);
    r.pix(x - 1, y + (up ? -1 : 0), c);
    r.pix(x + 1, y + (up ? -1 : 0), c);
    if (r.k > 3) {
      r.pix(x - 2, y + (up ? -1 : 1), c);
      r.pix(x + 2, y + (up ? -1 : 1), c);
    }
  }
}
