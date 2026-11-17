// I'M IN YO CITY / PHILLY AFTER DARK
// Original procedural WebGL city and interaction loop. No external engines, CDN, or paid assets.
const $ = (id) => document.getElementById(id);
let canvas = $('game');  // replaced once if WebGL fails after binding the canvas
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const distance2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const PI = Math.PI;
const deg = (d) => d * PI / 180;
const hex = (s) => {const h=s.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);};
const C = {
  asphalt:hex('#151a38'),sidewalk:hex('#2f3766'),lane:hex('#e2b45e'),grass:hex('#1f4152'),
  blue:hex('#2e4a92'),violet:hex('#5c3fa3'),brick:hex('#7d3f62'),tan:hex('#6a5a9e'),stone:hex('#e2cfa6'),skin2:hex('#c58c62'),
  gold:hex('#ffcf75'),light:hex('#aad8ed'),magenta:hex('#d277bd'),cyan:hex('#7cf6ff'),
  water:hex('#1a3e70'),tree:hex('#1f4c56'),silver:hex('#a9c2db'),black:hex('#1b203b'),
  skin:hex('#9d684f'),shirt:hex('#705cae'),jacket:hex('#1c1830'),hood:hex('#6a3bd0'),white:hex('#dce9f2'),dark:hex('#131a38')
};
function rand32(seed) {let n=seed>>>0;return ()=>{n+=0x6D2B79F5;let x=n;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;};}
const rnd=rand32(215191);
function mixColor(a,b,t){return a.map((v,i)=>lerp(v,b[i],t));}
function tint(c,t){return c.map(v=>clamp(v*t,0,1));}
const V={
  sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  norm:(a)=>{const s=Math.hypot(...a)||1;return a.map(x=>x/s);}
};
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
function lookAt(eye,target){const z=V.norm(V.sub(eye,target)),x=V.norm(V.cross([0,1,0],z)),y=V.cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-V.dot(x,eye),-V.dot(y,eye),-V.dot(z,eye),1]);}
function multiply(a,b){const o=new Float32Array(16);for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)o[col*4+row]+=a[k*4+row]*b[col*4+k];return o;}
function project(m,x,y,z){const a=m[0]*x+m[4]*y+m[8]*z+m[12],b=m[1]*x+m[5]*y+m[9]*z+m[13],c=m[2]*x+m[6]*y+m[10]*z+m[14],w=m[3]*x+m[7]*y+m[11]*z+m[15];return {x:a/w,y:b/w,z:c/w,w};}
class Mesh{
  constructor(){this.data=[];}
  tri(a,b,c,color,glow=0){const n=V.norm(V.cross(V.sub(b,a),V.sub(c,a)));for(const p of [a,b,c])this.data.push(...p,...n,...color,glow);}
  quad(a,b,c,d,color,glow=0){this.tri(a,b,c,color,glow);this.tri(a,c,d,color,glow);}
  plane(x,z,w,d,y,color,glow=0){this.quad([x-w/2,y,z-d/2],[x-w/2,y,z+d/2],[x+w/2,y,z+d/2],[x+w/2,y,z-d/2],color,glow);}
  box(x,y,z,w,h,d,color,glow=0){const xa=x-w/2,xb=x+w/2,ya=y,yb=y+h,za=z-d/2,zb=z+d/2;
    this.quad([xa,ya,za],[xb,ya,za],[xb,yb,za],[xa,yb,za],color,glow);
    this.quad([xb,ya,zb],[xa,ya,zb],[xa,yb,zb],[xb,yb,zb],tint(color,.78),glow);
    this.quad([xa,ya,zb],[xa,ya,za],[xa,yb,za],[xa,yb,zb],tint(color,.88),glow);
    this.quad([xb,ya,za],[xb,ya,zb],[xb,yb,zb],[xb,yb,za],tint(color,.69),glow);
    this.quad([xa,yb,za],[xb,yb,za],[xb,yb,zb],[xa,yb,zb],tint(color,1.13),glow);
    this.quad([xb,ya,za],[xa,ya,za],[xa,ya,zb],[xb,ya,zb],tint(color,.55),glow);
  }
  rotatedBox(x,y,z,w,h,d,angle,color,glow=0){
    // Rotated local geometry: the avatar faces -Z at zero heading and +X at PI/2.
    const co=Math.cos(angle),si=Math.sin(angle),hw=w/2,hd=d/2;
    const p=(a,b,c)=>[x+co*a-si*c,y+b,z+si*a+co*c];
    const a=p(-hw,0,-hd),b=p(hw,0,-hd),c=p(hw,h,-hd),d0=p(-hw,h,-hd);
    const e=p(-hw,0,hd),f=p(hw,0,hd),g=p(hw,h,hd),j=p(-hw,h,hd);
    this.quad(a,b,c,d0,color,glow);this.quad(f,e,j,g,tint(color,.78),glow);
    this.quad(e,a,d0,j,tint(color,.88),glow);this.quad(b,f,g,c,tint(color,.69),glow);
    this.quad(d0,c,g,j,tint(color,1.13),glow);this.quad(b,a,e,f,tint(color,.55),glow);
  }
  rod(a,b,r,color,glow=0){const side=V.norm(V.cross(V.sub(b,a),[0,0,1]));const s=side.map(k=>k*r),q=[s[0],s[1],s[2]];this.quad([a[0]+q[0],a[1]+q[1],a[2]+q[2]],[a[0]-q[0],a[1]-q[1],a[2]-q[2]],[b[0]-q[0],b[1]-q[1],b[2]-q[2]],[b[0]+q[0],b[1]+q[1],b[2]+q[2]],color,glow);}
  orb(x,y,z,r,color,glow=0,lat=5,lon=8){for(let a=0;a<lat;a++){const th0=a/lat*PI,th1=(a+1)/lat*PI;for(let b=0;b<lon;b++){const ph0=b/lon*2*PI,ph1=(b+1)/lon*2*PI;const p=(th,ph)=>[x+r*Math.sin(th)*Math.cos(ph),y+r*Math.cos(th),z+r*Math.sin(th)*Math.sin(ph)];this.quad(p(th0,ph0),p(th0,ph1),p(th1,ph1),p(th1,ph0),color,glow);}}}
  pyramid(x,y,z,w,h,color,glow=0){const a=[x-w/2,y,z-w/2],b=[x+w/2,y,z-w/2],c=[x+w/2,y,z+w/2],d=[x-w/2,y,z+w/2],top=[x,y+h,z];this.tri(a,b,top,color,glow);this.tri(b,c,top,color,glow);this.tri(c,d,top,color,glow);this.tri(d,a,top,color,glow);}
  count(){return this.data.length/10;}
}
// Deterministic collision volumes from the scene's first generated world.
const cameraSolids=[];
let captureCameraSolids=true;
let cameraOrbitOffset=0;
function cameraSolid(x,z,w,d,h){
 if(captureCameraSolids)cameraSolids.push([x-w/2-.10,0,z-d/2-.10,x+w/2+.10,h+.5,z+d/2+.10]);
}
// A volume blocks the player only below its roof; roofs are walkable and landable.
const roofTop=w=>w[4]-.18;
function worldBlocksPlayer(x,z,y){
 return cameraSolids.some(w=>x>w[0]-.55&&x<w[3]+.55&&z>w[2]-.55&&z<w[5]+.55&&y<roofTop(w)-.2);
}
function groundAt(x,z,y=Infinity){
 let g=0;for(const w of cameraSolids)if(x>w[0]&&x<w[3]&&z>w[2]&&z<w[5]&&roofTop(w)<=y+.3)g=Math.max(g,roofTop(w));
 return g;
}
// Fraction of the clear view line between the avatar and the requested eye.
function cameraRayFraction(aim,candidate){
 let safe=1;
 for(const wall of cameraSolids){
  let enter=0,exit=1;
  for(let axis=0;axis<3;axis++){
   const min=wall[axis],max=wall[axis+3],d=candidate[axis]-aim[axis];
   if(Math.abs(d)<1e-7){if(aim[axis]<min||aim[axis]>max){enter=2;break;}continue;}
   let a=(min-aim[axis])/d,b=(max-aim[axis])/d;
   if(a>b){const tmp=a;a=b;b=tmp;}
   enter=Math.max(enter,a);exit=Math.min(exit,b);
   if(enter>exit)break;
  }
  if(enter<=exit&&enter<=1)safe=Math.min(safe,Math.max(0,enter-.035));
 }
 return safe;
}
function visibleCamera(aim,candidate){
 const safe=cameraRayFraction(aim,candidate);
 return safe>=1?candidate:aim.map((v,i)=>v+(candidate[i]-v)*Math.max(.07,safe));
}
// Prefer the proper chase view; orbit to an unobstructed shoulder when a wall
// would force a close-up. The camera stays independent of movement's axis basis.
// Camera eye clearance prevents buildings beside the lens from filling the viewport.
function cameraClearance(eye){
 let nearest=Infinity;
 for(const wall of cameraSolids){
  const dx=Math.max(wall[0]-eye[0],0,eye[0]-wall[3]);
  const dy=Math.max(wall[1]-eye[1],0,eye[1]-wall[4]);
  const dz=Math.max(wall[2]-eye[2],0,eye[2]-wall[5]);
  nearest=Math.min(nearest,Math.hypot(dx,dy,dz));
 }
 return nearest;
}
// Storyboard framing: low over-the-shoulder street view; wider in Sky Mode. Shared with tests.
const CAMERA_RIG={walkDist:8.2,walkRise:2.5,walkAim:2.0,skyDist:13,skyRise:4.6,skyAim:2.1};
function cameraGoal(aim,dist,rise){
 const offsets=[0,-.45,.45,-.92,.92,-1.52,1.52];
 let goal=null,bestScore=-1e9,bestOffset=0;
 for(const offset of offsets){
  for(const lift of [0,5]){
   const candidate=[
    player.x+Math.sin(cameraYaw+offset)*dist,
    player.y+rise+Math.sin(cameraPitch)*4+lift,
    player.z+Math.cos(cameraYaw+offset)*dist
   ];
   const clear=cameraRayFraction(aim,candidate);
   // A clean center ray alone is insufficient: a wall beside the eye can hide half
   // the playfield. Reward generous clearance without ignoring line-of-sight.
   const clearance=Math.min(5,cameraClearance(candidate));
   const score=3*clear+.27*clearance-.13*Math.abs(offset)-.018*lift-.025*Math.abs(offset-cameraOrbitOffset);
   if(score>bestScore){bestScore=score;goal=candidate;bestOffset=offset;}
  }
 }
 cameraOrbitOffset=bestOffset;
 return goal;
}
function building(m,x,z,w,d,h,color,kind='regular'){
  cameraSolid(x,z,w,d,h);
  m.box(x,0.12,z,w,h,d,color);
  m.box(x,h,z,w+.5,.32,d+.5,tint(color,.57));
  if(kind==='tower'){cameraSolid(x,z,w*.5,d*.52,h+.32+Math.min(8,h*.35));m.box(x,h+.32,z,w*.5,Math.min(8,h*.35),d*.52,tint(color,1.12));const ct=h+.32+Math.min(8,h*.35),cw=w*.5+.06,cd=d*.52+.06;m.box(x,ct-.14,z-cd/2,cw,.22,.12,C.cyan,2.1);m.box(x,ct-.14,z+cd/2,cw,.22,.12,C.cyan,2.1);m.box(x-cw/2,ct-.14,z,.12,.22,cd,C.cyan,2.1);m.box(x+cw/2,ct-.14,z,.12,.22,cd,C.cyan,2.1);m.box(x,h+.3,z+d/2+.27,w+.5,.07,.06,C.cyan,1.2);m.box(x,h+7,z,.12,4,.12,C.gold,1);}
  if(kind!=='tower'&&h>12){const neon=(Math.round(x/6)+Math.round(z/6))%3===0?C.magenta:C.cyan;m.box(x,h+.32,z+d/2+.27,w+.5,.14,.08,neon,1.8);m.box(x,h+.32,z-d/2-.27,w+.5,.14,.08,neon,1.8);}
  const cols=Math.max(2,Math.floor(w/1.6)),floors=Math.floor(h/2.3);
  for(let j=0;j<floors;j++) for(let i=0;i<cols;i++){
    if(rnd()>.54)continue;const win=(rnd()>.37?C.gold:C.light),wx=x-w/2+(i+.5)*w/cols,wy=1.4+j*2.25;
    m.box(wx,wy,z+d/2+.017,.6,.76,.045,win,.72);
    if(rnd()>.38)m.box(wx,wy,z-d/2-.017,.6,.76,.045,win,.58);
  }
  if(kind==='shop'){m.box(x,.95,z+d/2+.3,w*.9,.5,.65,C.magenta,.6);m.box(x,1.9,z+d/2+.025,w*.7,.9,.06,C.light,.4);}
  if(kind==='row'){m.box(x,2,z+d/2+.04,1.5,2.5,.06,tint(color,.63));m.box(x,0,z+d/2+.2,1.15,1.95,.2,C.dark);}
}
function tree(m,x,z,s=1){m.box(x,0,z,.3,2.7*s,.3,C.brick);m.orb(x,3*s,z,1.7*s,C.tree,0,4,7);m.orb(x+.7*s,3.1*s,z-.35*s,1.1*s,tint(C.tree,1.16),0,4,6);}
function streetlamp(m,x,z){m.plane(x+.84,z,1.7,1.7,.07,tint(C.gold,.42),.22);m.box(x,0,z,.12,4,.12,C.silver);m.box(x+.45,3.85,z,.95,.14,.12,C.silver);m.orb(x+.84,3.68,z,.22,C.gold,1.4,3,6);}
function cityHall(m){const x=-18,z=-18;cameraSolid(x,z,10,10,22);cameraSolid(x,z,5.5,5.5,26.5);m.plane(x,z,13,13,.15,C.sidewalk);m.box(x,0,z,10,7,10,C.stone);m.box(x,7,z,8,1.1,8,C.gold);m.box(x,8,z,4.7,11,4.5,C.silver);m.box(x,19,z,5.5,2,5.5,C.gold);m.pyramid(x,21,z,4.8,6,C.silver);m.box(x,27,z,.15,4,.15,C.gold,1);m.orb(x,32,z,.65,C.gold,1.6,4,7);
  for(let i=-1;i<=1;i++){m.box(x+i*3,0,z+5.1,.45,6,.45,C.white);m.box(x+i*3,0,z-5.1,.45,6,.45,C.white);} }
