/**
 * E 方向的字符画部件（只写材质，明暗由 paint.ts 自动算）。
 *
 * 材质字母（换色槽，见 paint.ts 的 Look）：
 *   S 皮肤 H 头发 Y 眉毛 M 胡子 E 眼睛 P 帽子 T 上衣 L 袖子 C 领子/滚边 B 下装 K 袜子 F 鞋 Q 球拍
 *   X 配饰（头巾、护膝、肌贴、围裙）Z 配饰 2（包带、挂绳、相机）G 眼镜框 R 腰带
 *   小写 = 同材质压暗一级（褶子、帽檐下的影子）
 * 符号（不参与明暗）：* 眼睛高光  + 腮红  : 胡茬 / 眼袋  ~ 皱纹  = 嘴唇  # logo  1 扣子  % 汗珠  @ 金属
 *   & 白纸 / 白布  $ 皮革 / 木头  ^ 手机屏  ! 手机壳  ? 网球  < 球线  " 镜片反光  - 深色细节  / 红  | 蓝
 *
 * 每个部件 { rows, ax, ay }：(ax, ay) 是锚点在部件里的像素坐标，拼的时候对准骨架上的点。
 * 头：锚点在下巴下面一行的中缝；身体：锚点在腰线下面一行的中缝。
 */

export interface Part {
  readonly rows: readonly string[];
  readonly ax: number;
  readonly ay: number;
}

/** 一个部件：锚点默认在底边中缝 */
export const part = (rows: readonly string[], ax?: number, ay?: number): Part => {
  const w = rows[0]?.length ?? 0;
  for (const r of rows) if (r.length !== w) throw new Error(`part row width ${r.length} != ${w}: "${r}"`);
  return { rows, ax: ax ?? Math.floor(w / 2), ay: ay ?? rows.length };
};

export interface HeadArt {
  front: Part;
  back: Part;
}

/* ============================ 头（正面 / 背面） ============================ */
// 规矩：脸 8 格宽（第 1–8 列），年轻人眼睛 2×2 带一格高光（*），老人眼睛 2×1 加眼角纹（~）、眼袋（:）。

