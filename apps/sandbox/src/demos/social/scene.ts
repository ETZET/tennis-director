/**
 * 上半屏：真的 Palm Oasis（@td/iso 的 INDIAN_WELLS），镜头固定。
 * 场景里的人：门口来的访客（看手机评分决定进不进）、在场里逛的会员和游客（评论就是他们写的）、
 * 早上青训场 Dale 带的小孩、中心球场打球的两个人、一只狗、维护工 Rosa（点场景里的牌子派她去修）。
 * 这里只管画面和走位；数值由 main.ts 通过钩子决定。
 */
import {
  activities,
  bakeArt,
  createDaylight,
  createDog,
  createIsoWorld,
  type Dog,
  ICON_ART,
  INDIAN_WELLS,
  INDIAN_WELLS_WORLD,
  type IsoWorld,
  indianWells,
  Particles,
  type PeopleWorld,
  Person,
  type PersonOptions,
  type PixelArt,
  SpriteLayer,
  setPeopleView,
} from '@td/iso';
import { mulberry32, type XZ } from '@td/shared';
import { artCanvas, bubbleArt, type FaceLook, TYPING } from './art';
import { SPOT_FAC, type Spot, type Tag } from './game';

const site = INDIAN_WELLS;
const { ANCHORS, F_P2, F_S1 } = indianWells;

/** 场里可以逛的站位 */
const INNER = ['practice', 'outer_1', 'outer_23', 'stadium_1', 'stadium_3', 'plaza'] as const;
/** 修好以后的状态 */
const FIXED_STATE: Record<Spot, string> = { sand: 'open', fountain: 'open' };
const BROKEN_STATE: Record<Spot, string> = { sand: 'buried', fountain: 'worn' };

export interface Actor {
  id: number;
  p: Person;
  look: FaceLook;
  state: 'arrive' | 'gate' | 'inside' | 'leave' | 'turn' | 'write' | 'gone';
  stand: string;
  t: number;
  regular: boolean;
  blogger: boolean;
  /** 在场里待多久就走 */
  stay: number;
  label?: HTMLElement;
  onArrive?: () => void;
}

export interface SceneHooks {
  /** 门口看完手机：进还是不进 */
  decide(a: Actor): boolean;
  rating(): number;
  entered(a: Actor, at: { x: number; y: number }): void;
  turned(a: Actor, at: { x: number; y: number }): void;
  /** 点了场景里"扫沙 / 清喷泉"的牌子 */
  fixTap(spot: Spot): void;
}

export class Scene {
  readonly world: IsoWorld;
  readonly host: HTMLElement;
  readonly labels: HTMLElement;
  readonly fx: SpriteLayer;
  readonly parts: Particles;
  readonly actors: Actor[] = [];
  readonly fixed: Record<Spot, boolean> = { sand: false, fountain: false };
  /** Rosa 正在修哪儿（0..1 进度） */
  fixing: { spot: Spot; t: number; dur: number; working: boolean } | null = null;
  kids: Person[] = [];
  private readonly peopleW: PeopleWorld;
  private readonly overlays: ReturnType<typeof site.createOverlays>;
  private readonly sky: ReturnType<typeof site.createSky>;
  private readonly daylight: ReturnType<typeof createDaylight>;
  private readonly dog: Dog;
  private readonly rosa: Person;
  private readonly dale: Person;
  private readonly players: Person[] = [];
  private readonly rand = mulberry32(99);
  private nid = 1;
  private now = 0;
  private readonly markers: Record<Spot, HTMLButtonElement>;
  private kidsOn = true;
  private onFixed: ((s: Spot) => void) | null = null;