function market(m){const x=16,z=-16;cameraSolid(x,z,9,10,6.5);m.box(x,0,z,9,5,10,C.brick);m.box(x,5,z,10,1.2,11,C.gold);m.box(x,2,z+5.17,8,1.5,.12,C.cyan,.85);for(let i=-3;i<=3;i++)m.box(x+i*.98,.4,z+5.25,.45,1.9,.12,i%2?C.magenta:C.gold,.2);}
function park(m){m.plane(-3,8,14,15,.13,C.grass);for(const [x,z] of [[-8,3],[-8,12],[2,3],[2,13]])tree(m,x,z,.8);m.box(-2.4,.1,8,4,.35,3,C.silver);m.box(-2.4,.45,8,3.6,.5,2.5,C.violet,.6);m.box(-2.4,.95,8,2.9,.25,2,C.gold,.7);}
function bridge(m){const z=-28;const x0=42,x1=76;m.box((x0+x1)/2,4.4,z,x1-x0,.8,4.4,C.silver);for(const x of [48,68]){cameraSolid(x,z,4,2.3,20.7);m.box(x,0,z,1.1,20,1.1,C.silver);m.box(x,20,z,4,1.2,2.3,C.silver);for(const side of [-1,1])for(let i=0;i<7;i++){const xx=x+(side*i*2.4),yy=18-Math.sin(i/7*PI/2)*11;m.rod([x,20,z],[xx,Math.max(5,yy),z],.06,C.light,.25);}}m.box(59,4.4,z,32,.13,.18,C.cyan,.9);}
function makeCity(){const m=new Mesh();
  m.plane(0,0,240,240,-.22,C.grass);m.plane(60,0,25,240,-.13,C.water,.15);
  for(let i=-6;i<=6;i++){const p=i*12;m.box(p,-.1,0,3,.11,170,C.asphalt);m.box(0,-.095,p,172,.11,3,C.asphalt);for(let k=-7;k<=7;k++){const z=k*12+4;m.plane(p,z,.08,3,.02,C.lane,.3);const x=k*12+4;m.plane(x,p,3,.08,.025,C.lane,.3);}}
  for(let i=-6;i<=5;i++)for(let j=-6;j<=5;j++){
    const x=i*12+6,z=j*12+6;
    if(x>45 || (x>-13&&x<5&&z>-2&&z<18) || (x>-25&&x<-10&&z>-25&&z<-11) || (x>9&&x<24&&z>-23&&z<-9) || (x>22&&x<37&&z>-35&&z<-20))continue;
    m.plane(x,z,8.6,8.6,.05,C.sidewalk);
    if((i+j)%5===0){tree(m,x-2.6,z-2.7,.65);streetlamp(m,x+3.1,z+3.1);}
    const district=z>21?'row':(z<-22?'tower':'regular');
    const color=[C.blue,C.violet,C.brick,C.tan,C.dark][Math.floor(rnd()*5)];
    const h=district==='row'?4.2+rnd()*3:district==='tower'?10+rnd()*24:5+rnd()*17;
    building(m,x,z,4.9+rnd()*1.2,4.7+rnd()*1.2,h,tint(color,.83+rnd()*.38),district==='row'?'row':rnd()>.78?'shop':district);
    if(district==='row'){
      const off=x+3.15;building(m,off,z,2.2,4.8,h*.85,tint(C.brick,.8+rnd()*.25),'row');
    }
  }
  cityHall(m);market(m);park(m);bridge(m);
  // Waterfront promenade, street murals, neon market district and the skyline beacon.
  m.box(45,-.02,0,2,.15,160,C.sidewalk);for(let z=-65;z<65;z+=11){streetlamp(m,44,z);m.box(45,.17,z,1,.55,1,C.dark);}
  cameraSolid(29,-28,8,8,12.15);m.box(29,0,-28,7,12,7,C.blue);m.box(29,12,-28,8,.65,8,C.gold);m.box(29,13,-28,.35,8,.35,C.cyan,1);m.orb(29,21,-28,1.2,C.cyan,2.2,6,10);for(const [r,y,n] of [[2.7,13.1,16],[1.9,15.4,12],[1.3,17.6,10]])for(let k=0;k<n;k++){const a=k/n*2*PI;m.box(29+Math.cos(a)*r,y,-28+Math.sin(a)*r,.34,.09,.34,C.cyan,1.9);}
  cameraSolid(-9,27,8,4.4,3.75);m.box(-9,0,27,8,3.9,4.2,C.brick);m.box(-9,4,27,8,.25,4.4,C.gold);m.box(-9,1,29.2,7,2,.1,C.magenta,.8);
  for(let i=0;i<20;i++){const x=-70+rnd()*115,z=-65+rnd()*125;if((x+3)**2+(z-8)**2<120)continue;streetlamp(m,x,z);}
  captureCameraSolids=false;
  return new Float32Array(m.data);
}
const player={x:-4,z:8.2,y:0,vy:0,heading:0,sky:false,energy:100,rep:0,walk:0,gait:0};
const missions=[
  {act:'ACT 01 • THE DROP',title:'Meet Nova at LOVE Park',help:'Find Nova by the gold marker. Press E or TALK.',target:{x:-2,z:8,y:2,name:'NOVA'},done:'Nova connected: the city signal needs you.'},
  {act:'ACT 02 • MARKET RUN',title:'Find Reading Terminal',help:'Cross Center City and reach the market signal.',target:{x:16,z:-16,y:6,name:'READING TERMINAL'},done:'You found the market frequency.'},
  {act:'ACT 03 • SKYLINE FREQUENCY',title:'Light the rooftop relay',help:'Tap FLY or press F, ascend, and reach the cyan rooftop beacon.',target:{x:29,z:-28,y:19,name:'ROOFTOP RELAY'},done:'The rooftop beacon is online.'},
  {act:'ACT 04 • CLEAR THE AIR',title:'Disable 3 signal drones',help:'Move near the violet drones and use PULSE (J).',target:{x:29,z:-18,y:11,name:'SIGNAL DRONES'},done:'The city signal is yours.'},
  {act:'FREE ROAM • PHILLY',title:'The City Is Yours',help:'Explore Center City, Old City, South Street, and the riverfront.',target:null,done:'All opening missions complete.'}
];
const dronePositions=[{x:25,z:-17,y:10},{x:35,z:-23,y:14},{x:18,z:-29,y:11}];
const drones=dronePositions.map((d,i)=>({...d,id:i,disabled:false}));
const controls={x:0,y:0,sprint:false,look:false,basisYaw:null};
const keys=new Set();
const state={started:false,paused:false,stage:0,droneCount:0,pulses:0,audio:false,webgl:false,frame:0,zone:'CENTER CITY',time:0,noticeUntil:0};
let cameraYaw=0,cameraPitch=.28,lookX=0,lookY=0,lookPointer=null,lookOverrideUntil=0,gl,staticArray,staticBuffer,dynamicBuffer,shader,viewProj,camPos=null,renderDt=1/60,audio=null,musicHandle=null,lastFrame=performance.now(),pulseAt=-100,ctx2d=null;
const fallbackBuildings=[];const streetPoints=[];
function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
function init3D(){gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,powerPreference:'high-performance'}) || canvas.getContext('experimental-webgl');if(!gl)throw Error('WebGL unavailable');
 const vs=`attribute vec3 aPos;attribute vec3 aNormal;attribute vec3 aColor;attribute float aGlow;uniform mat4 uVP;uniform vec3 uCamera;varying vec3 vColor;varying float vFog;void main(){gl_Position=uVP*vec4(aPos,1.0);vec3 L=normalize(vec3(-.48,.8,.55));float sun=max(dot(normalize(aNormal),L),0.0);float light=.46+sun*.42;vColor=aColor*(light+aGlow*.79);float d=distance(aPos,uCamera);vFog=clamp((d-14.0)/130.0,0.0,.9);}`;
 const fs=`precision mediump float;varying vec3 vColor;varying float vFog;void main(){vec3 fog=vec3(.17,.11,.34);gl_FragColor=vec4(mix(vColor,fog,vFog),1.0);}`;
 const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);
 shader={p,pos:gl.getAttribLocation(p,'aPos'),normal:gl.getAttribLocation(p,'aNormal'),color:gl.getAttribLocation(p,'aColor'),glow:gl.getAttribLocation(p,'aGlow'),vp:gl.getUniformLocation(p,'uVP'),camera:gl.getUniformLocation(p,'uCamera')};
 staticArray=makeCity();staticBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,staticBuffer);gl.bufferData(gl.ARRAY_BUFFER,staticArray,gl.STATIC_DRAW);dynamicBuffer=gl.createBuffer();
 gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);state.webgl=true;
}
function bind(buf){gl.bindBuffer(gl.ARRAY_BUFFER,buf);for(const [loc,count,offset] of [[shader.pos,3,0],[shader.normal,3,3],[shader.color,3,6],[shader.glow,1,9]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,count,gl.FLOAT,false,40,offset*4);}}
function humanoid(m,x,y,z,shirt,skin,angle=0,walk=0,scale=1,gait=1){const swing=Math.sin(walk*8)*.32*gait;const co=Math.cos(angle),si=Math.sin(angle);function bx(dx,yy,dz,w,h,d,c,glow=0){const a=dx*scale,b=dz*scale;m.rotatedBox(x+co*a-si*b,y+yy,z+si*a+co*b,w*scale,h*scale,d*scale,angle,c,glow);}
 bx(0,1.05*scale,0,.82,1.2,.5,shirt);bx(0,2.35*scale,0,.53,.5,.52,skin);bx(0,2.76*scale,-.03,.55,.2,.55,C.dark);bx(-.63,.96*scale+swing*.2,0,.25,.97,.32,shirt);bx(.63,.96*scale-swing*.2,0,.25,.97,.32,shirt);bx(-.23,0,swing*.28,.28,1,.34,C.dark);bx(.23,0,-swing*.28,.28,1,.34,C.dark);bx(-.23,-.04,swing*.3-.12,.36,.2,.5,C.white);bx(.23,-.04,-swing*.3-.12,.36,.2,.5,C.white);
}
const skyTrail=[];
function dynamicGeometry(){const m=new Mesh();const t=state.time;
 // Player's coat, head, shoes and glowing backpack are genuine scene geometry.
 humanoid(m,player.x,player.y,player.z,C.jacket,C.skin,player.heading,player.walk,1,player.gait);
 // Backpack and front crest turn with the character instead of sliding in world Z.
 const co=Math.cos(player.heading),si=Math.sin(player.heading);
 const back=(lat,yy,dep,w,h,d,c,g)=>m.rotatedBox(player.x+co*lat-si*dep,player.y+yy,player.z+si*lat+co*dep,w,h,d,player.heading,c,g);
 back(0,2.3,.27,.62,.62,.16,C.hood,.12);back(0,1.62,.24,.86,.28,.14,C.hood,.1);            // hood up + collar
 back(0,1.12,.27,.44,.34,.03,C.gold,.95);back(-.15,1.46,.27,.09,.16,.03,C.gold,.95);        // crown emblem: band
 back(0,1.5,.27,.09,.22,.03,C.gold,.95);back(.15,1.46,.27,.09,.16,.03,C.gold,.95);          // crown points
 back(0,.98,-.255,.86,.06,.5,C.hood,.25);                                                   // purple hem trim
 m.rotatedBox(player.x+si*.265,player.y+1.59,player.z-co*.265,.20,.21,.045,player.heading,C.gold,.65);
 if(player.sky){skyTrail.unshift([player.x,player.y+1.25,player.z]);if(skyTrail.length>18)skyTrail.pop();}else skyTrail.length=0;
 for(let i=2;i<skyTrail.length;i++){const k=i/skyTrail.length,p=skyTrail[i],sz=.42*(1-k)+.06;m.box(p[0],p[1]-sz/2,p[2],sz,sz,sz,mixColor(C.violet,C.gold,k),1.7);}
 // Mission contacts and civilians wander alongside animated traffic.
 humanoid(m,-2,.08,8,C.hood,C.skin,.4,t*.25,.85);
 {const a=.4,sc=.85,ca=Math.cos(a),sa=Math.sin(a),nv=(lat,yy,dep,w,h,d,c,g=0)=>m.rotatedBox(-2+ca*lat-sa*dep,.08+yy,8+sa*lat+ca*dep,w,h,d,a,c,g);
  nv(0,2.78*sc,0,.72*sc,.38*sc,.7*sc,C.dark);nv(0,3.08*sc,-.05,.5*sc,.26*sc,.5*sc,C.dark);                 // curls
  nv(0,2.98*sc,0,.62*sc,.07*sc,.12*sc,C.black);nv(-.3*sc,2.5*sc,0,.1*sc,.24*sc,.24*sc,C.cyan,1.2);nv(.3*sc,2.5*sc,0,.1*sc,.24*sc,.24*sc,C.cyan,1.2); // headphones
  nv(-.29*sc,2.3*sc,.06,.05*sc,.14*sc,.14*sc,C.gold,1);nv(.29*sc,2.3*sc,.06,.05*sc,.14*sc,.14*sc,C.gold,1);         // gold hoops
  nv(0,1.62*sc,-.27*sc,.86*sc,.24*sc,.12*sc,C.violet,.2);}                                                         // hood collar
 for(let i=0;i<12;i++){const a=i*2.399,s=15+i*3.5,x=Math.sin(a)*s,z=Math.cos(a)*s;humanoid(m,x+Math.cos(t*.45+i)*.6,0,z+Math.sin(t*.5+i)*.6,i%3?C.silver:C.gold,i%2?C.skin:C.skin2,a,t*.6+i,.65);}
 for(let i=0;i<8;i++){const z=-53+i*13;const x=(((t*7+i*21)%135)-65);m.box(x,.14,z,3.4,.8,1.8,i%3?C.blue:C.magenta);m.box(x,.9,z,.9,.65,1.6,C.dark);m.box(x-1.25,.33,z-.93,.5,.22,.11,C.gold,1.1);m.box(x-1.25,.33,z+.93,.5,.22,.11,C.gold,1.1);m.box(x+1.28,.33,z-.93,.5,.22,.11,C.magenta,1);}
 for(const drone of drones){if(drone.disabled)continue;const y=drone.y+Math.sin(t*2+drone.id)*.7;m.orb(drone.x,y,drone.z,.9,C.violet,1.5,4,6);m.orb(drone.x,y,drone.z,.4,C.cyan,1.3,4,6);m.box(drone.x,y-.12,drone.z,2.6,.14,.2,C.magenta,1);m.box(drone.x,y-.12,drone.z,.2,.14,2.6,C.magenta,1);}
 if(state.started&&state.stage<4){const target=missions[state.stage].target;const alt=target.y+1.1+Math.sin(t*3)*.5;m.orb(target.x,alt,target.z,.55,C.gold,2,4,7);m.pyramid(target.x,alt+.5,target.z,1,1.4,C.gold,1.8);}
 if(t-pulseAt<.7){const radius=2+(t-pulseAt)*13;for(let i=0;i<24;i++){const a=i/24*PI*2,b=(i+1)/24*PI*2;m.rod([player.x+Math.sin(a)*radius,player.y+1,player.z+Math.cos(a)*radius],[player.x+Math.sin(b)*radius,player.y+1,player.z+Math.cos(b)*radius],.10,C.cyan,2);}}
 return new Float32Array(m.data);
}
function setupFallback(){
  ctx2d=canvas.getContext('2d');if(!ctx2d)throw Error('No browser graphics context available');
  const seeded=rand32(215);for(let i=-6;i<=5;i++)for(let j=-6;j<=5;j++){
    const x=i*12+6,z=j*12+6;
    if(x>45 || (x>-13&&x<5&&z>-2&&z<18) || (x>-25&&x<-10&&z>-25&&z<-11) || (x>9&&x<24&&z>-23&&z<-9) || (x>22&&x<37&&z>-35&&z<-20))continue;
    fallbackBuildings.push({x,z,w:6,h:z>21?5+seeded()*3:8+seeded()*20,d:6,color:['#345783','#77618c','#7f596e','#8d7990'][Math.floor(seeded()*4)]});
  }
  fallbackBuildings.push({x:-18,z:-18,w:10,d:10,h:24,color:'#c5a27b',label:'CITY HALL'},{x:16,z:-16,w:11,d:11,h:7,color:'#9a5e74',label:'READING TERMINAL'},{x:29,z:-28,w:8,d:8,h:20,color:'#426ba0',label:'ROOFTOP RELAY'});
  state.fallback=true;
  console.info('WebGL unavailable: interactive, labeled 2.5D software rendering fallback active.');
}
function screenProject(x,y,z){const side=(x-player.x)*Math.cos(cameraYaw)-(z-player.z)*Math.sin(cameraYaw);
  const depth=12+(player.x-x)*Math.sin(cameraYaw)+(player.z-z)*Math.cos(cameraYaw);
  const focal=Math.min(innerWidth*1.1,innerHeight*1.05),safe=Math.max(depth,2);
  return {x:innerWidth/2+side*focal/safe,y:innerHeight*.60+(player.y+1.25-y)*focal/safe,depth,visible:depth>2};}
