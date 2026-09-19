import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';
fs.mkdirSync('output/training',{recursive:true});
const browser=await chromium.launch({headless:false,args:['--use-angle=metal']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>Object.defineProperty(navigator,'getGamepads',{value:()=>[]}));
 await page.goto('http://localhost:5173/?test');await page.waitForFunction(()=>window.__test);
 await page.selectOption('#game-mode','training');await page.screenshot({path:'output/training/menu.png'});await page.click('#start-btn');
 const before=await page.evaluate(()=>window.__test.match.players.filter(p=>p.team===1).map(p=>({id:p.id,x:p.x,z:p.z})));
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(1200);await page.keyboard.up('ArrowRight');
 const state=await page.evaluate(()=>JSON.parse(window.render_game_to_text()));assert.equal(state.training,true);
 for(const p of before){const q=state.players.find(q=>q.id===p.id);assert.ok(Math.hypot(p.x-q.x,p.z-q.z)<.015,`opponent ${p.id} moved`);}
 await page.screenshot({path:'output/training/arena.png'});
 await page.keyboard.press('Escape');await page.click('#restart');assert.equal(await page.evaluate(()=>window.__test.match.training),true);
 await page.keyboard.press('Escape');await page.click('#leave');await page.selectOption('#game-mode','match');await page.click('#start-btn');assert.equal(await page.evaluate(()=>window.__test.match.training),false);
 assert.deepEqual(errors,[]);fs.writeFileSync('output/training/state.json',JSON.stringify({state,errors},null,2));console.log(JSON.stringify({passed:true,opponents:before.length,errors}));
} finally {await browser.close();}