  constructor(
    parent: HTMLElement,
    private readonly hooks: SceneHooks,
    seed: number,
  ) {
    this.rand = mulberry32(seed ^ 0x5eed);
    this.host = document.createElement('div');
    this.host.id = 'scene';
    parent.append(this.host);
    // 画布按整数倍放大：每个缓冲像素 2 个 CSS 像素（3 倍屏上就是 6 个设备像素），容器宽高取偶数
    const W = Math.floor(parent.clientWidth / 2) * 2;
    const H = Math.max(220, Math.floor((parent.clientHeight - 452) / 2) * 2);
    Object.assign(this.host.style, { right: 'auto', width: `${W}px`, height: `${H}px` });
    // 镜头对着热闹的东半边：大门、匹克球场（积沙）、喷泉、青训场、中心球场；单指可以拖着看别处，不缩放
    this.world = createIsoWorld(this.host, {
      ...INDIAN_WELLS_WORLD,
      pixelSize: 2,
      pose: { tx: 29, tz: -15, zoom: 3, rot: 0 },
    });
    this.world.camera.limits = { zoom: [3, 3], tx: [-30, 60], tz: [-40, 30] };
    this.world.camera.enabled = true;
    site.build(this.world);
    this.overlays = site.createOverlays(this.world);
    for (const f of indianWells.FACILITIES) this.overlays.set(f, indianWells.RESTORED_STATES[f]);
    this.overlays.set(SPOT_FAC.sand, BROKEN_STATE.sand);
    this.overlays.set(SPOT_FAC.fountain, BROKEN_STATE.fountain);
    this.overlays.flush?.();
    this.sky = site.createSky(this.world);
    this.daylight = createDaylight(this.world);
    this.peopleW = { scene: this.world.scene, groundY: site.groundY, people: [] };
    this.fx = new SpriteLayer(this.world.scene);
    this.parts = new Particles(this.world.scene, this.rand, { groundY: site.groundY });
    this.labels = document.createElement('div');
    this.labels.id = 'labels';
    this.host.append(this.labels);

    this.dog = createDog(
      this.world.scene,
      site.groundY,
      [
        [36, 2],
        [36, -10],
        [40, -15],
        [30, -8],
        [24, -6.5],
        [36, 10],
        [35.5, 15.5],
      ],
      '#b07a3a',
      seed,
    );
    // Rosa：维护工，在会所门口待命
    const rs = site.stands.clubhouse as XZ;
    this.rosa = new Person(
      {
        name: 'rosa',
        x: rs.x + 2,
        z: rs.z + 1,
        skin: '#c48a62',
        hair: '#1c1712',
        hairStyle: 'cap',
        cap: '#3f7f5a',
        shirt: '#3f7f5a',
        shorts: '#5a4a3a',
        pants: true,
        shoes: '#5a3a22',
      },
      this.peopleW,
    );
    this.label(this.rosa, 'ROSA', 'staff');
    // Dale 和青训的小孩（早上）
    const d = F_P2.w({ x: 10.5, z: 1 });
    this.dale = new Person(
      {
        name: 'dale',
        x: d.x,
        z: d.z,
        skin: '#e8b896',
        hair: '#d8d0c0',
        hairStyle: 'cap',
        cap: '#c8553d',
        shirt: '#f2efe6',
        shorts: '#2f3a4f',
        shoes: '#f3f1ea',
        base: 'director',
      },
      this.peopleW,
    );
    for (let i = 0; i < 3; i++) {
      const k = F_P2.w({ x: 5 + i * 1.6, z: -2 + i * 1.8 });
      const lk = activities.look(this.rand, 'hollow', false);
      this.kids.push(
        new Person(
          { ...lk, name: `kid${i}`, x: k.x, z: k.z, scale: 0.6, racket: '#3a7ad6', base: 'ready' },
          this.peopleW,
        ),
      );
    }
    // 中心球场上两个人在打球
    for (const [x, z] of [
      [-8, 1.5],
      [8, -1.5],
    ] as const) {
      const w = F_S1.w({ x, z });
      const lk = activities.look(this.rand, 'hollow', false);
      this.players.push(
        new Person({ ...lk, name: 'player', x: w.x, z: w.z, racket: '#2a2a2a', base: 'ready' }, this.peopleW),
      );
    }
    this.markers = { sand: this.marker('sand', '扫沙'), fountain: this.marker('fountain', '清喷泉') };
  }

  /* ---------------- 人 ---------------- */

  /** 场景里一个人的样子（头像也用这套颜色） */
  private newLook(o: Partial<PersonOptions> = {}): PersonOptions {
    const lk = activities.look(this.rand, 'hollow', false);
    return { ...lk, ...o } as PersonOptions;
  }

