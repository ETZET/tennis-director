/* 场地维护棚 · Grounds shed（剖面画法）
 * 没有屋顶的车间：朝镜头的墙齐腰，背墙全高。压路机停在黄线车位里，背墙是工具墙，侧墙挂红土拖网，
 * 角落有工作台和红土袋。所有场地的维护岗位（*_upkeep）从这里出发。 */
building({
  id: 'grounds-shed', no: 20, name: '场地维护棚', en: 'GROUNDS SHED', size: '9 × 6 m 车间 + 院子', top: 4, pad: 16,
  serves: '所有场地的维护岗位（*_upkeep）从这里出发；红土和画线材料也存在这里',
  levels: [
    '墙塌了一半，满地沙子和碎砖。压路机锈成一坨，工具墙上只剩几个钩子。',
    '墙砌回来了，地面扫干净。工具挂回墙上，新到的红土袋堆在角落，有人在补墙。',
    '刷成俱乐部绿，背墙挂着 GROUNDS 招牌和整面工具墙，压路机停在黄线车位里。场务推着画线车出门；夜里车间亮着吊灯。',
  ],
  build(lv) {
    const R = rng(2001 + lv);
    const X0 = -6.5, X1 = 2.5, Z0 = -6.5, Z1 = -0.5;
    const wall = ['#a08a70', '#c9c2b2', '#4f8a5e'][lv - 1];
    const inner = ['#b8a58c', '#e2dccd', '#e8e4da'][lv - 1];

    // ---------- 院子
    gRect(X0 - 0.6, X1 + 1.2, Z1, 4.2, '#bdb7ab', {
      pat: (x, z, px, py) => {
        if (lv === 1 && fbm(x * 0.5 + 3, z * 0.5, 5) > 0.5) return '#e6c793';
        const jx = Math.abs(((x - X0) % 2.5 + 2.5) % 2.5), jz = Math.abs(((z - Z1) % 2 + 2) % 2);
        return jx < 0.05 || jz < 0.05 ? '#a49e92' : null;
      },
    });
    gRect(-4.6, -2.2, 4.2, 8, lv === 1 ? '#e2c495' : '#d8cdb8');
    gRect(-7.9, -6.9, 1.2, 7.9, lv === 1 ? '#c99a6e' : '#d36b3d', { pat: (x, z, px, py) => (lv === 1 && fbm(x, z, 2) > 0.5 ? '#e2c495' : hash(px, py, 6) > 0.9 ? '#c45d34' : null) });
    if (lv === 3) gLine(-4.8, 2.6, 4.6, 2.6, '#ffffff', Math.max(1, Math.round(k * 0.15)));

    // ---------- 车间
    room(X0, X1, Z0, Z1, {
      h: 3.4, cut: 0.85, wall, inner, cap: lv === 3 ? '#f4ecd8' : inner, seed: 20 + lv, ruin: lv === 1,
      gaps: { s: [[-5.2, -1.2]] },
      floor: lv === 1 ? '#b8ad98' : '#c9c4ba',
      floorPat: (x, z, px, py) => {
        if (lv === 1 && fbm(x * 0.7, z * 0.7, 8) > 0.48) return '#e6c793';
        if (lv === 3) { const inX = x > -4.5 && x < -1.9, inZ = z > -4.6 && z < -1.5; const ex = Math.min(Math.abs(x + 4.5), Math.abs(x + 1.9)), ez = Math.min(Math.abs(z + 4.6), Math.abs(z + 1.5)); if ((inZ && ex < 0.09) || (inX && ez < 0.09)) return ((Math.floor((x + z) * 3)) & 1) ? '#f0c53c' : '#2a2632'; }
        return hash(px >> 1, py >> 1, 4) > 0.94 ? '#b4afa5' : null;
      },
      decor: (side, ax, c, nx, nz, u0, u1, H, lit) => {
        if (side === 'n') toolWall(c, nx, nz, u0, u1, H, lit);
        if (side === 'w') dragWall(c, nx, nz, u0, u1, H, lit);
      },
    });
    shadowBox(X0, X0 + 0.25, Z0, Z1, 3.4); shadowBox(X0, X1, Z0, Z0 + 0.25, 3.4);

    function toolWall(c, nx, nz, u0, u1, H, lit) {
      // 招牌
      if (lv === 3 && u0 < -5 && H > 3) {
        fq('z', c, nx, nz, -6.1, -1.9, 2.55, 3.3, col('#2f5a3c', 1, lit));
        faceText('z', c, nx, nz, -5.9, 2.62, 0.13, 'GROUNDS', '#f4ecd8', lit);
      }
      if (H < 1.6) return;
      // 洞洞板 + 工具
      const a = Math.max(u0, -6.2), b = Math.min(u1, -1.4);
      if (b <= a) return;
      if (lv >= 2) fq('z', c, nx, nz, a, b, 0.9, Math.min(H - 0.2, 2.4), col('#c89a5a', 1, lit), (px, py) => ((px % 3) === 0 && (py % 3) === 0) ? col('#8a6a48', 1, lit) : col('#c89a5a', 1, lit));
      const tools = lv === 1 ? 2 : lv === 2 ? 5 : 8;
      for (let i = 0; i < tools; i++) {
        const u = -5.9 + i * 0.55; if (u > b - 0.2 || u < a) continue;
        const kind = i % 4, top = 2.3, bot = 0.95;
        const hc = col(lv === 1 ? '#6e5a44' : '#a07a50', 1, lit), mc = col(lv === 1 ? '#6e6a64' : ['#d8d8d8', '#e2463c', '#f0c53c', '#3a3f47'][i % 4], 1, lit);
        const p0 = P(u, top, c + 0.04), p1 = P(u, bot + 0.35, c + 0.04);
        line(p0[0], p0[1], p1[0], p1[1], hc, Math.max(1, Math.round(k * 0.14)));
        if (kind === 0) { const q = P(u, bot + 0.35, c + 0.04); rect(q[0] - Math.round(k * 0.18), q[1], Math.round(k * 0.36), Math.max(2, Math.round(k * 0.35)), mc); } // 铲
        if (kind === 1) { const q = P(u, top, c + 0.04); for (let j = -2; j <= 2; j++) pix(q[0] + j * 2, q[1] - 1, mc); rect(q[0] - 4, q[1], 9, 1, mc); } // 耙
        if (kind === 2) { const q = P(u, bot + 0.35, c + 0.04); rect(q[0] - Math.round(k * 0.25), q[1], Math.round(k * 0.5), Math.max(2, Math.round(k * 0.22)), mc); } // 扫帚
        if (kind === 3) { const q = P(u, top - 0.1, c + 0.04); ell(q[0], q[1], k * 0.2, k * 0.2, mc); } // 卷尺/线轴
      }
    }
    function dragWall(c, nx, nz, u0, u1, H, lit) {
      if (H < 1.6) return;
      for (const [za, zb] of [[-6.0, -4.7], [-4.4, -3.1]]) {
        if (za < u0 || zb > u1) continue;
        if (lv === 1 && za > -5) continue;
        fq('x', c, nx, nz, za, zb, 1.0, 2.4, 0, (px, py) => (px & 1) ? col('#5e452c', 1, lit) : col(lv === 3 ? '#a07a50' : '#8a6a48', 1, lit));
        fq('x', c + 0.02, nx, nz, za - 0.05, zb + 0.05, 2.35, 2.5, col('#3a3f47', 1, lit));
      }
      if (lv >= 2 && u1 > -2.2) { const p = P(c + 0.05, 1.5, -2.5); ell(p[0], p[1], k * 0.45, k * 0.48, col(lv === 3 ? '#3fb37f' : '#5a6b5a', 1, lit)); ell(p[0], p[1], k * 0.15, k * 0.16, col('#2a2632', 1, lit)); }
    }

    // ---------- 车间里的东西
    // 压路机
    const rc = ['#8a5a3c', '#8f9590', '#3f7d4a'][lv - 1];
    add({ x0: -4.2, x1: -1.8, z0: -4.1, z1: -2.0, y0: 0, y1: 1.4, draw() {
      const lit = litAt(-3.2, -3);
      hcyl(-3.4, 0.6, -3.05, 0.6, 1.9, 'z', rc, lit, { cap: lv === 1 ? '#6e4a34' : '#d9dcd6' });
      const hc = col(lv === 1 ? '#5e4a3a' : '#3a3f47', 1, lit), w = Math.max(1, Math.round(k * 0.18));
      wline([-3.4, 0.65, -3.95], [-1.9, 1.25, -3.05], hc, w); wline([-3.4, 0.65, -2.15], [-1.9, 1.25, -3.05], hc, w);
      wline([-1.9, 1.25, -3.6], [-1.9, 1.25, -2.5], hc, w);
    } });
    // 工作台
    add({ x0: -1.0, x1: 2.1, z0: -6.25, z1: -5.5, y0: 0, y1: 1.3, draw() {
      const lit = litAt(0.5, -5.8);
      if (lv === 1) { box(-0.8, 1.2, -6.2, -5.6, 0, 0.35, '#6a4e30', { lit }); return; }
      box(-1.0, -0.85, -6.2, -5.55, 0, 0.85, '#3a3f47', { lit }); box(1.9, 2.05, -6.2, -5.55, 0, 0.85, '#3a3f47', { lit });
      box(-1.0, 2.1, -6.25, -5.5, 0.85, 0.95, '#c89a5a', { lit });
      cyl(-0.4, -5.85, 0.17, 0.95, 1.3, '#f4ecd8', { lit }); cyl(0.05, -5.85, 0.17, 0.95, 1.25, '#ff8a3d', { lit });
      if (lv === 3) cyl(0.5, -5.85, 0.17, 0.95, 1.3, '#f4ecd8', { lit });
      box(1.3, 1.7, -6.0, -5.7, 0.95, 1.15, '#596069', { lit });
    } });
    // 红土袋
    if (lv >= 2) {
      for (let i = 0; i < (lv === 3 ? 8 : 5); i++) {
        const layer = i < 4 ? 0 : 1, j = i % 4, x = 0.9 + (j & 1) * 0.62, z = -2.6 + (j >> 1) * 0.5;
        add({ x0: x, x1: x + 0.58, z0: z, z1: z + 0.44, y0: layer * 0.24, y1: layer * 0.24 + 0.22, draw() { box(x, x + 0.58, z, z + 0.44, layer * 0.24, layer * 0.24 + 0.22, layer ? '#c45d34' : '#d36b3d', { lit: litAt(x, z) }); } });
      }
    } else {
      gDisc(1.4, -2.0, 0.9, '#c45d34', { pat: (x, z, px, py) => (hash(px, py, 3) > 0.5 ? null : 0) });
    }
    if (lv === 1) {
      for (const [x, z, s] of [[-5.4, -1.5, 0.5], [0.2, -3.6, 0.4], [-1.2, -1.2, 0.35]]) add({ x0: x - s, x1: x + s, z0: z - s, z1: z + s, y0: 0, y1: s, draw() { box(x - s, x + s, z - s * 0.7, z + s * 0.7, 0, s * 0.8, '#9a8670', { lit: 0 }); box(x - s * 0.5, x + s * 0.3, z - s * 0.4, z + s * 0.5, s * 0.8, s * 1.2, '#b8a58c', { lit: 0 }); } });
      tumble(-0.5, -4.5, 0.5); tumble(3.6, 2.4, 0.55); tumble(-6, 3, 0.4);
    }
    if (lv === 2) {
      cone(-0.5, 1.4); cone(3.4, 1.1);
      npc(-6.0, -1.6, randLook(R, { hard: true, shirt: '#ff8a3d', bot: '#2d3a5a' }), { face: [-1, 0] });
      npc(1.0, -3.4, randLook(R, { hard: true, shirt: '#f0c53c', bot: '#3b3b45' }), { at: (t) => [1.0, -3.4, 'stand', 0, Math.sin(t * 0.8) > 0 ? [1, 1] : [0, -1]] });
      // 补墙的砖堆
      add({ x0: -7.6, x1: -6.8, z0: -1.6, z1: -0.8, y0: 0, y1: 0.5, draw() { box(-7.6, -6.8, -1.6, -0.8, 0, 0.45, '#b0654a', { lit: litAt(-7.2, -1.2) }); } });
    }
    if (lv === 3) {
      // 推画线车的场务
      const look = randLook(R, { shirt: '#2f7a4a', bot: '#efe9da', hat: '#f0c53c' });
      const path = (t) => { const u = (t / 9) % 2, s = u < 1 ? u : 2 - u, x = -4.4 + s * 8.6, dir = u < 1 ? 1 : -1; return [x, 2.55, 'walk', Math.floor(t * 4) & 1, [dir, 0]]; };
      npc(0, 2.5, look, { at: path });
      add({ x0: -5.4, x1: 5.4, z0: 2.3, z1: 2.8, y0: 0, y1: 0.6, draw() {
        const r = path(T), x = r[0] + r[4][0] * 0.75, z = 2.55, lit = litAt(x, z);
        box(x - 0.3, x + 0.3, z - 0.2, z + 0.2, 0.12, 0.5, '#eeeeee', { lit });
        const a = P(x - 0.22, 0.1, z + 0.22), b = P(x + 0.22, 0.1, z + 0.22); rect(a[0], a[1] - 1, 2, 2, col('#2a2632', 1, lit)); rect(b[0], b[1] - 1, 2, 2, col('#2a2632', 1, lit));
        const h0 = P(x, 0.5, z), h1 = P(x - r[4][0] * 0.55, 1.0, z); line(h0[0], h0[1], h1[0], h1[1], col('#3a3f47', 1, lit));
      } });
      npc(0.4, -4.9, randLook(R, { shirt: '#2f7a4a', bot: '#2d3a5a' }), { face: [0, -1] });
      bush(4.2, -2.2, 1.2); bush(4.4, 3.8, 1.1);
    }
    // 水塔
    const tc = ['#8a6a52', '#c9ccc8', '#e8e4da'][lv - 1];
    shadowBox(-8.4, -6.9, -5.8, -4.3, 2.8);
    add({ x0: -8.4, x1: -6.9, z0: -5.8, z1: -4.3, y0: 0, y1: 2.9, draw() {
      const lit = litAt(-7.6, -5);
      cyl(-7.6, -5.05, 0.75, 0, 2.5, tc, { lit });
      if (lv === 3) { const p = P(-7.6, 1.5, -4.3); rect(p[0] - Math.round(k * 0.55), p[1], Math.round(k * 1.1), Math.max(1, Math.round(k * 0.25)), col('#2f5a3c', 1, lit)); }
    } });
    palm(-7.4, -7.4, 6.5, lv === 1 ? { dead: true } : {});
    palm(6.6, -6.8, 7, lv === 1 ? { dead: true } : lv === 2 ? { half: true } : {});

    if (lv === 3) {
      LAMPS.push({ x: -3, z: -3.5, r: 5.5, i: 0.9 }); LIGHTS.push({ x: -3, y: 2.6, z: -6.1, r: 3, c: [255, 214, 140], i: 1 });
      LAMPS.push({ x: 0.6, z: -4.5, r: 4, i: 0.6 }); LIGHTS.push({ x: 0.6, y: 3.0, z: -5.5, r: 2.2, c: [255, 214, 140], i: 0.9 });
    }
    if (lv === 2) { LAMPS.push({ x: -2, z: -3, r: 4.5, i: 0.5 }); LIGHTS.push({ x: -2, y: 2.4, z: -3, r: 2.5, c: [200, 220, 255], i: 0.8 }); }
  },
});
