// 存档：演员表的状态（好感、记忆、时钟、零用钱）放 localStorage 'td-cast-v1'；?castreset=1 清掉重来。
import type { CastState } from '../../clubsite/cast/types';

const KEY = 'td-cast-v1';

export function loadState(params: URLSearchParams, fresh: () => CastState): CastState {
  if (params.get('castreset') === '1') {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    return fresh();
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as CastState;
      const f = fresh();
      if (s && typeof s.day === 'number' && typeof s.minute === 'number' && s.people && s.seed === f.seed) return s;
    }
  } catch {}
  return fresh();
}

export function saveState(s: CastState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
