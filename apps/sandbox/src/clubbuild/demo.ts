// clubbuild 的自动演示（?demo=1）：照玩家的操作一步步来，大约 30 秒把开罗式的循环演一遍：
// 抽屉滑出 → 选卡（镜头推近、影子生成在空地）→ 影子一格一格挪过去 → ✓（连放：影子跳到旁边）→ 完成（镜头拉回）
// → 凑出组合（大横幅）→ 步道：拖出一段（"N 格 $X"）→ ✓ 铺 → 拆一棵树 → ↶ 撤销 → 收起，2× 速度。
// 走的是和手点一样的控制器接口（game.ts 的 Game）。位置在运行时按现在的布局找（开局布局、地形会变）：
// 找"放得下、而且能凑成指定组合"的格子。
import { BY_ID, LOT_D, LOT_W } from './catalog';
import type { Game } from './game';
import { comboPreview, doorTile, inLot, occupancy, openRowStart, placeErrorCode, type Rot, route } from './sim';

type T2 = [number, number];
/** 脚本：yield 等几秒（按游戏的帧走） */
type Script = Generator<number, void, void>;

const USED = ['practice-wall', 'cafe', 'shade', 'path'];
/** 演示要用到的设施都解锁的星级（game.ts 开局用它，照 star=N 的快速测试口子） */
export const DEMO_STAR = Math.max(0, ...USED.map((id) => BY_ID[id]?.star ?? 0));

/** 影子一格一格挪过去（像手指拖着走） */
function* glide(g: Game, to: T2): Script {
  for (let i = 1; i <= 6; i++) {
    const gh = g.ghostAt();
    if (!gh) return;
    const k = 1 / (7 - i);
    g.moveGhost(Math.round(gh[0] + (to[0] - gh[0]) * k), Math.round(gh[1] + (to[1] - gh[1]) * k));
    yield 0.09;
  }
}

/** 放得下、能凑成 combo 的位置里离 near 最近的；没有就只要放得下的 */
function comboSpot(g: Game, id: string, rot: Rot, combo: string, near: T2): T2 | null {
  const s = g.state;
  const def = BY_ID[id];
  let best: T2 | null = null;
  let bd = Infinity;
  let any: T2 | null = null;
  let ad = Infinity;
  for (let r = 0; r < LOT_D; r++)
    for (let c = 0; c < LOT_W; c++) {
      const e = placeErrorCode(s, def, c, r, rot);
      if (e !== null && e !== 'money') continue;
      const d = (c - near[0]) ** 2 + (r - near[1]) ** 2;
      if (d < ad) {
        ad = d;
        any = [c, r];
      }
      if (d < bd && comboPreview(s, id, c, r, rot).some((x) => x.combo.id === combo)) {
        bd = d;
        best = [c, r];
      }
    }
  return best ?? any;
}

/**
 * 给一个没有路的设施找条路：从门格外面的空格出发，在空地上广搜到最近的路格；
 * 结果拆成几段直线（每段一次"拖动"），第一段带拖动预览。
 */
function pathFor(g: Game): T2[][] | null {
  const s = g.state;
  const occ = occupancy(s);
  const open = openRowStart(s);
  const isPath = (c: number, r: number) =>
    inLot(c, r) && (occ[r * LOT_W + c] === -1 || s.placed.some((p) => p.id === 'path' && p.col === c && p.row === r));
  const free = (c: number, r: number) => inLot(c, r) && r >= open && occ[r * LOT_W + c] === 0;
  const dirs: T2[] = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ];
  for (const p of s.placed) {
    if (BY_ID[p.id]?.cap <= 0 || BY_ID[p.id]?.cat === 'road' || route(s, null, p.uid)) continue;
    const [dc, dr] = doorTile(p);
    const starts = dirs.map(([x, y]) => [dc + x, dr + y] as T2).filter(([c, r]) => free(c, r));
    if (!starts.length) continue;
    // 广搜（只走空地），到了挨着路的格子就停
    const prev = new Map<number, number>();
    const key = (c: number, r: number) => r * LOT_W + c;
    const q: T2[] = [];
    for (const t of starts) {
      prev.set(key(...t), -1);
      q.push(t);
    }
    let end: T2 | null = null;
    while (q.length && !end) {
      const [c, r] = q.shift() as T2;
      if (dirs.some(([x, y]) => isPath(c + x, r + y))) {
        end = [c, r];
        break;
      }
      for (const [x, y] of dirs) {
        const n: T2 = [c + x, r + y];
        if (!free(...n) || prev.has(key(...n))) continue;
        prev.set(key(...n), key(c, r));
        q.push(n);
      }
    }
    if (!end) continue;
    const tiles: T2[] = [];
    for (let k = key(...end); k !== -1; k = prev.get(k) ?? -1) tiles.unshift([k % LOT_W, Math.floor(k / LOT_W)]);
    // 拆成直线段
    const segs: T2[][] = [];
    let cur: T2[] = [tiles[0]];
    for (let i = 1; i < tiles.length; i++) {
      const t = tiles[i];
      if (cur.length >= 2) {
        const a = cur[cur.length - 2];
        const b = cur[cur.length - 1];
        if (t[0] - b[0] !== b[0] - a[0] || t[1] - b[1] !== b[1] - a[1]) {
          segs.push(cur);
          cur = [b];
        }
      }
      cur.push(t);
    }
    segs.push(cur);
    return segs;
  }
  return null;
}

