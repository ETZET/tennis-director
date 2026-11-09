// 翻牌记分牌（一份实现，两种款式），朝南（+z）：
//   pickle（clubpickle 的 flip-scoreboard）：两条金属腿 + 深青黑的黑板（slate）+ 木顶条，顶条上挂三张奶白翻牌（铜环），
//     三个数 = 匹克球双打报分（发球方 - 接发球方 - 第几发球员，默认 4-2-1），第三张窄一点。1.38 × 1.42 × 0.35 米
//     （规格 1.1 米宽放不下三张 3 纹素宽的数字牌 + 牌缝，放宽到 1.38）。
//   clay（clubclay 的 scoreboard）：两根铁腿 + 俱乐部蓝的牌（counter），顶上一条奶白名牌（网球圆徽标 + 两边几道"字"），
//     下面两行（两队）× 3 格（盘）+ 1 格（局）：盘是白牌、局是奶油金牌，数字深蓝。1.9 × 2.2 × 0.35 米。
// 数字是 3×5 的粗笔画（kit.ts 的 glyph：横向一格 1 设计纹素，横笔一行 1 设计纹素、竖笔段半行），只读出"格子里有数"。
// 牌面朝镜头：黑板 / 蓝牌落中档，翻牌落亮档（这一块最亮的东西）。
//
// userData（stage 3）：
//   pickle：setScore(a, b, c)；clay：setScore(top[4], bottom[4])（null = 空牌）—— 直接换，不翻
//   setCell(i, v)       直接换一张（pickle i 0..2；clay i = 行 * 4 + 列）
//   flip(i, v?)         翻一张：前面那张绕上沿往上翻过去（0.3 秒，经过镜头这边再到牌后面），下面露出新数；v 不给 = 原来的数 + 1
//   cells               当前各格的数
//   update(dt)          翻牌动画（场景每帧调；没在翻就什么都不做）
import * as THREE from 'three';
import {
  Bag,
  type CourtKey,
  DU,
  DV,
  disposeTree,
  FACE_LIT,
  FACE_MID,
  GLYPH_H,
  GLYPH_W,
  glyph,
  type KitCtx,
} from './courtside/kit';

interface Card {
  /** 牌的中心 x、上沿 y */
  x: number;
  top: number;
  w: number;
  h: number;
  key: CourtKey;
}

const CARD_T = 0.025; // 牌厚
const FLIP_DUR = 0.3;

/** 一组翻牌：静态的牌 + 字各合成一个网格；翻的时候临时拿一张"叶子"（牌 + 旧字）绕上沿转 */
function cardSet(
  ctx: KitCtx,
  parent: THREE.Object3D,
  cards: Card[],
  ink: CourtKey,
  z0: number,
  init: (number | null)[],
) {
  const mInk = ctx.mat(ink, { ...FACE_MID, convex: 0 });
  const mCard = new Map<CourtKey, THREE.MeshToonMaterial>();
  const cardMat = (k: CourtKey) => {
    let m = mCard.get(k);
    if (!m) {
      m = ctx.mat(k, { ...FACE_LIT, convex: 0.6 });
      mCard.set(k, m);
    }
    return m;
  };
  const cells = init.slice();
  const zf = z0 + CARD_T + 0.003; // 字的平面

  // 牌（不会变）
  const cb = new Bag();
  for (const c of cards) cb.box(cardMat(c.key), c.w, c.h, CARD_T, c.x, c.top - c.h, z0 + CARD_T / 2);
  cb.into(parent);

  // 字（换数时重建）
  const inkHolder = new THREE.Group();
  parent.add(inkHolder);
  const drawInk = () => {
    for (const c of [...inkHolder.children]) {
      inkHolder.remove(c);
      disposeTree(c);
    }
    const b = new Bag();
    cards.forEach((c, i) => {
      glyph(b, mInk, cells[i], c.x, c.top - c.h / 2, zf);
    });
    if (!b.empty) b.into(inkHolder);
    ctx.mats.prepare(inkHolder, { receive: false });
  };
  drawInk();

  // 翻牌动画
  const leaves: { pivot: THREE.Group; t: number }[] = [];
  const set = (i: number, v: number | null) => {
    if (i < 0 || i >= cards.length) return;
    cells[i] = v;
    drawInk();
  };
  const flip = (i: number, v?: number | null) => {
    if (i < 0 || i >= cards.length) return;
    const c = cards[i];
    const old = cells[i];
    const next = v === undefined ? ((old ?? -1) + 1) % 10 : v;
    // 叶子：转轴在牌的上沿、比静态牌面靠前 6 毫米（盖住底下已经换好的新字）；牌 + 旧字
    const pivot = new THREE.Group();
    pivot.position.set(c.x, c.top, z0 + CARD_T + 0.006);
    const lb = new Bag();
    lb.box(cardMat(c.key), c.w, c.h, CARD_T, 0, -c.h, -CARD_T / 2);
    glyph(lb, mInk, old, 0, -c.h / 2, 0.004);
    lb.into(pivot);
    ctx.mats.prepare(pivot, { receive: false });
    parent.add(pivot);
    leaves.push({ pivot, t: 0 });
    set(i, next);
  };
  const update = (dt: number) => {
    for (let k = leaves.length - 1; k >= 0; k--) {
      const l = leaves[k];
      l.t += dt / FLIP_DUR;
      const e = Math.min(1, l.t);
      // 先快后慢（往上掀的那一下有劲）；转到 -π 就在牌后面了
      l.pivot.rotation.x = -Math.PI * (1 - (1 - e) * (1 - e));
      if (l.t >= 1) {
        parent.remove(l.pivot);
        disposeTree(l.pivot);
        leaves.splice(k, 1);
      }
    }
  };
  return { cells, set, flip, update };
}

