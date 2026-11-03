/* 器材仓库和发球机棚 · Equipment store & ball machine bay（剖面画法）
 * 没有屋顶的仓库：左半边是一排排球筐、球网卷和锥桶，背墙是货架；右半边是画着黄线的发球机车位。
 * 右侧是一条练习道，复原后发球机推到这里给人喂球。开局那台旧发球机（pr_ball_machine）就在这里。 */
building({
  id: 'equipment-store', no: 6, name: '器材仓库和发球机棚', en: 'EQUIPMENT & BALL MACHINE', size: '9 × 5 m 仓库 + 练习道', top: 4, pad: 18,
  serves: '练习场的器材（pr_training、pr_academy）；工单 pr_ball_machine 修好的发球机停在这里',
  levels: [
    '墙塌了几段，球筐翻在地上，发球机盖着防水布缩在车位角落。练习道的沥青裂成一块一块。',
    '墙补好，货架装回去，球筐开始装球。发球机的侧板拆开，有人在修；练习道一半已经铺上新的绿漆。',
    '背墙刷着 EQUIPMENT，货架上码满球罐和球网，球筐排成两排。发球机推到练习道上一颗接一颗喂球，场务推着球车来回；夜里练习道有灯。',
  ],
  build(lv) {
    const R = rng(4201 + lv);
    const X0 = -7.6, X1 = 1.4, Z0 = -6.6, Z1 = -1.6;
    const wall = ['#c7a98a', '#d9cbb6', '#efe6d4'][lv - 1];
    const inner = ['#d6c4a6', '#e8e0d0', '#f6f0e2'][lv - 1];
    const band = lv === 3 ? '#1d2f52' : lv === 2 ? '#8a8f96' : '#7a6656';

    // ---------- 地面
    gRect(X0, X1 + 0.6, Z1, 2.4, '#bdb7ab', {
      pat: (x, z) => {
        if (lv === 1 && fbm(x * 0.5 + 9, z * 0.5, 5) > 0.55) return '#e6c793';
        const jx = Math.abs(((x - X0) % 2.2 + 2.2) % 2.2), jz = Math.abs(((z - Z1) % 2.2 + 2.2) % 2.2);
        return jx < 0.05 || jz < 0.05 ? '#a49e92' : null;
      },
    });
    const LX0 = 2.6, LX1 = 7.6, LZ0 = -7, LZ1 = 7;
    gRect(LX0 - 0.4, LX1 + 0.4, LZ0 - 0.4, LZ1 + 0.4, lv === 1 ? '#6b6560' : '#3b7f8c', {
      pat: (x, z, px, py) => {
        const inn = x > LX0 && x < LX1 && z > LZ0 && z < LZ1;
        if (lv === 1) { if (fbm(x * 0.8, z * 0.8, 31) > 0.58) return '#e6c793'; if (hash(Math.floor(x * 1.4), Math.floor(z * 1.4), 2) > 0.85) return '#4a4540'; return '#6b6560'; }
        if (lv === 2 && z < 0.2) { if (!inn) return '#6b6560'; return hash(px >> 1, py >> 1, 4) > 0.9 ? '#5a5550' : '#7a746e'; }
        return inn ? '#4fa760' : null;
      },
    });
    if (lv >= 2) {
      const lw = Math.max(1, Math.round(k * 0.12)), z0 = lv === 2 ? 0.2 : LZ0;
      gLine(LX0, LZ1, LX1, LZ1, '#ffffff', lw); gLine(LX0, z0, LX0, LZ1, '#ffffff', lw); gLine(LX1, z0, LX1, LZ1, '#ffffff', lw);
      gLine(LX0, 1.2, LX1, 1.2, '#ffffff', lw); gLine((LX0 + LX1) / 2, 1.2, (LX0 + LX1) / 2, LZ1, '#ffffff', lw);
      if (lv === 3) gLine(LX0, LZ0, LX1, LZ0, '#ffffff', lw);
    }
    gRect(-4.2, -2.8, 2.4, 9, lv === 1 ? '#e2c495' : '#d8cdb8');

    // ---------- 仓库
    room(X0, X1, Z0, Z1, {
      h: 3.4, cut: 0.9, wall, inner, cap: lv === 3 ? '#f4ecd8' : inner, seed: 60 + lv, ruin: lv === 1,
      gaps: { s: [[-6.8, -4.6], [-3.4, -0.6]] },
      floor: lv === 1 ? '#a9a296' : '#c4c0b8',
      floorPat: (x, z, px, py) => {
        if (lv === 1 && fbm(x * 0.7, z * 0.7, 8) > 0.5) return '#e6c793';
        if (lv >= 2) { const inX = x > -3.3 && x < -0.7, inZ = z > -5.6 && z < -1.7; const ex = Math.min(Math.abs(x + 3.3), Math.abs(x + 0.7)), ez = Math.abs(z + 5.6); if ((inZ && ex < 0.08) || (inX && ez < 0.08)) return '#f0c53c'; }
        return hash(px >> 1, py >> 1, 4) > 0.94 ? '#b4afa5' : null;
      },
      decor: (side, ax, c, nx, nz, u0, u1, H, lit) => {
        if (side === 'n') backWall(c, nx, nz, u0, u1, H, lit);
        if (side === 'w') sideWall(c, nx, nz, u0, u1, H, lit);
      },
    });
    shadowBox(X0, X1, Z0, Z0 + 0.25, 3.4); shadowBox(X0, X0 + 0.25, Z0, Z1, 3.4);
    function backWall(c, nx, nz, u0, u1, H, lit) {
      if (H < 2.5) return;
      fq('z', c, nx, nz, Math.max(u0, X0), Math.min(u1, X1), 0, 0.3, col(band, 1, lit));
      if (lv === 3 && u0 <= -7 && u1 >= -1) {
        fq('z', c, nx, nz, -7.2, -1.6, 2.5, 3.3, col('#1d2f52', 1, lit));
        faceText('z', c, nx, nz, -7.0, 2.58, 0.14, 'EQUIPMENT', '#f0c53c', lit);
      }
      // 车位那边：墙上的充电插座和工具
      if (lv >= 2 && u1 > -1) { const p = P(-1.2, 1.2, c + 0.04); rect(p[0] - 2, p[1] - 2, 5, 4, col('#3a3f47', 1, lit)); pix(p[0], p[1], col('#3fb37f', 1, lit)); }
    }
    function sideWall(c, nx, nz, u0, u1, H, lit) {
      if (H < 2.5) return;
      fq('x', c, nx, nz, Math.max(u0, Z0), Math.min(u1, Z1), 0, 0.3, col(band, 1, lit));
      // 挂着的捡球筒
      if (lv === 3) for (let i = 0; i < 6; i++) { const z = -5.9 + i * 0.22; wline([c + 0.06, 0.6, z], [c + 0.06, 1.9, z], col('#c9ccc8', 1, lit)); }
    }

    // ---------- 仓库里的东西
    // 背墙货架：两层隔板，上面放球罐和球网卷
    add({ x0: X0 + 0.3, x1: -3.8, z0: Z0 + 0.25, z1: Z0 + 0.95, y0: 0, y1: 2.4, draw() {
      const lit = litAt(-5.6, -6);
      const x0 = X0 + 0.35, x1 = -3.9, z0 = Z0 + 0.3, z1 = Z0 + 0.9;
      if (lv === 1) { box(x0, x0 + 0.1, z0, z1, 0, 2.2, '#6e5a44', { lit }); box(x0, x1, z0, z1, 0, 0.12, '#6e5a44', { lit }); return; }
      for (const x of [x0, x1 - 0.1]) box(x, x + 0.1, z0, z1, 0, 2.3, '#3a3f47', { lit });
      for (const y of [0.15, 1.05, 1.95]) box(x0, x1, z0, z1, y, y + 0.08, '#8a6a48', { lit });
      const items = lv === 3 ? 10 : 4;
      for (let i = 0; i < items; i++) {
        const shelf = i < 5 ? 1.13 : 0.23, j = i % 5, x = x0 + 0.35 + j * 0.62;
        if (x > x1 - 0.3) continue;
        if ((i + lv) % 3 === 0) hcyl(x, shelf + 0.28, (z0 + z1) / 2, 0.26, 0.5, 'z', i & 1 ? '#f4ecd8' : '#3a3f47', lit);
        else { cyl(x - 0.12, (z0 + z1) / 2, 0.1, shelf, shelf + 0.4, '#f0c53c', { lit, top: '#2f7fd8' }); cyl(x + 0.14, (z0 + z1) / 2, 0.1, shelf, shelf + 0.4, '#f0c53c', { lit, top: '#2f7fd8' }); }
      }
      if (lv === 3) for (let j = 0; j < 4; j++) { const x = x0 + 0.4 + j * 0.7; box(x - 0.2, x + 0.2, z0 + 0.05, z1 - 0.05, 2.03, 2.33, ['#e2463c', '#2f7fd8', '#f0c53c', '#3fb37f'][j], { lit }); }
    } });
    // 球筐：两排
    const baskets = lv === 3 ? [[-6.7, -4.4], [-5.8, -4.4], [-4.9, -4.4], [-6.7, -3.3], [-5.8, -3.3], [-4.9, -3.3]] : lv === 2 ? [[-6.7, -4.4], [-5.8, -4.4], [-6.7, -3.3]] : [];
    for (const [x, z] of baskets) add({ x0: x - 0.38, x1: x + 0.38, z0: z - 0.38, z1: z + 0.38, y0: 0, y1: 0.85, draw() { ballBasket(x, z, lv === 3 ? 1 : 0.5, litAt(x, z)); } });
    if (lv === 1) {
      add({ x0: -6.4, x1: -5.4, z0: -4.2, z1: -3.4, y0: 0, y1: 0.6, draw() { const lit = litAt(-6, -3.8); const wc = col('#7a7f86', 1, lit); wline([-6.3, 0.05, -4.1], [-5.5, 0.6, -3.5], wc); wline([-6.3, 0.05, -3.5], [-5.5, 0.6, -4.1], wc); } });
      ground(() => { const RR = rng(4); for (let i = 0; i < 10; i++) { const p = P(-6.5 + RR() * 3, 0, -4.5 + RR() * 2.5); rect(p[0], p[1] - 1, 2, 2, col('#b8b070', 1, 0)); } });
    }
    // 锥桶堆和球网卷
    if (lv >= 2) {
      add({ x0: -7.3, x1: -6.8, z0: -2.6, z1: -2.0, y0: 0, y1: 1.0, draw() { const lit = litAt(-7, -2.3); for (let i = 0; i < (lv === 3 ? 5 : 2); i++) { const p = P(-7.05, 0.15 * i, -2.3); const s = Math.max(1, Math.round(k * 0.3)); rect(p[0] - s, p[1] - 2 * s, s * 2 + 1, 2 * s, col('#ff6a2e', i & 1 ? 0.9 : 1, lit)); } } });
      add({ x0: -4.4, x1: -3.6, z0: -2.7, z1: -1.9, y0: 0, y1: 0.6, draw() { const lit = litAt(-4, -2.3); hcyl(-4, 0.28, -2.3, 0.28, 0.75, 'z', '#f4ecd8', lit); hcyl(-4, 0.28, -2.3, 0.18, 0.78, 'z', '#3a3f47', lit); } });
    }

    // ---------- 发球机
    function machine(x, z, state, lit) {
      if (state === 'tarp') {
        const p = P(x, 0.55, z);
        ell(p[0], p[1], k * 0.85, k * 0.75, 0, (px, py) => hash(px >> 1, py, 5) > 0.85 ? col('#5a7256', 1, lit) : col('#6f8a6a', 1, lit));
        const a = P(x - 0.45, 0.5, z), b = P(x + 0.45, 0.5, z); line(a[0], a[1], b[0], b[1], col('#c9a776', 1, lit));
        return;
      }
      const bc = state === 'open' ? '#5a6b7a' : '#2f7fd8';
      box(x - 0.35, x + 0.35, z - 0.3, z + 0.3, 0.15, 0.6, bc, { lit });
      if (state === 'open') { fq('x', x + 0.35, 1, 0, z - 0.2, z + 0.2, 0.22, 0.52, col('#2a2632', 1, lit)); const p = P(x + 0.37, 0.35, z); pix(p[0], p[1], col('#e2463c', 1, lit)); pix(p[0] + 1, p[1] + 1, col('#f0c53c', 1, lit)); }
      wpoly([[x - 0.42, 1.0, z - 0.38], [x + 0.42, 1.0, z - 0.38], [x + 0.42, 1.0, z + 0.38], [x - 0.42, 1.0, z + 0.38]], col('#3a3f47', 1, lit));
      box(x - 0.3, x + 0.3, z - 0.26, z + 0.26, 0.6, 0.98, '#3a3f47', { lit, noTop: true });
      if (state !== 'open') { const RR = rng(5); for (let i = 0; i < 10; i++) { const p = P(x + (RR() - .5) * 0.6, 1.0, z + (RR() - .5) * 0.6); rect(p[0], p[1] - 1, 2, 2, col('#d8f23a', 1, lit)); } }
      const a = P(x, 0.45, z + 0.3), b = P(x, 0.55, z + 0.6); line(a[0], a[1], b[0], b[1], col('#2a2632', 1, lit), Math.max(1, Math.round(k * 0.18)));
      for (const [dx, dz] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) { const p = P(x + dx, 0.06, z + dz); rect(p[0] - 1, p[1] - 1, 2, 2, col('#1d1a22', 1, lit)); }
    }
    const MX = 5.1, MZ = -5.6;
    if (lv === 1) add({ x0: -1.6, x1: -0.6, z0: -5.8, z1: -5.0, y0: 0, y1: 1.2, draw() { machine(-1.1, -5.4, 'tarp', litAt(-1.1, -5.4)); } });
    if (lv === 2) {
      add({ x0: -2.5, x1: -1.5, z0: -4.2, z1: -3.2, y0: 0, y1: 1.1, draw() { machine(-2.0, -3.7, 'open', litAt(-2, -3.7)); } });
      npc(-1.0, -3.4, randLook(R, { shirt: '#2f7a4a', bot: '#2d3a5a', hard: true }), { face: [-1, 0] });
      add({ x0: -1.3, x1: -0.7, z0: -2.6, z1: -2.2, y0: 0, y1: 0.3, draw() { box(-1.3, -0.7, -2.6, -2.2, 0, 0.28, '#e2463c', { lit: litAt(-1, -2.4) }); } });
    }
    if (lv === 3) {
      add({ x0: MX - 0.5, x1: MX + 0.5, z0: MZ - 0.4, z1: MZ + 0.7, y0: 0, y1: 1.1, draw() { machine(MX, MZ, 'ok', litAt(MX, MZ)); } });
      const PX = 5.3, PZ = 5.2, per = 1.6;
      const look = randLook(R, { shirt: '#f0c53c', bot: '#ffffff', hat: '#ffffff' });
      add({ x0: PX - 0.3, x1: PX + 0.3, z0: PZ - 0.3, z1: PZ + 0.3, y0: 0, y1: 1.9, pad: 0.8, draw() {
        const u = (T % per) / per, lit = litAt(PX, PZ);
        person(PX, PZ, look, { face: [0, -1], bob: u > 0.82 && u < 0.95 ? -1 : 0 });
        const sw = u > 0.78 ? Math.min(1, (u - 0.78) / 0.12) : 0, p = P(PX + 0.55 - sw * 0.9, 1.05 + sw * 0.2, PZ - 0.2);
        racketPx(p[0], p[1], '#e2463c', lit, k * 0.2);
      } });
      over(() => {
        const u = (T % per) / per, lit = night ? 0.75 : 0;
        const A = [MX, 0.9, MZ + 0.7], B = [5.25, 0, 2.2], C = [PX + 0.2, 1.0, PZ - 0.5];
        let x, y, z;
        if (u < 0.55) { const t = u / 0.55; x = A[0] + (B[0] - A[0]) * t; z = A[2] + (B[2] - A[2]) * t; y = A[1] * (1 - t) + 1.76 * Math.sin(t * Math.PI); }
        else if (u < 0.86) { const t = (u - 0.55) / 0.31; x = B[0] + (C[0] - B[0]) * t; z = B[2] + (C[2] - B[2]) * t; y = C[1] * t + 1.1 * Math.sin(t * Math.PI); }
        else { const t = (u - 0.86) / 0.14; x = C[0] - t * 0.6; z = C[2] - t * 4; y = 1.0 + t * 0.8; }
        ballPx(x, y, z, lit);
      });
      ground(() => { const RR = rng(9); for (let i = 0; i < 9; i++) { const p = P(LX0 + 0.3 + RR() * 1.2, 0, 3 + RR() * 3.5); rect(p[0], p[1] - 1, 2, 2, col('#d8f23a', 1, litAt(3, 4))); } });
      add({ x0: 6.8, x1: 7.6, z0: 5.6, z1: 6.4, y0: 0, y1: 0.8, draw() { ballBasket(7.2, 6, 1, litAt(7.2, 6)); } });
      const worker = randLook(R, { shirt: '#2f7a4a', bot: '#efe9da' });
      const path = (t) => { const u = (t / 7) % 2, s = u < 1 ? u : 2 - u, x = -5.6 + s * 7.2, z = 0.4; return [x, z, 'walk', Math.floor(t * 4) & 1, [u < 1 ? 1 : -1, 0]]; };
      npc(0, 0.4, worker, { at: path });
      add({ x0: -5.2, x1: 2.4, z0: 0.7, z1: 1.3, y0: 0, y1: 0.8, draw() { const r = path(T); ballBasket(r[0] + r[4][0] * 0.7, 0.95, 1, litAt(r[0], 0.9), { w: 0.28, h: 0.6, wheels: true }); } });
      lightPole(8.0, -7.3, 7, { on: true, lx: 5.1, lz: 0, r: 11, i: 0.95 });
      LAMPS.push({ x: 5.1, z: 4, r: 8, i: 0.6 });
      LAMPS.push({ x: -3.6, z: -4.2, r: 5.5, i: 0.85 }); LIGHTS.push({ x: -3.6, y: 3.0, z: -6.2, r: 3, c: [255, 214, 140], i: 1 });
      bush(-7.2, 1.6, 1.2); bush(1.8, 2.2, 1);
    }
    if (lv === 2) { cone(4, 0.4); cone(6, 0.4); cone(5, -3); lightPole(8.0, -7.3, 7, { broken: true }); LAMPS.push({ x: -2, z: -3.6, r: 4, i: 0.5 }); LIGHTS.push({ x: -2, y: 2.6, z: -6.2, r: 2.4, c: [200, 220, 255], i: 0.8 }); }
    if (lv === 1) { tumble(4.5, -1, 0.55); tumble(-6, 1.5, 0.45); lightPole(8.0, -7.3, 7, { broken: true }); planks(-2, 1.4, 'x'); }
    palm(-8.2, -7.8, 7.5, lv === 1 ? { dead: true } : {});
    palm(-8.3, 6.6, 6, lv === 1 ? { dead: true } : lv === 2 ? { half: true } : {});
  },
});
