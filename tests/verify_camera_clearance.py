#!/usr/bin/env python3
"""Camera clipping sweep over the shipped camera code (cameraGoal -> visibleCamera).

For every reachable player state on a grid (walking at ground level, flying at several
heights, six camera yaws) the camera eye must not sit inside drawn building geometry, and a
flying player must not be able to stand inside a building volume.

The drawn geometry is recorded by rebuilding the city from the same RNG seed; the rebuild is
checked against the live collision volumes so the sweep cannot drift from what is on screen.
Thin decor (trees, lamps, spires, orbs) is reported but not asserted. Emulated Chromium only.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import os

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'src/styles.css').read_text(encoding='utf-8')
js = (ROOT / 'src/game.js').read_text(encoding='utf-8')
SEED = 'const rnd=rand32(215191);'
assert SEED in js, 'City RNG seed line changed; update the sweep'
js = js.replace(SEED, 'let rnd=rand32(215191);')  # sweep-only: lets the probe rebuild the same city
# Mirror the movement code's reachability rule: does flight bypass building collision?
SKY_BYPASS = 'player.sky||!worldBlocksPlayer' in js
page_html = html.replace('<link rel="stylesheet" href="./src/styles.css">', '<style>' + css + '</style>').replace(
    '<script type="module" src="./src/game.js"></script>', '<script>' + js + '</script>')

SWEEP = r"""(SKY_BYPASS) => {
 const boxes=[]; let tag='city';
 const P=Mesh.prototype, ob=P.box, op=P.pyramid, oo=P.orb;
 P.box=function(x,y,z,w,h,d,...r){boxes.push({tag,b:[x-w/2,y,z-d/2,x+w/2,y+h,z+d/2]});return ob.call(this,x,y,z,w,h,d,...r);};
 P.pyramid=function(x,y,z,w,h,...r){boxes.push({tag:tag+':pyramid',b:[x-w/2,y,z-w/2,x+w/2,y+h,z+w/2]});return op.call(this,x,y,z,w,h,...r);};
 P.orb=function(x,y,z,r,...rest){boxes.push({tag:tag+':orb',decor:true,b:[x-r,y-r,z-r,x+r,y+r,z+r]});return oo.call(this,x,y,z,r,...rest);};
 const wrap=(name)=>{const f=window[name];window[name]=function(...a){const prev=tag;tag=name;try{return f.apply(this,a);}finally{tag=prev;}};};
 ['building','tree','streetlamp','cityHall','market','bridge','park'].forEach(wrap);
 const live=cameraSolids.slice(); cameraSolids.length=0; rnd=rand32(215191); captureCameraSolids=true;
 makeCity(); captureCameraSolids=false; P.box=ob;P.pyramid=op;P.orb=oo;
 const same=live.length===cameraSolids.length&&live.every((w,i)=>w.every((v,j)=>Math.abs(v-cameraSolids[i][j])<1e-9));
 cameraSolids.length=0; live.forEach(w=>cameraSolids.push(w));
 // Building-scale volumes: at least 1 unit thick and tall, raised above the street.
 const vol=boxes.filter(o=>o.b[4]-o.b[1]>.3||o.b[1]>.3);
 const isDecor=o=>o.decor||o.tag==='tree'||o.tag==='streetlamp'||Math.min(o.b[3]-o.b[0],o.b[5]-o.b[2])<1||o.b[4]-o.b[1]<1;
 const near=.1;
 const hitAt=p=>vol.find(o=>p[0]>o.b[0]-near&&p[0]<o.b[3]+near&&p[1]>o.b[1]-near&&p[1]<o.b[4]+near&&p[2]>o.b[2]-near&&p[2]<o.b[5]+near);
 const save={x:player.x,y:player.y,z:player.z,sky:player.sky,yaw:cameraYaw,pitch:cameraPitch,orbit:cameraOrbitOffset};
 const r={rebuiltMatchesLive:same,states:0,buildingClips:0,decorClips:0,flyingInsideBuilding:0,byTag:{},examples:[]};
 for(const mode of ['walk','fly'])
 for(const y of (mode==='walk'?[0]:[3,6,10,16,24]))
 for(let x=-69;x<=69;x+=3) for(let z=-69;z<=69;z+=3){
   if(mode==='walk'?worldBlocksPlayer(x,z,0):(!SKY_BYPASS&&worldBlocksPlayer(x,z,y)))continue;  // unreachable
   player.x=x;player.y=y;player.z=z;player.sky=mode==='fly';
   const body=vol.find(o=>!isDecor(o)&&x>o.b[0]&&x<o.b[3]&&z>o.b[2]&&z<o.b[5]&&y+.5>o.b[1]&&y+.5<o.b[4]);
   if(mode==='fly'&&body){r.flyingInsideBuilding++;if(r.examples.length<8)r.examples.push({kind:'player-inside',x,y,z,tag:body.tag});continue;}
   for(let k=0;k<6;k++){
     cameraYaw=k*Math.PI/3;cameraPitch=.28;cameraOrbitOffset=0;r.states++;
     const dist=player.sky?15:12,rise=player.sky?6.5:5.9;
     const aim=[x,y+(player.sky?2.1:1.65),z];
     const eye=visibleCamera(aim,cameraGoal(aim,dist,rise));
     const hit=hitAt(eye); if(!hit)continue;
     const key=(isDecor(hit)?'decor ':'BUILDING ')+hit.tag; r.byTag[key]=(r.byTag[key]||0)+1;
     if(isDecor(hit))r.decorClips++;else{r.buildingClips++;if(r.examples.length<8)r.examples.push({kind:'eye-inside',mode,x,y,z,yaw:+cameraYaw.toFixed(2),eye:eye.map(v=>+v.toFixed(2)),tag:hit.tag});}
   }
 }
 Object.assign(player,{x:save.x,y:save.y,z:save.z,sky:save.sky});cameraYaw=save.yaw;cameraPitch=save.pitch;cameraOrbitOffset=save.orbit;
 return r;
}"""

with sync_playwright() as p:
    chromium = os.getenv('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    launch_options = {'headless': True}
    if chromium:
        launch_options['executable_path'] = chromium
    browser = p.chromium.launch(**launch_options)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(page_html, wait_until='domcontentloaded')
    page.wait_for_function('window.__imInYoCityDebug && window.__imInYoCityDebug().frames > 3', timeout=10000)
    result = page.evaluate(SWEEP, SKY_BYPASS)
    browser.close()

result['skyBypassesCollision'] = SKY_BYPASS
print(json.dumps(result, indent=1))
assert not errors, f'JavaScript exceptions: {errors}'
assert result['rebuiltMatchesLive'], 'Sweep rebuilt a different city than the live one'
assert result['states'] > 10000, f"Sweep too small: {result['states']} states"
assert result['flyingInsideBuilding'] == 0, f"Flying player can occupy building volumes: {result['examples']}"
assert result['buildingClips'] == 0, f"Camera eye inside building geometry: {result['examples']}"
print('PASS camera clearance sweep (decor clips reported, not asserted:', result['decorClips'], ')')
