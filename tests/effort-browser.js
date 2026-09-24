import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';
const browser=await chromium.launch({headless:false,args:['--use-angle=metal']});
try {
const page=await browser.newPage({viewport:{width:1100,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:5173/?test');await page.waitForFunction(()=>window.__test);await page.click('#start-btn');
const shot=await page.evaluate(async()=>{
const {match:m,stadium:s}=window.__test;const {initLocomotion}=await import('/src/locomotion.js');
const update=m.update.bind(m),render=s.render.bind(s);m.update=()=>{};s.render=()=>{};m.start();
const p=m.players[m.selected];p.id=0;p.x=-5;p.z=0;m.players=[p];m.selected=0;Object.assign(m.ball,{x:-4.4,z:0,owner:0,lastTeam:0});initLocomotion(p);
for(let i=0;i<70;i++)update(1/120,{x:1,sprint:true});m.beginAction('shoot',{x:1});m.releaseAction(.7);Object.assign(m.ball,{x:p.x+2.2,z:p.z,vx:8,vz:0,owner:null});
for(let i=0;i<360&&!m.lastShot;i++)update(1/120,{});
for(let i=0;i<28;i++)update(1/120,{});
render(m,.016);s.camera.position.set(p.x+3,2.1,p.z+4);s.camera.lookAt(p.x,.7,p.z);s.renderer.render(s.scene,s.camera);
return {shot:m.lastShot,recovery:p.recovery,fall:p.followStyle?.fall};
});assert.equal(shot.shot.style,'stretch-shot');assert.ok(shot.fall&&shot.recovery>0);assert.deepEqual(errors,[]);await page.screenshot({path:'output/bands-vegetation/falling-shot.png'});fs.writeFileSync('output/bands-vegetation/effort.json',JSON.stringify(shot,null,2));console.log('Loose touch followed through to falling shot; no page errors.');
}finally{await browser.close();}
