/* 球拍专卖店 · Pro shop（剖面画法）
 * 背墙一整面球拍展示墙和 PRO SHOP 招牌，侧墙是球鞋架；屋里有衣架、球罐金字塔、穿网球服的假人、收银台。
 * 门口立着 SALE 牌，买完东西的人拎着购物袋出来。 */
building({
  id: 'pro-shop', no: 16, name: '球拍专卖店', en: 'PRO SHOP', size: '8 × 5 m', top: 4, pad: 15,
  serves: '会所商业收入：有人看店时卖拍子、球鞋和球；会员满意度小幅上升',
  levels: [
    '货架倒了，墙塌了几段，地上散着空纸箱。展示墙上只剩一排挂钩。',
    '墙补好，货架装回去，到货的纸箱堆在地上，店员在拆箱上架。衣架还是空的。',
    '背墙挂满新拍子，球鞋码满侧墙，衣架上挂着网球服，球罐摞成金字塔。收银台有人排队，门口立着 SALE 牌；夜里橱窗亮着。',
  ],
  build(lv) {
    const R = rng(7501 + lv);
    const X0 = -5.6, X1 = 2.6, Z0 = -5.6, Z1 = -0.8;
    const wall = ['#b9a48a', '#e2dccd', '#c4363a'][lv - 1];
    const inner = ['#cdbb9e', '#f1ece0', '#fbf6ea'][lv - 1];

    gRect(X0 - 0.8, X1 + 1.4, Z1, 2.4, lv === 1 ? '#e2c495' : '#ecd9b8', { pat: (x, z) => (lv === 1 && fbm(x * 0.6, z * 0.6, 3) > 0.48 ? '#e6c793' : ((Math.floor((x + 8) / 0.8) + Math.floor((z + 0.8) / 0.8)) & 1) ? '#e2caa2' : null) });
    gRect(-1.6, 0, 2.4, 7.5, lv === 1 ? '#e2c495' : '#d8cdb8');

    room(X0, X1, Z0, Z1, {
      h: 3.3, cut: 0.95, wall, inner, cap: lv === 3 ? '#f4ecd8' : inner, seed: 90 + lv, ruin: lv === 1,
      gaps: { s: [[-1.6, 0]] },
      floor: lv === 1 ? '#c9b08a' : '#e8e0cc',
      floorPat: (x, z, px, py) => (lv === 1 && fbm(x * 0.7, z * 0.7, 8) > 0.45 ? '#e6c793' : ((Math.floor((x - X0) / 0.6) + Math.floor((z - Z0) / 0.6)) & 1) ? (lv === 1 ? '#b9a07a' : '#d8cdb8') : null),
      decor: (side, ax, c, nx, nz, u0, u1, H, lit) => {
        if (side === 'n') racketWall(c, nx, nz, u0, u1, H, lit);
        if (side === 'w') shoeWall(c, nx, nz, u0, u1, H, lit);
      },
    });
    shadowBox(X0, X1, Z0, Z0 + 0.25, 3.3); shadowBox(X0, X0 + 0.25, Z0, Z1, 3.3);

    function racketWall(c, nx, nz, u0, u1, H, lit) {
      if (H < 2.6) return;
      const a = Math.max(u0, -5.2), b = Math.min(u1, 2.2);
      if (lv === 3 && u0 < -4.5 && u1 > 1) {
        fq('z', c, nx, nz, -4.0, 0.2, 2.65, 3.2, col('#1d2f52', 1, lit));
        faceText('z', c, nx, nz, -3.8, 2.72, 0.1, 'PRO SHOP', '#f4ecd8', lit);
      }
      const cols = ['#e2463c', '#2f7fd8', '#f0c53c', '#3fb37f', '#8a5cd0', '#ff8a3d', '#17a2b8', '#ffffff', '#1d2f52'];
      const rows = lv === 3 ? 3 : lv === 2 ? 1 : 0;
      for (let r = 0; r < 3; r++) for (let j = 0; j < 9; j++) {
        const x = -5.0 + j * 0.8, y = 2.25 - r * 0.65;
        if (x < a || x > b) continue;
        if (r < rows && !(lv === 2 && j > 4)) { const p = P(x, y, c + 0.05); racketPx(p[0], p[1], cols[(j + r * 4) % cols.length], lit, k * 0.24); }
        else { const p = P(x, y + 0.25, c + 0.04); pix(p[0], p[1], col('#8a8f96', 1, lit)); }
      }
    }
    function shoeWall(c, nx, nz, u0, u1, H, lit) {
      if (H < 2.4) return;
      const shelves = lv === 1 ? 1 : 4;
      for (let s = 0; s < shelves; s++) {
        const y = 0.5 + s * 0.5, za = Math.max(u0, -5.3), zb = Math.min(u1, -1.2);
        if (zb <= za) continue;
        fq('x', c, nx, nz, za, zb, y, y + 0.05, col('#8a6a48', 1, lit));
        if (lv === 1) continue;
        const n = lv === 3 ? 7 : 3;
        for (let i = 0; i < n; i++) { const z = -5.0 + i * 0.55; if (z < za || z > zb - 0.3) continue; const cc = ['#ffffff', '#e2463c', '#2f7fd8', '#f0c53c', '#3fb37f', '#ff8a3d', '#1d2f52'][(i + s * 2) % 7]; fq('x', c + 0.02, nx, nz, z, z + 0.2, y + 0.05, y + 0.18, col(cc, 1, lit)); fq('x', c + 0.02, nx, nz, z + 0.22, z + 0.42, y + 0.05, y + 0.18, col(cc, 0.85, lit)); }
      }
    }

    if (lv >= 2) {
      // 衣架
      add({ x0: -4.7, x1: -2.5, z0: -2.8, z1: -2.4, y0: 0, y1: 1.6, draw() {
        const lit = litAt(-3.6, -2.6), pc = col('#596069', 1, lit);
        wline([-4.6, 0, -2.6], [-4.6, 1.5, -2.6], pc); wline([-2.6, 0, -2.6], [-2.6, 1.5, -2.6], pc); wline([-4.6, 1.5, -2.6], [-2.6, 1.5, -2.6], pc);
        if (lv === 3) for (let i = 0; i < 8; i++) { const x = -4.45 + i * 0.25, p = P(x, 1.45, -2.6), cc = ['#ffffff', '#f08abf', '#2f7fd8', '#ffffff', '#3fb37f', '#f0c53c', '#ffffff', '#e2463c'][i]; rect(p[0] - 1, p[1], Math.max(2, Math.round(k * 0.2)), Math.round(k * 0.75), col(cc, 1, lit)); rect(p[0] - 1, p[1], Math.max(2, Math.round(k * 0.2)), 1, col(cc, 0.7, lit)); }
      } });
    }
    // 球罐金字塔
    if (lv === 3) add({ x0: -1.6, x1: -0.4, z0: -4.0, z1: -3.0, y0: 0, y1: 1.4, draw() {
      const lit = litAt(-1, -3.5);
      box(-1.6, -0.4, -4.0, -3.0, 0, 0.4, '#1d2f52', { lit });
      const lay = [[3, 0.4], [2, 0.75], [1, 1.1]];
      for (const [n, y] of lay) for (let i = 0; i < n; i++) { const x = -1.0 + (i - (n - 1) / 2) * 0.32; cyl(x, -3.5, 0.13, y, y + 0.33, '#d8f23a', { lit, top: '#3a3f47' }); }
    } });
    // 假人
    if (lv === 3) {
      add({ x0: -5.1, x1: -4.5, z0: -4.6, z1: -4.0, y0: 0, y1: 0.25, draw() { cyl(-4.8, -4.3, 0.32, 0, 0.22, '#1d2f52', { lit: litAt(-4.8, -4.3) }); } });
      npc(-4.8, -4.3, { skin: '#e8e4da', hair: '#e8e4da', shirt: '#ffffff', bot: '#ffffff', shoe: '#ffffff', skirt: true, hat: '#1d2f52' }, { y: 0.22, face: [1, 1] });
    }
    // 收银台
    if (lv >= 2) add({ x0: 0.4, x1: 2.2, z0: -2.4, z1: -1.7, y0: 0, y1: 1.4, draw() {
      const lit = litAt(1.3, -2);
      box(0.4, 2.2, -2.4, -1.7, 0, 1.0, lv === 3 ? '#1d2f52' : '#c89a5a', { lit, top: '#e9e4d0' });
      if (lv === 3) { box(1.5, 1.95, -2.25, -1.9, 1.0, 1.3, '#2a2632', { lit }); const p = P(1.72, 1.32, -1.9); rect(p[0] - 1, p[1] - 1, 3, 1, night ? em('#7ae0ff') : col('#9ec3dc', 1, lit)); box(0.6, 1.1, -2.2, -1.9, 1.0, 1.1, '#f0c53c', { lit }); }
    } });
    if (lv === 3) {
      npc(1.3, -3.0, randLook(R, { shirt: '#c4363a', bot: '#1d2f52' }), { face: [0, 1] });
      npc(-0.2, -1.8, randLook(R, { shirt: '#3fb37f', bot: '#efe9da' }), { face: [1, 0] });
      npc(-3.4, -4.6, randLook(R, { shirt: '#2f7fd8', bot: '#ffffff' }), { at: (t) => [-3.4 + Math.sin(t * 0.4) * 0.8, -4.6, Math.abs(Math.cos(t * 0.4)) > 0.3 ? 'walk' : 'stand', Math.floor(t * 4) & 1, [0, -1]] });
      // 拎着购物袋出门的人
      const shopper = randLook(R, { shirt: '#f08abf', bot: '#ffffff', skirt: true });
      const path = (t) => { const u = (t / 8) % 1; return [-0.8, -1.2 + u * 8.0, 'walk', Math.floor(t * 4) & 1, [0, 1]]; };
      npc(-0.8, 0, shopper, { at: path, post: null });
      add({ x0: -0.5, x1: -0.2, z0: -1.4, z1: 7, y0: 0, y1: 1.0, draw() { const r = path(T), lit = litAt(r[0], r[1]); box(r[0] + 0.25, r[0] + 0.45, r[1] - 0.15, r[1] + 0.15, 0.35, 0.75, '#c4363a', { lit }); } });
      // SALE 牌
      add({ x0: 1.4, x1: 2.2, z0: 0.6, z1: 1.1, y0: 0, y1: 1.1, draw() {
        const lit = litAt(1.8, 0.8);
        wpoly([[1.45, 0, 1.1], [2.15, 0, 1.1], [2.15, 1.05, 0.82], [1.45, 1.05, 0.82]], col('#f4ecd8', 1, lit));
        wpoly([[1.52, 0.5, 1.0], [2.08, 0.5, 1.0], [2.08, 0.95, 0.86], [1.52, 0.95, 0.86]], col('#c4363a', 1, lit));
        const p = P(1.8, 0.3, 1.06); rect(p[0] - Math.round(k * 0.2), p[1] - 1, Math.round(k * 0.4), 2, col('#c4363a', 1, lit));
      } });
      // 门口的盆栽
      for (const x of [-2.2, 0.6]) add({ x0: x - 0.3, x1: x + 0.3, z0: -0.5, z1: 0.1, y0: 0, y1: 1.2, draw() { const lit = litAt(x, -0.2); cyl(x, -0.2, 0.28, 0, 0.5, '#c45d34', { lit }); const p = P(x, 0.95, -0.2); ell(p[0], p[1], k * 0.42, k * 0.45, 0, (px, py) => hash(px, py, 4) > 0.3 ? col(py < p[1] ? '#6cbc4f' : '#3f8a3f', 1, lit) : 0); } });
      LAMPS.push({ x: -1.5, z: -3.2, r: 6, i: 0.85 }); LIGHTS.push({ x: -1.5, y: 3.0, z: -5.3, r: 3, c: [255, 220, 160], i: 1 });
      LAMPS.push({ x: -0.8, z: 0.8, r: 3.5, i: 0.5 });
      bush(4.2, -3.6, 1.2); bush(-6.6, 1.2, 1.1);
    }
    if (lv === 2) {
      for (const [x, z, s] of [[-2.8, -3.6, 0.35], [-2.2, -3.4, 0.3], [-2.5, -4.2, 0.4], [0.8, -4.4, 0.35]]) add({ x0: x - s, x1: x + s, z0: z - s, z1: z + s, y0: 0, y1: s * 1.4, draw() { box(x - s, x + s, z - s * 0.8, z + s * 0.8, 0, s * 1.3, '#c9a776', { lit: litAt(x, z) }); } });
      npc(-1.8, -4.4, randLook(R, { shirt: '#c4363a', bot: '#2d3a5a' }), { face: [0, -1] });
      npc(3.6, -1.0, randLook(R, { hard: true, shirt: '#ff8a3d' }), { face: [-1, 0] });
      LAMPS.push({ x: -1.5, z: -3.2, r: 4, i: 0.5 }); LIGHTS.push({ x: -1.5, y: 2.6, z: -5.3, r: 2.4, c: [200, 220, 255], i: 0.8 });
    }
    if (lv === 1) {
      add({ x0: -4.4, x1: -2.2, z0: -3.2, z1: -2.4, y0: 0, y1: 0.4, draw() { box(-4.4, -2.2, -3.0, -2.6, 0, 0.3, '#6e5a44', { lit: 0 }); } });
      for (const [x, z] of [[-1.2, -3.8], [0.6, -2.6], [3.4, 1.2]]) add({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.3, z1: z + 0.3, y0: 0, y1: 0.3, draw() { box(x - 0.35, x + 0.35, z - 0.3, z + 0.3, 0, 0.25, '#b09060', { lit: 0 }); } });
      tumble(-2.6, 1.2, 0.5); tumble(4.4, -3.2, 0.45);
    }
    palm(-7.0, -6.6, 6.5, lv === 1 ? { dead: true } : {});
    palm(5.8, -6.4, 7, lv === 1 ? { dead: true } : lv === 2 ? { half: true } : {});
  },
});
