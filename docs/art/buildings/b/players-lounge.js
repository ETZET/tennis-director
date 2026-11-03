/* 球员休息室 · Players' lounge（剖面画法）
 * 背墙一台在播比赛的大电视和沙发，侧墙一排储物柜，角落有冰箱和零食台，有人在垫子上拉伸。
 * 外面是带凉棚的露台和冰桶，入口拉着贵宾绳。职业赛（st2_pro）的球员在这里候场。 */
building({
  id: 'players-lounge', no: 2, name: '球员休息室', en: "PLAYERS' LOUNGE", size: '8.5 × 5 m 室内 + 露台', top: 4, pad: 16,
  serves: '职业赛和表演赛（st2_pro、st2_events）的球员候场；有人在岗时球员好感上升',
  levels: [
    '墙倒了几段，沙发破了洞，电视屏幕碎成蛛网。储物柜锈着、门都开着。',
    '墙补好，新储物柜装上一半，沙发还罩着塑料布，电视没通电。有人在刷墙。',
    '电视在直播比赛，球员窝在沙发里看，有人在垫子上拉伸。冰箱、零食台、储物柜一应俱全；外面露台有躺椅和冰桶，入口拉着贵宾绳。',
  ],
  build(lv) {
    const R = rng(5301 + lv);
    const X0 = -5.5, X1 = 3, Z0 = -5.5, Z1 = -0.5;
    const wall = ['#b9a48a', '#d9d2c4', '#1d2f52'][lv - 1];
    const inner = ['#cdbb9e', '#ece6da', '#f3ecdc'][lv - 1];

    // ---------- 地面：露台、小路
    gRect(X0, X1, Z1, 1.4, lv === 1 ? '#c9b08a' : '#c89a5a', {
      pat: (x, z, px, py) => {
        if (lv === 1 && fbm(x * 0.6, z * 0.6, 3) > 0.48) return '#e6c793';
        return Math.abs(((z - Z1) % 0.4 + 0.4) % 0.4) < 0.05 ? (lv === 1 ? '#a8906c' : '#a87a50') : null;
      },
    });
    gRect(-1.4, 0.2, 1.4, 8, lv === 1 ? '#e2c495' : '#d8cdb8');
    gRect(X1, 7.4, -5.4, -0.5, lv === 1 ? '#c9b08a' : '#c89a5a', { pat: (x, z, px, py) => (lv === 1 && fbm(x * 0.6, z * 0.6, 13) > 0.45 ? '#e6c793' : Math.abs(((x - X1) % 0.4 + 0.4) % 0.4) < 0.05 ? (lv === 1 ? '#a8906c' : '#a87a50') : null) });
    if (lv >= 2) gRect(-7.6, -6.2, -7.6, 6.5, '#6cbc4f', { pat: (x, z, px, py) => (lv === 2 && fbm(x, z, 4) > 0.55 ? '#c9b46a' : hash(px, py, 2) > 0.85 ? '#4e9a3f' : null) });

    // ---------- 室内
    room(X0, X1, Z0, Z1, {
      h: 3.3, cut: 0.9, wall, inner, cap: lv === 3 ? '#e3cf9e' : inner, seed: 70 + lv, ruin: lv === 1,
      gaps: { s: [[-1.6, 0.4]] },
      floor: lv === 1 ? '#b9a07a' : '#b98a5e',
      floorPat: (x, z, px, py) => {
        if (lv === 1 && fbm(x * 0.7, z * 0.7, 8) > 0.45) return '#e6c793';
        if (lv >= 2 && x > -4.4 && x < -0.2 && z > -4.2 && z < -1.4) return lv === 3 ? ((x > -4.2 && x < -0.4 && z > -4.0 && z < -1.6) ? '#2f7a4a' : '#e3cf9e') : '#8f8a80';
        return (Math.floor((x - X0) / 0.35) & 1) ? (lv === 1 ? '#a8906c' : '#a87a50') : null;
      },
      decor: (side, ax, c, nx, nz, u0, u1, H, lit) => {
        if (side === 'n') tvWall(c, nx, nz, u0, u1, H, lit);
        if (side === 'w') lockerWall(c, nx, nz, u0, u1, H, lit);
      },
    });
    shadowBox(X0, X1, Z0, Z0 + 0.25, 3.3); shadowBox(X0, X0 + 0.25, Z0, Z1, 3.3);

    function tvWall(c, nx, nz, u0, u1, H, lit) {
      if (H < 2.6) return;
      const a = -3.6, b = -1.0, y0 = 1.25, y1 = 2.55;
      if (a < u0 || b > u1) return;
      fq('z', c, nx, nz, a - 0.08, b + 0.08, y0 - 0.08, y1 + 0.08, col('#1d1a22', 1, lit));
      if (lv === 1) {
        const p = fq('z', c, nx, nz, a, b, y0, y1, col('#2a2632', 1, lit));
        if (p) { const m = P((a + b) / 2, (y0 + y1) / 2, c); for (let i = 0; i < 6; i++) { const ang = i * 1.05; line(m[0], m[1], m[0] + Math.cos(ang) * k * 1.1, m[1] + Math.sin(ang) * k * 0.6, col('#9aa0a6', 1, lit)); } }
      } else if (lv === 2) fq('z', c, nx, nz, a, b, y0, y1, col('#2a2632', 1, lit));
      else {
        // 屏幕里在播比赛：蓝色球场、白线、两个小人、来回的球
        const glowC = night ? 1 : 0;
        fq('z', c, nx, nz, a, b, y0, y1, night ? em('#3a6a9a') : col('#5aa0d8', 1, lit));
        fq('z', c, nx, nz, a + 0.2, b - 0.2, y0 + 0.15, y1 - 0.45, night ? em('#3b67c8') : col('#4b67d1', 1, lit));
        const wl = night ? em('#ffffff') : col('#ffffff', 1, lit);
        const L = P(a + 0.2, y0 + 0.15, c + 0.04), Rr = P(b - 0.2, y0 + 0.15, c + 0.04), M = P((a + b) / 2, y0 + 0.15, c + 0.04), Mt = P((a + b) / 2, y1 - 0.45, c + 0.04);
        line(M[0], M[1], Mt[0], Mt[1], wl);
        const t = (Math.sin(T * 2.4) + 1) / 2, bx = a + 0.4 + t * (b - a - 0.8);
        const bp = P(bx, y0 + 0.5 + Math.abs(Math.sin(T * 4.8)) * 0.25, c + 0.05); rect(bp[0], bp[1], 2, 2, night ? em('#d8f23a') : col('#d8f23a', 1, lit));
        for (const [u, cc] of [[a + 0.35, '#e2463c'], [b - 0.35, '#f0c53c']]) { const p = P(u, y0 + 0.55, c + 0.05); rect(p[0] - 1, p[1] - 3, 3, 4, night ? em(cc) : col(cc, 1, lit)); }
        // 比分条
        fq('z', c, nx, nz, a + 0.1, a + 1.0, y1 - 0.32, y1 - 0.1, night ? em('#1d2f52') : col('#1d2f52', 1, lit));
        if (night) { const p = P((a + b) / 2, (y0 + y1) / 2, c); glow(p[0], p[1], k * 2.2, [40, 70, 120], 0.8); }
      }
      if (lv === 3 && u0 < -4 && u1 > 0) {
        fq('z', c, nx, nz, -4.3, -0.3, 2.72, 3.2, col('#e3cf9e', 1, lit));
        faceText('z', c, nx, nz, -4.0, 2.78, 0.1, 'PLAYERS', '#1d2f52', lit);
      }
      // 时钟
      if (lv >= 2 && u1 > 1) { const p = P(1.2, 2.5, c + 0.04); ell(p[0], p[1], k * 0.28, k * 0.28, col('#f4ecd8', 1, lit)); line(p[0], p[1], p[0], p[1] - k * 0.2, col('#2a2632', 1, lit)); line(p[0], p[1], p[0] + k * 0.15, p[1], col('#2a2632', 1, lit)); }
    }
    function lockerWall(c, nx, nz, u0, u1, H, lit) {
      if (H < 2.2) return;
      const n = lv === 2 ? 4 : 7;
      for (let i = 0; i < 7; i++) {
        const za = -5.2 + i * 0.5, zb = za + 0.46;
        if (za < u0 || zb > u1) continue;
        if (i >= n) { fq('x', c, nx, nz, za, zb, 0.05, 2.0, col('#b4afa5', 1, lit)); continue; }
        const lc = lv === 1 ? '#8a7a6a' : lv === 2 ? '#8f9aa6' : ['#2f7fd8', '#1d2f52'][i & 1];
        fq('x', c, nx, nz, za, zb, 0.05, 2.0, col(lc, 1, lit));
        for (let v = 1.7; v < 1.9; v += 0.08) fq('x', c + 0.01, nx, nz, za + 0.1, zb - 0.1, v, v + 0.03, col(lc, 0.7, lit));
        if (lv === 3) fq('x', c + 0.01, nx, nz, za + 0.12, zb - 0.12, 1.45, 1.55, col('#e3cf9e', 1, lit));
        if (lv === 1 && (i % 2 === 0)) { const p = P(c + 0.3, 1.0, zb); line(p[0], p[1] - k * 0.8, p[0], p[1] + k * 0.8, col('#5e5a54', 1, lit)); }
      }
    }

    // ---------- 室内家具
    // 沙发（面朝电视）
    add({ x0: -3.9, x1: -0.7, z0: -2.6, z1: -1.8, y0: 0, y1: 0.95, draw() {
      const lit = litAt(-2.3, -2.2);
      const sc = lv === 1 ? '#8a6a52' : lv === 2 ? '#c9d2d8' : '#c45d34';
      box(-3.9, -0.7, -2.6, -1.95, 0, 0.45, sc, { lit });
      box(-3.9, -0.7, -2.15, -1.8, 0.45, 0.95, sc, { lit, top: lv === 2 ? '#e2e8ec' : sc });
      box(-3.9, -3.6, -2.6, -1.8, 0.45, 0.7, sc, { lit }); box(-1.0, -0.7, -2.6, -1.8, 0.45, 0.7, sc, { lit });
      if (lv === 1) { const p = P(-2.6, 0.46, -2.3); ell(p[0], p[1], k * 0.4, k * 0.2, col('#e8dcc4', 1, lit)); }
    } });
    // 茶几
    if (lv >= 2) add({ x0: -2.9, x1: -1.7, z0: -3.6, z1: -3.0, y0: 0, y1: 0.5, draw() { const lit = litAt(-2.3, -3.3); box(-2.9, -1.7, -3.6, -3.0, 0.35, 0.45, '#8a5a3c', { lit }); box(-2.8, -2.7, -3.5, -3.1, 0, 0.35, '#3a3f47', { lit }); box(-1.9, -1.8, -3.5, -3.1, 0, 0.35, '#3a3f47', { lit });
      if (lv === 3) { cyl(-2.6, -3.3, 0.06, 0.45, 0.7, '#2f7fd8', { lit }); cyl(-2.1, -3.25, 0.06, 0.45, 0.7, '#2f7fd8', { lit }); } } });
    // 冰箱
    add({ x0: 2.0, x1: 2.75, z0: -5.25, z1: -4.5, y0: 0, y1: 1.9, draw() {
      const lit = litAt(2.4, -4.8);
      box(2.0, 2.75, -5.25, -4.5, 0, 1.85, lv === 1 ? '#a9a296' : '#e8e4da', { lit,
        face: (nx, nz) => { if (nz === 1 && lv === 3) { fq('z', -4.5, 0, 1, 2.1, 2.65, 0.3, 1.7, night ? em('#bfe6ff', 0.8) : col('#9ec3dc', 1, lit)); for (let r = 0; r < 4; r++) for (let j = 0; j < 3; j++) { const p = P(2.22 + j * 0.16, 0.45 + r * 0.33, -4.48); rect(p[0], p[1] - 2, 1, 2, col(['#e2463c', '#3fb37f', '#f0c53c'][(r + j) % 3], 1, night ? 0.75 : lit)); } } } });
    } });
    // 零食台
    if (lv >= 2) add({ x0: 0.2, x1: 1.8, z0: -5.25, z1: -4.6, y0: 0, y1: 1.2, draw() {
      const lit = litAt(1, -4.9);
      box(0.2, 1.8, -5.25, -4.6, 0, 0.9, '#c89a5a', { lit, top: '#e9e4d0' });
      if (lv === 3) {
        const p = P(0.6, 0.95, -4.9); ell(p[0], p[1], k * 0.3, k * 0.15, col('#f4ecd8', 1, lit)); ell(p[0], p[1] - 2, k * 0.22, k * 0.12, col('#f0c53c', 1, lit)); pix(p[0] - 2, p[1] - 3, col('#e2463c', 1, lit)); pix(p[0] + 2, p[1] - 2, col('#3fb37f', 1, lit));
        for (let i = 0; i < 4; i++) cyl(1.05 + i * 0.18, -4.95, 0.06, 0.9, 1.15, '#2f7fd8', { lit, top: '#ffffff' });
      }
    } });
    // 瑜伽垫和拉伸的人
    if (lv === 3) {
      gRect(0.4, 1.9, -3.4, -2.6, '#17a2b8');
      const s = randLook(R, { shirt: '#ffffff', bot: '#1d2f52' });
      npc(1.15, -3.0, s, { at: (t) => [1.15, -3.0, 'stand', 0, Math.sin(t * 0.9) > 0 ? [1, 0] : [0, 1]], bob: 0 });
      npc(-2.9, -2.25, randLook(R, { shirt: '#e2463c', bot: '#ffffff' }), { pose: 'sit', y: 0.42, face: [0, -1] });
      npc(-1.6, -2.25, randLook(R, { shirt: '#2f7fd8', bot: '#efe9da', hat: '#ffffff' }), { pose: 'sit', y: 0.42, face: [0, -1] });
      npc(-4.6, -3.6, randLook(R, { shirt: '#3fb37f', bot: '#2d3a5a' }), { face: [-1, 0] });
    }
    if (lv === 2) {
      npc(-4.6, -1.4, randLook(R, { hard: true, shirt: '#ff8a3d' }), { face: [-1, 0] });
      add({ x0: -4.9, x1: -4.5, z0: -0.95, z1: -0.65, y0: 0, y1: 0.4, draw() { cyl(-4.7, -0.8, 0.16, 0, 0.35, '#e8e4da', { lit: litAt(-4.7, -0.8) }); } });
      cone(1.0, 0.8); cone(5, -2.8);
    }
    if (lv === 1) { tumble(1.2, -2.6, 0.5); tumble(3.2, 2.2, 0.45); planks(-3.6, 1.6, 'x'); }

    // ---------- 露台：凉棚、躺椅、冰桶、贵宾绳
    if (lv >= 2) {
      const PZ0 = -5.1, PZ1 = -0.9, PX0 = 3.5, PX1 = 7.1;
      for (const [x, z] of [[PX0, PZ0], [PX1, PZ0], [PX0, PZ1], [PX1, PZ1]]) post(x, z, 2.7, lv === 3 ? '#f4ecd8' : '#b8ad98');
      add({ x0: PX0, x1: PX1, z0: PZ0, z1: PZ1, y0: 2.6, y1: 2.8, draw() {
        const lit = litAt((PX0 + PX1) / 2, 1.5), c1 = col(lv === 3 ? '#f4ecd8' : '#b8ad98', 1, lit), w = Math.max(1, Math.round(k * 0.15));
        wline([PX0, 2.7, PZ0], [PX1, 2.7, PZ0], c1, w); wline([PX0, 2.7, PZ1], [PX1, 2.7, PZ1], c1, w);
        wline([PX0, 2.7, PZ0], [PX0, 2.7, PZ1], c1, w); wline([PX1, 2.7, PZ0], [PX1, 2.7, PZ1], c1, w);
        if (lv === 3) for (let z = PZ0 + 0.45; z < PZ1; z += 0.6) wline([PX0, 2.75, z], [PX1, 2.75, z], c1);
      } });
    }
    if (lv === 3) {
      for (const z of [-4.5, -3.0]) add({ x0: 4.0, x1: 6.2, z0: z, z1: z + 0.75, y0: 0, y1: 0.7, draw() {
        const lit = litAt(5.1, z + 0.4); box(4.0, 6.2, z, z + 0.7, 0.2, 0.32, '#f4ecd8', { lit, top: '#2f7a4a' });
        wpoly([[4.0, 0.32, z], [4.6, 0.32, z], [4.6, 0.32, z + 0.7], [4.0, 0.32, z + 0.7]], col('#2f7a4a', 1, lit)); wpoly([[4.0, 0.7, z], [4.0, 0.32, z], [4.0, 0.32, z + 0.7], [4.0, 0.7, z + 0.7]], col('#2f7a4a', 0.85, lit));
      } });
      npc(5.0, -4.15, randLook(R, { shirt: '#f08abf', bot: '#ffffff' }), { pose: 'sit', y: 0.3, face: [1, 0] });
      add({ x0: 6.5, x1: 6.9, z0: -2.0, z1: -1.6, y0: 0, y1: 0.7, draw() { const lit = litAt(6.7, -1.8); cyl(6.7, -1.8, 0.22, 0, 0.55, '#c9ccc8', { lit, top: '#e8f6ff' }); for (let i = 0; i < 3; i++) { const p = P(6.62 + i * 0.07, 0.62, -1.82); rect(p[0], p[1] - 3, 1, 3, col('#3fb37f', 1, lit)); } } });
      // 贵宾绳 + 立牌
      for (const x of [-1.9, 0.7]) add({ x0: x - 0.1, x1: x + 0.1, z0: 0.0, z1: 1.4, y0: 0, y1: 1.0, draw() {
        const lit = litAt(x, 0.7), g = col('#e3cf9e', 1, lit);
        for (const z of [0.1, 1.3]) { const a = P(x, 0, z), b = P(x, 0.9, z); line(a[0], a[1], b[0], b[1], g, Math.max(1, Math.round(k * 0.12))); rect(b[0] - 1, b[1] - 1, 3, 2, g); }
        const a = P(x, 0.85, 0.1), b = P(x, 0.85, 1.3), m = P(x, 0.7, 0.7); line(a[0], a[1], m[0], m[1], col('#c4363a', 1, lit), 2); line(m[0], m[1], b[0], b[1], col('#c4363a', 1, lit), 2);
      } });
      add({ x0: -3.0, x1: -2.5, z0: 1.6, z1: 1.9, y0: 0, y1: 1.3, draw() {
        const lit = litAt(-2.75, 1.75); box(-2.8, -2.7, 1.7, 1.8, 0, 0.8, '#3a3f47', { lit });
        box(-3.05, -2.45, 1.72, 1.78, 0.8, 1.3, '#1d2f52', { lit, face: (nx, nz) => { if (nz === 1) { fq('z', 1.78, 0, 1, -3.0, -2.5, 1.15, 1.22, col('#e3cf9e', 1, lit)); fq('z', 1.78, 0, 1, -2.95, -2.55, 0.95, 1.02, col('#e3cf9e', 1, lit)); } } });
      } });
      npc(1.3, 1.0, randLook(R, { shirt: '#1d2f52', bot: '#1d2f52' }), { face: [-1, 1] });
      bush(-6.0, 2.4, 1.2); bush(4.4, 2.6, 1.2);
      LAMPS.push({ x: -2.2, z: -3, r: 5.5, i: 0.8 }); LIGHTS.push({ x: -2.3, y: 2.9, z: -5.1, r: 2.5, c: [255, 214, 140], i: 0.8 });
      stringLights([[3.5, -0.9], [7.1, -0.9], [7.1, -5.1]], true, 2.7);
    }
    palm(-7.2, -7.0, 7, lv === 1 ? { dead: true } : {});
    palm(6.6, -6.8, 6.5, lv === 1 ? { dead: true } : lv === 2 ? { half: true } : {});
    if (lv === 2) { LAMPS.push({ x: -2, z: -3, r: 4, i: 0.5 }); LIGHTS.push({ x: -2, y: 2.6, z: -5.1, r: 2.4, c: [200, 220, 255], i: 0.8 }); }
  },
});
