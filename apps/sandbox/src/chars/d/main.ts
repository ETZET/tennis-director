/**
 * 人物方向 D「体型和姿态先行：轮廓认人」（docs/lab/2026-11-04-characters/d.md）。
 * 页面：阵容 → 轮廓测试 → 动作 → 近看 → 放进游戏 → 说明。?view=scene 直接滚到场景；?px=2 场景放大一倍。
 */
import '../../demos/kit/kit.css';
import './style.css';
import type { BakedArt } from '@td/iso';
import { CAST, type CharDef, type ClipName } from './cast';
import { abgr, anim, frameAt, PixCanvas, uniqueFrames } from './frames';
import { CH, CW, type Facing } from './rig';
import { createCharScene } from './scene';

const q = new URLSearchParams(location.search);
const app = document.getElementById('app') as HTMLElement;
const SAND = abgr('#d8bf8c');
const SHADOW = abgr('#b89d6c');
const COURT = abgr('#3f7f62');
const COURT_SH = abgr('#30654d');

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const section = (title: string, lead: string): HTMLElement => {
  const s = el('section', 'd-sec');
  s.append(el('h2', 'k-title', title), el('p', 'd-lead', lead));
  app.append(s);
  return s;
};

/** 每帧要画的小画布 */
const tickers: ((t: number) => void)[] = [];

/** 一个循环播放的小画布 */
function player(
  ch: CharDef,
  clip: () => ClipName,
  facing: Facing,
  scale: number,
  o: { flip?: boolean; bg?: number; sh?: number; sil?: boolean; w?: number; h?: number } = {},
): HTMLCanvasElement {
  const w = o.w ?? CW;
  const h = o.h ?? CH + 1;
  const c = new PixCanvas(w, h, scale, o.bg ?? SAND);
  const off = Math.random() * 3;
  tickers.push((t) => {
    const a = anim(ch, clip(), facing);
    const i = frameAt(a, t + off);
    c.clear();
    if (!o.sil) c.shadow(w / 2, h - 2.5, ch.rig.tpl.hipHalf + 3, 1.6, o.sh ?? SHADOW);
    c.art((o.sil ? a.sil : a.baked)[i] as BakedArt, Math.floor(w / 2), h - 2, o.flip);
    c.flush(`${clip()}|${i}`);
  });
  return c.el;
}

/* ---------------- 头 ---------------- */
const head = el('header', 'd-head');
head.innerHTML = `<div class="k-label">人物方向 · D</div>
<h1>体型和姿态先行：轮廓认人</h1>
<p>不靠脸上的细节认人，靠<b>身形、比例、站姿和走路的样子</b>。每个主要人物一个自己的体型模板（不是一个身子换色），
每个人一套自己的走路和闲着的小动作。精灵 9–15 宽、16–29 高（含描边）。</p>
<div class="d-nav"><a class="k-btn ghost" href="#lineup">阵容</a><a class="k-btn ghost" href="#sil">剪影</a><a class="k-btn ghost" href="#moves">动作</a><a class="k-btn primary" href="#scene">放进游戏</a><a class="k-btn ghost" href="#notes">说明</a></div>`;
app.append(head);

/* ---------------- 1. 阵容 ---------------- */
const lineup = section(
  '全体阵容',
  '每人在演自己的 idle（Dale 揉腰、Gus 叹气、Lily 刷手机、Mateo 抛球、Teodora 看拍线、Nadia 转肩、Ray 揉膝盖……）。2 倍显示。',
);
lineup.id = 'lineup';
const grid = el('div', 'd-grid');
for (const ch of CAST) {
  const card = el('div', 'd-card');
  card.append(player(ch, () => 'idle', 'front', 2));
  card.append(el('div', 'd-name', ch.name), el('div', 'd-line', ch.line));
  grid.append(card);
}
lineup.append(grid);

