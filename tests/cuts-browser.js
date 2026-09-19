import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('output/cuts',{recursive:true});
const browser=await chromium.launch({headless:false,args:['--use-angle=metal']});
try {
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>Object.defineProperty(navigator,'getGamepads',{value:()=>[]}));
 await page.goto('http://localhost:5173/?test');await page.waitForFunction(()=>window.__test);await page.click('#start-btn');
 await page.evaluate(async()=>{window.gait=await import('/src/locomotion.js');const {match:m,stadium:s}=window.__test;m.mode='paused';s.savedRender=s.render;s.render=()=>{};});
 const results=[];
 for(const name of ['cut90','reverse']){
  const result=await page.evaluate(name=>{
   const {match:m,stadium:s}=window.__test;m.start(360,'normal',true);
   m.players.forEach(q=>{if(q.id!==9){q.keeper=true;q.x=q.team===0?-43:43;q.z=-25+(q.id%11)*4.5;window.gait.initLocomotion(q);}});
   const p=m.players[9];p.x=-22;p.z=0;window.gait.initLocomotion(p);
   Object.assign(m.ball,{owner:9,x:-21.6,z:0,vx:0,vz:0,vy:0});
   for(let i=0;i<240;i++)m.update(1/120,{x:1,sprint:true});
   const initialHeading=p.locomotion.heading;
   const input=name==='reverse'?{x:-1,sprint:true}:{z:1,sprint:true};
   for(let i=0;i<36;i++)m.update(1/120,input);
   m.mode='paused';s.savedRender(m,0);s.camera.position.set(p.x+3.4,2.2,p.z+4.8);s.camera.lookAt(p.x+.4,.8,p.z);s.renderer.render(s.scene,s.camera);
   return {name,cut:p.locomotion.cutBlend,height:p.locomotion.height,yaw:Math.abs(Math.atan2(Math.sin(p.locomotion.heading-initialHeading),Math.cos(p.locomotion.heading-initialHeading))),touch:m.lastTouch,impulse:p.lastDribble,lean:p.locomotion.leanX,launch:p.sprintLaunch,state:JSON.parse(window.render_game_to_text())};
  },name);
  assert.ok(result.cut>.1);assert.ok(result.height<1.07);assert.ok(result.yaw>.15);
  await page.screenshot({path:`output/cuts/${name}.png`});results.push(result);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync('output/cuts/results.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({passed:true,errors}));
} finally {await browser.close();}
