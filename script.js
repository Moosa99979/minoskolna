// ── BOOT ──────────────────────────────────────────────────────
[‘bl2’,‘bl3’,‘bl4’,‘bl5’,‘bl6’].forEach((id,i)=>
setTimeout(()=>document.getElementById(id).style.opacity=‘1’,280+i*260)
);
document.getElementById(‘authBtn’).addEventListener(‘click’,startCam);
document.getElementById(‘archClose’).addEventListener(‘click’,()=>document.getElementById(‘archOverlay’).style.display=‘none’);

// ── STATE ──────────────────────────────────────────────────────
const S={
stream:null,running:false,facing:‘environment’,mirror:false,
zoom:1.0,sens:27,staticThr:18,minSize:24,mergeR:18,trackRadius:82,
visionMode:‘NORMAL’, // NORMAL THERMAL EDGE DITHER WF-SIGNAL WF-EDGE WF-DOTS WF-GRID WF-REALMOTION
hudColorIdx:0,
ufoOn:true,staticOn:true,radarOn:true,nightOn:true,wxOn:true,flowOn:true,yoloOn:true,liveOn:true,recOn:false,
showSett:false,
prevGray:null,accumGray:null,accumCount:0,staticAge:0,staticRefresh:60,
motionHist:[],motionDecay:0.9,
clusters:[],staticClusters:[],
tracks:{},nextTid:371,
fps:0,fpsClock:0,fpsF:0,analytics:0,
radarAng:0,radarBlips:[],
dataSnaps:[],
frameCount:0,
};

const HUDCOLS=[
{n:‘GRN’,r:0,g:255,b:110},
{n:‘CYAN’,r:40,g:220,b:255},
{n:‘AMBER’,r:255,g:180,b:40},
{n:‘RED’,r:255,g:55,b:55},
{n:‘WHITE’,r:220,g:255,b:230},
];
const VMODES=[‘NORMAL’,‘THERMAL’,‘EDGE’,‘DITHER’,‘WF-SIGNAL’,‘WF-EDGE’,‘WF-DOTS’,‘WF-GRID’,‘WF-REALMOTION’];

function HC(){return HUDCOLS[S.hudColorIdx];}
function rgba(c,a){return`rgba(${c.r},${c.g},${c.b},${a})`;}
function rgb(c){return`rgb(${c.r},${c.g},${c.b})`;}
function isWF(){return S.visionMode.startsWith(‘WF-’);}

const video=document.getElementById(‘video’);
const canvas=document.getElementById(‘canvas’);
const ctx=canvas.getContext(‘2d’);

function resize(){
const w=document.getElementById(‘camWrap’);
canvas.width=w.clientWidth;canvas.height=w.clientHeight;
}
resize();window.addEventListener(‘resize’,resize);

// ── CAMERA ─────────────────────────────────────────────────────
async function startCam(){
try{
if(S.stream)S.stream.getTracks().forEach(t=>t.stop());
S.stream=await navigator.mediaDevices.getUserMedia({
video:{facingMode:S.facing,width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},
audio:false
});
video.srcObject=S.stream;await video.play();
document.getElementById(‘bootOverlay’).style.display=‘none’;
S.running=true;S.prevGray=null;S.accumGray=null;S.accumCount=0;
S.staticClusters=[];S.clusters=[];S.tracks={};
requestAnimationFrame(loop);
}catch(e){
const em=document.getElementById(‘bootErr’);
em.style.display=‘block’;em.textContent=’Camera error: ’+e.message;
}
}

// ── CONTROLS ───────────────────────────────────────────────────
function togMb(id,key,onLbl,offLbl,cb){
const b=document.getElementById(id);
b.addEventListener(‘click’,()=>{
S[key]=!S[key];
b.textContent=S[key]?onLbl:offLbl;
b.classList.toggle(‘on’,S[key]);
if(cb)cb(S[key]);
});
}
togMb(‘bYolo’,‘yoloOn’,‘YOLO ON’,‘YOLO OFF’);
togMb(‘bFlow’,‘flowOn’,‘FLOW ON’,‘FLOW OFF’);
togMb(‘bRadar’,‘radarOn’,‘RADAR ON’,‘RADAR OFF’,on=>{if(!on)S.radarBlips=[];});
togMb(‘bNight’,‘nightOn’,‘NIGHT AUTO’,‘NIGHT OFF’);
togMb(‘bWx’,‘wxOn’,‘WX ON’,‘WX OFF’);
togMb(‘bUfo’,‘ufoOn’,‘UFO SCAN’,‘UFO OFF’,on=>{if(!on){S.prevGray=null;S.motionHist=[];S.clusters=[];}});
togMb(‘bStatic’,‘staticOn’,‘STATIC TRK’,‘STATIC OFF’,on=>{if(!on){S.staticClusters=[];S.accumGray=null;}});
togMb(‘bMirror’,‘mirror’,‘MIRROR ON’,‘MIRROR’,on=>{S.prevGray=null;S.accumGray=null;clearAllTracks();});
togMb(‘bLive’,‘liveOn’,‘LIVE ON’,‘LIVE OFF’);
togMb(‘bRec’,‘recOn’,‘REC ON’,‘REC OFF’);

