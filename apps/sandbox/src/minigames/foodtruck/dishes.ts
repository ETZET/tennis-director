// 餐车出餐的 3D 小东西（同 clubfood 的 food-tray 的做法：clubfood 调色板的材质、朝天的面亮档、竖面 lightUp 到中档、不接投影）。
// 四样吃的放大了一圈（手机竖屏上一份吃的也要有 5～6 个像素看得出颜色）：
//   冰柠檬水  黄杯 + 白盖 + 红吸管（鲜果水车的柠檬水黄）
//   冰沙      粉杯 + 白圆顶盖 + 薄荷吸管（冰棍车的粉、咖啡车的薄荷）
//   卷饼      一条横放的饼（面包色）+ 两头露出的生菜绿 / 橙馅
//   窑烤披萨  一角（奶酪黄 + 饼边 + 两片肠）
// 端的托盘：一只红托盘（同 food-tray 的托盘），上面左右两个位子。
import * as THREE from 'three';
import type { AssetCtx } from '../../clubfood/ctx';
import type { Pal } from '../../clubfood/palette';
import type { ToonOpts } from '../../clubsite/render/toon';
import type { ItemId } from './rules';

const BASE: ToonOpts = { lightUp: 0.55, bands: [-0.45, 0.35], noShadowReceive: true, convex: 0.25, edge: 0.45 };

type Part = [keyof Pal, THREE.BufferGeometry, ToonOpts?];

/** 竖着的低多边形杯（6 边：像素下读成方中带圆） */
const cup = (r0: number, r1: number, h: number, y: number) =>
  new THREE.CylinderGeometry(r1, r0, h, 6).translate(0, y + h / 2, 0);
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

function partsOf(item: ItemId): Part[] {
  switch (item) {
    case 'lemon':
      return [
        ['accChurro', cup(0.075, 0.095, 0.24, 0)],
        ['clothWhite', cup(0.1, 0.1, 0.03, 0.24)],
        ['flowerRed', box(0.025, 0.14, 0.025, 0.03, 0.26, 0).rotateZ(-0.25)],
        // 杯沿上一片柠檬
        ['accBurger', box(0.08, 0.07, 0.025, -0.1, 0.18, 0.04)],
      ];
    case 'smoothie':
      return [
        ['accPaleta', cup(0.075, 0.1, 0.22, 0)],
        ['clothWhite', new THREE.SphereGeometry(0.1, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.22, 0)],
        ['accCoffee', box(0.03, 0.16, 0.03, -0.02, 0.27, 0)],
      ];
    case 'wrap':
      return [
        ['bun', box(0.3, 0.12, 0.14, 0, 0, 0)],
        ['accBurger', box(0.04, 0.1, 0.12, 0.17, 0.01, 0)],
        ['accTaco', box(0.03, 0.06, 0.08, 0.19, 0.03, 0)],
        ['clothWhite', box(0.12, 0.13, 0.15, -0.09, 0, 0)],
      ];
    case 'pizza': {
      // 一角：尖朝镜头（+z）
      const s = new THREE.Shape();
      s.moveTo(-0.15, -0.1);
      s.lineTo(0.15, -0.1);
      s.lineTo(0, 0.17);
      s.closePath();
      const slice = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false })
        .rotateX(-Math.PI / 2)
        .translate(0, 0, 0);
      // rotateX(−π/2)：形状的 +y → −z。要尖朝 +z：先绕 y 转半圈
      slice.rotateY(Math.PI);
      return [
        ['flowerYellow', slice],
        ['bun', box(0.32, 0.08, 0.06, 0, 0, -0.12)],
        ['accPizza', box(0.06, 0.02, 0.06, -0.04, 0.05, -0.02)],
        ['accPizza', box(0.06, 0.02, 0.06, 0.03, 0.05, 0.06)],
      ];
    }
  }
}

/** 一份吃的（原点 = 底面中心） */
export function buildDish(ctx: AssetCtx, item: ItemId, scale = 1): THREE.Object3D {
  const g = new THREE.Group();
  g.name = `foodtruck:${item}`;
  for (const [key, geo, extra] of partsOf(item)) g.add(new THREE.Mesh(geo, ctx.mat(key, { ...BASE, ...extra })));
  g.scale.setScalar(scale);
  ctx.mats.prepare(g, { cast: true, receive: false });
  return g;
}

/** 端的托盘：红托盘 + 两个位子（slots[0] 左、slots[1] 右），每个位子里四样吃的各一份（显示手上那样） */
export function buildCarryTray(ctx: AssetCtx): {
  obj: THREE.Group;
  show(items: readonly ItemId[]): void;
} {
  const g = new THREE.Group();
  g.name = 'foodtruck:tray';
  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.04, 0.4).translate(0, 0.02, 0),
    ctx.mat('flowerRed', { ...BASE }),
  );
  g.add(tray);
  const ids: ItemId[] = ['lemon', 'smoothie', 'wrap', 'pizza'];
  const slots = [-0.15, 0.15].map((x) => {
    const m = new Map<ItemId, THREE.Object3D>();
    for (const id of ids) {
      const d = buildDish(ctx, id, 0.85);
      d.position.set(x, 0.04, 0);
      d.visible = false;
      g.add(d);
      m.set(id, d);
    }
    return m;
  });
  ctx.mats.prepare(g, { cast: true, receive: false });
  return {
    obj: g,
    show(items) {
      slots.forEach((m, i) => {
        for (const [id, o] of m) o.visible = items[i] === id;
      });
      // 只有一份：放在中间
      const one = items.length === 1;
      for (const o of slots[0]?.values() ?? []) o.position.x = one ? 0 : -0.15;
    },
  };
}
