// #6 今日场地板（clubdesk.md）：A 字黑板。板面 slate（paint 元素 = 粉笔擦过的深浅），木框 timber，
// 粉笔（signPaint）不写真的字：上面一道标题划、一个场地格子（外框 + 网 + 中线），下面两行"场地号 · 时间 · 对勾"的粗划。
// 本地原点 = 脚印中心，+z 朝镜头；场景里 rotY −0.35（微微转向排队的人）。
// 粉笔格按"1× 下每格 2×2 个屏幕纹素"排：沿斜板的行距 PITCH 让每行正好落 2 个屏幕行（45° 俯视 + 板的倾角）。
import * as THREE from 'three';
import type { AssetCtx } from '../world';
import { box, DT, Parts } from './props/kit';

const W = 0.81; // 9 纹素：两边框各 1、板面 7
const H = 1.25;
const SPREAD = 0.275; // 脚到中线的距离（深 0.55）
const TILT = Math.atan2(SPREAD, H);
const L = H / Math.cos(TILT); // 板长（沿斜面）
/** 沿斜板的一行（米）：投到屏幕上 = 2 个屏幕纹素（1×） */
const PITCH = DT / (Math.SQRT1_2 * (Math.cos(TILT) + Math.sin(TILT)));
const LEG = DT; // 框下沿露出的脚
const RAIL = DT;

// 粉笔：7 列 × 9 行，'#' = 一格粉笔（每格 1 设计纹素宽、PITCH 高）。粉笔只占板面四成多：行与行之间空一行
const CHALK = [
  '###....', // 标题
  '.......',
  '#####..', // 场地格子：上边
  '#.#.#.#', //           两边线 + 网 + 右边一个对勾
  '#####..', //           下边
  '.......',
  '##.###.', // 场地 1 · 时间
  '.......',
  '##.##.#', // 场地 2 · 时间 · 对勾
];

/** 朝镜头、往后仰的板面：光往上偏、档位阈值往下挪，板面落中档 */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.3] as [number, number], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  // 框只有 1 纹素宽：不加元素（板缝在 1 纹素的框上就是一排缺口）
  const wood = ctx.mat('timber', FACE);
  const slate = ctx.mat('slate', { ...FACE, elem: { kind: 'paint', size: [6, 4], density: [0.02, 0.08], patch: 1 } });
  // 粉笔：固定落 signPaint 的暗档（浅紫灰 L 150，像擦过又写的粉笔），和板面差 ~70，不用中档的奶油黄（差 120，满板都是字）
  const chalk = ctx.mat('signPaint', { noShadowReceive: true, bands: [2, 3], edge: 0, convex: 0 });

  // 一块板（板本地：x 横、y 沿斜面从脚往上、+z = 板面朝外）
  const panel = (
    front: boolean,
  ): { wood: THREE.BufferGeometry[]; slate: THREE.BufferGeometry[]; chalk: THREE.BufferGeometry[] } => {
    const t = 0.06;
    const out = {
      wood: [] as THREE.BufferGeometry[],
      slate: [] as THREE.BufferGeometry[],
      chalk: [] as THREE.BufferGeometry[],
    };
    for (const sx of [-1, 1]) out.wood.push(box(DT, L, t, sx * (W / 2 - DT / 2), L / 2, 0)); // 两根边框（下面是脚）
    out.wood.push(box(W - 2 * DT, RAIL, t, 0, L - RAIL / 2, 0)); // 上框
    out.wood.push(box(W - 2 * DT, RAIL, t, 0, LEG + RAIL / 2, 0)); // 下框
    const s0 = LEG + RAIL; // 板面下沿
    const s1 = L - RAIL; // 板面上沿
    out.slate.push(box(W - 2 * DT, s1 - s0, 0.03, 0, (s0 + s1) / 2, -0.012));
    if (front) {
      // 粉笔托：下框前面伸出一条
      out.wood.push(box(W - 2 * DT, 0.06, DT, 0, s0 + 0.03, t / 2 + DT / 2));
      // 粉笔：按行把连续的 '#' 合成一段（贴在板面前 4 毫米）
      const top = s1 - (s1 - s0 - CHALK.length * PITCH) / 2;
      const x0 = -((W - 2 * DT) / 2);
      CHALK.forEach((row, r) => {
        for (let c = 0; c < row.length; ) {
          if (row[c] !== '#') {
            c++;
            continue;
          }
          let e = c;
          while (e < row.length && row[e] === '#') e++;
          const g = new THREE.PlaneGeometry((e - c) * DT, PITCH);
          g.translate(x0 + ((c + e) / 2) * DT, top - (r + 0.5) * PITCH, 0.008);
          out.chalk.push(g);
          c = e;
        }
      });
    }
    return out;
  };

  const p = new Parts();
  const place = (front: boolean) => {
    const parts = panel(front);
    // 前板：绕 x 往后仰 TILT，脚放在 z = +SPREAD；后板：先转 180°（朝 −z）再往前仰，脚在 −SPREAD
    const m = new THREE.Matrix4();
    if (front) m.makeTranslation(0, 0, SPREAD).multiply(new THREE.Matrix4().makeRotationX(-TILT));
    else
      m.makeTranslation(0, 0, -SPREAD)
        .multiply(new THREE.Matrix4().makeRotationX(TILT))
        .multiply(new THREE.Matrix4().makeRotationY(Math.PI));
    for (const g of parts.wood) p.add(wood, g.applyMatrix4(m));
    for (const g of parts.slate) p.add(slate, g.applyMatrix4(m));
    for (const g of parts.chalk) p.add(chalk, g.applyMatrix4(m));
  };
  place(true);
  place(false);
  // 顶上的合页木块（两块板在这里碰头）
  p.add(wood, box(W, DT, 0.12, 0, H - DT / 2 + 0.02, 0));
  p.build(root);

  ctx.mats.prepare(root);
  return root;
}
