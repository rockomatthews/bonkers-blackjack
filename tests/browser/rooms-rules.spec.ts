import {test,expect} from '@playwright/test';
import {RULES} from '../../shared/game';

test('all three rooms use supplied art; seven hands align and full-screen controls fit',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await page.getByRole('button',{name:'Join the club'}).click();
 await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Let’s play'}).click();
 await expect(page).toHaveURL(/#lobby/);
 const identity=await page.evaluate(()=>JSON.parse(localStorage.getItem('bonkers-demo-identity')!));
 const res=await page.request.get('/api/v1/account',{headers:{Authorization:'Bearer '+identity.token}});
 const account=await res.json();
 let insurance=false;
 let handCount=1;
 let allowed=['hit','stand','double','split','surrender'];
 const commands:string[]=[];
 await page.route('**/api/v1/commands',async route=>{
  const body=route.request().postDataJSON();commands.push(body.command.kind);
  await route.fulfill({json:{account}});
 });
 await page.route('**/api/v1/tables/*',async route=>{
  const id=route.request().url().split('/').at(-1)!;
  const players=Array.from({length:7},(_,i)=>({id:i===0?account.id:'fixture-'+i,name:i===0?account.name:'Player '+(i+1),hands:Array.from({length:i===0?handCount:1},()=>({cards:[7,20],bet:1000,status:'playing',split:handCount>1,splitAces:false})),committed:1000,payout:0}));
  await route.fulfill({json:{account,table:{id,name:id,subtitle:'Deterministic UI test',theme:'red',private:false,sequence:1,commitment:'test',feePolicy:'test',deadline:Date.now()+60000,betDeadline:null,betNotice:null,seats:players.map(p=>({id:p.id,name:p.name,avatar:'cosmic',avatarId:null,connected:true,bet:1000,fee:2,chips:[],stagedBet:0})),round:{id:'fixture',rules:RULES,dealer:[insurance?0:9,-1],players,phase:'playing',current:[0,0],insurancePending:insurance},allowed:insurance?['insurance','decline-insurance','stand']:allowed,spectators:0,receiptIds:[],reaction:null,serverTime:Date.now()}}});
 });
 for(const room of ['bonkers-room','midnight-lounge','high-society']) {
  await page.goto('/#table/'+room);
  await expect(page.locator('.seat-hands .player-hand')).toHaveCount(7);
  const src=await page.locator('.room-backdrop').getAttribute('src');
  expect(decodeURIComponent(src!)).toContain(room==='bonkers-room'?'/pokerRoom.png':room==='midnight-lounge'?'/rooms/nightclub.png':'/rooms/carnival.png');
  for(const size of [{width:1440,height:900},{width:1280,height:650},{width:390,height:844},{width:844,height:390}]) {
   await page.setViewportSize(size);
   await expect(page.getByRole('button',{name:'Double down',exact:true})).toBeEnabled();
   await expect(page.getByRole('button',{name:'Split',exact:true})).toBeEnabled();
   const bounds=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,vw:innerWidth,vh:innerHeight,cards:[...document.querySelectorAll('.seat-hands')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}}),dock:document.querySelector('.room-dock')!.getBoundingClientRect().toJSON()}));
   expect(bounds.w).toBeLessThanOrEqual(bounds.vw);expect(bounds.h).toBeLessThanOrEqual(bounds.vh);
   for(const card of bounds.cards){expect(card.x).toBeGreaterThanOrEqual(0);expect(card.right).toBeLessThanOrEqual(bounds.vw);expect(card.y).toBeGreaterThanOrEqual(0);expect(card.bottom).toBeLessThan(bounds.dock.y);}
   await page.locator('.room-backdrop').evaluate((el: HTMLImageElement)=>el.decode());
   await page.screenshot({path:`docs/screenshots/${room}-${size.width}x${size.height}-rules.png`});
  }
 }
 await page.setViewportSize({width:1440,height:900});
 await page.getByRole('button',{name:'Double down',exact:true}).click();
 await expect.poll(()=>commands.at(-1)).toBe('double');
 await page.getByRole('button',{name:'Split',exact:true}).click();
 await expect.poll(()=>commands.at(-1)).toBe('split');
 handCount=4;
 await expect(page.locator('.seat-0 .player-hand')).toHaveCount(4);
 for(const size of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]) {
  await page.setViewportSize(size);
  const box=await page.locator('.seat-0 .seat-hands').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(size.width);
  await page.screenshot({path:`docs/screenshots/four-split-hands-${size.width}.png`});
 }
 handCount=1;
 await page.setViewportSize({width:1440,height:900});
 insurance=true;
 await expect(page.getByRole('button',{name:'Insure $5.00',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Insure $5.00',exact:true}).click();
 await expect.poll(()=>commands.at(-1)).toBe('insurance');
 await page.getByRole('button',{name:'No insurance',exact:true}).click();
 await expect.poll(()=>commands.at(-1)).toBe('decline-insurance');
 insurance=false;allowed=['hit','stand'];
 await expect(page.getByRole('button',{name:'Double down',exact:true})).toBeDisabled();
 expect(errors).toEqual([]);
});