/* ---------------- 2. 轮廓测试 ---------------- */
const silS = section(
  '轮廓测试',
  '同一帧全部涂黑。认得出就说明体型和姿态在干活：宽矮的 Dale、驼背拄拐的 Ray、大草帽 Rosa、最高最细的 Ben、垂着的 Gus、扎马尾的 Jess、最小的 Teodora、两个高度的小孩。',
);
silS.id = 'sil';
const silRow = (sil: boolean) => {
  const row = el('div', 'd-silrow');
  for (const ch of CAST) {
    const cell = el('div', 'd-silcell');
    // 剪影窄一点：每人只占 16 列
    cell.append(player(ch, () => 'idle', 'front', 2, { sil, w: 20, bg: sil ? abgr('#f3ecdc') : SAND }));
    cell.append(el('div', 'd-sname', ch.name));
    row.append(cell);
  }
  return row;
};
silS.append(silRow(true));
const reveal = el('button', 'k-btn ghost d-reveal', '揭晓：显示颜色');
let shown: HTMLElement | null = null;
reveal.onclick = () => {
  if (shown) {
    shown.remove();
    shown = null;
    reveal.textContent = '揭晓：显示颜色';
    return;
  }
  shown = silRow(false);
  reveal.after(shown);
  reveal.textContent = '收起颜色';
};
silS.append(reveal);
const silWalk = el('p', 'd-lead', '走路时剪影也不一样（下面是走路循环，背面）：');
silS.append(silWalk);
const walkRow = el('div', 'd-silrow');
for (const ch of CAST) {
  const cell = el('div', 'd-silcell');
  cell.append(player(ch, () => 'walk', 'back', 2, { sil: true, w: 20, bg: abgr('#f3ecdc') }));
  walkRow.append(cell);
}
silS.append(walkRow);

/* ---------------- 3. 动作 ---------------- */
const moves = section(
  '动作',
  '选一个人：idle（个性小动作）、走路 4 帧（各人步态）、正手、情绪（高兴或生气）。上排正面，下排背面；朝左是翻转。3 倍显示。',
);
moves.id = 'moves';
const chips = el('div', 'd-chips');
const stage = el('div', 'd-moves');
const CLIPS: [ClipName, string][] = [
  ['idle', 'idle'],
  ['walk', '走路'],
  ['swing', '正手'],
  ['emote', '情绪'],
];
let sel = CAST[0] as CharDef;
const buildMoves = () => {
  stage.innerHTML = '';
  tickers.length = baseTickers;
  for (const f of ['front', 'back'] as const) {
    const row = el('div', 'd-mrow');
    for (const [c, label] of CLIPS) {
      const cell = el('div', 'd-mcell');
      cell.append(
        player(sel, () => c, f, 3, { bg: c === 'swing' ? COURT : SAND, sh: c === 'swing' ? COURT_SH : SHADOW }),
      );
      cell.append(el('div', 'd-sname', `${label}${f === 'back' ? ' · 背' : ''}`));
      row.append(cell);
    }
    stage.append(row);
  }
  const n = (c: ClipName) =>
    new Set(['front', 'back'].flatMap((f) => anim(sel, c, f as Facing).arts.map((a) => a.rows.join('/')))).size;
  stage.append(
    el(
      'p',
      'd-lead',
      `${sel.name}：${sel.sil}。帧数（正 + 背，去重）：idle ${n('idle')} · 走 ${n('walk')} · 正手 ${n('swing')} · 情绪 ${n('emote')}，共 ${uniqueFrames(sel, ['idle', 'walk', 'swing', 'emote'])} 张。`,
    ),
  );
};
let baseTickers = 0;
for (const ch of CAST) {
  const b = el('button', 'k-chip d-chip', ch.name);
  b.onclick = () => {
    sel = ch;
    for (const x of chips.children) x.classList.toggle('on', x === b);
    buildMoves();
  };
  if (ch === sel) b.classList.add('on');
  chips.append(b);
}
moves.append(chips, stage);

/* ---------------- 4. 近看 ---------------- */
const close = section(
  '近看',
  '整数倍放大（6 倍，手机上 2–3 cm 高）：脸只有 2–3 格的五官，靠帽檐、胡子、眼镜、发型和身形区分。',
);
close.id = 'close';
const closeRow = el('div', 'd-close');
for (const id of ['dale', 'ray', 'teodora', 'nadia']) {
  const ch = CAST.find((c) => c.id === id) as CharDef;
  const cell = el('div', 'd-ccell');
  cell.append(player(ch, () => (id === 'ray' ? 'walk' : 'idle'), 'front', 6, { w: 22, h: 30 }));
  cell.append(el('div', 'd-sname', ch.name));
  closeRow.append(cell);
}
close.append(closeRow);

