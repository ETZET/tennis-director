// node pick.mjs img x,y[,r] ...   -> mode colour (quantised to 4) in a window of radius r (default 3)
import { load } from './lib.mjs';
const [f,...pts]=process.argv.slice(2); const p=load(f);
for(const s of pts){const [x,y,r=3]=s.split(',').map(Number); const m=new Map();
 for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const i=((y+dy)*p.width+x+dx)*4; const k=((p.data[i]>>3)<<10)|((p.data[i+1]>>3)<<5)|(p.data[i+2]>>3); const e=m.get(k)||[0,0,0,0]; e[0]++;e[1]+=p.data[i];e[2]+=p.data[i+1];e[3]+=p.data[i+2]; m.set(k,e);}
 const top=[...m.values()].sort((a,b)=>b[0]-a[0]).slice(0,3).map(e=>'#'+[e[1],e[2],e[3]].map(v=>Math.round(v/e[0]).toString(16).padStart(2,'0')).join('')+'('+e[0]+')');
 console.log(s, top.join(' '));}
