// 镂空图案（alphaMap 读 g 通道）：铁丝网的菱形格、球网的方格。带 mipmap，远看成一层半透明的灰。
import * as THREE from 'three';

function tex(size: number, on: (x: number, y: number) => number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = Math.round(THREE.MathUtils.clamp(on(x, y), 0, 1) * 255);
      data.set([a, a, a, 255], (y * size + x) * 4);
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** 铁丝网：一个周期一个菱形，线宽约 1/6 周期 */
export function chainLinkTexture(): THREE.DataTexture {
  const n = 12;
  return tex(n, (x, y) => {
    const a = (x + y) % n;
    const b = (x - y + n) % n;
    return a < 3 || b < 3 ? 1 : 0;
  });
}

/** 球网：方格 */
export function netTexture(): THREE.DataTexture {
  const n = 8;
  return tex(n, (x, y) => (x < 4 || y < 4 ? 1 : 0));
}
