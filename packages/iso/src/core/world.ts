/**
 * IsoWorld：旧 Stage 的替身（契约见 docs/design/iso-architecture.md）。
 * 一个容器里放画布（IsoView）、镜头（IsoCamera）、动态根节点 scene、静态根节点 statics、地面贴图 ground。
 */
import { IsoCamera, type IsoCameraPose } from './camera';
import { Group, type Node } from './graph';
import type { GroundPainter, Lamp, Rect } from './ground';
import { IsoView } from './view';

export interface IsoWorld {
  readonly container: HTMLElement;
  readonly view: IsoView;
  readonly camera: IsoCamera;
  /** 动态根节点：人物、球、活动道具都挂这里 */
  readonly scene: Node;
  /** 静态根节点：场景构建挂这里（改了要 view.invalidate()） */
  readonly statics: Node;
  /** 地面贴图：paintRect / paintCirc（改完自动标脏） */
  readonly ground: GroundPainter;
  /** 夜里的灯光池，返回移除函数 */
  addLamp(l: Lamp): () => void;
  /** dt 秒，now 演出时间（秒） */
  render(dt: number, now: number): void;
  /** 拆掉画布和事件 */
  dispose(): void;
}

export interface IsoWorldOptions {
  /** 容器背景色（画布还没画出来时、加载时看到的颜色） */
  sky: string;
  /** 场地范围（镜头平移的默认限制） */
  bounds: Rect;
  /** 地台（浮空岛）范围；默认 bounds 外扩 12 米 */
  slab?: Rect;
  /** 地台厚度（米），默认 7；小岛可以薄一些 */
  slabDepth?: number;
  /** 初始镜头 */
  pose?: IsoCameraPose;
  /** 每个缓冲像素多少 CSS 像素（默认手机 1、宽屏 2） */
  pixelSize?: number;
}

export type { Rect };

export function createIsoWorld(container: HTMLElement, o: IsoWorldOptions): IsoWorld {
  const b = o.bounds;
  const slab = o.slab ?? { x0: b.x0 - 12, x1: b.x1 + 12, z0: b.z0 - 12, z1: b.z1 + 12 };
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.style.background = o.sky;
  const view = new IsoView(container, { slab, slabDepth: o.slabDepth, pixelSize: o.pixelSize });
  const pose: IsoCameraPose = o.pose ?? { tx: (b.x0 + b.x1) / 2, tz: (b.z0 + b.z1) / 2, zoom: 4, rot: 0 };
  const camera = new IsoCamera(view, pose, {
    zoom: [2, 15.6],
    tx: [Math.min(b.x0, b.x1), Math.max(b.x0, b.x1)],
    tz: [Math.min(b.z0, b.z1), Math.max(b.z0, b.z1)],
  });
  const unbind = camera.bindPointer(view.canvas);
  const scene = new Group();
  scene.name = 'scene';
  const statics = new Group();
  statics.name = 'statics';
  const onResize = () => camera.resize();
  window.addEventListener('resize', onResize);
  return {
    container,
    view,
    camera,
    scene,
    statics,
    ground: view.ground,
    addLamp: (l) => view.ground.addLamp(l),
    render(dt, now) {
      if (!camera.takeUpdated()) camera.update(dt, null);
      view.render(scene, statics, now);
    },
    dispose() {
      unbind();
      window.removeEventListener('resize', onResize);
      view.canvas.remove();
    },
  };
}
