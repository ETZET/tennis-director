/**
 * 社交媒体 demo 的数值逻辑（只在这个 demo 里，不走 sim）：评论、回法、结果和原因、评分、粉丝、门口转化。
 * 结果尽量是确定的，由卡上看得见的东西决定（身份、脾气、照片里的问题是真是假、场上修没修好），
 * 每个结果带一句"因为"（≤ 8 个字）给玩家读。只有"怼喷子"是故意的赌一把。
 */
import type { Rand } from '@td/shared';
import type { FaceLook, Mood } from './art';

export type Kind = 'member' | 'tourist' | 'blogger' | 'troll' | 'fake';
/** 脾气：爱讲理 / 爱实惠 / 爱玩梗 / 玻璃心 */
export type Trait = 'reason' | 'thrifty' | 'meme' | 'soft';
/** 评论在说什么（照片拍的是什么） */
export type Topic =
  | 'sand'
  | 'fountain'
  | 'slow'
  | 'heat'
  | 'far'
  | 'price'
  | 'sunset'
  | 'kids'
  | 'dog'
  | 'nice'
  | 'troll'
  | 'fake';
export type Act = 'sorry' | 'explain' | 'sass' | 'cute' | 'trial' | 'report' | 'ignore' | 'expire';

export const KIND_NAME: Record<Kind, string> = {
  member: '会员',
  tourist: '游客',
  blogger: '博主',
  troll: '匿名',
  fake: '会员',
};
export const TRAIT_NAME: Record<Trait, string> = {
  reason: '爱讲理',
  thrifty: '爱实惠',
  meme: '爱玩梗',
  soft: '玻璃心',
};
export const TRAIT_ICON = { reason: 'bulb', thrifty: 'money', meme: 'music', soft: 'sweat' } as const;

/** 场景里可以修的问题 → 设施 */
export const SPOT_FAC = { sand: 'stadium_3', fountain: 'plaza' } as const;
export type Spot = keyof typeof SPOT_FAC;

/** 评分表里的一条 */
export interface Entry {
  stars: number;
  w: number;
  shill?: boolean;
}

export interface Review {
  id: number;
  kind: Kind;
  trait: Trait;
  stars: number;
  mood: Mood;
  topic: Topic;
  /** 抱怨的是真问题（照片里拍得到） */
  real: boolean;
  text: string;
  name: string;
  look: FaceLook;
  /** 博主揭穿水军 */
  expose?: boolean;
  /** 托儿：一前一后成对 */
  entry: Entry;
  patience: number;
  maxPatience: number;
  /** 场景里写评论的那个人（托儿、喷子没有） */
  personId: number | null;
  /** 发评论的地点（场里的站位名；场外为 null） */
  where: string | null;
}

export interface Outcome {
  stars: number;
  fans: number;
  cost: number;
  mood: Mood;
  /** 一句"因为"，≤ 8 个字 */
  why: string;
  tone: 'good' | 'bad' | 'meh' | 'viral' | 'boom';
  remove?: boolean;
  /** 再加几条一星 */
  extra?: number;
  /** 带来几个回头客（门口直接进） */
  regulars?: number;
  headline?: [string, string];
  /** 喷子过一会儿再来 */
  again?: boolean;
  caught?: boolean;
  wrongReport?: boolean;
}

export interface World {
  rand: Rand;
  fans: number;
  fixed: Record<Spot, boolean>;
  shill: number;
  exposed: boolean;
  disasters: number;
  day: number;
}

export const COST = { sorry: 15, trial: 20, fix: 25, shill: 60, visitor: 8 } as const;

/* ---------------- 生成评论 ---------------- */

