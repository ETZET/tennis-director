// 十个小游戏的目录（hub 页 minigames.html 用；顺序 = 编号）。id 固定：页面是 mg-<id>.html，代码在 src/minigames/<id>/。
export interface MinigameEntry {
  n: number;
  id: string;
  name: string;
  /** 在哪个场景（中文地点名） */
  scene: string;
  /** 场景模块（src/<region>/scene.ts） */
  region: string;
  /** 一句话 */
  pitch: string;
}

export const MINIGAMES: readonly MinigameEntry[] = [
  {
    n: 1,
    id: 'ballpickup',
    name: '捡球冲刺',
    scene: '会员场',
    region: 'clubcourts',
    pitch: '课后满场是球：90 秒推着捡球器扫回球车。',
  },
  {
    n: 2,
    id: 'blower',
    name: '吹叶清场',
    scene: '中心球场',
    region: 'clubstadium',
    pitch: '开赛前把场上的落叶和沙吹出界。',
  },
  {
    n: 3,
    id: 'claydrag',
    name: '红土拖场',
    scene: '红土场',
    region: 'clubclay',
    pitch: '拖网把红土拖平，一道都别漏。',
  },
  {
    n: 4,
    id: 'valet',
    name: '代客泊车',
    scene: '停车场',
    region: 'clubpark',
    pitch: '接过钥匙，把车停进空位，别刮着。',
  },
  {
    n: 5,
    id: 'stringing',
    name: '穿线',
    scene: '会所一楼穿线铺',
    region: 'clubhouse',
    pitch: '照磅数给球拍穿线，又快又准。',
  },
  {
    n: 6,
    id: 'foodtruck',
    name: '餐车出餐',
    scene: '餐车院子',
    region: 'clubfood',
    pitch: '照单出餐，排队的人别等急了。',
  },
  {
    n: 7,
    id: 'checkin',
    name: '前台签到',
    scene: '露天前台',
    region: 'clubdesk',
    pitch: '核对会员、递毛巾，别让队排出门。',
  },
  {
    n: 8,
    id: 'ballkid',
    name: '球童',
    scene: '中心球场 · 比赛中',
    region: 'clubstadium',
    pitch: '死球就冲上去捡，活球时别挡着比赛。',
  },
  { n: 9, id: 'lifeguard', name: '泳池救生', scene: '泳池', region: 'clubpool', pitch: '盯着泳池，有人呛水马上去救。' },
  {
    n: 10,
    id: 'golfputt',
    name: '果岭推杆',
    scene: '高尔夫果岭',
    region: 'clubgolf',
    pitch: '读坡、推杆，用最少的杆进洞。',
  },
];
