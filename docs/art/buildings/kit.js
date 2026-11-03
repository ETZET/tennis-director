/* 2.5D 建筑图鉴 · 共用绘制底座
 * 光栅器、投影、基本形体、人物和小道具原样取自 docs/art/style-demos/isometric-2.5d/index.html，
 * 只改了投影中心（以每栋建筑的地台中心为原点）。图鉴专用的部分在文件末尾。 */
'use strict';
let level=3;
let BW=0,BH=0,PS=1,k=6,OX=0,OY=0,SP=2,buf=null;
const HV=1.225,CX=0,CZ=0;
let M=[1,0,0,1];
let S=[],A=[],LAMPS=[],LIGHTS=[],CAST=[],GROUND=[],OVER=[];
function setM(a){const c=Math.cos(a),s=Math.sin(a);M=[c,-s,s,c];}
function Rv(x,z){const m=M;return[m[0]*x+m[1]*z,m[2]*x+m[3]*z];}
function P(x,y,z){const m=M,dx=x-CX,dz=z-CZ,rx=m[0]*dx+m[1]*dz,rz=m[2]*dx+m[3]*dz;return[OX+(rx-rz)*k,OY+(rx+rz)*k*.5-y*k*HV];}
function unP(sx,sy,y=0){const a=(sx-OX)/k,b=2*(sy+y*k*HV-OY)/k,rx=(a+b)*.5,rz=(b-a)*.5,m=M;return[CX+m[0]*rx+m[2]*rz,CZ+m[1]*rx+m[3]*rz];}
const vis=(nx,nz)=>{const r=Rv(nx,nz);return r[0]+r[1]>0.01;};
const LX=-0.6,LZ=0.8;const faceF=(nx,nz)=>0.70+0.2*(nx*LX+nz*LZ);

/* ================= utils ================= */
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
function hash(i,j,s=0){let h=(Math.imul(i|0,374761393)+Math.imul(j|0,668265263)+Math.imul(s|0,1442695041))|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}
function vnoise(x,z,s=0){const i=Math.floor(x),j=Math.floor(z),fx=x-i,fz=z-j;const a=hash(i,j,s),b=hash(i+1,j,s),c=hash(i,j+1,s),d=hash(i+1,j+1,s);
 const ux=fx*fx*(3-2*fx),uz=fz*fz*(3-2*fz);return a+(b-a)*ux+(c-a)*uz+(a-b-c+d)*ux*uz;}
function fbm(x,z,s=0){return vnoise(x,z,s)*.5+vnoise(x*2.13,z*2.13,s+7)*.3+vnoise(x*4.37,z*4.37,s+13)*.2;}
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const BAY=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(v=>(v+.5)/16);
const bay=(x,y)=>BAY[((y&3)<<2)|(x&3)];
const pk=(r,g,b)=>((255<<24)|(clamp(b|0,0,255)<<16)|(clamp(g|0,0,255)<<8)|clamp(r|0,0,255))>>>0;
const HX={};function hx(h){let v=HX[h];if(!v){v=HX[h]=[parseInt(h.substr(1,2),16),parseInt(h.substr(3,2),16),parseInt(h.substr(5,2),16)];}return v;}
const ph=h=>{const c=hx(h);return pk(c[0],c[1],c[2]);};
function mixP(a,b,t){const ar=a&255,ag=(a>>>8)&255,ab=(a>>>16)&255;return pk(ar+((b&255)-ar)*t,ag+(((b>>>8)&255)-ag)*t,ab+(((b>>>16)&255)-ab)*t);}
function mulP(a,f,g=f,b=f){return pk((a&255)*f,((a>>>8)&255)*g,((a>>>16)&255)*b);}
function nightRGB(r,g,b,L){return[r*(0.22+0.78*L)+10*(1-L)+14*L,g*(0.27+0.66*L)+12*(1-L)+6*L,b*(0.48+0.44*L)+34*(1-L)];}
let night=false;
const CC=new Map();
function col(h,f=1,lit=0){const key=h+f+'|'+lit+(night?'n':'d');let v=CC.get(key);if(v!==undefined)return v;let[r,g,b]=hx(h);r*=f;g*=f;b*=f;
 if(night)[r,g,b]=nightRGB(r,g,b,lit);v=pk(r,g,b);CC.set(key,v);return v;}
function em(h,f=1){const c=hx(h);return pk(c[0]*f,c[1]*f,c[2]*f);}

/* ================= raster ================= */
const XS=new Float64Array(32);
function fillPoly(p,c,sh){const n=p.length>>1;let mn=1e9,mx=-1e9;for(let i=1;i<p.length;i+=2){if(p[i]<mn)mn=p[i];if(p[i]>mx)mx=p[i];}
 const y0=Math.max(0,Math.ceil(mn-.5)),y1=Math.min(BH-1,Math.floor(mx-.5));
 for(let y=y0;y<=y1;y++){const yc=y+.5;let m=0;
  for(let i=0,j=n-1;i<n;j=i++){const yi=p[i*2+1],yj=p[j*2+1];if((yi<=yc&&yj>yc)||(yj<=yc&&yi>yc))XS[m++]=p[i*2]+(yc-yi)*(p[j*2]-p[i*2])/(yj-yi);}
  for(let a=1;a<m;a++){const v=XS[a];let b=a-1;while(b>=0&&XS[b]>v){XS[b+1]=XS[b];b--;}XS[b+1]=v;}
  const row=y*BW;
  for(let a=0;a+1<m;a+=2){const xa=Math.max(0,Math.ceil(XS[a]-.5)),xb=Math.min(BW-1,Math.floor(XS[a+1]-.5));
   if(sh){for(let x=xa;x<=xb;x++){const v=sh(x,y);if(v)buf[row+x]=v;}}else for(let x=xa;x<=xb;x++)buf[row+x]=c;}}}
function wpoly(pts,c,sh){const f=[];for(const p of pts){const s=P(p[0],p[1],p[2]);f.push(s[0],s[1]);}fillPoly(f,c,sh);return f;}
function pix(x,y,c){x|=0;y|=0;if(x>=0&&y>=0&&x<BW&&y<BH)buf[y*BW+x]=c;}
function rect(x,y,w,h,c){x=Math.round(x);y=Math.round(y);for(let j=Math.max(0,y);j<Math.min(BH,y+h);j++)for(let i=Math.max(0,x);i<Math.min(BW,x+w);i++)buf[j*BW+i]=c;}
function line(x0,y0,x1,y1,c,w=1,pat){x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
 const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let e=dx+dy,n=0;
 for(;;){if(!pat||pat(n))(w===1?pix(x0,y0,c):rect(x0-(w>>1),y0,w,1,c));n++;if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}}}
function wline(a,b,c,w=1,pat){const p=P(a[0],a[1],a[2]),q=P(b[0],b[1],b[2]);line(p[0],p[1],q[0],q[1],c,w,pat);}
function ell(cx,cy,rx,ry,c,sh){const y0=Math.max(0,Math.ceil(cy-ry-.5)),y1=Math.min(BH-1,Math.floor(cy+ry-.5));
 for(let y=y0;y<=y1;y++){const dy=(y+.5-cy)/ry;if(dy*dy>=1)continue;const hw=rx*Math.sqrt(1-dy*dy);const xa=Math.max(0,Math.ceil(cx-hw-.5)),xb=Math.min(BW-1,Math.floor(cx+hw-.5));
  const row=y*BW;for(let x=xa;x<=xb;x++){const v=sh?sh(x,y):c;if(v)buf[row+x]=v;}}}
function darken(x,y,f){x|=0;y|=0;if(x<0||y<0||x>=BW||y>=BH)return;const i=y*BW+x;buf[i]=mulP(buf[i],f,f,f*1.05);}
function glow(sx,sy,r,c,inten){const x0=Math.max(0,Math.floor(sx-r)),x1=Math.min(BW-1,Math.ceil(sx+r)),y0=Math.max(0,Math.floor(sy-r)),y1=Math.min(BH-1,Math.ceil(sy+r));
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const d=Math.hypot(x+.5-sx,y+.5-sy);if(d>=r)continue;let f=1-d/r;f=f*f*inten;const q=Math.floor(f*4+bay(x,y))/4;if(q<=0)continue;
  const i=y*BW+x,v=buf[i];buf[i]=pk((v&255)+c[0]*q,((v>>>8)&255)+c[1]*q,((v>>>16)&255)+c[2]*q);}}