const TEXT: Record<Topic, readonly string[]> = {
  sand: ['匹克球场全是沙', '场上沙子硌脚', '一跤摔进沙里'],
  fountain: ['喷泉绿得像汤', '喷泉一股味'],
  slow: ['前台半天没人', '等半天才开场'],
  price: ['一小时这价？', '饮料贵得离谱'],
  heat: ['太热了没法打', '中午热冒烟'],
  far: ['离市区太远了', '导航带我进沙漠'],
  sunset: ['日落场太美了', '傍晚打球绝了'],
  kids: ['小朋友课真好', '孩子不想走了'],
  dog: ['有只狗狗好萌', '狗狗陪我捡球'],
  nice: ['安静不挤，喜欢', '场地干净舒服'],
  troll: ['沙漠为啥有沙', '网球怎么是黄的', '一星，不为啥', '没有海，差评'],
  fake: ['场地裂得像地图', '服务差到离谱', '去La Quinta吧'],
};
const NAMES: Record<string, readonly string[]> = {
  member: ['老王', 'Linda', '陈姐', 'Mike', '阿May', '老周', 'Ruth', '小杜'],
  tourist: ['Tom', '小李', 'Sara', '背包客', 'Ken', 'Yuki', 'Ana'],
  troll: ['用户8848', '键盘侠007', '匿名用户'],
  fake: ['Kevin', 'Jay', 'Rex', 'Vince'],
};

const pickR = <T>(rand: Rand, a: readonly T[]): T => a[Math.floor(rand() * a.length)] as T;

export const REAL_TOPIC: Partial<Record<Topic, boolean>> = { sand: true, fountain: true, slow: true, price: true };
/** 话题 → 在哪儿写的（站位名） */
export const TOPIC_STAND: Partial<Record<Topic, string>> = {
  sand: 'stadium_3',
  fountain: 'plaza',
  sunset: 'stadium_1',
  kids: 'practice',
  slow: 'clubhouse',
  price: 'clubhouse',
  heat: 'practice',
  far: 'entrance',
  nice: 'outer_23',
};

export interface GenSpec {
  kind: Kind;
  sent?: 'bad' | 'meh' | 'good';
  topic?: Topic;
}

/** 生成一条评论（外观之后由场景里的人填） */
export function genReview(w: World, rating: number, spec: GenSpec, id: number): Review {
  const { rand } = w;
  const k = spec.kind;
  const trait: Trait = k === 'blogger' ? 'reason' : pickR(rand, ['reason', 'thrifty', 'meme', 'soft'] as const);
  const base = {
    id,
    kind: k,
    trait,
    look: { skin: '#f1c7a1', hair: '#3b2a1e', shirt: '#7a7f86' } as FaceLook,
    patience: 0,
    maxPatience: 0,
    personId: null,
    where: null,
  };
  if (k === 'blogger' && w.shill > 0 && !w.exposed && rand() < Math.min(0.9, 0.5 * w.shill + (w.day >= 4 ? 0.25 : 0)))
    return finish({
      ...base,
      stars: 1,
      topic: 'fake',
      real: true,
      text: '实锤：这家刷好评',
      name: '@网球阿杰',
      expose: true,
      mood: 'angry',
    });
  if (k === 'troll')
    return finish({
      ...base,
      stars: 1,
      topic: 'troll',
      real: false,
      text: pickR(rand, TEXT.troll),
      name: pickR(rand, NAMES.troll),
      mood: 'smug',
    });
  if (k === 'fake')
    return finish({
      ...base,
      stars: 1,
      topic: 'fake',
      real: false,
      text: pickR(rand, TEXT.fake),
      name: `${pickR(rand, ['会员', '游客'])}·${pickR(rand, NAMES.fake)}`,
      mood: 'angry',
    });
  const hp = Math.min(0.62, Math.max(0.2, 0.36 + (rating - 3.2) * 0.14));
  let sent = spec.sent;
  if (!sent) {
    const x = rand();
    sent = x < hp ? 'good' : x < hp + 0.18 ? 'meh' : 'bad';
  }
  let topic = spec.topic;
  if (!topic) {
    if (sent === 'bad') {
      const pool: Topic[] = ['slow', 'price', 'heat', 'far'];
      if (!w.fixed.sand) pool.push('sand', 'sand', 'sand');
      if (!w.fixed.fountain) pool.push('fountain', 'fountain');
      topic = pickR(rand, pool);
    } else if (sent === 'good') topic = pickR(rand, ['sunset', 'kids', 'dog', 'nice'] as const);
    else topic = pickR(rand, ['nice', 'heat', 'price'] as const);
  }
  const stars = sent === 'bad' ? (rand() < 0.6 ? 1 : 2) : sent === 'meh' ? 3 : rand() < 0.6 ? 5 : 4;
  const name = k === 'blogger' ? '@网球阿杰' : `${KIND_NAME[k]}·${pickR(rand, NAMES[k] ?? NAMES.member ?? [])}`;
  let text = pickR(rand, TEXT[topic]);
  if (sent === 'meh') text = pickR(rand, ['还行，有点旧', '教练好设施一般', '价格还能接受']);
  if (k === 'blogger')
    text = sent === 'bad' ? `${pickR(rand, TEXT[topic])}，劝退` : pickR(rand, ['宝藏球场，冲！', '日落场绝了']);
  return finish({
    ...base,
    stars,
    topic,
    real: sent === 'bad' && !!REAL_TOPIC[topic],
    text,
    name,
    mood: stars <= 2 ? 'angry' : stars === 3 ? 'meh' : 'happy',
  });
}

