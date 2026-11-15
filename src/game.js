/* I'm In Yo City | Chapter 01
   Standalone WebGL2 3D prototype, deliberately no runtime CDN or paid dependencies.
   Simulation state, input, render meshes, and HUD remain separate. */
const $ = id => document.getElementById(id);
const canvas = $('game');
const gl = canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
const ctx=gl?null:canvas.getContext('2d');
if (!gl && !ctx) { $('error').style.display='grid';$('intro').classList.add('hidden');throw new Error('Canvas rendering unavailable'); }
let program,uni,attr,shapes;
if(gl){
const vert=`#version 300 es
in vec3 a_position; in vec3 a_normal;
uniform mat4 u_matrix; uniform mat4 u_model;
out vec3 v_normal; out vec3 v_world;
void main(){ vec4 w=u_model*vec4(a_position,1.0);v_world=w.xyz;v_normal=mat3(u_model)*a_normal;gl_Position=u_matrix*w; }`;
const frag=`#version 300 es
precision highp float;
in vec3 v_normal; in vec3 v_world;
uniform vec3 u_color; uniform vec3 u_eye; uniform float u_glow;
out vec4 outColor;
void main(){vec3 n=normalize(v_normal);float light=max(dot(n,normalize(vec3(-0.48,0.83,0.44))),0.0);float shade=0.46+0.54*light;
vec3 c=u_color*shade + u_color*u_glow*0.68;
float d=distance(v_world,u_eye);float fog=clamp((d-45.0)/200.0,0.0,0.68);
c=mix(c,vec3(0.54,0.32,0.47),fog);c=pow(max(c,0.0),vec3(0.93));outColor=vec4(c,1.0);}`;
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vert));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,frag));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
uni={matrix:gl.getUniformLocation(program,'u_matrix'),model:gl.getUniformLocation(program,'u_model'),color:gl.getUniformLocation(program,'u_color'),eye:gl.getUniformLocation(program,'u_eye'),glow:gl.getUniformLocation(program,'u_glow')};
attr={pos:gl.getAttribLocation(program,'a_position'),norm:gl.getAttribLocation(program,'a_normal')};
function makeMesh(pos,norm,indices){const vao=gl.createVertexArray();gl.bindVertexArray(vao);const vbo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vbo);const arr=[];for(let i=0;i<pos.length/3;i++){arr.push(...pos.slice(i*3,i*3+3),...norm.slice(i*3,i*3+3))}gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),gl.STATIC_DRAW);gl.enableVertexAttribArray(attr.pos);gl.vertexAttribPointer(attr.pos,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(attr.norm);gl.vertexAttribPointer(attr.norm,3,gl.FLOAT,false,24,12);const ibo=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);gl.bindVertexArray(null);return{vao,count:indices.length}}
function cube(){const pos=[],norm=[],ind=[];const faces=[[[0,0,1],[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],[[0,0,-1],[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]],[[1,0,0],[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]],[[-1,0,0],[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]],[[0,1,0],[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]],[[0,-1,0],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]]];for(const [n,vs] of faces){const b=pos.length/3;vs.forEach(p=>{pos.push(...p);norm.push(...n)});ind.push(b,b+1,b+2,b,b+2,b+3)}return makeMesh(pos,norm,ind)}
function sphere(){const pos=[],norm=[],ind=[],lat=10,lon=16;for(let y=0;y<=lat;y++){let t=y*Math.PI/lat;for(let x=0;x<=lon;x++){let p=x*Math.PI*2/lon,v=[Math.sin(t)*Math.cos(p),Math.cos(t),Math.sin(t)*Math.sin(p)];pos.push(...v);norm.push(...v)}}for(let y=0;y<lat;y++)for(let x=0;x<lon;x++){let i=y*(lon+1)+x;ind.push(i,i+1,i+lon+1,i+1,i+lon+2,i+lon+1)}return makeMesh(pos,norm,ind)}
shapes={box:cube(),orb:sphere()};
}
function perspective(fov,aspect,near,far){let f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0])}
function lookAt(eye,at){let z=norm(sub(eye,at)),x=norm(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1])}
function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o}
function model(x,y,z,sx,sy,sz,rot=0){const c=Math.cos(rot),s=Math.sin(rot);return new Float32Array([c*sx,0,-s*sx,0,0,sy,0,0,s*sz,0,c*sz,0,x,y,z,1])}
const sub=(a,b)=>a.map((v,i)=>v-b[i]);const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];const norm=a=>{let m=Math.hypot(...a)||1;return a.map(n=>n/m)};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const staticObjects=[];function add(type,x,y,z,sx,sy,sz,color,glow=0,rot=0){staticObjects.push({type,x,y,z,sx,sy,sz,color,glow,rot})}
const C={road:[.15,.16,.22],walk:[.42,.38,.43],brick:[.50,.20,.23],brick2:[.61,.30,.27],brick3:[.32,.25,.35],light:[1,.73,.32],skin:[.43,.21,.15],tree:[.16,.30,.24],gold:[.98,.58,.29],deep:[.12,.10,.22]};
// Fixed readable district: street axis runs along Z, recognizable Philly rowhomes, murals and distant City Hall-inspired tower.
add('box',0,-.19,-49,19,.2,200,C.road);add('box',-14,-.13,-49,9,.27,200,C.walk);add('box',14,-.13,-49,9,.27,200,C.walk);
for(let z=17;z>-119;z-=13){add('box',0,-.07,z,.08,.035,3.9,[.85,.75,.57]);add('box',-9.6,-.03,z,.19,.05,6.9,[.83,.73,.59]);add('box',9.6,-.03,z,.19,.05,6.9,[.83,.73,.59])}
for(const side of [-1,1])for(let i=0;i<9;i++){
  const z=15-i*15,x=side*21.4,h=7+(i%3)*1.4;
  const brick=[C.brick,C.brick2,C.brick3,[.46,.33,.29]][i%4];
  add('box',x,h/2,z,12,h,12.3,brick);add('box',x,h+.3,z,12.9,.56,13.1,[.20,.15,.24]);
  // Windows look toward the roadway.
  for(let level=0;level<2;level++)for(let w=-1;w<=1;w++){
    const wx=x-side*6.06,wy=2.65+level*2.55,wz=z+w*3.4;
    add('box',wx,wy,wz,.10,1.45,1.35,[.12,.21,.31],.18);
    add('box',wx-side*.07,wy,wz,.10,.08,1.55,[.87,.59,.43],.35);
    add('box',wx-side*.07,wy,wz,.10,1.63,.11,[.87,.59,.43],.35);
  }
  add('box',x-side*6.18,1.3,z-4.3,.18,2.6,1.95,[.11,.13,.20]);
  add('box',x-side*6.15,2.65,z-4.3,.25,.19,2.4,C.gold);
  // Front porch steps and railings.
  add('box',x-side*6.6,.22,z-4.3,1.3,.38,3.0,[.49,.39,.39]);
}
// Shops, mural panels, warm signs.
for(const [x,z,color] of [[-15.25,-17,[.96,.35,.51]],[15.25,-42,[.24,.77,.76]],[15.25,-72,[.98,.65,.29]]]){
  add('box',x,3.25,z,.17,3.9,7,color,.3);add('box',x+(x<0?-.14:.14),5.45,z,.25,.30,7,[1,.80,.39],.45);
}
for(let i=0;i<13;i++){
 const z=18-i*11.4;for(const side of [-1,1]){let x=side*10.7;
 add('box',x,2.5,z,.22,5,.22,[.23,.23,.28]);add('orb',x,5.05,z,.35,.35,.35,C.light,1.3);
 if(i%2===0){add('box',side*13.4,.8,z+2,.50,1.6,.5,[.30,.22,.20]);add('orb',side*13.4,3.1,z+2,2.5,2.9,2.5,C.tree)}
 }}
