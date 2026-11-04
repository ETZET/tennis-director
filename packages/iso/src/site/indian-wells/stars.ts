/**
 * 大门星级牌（ART-14，wave1 契约里覆盖层的 `stars?(n, animate)`）。
 *
 * 用法（overlays 里接上）：
 * ```ts
 * const sign = createStarSign(world);   // 立在东墙大门南侧的门外，动态节点挂在 world.scene 下（不碰静态层缓存）
 * sign.set(stars, false);               // 读档、开局：直接换成这一档
 * sign.set(stars, true);                // 升星（star_up 事件）：新的星"砰"地亮起来，闪光、火花、一道流光，约 1.6 秒
 * sign.update(dt, now);                 // 每帧（可选：动画按画面时间 r.t 走，不调也能播；update 只记一下时间）
 * ```
 *
 * 六档样子（素材在 art/sign）：★0 风化的旧木牌，右桩断了、牌子耷拉着、星只剩褪色的印子；★1 重新立起来刷了奶油色，
 * 一颗手刷的金星、桩上绑绳、脚下一桶漆；★2 漆成俱乐部绿、白桩、顶上一盏小灯；★3 灰泥基座、金边、两盏灯、花槽；
 * ★4 两边西班牙式灰泥柱和红瓦檐、双层金边、星星夜里自己发光；★5 再加金盾网球徽章、柱顶金球，金边也发光，
 * 闲着时星星偶尔闪一下。
 *
 * 只是画面：不读也不改模拟状态；演出的"随机"是按时间取哈希，只决定画面。
 * 牌子是正对镜头的像素图（和人一样按精灵档位整数放大），转镜头也读得清；画的时候深度往前挪一点，
 * 免得被身后的围墙挡住一角。
 */
import { SIGN_PAL, type SignArt, STAR_H, STAR_ON, STAR_SLOTS, STAR_W, signArt } from '../../art/sign';
import { bay, hash, hx, mixP, pk } from '../../core/color';
import { type BakedArt, Custom, type DrawContext, type Node } from '../../core/graph';
import { Raster } from '../../core/raster';

/**
 * 牌子立在哪儿（门外、南门柱再往南，围墙和南停车场之间的空地上）。
 * 和牌匾（plaque.ts，z 6.2–11.2）在屏幕上错开：牌子是正对镜头的精灵、默认镜头下有十几米宽，
 * 放得太近会把牌匾整块盖住；也别往北放（北边车道那排棕榈在默认镜头下正好挡在它前面）。
 */
export const STAR_SIGN_AT = { x: 62.6, z: 18.2 } as const;

/** 升星动画多长（秒） */
export const STAR_UP_SECONDS = 1.6;

/**
 * 画的时候深度往镜头前挪多少米（防止被身后的围墙切掉）。只在从门外看（围墙的东面朝镜头）时挪；
 * 从园子里往外看时牌子在墙后面，照实际深度画，墙挡住它的腿，不然牌子会"贴"在墙前面。
 */
const DEPTH_BIAS = 3.5;
const DEPTH_BIAS_INSIDE = 0.3;

interface Baked {
  art: BakedArt;
  /** 流光用：每个像素提亮后的颜色 */
  shine: Uint32Array;
}

const cache = new Map<string, Baked>();

/** 字符画 → 烘焙像素（固定调色，glow 里的字符自发光） */
function bake(a: { rows: readonly string[]; ox: number; oy: number; glow: string }): Baked {
  const h = a.rows.length;
  const w = Math.max(...a.rows.map((r) => r.length));
  const px = new Uint32Array(w * h);
  const shine = new Uint32Array(w * h);
  const em = new Uint8Array(w * h);
  const white = pk(255, 252, 235);
  let any = false;
  a.rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i] as string;
      const hex = SIGN_PAL[ch];
      if (ch === '.' || !hex) continue;
      const c = hx(hex);
      const v = pk(c[0], c[1], c[2]);
      px[j * w + i] = v;
      shine[j * w + i] = mixP(v, white, 0.6);
      if (a.glow.includes(ch)) {
        em[j * w + i] = 1;
        any = true;
      }
    }
  });
  const art: { -readonly [K in keyof BakedArt]: BakedArt[K] } = { w, h, ox: a.ox, oy: a.oy, px };
  if (any) art.emissive = em;
  return { art, shine };
}