export const HEADS: Record<string, HeadArt> = {
  // Dale：60 多岁，深蓝棒球帽、白胡子、宽脸，眯着眼
  dale: {
    front: part([
      '..PPPPPPP...',
      '.PPPPP#PPP..',
      '.PPPPPPPPP..',
      '.PPPPPPPPPPP',
      '.HssssssssH.',
      '.HYYYSSYYYH.',
      '.S~EESSEE~S.',
      '.SS:SssS:SS.',
      '.MMMMMMMMMM.',
      '.MMM====MMM.',
      '..MMMMMMMM..',
      '...MMMMMM...',
    ]),
    back: part([
      '..PPPPPPP...',
      '.PPPPPPPPP..',
      '.PPPPPPPPP..',
      '.PPP&&&PPP..',
      '.HHHHHHHHH..',
      'SHHHHHHHHHS.',
      'SHHHHHHHHHS.',
      '.HHHHHHHHH..',
      '.MHSSSSSHM..',
      '..SSSSSSS...',
      '..SSSSSSS...',
      '...SSSSS....',
    ]),
  },
  // Rosa：草帽、红头巾、眼角被太阳晒出的纹，一条辫子（辫子画在身上）
  rosa: {
    front: part([
      '....PPPPP....',
      '...PPPPPPP...',
      '...XXXXXXX...',
      'PPPPPPPPPPPPP',
      '.ppHHsssHHpp.',
      '..HYYSSSYYH..',
      '..~*ESSS*E~..',
      '..SEESSSEES..',
      '..S+SSsSS+S..',
      '..SSS===SSS..',
      '...SSSSSSS...',
      '....XXXXX....',
    ]),
    back: part([
      '....PPPPP....',
      '...PPPPPPP...',
      '...XXXXXXX...',
      'PPPPPPPPPPPPP',
      '.ppHHHHHHHpp.',
      '..HHHHHHHHH..',
      '..SHHHHHHHS..',
      '..SHHHHHHHS..',
      '...HHHHHHH...',
      '...SSHHHSS...',
      '....SHHHS....',
      '....XXXXX....',
    ]),
  },
  // Ben：乱刘海、圆眼镜、刚睡醒但很精神
  ben: {
    front: part([
      '...HHHHH...',
      '.HHHHHHHHH.',
      'HHHHHHHHHHH',
      'HHHHSHHHSHH',
      'HSSYYSSYYSH',
      'SGGGGSGGGGS',
      'SG*EGGG*EGS',
      'SSGGSsSGGSS',
      '.S+SSsSS+S.',
      '..SS===SS..',
      '..SSSSSSS..',
      '...SSSSS...',
    ]),
    back: part([
      '...HHHHH...',
      '.HHHHHHHHH.',
      'HHHHHHHHHHH',
      'HHHHHHHHHHH',
      'HHHHHHHHHHH',
      'GHHHHHHHHHG',
      'SHHHHHHHHHS',
      'SHHHHHHHHHS',
      '.HHHHHHHHH.',
      '.SSSSSSSSS.',
      '..SSSSSSS..',
      '...SSSSS...',
    ]),
  },
  // Jess：遮阳帽檐、高马尾甩在一边、雀斑、笑
  jess: {
    front: part([
      '..HHHHHHH....',
      '.HHHHHHHHH...',
      '.PPPPPPPPP...',
      'PPPPPPPPPPPH.',
      '.HssssssssHHH',
      '.SYYSSSSYYSHH',
      '.S*ESSSS*ES.H',
      '.SEESSSSEES.H',
      '.S+:SssS:+S.H',
      '.SSS=SS=SSS..',
      '..SSS==SSS...',
      '...SSSSSS....',
    ]),
    back: part([
      '..HHHHHHH....',
      '.HHHHHHHHH...',
      '.PPPPPPPPP...',
      '.PPPPPPPPPP..',
      '.HHHHHHHHHH..',
      'SHHHHHHHHHHS.',
      'SHHHHhHHHHHS.',
      '.HHHHhHHHHH..',
      '.HHHHhHHHHH..',
      '..SSSHHSSS...',
      '..SSSHHSSS...',
      '...SSHHSS....',
    ]),
  },
  // Gus：红帽子旧得发白、灰胡茬、眼袋、嘴角往下
  gus: {
    front: part([
      '..PPPPPPP...',
      '.PPPPPPPPP..',
      '.PPPPPPPPP..',
      '.PPPPPPPPPPP',
      '.HssssssssH.',
      '.HYYSSSSYYH.',
      '.S~EESSEE~S.',
      '.S::SSSS::S.',
      '.S::SssS::S.',
      '.:::-==-:::.',
      '..::::::::..',
      '...::::::...',
    ]),
    back: part([
      '..PPPPPPP...',
      '.PPPPPPPPP..',
      '.PPPPPPPPP..',
      '.PPP&&&PPP..',
      '.HHHHHHHHH..',
      'SHHHHHHHHHS.',
      'SHHHHHHHHHS.',
      '.HHHHHHHHH..',
      '.SSSSSSSSS..',
      '..SSSSSSS...',
      '..SSSSSSS...',
      '...SSSSS....',
    ]),
  },
  // Lily：齐刘海黑长发、细眼线、红唇、小耳钉
  lily: {
    front: part([
      '...HHHHH....',
      '.HHHHHHHHH..',
      'HHHHHHHHHHH.',
      'HHHHHHHHHHH.',
      'HHSYYSSYYSHH',
      'HSE*EssE*ESH',
      'HSSEESSEESSH',
      'H@SSSsSSSS@H',
      'HHS+S==S+SHH',
      'HHHSSSSSSHHH',
      'HHHHSSSSHHHH',
      'HHH.SSSS.HHH',
    ]),
    back: part([
      '...HHHHH....',
      '.HHHHHHHHH..',
      'HHHHHHHHHHH.',
      'HHHHHHHHHHH.',
      'HHHHHHHHHHHH',
      'HHHHHHHHHHHH',
      'HHHHHHHHHHHH',
      'HHHHHHHHHHHH',
      'HHHHHHHHHHHH',
      'HHHHHHHHHHHH',
      'HHHHHHHHHHHH',
      'HHHHHHHHHHHH',
    ]),
  },
  // Teodora：头顶的发髻、架在鼻尖的方框眼镜、皱眉
  teodora: {
    front: part([
      '....HHH....',
      '...HHHHH...',
      '..HHHHHHH..',
      '.HHHHHHHHH.',
      'HHHHHHHHHHH',
      'HSYYY~YYYSH',
      'HS*E~S~*ESH',
      'HSSSSsSSSSH',
      '.GGGGsGGGG.',
      '.SG"GSG"GS.',
      '..SS---SS..',
      '...SSSSS...',
    ]),
    back: part([
      '....HHH....',
      '...HHHHH...',
      '..HHH@HHH..',
      '.HHHHHHHHH.',
      'HHHHHHHHHHH',
      'HHHHHHHHHHH',
      'SHHHHHHHHHS',
      'GHHHHHHHHHG',
      '.HHHHHHHHH.',
      '.SSSSSSSSS.',
      '..SSSSSSS..',
      '...SSSSS...',
    ]),
  },
  // Nadia：金色高马尾、推到头顶的墨镜、高颧骨
  nadia: {
    front: part([
      '...HHHHH.....',
      '..GGGGGGG....',
      '.H"GGG"GHH...',
      '.HHHHHHHHHH..',
      'HHHSSSSSSHHH.',
      'HSYYSSSSYYSH.',
      '.S*ESSSS*ES.H',
      '.SEESSSSEES.H',
      '.S+SSssSS+S.H',
      '..SSS==SSS..H',
      '...SSSSSS...H',
      '....SSSS.....',
    ]),
    back: part([
      '...HHHHH.....',
      '..GGGGGGG....',
      '.HHHHHHHHH...',
      '.HHHHXHHHHH..',
      'HHHHHHHHHHH..',
      'SHHHHhHHHHS..',
      'SHHHHhHHHHS..',
      '.HHHHhHHHH...',
      '.SSSHhHSSS...',
      '..SSHhHSS....',
      '...SHhHS.....',
      '....SHS......',
    ]),
  },
  // Ray：宽檐旧呢帽、白八字胡、晒深的脸、皱纹
  ray: {
    front: part([
      '....PPPPP.....',
      '...PPPPPPP....',
      '...pXXXXXp....',
      'PPPPPPPPPPPPP.',
      '.pHsssssssHp..',
      '..HYYSSSYYH...',
      '..~EESSSEE~...',
      '..S~SSsSS~S...',
      '..SSMMMMMSS...',
      '..SMS===SMS...',
      '...SSSSSSS....',
      '....SSSSS.....',
    ]),
    back: part([
      '....PPPPP.....',
      '...PPPPPPP....',
      '...pXXXXXp....',
      'PPPPPPPPPPPPP.',
      '.pHHHHHHHHHp..',
      '..HHHHHHHHH...',
      '..SHHHHHHHS...',
      '..SHHHHHHHS...',
      '...SSSSSSS....',
      '...SSSSSSS....',
      '...SSSSSSS....',
      '....SSSSS.....',
    ]),
  },
  // Mateo：16 岁，短卷发、大眼睛、一点青春痘
  mateo: {
    front: part([
      '..HHHHHH..',
      '.HHHHHHHH.',
      'HHHHHHHHHH',
      'HHSHHSHHSH',
      'HSYYSSYYSH',
      'S*ESSSS*ES',
      'SEESSSSEES',
      '.S+SssS+S.',
      '.SS=SS=SS.',
      '..SS==SS..',
      '...SSSS...',
    ]),
    back: part([
      '..HHHHHH..',
      '.HHHHHHHH.',
      'HHHHHHHHHH',
      'HHHHHHHHHH',
      'HHHHHHHHHH',
      'SHHHHHHHHS',
      'SHHHHHHHHS',
      '.HHHHHHHH.',
      '.SSSSSSSS.',
      '..SSSSSS..',
      '...SSSS...',
    ]),
  },
  // 总监：利落短发、墨镜、下巴干净
  director: {
    front: part([
      '...HHHHH...',
      '.HHHHHHHHH.',
      'HHHHHHHHHHH',
      'HHHHHHHHHSH',
      'HSSYYSSYYSH',
      'SGGGGGGGGGS',
      'SG"GGSG"GGS',
      'SSGGsssGGSS',
      '.SSSsSsSSS.',
      '.SSS===SSS.',
      '..SSSSSSS..',
      '...SSSSS...',
    ]),
    back: part([
      '...HHHHH...',
      '.HHHHHHHHH.',
      'HHHHHHHHHHH',
      'HHHHHHHHHHH',
      'HHHHHHHHHHH',
      'GHHHHHHHHHG',
      'SHHHHHHHHHS',
      'SHHHHHHHHHS',
      '.hhhhhhhhh.',
      '.SSSSSSSSS.',
      '..SSSSSSS..',
      '...SSSSS...',
    ]),
  },
  // 小孩 1（Mia）：两个小辫、缺门牙的大笑
  kidA: {
    front: part([
      '...HHHH...',
      'HXHHHHHHXH',
      'HHHHHHHHHH',
      'HHHHSHHSHH',
      '.S*ESS*ES.',
      '.SEESSEES.',
      '.S+SssS+S.',
      '..S=&&=S..',
      '...SSSS...',
    ]),
    back: part([
      '...HHHH...',
      'HXHHHHHHXH',
      'HHHHHHHHHH',
      'HHHHHHHHHH',
      '.HHHHHHHH.',
      '.HHHHHHHH.',
      '..HHHHHH..',
      '..SSSSSS..',
      '...SSSS...',
    ]),
  },
  // 小孩 2（Leo）：反戴的大帽子、鼻子上一点晒伤
  kidB: {
    front: part([
      '..PPPPPP..',
      '.PPPPPPPP.',
      'HPPPPPPPPH',
      'HHSSSSSSHH',
      '.S*ESS*ES.',
      '.SEE++EES.',
      '.S+SssS+S.',
      '..SS==SS..',
      '...SSSS...',
    ]),
    back: part([
      '..PPPPPP..',
      '.PPPPPPPP.',
      'HPP&&&&PPH',
      'HHPPPPPPHH',
      '.HHHHHHHH.',
      '.HHHHHHHH.',
      '..HHHHHH..',
      '..SSSSSS..',
      '...SSSS...',
    ]),
  },
  // 退休老人：白色遮阳帽檐、银发、鼻子上抹着防晒霜、乐呵呵
  retiree: {
    front: part([
      '...HHHHH....',
      '..HHHHHHH...',
      '.PPPPPPPPP..',
      'PPPPPPPPPPPP',
      '.HssssssssH.',
      '.HYYSSSSYYH.',
      '.S~EESSEE~S.',
      '.SS+S&&S+SS.',
      '.S~SSssSS~S.',
      '.SSS====SSS.',
      '..SSSSSSSS..',
      '...SSSSSS...',
    ]),
    back: part([
      '...HHHHH....',
      '..HHHHHHH...',
      '.PPPPPPPPP..',
      '.PPPPPPPPP..',
      '.HHHHHHHHH..',
      'SHHHHHHHHHS.',
      'SHHHHHHHHHS.',
      '.HHHHHHHHH..',
      '.SSSSSSSSS..',
      '..SSSSSSS...',
      '..SSSSSSS...',
      '...SSSSS....',
    ]),
  },
  // 网球妈妈：墨镜推在头上、低马尾、口红
  mom: {
    front: part([
      '...HHHHH....',
      '..GGGGGGG...',
      '.H"GGG"GHH..',
      '.HHHHHHHHHH.',
      'HHHSSSSHHHHH',
      'HSYYSSSYYSH.',
      'HS*ESSS*ES.H',
      '.SEESSSEES.H',
      '.S+SSsSS+S..',
      '..SS===SS...',
      '...SSSSS....',
      '....SSS.....',
    ]),
    back: part([
      '...HHHHH....',
      '..GGGGGGG...',
      '.HHHHHHHHH..',
      '.HHHHHHHHHH.',
      'HHHHHHHHHHH.',
      'SHHHHHHHHHS.',
      'SHHHHHHHHHS.',
      '.HHHHXHHHH..',
      '.SSSHHHSSS..',
      '..SSHHHSS...',
      '...SHHHS....',
      '....HHH.....',
    ]),
  },
  // 游客：渔夫帽、晒红的脸和鼻子、大笑
  tourist: {
    front: part([
      '...PPPPP....',
      '..PPPPPPP...',
      '..PPPPPPP...',
      '.PPPPPPPPP..',
      'pppppppppppp',
      '.HSYYSSYYSH.',
      '.S*ESSS*ESS.',
      '.SEE+++EESS.',
      '.S++SssS++S.',
      '.SS=====SSS.',
      '..SSS==SSS..',
      '...SSSSSS...',
    ]),
    back: part([
      '...PPPPP....',
      '..PPPPPPP...',
      '..PPPPPPP...',
      '.PPPPPPPPP..',
      'pppppppppppp',
      '.HHHHHHHHH..',
      'SHHHHHHHHHS.',
      'S+HHHHHHH+S.',
      '.SSSSSSSSS..',
      '..SSSSSSS...',
      '..SSSSSSS...',
      '...SSSSS....',
    ]),
  },
};

