// court-light：球场灯杆（clubclay #9，所有球场场景共用）。8.8 米：混凝土地基 + 往上收的方钢杆（绿漆，3 纹素 → 2.5 纹素）
// + 齐眼高的检修盒 + 顶上一根横担挂两盏朝场地斜 15° 的泛光灯（灯箱暗铁、灯面奶白）。
// 原点 = 杆脚中心；灯朝本地 +z。SLOTS 里请给 rotY = atan2(场心 x − 杆 x, 场心 z − 杆 z)，灯就对着场心
// （不给 = 灯朝镜头，北边那排对、南边那排是背面）。也可以只转灯头：userData.aim(rad)。
// **默认不投影**（clubclay 白模的结论：8.8 米的细杆投影横穿球场，是噪点）。
// userData：
//   setCastShadow(on)  打开 / 关掉投影（默认关）
//   setOn(on)          开灯：灯面换成自发光的暖白（夜景用；默认关）
//   aim(rad)           灯头绕竖轴转（相对杆身）
//   night              给 clubsite/daylight 的：{ setOn, pool() }，天黑自动开灯，pool() = 灯光圈 [x, z, 半径, 照到的最高 y]（世界坐标，跟着灯头朝向）
import * as THREE from 'three';
import { Bucket, box, DU, FACING, type NetCtx } from './nets/kit';

const H = 8.8;

export function build(ctx: NetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const poleM = ctx.mat('metal', { ...FACING, convex: 0.6, edge: 0.5 });
  const capM = ctx.mat('metal', { convex: 0.9, edge: 0.5, noShadowReceive: true });
  const ironM = ctx.mat('ironwork', { ...FACING, convex: 0.7, edge: 0.5 });
  const footM = ctx.mat('concrete', { convex: 0.6, edge: 0.4 });
  // 灯面：朝前下方，本来落中档（灰紫）—— 档位压到底，永远是亮档的奶白
  const lensOff = ctx.mat('clothWhite', {
    bands: [-2, -1.5],
    edge: 0.2,
    convex: 0,
    noShadowReceive: true,
  });
  const lensOn = ctx.mat('clothWhite', {
    bands: [-2, -1.5],
    edge: 0.2,
    convex: 0,
    noShadowReceive: true,
    emissive: 0x6a5a30,
  });

  const b = new Bucket();
  // 地基：一块比杆子宽一圈的混凝土墩（露出地面 0.3）
  b.add(footM, box(0.54, 0.3, 0.54, 0, 0, 0));
  // 杆：往上收的方杆（四棱，面法线 → 每个面一个颜色）
  const pole = new THREE.CylinderGeometry(0.22 / Math.SQRT2, 0.3 / Math.SQRT2, H - 0.75, 4, 1, true)
    .rotateY(Math.PI / 4)
    .translate(0, 0.3 + (H - 0.75) / 2, 0)
    .toNonIndexed();
  pole.computeVertexNormals();
  b.add(poleM, pole);
  // 杆顶的帽 + 横担（沿 x）
  b.add(capM, box(0.3, DU, 0.3, 0, H - 0.45, 0));
  b.add(poleM, box(1.3, 0.14, 0.14, 0, H - 0.5, 0.05));
  // 检修盒：齐眼高、朝灯的方向（一块 3 × 4 纹素的暗铁）
  b.add(ironM, box(0.27, 0.42, 0.1, 0, 1.15, 0.13 + 0.05));
  b.build(ctx.mats, g);

  // 灯头：两盏泛光灯，挂在横担前面、往下斜 15°（真的灯斜得更多，但 45° 俯视下灯面就成了一条缝：
  // 斜得少一点，灯面在屏幕上是两块 5 × 4 纹素的奶白方块，远看是"这是灯"）
  const head = new THREE.Group();
  head.position.set(0, H - 0.5, 0.05);
  g.add(head);
  const hb = new Bucket();
  const lens: THREE.BufferGeometry[] = [];
  for (const x of [-0.33, 0.33]) {
    const lamp = new THREE.Matrix4().makeRotationX(0.26).setPosition(x, -0.12, 0.2);
    // 灯箱：0.5 宽、0.44 高、0.14 厚（本地 +z 是灯面）；灯面四周留一圈半纹素的暗框
    hb.add(ironM, new THREE.BoxGeometry(0.5, 0.44, 0.14).applyMatrix4(lamp));
    // 支架：横担到灯箱背面
    hb.add(ironM, box(0.09, 0.14, 0.16, x, -0.08, 0.05));
    lens.push(new THREE.BoxGeometry(0.42, 0.36, 0.02).translate(0, -0.01, 0.075).applyMatrix4(lamp));
  }
  hb.build(ctx.mats, head);
  const lb = new Bucket();
  for (const l of lens) lb.add(lensOff, l);
  const [merged] = lb.build(ctx.mats, head);

  const setCast = (on: boolean) =>
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = on;
    });
  setCast(false);
  g.userData.setCastShadow = setCast;
  g.userData.setOn = (on: boolean) => {
    merged.material = on ? lensOn : lensOff;
  };
  g.userData.aim = (rad: number) => {
    head.rotation.y = rad;
  };
  // 灯光圈：灯头朝向前方 6.5 米为圆心、半径 6.5 米（一盏灯照亮场地的一角和杆子本身；一片场四盏拼起来差不多盖住场地，往场外漏得少），照到灯头那么高
  const poolC = new THREE.Vector3();
  g.userData.night = {
    setOn: g.userData.setOn,
    pool: (): [number, number, number, number] => {
      head.updateWorldMatrix(true, false);
      poolC.set(0, 0, 6.5).applyMatrix4(head.matrixWorld);
      return [poolC.x, poolC.z, 6.5, H + 0.6];
    },
  };
  return g;
}
