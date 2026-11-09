// 参考图（先转成 PNG）和渲染图同一块并排放大（最近邻）；w > 1.6h 时上下排。
// node crop.mjs out.png scale x y w h a.png b.png [c.png]  -> side by side (or stacked if w>h*1.6)
import { load, save, PNG } from './lib.mjs';
const [out, s, x, y, w, h, ...files] = process.argv.slice(2);
const S=+s,X=+x,Y=+y,Wd=+w,Ht=+h; const imgs=files.map(load);
const vert = Wd > Ht*1.6;
const gap=4; const W = vert? Wd*S : (Wd*S+gap)*imgs.length-gap; const H = vert? (Ht*S+gap)*imgs.length-gap : Ht*S;
const o = new PNG({width:W,height:H}); o.data.fill(255);
for (let k=0;k<W*H;k++){o.data[k*4]=255;o.data[k*4+1]=0;o.data[k*4+2]=255;}
imgs.forEach((im,n)=>{ const ox=vert?0:n*(Wd*S+gap), oy=vert?n*(Ht*S+gap):0;
 for(let j=0;j<Ht*S;j++)for(let i=0;i<Wd*S;i++){ const sx=X+Math.floor(i/S), sy=Y+Math.floor(j/S); if(sx>=im.width||sy>=im.height) continue; const si=(sy*im.width+sx)*4, di=((oy+j)*W+ox+i)*4; o.data[di]=im.data[si];o.data[di+1]=im.data[si+1];o.data[di+2]=im.data[si+2];o.data[di+3]=255;}});
save(out,o); console.log(out, W+'x'+H);
