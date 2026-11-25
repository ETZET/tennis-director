// 游泳的人在泳道里来回游（第一轮评审「要补的画面」5）：引擎只说"在泳池第几个位置游泳"，站位是泳道里的一点；
// 画面上从这一点往前游 2.4 米、掉头游回来（蛙泳 swim 姿势，一遍 1.8 秒往前 ≈ 1 米），每个人的起点按 id 错开。
// 只挪身子（mount 的演员坐标不动：点人、跟人还按站位）。
// 躺椅（pool.loungers.s / w）：站位在躺椅正中，靠背那段在脚后 0.3 米起立起来 —— 身子往靠背那头挪 0.22 米，上身正好靠在靠背上
// （南边那排背对镜头，第 2 轮要补的画面 6：recline 让头、肩露在靠背上面，腿伸在垫子上）。
import { POOL } from '../../../clubsite/world';
import { bodyOf, type FxPart, inRect } from './util';

/** 一趟多长（米）、游多快（米 / 真实秒）、掉头用多久（秒） */
const LAP = 2.4;
const V = 0.55;
const TURN = 0.6;

export function createPool(): FxPart {
  let swimmers = 0;
  let loungers = 0;
  return {
    frame(f) {
      swimmers = 0;
      loungers = 0;
      for (const v of f.views) {
        if (v.where.kind === 'at' && v.where.at.startsWith('pool.loungers')) {
          const a = f.actors.get(v.id);
          const o = bodyOf(a);
          if (a && o && !a.moving && o.userData.poseName?.() === 'recline') {
            o.position.x = a.x - Math.sin(a.yaw) * 0.22;
            o.position.z = a.z - Math.cos(a.yaw) * 0.22;
            loungers++;
          }
          continue;
        }
        if (v.doing !== 'swim' || v.where.kind !== 'at' || v.where.at !== 'pool.water') continue;
        const a = f.actors.get(v.id);
        const o = bodyOf(a);
        if (!a || !o || a.moving || !inRect(f.view, a.x, a.z, 3)) continue;
        if (o.userData.poseName?.() !== 'swim') continue;
        swimmers++;
        // 一个来回：往前 LAP → 掉头 → 往回 LAP → 掉头
        const leg = LAP / V;
        const period = 2 * (leg + TURN);
        const t = (f.rt + a.hash * period) % period;
        let s: number;
        let back = false;
        let turn = 0;
        if (t < leg) s = (t / leg) * LAP;
        else if (t < leg + TURN) {
          s = LAP;
          turn = (t - leg) / TURN;
        } else if (t < 2 * leg + TURN) {
          s = LAP - ((t - leg - TURN) / leg) * LAP;
          back = true;
        } else {
          s = 0;
          back = true;
          turn = (t - 2 * leg - TURN) / TURN;
        }
        const dx = Math.sin(a.yaw);
        const dz = Math.cos(a.yaw);
        const off = s - LAP / 2;
        let x = a.x + dx * off;
        let z = a.z + dz * off;
        // 不游出池子
        x = Math.min(POOL.x1 - 0.8, Math.max(POOL.x0 + 0.8, x));
        z = Math.min(POOL.z1 - 0.6, Math.max(POOL.z0 + 0.6, z));
        o.position.x = x;
        o.position.z = z;
        o.rotation.y = a.yaw + (back ? Math.PI : 0) + (turn > 0 ? Math.PI * turn : 0);
      }
    },
    off() {},
    stats: () => ({ swimmers, loungers }),
  };
}
