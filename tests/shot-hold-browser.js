import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';
fs.mkdirSync('output/shot-hold',{recursive:true});const browser=await chromium.launch({headless:false,args:['--use-angle=metal']});
try{
 const page=await browser.newPage({viewport:{width:1100,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5173/?test');await page.waitForFunction(()=>window.__test);await page.click('#start-btn');
 const held=await page.evaluate(async()=>{
 const {match:m,stadium:s}=window.__test,{initLocomotion}=await import('/src/locomotion.js');const update=m.update.bind(m),render=s.render.bind(s);m.update=()=>{};s.render=()=>{};m.start();
 const p=m.players[m.selected];p.id=0;p.x=-30;p.z=0;m.players=[p];m.selected=0;Object.assign(m.ball,{owner:0,x:-29.3,z:0});initLocomotion(p);
 for(let i=0;i<80;i++)update(1/120,{x:1,sprint:true});m.beginAction('shoot',{x:1,sprint:true});
 for(let i=0;i<240;i++)update(1/120,{x:1,sprint:true});
 const draw=()=>{render(m,.016);s.camera.position.set(p.x+4,2.6,5);s.camera.lookAt(p.x,.8,0);s.renderer.render(s.scene,s.camera);};draw();window.shotCheck={m,p,update,draw};
 return {speed:Math.hypot(p.vx,p.vz),stage:p.ballAction.stage,charge:m.charge,shot:m.lastShot,plant:p.strikePlant,animation:p.motion.action};
 });
 assert.ok(held.speed>8);assert.equal(held.stage,'charging');assert.equal(held.charge,1);assert.equal(held.shot,null);assert.ok(!held.plant);assert.notEqual(held.animation,'windup');await page.screenshot({path:'output/shot-hold/holding.png'});
 const release=await page.evaluate(()=>{const {m,p,update,draw}=window.shotCheck;m.releaseAction(1);for(let i=0;i<120&&!p.strikePlant&&!m.lastShot;i++)update(1/120,{});draw();return {stage:p.ballAction?.stage,plant:p.strikePlant};});
 assert.ok(release.plant);await page.screenshot({path:'output/shot-hold/released-step.png'});
 const shot=await page.evaluate(()=>{const {m,update,draw}=window.shotCheck;for(let i=0;i<360&&!m.lastShot;i++)update(1/120,{});draw();return m.lastShot;});assert.ok(shot);assert.ok(!shot.overcharged);await page.screenshot({path:'output/shot-hold/contact.png'});
 assert.deepEqual(errors,[]);fs.writeFileSync('output/shot-hold/results.json',JSON.stringify({held,release,shot,errors},null,2));console.log('Held sprint remains locomotion; release plants and strikes successfully.');
}finally{await browser.close();}
