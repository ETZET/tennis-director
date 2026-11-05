import '../../demos/kit/kit.css';
import './style.css';
import type { BakedArt } from '@td/iso';
import {
  createDaylight,
  createIsoWorld,
  type PeopleWorld,
  Person,
  type PersonOptions,
  Sprite,
  setPeopleView,
} from '@td/iso';
import { ANIM_ZH, ANIMS, type AnimName, frameAt, frames } from './anims';
import type { Facing, Spec } from './body';
import { BY_ID, CAST } from './cast';
import { NOTES_HTML } from './notes';
import { NOW_LOOKS } from './now';
import { createScene } from './scene';

/**
 * 人物方向 B「小而全 12×24」：阵容、动作、近看、放进游戏（真实地图）、说明。
 * 2D 部分用低分辨率画布按整数倍放大；"放进游戏"用 @td/iso 的 IsoWorld。
 */

const QS = new URLSearchParams(location.search);
const app = document.getElementById('app') as HTMLElement;

app.innerHTML = `
<header class="bh">
  <div>
    <div class="k-label">人物方向 · B</div>
    <h1>小而全 12×24</h1>
    <p>比现在的 8×14 多一倍像素，花在<b>认人</b>上：眼睛、带情绪的眉毛、胡子、眼镜、雀斑、皱纹、体型、招牌配饰。</p>
  </div>
  <button class="k-topbtn bq" id="q" aria-label="说明">?</button>
</header>
<nav class="bnav">
  <a href="#lineup">阵容</a><a href="#motion">动作</a><a href="#close">近看</a><a href="#scene">放进游戏</a><a href="#notes">说明</a>
</nav>
<section id="lineup">
  <h2>1 · 全体阵容 <small>×3</small></h2>
  <div class="grid" id="lineupGrid"></div>
</section>
<section id="motion">
  <h2>2 · 动作 <small>×3，循环</small></h2>
  <div class="seg" id="animSeg"></div>
  <div class="seg" id="faceSeg"></div>
  <div class="grid six" id="motionGrid"></div>
  <p class="hint">点一个人，下面看他四个朝向。</p>
  <div class="four" id="four"></div>
</section>
<section id="close">
  <h2>3 · 近看 <small>×7，约 2.5 cm 高</small></h2>
  <div class="closes" id="closeGrid"></div>
  <h3>同一个缩放下的对照 <small>真渲染器，k=7.8，每像素 4 CSS 像素</small></h3>
  <div class="mini" id="mini"></div>
  <p class="cap">每对左边是 B，右边是现在的 Person：Dale、Nadia、Gus、Mateo。</p>
</section>
<section id="scene">
  <h2>4 · 放进游戏 <small>Palm Oasis · 游戏默认缩放</small></h2>
  <div class="stagewrap"><div id="stage"></div><div id="tags"></div></div>
  <div class="seg" id="zoomSeg"></div>
  <div class="seg" id="viewSeg"></div>
  <p class="cap">左边练习场是 B，右边练习场是现在的人，站位、动作一样：Jess 和 Nadia 对打，Dale 在网前带两个小孩，Mateo 沿边线来回走，场外步道上站着 Gus、Ray、Teodora、Lily、总监。两块场之间前面三对（Dale、Nadia、Ray）是一对一并排。手机上每个缓冲像素 = 1 CSS 像素，和游戏一样；k5.2 是建议的新默认。</p>
</section>
<section id="notes" class="notes">${NOTES_HTML}</section>
<div id="help" class="k-modal" hidden><div class="k-card"><div class="notes">${NOTES_HTML}</div><button class="k-btn primary" id="helpX">知道了</button></div></div>
`;

const $ = (id: string) => document.getElementById(id) as HTMLElement;

