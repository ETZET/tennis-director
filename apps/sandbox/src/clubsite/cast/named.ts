// 有名有姓的人（tier 'named'）：手写故事的员工、教练、摊主、球员、老会员、常客和他们的家人。
// 人在 named-staff.ts、named-members.ts；牵连在 named-ties.ts 成对地写，这里给两边各发一条（保证双向）。
// 纯数据，不碰 three / DOM / Math.random。设计：docs/design/people.md。
import { NAMED_MEMBERS } from './named-members';
import { NAMED_STAFF } from './named-staff';
import { NAMED_TIES } from './named-ties';
import type { CastPerson, Tie } from './types';

function tiesOf(id: string): Tie[] {
  const out: Tie[] = [];
  for (const [a, b, kind, aSaysB, bSaysA] of NAMED_TIES) {
    if (a === id) out.push({ with: b, kind, note: aSaysB });
    else if (b === id) out.push({ with: a, kind, note: bSaysA });
  }
  return out;
}

export const NAMED: readonly CastPerson[] = [...NAMED_STAFF, ...NAMED_MEMBERS].map(
  (p): CastPerson => ({ ...p, tier: 'named', ties: tiesOf(p.id) }),
);

/** 按 id 找 named 的人 */
export const NAMED_BY_ID: Readonly<Record<string, CastPerson>> = Object.fromEntries(NAMED.map((p) => [p.id, p]));
