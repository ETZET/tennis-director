/* 果汁吧 · Juice bar（开放吧台）
 * U 形吧台，店员站在中间；台面上有榨汁机、杯子和水果，背后柜子的正面挂着菜单板；
 * 柱子上顶着一片大橙子当招牌，前面一排高脚凳，旁边有遮阳伞桌。对应岗位 pz_food。 */
building({
  id: 'juice-bar', no: 17, name: '果汁吧', en: 'JUICE BAR', size: '5 × 3.5 m 吧台 + 座位', top: 4.4, pad: 13,
  serves: '广场的餐饮岗位（pz_food）：有人在岗时有收入，来看球的人和会员满意度上升',
  levels: [
    '吧台塌了，后柜倒在地上，水果箱里的东西早烂了。大橙子招牌歪在一边，伞只剩骨架。',
    '吧台重新钉起来刷了底漆，招牌还是灰的。送货的人搬来一箱箱水果，店员在擦台面。',
    '橙白条纹的吧台写着 JUICE，大橙子招牌立在柱子上。店员在打果汁，高脚凳上坐着客人，伞下有人歇脚；夜里招牌和菜单板都亮着。',
  ],
  build(lv) {
    const R = rng(8601 + lv);
    const CX0 = -3, CX1 = 2, CZ0 = -3.4, CZ1 = -0.4;
    const orange = '#ff8a3d';

    gRect(-6.2, 6.2, -6.2, 6.2, lv === 1 ? '#e6c793' : '#ecd9b8', { pat: (x, z, px, py) => {
      if (lv === 1) return fbm(x * 0.5, z * 0.5, 13) > 0.5 ? '#dfba86' : null;
      if (x > -5.6 && x < 5 && z > -4.4 && z < 3.8) return ((Math.floor((x + 6) / 0.7) + Math.floor((z + 6) / 0.7)) & 1) ? '#d36b3d' : '#c45d34';
      return null;
    } });

    // ---------- 后柜和菜单板
    add({ x0: CX0, x1: CX1, z0: CZ0, z1: CZ0 + 0.6, y0: 0, y1: 2.4, draw() {
      const lit = litAt(-0.5, CZ0);
      if (lv === 1) { box(CX0 + 0.2, CX1 - 1.5, CZ0, CZ0 + 1.6, 0, 0.6, '#8b6a45', { lit }); return; }
      box(CX0, CX1, CZ0, CZ0 + 0.6, 0, 2.3, lv === 3 ? '#f4ecd8' : '#d8cdb8', { lit, top: lv === 3 ? orange : '#c9c2b2',
        face: (nx, nz) => {
          if (nz !== 1) return;
          const Z = CZ0 + 0.6;
          // 下半截：冰柜门
          fq('z', Z, 0, 1, CX0 + 0.15, CX1 - 0.15, 0.1, 0.95, col('#c9ccc8', 1, lit));
          for (const u of [-1.9, -0.5, 0.9]) fq('z', Z, 0, 1, u - 0.6, u + 0.6, 0.15, 0.9, night && lv === 3 ? em('#bfe6ff', 0.8) : col('#9ec3dc', 1, lit));
          if (lv < 3) return;
          // 菜单板
          fq('z', Z, 0, 1, CX0 + 0.3, CX1 - 0.3, 1.25, 2.15, night ? em('#2a2f2a') : col('#2a2f2a', 1, lit));
          const fr = ['#ff8a3d', '#f0c53c', '#3fb37f', '#e2463c', '#f08abf'];
          for (let i = 0; i < 5; i++) { const y = 2.0 - i * 0.17, p = P(CX0 + 0.55, y, Z + 0.02); rect(p[0] - 1, p[1] - 1, 3, 3, night ? em(fr[i]) : col(fr[i], 1, lit)); const a = P(CX0 + 0.8, y, Z + 0.02), b = P(CX0 + 2.2 + (i & 1) * 0.6, y, Z + 0.02); line(a[0], a[1], b[0], b[1], night ? em('#f4ecd8', 0.8) : col('#f4ecd8', 1, lit)); }
          if (night) { const p = P(-0.5, 1.7, Z); glow(p[0], p[1], k * 2.6, [60, 50, 30], 0.6); }
        } });
      // 柜顶的果篮
      if (lv === 3) for (let i = 0; i < 4; i++) { const x = CX0 + 0.6 + i * 1.2; box(x - 0.3, x + 0.3, CZ0 + 0.1, CZ0 + 0.5, 2.3, 2.5, '#c89a5a', { lit }); const p = P(x, 2.55, CZ0 + 0.3); for (let j = 0; j < 4; j++) ell(p[0] - 3 + j * 2, p[1] - (j & 1), Math.max(1.5, k * 0.12), Math.max(1.5, k * 0.12), col(['#ff8a3d', '#f0c53c', '#3fb37f', '#e2463c'][i], j & 1 ? 0.85 : 1, lit)); }
    } });
    // 大橙子招牌
    add({ x0: -0.7, x1: -0.3, z0: CZ0 - 0.2, z1: CZ0 + 0.2, y0: 2.3, y1: 4.4, draw() {
      const lit = night && lv === 3 ? 0.9 : litAt(-0.5, CZ0), b = P(-0.5, 2.3, CZ0), t = P(-0.5, lv === 1 ? 3.0 : 3.3, CZ0 + (lv === 1 ? 0.6 : 0));
      line(b[0], b[1], t[0], t[1], col('#596069', 1, lit), Math.max(1, Math.round(k * 0.15)));
      const p = P(-0.5, lv === 1 ? 3.4 : 3.8, CZ0 + (lv === 1 ? 0.8 : 0)), r = k * 0.75;
      const rind = lv === 2 ? '#a9a49a' : lv === 1 ? '#a8704a' : orange, flesh = lv === 2 ? '#d8d4ca' : lv === 1 ? '#c4a070' : '#ffc070';
      ell(p[0], p[1], r, r, 0, (px, py) => { const dx = px + .5 - p[0], dy = py + .5 - p[1], d = Math.hypot(dx, dy) / r; if (d > 0.82) return night && lv === 3 ? em(rind) : col(rind, 1, lit); if (d < 0.12) return col('#fff4dc', 1, lit); const a = Math.atan2(dy, dx); return (Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) > 0.42) ? col('#fff4dc', 1, lit) : night && lv === 3 ? em(flesh) : col(flesh, 1, lit); });
      if (night && lv === 3) glow(p[0], p[1], r * 2, [90, 50, 10], 0.9);
    } });

    // ---------- U 形吧台
    const top = '#f4ecd8';
    const stripe = (nx, nz, pts, c) => { const c2 = col(lv === 3 ? '#ffffff' : '#d8cdb8', faceF(nx, nz), litAt(-0.5, CZ1)), per = Math.max(2, Math.round(k * 0.4)); return lv === 3 ? (px) => (Math.floor(px / per) & 1) ? c2 : c : null; };
    if (lv === 1) {
      add({ x0: CX0, x1: CX1, z0: CZ1 - 0.5, z1: CZ1, y0: 0, y1: 0.6, draw() { const lit = litAt(-0.5, CZ1); box(CX0, CX0 + 2, CZ1 - 0.5, CZ1, 0, 0.55, '#8b6a45', { lit }); wpoly([[CX0 + 2.2, 0, CZ1], [CX1, 0, CZ1], [CX1, 0.3, CZ1 - 0.5], [CX0 + 2.2, 0.8, CZ1 - 0.5]], col('#7a5a3a', 1, lit)); } });
    } else {
      const bc = lv === 3 ? orange : '#c9c2b2';
      for (const [x0, x1, z0, z1] of [[CX0, CX0 + 0.5, CZ0 + 0.7, CZ1 - 0.5], [CX1 - 0.5, CX1, CZ0 + 0.7, CZ1 - 0.5]]) add({ x0, x1, z0, z1, y0: 0, y1: 1.1, draw() { const lit = litAt((x0 + x1) / 2, (z0 + z1) / 2); box(x0, x1, z0, z1, 0, 1.0, bc, { lit, top, sideSh: stripe }); } });
      add({ x0: CX0, x1: CX1, z0: CZ1 - 0.5, z1: CZ1, y0: 0, y1: 1.1, draw() {
        const lit = litAt(-0.5, CZ1);
        box(CX0, CX1, CZ1 - 0.5, CZ1, 0, 1.0, bc, { lit, top, sideSh: stripe, face: (nx, nz) => { if (nz === 1 && lv === 3) { fq('z', CZ1, 0, 1, -1.6, 0.6, 0.3, 0.85, col('#1d2f52', 1, lit)); faceText('z', CZ1, 0, 1, -1.45, 0.38, 0.09, 'JUICE', '#f4ecd8', lit); } } });
        box(CX0 - 0.05, CX1 + 0.05, CZ1 - 0.55, CZ1 + 0.08, 1.0, 1.06, top, { lit });
        if (lv === 3) {
          // 榨汁机、杯子、水果
          cyl(-2.3, CZ1 - 0.25, 0.14, 1.06, 1.5, '#e8f6ff', { lit, top: '#3a3f47' }); const bp = P(-2.3, 1.2, CZ1 - 0.12); rect(bp[0] - 1, bp[1] - 3, Math.max(2, Math.round(k * 0.2)), 4, col('#ff8a3d', 1, lit));
          for (let i = 0; i < 4; i++) cyl(-1.6 + i * 0.3, CZ1 - 0.25, 0.08, 1.06, 1.28, ['#ff8a3d', '#3fb37f', '#f08abf', '#f0c53c'][i], { lit, top: '#ffffff' });
          const fp = P(1.2, 1.12, CZ1 - 0.25); for (let j = 0; j < 5; j++) ell(fp[0] - 4 + j * 2, fp[1] - (j & 1) * 2, Math.max(1.5, k * 0.13), Math.max(1.5, k * 0.13), col(['#ff8a3d', '#f0c53c', '#3fb37f', '#ff8a3d', '#e2463c'][j], 1, lit));
        }
      } });
    }
    // 店员
    if (lv >= 2) npc(-0.6, -1.9, randLook(R, { shirt: lv === 3 ? orange : '#ffffff', bot: '#1d2f52', hat: lv === 3 ? '#ffffff' : null }), { at: (t) => [-0.6 + Math.sin(t * 0.7) * 0.9, -1.9, Math.abs(Math.cos(t * 0.7)) > 0.4 ? 'walk' : 'stand', Math.floor(t * 4) & 1, [0, 1]] });

    // ---------- 高脚凳和客人
    if (lv === 3) {
      const stools = [-2.5, -1.5, -0.6];
      for (let i = 0; i < stools.length; i++) {
        const x = 2.45, z = stools[i];
        add({ x0: x - 0.22, x1: x + 0.22, z0: z - 0.22, z1: z + 0.22, y0: 0, y1: 0.8, draw() { const lit = litAt(x, z), a = P(x, 0, z), b = P(x, 0.7, z); line(a[0], a[1], b[0], b[1], col('#596069', 1, lit), Math.max(1, Math.round(k * 0.12))); cyl(x, z, 0.22, 0.7, 0.78, '#1d2f52', { lit }); } });
        if (i === 0 || i === 2) npc(x + 0.05, z, randLook(R, { shirt: ['#2f7fd8', '#f08abf'][i >> 1], bot: '#ffffff' }), { pose: 'sit', y: 0.78, face: [-1, 0] });
      }
      // 遮阳伞桌
      for (const [x, z, c1] of [[-4.8, 2.4, orange], [-4.6, -2.2, '#3fb37f']]) {
        umbrella(x, z, 1.3, c1, '#f4ecd8', { h: 2.3 });
        add({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4, y0: 0, y1: 0.8, draw() { const lit = litAt(x, z); cyl(x, z, 0.4, 0.7, 0.78, '#f4ecd8', { lit }); const a = P(x, 0, z), b = P(x, 0.7, z); line(a[0], a[1], b[0], b[1], col('#3a3f47', 1, lit)); cyl(x + 0.1, z, 0.06, 0.78, 0.98, orange, { lit, top: '#ffffff' }); } });
      }
      npc(-4.0, 2.6, randLook(R, { shirt: '#ffffff', bot: '#2d3a5a', hat: '#f0c53c' }), { pose: 'sit', y: 0.42, face: [-1, 0] });
      npc(-2.6, 0.5, randLook(R, { shirt: '#3fb37f', bot: '#efe9da' }), { at: (t) => [-2.6, 0.5, 'stand', 0, Math.sin(t * 0.5) > 0 ? [0, -1] : [1, -1]] });
      stringLights([[-5.6, -4.2], [-5.6, 3.6], [4.6, 3.6]], true, 2.9);
      bush(4.6, -3.6, 1.2); bush(5.2, 4.6, 1.3);
      LAMPS.push({ x: -0.5, z: -1.6, r: 5, i: 0.8 });
    }
    if (lv === 2) {
      for (const [x, z] of [[-4.2, 0.6], [-3.8, 1.3], [3.0, 0.4]]) add({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.25, z1: z + 0.25, y0: 0, y1: 0.45, draw() { const lit = litAt(x, z); box(x - 0.3, x + 0.3, z - 0.25, z + 0.25, 0, 0.3, '#c89a5a', { lit }); const p = P(x, 0.32, z); for (let j = 0; j < 4; j++) ell(p[0] - 3 + j * 2, p[1], Math.max(1.5, k * 0.12), Math.max(1.5, k * 0.12), col(['#ff8a3d', '#f0c53c'][j & 1], 1, lit)); } });
      npc(-4.6, 1.8, randLook(R, { shirt: '#3f6fb0', bot: '#2d3a5a', hat: '#e2463c' }), { face: [1, -1] });
      cone(3.6, 2.4);
      LAMPS.push({ x: -0.5, z: -1.6, r: 3.5, i: 0.5 }); LIGHTS.push({ x: -0.5, y: 2.6, z: CZ0 + 0.3, r: 2.2, c: [200, 220, 255], i: 0.7 });
    }
    if (lv === 1) {
      add({ x0: -4.8, x1: -4.2, z0: 2.0, z1: 2.6, y0: 0, y1: 2.4, draw() { const lit = litAt(-4.5, 2.3), a = P(-4.5, 0, 2.3), b = P(-4.5, 2.2, 2.3); line(a[0], a[1], b[0], b[1], col('#8a8f96', 1, lit)); for (let i = 0; i < 6; i++) { const ang = i / 6 * 6.28, e = P(-4.5 + Math.cos(ang) * 1.0, 1.8, 2.3 + Math.sin(ang) * 1.0); line(b[0], b[1], e[0], e[1], col('#8a8f96', 1, lit)); } } });
      for (const [x, z] of [[2.8, 0.6], [-3.6, 1.0]]) add({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.25, z1: z + 0.25, y0: 0, y1: 0.35, draw() { box(x - 0.3, x + 0.3, z - 0.25, z + 0.25, 0, 0.3, '#7a5a3a', { lit: 0 }); } });
      tumble(1.6, 2.2, 0.5); tumble(-2.0, 3.6, 0.45);
    }
    palm(-5.8, -5.8, 6.5, lv === 1 ? { dead: true } : {});
    palm(5.6, -5.4, 6, lv === 1 ? { dead: true } : lv === 2 ? { half: true } : {});
  },
});