function finish(r: Omit<Review, 'entry'>): Review {
  return { ...r, entry: { stars: r.stars, w: r.kind === 'blogger' ? 3 : 1 } };
}

/* ---------------- 结果 ---------------- */

const fixedFor = (w: World, t: Topic): boolean => (t === 'sand' || t === 'fountain' ? w.fixed[t] : false);
const spotOf = (t: Topic): boolean => t === 'sand' || t === 'fountain';

/** 回法 → 结果。只有怼喷子看运气。 */
export function outcome(w: World, r: Review, act: Act): Outcome {
  const o: Outcome = { stars: r.stars, fans: 0, cost: 0, mood: r.mood, why: '', tone: 'meh' };
  if (act === 'sorry') o.cost = COST.sorry;
  if (act === 'trial') o.cost = COST.trial;
  const F = w.fans;
  const set = (tone: Outcome['tone'], why: string, d: Partial<Outcome> = {}) => {
    Object.assign(o, d, { tone, why });
    if (d.stars !== undefined) o.stars = Math.max(1, Math.min(5, d.stars));
    if (!d.mood)
      o.mood = tone === 'good' || tone === 'viral' ? 'happy' : tone === 'bad' || tone === 'boom' ? 'angry' : o.mood;
    return o;
  };
  const k = r.kind;
  const s = r.stars;

  if (r.expose) {
    if (act === 'sorry') return set('good', '认错比嘴硬强', { fans: Math.round(F * 0.12), stars: 2, mood: 'meh' });
    if (act === 'sass')
      return set('boom', '实锤还嘴硬', {
        fans: -Math.round(F * 0.3),
        extra: 2,
        headline: ['球会刷好评还嘴硬', '博主粉丝连夜一星'],
      });
    if (act === 'ignore' || act === 'expire') return set('bad', '装死更像心虚', { fans: -Math.round(F * 0.1) });
    return set('bad', '越描越黑', { fans: -Math.round(F * 0.15) });
  }

  if (act === 'report') {
    if (k === 'fake') return set('good', '场里没这人', { fans: 60, remove: true, mood: 'shock', caught: true });
    if (k === 'troll') return set('meh', '换个号又来', { remove: true, again: true, mood: 'smug' });
    if (k === 'blogger')
      return set('boom', '删博主＝封口', {
        fans: -Math.round(F * 0.35),
        extra: 3,
        headline: ['球会想删博主差评', '博主粉丝连夜刷一星'],
        wrongReport: true,
      });
    if (s >= 4) return set('bad', '好评也删？', { fans: -25, remove: true, mood: 'shock', wrongReport: true });
    return set('bad', '真人差评不能删', { fans: -Math.round(Math.max(30, F * 0.12)), extra: 1, wrongReport: true });
  }

  if (k === 'fake') {
    if (act === 'ignore' || act === 'expire') return set('meh', '托儿评论还挂着', { mood: 'smug' });
    if (act === 'sass') return set('meh', '托儿不接茬', { mood: 'smug' });
    if (act === 'sorry' || act === 'trial') return set('bad', '托儿不会来', { mood: 'smug' });
    return set('meh', '托儿不讲理', { mood: 'smug' });
  }

  if (k === 'troll') {
    if (act === 'ignore' || act === 'expire') return set('good', '喷子没人理就走', { mood: 'meh' });
    if (act === 'sass') {
      if (w.rand() < 0.5) return set('viral', '怼喷子赌赢了', { fans: 300, mood: 'shock' });
      return set('bad', '怼喷子赌输了', { fans: -30, extra: 2 });
    }
    if (act === 'sorry' || act === 'trial') return set('bad', '喷子白嫖成功', { again: true, mood: 'smug' });
    return set('meh', '越理越来劲', { again: true, mood: 'smug' });
  }

  const blog = k === 'blogger';
  const fixed = fixedFor(w, r.topic);

  if (blog) {
    if (s <= 2) {
      if (act === 'explain') {
        if (fixed || !r.real) return set('viral', '修好＋真诚', { fans: 1500, stars: 5 });
        return set('good', '博主喜欢真诚', { fans: 300, stars: s + 1, mood: 'meh' });
      }
      if (act === 'sorry') return set('meh', '博主不缺券', { fans: 80, stars: s + 1 });
      if (act === 'sass')
        return set('boom', '怼博主＝翻车', {
          fans: -Math.round(F * 0.4),
          extra: 3,
          headline: ['总监怼博主，翻车', '评论区一夜涌入一星'],
        });
      if (act === 'cute') return set('bad', '博主嫌尬', { fans: -60 });
      if (act === 'trial') {
        if (fixed || !spotOf(r.topic)) return set('viral', '修好再请来', { fans: 1800, stars: 5 });
        return set('boom', '没修就请＝吃沙', {
          fans: -300,
          extra: 1,
          headline: ['博主二探：又吃一嘴沙', '"这家根本没改"'],
        });
      }
      return set('bad', '博主记仇', { fans: -200, extra: 1 });
    }
    if (act === 'explain') return set('viral', '博主喜欢真诚', { fans: 900, stars: 5 });
    if (act === 'cute') return set('good', '博主转发了', { fans: 300, stars: 5 });
    if (act === 'trial') return set('viral', '合作视频', { fans: 1200, stars: 5 });
    if (act === 'sass') return set('bad', '博主：？？', { fans: -150, stars: s - 1 });
    if (act === 'sorry') return set('meh', '好评还道歉？', { fans: 20 });
    return set('meh', '博主等你回', { fans: -50 });
  }

  // 会员 / 游客
  if (s <= 2) {
    if (act === 'ignore' || act === 'expire')
      return set('bad', act === 'expire' ? '等不到回复' : '没人理我', { extra: act === 'expire' ? 1 : 0, mood: 'sad' });
    if (fixed) {
      if (act === 'trial') return set('good', '修好再请来', { stars: 5, fans: 20, regulars: 2 });
      if (act === 'sass') return set('bad', '修好了也别怼', { fans: -20, stars: 1 });
      if (act === 'explain') return set('good', '已经修好了', { stars: s + 3, fans: 10 });
      return set('good', '已经修好了', { stars: s + 2, fans: 10 });
    }
    if (r.real) {
      if (act === 'sorry')
        return r.trait === 'thrifty'
          ? set('good', '爱实惠，券真香', { stars: s + 3, fans: 15 })
          : set('good', '真问题要认错', { stars: s + 2, fans: 10 });
      if (act === 'explain')
        return r.trait === 'reason'
          ? set('good', '爱讲理听得进', { stars: s + 1, mood: 'meh' })
          : set('bad', '真问题别找借口', { mood: 'angry' });
      if (act === 'sass') {
        if (r.trait === 'meme') return set('good', '爱玩梗接住了', { stars: s + 1, fans: 30 });
        if (r.trait === 'soft') return set('bad', '玻璃心被怼哭', { fans: -40, extra: 2, mood: 'sad' });
        return set('bad', '真问题还怼？', { fans: -20, extra: 1 });
      }
      if (act === 'cute') {
        if (r.trait === 'meme' || r.trait === 'soft')
          return set('good', r.trait === 'soft' ? '玻璃心被哄好' : '爱玩梗', { stars: s + 1 });
        return set('meh', '尬了', { mood: 'meh' });
      }
      // 体验课
      if (spotOf(r.topic)) return set('bad', '没修就请来', { stars: 1, extra: 1 });
      if (k === 'tourist') return set('good', '来了就改观', { stars: s + 2, regulars: 1 });
      return set('good', '会员给面子', { stars: s + 1 });
    }
    // 瞎说的抱怨（太热、太远）
    if (act === 'explain') return set('good', '瞎说的讲清楚', { stars: s + 2, fans: 10 });
    if (act === 'sorry') return set('meh', '没必要赔钱', { stars: s + 1 });
    if (act === 'sass')
      return r.trait === 'meme'
        ? set('good', '爱玩梗怼得妙', { stars: s + 1, fans: 40 })
        : set('bad', '没必要怼', { fans: -15 });
    if (act === 'cute')
      return r.trait === 'meme' || r.trait === 'soft'
        ? set('good', '哄一哄就好', { stars: s + 1 })
        : set('meh', '尬了', { mood: 'meh' });
    if (k === 'tourist') return set('good', '来了就知道', { stars: s + 2, regulars: 1 });
    return set('good', '会员给面子', { stars: s + 1 });
  }
  if (s === 3) {
    if (act === 'ignore' || act === 'expire') return set('meh', '没人回', {});
    if (act === 'sorry') return set('good', '客气了', { stars: 4, fans: 5 });
    if (act === 'explain')
      return r.trait === 'reason' ? set('good', '爱讲理', { stars: 4, fans: 5 }) : set('meh', '嗯', { mood: 'meh' });
    if (act === 'cute')
      return r.trait === 'meme' || r.trait === 'soft'
        ? set('good', '被萌到', { stars: 4, fans: 15 })
        : set('meh', '……', { mood: 'meh' });
    if (act === 'sass') return set('bad', '这总监有病', { stars: 1, fans: -15 });
    return k === 'tourist'
      ? set('good', '带朋友来', { stars: 5, fans: 15, regulars: 2 })
      : set('good', '谢谢，4星', { stars: 4, fans: 10 });
  }
  // 好评
  if (act === 'ignore' || act === 'expire') return set('meh', '点了个赞', { mood: 'happy' });
  if (act === 'cute') return set('good', '好评区卖萌', { stars: 5, fans: 40 });
  if (act === 'explain') return set('good', '客气啦', { fans: 15 });
  if (act === 'sorry') return set('meh', '好评还道歉？', { fans: 3, mood: 'shock' });
  if (act === 'sass')
    return r.trait === 'meme'
      ? set('good', '总监好皮', { fans: 50 })
      : set('bad', '好评也怼？', { stars: s - 2, fans: -10 });
  return set('good', '带朋友来', { stars: 5, fans: 25, regulars: 2 });
}