function* script(g: Game): Script {
  yield 0.6;
  g.openTray(); // 抽屉滑出，镜头往上挪开
  yield 0.9;
  g.selectTab('court');
  yield 0.6;
  const court = g.state.placed.find((p) => p.id === 'court-hard');
  const cc: T2 = court ? [court.col + 6, court.row + 2] : [LOT_W / 2, LOT_D / 2];

  // ① 练习墙贴着球场：青训角
  g.selectCard('practice-wall'); // 镜头推近，影子生成在空地
  yield 1.0;
  const w1 = comboSpot(g, 'practice-wall', 0, 'wall-court', cc);
  if (w1) yield* glide(g, w1);
  yield 0.5;
  g.confirm(); // 连放：影子跳到旁边的空位
  yield 1.1;
  g.done(); // 回托盘，镜头拉回全图
  yield 0.9;

  // ② 咖啡车放到球场边：打完来一杯
  g.selectTab('facility');
  yield 0.6;
  g.selectCard('cafe');
  yield 0.9;
  g.rotate();
  yield 0.35;
  const w2 = comboSpot(g, 'cafe', 1, 'cafe-court', cc);
  if (w2) yield* glide(g, w2);
  yield 0.5;
  g.confirm();
  yield 0.6;
  g.done();
  yield 0.9;

  // ③ 步道：从没路的设施门口拖一段 L 到最近的路，看 "N 格 $X"，再 ✓
  g.selectTab('road');
  yield 0.5;
  g.selectCard('path');
  yield 0.9;
  const pf = pathFor(g);
  if (pf) {
    // 第一段像手指拖着：终点一格一格往前
    const first = pf[0];
    for (let k = 1; k <= 6; k++) {
      g.pathPreview(first[0], first[Math.min(first.length - 1, Math.round(((first.length - 1) * k) / 6))], 'h');
      yield 0.14;
    }
    for (const sg of pf) {
      g.pathSegment(sg[0], sg[sg.length - 1], sg[0][0] === sg[sg.length - 1][0] ? 'v' : 'h');
      yield 0.3;
    }
    yield 1.0;
    g.confirm();
    yield 0.8;
  }
  g.done();
  yield 0.6;

  // ④ 遮阳休息区放到球场边：场边树荫
  g.selectTab('deco');
  yield 0.6;
  g.selectCard('shade');
  yield 0.9;
  const w3 = comboSpot(g, 'shade', 0, 'shade-court', cc);
  if (w3) yield* glide(g, w3);
  yield 0.5;
  g.confirm();
  yield 0.6;
  g.done();
  yield 0.5;
  g.closeTray();
  yield 2.2;

  // ⑤ 拆掉一棵棕榈，再撤销
  const palm = g.state.placed.find((p) => p.id === 'palm');
  if (palm) {
    g.removeMode();
    yield 0.7;
    g.selectAt(palm.col, palm.row);
    yield 1.0;
    g.confirm();
    yield 1.0;
    g.undo();
    yield 1.2;
    g.done();
    yield 0.4;
  }
  g.setSpeed(2);
}

export function runDemo(game: Game) {
  const it = script(game);
  // 按游戏的帧走（每帧的真实秒，封顶 0.1）：机器慢（无头浏览器的软件渲染）时整段一起放慢，截图里的进度和帧数对得上
  let wait = 0;
  game.onFrame = (dt) => {
    wait -= dt;
    while (wait <= 0) {
      let r: IteratorResult<number, void>;
      try {
        r = it.next();
      } catch (e) {
        console.warn('demo step', e);
        game.onFrame = null;
        return;
      }
      if (r.done) {
        game.onFrame = null;
        return;
      }
      wait += r.value;
    }
  };
}