/* ---------------- 小画布：烘焙图 → 整数倍放大 ---------------- */
const cvCache = new WeakMap<BakedArt, HTMLCanvasElement>();
function artCanvas(b: BakedArt): HTMLCanvasElement {
  let cv = cvCache.get(b);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = b.w;
    cv.height = b.h;
    const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
    const img = ctx.createImageData(b.w, b.h);
    new Uint32Array(img.data.buffer).set(b.px);
    ctx.putImageData(img, 0, 0);
    cvCache.set(b, cv);
  }
  return cv;
}

/** 一格：固定大小的画布，锚点放在底部中间，脚下一块沙地和影子 */
class Cell {
  readonly cv = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  constructor(
    readonly w: number,
    readonly h: number,
    readonly k: number,
    readonly ground = true,
  ) {
    const dpr = 1;
    this.cv.width = w * dpr;
    this.cv.height = h * dpr;
    this.cv.style.width = `${w * k}px`;
    this.cv.style.height = `${h * k}px`;
    this.ctx = this.cv.getContext('2d') as CanvasRenderingContext2D;
    this.ctx.imageSmoothingEnabled = false;
  }
  draw(b: BakedArt, flip: boolean, kid = false): void {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const ax = Math.floor(w / 2);
    const ay = h - 3;
    if (this.ground) {
      // 影子（和游戏一样：一块压暗的椭圆）
      ctx.fillStyle = 'rgba(40,28,40,.28)';
      const rx = kid ? 3 : 4.5;
      for (let y = -2; y <= 2; y++)
        for (let x = -6; x <= 6; x++) {
          const dx = (x + 0.5) / rx;
          const dy = (y + 0.5) / 1.8;
          if (dx * dx + dy * dy <= 1) ctx.fillRect(ax + x, ay + y, 1, 1);
        }
    }
    const ox = flip ? b.w - b.ox : b.ox;
    ctx.save();
    if (flip) {
      ctx.translate(ax - ox + b.w, ay - b.oy);
      ctx.scale(-1, 1);
      ctx.drawImage(artCanvas(b), 0, 0);
    } else ctx.drawImage(artCanvas(b), ax - ox, ay - b.oy);
    ctx.restore();
  }
}

/* ---------------- 1 阵容 ---------------- */
const lineup: { s: Spec; c: Cell; t0: number }[] = [];
for (const s of CAST) {
  const d = document.createElement('div');
  d.className = 'card';
  const c = new Cell(18, 28, 3);
  d.appendChild(c.cv);
  d.insertAdjacentHTML(
    'beforeend',
    `<div class="nm">${s.name}</div><div class="ln">${s.line}</div><div class="tg">${s.tags.map((t) => `<i>${t}</i>`).join('')}</div>`,
  );
  $('lineupGrid').appendChild(d);
  lineup.push({ s, c, t0: Math.random() * 3 });
}

/* ---------------- 2 动作 ---------------- */
let anim: AnimName = (QS.get('anim') as AnimName) || 'idle';
type FaceSel = 'dr' | 'ur' | 'dl' | 'ul';
let facingSel: FaceSel = 'dr' as FaceSel;
let picked = BY_ID.dale;
const seg = (el: HTMLElement, items: [string, string][], cur: () => string, on: (k: string) => void) => {
  el.innerHTML = items.map(([k, t]) => `<button data-k="${k}">${t}</button>`).join('');
  const sync = () => {
    for (const b of el.querySelectorAll('button')) b.classList.toggle('on', b.dataset.k === cur());
  };
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b?.dataset.k) return;
    on(b.dataset.k);
    sync();
  });
  sync();
};
seg(
  $('animSeg'),
  ANIMS.map((a) => [a, ANIM_ZH[a]]),
  () => anim,
  (k) => {
    anim = k as AnimName;
  },
);
seg(
  $('faceSeg'),
  [
    ['dr', '正面↘'],
    ['ur', '背面↗'],
    ['dl', '↙ 翻转'],
    ['ul', '↖ 翻转'],
  ],
  () => facingSel,
  (k) => {
    facingSel = k as FaceSel;
  },
);
const motion: { s: Spec; c: Cell; el: HTMLElement }[] = [];
for (const s of CAST) {
  const d = document.createElement('button');
  d.className = 'mcell';
  const c = new Cell(22, 34, 2);
  d.appendChild(c.cv);
  d.insertAdjacentHTML('beforeend', `<span>${s.name.replace(/^客人·|^小学员 /, '')}</span>`);
  d.addEventListener('click', () => {
    picked = s;
    for (const m of motion) m.el.classList.toggle('on', m.s === s);
  });
  $('motionGrid').appendChild(d);
  motion.push({ s, c, el: d });
}
motion[0].el.classList.add('on');
const four: Cell[] = [];
for (const t of ['正面 ↘', '背面 ↗', '↙ 翻转', '↖ 翻转']) {
  const d = document.createElement('div');
  const c = new Cell(26, 34, 4);
  d.appendChild(c.cv);
  d.insertAdjacentHTML('beforeend', `<span>${t}</span>`);
  $('four').appendChild(d);
  four.push(c);
}
/** 正面 = 朝右下，背面 = 朝右上；朝左的两个方向是水平翻转 */
const FACINGS: Record<FaceSel, [Facing, boolean]> = {
  dr: ['front', false],
  ur: ['back', false],
  dl: ['front', true],
  ul: ['back', true],
};

