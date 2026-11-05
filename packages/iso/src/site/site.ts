import type { XZ } from '@td/shared';
import type { Venue } from '../activities/types';
import type { IsoCameraPose } from '../core/camera';
import type { IsoWorld } from '../core/world';
import type { CourtFrame } from '../world/frame';

/**
 * 一块球场上的脏乱（court-care-contract.md，ADR 0022）：各 0..1，0 干净、1 最脏。和模拟的 CourtMess 结构一样
 * （游戏直接把 s.care[f].mess 传进来）；画面只按它画，不改它。
 * sand 积沙、water 积水（红土画成深色湿泥和水洼）、litter 球、瓶子、落叶、lines 白线褪色（红土是线带被盖住）、
 * cracks 裂缝（红土画成干裂发白的斑块）。
 */
export interface CourtMessLook {
  readonly sand: number;
  readonly water: number;
  readonly litter: number;
  readonly lines: number;
  readonly cracks: number;
}

/**
 * 一张地图在画面这一侧要提供的东西（游戏 app 只认这个接口，不直接引用某个场景的模块；ADR 0016、0019）。
 * 名字和内容里地图的锚点一一对应：模拟只说"在 outer_1"，在哪儿、怎么走过去由这里决定。
 */
export interface Site {
  readonly id: string;
  /** 起始天色（之后由 daylight 按游戏时钟设） */
  readonly sky: string;
  readonly camera: {
    readonly overview: IsoCameraPose;
    readonly portrait: IsoCameraPose;
    readonly limits: {
      readonly zoom: readonly [number, number];
      readonly tx: readonly [number, number];
      readonly tz: readonly [number, number];
    };
  };
  /** 活动动画库的场地风格 */
  readonly venue: Venue;
  /** 园区范围（路人、风滚草在这里面活动） */
  readonly bounds: { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number };
  /** 人和球脚下的高度 */
  groundY(x: number, z: number): number;
  /** 每个地点的中心（活动牌挂在这儿） */
  readonly anchors: Readonly<Record<string, XZ>>;
  /** 每个地点上人站在哪儿（地点牌也挂在这儿） */
  readonly stands: Readonly<Record<string, XZ>>;
  /**
   * 球场的门外（court-care-contract.md，可选）：场地不能打时等着的会员站在这儿（地点 → 门外一点，世界坐标，
   * 在围网外、步道上、不挡门）。没给的地点用 stands。
   */
  readonly gates?: Readonly<Record<string, XZ>>;
  /**
   * 地图长大（ADR 0021，可选）：地块上新地点的中心和站位。不在 anchors / stands 里（地块没开时不显示、路人不去）；
   * 游戏按模拟的 placeAvailable / placeOpen 决定什么时候用。routeLine 认这些地点。
   */
  readonly land?: {
    readonly anchors: Readonly<Record<string, XZ>>;
    readonly stands: Readonly<Record<string, XZ>>;
    /** 地块 → 变体 → 新锚点 */
    readonly plots: Readonly<Record<string, Readonly<Record<string, string>>>>;
    /** 旧站位 + 这些已经开了的新地点的站位 */
    standsWith(open: readonly string[]): Readonly<Record<string, XZ>>;
    /** 新地点上的球场（开了以后演出、路人打球、员工站位用；可选） */
    readonly courts?: Readonly<Record<string, readonly CourtFrame[]>>;
    /** 新地点上不是球场的空地（施工、接待的演出用；可选） */
    readonly grounds?: Readonly<Record<string, CourtFrame>>;
    /**
     * 新地启用时镜头对准哪儿、拉到多远（可选）：长出来的整块地都要进画面（赛事广场的新地和挪过去的停车场
     * 在观赛坡的南边，锚点本身不在中间）。没给就对准锚点、不改缩放。
     */
    focus?(plot: string, variant: string): { readonly x: number; readonly z: number; readonly zoom?: number } | null;
  };
  /** 两个地点之间步行的折线（含两头的站位） */
  routeLine(a: string, b: string): XZ[] | null;
  /** 地点 → 那儿的球场（演出、路人打球、员工朝向用）；一个地点可以有几块场地 */
  readonly courts: Readonly<Record<string, readonly CourtFrame[]>>;
  /**
   * 按设施修成的变体给这个地点的球场（可选；wave1-contract.md「变体」）。变体改了场地的画法
   * （比如一块场子从两片匹克球改成四片），演出就得用画出来的那几块。
   * variant 为 null 或不认识的变体、不分叉的地点 = 和 courts[anchor] 一样；不认识的地点返回空表。
   * 没提供这个方法的地图一律用 courts。
   */
  courtsFor?(anchor: string, variant: string | null): readonly CourtFrame[];
  /** 地点 → 不是球场的空地（烧烤会之类的演出） */
  readonly grounds: Readonly<Record<string, CourtFrame>>;
  /** 地面贴图 + 静态节点；同一条种子随机流，顺序就是画面 */
  build(w: IsoWorld): void;
  /**
   * 设施状态的画面层。wear（可选）：状况往下掉时的画面信号，amount 0 干净、1 快掉档、再往上已经掉档
   * （准则 6"先出画面信号，再掉档"；状况怎么换算成 amount 由游戏决定）
   */
  createOverlays(w: IsoWorld): {
    set(facility: string, state: string): void;
    wear?(facility: string, amount: number): void;
    /** 立刻把排着的重建做掉（截图、测试用；没有排队机制的地图可以不提供） */
    flush?(): void;
    /**
     * 这处设施修成 / 要修成哪个变体（wave1-contract.md；null 或不认识的变体 = 原来的样子）。
     * 影响修好以后各档（fresh、worn）的画面；先 variant() 再 set() 状态，同一轮里只重建一次。
     */
    variant?(facility: string, variant: string | null): void;
    /**
     * 在这处设施现在的样子上叠一层"修成这个变体以后"的半透明预览（Bayer 抖动约 45% + 浅青偏色 + 虚线框）；
     * null 关掉这处的预览。同一时间只有一处预览，换一处会把上一处关掉。
     */
    preview?(facility: string, variant: string | null): void;
    /** 开 / 关这处设施的升级（画在变体上面；设施没修好、或升级和变体对不上时不画） */
    upgrade?(facility: string, upgrade: string, on: boolean): void;
    /** 大门的牌匾：一行一处修好的设施（设施、带头人、第几天）；空表 = 没有牌匾 */
    plaque?(rows: readonly { facility: string; leader: string; day: number }[]): void;
    /**
     * 赛事日的布置（wave2-5-contract.md）：kind 是赛事 id（cup_monthly、invitational、regional_open、
     * junior_regional、exhibition），挂在 anchor 这处地点上；null 撤掉这处的布置。只是演出四周的布景
     * （彩旗、签到桌、看台上的观众、拱门、赞助牌、送行的小巴），比赛本身仍是活动动画库的演出。
     * 一处地点同时只有一种赛事；不认识的赛事当 null。几处同时有赛事时共用的布置（大门拱门）只摆一份。
     * 设、撤一次只重建布置那一层（同一轮里几次改动合成一次）；会动的（旗子、观众、飞艇）每帧画，不重建。
     */
    event?(anchor: string, kind: string | null): void;
    /**
     * 表演赛四期筹备（prep_stands 看台、prep_lights 夜场灯、prep_service 球童和服务、prep_media 赞助或转播）
     * 在中心球场上的样子。done = true 画建好的样子（灯塔天黑就亮）；false 是挂出来了还没做：只钉几根测量桩
     * （看台搭着脚手架）。从没调过的那一期什么也不画（★3 以前不调）。不认识的 phase 不理。
     */
    prep?(phase: string, done: boolean): void;
    /**
     * 地块的样子（wave2-5-contract.md「地块」，ADR 0021）：locked 只有伏笔；building 是工地，progress 0..1
     * 是施工进度；open 建好。variant 是选的路（= 地块的变体）。岛长出去时地台和镜头平移的范围一起变大。
     */
    land?(plot: string, state: 'locked' | 'building' | 'open', variant: string | null, progress?: number): void;
    /** 选路卡上的半透明预览：这块地修成这个变体的样子；null 关掉 */
    landPreview?(plot: string, variant: string | null): void;
    /** 第几周（伏笔：高尔夫西段一周比一周荒；从 1 起） */
    week?(week: number): void;
    /**
     * 场地可用度的画面（court-care-contract.md）：在这处设施的所有球场上画积沙、积水、球和垃圾、褪色的线、裂缝，
     * 量按 mess（各 0..1）。面（硬地 / 红土 / 匹克球）按 variant() 给的变体定。null = 不画（小游戏接管这块场时）。
     * 不认识的设施、没修好的设施不画。同一帧里改几次只重画一次；只画贴地的一层，不挡人和网。
     */
    mess?(facility: string, mess: CourtMessLook | null): void;
    /** 立刻按现在的状态把地面贴图和静态节点整个重做一遍（小游戏改过地面、藏过围网以后还原用） */
    repaint?(): void;
  };
  /**
   * 天空和远景的动画（没有就什么也不做）；wind 0 无风 .. 1 大风（可选，默认 0.3）；
   * heat 0 .. 1 酷热（可选，默认 0；court-care-contract.md：地面热浪、远景发白）
   */
  createSky(w: IsoWorld): { update(dt: number, now: number, rain: number, wind?: number, heat?: number): void };
}

/** 折线上走过比例 u（0..1）处的点。 */
export function pointAlong(pts: readonly XZ[], u: number): XZ {
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot((pts[i] as XZ).x - (pts[i - 1] as XZ).x, (pts[i] as XZ).z - (pts[i - 1] as XZ).z);
  let left = Math.max(0, Math.min(1, u)) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as XZ;
    const b = pts[i] as XZ;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= d || i === pts.length - 1) {
      const f = d > 0 ? Math.min(1, left / d) : 1;
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
    }
    left -= d;
  }
  return pts[pts.length - 1] ?? { x: 0, z: 0 };
}
