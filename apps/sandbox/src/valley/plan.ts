// valleyplan：小镇和山谷的平面图（Canvas 2D，从 layout.ts 现读，和以后的 3D 白模同一份数）。
// 北在上（−z），东在右（+x）；?s=像素每米（默认 0.6）；?locked=0 不压暗锁着的区域。
// 画完设 window.__planReady = true（截图脚本等它）。
import { CLUBHOUSE, COURTS, GOLF, GROUNDS, LOT_N, LOT_S, POOL } from '../clubsite/world';
import {
  type Bldg,
  BRIDGES,
  BUILDINGS,
  distToLine,
  FLOOR,
  GREENS,
  type GreenKind,
  HOTEL_BLDGS,
  HOTEL_PLOT,
  houses,
  inPoly,
  POIS,
  type PoiKind,
  polyLength,
  REGIONS,
  type Rect,
  ROADS,
  SPEED,
  S as SV,
  TRIPS,
  type V2,
  VIEW,
  WASH,
  washDist,
  windmills,
} from './layout';

declare global {
  interface Window {
    __planReady?: boolean;
  }
}

const params = new URLSearchParams(location.search);
const S = Number(params.get('s') ?? 0.6);
const SHOW_LOCK = params.get('locked') !== '0';
const M = 24;
const W = Math.ceil((VIEW.x1 - VIEW.x0) * S) + M * 2;
const H = Math.ceil((VIEW.z1 - VIEW.z0) * S) + M * 2;
const sx = (x: number) => M + (x - VIEW.x0) * S;
const sy = (z: number) => M + (z - VIEW.z0) * S;

const FONT = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", system-ui, sans-serif';
const INK = '#2b2530';
const MOUNTAIN = '#b07a6a';
const SAND = '#ecd2a2';
const ROAD = '#8d8a92';
const TRAIL = '#8a5a3a';

const canvas = document.getElementById('plan') as HTMLCanvasElement;
const dpr = Math.min(devicePixelRatio || 1, 2);
canvas.width = W * dpr;
canvas.height = H * dpr;
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;
const g = canvas.getContext('2d') as CanvasRenderingContext2D;
g.scale(dpr, dpr);