function paintPolygon(ctx,points,color){if(points.some(p=>!p.visible))return;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();ctx.fill();}
function fallbackBox(ctx,b){const x=b.x,z=b.z,w=b.w,d=b.d,h=b.h;
  const a=screenProject(x-w/2,0,z-d/2),bb=screenProject(x+w/2,0,z-d/2),c=screenProject(x+w/2,0,z+d/2),dd=screenProject(x-w/2,0,z+d/2);
  const at=screenProject(x-w/2,h,z-d/2),bt=screenProject(x+w/2,h,z-d/2),ct=screenProject(x+w/2,h,z+d/2),dt=screenProject(x-w/2,h,z+d/2);
  if(Math.max(a.depth,bb.depth,c.depth,dd.depth)<2)return;
  const dark=b.color;paintPolygon(ctx,[a,bb,bt,at],dark);paintPolygon(ctx,[bb,c,ct,bt],'#23395f');paintPolygon(ctx,[c,dd,dt,ct],dark);paintPolygon(ctx,[dd,a,at,dt],'#46587d');paintPolygon(ctx,[at,bt,ct,dt],'#6274a0');
  if(!b.label&&Math.hypot(b.x-player.x,b.z-player.z)<75){const p=screenProject(x,h*.46,z+d/2+.15);if(p.visible){const wid=clamp(55/p.depth,1.5,6);ctx.fillStyle='#e4c88b';for(let row=0;row<Math.min(9,Math.floor(h/2.8));row++)for(let col=-1;col<=1;col++){if((row+col+Math.floor(x))%3!==0)ctx.fillRect(p.x+col*wid*3,p.y+row*wid*2.2,wid,wid*1.25);}}}
  if(b.label){const p=screenProject(x,h+2,z);if(p.visible){ctx.textAlign='center';ctx.fillStyle='#f9d990';ctx.font='bold 10px system-ui';ctx.fillText(b.label,p.x,p.y);}}
}
function paintFallbackAvatar(ctx,p,r){
  const turn=Math.sin(player.heading-cameraYaw),step=Math.sin(player.walk*8)*player.gait;
  const bodyWidth=r*.5*(1-.28*Math.abs(turn));
  ctx.save();ctx.translate(p.x,p.y);
  ctx.fillStyle='#1c1939';ctx.beginPath();ctx.ellipse(0,0,22,8,0,0,2*PI);ctx.fill();
  // Opposing arm/leg swing and a heading-sensitive backpack keep the fallback
  // readable when WebGL is unavailable. Idle motion settles when the stick lifts.
  ctx.fillStyle='#17243b';ctx.fillRect(-r*.23,-r*.52+step*r*.07,r*.19,r*.55);
  ctx.fillRect(r*.05,-r*.52-step*r*.07,r*.19,r*.55);
  ctx.fillStyle='#66519a';ctx.fillRect(-r*.41,-r*1.15-step*r*.08,r*.14,r*.67);
  ctx.fillRect(r*.27,-r*1.15+step*r*.08,r*.14,r*.67);
  ctx.fillStyle='#7458b5';ctx.fillRect(-bodyWidth/2,-r*1.45,bodyWidth,r*.9);
  ctx.fillStyle='#eacb87';ctx.fillRect(-r*.14+turn*r*.08,-r*1.2,r*.26,r*.43);
  ctx.fillStyle='#ffd67a';ctx.fillRect(-r*.13-turn*r*.07,-r*1.33,r*.25*(1-.35*Math.abs(turn)),r*.52);
  ctx.fillStyle='#bd896d';ctx.beginPath();ctx.arc(turn*r*.07,-r*1.6,r*.26,0,2*PI);ctx.fill();
  ctx.restore();
}
function fallbackRenderer(){const dpr=Math.min(devicePixelRatio||1,1.5),w=Math.max(1,Math.floor(innerWidth*dpr)),h=Math.max(1,Math.floor(innerHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=ctx2d;ctx.setTransform(dpr,0,0,dpr,0,0);const width=innerWidth,height=innerHeight;
  const sky=ctx.createLinearGradient(0,0,0,height);sky.addColorStop(0,'#080d2e');sky.addColorStop(.35,'#252b67');sky.addColorStop(.68,'#b5797e');sky.addColorStop(1,'#1d3150');ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
  const haze=ctx.createLinearGradient(0,height*.45,0,height);haze.addColorStop(0,'#46587eaa');haze.addColorStop(1,'#132944');ctx.fillStyle=haze;ctx.fillRect(0,height*.58,width,height*.42);
  ctx.fillStyle='#132538';for(let i=0;i<35;i++){const x=i*47-60,y=height*.48+(i*17%70);ctx.fillRect(x,y,30+(i*23%39),height*.65-y);}
  // The road grid is projected into the same third-person camera used for missions.
  for(let k=-6;k<=6;k++){const x=k*12;for(let j=-6;j<6;j++){const z0=j*12,z1=(j+1)*12;const a=screenProject(x-1.6,-.05,z0),b=screenProject(x+1.6,-.05,z0),c=screenProject(x+1.6,-.05,z1),d=screenProject(x-1.6,-.05,z1);paintPolygon(ctx,[a,b,c,d],'#26304b');}const z=k*12;for(let i=-6;i<6;i++){const x0=i*12,x1=(i+1)*12;paintPolygon(ctx,[screenProject(x0,-.05,z-1.6),screenProject(x1,-.05,z-1.6),screenProject(x1,-.05,z+1.6),screenProject(x0,-.05,z+1.6)],'#28334e');}}
  paintPolygon(ctx,[screenProject(48,0,-80),screenProject(78,0,-80),screenProject(78,0,80),screenProject(48,0,80)],'#256483');
  for(const b of fallbackBuildings.filter(b=>screenProject(b.x,0,b.z).depth>2).sort((a,b)=>screenProject(b.x,0,b.z).depth-screenProject(a.x,0,a.z).depth))fallbackBox(ctx,b);
  const npc=screenProject(-2,0,8);if(npc.visible){ctx.fillStyle='#f4b4e9';ctx.fillRect(npc.x-5,npc.y-37,10,25);ctx.beginPath();ctx.arc(npc.x,npc.y-42,8,0,PI*2);ctx.fill();}
  for(const drone of drones){if(drone.disabled)continue;const p=screenProject(drone.x,drone.y+Math.sin(state.time*3)*.5,drone.z);if(!p.visible)continue;const r=clamp(120/p.depth,4,15);ctx.fillStyle='#d88aff';ctx.shadowColor='#c97aff';ctx.shadowBlur=16;ctx.beginPath();ctx.moveTo(p.x,p.y-r);ctx.lineTo(p.x+r,p.y);ctx.lineTo(p.x,p.y+r);ctx.lineTo(p.x-r,p.y);ctx.closePath();ctx.fill();ctx.shadowBlur=0;}
  const p=screenProject(player.x,player.y,player.z),r=clamp(400/p.depth,17,42);paintFallbackAvatar(ctx,p,r);
  if(player.sky){ctx.strokeStyle='#a3eafb';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y-r,28+Math.sin(state.time*3)*5,0,PI*2);ctx.stroke();}
  if(state.time-pulseAt<.7){ctx.strokeStyle='#85ffff';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(p.x,p.y,Math.max(3,(state.time-pulseAt)*300),Math.max(2,(state.time-pulseAt)*80),0,0,2*PI);ctx.stroke();}
}
function renderer(){if(!state.webgl){if(ctx2d)fallbackRenderer();return;}

 const width=Math.max(1,Math.floor(innerWidth*Math.min(devicePixelRatio||1,1.7))),height=Math.max(1,Math.floor(innerHeight*Math.min(devicePixelRatio||1,1.7)));
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);}
 const dist=player.sky?CAMERA_RIG.skyDist:CAMERA_RIG.walkDist;const rise=player.sky?CAMERA_RIG.skyRise:CAMERA_RIG.walkRise;
 const aim=[player.x,player.y+(player.sky?CAMERA_RIG.skyAim:CAMERA_RIG.walkAim),player.z];
 const desired=cameraGoal(aim,dist,rise);
 const follow=1-Math.exp(-renderDt*10);
 const smoothed=camPos===null?desired.slice():camPos.map((n,i)=>lerp(n,desired[i],follow));
 camPos=visibleCamera(aim,smoothed);
 viewProj=multiply(perspective(deg(67),width/height,.1,260),lookAt(camPos,aim));
 gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 gl.useProgram(shader.p);gl.uniformMatrix4fv(shader.vp,false,viewProj);gl.uniform3fv(shader.camera,camPos);
 bind(staticBuffer);gl.drawArrays(gl.TRIANGLES,0,staticArray.length/10);
 const dynamic=dynamicGeometry();gl.bindBuffer(gl.ARRAY_BUFFER,dynamicBuffer);gl.bufferData(gl.ARRAY_BUFFER,dynamic,gl.DYNAMIC_DRAW);bind(dynamicBuffer);gl.drawArrays(gl.TRIANGLES,0,dynamic.length/10);
}
const NOVA_INTRO="Yo, finally. You in the city. Philly been move different lately — new tech, new players, and someone's tryna take control. You ready to run it with me?";
let dialogueTimer=0;
function showDialogue(speaker,line,mission,label='✦ NEW MISSION',tone=''){$('dialogue').dataset.tone=tone;$('missionCard').querySelector('small').textContent=label;$('dialogueSpeaker').textContent=speaker;$('dialogueLine').textContent=line;$('missionCardTitle').textContent=mission.title;$('missionCardHelp').textContent=mission.help;$('dialogue').classList.remove('hidden');clearTimeout(dialogueTimer);dialogueTimer=setTimeout(closeDialogue,14000);}
function closeDialogue(){clearTimeout(dialogueTimer);$('dialogue').classList.add('hidden');}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');state.noticeUntil=performance.now()+2600;}
function sound(freq,dur=.13,type='sine',volume=.055){if(!state.audio||!audio)return;try{const osc=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;osc.type=type;osc.frequency.setValueAtTime(freq,now);osc.frequency.exponentialRampToValueAtTime(Math.max(70,freq*.78),now+dur);gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.00001,now+dur);osc.connect(gain);gain.connect(audio.destination);osc.start(now);osc.stop(now+dur+.01);}catch{}}
function initAudio(on){state.audio=on;$('audioBtn').textContent=on?'SOUND ON':'SOUND OFF';if(!on){if(musicHandle)clearInterval(musicHandle);musicHandle=null;if(audio){audio.suspend().catch(()=>{});}return;}
 try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();audio.resume();if(musicHandle)clearInterval(musicHandle);let chord=0;const notes=[130.81,146.83,174.61,164.81];musicHandle=setInterval(()=>{if(!state.paused){const n=notes[chord++%notes.length];sound(n,1.2,'sine',.013);sound(n*1.5,.5,'triangle',.009);}},1900);sound(390,.23,'triangle',.08);}catch{state.audio=false;$('audioBtn').textContent='SOUND OFF';}
}
// Marker stays in the open playfield: below the top HUD, above the bottom controls/minimap.
let markerBand=[110,9999];
function measureHud(){const box=sel=>{const e=document.querySelector(sel);if(!e)return null;const r=e.getBoundingClientRect();return r.width&&r.height?r:null;};
 const rects=['.hud-tools','#chapter','.hud-right','#moveJoystick','#actionButtons','#mini-wrap','#skyHud'].map(box).filter(Boolean);
 const tops=rects.filter(r=>r.top+r.height/2<innerHeight/2).map(r=>r.bottom),lows=rects.filter(r=>r.top+r.height/2>=innerHeight/2).map(r=>r.top);
 markerBand=[Math.max(110,...tops)+46,Math.min(innerHeight-130,...lows.map(t=>t-46))];if(markerBand[1]<markerBand[0])markerBand[1]=markerBand[0];}
