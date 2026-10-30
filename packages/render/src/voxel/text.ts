import * as THREE from 'three';

/** 像素字体的文字贴图。字体加载完成后会重画一次。 */
export function textTexture(
  text: string,
  w: number,
  h: number,
  bg: string,
  fg: string,
  font: string,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  const draw = () => {
    const x = c.getContext('2d');
    if (!x) return;
    x.imageSmoothingEnabled = false;
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    x.fillStyle = fg;
    x.font = font;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, w / 2, h / 2 + 1);
    tex.needsUpdate = true;
  };
  draw();
  if (document.fonts?.load)
    document.fonts
      .load(font)
      .then(draw)
      .catch(() => {});
  return tex;
}

/** 一块立在场景里的招牌。 */
export function sign(
  scene: THREE.Object3D,
  text: string,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  ry: number,
  bg: string,
  fg: string,
  px: number,
): THREE.Mesh {
  const tex = textTexture(text, Math.round(w * 40), Math.round(h * 40), bg, fg, `700 ${px}px Silkscreen, monospace`);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  scene.add(m);
  return m;
}