/* ============================ 身体（上衣） ============================ */
// 锚点：腰线下面一行的中缝（ax = 宽/2）。第一行是肩膀；领口里露出脖子（S）。

export interface TorsoArt {
  front: Part;
  back: Part;
}

export const TORSOS: Record<string, TorsoArt> = {
  // 标准男：polo 领、门襟、扣子
  std: {
    front: part([
      '...TCSSSSCT...',
      '.TTTCCSSCCTTT.',
      'TTTTTCSSCTTTTT',
      'TTTTTTC1TTTTTT',
      'TTTTTTCCTTTTTT',
      'TTTTTTT1TTTTTT',
      '.TTTTTTTTTTTT.',
      '.TTTTTTTTTTTT.',
      '.TTTtTTTTTtTT.',
      '.TTTTtTTTtTTT.',
      '.TTTTTTTTTTTT.',
      '.TTTTTTTTTTTT.',
    ]),
    back: part([
      '...TCCCCCCT...',
      '.TTTCCCCCCTTT.',
      'TTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTT',
      'TTTTTTtTTTTTTT',
      '.TTTTTtTTTTTT.',
      '.TTTTTTTTTTTT.',
      '.TTTTTTTTTTTT.',
      '.TTtTTTTTTtTT.',
      '.TTTTTTTTTTTT.',
      '.TTTTTTTTTTTT.',
    ]),
  },
  // 宽身板：肩更宽、肚子往前顶
  wide: {
    front: part([
      '....TCSSSSCT....',
      '..TTTCCSSCCTTT..',
      '.TTTTTCSSCTTTTT.',
      'TTTTTTTC1TTTTTTT',
      'TTTTTTTCCTTTTTTT',
      'TTTTTTTT1TTTTTTT',
      'TTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTT',
      '.TTTTTTTTTTTTTT.',
      '.TTTTtTTTTtTTTT.',
      '.TTTTTtttTTTTTT.',
      '..TTTTTTTTTTTT..',
    ]),
    back: part([
      '....TCCCCCCT....',
      '..TTTCCCCCCTTT..',
      '.TTTTTTTTTTTTTT.',
      'TTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTT',
      'TTTTTTTtTTTTTTTT',
      'TTTTTTTtTTTTTTTT',
      'TTTTTTTTTTTTTTTT',
      '.TTTTTTTTTTTTTT.',
      '.TTtTTTTTTTTtTT.',
      '.TTTTTTTTTTTTTT.',
      '..TTTTTTTTTTTT..',
    ]),
  },
  // 纤细（女）：肩窄、收腰
  slim: {
    front: part([
      '..TCSSSSCT..',
      '.TTCSSSSCTT.',
      'TTTTCSSCTTTT',
      'TTTTTCCTTTTT',
      'TTTtTTTTtTTT',
      'TTTTTTTTTTTT',
      '.TTTTTTTTTT.',
      '..TTTTTTTT..',
      '..TTTTTTTT..',
      '..TTTtTTTT..',
      '.TTTTTTTTTT.',
      '.TTTTTTTTTT.',
    ]),
    back: part([
      '..TCCCCCCT..',
      '.TTCCCCCCTT.',
      'TTTTTTTTTTTT',
      'TTTTTTTTTTTT',
      'TTTTTtTTTTTT',
      'TTTTTtTTTTTT',
      '.TTTTTTTTTT.',
      '..TTTTTTTT..',
      '..TTTTTTTT..',
      '..TTTTTTTT..',
      '.TTTTTTTTTT.',
      '.TTTTTTTTTT.',
    ]),
  },
  // 少年：窄、平，圆领
  teen: {
    front: part([
      '...TCCCCT...',
      '.TTTCSSCTTT.',
      'TTTTTCCTTTTT',
      'TTTTTTTTTTTT',
      'TTTTTTTTTTTT',
      '.TTTTTTTTTT.',
      '.TTTTTTTTTT.',
      '.TTTtTTTTTT.',
      '.TTTTTTtTTT.',
      '.TTTTTTTTTT.',
      '.TTTTTTTTTT.',
    ]),
    back: part([
      '...TCCCCT...',
      '.TTTCCCCTTT.',
      'TTTTTTTTTTTT',
      'TTTTTTTTTTTT',
      'TTTTTtTTTTTT',
      '.TTTTtTTTTT.',
      '.TTTTTTTTTT.',
      '.TTTTTTTTTT.',
      '.TTTTTTTTTT.',
      '.TTTTTTTTTT.',
      '.TTTTTTTTTT.',
    ]),
  },
  kid: {
    front: part(['..TCCCCT..', '.TTTSSTTT.', 'TTTTTTTTTT', 'TTTTTTTTTT', '.TTTTTTTT.', '.TTTTTTTT.', '.TTTtTTTT.']),
    back: part(['..TCCCCT..', '.TTCCCCTT.', 'TTTTTTTTTT', 'TTTTTTTTTT', '.TTTTTTTT.', '.TTTTTTTT.', '.TTTTTTTT.']),
  },
};

