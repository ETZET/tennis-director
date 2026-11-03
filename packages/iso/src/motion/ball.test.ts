import { describe, expect, it } from 'vitest';
import { Group } from '../core/graph';
import { BallPool } from './ball';

describe('BallPool', () => {
  it('arc 按时落到目标点，影子在地上', () => {
    const scene = new Group();
    const pool = new BallPool(scene, () => 0.1);
    const b = pool.get('me');
    const t1 = b.arc({ x: 0, y: 1, z: 0 }, { x: 6, y: 0.1, z: -2 }, 1, 0.8);
    expect(t1).toBeCloseTo(1.8);
    pool.update(1.4);
    expect(b.m.position.y).toBeGreaterThan(1);
    pool.update(1.8);
    expect(b.m.position.x).toBeCloseTo(6, 6);
    expect(b.m.position.y).toBeCloseTo(0.1, 6);
    expect(b.m.position.z).toBeCloseTo(-2, 6);
    expect(b.sh.position.y).toBeCloseTo(0.112, 6);
    expect(b.m.visible).toBe(true);
    expect(b.m.frame?.w).toBe(2);
  });

  it('风偏记在 lastEnd；fadeOut 后放回池里', () => {
    const pool = new BallPool(new Group(), () => 0);
    const b = pool.get(null, true);
    b.arc({ x: 0, y: 1, z: 0 }, { x: 4, y: 0, z: 0 }, 0, 1, { x: 0, z: 0.5 });
    expect(b.lastEnd.z).toBeCloseTo(0.5);
    pool.update(1);
    expect(b.m.position.z).toBeCloseTo(0.5);
    b.fadeOut(1);
    pool.update(1.3);
    expect(b.inUse).toBe(true);
    expect(b.m.opacity).toBeLessThan(1);
    pool.update(1.8);
    expect(b.inUse).toBe(false);
    expect(b.m.visible).toBe(false);
    expect(pool.get(null)).toBe(b);
  });

  it('拿在手里时跟着手走', () => {
    const scene = new Group();
    const hand = new Group();
    hand.position.set(1, 1.2, 3);
    scene.add(hand);
    const pool = new BallPool(scene, () => 0);
    const b = pool.get(null);
    b.holdAt(hand);
    pool.update(0.5);
    expect(b.m.position.x).toBeCloseTo(1);
    expect(b.m.position.y).toBeCloseTo(1.2);
    expect(b.sh.visible).toBe(false);
  });
});
