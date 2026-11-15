// I'm In Yo City: Philadelphia. Original, dependency-free WebGL vertical slice.
// The world is a stylized interpretation, not a surveyed or photogrammetric map.
const $ = (id) => document.getElementById(id);
const canvas = $('city');
const gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true, powerPreference: 'high-performance' });
const state = {
  running: false, renderer: gl ? 'WebGL' : 'unavailable', x: 22, z: 45,
  y: 0, vy: 0, angle: 0, facing: 0, mission: 0, sound: true,
  keyInput: { x: 0, y: 0 }, stickInput: { x: 0, y: 0 }, sprint: false, hop: false,
  unlockedAudio: false, lastStep: 0, completed: false
};
const missions = [
  { name: 'CITY HALL', x: 7, z: 6, radius: 8, message: 'CITY HALL FOUND • +1 CITY REP' },
  { name: 'READING TERMINAL', x: -31, z: -12, radius: 8, message: 'MARKET RUN COMPLETE • +1 CITY REP' },
  { name: 'BRIDGE LOOKOUT', x: 2, z: -86, radius: 10, message: 'PHILLY CHAPTER 01 COMPLETE' }
];
// Public diagnostic seam for Playwright. No account data or privileged actions.
window.__iminyocity = () => ({
  running: state.running, renderer: state.renderer,
  x: Number(state.x.toFixed(2)), z: Number(state.z.toFixed(2)),
  mission: state.mission, completed: state.completed
});

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const distance = (x, z, x2, z2) => Math.hypot(x - x2, z - z2);
const mix = (a, b, t) => a + (b - a) * t;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
function randGen(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; }; }
const rnd = randGen(2152026);
const colors = {
  stone: [0.47, 0.43, 0.48], sandstone: [0.75, 0.59, 0.48], brick: [0.46, 0.23, 0.29], brick2: [0.32, 0.27, 0.36],
  tar: [0.075, 0.105, 0.17], sidewalk: [0.28, 0.31, 0.37], grass: [0.15, 0.26, 0.27], gold: [1.0, 0.67, 0.32],
  window: [0.99, 0.70, 0.42], dimwindow: [0.21, 0.43, 0.53], steel: [0.31, 0.4, 0.52], lamp: [1.0, 0.78, 0.52],
  tree: [0.17, 0.38, 0.27], river: [0.10, 0.19, 0.31], white: [0.8, 0.79, 0.76]
};
function shade(c, f) { return c.map(v => v * f); }
function mesh() { return []; }
function quad(a, b, c, d, n, color, into) {
  for (const p of [a, b, c, a, c, d]) into.push(...p, ...n, ...color);
}
function box(x, y, z, sx, sy, sz, color, into, options = {}) {
  const x0=x-sx/2, x1=x+sx/2, y0=y-sy/2, y1=y+sy/2, z0=z-sz/2, z1=z+sz/2;
  quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0],shade(color,1.13),into);
  quad([x1,y0,z1],[x0,y0,z1],[x0,y0,z0],[x1,y0,z0],[0,-1,0],shade(color,.75),into);
  quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1],shade(color,.96),into);
  quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1],shade(color,.82),into);
  quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[1,0,0],shade(color,.76),into);
  quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0],shade(color,1.04),into);
}
function cylinder(x, y, z, rx, ry, rz, segments, color, into, topRadius = rx) {
  for (let i=0;i<segments;i++) {
    const a=i*2*Math.PI/segments,b=(i+1)*2*Math.PI/segments;
    const p1=[x+rx*Math.cos(a),y-ry/2,z+rz*Math.sin(a)],p2=[x+rx*Math.cos(b),y-ry/2,z+rz*Math.sin(b)];
    const p3=[x+topRadius*Math.cos(b),y+ry/2,z+topRadius*Math.sin(b)],p4=[x+topRadius*Math.cos(a),y+ry/2,z+topRadius*Math.sin(a)];
    const normal=[Math.cos((a+b)/2),.1,Math.sin((a+b)/2)];
    quad(p1,p2,p3,p4,normal,shade(color,.9+Math.sin(a)*.1),into);
    quad([x,y+ry/2,z],p4,p3,[x,y+ry/2,z],[0,1,0],shade(color,1.1),into);
  }
}
function beam(a, b, width, color, into) {
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz)||1;
  const f=[dx/len,dy/len,dz/len];let up=[0,1,0];
  if (Math.abs(f[1])>.95) up=[1,0,0];
  let right=[f[1]*up[2]-f[2]*up[1],f[2]*up[0]-f[0]*up[2],f[0]*up[1]-f[1]*up[0]];
  const rl=Math.hypot(...right)||1;right=right.map(v=>v/rl);
  const side=[right[1]*f[2]-right[2]*f[1],right[2]*f[0]-right[0]*f[2],right[0]*f[1]-right[1]*f[0]];
  const p=(v,u,s)=>v.map((n,i)=>n+(right[i]*u+side[i]*s)*width/2);
  const a0=p(a,-1,-1),a1=p(a,1,-1),a2=p(a,1,1),a3=p(a,-1,1);
  const b0=p(b,-1,-1),b1=p(b,1,-1),b2=p(b,1,1),b3=p(b,-1,1);
  quad(a0,b0,b1,a1,side.map(v=>-v),color,into);quad(a3,a2,b2,b3,side,color,into);
  quad(a0,a3,b3,b0,right.map(v=>-v),color,into);quad(a1,b1,b2,a2,right,color,into);
}
function building(x,z,w,d,h,style,into) {
  const c=style==='glass'?[.21+rnd()*.10,.31+rnd()*.07,.43+rnd()*.11]:
    style==='row'? (rnd()>.5?colors.brick:colors.brick2):colors.sandstone;
  box(x,h/2,z,w,h,d,c,into);
  box(x,h+.34,z,w+0.4,.7,d+0.4,shade(c,.62),into);
  if(style==='row'){
    box(x,h*.52,z+d/2+.035,w*.21,h*.55,.11,[.19,.16,.19],into);
    for(const offset of [-.3,.3])for(let level=1;level<Math.min(5,Math.floor(h/3));level++){
      box(x+offset*w,h*(level/(Math.floor(h/3)+.4)),z+d/2+.10,w*.18,1.25,.15,rnd()>.28?colors.window:colors.dimwindow,into);
    }
    box(x,h+.9,z,Math.min(w,2),1.1,1.1,shade(c,.7),into);
    return;
  }
  const floors=Math.min(19,Math.floor(h/3.6)),cols=Math.min(6,Math.floor(w/2.7));
  for(let level=1;level<=floors;level++)for(let col=0;col<cols;col++){
    if(rnd()<.18)continue;
    const xx=x-w/2+(col+.5)*w/cols,yy=level*h/(floors+1);
    const lit = rnd()<.65;
    box(xx,yy,z+d/2+.09,Math.max(.7,w/cols*.55),Math.min(1.5,h/floors*.42),.16,lit?colors.window:colors.dimwindow,into);
  }
  if(style==='glass'&&h>25){box(x,h+1.9,z,1.3,3,1.3,colors.steel,into);}
}
function tree(x,z,into) {
  cylinder(x,1.7,z,.23,3.5,.23,7,[.30,.22,.19],into);
  cylinder(x,5.5,z,2.4,4.2,2.4,8,colors.tree,into,1.15);
  cylinder(x,7.4,z,1.45,3.2,1.45,8,[.23,.44,.34],into,.1);
}
function lamp(x,z,into) {
  cylinder(x,2.75,z,.11,5.5,.11,6,colors.steel,into);
  box(x,5.5,z,.9,.35,.9,colors.lamp,into);
}
function cityHall(into) {
  // Philadelphia City Hall-inspired silhouette: broad civic wings, clock tower, lantern and spire.
  box(0,6.6,0,16,13.2,15.5,colors.sandstone,into);
  box(0,13.3,0,18,1.2,17,shade(colors.sandstone,.8),into);
  for(const x of [-6.4,6.4])for(const z of [-6,6])cylinder(x,13.5,z,1.15,3,1.15,8,colors.sandstone,into,.35);
  box(0,20.5,0,7.5,13,7.5,colors.sandstone,into);
  box(0,27.8,0,9,1.7,9,shade(colors.stone,1.1),into);
  box(0,32.0,0,5.9,7,5.9,colors.stone,into);
  for(const v of [-1,1]){
    box(v*3,31.5,0,.2,3.8,2,colors.gold,into);
    box(0,31.5,v*3,2,3.8,.2,colors.gold,into);
  }
  cylinder(0,39.1,0,3.5,5,3.5,12,[.30,.46,.43],into,.8);
  cylinder(0,44,0,.7,5,.7,8,colors.gold,into,.1);
}
function readingTerminal(into) {
  building(-31,-12,13,11,11,'stone',into);
  box(-31,11.1,-6.39,13,.9,.6,colors.gold,into);
  box(-31,6,-6.3,11,4,.45,[.12,.18,.25],into);
  for(let i=0;i<4;i++)box(-35+i*2.6,6,-6.01,.18,4,.2,colors.gold,into);
}
function bridge(into) {
  // The river and suspension geometry hint at the Benjamin Franklin Bridge.
  box(0,-.25,-100,220,.4,29,colors.river,into);
  box(0,5,-98,160,1.3,10,colors.steel,into);
  for(const x of [-40,40]){
    for(const dz of [-3.7,3.7]){
      box(x,17.5,-98+dz,5,35,3.0,[.48,.46,.48],into);
      box(x,34.2,-98+dz,7,2.4,4.3,shade(colors.sandstone,.85),into);
    }
    beam([x,34,-101.7],[x,34,-94.3],.5,colors.steel,into);
  }
  for(let side of [-1,1]){
    const z=-98+side*4.9;
    const anchors=[[-80,12],[-40,35],[40,35],[80,12]];
    for(let i=0;i<anchors.length-1;i++) {
      const [ax,ay]=anchors[i],[bx,by]=anchors[i+1];
      for(let j=0;j<12;j++){
        const t=j/12,tt=(j+1)/12;
        const y1=mix(ay,by,t)-Math.sin(t*Math.PI)*5,y2=mix(ay,by,tt)-Math.sin(tt*Math.PI)*5;
        beam([mix(ax,bx,t),y1,z],[mix(ax,bx,tt),y2,z],.32,colors.gold,into);
      }
    }
    for(let x=-76;x<=76;x+=8){
      const cableY=Math.abs(x)>40?mix(35,12,(Math.abs(x)-40)/40):35;
      beam([x,5.9,z],[x,cableY-1.5,z],.15,colors.steel,into);
    }
  }
}
function buildWorld() {
  const into=mesh();
  box(0,-.8,0,218,1.5,218,colors.grass,into);
  for(let v=-80;v<=80;v+=20){
    box(v,.05,0,7,.14,220,colors.tar,into);
    box(0,.07,v,220,.14,7,colors.tar,into);
    for(let q=-94;q<96;q+=8){
      box(v,.13,q, .17,.018,2.7,shade(colors.white,.70),into);
      box(q,.14,v,2.7,.018,.17,shade(colors.white,.70),into);
    }
  }
  // Broad Street-style central illuminated strip.
  for(let q=-75;q<75;q+=12)box(0,.15,q,.19,.025,5.3,colors.gold,into);
  for(let row=-4;row<4;row++)for(let col=-4;col<4;col++){
    const x=col*20+10,z=row*20+10;
    if(distance(x,z,0,0)<11)continue;
    const nearCenter=Math.max(0,1-distance(x,z,0,0)/90);
    const h=nearCenter>.56?21+rnd()*43:8+rnd()*15;
    const style=nearCenter>.55?'glass':'row';
    if((col===-2&&row===-1)||(col===-1&&row===-1))continue;
    if((col===0&&row===-4)||(col===-1&&row===-4))continue;
    box(x,.14,z,11,.2,11,colors.sidewalk,into);
    if(rnd()<.12){tree(x-3,z-1,into);lamp(x+3,z+3,into);continue;}
    building(x,z,8.5+rnd()*3,8.5+rnd()*3,h,style,into);
    if(rnd()<.55)tree(x-6,z+6,into);
    if(rnd()<.6)lamp(x+6,z-6,into);
  }
  cityHall(into);readingTerminal(into);bridge(into);
  for(const x of [-64,-24,24,64])for(const z of [-64,-24,24,64])if(rnd()<.55)lamp(x,z,into);
  // A few recognizable skyline proportions and a glowing rooftop antenna.
  building(31,-31,14,14,64,'glass',into);
  building(51,-31,12,14,48,'glass',into);
  building(-49,-31,14,16,51,'glass',into);
  cylinder(31,68.8,-31,.35,9,.35,7,colors.gold,into,.06);
  return into;
}
function buildAvatar() {
  const m=mesh();
  // Original street explorer: ochre jacket, dark trousers, warm-gold cap.
  box(0,.9,0,.86,1.75,.73,[.11,.14,.26],m);
  box(-.66,2.7,0,.49,1.6,.58,[.83,.34,.26],m);
  box(.66,2.7,0,.49,1.6,.58,[.83,.34,.26],m);
  box(0,2.7,0,1.4,1.6,.83,[.83,.34,.26],m);
  cylinder(0,4,0,.43,1.06,.43,10,[.45,.29,.21],m);
  box(0,4.63,.01,1.04,.3,.98,colors.gold,m);
  box(0,4.46,-.47,1.25,.12,.35,colors.gold,m);
  box(0,2.45,-.45,.6,.6,.11,[.95,.73,.45],m);
  return m;
}
function buildBeacon(){
  const m=mesh();
  cylinder(0,.13,0,3.6,.25,3.6,24,colors.gold,m);
  cylinder(0,1.3,0,1.4,2.5,1.4,12,[1.0,.64,.2],m,.5);
  cylinder(0,5.5,0,.55,6,.55,12,[1.0,.76,.35],m,.03);
  return m;
}
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Shader: '+gl.getShaderInfoLog(s));return s;}
function program(){
  const vert=`attribute vec3 aPosition; attribute vec3 aNormal; attribute vec3 aColor;
    uniform mat4 uView, uProjection;uniform vec3 uOffset,uEye;uniform float uTime,uYaw;
    varying vec3 vColor;varying float vFog;
    void main(){
      float co=cos(uYaw),si=sin(uYaw);
      vec3 p=vec3(aPosition.x*co-aPosition.z*si,aPosition.y,aPosition.x*si+aPosition.z*co)+uOffset;
      vec3 n=normalize(vec3(aNormal.x*co-aNormal.z*si,aNormal.y,aNormal.x*si+aNormal.z*co));
      float l=max(dot(n,normalize(vec3(-0.6,0.9,0.4))),0.0);
      vColor=aColor*(0.56+0.54*l);
      vFog=clamp((distance(p,uEye)-62.0)/150.0,0.0,0.80);
      gl_Position=uProjection*uView*vec4(p,1.0);
    }`;
  const frag=`precision mediump float;varying vec3 vColor;varying float vFog;void main(){
    vec3 fog=vec3(.30,.25,.39);gl_FragColor=vec4(mix(vColor,fog,vFog),1.0);
  }`;
  const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vert));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,frag));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('Program link: '+gl.getProgramInfoLog(p));return p;
}
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([
  f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0
]);}
function lookAt(eye,center){
  const vnorm=v=>{const n=Math.hypot(...v)||1;return v.map(a=>a/n);};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  const z=vnorm(eye.map((v,i)=>v-center[i])),x=vnorm(cross([0,1,0],z)),y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
let render=null;
try {
  if (gl) {
    const p=program(), loc={};
    gl.useProgram(p);
    for(const name of ['aPosition','aNormal','aColor'])loc[name]=gl.getAttribLocation(p,name);
    for(const name of ['uView','uProjection','uOffset','uEye','uTime','uYaw'])loc[name]=gl.getUniformLocation(p,name);
    const buffer=(vertices)=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);return {buffer:b,count:vertices.length/9};};
    const world=buffer(buildWorld()),avatar=buffer(buildAvatar()),beacon=buffer(buildBeacon());
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
    const draw=(mesh,offset,yaw)=>{
      gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
      for(const [i,name] of ["aPosition","aNormal","aColor"].entries()){
        gl.enableVertexAttribArray(loc[name]);gl.vertexAttribPointer(loc[name],3,gl.FLOAT,false,36,i*12);
      }
      gl.uniform3fv(loc.uOffset,offset);gl.uniform1f(loc.uYaw,yaw);gl.drawArrays(gl.TRIANGLES,0,mesh.count);
    };
    render=(t)=>{
      const ratio=Math.min(devicePixelRatio||1,1.7),w=Math.round(canvas.clientWidth*ratio),h=Math.round(canvas.clientHeight*ratio);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
      const forward=[Math.sin(state.angle),-Math.cos(state.angle)];
      const eye=[state.x-forward[0]*16,10.5+state.y*.12,state.z-forward[1]*16];
      const target=[state.x,3.4+state.y*.3,state.z];
      gl.clearColor(.09,.12,.20,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(loc.uProjection,false,perspective(Math.PI*.315,w/Math.max(h,1),.2,500));
      gl.uniformMatrix4fv(loc.uView,false,lookAt(eye,target));
      gl.uniform3fv(loc.uEye,eye);gl.uniform1f(loc.uTime,t);
      draw(world,[0,0,0],0);
      if(!state.completed) {
        const m=missions[state.mission];draw(beacon,[m.x,Math.sin(t*2)*.35,m.z],t*.65);
      }
      draw(avatar,[state.x,state.y+Math.sin(t*9)*(state.sprint?.05:.025),state.z],state.facing);
    };
  }
}catch(err){console.error('WebGL initialization:',err);state.renderer='unavailable';}
if(!render){$('fallback').hidden=false;$('start').disabled=true;$('start').textContent='3D UNAVAILABLE';}
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();state.running=false;$('fallback').hidden=false;$('fallback').textContent='3D graphics paused because the browser lost its WebGL context. Reload to resume.';});

