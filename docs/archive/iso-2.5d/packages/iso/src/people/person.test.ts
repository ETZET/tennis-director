import { describe, expect, it, vi } from 'vitest';
import type { ArtAnim, PersonSheet, PixelArt } from '../art/format';
import { Group } from '../core/graph';

/** 测试用的小精灵表：每帧 3×4，挂点齐全；只画了一部分帧名，其余走回退。 */
function art(tag: string): PixelArt {
  return {
    rows: ['.S.', 'TTT', '.B.', 'F.F'],
    ox: 1,
    oy: 4,
    pal: {},
    pts: { head_top: [1, -1], hand_r: [0, 1], hand_l: [2, 1], racket: [0, 0], [tag]: [0, 0] },
  };
}
function an(tag: string, n = 1): Readonly<Record<'front' | 'back', ArtAnim>> {
  const frames = Array.from({ length: n }, (_, i) => art(`${tag}${i}`));
  return { front: { frames, dt: 0.2 }, back: { frames, dt: 0.2 } };
}
const SHEET: PersonSheet = {
  body: 'adult',
  anims: {
    idle: an('idle', 2),
    walk: an('walk', 4),
    run: an('run', 4),
    ready: an('ready'),
    seated: an('seated'),
    fhB: an('fhB'),
    fhC: an('fhC'),
    fhF: an('fhF'),
    sT: an('sT'),
    cheer: an('cheer', 2),
    fallFace: an('fallFace'),
    fallBack: an('fallBack'),
  },
};

vi.mock('../art/people', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADULT: SHEET,
  KID: { ...SHEET, body: 'kid' },
}));

const { Person } = await import('./person');
const { pickFrame, facingFor, resolveAnim, strokeKey } = await import('./frames');

function world() {
  return { scene: new Group(), groundY: () => 0, people: [] as InstanceType<typeof Person>[] };
}
const LOOK = { shirt: '#ff0000', shorts: '#0000ff', skin: '#f2c9a2', hair: '#5a3a22', shoes: '#ffffff' };

describe('Person 动作队列', () => {
  it('go 按速度走到目标，wait 停住，call 按顺序调用', () => {
    const w = world();
    const p = new Person({ name: 'a', x: 0, z: 0, ...LOOK }, w);
    const log: number[] = [];
    p.go(3, 4, 2.5)
      .wait(1)
      .call((t) => log.push(t))
      .go(3, 0, 2);
    let t = 0;
    const dt = 1 / 60;
    // 5 米，2.5 米/秒 → 2 秒
    while (t < 1.0) p.update(dt, (t += dt));
    expect(Math.hypot(p.pos.x, p.pos.z)).toBeCloseTo(2.5, 1);
    expect(p.moving).toBe(true);
    while (t < 2.05) p.update(dt, (t += dt));
    expect(p.pos.x).toBeCloseTo(3, 5);
    expect(p.pos.z).toBeCloseTo(4, 5);
    expect(log).toHaveLength(0);
    while (t < 3.2) p.update(dt, (t += dt));
    expect(log).toHaveLength(1);
    while (t < 6) p.update(dt, (t += dt));
    expect(p.pos.z).toBeCloseTo(0, 5);
    expect(p.busy()).toBe(false);
    expect(w.people).toContain(p);
    expect(p.root.parent).toBe(w.scene);
  });

  it('每帧被拉向插值点：零头距离不让人回头（QA P1-1）', () => {
    const w = world();
    const p = new Person({ name: 'a', x: 0, z: 0, ...LOOK }, w);
    const dt = 1 / 60;
    let t = 0;
    let x = 0;
    for (let i = 0; i < 120; i++) {
      // 目标沿 +x 匀速走；偶尔目标停一帧、或者往回抖 1 厘米（插值点的零头）
      x += i % 7 === 3 ? -0.01 : i % 5 === 0 ? 0 : 0.02;
      p.clearMoves();
      p.go(x, 0.003 * Math.sin(i), Math.max(1.2, Math.abs(x - p.pos.x) / dt));
      p.update(dt, (t += dt));
      if (i > 0) expect(Math.abs(p.moveYaw - Math.PI / 2)).toBeLessThan(0.3);
    }
    expect(Math.abs(p.yaw - Math.PI / 2)).toBeLessThan(0.3);
    // 真要往回走的时候照样转身
    for (let i = 0; i < 60; i++) {
      p.clearMoves();
      p.go(x - 3, 0, 2);
      p.update(dt, (t += dt));
    }
    expect(Math.sin(p.yaw)).toBeLessThan(-0.95);
  });

  it('挂点和手里的东西跟着人走', () => {
    const w = world();
    const p = new Person({ name: 'b', x: 2, z: 1, racket: '#333', ...LOOK }, w);
    const thing = new Group();
    p.give('R', thing);
    p.update(0.016, 0.016);
    const h = p.headTop.getWorldPosition();
    expect(h.y).toBeGreaterThan(0.5);
    expect(Math.hypot(h.x - 2, h.z - 1)).toBeLessThan(1);
    expect(thing.parent).toBe(p.handR);
    expect(p.racketHead).not.toBe(p.handR);
    p.take('R');
    expect(thing.parent).toBeNull();
    // 手持道具素材名
    const s = p.give('L', 'bottle');
    expect(s.parent).toBe(p.handL);
  });

  it('小朋友用 kid 精灵表', () => {
    const p = new Person({ name: 'k', x: 0, z: 0, scale: 0.6, ...LOOK }, world());
    expect(p.sheet.body).toBe('kid');
    p.overlay('towel', true);
    p.update(0.016, 0.016);
  });

  it('0.9 以下都是小孩精灵表，0.9 起是大人（球童 0.85、试训小孩 0.82–0.95）', () => {
    const sheet = (scale: number) => new Person({ name: 'k', x: 0, z: 0, scale, ...LOOK }, world()).sheet.body;
    expect(sheet(0.85)).toBe('kid');
    expect(sheet(0.82)).toBe('kid');
    expect(sheet(0.89)).toBe('kid');
    expect(sheet(0.9)).toBe(sheet(1));
    expect(sheet(0.95)).toBe(sheet(1));
  });

  it('精灵帧随状态变：站、走、跑、击球、手势、摔倒', () => {
    const p = new Person({ name: 'c', x: 0, z: 0, base: 'ready', ...LOOK }, world());
    const dt = 1 / 60;
    let t = 0;
    p.update(dt, (t += dt));
    expect(p.frame?.name).toBe('ready');
    p.go(10, 0, 1.2);
    for (let i = 0; i < 30; i++) p.update(dt, (t += dt));
    expect(p.frame?.name).toBe('walk');
    p.clearMoves();
    p.go(-10, 0, 5);
    for (let i = 0; i < 30; i++) p.update(dt, (t += dt));
    expect(p.frame?.name).toBe('run');
    p.clearMoves();
    for (let i = 0; i < 60; i++) p.update(dt, (t += dt));
    p.setStroke('fh', t + 0.8);
    p.update(dt, (t += dt));
    expect(p.frame?.name).toBe('ready');
    while (t < p.stroke!.tc - 0.2) p.update(dt, (t += dt));
    expect(p.frame?.name).toBe('fhB');
    while (t < p.stroke!.tc + 0.02) p.update(dt, (t += dt));
    expect(p.frame?.name).toBe('fhC');
    for (let i = 0; i < 60; i++) p.update(dt, (t += dt));
    expect(p.stroke).toBeNull();
    p.gesture('cheer', t, 1);
    p.update(dt, (t += dt));
    expect(p.frame?.name).toBe('cheer');
    p.gesture('clap', t, 1);
    p.update(dt, (t += dt));
    // 没画 clap → 回退到 idle
    expect(p.frame?.want).toBe('clap');
    expect(p.frame?.name).toBe('idle');
    p.fall(t, 'back', 1);
    p.update(dt, (t += dt));
    expect(p.frame?.name).toBe('fallBack');
  });
});

