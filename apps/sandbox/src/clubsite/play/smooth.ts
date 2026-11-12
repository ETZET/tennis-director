// 走路平顺（固定步长循环的两处修正，画面不变）：
// 1. snapDelta：rAF 的帧间隔贴到 1/60 秒的整数倍（差 < 2 毫秒时）。60 Hz 屏上帧间隔 16.5 / 16.8 毫秒来回抖，
//    不贴的话累加器时而一帧走 0 步、时而 2 步：整个画面停一帧再跳两步，就是"走路一顿一顿"。贴了以后 60 Hz 屏每帧正好 1 步、
//    120 Hz 屏 0/1 交替（匀的）。
// 2. ViewLerp：渲染时把总监（位置、朝向）、相机看向点、跟着总监的东西（userData.followsDirector）
//    放在上一步和这一步之间（alpha = 累加器余量 / DT），画完放回去。模拟状态不变（下一步照常从真值算），
//    90 / 144 Hz 这类不是 60 整数倍的屏、以及偶尔掉帧时，总监和镜头也是匀的。
// 用法（各页面的 frame）：
//   acc += snapDelta(Math.min(0.1, (now - last) / 1000));
//   while (acc >= DT) { lerp.mark(); step(DT); acc -= DT; }
//   lerp.begin(acc / DT); pipe.render(scene); …画完要投影的（HUD、标签）…; lerp.end();
import * as THREE from 'three';

/** 帧间隔贴到 1/60 秒的整数倍（差 < tol 秒时）；不像整数倍（例如 90 Hz 的 11.1 毫秒）就原样返回 */
export function snapDelta(sec: number, tol = 0.002): number {
  const DT = 1 / 60;
  const k = Math.round(sec / DT);
  if (k >= 1 && Math.abs(sec - k * DT) < tol) return k * DT;
  // 120 Hz：贴到半步，累加器两帧凑一步（匀的 0/1 交替）
  if (Math.abs(sec - DT / 2) < tol / 2) return DT / 2;
  return sec;
}

/** 一步里移动超过这个（米）就当瞬移，不插值（传送、开局摆位） */
const TELEPORT = 1;

export class ViewLerp {
  private prevPos = new THREE.Vector3();
  private prevYaw = 0;
  private prevCam = new THREE.Vector3();
  private has = false;
  private saved: {
    pos: THREE.Vector3;
    yaw: number;
    cam: THREE.Vector3;
    followers: [THREE.Object3D, THREE.Vector3, number][];
  } | null = null;

  constructor(
    private director: THREE.Object3D,
    private rig: { target: THREE.Vector3 },
    private scene: THREE.Object3D,
  ) {}

  /** 每个模拟步之前调：记下这一步之前的样子 */
  mark() {
    this.prevPos.copy(this.director.position);
    this.prevYaw = this.director.rotation.y;
    this.prevCam.copy(this.rig.target);
    this.has = true;
  }

  /** 渲染前：放到上一步和这一步之间（alpha 0..1） */
  begin(alpha: number) {
    if (!this.has || this.saved) return;
    const D = this.director;
    const t = this.rig.target;
    const a = Math.min(1, Math.max(0, alpha));
    const jump = D.position.distanceTo(this.prevPos) > TELEPORT;
    const camJump = t.distanceTo(this.prevCam) > TELEPORT;
    if (a >= 1 || (jump && camJump)) return;
    this.saved = { pos: D.position.clone(), yaw: D.rotation.y, cam: t.clone(), followers: [] };
    if (!jump) {
      const cur = this.saved.pos;
      const dx = (this.prevPos.x - cur.x) * (1 - a);
      const dy = (this.prevPos.y - cur.y) * (1 - a);
      const dz = (this.prevPos.z - cur.z) * (1 - a);
      D.position.set(cur.x + dx, cur.y + dy, cur.z + dz);
      let dyaw = this.saved.yaw - this.prevYaw;
      dyaw -= Math.round(dyaw / (Math.PI * 2)) * Math.PI * 2;
      const back = -dyaw * (1 - a);
      D.rotation.y = this.saved.yaw + back;
      // 跟着总监、但挂在场景上的东西（例如餐车院子端着的一摞盘子）：绕总监转同样的角度、平移同样的量
      const c = Math.cos(back);
      const s = Math.sin(back);
      for (const o of this.scene.children) {
        if (!o.userData.followsDirector || !o.visible) continue;
        this.saved.followers.push([o, o.position.clone(), o.rotation.y]);
        const rx = o.position.x - cur.x;
        const rz = o.position.z - cur.z;
        // three 绕 y 转 θ：x' = x cosθ + z sinθ，z' = −x sinθ + z cosθ
        o.position.set(D.position.x + rx * c + rz * s, o.position.y + dy, D.position.z - rx * s + rz * c);
        o.rotation.y += back;
      }
    }
    if (!camJump) t.lerpVectors(this.prevCam, this.saved.cam, a);
  }

  /** 渲染完：放回真值 */
  end() {
    const s = this.saved;
    if (!s) return;
    this.director.position.copy(s.pos);
    this.director.rotation.y = s.yaw;
    this.rig.target.copy(s.cam);
    for (const [o, p, ry] of s.followers) {
      o.position.copy(p);
      o.rotation.y = ry;
    }
    this.saved = null;
  }
}