  /** 门口来一个访客（从停车场走过来） */
  spawnVisitor(o: { regular?: boolean; blogger?: boolean; inside?: boolean; at?: string } = {}): Actor {
    const look = o.blogger
      ? this.newLook({ shirt: '#ff6fae', hairStyle: 'cap', cap: '#ffd23a', shorts: '#26262b', phone: true })
      : this.newLook({ phone: true });
    const startAt = o.at ?? (o.inside ? (INNER[Math.floor(this.rand() * INNER.length)] as string) : 'parking');
    const s = site.stands[startAt] as XZ;
    const p = new Person({ ...look, name: `v${this.nid}`, x: s.x + this.jit(), z: s.z + this.jit() }, this.peopleW);
    if (p.phone) p.phone.visible = false;
    const a: Actor = {
      id: this.nid++,
      p,
      look: { skin: look.skin, hair: look.hair, shirt: look.shirt, hairStyle: look.hairStyle, cap: look.cap },
      state: o.inside ? 'inside' : 'arrive',
      stand: startAt,
      t: 0,
      regular: !!o.regular,
      blogger: !!o.blogger,
      stay: 50 + this.rand() * 60,
    };
    if (o.blogger) this.label(p, '博主', 'blog', a);
    else if (o.regular) this.label(p, '回头客', 'reg', a);
    if (!o.inside) this.walk(a, 'entrance', 1.7);
    this.actors.push(a);
    return a;
  }

  private jit(): number {
    return (this.rand() - 0.5) * 2.4;
  }

  private walk(a: Actor, to: string, speed = 1.4): void {
    const line = site.routeLine(a.stand, to);
    a.stand = to;
    if (!line || line.length < 2) {
      const s = site.stands[to] as XZ;
      a.p.go(s.x, s.z, speed);
      return;
    }
    const pts = line.slice();
    const last = pts[pts.length - 1] as XZ;
    pts[pts.length - 1] = { x: last.x + this.jit(), z: last.z + this.jit() };
    a.p.path(pts, speed);
  }

  /** 找一个能写评论的人：在场里、没在忙；优先离地点近的 */
  writer(stand: string | null, blogger = false): Actor | null {
    const free = this.actors.filter((a) => a.state === 'inside' && a.blogger === blogger && !a.p.busy());
    if (!free.length) return null;
    if (!stand) return free[Math.floor(this.rand() * free.length)] as Actor;
    const t = site.stands[stand] as XZ;
    free.sort((a, b) => Math.hypot(a.p.pos.x - t.x, a.p.pos.z - t.z) - Math.hypot(b.p.pos.x - t.x, b.p.pos.z - t.z));
    const best = free[0] as Actor;
    // 离得太远就不让他横穿整个园子（等太久），换一个就在那儿的人
    return Math.hypot(best.p.pos.x - t.x, best.p.pos.z - t.z) < 22 ? best : null;
  }

  /** 写评论：走到地点 → 掏手机打字 → 头上冒出评论卡 → done(头顶的屏幕坐标) */
  write(a: Actor, stand: string | null, good: boolean, done: (at: { x: number; y: number }) => void): void {
    a.state = 'write';
    a.p.clearMoves();
    if (stand && stand !== a.stand && site.stands[stand]) this.walk(a, stand, 2.6);
    a.p.call(() => {
      a.p.base = 'phoneStand';
      if (a.p.phone) a.p.phone.visible = true;
      this.fx.spr({ art: bakeArt(TYPING), aspect: 1 }, { follow: a.p.headTop, off: 0.2, dur: 1.3, rise: 0 });
    });
    a.p.wait(1.3);
    a.p.call(() => {
      this.fx.spr(
        { art: bakeArt(bubbleArt(good) as PixelArt), aspect: 1 },
        { follow: a.p.headTop, off: 0.2, dur: 0.7, rise: 0.4 },
      );
    });
    a.p.wait(0.55);
    a.p.call(() => {
      done(this.headAt(a.p));
      a.p.base = 'relaxed';
      if (a.p.phone) a.p.phone.visible = false;
      a.state = 'inside';
      a.t = 0;
    });
  }

  headAt(p: Person): { x: number; y: number } {
    const h = p.pos;
    return this.world.camera.project(h.x, h.y + 2.2, h.z);
  }

  byId(id: number | null): Actor | undefined {
    return id === null ? undefined : this.actors.find((a) => a.id === id && a.state !== 'gone');
  }