function path(pts: readonly V2[], close = false) {
  g.beginPath();
  for (const [i, [x, z]] of pts.entries()) {
    if (i) g.lineTo(sx(x), sy(z));
    else g.moveTo(sx(x), sy(z));
  }
  if (close) g.closePath();
}
function rect(r: Rect) {
  g.beginPath();
  g.rect(sx(r.x0), sy(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S);
}
function label(
  text: string,
  x: number,
  z: number,
  o: { size?: number; color?: string; halo?: boolean; bold?: boolean } = {},
) {
  g.font = `${o.bold ? 700 : 500} ${o.size ?? 11}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (o.halo !== false) {
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255,248,232,0.9)';
    g.strokeText(text, sx(x), sy(z));
  }
  g.fillStyle = o.color ?? INK;
  g.fillText(text, sx(x), sy(z));
}
function bldg(o: Bldg, fill: string) {
  g.save();
  g.translate(sx(o.x), sy(o.z));
  g.rotate(-(o.rot ?? 0));
  g.fillStyle = fill;
  g.strokeStyle = 'rgba(43,37,48,0.6)';
  g.lineWidth = 1;
  g.fillRect((-o.w / 2) * S, (-o.d / 2) * S, o.w * S, o.d * S);
  g.strokeRect((-o.w / 2) * S, (-o.d / 2) * S, o.w * S, o.d * S);
  g.restore();
}

// ── 山（整张底色）+ 平地 ──
g.fillStyle = MOUNTAIN;
g.fillRect(0, 0, W, H);
// 山的等高线感：平地往外一圈圈描
for (let i = 6; i >= 1; i--) {
  path(FLOOR, true);
  g.lineWidth = i * 22 * S;
  g.strokeStyle = `rgba(120,70,80,${0.08 * (7 - i)})`;
  g.stroke();
}
path(FLOOR, true);
g.fillStyle = SAND;
g.fill();
// 100 米网格
g.strokeStyle = 'rgba(43,37,48,0.07)';
g.lineWidth = 1;
for (let x = Math.ceil(VIEW.x0 / 100) * 100; x <= VIEW.x1; x += 100) {
  g.beginPath();
  g.moveTo(sx(x), 0);
  g.lineTo(sx(x), H);
  g.stroke();
}
for (let z = Math.ceil(VIEW.z0 / 100) * 100; z <= VIEW.z1; z += 100) {
  g.beginPath();
  g.moveTo(0, sy(z));
  g.lineTo(W, sy(z));
  g.stroke();
}

// ── 干河床 ──
{
  const { pts, half } = WASH;
  for (const [fill, extra] of [
    ['#d4b483', 3],
    ['#e3cfa6', 0],
  ] as const) {
    g.fillStyle = fill;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 6);
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const r = half[i - 1] + (half[i] - half[i - 1]) * t + extra;
        g.beginPath();
        g.arc(sx(ax + (bx - ax) * t), sy(az + (bz - az) * t), r * S, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // 河床里的石头
  g.fillStyle = 'rgba(140,110,90,0.5)';
  for (let i = 0; i < 160; i++) {
    const k = (i * 0.618) % 1;
    const seg = Math.floor(k * (pts.length - 1));
    const t = (k * (pts.length - 1)) % 1;
    const [ax, az] = pts[seg];
    const [bx, bz] = pts[seg + 1];
    const h = half[seg] * (((i * 0.37) % 1) * 1.6 - 0.8);
    const L = Math.hypot(bx - ax, bz - az);
    const x = ax + (bx - ax) * t + (-(bz - az) / L) * h;
    const z = az + (bz - az) * t + ((bx - ax) / L) * h;
    g.beginPath();
    g.arc(sx(x), sy(z), 1.4, 0, Math.PI * 2);
    g.fill();
  }
}

// ── 绿地、跑道 ──
const GREEN_FILL: Record<GreenKind, string> = {
  golf: '#9cc47a',
  park: 'rgba(120,180,90,0.75)',
  field: 'rgba(120,180,90,0.6)',
  runway: '#7a777f',
  grove: 'rgba(200,180,120,0.5)',
};
for (const q of GREENS) {
  path(q.poly, true);
  g.fillStyle = GREEN_FILL[q.kind];
  g.fill();
  if (q.kind === 'grove') {
    const xs = q.poly.map((v) => v[0]);
    const zs = q.poly.map((v) => v[1]);
    g.fillStyle = '#5f8a4a';
    for (let x = Math.min(...xs) + 6; x < Math.max(...xs); x += 12)
      for (let z = Math.min(...zs) + 6; z < Math.max(...zs); z += 12) {
        if (!inPoly(q.poly, x, z)) continue;
        g.beginPath();
        g.arc(sx(x), sy(z), 2.2, 0, Math.PI * 2);
        g.fill();
      }
    label(q.name, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2, {
      size: 10,
      color: '#3a5a2a',
    });
  }
  if (q.kind === 'golf') {
    // 果岭、沙坑
    const [cx, cz] = q.poly.reduce(([a, b], [x, z]) => [a + x / q.poly.length, b + z / q.poly.length], [0, 0]);
    for (let k = 0; k < 5; k++) {
      const a = k * 2.4;
      g.beginPath();
      g.arc(sx(cx + Math.cos(a) * (40 + k * 12)), sy(cz + Math.sin(a) * (30 + k * 6)), 5, 0, Math.PI * 2);
      g.fillStyle = k % 2 ? '#f3e2b8' : '#b6dc8e';
      g.fill();
    }
  }
}
// 沙漠里的灌木（空地上撒，确定性）
g.fillStyle = 'rgba(110,130,80,0.55)';
for (let i = 0; i < 2600; i++) {
  const x = VIEW.x0 + ((i * 0.7548776662) % 1) * (VIEW.x1 - VIEW.x0);
  const z = VIEW.z0 + ((i * 0.569840291) % 1) * (VIEW.z1 - VIEW.z0);
  if (!inPoly(FLOOR, x, z) || washDist(x, z) < 2) continue;
  if (GREENS.some((q) => inPoly(q.poly, x, z))) continue;
  if (ROADS.some((r) => distToLine(r.pts, x, z) < r.w / 2 + 3)) continue;
  g.beginPath();
  g.arc(sx(x), sy(z), 1.6, 0, Math.PI * 2);
  g.fill();
}

// ── 路 ──
for (const r of ROADS) {
  path(r.pts);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (r.kind === 'trail') {
    g.setLineDash([4, 3]);
    g.lineWidth = Math.max(1.5, r.w * S);
    g.strokeStyle = TRAIL;
    g.stroke();
    g.setLineDash([]);
    continue;
  }
  g.lineWidth = r.w * S + 2;
  g.strokeStyle = 'rgba(60,55,65,0.5)';
  g.stroke();
  path(r.pts);
  g.lineWidth = r.w * S;
  g.strokeStyle = r.kind === 'highway' ? '#76737c' : ROAD;
  g.stroke();
}
// 桥
for (const br of BRIDGES) {
  g.fillStyle = '#5b5560';
  g.fillRect(sx(br.x) - 6, sy(br.z) - 14, 12, 28);
  g.fillStyle = '#a9a5ad';
  g.fillRect(sx(br.x) - 4, sy(br.z) - 14, 8, 28);
}

// ── 俱乐部（world.ts 的） ──
rect(GROUNDS);
g.fillStyle = '#e8b98a';
g.fill();
g.strokeStyle = INK;
g.lineWidth = 1.5;
g.stroke();
rect(GOLF);
g.fillStyle = '#9cc47a';
g.fill();
for (const lot of [LOT_N, LOT_S]) {
  rect(lot);
  g.fillStyle = '#9b97a0';
  g.fill();
}
for (const c of COURTS) {
  g.fillStyle = c.kind === 'clay' ? '#c96a44' : c.kind === 'stadium' ? '#3f7a9a' : '#4f8ab0';
  g.fillRect(sx(c.x - c.hx), sy(c.z - c.hz), c.hx * 2 * S, c.hz * 2 * S);
}
rect(CLUBHOUSE);
g.fillStyle = '#f2e6cc';
g.fill();
g.stroke();
rect(POOL);
g.fillStyle = '#5ab8d6';
g.fill();
// 酒店扩张地
rect(HOTEL_PLOT);
g.setLineDash([5, 4]);
g.strokeStyle = '#c0563f';
g.lineWidth = 1.5;
g.stroke();
g.setLineDash([]);
for (const o of HOTEL_BLDGS) bldg(o, 'rgba(192,86,63,0.18)');
label('未来的酒店（扩张地）', (HOTEL_PLOT.x0 + HOTEL_PLOT.x1) / 2, HOTEL_PLOT.z1 + 10, { size: 10, color: '#a0402c' });
label('网球俱乐部', -2, -64, { size: 14, bold: true, color: '#7a2c1c' });

// ── 楼 ──
const HOUSES = houses();
for (const h of HOUSES) bldg(h, h.kind === 'shop' ? '#f6d898' : '#f4ead6');
const KIND_FILL: Record<Bldg['kind'], string> = {
  shop: '#f0c46a',
  civic: '#c8d4e8',
  school: '#b8dca0',
  house: '#f4ead6',
  hotel: '#f2b8a8',
  gas: '#e8e0a0',
  office: '#d8c8e8',
  museum: '#e8d8c8',
  misc: '#dcd0c0',
};
for (const o of BUILDINGS) bldg(o, KIND_FILL[o.kind]);
// 公园的公共球场、学校的跑道
// 手写的位置（原尺寸）过 layout 的整体缩放 SV；间距、大小不缩
const PARK_COURTS = SV(1040, -610);
const TRACK = SV(795, -700);
for (let i = 0; i < 4; i++) {
  g.fillStyle = '#4f8ab0';
  g.fillRect(sx(PARK_COURTS[0] + i * 26), sy(PARK_COURTS[1]), 22 * S, 36 * S);
}
g.strokeStyle = '#d06a4a';
g.lineWidth = 2;
g.beginPath();
g.ellipse(sx(TRACK[0]), sy(TRACK[1]), 40 * S, 22 * S, 0, 0, Math.PI * 2);
g.stroke();

// 风车（地图外的远景）
for (const [x, z] of windmills()) {
  g.strokeStyle = '#f6f2ea';
  g.lineWidth = 1.5;
  const cx = sx(x);
  const cy = sy(z);
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx, cy + 10);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.3;
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7);
  }
  g.stroke();
}

// ── 区域：锁着的压暗、斜线；边界 ──
for (const [i, r] of REGIONS.entries()) {
  g.save();
  path(FLOOR, true);
  g.clip();
  // 排在前面的区域压在它上面（regionAt 取第一个，例如南棕榈谷的大道走廊压在塔奎兹溪上）：挖掉
  g.beginPath();
  g.rect(0, 0, W, H);
  for (const q of REGIONS.slice(0, i))
    for (const [k, [x, z]] of q.poly.entries()) {
      if (k) g.lineTo(sx(x), sy(z));
      else g.moveTo(sx(x), sy(z));
    }
  g.clip('evenodd');
  path(r.poly, true);
  if (!r.open && SHOW_LOCK) {
    g.fillStyle = 'rgba(30,25,45,0.28)';
    g.fill();
    g.clip();
    g.strokeStyle = 'rgba(30,25,45,0.18)';
    g.lineWidth = 1;
    for (let k = -H; k < W; k += 10) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + H, H);
      g.stroke();
    }
  }
  g.restore();
  g.save();
  path(r.poly, true);
  g.setLineDash([8, 5]);
  g.strokeStyle = r.color;
  g.lineWidth = 2;
  g.stroke();
  g.restore();
}

// ── 地名、路名 ──
for (const r of ROADS) {
  if (r.kind === 'lane') continue;
  const L = polyLength(r.pts);
  let acc = 0;
  for (let i = 1; i < r.pts.length; i++) {
    const [ax, az] = r.pts[i - 1];
    const [bx, bz] = r.pts[i];
    const l = Math.hypot(bx - ax, bz - az);
    if (acc + l >= L * 0.45) {
      const t = (L * 0.45 - acc) / l;
      g.save();
      g.translate(sx(ax + (bx - ax) * t), sy(az + (bz - az) * t));
      let a = Math.atan2(bz - az, bx - ax);
      if (a > Math.PI / 2) a -= Math.PI;
      if (a < -Math.PI / 2) a += Math.PI;
      g.rotate(a);
      g.font = `500 10px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,248,232,0.9)';
      const dy = r.kind === 'trail' ? -7 : 0;
      g.strokeText(r.name, 0, dy);
      g.fillStyle = r.kind === 'trail' ? TRAIL : '#3a3640';
      g.fillText(r.name, 0, dy);
      g.restore();
      break;
    }
    acc += l;
  }
}
// 区域名（放在区域里平地的中间附近）
const REGION_AT: Record<string, V2> = {
  // 俱乐部那块挨着的标签不缩（缩了会压在酒店地块的字上）；南棕榈谷挪到东边空地（原位置缩完压在高尔夫的字上）
  club: [40, 130],
  south: SV(900, 20),
  town: SV(480, -1180),
  school: SV(900, -960),
  wash: SV(760, -470),
  mountain: SV(-40, -1120),
  highway: SV(620, -1380),
  east: SV(1250, -1120),
};
for (const r of REGIONS) {
  const p = REGION_AT[r.id];
  if (!p) continue;
  label(`${r.open ? '' : '🔒 '}${r.name}`, p[0], p[1], { size: 15, bold: true, color: r.color });
}
label('塔奎兹溪（干河床）', ...SV(1240, -300), { size: 11, color: '#7a5a2a' });
label('圣哈辛托山', ...SV(-120, -400), { size: 14, bold: true, color: '#fff3e6', halo: false });
label('圣罗莎山', ...SV(760, 300), { size: 14, bold: true, color: '#fff3e6', halo: false });
label('风车田 →I-10', ...SV(560, -1440), { size: 12, bold: true, color: '#fff3e6', halo: false });
label('机场', ...SV(1420, -760), { size: 11, bold: true });
for (const q of GREENS)
  if (q.kind === 'golf') label(q.name, q.poly[0][0] + 84, q.poly[0][1] + 42, { size: 10, color: '#3a6a2a' });