addEventListener('resize',()=>{if(state.started)measureHud();});
function updateRep(){$('rep').textContent=String(player.rep).padStart(4,'0');$('levelNum').textContent='LV '+(1+Math.floor(player.rep/500));$('levelBar').firstElementChild.style.width=`${(player.rep%500)/5}%`;}
function stageUp(){if(state.stage>=4)return;const prev=missions[state.stage];player.rep+=250;state.stage++;const next=missions[state.stage];sound(660,.25,'triangle',.11);sound(880,.5,'sine',.06);toast(`✦ ${prev.done}`);$('actLabel').textContent=next.act;$('missionTitle').textContent=next.title;$('missionHelp').textContent=next.help;updateRep();measureHud();updateJournal();if(state.stage===4)showDialogue('ACT 1 COMPLETE','The City Opens Up. The signal is yours — Philly is open for free roam.',next,'✦ UNLOCKED','gold');}
function interact(){if(!state.started||state.paused)return;if(state.stage===0&&Math.hypot(player.x+2,player.z-8)<8){stageUp();showDialogue('NOVA',NOVA_INTRO,missions[state.stage]);}else if(state.stage===0){toast('Get closer to Nova at LOVE Park.');}else{toast(state.stage===4?'You made it. Free roam unlocked!':missions[state.stage].help);}sound(430,.12,'triangle',.06);}
function fly(){if(!state.started||state.paused)return;if(!player.sky&&player.energy<10){toast('Recharge your flight energy.');return;}player.sky=!player.sky;if(player.sky)player.y=Math.max(player.y,2.5);else player.vy=0;toast(player.sky?'SKY MODE ONLINE • SPACE TO ASCEND':'STREET MODE ENGAGED');sound(player.sky?620:340,.22,'sawtooth',.055);$('skyButton').textContent=player.sky?'LAND':'FLY';}
function jump(){if(!state.started||state.paused)return;if(player.sky){player.y=clamp(player.y+1.7,2,35);sound(480,.08);}else if(player.y<groundAt(player.x,player.z,player.y)+.05){player.vy=8.2;sound(320,.14,'triangle',.05);}}
function pulse(){if(!state.started||state.paused)return;if(state.time-pulseAt<.72)return;pulseAt=state.time;state.pulses++;sound(200,.30,'sawtooth',.07);if(state.stage===3){let hit=false;for(const d of drones){if(!d.disabled&&Math.hypot(player.x-d.x,player.z-d.z,player.y+1-d.y)<21){d.disabled=true;state.droneCount++;hit=true;break;}}if(hit){toast(`SIGNAL DRONE DISABLED • ${state.droneCount}/3`);if(state.droneCount===3)stageUp();}else toast('Move closer to a glowing drone.');}else toast('ENERGY PULSE');}
function reset(){closeDialogue();player.x=-4;player.y=0;player.z=8.2;player.vy=0;player.heading=0;player.sky=false;player.energy=100;player.rep=0;player.walk=0;player.gait=0;state.stage=0;state.droneCount=0;state.pulses=0;cameraYaw=0;cameraPitch=.28;lookPointer=null;lookOverrideUntil=0;camPos=null;cameraOrbitOffset=0;controls.x=controls.y=0;controls.sprint=false;controls.basisYaw=null;pulseAt=-100;drones.forEach(d=>d.disabled=false);$('skyButton').textContent='FLY';updateRep();$('actLabel').textContent=missions[0].act;$('missionTitle').textContent=missions[0].title;$('missionHelp').textContent=missions[0].help;updateJournal();if(state.started)measureHud();}
function updateJournal(){$('missionList').innerHTML=missions.slice(0,4).map((m,i)=>`<div class="mission-row ${i<state.stage?'done':''}"><b>${i<state.stage?'✓':i===state.stage?'◆':'○'} 0${i+1}</b><div><strong>${m.title}</strong><small>${m.help}</small></div></div>`).join('');}
function openJournal(){if(!state.started)return;$('journal').classList.remove('hidden');state.paused=true;}
function closeJournal(){$('journal').classList.add('hidden');state.paused=false;}
function pause(){if(!state.started)return;state.paused=!state.paused;$('pause').classList.toggle('hidden',!state.paused);if(state.paused){controls.x=controls.y=0;controls.sprint=false;keys.clear();}}
function start(withAudio){if(state.started)return;state.started=true;state.paused=false;initAudio(withAudio);$('titlecover').classList.add('hidden');$('hud').classList.remove('hidden');measureHud();reset();toast('WELCOME TO PHILLY • FIND NOVA AT LOVE PARK');}
function inputAxis(){const kx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);const ky=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);return {x:clamp(kx+controls.x,-1,1),y:clamp(ky+controls.y,-1,1)};}
function angleTo(a,b,t){const d=Math.atan2(Math.sin(b-a),Math.cos(b-a));return a+clamp(d,-t,t);}
function update(dt){if(!state.started||state.paused)return;state.time+=dt;const axis=inputAxis(),rawSpeed=Math.hypot(axis.x,axis.y),speed=Math.min(1,rawSpeed),f=-axis.y;
 // Lock the movement reference at the START of a gesture. Otherwise following the
 // avatar changes the joystick's world axis every frame and strafing spirals.
 if(speed>.05){
  if(controls.basisYaw===null)controls.basisYaw=cameraYaw;
  const basis=controls.basisYaw,x=(Math.cos(basis)*axis.x+Math.sin(basis)*f)/rawSpeed,z=(Math.sin(basis)*axis.x-Math.cos(basis)*f)/rawSpeed;
  const move=player.sky?11.2:(keys.has('shift')||controls.sprint?9:6);
  const nextX=clamp(player.x+x*move*dt*speed,-70,70),nextZ=clamp(player.z+z*move*dt*speed,-71,71);
  // Permit sliding along façades rather than walking through solid buildings.
  if(!worldBlocksPlayer(nextX,player.z,player.y))player.x=nextX;
  if(!worldBlocksPlayer(player.x,nextZ,player.y))player.z=nextZ;
  if(!player.sky)player.walk+=dt*move*speed*.28;
  player.heading=angleTo(player.heading,Math.atan2(x,-z),dt*8);
  // Let a manual orbit finish before the follow camera returns behind the avatar.
  if(lookPointer===null&&state.time>lookOverrideUntil)cameraYaw=angleTo(cameraYaw,player.heading,dt*2.4);
 }else controls.basisYaw=null;
 player.gait=lerp(player.gait,speed>.05&&!player.sky?1:0,Math.min(1,dt*9));
 if(player.sky){player.energy=Math.max(0,player.energy-2.2*dt);player.y=clamp(player.y+((keys.has(' ')||keys.has('space')?1:0)-(keys.has('control')?1:0))*8*dt,Math.max(2.3,groundAt(player.x,player.z,player.y)),35);if(player.energy<=0){player.sky=false;player.vy=0;$('skyButton').textContent='FLY';toast('SKY MODE RECHARGING');}}
 else{player.energy=Math.min(100,player.energy+6.5*dt);player.vy-=18*dt;const floor=groundAt(player.x,player.z,player.y);player.y=Math.max(floor,player.y+player.vy*dt);if(player.y===floor)player.vy=0;}
 if(state.stage===1&&distance2(player,missions[1].target)<5.5)stageUp();
 if(state.stage===2&&player.sky&&Math.hypot(player.x-29,player.z+28)<8&&player.y>7)stageUp();
 state.zone=player.z>19?'SOUTH PHILLY':player.x>28?'OLD CITY':player.x<-25?'UNIVERSITY CITY':'CENTER CITY';
 }
