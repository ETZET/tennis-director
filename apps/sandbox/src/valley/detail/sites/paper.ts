// 《沙漠太阳报》报社：x 237…261 两层办公（h 8，正面 z −651）+ 后面印刷车间（238…260 × −686…−666，h 6）+ 西边货场（paper_yard）。
// 构图、资产清单：docs/lab/2026-11-07-3d-pixel/valley-town.md「1. 《沙漠太阳报》」。这个文件归报社的资产代理（批 P）：
// 资产画在 src/valley/assets/paper.ts（画廊 valleyassets.html?asset=<id>），这里只摆：makeAsset(id, d.actx) → 世界坐标 → d.asset(obj)。
// 规矩：入口朝南；门前 3 米是旗子（总监办事站的地方，p_paper 门槛 (249, −649)），那一圈不放东西；挂在立面上的东西只在南面。
// 楼身（墙、屋顶板）是 build.ts 的 BUILDINGS 盒子；paper-front 只贴南立面 + 屋顶边，paper-press-roof 坐在车间的屋顶板上。
import type * as THREE from 'three';
import { makeAsset } from '../../assets';
import type { DetailCtx } from '../../build';
import { siteKit } from './kit';

export function detailPaper(d: DetailCtx): void {
  const k = siteKit(d, d.rng('valley:paper'));
  const { blockRect, claim, bench } = k;
  const fz = -651;
  /** 放一件资产（原点 = 落地点中心，转 rot 弧度）；v = 变体 */
  const place = (id: string, x: number, z: number, rot = 0, v = 0): THREE.Object3D => {
    const { obj } = makeAsset(id, v ? { ...d.actx, variant: v } : d.actx);
    obj.position.set(x, 0, z);
    obj.rotation.y = rot;
    d.asset(obj);
    return obj;
  };

  // paper-front：南立面 + 屋顶边（原点 = 楼的中心）。门那一跨不盖顶；门东一翼拱廊（往外 2.6 米）；门前三级台阶（往外 1.5 米）
  place('paper-front', 249, -659);
  blockRect(6.975 + 249, fz + 1.3, 8.6, 2.6); // 拱廊（前墙 + 墩子）
  blockRect(249, fz + 0.75, 5.4, 1.5); // 台阶
  blockRect(249 + 12.75, fz - 4.5, 1.6, 0.3); // 东墙的竖招牌（离地 3.6 米，不挡人：只占一条）
  blockRect(260.55, fz + 2.95, 0.7, 0.7); // 九重葛的陶盆（东头拱廊前、西头墙角、门西壁柱脚）
  blockRect(237.4, fz + 0.45, 0.7, 0.7);
  blockRect(245.7, fz + 0.95, 0.6, 0.6);
  // paper-tower：门西边的塔（凸出立面 0.6 米，塔身大半在楼里）
  place('paper-tower', 243.25, fz + 0.6 - 2.75);
  blockRect(243.25, fz + 0.3, 5.5, 0.6);
  // paper-press-roof：印刷车间的锯齿顶（原点 = 车间中心地面；车间的盒子 h 6 + 屋顶板 0.35）
  place('paper-press-roof', 249, -676);

  // paper-newsrack ×4：塔奎兹路人行道靠路缘一排（太阳报自己的深蓝两个 + 红、黄两家别的报），间距不等
  for (const [i, x] of [252.6, 253.42, 254.3, 255.18].entries()) place('paper-newsrack', x, -641.9, 0, i);
  claim({ x0: 251.8, x1: 256.2, z0: -642.6, z1: -641.2 });
  blockRect(253.9, -641.9, 3.3, 0.5);
  // a-board：拱廊西头一块"今日头条"小黑板（共用资产，assets/shared.ts，v0 = 报社）；长椅（kit 的）在门东边的拱廊前
  place('a-board', 243.5, -646.6);
  blockRect(243.5, -646.6, 0.8, 0.5);
  bench(255.5, -647.3, 0);

  // 西边货场（paper_yard）：送报车（车头朝南）、一托新闻纸卷、两摞捆好的报纸
  place('paper-van', 229, -675);
  blockRect(229, -675, 2.2, 5.4);
  place('newsprint-rolls', 234.4, -682);
  blockRect(234.4, -682, 2.6, 1.3);
  place('paper-bundles', 234.6, -671.5);
  blockRect(234.6, -671.5, 1.2, 0.9);
  place('paper-bundles', 233.1, -671.9, 0, 1);
  blockRect(233.1, -671.9, 1.2, 0.9);
  k.finish();
}