// ── 事（POI） ──
const POI_STYLE: Record<PoiKind, { fill: string; glyph: string }> = {
  errand: { fill: '#2f6fd0', glyph: '办' },
  person: { fill: '#d0502f', glyph: '人' },
  event: { fill: '#3a9a3a', glyph: '活' },
  find: { fill: '#d0a020', glyph: '?' },
  view: { fill: '#7a4ab0', glyph: '★' },
};
const seen = new Map<string, number>();
for (const p of POIS) {
  const key = `${Math.round(p.x / 8)},${Math.round(p.z / 8)}`;
  const n = seen.get(key) ?? 0;
  seen.set(key, n + 1);
  const cx = sx(p.x) + n * 15;
  const cy = sy(p.z);
  const st = POI_STYLE[p.kind];
  g.beginPath();
  g.arc(cx, cy, 7, 0, Math.PI * 2);
  g.fillStyle = st.fill;
  g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = 1.5;
  g.stroke();
  g.font = `700 9px ${FONT}`;
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(st.glyph, cx, cy + 0.5);
}

// ── 比例尺、指北 ──
{
  const x0 = M + 10;
  const y0 = H - M - 10;
  g.fillStyle = INK;
  g.fillRect(x0, y0, 200 * S, 4);
  g.fillStyle = '#fff';
  g.fillRect(x0 + 100 * S, y0, 100 * S, 4);
  label('0', (x0 - M) / S + VIEW.x0, (y0 - 10 - M) / S + VIEW.z0, { size: 10 });
  label('200 m', (x0 + 200 * S - M) / S + VIEW.x0, (y0 - 10 - M) / S + VIEW.z0, { size: 10 });
  label('N ↑', VIEW.x1 - 30, VIEW.z0 + 30, { size: 14, bold: true, color: '#fff3e6', halo: false });
}