/* ============================ 胯部（下装上沿） ============================ */
export const HIPS: Record<string, Part> = {
  std: part(['RRRRRRRRRRRR', 'BBBBBBBBBBBB', 'BBBBBbbBBBBB', 'BBBBB..BBBBB'], 6, 0),
  wide: part(['RRRRRRRRRRRRRR', 'BBBBBBBBBBBBBB', 'BBBBBBbbBBBBBB', 'BBBBBB..BBBBBB'], 7, 0),
  slim: part(['RRRRRRRRRR', 'BBBBBBBBBB', 'BBBBbbBBBB', 'BBBB..BBBB'], 5, 0),
  teen: part(['RRRRRRRRRR', 'BBBBBBBBBB', 'BBBBbbBBBB', 'BBBB..BBBB'], 5, 0),
  kid: part(['BBBBBBBB', 'BBBbbBBB', 'BBB..BBB'], 4, 0),
  // 网球裙：往外张开、裙褶
  skirt: part(['.RRRRRRRRRR.', '.BBBBBBBBBB.', '.BBbBBBBbBB.', 'BBBbBBBBbBBB', 'BBBBbBBbBBBB', 'bBBBBbbBBBBb'], 6, 0),
  kidSkirt: part(['.BBBBBBBB.', '.BBbBBbBB.', 'BBbBBBBbBB', 'BbBBbbBBbB'], 5, 0),
};

