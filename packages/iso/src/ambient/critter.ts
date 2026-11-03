import type { ArtAnim, Facing, SlotColors } from '../art/format';
import { bakeArt } from '../core/art';
import { Custom, type DrawContext } from '../core/graph';

/**
 * 小动物的画法：一个 Custom 节点，画的时候按"往哪走"在屏幕上的方向挑 front / back、要不要水平翻转。
 * 这样不用知道镜头转角（Q/E 转 90° 后自动换朝向），节点也不用知道 IsoWorld。
 *
 * 素材底图头朝右：屏幕上往下走（朝镜头）用 front，往上走用 back；往左走就翻转。
 */
export class Critter extends Custom {
  /** 当前动画（两个朝向的帧序列） */
  anim: Readonly<Record<Facing, ArtAnim>>;
  /** 动画时钟（秒），使用者推进 */
  t = 0;
  /** 世界里的朝向（xz，不用归一化） */
  readonly dir = { x: 1, z: 0 };
  /** 换色（狗的毛色） */
  slots: SlotColors | undefined;
  /** 额外的整数放大（乘在 spriteScale 上），0 = 不画 */
  size = 1;
  /** 离地的高度（米），画在节点位置上方；地上的影子点仍在节点位置 */
  lift = 0;
  /** 画一个像素的地面影子 */
  shadow = true;

  constructor(anim: Readonly<Record<Facing, ArtAnim>>, slots?: SlotColors, half = 0.4) {
    super((r, self) => (self as Critter).paint(r), { x0: -half, x1: half, y0: 0, y1: half * 1.5, z0: -half, z1: half });
    this.anim = anim;
    this.slots = slots;
  }

  /** 换动画并从头放 */
  play(anim: Readonly<Record<Facing, ArtAnim>>): void {
    if (anim === this.anim) return;
    this.anim = anim;
    this.t = 0;
  }

  private paint(r: DrawContext): void {
    if (this.size <= 0) return;
    const m = this.matrixWorld;
    const x = m[9] as number;
    const y = m[10] as number;
    const z = m[11] as number;
    const a = r.P(x, y, z);
    const b = r.P(x + this.dir.x, y, z + this.dir.z);
    const facing: Facing = b[1] >= a[1] - 0.01 ? 'front' : 'back';
    const flipX = b[0] < a[0];
    const seq = this.anim[facing];
    const n = seq.frames.length;
    const f = seq.frames[Math.floor(this.t / seq.dt) % n] ?? seq.frames[0];
    if (!f) return;
    const lit = r.litAt(x, z);
    if (this.shadow && this.lift > 0.05) {
      // 离地时（跳、飞）地上留一个小影子点，看得出高度
      const s = r.spriteScale;
      r.rect(a[0] - s, a[1], 2 * s + 1, 1, r.col('#5a4a3a', 0.8, lit));
    }
    r.art(bakeArt(f, this.slots), x, y + this.lift, z, { flipX, scale: r.spriteScale * this.size, lit });
  }
}