// ── 图例（HTML，画在图下面，手机上好读） ──
const legend = document.getElementById('legend') as HTMLElement;
const mins = (m: number, v: number) => {
  const s = m / v;
  return s < 60 ? `${Math.round(s)} 秒` : `${(s / 60).toFixed(1)} 分`;
};
const trips = TRIPS.map((t) => {
  const L = polyLength(t.pts);
  return `<tr><td>${t.name}</td><td>${Math.round(L)} m</td><td>${mins(L, SPEED.walk)}</td><td>${mins(L, SPEED.cart)}</td><td>${mins(L, SPEED.car)}</td></tr>`;
}).join('');
const area = (() => {
  // 平地面积（粗算，10 米格子）
  let n = 0;
  for (let x = VIEW.x0; x < VIEW.x1; x += 10) for (let z = VIEW.z0; z < VIEW.z1; z += 10) if (inPoly(FLOOR, x, z)) n++;
  return n * 100;
})();
const clubArea = (GROUNDS.x1 - GROUNDS.x0) * (GROUNDS.z1 - GROUNDS.z0);
const kinds: [PoiKind, string][] = [
  ['errand', '办事'],
  ['person', '找人'],
  ['event', '活动'],
  ['find', '发现'],
  ['view', '地标'],
];
legend.innerHTML = `
<h1>小镇和山谷 · 平面图</h1>
<p class="sub">平地 ${(area / 1e6).toFixed(2)} km²，约俱乐部围墙内的 ${Math.round(area / clubArea)} 倍 · 楼 ${BUILDINGS.length} 栋有名字 + ${HOUSES.length} 栋小区房子 · 路 ${ROADS.length} 条</p>
<h2>区域（事件和人解锁；demo 先用调试开关）</h2>
<ul class="regions">${REGIONS.map((r) => `<li><i style="background:${r.color}"></i><b>${r.open ? '' : '🔒 '}${r.name}</b>　${r.who}</li>`).join('')}</ul>
<h2>跑一趟要多久</h2>
<table><tr><th></th><th>沿路</th><th>走路</th><th>球车</th><th>汽车</th></tr>${trips}</table>
<h2>山谷里的事</h2>
<ul class="pois">${kinds
  .map(
    ([k, name]) =>
      `<li><i class="dot" style="background:${POI_STYLE[k].fill}">${POI_STYLE[k].glyph}</i><b>${name}</b>　${POIS.filter(
        (p) => p.kind === k,
      )
        .map((p) => `${p.name}：${p.note}`)
        .join('；')}</li>`,
  )
  .join('')}</ul>`;

window.__planReady = true;
