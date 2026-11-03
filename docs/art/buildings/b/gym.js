/* 健身房 · Gym（剖面画法）
 * 背墙是整面镜子和 GYM 招牌，前面一排跑步机；深蹲架、卧推凳、哑铃架。
 * 右侧是户外体能区：人工草、绳梯、跳箱、战绳，教练带着球员跑绳梯。对应岗位 pr_fitness。 */
building({
  id: 'gym', no: 5, name: '健身房', en: 'GYM', size: '8.5 × 5 m 室内 + 户外体能区', top: 4, pad: 17,
  serves: '练习场的体能岗位（pr_fitness）：有人在岗时球员体能和抗疲劳上升',
  levels: [
    '墙塌了几段，跑步机翻倒在地，杠铃锈在沙子里。外面的体能区只剩一片沙地。',
    '墙补好，橡胶地垫铺上了。两台跑步机还裹着保护膜，深蹲架刚装好；外面的人工草铺了一半。',
    '镜子墙前一排跑步机都有人在跑，深蹲架上有人练力量。户外体能区有绳梯和跳箱，教练拿着记分板带球员冲刺；夜里灯火通明。',
  ],
  build(lv) {
    const R = rng(6401 + lv);
    const X0 = -6.4, X1 = 2.2, Z0 = -6.2, Z1 = -1.2;
    const wall = ['#b9a48a', '#cfd4d8', '#2a2f3a'][lv - 1];
    const inner = ['#cdbb9e', '#e6e8ea', '#eef0f2'][lv - 1];

    // ---------- 地面
    gRect(X0, X1, Z1, 1.0, lv === 1 ? '#e2c495' : '#bdb7ab');
    gRect(-2.0, -0.4, 1.0, 8.4, lv === 1 ? '#e2c495' : '#d8cdb8');
    // 户外体能区
    const OX0 = 3.0, OX1 = 8.0, OZ0 = -6.6, OZ1 = 4.6;
    if (lv >= 2) gRect(OX0, OX1, OZ0, OZ1, '#3f8a3f', { pat: (x, z, px, py) => {
      if (lv === 2 && z > -1) return hash(px >> 1, py >> 1, 2) > 0.9 ? '#c9b08a' : '#e2c495';
      if (Math.abs(((z - OZ0) % 2.2 + 2.2) % 2.2) < 0.06) return '#e8f0e0';
      return hash(px, py, 5) > 0.88 ? '#357a35' : null;
    } });
    if (lv === 3) { // 绳梯
      ground(() => { const lit = litAt(5.5, 0), yc = col('#f0c53c', 1, lit); for (let i = 0; i <= 10; i++) { const z = -5.6 + i * 0.6; wline([5.0, 0.02, z], [5.8, 0.02, z], yc); } wline([5.0, 0.02, -5.6], [5.0, 0.02, 0.4], yc); wline([5.8, 0.02, -5.6], [5.8, 0.02, 0.4], yc); });
    }

    // ---------- 室内
    room(X0, X1, Z0, Z1, {
      h: 3.4, cut: 0.9, wall, inner, cap: lv === 3 ? '#f0c53c' : inner, seed: 80 + lv, ruin: lv === 1,
      gaps: { s: [[-2.0, -0.4]] },
      floor: lv === 1 ? '#c9b08a' : '#34343c',
      floorPat: (x, z, px, py) => {
        if (lv === 1) return fbm(x * 0.7, z * 0.7, 8) > 0.45 ? '#e6c793' : null;
        if (x > -0.6 && x < 2.0 && z > -4.6 && z < -1.4) return (Math.floor((x + z) / 0.6) & 1) ? '#5a3a2a' : '#4a3020';
        return (Math.floor((x - X0) / 1.0) + Math.floor((z - Z0) / 1.0)) & 1 ? '#2e2e35' : null;
      },
      decor: (side, ax, c, nx, nz, u0, u1, H, lit) => {
        if (side === 'n') mirrorWall(c, nx, nz, u0, u1, H, lit);
        if (side === 'w') dumbbellWall(c, nx, nz, u0, u1, H, lit);
      },
    });
    shadowBox(X0, X1, Z0, Z0 + 0.25, 3.4); shadowBox(X0, X0 + 0.25, Z0, Z1, 3.4);
    function mirrorWall(c, nx, nz, u0, u1, H, lit) {
      if (H < 2.8) return;
      const a = Math.max(u0, -6.0), b = Math.min(u1, 1.8);
      if (lv >= 2 && b > a) {
        const m1 = col('#b8d4e0', 1, lit), m2 = col('#d8ecf4', 1, lit);
        fq('z', c, nx, nz, a, b, 0.4, 2.5, 0, (px, py) => (((px + py * 2) % 23) < 3 ? m2 : m1));
        fq('z', c, nx, nz, a, b, 0.32, 0.4, col('#3a3f47', 1, lit));
      }
      if (lv === 3 && u0 < -5 && u1 > -1) {
        fq('z', c, nx, nz, -4.6, -2.4, 2.6, 3.3, col('#f0c53c', 1, lit));
        faceText('z', c, nx, nz, -4.32, 2.66, 0.13, 'GYM', '#1d2f52', lit);
      }
    }
    function dumbbellWall(c, nx, nz, u0, u1, H, lit) {
      if (H < 2.6 || lv === 1) return;
      // 励志海报
      fq('x', c, nx, nz, -2.6, -1.6, 1.4, 2.6, col(lv === 3 ? '#e2463c' : '#c9c2b2', 1, lit));
      if (lv === 3) { fq('x', c + 0.01, nx, nz, -2.5, -1.7, 2.2, 2.45, col('#f4ecd8', 1, lit)); const p = P(c + 0.03, 1.8, -2.1); racketPx(p[0], p[1], '#f4ecd8', lit, k * 0.22); }
    }

    // ---------- 器械
    function treadmill(x, z, lit, state) {
      if (state === 'down') { box(x - 0.35, x + 0.35, z - 0.9, z + 0.6, 0, 0.25, '#4a4a50', { lit }); wline([x - 0.3, 0.25, z - 0.9], [x - 0.3, 0.8, z - 1.4], col('#5e5a54', 1, lit)); return; }
      box(x - 0.36, x + 0.36, z - 0.75, z + 0.8, 0, 0.2, '#2a2a30', { lit, top: state === 'wrap' ? '#e8eef2' : '#1d1d22' });
      if (state !== 'wrap') box(x - 0.3, x + 0.3, z - 0.7, z + 0.75, 0.2, 0.22, '#1d1d22', { lit });
      const c1 = col('#596069', 1, lit);
      wline([x - 0.33, 0.2, z - 0.7], [x - 0.33, 1.3, z - 0.75], c1, Math.max(1, Math.round(k * 0.1))); wline([x + 0.33, 0.2, z - 0.7], [x + 0.33, 1.3, z - 0.75], c1, Math.max(1, Math.round(k * 0.1)));
      box(x - 0.36, x + 0.36, z - 0.85, z - 0.65, 1.2, 1.45, state === 'wrap' ? '#e8eef2' : '#3a3f47', { lit });
      if (state === 'on' && night) { const p = P(x, 1.4, z - 0.64); rect(p[0] - 1, p[1] - 1, 3, 2, em('#7ae0ff')); }
    }
    const tms = [-5.2, -4.2, -3.2, -2.2];
    for (let i = 0; i < tms.length; i++) {
      const x = tms[i], z = -4.6;
      if (lv === 1 && i > 1) continue;
      add({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.9, z1: z + 0.85, y0: 0, y1: 1.5, draw() { treadmill(lv === 1 ? x + i * 0.4 : x, lv === 1 ? z + 1.2 : z, litAt(x, z), lv === 1 ? 'down' : lv === 2 && i < 2 ? 'wrap' : 'on'); } });
      if (lv === 3) {
        const look = randLook(rng(900 + i), { shirt: ['#e2463c', '#2f7fd8', '#ffffff', '#f0c53c'][i], bot: '#1d2f52' });
        npc(x, z + 0.1, look, { y: 0.22, at: (t) => [x, z + 0.1, 'walk', Math.floor(t * (5 + i)) & 1, [0, -1]] });
      }
    }
    // 深蹲架 + 杠铃
    if (lv >= 2) add({ x0: 0.0, x1: 1.6, z0: -3.6, z1: -2.4, y0: 0, y1: 2.3, draw() {
      const lit = litAt(0.8, -3), pc = col('#3a3f47', 1, lit), w = Math.max(1, Math.round(k * 0.14));
      for (const [x, z] of [[0.1, -3.5], [1.5, -3.5]]) { wline([x, 0, z], [x, 2.2, z], pc, w); wline([x, 0, z + 1.0], [x, 2.2, z + 1.0], pc, w); wline([x, 2.2, z], [x, 2.2, z + 1.0], pc, w); }
      wline([0.1, 2.2, -3.5], [1.5, 2.2, -3.5], pc, w);
      const by = lv === 3 ? 1.4 + Math.max(0, Math.sin(T * 1.6)) * 0.35 : 1.4;
      hcyl(0.8, by, -3.0, 0.03, 2.0, 'x', '#c9ccc8', lit);
      for (const x of [-0.05, 1.65]) hcyl(x, by, -3.0, 0.28, 0.12, 'x', lv === 3 ? '#e2463c' : '#3a3f47', lit);
    } });
    if (lv === 3) npc(0.8, -2.85, randLook(R, { shirt: '#3fb37f', bot: '#1d2f52' }), { face: [0, 1], at: (t) => [0.8, -2.85, 'stand', 0, [0, 1]], bob: 0 });
    // 卧推凳
    if (lv >= 2) add({ x0: -1.4, x1: 0.0, z0: -2.0, z1: -1.6, y0: 0, y1: 0.6, draw() { const lit = litAt(-0.1, -1.8); box(-1.4, 0.0, -2.0, -1.6, 0.35, 0.5, '#1d2f52', { lit }); box(-1.3, -1.2, -1.95, -1.65, 0, 0.35, '#3a3f47', { lit }); box(-0.2, -0.1, -1.95, -1.65, 0, 0.35, '#3a3f47', { lit }); } });
    // 哑铃架（靠西墙）
    if (lv >= 2) add({ x0: X0 + 0.3, x1: X0 + 0.9, z0: -3.2, z1: -1.6, y0: 0, y1: 1.0, draw() {
      const lit = litAt(-5.8, -2.4);
      box(X0 + 0.3, X0 + 0.9, -3.2, -1.6, 0, 0.12, '#3a3f47', { lit }); box(X0 + 0.3, X0 + 0.9, -3.2, -1.6, 0.55, 0.62, '#3a3f47', { lit });
      const n = lv === 3 ? 6 : 3;
      for (let i = 0; i < n; i++) { const z = -3.0 + i * 0.25; hcyl(X0 + 0.6, 0.72, z, 0.07 + i * 0.008, 0.4, 'x', '#2a2a30', lit); }
      for (let i = 0; i < n; i++) { const z = -3.0 + i * 0.25; hcyl(X0 + 0.6, 0.22, z, 0.08 + i * 0.008, 0.4, 'x', '#2a2a30', lit); }
    } });
    // 药球
    if (lv === 3) for (let i = 0; i < 3; i++) { const x = -1.0 + i * 0.45, z = -5.6; add({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2, y0: 0, y1: 0.4, draw() { const lit = litAt(x, z), p = P(x, 0.2, z); ell(p[0], p[1], k * 0.2, k * 0.2, col(['#e2463c', '#2f7fd8', '#f0c53c'][i], 1, lit)); } }); }
    if (lv === 1) {
      add({ x0: -1.2, x1: 1.0, z0: -2.6, z1: -2.2, y0: 0, y1: 0.5, draw() { const lit = 0; hcyl(-0.1, 0.25, -2.4, 0.03, 2.0, 'x', '#7a5a42', lit); hcyl(-1.05, 0.25, -2.4, 0.25, 0.1, 'x', '#6e4a34', lit); hcyl(0.85, 0.25, -2.4, 0.25, 0.1, 'x', '#6e4a34', lit); } });
      tumble(-3.8, -2.4, 0.5); tumble(5.4, 1.6, 0.55); tumble(6.4, -4.2, 0.45);
    }

    // ---------- 户外体能区
    if (lv === 3) {
      // 跑绳梯的球员（沿 z 来回）
      const runner = randLook(R, { shirt: '#ff8a3d', bot: '#1d2f52' });
      npc(5.4, 0, runner, { at: (t) => { const u = (t / 3) % 2, s = u < 1 ? u : 2 - u; return [5.4, -5.4 + s * 5.6, 'walk', Math.floor(t * 8) & 1, [0, u < 1 ? 1 : -1]]; } });
      npc(6.7, 1.4, randLook(R, { shirt: '#1d2f52', bot: '#1d2f52', hat: '#f0c53c' }), { face: [-1, -1] });
      // 跳箱
      for (const [x, z, h, c] of [[3.8, -5.6, 0.45, '#e2463c'], [3.8, -4.7, 0.65, '#2f7fd8'], [3.8, -3.6, 0.85, '#f0c53c']]) add({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35, y0: 0, y1: h, draw() { box(x - 0.35, x + 0.35, z - 0.35, z + 0.35, 0, h, c, { lit: litAt(x, z) }); } });
      // 战绳
      add({ x0: 6.8, x1: 7.6, z0: -6.2, z1: -2.6, y0: 0, y1: 0.6, draw() {
        const lit = litAt(7.2, -4.4), rc = col('#2a2632', 1, lit);
        box(7.2, 7.6, -6.3, -6.0, 0, 0.6, '#3a3f47', { lit });
        for (const dx of [-0.15, 0.15]) { let prev = null; for (let i = 0; i <= 14; i++) { const u = i / 14, z = -6.1 + u * 3.3, y = 0.1 + Math.abs(Math.sin(u * 9 - T * 8)) * 0.35 * u; const p = P(7.3 + dx, y, z); if (prev) line(prev[0], prev[1], p[0], p[1], rc, 2); prev = p; } }
      } });
      npc(7.3, -2.4, randLook(R, { shirt: '#ffffff', bot: '#2d3a5a' }), { face: [0, -1], at: (t) => [7.3, -2.4, 'stand', 0, [0, -1]] });
      for (const [x, z] of [[4.4, 2.6], [5.6, 3.6], [6.8, 2.6]]) cone(x, z);
      // 雪橇
      add({ x0: 3.5, x1: 4.5, z0: 2.6, z1: 3.6, y0: 0, y1: 0.6, draw() { const lit = litAt(4, 3.1); box(3.6, 4.4, 2.8, 3.4, 0, 0.12, '#3a3f47', { lit }); hcyl(4.0, 0.3, 3.1, 0.25, 0.1, 'x', '#2a2a30', lit); wline([4.0, 0.12, 2.8], [4.0, 0.55, 2.8], col('#596069', 1, lit)); } });
      lightPole(8.2, -6.9, 7, { on: true, lx: 5.5, lz: -2, r: 10, i: 0.9 });
      LAMPS.push({ x: -2.2, z: -3.6, r: 6, i: 0.85 }); LIGHTS.push({ x: -2.2, y: 3.0, z: -5.9, r: 3, c: [230, 240, 255], i: 1 });
      bush(-7.4, 2.2, 1.2);
    }
    if (lv === 2) {
      for (let i = 0; i < 3; i++) { const z = 0.8 + i * 0.9; add({ x0: 5.6, x1: 6.6, z0: z - 0.35, z1: z + 0.35, y0: 0, y1: 0.4, draw() { hcyl(6.1, 0.3, z, 0.3, 1.0, 'x', '#3f8a3f', litAt(6.1, z)); } }); }
      npc(4.6, 0.6, randLook(R, { hard: true, shirt: '#ff8a3d' }), { face: [1, 0] });
      npc(-3.6, -2.4, randLook(R, { hard: true, shirt: '#f0c53c' }), { face: [0, -1] });
      add({ x0: 0.4, x1: 1.6, z0: -2.1, z1: -1.5, y0: 0, y1: 0.5, draw() { box(0.4, 1.6, -2.1, -1.5, 0, 0.45, '#c89a5a', { lit: litAt(1, -1.8) }); } });
      lightPole(8.2, -6.9, 7, { broken: true });
      LAMPS.push({ x: -2, z: -3.6, r: 4.5, i: 0.5 }); LIGHTS.push({ x: -2, y: 2.6, z: -5.9, r: 2.4, c: [200, 220, 255], i: 0.8 });
    }
    palm(-7.6, -7.4, 7, lv === 1 ? { dead: true } : {});
    palm(-7.8, 5.6, 6, lv === 1 ? { dead: true } : lv === 2 ? { half: true } : {});
  },
});