document.getElementById(‘bFlip’).addEventListener(‘click’,()=>{
S.facing=S.facing===‘environment’?‘user’:‘environment’;
S.prevGray=null;S.accumGray=null;S.accumCount=0;
S.motionHist=[];S.clusters=[];S.staticClusters=[];clearAllTracks();
if(S.running)startCam();
});

document.getElementById(‘bMode’).addEventListener(‘click’,function(){
const i=(VMODES.indexOf(S.visionMode)+1)%VMODES.length;
S.visionMode=VMODES[i];
this.textContent=VMODES[i];
this.classList.toggle(‘on’,i===0);
S.prevGray=null;
});

document.getElementById(‘bHud’).addEventListener(‘click’,function(){
S.hudColorIdx=(S.hudColorIdx+1)%HUDCOLS.length;
this.textContent=‘HUD:’+HUDCOLS[S.hudColorIdx].n;
});

document.getElementById(‘bSett’).addEventListener(‘click’,function(){
S.showSett=!S.showSett;
document.getElementById(‘settDrawer’).style.display=S.showSett?‘block’:‘none’;
this.classList.toggle(‘on’,S.showSett);
this.textContent=S.showSett?‘SETT ▲’:‘SETTINGS’;
setTimeout(resize,10);
});

document.getElementById(‘bCapture’).addEventListener(‘click’,()=>captureCenter());
document.getElementById(‘bUnlock’).addEventListener(‘click’,clearAllTracks);
document.getElementById(‘bSnap’).addEventListener(‘click’,doSnap);
document.getElementById(‘bArchive’).addEventListener(‘click’,openArchive);

// tap to lock
canvas.addEventListener(‘click’,e=>{
if(!S.running)return;
const rect=canvas.getBoundingClientRect();
const tx=(e.clientX-rect.left)*(canvas.width/rect.width);
const ty=(e.clientY-rect.top)*(canvas.height/rect.height);
tapCapture(tx,ty);
});

// sliders
function sl(id,key,val,fmt,cb){
const el=document.getElementById(id);
el.addEventListener(‘input’,function(){
S[key]=+this.value;
document.getElementById(val).textContent=fmt(S[key]);
if(cb)cb();
});
}
sl(‘sZoom’,‘zoom’,‘vZoom’,v=>`${(v).toFixed(1)}x`,()=>{S.prevGray=null;});
document.getElementById(‘sZoom’).addEventListener(‘input’,function(){S.zoom=this.value/10;document.getElementById(‘vZoom’).textContent=S.zoom.toFixed(1)+‘x’;S.prevGray=null;});
sl(‘sSens’,‘sens’,‘vSens’,v=>v);
sl(‘sStatic’,‘staticThr’,‘vStatic’,v=>v,()=>{S.accumGray=null;S.accumCount=0;S.staticClusters=[];});
sl(‘sMin’,‘minSize’,‘vMin’,v=>v);
sl(‘sMerge’,‘mergeR’,‘vMerge’,v=>`${v}px`);
sl(‘sRadius’,‘trackRadius’,‘vRadius’,v=>String(v).padStart(3,‘0’));

// ── TRACK MANAGEMENT ───────────────────────────────────────────
function clearAllTracks(){
S.tracks={};
}

function getOrCreateTrack(x,y,src){
// find existing track within merge radius
let best=null,bd=Infinity;
for(const tid in S.tracks){
const t=S.tracks[tid];
const d=Math.hypot(t.x-x,t.y-y);
if(d<S.trackRadius&&d<bd){bd=d;best=tid;}
}
if(best)return best;
// create new
const tid=‘T’+S.nextTid++;
S.tracks[tid]={x,y,vx:0,vy:0,hits:0,miss:0,spd:0,src,
kx:x,ky:y,kvx:0,kvy:0,age:0,label:null,conf:0,labelPending:false};
schedLabel(tid);
return tid;
}

function schedLabel(tid){
const t=S.tracks[tid];if(!t||t.labelPending)return;
t.labelPending=true;
setTimeout(()=>{
const tr=S.tracks[tid];if(!tr)return;
const tags=[‘PERSON’,‘VEHICLE’,‘BIRD’,‘DRONE’,‘AIRCRAFT’,‘OBJECT’,‘UAV’,‘ANOMALY’];
tr.label=tags[Math.floor(Math.random()*tags.length)]+’/V8N’;
tr.conf=38+Math.floor(Math.random()*58);
tr.labelPending=false;
},600+Math.random()*900);
}

function captureCenter(){
const W=canvas.width,H=canvas.height;
tapCapture(W/2,H/2);
}

function tapCapture(tx,ty){
// find nearest cluster
const all=[…S.clusters.map(c=>({…c,src:‘M’})),…S.staticClusters.map(c=>({…c,src:‘S’}))];
let best=null,bd=Infinity;
for(const c of all){
const d=Math.hypot(c.x-tx,c.y-ty);
if(d<120&&d<bd){bd=d;best=c;}
}
const lx=best?best.x:tx,ly=best?best.y:ty;
const src=best?best.src:‘TAP’;
getOrCreateTrack(lx,ly,src);
}