/* ---------------- 评分、门口、照片 ---------------- */

export function ratingOf(entries: readonly Entry[]): number {
  let s = 0;
  let w = 0;
  for (const e of entries) {
    s += e.stars * e.w;
    w += e.w;
  }
  return w ? s / w : 0;
}

/** 评分 → 门口看了手机进门的概率 */
export const convOf = (rating: number): number => Math.max(0.05, Math.min(0.97, (rating - 2.1) / 2.3));
/** 粉丝、热度 → 每秒来多少人 */
export const arriveRate = (fans: number, heat: number): number => Math.min(0.32, 0.09 + fans / 6000) * (1 + heat);

/** 照片里的一样东西 */
export interface Tag {
  id: string;
  label: string;
  pts: number;
}

export interface Title {
  title: string;
  line: string;
}

export interface Stats {
  caught: number;
  wrongReports: number;
  viral: number;
  disasters: number;
  coupons: number;
  trials: number;
  posts: number;
  best: number;
  replies: number;
  sass: number;
  ignores: number;
  fixes: number;
  visitors: number;
  turned: number;
}

export function endTitle(st: Stats, shill: number, exposed: boolean, rating: number, fans: number): Title {
  if (shill > 0)
    return exposed
      ? { title: '水军头子', line: '刷来的五星，一夜还回去' }
      : { title: '水军头子', line: '没被扒，但你心里清楚' };
  if (st.disasters >= 2) return { title: '公关灾难', line: '沙漠日报的老熟人' };
  if (st.viral >= 2 && fans >= 1500) return { title: '网红总监', line: '你的回复比球场还火' };
  if (st.caught >= 2) return { title: '火眼金睛', line: 'La Quinta 的托儿怕了你' };
  if (st.fixes >= 2 && rating >= 3.8) return { title: '实干总监', line: '差评说的，你都修了' };
  if (st.coupons >= 5) return { title: '赔笑总监', line: '券发得比球还多' };
  if (st.sass >= 4) return { title: '嘴快总监', line: '每条都要怼回去' };
  if (st.posts >= 3 && st.best >= 7) return { title: '流量总监', line: '镜头里全是日落和狗' };
  if (rating >= 4) return { title: '口碑总监', line: '慢慢回，回得对' };
  return { title: '佛系总监', line: '评论区随它去吧' };
}