/* ================= 3D-ish primitives ================= */
function box(x0,x1,z0,z1,y0,y1,h,o={}){const lit=o.lit||0;
 const F=[[1,0,[[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]]],[-1,0,[[x0,y0,z1],[x0,y0,z0],[x0,y1,z0],[x0,y1,z1]]],
  [0,1,[[x1,y0,z1],[x0,y0,z1],[x0,y1,z1],[x1,y1,z1]]],[0,-1,[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]]]];
 for(const[nx,nz,pts]of F){if(!vis(nx,nz))continue;const c=col(o.side||h,faceF(nx,nz)*(o.sf||1),lit);
  const sp=wpoly(pts,c,o.sideSh?o.sideSh(nx,nz,pts,c):null);if(o.face)o.face(nx,nz,sp);}
 if(!o.noTop){const tc=col(o.top||h,o.tf||1,lit);const tp=[[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]];wpoly(tp,tc,o.topSh?o.topSh(tc):null);
  if(o.edge!==false&&(x1-x0)*k>3&&(z1-z0)*k>3){const ec=col(o.top||h,1.12,lit);
   for(const[nx,nz,pts]of F){if(!vis(nx,nz))continue;wline(pts[2],pts[3],ec);}}}}
// quad on a box face: axis 'x' => plane x=c spans z u0..u1 ; 'z' => plane z=c spans x
function fq(ax,c,nx,nz,u0,u1,v0,v1,colr,sh){if(!vis(nx,nz))return;const o=0.03*(nx+nz);
 const pts=ax==='x'?[[c+o,v0,u0],[c+o,v0,u1],[c+o,v1,u1],[c+o,v1,u0]]:[[u0,v0,c+o],[u1,v0,c+o],[u1,v1,c+o],[u0,v1,c+o]];return wpoly(pts,colr,sh);}
function stripeSh(ax,bx,ay,by,period,c1,c2){const ex=bx-ax,ey=by-ay,l=Math.hypot(ex,ey)||1;const nx=-ey/l,ny=ex/l;
 return(x,y)=>(Math.floor(((x-ax)*nx+(y-ay)*ny)/period)&1)?c2:c1;}
function hipRoof(x0,x1,z0,z1,y,rise,h,o={}){const lit=o.lit||0;const cx=(x0+x1)/2,cz=(z0+z1)/2;let r0,r1,faces;
 const A=[x0,y,z0],B=[x1,y,z0],C=[x1,y,z1],D=[x0,y,z1];
 if(x1-x0>=z1-z0){const hh=(z1-z0)/2;r0=[x0+hh,y+rise,cz];r1=[x1-hh,y+rise,cz];faces=[[0,-1,[A,B,r1,r0],[A,B]],[0,1,[D,C,r1,r0],[D,C]],[-1,0,[A,D,r0],[A,D]],[1,0,[B,C,r1],[B,C]]];}
 else{const hh=(x1-x0)/2;r0=[cx,y+rise,z0+hh];r1=[cx,y+rise,z1-hh];faces=[[-1,0,[A,D,r1,r0],[A,D]],[1,0,[B,C,r1,r0],[B,C]],[0,-1,[A,B,r0],[A,B]],[0,1,[D,C,r1],[D,C]]];}
 faces.sort((a,b)=>(vis(a[0],a[1])?1:0)-(vis(b[0],b[1])?1:0));
 for(const[nx,nz,pts,eave]of faces){const f=0.86+0.2*(nx*LX+nz*LZ);const c1=col(h,f,lit),c2=col(h,f*0.84,lit);
  const e0=P(...eave[0]),e1=P(...eave[1]);const sp=wpoly(pts,c1,stripeSh(e0[0],e0[1],e1[0],e1[1],Math.max(2,k*0.75),c1,c2));
  if(o.holes)o.holes(nx,nz,pts);
  line(e0[0],e0[1],e1[0],e1[1],col(h,f*0.62,lit));}
 const a=P(...r0),b=P(...r1);line(a[0],a[1],b[0],b[1],col(h,1.15,lit));}
function cyl(x,z,r,y0,y1,h,o={}){const lit=o.lit||0;const a=P(x,y0,z),b=P(x,y1,z),rx=r*k*1.4142,ry=rx*.5;
 const c1=col(h,0.92,lit),c2=col(h,0.76,lit),c3=col(h,0.62,lit);
 const sh=(px)=>{const t=(px+.5-a[0])/rx;return t<-0.35?c1:t<0.35?c2:c3;};
 ell(a[0],a[1],rx,ry,0,(px,py)=>sh(px));rect(a[0]-rx+.5,b[1],Math.round(rx*2),Math.max(0,Math.round(a[1]-b[1])),0);
 for(let y=Math.round(b[1]);y<Math.round(a[1]);y++)for(let x=Math.ceil(a[0]-rx-.5);x<=Math.floor(a[0]+rx-.5);x++)pix(x,y,sh(x));
 if(!o.noTop)ell(b[0],b[1],rx,ry,col(o.top||h,1.05,lit));}

function litAt(x,z){if(!night)return 0;let s=0;for(const l of LAMPS){const d=Math.hypot(x-l.x,z-l.z);if(d<l.r){const f=1-d/l.r;s+=f*f*l.i*1.6;}}return Math.min(1,Math.floor(Math.min(s,1)*4)/4);}

/* ================= objects ================= */
function add(o){o.pad=o.pad||0;S.push(o);return o;}
let T=0;
// ---- palm
function palm(x,z,h,o={}){const ph0=hash(x*10|0,z*10|0,3)*6.28;const lean=[(hash(x|0,z|0,4)-.5)*1.2,(hash(z|0,x|0,5)-.5)*1.2];
 CAST.push({x,z,h:h*0.95,r:2.6*(o.dead?0.5:1)});
 add({x0:x-0.3,x1:x+0.3,z0:z-0.3,z1:z+0.3,y0:0,y1:h+1,pad:4.5,draw(){drawPalm(x,z,h,lean,ph0,o);}});}
function drawPalm(x,z,h,lean,ph0,o){const lit=night?(o.up?0.75:litAt(x,z)):0;const b=P(x,0,z),t=P(x+lean[0],h,z+lean[1]);
 const sw=Math.sin(T*1.1+ph0)*0.22*k;t[0]+=sw;const n=Math.max(2,Math.round(b[1]-t[1]));const tw=Math.max(1,Math.round(k*0.42));
 const c1=col(o.dead?'#8a7560':'#9a7653',1,lit),c2=col(o.dead?'#76634f':'#7f5f40',1,lit),c3=col('#5e4733',1,lit);
 for(let i=0;i<=n;i++){const u=i/n;const xx=b[0]+(t[0]-b[0])*u+Math.sin(u*Math.PI)*k*0.5*(lean[0]>0?1:-1),yy=b[1]-i;
  rect(Math.round(xx-tw/2),yy,tw,1,((i>>1)&1)?c1:c2);pix(Math.round(xx-tw/2)+tw,yy,c3);}
 if(o.stump)return;
 const dead=o.dead,half=o.half;
 const fg=col(dead?'#a18456':half?'#9aa04a':'#3f9a3c',1,lit),fl=col(dead?'#c4a46c':half?'#b8bb5a':'#68c24a',1,lit),fd=col(dead?'#7a6440':half?'#7c7f36':'#2a7230',1,lit);
 const N=dead?6:8,L=(dead?2.6:3.8)*k*(o.s||1);const fr=[];
 for(let j=0;j<N;j++){const a=j/N*6.283+ph0+Math.sin(T*1.3+ph0+j)*0.05;fr.push([a,Math.sin(a)]);}
 fr.sort((p,q)=>p[1]-q[1]);
 // dead skirt
 if(dead||half){for(let i=0;i<Math.round(k*1.8);i++){for(let s=-2;s<=2;s++)pix(t[0]+s*Math.max(1,k*0.4)+(i&1),t[1]+i+1,i%3?fd:fg);}}
 for(const[a]of fr){const ca=Math.cos(a),sa=Math.sin(a);const steps=Math.round(L*1.3);let px0=null;
  for(let s=0;s<=steps;s++){const u=s/steps;const fx=ca*L*u,fy=sa*L*u*0.5+(dead?L*(0.05*u+0.95*u*u):L*(-0.42*u+0.85*u*u)*0.6)+Math.sin(T*1.8+ph0+a*3)*u*u*k*0.25;
   const X=Math.round(t[0]+fx),Y=Math.round(t[1]+fy);
   pix(X,Y,sa<0?fd:fg);if(u>0.15){const ll=Math.max(1,Math.round(k*0.35*(1-u*0.5)));for(let q=1;q<=ll;q++)pix(X,Y+q,q===ll?fd:fg);if(!dead&&((s&1)===0))pix(X,Y-1,fl);}}}
 if(!dead){pix(t[0],t[1],col('#7a4e2a',1,lit));pix(t[0]+1,t[1]+1,col('#7a4e2a',1,lit));}}