  /** 回复以后场景里那个人的反应 */
  react(id: number | null, kind: 'good' | 'bad' | 'meh' | 'viral' | 'boom'): void {
    const a = this.byId(id);
    if (!a) return;
    const p = a.p;
    const now = this.now;
    if (kind === 'viral') {
      this.fx.emote(p.headTop, 'star', 1.6);
      p.gesture('cheer', now, 1.2);
      this.parts.confetti(p.pos.x, p.pos.y + 1.6, p.pos.z, 40);
    } else if (kind === 'good') {
      this.fx.emote(p.headTop, 'heart', 1.4);
      p.hop(now);
    } else if (kind === 'bad') {
      this.fx.emote(p.headTop, 'anger', 1.4);
      p.gesture('shake', now, 0.9);
    } else if (kind === 'boom') {
      this.fx.emote(p.headTop, 'anger', 2);
      p.gesture('facepalm', now, 1.2);
    } else this.fx.emote(p.headTop, 'ques', 1.2);
  }

  /** 名牌（博主、回头客、Rosa），跟着人走 */
  private label(p: Person, text: string, cls: string, a?: Actor): HTMLElement {
    const el = document.createElement('div');
    el.className = `pl s-${cls}`;
    el.textContent = text;
    this.labels.append(el);
    (el as HTMLElement & { _p?: Person })._p = p;
    if (a) a.label = el;
    return el;
  }

  /** 手机上正看着的那条评论是谁写的：头顶挂个金色名牌 */
  private focusEl: HTMLElement | null = null;
  focus(id: number | null, name: string): void {
    this.focusEl?.remove();
    this.focusEl = null;
    const a = this.byId(id);
    if (!a) return;
    this.focusEl = this.label(a.p, name, 'who');
  }

  /* ---------------- 修设施 ---------------- */

