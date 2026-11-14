// 名字池：Palm Springs / Coachella 谷地的人群（虚构）。每组 ≥ 30 个名、≥ 30 个姓，名带一个中文音译（名册里放在英文名下面）。
// 名前面的记号：* = 老一辈的名字（只给 45 岁以上）；^ = 年轻的名字（只给 40 岁以下）。
// 亚裔按来源分成几家（中、日、韩、越、菲、南亚）：名和姓从同一家里挑，不拼出"Kenji Patel"。
// 族裔只决定名字和样子的分布，不决定职业（职业在 crowd.ts 里另外挑，和族裔无关）。

export type Gender = 'f' | 'm';
export type GroupId = 'anglo' | 'latino' | 'asian' | 'black' | 'mideast' | 'euro' | 'canada';

export interface NameFamily {
  f: string;
  m: string;
  last: string;
  /** 候鸟：这一家从哪些城市来（'|' 分隔） */
  from?: string;
}

/** 'Emily 艾米莉|*Linda 琳达' → [{ en, zh, era }] */
export interface FirstName {
  en: string;
  zh: string;
  era: 'old' | 'young' | 'any';
}

export const parseFirst = (s: string): FirstName[] =>
  s.split('|').map((x) => {
    const t = x.trim();
    const era = t.startsWith('*') ? 'old' : t.startsWith('^') ? 'young' : 'any';
    const body = era === 'any' ? t : t.slice(1);
    const sp = body.lastIndexOf(' ');
    return { en: body.slice(0, sp), zh: body.slice(sp + 1), era };
  });
export const parseLast = (s: string): string[] => s.split('|').map((x) => x.trim());

