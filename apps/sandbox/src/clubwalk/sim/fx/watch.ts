// 看球的人看着场（第二轮引擎：看台、场边长椅有 Place.faces = 看得到哪几块场）：
// 坐着 / 站着看球的人，头（转不过来的分一点给上身）转向他看的那块场 —— 有人在打的那块（中心）；faces 里都没人打就看第一块。
// 站位已经朝着场的（看台）几乎不动；侧着坐的长椅、喷泉池沿上的人会扭过头去看。只在取景附近摆；换了身子 / 换了地方重摆。
import * as THREE from 'three';
import type { Place, PlaceId } from '../../../clubsite/sim/types';
import { PLACES } from '../deps';
import { bodyOf, type FxPart, inRect } from './util';

const placeBy = new Map<PlaceId, Place>(PLACES.map((p) => [p.id, p]));
const WATCHING = new Set(['watch']);

export function createWatch(): FxPart {
  /** 每具身子上次看的是哪（换了地方、换了场才重摆：lookAt 每次都要重摆一遍姿势） */
  const done = new WeakMap<THREE.Object3D, string>();
  const st = { looking: 0 };
  return {
    frame(f) {
      st.looking = 0;
      for (const v of f.views) {
        const a = f.actors.get(v.id);
        const o = bodyOf(a);
        if (!a || !o) continue;
        const w = v.where;
        const faces = w.kind === 'at' && WATCHING.has(v.doing) ? placeBy.get(w.at)?.faces : undefined;
        // 不在看球了、在走（mount 那时把头摆正了）：下回坐下再转过去
        if (!faces?.length || a.moving || w.kind !== 'at') {
          done.delete(o);
          continue;
        }
        if (!inRect(f.view, a.x, a.z, 2)) continue;
        const busy = faces.find((id) => (f.s.occupants[id]?.length ?? 0) > 0) ?? faces[0];
        const c = placeBy.get(busy);
        if (!c) continue;
        const key = `${w.at}:${v.spot}:${busy}`;
        st.looking++;
        if (done.get(o) === key) continue;
        done.set(o, key);
        o.userData.lookAt?.(new THREE.Vector3(c.x, a.y + 1.2, c.z));
      }
    },
    off() {},
    stats: () => ({ ...st }),
  };
}