/* ---------------- 3 近看 ---------------- */
const CLOSE: [string, string][] = [
  ['dale', '白胡子连到鬓角、帽檐压住眉毛、肚子把手臂撑开'],
  ['teodora', '细金框老花镜、挑一边眉、紫围裙、举拍看线、拎穿线钳'],
  ['nadia', '高马尾、背心露出肩上的粉色肌贴、护腕、墨镜推在头顶'],
  ['gus', '溜肩、眼袋、灰胡茬、工作手套、肩上搭毛巾'],
  ['ray', '宽檐帽、白八字胡、驼背、浅色护膝、拐杖'],
  ['mateo', '雀斑、卷发、大一号的球童衫、腰上的球袋'],
];
const closes: { s: Spec; c: Cell }[] = [];
for (const [id, note] of CLOSE) {
  const s = BY_ID[id];
  const d = document.createElement('div');
  d.className = 'close';
  const c = new Cell(20, 28, 7, false);
  d.appendChild(c.cv);
  d.insertAdjacentHTML('beforeend', `<div class="nm">${s.name}</div><div class="ln">${note}</div>`);
  $('closeGrid').appendChild(d);
  closes.push({ s, c });
}

/* 同一缩放对照：一个小 IsoWorld，pixelSize 6，k 7.8（精灵 1 档） */
const mini = createIsoWorld($('mini'), {
  sky: '#14223a',
  bounds: { x0: -3, x1: 3, z0: -3, z1: 3 },
  slab: { x0: -14, x1: 14, z0: -14, z1: 14 },
  pose: { tx: 0.9, tz: 0.9, zoom: 7.8, rot: 0 },
  pixelSize: 4,
});
mini.camera.enabled = false;
createDaylight(mini).update(11 * 60, 0);
const miniPw: PeopleWorld = { scene: mini.scene, groundY: () => 0, people: [] };
const miniB: { s: Spec; spr: Sprite }[] = [];
['dale', 'nadia', 'gus', 'mateo'].forEach((id, i) => {
  // 每对沿屏幕横向排开：世界里 (+x, -z) 方向是屏幕右
  const u = (i - 1.5) * 1.5;
  const bx = u - 0.45;
  const nx = u + 0.45;
  const spr = new Sprite();
  spr.position.set(bx, 0, -bx);
  mini.scene.add(spr);
  miniB.push({ s: BY_ID[id], spr });
  new Person(
    { name: id, x: nx, z: -nx, lock: Math.PI / 4, base: 'relaxed', ...NOW_LOOKS[id] } as PersonOptions,
    miniPw,
  );
});

