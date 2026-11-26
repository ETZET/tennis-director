import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径，方便部署到任意静态托管的子目录
  base: './',
  build: {
    target: 'es2022',
    // 单页应用暂不拆包
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        // 页面目录（2.5D 的场景查看器、活动库、demo、人物方案页已归档：docs/archive/iso-2.5d，ADR 0027）
        index: resolve(import.meta.dirname, 'index.html'),
        // 3D 像素画实验（three.js，只在 sandbox）
        desert3d: resolve(import.meta.dirname, 'desert3d.html'),
        pond3d: resolve(import.meta.dirname, 'pond3d.html'),
        'desert3d-v2': resolve(import.meta.dirname, 'desert3d-v2.html'),
        // 俱乐部前台和大门（白模 → 素材，.claude/skills/pixel-scene）
        clubfront: resolve(import.meta.dirname, 'clubfront.html'),
        // 整座俱乐部的微缩地图（确认大布局）
        clubmap: resolve(import.meta.dirname, 'clubmap.html'),
        clubmap2: resolve(import.meta.dirname, 'clubmap2.html'),
        clubpark: resolve(import.meta.dirname, 'clubpark.html'),
        clubdesk: resolve(import.meta.dirname, 'clubdesk.html'),
        clubpickle: resolve(import.meta.dirname, 'clubpickle.html'),
        clubclay: resolve(import.meta.dirname, 'clubclay.html'),
        clubplaza: resolve(import.meta.dirname, 'clubplaza.html'),
        clubstadium: resolve(import.meta.dirname, 'clubstadium.html'),
        clubcourts: resolve(import.meta.dirname, 'clubcourts.html'),
        clubfood: resolve(import.meta.dirname, 'clubfood.html'),
        clubhouse: resolve(import.meta.dirname, 'clubhouse.html'),
        // 会所三层的平面图（Canvas 2D，从 layout.ts 现读；?floor=-1|1|2）
        'clubhouse-plan': resolve(import.meta.dirname, 'clubhouse-plan.html'),
        clubpool: resolve(import.meta.dirname, 'clubpool.html'),
        // 所有做好的场景连成一个大世界（按区域加载，src/clubwalk）
        clubwalk: resolve(import.meta.dirname, 'clubwalk.html'),
        clubgolf: resolve(import.meta.dirname, 'clubgolf.html'),
        // 俱乐部拆成四张主题小图（《垂钓手记》的地图搭法：边缘密、中间空、层间暗带、主路斜弯；圆形转场，src/clubvista）
        clubvista: resolve(import.meta.dirname, 'clubvista.html'),
        // 人物一览：clubsite/people 的 Q 版人按 CastLook 换装（src/cast）
        cast: resolve(import.meta.dirname, 'cast.html'),
        // 俱乐部所在的小镇和山谷：平面图（Canvas 2D，src/valley/layout.ts 现读）
        valleyplan: resolve(import.meta.dirname, 'valleyplan.html'),
        // 小镇和山谷：clubwalk 的大世界 + 整座山谷的白模（走路、球车、汽车、分区解锁）
        valley: resolve(import.meta.dirname, 'valley.html'),
        // valley 市中心三栋办事楼的资产画廊（?asset=<id>；不带 = 列表）
        valleyassets: resolve(import.meta.dirname, 'valleyassets.html'),
      },
    },
  },
});
