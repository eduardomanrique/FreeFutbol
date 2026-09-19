import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const url=process.env.DEPLOY_URL || 'http://127.0.0.1:5180/futebol/';
const browser=await chromium.launch({headless:false,args:['--use-angle=metal']});
try{
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
await page.addInitScript(()=>Object.defineProperty(navigator,'getGamepads',{value:()=>[]}));
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
await page.goto(url);await page.waitForFunction(()=>window.render_game_to_text,{timeout:60000});
await page.click('#start-btn');await page.keyboard.down('ArrowRight');await page.waitForTimeout(800);await page.keyboard.up('ArrowRight');
const state=await page.evaluate(()=>JSON.parse(window.render_game_to_text()));
assert.equal(state.mode,'playing');assert.equal(state.physics.engine,'Rapier');assert.equal(state.graphics.athletes,'skinned');assert.equal(state.physics.capsules,22);assert.ok(state.animation.searches>0);assert.deepEqual(errors,[]);
fs.mkdirSync('output/deploy',{recursive:true});await page.screenshot({path:'output/deploy/site.png'});
console.log(JSON.stringify({url,result:'passed',errors,physics:state.physics,graphics:state.graphics}));
}finally{await browser.close();}
