// 换装：把一个已经建好的 Q 版人（clubsite/people 的 player / coach / kid / ball-kid / umpire / director，或者场景自己用 rig 建的人）
// 按 CastLook 换成另一个人的样子 —— 不重建骨骼：场景的演出手里拿着这个对象，姿势、道具、坐、拿工具照常。
//
// ── 用法 ──
//   const dresser = createDresser({ mats, scheme });   // mats = 场景的原始 Mats（不是 schemeMats 包过的），scheme = 配色方案（null = 原配色）
//   dresser.dress(person, look);                       // 可以对同一个人反复 dress（换天时同一个位置换人）：结果和第一次直接 dress 成这样一样
//   dresser.undress(person);                           // 回到场景原来的样子
//
// ── 怎么认部件 ──
//   rig.ts / legs.ts 给每个身体网格写了 userData.part（rig.ts 的 PartTag）。第一次 dress 时把这些网格的材质、几何体、可见性记下来（快照），
//   之后每次 dress = 先回到快照，再按 look 换材质 / 换几何体 / 藏起来；rig 没有的部件（新发型、帽子、眼镜、络腮胡、滚边、膝盖腿的短裤套）
//   由这里建"自己的网格"挂到对应的骨骼上（userData.part = 'dress:<名字>'），只建一次、以后复用 → 反复 dress 网格数不涨。
//   腿的直腿胶囊、鞋、膝盖腿的可见性归 person.ts 的 knees.show 管（坐下换膝盖腿），这里只换它们的材质和几何体。
//
// ── 颜色 ──
//   cast/colors.ts 的三档色阶 + 人物的明暗参数（PERSON）走 mats.toon；有配色方案时过 schemeOpts —— 按原来的人物色分组借名字
//   （肤色 = skinLight、头发 = hair、暖色 / 白衣服 = clothWhite、冷色衣服 = clothBlue），金光方案下和场景里原来的人一个调子。
//   同色同参数 mats.toon 自己复用同一个材质；这里再按 (色阶, 用途) 缓存一层，dress 不 new 材质。
//
// ── 规则 ──
//   身高 look.height 只给大人（root.scale × height，以第一次 dress 时场景摆的 scale 为基准）；孩子、少年、裁判（坐高椅）不改。
//   body 和对象的种类不一致时以对象为准（不会把大人改成孩子）。眼睛永远是 colors.ts 的 EYE。
//   keep：这些部位保留场景原样（shirt 连袖子；bottom 连腿的粗细；hat = 原来的帽子留着、look.hat 不画；whistle 只有 keep 才留）。
import * as THREE from 'three';
import { CLOTH, EYE, HAIR, type Ramp3, SKIN } from '../cast/colors';
import type { CastLook, Cloth, HairColor, Hat, SkinTone } from '../cast/types';
import type { Pal } from '../render/palette';
import { type Scheme, schemeOpts } from '../render/palettes';
import type { Mats, ToonOpts } from '../render/toon';
import {
  bottomGeo,
  buzzShell,
  cuffGeo,
  eyesGeo,
  facialGeo,
  glassesGeo,
  hairExtra,
  hatGeo,
  legGeo,
  shadesGeo,
  shinGeo,
  strawBand,
  thighCoverGeo,
  thighGeo,
  torsoGeo,
  trimGeo,
  whistleGeo,
} from './dress-geo';
import { PERSON } from './props';
import type { PartTag } from './rig/rig';

type Mat = THREE.Material;
type Geo = THREE.BufferGeometry;
type Mesh = THREE.Mesh;
type BottomKind = CastLook['bottomKind'];
type KeepPart = NonNullable<CastLook['keep']>[number];

export interface Dresser {
  /** 按 look 换装（同一个对象可以反复调） */
  dress(obj: THREE.Object3D, look: CastLook): void;
  /** 回到场景原来的样子 */
  undress?(obj: THREE.Object3D): void;
}

/** 每个人"自己的网格"的名字（最多这几个，按需建） */
type OwnKey = 'hair' | 'hat' | 'band' | 'face' | 'frame' | 'facial' | 'trim' | 'cuffR' | 'cuffL' | 'coverR' | 'coverL';