let audio=null;
function unlockSound(){if(state.unlockedAudio)return;
  try{audio=new (window.AudioContext||window.webkitAudioContext)();state.unlockedAudio=true;}
  catch(_){state.sound=false;updateSound();}}
function tone(freq,when=0,duration=.12,volume=.035){if(!state.sound||!audio)return;
  const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(freq,audio.currentTime+when);
  g.gain.setValueAtTime(volume,audio.currentTime+when);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+when+duration);
  o.connect(g).connect(audio.destination);o.start(audio.currentTime+when);o.stop(audio.currentTime+when+duration+.01);
}
function chime(){tone(493,.02,.19,.045);tone(659,.11,.22,.035);tone(987,.25,.33,.022);}
function updateSound(){$('sound').setAttribute('aria-pressed',String(state.sound));$('sound').querySelector('span').textContent=state.sound?'ON':'OFF';}
$('sound').addEventListener('click',()=>{state.sound=!state.sound;updateSound();if(state.sound){unlockSound();tone(700);}});
$('start').addEventListener('click',()=>{
  if(!render)return;state.running=true;$('intro').hidden=true;$('hud').hidden=false;$('controls').hidden=false;$('compass').hidden=false;
  unlockSound();tone(466,.0,.23);tone(698,.15,.31);updateMission();
});
const keys=new Set();
addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();
  keys.add(e.key.toLowerCase());if(e.key===' '||e.key.toLowerCase()==='j')jump();
});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
addEventListener('blur',()=>{keys.clear();state.stickInput={x:0,y:0};$('stick').style.transform='translate(0,0)';state.sprint=false;});
function jump(){if(state.y<.02&&state.running)state.vy=8;}
$('hop').addEventListener('click',jump);
const runButton=$('run');
runButton.addEventListener('pointerdown',e=>{e.preventDefault();state.sprint=true;runButton.classList.add('pressed');runButton.setPointerCapture(e.pointerId);});
for(const evt of ['pointerup','pointercancel','lostpointercapture'])runButton.addEventListener(evt,()=>{state.sprint=false;runButton.classList.remove('pressed');});
const joy=$('joystick'),stick=$('stick');let joyPointer=null;
function setJoystick(e){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,max=r.width*.29;
  const dx=e.clientX-cx,dy=e.clientY-cy,mag=Math.hypot(dx,dy)||1,k=Math.min(max,mag)/mag;
  const x=dx*k,y=dy*k;state.stickInput={x:x/max,y:-y/max};stick.style.transform=`translate(${x}px,${y}px)`;
}
joy.addEventListener('pointerdown',e=>{e.preventDefault();joyPointer=e.pointerId;if(e.isTrusted)joy.setPointerCapture(e.pointerId);setJoystick(e);});
joy.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer)setJoystick(e);});
function releaseJoy(e){if(e.pointerId!==joyPointer)return;joyPointer=null;state.stickInput={x:0,y:0};stick.style.transform='translate(0,0)';}
for(const evt of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(evt,releaseJoy);
let lookPointer=null,lookX=0;
canvas.addEventListener('pointerdown',e=>{if(!state.running)return;lookPointer=e.pointerId;lookX=e.clientX;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(e.pointerId===lookPointer){state.angle-=clamp(e.clientX-lookX,-90,90)*.006;lookX=e.clientX;}});
for(const evt of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(evt,e=>{if(e.pointerId===lookPointer)lookPointer=null;});
let toastTimer=0;
function showToast(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2900);}
function updateMission(){
  if(state.completed){$('objective').textContent='FREE ROAM';$('distance').textContent='3 / 3 landmarks discovered';return;}
  const m=missions[state.mission];$('objective').textContent=m.name;
  $('distance').textContent=`${Math.round(distance(state.x,state.z,m.x,m.z))}m TO MARKER • ${state.mission}/3 CITY REP`;
}
function simulate(dt,now){
  if(!state.running)return;
  let kx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
  let ky=(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0);
  let ix=clamp(kx+state.stickInput.x,-1,1),iy=clamp(ky+state.stickInput.y,-1,1);
  const size=Math.hypot(ix,iy),input=Math.min(1,size);
  if(input>.06){
    ix/=size;iy/=size;
    const fx=Math.sin(state.angle),fz=-Math.cos(state.angle),rx=Math.cos(state.angle),rz=Math.sin(state.angle);
    const dx=(rx*ix+fx*iy),dz=(rz*ix+fz*iy);
    const speed=(state.sprint||keys.has('shift')?12.5:7.3)*input;
    state.x=clamp(state.x+dx*speed*dt,-90,90);state.z=clamp(state.z+dz*speed*dt,-90,87);
    const desired=Math.atan2(dx,-dz);
    state.facing+=angleDiff(desired,state.facing)*Math.min(1,dt*10);
    // Camera follows turning for forward movement, keeping joystick navigation intuitive.
    if(iy>.35)state.angle+=angleDiff(desired,state.angle)*Math.min(1,dt*.9);
    if(now-state.lastStep>(state.sprint?.24:.38)){tone(120+Math.random()*15,0,.075,.007);state.lastStep=now;}
  }
  state.vy-=24*dt;state.y+=state.vy*dt;if(state.y<0){state.y=0;state.vy=0;}
  if(!state.completed){
    const m=missions[state.mission];
    if(distance(state.x,state.z,m.x,m.z)<m.radius){showToast(m.message);chime();state.mission++;if(state.mission>=missions.length){state.completed=true;}}
  }
  updateMission();
  const deg=((state.angle*180/Math.PI)%360+360)%360;
  $('heading').textContent=['N','NE','E','SE','S','SW','W','NW'][Math.round(deg/45)%8];
}
let lastTime=0;
function frame(ms){const time=ms/1000,dt=Math.min(.04,lastTime?time-lastTime:.016);lastTime=time;
  simulate(dt,time);if(render)render(time);requestAnimationFrame(frame);}
requestAnimationFrame(frame);