function look(level: number, earned: number): Baked {
  const key = `${level}:${earned}`;
  let b = cache.get(key);
  if (!b) {
    b = bake(signArt(level, earned));
    cache.set(key, b);
  }
  return b;
}

/** 单独一颗星（升星时放大弹出来）和它的白色剪影 */
const POP = bake({ rows: STAR_ON, ox: 0, oy: 0, glow: '*+=' });
const POP_WHITE = bake({ rows: STAR_ON.map((r) => r.replace(/[^.]/g, '*')), ox: 0, oy: 0, glow: '*' });

/** 每档夜里的灯（像素坐标）和牌子受光 */
const LAMPS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  2: [[28, 10]],
  3: [
    [9, 11],
    [47, 11],
  ],
};
const BOARD_LIT = [0, 0.15, 0.7, 0.9, 0.9, 1];

const ease = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export interface StarSign {
  /** 换成 n 星（0–5）；animate = 升星的时刻（只有 n 比现在大时才播） */
  set(n: number, animate: boolean): void;
  /** 每帧调用（可选） */
  update(dt: number, now: number): void;
  /** 画牌子的节点（已经挂在 world.scene 下） */
  readonly node: Custom;
}

export function createStarSign(world: { readonly scene: Node }): StarSign {
  let level = 0;
  /** 正在播的升星：从几星到几星、开始时间（第一次画的时候记） */
  let anim: { from: number; to: number; t0: number | null } | null = null;
  const { x: SX, z: SZ } = STAR_SIGN_AT;

  const draw = (r: DrawContext): void => {
    const s = r.spriteScale;
    const ras = r instanceof Raster ? r : null;
    // 动画进度
    let a = -1;
    if (anim) {
      anim.t0 ??= r.t;
      a = r.t - anim.t0;
      if (a >= STAR_UP_SECONDS || a < 0) {
        anim = null;
        a = -1;
      }
    }
    const swapped = a < 0 || a >= 0.18;
    const showLevel = anim && !swapped ? anim.from : level;
    // 新的星在弹出来之前不画进牌子
    const earned = anim && a < 0.42 ? (swapped ? anim.to - 1 : anim.from) : level;
    const b = look(showLevel, earned);

    const [bx, by] = r.P(SX, 0, SZ);
    const depth = ras ? ras.proj.depth(SX, SZ) + (r.vis(1, 0) ? DEPTH_BIAS : DEPTH_BIAS_INSIDE) : undefined;
    if (ras && depth !== undefined) ras.zcur = depth;
    // 落下的一下："咚"地往下一沉再回来
    const bump = a >= 0.18 && a < 0.26 ? s : 0;
    const ax = Math.round(bx);
    const ay = Math.round(by) + bump;
    const left = ax - b.art.ox * s;
    const top = ay - b.art.oy * s;
    const P = (i: number, j: number): [number, number] => [left + (i + 0.5) * s, top + (j + 0.5) * s];

    // 地上的影子
    const sw = 22 * s;
    for (let y = -2 * s; y <= s; y++)
      for (let x = -sw; x <= sw; x++) {
        const q = (x / sw) ** 2 + ((y + 0.5 * s) / (2.2 * s)) ** 2;
        if (q < 1) r.darken(ax + x, ay + y, 0.82 + q * 0.12);
      }

    const lamps = clamp01((r.night - 0.4) / 0.45);
    // 夜里：★4 起整块牌子后面一团暖光（先画，牌子盖在上面，四周露出光晕）
    if (lamps > 0 && showLevel >= 4) {
      const [gx, gy] = P(28, 22);
      r.glow(gx, gy, (showLevel === 5 ? 40 : 32) * s, [255, 214, 130], lamps * (showLevel === 5 ? 0.55 : 0.4));
    }

    const lit = Math.max(r.litAt(SX, SZ), (BOARD_LIT[showLevel] ?? 0) * lamps);
    const opts: { scale: number; lit: number; depth?: number } = { scale: s, lit };
    if (depth !== undefined) opts.depth = depth;
    // 世界点：锚点的投影正好落在 (ax, ay)；bump 用 y 往下挪
    const wy = -bump / (r.k * 1.225);
    if (ras) ras.art(b.art, SX, wy, SZ, opts);
    else r.art(b.art, SX, wy, SZ, opts);

    // 灯泡的光晕
    if (lamps > 0)
      for (const [i, j] of LAMPS[showLevel] ?? []) {
        const [gx, gy] = P(i, j);
        r.glow(gx, gy, 9 * s, [255, 210, 140], lamps * 0.9);
      }

    // ★5 闲着时：每隔一阵某颗星闪一下
    if (!anim && level >= 4) {
      const per = 2.6;
      const k = Math.floor(r.t / per);
      const ph = (r.t - k * per) / 0.45;
      if (ph < 1) {
        const idx = Math.floor(hash(k, 7, 3) * level);
        const sl = STAR_SLOTS[idx];
        if (sl) {
          const [cx, cy] = P(sl[0] + 1 + Math.floor(hash(k, 9, 1) * 4), sl[1] + 1);
          twinkle(r, cx, cy, s, Math.sin(ph * Math.PI));
        }
      }
    }

    if (a < 0) return;
    const slot = STAR_SLOTS[(anim?.to ?? 1) - 1] ?? STAR_SLOTS[0];
    if (!slot) return;
    const [cx, cy] = P(slot[0] + STAR_W / 2 - 0.5, slot[1] + STAR_H / 2 - 0.5);

    // 1) 蓄力：星位上一点光越来越亮
    if (a < 0.18) {
      const f = a / 0.18;
      r.glow(cx, cy, (4 + 6 * f) * s, [255, 246, 200], 0.5 + f * 0.5);
      return;
    }
    // 2) 闪光、光芒、冲击圈；外加一团大的柔光和一道往上冲的光柱（手机默认镜头下牌子才 57 像素宽，
    //    特效要比牌子大一圈才看得出"升星了"）
    const fl = 1 - clamp01((a - 0.18) / 0.45);
    if (fl > 0) {
      r.glow(cx, cy, (10 + 12 * (1 - fl)) * s, [255, 248, 215], fl * 1.1);
      r.glow(cx, cy, 34 * s, [255, 214, 120], fl * 0.55);
    }
    if (a < 0.95) {
      // 光柱：从星位往上，先窄后宽再淡掉（屏幕空间，正对镜头）
      const f = clamp01((a - 0.18) / 0.77);
      const top = cy - (18 + 46 * ease(f)) * s;
      const hw = Math.max(1, Math.round((1 + 2.5 * Math.sin(f * Math.PI)) * s));
      const core = r.em('#fffbe6');
      const edge = r.em('#ffd23c');
      for (let y = Math.round(top); y < Math.round(cy - 3 * s); y++) {
        // 越往上越稀（抖动），整体随时间淡掉
        const u = (cy - y) / (cy - top);
        const keep = (1 - u * 0.85) * (1 - f * 0.9);
        if (bay(Math.round(cx), y) > keep) continue;
        r.rect(Math.round(cx) - hw, y, hw * 2, 1, (y & 1) === 0 ? core : edge);
      }
    }
    if (a < 0.55) {
      const f = ease(clamp01((a - 0.18) / 0.37));
      const c = r.em('#fff6c8');
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const r0 = (6 + 6 * f) * s;
        const r1 = r0 + (i % 2 ? 7 : 13) * s * (1 - f * 0.6);
        r.line(
          cx + Math.cos(ang) * r0,
          cy + Math.sin(ang) * r0,
          cx + Math.cos(ang) * r1,
          cy + Math.sin(ang) * r1,
          c,
          s,
        );
      }
      // 冲击圈（扁的，像贴在牌面上）
      const R = (5 + 26 * f) * s;
      const rc = r.em(f < 0.6 ? '#ffffff' : '#ffd23c');
      const steps = Math.ceil(R * 4);
      for (let i = 0; i < steps; i++) {
        const ang = (i / steps) * Math.PI * 2;
        if (f > 0.5 && (i & 1) === 1) continue;
        r.rect(Math.round(cx + Math.cos(ang) * R), Math.round(cy + Math.sin(ang) * R * 0.7), s, s, rc);
      }
    }
    // 3) 星星弹出来：白色剪影一闪，放大到三倍浮在星位上方，再缩成两倍落下，最后落进星位
    if (a < 0.42) {
      const k = a < 0.22 ? s : a < 0.32 ? 3 * s : 2 * s;
      const lift = a < 0.22 ? 0 : a < 0.32 ? 3 * s : s;
      const src = a < 0.25 ? POP_WHITE : POP;
      const lx = Math.round(cx - (STAR_W * k) / 2);
      const ly = Math.round(cy - (STAR_H * k) / 2) - lift;
      blitPx(r, src.art.px, src.art.w, src.art.h, lx, ly, k);
    }
    // 4) 火花：二十颗往四周飞，边飞边闪
    if (a < 1.25) {
      const f = clamp01((a - 0.18) / 1.0);
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2 + hash(i, 3, 5) * 0.5;
        const dist = (10 + hash(i, 4, 5) * 30) * ease(f) * s;
        const px = cx + Math.cos(ang) * dist;
        const py = cy + Math.sin(ang) * dist * 0.8 - f * f * 4 * s + f * 6 * s * hash(i, 6, 5);
        const life = 1 - f;
        if (life <= 0) continue;
        const on = Math.sin((a * 18 + i * 1.7) * 1.0) > -0.3;
        if (on) twinkle(r, px, py, s, life * (i % 3 === 0 ? 1 : 0.6), i % 2 ? '#ffd23c' : '#ffffff');
      }
    }
    // 5) 一道流光从左往右扫过整块牌子
    if (a >= 0.5 && a < 1.3) {
      const f = (a - 0.5) / 0.8;
      const band = -24 + f * (b.art.w + 48);
      const { w, h, px } = b.art;
      const cur = look(level, level);
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          const v = px[j * w + i];
          if (!v) continue;
          const u = i + j * 0.6 - band;
          if (u < -2 || u > 2) continue;
          const c = Math.abs(u) < 1 ? cur.shine[j * w + i] : mixP(v, cur.shine[j * w + i] as number, 0.5);
          r.rect(left + i * s, top + j * s, s, s, c as number);
        }
    }
  };

  const node = new Custom((r) => draw(r), { x0: -2.5, x1: 2.5, y0: 0, y1: 5, z0: -0.6, z1: 0.6 });
  node.name = 'star-sign';
  node.position.set(SX, 0, SZ);
  node.renderOrder = 0.5;
  world.scene.add(node);

  return {
    node,
    set(n, animate) {
      const to = Math.max(0, Math.min(5, Math.round(n)));
      if (animate && to > level && to >= 1) anim = { from: level, to, t0: null };
      else anim = null;
      level = to;
    },
    update() {
      // 动画按画面时间 r.t 走；这里留着给宿主每帧调用（以后要按 dt 做别的再加）
    },
  };
}

/** 一个十字闪光（中心亮点 + 四条短臂），v 0..1 决定臂长 */
function twinkle(r: DrawContext, x: number, y: number, s: number, v: number, hex = '#ffffff'): void {
  if (v <= 0.05) return;
  const c = r.em(hex);
  const cx = Math.round(x);
  const cy = Math.round(y);
  r.rect(cx, cy, s, s, r.em('#ffffff'));
  const arm = Math.max(1, Math.round(v * 3));
  for (let i = 1; i <= arm; i++) {
    r.rect(cx + i * s, cy, s, s, c);
    r.rect(cx - i * s, cy, s, s, c);
    r.rect(cx, cy + i * s, s, s, c);
    r.rect(cx, cy - i * s, s, s, c);
  }
}

/** 按 k 倍画一张像素（屏幕坐标，不做夜色：弹出来的星本来就在发光） */
function blitPx(r: DrawContext, px: Uint32Array, w: number, h: number, x: number, y: number, k: number): void {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const v = px[j * w + i];
      if (v) r.rect(x + i * k, y + j * k, k, k, v);
    }
}

export type { SignArt };