// ---- oak-ish tree
function tree(x,z,h,r,o={}){CAST.push({x,z,h:h*0.8,r:r*1.1,tw:0.3});
 const blobs=[];const R=rng((x*31+z*17)|0);for(let i=0;i<7;i++)blobs.push([(R()-.5)*r*1.2,h-r*0.3+(R()-.2)*r*0.9,(R()-.5)*r*1.2,r*(0.45+R()*0.3)]);
 blobs.sort((a,b)=>(a[0]+a[2])-(b[0]+b[2]));
 add({x0:x-0.4,x1:x+0.4,z0:z-0.4,z1:z+0.4,y0:0,y1:h+r,pad:r,draw(){const lit=litAt(x,z);const b=P(x,0,z),t=P(x,h-r*0.5,z);
  rect(b[0]-1,t[1],Math.max(2,Math.round(k*0.6)),Math.round(b[1]-t[1]),col('#6b4a30',1,lit));
  const dry=o.dry;const c1=col(dry?'#9b9a62':'#4e9a3f',1,lit),c2=col(dry?'#b5b376':'#6cbc4f',1,lit),c3=col(dry?'#77744a':'#3a7c33',1,lit),c4=col(dry?'#cfcb8e':'#8fd463',1,lit);
  for(const bl of blobs){const p=P(x+bl[0],bl[1],z+bl[2]);const rr=bl[3]*k*1.25;
   ell(p[0],p[1],rr,rr*0.85,0,(px,py)=>{const dx=(px+.5-p[0])/rr,dy=(py+.5-p[1])/(rr*.85);const l=-dx*0.6-dy*0.8+bay(px,py)*0.5-0.25;
    if(dry&&hash(px,py,(bl[0]*9)|0)>0.7)return 0;return l>0.55?c4:l>0.1?c2:l>-0.45?c1:c3;});}}});}
// ---- people
const SKIN=['#f2c9a2','#e0aa7e','#c48955','#8e5a38','#f6d6bd','#a8693f'],HAIR=['#2b1d16','#5a3a22','#a8742c','#e3c27a','#18181f','#7a3b2a','#d0d0d0','#c45a2a'];
const SHIRT=['#e2463c','#2f7fd8','#f0c53c','#3fb37f','#ffffff','#f08abf','#8a5cd0','#ff8a3d','#17a2b8','#ffffff','#ffffff'],BOT=['#2d3a5a','#efe9da','#3b3b45','#6b4b2f','#ffffff','#4a6fb0'];
function randLook(R,o={}){const p=a=>a[Math.floor(R()*a.length)];return Object.assign({skin:p(SKIN),hair:p(HAIR),shirt:p(SHIRT),bot:p(BOT),shoe:R()>.5?'#ffffff':'#3a3340',long:R()>.6,skirt:R()>.75,hat:R()>.8?p(['#ffffff','#f0c53c','#e2463c','#2f7fd8']):null},o);}
const TPL={front:['.HHH.','HHHHH','HESEH','.SSS.','ATTTA','STTTS','.BBB.'],back:['.HHH.','HHHHH','HHHHH','.SSS.','ATTTA','STTTS','.BBB.']};
function person(x,z,look,o={}){const y=o.y||0;const p=P(x,y,z);const lit=night?(o.lit!==undefined?o.lit:litAt(x,z)):0;
 const fv=o.face||[0,1];const r=Rv(fv[0],fv[1]);const sdx=r[0]-r[1],sdy=r[0]+r[1];const back=sdy<-0.05,flip=sdx<-0.05;
 let rows=(back?TPL.back:TPL.front).slice();
 if(look.hat||look.hard){rows[0]=look.hard?'.CCC.':'.CCC.';rows[1]='CCCCC';if(look.hard&&!back)rows[1]='CCCCC';}
 if(look.long){rows[3]=back?'HHHHH':'HSSSH';if(back)rows[4]='AHHHA';}
 if(look.skirt)rows[6]='BBBBB';
 const pose=o.pose||'stand';let bob=0;
 if(pose==='walk'){const f=o.frame&1;rows.push(f?'..L..':'.L.L.');rows.push(f?'..F..':'.F.F.');bob=f?-1:0;}
 else if(pose==='sit'){rows.push('.F.F.');bob=1;}
 else if(pose==='swim'){rows=rows.slice(0,3);}
 else{rows.push('.L.L.');rows.push('.F.F.');}
 if(o.bob)bob+=o.bob;
 const map={H:look.hair,S:look.skin,E:'#2a1c1c',T:look.shirt,A:look.sleeve||look.shirt,B:look.bot,L:look.pants?look.bot:look.skin,F:look.shoe,C:look.hard?'#f4c21f':(look.hat||look.hair),R:'#e9e4d0',G:'#3a2f2f',K:'#8a5a2c',V:'#c8ff3a',W:'#fff6a0'};
 const px=[];for(let j=0;j<rows.length;j++)for(let i=0;i<5;i++){const ch=rows[j][i];if(ch!=='.')px.push([i,j,ch]);}
 if(o.extra)for(const e of o.extra)px.push(e);
 const H=rows.length;const sp=SP;const ox=Math.round(p[0])-2*sp,oy=Math.round(p[1])-H*sp+bob*sp;
 // shadow
 if(pose!=='swim'){const sy=Math.round(p[1]);for(let i=-2;i<=2;i++)for(let q=0;q<sp;q++)darken(Math.round(p[0])+i*sp+q-(sp>>1),sy+(q&1),0.72);}
 const occ=new Set();for(const[i,j]of px){occ.add((flip?4-i:i)+','+j);}
 const ol=col('#231a2b',1,lit*0.5);
 for(const[i0,j]of px){const i=flip?4-i0:i0;for(const[di,dj]of[[1,0],[-1,0],[0,1],[0,-1]]){if(!occ.has((i+di)+','+(j+dj))){rect(ox+(i+di)*sp,oy+(j+dj)*sp,sp,sp,ol);}}}
 const cm={};for(const[i0,j,ch]of px){const i=flip?4-i0:i0;const c=cm[ch]||(cm[ch]=col(map[ch],1,lit));rect(ox+i*sp,oy+j*sp,sp,sp,c);}
 if(o.post)o.post(ox,oy,sp,flip);}
function addActorObj(x,z,h,draw,pad=0.6){FR.push({x0:x-0.25,x1:x+0.25,z0:z-0.25,z1:z+0.25,y0:0,y1:h,pad,draw});}
let FR=[];

/* ================= facility builders ================= */
function wallRun(x0,z0,x1,z1,R){const len=Math.hypot(x1-x0,z1-z0),n=Math.max(1,Math.round(len/6));const fresh=level===3;const c=fresh?'#ecd2ac':'#cdb18c';
 for(let i=0;i<n;i++){const a=i/n,b=(i+1)/n;const ax=x0+(x1-x0)*a,az=z0+(z1-z0)*a,bx=x0+(x1-x0)*b,bz=z0+(z1-z0)*b;const t=0.3;
  const X0=Math.min(ax,bx)-(ax===bx?t:0),X1=Math.max(ax,bx)+(ax===bx?t:0),Z0=Math.min(az,bz)-(az===bz?t:0),Z1=Math.max(az,bz)+(az===bz?t:0);
  const hsh=hash(Math.round(ax),Math.round(az),77);let h=2.3,broken=false;
  if(level===1&&hsh<0.3){broken=true;h=hsh<0.1?0:0.5+hsh*2.5;}if(level===2&&hsh<0.14){broken=true;h=hsh<0.05?0:0.6+hsh*4;}
  if(h>0)CAST.push({x0:X0,x1:X1,z0:Z0,z1:Z1,h});
  add({x0:X0,x1:X1,z0:Z0,z1:Z1,y0:0,y1:h+0.3,draw(){const lit=litAt((X0+X1)/2,(Z0+Z1)/2);
   if(h>0){box(X0,X1,Z0,Z1,0,h,c,{lit,sideSh:(nx,nz,pts,cc)=>{const d=col(c,faceF(nx,nz)*0.9,lit);return(x,y)=>((y%5===0&&!fresh&&hash(x,y,1)>0.5)?d:cc);}});
    if(!broken)box(X0-0.12,X1+0.12,Z0-0.12,Z1+0.12,h,h+0.25,fresh?'#f6e2c2':'#d8c09e',{lit});}
   if(broken){const R2=rng(Math.round(ax*7+az*3));for(let q=0;q<5;q++){const rx=X0+R2()*(X1-X0),rz=Z0+R2()*(Z1-Z0)+(R2()-.2)*1.5;box(rx-0.4,rx+0.4,rz-0.3,rz+0.3,0,0.35,c,{lit,edge:false});}}}});}}