/* ---------------- 5. 放进游戏 ---------------- */
const px = Number(q.get('px')) === 2 ? 2 : 1;
const zoomQ = Number(q.get('zoom')) || 4;
const mode = px === 2 ? 'big' : zoomQ > 5 ? 'near' : 'game';
const MODE_TXT = {
  game: '游戏的默认缩放（zoom 4，手机上 1 个缓冲像素 = 1 个 CSS 像素，就是游戏里的大小）',
  near: '建议的缩放（zoom 7.8：场景放大一倍、人不变，人和球场的比例接近真实）',
  big: '游戏的默认缩放，整体放大 2 倍看细节',
};
const sceneS = section(
  '放进游戏',
  `真的 Palm Oasis，${MODE_TXT[mode]}。青训 1 号场 Nadia 对 Jess；近处场边 Dale 带两个小孩，远处场边 Lily、Gus、Teodora；上下两条步道上 Ray、Ben、总监、Mateo 和客人走来走去。标"现在"的是现有的人（Dale、Lily），站在新版旁边。单指拖动可以看别处。`,
);
sceneS.id = 'scene';
const sw = el('div', 'd-chips');
const lab = q.get('labels') === '0' ? '&labels=0' : '';
const chip = (on: boolean, href: string, t: string) =>
  `<a class="k-chip d-chip ${on ? 'on' : ''}" href="${href}">${t}</a>`;
sw.innerHTML =
  chip(mode === 'game', `?view=scene${lab}`, '游戏原大') +
  chip(mode === 'near', `?view=scene&zoom=7.8&tx=-19&tz=4${lab}`, '建议 zoom 7.8') +
  chip(mode === 'big', `?view=scene&px=2${lab}`, '放大 2×') +
  chip(
    !lab,
    `?${new URLSearchParams([...q.entries()].filter(([k]) => k !== 'labels')).toString()}${lab ? '' : '&labels=0'}`,
    lab ? '显示名字' : '去掉名字',
  );
const host = el('div', 'd-scene');
sceneS.append(sw, host);

/* ---------------- 6. 说明 ---------------- */
const budget = CAST.map((c) => `${c.name} ${uniqueFrames(c, ['idle', 'walk', 'swing', 'emote'])}`).join(' · ');
const notes = section('说明', '');
notes.id = 'notes';
notes.append(
  el(
    'div',
    'd-notes',
    `<h3>规格</h3>
<ul>
<li><b>精灵</b>：画布 26×34，实际 9–15 宽、16–29 高（含描边和手里的东西）。成人 22–29 高（现在 14），小孩 16 和 19。头 6–9 行（含帽、发髻），头身比约 1:3.5（Dale、Teodora）到 1:4（Ben、Nadia）。</li>
<li><b>体型模板</b>（每个主要人物一个）：腿长、腿宽、两腿间距、躯干字符画（肩宽、肚子、腰身）、肩位、臂长、袖长、脖子。共 16 个：宽肚 Dale、结实 Rosa、细高 Ben、运动 Jess、圆肩 Gus、苗条 Lily、娇小 Teodora、倒三角 Nadia、驼背 Ray、细长 Mateo、中等总监、两个小孩、矮圆老人、高瘦妈妈、宽游客。</li>
<li><b>调色板</b>：每人 6–8 个换色槽（皮肤、头发、帽子、上衣、袖子、镶边、下装、袜、鞋、包）+ 自动暗面（右侧 ×0.75，光从左上）+ 共用 9 个固定色（眼镜框、手机、墨镜、口红、护具……），一个人画面上 10–14 色。</li>
<li><b>描边</b>：自动四邻描边（深紫 #2a2238，和场景一致）；压在身前的手臂用暗面区分；球拍、球不描边（和现在一样）。</li>
<li><b>换色</b>：沿用 @td/iso 的 SLOT：同一个体型模板可以换头、换色给路人和客人用；主要人物的身形不共用。</li>
<li><b>动作</b>：帧由"姿势参数"拼出来（脚、胯、前倾、肩、手、手里的东西、表情），每人一组步态参数：Dale 左右晃、Gus 拖步不摆臂、Jess 弹跳小跑马尾甩、Lily 低头看手机、Teodora 小快步、Nadia 大步挺胸转肩、Mateo 蹦着抛球、Ray 坏腿一沉。</li>
</ul>
<h3>每个模板的帧数（正面 + 背面，左右翻转不算）</h3>
<p>idle 4–9（个性动作）+ 走路 4 + 正手 4 + 情绪 2 = 每个朝向 14–19 张，两个朝向去掉重复 <b>24–31 张/人</b>。按人：${budget}。
如果再加跑步 4、反手 3、发球 4、坐 2、搬东西 2，大约 <b>60 张/人</b>。</p>
<h3>成本</h3>
<p>拼帧器 + 参数化动作已经在这页里（约 1 天）。每个人物：体型模板 + 头 + 步态和 idle 参数约 0.5 天；逐帧手修（让关键帧更有味道）约 1 天。主要 11 人 + 客人模板 5 个，全套（含跑、反手、发球、坐）约 <b>3 周</b>一个人；游戏接入（把 Person 的取帧换成按人取模板、挂点照旧）约 3–4 天。</p>
<h3>对游戏的影响</h3>
<ul>
<li><b>和场景的比例</b>：人比现在高一倍（1.8 米的人画成 24 格左右，场景是 4 格/米）。好处是远看就认得出；代价是人站在场上显得大，球场显得小，场边和步道上人多时会挤。可以把手机默认 zoom 从 4 拉到 5.2，让场景跟上。</li>
<li><b>镜头缩放</b>：精灵档位规则不变（≥ 11 px/m 才放大到 2 档），近景时人是 48–56 格，完全看得清。</li>
<li><b>性能</b>：帧是预先拼好烘焙的，运行时和现在一样只是贴一张图；内存 16 人 × 60 帧 × 26×34 × 4 字节 ≈ 3.4 MB（裁到包围盒后不到 1 MB）。</li>
</ul>
<h3>优点</h3>
<ul><li>剪影就认人，最远的镜头里也知道谁在哪儿；动作本身讲性格（Gus 的心累、Jess 的干劲、Ray 的膝盖），不用文字。</li>
<li>体型模板 + 参数化动作，加新人物便宜：换头 + 调步态。</li></ul>
<h3>风险</h3>
<ul><li>最大的风险是比例：人变大以后场景显得像玩具，需要配合调默认缩放或者把人缩到 20 格左右（会丢掉一部分差异）。</li>
<li>每人一套步态，所有活动动画（ADR 0010）要按模板重做挂点和击球帧，工作量跟着人数涨。</li>
<li>脸只有 2–3 格，表情只能靠眉、嘴和姿势，近景肖像要另外想办法（可以和 C 方向的大肖像混搭）。</li></ul>`,
  ),
);