  private marker(spot: Spot, text: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tg s-fix';
    b.innerHTML = `<i class="s-broom"></i><span>${text}</span><b>$25</b><em class="s-prog"><u></u></em>`;
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      b.classList.add('down');
    });
    b.addEventListener('pointerup', () => b.classList.remove('down'));
    b.addEventListener('pointerleave', () => b.classList.remove('down'));
    b.addEventListener('click', () => this.hooks.fixTap(spot));
    (b.querySelector('.s-broom') as HTMLElement).append(artCanvas(ICON_ART.broom, 2));
    this.labels.append(b);
    return b;
  }

  /** 派 Rosa 去修（钱由 main 扣） */
  startFix(spot: Spot, dur: number, done: (s: Spot) => void): void {
    this.fixing = { spot, t: 0, dur, working: false };
    this.onFixed = done;
    const stand = SPOT_FAC[spot];
    const from = site.stands.clubhouse as XZ;
    const line = site.routeLine('clubhouse', stand) ?? [from, site.stands[stand] as XZ];
    this.rosa.clearMoves();
    this.rosa.path(line, 2.4);
    this.rosa.call(() => {
      if (this.fixing) this.fixing.working = true;
    });
    this.markers[spot].classList.add('busy');
  }

  setFixed(spot: Spot, on: boolean): void {
    this.fixed[spot] = on;
    this.overlays.set(SPOT_FAC[spot], on ? FIXED_STATE[spot] : BROKEN_STATE[spot]);
    this.overlays.flush?.();
    this.world.view.invalidate();
  }

  /* ---------------- 照片 ---------------- */

  /** 屏幕上某一块（CSS 像素）的实时画面 → 画到 g（目标尺寸） */
  drawCrop(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, dw = w, dh = h): void {
    const ps = this.world.view.PS;
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#14223a';
    g.fillRect(0, 0, dw, dh);
    g.drawImage(this.world.view.canvas, (cx - w / 2) / ps, (cy - h / 2) / ps, w / ps, h / ps, 0, 0, dw, dh);
  }

  /** 评论照片的中心（话题 → 世界点 → 屏幕） */
  topicAt(topic: string): { x: number; y: number } | null {
    const P = (x: number, z: number, y = 0.5) => this.world.camera.project(x, y, z);
    switch (topic) {
      case 'sand':
        return P(ANCHORS.stadium_3.x, ANCHORS.stadium_3.z, 0.5);
      case 'fountain':
        return P(ANCHORS.plaza.x, ANCHORS.plaza.z, 1);
      case 'sunset':
        return P(ANCHORS.stadium_1.x, ANCHORS.stadium_1.z, 4);
      case 'kids': {
        const c = F_P2.w({ x: 7, z: 0 });
        return P(c.x, c.z, 1);
      }
      case 'dog': {
        const g = this.dog.g.position;
        return P(g.x, g.z, 0.5);
      }
      case 'slow':
      case 'price':
        return P(-36, -14, 3);
      case 'heat':
        return { x: 300, y: 70 };
      case 'far':
        return P(76, -16, 0);
      case 'nice':
        return P(ANCHORS.outer_23.x, ANCHORS.outer_23.z - 8, 0.5);
      default:
        return null;
    }
  }

  /** 取景框（CSS 矩形）里有什么、各值几分 */
  photoTags(r: { x: number; y: number; w: number; h: number }, minute: number): Tag[] {
    const inR = (s: { x: number; y: number }, m = 0) =>
      s.x > r.x + m && s.x < r.x + r.w - m && s.y > r.y + m && s.y < r.y + r.h - m;
    const P = (x: number, z: number, y = 0.5) => this.world.camera.project(x, y, z);
    const tags: Tag[] = [];
    const gold = minute >= 16 * 60 + 15;
    if (inR(P(ANCHORS.stadium_1.x, ANCHORS.stadium_1.z), 12))
      tags.push(gold ? { id: 'sunset', label: '日落场', pts: 4 } : { id: 'court', label: '球场', pts: 1 });
    if (this.kidsOn && this.kids.some((k) => inR(this.headAt(k), 4)))
      tags.push({ id: 'kids', label: '小朋友', pts: 3 });
    const dg = this.dog.g.position;
    if (inR(P(dg.x, dg.z), 6)) tags.push({ id: 'dog', label: '狗狗', pts: 4 });
    if (inR(P(ANCHORS.plaza.x, ANCHORS.plaza.z), 10))
      tags.push(
        this.fixed.fountain ? { id: 'fountain', label: '喷泉', pts: 2 } : { id: 'dirty', label: '脏喷泉', pts: -4 },
      );
    if (inR(P(ANCHORS.stadium_3.x, ANCHORS.stadium_3.z), 10))
      tags.push(this.fixed.sand ? { id: 'clay', label: '匹克球场', pts: 1 } : { id: 'sand', label: '沙场', pts: -5 });
    const crowd = this.actors.filter((a) => a.state !== 'gone' && inR(this.headAt(a.p))).length;
    if (crowd >= 2) tags.push({ id: 'crowd', label: '人气', pts: Math.min(2, crowd - 1) });
    return tags;
  }

  /* ---------------- 每帧 ---------------- */

  update(dt: number, now: number, minute: number): void {
    this.now = now;
    const w = this.world;
    w.camera.update(dt, null);
    const pr = w.view.proj;
    setPeopleView(pr.ang, pr.k, pr.spriteScale);

    // 小孩：11 点以后回家
    const kids = minute < 11 * 60;
    if (kids !== this.kidsOn) {
      this.kidsOn = kids;
      for (const k of this.kids) k.root.visible = kids;
      this.dale.root.visible = kids;
    }
    if (kids && this.rand() < dt * 0.8) {
      const k = this.kids[Math.floor(this.rand() * this.kids.length)];
      k?.hop(now, 0.18, 0.35);
    }
    for (const p of this.players) if (this.rand() < dt * 0.35) p.hop(now, 0.15, 0.3);

    for (const a of this.actors) this.step(a, dt, now);
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i] as Actor;
      if (a.state !== 'gone') continue;
      a.p.removed = true;
      a.p.root.parent?.remove(a.p.root);
      const j = this.peopleW.people.indexOf(a.p);
      if (j >= 0) this.peopleW.people.splice(j, 1);
      a.label?.remove();
      this.actors.splice(i, 1);
    }

    // Rosa 干活
    const f = this.fixing;
    if (f?.working) {
      f.t += dt;
      if (this.rand() < dt * 3) this.rosa.gesture('rake', now, 0.8);
      const at = this.rosa.pos;
      if (this.rand() < dt * 6)
        this.parts.dust(at.x + (this.rand() - 0.5) * 2, at.y + 0.2, at.z + (this.rand() - 0.5) * 2, 3);
      if (f.t >= f.dur) {
        this.fixing = null;
        this.setFixed(f.spot, true);
        this.parts.sparkle(at.x, at.y + 1, at.z, 24);
        this.fx.emote(this.rosa.headTop, 'thumb', 1.6);
        const back = site.routeLine(SPOT_FAC[f.spot], 'clubhouse');
        if (back) this.rosa.wait(1.2).path(back, 1.8);
        this.onFixed?.(f.spot);
      }
    }

    for (const p of [...this.peopleW.people]) p.update(dt, now);
    this.dog.update(dt, now);
    this.fx.update(now);
    this.parts.update(dt);
    this.sky.update(dt, now, 0, 0.3);
    this.daylight.update(minute, 0);
    w.render(dt, now);
    this.place();
  }

  private step(a: Actor, dt: number, now: number): void {
    a.t += dt;
    const p = a.p;
    if (a.state === 'arrive' && !p.busy()) {
      a.state = 'gate';
      a.t = 0;
      p.base = 'phoneStand';
      if (p.phone) p.phone.visible = true;
      this.fx.pop(this.hooks.rating().toFixed(1), p.headTop, { fg: '#ffd23a', dur: 1.0, rise: 0.3 });
    } else if (a.state === 'gate' && a.t > 1.1) {
      p.base = 'relaxed';
      if (p.phone) p.phone.visible = false;
      const yes = a.regular || this.hooks.decide(a);
      if (yes) {
        this.fx.emote(p.headTop, 'heart', 1.2);
        a.state = 'inside';
        a.t = 0;
        this.hooks.entered(a, this.headAt(p));
        this.walk(a, INNER[Math.floor(this.rand() * INNER.length)] as string, 1.5);
        a.onArrive?.();
      } else {
        this.fx.emote(p.headTop, 'anger', 1.3);
        p.gesture('shake', now, 0.8);
        a.state = 'turn';
        this.hooks.turned(a, this.headAt(p));
        p.wait(0.6);
        this.walk(a, 'parking', 1.8);
      }
    } else if (a.state === 'inside' && !p.busy()) {
      if (a.t > a.stay && !a.blogger) {
        a.state = 'leave';
        this.walk(a, 'parking', 1.6);
      } else if (this.rand() < dt * 0.12) {
        this.walk(a, INNER[Math.floor(this.rand() * INNER.length)] as string, 1.2 + this.rand() * 0.4);
      }
    } else if ((a.state === 'leave' || a.state === 'turn') && !p.busy()) a.state = 'gone';
  }

  /** 送走博主 */
  leave(a: Actor): void {
    a.blogger = false;
    a.stay = 0;
  }

  /** DOM 名牌、修设施的牌子跟着镜头 */
  private place(): void {
    const cam = this.world.camera;
    for (const el of this.labels.children) {
      const p = (el as HTMLElement & { _p?: Person })._p;
      if (!p) continue;
      if (p.removed) continue;
      const s = cam.project(p.pos.x, p.pos.y + 2.6, p.pos.z);
      (el as HTMLElement).style.transform =
        `translate(${Math.round(s.x)}px,${Math.round(s.y)}px) translate(-50%,-100%)`;
    }
    for (const spot of ['sand', 'fountain'] as const) {
      const b = this.markers[spot];
      const at = this.topicAt(spot);
      const show = !this.fixed[spot];
      b.hidden = !show;
      if (!show || !at) continue;
      b.style.transform = `translate(${Math.round(at.x)}px,${Math.round(at.y - 34)}px) translate(-50%,-100%)`;
      const f = this.fixing;
      b.classList.toggle('busy', !!f && f.spot === spot);
      b.classList.toggle('locked', !!f && f.spot !== spot);
      const u = b.querySelector('u') as HTMLElement;
      u.style.width = f && f.spot === spot ? `${Math.round((f.t / f.dur) * 100)}%` : '0%';
    }
  }

  setMarkersHidden(h: boolean): void {
    this.labels.classList.toggle('photo', h);
  }
}
