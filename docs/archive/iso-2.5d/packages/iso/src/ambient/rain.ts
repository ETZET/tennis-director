import { lerp, range } from '@td/shared';
import { Custom, type DrawContext } from '../core/graph';
import type { IsoWorld } from '../core/world';

export interface Rain {
  start(): void;
  /** 雨停（慢慢淡出） */
  stop(): void;
  /** 0 晴到 1 雨，淡入淡出的当前值（天色压暗交给 daylight：`daylight.update(time, rain.amount())`） */
  amount(): number;
  /** 推进雨丝和水花；cx、cz 是没有镜头时的退路（默认跟着镜头目标点） */
  update(dt: number, cx: number, cz: number): void;
}

/**
 * 雨天的天色（旧版改半球光、平行光和清屏色；等距画面里这些由 core/daylight 统一处理，
 * 这里只留天色两端，`rainSky` 按雨量混色给需要的地方用）。
 */
export interface RainLighting {
  sky: string;
  skyRain: string;
}

/** 晴天色和雨天色按雨量混合（'#rrggbb'） */
export function rainSky(l: RainLighting, amount: number): string {
  const a = Number.parseInt(l.sky.slice(1), 16);
  const b = Number.parseInt(l.skyRain.slice(1), 16);
  const ch = (s: number) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, amount));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

interface Drop {
  /** 屏幕上的位置（0..1，相对画面） */
  u: number;
  v: number;
  /** 远近层：0 远（短、暗、慢）.. 1 近（长、亮、快） */
  z: number;
}

interface Splash {
  x: number;
  z: number;
  /** 出生时刻（秒），-1 = 空 */
  t: number;
}

const SPLASH_LIFE = 0.28;

/**
 * 屏幕空间的像素雨：一个 renderOrder 极高的 Custom 节点（画在所有东西上面），
 * 雨丝按画面比例摆放、斜着往下落；地上随机冒出小水花（两三帧的皇冠形像素）。
 * 雨量淡入淡出（start / stop），雨丝和水花的数量跟着雨量走（不做半透明）。
 */
export function createRain(
  world: IsoWorld,
  _lighting?: RainLighting,
  n = 260,
  /** 哪里能溅水花（岛上的地面）；不给就到处溅 */
  onGround: (x: number, z: number) => boolean = () => true,
): Rain {
  const rr = (a: number, b: number) => range(Math.random, a, b);
  const drops: Drop[] = [];
  for (let i = 0; i < n; i++) drops.push({ u: Math.random(), v: Math.random(), z: Math.random() });
  const splashes: Splash[] = [];
  for (let i = 0; i < Math.round(n * 0.35); i++) splashes.push({ x: 0, z: 0, t: -1 });
  let on = 0;
  let target = 0;
  let clock = 0;
  let fall = 0;
  /** 画面大小（缓冲像素），每次画的时候按容器和镜头换算 */
  let bw = 400;
  let bh = 800;
  let k = 4;
  const center = { x: 0, z: 0 };

  const node = new Custom((r: DrawContext) => paint(r), { x0: -1, x1: 1, y0: 0, y1: 1, z0: -1, z1: 1 });
  node.name = 'rain';
  node.renderOrder = 1e6;
  node.lit = 1;
  node.visible = false;
  world.scene.add(node);

  function measure(r: DrawContext): void {
    k = r.k;
    bw = Math.max(64, world.view.BW);
    bh = Math.max(64, world.view.BH);
  }

  function paint(r: DrawContext): void {
    if (on < 0.01) return;
    measure(r);
    const s = r.spriteScale;
    const c0 = r.P(center.x, 0, center.z);
    const left = c0[0] - bw / 2;
    const top = c0[1] - bh / 2;
    const near = r.col('#dfe8ef', 1, 0.5);
    const far = r.col('#a9b8c4', 1, 0.5);
    const shown = Math.round(drops.length * on);
    // 雨丝：斜 1:4，近层长
    for (let i = 0; i < shown; i++) {
      const d = drops[i] as Drop;
      const L = (d.z > 0.6 ? 6 : 4) * s;
      const sp = 0.55 + 0.45 * d.z;
      const v = (d.v + fall * sp) % 1;
      const u = (d.u + fall * sp * 0.12) % 1;
      const x = Math.round(left + u * (bw + L) - L / 4);
      const y = Math.round(top + v * (bh + L) - L);
      r.line(x, y, x - Math.round(L / 4), y + L, d.z > 0.6 ? near : far);
    }
    // 水花：地上一个点 → 两侧溅开 → 一圈小点
    const wc = r.col('#e8f0f4', 1, 0.5);
    for (const p of splashes) {
      if (p.t < 0) continue;
      const a = (clock - p.t) / SPLASH_LIFE;
      if (a >= 1) continue;
      const q = r.P(p.x, 0.02, p.z);
      const x = Math.round(q[0]);
      const y = Math.round(q[1]);
      if (a < 0.33) r.pix(x, y - s, wc);
      else if (a < 0.66) {
        r.pix(x - s, y - s, wc);
        r.pix(x + s, y - s, wc);
        r.pix(x, y, wc);
      } else {
        r.pix(x - 2 * s, y, wc);
        r.pix(x + 2 * s, y, wc);
      }
    }
  }

  return {
    start() {
      target = 1;
    },
    stop() {
      target = 0;
    },
    amount: () => on,
    update(dt, cx, cz) {
      on = lerp(on, target, 1 - Math.exp(-dt * 0.5));
      node.visible = on >= 0.01;
      if (!node.visible) return;
      clock += dt;
      // 一秒大约落过 1.6 个画面高
      fall = (fall + dt * 1.6) % 1000;
      const sm = world.camera?.smooth;
      center.x = sm ? sm.tx : cx;
      center.z = sm ? sm.tz : cz;
      node.position.set(center.x, 0, center.z);
      // 水花：在画面能看到的地面范围里随机冒（按雨量）
      const half = (Math.max(bw, bh) / Math.max(k, 0.5)) * 0.6;
      const want = dt * splashes.length * 10 * on;
      let spawn = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
      for (const p of splashes) {
        if (spawn <= 0) break;
        if (p.t >= 0 && clock - p.t < SPLASH_LIFE) continue;
        const x = center.x + rr(-half, half);
        const z = center.z + rr(-half, half);
        if (!onGround(x, z)) continue;
        p.x = x;
        p.z = z;
        p.t = clock;
        spawn--;
      }
    },
  };
}
