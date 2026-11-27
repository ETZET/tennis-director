// 夜里的灯（light 代理，第三轮）：按图 id 补进各图 props 的摆件（build.ts 摆件循环里拼在 def.props 后面）。
// 都是白天不起眼、天黑自己亮的东西（clubsite/daylight 的 userData.night）：路灯、灯串、水下灯、练习场的灯杆。
// 地图数据归 world 代理（map-*.ts）；灯放这里，两边改不撞。新图要灯：在这里按 id 加几行，或直接写进自己的 props。
import type { Prop } from './mapdef';

/** 灯杆朝向场心 */
const aim = (x: number, z: number, cx: number, cz: number) => Math.atan2(cx - x, cz - z);

export const NIGHT_PROPS: Record<string, Prop[]> = {
  // 歇脚：露台两条灯串（北边贴着会所、南边沿露台边）、小路边三盏路灯、池底两盏水下灯
  oasis: [
    { a: 'string-lights', x: 15.2, z: 9.3, v: 1, block: false },
    { a: 'string-lights', x: 13.6, z: 17, v: 2, block: false },
    { a: 'path-lamp', x: 20.2, z: 22.8, block: 0.25 },
    { a: 'path-lamp', x: 20.3, z: 31.6, block: 0.25 },
    { a: 'path-lamp', x: 4.2, z: 42.6, block: 0.25 },
    { a: 'pool-light', x: 8.1, z: 24.5, y: -0.88, block: false },
  ],
  // 到达：公交站边、上台阶前、前台广场边各一盏路灯（候车亭、前台自己有灯）
  arrive: [
    { a: 'path-lamp', x: 12.2, z: 43, block: 0.25 },
    { a: 'path-lamp', x: 16.6, z: 31.2, block: 0.25 },
    { a: 'path-lamp', x: 15.8, z: 15.4, block: 0.25 },
  ],
  // 练习场：四根灯杆（同中心球场，站在下沉场地的外沿）
  practice: [
    { a: 'court-light', x: 1.2, z: 15.4, r: aim(1.2, 15.4, 12, 32.5), block: 0.3 },
    { a: 'court-light', x: 22.8, z: 15.4, r: aim(22.8, 15.4, 12, 32.5), block: 0.3 },
    { a: 'court-light', x: 1.2, z: 50, r: aim(1.2, 50, 12, 32.5), block: 0.3 },
    { a: 'court-light', x: 22.8, z: 50, r: aim(22.8, 50, 12, 32.5), block: 0.3 },
  ],
};
