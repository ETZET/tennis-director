// cast.html?set=test：覆盖 CastLook 全部字段的测试组（每种发型、帽子、配饰、下装、体型、制服 keep），第一排是场景原样（对照）。
import type { CastLook, HairStyle, Hat } from '../clubsite/cast/types';
import type { Entry } from './main';

const base: CastLook = {
  body: 'adult',
  skin: 'light',
  hair: 'darkBrown',
  hairStyle: 'short',
  shirt: 'white',
  bottom: 'navy',
  bottomKind: 'shorts',
  shoes: 'white',
};
const L = (o: Partial<CastLook>): CastLook => ({ ...base, ...o });
const P = (name: string, sub: string, look?: CastLook, kind: Entry['kind'] = 'player', variant = 0): Entry => ({
  name,
  sub,
  kind,
  variant,
  look,
});
const sit = (e: Entry): Entry => ({ ...e, pose: 'sit' });

const STYLE_NAME: Record<HairStyle, string> = {
  short: '短发',
  ponytail: '马尾',
  bun: '发髻',
  long: '长发',
  bob: '齐耳',
  bald: '光头',
  curly: '卷发',
  buzz: '寸头',
  braids: '辫子',
};
const HAT_NAME: Record<Hat['kind'], string> = {
  cap: '棒球帽',
  visor: '遮阳帽檐',
  bucket: '渔夫帽',
  straw: '草帽',
  headband: '头带',
};