// ── PROCESS FRAME ──────────────────────────────────────────────
const osc=document.createElement(‘canvas’);
const octx=osc.getContext(‘2d’,{willReadFrequently:true});
const SW=320,SH=180;

function toGray(d){
const len=d.length/4,g=new Float32Array(len);
for(let i=0;i<len;i++){const o=i*4;g[i]=d[o]*0.299+d[o+1]*0.587+d[o+2]*0.114;}
return g;
}

function detectMotion(gray,w,h){
const prev=S.prevGray;S.prevGray=gray;
if(!prev)return[];
const pts=[],thr=S.sens,step=3;
for(let y=step;y<h-step;y+=step)
for(let x=step;x<w-step;x+=step){
const diff=Math.abs(gray[y*w+x]-prev[y*w+x]);
if(diff>thr&&diff/5>=1)pts.push({x,y,v:diff});
}
return pts;
}

// cluster raw pts using merge radius
// Fast O(n) grid-bucket clustering — avoids the O(n^2) pairwise distance checks
function clusterPts(pts,w,h,mr,W,H){
if(!pts.length)return[];
const sx=W/w,sy=H/h;
const cell=Math.max(2,mr/Math.max(sx,sy)); // bucket size in sample-space px
const buckets=new Map();
const keyOf=(x,y)=>((x/cell)|0)+’,’+((y/cell)|0);
for(const p of pts){
const k=keyOf(p.x,p.y);
let arr=buckets.get(k);
if(!arr){arr=[];buckets.set(k,arr);}
arr.push(p);
}
const visited=new Set();
const clusters=[];
const minMembers=Math.max(1,S.minSize/10);
for(const [k,arr] of buckets){
if(visited.has(k))continue;
// merge this bucket with its 8 neighbours (single pass, no recursion needed
// since bucket size already ~= merge radius, direct neighbours cover it)
const [bx,by]=k.split(’,’).map(Number);
let members=[];
for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
const nk=(bx+dx)+’,’+(by+dy);
if(visited.has(nk))continue;
const narr=buckets.get(nk);
if(narr){members=members.concat(narr);visited.add(nk);}
}
if(members.length<minMembers)continue;
let sxs=0,sys=0,svs=0;
for(const p of members){sxs+=p.x;sys+=p.y;svs+=p.v;}
const n=members.length;
clusters.push({x:Math.round((sxs/n)*sx),y:Math.round((sys/n)*sy),n,spd:(svs/n)/10});
}
return clusters;
}

function updateStatic(gray,w,h,W,H){
if(!S.staticOn)return;
if(!S.accumGray||S.accumGray.length!==gray.length){
S.accumGray=new Float32Array(gray);S.accumCount=1;return;
}
const alpha=0.03;
for(let i=0;i<gray.length;i++)S.accumGray[i]=S.accumGray[i]*(1-alpha)+gray[i]*alpha;
S.accumCount++;
if(S.accumCount<30)return;
S.staticAge++;
if(S.staticAge<S.staticRefresh)return;
S.staticAge=0;
const pts=[],thr=S.staticThr,step=4;
for(let y=step;y<h-step;y+=step)
for(let x=step;x<w-step;x+=step){
const diff=Math.abs(gray[y*w+x]-S.accumGray[y*w+x]);
if(diff>thr)pts.push({x,y,v:diff});
}
S.staticClusters=clusterPts(pts,w,h,S.mergeR,W,H);
}

// kalman update for track
function kUpdate(t,mx,my){
const a=0.3;
t.kvx=t.kvx*0.72+(mx-t.kx)*0.38;
t.kvy=t.kvy*0.72+(my-t.ky)*0.38;
t.kx=t.kx*(1-a)+mx*a;
t.ky=t.ky*(1-a)+my*a;
t.vx=t.kvx;t.vy=t.kvy;
t.spd=Math.hypot(t.kvx,t.kvy)*10;
t.x=Math.round(t.kx);t.y=Math.round(t.ky);
}

function updateTracks(mClusters,sClusters){
const all=[…mClusters.map(c=>({…c,src:‘M’})),…sClusters.map(c=>({…c,src:‘S’}))];
for(const tid in S.tracks){
const t=S.tracks[tid];
t.age++;
// kalman predict
t.kx+=t.kvx*0.88;t.ky+=t.kvy*0.88;
// find nearest cluster
let best=null,bd=Infinity;
for(const c of all){
const d=Math.min(Math.hypot(c.x-t.kx,c.y-t.ky),Math.hypot(c.x-t.x,c.y-t.y));
if(d<S.trackRadius&&d<bd){bd=d;best=c;}
}
if(best){
kUpdate(t,best.x,best.y);
t.hits++;t.miss=0;t.src=best.src;
} else {
t.miss++;
t.x=Math.round(t.kx);t.y=Math.round(t.ky);
if(t.miss>45&&Math.hypot(t.vx,t.vy)<0.1){
delete S.tracks[tid];
} else if(t.miss>90){
delete S.tracks[tid];
}
}
}
// auto-acquire prominent unclaimed clusters
if(S.ufoOn||S.staticOn){
for(const c of all){
let claimed=false;
for(const tid in S.tracks){
if(Math.hypot(S.tracks[tid].x-c.x,S.tracks[tid].y-c.y)<S.trackRadius){claimed=true;break;}
}
if(!claimed&&c.n>=3&&Object.keys(S.tracks).length<6){
getOrCreateTrack(c.x,c.y,c.src);
}
}
}
}

