/* 穿线小屋 · Stringing booth（开放摊位）
 * 三面矮墙围起来的摊位，前面是柜台：柜台上一台大穿线机，师傅站在后面干活；背墙挂满球拍，墙头一块大球拍招牌。
 * 门口是小露台、排队的人和长凳。对应岗位 ch_stringing。 */
building({
  id: 'stringing-hut', no: 1, name: '穿线小屋', en: 'STRINGING BOOTH', size: '5.5 × 3.5 m 摊位 + 露台', top: 4.6, pad: 13,
  serves: '会所的穿线岗位（ch_stringing）。有人在岗时会员来送拍子，按件收费',
  levels: [
    '摊位只剩半截墙，柜台塌了，旧穿线机倒在地上。沙里埋着一把断拍子。',
    '墙补好，柜台重新钉起来，挂了一块蓝色防水布。穿线师傅已经开工，门口一箱旧拍子等着修。',
    '绿白条纹的檐口、墙头一块大球拍招牌，柜台上写着 STRINGS。背墙挂满新拍子和彩色线轴，门口有人排队、有人坐着等；夜里串灯亮着。',
  ],
  build(lv) {
    const R = rng(3101 + lv);
    const X0 = -3, X1 = 2.5, Z0 = -3.4, Z1 = -0.4;
    const wall = ['#cbb393', '#eadfc8', '#f4e7d1'][lv - 1];
    const inner = ['#d6c4a6', '#f1e8d6', '#fbf3e2'][lv - 1];

    // ---------- 地面
    gRect(-5.6, 5.2, Z1, 5.2, '#ecd9b8', {
      pat: (x, z, px, py) => {
        if (lv === 1 && fbm(x * 0.6, z * 0.6, 21) > 0.48) return '#e6c793';
        if (lv === 1 && hash(Math.floor(x * 1.25), Math.floor(z * 1.25), 3) > 0.8) return '#c9b08a';
        return ((Math.floor((x + 6) / 0.8) + Math.floor((z + 0.4) / 0.8)) & 1) ? '#e2caa2' : null;
      },
    });
    gRect(-1.6, 0.2, 5.2, 6.5, lv === 1 ? '#e2c495' : '#d8cdb8');
    if (lv >= 2) gRect(-6.2, 6.2, -6.2, -4.4, '#6cbc4f', { pat: (x, z, px, py) => (lv === 2 && fbm(x, z, 4) > 0.55 ? '#c9b46a' : hash(px, py, 2) > 0.85 ? '#4e9a3f' : null) });

    // ---------- 摊位
    room(X0, X1, Z0, Z1, {
      h: 2.8, cut: 1.0, wall, inner, cap: lv === 3 ? '#2f7a4a' : inner, seed: 31 + lv, ruin: lv === 1,
      gaps: { s: [[X0, X1]] },
      floor: lv === 1 ? '#c9b08a' : '#b98a5e',
      floorPat: (x, z, px, py) => (lv === 1 && fbm(x, z, 9) > 0.45 ? '#e6c793' : (Math.floor((x - X0) / 0.45) & 1) ? (lv === 1 ? '#b9a07a' : '#a87a50') : null),
      decor: (side, ax, c, nx, nz, u0, u1, H, lit) => {
        if (side === 'n') backWall(c, nx, nz, u0, u1, H, lit);
        if (side === 'w') sideWall(c, nx, nz, u0, u1, H, lit);
      },
    });
    shadowBox(X0, X1, Z0, Z0 + 0.25, 2.8); shadowBox(X0, X0 + 0.25, Z0, Z1, 2.8);

    function backWall(c, nx, nz, u0, u1, H, lit) {
      if (H < 2) return;
      // 檐口条纹
      const per = Math.max(2, Math.round(k * 0.35));
      if (lv >= 2) fq('z', c, nx, nz, Math.max(u0, X0), Math.min(u1, X1), 2.4, 2.75, 0, (px) => (Math.floor(px / per) & 1) ? col(lv === 3 ? '#f4ecd8' : '#3f6fb0', lv === 3 ? 1 : 0.85, lit) : col(lv === 3 ? '#2f7a4a' : '#3f6fb0', 1, lit));
      // 挂拍墙
      const cols = lv === 3 ? ['#e2463c', '#2f7fd8', '#f0c53c', '#3fb37f', '#8a5cd0', '#ff8a3d', '#17a2b8', '#ffffff', '#e2463c', '#2f7fd8', '#f0c53c', '#3fb37f'] : lv === 2 ? ['#9a9a9a', '#6b4b2f', '#7a7a8a'] : [];
      for (let i = 0; i < cols.length; i++) {
        const row = i < 6 ? 0 : 1, j = i % 6, x = X0 + 0.55 + j * 0.85;
        if (x < u0 || x > u1) continue;
        const p = P(x, row === 0 ? 2.05 : 1.35, c + 0.05); racketPx(p[0], p[1], cols[i], lit, k * 0.3);
      }
      // 线轴架
      if (lv === 3) {
        fq('z', c, nx, nz, X0 + 0.3, X1 - 0.3, 0.72, 0.8, col('#8a6a48', 1, lit));
        for (let i = 0; i < 12; i++) { const x = X0 + 0.45 + i * 0.42; const p = P(x, 0.92, c + 0.05); ell(p[0], p[1], Math.max(1.5, k * 0.14), Math.max(1.5, k * 0.16), col(['#e2463c', '#f0c53c', '#2f7fd8', '#3fb37f', '#ffffff', '#f08abf'][i % 6], 1, lit)); }
      }
    }
    function sideWall(c, nx, nz, u0, u1, H, lit) {
      if (H < 2 || lv === 1) return;
      // 价目板
      fq('x', c, nx, nz, -2.9, -1.3, 1.2, 2.2, col('#c89a5a', 1, lit));
      fq('x', c + 0.01, nx, nz, -2.8, -1.4, 1.3, 2.1, col('#2a2f2a', 1, lit));
      for (let i = 0; i < 4; i++) { const y = 1.95 - i * 0.2; wline([c + 0.03, y, -1.55], [c + 0.03, y, -2.65 + (i & 1) * 0.3], col('#f4ecd8', 1, lit)); }
      if (lv === 3) for (let i = 0; i < 3; i++) { const p = P(c + 0.05, 0.75 + i * 0.0, -0.9 - i * 0.45); ell(p[0], p[1], k * 0.2, k * 0.22, col(['#f0c53c', '#e2463c', '#2f7fd8'][i], 1, lit)); }
    }

    // 墙头的大球拍招牌（只在背墙那面立着时画）
    if (lv === 3) add({ x0: -0.6, x1: 0.2, z0: Z0, z1: Z0 + 0.25, y0: 2.8, y1: 4.6, draw() {
      if (vis(0, -1)) return;
      const lit = litAt(-0.2, Z0), b = P(-0.2, 2.8, Z0 + 0.12), t = P(-0.2, 3.3, Z0 + 0.12);
      line(b[0], b[1], t[0], t[1], col('#3a3f47', 1, lit), Math.max(1, Math.round(k * 0.15)));
      const p = P(-0.2, 3.95, Z0 + 0.12); racketPx(p[0], p[1], '#2f7a4a', lit, k * 0.55);
    } });

    // ---------- 柜台和穿线机
    add({ x0: X0 + 0.25, x1: X1 - 0.25, z0: Z1 - 0.55, z1: Z1, y0: 0, y1: 1.1, draw() {
      const lit = litAt(-0.3, Z1);
      if (lv === 1) {
        box(X0 + 0.3, X0 + 2.2, Z1 - 0.5, Z1, 0, 0.5, '#8b6a45', { lit });
        wpoly([[X0 + 2.3, 0, Z1], [X1 - 0.3, 0, Z1], [X1 - 0.3, 0.35, Z1 - 0.5], [X0 + 2.3, 0.75, Z1 - 0.5]], col('#7a5a3a', 1, lit));
        return;
      }
      box(X0 + 0.25, X1 - 0.25, Z1 - 0.55, Z1, 0, 1.0, lv === 3 ? '#2f7a4a' : '#c89a5a', { lit, top: '#e9e4d0',
        face: (nx, nz) => { if (nz === 1 && lv === 3) { faceText('z', Z1, 0, 1, X0 + 1.2, 0.28, 0.11, 'STRINGS', '#f4ecd8', lit); } } });
      box(X0 + 0.2, X1 - 0.2, Z1 - 0.6, Z1 + 0.05, 1.0, 1.08, '#e9e4d0', { lit });
    } });
    function machine(x, z, lit, down) {
      const mc = '#17a2b8';
      if (down) { box(x - 0.6, x + 0.6, z - 0.2, z + 0.2, 0, 0.3, '#5a6b6e', { lit }); const p = P(x + 0.9, 0.05, z + 0.4); racketPx(p[0], p[1], '#6b5a4a', lit, k * 0.25); return; }
      const y0 = 1.08;
      box(x - 0.35, x + 0.35, z - 0.25, z + 0.25, y0, y0 + 0.12, '#3a3f47', { lit });
      const a = P(x, y0 + 0.12, z), b = P(x, y0 + 0.62, z); line(a[0], a[1], b[0], b[1], col(mc, 1, lit), Math.max(2, Math.round(k * 0.22)));
      // 横夹着的拍子
      const rx = k * 0.95, ry = rx * 0.5;
      ell(b[0], b[1], rx, ry, 0, (px, py) => { const dx = (px + .5 - b[0]) / rx, dy = (py + .5 - b[1]) / ry, d = dx * dx + dy * dy; return d > 0.6 ? col('#e2463c', 1, lit) : ((px + py) & 1) ? col('#f4ecd8', 1, lit) : col('#3a3f47', 0.9, lit); });
      const h = P(x + 0.75, y0 + 0.62, z + 0.25); line(b[0] + rx * 0.8, b[1], h[0], h[1], col('#2a2632', 1, lit), Math.max(1, Math.round(k * 0.15)));
      // 张力头
      const tp = P(x - 0.55, y0 + 0.62, z - 0.1); rect(tp[0] - 2, tp[1] - 2, 4, 3, col(mc, 0.85, lit));
      if (lv === 3) { const sp = P(x + 0.3, y0 + 0.1, z - 0.2); ell(sp[0], sp[1] - 2, k * 0.18, k * 0.18, col('#f0c53c', 1, lit)); }
    }
    if (lv === 1) add({ x0: -1.5, x1: 0.8, z0: -2.4, z1: -1.6, y0: 0, y1: 0.4, draw() { machine(-0.6, -2.0, litAt(-0.6, -2), true); } });
    else {
      add({ x0: -1.1, x1: 0.2, z0: Z1 - 0.6, z1: Z1 - 0.05, y0: 1.08, y1: 1.9, draw() { machine(-0.5, Z1 - 0.32, litAt(-0.5, Z1)); } });
      const stringer = randLook(rng(77), { shirt: lv === 3 ? '#2f7a4a' : '#ffffff', bot: '#2d3a5a', hat: null });
      npc(-0.5, -1.6, stringer, { at: (t) => [-0.5, -1.6, 'stand', 0, [0, 1]], bob: 0 });
      if (lv === 3) npc(1.6, -2.6, randLook(R, { shirt: '#2f7a4a', bot: '#efe9da' }), { at: (t) => [1.6, -2.6, 'stand', 0, Math.sin(t * 0.6) > 0 ? [0, -1] : [-1, 0]] });
    }

    // ---------- 门口
    if (lv === 3) {
      npc(-2.0, 0.6, randLook(R, { shirt: '#f08abf', bot: '#ffffff', skirt: true }), { face: [0, -1] });
      npc(-2.9, 1.5, randLook(R, { shirt: '#2f7fd8', bot: '#efe9da' }), { at: (t) => [-2.9, 1.5, 'stand', 0, Math.sin(t * 0.5) > 0.7 ? [1, 1] : [1, -1]] });
      add({ x0: -5.4, x1: -4.9, z0: -2.0, z1: -0.2, y0: 0, y1: 0.5, draw() { const lit = litAt(-5.1, -1.1); box(-5.4, -4.9, -2.0, -0.2, 0.38, 0.5, '#c89a5a', { lit }); box(-5.35, -4.95, -1.9, -1.75, 0, 0.38, '#3a3f47', { lit }); box(-5.35, -4.95, -0.45, -0.3, 0, 0.38, '#3a3f47', { lit }); } });
      npc(-4.85, -1.2, randLook(R, { shirt: '#f0c53c', bot: '#2d3a5a' }), { pose: 'sit', y: 0.42, face: [1, 0] });
      add({ x0: -4.6, x1: -3.7, z0: -0.1, z1: 0.25, y0: 0, y1: 0.35, draw() { box(-4.6, -3.7, -0.1, 0.25, 0, 0.32, '#e2463c', { lit: litAt(-4.2, 0) }); } });
      umbrella(2.6, 3.4, 1.4, '#2f7a4a', '#f4ecd8', { h: 2.3 });
      add({ x0: 2.2, x1: 3.0, z0: 3.0, z1: 3.8, y0: 0, y1: 0.8, draw() { const lit = litAt(2.6, 3.4); cyl(2.6, 3.4, 0.38, 0.7, 0.78, '#f4ecd8', { lit }); const a = P(2.6, 0, 3.4), b = P(2.6, 0.7, 3.4); line(a[0], a[1], b[0], b[1], col('#3a3f47', 1, lit)); } });
      stringLights([[-5.3, -0.2], [-5.3, 4.8], [4.9, 4.8]], true, 2.8);
      bush(-5.2, -3.0, 1.2); bush(4.2, -2.0, 1.1); bush(5.3, 5.3, 1.2);
    }
    if (lv === 2) {
      add({ x0: -4.4, x1: -3.2, z0: 0.6, z1: 1.4, y0: 0, y1: 0.9, draw() {
        const lit = litAt(-3.8, 1); box(-4.4, -3.2, 0.6, 1.4, 0, 0.55, '#c89a5a', { lit });
        for (let i = 0; i < 3; i++) { const p = P(-4.15 + i * 0.4, 0.75, 1.0); racketPx(p[0], p[1], ['#9a9a9a', '#6b4b2f', '#7a7a8a'][i], lit, k * 0.24); }
      } });
      cone(3.0, 0.6); cone(-4.8, 3.2);
      npc(3.2, -1.6, randLook(R, { hard: true, shirt: '#ff8a3d' }), { face: [-1, 0] });
    }
    if (lv === 1) {
      tumble(2.6, 2.4, 0.55); tumble(-4.2, 3.4, 0.4); tumble(0.4, -2.6, 0.35);
      add({ x0: 1.0, x1: 2.0, z0: 1.4, z1: 2.0, y0: 0, y1: 0.12, draw() { box(1.0, 2.0, 1.4, 2.0, 0, 0.1, '#4a3a32', { lit: 0 }); } });
    }
    palm(-5.8, -5.6, 6.5, lv === 1 ? { dead: true } : {});
    palm(5.6, -5.8, 6, lv === 1 ? { dead: true } : lv === 2 ? { half: true } : {});

    if (lv === 3) { LAMPS.push({ x: -0.3, z: -1.2, r: 4.5, i: 0.8 }); LIGHTS.push({ x: -0.3, y: 2.6, z: -3.0, r: 3, c: [255, 214, 140], i: 1 }); }
    if (lv === 2) { LAMPS.push({ x: -0.5, z: -1.4, r: 3.5, i: 0.5 }); LIGHTS.push({ x: -0.5, y: 2.4, z: -3.0, r: 2.4, c: [200, 220, 255], i: 0.8 }); }
  },
});
