// 体育用品店（网球专卖 Pro Shop）：x 241…263（h 5.5，正面 z −715）；门前院子 sports_yard 240…263.4 × −714.8…−687。
// 构图、资产清单：docs/lab/2026-11-07-3d-pixel/valley-town.md「2. 体育用品店」。这个文件归体育店的资产代理（批 S），
// 资产在 src/valley/assets/sports.ts（画廊 valleyassets.html?asset=<id>）。
// 用户 2026-11-16 定：门前不要试拍小场和对墙 —— 门前是一块普通的店面前场（陶砖铺地 + 门口的穿线台、球罐桶、小黑板、长椅）。
// 规矩：入口朝南；门前 3 米是旗子（p_sports 门槛 (258, −714.5)，旗子 (258, −711.5)），那一圈不放东西；挂在立面上的东西只在南面。
// 关键帧：竖屏 at=254,-711（门面、橱窗、壁画、穿线台、球罐桶都在画面里，大网球在小地图左下）。
import type * as THREE from 'three';
import { makeAsset } from '../../assets';
import type { DetailCtx } from '../../build';
import { siteKit, Y } from './kit';

/** 楼的中心（= layout.ts 的 BUILDINGS sports）、立面 */
const BX = 252;
const BZ = -724;
const FZ = -715;
/** build.ts 屋顶板顶 5.85 + 资产屋面皮 0.02 */
const DECK = 5.87;

export function detailSports(d: DetailCtx): void {
  const k = siteKit(d, d.rng('valley:sports'));
  const { flat, bench, blockRect, block } = k;
  const place = (id: string, x: number, y: number, z: number, rot = 0, v = 0): THREE.Object3D => {
    const { obj } = makeAsset(id, { ...d.actx, variant: v });
    obj.position.set(x, y, z);
    obj.rotation.y = rot;
    d.asset(obj);
    return obj;
  };
  // 门面（立面上的橱窗、门、雨棚、招牌、壁画 + 女儿墙 + 屋顶设备；原点 = 楼的中心）
  place('sports-front', BX, 0, BZ);
  // 门正上方、屋顶前沿的大网球（门 x 258.5；女儿墙在 z −715.0…−714.7，球在它北边）
  place('sports-ball-sign', 258.5, DECK, FZ - 1.3);
  // 门廊上的穿线台（橱窗东头前面，离门 2 米）
  place('stringing-station', 255.5, 0, -713.4);
  blockRect(255.5, -713.4, 1.3, 0.9);
  // 门东边的特价球罐桶、前场东南角朝大道的人字小黑板（共用资产 a-board v1 = 体育店）
  place('ballcan-bin', 261.0, 0, -713.3);
  block({ x: 261.0, z: -713.3, r: 0.45 });
  place('a-board', 261.9, 0, -710.4, -0.25, 1);
  block({ x: 261.9, z: -710.4, r: 0.45 });
  // 店面前场：陶砖铺地（整个店面宽，门到大道人行道）；西半边实墙（大球拍壁画）前一条长椅
  flat('tile', 22.4, 6.4, 252.2, Y.pave, -711.6);
  bench(246.4, -713.7, 0);
  k.finish();
}