/* ---------------- 4 放进游戏 ---------------- */
const pxOpt = QS.get('px') ? Number(QS.get('px')) : undefined;
const scene = createScene($('stage'), pxOpt);
let zoomSel = Number(QS.get('zoom')) || 4;
let viewSel: 'both' | 'b' | 'now' = (QS.get('side') as 'both' | 'b' | 'now') || 'both';
scene.setZoom(zoomSel);
scene.setView(viewSel);
seg(
  $('zoomSeg'),
  [
    ['4', '游戏默认 k4'],
    ['5.2', 'k5.2'],
    ['7.8', 'k7.8'],
    ['15.6', 'k15.6（2 档）'],
  ],
  () => String(zoomSel),
  (k) => {
    zoomSel = Number(k);
    scene.setZoom(zoomSel);
  },
);
seg(
  $('viewSeg'),
  [
    ['both', '两边'],
    ['b', '只看 B'],
    ['now', '只看现在'],
  ],
  () => viewSel,
  (k) => {
    viewSel = k as typeof viewSel;
    scene.setView(viewSel);
  },
);
const tags = $('tags');

/* ---------------- 说明 ---------------- */
$('q').addEventListener('click', () => {
  $('help').hidden = false;
});
$('helpX').addEventListener('click', () => {
  $('help').hidden = true;
});

/* ---------------- 每帧 ---------------- */
let t = 0;
let last = performance.now();
function tick(tm: number): void {
  const dt = Math.min(0.05, (tm - last) / 1000);
  last = tm;
  t += dt;
  for (const l of lineup) {
    const fr = frames(l.s, 'idle', 'front');
    l.c.draw(fr.baked[frameAt(fr, t + l.t0)], false, l.s.build === 'kid');
  }
  const [fc, fl] = FACINGS[facingSel];
  for (const m of motion) {
    const fr = frames(m.s, anim, fc);
    m.c.draw(fr.baked[frameAt(fr, t)], fl, m.s.build === 'kid');
  }
  (['front', 'back', 'front', 'back'] as const).forEach((f, i) => {
    const fr = frames(picked, anim, f);
    four[i].draw(fr.baked[frameAt(fr, t)], i >= 2, picked.build === 'kid');
  });
  for (const c of closes) {
    const fr = frames(c.s, 'idle', 'front');
    c.c.draw(fr.baked[frameAt(fr, t)], false);
  }
  // 小对照世界
  const mp = mini.view.proj;
  setPeopleView(mp.ang, mp.k, mp.spriteScale);
  for (const m of miniB) {
    const fr = frames(m.s, 'idle', 'front');
    m.spr.frame = fr.baked[frameAt(fr, t)];
  }
  for (const p of miniPw.people) p.update(dt, t);
  mini.render(dt, t);
  // 场景标签
  const ls = scene.labels();
  tags.innerHTML = ls
    .map((l) => `<span class="tag" style="left:${Math.round(l.x)}px;top:${Math.round(l.y)}px">${l.t}</span>`)
    .join('');
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* 帧表（?sheet=1&k=4&ids=dale,gus）：所有帧平铺，检查用 */
if (QS.get('sheet')) {
  const k = Number(QS.get('k')) || 4;
  const ids = QS.get('ids')?.split(',') ?? CAST.map((c) => c.id);
  const box = document.createElement('section');
  box.className = 'sheet';
  for (const id of ids) {
    const s = BY_ID[id];
    if (!s) continue;
    const row = document.createElement('div');
    row.className = 'srow';
    for (const f of ['front', 'back'] as const)
      for (const a of ANIMS) {
        if (QS.get('anims') && !QS.get('anims')?.split(',').includes(a)) continue;
        for (const b of frames(s, a, f).baked) {
          const c = new Cell(Math.max(18, b.w + 2), Math.max(28, b.h + 4), k);
          c.draw(b, false, s.build === 'kid');
          row.appendChild(c.cv);
        }
      }
    box.appendChild(row);
  }
  app.prepend(box);
}

// ?view=scene / close / motion：打开时直接滚到那一块（截图用）
const jump = QS.get('view');
if (jump && document.getElementById(jump)) requestAnimationFrame(() => $(jump).scrollIntoView());