// City Hall-inspired tower, outlined high-rises and a distant arched crossing.
add('box',0,20,-167,20,40,20,[.44,.39,.43]);add('box',0,47,-167,10,17,10,[.67,.53,.47]);add('box',0,59,-167,6,8,6,[.83,.65,.44]);add('orb',0,65,-167,3.3,3.3,3.3,C.gold,.45);
for(let i=0;i<18;i++){let x=(i-9)*14,z=-178-(i%3)*13,h=22+(i*11)%45;add('box',x,h/2,z,11,h,12,[.21+.014*(i%4),.25+.013*(i%5),.36+.014*(i%3)]);for(let j=0;j<4;j++)add('box',x,h*(j+1)/5,z+6.04,9,.15,.09,[.84,.59,.53],.7)}
// Park and painted mural sculpture area with a distinct golden beacon.
add('box',-11.5,.01,-17,4.7,.12,6.5,[.30,.23,.33]);add('box',-11.5,1.5,-17,2.8,3,1.0,[.84,.31,.43],.5);add('orb',-11.5,3.2,-17,.62,.62,.62,[1,.79,.4],1.4);
// Neighbor NPC at stage two.
add('box',6.3,1.15,-43,.95,2.3,.75,[.14,.60,.58]);add('orb',6.3,2.63,-43,.62,.65,.62,[.36,.18,.12]);add('orb',6.3,3.08,-43,.67,.27,.65,[.10,.08,.11]);
// Gold arrival markers above interaction sites.
const interactions=[{x:-11.5,z:-17,name:'The mural',message:'You made it to the block. Every city has a story. Now go meet your guide.',next:'Find your neighborhood guide',step:'MISSION 02 / FIRST CONNECTION'},{x:6.3,z:-43,name:'Your guide',message:'Welcome to Philly. This is only the first block. Your city story starts here.',next:'Chapter 01 complete • explore the block',step:'MISSION COMPLETE / FREE ROAM'}];
const state={started:false,x:0,z:9,facing:0,yaw:0,camPitch:.35,keys:new Set(),joy:{x:0,y:0},quest:0,moving:false,frames:0,webgl:!!gl,lastInteraction:null};
const input={drag:false,lastX:0,lastY:0,activeJoy:null};
const talk=$('talk'),goal=$('goal'),step=$('step');let messageUntil=0;
function speak(message){talk.textContent=message;talk.classList.remove('hidden');messageUntil=performance.now()+4200}
function distanceTo(which){return Math.hypot(state.x-which.x,state.z-which.z)}
function interact(){if(!state.started)return;const item=interactions[state.quest];if(!item){speak('The block is yours. Keep exploring.');return}const distance=distanceTo(item);if(distance>6.5){speak(`${item.name} is ${Math.round(distance)}m away. Follow the glowing marker.`);return}state.quest++;state.lastInteraction=item.name;goal.textContent=item.next;step.textContent=item.step;speak(item.message);soundEffect(680);}
$('interact').addEventListener('click',interact);
const keys=new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(keys.has(k)){state.keys.add(k);e.preventDefault()}if((k==='e'||k==='enter')&&!e.repeat){interact();e.preventDefault()}if(k==='escape'){state.keys.clear();state.joy={x:0,y:0}}});
window.addEventListener('keyup',e=>state.keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{state.keys.clear();state.joy={x:0,y:0}});
canvas.addEventListener('pointerdown',e=>{if(!state.started)return;input.drag=true;input.lastX=e.clientX;input.lastY=e.clientY;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!input.drag)return;state.yaw-=clamp(e.clientX-input.lastX,-60,60)*.006;state.camPitch=clamp(state.camPitch+(e.clientY-input.lastY)*.0025,.08,.8);input.lastX=e.clientX;input.lastY=e.clientY});
canvas.addEventListener('pointerup',()=>input.drag=false);canvas.addEventListener('pointercancel',()=>input.drag=false);
const joy=$('joystick'),stick=$('stick');function updateJoy(e){const b=joy.getBoundingClientRect(),dx=e.clientX-(b.left+b.width/2),dy=e.clientY-(b.top+b.height/2),r=Math.min(42,Math.hypot(dx,dy)),angle=Math.atan2(dy,dx);const x=r*Math.cos(angle),y=r*Math.sin(angle);state.joy={x:x/42,y:y/42};stick.style.transform=`translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`}
joy.addEventListener('pointerdown',e=>{if(!state.started)return;input.activeJoy=e.pointerId;joy.setPointerCapture(e.pointerId);updateJoy(e);e.preventDefault()});
joy.addEventListener('pointermove',e=>{if(input.activeJoy===e.pointerId)updateJoy(e)});const releaseJoy=e=>{if(input.activeJoy!==e.pointerId)return;input.activeJoy=null;state.joy={x:0,y:0};stick.style.transform='translate(-50%,-50%)'};joy.addEventListener('pointerup',releaseJoy);joy.addEventListener('pointercancel',releaseJoy);
let audioCtx=null,enabled=false;function soundEffect(freq=440){if(!enabled)return;try{audioCtx??=new AudioContext();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type='sine';osc.frequency.setValueAtTime(freq,audioCtx.currentTime);osc.frequency.exponentialRampToValueAtTime(freq*.75,audioCtx.currentTime+.15);gain.gain.setValueAtTime(.08,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.24);osc.connect(gain).connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+.25)}catch{enabled=false;$('audio').textContent='♫ Sound unavailable'}}
$('audio').addEventListener('click',async()=>{enabled=!enabled;if(enabled){try{audioCtx??=new AudioContext();await audioCtx.resume();soundEffect(520)}catch{enabled=false}}$('audio').textContent=enabled?'♫ Sound on':'♫ Sound off';$('audio').setAttribute('aria-label',enabled?'Disable sound':'Enable sound')});
$('start').addEventListener('click',()=>{state.started=true;$('intro').classList.add('hidden');soundEffect(560);canvas.focus()});
const renderObj=(o,eye,world)=>{const m=shapes[o.type];gl.bindVertexArray(m.vao);gl.uniformMatrix4fv(uni.model,false,model(o.x,o.y,o.z,o.sx,o.sy,o.sz,o.rot||0));gl.uniform3fv(uni.color,o.color);gl.uniform1f(uni.glow,o.glow||0);gl.drawElements(gl.TRIANGLES,m.count,gl.UNSIGNED_SHORT,0)};
function dynamicPlayer(){const x=state.x,z=state.z,bob=state.moving?Math.sin(performance.now()*.013)*.07:0;const stride=state.moving?Math.sin(performance.now()*.012)*.4:0;
return[
{type:'box',x,y:1.37+bob,z,sx:.72,sy:1.3,sz:.45,color:[.85,.48,.22],rot:state.facing},
{type:'orb',x,y:2.45+bob,z,sx:.45,sy:.52,sz:.41,color:[.43,.22,.16]},
{type:'orb',x,y:2.79+bob,z,sx:.48,sy:.24,sz:.43,color:[.13,.10,.13]},
{type:'box',x:x-.22,y:.45+bob,z:z+stride*.3,sx:.22,sy:.9,sz:.29,color:[.16,.18,.30]},
{type:'box',x:x+.22,y:.45+bob,z:z-stride*.3,sx:.22,sy:.9,sz:.29,color:[.16,.18,.30]},
{type:'box',x:x-.55,y:1.28+bob,z,sx:.25,sy:.93,sz:.26,color:[.43,.22,.16]},
{type:'box',x:x+.55,y:1.28+bob,z,sx:.25,sy:.93,sz:.26,color:[.43,.22,.16]},
]}
// Real perspective-projected Canvas2D renderer for browsers with WebGL disabled.
// This is a playable degraded mode, not GPU/WebGL evidence.
function fallbackRender(eye,at,w,h,t){
  const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#322340');sky.addColorStop(.55,'#a36973');sky.addColorStop(1,'#e29a72');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  const forward=norm(sub(at,eye)),right=norm(cross(forward,[0,1,0])),up=cross(right,forward),focal=h/(2*Math.tan(Math.PI/6));
  const project=p=>{const d=sub(p,eye),z=dot(d,forward);if(z<.18)return null;return [w/2+dot(d,right)*focal/z,h/2-dot(d,up)*focal/z,z]};
  const paint=(points,color)=>{if(points.some(p=>!p))return;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fillStyle=color;ctx.fill()};
  const color=(c,shade,depth,glow=0)=>{let fog=clamp((depth-45)/210,0,.63),v=c.map((x,i)=>clamp((x*shade+x*glow*.45)*(1-fog)+[.54,.32,.47][i]*fog,0,1));return `rgb(${v.map(x=>Math.round(x*255)).join(',')})`};
  // An extended, properly projected roadway that follows the player.
  for(const [min,max,paintColor] of [[-9.5,9.5,'#373343'],[-18.5,-9.6,'#77717a'],[9.6,18.5,'#77717a']]){
    const far=-270,near=state.z+7;
    paint([project([min,-.29,near]),project([max,-.29,near]),project([max,-.29,far]),project([min,-.29,far])],paintColor)
  }
  const objects=[...staticObjects,...dynamicPlayer()];
  if(state.quest<2){const item=interactions[state.quest];objects.push({type:'orb',x:item.x,y:5.4+Math.sin(t*.003)*.5,z:item.z,sx:.68,sy:.68,sz:.68,color:[1,.72,.27],glow:1.2})}
  objects.sort((a,b)=>Math.hypot(b.x-eye[0],b.y-eye[1],b.z-eye[2])-Math.hypot(a.x-eye[0],a.y-eye[1],a.z-eye[2]));
  for(const o of objects){const d=Math.hypot(o.x-eye[0],o.y-eye[1],o.z-eye[2]);if(d>280)continue;
    if(o.type==='orb'){const p=project([o.x,o.y,o.z]);if(!p)continue;const rad=Math.max(1,o.sx*focal/p[2]);ctx.beginPath();ctx.ellipse(p[0],p[1],rad,Math.max(1,o.sy*focal/p[2]),0,0,Math.PI*2);ctx.fillStyle=color(o.color,.95,d,o.glow||0);ctx.fill();continue}
    const c=Math.cos(o.rot||0),s=Math.sin(o.rot||0),corners=[];
    for(const [sx,sy,sz] of [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]){
      const x=sx*o.sx/2,z=sz*o.sz/2;corners.push(project([o.x+x*c+z*s,o.y+sy*o.sy/2,o.z-x*s+z*c]))
    }
    const faces=[[0,3,2,1,.58],[4,5,6,7,.73],[0,4,7,3,.66],[1,2,6,5,.72],[3,7,6,2,1.08]];
    for(const [a,b,c,d0,shade] of faces){const points=[corners[a],corners[b],corners[c],corners[d0]];if(points.some(v=>!v))continue;paint(points,color(o.color,shade,d,o.glow||0))}
  }
}
function render(t){
  const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(window.devicePixelRatio||1,1.6),nw=Math.max(1,Math.floor(w*dpr)),nh=Math.max(1,Math.floor(h*dpr));
  if(canvas.width!==nw||canvas.height!==nh){canvas.width=nw;canvas.height=nh}
  const dist=state.started?11:17,cy=state.yaw,eye=[state.x+Math.sin(cy)*dist,6.6+state.camPitch*5,state.z+Math.cos(cy)*dist],at=[state.x,1.6,state.z-1];
  if(gl){
    gl.viewport(0,0,nw,nh);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(.41,.25,.43,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const proj=perspective(Math.PI/3,nw/nh,.2,440),view=lookAt(eye,at);
    gl.useProgram(program);gl.uniformMatrix4fv(uni.matrix,false,multiply(proj,view));gl.uniform3fv(uni.eye,eye);
    for(const o of staticObjects)renderObj(o,eye);for(const o of dynamicPlayer())renderObj(o,eye);
    if(state.quest<2){const item=interactions[state.quest],pulse=5.4+Math.sin(t*.003)*.5;renderObj({type:'orb',x:item.x,y:pulse,z:item.z,sx:.66,sy:.66,sz:.66,color:[1,.72,.27],glow:1.8},eye)}
  }else fallbackRender(eye,at,nw,nh,t);
  state.frames++;
}
let last=0,seconds=0;
function tick(time){const dt=Math.min((time-last)/1000||0,.04);last=time;if(state.started){const key=state.keys;let f=(key.has('w')||key.has('arrowup')?1:0)-(key.has('s')||key.has('arrowdown')?1:0)-state.joy.y;let r=(key.has('d')||key.has('arrowright')?1:0)-(key.has('a')||key.has('arrowleft')?1:0)+state.joy.x;const n=Math.hypot(f,r);state.moving=n>.08;if(state.moving){f/=Math.max(1,n);r/=Math.max(1,n);let dx=Math.cos(state.yaw)*r-Math.sin(state.yaw)*f,dz=-Math.sin(state.yaw)*r-Math.cos(state.yaw)*f;let nx=clamp(state.x+dx*dt*7.2,-13,13),nz=clamp(state.z+dz*dt*7.2,-109,23);state.x=nx;state.z=nz;state.facing=Math.atan2(dx,-dz)}
$('meters').textContent=`${Math.round(Math.hypot(state.x,state.z-9))}m`;
if(messageUntil&&time>messageUntil){talk.classList.add('hidden');messageUntil=0}
seconds+=dt}
render(time);requestAnimationFrame(tick)}
window.addEventListener('resize',()=>{});
// Read-only observability for Playwright; no programmatic mission or player-state overrides.
window.__gameDebug=()=>({started:state.started,x:state.x,z:state.z,quest:state.quest,frames:state.frames,webgl:state.webgl,lastInteraction:state.lastInteraction,objects:staticObjects.length});
requestAnimationFrame(tick);