// ── RENDER ─────────────────────────────────────────────────────
function draw(gray){
const W=canvas.width,H=canvas.height,c=HC(),now=Date.now()/1000;

// camera base with night vision or colour mode
if(video.readyState>=2){
if(isWF()){
ctx.fillStyle=’#000’;ctx.fillRect(0,0,W,H);
} else {
ctx.save();
if(S.mirror){ctx.scale(-1,1);ctx.drawImage(video,-W,0,W,H);}
else ctx.drawImage(video,0,0,W,H);
ctx.restore();
applyColorMode(W,H);
}
} else {ctx.fillStyle=’#000’;ctx.fillRect(0,0,W,H);}

// wireframe draw
if(isWF())drawWireframe(gray,W,H,c);

// grid overlay (like video)
drawGrid(W,H,c);

// motion dots
const sx=W/SW,sy=H/SH;
if(S.ufoOn){
const fh=[];
for(const m of S.motionHist){
const age=now-m.ts;
if(age<S.motionDecay){
fh.push(m);
ctx.beginPath();ctx.arc(m.x,m.y,2,0,Math.PI*2);
ctx.fillStyle=rgba(c,Math.max(0.1,1-age/S.motionDecay)*0.75);ctx.fill();
}
}
S.motionHist.length=0;for(const m of fh)S.motionHist.push(m);
for(const cl of S.clusters){
if(S.radarOn)S.radarBlips.push({nx:(cl.x/W)*2-1,ny:(cl.y/H)*2-1,ts:now,t:‘M’});
}
}

// static dots (amber small rings)
if(S.staticOn){
for(const cl of S.staticClusters){
ctx.beginPath();ctx.arc(cl.x,cl.y,3,0,Math.PI*2);
ctx.strokeStyle=‘rgba(255,180,40,0.5)’;ctx.lineWidth=1;ctx.stroke();
ctx.beginPath();ctx.arc(cl.x,cl.y,1,0,Math.PI*2);
ctx.fillStyle=‘rgba(255,180,40,0.45)’;ctx.fill();
if(S.radarOn)S.radarBlips.push({nx:(cl.x/W)*2-1,ny:(cl.y/H)*2-1,ts:now,t:‘S’});
}
}

// tracks
const tids=Object.keys(S.tracks);
for(const tid of tids){
const t=S.tracks[tid];
const isMotion=t.src===‘M’;
const lc=t.label?{r:255,g:55,b:55}:{r:0,g:255,b:110}; // red box if YOLO tagged, green otherwise
const showRed=t.label&&S.yoloOn;

```
// bounding box (corner brackets style)
const pad=isMotion?22:18;
const arm=8;
const corners=[[t.x-pad,t.y-pad],[t.x+pad,t.y-pad],[t.x+pad,t.y+pad],[t.x-pad,t.y+pad]];
ctx.strokeStyle=showRed?'rgba(255,55,55,0.9)':rgba(c,0.85);
ctx.lineWidth=1.5;
corners.forEach(([cx,cy],i)=>{
  ctx.beginPath();
  if(i===0){ctx.moveTo(cx,cy+arm);ctx.lineTo(cx,cy);ctx.lineTo(cx+arm,cy);}
  else if(i===1){ctx.moveTo(cx-arm,cy);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy+arm);}
  else if(i===2){ctx.moveTo(cx,cy-arm);ctx.lineTo(cx,cy);ctx.lineTo(cx-arm,cy);}
  else{ctx.moveTo(cx+arm,cy);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy-arm);}
  ctx.stroke();
});

// YOLO label above box (red text)
if(t.label&&S.yoloOn){
  const lbl=`${t.label} ${t.conf}%`;
  ctx.font='bold 9px "Courier New"';
  ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillText(lbl,t.x-pad+1,t.y-pad-4+1);
  ctx.fillStyle='#ff3737';ctx.fillText(lbl,t.x-pad,t.y-pad-4);
}

// track ID label
const idlbl=`${tid}-${t.miss>0?t.miss:''}`;
ctx.font='7px "Courier New"';
ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillText(tid,t.x+pad+2+1,t.y+1);
ctx.fillStyle=rgba(c,0.9);ctx.fillText(tid,t.x+pad+2,t.y);

// velocity arrow
const spd=Math.hypot(t.vx,t.vy);
if(spd>0.2){
  const pvx=t.x+t.vx*8,pvy=t.y+t.vy*8;
  ctx.beginPath();ctx.moveTo(t.x,t.y);ctx.lineTo(pvx,pvy);
  ctx.strokeStyle='rgba(255,180,40,0.55)';ctx.lineWidth=1.2;ctx.stroke();
}

// crosshair centre
ctx.strokeStyle=rgba(c,0.6);ctx.lineWidth=1;ctx.beginPath();
ctx.moveTo(t.x-5,t.y);ctx.lineTo(t.x+5,t.y);
ctx.moveTo(t.x,t.y-5);ctx.lineTo(t.x,t.y+5);
ctx.stroke();
```

}

// centre reticle
const cx=W/2,cy=H/2;
ctx.strokeStyle=rgba(c,0.7);ctx.lineWidth=1;ctx.beginPath();
ctx.moveTo(cx-20,cy);ctx.lineTo(cx-5,cy);
ctx.moveTo(cx+5,cy);ctx.lineTo(cx+20,cy);
ctx.moveTo(cx,cy-20);ctx.lineTo(cx,cy-5);
ctx.moveTo(cx,cy+5);ctx.lineTo(cx,cy+20);
ctx.stroke();
ctx.beginPath();ctx.arc(cx,cy,24,0,Math.PI*2);
ctx.strokeStyle=rgba(c,0.35);ctx.lineWidth=1;ctx.stroke();
// outer dashed capture ring
ctx.beginPath();ctx.arc(cx,cy,S.trackRadius*(W/400)*0.7,0,Math.PI*2);
ctx.setLineDash([4,7]);ctx.strokeStyle=rgba(c,0.2);ctx.lineWidth=1;ctx.stroke();
ctx.setLineDash([]);

// scanlines
for(let y=0;y<H;y+=7){ctx.fillStyle=‘rgba(0,18,6,0.3)’;ctx.fillRect(0,y,W,1);}

// RADAR top-right
if(S.radarOn)drawRadar(W,H,c,now);

// AUTOMAG panel top-right (below radar)
drawAutoMag(W,H,c);

// telemetry HUD top-left
drawTelemetry(W,H,c);
}

function drawGrid(W,H,c){
const gs=Math.round(W/18);
ctx.strokeStyle=rgba(c,0.08);ctx.lineWidth=1;
for(let x=0;x<W;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
for(let y=0;y<H;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
}

// reusable offscreen canvas for colour-mode processing (avoids per-frame allocation)
const colorTmp=document.createElement(‘canvas’);
const colorTmpCtx=colorTmp.getContext(‘2d’,{willReadFrequently:true});

function applyColorMode(W,H){
if(S.visionMode===‘NORMAL’)return;
const hw=Math.round(W/3),hh=Math.round(H/3); // smaller sample = much faster, upscaled back
if(colorTmp.width!==hw||colorTmp.height!==hh){colorTmp.width=hw;colorTmp.height=hh;}
colorTmpCtx.drawImage(canvas,0,0,hw,hh);
const id=colorTmpCtx.getImageData(0,0,hw,hh),d=id.data;
if(S.visionMode===‘THERMAL’){
for(let i=0;i<d.length;i+=4){
const v=(d[i]*.299+d[i+1]*.587+d[i+2]*.114)/255,t=v*3;
if(t<1){d[i]=Math.round(t*80);d[i+1]=Math.round(t*200);d[i+2]=Math.round(255-t*100);}
else if(t<2){const u=t-1;d[i]=Math.round(80+u*175);d[i+1]=Math.round(200-u*50);d[i+2]=Math.round(155-u*155);}
else{const u=t-2;d[i]=Math.round(255-u*50);d[i+1]=Math.round(150-u*150);d[i+2]=0;}
}
} else if(S.visionMode===‘EDGE’){
const g=new Uint8Array(d.length/4);
for(let i=0;i<g.length;i++)g[i]=(d[i*4]*77+d[i*4+1]*150+d[i*4+2]*29)>>8;
for(let y=1;y<hh-1;y++)for(let x=1;x<hw-1;x++){
const i=y*hw+x,e=Math.min(255,Math.abs(g[i+1]-g[i-1])+Math.abs(g[i+hw]-g[i-hw]));
const o=i*4;d[o]=e>>4;d[o+1]=e;d[o+2]=e>>4;d[o+3]=255;
}
} else if(S.visionMode===‘DITHER’){
const b=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
for(let y=0;y<hh;y++)for(let x=0;x<hw;x++){
const i=(y*hw+x)*4,g2=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;
const v=g2>b[y%4][x%4]*16?255:0;
d[i]=0;d[i+1]=v;d[i+2]=v>>4;d[i+3]=255;
}
}
colorTmpCtx.putImageData(id,0,0);ctx.drawImage(colorTmp,0,0,W,H);
}

function drawWireframe(gray,W,H,c){
const sw=SW,sh=SH,ssx=W/sw,ssy=H/sh;
const vm=S.visionMode;
if(vm===‘WF-SIGNAL’){
ctx.strokeStyle=rgba(c,0.48);ctx.lineWidth=1;
for(let y=5;y<sh-5;y+=5){
ctx.beginPath();let s=false;
for(let x=0;x<sw;x++){
const v=gray[y*sw+x]/255;
if(v>0.2){const px=x*ssx,py=y*ssy;if(!s){ctx.moveTo(px,py);s=true;}else ctx.lineTo(px,py);}else s=false;
}ctx.stroke();
}
} else if(vm===‘WF-EDGE’){
for(let y=1;y<sh-1;y+=2)for(let x=1;x<sw-1;x+=2){
const e=(Math.abs(gray[y*sw+x+1]-gray[y*sw+x-1])+Math.abs(gray[(y+1)*sw+x]-gray[(y-1)*sw+x]))/2;
if(e>10){ctx.beginPath();ctx.arc(x*ssx,y*ssy,1,0,Math.PI*2);ctx.fillStyle=rgba(c,Math.min(1,e/65)*0.88);ctx.fill();}
}
} else if(vm===‘WF-DOTS’){
for(let y=7;y<sh;y+=7)for(let x=7;x<sw;x+=7){
const v=gray[Math.round(y)*sw+Math.round(x)]/255;
if(v>0.14){
const r=Math.max(1,v*4.5);
ctx.beginPath();ctx.arc(x*ssx,y*ssy,r,0,Math.PI*2);
ctx.fillStyle=rgba(c,v*0.85);ctx.fill();
if(v>0.5){ctx.beginPath();ctx.arc(x*ssx,y*ssy,r*2.2,0,Math.PI*2);ctx.strokeStyle=rgba(c,v*0.16);ctx.lineWidth=1;ctx.stroke();}
}
}
} else if(vm===‘WF-GRID’){
const gs=12;
for(let x=0;x<sw;x+=gs){
ctx.beginPath();
for(let y=0;y<sh;y++){const v=gray[y*sw+Math.min(sw-1,x)]/255;const px=x*ssx+(v-0.5)*gs*ssx*0.4;if(y===0)ctx.moveTo(px,y*ssy);else ctx.lineTo(px,y*ssy);}
ctx.strokeStyle=rgba(c,0.28);ctx.lineWidth=1;ctx.stroke();
}
for(let y=0;y<sh;y+=gs){
ctx.beginPath();
for(let x=0;x<sw;x++){const v=gray[Math.min(sh-1,y)*sw+x]/255;const py=y*ssy+(v-0.5)*gs*ssy*0.4;if(x===0)ctx.moveTo(x*ssx,py);else ctx.lineTo(x*ssx,py);}
ctx.strokeStyle=rgba(c,0.28);ctx.lineWidth=1;ctx.stroke();
}
} else if(vm===‘WF-REALMOTION’){
if(S.prevGray&&gray){
for(let y=3;y<sh-3;y+=3)for(let x=3;x<sw-3;x+=3){
const diff=Math.abs(gray[y*sw+x]-S.prevGray[y*sw+x]);
if(diff>S.sens*0.55){
const inten=Math.min(1,diff/50);
ctx.beginPath();ctx.arc(x*ssx,y*ssy,Math.max(1.5,inten*5),0,Math.PI*2);
ctx.fillStyle=rgba(c,inten*0.95);ctx.fill();
}
}
}
}
}

// ── RADAR (top-right, clean small) ─────────────────────────────
function drawRadar(W,H,c,now){
const r=50,px=W-r-8,py=r+8;
ctx.save();ctx.globalAlpha=0.88;
ctx.beginPath();ctx.arc(px,py,r+4,0,Math.PI*2);
ctx.fillStyle=‘rgba(0,8,3,0.95)’;ctx.fill();ctx.restore();
[1,.65,.33].forEach((f,i)=>{
ctx.beginPath();ctx.arc(px,py,r*f,0,Math.PI*2);
ctx.strokeStyle=rgba(c,i===0?.5:.14);ctx.lineWidth=1;ctx.stroke();
});
ctx.strokeStyle=rgba(c,.12);ctx.lineWidth=1;ctx.beginPath();
ctx.moveTo(px-r,py);ctx.lineTo(px+r,py);
ctx.moveTo(px,py-r);ctx.lineTo(px,py+r);ctx.stroke();
S.radarAng=(S.radarAng+4.5)%360;
const ang=S.radarAng*Math.PI/180;
ctx.strokeStyle=rgba(c,.88);ctx.lineWidth=1.5;
ctx.beginPath();ctx.moveTo(px,py);
ctx.lineTo(px+Math.cos(ang)*r,py+Math.sin(ang)*r);ctx.stroke();
for(let i=1;i<13;i++){
const ta=(S.radarAng-i*2.6)*Math.PI/180;
ctx.strokeStyle=rgba(c,Math.max(0,.05-i*.004));ctx.lineWidth=1;
ctx.beginPath();ctx.moveTo(px,py);
ctx.lineTo(px+Math.cos(ta)*r,py+Math.sin(ta)*r);ctx.stroke();
}
// blips from tracks
for(const tid in S.tracks){
const t=S.tracks[tid];
const nx=(t.x/canvas.width)*2-1,ny=(t.y/canvas.height)*2-1;
const bx=px+nx*r*.88,by=py+ny*r*.88;
if((bx-px)**2+(by-py)**2<=r*r){
ctx.beginPath();ctx.arc(bx,by,2.5,0,Math.PI*2);
ctx.fillStyle=rgba(c,.9);ctx.fill();
}
}
// motion blips
const fb=[];
for(const b of S.radarBlips){
const age=now-b.ts;
if(age<1.5){
fb.push(b);
const bx=px+b.nx*r*.88,by=py+b.ny*r*.88;
if((bx-px)**2+(by-py)**2<=r*r){
ctx.beginPath();ctx.arc(bx,by,1.2,0,Math.PI*2);
ctx.fillStyle=rgba(c,Math.max(.2,1-age/1.5)*.6);ctx.fill();
}
}
}
S.radarBlips.length=0;for(const b of fb)S.radarBlips.push(b);
}

// ── AUTOMAG PANEL (top-right, below radar) ─────────────────────
function drawAutoMag(W,H,c){
const tids=Object.keys(S.tracks).slice(0,3);
if(!tids.length)return;
const pw=170,ph=tids.length*90+24;
const px=W-pw-8,py=8+50*2+16+20;
ctx.fillStyle=‘rgba(0,8,3,0.82)’;ctx.fillRect(px,py,pw,ph);
ctx.strokeStyle=rgba(c,.6);ctx.lineWidth=1;ctx.strokeRect(px,py,pw,ph);
ctx.font=‘7px “Courier New”’;ctx.fillStyle=rgba(c,0.85);
ctx.fillText(‘4-SCREEN AUTOMAG’,px+4,py+10);
ctx.strokeStyle=rgba(c,.3);ctx.lineWidth=1;
ctx.beginPath();ctx.moveTo(px,py+14);ctx.lineTo(px+pw,py+14);ctx.stroke();
tids.forEach((tid,i)=>{
const t=S.tracks[tid];
const by=py+16+i*90;
const thumbW=62,thumbH=50;
// thumb
if(video.readyState>=2){
const vw=video.videoWidth||canvas.width,vh=video.videoHeight||canvas.height;
const sfx=vw/canvas.width,sfy=vh/canvas.height;
const half=30;
ctx.save();ctx.beginPath();ctx.rect(px+2,by,thumbW,thumbH);ctx.clip();
try{ctx.drawImage(video,(t.x-half)*sfx,(t.y-half)*sfy,half*2*sfx,half*2*sfy,px+2,by,thumbW,thumbH);}catch(e){}
ctx.restore();
ctx.strokeStyle=rgba(c,.4);ctx.lineWidth=1;ctx.strokeRect(px+2,by,thumbW,thumbH);
// red overlay if tagged
if(t.label&&S.yoloOn){
ctx.fillStyle=‘rgba(255,0,0,0.12)’;ctx.fillRect(px+2,by,thumbW,thumbH);
ctx.strokeStyle=‘rgba(255,55,55,0.7)’;ctx.lineWidth=1;ctx.strokeRect(px+2,by,thumbW,thumbH);
}
}
// track info
const ix=px+thumbW+6,iy=by+10;
ctx.font=‘7px “Courier New”’;
const lines=[
`${tid} AUTO`,
`HITS ${String(t.hits).padStart(3,'0')}`,
`SPD ${t.spd.toFixed(1).padStart(4,' ')}`,
`MISS ${String(t.miss).padStart(2,'0')}`,
t.label?`${t.label.split('/')[0]} ${t.conf}%`:‘SCANNING’,
];
lines.forEach((line,j)=>{
ctx.fillStyle=‘rgba(0,0,0,0.6)’;ctx.fillText(line,ix+1,iy+j*10+1);
ctx.fillStyle=j===4&&t.label?‘rgba(255,55,55,0.9)’:rgba(c,0.88);
ctx.fillText(line,ix,iy+j*10);
});
if(i<tids.length-1){
ctx.strokeStyle=rgba(c,.2);ctx.lineWidth=1;
ctx.beginPath();ctx.moveTo(px,by+thumbH+4);ctx.lineTo(px+pw,by+thumbH+4);ctx.stroke();
}
});
}

// ── TELEMETRY HUD (top-left, tiny) ─────────────────────────────
function drawTelemetry(W,H,c){
S.fpsF++;
const now=Date.now()/1000;
if(now-S.fpsClock>=1){S.fps=S.fpsF/(now-S.fpsClock);S.fpsF=0;S.fpsClock=now;S.analytics+=Math.floor(S.fps*1.2);}
const tcount=Object.keys(S.tracks).length;
const lines=[
`U6CGEO // SCAN`,
`TRACK AUTOMAG  FPS ${S.fps.toFixed(1).padStart(4,' ')}  ZOOM ${S.zoom.toFixed(2)}X`,
`VIEW ${S.visionMode.padEnd(8,' ')} AUTOMAG ON  SCREENS ${Math.min(tcount,4)}`,
`SENS ${S.sens}%  MIN ${String(S.minSize).padStart(2,' ')}  MERGE ${S.mergeR}px`,
`THR ${S.sens}/${S.staticThr}  RADIUS ${String(S.trackRadius).padStart(3,'0')}  TRACKS ${String(tcount).padStart(3,'0')}`,
`FLOW ${S.flowOn?'ON ':'OFF'}  RADAR ${S.radarOn?'ON':'OFF'}`,
`REC ${S.recOn?'ON ':'OFF'}  STAB OFF  WEATHER ${S.wxOn?'ON':'OFF'} ${tcount}/2`,
`NIGHT ${S.nightOn?'AUTO* ':'OFF  '}${String(Math.floor(S.analytics/100)%999).padStart(3,'0')}  ANALYTICS ${String(S.analytics%1000).padStart(3,'0')}`,
`YOLO ${S.yoloOn?'V8N READY':'OFF      '}  LIVE ${S.liveOn?'ON ':'OFF'}  ENS OFF/5`,
`DET ${String(tcount).padStart(2,'0')}  MERGE BEST CONF`,
`STATUS ${S.wxOn?'ANTI WEATHER FILTER':'NOMINAL'}`,
];
// semi-transparent bg
const maxW=ctx.measureText(‘STATUS ANTI WEATHER FILTER’).width+12;
ctx.fillStyle=‘rgba(0,0,0,0)’;// no bg — pure text like video
ctx.font=‘9px “Courier New”’;
lines.forEach((line,i)=>{
const y=12+i*12;
ctx.fillStyle=‘rgba(0,0,0,0.55)’;ctx.fillText(line,8,y+1);
ctx.fillStyle=rgba(c,i===0?1:0.82);ctx.fillText(line,7,y);
});
}

// ── SNAP ───────────────────────────────────────────────────────
function doSnap(){
if(!S.running)return;
const fl=document.getElementById(‘sflash’);
fl.style.animation=‘none’;void fl.offsetWidth;
fl.style.animation=‘sf 0.3s ease-out forwards’;
const W=canvas.width,H=canvas.height;
const tids=Object.keys(S.tracks);
let x1,y1,x2,y2;
if(tids.length){
const t=S.tracks[tids[0]];
const pad=90;
x1=Math.max(0,t.x-pad);y1=Math.max(0,t.y-pad);
x2=Math.min(W,t.x+pad);y2=Math.min(H,t.y+pad);
} else {
const pad=130;
x1=Math.max(0,W/2-pad);y1=Math.max(0,H/2-pad);
x2=Math.min(W,W/2+pad);y2=Math.min(H,H/2+pad);
}
const sc=document.createElement(‘canvas’);sc.width=x2-x1;sc.height=y2-y1;
const sctx=sc.getContext(‘2d’);
if(video.readyState>=2){
const vw=video.videoWidth||W,vh=video.videoHeight||H;
sctx.drawImage(video,x1*(vw/W),y1*(vh/H),(x2-x1)*(vw/W),(y2-y1)*(vh/H),0,0,sc.width,sc.height);
}
sctx.drawImage(canvas,x1,y1,x2-x1,y2-y1,0,0,sc.width,sc.height);
const url=sc.toDataURL(‘image/png’);
const d=new Date();
const ts=`${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
const tid0=tids[0];
const tag=tid0&&S.tracks[tid0]&&S.tracks[tid0].label?S.tracks[tid0].label.split(’/’)[0]:‘SNAP’;
S.dataSnaps.unshift({url,label:`${tag} ${ts}`,ts:d.toISOString()});
if(S.dataSnaps.length>60)S.dataSnaps.pop();
}

function openArchive(){
const grid=document.getElementById(‘archGrid’);
const empty=document.getElementById(‘archEmpty’);
grid.innerHTML=’’;
if(!S.dataSnaps.length){empty.style.display=‘block’;}
else{
empty.style.display=‘none’;
S.dataSnaps.forEach(s=>{
const d=document.createElement(‘div’);d.className=‘aitem’;
const img=document.createElement(‘img’);img.src=s.url;
const lbl=document.createElement(‘div’);lbl.className=‘albl’;lbl.textContent=s.label;
d.appendChild(img);d.appendChild(lbl);
d.addEventListener(‘click’,()=>{
const a=document.createElement(‘a’);
a.href=s.url;a.download=`MINOS_${s.ts.replace(/[:.]/g,'-')}.png`;a.click();
});
grid.appendChild(d);
});
}
document.getElementById(‘archOverlay’).style.display=‘flex’;
}

// ── MAIN LOOP ──────────────────────────────────────────────────
function loop(){
if(!S.running)return;
requestAnimationFrame(loop);
if(video.readyState<2)return;
S.frameCount++;
osc.width=SW;osc.height=SH;
if(S.mirror){octx.save();octx.scale(-1,1);octx.drawImage(video,-SW,0,SW,SH);octx.restore();}
else if(S.zoom>1.02){
const vw=video.videoWidth||SW,vh=video.videoHeight||SH;
octx.drawImage(video,Math.round(vw/2-vw/(2*S.zoom)),Math.round(vh/2-vh/(2*S.zoom)),
Math.round(vw/S.zoom),Math.round(vh/S.zoom),0,0,SW,SH);
} else octx.drawImage(video,0,0,SW,SH);
let id;try{id=octx.getImageData(0,0,SW,SH);}catch(e){return;}
const gray=toGray(id.data);
const W=canvas.width,H=canvas.height,sx=W/SW,sy=H/SH;
// motion
const mRaw=S.ufoOn?detectMotion(gray,SW,SH):[];
S.clusters=clusterPts(mRaw,SW,SH,S.mergeR,W,H);
// push motion dots to history
if(S.ufoOn){
const now=Date.now()/1000;
for(const p of mRaw.slice(0,300))
S.motionHist.push({x:Math.round(p.x*sx),y:Math.round(p.y*sy),ts:now});
if(S.motionHist.length>1200)S.motionHist.splice(0,S.motionHist.length-1200);
}
// static
updateStatic(gray,SW,SH,W,H);
// track update
updateTracks(S.clusters,S.staticClusters);
draw(gray);
}

resize();
