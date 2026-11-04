import { type ContentBundle, type Effect, minutes } from '@td/sim';
import type { Chip } from '@td/ui';
import type { Text } from './text';

/**
 * 从内容数据自动生成选项和动作的小标签（策划不用在文案里手写代价）。
 * 只讲玩家看得见的东西；标记、日志这类幕后的账不出标签。
 */

const LOWER_IS_BETTER = new Set<string>();
const fmtNum = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n * 10) / 10)}`;

/**
 * 招聘：这个人的作用、最强的两项能力、特质和周薪（第二轮试玩 S1：招人不能是盲选；
 * docs/design/people.md：作用和特质让人记得住）
 */
function hireChips(T: Text, id: string, people: ContentBundle['people'] | undefined): Chip[] {
  const p = people?.find((x) => x.id === id);
  if (!p) return [];
  const skills = (
    [
      ['teach', p.skill],
      ['upkeep', p.upkeep ?? 0],
      ['service', p.service ?? 0],
      ['play', p.play ?? 0],
    ] as const
  )
    .slice()
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k, v]) => `${T.tr(`ui.skill.${k}`)} ${Math.round(v)}`)
    .join(' · ');
  const out: Chip[] = [];
  if (p.kind) out.push({ text: T.tr(`kinds.${p.kind}`, p.kind), tone: 'info' });
  out.push({ text: skills, tone: 'info' });
  if (p.traits.length) out.push({ text: p.traits.map((t) => T.tr(`traits.${t}.name`, t)).join(' · '), tone: 'info' });
  if (p.wage_week) out.push({ text: T.fmt('ui.chip.wage', { n: p.wage_week }), tone: 'cost' });
  return out;
}

export function effectChips(
  T: Text,
  effs: readonly Effect[],
  prob = 1,
  people?: ContentBundle['people'],
  orders?: ContentBundle['orders'],
): Chip[] {
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
    } else if ('facility' in e) out.push({ text: T.facilityState(e.facility, e.set), tone: 'gain' });
    else if ('hire' in e) {
      const who = hireChips(T, e.hire, people);
      // 有能力和周薪就不再重复"某某上任"（选项文字里已经有名字）
      out.push(
        ...(who.length
          ? who
          : [{ text: T.fmt('ui.chip.hire', { name: T.personName(e.hire) }), tone: 'info' as const }]),
      );
    } else if ('condition' in e && typeof e.add === 'number')
      out.push({
        text: `${T.facility(e.condition)} ${T.tr('ui.condition')} ${fmtNum(e.add)}`,
        tone: e.add > 0 ? 'gain' : 'loss',
      });
    else if ('fire' in e) out.push({ text: T.fmt('ui.chip.fire', { name: T.personName(e.fire) }), tone: 'loss' });
    else if ('person' in e)
      for (const [attr, v] of Object.entries(e.add)) {
        if (v === undefined) continue;
        // 岗位效果里的 person: worker 是"在岗的人"
        const who = e.person === 'worker' ? T.tr('ui.chip.worker') : T.personName(e.person).split(' ')[0];
        const label = `${who} ${T.tr(`ui.attr.${attr}`)}`;
        out.push(
          typeof v === 'number'
            ? { text: `${label} ${fmtNum(v)}`, tone: (attr === 'fatigue' ? v < 0 : v > 0) ? 'gain' : 'loss' }
            : { text: `${label} ↑`, tone: 'gain' },
        );
      }
    else if ('errand' in e)
      out.push({
        text: T.fmt('ui.chip.errand', { name: T.personName(e.errand), time: T.duration(minutes(e.for)) }),
        tone: 'time',
      });
    else if ('task' in e) {
      // 把一张工单交给某人：谁去做什么，开工时要扣的材料费另给一个标签
      out.push({
        text: T.fmt('ui.chip.task', {
          name: T.personName(e.who).split(' ')[0] ?? '',
          what: T.tr(`orders.${e.task}.title`),
        }),
        tone: 'time',
      });
      const cost = orders?.find((o) => o.id === e.task)?.cost ?? 0;
      if (cost) out.push({ text: T.fmt('ui.chip.cost', { n: cost }), tone: 'cost' });
    } else if ('activity' in e) out.push({ text: T.tr(`activities.${e.activity}.title`), tone: 'time' });
    else if ('trophy' in e) out.push({ text: T.fmt('ui.chip.trophy', { n: e.trophy }) + maybe, tone: 'gain' });
    else if ('endAct' in e)
      out.push({ text: T.tr(`endings.${e.ending}.title`), tone: e.endAct === 'won' ? 'gain' : 'loss' });
  }
  return out;
}

/** "之后可能……"：选项里安排的后续事件 */
export function thenLine(T: Text, effs: readonly Effect[]): string | undefined {
  const next = effs.filter((e): e is Extract<Effect, { schedule: string }> => 'schedule' in e);
  if (!next.length) return undefined;
  // 按种子二选一的后续卡（招聘日 a / b）标题一样，只说一次
  const titles = [...new Set(next.map((e) => T.cardTitle(e.schedule)))];
  return T.fmt('ui.then', { what: titles.join(' · ') });
}