function fenceSeg(x0,z0,x1,z1,h,o={}){const X0=Math.min(x0,x1),X1=Math.max(x0,x1),Z0=Math.min(z0,z1),Z1=Math.max(z0,z1);
 add({x0:X0-(x0===x1?0.05:0),x1:X1+(x0===x1?0.05:0),z0:Z0-(z0===z1?0.05:0),z1:Z1+(z0===z1?0.05:0),y0:0,y1:h,draw(){const lit=litAt((x0+x1)/2,(z0+z1)/2);
  if(o.missing){wline([x0,0,z0],[x0,h*0.9,z0],col('#3b4a42',1,lit),Math.max(1,Math.round(k*0.3)));return;}
  const lean=o.lean||0;const mc=col(o.c||'#2f4a3c',1,lit);
  wpoly([[x0,0,z0],[x1,0,z1],[x1+lean,h,z1+lean*0.3],[x0+lean,h,z0+lean*0.3]],0,(x,y)=>((((x+y)&3)===0)||(((x-y)&3)===0))?mc:0);
  const pc=col('#3b4a42',1,lit);wline([x0,0,z0],[x0+lean,h,z0+lean*0.3],pc,Math.max(1,Math.round(k*0.3)));wline([x1,0,z1],[x1+lean,h,z1+lean*0.3],pc,Math.max(1,Math.round(k*0.3)));
  wline([x0+lean,h,z0+lean*0.3],[x1+lean,h,z1+lean*0.3],pc);}});}
function fenceRect(x0,x1,z0,z1,h,gaps,ruin,seed){const seg=4;const R=rng(seed);
 const run=(ax,az,bx,bz,side)=>{const len=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.round(len/seg));
  for(let i=0;i<n;i++){const a=i/n,b=(i+1)/n;const sx=ax+(bx-ax)*a,sz=az+(bz-az)*a,ex=ax+(bx-ax)*b,ez=az+(bz-az)*b;const mx=(sx+ex)/2,mz=(sz+ez)/2;
   if(gaps&&gaps.some(g=>Math.hypot(g[0]-mx,g[1]-mz)<2.2))continue;const r=R();
   fenceSeg(sx,sz,ex,ez,h,{missing:ruin&&r<0.22,lean:ruin&&r>0.85?(r-0.85)*12:0});}};
 run(x0,z0,x1,z0);run(x1,z0,x1,z1);run(x0,z1,x1,z1);run(x0,z0,x0,z1);}
function net(F,o={}){const W=(o.pick?3.05:5.485)+(o.pick?0.3:0.9);const h=o.pick?0.86:1.0;const x=F.ox,za=F.oz-W,zb=F.oz+W;
 add({x0:x-0.05,x1:x+0.05,z0:za,z1:zb,y0:0,y1:h+0.1,draw(){const lit=litAt(x,F.oz);const pc=col('#2a2d33',1,lit);
  wline([x,0,za],[x,h,za],pc,Math.max(1,Math.round(k*0.25)));wline([x,0,zb],[x,h,zb],pc,Math.max(1,Math.round(k*0.25)));if(o.missing)return;
  const sag=o.sag?0.55:0.1;const N=8;const top=[];for(let i=0;i<=N;i++){const u=i/N;top.push([x,h-sag*Math.sin(u*Math.PI)-(o.sag&&u>0.5?0.3*(u-0.5):0),za+(zb-za)*u]);}
  const nc=col('#1d2026',1,lit);const pts=[[x,0.05,za],[x,0.05,zb],...top.slice().reverse()];
  wpoly(pts,0,(px,py)=>((px+py)&1)?nc:0);const tc=col('#f6f3ea',1,lit);for(let i=0;i<N;i++)wline(top[i],top[i+1],tc,1,o.sag?(n=>n%5!==0):null);}});}
function lightPole(x,z,h,o={}){const on=o.on;if(on)LAMPS.push({x:o.lx??x,z:o.lz??z,r:o.r||13,i:o.i||0.9});
 if(on)LIGHTS.push({x,y:h+0.3,z,r:6,c:[255,250,225],i:1.1,flood:true});
 add({x0:x-0.2,x1:x+0.2,z0:z-0.2,z1:z+0.2,y0:0,y1:h+0.6,draw(){const lit=litAt(x,z);const pc=col('#596069',1,lit);wline([x,0,z],[x,h,z],pc,Math.max(1,Math.round(k*0.3)));
  if(o.broken){return;}const hp=P(x,h,z);const w=Math.max(2,Math.round(k*0.9));rect(hp[0]-w/2,hp[1]-1,w,Math.max(2,Math.round(k*0.5)),night&&on?em('#fffbe6'):col('#3a3f47',1,lit));}});}
function lamp(x,z,on,o={}){if(on){LAMPS.push({x,z,r:o.r||6.5,i:o.i||0.75});LIGHTS.push({x,y:3.2,z,r:4.5,c:[255,214,140],i:1});}
 add({x0:x-0.15,x1:x+0.15,z0:z-0.15,z1:z+0.15,y0:0,y1:3.6,draw(){const lit=litAt(x,z);const p=P(x,0,z),t=P(x,3.2,z);line(p[0],p[1],t[0],t[1],col('#3a3a42',1,lit));
  rect(t[0]-1,t[1]-2,3,3,night&&on?em('#ffe6a8'):col(o.broken?'#55504a':'#2d3038',1,lit));pix(t[0],t[1]-3,col('#3a3a42',1,lit));}});}
function umbrella(x,z,r,c1,c2,o={}){const h=o.h||2.4;CAST.push({x,z,h:h*0.8,r:r*0.9,tw:0.05});
 add({x0:x-0.2,x1:x+0.2,z0:z-0.2,z1:z+0.2,y0:o.y0||0,y1:h+0.6,pad:r,draw(){const lit=litAt(x,z);const b=P(x,0,z),t=P(x,h,z);line(b[0],b[1],t[0],t[1],col('#e8e2d2',0.8,lit));
  const rx=r*k*1.414,ry=rx*0.5;const A=col(c1,1,lit),B=col(c2,1,lit),A2=col(c1,0.8,lit),B2=col(c2,0.8,lit);
  ell(t[0],t[1],rx,ry,0,(px,py)=>{const a=Math.atan2((py+.5-t[1])*2,px+.5-t[0]);const s=Math.floor((a+Math.PI)/(Math.PI/4))&1;const dn=py+.5>t[1];return s?(dn?A2:A):(dn?B2:B);});
  ell(t[0],t[1]-Math.max(1,ry*0.35),rx*0.55,ry*0.55,0,(px,py)=>{const a=Math.atan2((py+.5-t[1])*2,px+.5-t[0]);return(Math.floor((a+Math.PI)/(Math.PI/4))&1)?A:B;});
  pix(t[0],t[1]-Math.max(1,ry*0.35)-ry*0.55,col('#ffffff',1,lit));}});}
function flag(x,z,h,c1,c2){add({x0:x-0.1,x1:x+0.1,z0:z-0.1,z1:z+0.1,y0:0,y1:h+1,pad:1.6,draw(){const lit=litAt(x,z);const b=P(x,0,z),t=P(x,h,z);line(b[0],b[1],t[0],t[1],col('#d8d8d8',0.8,lit));
  const fw=Math.max(4,Math.round(k*2)),fh=Math.max(3,Math.round(k*1.1));const A=col(c1,1,lit),B=col(c2,1,lit);
  for(let i=1;i<=fw;i++){const dy=Math.round(Math.sin(T*6-i*0.7+x)*k*0.3*i/fw);for(let j=0;j<fh;j++)pix(t[0]+i,t[1]+j+dy,j<fh/2?A:B);}}});}