export const TEST: { title: string; people: Entry[] }[] = [
  {
    title: '场景原样（对照）',
    people: [
      P('player v0', '原样', undefined, 'player', 0),
      P('player v1', '原样', undefined, 'player', 1),
      P('player v2', '原样', undefined, 'player', 2),
      P('player v3', '原样', undefined, 'player', 3),
      P('coach', '原样', undefined, 'coach'),
      P('kid v1', '原样', undefined, 'kid', 1),
      P('ball-kid', '原样', undefined, 'ball-kid'),
    ],
  },
  {
    title: '发型',
    people: (
      [
        ['short', 'black', 'tan', 'sky'],
        ['ponytail', 'blonde', 'pale', 'coral'],
        ['bun', 'black', 'olive', 'lavender'],
        ['long', 'auburn', 'light', 'teal'],
        ['bob', 'darkBrown', 'brown', 'yellow'],
        ['bald', 'gray', 'deep', 'green'],
        ['curly', 'black', 'deep', 'orange'],
        ['buzz', 'brown', 'tan', 'red'],
        ['braids', 'red', 'light', 'purple'],
      ] as const
    ).map(([s, h, sk, sh]) =>
      P(STYLE_NAME[s], `${s} · ${h}`, L({ hairStyle: s, hair: h, skin: sk, shirt: sh, bottom: 'white' })),
    ),
  },
  {
    title: '帽子',
    people: [
      P(
        HAT_NAME.cap,
        'cap · ponytail',
        L({ hat: { kind: 'cap', color: 'red' }, hairStyle: 'ponytail', hair: 'brown' }),
      ),
      P(HAT_NAME.visor, 'visor · bun', L({ hat: { kind: 'visor', color: 'yellow' }, hairStyle: 'bun', shirt: 'pink' })),
      P(
        HAT_NAME.bucket,
        'bucket · curly',
        L({ hat: { kind: 'bucket', color: 'khaki' }, hairStyle: 'curly', skin: 'brown', shirt: 'teal' }),
      ),
      P(
        HAT_NAME.straw,
        'straw · long',
        L({ hat: { kind: 'straw', color: 'cream' }, hairStyle: 'long', hair: 'blonde', shirt: 'coral' }),
      ),
      P(
        HAT_NAME.headband,
        'headband · braids',
        L({
          hat: { kind: 'headband', color: 'red' },
          hairStyle: 'braids',
          skin: 'deep',
          hair: 'black',
          shirt: 'white',
        }),
      ),
      P(
        '棒球帽 + 卷发',
        'cap · curly',
        L({ hat: { kind: 'cap', color: 'navy' }, hairStyle: 'curly', skin: 'olive', shirt: 'yellow' }),
      ),
      P(
        '遮阳 + 齐耳',
        'visor · bob',
        L({ hat: { kind: 'visor', color: 'white' }, hairStyle: 'bob', hair: 'auburn', shirt: 'sky' }),
      ),
      P(
        '渔夫帽 + 光头',
        'bucket · bald',
        L({ hat: { kind: 'bucket', color: 'green' }, hairStyle: 'bald', hair: 'white', skin: 'pale' }),
      ),
      P(
        '草帽 + 寸头',
        'straw · buzz',
        L({ hat: { kind: 'straw', color: 'yellow' }, hairStyle: 'buzz', skin: 'brown', shirt: 'lime' }),
      ),
      P(
        '头带 + 短发',
        'headband · short',
        L({ hat: { kind: 'headband', color: 'sky' }, hair: 'red', shirt: 'navy', bottom: 'white' }),
      ),
    ],
  },
  {
    title: '脸',
    people: [
      P('太阳镜', 'shades', L({ eyes: 'shades', shirt: 'orange' })),
      P('眼镜', 'glasses', L({ eyes: 'glasses', hair: 'gray', skin: 'pale', shirt: 'cream' })),
      P('胡子', 'mustache', L({ facial: 'mustache', hair: 'black', skin: 'olive', shirt: 'blue' })),
      P('络腮胡', 'beard', L({ facial: 'beard', hair: 'auburn', shirt: 'green' })),
      P(
        '眼镜 + 络腮胡',
        'glasses · beard',
        L({ eyes: 'glasses', facial: 'beard', hair: 'gray', hairStyle: 'bald', skin: 'brown', shirt: 'purple' }),
      ),
      P(
        '墨镜 + 胡子',
        'shades · mustache',
        L({
          eyes: 'shades',
          facial: 'mustache',
          hair: 'white',
          skin: 'tan',
          shirt: 'white',
          hat: { kind: 'cap', color: 'black' },
        }),
      ),
      P(
        '白发络腮',
        'beard · long',
        L({ facial: 'beard', hair: 'white', hairStyle: 'long', skin: 'light', shirt: 'charcoal' }),
      ),
    ],
  },
  {
    title: '衣服、体型',
    people: [
      P(
        '裙子',
        'skirt',
        L({ bottomKind: 'skirt', bottom: 'pink', shirt: 'white', hairStyle: 'ponytail', hair: 'blonde' }),
      ),
      P('长裤', 'pants', L({ bottomKind: 'pants', bottom: 'khaki', shirt: 'navy', shoes: 'brown' })),
      P('长袖', 'longSleeves', L({ longSleeves: true, shirt: 'red', bottomKind: 'pants', bottom: 'charcoal' })),
      P('Polo 滚边', 'trim', L({ shirt: 'navy', trim: 'white', bottom: 'khaki', bottomKind: 'pants' })),
      P('发福', 'stout 1.3', L({ stout: 1.3, shirt: 'yellow', bottom: 'tan', hairStyle: 'bald', hair: 'gray' })),
      P('矮', 'height 0.92', L({ height: 0.92, shirt: 'lavender', hairStyle: 'bob', hair: 'black' })),
      P('高', 'height 1.08', L({ height: 1.08, shirt: 'teal', skin: 'deep', hairStyle: 'buzz', hair: 'black' })),
      sit(P('坐着', 'sit · 裙子', L({ shirt: 'coral', bottomKind: 'skirt', bottom: 'navy' }), 'player', 1)),
    ],
  },
  {
    title: '孩子、少年',
    people: [
      P(
        '孩子 发髻',
        'kid · bun',
        L({ body: 'kid', hairStyle: 'bun', shirt: 'lime', bottomKind: 'skirt', bottom: 'purple' }),
        'kid',
        0,
      ),
      P(
        '孩子 辫子',
        'kid · braids',
        L({ body: 'kid', hairStyle: 'braids', skin: 'brown', hair: 'black', shirt: 'pink' }),
        'kid',
        1,
      ),
      P(
        '孩子 卷发',
        'kid · curly',
        L({ body: 'kid', hairStyle: 'curly', skin: 'deep', hair: 'black', shirt: 'yellow' }),
        'kid',
        2,
      ),
      P(
        '孩子 渔夫帽',
        'kid · bucket',
        L({ body: 'kid', hat: { kind: 'bucket', color: 'sky' }, shirt: 'orange', bottomKind: 'pants', bottom: 'blue' }),
        'kid',
        0,
      ),
      P('孩子→大人?', 'body adult + kid 槽位', L({ body: 'adult', height: 1.08, shirt: 'red' }), 'kid', 0),
      P(
        '球童 keep',
        'ball-kid 制服',
        L({
          body: 'teen',
          skin: 'olive',
          hairStyle: 'ponytail',
          hair: 'black',
          keep: ['shirt', 'bottom', 'shoes', 'hat'],
        }),
        'ball-kid',
        0,
      ),
      P(
        '少年 全换',
        'ball-kid · long',
        L({ body: 'teen', hairStyle: 'long', hair: 'red', shirt: 'teal', eyes: 'glasses' }),
        'ball-kid',
        1,
      ),
    ],
  },
  {
    title: '制服、keep',
    people: [
      P(
        '前台',
        'navy + 白边 + 卡其',
        L({
          shirt: 'navy',
          trim: 'white',
          bottom: 'khaki',
          bottomKind: 'pants',
          shoes: 'black',
          skin: 'brown',
          hairStyle: 'bun',
          hair: 'black',
        }),
      ),
      P(
        '场地维护',
        '橙 + 长裤 + 帽',
        L({
          shirt: 'orange',
          bottom: 'charcoal',
          bottomKind: 'pants',
          shoes: 'brown',
          hat: { kind: 'cap', color: 'orange' },
          skin: 'tan',
          facial: 'mustache',
        }),
      ),
      P(
        '救生员',
        '红 + 红短裤',
        L({
          shirt: 'red',
          bottom: 'red',
          shoes: 'white',
          hat: { kind: 'visor', color: 'white' },
          eyes: 'shades',
          skin: 'olive',
        }),
      ),
      P(
        '教练 keep',
        'shirt·trim·whistle',
        L({
          skin: 'deep',
          hairStyle: 'buzz',
          hair: 'gray',
          facial: 'beard',
          bottom: 'khaki',
          stout: 1.1,
          keep: ['shirt', 'trim', 'whistle'],
        }),
        'coach',
      ),
      P(
        '裁判 keep',
        '全部衣服',
        L({
          skin: 'pale',
          hairStyle: 'short',
          hair: 'gray',
          eyes: 'glasses',
          keep: ['shirt', 'bottom', 'shoes', 'hat', 'trim'],
        }),
        'umpire',
        0,
      ),
      P(
        '总监换装',
        'director · straw',
        L({
          hat: { kind: 'straw', color: 'khaki' },
          shirt: 'teal',
          trim: 'yellow',
          bottomKind: 'pants',
          bottom: 'khaki',
        }),
        'director',
      ),
    ],
  },
];
