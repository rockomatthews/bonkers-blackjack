import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {service} from '../server/service';
import {emptyStore} from '../server/database';
import {canonical} from '../shared/protocol';
import {normalizeAvatar} from '../server/avatars';
import type {Store} from '../server/store';
async function player(data:Store, save?:Parameters<typeof service>[1]) {
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const login=await service(data,save).login({name:'Ignored signup override',publicKey:await crypto.subtle.exportKey('jwk',keys.publicKey)});
  const account=data.accounts[login.account.id];
  const envelope=async(kind:string,payload:Record<string,unknown>)=>{
    const command={id:crypto.randomUUID(),nonce:account.nonce,tableId:'bonkers-room',kind,payload};
    return {command,signature:Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,new TextEncoder().encode(canonical(command)))).toString('base64')};
  };
  const send=async(kind:string,payload:Record<string,unknown>)=>service(data,save).command(account,await envelope(kind,payload));
  return {account,send,envelope};
}

test('signup assigns unique fun names and ignores supplied custom names',async()=>{
  const data=emptyStore();
  const users=await Promise.all(Array.from({length:20},()=>player(data)));
  assert.equal(new Set(users.map(p=>p.account.name.toLowerCase())).size,20);
  for(const p of users){assert.match(p.account.name,/^[A-Za-z]+_[a-f0-9]{6}$/);assert.equal(p.account.nameChanged,false);}
});

test('name availability is normalized, failed claims do not spend the single rename, and successful names are permanent',async()=>{
  const data=emptyStore(), a=await player(data), b=await player(data);
  await a.send('claim-name',{name:'  Lunar   Goose  '});
  assert.equal(a.account.name,'Lunar Goose');assert.equal(a.account.nameChanged,true);
  assert.equal(service(data).nameAvailability('lunar goose',b.account.id).available,false);
  await assert.rejects(()=>b.send('claim-name',{name:'LUNAR GOOSE'}),/already taken/);
  await assert.rejects(()=>b.send('claim-name',{name:'<script>alert(1)</script>'}),/letters/);
  assert.equal(b.account.nameChanged,false);assert.equal(b.account.nonce,0);
  await b.send('claim-name',{name:'DiscoPickle'});
  await assert.rejects(()=>a.send('claim-name',{name:'New Name'}),/already been used/);
  await assert.rejects(()=>a.send('claim-name',{name:'Lunar Goose'}),/already been used/);
  await a.send('set-avatar',{avatar:'octopus'});
  assert.equal(a.account.name,'Lunar Goose');assert.equal(a.account.avatar,'octopus');
});

test('simultaneous claims cannot take the same normalized username',async()=>{
  const data=emptyStore(), a=await player(data), b=await player(data);
  const results=await Promise.allSettled([a.send('claim-name',{name:'Cosmic Pickle'}),b.send('claim-name',{name:'cosmic pickle'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(Object.values(data.accounts).filter(a=>a.nameChanged).length,1);
});

test('profile claims require the owner signature and cannot be replayed; public profiles contain no financial or authentication data',async()=>{
  const data=emptyStore(), a=await player(data), b=await player(data);
  const signed=await a.envelope('claim-name',{name:'Space Noodle',id:b.account.id});
  await assert.rejects(()=>service(data).command(b.account,signed),/signature/);
  await service(data).command(a.account,signed);
  await assert.rejects(()=>service(data).command(a.account,signed),/Stale/);
  assert.notEqual(b.account.name,'Space Noodle');
  assert.deepEqual(Object.keys(service(data).profile(a.account.id)).sort(),['avatar','avatarId','id','name','nameChanged']);
  const persisted=JSON.parse(JSON.stringify(data));
  const restored=service(persisted);
  const again=await a.envelope('claim-name',{name:'Another Name'});
  await assert.rejects(()=>restored.command(persisted.accounts[a.account.id],again),/already been used/);
});

test('legacy accounts keep their existing name and get one rename opportunity',async()=>{
  const data=emptyStore(), a=await player(data);delete a.account.nameChanged;delete a.account.avatar;
  a.account.name='Old Member';
  assert.equal(service(data).profile(a.account.id).name,'Old Member');
  assert.equal(service(data).accountView(a.account).nameChanged,false);
  await a.send('claim-name',{name:'New Member'});assert.equal(a.account.nameChanged,true);
});

test('uploads are re-encoded and stored outside game state; presets remain editable after a name claim',async()=>{
  const data=emptyStore();let saved:Buffer|undefined;let owner='';let imageId='';
  const a=await player(data,async(ownerId,id,bytes)=>{owner=ownerId;imageId=id;saved=bytes;});
  const png=await sharp({create:{width:40,height:70,channels:3,background:'#8844aa'}}).png().toBuffer();
  await a.send('claim-name',{name:'Avatar Goblin'});
  await a.send('upload-avatar',{image:'data:image/png;base64,'+png.toString('base64'),id:'someone-else'});
  assert.equal(owner,a.account.id);assert.equal(a.account.avatarId,imageId);
  const meta=await sharp(saved).metadata();assert.equal(meta.format,'webp');assert.equal(meta.width,160);assert.equal(meta.height,160);assert.equal(meta.exif,undefined);
  assert.equal(JSON.stringify(data).includes(png.toString('base64')),false);
  await a.send('set-avatar',{avatar:'alien'});assert.equal(a.account.avatarId,undefined);assert.equal(a.account.nameChanged,true);
  await assert.rejects(()=>a.send('set-avatar',{avatar:'https://bad.example/avatar'}),/Unknown avatar/);
});

test('malformed, markup, oversized and decompression-heavy uploads are rejected',async()=>{
  await assert.rejects(()=>normalizeAvatar('data:image/svg+xml;base64,PHN2Zz4='),/Choose/);
  await assert.rejects(()=>normalizeAvatar('data:image/png;base64,YWJj'),/Could not read/);
  await assert.rejects(()=>normalizeAvatar('data:image/png;base64,'+'a'.repeat(28000)),/Choose/);
  const huge=await sharp({create:{width:1001,height:1001,channels:3,background:'white'}}).png().toBuffer();
  await assert.rejects(()=>normalizeAvatar('data:image/png;base64,'+huge.toString('base64')),/Could not read/);
});