function car(x,z,ax,c,o={}){const L=ax==='x'?2.2:1,Wd=ax==='x'?1:2.2;
 add({x0:x-L,x1:x+L,z0:z-Wd,z1:z+Wd,y0:0,y1:1.6,draw(){const lit=litAt(x,z);box(x-L,x+L,z-Wd,z+Wd,0.15,0.85,c,{lit});
  const l2=ax==='x'?1.2:0.85,w2=ax==='x'?0.85:1.2;box(x-l2+(ax==='x'?-0.2:0),x+l2+(ax==='x'?-0.2:0),z-w2,z+w2,0.85,1.45,o.rust?'#7a6a5a':'#2a3a4c',{lit,top:c});}});}
function stringLights(pts,on,y=3.2){if(on)for(const p of pts)LAMPS.push({x:p[0],z:p[1],r:3.5,i:0.35});
 let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const p of pts){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);z0=Math.min(z0,p[1]);z1=Math.max(z1,p[1]);}
 add({x0,x1,z0,z1,y0:y-1.2,y1:y+0.2,str:true,draw(){const wc=col('#6a5a50',1,0);const bulbs=[];
  for(let i=0;i+1<pts.length;i++){const a=pts[i],b=pts[i+1];const N=Math.max(4,Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])*k*0.6));let prev=null;
   for(let s=0;s<=N;s++){const u=s/N;const p=P(a[0]+(b[0]-a[0])*u,y-Math.sin(u*Math.PI)*0.8,a[1]+(b[1]-a[1])*u);if(prev)line(prev[0],prev[1],p[0],p[1],wc);prev=p;if(s%2===1)bulbs.push(p);}}
  const pal=['#ffe08a','#ff9f6a','#a8f0ff','#ffd0f0','#c8ff9a'];
  bulbs.forEach((p,i)=>{if(night&&on)rect(p[0],p[1]+1,2,2,em(pal[i%5]));else pix(p[0],p[1]+1,night&&on?em(pal[i%5]):col(on?pal[i%5]:'#8a8a8a',0.8,0));});
  if(night&&on)for(let i=0;i<bulbs.length;i+=1)glow(bulbs[i][0],bulbs[i][1]+1,3.2,[90,70,30],0.8);}});
 // posts
 for(const p of[pts[0],pts[pts.length-1]])add({x0:p[0]-0.1,x1:p[0]+0.1,z0:p[1]-0.1,z1:p[1]+0.1,y0:0,y1:y,draw(){wline([p[0],0,p[1]],[p[0],y,p[1]],col('#5a4636',1,litAt(p[0],p[1])));}});}
function sack(x,z,h,c,w=0.7){add({x0:x-w,x1:x+w,z0:z-w,z1:z+w,y0:0,y1:h,draw(){box(x-w,x+w,z-w,z+w,0,h,c,{lit:litAt(x,z)});}});}
function planks(x,z,ax){const L=ax==='x'?2:0.8,W=ax==='x'?0.8:2;add({x0:x-L,x1:x+L,z0:z-W,z1:z+W,y0:0,y1:0.8,draw(){const lit=litAt(x,z);for(let i=0;i<3;i++)box(x-L,x+L,z-W,z+W,i*0.25,i*0.25+0.22,i&1?'#c89a5a':'#d6aa68',{lit,edge:false});}});}
function cone(x,z){add({x0:x-0.2,x1:x+0.2,z0:z-0.2,z1:z+0.2,y0:0,y1:0.7,draw(){const lit=litAt(x,z);const p=P(x,0,z);const s=Math.max(1,Math.round(k*0.3));
  rect(p[0]-s,p[1]-1,s*2+1,1,col('#e2552a',0.8,lit));rect(p[0]-s+1,p[1]-2*s-1,s*2-1,2*s,col('#ff6a2e',1,lit));pix(p[0],p[1]-2*s-1,col('#ffffff',1,lit));rect(p[0]-s+1,p[1]-s-1,s*2-1,1,col('#ffffff',1,lit));}});}
function tumble(x,z,r=0.7){add({x0:x-r,x1:x+r,z0:z-r,z1:z+r,y0:0,y1:r*2,draw(){drawTumble(x,0,z,r,0);}});}
function drawTumble(x,y,z,r,ang){const lit=litAt(x,z);const p=P(x,y+r,z);const R=Math.max(2,r*k*1.3);const c1=col('#a8875a',1,lit),c2=col('#7d6340',1,lit);
 ell(p[0],p[1],R,R*0.9,0,(px,py)=>{const a=Math.atan2(py+.5-p[1],px+.5-p[0])+ang;const d=Math.hypot(px+.5-p[0],py+.5-p[1])/R;return((Math.floor(a*3+d*5)&1)&&hash(px,py,3)>0.35)||d>0.8?(d>0.7?c2:c1):0;});
 const g=P(x,0,z);for(let i=-1;i<=1;i++)darken(g[0]+i,g[1],0.8);}
function bush(x,z,s){add({x0:x-0.4,x1:x+0.4,z0:z-0.4,z1:z+0.4,y0:0,y1:0.8,draw(){const lit=litAt(x,z);const p=P(x,0,z);const r=Math.max(1.5,k*0.6*s);
  ell(p[0],p[1]-r*0.6,r,r*0.7,0,(px,py)=>{const h=hash(px,py,7);return h>0.25?(py<p[1]-r*0.6?col('#8fa057',1,lit):col('#6b7a3f',1,lit)):0;});}});}


/* ================= sorting ================= */
function prep(o){const m=M;const xs=[o.x0,o.x1],zs=[o.z0,o.z1];let rx0=1e9,rx1=-1e9,rz0=1e9,rz1=-1e9;
 for(const x of xs)for(const z of zs){const dx=x-CX,dz=z-CZ,rx=m[0]*dx+m[1]*dz,rz=m[2]*dx+m[3]*dz;if(rx<rx0)rx0=rx;if(rx>rx1)rx1=rx;if(rz<rz0)rz0=rz;if(rz>rz1)rz1=rz;}
 o.rx0=rx0;o.rx1=rx1;o.rz0=rz0;o.rz1=rz1;const pd=o.pad;
 const sx0=OX+((rx0-pd)-(rz1+pd))*k,sx1=OX+((rx1+pd)-(rz0-pd))*k,sy0=OY+((rx0-pd)+(rz0-pd))*k*.5-o.y1*k*HV-4,sy1=OY+((rx1+pd)+(rz1+pd))*k*.5-o.y0*k*HV+3;
 o.sx0=sx0;o.sx1=sx1;o.sy0=sy0;o.sy1=sy1;o.vis=!(sx1<0||sx0>BW||sy1<0||sy0>BH);}
function cmpO(a,b){const e=1e-6;if(a.rx1<=b.rx0+e||a.rz1<=b.rz0+e)return -1;if(b.rx1<=a.rx0+e||b.rz1<=a.rz0+e)return 1;
 if(a.y1<=b.y0+e)return -1;if(b.y1<=a.y0+e)return 1;return(a.rx0+a.rx1+a.rz0+a.rz1)-(b.rx0+b.rx1+b.rz0+b.rz1)<0?-1:1;}
function drawSorted(list){const L=list.filter(o=>{prep(o);return o.vis;});const n=L.length;const beh=new Array(n);for(let i=0;i<n;i++)beh[i]=[];
 for(let i=0;i<n;i++){const a=L[i];for(let j=i+1;j<n;j++){const b=L[j];if(a.sx1<b.sx0||b.sx1<a.sx0||a.sy1<b.sy0||b.sy1<a.sy0)continue;if(cmpO(a,b)<0)beh[j].push(i);else beh[i].push(j);}}
 const stt=new Uint8Array(n);const order=[];const visit=i=>{if(stt[i])return;stt[i]=1;for(const j of beh[i])visit(j);order.push(i);};
 const idx=[...Array(n).keys()].sort((i,j)=>(L[i].rx0+L[i].rz0)-(L[j].rx0+L[j].rz0));for(const i of idx)visit(i);
 for(const i of order)L[i].draw();}