function minimap(){const cv=$('minimap'),ctx=cv.getContext('2d'),s=156,scale=1.1;ctx.clearRect(0,0,s,s);ctx.fillStyle='#0d1f34';ctx.fillRect(0,0,s,s);ctx.strokeStyle='#253d58';ctx.lineWidth=4;
 for(let p=-84;p<=84;p+=12){ctx.beginPath();ctx.moveTo(s/2+(p-player.x)*scale,0);ctx.lineTo(s/2+(p-player.x)*scale,s);ctx.stroke();ctx.beginPath();ctx.moveTo(0,s/2+(p-player.z)*scale);ctx.lineTo(s,s/2+(p-player.z)*scale);ctx.stroke();}
 ctx.fillStyle='#275b75';ctx.fillRect(s/2+(48-player.x)*scale,0,22*scale,s);
 const target=missions[state.stage].target;if(target){const x=s/2+(target.x-player.x)*scale,y=s/2+(target.z-player.z)*scale;ctx.fillStyle='#ffd67a';ctx.beginPath();ctx.arc(x,y,4,0,2*PI);ctx.fill();}
 ctx.save();ctx.translate(s/2,s/2);ctx.rotate(player.heading);ctx.fillStyle='#d1faff';ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(-5,6);ctx.lineTo(5,6);ctx.closePath();ctx.fill();ctx.restore();}
