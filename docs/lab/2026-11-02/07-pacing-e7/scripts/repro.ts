import { CONTENT, newGame, advance, worldOf, orderStatus, postStatus } from '@td/sim';
const s = newGame(CONTENT, { seed: 37 });
const w = worldOf(s, CONTENT);
advance(s, CONTENT, [{ type: 'assign', person: 'director', target: 'o1_sweep' }, { type: 'assign', person: 'dale', target: 'o1_sweep' }], 0);
for (let d = 0; d < 6 * 24 * 60; d += 60) {
  advance(s, CONTENT, [], 60);
  if (d % (6*60) === 0) {
    const vis = [...w.orders.values()].map(o => orderStatus(s, w, o)).filter(x => x.visible).map(x => `${x.id}(${x.blocked})`);
    console.log('t', (s.t/1440).toFixed(2), s.facilities.outer_1, 'cash', Math.round(s.stats.cash), 'orders', vis.join(','), 'open', s.cards.open.map(o=>o.card).join(','), 'jobs', s.people.director.job, s.people.dale.job);
  }
}