/* ================= 图鉴专用 ================= */
// 建筑登记：每栋一个文件，调用 building({...})。坐标单位是米，原点是地台中心，+x、+z 两面朝镜头（默认角度）。
const BUILDINGS=[];
function building(def){BUILDINGS.push(def);}
let PAD=18;                 // 地台边长（米），建筑和配景都放在 ±8.5 以内
const SDX=0.5,SDZ=-0.62;      // 影子方向，和样片一致

// 不量化的灯光强度，给地面逐像素用
function litF(x,z){if(!night)return 0;let s=0;for(const l of LAMPS){const d=Math.hypot(x-l.x,z-l.z);if(d<l.r){const f=1-d/l.r;s+=f*f*l.i*1.6;}}return Math.min(1,s);}
function litPx(x,z,px,py){return night?Math.min(1,Math.floor(litF(x,z)*4+bay(px,py)*0.9)/4):0;}

// 地面：平铺多边形（y=0），夜里逐像素吃灯光。pat(wx,wz,px,py) 返回颜色字符串换色、返回 0 留空。
function ground(fn){GROUND.push(fn);}
function gpoly(pts,hex,o={}){const y=o.y||0;ground(()=>{wpoly(pts.map(p=>[p[0],y,p[1]]),0,(px,py)=>{const w=unP(px+.5,py+.5,y);let h=hex;
  if(o.pat){const r=o.pat(w[0],w[1],px,py);if(r===0)return 0;if(r)h=r;}return col(h,o.f||1,litPx(w[0],w[1],px,py));});});}
function gRect(x0,x1,z0,z1,hex,o){gpoly([[x0,z0],[x1,z0],[x1,z1],[x0,z1]],hex,o);}
function gDisc(cx,cz,r,hex,o={}){const pts=[];for(let i=0;i<16;i++){const a=i/16*6.283;pts.push([cx+Math.cos(a)*r,cz+Math.sin(a)*r]);}gpoly(pts,hex,o);}
// 地面上的线（球场线、油漆线）
function gLine(x0,z0,x1,z1,hex,w=1){ground(()=>{wline([x0,0.01,z0],[x1,0.01,z1],col(hex,1,litAt((x0+x1)/2,(z0+z1)/2)),w);});}
// 投影：方块 {x0,x1,z0,z1,h} 或圆 {x,z,h,r}
function shadowBox(x0,x1,z0,z1,h){CAST.push({x0,x1,z0,z1,h});}

// 山墙屋顶：屋脊沿 axis（'x' 或 'z'）方向。gable 是山墙三角的颜色（一般就是墙色）。
function gableRoof(x0,x1,z0,z1,y,rise,h,o={}){const lit=o.lit||0,ax=o.axis||(x1-x0>=z1-z0?'x':'z'),gc=o.gable;
 const A=[x0,y,z0],B=[x1,y,z0],C=[x1,y,z1],D=[x0,y,z1];let faces,tris;
 if(ax==='x'){const cz=(z0+z1)/2,r0=[x0,y+rise,cz],r1=[x1,y+rise,cz];
  faces=[[0,-1,[A,B,r1,r0],[A,B]],[0,1,[D,C,r1,r0],[D,C]]];tris=[[-1,0,[A,D,r0]],[1,0,[B,C,r1]]];var R0=r0,R1=r1;}
 else{const cx=(x0+x1)/2,r0=[cx,y+rise,z0],r1=[cx,y+rise,z1];
  faces=[[-1,0,[A,D,r1,r0],[A,D]],[1,0,[B,C,r1,r0],[B,C]]];tris=[[0,-1,[A,B,r0]],[0,1,[D,C,r1]]];var R0=r0,R1=r1;}
 const all=[...faces.map(f=>['s',...f]),...tris.map(t=>['t',...t])];
 all.sort((a,b)=>(vis(a[1],a[2])?1:0)-(vis(b[1],b[2])?1:0));
 for(const it of all){const[kind,nx,nz,pts,eave]=it;
  if(kind==='t'){if(gc&&vis(nx,nz)){const sp=wpoly(pts,col(gc,faceF(nx,nz),lit));if(o.gableFace)o.gableFace(nx,nz,sp);}continue;}
  const f=0.86+0.2*(nx*LX+nz*LZ);const c1=col(h,f,lit),c2=col(h,f*(o.flat?0.95:0.84),lit);
  const e0=P(...eave[0]),e1=P(...eave[1]);
  wpoly(pts,c1,o.ribs?(px)=>(Math.floor(px/Math.max(2,Math.round(k*0.5)))&1)?c2:c1:stripeSh(e0[0],e0[1],e1[0],e1[1],Math.max(2,k*0.75),c1,c2));
  if(o.holes)o.holes(nx,nz,pts);
  line(e0[0],e0[1],e1[0],e1[1],col(h,f*0.62,lit));}
 const a=P(...R0),b=P(...R1);line(a[0],a[1],b[0],b[1],col(h,1.15,lit));}
// 单坡屋顶（棚子）：从 (z0, yHigh) 斜到 (z1, yLow)，axis='z' 表示坡沿 z 方向
function shedRoof(x0,x1,z0,z1,yA,yB,h,o={}){const lit=o.lit||0,ax=o.axis||'z';
 const pts=ax==='z'?[[x0,yA,z0],[x1,yA,z0],[x1,yB,z1],[x0,yB,z1]]:[[x0,yA,z0],[x0,yA,z1],[x1,yB,z1],[x1,yB,z0]];
 const t=o.th||0.15;const c1=col(h,1,lit),c2=col(h,0.86,lit);
 // 边缘厚度
 const e=ax==='z'?[[x0,yB,z1],[x1,yB,z1],[x1,yB-t,z1],[x0,yB-t,z1]]:[[x1,yB,z0],[x1,yB,z1],[x1,yB-t,z1],[x1,yB-t,z0]];
 wpoly(pts,c1,o.ribs===false?null:(px)=>(Math.floor(px/Math.max(2,Math.round(k*0.5)))&1)?c2:c1);
 wpoly(e,col(h,0.7,lit));if(o.holes)o.holes(pts);}
// 竖向波纹（铁皮墙）
function ribSh(c,c2,per){const p=per||Math.max(2,Math.round(k*0.45));return(px)=>(Math.floor(px/p)&1)?c2:c;}
// 木板封窗的两道斜线
function boardUp(p,lit){if(!p)return;const c=col('#8b6a45',1,lit),d=col('#5e452c',1,lit);line(p[0],p[1],p[4],p[5],d);line(p[2],p[3],p[6],p[7],d);}
// 立柱
function post(x,z,h,hex,w){add({x0:x-0.1,x1:x+0.1,z0:z-0.1,z1:z+0.1,y0:0,y1:h,draw(){wline([x,0,z],[x,h,z],col(hex,1,litAt(x,z)),w||Math.max(1,Math.round(k*0.25)));}});}
// 墙上的小灯：开着的话加光晕和地面光池
function wallLight(x,y,z,on,o={}){if(on){LAMPS.push({x:x+(o.dx||0),z:z+(o.dz||0),r:o.r||5,i:o.i||0.7});LIGHTS.push({x,y,z,r:o.gr||3.5,c:o.c||[255,214,140],i:o.gi||1});}}
// 一个站着或走动的人。pos(T) 可以是函数，返回 [x,z,pose,frame,face]
function npc(x,z,look,o={}){add({x0:x-0.25,x1:x+0.25,z0:z-0.25,z1:z+0.25,y0:0,y1:1.8,pad:0.6,draw(){
  if(o.at){const r=o.at(T);person(r[0],r[1],look,Object.assign({},o,{pose:r[2]||'stand',frame:r[3]||0,face:r[4]||o.face}));}else person(x,z,look,o);}});}