let skyHudShown=false;
function updateHUD(){if(!state.started)return;if(player.sky!==skyHudShown){skyHudShown=player.sky;$('skyHud').classList.toggle('hidden',!skyHudShown);measureHud();}$('district').textContent=state.zone;$('zone').textContent=state.zone;$('energy').firstElementChild.style.width=`${player.energy.toFixed(0)}%`;$('objectiveProgress').textContent=state.stage===3?`${state.droneCount} / 3 DRONES DISABLED`:state.stage===4?'OPEN WORLD UNLOCKED':'';
 const target=missions[state.stage].target;if(!target){$('marker').classList.add('hidden');}else{const v=state.webgl?project(viewProj,target.x,target.y+2,target.z):screenProject(target.x,target.y+2,target.z);const dist=Math.hypot(player.x-target.x,player.z-target.z);$('marker').classList.remove('hidden');const x=clamp(state.webgl?(v.x*.5+.5)*innerWidth:v.x,125,innerWidth-125),y=clamp(state.webgl?(1-(v.y*.5+.5))*innerHeight:v.y,markerBand[0],markerBand[1]);const behind=state.webgl?v.w<=0:!v.visible;$('marker').style.left=`${behind?innerWidth/2:x}px`;$('marker').style.top=`${behind?innerHeight*.52:y}px`;$('markerName').textContent=target.name;$('markerDistance').textContent=`${Math.round(dist)}m`;}if(state.frame%7===0)minimap();if(state.noticeUntil&&performance.now()>state.noticeUntil){$('toast').classList.remove('show');state.noticeUntil=0;}}