interface Snap {
  mesh: Mesh;
  mat: Mat | Mat[];
  geo: Geo;
  vis: boolean;
}

interface State {
  root: THREE.Object3D;
  parts: Map<PartTag, Mesh[]>;
  snap: Snap[];
  baseScale: THREE.Vector3;
  /** 大人（身高可调） */
  adult: boolean;
  /** 头的部件挂在哪（rig 的 tilt 组；戴草帽的总监是 head 自己） */
  head: THREE.Object3D;
  /** head 是 rig 的后仰组（草帽要扳回水平） */
  tilted: boolean;
  torso: THREE.Object3D | null;
  /** 两只手臂的肩组（袖子的父级），右在前 */
  arms: THREE.Object3D[];
  /** 膝盖腿的 alt 组（大腿的父级）：右、左 */
  alts: THREE.Object3D[];
  own: Partial<Record<OwnKey, Mesh>>;
  orig: {
    skin: Mat;
    hand: Mat | null;
    kind: BottomKind;
    hat: 'cap' | 'straw' | null;
  };
}

const VIS_TAGS: PartTag[] = [
  'hair-shell',
  'fringe',
  'eye',
  'shades',
  'mustache',
  'pony',
  'cap',
  'bill',
  'straw-brim',
  'straw-band',
  'straw-crown',
  'straw-top',
  'trim',
  'whistle',
  'thigh-cover',
];

/** 冷色衣服跟 club 组调色（同 palettes/index.ts 的 clothBlue / clothTeal / clothPurple），其余跟 people 组 */
const COOL: ReadonlySet<Cloth> = new Set<Cloth>(['teal', 'sky', 'blue', 'navy', 'purple', 'lavender', 'green']);

/** 人物材质的参数：palette-base 的人物色（edge 0.7 → PERSON 盖成 0.45、convex 0.4）+ PERSON */
const BODY: ToonOpts = { edge: 0.45, convex: 0.4, ...PERSON };
const HAIR_O: ToonOpts = { ...PERSON, edge: 0.25, convex: 0 };
const SHADES_O: ToonOpts = { ...PERSON, edge: 0.3, convex: 0.4 };
/** 草帽（同 rig/director.ts 的 straw：palette edge 0.7、convex 0.6，亮一点的档位） */
const STRAW_O: ToonOpts = { lightUp: 0.6, bands: [-0.3, 0.45], noShadowReceive: true, edge: 0.7, convex: 0.6 };
/** 帽子：同衣服，但顶面亮档多一点（45° 俯视下帽子就是头，要跳出来） */
const HAT_O: ToonOpts = { ...BODY, lightUp: 0.55, bands: [-0.35, 0.4] };

const states = new WeakMap<THREE.Object3D, State>();

/** 一个人的部件表（第一次 dress 时建，之后复用）；不是 rig 的人 → null */
function stateOf(obj: THREE.Object3D): State | null {
  const had = states.get(obj);
  if (had) return had;
  const parts = new Map<PartTag, Mesh[]>();
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      // 别的人（拿在手里的？）不算
      if (c.userData.isPerson || c.userData.personKind) continue;
      const tag = c.userData.part as PartTag | undefined;
      if (tag && (c as Mesh).isMesh) {
        const arr = parts.get(tag) ?? [];
        arr.push(c as Mesh);
        parts.set(tag, arr);
      }
      walk(c);
    }
  };
  walk(obj);
  const headMesh = parts.get('skin-head')?.[0];
  if (!headMesh?.parent) return null;
  const snap: Snap[] = [];
  for (const arr of parts.values())
    for (const m of arr) snap.push({ mesh: m, mat: m.material, geo: m.geometry, vis: m.visible });
  const first = (t: PartTag) => parts.get(t)?.[0] ?? null;
  const kind = (obj.userData.personKind as string | undefined) ?? '';
  const adult = kind !== 'kid' && kind !== 'ball-kid' && kind !== 'umpire' && !obj.userData.strideK;
  const bottom = first('bottom');
  const leg = first('leg');
  const botP = (bottom?.geometry as THREE.CylinderGeometry | undefined)?.parameters;
  const origKind: BottomKind =
    bottom && leg && leg.material === bottom.material ? 'pants' : botP && botP.radiusBottom > 0.3 ? 'skirt' : 'shorts';
  const st: State = {
    root: obj,
    parts,
    snap,
    baseScale: obj.scale.clone(),
    adult,
    head: headMesh.parent,
    tilted: headMesh.parent.userData.part === 'tilt',
    torso: first('shirt')?.parent ?? null,
    arms: (parts.get('sleeve') ?? []).map((m) => m.parent!).filter(Boolean),
    alts: (parts.get('thigh') ?? []).map((m) => m.parent!).filter(Boolean),
    own: {},
    orig: {
      skin: headMesh.material as Mat,
      hand: (first('hand')?.material as Mat | undefined) ?? null,
      kind: origKind,
      hat: parts.has('straw-brim') ? 'straw' : parts.has('cap') ? 'cap' : null,
    },
  };
  states.set(obj, st);
  return st;
}