// 字母招牌：3×5 像素字（只写在 +z 或 +x 面上，从左到右）
const FONT5={A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'101111111111101',O:'010101101101010',P:'110101110100100',Q:'010101101111011',R:'110101110101101',S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',Z:'111001010100111','0':'111101101101111','1':'010110010010111','2':'110001010100111','3':'110001010001110','4':'101101111001001','5':'111100110001110','6':'011100111101111','7':'111001010010010','8':'111101111101111','9':'111101111001110',':':'000010000010000','-':'000000111000000','.':'000000000000010','&':'010101010101011','/':'001001010100100',' ':'000000000000000'};
// 在面 plane 上写字：ax='z' 写在 z=c 的面上沿 +x 方向；ax='x' 写在 x=c 的面上沿 -z 方向（从镜头看是从左到右）
function faceText(ax,c,nx,nz,u0,v0,cell,s,hex,lit){if(!vis(nx,nz))return;const cc=col(hex,1,lit);let u=u0;const o=0.04*(nx+nz);
 for(const ch of s){const g=FONT5[ch]||FONT5[' '];for(let r=0;r<5;r++)for(let q=0;q<3;q++)if(g[r*3+q]==='1'){
   const ua=u+q*cell*(ax==='x'?-1:1),ub=ua+cell*(ax==='x'?-1:1),vb=v0+(4-r)*cell,vt=vb+cell;
   const pts=ax==='z'?[[ua,vb,c+o],[ub,vb,c+o],[ub,vt,c+o],[ua,vt,c+o]]:[[c+o,vb,ua],[c+o,vb,ub],[c+o,vt,ub],[c+o,vt,ua]];wpoly(pts,cc);}
  u+=4*cell*(ax==='x'?-1:1);}}
const textW=(s,cell)=>s.length*4*cell-cell;

/* ----- 地台、天空、影子 ----- */
function drawPad(){const h=PAD/2,D=3.2;const x0=-h,x1=h,z0=-h,z1=h;
 const bands=[[0,-0.5,'#c9a676'],[-0.5,-1.5,'#b0855a'],[-1.5,-2.4,'#9a6e48'],[-2.4,-D,'#7e5838']];
 const sides=[[1,0,'x',x1,z0,z1],[-1,0,'x',x0,z0,z1],[0,1,'z',z1,x0,x1],[0,-1,'z',z0,x0,x1]];
 for(const[nx,nz,ax,c,u0,u1]of sides){if(!vis(nx,nz))continue;for(const[ya,yb,hx_]of bands){const cA=col(hx_,faceF(nx,nz)),cB=col(hx_,faceF(nx,nz)*0.9);
   const pts=ax==='x'?[[c,ya,u0],[c,ya,u1],[c,yb,u1],[c,yb,u0]]:[[u0,ya,c],[u1,ya,c],[u1,yb,c],[u0,yb,c]];wpoly(pts,cA,(px,py)=>hash(px>>1,py,9)>0.8?cB:cA);}}
 // 顶面：沙地，带一点颗粒
 const sa=col('#e9c999'),pts=[[x0,0,z0],[x1,0,z0],[x1,0,z1],[x0,0,z1]];
 wpoly(pts,0,(px,py)=>{const w=unP(px+.5,py+.5,0);const n=fbm(w[0]*0.6,w[1]*0.6,3);const L=litPx(w[0],w[1],px,py);
  const hh=n>0.62?'#dfba86':n<0.36?'#f2d8ad':'#e9c999';const g=hash(Math.floor(w[0]*5),Math.floor(w[1]*5),2)>0.97?'#c9a676':hh;return col(g,1,L);});}
let BACK=null,BACKKEY='';
function drawBackdrop(){const key=BW+'x'+BH+(night?'n':'d');if(BACKKEY!==key){BACKKEY=key;BACK=new Uint32Array(BW*BH);
  const sky=night?[[14,16,44],[44,36,84],[92,64,110]]:[[96,178,230],[156,208,236],[248,224,184]];
  for(let y=0;y<BH;y++){const t=y/BH;for(let x=0;x<BW;x++){const tt=clamp(t+(bay(x,y)-0.5)*0.12,0,1);const s=tt<0.6?tt/0.6:1;const a=tt<0.6?sky[0]:sky[1],b=tt<0.6?sky[1]:sky[2];const u=tt<0.6?s:(tt-0.6)/0.4;
    BACK[y*BW+x]=pk(a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u);}}
  if(night){const R=rng(7);for(let i=0;i<BW*BH/900;i++){const x=Math.floor(R()*BW),y=Math.floor(R()*BH*0.6);BACK[y*BW+x]=pk(255,250,220);}}}
 buf.set(BACK);}
function convexHull(p){p=p.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
 const lo=[],up=[];for(const q of p){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop();lo.push(q);}
 for(let i=p.length-1;i>=0;i--){const q=p[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],q)<=0)up.pop();up.push(q);}
 up.pop();lo.pop();return lo.concat(up);}
let SHM=null;
function drawShadows(){if(!SHM||SHM.length!==BW*BH)SHM=new Uint8Array(BW*BH);else SHM.fill(0);const hp=PAD/2;const mark=(x,y)=>{const w=unP(x+.5,y+.5,0);if(w[0]>-hp&&w[0]<hp&&w[1]>-hp&&w[1]<hp)SHM[y*BW+x]=1;return 0;};
 for(const s of CAST){if(s.x0!==undefined){const h=s.h,q=[];for(const[x,z]of[[s.x0,s.z0],[s.x1,s.z0],[s.x1,s.z1],[s.x0,s.z1]]){q.push(P(x,0,z),P(x+SDX*h,0,z+SDZ*h));}
   fillPoly(convexHull(q).flat(),0,mark);}
  else{const c=P(s.x+SDX*s.h*0.9,0,s.z+SDZ*s.h*0.9);const rx=s.r*k*1.2;ell(c[0],c[1],rx,rx*0.5,0,mark);}}
 const f=night?0.86:0.74;for(let i=0;i<SHM.length;i++)if(SHM[i])buf[i]=mulP(buf[i],f,f,f*1.06);}

/* ----- 查看器 ----- */
const View={cur:null,ang:0,angT:0,rotFrom:0,rotStart:-1,zoom:1,panX:0,panY:0,trans:-1,prev:null,
 mount(canvas){this.cv=canvas;this.ctx=canvas.getContext('2d');this.resize();requestAnimationFrame(t=>this.frame(t));this.last=performance.now();},
 resize(){const r=this.cv.getBoundingClientRect();const W=Math.max(1,r.width),H=Math.max(1,r.height);PS=W>=700?2:1;
  BW=Math.ceil(W/PS);BH=Math.ceil(H/PS);this.cv.width=BW;this.cv.height=BH;this.img=this.ctx.createImageData(BW,BH);buf=new Uint32Array(this.img.data.buffer);this.prev=null;},
 fit(){const top=(this.cur&&this.cur.top)||8;const kw=BW*0.94/(2*PAD),kh=BH*0.9/(PAD+top*HV+3.2);k=Math.min(kw,kh)*this.zoom;SP=Math.max(1,Math.round(k/3.2));
  OX=Math.round(BW/2+this.panX);OY=Math.round(BH*0.5+(top*HV-3.2)*k*0.5+this.panY);},
 build(){S=[];A=[];LAMPS=[];LIGHTS=[];CAST=[];GROUND=[];OVER=[];FR=[];CC.clear();if(this.cur)this.cur.build(level);},
 show(def){this.cur=def;PAD=def.pad||18;this.fade();this.build();},
 setLevel(l){if(l===level)return;this.fade();level=l;this.build();},
 setNight(n){this.fade();night=n;this.build();},
 rotate(d){this.rotFrom=this.ang;this.angT+=d*Math.PI/2;this.rotStart=performance.now();},
 fade(){if(buf&&!matchMedia('(prefers-reduced-motion: reduce)').matches){this.prev=buf.slice();this.trans=performance.now();}},
 frame(now){const dt=Math.max(0,Math.min(0.05,(now-this.last)/1000));this.last=now;T+=dt;
  if(this.rotStart>=0){const u=Math.min(1,(now-this.rotStart)/450);const e=u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;this.ang=this.rotFrom+(this.angT-this.rotFrom)*e;if(u>=1){this.ang=this.angT;this.rotStart=-1;}}
  setM(this.ang);this.fit();
  if(buf){drawBackdrop();drawPad();for(const g of GROUND)g();drawShadows();drawSorted(S);for(const f of OVER)f();
   if(night){for(const l of LIGHTS){const p=P(l.x,l.y,l.z);glow(p[0],p[1],(l.flood?l.r*0.6:l.r)*k*0.55+2,l.c,l.i);if(l.flood)rect(p[0]-1,p[1]-1,3,2,em('#ffffff'));}}
   if(this.trans>=0&&this.prev&&this.prev.length===buf.length){const u=(now-this.trans)/450;if(u>=1)this.trans=-1;else for(let y=0;y<BH;y++)for(let x=0;x<BW;x++){if(bay(x>>1,y>>1)>u){const i=y*BW+x;buf[i]=this.prev[i];}}}
   this.ctx.putImageData(this.img,0,0);}
  requestAnimationFrame(t=>this.frame(t));}};