// ── 匹克球：三张翻牌 ─────────────────────────────────

export function buildPickle(ctx: KitCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'flip-scoreboard';
  const mMetal = ctx.mat('metal', { convex: 0.6 });
  const mSlate = ctx.mat('slate', { ...FACE_MID, convex: 0.5 });
  const mWood = ctx.mat('timber', { convex: 0.8 });
  const mBrass = ctx.mat('brass', { convex: 0.6 });

  const BW = 1.38;
  const top = 1.3; // 黑板上沿（木顶条压在上面）
  const bot = 0.5;
  const b = new Bag();
  // 两条腿（贴在黑板后面）+ 两只脚（沿 z，站得稳）
  for (const s of [-1, 1]) {
    b.box(mMetal, 0.09, top + 0.06, 0.09, s * (BW / 2 - 0.1), 0, -0.08);
    b.box(mMetal, 0.12, 0.06, 0.38, s * (BW / 2 - 0.1), 0, -0.06);
  }
  // 黑板（落中档的深青）+ 下沿一道木边
  b.box(mSlate, BW, top - bot, 0.06, 0, bot, -0.03);
  b.box(mWood, BW + 0.04, 0.07, 0.1, 0, bot - 0.05, -0.02);
  // 木顶条（顶面亮）
  b.box(mWood, BW + 0.1, 0.12, 0.16, 0, top, -0.02);
  b.into(root);

  // 三张牌（第三张窄）：挂在顶条下面
  const z0 = 0.0;
  const ch = GLYPH_H + DV; // 上下各留半行
  const ws = [GLYPH_W + DU, GLYPH_W + DU, GLYPH_W + DU * 0.6];
  const gap = 0.1; // 三张牌之间留 1 纹素多：读成三张牌，不是一个三位数
  const total = ws.reduce((a, w) => a + w, 0) + gap * (ws.length - 1);
  const cards: Card[] = [];
  let x = -total / 2;
  for (const w of ws) {
    cards.push({ x: x + w / 2, top: top - 0.05, w, h: ch, key: 'signPaint' });
    x += w + gap;
  }
  // 铜环：每张牌上沿两个，挂在顶条上（1 纹素）
  const rb = new Bag();
  for (const c of cards)
    for (const s of [-1, 1]) rb.box(mBrass, 0.06, 0.1, 0.05, c.x + s * (c.w / 2 - 0.07), top - 0.09, z0 + 0.012);
  rb.into(root);
  const set = cardSet(ctx, root, cards, 'slate', z0, [4, 2, 1]);

  ctx.mats.prepare(root);
  root.userData.cells = set.cells;
  root.userData.setScore = (a: number, b2: number, c: number) => {
    set.set(0, a);
    set.set(1, b2);
    set.set(2, c);
  };
  root.userData.setCell = set.set;
  root.userData.flip = set.flip;
  root.userData.update = set.update;
  return root;
}

