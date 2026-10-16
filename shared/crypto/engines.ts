import * as original from './replay-v1';
import * as current from './replay';
/** Old deployments/receipts retain their original rules and byte encoding. */
export function replayEngine(version:number){
 if(version===1)return original;
 if(version===2)return current;
 throw Error('Unsupported on-chain blackjack rules version');
}
