import {Pool} from 'pg';
import {postgresConfig} from './postgres';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
const g=globalThis as unknown as {communityPool?:Pool;communityInit?:Promise<unknown>;communityQueue?:Promise<unknown>};
// Separate rows and locks: chat never holds the blackjack dealer's state lock.
export async function communityTransaction<T,R>(id:string,initial:()=>T,job:(state:T)=>R|Promise<R>):Promise<R>{
 if(!/^[a-z-]{1,40}$/.test(id))throw Error('Invalid community record');
 const url=process.env.BONKERS_DEALER_DATABASE_URL||process.env.POSTGRES_URL||process.env.DATABASE_URL;
 if(url){g.communityPool??=new Pool({...postgresConfig(url),max:3,connectionTimeoutMillis:8000,idleTimeoutMillis:10000});
  g.communityInit??=g.communityPool.query('select id from bonkers_dealer.community limit 0').catch(e=>{g.communityInit=undefined;throw e;});await g.communityInit;
  const c=await g.communityPool.connect();try{await c.query('begin');await c.query("set local lock_timeout='3s'");await c.query('insert into bonkers_dealer.community(id,data) values($1,$2) on conflict do nothing',[id,JSON.stringify(initial())]);const r=await c.query('select data from bonkers_dealer.community where id=$1 for update',[id]);const state=r.rows[0].data as T,value=await job(state);await c.query('update bonkers_dealer.community set data=$2 where id=$1',[id,JSON.stringify(state)]);await c.query('commit');return value;}catch(e){await c.query('rollback');throw e;}finally{c.release();}
 }
 if(process.env.VERCEL||process.env.BONKERS_LOCAL_STORE!=='1')throw Error('Community storage unavailable');
 const task=(g.communityQueue??Promise.resolve()).then(async()=>{const dir=resolve(process.env.BONKERS_LOCAL_DIR??'.data/shared-house','community');await mkdir(dir,{recursive:true});const file=resolve(dir,id+'.json');let state:T;try{state=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;state=initial();}const value=await job(state);await writeFile(file+'.tmp',JSON.stringify(state),{mode:0o600});await rename(file+'.tmp',file);return value;});g.communityQueue=task.catch(()=>{});return task;
}
export async function communityRead<T>(id:string,initial:()=>T):Promise<T>{
 if(!/^[a-z-]{1,40}$/.test(id))throw Error('Invalid community record');const url=process.env.BONKERS_DEALER_DATABASE_URL||process.env.POSTGRES_URL||process.env.DATABASE_URL;
 if(url){g.communityPool??=new Pool({...postgresConfig(url),max:3,connectionTimeoutMillis:8000,idleTimeoutMillis:10000});const r=await g.communityPool.query('select data from bonkers_dealer.community where id=$1',[id]);return (r.rows[0]?.data as T)??initial();}
 if(process.env.VERCEL||process.env.BONKERS_LOCAL_STORE!=='1')throw Error('Community storage unavailable');try{return JSON.parse(await readFile(resolve(process.env.BONKERS_LOCAL_DIR??'.data/shared-house','community',id+'.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;return initial();}
}
