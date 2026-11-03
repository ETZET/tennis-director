/* 记分牌塔 · Scoreboard tower
 * 两条钢架腿撑着一块大比分屏：两名选手的名字、三盘局分、当前分（会跳）；顶上有时钟。
 * 脚下有检修走道、梯子和操作员小亭，前面是一角球场和几个观众。对应 st1 中心球场的赛事。 */
building({
  id: 'scoreboard', no: 10, name: '记分牌塔', en: 'SCOREBOARD', size: '8 × 2 m，高 7.5 m', top: 8, pad: 15,
  serves: '中心球场的赛事（st1_exhibition、st3_league）：复原后赛事日观众更多、声望加成更高',
  levels: [
    '屏幕面板掉了好几块，钢架生锈，时钟停在不知道哪一年。操作亭只剩半截墙。',
    '钢架重新刷漆，面板装齐了但还没通电。有人站在检修走道上接线，操作亭刚砌好。',
    '比分屏亮着：LEE 对 PARK，局分一盘盘跳，当前分 15、30、40 轮着变；顶上时钟走着。操作员在亭子里盯着电脑，场边观众在看球；夜里整块屏发光。',
  ],
  build(lv) {
    const R = rng(9701 + lv);
    const BX0 = -3.6, BX1 = 3.6, BZ0 = -0.35, BZ1 = 0.05, BY0 = 3.1, BY1 = 6.3;
    const steel = ['#7a5a42', '#596069', '#1d2f52'][lv - 1];

    // ---------- 地面：草、一角球场
    gRect(-7, 7, -7, 1.6, lv === 1 ? '#e2c495' : '#6cbc4f', { pat: (x, z, px, py) => (lv === 1 ? (fbm(x, z, 3) > 0.55 ? '#d6b47e' : null) : lv === 2 && fbm(x, z, 4) > 0.55 ? '#c9b46a' : hash(px, py, 2) > 0.85 ? '#4e9a3f' : null) });
    gRect(-7, 7, 1.6, 7, lv === 1 ? '#6b6560' : '#3a8a5f', { pat: (x, z) => (lv === 1 ? (fbm(x * 0.8, z * 0.8, 31) > 0.55 ? '#e6c793' : null) : (x > -5.5 && z > 3.2) ? '#4b67d1' : null) });
    if (lv >= 2) { const lw = Math.max(1, Math.round(k * 0.13)); gLine(-5.5, 3.2, 7, 3.2, '#ffffff', lw); gLine(-5.5, 3.2, -5.5, 7, '#ffffff', lw); gLine(-4.1, 3.2, -4.1, 7, '#ffffff', lw); gLine(1.2, 3.2, 1.2, 3.5, '#ffffff', lw); }
    // 底座
    for (const x of [-2.7, 2.7]) gRect(x - 0.6, x + 0.6, -0.8, 0.5, '#bdb7ab');

    // ---------- 钢架腿
    for (const x of [-2.7, 2.7]) add({ x0: x - 0.4, x1: x + 0.4, z0: -0.5, z1: 0.2, y0: 0, y1: BY0, draw() {
      const lit = litAt(x, -0.2), c = col(steel, 1, lit), w = Math.max(1, Math.round(k * 0.15));
      box(x - 0.5, x + 0.5, -0.6, 0.3, 0, 0.3, '#a9a49a', { lit });
      for (const dx of [-0.3, 0.3]) wline([x + dx, 0.3, -0.15], [x + dx, BY0, -0.15], c, w);
      for (let i = 0; i < 5; i++) { const y = 0.3 + i * (BY0 - 0.3) / 5, y2 = y + (BY0 - 0.3) / 5; if (lv === 1 && (i === 2)) continue; wline([x - 0.3, y, -0.15], [x + 0.3, y2, -0.15], c); }
    } });
    shadowBox(BX0, BX1, -0.4, 0.1, BY1 + 0.5);
    // 梯子（右腿）
    add({ x0: 3.0, x1: 3.4, z0: 0.1, z1: 0.4, y0: 0, y1: BY0, draw() {
      if (lv === 1) return;
      const lit = litAt(3.2, 0.2), c = col('#c9ccc8', 1, lit);
      wline([3.05, 0, 0.3], [3.05, BY0, 0.3], c); wline([3.35, 0, 0.3], [3.35, BY0, 0.3], c);
      for (let y = 0.3; y < BY0; y += 0.3) wline([3.05, y, 0.3], [3.35, y, 0.3], c);
    } });

    // ---------- 比分屏
    add({ x0: BX0, x1: BX1, z0: BZ0, z1: BZ1, y0: BY0, y1: 7.6, draw() {
      const lit = litAt(0, 0), on = lv === 3;
      const led = (h, f = 1) => (on && night) ? em(h, f) : col(h, f, lit);
      box(BX0, BX1, BZ0, BZ1, BY0, BY1, steel, { lit, top: '#2a2f3a', face: (nx, nz) => {
        const Z = nz === 1 ? BZ1 : nz === -1 ? BZ0 : null;
        if (Z === null) return;
        // 屏面
        fq('z', Z, 0, nz, BX0 + 0.15, BX1 - 0.15, BY0 + 0.15, BY1 - 0.15, (on && night) ? em('#0d1424') : col('#121a2c', 1, lit));
        if (lv === 1) {
          // 掉了的面板
          for (const [a, b, y0, y1] of [[-2.6, -1.4, 4.0, 5.0], [0.8, 2.2, 3.4, 4.4], [-0.4, 0.6, 5.2, 6.1]]) fq('z', Z, 0, nz, a, b, y0, y1, col('#6a5a4a', 1, lit));
          return;
        }
        if (nz !== 1) return;
        // 分隔线
        fq('z', Z, 0, 1, BX0 + 0.25, BX1 - 0.25, 4.62, 4.68, led('#3a4a6a'));
        if (!on) { fq('z', Z, 0, 1, -0.1, -0.05, BY0 + 0.25, BY1 - 0.25, col('#2a3448', 1, lit)); return; }
        const cell = 0.13;
        faceText('z', Z, 0, 1, BX0 + 0.35, 5.05, cell, 'LEE', '#ffffff', night ? 1 : lit);
        faceText('z', Z, 0, 1, BX0 + 0.35, 3.85, cell, 'PARK', '#ffffff', night ? 1 : lit);
        // 发球方的小点
        const serveTop = Math.floor(T / 6) % 2 === 0;
        const sp = P(BX0 + 0.25, serveTop ? 5.35 : 4.15, Z + 0.04); rect(sp[0] - 1, sp[1] - 1, 3, 3, led('#d8f23a'));
        // 三盘局分
        const sets = [['6', '4', String(Math.floor(T / 9) % 6)], ['3', '6', String(Math.floor(T / 11) % 6)]];
        for (let s = 0; s < 3; s++) {
          const u = -0.1 + s * 0.75;
          faceText('z', Z, 0, 1, u, 5.05, cell, sets[0][s], s === 2 ? '#ffb43a' : '#f0c53c', night ? 1 : lit);
          faceText('z', Z, 0, 1, u, 3.85, cell, sets[1][s], s === 2 ? '#ffb43a' : '#f0c53c', night ? 1 : lit);
        }
        // 当前分
        const pts = ['0', '15', '30', '40'], i = Math.floor(T / 2.5);
        fq('z', Z, 0, 1, 2.15, BX1 - 0.25, 3.7, 5.85, led('#1d2f52'));
        faceText('z', Z, 0, 1, 2.25, 5.05, cell, pts[i % 4].padStart(2, ' '), '#3fe08a', night ? 1 : lit);
        faceText('z', Z, 0, 1, 2.25, 3.85, cell, pts[(i + 1) % 4].padStart(2, ' '), '#3fe08a', night ? 1 : lit);
        if (night) { const p = P(0, (BY0 + BY1) / 2, Z); glow(p[0], p[1], k * 3.6, [30, 50, 90], 0.9); }
      } });
      // 顶上的时钟
      if (lv >= 2) {
        box(-1.2, 1.2, -0.3, 0.0, BY1, BY1 + 0.95, steel, { lit, face: (nx, nz) => {
          if (nz !== 1) return;
          fq('z', 0.0, 0, 1, -1.05, 1.05, BY1 + 0.12, BY1 + 0.83, (on && night) ? em('#0d1424') : col('#121a2c', 1, lit));
          if (on) { const m = Math.floor(T / 4) % 60; faceText('z', 0.0, 0, 1, -0.96, BY1 + 0.2, 0.11, '14:' + String(m).padStart(2, '0'), '#ffb43a', night ? 1 : lit); }
        } });
      } else box(-1.2, 0.4, -0.3, 0.0, BY1, BY1 + 0.5, '#6a5a4a', { lit });
      // 旗杆
      if (lv === 3) { const a = P(BX1 - 0.2, BY1, -0.15), b = P(BX1 - 0.2, BY1 + 1.3, -0.15); line(a[0], a[1], b[0], b[1], col('#d8d8d8', 1, lit)); for (let i = 1; i < 8; i++) for (let j = 0; j < 4; j++) pix(b[0] + i, b[1] + j + Math.round(Math.sin(T * 5 - i * 0.6)), col(j < 2 ? '#2f7a4a' : '#f0c53c', 1, lit)); }
    } });
    // 检修走道
    add({ x0: BX0, x1: BX1, z0: BZ1, z1: 0.75, y0: BY0 - 0.15, y1: BY0 + 0.9, draw() {
      const lit = litAt(0, 0.4);
      if (lv === 1) { box(BX0, -0.6, BZ1, 0.7, BY0 - 0.15, BY0 - 0.05, '#7a5a42', { lit }); return; }
      box(BX0, BX1, BZ1, 0.7, BY0 - 0.15, BY0 - 0.05, '#596069', { lit });
      const c = col('#c9ccc8', 1, lit); wline([BX0, BY0 + 0.75, 0.7], [BX1, BY0 + 0.75, 0.7], c);
      for (let x = BX0; x <= BX1 + 0.01; x += 0.9) wline([x, BY0 - 0.05, 0.7], [x, BY0 + 0.75, 0.7], c);
    } });
    if (lv === 2) npc(-1.2, 0.4, randLook(R, { hard: true, shirt: '#ff8a3d' }), { y: BY0 - 0.05, face: [0, -1] });

    // ---------- 操作亭
    room(4.0, 6.8, -3.4, -0.6, {
      h: 2.5, cut: 0.85, wall: lv === 3 ? '#1d2f52' : lv === 2 ? '#c9c2b2' : '#a08a70', inner: lv === 1 ? '#b8a58c' : '#ece6da', cap: lv === 3 ? '#f0c53c' : '#d8cdb8',
      seed: 99 + lv, ruin: lv === 1, gaps: { w: [[-1.6, -0.8]] }, floor: lv === 1 ? '#c9b08a' : '#9a9a9a',
      decor: (side, ax, c, nx, nz, u0, u1, H, lit) => { if (side === 'n' && lv >= 2 && H > 2) fq('z', c, nx, nz, 4.4, 6.4, 1.3, 2.1, lv === 3 && night ? em('#3a6a9a') : col('#3b5874', 1, lit)); },
    });
    if (lv >= 2) add({ x0: 4.4, x1: 6.4, z0: -3.1, z1: -2.5, y0: 0, y1: 1.2, draw() {
      const lit = litAt(5.4, -2.8);
      box(4.4, 6.4, -3.1, -2.5, 0, 0.8, '#c89a5a', { lit, top: '#e9e4d0' });
      if (lv === 3) { box(5.0, 5.6, -3.0, -2.7, 0.8, 0.82, '#2a2632', { lit }); wpoly([[5.0, 0.82, -3.0], [5.6, 0.82, -3.0], [5.6, 1.2, -3.05], [5.0, 1.2, -3.05]], night ? em('#7ae0ff') : col('#2a2632', 1, lit)); }
    } });
    if (lv === 3) npc(5.3, -2.0, randLook(R, { shirt: '#1d2f52', bot: '#2d3a5a', hat: '#f0c53c' }), { face: [0, -1] });

    // ---------- 观众
    if (lv === 3) {
      add({ x0: -6.2, x1: -3.2, z0: 1.9, z1: 2.4, y0: 0, y1: 0.5, draw() { const lit = litAt(-4.7, 2.1); box(-6.2, -3.2, 1.9, 2.4, 0.38, 0.5, '#f4ecd8', { lit }); box(-6.1, -5.95, 1.95, 2.35, 0, 0.38, '#3a3f47', { lit }); box(-3.45, -3.3, 1.95, 2.35, 0, 0.38, '#3a3f47', { lit }); } });
      const fans = [['#e2463c', '#2d3a5a'], ['#f0c53c', '#ffffff'], ['#2f7fd8', '#efe9da']];
      fans.forEach(([s, b], i) => npc(-5.7 + i * 1.0, 2.15, randLook(R, { shirt: s, bot: b }), { pose: 'sit', y: 0.45, face: [0, 1], at: (t) => [-5.7 + i * 1.0, 2.15, 'sit', 0, [0, 1]], bob: 0 }));
      bush(-6.4, -3.2, 1.3); bush(6.6, 1.0, 1.1);
      LAMPS.push({ x: 0, z: 1.5, r: 6.5, i: 0.7 }, { x: 5.4, z: -2.0, r: 3.5, i: 0.6 });
    }
    if (lv === 2) { cone(-1, 1.2); cone(1.6, 1.0); LAMPS.push({ x: -1.2, z: 0.6, r: 3.5, i: 0.5 }); LIGHTS.push({ x: -1.2, y: BY0 + 0.9, z: 0.5, r: 2.2, c: [200, 220, 255], i: 0.8 }); }
    if (lv === 1) { tumble(-1.6, 1.2, 0.55); tumble(4.6, 2.4, 0.45); planks(0.8, -1.8, 'x'); }
    palm(-6.6, -6.4, 7, lv === 1 ? { dead: true } : {});
    palm(6.4, -6.2, 6.5, lv === 1 ? { dead: true } : lv === 2 ? { half: true } : {});
  },
});
