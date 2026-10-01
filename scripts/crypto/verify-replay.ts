import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,keccak256,toHex,parseAbi,type Hex} from 'viem';
import assert from 'node:assert/strict';
import {gameAbi} from '../../shared/crypto/game-abi';
import {shuffle,initial,step,observation,payouts,legalMoves,total} from '../../shared/crypto/replay';
const c=JSON.parse(await readFile('.data/crypto-lab/config.json','utf8'));
assert.equal(c.rpc,'http://127.0.0.1:8547');const client=createPublicClient({transport:http(c.rpc)});assert.equal(await client.getChainId(),31337);
const verifier=await client.readContract({address:c.game,abi:gameAbi,functionName:'verifier'});
const abi=parseAbi(['function verify(bytes32 seed,bytes32 entropy,uint128[] stakes,(uint8 seat,uint8 move)[] actions,bytes32[] observations,uint128[] added) pure returns(uint128[])']);
let splits=0,doubles=0,hits=0,hands=0;
for(let i=0;i<40;i++){
 const seed=keccak256(toHex(`seed-${i}`)),entropy=keccak256(toHex(`entropy-${i}`)),deck=shuffle(seed,entropy),s=initial(deck,7),actions:{seat:number;move:number}[]=[],obs:Hex[]=[],added=Array<bigint>(7).fill(0n),stakes=Array<bigint>(7).fill(5000000n);
 while(!s.done){obs.push(keccak256(observation(s)));const legal=legalMoves(s);let move=2;
  if(legal.includes(4)){move=4;splits++;}else if(legal.includes(3)&&i%2===0){move=3;doubles++;}else if(total(s.seats[s.active].hands[s.seats[s.active].active].cards)<17){move=1;hits++;}
  const action={seat:s.active,move};actions.push(action);added[action.seat]+=BigInt(step(s,deck,action))*stakes[action.seat];
 }
 obs.push(keccak256(observation(s)));const actual=await client.readContract({address:verifier,abi,functionName:'verify',args:[seed,entropy,stakes,actions,obs,added]});assert.deepEqual(actual,payouts(s,stakes));hands+=s.seats.reduce((n,p)=>n+p.hands.length,0);
}
assert(splits>0&&doubles>0&&hits>0);const result={execution:'Read-only Solidity calls on LOCAL Base fork',rounds:40,seats:280,hands,splits,doubles,hits,exactPayoutMatches:true};await writeFile('docs/crypto/evidence/differential-replay.json',JSON.stringify(result,null,2));console.log(result);
