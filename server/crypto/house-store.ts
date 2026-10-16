import {Pool} from 'pg';
import {postgresConfig} from '../postgres';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {Address,Hex} from 'viem';
import type {HouseDeployment} from '../../shared/crypto/house';
export type SavedRound={id:Hex;owner:Address;encryptedSeed:string;commitment:Hex;created:number;block:string;closed?:boolean};
export type SavedCoin=SavedRound&{stake:string;count:1|11|21};
export type HouseData={coins?:Record<string,SavedCoin>;coinHistory?:Record<string,SavedCoin[]>;deployment?:HouseDeployment;rounds:Record<string,SavedRound>;challenges:Record<string,{owner:Address;expires:number}>};
const g=globalThis as unknown as {housePool?:Pool;houseQueue?:Promise<unknown>;houseInit?:Promise<unknown>};
export function houseStoreAvailable(){return !!(process.env.BONKERS_DEALER_DATABASE_URL||process.env.POSTGRES_URL||process.env.DATABASE_URL||(!process.env.VERCEL&&process.env.BONKERS_LOCAL_STORE==='1'));}
export async function houseTransaction<T>(fn:(s:HouseData)=>Promise<T>|T):Promise<T>{
 const url=process.env.BONKERS_DEALER_DATABASE_URL||process.env.POSTGRES_URL||process.env.DATABASE_URL;
 if(url){
  g.housePool??=new Pool({...postgresConfig(url),max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:10000});
  g.houseInit??=g.housePool.query('select id from bonkers_dealer.state where id=1').catch(e=>{g.houseInit=undefined;throw e;});await g.houseInit;
  const client=await g.housePool.connect();try{await client.query('begin');await client.query("set local lock_timeout='5s'");const result=await client.query('select data from bonkers_dealer.state where id=1 for update');const state=result.rows[0].data as HouseData;const value=await fn(state);await client.query('update bonkers_dealer.state set data=$1 where id=1',[JSON.stringify(state)]);await client.query('commit');return value;}catch(e){await client.query('rollback');throw e;}finally{client.release();}
 }
 if(process.env.VERCEL||process.env.BONKERS_LOCAL_STORE!=='1')throw Error('Dealer storage is not configured. Deposits remain closed.');
 const task=(g.houseQueue??Promise.resolve()).then(async()=>{const dir=resolve(/* turbopackIgnore: true */process.env.BONKERS_LOCAL_DIR??'.data/shared-house');await mkdir(dir,{recursive:true});const file=resolve(dir,'state.json');let state:HouseData;try{state=JSON.parse(await readFile(/* turbopackIgnore: true */file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;state={rounds:{},challenges:{}};}const value=await fn(state);await writeFile(/* turbopackIgnore: true */file+'.tmp',JSON.stringify(state),{mode:0o600});await rename(/* turbopackIgnore: true */file+'.tmp',/* turbopackIgnore: true */file);return value;});g.houseQueue=task.catch(()=>{});return task;
}