// ── 红土：两队 × (3 盘 + 1 局) ─────────────────────────

export function buildClay(ctx: KitCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'scoreboard';
  const mMetal = ctx.mat('metal', { convex: 0.6 });
  const mBoard = ctx.mat('counter', { ...FACE_MID, convex: 0.6 });
  const mPlate = ctx.mat('signPaint', { ...FACE_LIT, convex: 0.5 });
  const mBall = ctx.mat('ball', { ...FACE_LIT, convex: 0.3 });
  const mInkDark = ctx.mat('signBoard', { ...FACE_MID, convex: 0 });

  const BW = 1.9;
  const top = 2.2;
  const bot = 0.36;
  const b = new Bag();
  for (const s of [-1, 1]) {
    b.box(mMetal, 0.11, top - 0.1, 0.11, s * (BW / 2 - 0.16), 0, -0.1);
    b.box(mMetal, 0.14, 0.07, 0.42, s * (BW / 2 - 0.16), 0, -0.08);
  }
  // 蓝牌（顶面、上沿亮边靠 convex）
  b.box(mBoard, BW, top - bot, 0.08, 0, bot, -0.04);

  // 名牌：奶白一条 + 中间网球圆（八边形）+ 两边各三道深蓝短划（"字"，不写真字）
  const plateTop = top - 0.07;
  const plateH = DV * 2 + 0.03;
  b.box(mPlate, BW - 0.16, plateH, 0.02, 0, plateTop - plateH, 0);
  const py = plateTop - plateH / 2;
  b.add(mBall, new THREE.CylinderGeometry(0.135, 0.135, 0.02, 8).rotateX(Math.PI / 2).translate(0, py, 0.03));
  for (const s of [-1, 1])
    for (let k = 0; k < 3; k++) b.quad(mInkDark, k === 1 ? DU * 2 : DU * 3, DV, s * (0.28 + k * 0.24), py, 0.0215);
  b.into(root);

  // 两行翻牌
  const z0 = 0.0;
  const ch = GLYPH_H + DV;
  const cw = GLYPH_W + DU;
  // 三格盘之间 1 纹素缝（不然 6 和 3 读成 63），局那格前面多空一截放分隔条
  const xs = [-0.705, -0.255, 0.195, 0.69];
  const tops = [plateTop - plateH - 0.07, plateTop - plateH - 0.07 - ch - 0.07];
  const cards: Card[] = [];
  for (const t of tops)
    xs.forEach((x, c) => {
      cards.push({ x, top: t, w: cw, h: ch, key: c === 3 ? 'signPaint' : 'clothWhite' });
    });
  // 局那一格前面一道分隔竖条（深蓝，压在蓝牌上）
  const sep = new Bag();
  sep.box(mInkDark, DU, tops[0] - (tops[1] - ch) + 0.04, 0.012, 0.442, tops[1] - ch - 0.02, 0.0);
  sep.into(root);
  // 默认：上队 6 3 _ | 2，下队 4 6 _ | 1（第三盘还没打完：盘那格空着，局格是这一盘的局数）
  const set = cardSet(ctx, root, cards, 'signBoard', z0, [6, 3, null, 2, 4, 6, null, 1]);

  ctx.mats.prepare(root);
  root.userData.cells = set.cells;
  root.userData.setScore = (topRow: (number | null)[], bottomRow: (number | null)[]) => {
    for (let c = 0; c < 4; c++) {
      set.set(c, topRow[c] ?? null);
      set.set(4 + c, bottomRow[c] ?? null);
    }
  };
  root.userData.setCell = set.set;
  root.userData.flip = set.flip;
  root.userData.update = set.update;
  return root;
}
