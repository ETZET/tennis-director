import type { activities } from '@td/render';

/**
 * 动画库的说明文字：每个活动在当前条件下的"效果"读数、场地专属桥段、分类介绍。
 * 这些是给美术和策划看的开发工具文字（中文），不进游戏，所以写在 sandbox 里。
 */

type Conditions = activities.Conditions;
type ParamValue = activities.ParamValue;
type Category = activities.Category;

export interface FxLine {
  t: string;
  warn?: boolean;
}

interface V {
  f: number;
  wx: Conditions['weather'];
  c: number;
  heat: boolean;
  p: Readonly<Record<string, ParamValue>>;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function fLine(V: V, who = '球员'): FxLine {
  const extra = V.heat ? '（含酷热 +22%）' : '';
  const s = `疲劳 ${pct(V.f)}${extra}：`;
  if (V.f >= 0.85) return { t: `${s}${who}随时可能累倒，需要教练照看`, warn: true };
  if (V.f >= 0.5) return { t: `${s}动作变慢、失误变多、频繁喘气出汗`, warn: true };
  if (V.f < 0.2) return { t: `${s}精力充沛，移动快、失误少` };
  return { t: `${s}正常状态` };
}

const WX_DEFAULT: Record<Conditions['weather'], string> = {
  sun: '晴天：最佳条件，无额外影响',
  cloud: '多云：光线变暗，无额外影响',
  rain: '雨天：地面湿滑容易摔倒，落地溅水',
  wind: '大风：球和杂物被吹偏，失误增加',
  heat: '酷热：疲劳额外 +22%，需要补水降温',
};
function wLine(V: V, m: Partial<Record<Conditions['weather'], string>> = {}): FxLine {
  return { t: m[V.wx] ?? WX_DEFAULT[V.wx], warn: V.wx !== 'sun' && V.wx !== 'cloud' };
}
function cLine(V: V, arr: readonly string[]): FxLine {
  return { t: `教练 ${'★'.repeat(V.c)}：${arr[V.c - 1] ?? ''}`, warn: V.c <= 2 };
}
const n = (V: V, k: string) => Number(V.p[k] ?? 0);

const EFFECTS: Record<string, (V: V) => FxLine[]> = {
  feed: (V) => [
    { t: `球员 ${n(V, 'players')} 人：每 6 球换一个人上来，其他人在场边排队` },
    fLine(V),
    wLine(V, {
      rain: '雨天：追球时可能滑倒，落点溅水',
      wind: '大风：球路被吹偏，击球失误 +8%',
      heat: '酷热：每 6 球要去补水、往头上浇水',
    }),
    cLine(V, ['经常玩手机走神，喂球不稳', '偶尔喂歪', '喂球稳定', '经常鼓励、指出动作要点', '节奏精准，球员持续进步']),
  ],
  serve: (V) => [
    fLine(V, '发球手'),
    wLine(V, { wind: '大风：命中率 −12%，球路明显偏移', rain: '雨天：命中率 −5%，落地溅水' }),
    cLine(V, ['在旁边玩手机', '偶尔分心', '中规中矩', '每 5 球亲自示范一次', '示范 + 球速明显更快']),
  ],
  sprint: (V) => [
    fLine(V),
    wLine(V, {
      rain: '雨天：绕桩转身容易滑倒',
      wind: '大风：教练帽子会被吹飞，追着跑',
      heat: '酷热：冲线后往头上浇水',
    }),
    cLine(V, ['发令慢半拍，忘了计时', '偶尔迟到', '正常发令', '全程喊"加油"，报成绩', '报成绩，常出新纪录']),
  ],
  tryout: (V) => [
    { t: `报名人数 ${n(V, 'n')}：队伍越长，越可能出现天才苗子` },
    fLine(V, '考生'),
    wLine(V, {
      rain: '雨天：评委撑起遮阳伞，场地溅水',
      wind: '大风：评委桌上的纸被吹飞',
      heat: '酷热：评委撑伞，考生更容易累',
    }),
    cLine(V, ['评委打瞌睡，常看走眼', '打分偏差大', '打分大致准确', '评分准，能发现好苗子', '一眼识别天才']),
  ],
  fair: (V) => [
    {
      t: `${['预算低：一张折叠桌和手写纸牌', '预算中：帐篷、横幅和气球', '预算高：充气拱门、吉祥物跳舞和音响'][n(V, 'tier') - 1] ?? ''}，越高越吸引学生`,
    },
    fLine(V, '表演队员'),
    wLine(V, {
      rain: '雨天：路过的学生变少、都打着伞',
      wind: '大风：传单被吹飞，工作人员去追',
      heat: '酷热：学生变少，走得更慢',
    }),
    cLine(V, ['表演常失手砸到头', '表演不稳', '表演一般', '表演好看，围观更多', '表演精彩，报名率高']),
  ],
  openday: (V) => [
    { t: `家庭数 ${n(V, 'n')}：排队的小朋友越多，场面越热闹` },
    V.f < 0.3
      ? { t: `疲劳 ${pct(V.f)}：小朋友精力旺盛，排队时绕圈疯跑` }
      : V.f > 0.6
        ? { t: `疲劳 ${pct(V.f)}：小朋友没精神，坐在地上打哈欠`, warn: true }
        : { t: `疲劳 ${pct(V.f)}：小朋友正常排队` },
    wLine(V, { rain: '雨天：家长撑伞，小朋友去踩水坑', wind: '大风：红球被吹得乱飘', heat: '酷热：家长一直扇风' }),
    cLine(V, [
      '不耐烦，孩子容易哭、家长生气',
      '耐心不足',
      '正常教学',
      '耐心鼓励，报名更多',
      '孩子玩得超开心，几乎都报名',
    ]),
  ],
  match: (V) => {
    const tier = n(V, 'tier');
    const diff = n(V, 'diff');
    return [
      {
        t: `${['校内友谊赛', '地区赛', '州级赛', '全国赛'][tier - 1]}：${['几位家长坐折叠椅，手翻记分牌', '小看台、主裁判、横幅', '两侧看台、球童、电子记分牌、转播机位', '满座看台、人浪、摄影记者闪光灯'][tier - 1]}`,
      },
      {
        t: `实力对比：${['明显更弱', '略弱', '势均力敌', '略强', '明显更强'][diff + 2]}，影响每拍的失误率和制胜分概率`,
        warn: diff < 0,
      },
      V.p.finale === 'none'
        ? { t: '终局：不演胜负，打满一盘比分清零接着打（游戏里结果由模拟决定）' }
        : { t: '终局：演胜负和颁奖' },
      fLine(V, '我方球员'),
      wLine(V, {
        rain: '雨天：每 5 分雨停一次，球员躲雨',
        wind: '大风：失误增加，旗帜飘动',
        heat: '酷热：每 6 分换边休息、喝水降温',
      }),
      cLine(V, ['几乎没有指导，关键分更紧张', '临场指挥弱', '正常', '关键分更稳', '关键分几乎不会手软']),
    ];
  },
  pickleball: (V) => [
    { t: n(V, 'players') === 2 ? '单打：两个人满场跑' : '双打：四个人守在厨房线前轻吊' },
    fLine(V, '匹克球手'),
    wLine(V, { wind: '大风：轻吊被吹飞，失误 +8%', heat: '酷热：每 5 分大家扇扇风' }),
  ],
  bbq: (V) => [
    {
      t:
        ['预算低：小烤炉 + 一张桌子', '预算中：大烤架、冷饮箱、两张桌子', '预算高：长桌大餐、气球拱门、音响音乐'][
          n(V, 'tier') - 1
        ] ?? '',
    },
    V.f > 0.5
      ? { t: `疲劳 ${pct(V.f)}：更多人躺在草地上午睡` }
      : { t: `疲劳 ${pct(V.f)}：精神好，还会绕着桌子追逐打闹` },
    wLine(V, {
      rain: '雨天：大家挤进帐篷，飞盘取消',
      wind: '大风：纸盘子被吹飞，飞盘会卡到树上',
      heat: '酷热：飞盘换成水球大战',
    }),
    cLine(V, ['烤糊率很高，经常被熏黑', '常烤糊', '偶尔烤糊', '手艺不错', '完美肉饼，人人点赞']),
  ],
  tug: (V) => [
    V.p.result === 'auto'
      ? { t: '结果：按力气和节奏随机' }
      : { t: `结果：固定${V.p.result === 'win' ? '赢' : '输'}（游戏里由模拟决定）` },
    fLine(V, '我方队员'),
    wLine(V, {
      rain: '雨天：中间是泥坑，输的人摔进泥里',
      wind: '大风：裁判帽子被吹飞',
      heat: '酷热：额外疲劳，出汗更多',
    }),
    cLine(V, ['口号乱喊，没有节奏', '节奏不稳', '有节奏地带喊', '节奏有力，爆发更强', '完美同步，一波一波地拉']),
  ],
  cleanup: (V) => [
    V.p.crew === 'pros'
      ? { t: '外包施工队：荧光背心、安全帽，干得快、不喘气，也不聊天' }
      : { t: `义工 ${n(V, 'n')} 人：边干边聊，累了会喘气、去补水` },
    fLine(V, '义工'),
    wLine(V, {
      rain: '雨天：弯腰捡东西会滑倒，一身泥',
      wind: '大风：倒进垃圾箱的纸又吹回来',
      heat: '酷热：更常停下来补水',
    }),
    cLine(V, ['带队的随便弄弄', '不太上心', '正常指挥', '到处指点、鼓劲', '大家干得特别起劲']),
  ],
};

export function effectsFor(id: string, C: Conditions, p: Readonly<Record<string, ParamValue>>): FxLine[] {
  const f = Math.min(1, C.fatigue + (C.weather === 'heat' ? 0.22 : 0));
  const V: V = { f, wx: C.weather, c: C.coach, heat: C.weather === 'heat', p };
  return EFFECTS[id]?.(V) ?? [];
}

export const VENUE_NAMES: Record<Conditions['venue'], string> = {
  generic: '通用',
  maple: '枫岭高中',
  hollow: 'Hollow Creek',
};

export const WEATHER_NAMES: Record<Conditions['weather'], string> = {
  sun: '晴',
  cloud: '多云',
  rain: '雨',
  wind: '大风',
  heat: '酷热',
};

/** 场地专属桥段 */
export const SCENE_NOTES: Partial<Record<Conditions['venue'], Record<string, string>>> = {
  maple: {
    feed: '红绿球场、秋叶飘落；下课铃响时大家会抬头，路过的同学会喊加油',
    serve: '球罐换成校队配色，背景是校园围网和横幅',
    sprint: '在学校红色塑胶跑道上比赛',
    tryout: '"枫岭网球校队选拔"，三位评委：教练加两位老师',
    fair: '校园社团招新：和篮球队、啦啦队抢新生',
    openday: '家长开放日，横幅和校色布置',
    match: '对手西溪高中（藏蓝），看台上的枫岭学生会喊"Go Ravens!"',
    bbq: '校队团建日，木质野餐桌',
    tug: '对手是老师队，开局有"VS 老师队"',
    cleanup: '秋叶落了一地，越扫越多',
  },
  hollow: {
    feed: '球场开裂长草，球会坏弹跳；乌鸦会叼走地上的球；隔壁匹克球"啪嗒"声很吵',
    serve: '靶子是旧油漆桶，球网下塌；同样有坏弹跳和乌鸦',
    sprint: '在开裂的停车场上跑：绳梯换成旧轮胎、标志桶换成油漆桶，更容易绊倒',
    tryout: '手写"免费试训"，只有一位评委；报名人数打六折，来的人五花八门',
    fair: '社区集市：匹克球俱乐部人气很旺，网球很难抢到人',
    openday: '匹克球的人会过来把排队的家庭拉走',
    match: '对手松冠俱乐部（白绿球衣），看台冷清；我方球衣都不统一',
    pickleball: '就是租了 2 号场的那群人，打得热火朝天',
    bbq: '油桶烤炉、塑料折叠桌；乌鸦会偷肉饼',
    tug: '对手是匹克球俱乐部，输了更丢人',
    cleanup: '游戏里红土场的劳动日（workday / contractor）',
  },
};

export const CATEGORY_INFO: Record<Category, { name: string; en: string; desc: string }> = {
  train: {
    name: '球员训练',
    en: 'Training',
    desc: '日常训练循环。疲劳、天气、教练水平直接改变动作快慢、失误率和教练的反应。',
  },
  recruit: {
    name: '招生 · 经营',
    en: 'Recruiting',
    desc: '吸引新球员加入的活动：选拔看天赋，招新会和别的社团抢人，开放日要让家长和孩子都开心。',
  },
  match: {
    name: '比赛',
    en: 'Matches',
    desc: '扩大影响力的主要途径。赛事级别决定场面大小，实力和状态决定每一分怎么打。隔壁的匹克球也在这里。',
  },
  team: {
    name: '团建 · 劳动',
    en: 'Team days',
    desc: '恢复士气的轻松活动和一起干活的劳动日。疲劳越高，躺平的人越多；天气会改变玩法。',
  },
};