baseTickers = tickers.length;
buildMoves();

/* ---------------- 循环 ---------------- */
let scene: ReturnType<typeof createCharScene> | null = null;
requestAnimationFrame(() => {
  const num = (k: string) => (q.get(k) == null ? undefined : Number(q.get(k)));
  scene = createCharScene(host, px, q.get('labels') !== '0', { tx: num('tx'), tz: num('tz'), zoom: num('zoom') });
  if (q.get('view') === 'scene') sceneS.scrollIntoView();
});
let last = performance.now();
const t0 = last;
const loop = (now: number) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = (now - t0) / 1000;
  for (const f of tickers) f(t);
  scene?.update(dt);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

/* ---------------- 调试：?sheet=1 全部帧的联系表（只给自己检查用） ---------------- */
if (q.get('sheet')) {
  document.body.innerHTML = '';
  document.body.style.background = '#1d2f4e';
  const sc = Number(q.get('sheet')) || 3;
  const only = q.get('only')?.split(',');
  for (const ch of CAST.filter((c) => !only || only.includes(c.id)))
    for (const f of ['front', 'back'] as const) {
      const row = el('div');
      row.style.cssText = 'display:flex;gap:2px;margin:2px;align-items:flex-end';
      row.append(el('span', '', `${ch.id} ${f}`));
      for (const c of ['idle', 'walk', 'swing', 'emote'] as const) {
        const a = anim(ch, c, f);
        a.baked.forEach((b, i) => {
          const pc = new PixCanvas(CW, CH + 1, sc, c === 'swing' ? COURT : SAND);
          pc.clear();
          pc.art(b, Math.floor(CW / 2), CH - 1);
          pc.flush(`${i}`);
          row.append(pc.el);
        });
        row.append(el('span', '', '|'));
      }
      document.body.append(row);
    }
  // 尺寸和帧数（正面 idle 第一帧的包围盒）
  const stats = el('pre', 'd-stats');
  stats.textContent = CAST.map((ch) => {
    const r = anim(ch, 'idle', 'front').arts[0]?.rows ?? [];
    const ys = r.map((row, y) => (/[^.]/.test(row) ? y : -1)).filter((y) => y >= 0);
    const xs = r.flatMap((row) => [...row].map((c, x) => (c !== '.' && c !== 'Q' ? x : -1)).filter((x) => x >= 0));
    const n = (c: ClipName) => anim(ch, c, 'front').arts.length + anim(ch, c, 'back').arts.length;
    return `${ch.id} ${Math.max(...xs) - Math.min(...xs) + 1}x${Math.max(...ys) - Math.min(...ys) + 1} idle${n('idle')} walk${n('walk')} swing${n('swing')} emote${n('emote')} unique${uniqueFrames(ch, ['idle', 'walk', 'swing', 'emote'])}`;
  }).join('\n');
  document.body.prepend(stats);
}