/* ============================ 鞋 ============================ */
// 锚点在脚踝（上沿中间）
export const SHOES = {
  sneaker: { front: part(['.FFF.', 'FFFFF', 'fffff'], 2, 0), back: part(['FFFF.', 'FFFFF', 'fffff'], 2, 0) },
  boot: { front: part(['FFFF.', 'FFFFF', 'fffff'], 2, 0), back: part(['FFFF.', 'FFFFF', 'fffff'], 2, 0) },
  sandal: { front: part(['.SSS.', 'SSSSS', 'fffff'], 2, 0), back: part(['.SSS.', 'SSSSS', 'fffff'], 2, 0) },
  kid: { front: part(['FFFF', 'ffff'], 2, 0), back: part(['FFFF', 'ffff'], 2, 0) },
};

/* ============================ 身上的贴花（按人物） ============================ */
// 锚点 = 身体部件的锚点（腰线中缝），dx/dy 是相对它的偏移。front / back 分开。

export interface Decal {
  art: Part;
  /** 相对腰线中缝的偏移（像素，y 向下） */
  dx: number;
  dy: number;
  /** 画在手臂前面（挂绳、辫子）还是身上（logo、围裙） */
  over?: boolean;
}

export const DECALS: Record<string, { front: Decal[]; back: Decal[] }> = {
  // Dale：胸前的旧 logo，腰后别着一卷胶带不画
  dale: {
    front: [{ art: part(['##', '#.']), dx: 3, dy: -9 }],
    back: [],
  },
  // Rosa：辫子搭在右肩前面
  rosa: {
    front: [{ art: part(['HH.', 'HH.', '.HH', '.HH', 'HH.', 'HX.', '.X.']), dx: -6, dy: -12, over: true }],
    back: [],
  },
  // Ben：挂绳和工牌
  ben: {
    front: [{ art: part(['Z....Z', '.Z..Z.', '..ZZ..', '..&&..', '..|&..']), dx: 0, dy: -11, over: true }],
    back: [{ art: part(['ZZZZ']), dx: 0, dy: -12 }],
  },
  // Jess：胸口一个小标、袖口滚边在 rig 里
  jess: { front: [{ art: part(['#']), dx: 3, dy: -9 }], back: [{ art: part(['##', '##']), dx: 0, dy: -9 }] },
  // Gus：工装口袋、胸口别着一支笔
  gus: {
    front: [
      { art: part(['tttt', 'TTTT', 'TTTT']), dx: -4, dy: -9 },
      { art: part(['t|tt', 'T|TT', 'TTTT']), dx: 3, dy: -9 },
    ],
    back: [],
  },
  // Lily：前台的名牌
  lily: { front: [{ art: part(['&&&', '|||']), dx: 3, dy: -9 }], back: [] },
  // Teodora：紫色围裙（X），口袋里插着穿线锥；肩上搭一卷线
  teodora: {
    front: [
      {
        art: part([
          'X......X',
          'XXXXXXXX',
          'XXXXXXXX',
          'XXXXXXXX',
          'XxxxxxxX',
          'XX@XXXXX',
          'XX@XXXXX',
          'XXXXXXXX',
          'XXXXXXXX',
        ]),
        dx: 0,
        dy: -10,
      },
      { art: part(['<<.', '<.<', '.<<']), dx: 4, dy: -12, over: true },
    ],
    back: [{ art: part(['X........X', '.X......X.', '..X....X..', '...XXXX...']), dx: 0, dy: -11 }],
  },
  // Nadia：右肩上的肌贴（X）
  nadia: {
    front: [{ art: part(['X.X', 'XX.', '.X.']), dx: -5, dy: -12, over: true }],
    back: [{ art: part(['X.X', '.XX', '.X.']), dx: 5, dy: -12, over: true }],
  },
  // Ray：胸前两个口袋、钥匙串挂在腰上
  ray: {
    front: [
      { art: part(['tttt', 'T1TT', 'TTTT']), dx: -4, dy: -9 },
      { art: part(['tttt', 'TT1T', 'TTTT']), dx: 4, dy: -9 },
      { art: part(['@.', '@@', '.@']), dx: 6, dy: 1, over: true },
    ],
    back: [{ art: part(['@.', '@@']), dx: -6, dy: 1, over: true }],
  },
  // Mateo：球童衫的白色斜条和号码
  mateo: {
    front: [{ art: part(['C........', '.C.......', '..C......', '...CCCCCC']), dx: 0, dy: -6 }],
    back: [
      { art: part(['&&.&&', '.&..&', '.&.&&']), dx: 0, dy: -9 },
      { art: part(['C........', '.C.......', '..C......', '...CCCCCC']), dx: 0, dy: -6 },
    ],
  },
  // 总监：胸前的会所徽章、挂着哨子
  director: {
    front: [
      { art: part(['Z....Z', '.Z..Z.', '..ZZ..', '..@...']), dx: 0, dy: -11, over: true },
      { art: part(['#/', '##']), dx: 3, dy: -8 },
    ],
    back: [{ art: part(['ZZZZ']), dx: 0, dy: -11 }],
  },
  kidA: { front: [{ art: part(['/.', '//']), dx: 0, dy: -5 }], back: [] },
  kidB: { front: [{ art: part(['&&', '&.']), dx: 1, dy: -5 }], back: [{ art: part(['1', '1']), dx: 0, dy: -5 }] },
  retiree: { front: [{ art: part(['#']), dx: 4, dy: -9 }], back: [] },
  // 网球妈妈：斜挎的拍包带（Z）
  mom: {
    front: [
      {
        art: part(['Z.........', '.ZZ.......', '...ZZ.....', '.....ZZ...', '.......ZZ.', '.........Z']),
        dx: 0,
        dy: -11,
        over: true,
      },
    ],
    back: [
      {
        art: part(['.........Z', '.......ZZ.', '.....ZZ...', '...ZZ.....', '.ZZ.......', 'Z.........']),
        dx: 0,
        dy: -11,
        over: true,
      },
    ],
  },
  // 游客：夏威夷衫的花（C）+ 相机带
  tourist: {
    front: [
      {
        art: part([
          'C...C..C....',
          '.CC...CC..C.',
          '...C.....CC.',
          'C....CC.....',
          '..CC....C..C',
          '.....C...C..',
          'C..C...CC...',
        ]),
        dx: 0,
        dy: -10,
      },
      {
        art: part(['Z......Z', '.Z....Z.', '..Z..Z..', '..ZZZZ..', '..Z@@Z..', '..ZZZZ..']),
        dx: 0,
        dy: -11,
        over: true,
      },
    ],
    back: [
      { art: part(['.C...C..C...', 'C..CC....C..', '..C....CC...', '.C..C......C', '....CC..C...']), dx: 0, dy: -10 },
    ],
  },
};

