import type { XYZ } from '@td/shared';
import * as THREE from 'three';
import { type IconName, iconTexture, type SpriteTex } from './icons';

/**
 * 场景里的漫画字和表情：飘字（"好球!"）、对话气泡、举牌、头顶表情、眩晕星星、闪光。
 * 都是始终朝向相机的 Sprite，画在画布贴图上（这是 render 里唯一用到 DOM 的地方：画布）。
 */

/** 拉丁字母用 Saira（和转播 HUD 一致），中文落到系统黑体。 */
export const SPRITE_FONT = "'Saira Semi Condensed','Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif";

export interface TextTexOptions {
  fg?: string;
  stroke?: string;
  size?: number;
  /** 对话气泡（白底黑框带尖角） */
  bubble?: boolean;
  /** 举牌（方卡片） */
  card?: boolean;
  bg?: string;
}

const txtCache = new Map<string, SpriteTex>();
let fontHook = false;

/** 文字贴图（画布，按内容缓存；字体加载完成后清空缓存，之后的字用正确的字体）。 */
export function spriteTextTexture(text: string, o: TextTexOptions = {}): SpriteTex {
  if (!fontHook && typeof document !== 'undefined' && document.fonts?.ready) {
    fontHook = true;
    document.fonts.ready.then(() => txtCache.clear()).catch(() => {});
  }
  const fg = o.fg || '#ffffff';
  const st = o.stroke || '#1a1612';
  const sz = o.size || 48;
  const key = [text, fg, st, sz, !!o.bubble, !!o.card, o.bg || ''].join('|');
  const hit = txtCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  const font = `700 ${sz}px ${SPRITE_FONT}`;
  const m = c.getContext('2d') as CanvasRenderingContext2D;
  m.font = font;
  const tw = Math.ceil(m.measureText(text).width);
  if (o.card) {
    c.width = Math.max(sz * 1.3, tw + sz * 0.5);
    c.height = Math.round(sz * 1.35);
  } else if (o.bubble) {
    c.width = tw + sz * 0.9;
    c.height = Math.round(sz * 1.9);
  } else {
    c.width = tw + Math.round(sz * 0.5);
    c.height = Math.round(sz * 1.4);
  }
  const y = c.getContext('2d') as CanvasRenderingContext2D;
  y.font = font;
  y.textAlign = 'center';
  y.textBaseline = 'middle';
  const paper = o.bg || '#fbf7ea';
  if (o.card) {
    y.fillStyle = '#1a1612';
    y.fillRect(0, 0, c.width, c.height);
    y.fillStyle = paper;
    y.fillRect(5, 5, c.width - 10, c.height - 10);
    y.fillStyle = fg;
    y.fillText(text, c.width / 2, c.height / 2 + 2);
  } else if (o.bubble) {
    const h = Math.round(sz * 1.5);
    y.fillStyle = '#1a1612';
    y.fillRect(0, 0, c.width, h);
    y.fillStyle = paper;
    y.fillRect(4, 4, c.width - 8, h - 8);
    y.fillStyle = '#1a1612';
    y.beginPath();
    y.moveTo(c.width / 2 - sz * 0.3, h - 4);
    y.lineTo(c.width / 2, c.height);
    y.lineTo(c.width / 2 + sz * 0.3, h - 4);
    y.fill();
    y.fillStyle = paper;
    y.beginPath();
    y.moveTo(c.width / 2 - sz * 0.2, h - 6);
    y.lineTo(c.width / 2, c.height - 8);
    y.lineTo(c.width / 2 + sz * 0.2, h - 6);
    y.fill();
    y.fillStyle = fg === '#ffffff' ? '#1a1612' : fg;
    y.fillText(text, c.width / 2, h / 2 + 2);
  } else {
    y.lineJoin = 'round';
    y.lineWidth = sz * 0.24;
    y.strokeStyle = st;
    y.strokeText(text, c.width / 2, c.height / 2 + 1);
    y.fillStyle = fg;
    y.fillText(text, c.width / 2, c.height / 2 + 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  const r = { tex: t, aspect: c.width / c.height };
  txtCache.set(key, r);
  return r;
}

/**
 * 一块写着字的平面（横幅、摊位招牌）。px 是贴图上每米 48 像素时的字号。
 * 字体加载完成后会重画一次。
 */
export function labelPlane(text: string, w: number, h: number, bg: string, fg: string, px: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = Math.round(w * 48);
  c.height = Math.round(h * 48);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  const draw = () => {
    const x = c.getContext('2d') as CanvasRenderingContext2D;
    x.fillStyle = bg;
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = fg;
    x.font = `700 ${px}px ${SPRITE_FONT}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, c.width / 2, c.height / 2 + 1);
    t.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw).catch(() => {});
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: t }));
  m.userData.disposable = true;
  return m;
}

export interface SpriteOptions {
  /** 高度（米，乘以图层的 scale） */
  h?: number;
  /** 存在多久（秒）；Infinity 一直在 */
  dur?: number;
  /** 跟着某个物体（头顶、手） */
  follow?: THREE.Object3D | null;
  /** 不跟物体时的位置（图层父节点的局部坐标） */
  pos?: XYZ | null;
  /** 在目标上方多高 */
  off?: number;
  /** 一边存在一边往上飘多高 */
  rise?: number;
  /** 出现时弹一下 */
  pop?: boolean;
  /** 绕目标转圈的半径（眩晕星星） */
  orbit?: number;
  ph?: number;
}

interface SpriteRec {
  s: THREE.Sprite;
  h: number;
  aspect: number;
  t0: number;
  dur: number;
  follow: THREE.Object3D | null;
  off: number;
  pos: XYZ | null;
  rise: number;
  pop: boolean;
  orbit: number;
  ph: number;
}

export interface PopOptions {
  fg?: string;
  h?: number;
  dur?: number;
  rise?: number;
  bg?: string;
}

const _v = new THREE.Vector3();

/** 一组漫画字和表情，挂在某个父节点下（活动的场地坐标系）。 */
export class SpriteLayer {
  private readonly recs: SpriteRec[] = [];
  private now = 0;

  constructor(
    private readonly parent: THREE.Object3D,
    /** 整体放大（游戏的相机比动画库远得多） */
    readonly scale = 1,
  ) {}

  spr(info: SpriteTex, o: SpriteOptions = {}): void {
    const m = new THREE.SpriteMaterial({ map: info.tex, transparent: true, depthTest: false, depthWrite: false });
    const s = new THREE.Sprite(m);
    s.renderOrder = 20;
    const k = this.scale;
    const h = (o.h ?? 0.6) * k;
    s.scale.set(h * info.aspect, h, 1);
    s.visible = false;
    this.parent.add(s);
    this.recs.push({
      s,
      h,
      aspect: info.aspect,
      t0: this.now,
      dur: o.dur ?? 1.4,
      follow: o.follow ?? null,
      off: (o.off ?? 0.45) * k,
      pos: o.pos ? { ...o.pos } : null,
      rise: (o.rise ?? 0.7) * k,
      pop: o.pop !== false,
      orbit: (o.orbit ?? 0) * k,
      ph: o.ph ?? 0,
    });
  }

  /** 头顶表情图标 */
  emote(head: THREE.Object3D, name: IconName, dur = 1.5): void {
    this.spr(iconTexture(name), { follow: head, off: 0.32, h: 0.5, dur, rise: 0.12 });
  }

  icon(name: IconName, o: SpriteOptions): void {
    this.spr(iconTexture(name), o);
  }

  /** 飘字：跟着头顶（head 给定）或停在某个位置 */
  pop(text: string, target: THREE.Object3D | XYZ, o: PopOptions = {}): void {
    const info = spriteTextTexture(text, { fg: o.fg || '#ffffff', size: 48 });
    const isObj = target instanceof THREE.Object3D;
    this.spr(info, {
      follow: isObj ? target : null,
      pos: isObj ? null : target,
      off: isObj ? 0.62 : 0,
      h: o.h || 0.5,
      dur: o.dur || 1.5,
      rise: o.rise ?? 0.75,
    });
  }

  /** 对话气泡 */
  say(head: THREE.Object3D, text: string, dur = 2.2, o: PopOptions = {}): void {
    this.spr(spriteTextTexture(text, { bubble: true, size: 40, fg: o.fg || '#1a1612', bg: o.bg }), {
      follow: head,
      off: 0.72,
      h: o.h || 0.5,
      dur,
      rise: 0,
    });
  }

  /** 头上转圈的眩晕星星 */
  dizzy(head: THREE.Object3D, dur = 1.6): void {
    for (let i = 0; i < 3; i++)
      this.icon('star', { follow: head, off: 0.08, h: 0.22, dur, rise: 0, orbit: 0.32, ph: i * 2.09, pop: false });
  }

  flash(pos: XYZ, h = 1.3): void {
    this.icon('flash', { pos, h, dur: 0.32, rise: 0 });
  }

  /** 举起的分数牌 */
  card(hand: THREE.Object3D, text: string, col?: string): void {
    this.spr(spriteTextTexture(text, { card: true, size: 60, fg: col || '#1a1612' }), {
      follow: hand,
      off: 0.25,
      h: 0.42,
      dur: 2.3,
      rise: 0,
    });
  }

  update(now: number): void {
    this.now = now;
    for (let i = this.recs.length - 1; i >= 0; i--) {
      const r = this.recs[i] as SpriteRec;
      const age = now - r.t0;
      if (age > r.dur || (r.follow && !r.follow.parent)) {
        this.parent.remove(r.s);
        r.s.material.dispose();
        this.recs.splice(i, 1);
        continue;
      }
      let p: XYZ | null = r.pos;
      if (r.follow) {
        r.follow.getWorldPosition(_v);
        this.parent.worldToLocal(_v);
        p = _v;
      }
      if (!p) continue;
      let x = p.x;
      const y = p.y + r.off + r.rise * Math.min(1, age / Math.max(0.3, Math.min(r.dur, 3)));
      let z = p.z;
      if (r.orbit) {
        x += Math.cos(r.ph + age * 7) * r.orbit;
        z += Math.sin(r.ph + age * 7) * r.orbit;
      }
      r.s.position.set(x, y, z);
      r.s.visible = true;
      const k = r.pop
        ? age < 0.12
          ? 0.3 + (age / 0.12) * 0.95
          : age < 0.22
            ? 1.25 - ((age - 0.12) / 0.1) * 0.25
            : 1
        : 1;
      r.s.scale.set(r.h * r.aspect * k, r.h * k, 1);
      r.s.material.opacity = Number.isFinite(r.dur) && r.dur - age < 0.3 ? Math.max(0, (r.dur - age) / 0.3) : 1;
    }
  }

  dispose(): void {
    for (const r of this.recs) {
      this.parent.remove(r.s);
      r.s.material.dispose();
    }
    this.recs.length = 0;
  }
}
