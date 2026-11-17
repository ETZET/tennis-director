import { describe, expect, it } from 'vitest';
import { type DriveSpec, type DriveState, driveHit, driveStep, newDriveState } from './drive';

const DT = 1 / 60;
const CAR: DriveSpec = { speed: 17, turn: 2, radius: 4.5, accel: 7.5, brake: 20, coast: 5, grip: 9, reverse: 5 };

/** 开 sec 秒：摇杆一直指世界方向 (wx, wz)；返回最后的位置、朝向 */
function run(st: DriveState, spec: DriveSpec, sec: number, wx: number, wz: number, from = { x: 0, z: 0, yaw: 0 }) {
  let { x, z, yaw } = from;
  let maxRate = 0;
  for (let t = 0; t < sec; t += DT) {
    const r = driveStep(st, spec, x, z, yaw, wx, wz, DT);
    x += r.dx;
    z += r.dz;
    yaw = r.yaw;
    maxRate = Math.max(maxRate, Math.abs(st.yawRate));
  }
  return { x, z, yaw, maxRate };
}

describe('开车手感（drive.ts）', () => {
  it('有惯性：起步要几秒才到极速，不是一推就满速', () => {
    const st = newDriveState();
    run(st, CAR, 0.5, 0, 1);
    expect(st.v).toBeGreaterThan(2);
    expect(st.v).toBeLessThan(6);
    run(st, CAR, 5, 0, 1);
    expect(st.v).toBeGreaterThan(16);
    expect(st.v).toBeLessThanOrEqual(17.01);
  });

  it('摇杆推到 75% 就是满油门', () => {
    const st = newDriveState();
    run(st, CAR, 8, 0, 0.75);
    expect(st.v).toBeGreaterThan(16.5);
  });

  it('松手滑行几秒停下（不是停死）', () => {
    const st = newDriveState();
    run(st, CAR, 6, 0, 1);
    run(st, CAR, 0.3, 0, 0);
    expect(st.v).toBeGreaterThan(14);
    run(st, CAR, 4, 0, 0);
    expect(st.v).toBe(0);
  });

  it('沿车头走，不往摇杆方向平移：停着往侧面推，第一步几乎全是往前', () => {
    const st = newDriveState();
    const r = driveStep(st, CAR, 0, 0, 0, 1, 0, DT);
    driveStep(st, CAR, r.dx, r.dz, r.yaw, 1, 0, DT);
    expect(Math.abs(st.vx)).toBeLessThan(Math.abs(st.vz) * 0.2 + 1e-6);
  });

  it('拐弯按转弯半径：快的时候转向封顶 turn，慢的时候拐不急', () => {
    const st = newDriveState();
    run(st, CAR, 6, 0, 1);
    const fast = run(st, CAR, 0.6, 1, 0);
    expect(fast.maxRate).toBeLessThanOrEqual(CAR.turn + 1e-6);
    expect(fast.maxRate).toBeGreaterThan(1.5);
    const slow = newDriveState();
    const s = run(slow, CAR, 0.4, 1, 0);
    expect(s.maxRate).toBeLessThan(0.7);
  });

  it('急弯有一点侧滑，转完了抓回来', () => {
    const st = newDriveState();
    run(st, CAR, 6, 0, 1);
    run(st, CAR, 0.5, 1, 0);
    expect(Math.abs(st.side)).toBeGreaterThan(1);
    run(st, CAR, 3, 1, 0);
    expect(Math.abs(st.side)).toBeLessThan(0.3);
  });

  it('停着往车尾拉 = 倒车（车尾对着摇杆，车头不掉过来）；推回前面挂前进档', () => {
    const st = newDriveState();
    const r = run(st, CAR, 1.5, 0, -1);
    expect(st.rev).toBe(true);
    expect(st.v).toBeLessThan(-2);
    expect(r.z).toBeLessThan(-1);
    expect(Math.abs(r.yaw)).toBeLessThan(0.05);
    run(st, CAR, 2, 0, 1, r);
    expect(st.rev).toBe(false);
    expect(st.v).toBeGreaterThan(0);
  });

  it('慢慢滚着（< 3 米/秒）按到车尾后面：先刹住再倒车', () => {
    const st = newDriveState();
    run(st, CAR, 0.35, 0, 1);
    expect(st.v).toBeGreaterThan(1.5);
    expect(st.v).toBeLessThan(3);
    run(st, CAR, 1.2, 0, -1);
    expect(st.rev).toBe(true);
    expect(st.v).toBeLessThan(0);
  });

  it('开得快往后拉不倒车：先松油门、拐个弯掉头', () => {
    const st = newDriveState();
    const a = run(st, CAR, 6, 0, 1);
    const b = run(st, CAR, 2.5, 0, -1, a);
    expect(st.rev).toBe(false);
    // 车头转过去了（朝 −z）
    expect(Math.cos(b.yaw)).toBeLessThan(0);
  });

  it('沙地（ground 0.4）上极速打折；从路上冲下去慢慢拖下来，不是一下停住', () => {
    const sand: DriveSpec = { ...CAR, ground: (_x, z) => (z > 60 ? 0.4 : 1) };
    const st = newDriveState();
    run(st, sand, 5, 0, 1);
    const v0 = st.v;
    run(st, sand, 0.3, 0, 1, { x: 0, z: 61, yaw: 0 });
    expect(st.v).toBeGreaterThan(v0 - 3);
    run(st, sand, 5, 0, 1, { x: 0, z: 61, yaw: 0 });
    expect(st.v).toBeLessThan(17 * 0.4 + 0.5);
    expect(st.ground).toBeCloseTo(0.4);
  });

  it('撞墙：按实际走的比例掉速，顶死了速度归零，记下撞掉的速度', () => {
    const st = newDriveState();
    run(st, CAR, 4, 0, 1);
    const v0 = Math.hypot(st.vx, st.vz);
    driveHit(st, 0.25, 0.125);
    expect(Math.hypot(st.vx, st.vz)).toBeCloseTo(v0 / 2);
    expect(st.hit).toBeCloseTo(v0 / 2);
    driveHit(st, 0.2, 0);
    expect(st.v).toBe(0);
  });
});
