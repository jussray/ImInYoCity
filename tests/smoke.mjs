// Fast, dependency-free simulation/render-path smoke. Not a substitute for real Chromium/WebGL.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const elements = new Map(), globals = new Map();
function eventTarget(name){
  const listeners = new Map();
  const el = {hidden:false,style:{},textContent:'',width:0,height:0,clientWidth:900,clientHeight:600,
    listeners, classList:{add(){},remove(){}},querySelector(){return {textContent:''};},
    setAttribute(){}, setPointerCapture(){},
    getBoundingClientRect(){return {x:20,y:20,left:20,top:20,width:125,height:125};},
    addEventListener(ev,fn){listeners.set(ev,fn);},fire(ev,data={}){const f=listeners.get(ev);assert.ok(f,'no handler '+name+'.'+ev);return f({preventDefault(){},isTrusted:false,pointerId:3,clientX:40,clientY:40,...data});}}
  ;return el;
}
for(const name of ['city','start','intro','hud','controls','compass','sound','hop','run','joystick','stick','toast','objective','distance','heading','fallback'])elements.set(name,eventTarget(name));
let draws=0;const gl=new Proxy({
  VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,DEPTH_TEST:7,LEQUAL:8,CULL_FACE:9,COLOR_BUFFER_BIT:10,DEPTH_BUFFER_BIT:11,FLOAT:12,TRIANGLES:13,
  createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,
  getAttribLocation:()=>1,getUniformLocation:()=>({}),drawArrays:(_,__,count)=>{assert.ok(count>0);draws++;}
},{get(obj,key){return key in obj?obj[key]:(()=>undefined);}});
elements.get('city').getContext=()=>gl;
let raf=null;
const root={
  document:{getElementById(id){assert.ok(elements.has(id),id);return elements.get(id);}},
  window:{},devicePixelRatio:1,requestAnimationFrame(fn){raf=fn;},
  addEventListener(name,fn){globals.set(name,fn);},
  setTimeout:()=>1,clearTimeout:()=>{},console,Math,PointerEvent:class{}
};
vm.createContext(root);
vm.runInContext(readFileSync(new URL('../game.js',import.meta.url),'utf8'),root,{filename:'game.js'});
assert.equal(root.window.__iminyocity().renderer,'WebGL');
assert.ok(raf,'animation callback exists');
raf(0);assert.ok(draws>0,'world not drawn');
elements.get('start').fire('click');
assert.equal(root.window.__iminyocity().running,true);
const before=root.window.__iminyocity();
globals.get('keydown')({key:'w',preventDefault(){}});
for(let i=1;i<=20;i++)raf(i*16.6);
globals.get('keyup')({key:'w'});
const after=root.window.__iminyocity();
assert.notEqual(after.z,before.z,'WASD did not move player');
const joy=elements.get('joystick');
joy.fire('pointerdown',{clientX:82.5,clientY:82.5});
joy.fire('pointermove',{clientX:124,clientY:82.5});
const beforeJoy=root.window.__iminyocity();
for(let i=21;i<=40;i++)raf(i*16.6);
joy.fire('pointerup');
const afterJoy=root.window.__iminyocity();
assert.notEqual(afterJoy.x,beforeJoy.x,'joystick did not move player');
assert.ok(draws>80,'no sustained renderer draw');
console.log(JSON.stringify({status:'PASS',renderPathDrawCalls:draws,before,after,afterJoy,scope:'simulated DOM/WebGL only'}));