function animate(now){const elapsed=clamp((now-lastFrame)/1000,0,.25);lastFrame=now;renderDt=elapsed;try{for(let left=elapsed;left>0.000001;){const step=Math.min(left,.05);update(step);left-=step;}renderer();state.frame++;if(state.frame%2===0)updateHUD();}catch(err){console.error('Render failure',err);$('fatal').textContent='3D renderer error: '+err.message;$('fatal').classList.remove('hidden');state.webgl=false;}requestAnimationFrame(animate);}
function setupInput(){const joy=$('moveJoystick'),knob=$('joy-knob');let joyId=null;
 function joyMove(e){const ring=$('joy-ring').getBoundingClientRect(),cx=ring.left+ring.width/2,cy=ring.top+ring.height/2;const x=e.clientX-cx,y=e.clientY-cy,limit=ring.width*.35,dist=Math.hypot(x,y),k=Math.min(1,limit/(dist||1));controls.x=clamp(x*k/limit,-1,1);controls.y=clamp(y*k/limit,-1,1);controls.sprint=dist>=limit*.9;knob.style.transform=`translate(${controls.x*limit}px,${controls.y*limit}px)`;}
 joy.addEventListener('pointerdown',e=>{e.preventDefault();joyId=e.pointerId;joy.setPointerCapture(joyId);joyMove(e);});joy.addEventListener('pointermove',e=>{if(e.pointerId===joyId)joyMove(e);});const joyEnd=e=>{if(e.pointerId!==joyId)return;joyId=null;controls.x=controls.y=0;controls.sprint=false;knob.style.transform='translate(0,0)';};joy.addEventListener('pointerup',joyEnd);joy.addEventListener('pointercancel',joyEnd);joy.addEventListener('lostpointercapture',()=>{joyId=null;controls.x=controls.y=0;controls.sprint=false;knob.style.transform='translate(0,0)';});
 const look=$('lookArea');
 function lookDown(e){if(!state.started||state.paused||lookPointer!==null)return;e.preventDefault();lookPointer=e.pointerId;lookX=e.clientX;lookY=e.clientY;e.currentTarget.setPointerCapture(e.pointerId);}
 function lookMove(e){if(e.pointerId!==lookPointer)return;e.preventDefault();const delta=(e.clientX-lookX)*.008;cameraYaw+=delta;cameraPitch=clamp(cameraPitch+(e.clientY-lookY)*.004,-.35,.82);if(controls.basisYaw!==null)controls.basisYaw+=delta;lookX=e.clientX;lookY=e.clientY;}
 function lookEnd(e){if(e.pointerId!==lookPointer)return;lookPointer=null;lookOverrideUntil=state.time+1.5;}
 for(const target of [look,canvas]){
  target.addEventListener('pointerdown',e=>{if(target===canvas&&e.pointerType!=='mouse')return;lookDown(e);});
  target.addEventListener('pointermove',lookMove);target.addEventListener('pointerup',lookEnd);target.addEventListener('pointercancel',lookEnd);
  target.addEventListener('lostpointercapture',lookEnd);
 }
 $('dialogueContinue').addEventListener('click',closeDialogue);
 window.addEventListener('keydown',e=>{if(e.key==='Enter'&&!$('dialogue').classList.contains('hidden')){closeDialogue();return;}const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();keys.add(k);if(!state.started){if(k==='enter')start(false);return;}if(e.repeat)return;if(k==='f')fly();if(k==='e')interact();if(k==='j')pulse();if(k===' '&&!player.sky)jump();if(k==='m')$('journal').classList.contains('hidden')?openJournal():closeJournal();if(k==='p')pause();});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();controls.x=controls.y=0;controls.sprint=false;controls.basisYaw=null;lookPointer=null;});
 for(const [id,fn] of [['playSound',()=>start(true)],['playMuted',()=>start(false)],['skyButton',fly],['jumpButton',jump],['pulseButton',pulse],['talkButton',interact],['journalBtn',openJournal],['journalClose',closeJournal],['pauseBtn',pause],['resumeButton',pause],['restart',()=>{reset();closeJournal();toast('STORY RESTARTED');}],['audioBtn',()=>initAudio(!state.audio)]]){$(id).addEventListener('click',e=>{e.preventDefault();fn();});}
}
function boot(){updateJournal();try{init3D();}catch(err){console.warn('WebGL init',err);try{if(gl){const fresh=canvas.cloneNode(false);canvas.replaceWith(fresh);canvas=fresh;gl=null;}setupFallback();}catch(fatal){console.error(fatal);$('fatal').classList.remove('hidden');$('playSound').disabled=true;$('playMuted').disabled=true;}}setupInput();requestAnimationFrame(animate);
 // Read-only debugging observations for deterministic browser tests and production diagnostics.
 window.__imInYoCityDebug=()=>({started:state.started,paused:state.paused,stage:state.stage,droneCount:state.droneCount,x:player.x,y:player.y,z:player.z,heading:player.heading,cameraYaw,cameraPitch,basisYaw:controls.basisYaw,gait:player.gait,camPos,skyMode:player.sky,energy:player.energy,webgl:state.webgl,fallback:!!state.fallback,pulses:state.pulses,inputX:controls.x,inputY:controls.y,sprinting:controls.sprint,frames:state.frame,mission:missions[state.stage].title,zone:state.zone,staticVertices:staticArray?.length/10||0});
}
boot();
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.info('Offline cache unavailable:',err.message)));}