describe('取帧', () => {
  it('朝向：转角 0 时朝 +x 是正面朝右下，朝 +z 是正面翻转，朝 -z / -x 是背面', () => {
    // 投影：sx ∝ rx - rz，sy ∝ rx + rz；+x 朝右下，+z 朝左下
    expect(facingFor(Math.PI / 2, 0)).toEqual({ facing: 'front', flip: false });
    expect(facingFor(0, 0)).toEqual({ facing: 'front', flip: true });
    expect(facingFor(Math.PI, 0)).toEqual({ facing: 'back', flip: false });
    expect(facingFor(-Math.PI / 2, 0)).toEqual({ facing: 'back', flip: true });
    // 镜头转 90 度后同一个朝向换了样子
    expect(facingFor(Math.PI / 2, Math.PI / 2)).toEqual({ facing: 'front', flip: true });
  });

  it('回退：pbReady → ready，slump → idle，没有的 → idle', () => {
    expect(resolveAnim(SHEET, 'pbReady', 'front')?.name).toBe('ready');
    expect(resolveAnim(SHEET, 'slump', 'front')?.name).toBe('idle');
    expect(resolveAnim(SHEET, 'dkB', 'front')?.name).toBe('fhB');
    expect(resolveAnim(SHEET, 'nope', 'back')?.name).toBe('idle');
  });

  it('击球分段按最近关键帧，BASE 换成基础姿势', () => {
    expect(strokeKey('fh', -0.8, 'ready')).toBe('ready');
    expect(strokeKey('fh', -0.3, 'ready')).toBe('fhB');
    expect(strokeKey('fh', 0.01, 'ready')).toBe('fhC');
    expect(strokeKey('fh', 0.2, 'ready')).toBe('fhF');
    expect(strokeKey('fh', 0.7, 'ready')).toBeNull();
    expect(strokeKey('serve', -0.85, 'ready')).toBe('sT');
  });

  it('走路按步伐相位换帧', () => {
    const base = {
      yaw: 0,
      base: 'relaxed' as const,
      seated: false,
      down: null,
      strokeKey: null,
      gesture: null,
      speed: 1.4,
      hop: false,
      now: 0,
    };
    const idx = [0, 1, 2, 3].map((q) => pickFrame(SHEET, { ...base, phase: (q + 0.5) * (Math.PI / 2) }).index);
    expect(idx).toEqual([0, 1, 2, 3]);
    expect(pickFrame(SHEET, { ...base, phase: 0, speed: 0 }).name).toBe('idle');
    expect(pickFrame(SHEET, { ...base, phase: 0, speed: 0, seated: true }).name).toBe('seated');
  });
});
