// node scale.mjs in out w h   (nearest resample)
import { load, save, PNG } from './lib.mjs';
const [i,o,w,h]=process.argv.slice(2); const a=load(i); const W=+w,H=+h; const b=new PNG({width:W,height:H});
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const sx=Math.floor(x*a.width/W), sy=Math.floor(y*a.height/H); const si=(sy*a.width+sx)*4, di=(y*W+x)*4; for(let k=0;k<4;k++)b.data[di+k]=a.data[si+k]; b.data[di+3]=255;}
save(o,b);