/* ============================ 手里拿的东西 ============================ */
// 锚点 = 手（握的位置）
export const PROPS: Record<string, Part> = {
  phone: part(['!!', '^!', '^!', '!!'], 1, 2),
  phoneLit: part(['!!', '^^', '^^', '!!'], 1, 2),
  coffee: part(['&&&', '$$$', '&&&', '&&&'], 1, 2),
  clipboard: part(['.@@..', '$&&&$', '$&-&$', '$&&&$', '$&-&$', '$$$$$'], 2, 3),
  clipboardSide: part(['@$', '$$', '$$', '$$', '$$'], 0, 2),
  camera: part(['.ZZ.', 'ZZZZ', 'Z"@Z', 'ZZZZ'], 2, 2),
  pliers: part(['@.@', '.@.', '$.$', '$.$'], 1, 2),
  ball: part(['?'], 0, 0),
  cane: part(['$$', '.$', '.$', '.$', '.$', '.$', '.$', '.$', '.$', '.$', '.$', '.$'], 1, 1),
  glove: part(['XX', 'XX'], 1, 1),
  rag: part(['&&', '&&', '.&'], 1, 0),
  whistle: part(['@'], 0, 0),
  iced: part(['&&&', '&$&', '&$&', '&&&'], 1, 2),
  flash: part(['.&.', '&&&', '.&.'], 1, 1),
};

/** 情绪符号（画在头顶上方，不参与明暗） */
export const MARKS: Record<string, Part> = {
  anger: part(['/./', './.', '/./'], 1, 3),
  sigh: part(['.&&', '&&&', '.&.'], 0, 2),
  sweat: part(['%', '%'], 0, 1),
  note: part(['.--', '.-.', '--.'], 1, 3),
  heart: part(['/./', '///', './/'], 1, 3),
  spark: part(['.?.', '???', '.?.'], 1, 3),
};