function restore(st: State) {
  for (const s of st.snap) {
    s.mesh.material = s.mat;
    s.mesh.geometry = s.geo;
    const tag = s.mesh.userData.part as PartTag;
    if (VIS_TAGS.includes(tag)) s.mesh.visible = s.vis;
  }
  for (const m of Object.values(st.own)) if (m) m.visible = false;
  st.root.scale.copy(st.baseScale);
}

const mix = (a: Ramp3, b: Ramp3, t: number): Ramp3 =>
  a.map((c, i) => new THREE.Color(c).lerp(new THREE.Color(b[i]), t).getHex()) as unknown as Ramp3;

export function createDresser(o: { mats: Mats; scheme: Scheme | null }): Dresser {
  const { mats, scheme } = o;
  const matCache = new Map<string, Mat>();
  /** 色阶材质：ramp + 参数，按 key（人物色的分组）过配色方案 */
  const toon = (id: string, ramp: Ramp3, extra: ToonOpts, key: keyof Pal): Mat => {
    let m = matCache.get(id);
    if (!m) {
      const opts: ToonOpts = { ramp: [ramp[0], ramp[1], ramp[2]], ...extra };
      m = mats.toon(0xffffff, scheme ? schemeOpts(scheme, key, opts) : opts);
      matCache.set(id, m);
    }
    return m;
  };
  const skinMat = (s: SkinTone) => toon(`skin:${s}`, SKIN[s], BODY, 'skinLight');
  const clothMat = (c: Cloth, extra: ToonOpts = BODY, tag = 'b') =>
    toon(`cloth:${c}:${tag}`, CLOTH[c], extra, COOL.has(c) ? 'clothBlue' : 'clothWhite');
  const hairMat = (h: HairColor) => toon(`hair:${h}`, HAIR[h], HAIR_O, 'hair');
  /** 寸头：发色混 25% 肤色（发茬透出头皮），和短发分得开 */
  const buzzMat = (h: HairColor, s: SkinTone) => toon(`buzz:${h}:${s}`, mix(HAIR[h], SKIN[s], 0.25), HAIR_O, 'hair');
  const eyeMat = () => toon('eye', EYE, HAIR_O, 'hair');
  const shadesMat = () => toon('shades', EYE, SHADES_O, 'hair');
  /** 眼镜框：浅灰（眼睛外面一圈亮一点的边，中间透出深色的眼睛；和一整条深色的太阳镜分得开） */
  const frameMat = () => toon('frame', CLOTH.gray, { ...SHADES_O, edge: 0.2, convex: 0.6 }, 'clothWhite');
  const hatMat = (h: Hat) =>
    h.kind === 'straw' ? toon(`straw:${h.color}`, CLOTH[h.color], STRAW_O, 'straw') : clothMat(h.color, HAT_O, 'hat');
  const bandMat = () => toon('band', HAIR.darkBrown, HAIR_O, 'hair');

  /** 自己的网格：第一次要的时候建（挂到 parent），之后复用；每次 dress 先全藏起来 */
  const own = (st: State, key: OwnKey, parent: THREE.Object3D, geo: Geo, mat: Mat): Mesh => {
    let m = st.own[key];
    if (!m) {
      m = new THREE.Mesh(geo, mat);
      m.name = `dress:${key}`;
      m.userData.part = `dress:${key}`;
      parent.add(m);
      mats.prepare(m);
      st.own[key] = m;
    }
    m.geometry = geo;
    m.material = mat;
    m.visible = true;
    return m;
  };

  const each = (st: State, tag: PartTag, f: (m: Mesh, i: number) => void) => st.parts.get(tag)?.forEach(f);

  function dress(obj: THREE.Object3D, look: CastLook) {
    const st = stateOf(obj);
    if (!st) return;
    restore(st);
    const keep = new Set<KeepPart>(look.keep ?? []);
    const stout = THREE.MathUtils.clamp(look.stout ?? 1, 0.9, 1.32);

    // ── 身高（只给大人）──
    if (st.adult) {
      const h = THREE.MathUtils.clamp(look.height ?? 1, 0.9, 1.1);
      st.root.scale.copy(st.baseScale).multiplyScalar(h);
    }

    // ── 皮肤 ──
    const skin = skinMat(look.skin);
    each(st, 'skin-head', (m) => (m.material = skin));
    const gloves = st.orig.hand && st.orig.hand !== st.orig.skin && keep.has('shirt');
    if (!gloves) each(st, 'hand', (m) => (m.material = skin));

    // ── 上衣 ──
    const shirtMat = keep.has('shirt') ? ((st.parts.get('shirt')?.[0]?.material as Mat) ?? skin) : clothMat(look.shirt);
    each(st, 'shirt', (m) => {
      m.material = shirtMat;
      m.geometry = torsoGeo(stout);
    });
    each(st, 'sleeve', (m) => (m.material = shirtMat));
    each(st, 'forearm', (m) => (m.material = look.longSleeves ? shirtMat : skin));
    // 哨子：只有 keep 才留（跟着胸口）
    each(st, 'whistle', (m) => {
      m.visible = keep.has('whistle');
      m.geometry = whistleGeo(stout);
    });
    // 滚边：keep = 原样；有 trim → rig 有就换色，没有就加（领口 + 下摆一个网格、两个袖口）；没有 trim → 藏
    const trims = st.parts.get('trim') ?? [];
    const bodyTrims = trims.filter((m) => m.parent === st.torso);
    if (keep.has('trim')) {
      bodyTrims.forEach((m, i) => {
        m.geometry = trimGeo(stout, i === 0 ? 0 : 1);
      });
    } else if (look.trim) {
      const tm = clothMat(look.trim);
      if (trims.length) {
        for (const m of trims) {
          m.material = tm;
          m.visible = true;
        }
        bodyTrims.forEach((m, i) => {
          m.geometry = trimGeo(stout, i === 0 ? 0 : 1);
        });
      } else if (st.torso) {
        own(st, 'trim', st.torso, trimGeo(stout, 2), tm);
        st.arms.forEach((a, i) => {
          own(st, i === 0 ? 'cuffR' : 'cuffL', a, cuffGeo(), tm);
        });
      }
    } else {
      for (const m of trims) m.visible = false;
    }

    // ── 下装、腿、鞋 ──
    const kind: BottomKind = keep.has('bottom') ? st.orig.kind : look.bottomKind;
    const bottomMat = keep.has('bottom') ? (st.parts.get('bottom')?.[0]?.material as Mat) : clothMat(look.bottom);
    const legMat = kind === 'pants' ? bottomMat : skin;
    const sameLegs = kind === st.orig.kind;
    if (!keep.has('bottom')) each(st, 'bottom', (m) => (m.geometry = bottomGeo(kind, stout)));
    each(st, 'bottom', (m) => (m.material = bottomMat));
    each(st, 'leg', (m) => {
      m.material = legMat;
      if (!sameLegs) m.geometry = legGeo(kind);
    });
    each(st, 'thigh', (m) => {
      m.material = legMat;
      if (!sameLegs) m.geometry = thighGeo(kind);
    });
    each(st, 'shin', (m) => {
      m.material = legMat;
      if (!sameLegs) m.geometry = shinGeo(kind);
    });
    if (kind === 'pants') {
      each(st, 'thigh-cover', (m) => (m.visible = false));
    } else {
      const covers = st.parts.get('thigh-cover') ?? [];
      if (covers.length) {
        for (const m of covers) {
          m.material = bottomMat;
          if (!sameLegs) m.geometry = thighCoverGeo(kind);
        }
      } else {
        st.alts.forEach((a, i) => {
          own(st, i === 0 ? 'coverR' : 'coverL', a, thighCoverGeo(kind), bottomMat);
        });
      }
    }
    if (!keep.has('shoes')) {
      const sm = clothMat(look.shoes);
      each(st, 'shoe', (m) => (m.material = sm));
    }

    // ── 帽子 ──
    let hatKind: Hat['kind'] | null;
    if (keep.has('hat')) {
      hatKind = st.orig.hat;
    } else {
      for (const t of ['cap', 'bill', 'straw-brim', 'straw-band', 'straw-crown', 'straw-top'] as PartTag[])
        each(st, t, (m) => (m.visible = false));
      hatKind = look.hat?.kind ?? null;
      if (look.hat) {
        const hm = own(st, 'hat', st.head, hatGeo(look.hat.kind), hatMat(look.hat));
        const straw = look.hat.kind === 'straw';
        if (straw) own(st, 'band', st.head, strawBand(), bandMat());
        // 草帽同总监的：不跟头往后仰（帽檐是平的）—— 抵掉 tilt 的变换；别的帽子跟着脸走
        for (const m of straw ? [hm, st.own.band!] : [hm]) {
          if (straw && st.tilted) {
            const inv = new THREE.Matrix4().compose(st.head.position, st.head.quaternion, new THREE.Vector3(1, 1, 1));
            inv.invert().decompose(m.position, m.quaternion, m.scale);
          } else {
            m.position.set(0, 0, 0);
            m.quaternion.identity();
            m.scale.set(1, 1, 1);
          }
        }
      }
    }
    // 盖住头顶的帽子：发髻放低、卷发只留下面一圈
    const hatted = hatKind === 'cap' || hatKind === 'bucket' || hatKind === 'straw' || hatKind === 'visor';

    // ── 头发 ──
    const hm = hairMat(look.hair);
    const style = look.hairStyle;
    each(st, 'hair-shell', (m) => {
      m.visible = style !== 'bald';
      if (style === 'buzz') {
        m.geometry = buzzShell();
        m.material = buzzMat(look.hair, look.skin);
      } else m.material = hm;
    });
    each(st, 'fringe', (m) => {
      m.visible = style !== 'bald' && style !== 'buzz';
      m.material = hm;
    });
    each(st, 'pony', (m) => (m.visible = false));
    const extra = hairExtra(style, hatted);
    if (extra) own(st, 'hair', st.head, extra, hm);

    // ── 脸：眼睛 / 太阳镜 / 眼镜，胡子 ──
    const eyes = st.parts.get('eye') ?? [];
    const shades = st.parts.get('shades') ?? [];
    for (const m of [...eyes, ...shades]) m.visible = false;
    if (look.eyes === 'shades') {
      if (shades.length)
        for (const m of shades) {
          m.visible = true;
          m.material = shadesMat();
        }
      else own(st, 'face', st.head, shadesGeo(), shadesMat());
    } else {
      if (eyes.length)
        for (const m of eyes) {
          m.visible = true;
          m.material = eyeMat();
        }
      else own(st, 'face', st.head, eyesGeo(), eyeMat());
      if (look.eyes === 'glasses') own(st, 'frame', st.head, glassesGeo(), frameMat());
    }
    each(st, 'mustache', (m) => (m.visible = false));
    if (look.facial) {
      const orig = st.parts.get('mustache')?.[0];
      if (look.facial === 'mustache' && orig) {
        orig.visible = true;
        orig.material = hm;
      } else own(st, 'facial', st.head, facialGeo(look.facial), hm);
    }
  }

  function undress(obj: THREE.Object3D) {
    const st = states.get(obj);
    if (st) restore(st);
  }

  return { dress, undress };
}

/** 调试 / 测试：这个人身上 dress 加过的网格数 */
export function ownMeshCount(obj: THREE.Object3D): number {
  const st = states.get(obj);
  return st ? Object.values(st.own).filter(Boolean).length : 0;
}
