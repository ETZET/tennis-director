import type { Effect } from '@td/sim';
import type { Chip } from '@td/ui';
import type { Text } from './text';

/**
 * 从内容数据自动生成选项和动作的小标签（策划不用在文案里手写代价）。
 * 只讲玩家看得见的东西；标记、日志这类幕后的账不出标签。
 */

const LOWER_IS_BETTER = new Set(['pickleball_pressure']);
const fmtNum = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n * 10) / 10)}`;

export function effectChips(T: Text, effs: readonly Effect[], prob = 1): Chip[] {
  const out: Chip[] = [];
  for (const e of effs) {
    const p = prob * (typeof e.chance === 'number' ? e.chance : 1);
    const maybe = p < 1 ? ` (${Math.round(p * 100)}%)` : e.chance !== undefined ? ' (?)' : '';
    if ('stat' in e && 'add' in e) {
      const name = T.tr(`stats.${e.stat}`);
      if (typeof e.add !== 'number') {
        out.push({ text: `${name} ±${maybe}`, tone: 'info' });
        continue;
      }
      const good = LOWER_IS_BETTER.has(e.stat) ? e.add < 0 : e.add > 0;
      const text = e.stat === 'cash' ? `${e.add > 0 ? '+' : '−'}$${Math.abs(e.add)}` : `${name} ${fmtNum(e.add)}`;
      out.push({ text: text + maybe, tone: e.stat === 'cash' && e.add < 0 ? 'cost' : good ? 'gain' : 'loss' });
    } else if ('facility' in e) out.push({ text: T.tr(`facilities.${e.facility}.${e.set}`), tone: 'gain' });
    else if ('hire' in e) out.push({ text: T.fmt('ui.chip.hire', { name: T.personName(e.hire) }), tone: 'info' });
    else if ('fire' in e) out.push({ text: T.fmt('ui.chip.fire', { name: T.personName(e.fire) }), tone: 'loss' });
    else if ('person' in e)
      for (const [attr, v] of Object.entries(e.add)) {
        if (v === undefined) continue;
        const label = `${T.personName(e.person).split(' ')[0]} ${T.tr(`ui.attr.${attr}`)}`;
        out.push(
          typeof v === 'number'
            ? { text: `${label} ${fmtNum(v)}`, tone: (attr === 'fatigue' ? v < 0 : v > 0) ? 'gain' : 'loss' }
            : { text: `${label} ↑`, tone: 'gain' },
        );
      }
    else if ('energy' in e && typeof e.energy === 'number')
      out.push({ text: T.fmt('ui.chip.energy', { n: fmtNum(e.energy) }), tone: 'energy' });
    else if ('activity' in e) out.push({ text: T.tr(`activities.${e.activity}.title`), tone: 'time' });
    else if ('endAct' in e)
      out.push({ text: T.tr(`endings.${e.ending}.title`), tone: e.endAct === 'won' ? 'gain' : 'loss' });
  }
  return out;
}

/** "之后可能……"：选项里安排的后续事件 */
export function thenLine(T: Text, effs: readonly Effect[]): string | undefined {
  const next = effs.filter((e): e is Extract<Effect, { schedule: string }> => 'schedule' in e);
  if (!next.length) return undefined;
  return T.fmt('ui.then', { what: next.map((e) => T.cardTitle(e.schedule)).join(' · ') });
}