// 横放的圆柱（八棱柱近似）：axis='x' 或 'z'，中心 (x, yc, z)，半径 r，长度 len。按朝向剔除背面。
function hcyl(x,yc,z,r,len,axis,hex,lit,o={}){const N=o.n||10,h=len/2;
 const at=(a,s)=>{const cx=Math.cos(a)*r,cy=Math.sin(a)*r;return axis==='z'?[x+cx,yc+cy,z+s*h]:[x+s*h,yc+cy,z+cx];};
 const facing=(nx,ny,nz)=>{const r2=Rv(nx,nz);return r2[0]+r2[1]+ny/HV>0.02;};
 for(let i=0;i<N;i++){const a0=i/N*6.2832,a1=(i+1)/N*6.2832,am=(a0+a1)/2;const nx=axis==='z'?Math.cos(am):0,nz=axis==='z'?0:Math.cos(am),ny=Math.sin(am);
  if(!facing(nx,ny,nz))continue;const f=0.72+0.18*(nx*LX+nz*LZ)+0.22*ny;wpoly([at(a0,-1),at(a1,-1),at(a1,1),at(a0,1)],col(hex,f,lit));}
 for(const s of[-1,1]){const nx=axis==='x'?s:0,nz=axis==='z'?s:0;if(!facing(nx,0,nz))continue;const pts=[];for(let i=0;i<N;i++)pts.push(at(i/N*6.2832,s));wpoly(pts,col(o.cap||hex,faceF(nx,nz)*0.95,lit));}}
// 球拍（屏幕空间小精灵）：拍头椭圆 + 拍线网格 + 拍柄。s 是拍头半宽（像素）。
function racketPx(cx,cy,hex,lit,s){s=Math.max(2,s);const fr=col(hex,1,lit),fd=col(hex,0.7,lit),st=col('#f4ecd8',0.85,lit);
 const rx=s*0.85,ry=s*1.15;
 ell(cx,cy,rx,ry,0,(px,py)=>{const dx=(px+.5-cx)/rx,dy=(py+.5-cy)/ry,d=dx*dx+dy*dy;return d>0.5?(dx>0.2?fd:fr):(((px-Math.round(cx))&1)||((py-Math.round(cy))&1))?0:st;});
 const w=Math.max(1,Math.round(s*0.3));line(cx,cy+ry,cx,cy+ry+s*1.6,fr,w);rect(Math.round(cx-(w>>1)),Math.round(cy+ry+s*1.0),w,Math.max(1,Math.round(s*0.7)),col('#2a2632',1,lit));}
// 窗口里的半身人：先画人，再由调用方把窗台以下的墙补画回来
function bust(x,z,look,o){person(x,z,look,Object.assign({pose:'stand'},o));}
// 永远画在最上面的东西（飞行中的球等）
function over(fn){OVER.push(fn);}
// 网球：一个 2×2 的黄点，离地时地上有个小影子
function ballPx(x,y,z,lit){const g=P(x,0,z);if(y>0.15)darken(g[0],g[1],0.7);const p=P(x,y,z);const s=Math.max(1,Math.round(k*0.14));rect(p[0]-(s>>1),p[1]-s,s+1,s+1,col('#d8f23a',1,lit));pix(p[0]-(s>>1),p[1]-s,col('#f6ffb0',1,lit));}
// 铁丝球筐：方框 + 一堆黄球
function ballBasket(x,z,full,lit,o={}){const w=o.w||0.35,h=o.h||0.75;const wc=col('#9aa0a6',1,lit);
 const top=[[x-w,h,z-w],[x+w,h,z-w],[x+w,h,z+w],[x-w,h,z+w]];
 for(const[dx,dz]of[[-1,-1],[1,-1],[1,1],[-1,1]])wline([x+dx*w,0,z+dz*w],[x+dx*w,h,z+dz*w],wc);
 if(full>0){const R=rng((x*97+z*13)|0);for(let i=0;i<14*full;i++){const bx=x+(R()-.5)*w*1.6,bz=z+(R()-.5)*w*1.6,by=h*(0.55+R()*0.4*full);const p=P(bx,by,bz);const s=Math.max(1,Math.round(k*0.13));rect(p[0],p[1],s,s,col(R()>.3?'#d8f23a':'#b8d020',1,lit));}}
 for(let i=0;i<4;i++)wline(top[i],top[(i+1)%4],wc);
 if(o.wheels){const a=P(x-w,0.05,z+w),b=P(x+w,0.05,z+w);rect(a[0]-1,a[1]-1,2,2,col('#2a2632',1,lit));rect(b[0]-1,b[1]-1,2,2,col('#2a2632',1,lit));}}
/* ----- 剖面房间（主题医院式）-----
 * 去掉屋顶；朝镜头的两面墙只画到 cut 高，背后两面墙画到 h，旋转时自动换。
 * o.gaps = {n:[[u0,u1]], s:[...], w:[...], e:[...]} 门洞；n/s 是 z0/z1 两面（u 是 x），w/e 是 x0/x1 两面（u 是 z）。
 * o.decor(side, ax, c, nx, nz, u0, u1, H, lit) 画内墙面（只在那面墙当背墙、内面朝镜头时调用）。
 * o.ruin = 荒废：墙头参差、有缺口。 */
function room(x0,x1,z0,z1,o){const t=o.t||0.22,h=o.h||3,cut=o.cut??0.9,wall=o.wall,inner=o.inner||wall,cap=o.cap||wall;
 if(o.floor)gRect(x0,x1,z0,z1,o.floor,{pat:o.floorPat});
 const W=[{s:'n',nx:0,nz:-1,ax:'x',u:[x0,x1],b:(a,c)=>[a,c,z0,z0+t],c:z0+t},{s:'s',nx:0,nz:1,ax:'x',u:[x0,x1],b:(a,c)=>[a,c,z1-t,z1],c:z1-t},
  {s:'w',nx:-1,nz:0,ax:'z',u:[z0+t,z1-t],b:(a,c)=>[x0,x0+t,a,c],c:x0+t},{s:'e',nx:1,nz:0,ax:'z',u:[z0+t,z1-t],b:(a,c)=>[x1-t,x1,a,c],c:x1-t}];
 const R=rng(o.seed||17);
 for(const w of W){let segs=[[w.u[0],w.u[1]]];
  for(const g of(o.gaps&&o.gaps[w.s])||[]){const nx=[];for(const[a,b]of segs){if(g[1]<=a||g[0]>=b){nx.push([a,b]);continue;}if(g[0]>a)nx.push([a,g[0]]);if(g[1]<b)nx.push([g[1],b]);}segs=nx;}
  if(o.ruin){const nx=[];for(const[a,b]of segs){const n=Math.max(1,Math.round((b-a)/1.1));for(let i=0;i<n;i++){const r=R();if(r<0.12)continue;nx.push([a+(b-a)*i/n,a+(b-a)*(i+1)/n,0.35+R()*0.65]);}}segs=nx;}
  for(const sg of segs){const[a,b]=sg,f=sg[2]||1;const[bx0,bx1,bz0,bz1]=w.b(a,b);
   add({x0:bx0,x1:bx1,z0:bz0,z1:bz1,y0:0,y1:h,draw(){const lit=litAt((bx0+bx1)/2,(bz0+bz1)/2);const front=vis(w.nx,w.nz);const H=(front?cut:h)*(front?Math.min(1,f+0.3):f);
     box(bx0,bx1,bz0,bz1,0,H,wall,{lit,top:cap,sideSh:(nx,nz,pts,c)=>{if(nx===-w.nx&&nz===-w.nz)return o.innerSh?o.innerSh(c,lit):()=>col(inner,faceF(nx,nz),lit);return o.outerSh?o.outerSh(c,lit,nx,nz):null;},
      face:(nx,nz)=>{if(!front&&nx===-w.nx&&nz===-w.nz&&o.decor)o.decor(w.s,w.ax,w.c,nx,nz,a,b,H,lit);}});}});}}}