export const NAME_GROUPS: Record<GroupId, { name: string; families: NameFamily[] }> = {
  anglo: {
    name: '英裔',
    families: [
      {
        f: 'Emily 艾米莉|Sarah 莎拉|Megan 梅根|Jessica 杰西卡|Ashley 阿什莉|Hannah 汉娜|Lauren 劳伦|Katie 凯蒂|Brooke 布鲁克|Courtney 考特尼|*Linda 琳达|*Barbara 芭芭拉|*Susan 苏珊|*Nancy 南希|*Karen 凯伦|*Patricia 帕特里夏|*Margaret 玛格丽特|*Joan 琼|*Peggy 佩吉|Abigail 阿比盖尔|^Madison 麦迪逊|^Chloe 克洛伊|^Ella 埃拉|^Lily 莉莉|^Harper 哈珀',
        m: 'James 詹姆斯|Michael 迈克尔|Robert 罗伯特|David 大卫|William 威廉|*Richard 理查德|Thomas 托马斯|*Charles 查尔斯|Daniel 丹尼尔|Matthew 马修|Ryan 瑞安|Tyler 泰勒|Kevin 凯文|Brian 布莱恩|Scott 斯科特|*Gary 加里|*Doug 道格|*Walt 沃尔特|*Hank 汉克|*Bill 比尔|Jack 杰克|^Owen 欧文|^Luke 卢克|^Wyatt 怀亚特|^Hudson 哈德森',
        last: 'Miller|Johnson|Smith|Anderson|Thompson|Walker|Harris|Clark|Lewis|Young|Hall|Allen|Wright|King|Scott|Baker|Nelson|Carter|Mitchell|Parker|Collins|Stewart|Morris|Murphy|Cook|Rogers|Bennett|Brooks|Hayes|Foster|Sullivan|Price|Russell|Griffin|Whitaker',
      },
    ],
  },
  latino: {
    name: '拉丁裔',
    families: [
      {
        f: 'María 玛丽亚|Rosa 罗莎|Lucía 露西亚|Sofía 索菲亚|Valeria 瓦莱里娅|Camila 卡米拉|Daniela 丹妮拉|Gabriela 加布列拉|Ana 安娜|Carmen 卡门|Elena 埃莱娜|Isabel 伊莎贝尔|Marisol 玛丽索尔|Yesenia 叶塞尼娅|*Guadalupe 瓜达卢佩|*Teresa 特蕾莎|Paola 保拉|^Ximena 希梅娜|Lorena 洛雷娜|*Alma 阿尔玛|^Renata 雷纳塔',
        m: 'José 何塞|Luis 路易斯|Carlos 卡洛斯|Miguel 米格尔|Jorge 豪尔赫|Juan 胡安|Antonio 安东尼奥|Javier 哈维尔|Ricardo 里卡多|Fernando 费尔南多|Eduardo 爱德华多|Alejandro 亚历杭德罗|Rafael 拉斐尔|*Héctor 埃克托|Andrés 安德烈斯|^Diego 迭戈|^Mateo 马特奥|^Santiago 圣地亚哥|*Ramón 拉蒙|*Ernesto 埃内斯托|^Emiliano 埃米利亚诺',
        last: 'García|Martínez|Rodríguez|Hernández|López|González|Pérez|Sánchez|Ramírez|Torres|Flores|Rivera|Gómez|Díaz|Reyes|Morales|Cruz|Ortiz|Gutiérrez|Chávez|Ramos|Ruiz|Mendoza|Castillo|Vargas|Romero|Herrera|Medina|Aguilar|Delgado|Navarro|Salazar',
      },
    ],
  },
  asian: {
    name: '亚裔',
    families: [
      {
        f: 'Mei 美|Lin 琳|Ying 莹|Xiaowen 晓雯|Jenny 珍妮|Grace 格蕾丝|Vivian 薇薇安|^Chloe 克洛伊',
        m: 'Wei 伟|Jun 俊|Hao 浩|Tony 托尼|Kevin 凯文|Eric 埃里克|Jason 杰森|^Ethan 伊森',
        last: 'Chen|Wang|Li|Zhang|Liu|Huang|Wong|Lam|Lau|Ho',
      },
      {
        f: 'Yuki 由纪|Aiko 爱子|Emi 惠美|Hana 花子',
        m: 'Kenji 健二|Hiro 浩|Takeshi 武|Ken 健',
        last: 'Tanaka|Nakamura|Yamamoto|Sato|Takahashi|Kobayashi|Watanabe',
      },
      {
        f: 'Min-ji 敏智|Soo-ah 秀雅|Ji-woo 智友|Eun-ji 恩智',
        m: 'Min-jun 敏俊|Joon 俊|Dong-hyun 东贤|Sung 成',
        last: 'Kim|Park|Lee|Choi|Jung|Kang|Cho',
      },
      {
        f: 'Linh 玲|Thao 草|Mai 梅|Lan 兰',
        m: 'Minh 明|Tuan 俊|Bao 宝|Duc 德',
        last: 'Nguyen|Tran|Pham|Le|Vu|Hoang',
      },
      {
        f: 'Maricel 玛丽塞尔|Joy 乔伊|Christine 克里斯汀|Rowena 罗威娜',
        m: 'Paolo 保罗|Mark 马克|Jericho 杰里科|Rommel 罗梅尔',
        last: 'Santos|Bautista|Villanueva|Aquino|Dizon|Mercado',
      },
      {
        f: 'Priya 普丽娅|Anjali 安贾莉|Divya 迪薇娅|Neha 妮哈',
        m: 'Raj 拉吉|Arjun 阿尔琼|Vikram 维克拉姆|Sanjay 桑杰',
        last: 'Patel|Shah|Gupta|Singh|Reddy|Iyer|Desai',
      },
    ],
  },
  black: {
    name: '黑人',
    families: [
      {
        f: '^Aaliyah 阿莉娅|Jasmine 贾斯敏|^Destiny 黛丝蒂妮|Imani 伊玛尼|Keisha 基莎|Tamika 塔米卡|Monique 莫妮克|*Denise 丹尼丝|*Gloria 格洛丽亚|*Loretta 洛蕾塔|Angela 安吉拉|^Brianna 布莉安娜|Nia 妮娅|Zora 佐拉|Simone 西蒙娜|Ebony 艾博妮|Adaeze 阿黛泽|Amara 阿玛拉',
        m: 'Marcus 马库斯|Darnell 达内尔|Jamal 贾马尔|Andre 安德烈|Terrence 特伦斯|*Reggie 雷吉|*Curtis 柯蒂斯|*Calvin 卡尔文|Dwayne 德韦恩|Malik 马利克|Isaiah 以赛亚|^Jalen 杰伦|Xavier 泽维尔|*Otis 奥蒂斯|*Clarence 克拉伦斯|Desmond 德斯蒙德|Chidi 奇迪|Kwame 夸梅',
        last: 'Washington|Jackson|Robinson|Williams|Brown|Davis|Jefferson|Coleman|Banks|Freeman|Gaines|Holloway|Pryor|Simmons|Tate|Dixon|Harper|Bell|Grant|Owens|Mack|Haynes|Battle|Greene|Booker|Wiggins|McCray|Okafor|Mensah|Adeyemi|Thornton',
      },
    ],
  },
  mideast: {
    name: '中东',
    families: [
      {
        f: 'Layla 蕾拉|Yasmin 雅斯敏|Noor 努尔|Rania 拉妮娅|Dalia 达莉娅|Hana 哈娜|Mariam 玛丽亚姆|Samira 萨米拉|Nadia 娜迪娅|Farah 法拉|Shirin 希琳|Azadeh 阿扎德|Lina 莉娜|Zeynep 泽内普|Maya 玛雅|Dina 迪娜|Rana 拉娜',
        m: 'Omar 奥马尔|Karim 卡里姆|Sami 萨米|Tariq 塔里克|Nabil 纳比尔|Hassan 哈桑|Ali 阿里|Yusuf 优素福|Khalil 哈利勒|Rami 拉米|Fadi 法迪|Elias 埃利亚斯|Darius 达里乌斯|Kian 基安|Emre 埃姆雷|Amir 阿米尔|Ziad 齐亚德',
        last: 'Haddad|Khoury|Nasser|Saleh|Mansour|Farah|Aziz|Hakimi|Karimi|Rahimi|Tehrani|Abboud|Daher|Habib|Issa|Jaber|Kassab|Najjar|Rashid|Sabbagh|Shamoun|Yousef|Zaki|Bishara|Akbari|Moradi|Demir|Yilmaz|Sarkis|Toma',
      },
    ],
  },
  euro: {
    name: '欧洲候鸟',
    families: [
      {
        f: 'Ingrid 英格丽|Brigitte 布里吉特|Helga 赫尔加|Sabine 萨比娜|Elke 埃尔克|Greta 格蕾塔',
        m: 'Hans 汉斯|Klaus 克劳斯|Dieter 迪特|Reto 雷托|Matthias 马蒂亚斯|Jürgen 于尔根',
        last: 'Müller|Schmidt|Becker|Hoffmann|Weber|Keller|Brunner|Huber',
        from: 'Hamburg|Munich|Zürich|Vienna|Cologne',
      },
      {
        f: 'Astrid 阿斯特丽德|Margit 玛吉特|Annika 安妮卡|Freya 弗蕾雅|Liv 莉芙',
        m: 'Lars 拉尔斯|Sven 斯文|Nils 尼尔斯|Henrik 亨里克|Bjørn 比约恩',
        last: 'Lindqvist|Andersson|Johansson|Nilsson|Larsen|Hansen',
        from: 'Stockholm|Oslo|Copenhagen|Gothenburg|Bergen',
      },
      {
        f: 'Liesbeth 莉斯贝特|Anouk 阿努克|Marieke 玛丽克',
        m: 'Pieter 彼得|Jan 扬|Joris 约里斯',
        last: 'De Vries|Van Dijk|Jansen|Peeters|Visser',
        from: 'Amsterdam|Antwerp|Utrecht|Rotterdam',
      },
      {
        f: 'Françoise 弗朗索瓦丝|Elodie 埃洛迪|Sylvie 西尔维',
        m: 'Olivier 奥利维耶|Jean-Luc 让-吕克|Thierry 蒂埃里',
        last: 'Dubois|Moreau|Laurent|Lefèvre',
        from: 'Lyon|Paris|Bordeaux|Nice',
      },
      {
        f: 'Chiara 基娅拉|Giulia 朱莉娅|Paola 保拉',
        m: 'Marco 马可|Giorgio 乔治奥|Luca 卢卡',
        last: 'Rossi|Bianchi|Ferrari|Conti',
        from: 'Milan|Turin|Bologna|Como',
      },
      {
        f: 'Siobhan 肖文|Maeve 梅芙|Fiona 菲奥娜|Gillian 吉莉安',
        m: 'Nigel 奈杰尔|Alistair 阿利斯泰尔|Colm 科尔姆|Graham 格雷厄姆',
        last: 'O’Brien|Byrne|Walsh|Kelly|Hughes|Fletcher|Ashworth',
        from: 'Dublin|Manchester|Edinburgh|Leeds|Cork',
      },
    ],
  },
  canada: {
    name: '加拿大候鸟',
    families: [
      {
        f: 'Marie-Claude 玛丽-克劳德|Geneviève 热纳维耶芙|Chantal 尚塔尔|Josée 若赛|Nathalie 娜塔莉|Sylvie 西尔维|Manon 马农',
        m: 'Gilles 吉勒|Réjean 雷让|Denis 德尼|Marc-André 马克-安德烈|Yves 伊夫|Normand 诺尔芒|Luc 吕克',
        last: 'Tremblay|Gagnon|Roy|Côté|Bouchard|Gauthier|Morin|Lavoie|Fortin|Gagné|Ouellet|Pelletier|Bélanger|Lévesque|Chartrand',
        from: 'Montréal|Québec City|Sherbrooke|Trois-Rivières',
      },
      {
        f: 'Diane 黛安|Carol 卡罗尔|Sharon 莎伦|Donna 唐娜|Brenda 布伦达|Heather 希瑟|Shannon 香农|Wendy 温迪|Colleen 科琳|Gail 盖尔|Sandra 桑德拉|Lorraine 洛林',
        m: 'Gord 戈德|Wayne 韦恩|Bruce 布鲁斯|Glen 格伦|Murray 默里|Doug 道格|Brent 布伦特|Randy 兰迪|Darryl 达里尔|Kirk 柯克|Rob 罗布|Stu 斯图',
        last: 'MacDonald|MacLeod|Campbell|Fraser|McKenzie|Sinclair|Robertson|Henderson|Kowalchuk|Hryniuk|Lindgren|Thiessen|Friesen|Penner|Wiebe|Boychuk|Sawchuk',
        from: 'Calgary|Edmonton|Winnipeg|Saskatoon|Regina|Vancouver|Victoria|Toronto',
      },
    ],
  },
};

/** 一组里所有的名 / 姓（测试数个数用） */
export function groupCounts(g: GroupId): { first: number; last: number } {
  let first = 0;
  let last = 0;
  for (const fam of NAME_GROUPS[g].families) {
    first += parseFirst(fam.f).length + parseFirst(fam.m).length;
    last += parseLast(fam.last).length;
  }
  return { first, last };
}
