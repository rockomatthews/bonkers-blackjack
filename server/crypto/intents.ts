import type {Pool} from 'pg';
import {createHash} from 'node:crypto';
import {units} from '../../shared/crypto/money';
import {assetNetwork} from '../../shared/crypto/assets';
import {transition,type IntentStatus,type IntentKind} from '../../shared/crypto/lifecycle';
/** Only construct with the isolated crypto database pool. Never updates demo balances. */
export class IntentRepository {
 constructor(private pool:Pool){}
 async create(input:{accountId:string;key:string;kind:IntentKind;route:string;amount:string;refundAddress?:string;destinationAddress?:string}){
  if(input.key.length<8||input.key.length>128)throw Error('Invalid idempotency key');
  assetNetwork(input.route);if(units(input.amount)<=0n)throw Error('Invalid amount');
  const hash=createHash('sha256').update(JSON.stringify([input.kind,input.route,input.amount,input.refundAddress??null,input.destinationAddress??null])).digest('hex');
  const db=await this.pool.connect();
  try {
   await db.query('BEGIN');
   const inserted=await db.query(`INSERT INTO crypto_private.intents(account_id,idempotency_key,request_hash,kind,route,amount,status,refund_address,destination_address)
    VALUES($1,$2,$3,$4,$5,$6,'quoted',$7,$8) ON CONFLICT(account_id,idempotency_key) DO NOTHING RETURNING *`,
    [input.accountId,input.key,hash,input.kind,input.route,input.amount,input.refundAddress??null,input.destinationAddress??null]);
   const row=inserted.rows[0]??(await db.query('SELECT * FROM crypto_private.intents WHERE account_id=$1 AND idempotency_key=$2',[input.accountId,input.key])).rows[0];
   if(!row||row.request_hash!==hash)throw Error('Idempotency key already used for a different request');
   await db.query('COMMIT');return row;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 async advance(id:string,expectedVersion:string,to:IntentStatus,evidence:Record<string,unknown>){
  const db=await this.pool.connect();
  try {
   await db.query('BEGIN');
   const row=(await db.query('SELECT status,version FROM crypto_private.intents WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!row||String(row.version)!==expectedVersion)throw Error('Stale intent version');
   transition(row.status,to);
   if(row.status!==to){
    await db.query('UPDATE crypto_private.intents SET status=$2,version=version+1,updated_at=now() WHERE id=$1',[id,to]);
    await db.query('INSERT INTO crypto_private.intent_events(intent_id,version,from_status,to_status,evidence) VALUES($1,$2,$3,$4,$5)',[id,(BigInt(expectedVersion)+1n).toString(),row.status,to,JSON.stringify(evidence)]);
   }
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
}
