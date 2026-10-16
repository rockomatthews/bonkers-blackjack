import {test,expect} from '@playwright/test';
import {decodeFunctionData,keccak256,toHex,type Hex} from 'viem';
import {gameAbi} from '../../shared/crypto/game-abi';
import {initial,observation,publicState,legalMoves} from '../../shared/crypto/replay';

test('wallet insurance and surrender send exact stakes, while old rules stay unavailable',async({page})=>{
 const owner='0x0000000000000000000000000000000000000111',game='0x0000000000000000000000000000000000000222',vault='0x0000000000000000000000000000000000000333',token='0x0000000000000000000000000000000000000444';
 const hash=keccak256(toHex('mock transaction')),rpc='http://127.0.0.1:18549';
 let available=100000000n;const deck=[9,0,8,5,...Array.from({length:308},(_,i)=>i)],state=initial(deck,1);
 let moves=legalMoves(state);
 await page.addInitScript(({owner,hash})=>{
  const w=window as unknown as {ethereum:unknown;sent:unknown[]};w.sent=[];
  w.ethereum={on(){},removeListener(){},async request({method,params}:{method:string;params:unknown[]}){if(method==='eth_chainId')return '0x7a69';if(method==='eth_requestAccounts'||method==='eth_accounts')return[owner];if(method.startsWith('wallet_'))return null;if(method==='eth_sendTransaction'){w.sent.push(params[0]);return hash;}throw Error('Unexpected wallet method: '+method);}};
 },{owner,hash});
 await page.route('**/api/crypto/lab',r=>r.fulfill({json:{config:{chainId:31337,rulesVersion:2,rpc,game,vault,token,operator:owner,player:owner,startBlock:'0',forkBlock:'0',createdAt:'fixture'},round:{id:hash,phase:3,deadline:String(Math.floor(Date.now()/1000)+600),commitment:hash,players:[owner],stakes:['5000000'],state:publicState(state),legalMoves:moves,observation:observation(state),workerUpdatedAt:Date.now()}}}));
 await page.route(rpc,async r=>{
  if(r.request().method()==='OPTIONS'){await r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type'}});return;}
  const body=r.request().postDataJSON();let result:unknown;
  if(body.method==='eth_chainId')result='0x7a69';
  else if(body.method==='eth_call')result=toHex(available,{size:32});
  else if(body.method==='eth_blockNumber')result='0x1';
  else if(body.method==='eth_getTransactionReceipt')result={blockHash:hash,blockNumber:'0x1',contractAddress:null,cumulativeGasUsed:'0x1',effectiveGasPrice:'0x1',from:owner,gasUsed:'0x1',logs:[],logsBloom:'0x'+'00'.repeat(256),status:'0x1',to:game,transactionHash:hash,transactionIndex:'0x0',type:'0x2'};
  else throw Error('Unexpected RPC method '+body.method);
  await r.fulfill({json:{jsonrpc:'2.0',id:body.id,result},headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/crypto-lab');await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
 await expect(page.getByRole('button',{name:'Insurance $2.50',exact:true})).toBeEnabled();
 available=2000000n;
 await expect(page.getByRole('button',{name:'Insurance $2.50',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'No insurance',exact:true})).toBeEnabled();
 available=100000000n;
 await expect(page.getByRole('button',{name:'Insurance $2.50',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Insurance $2.50',exact:true}).click();
 await expect(page.locator('.lab-status')).toContainText('Confirmed on your local fork');
 let sent=await page.evaluate(()=>(window as unknown as {sent:{data:Hex}[]}).sent);
 expect(decodeFunctionData({abi:gameAbi,data:sent.at(-1)!.data}).args).toEqual([hash,5,2500000n,keccak256(observation(state))]);
 state.insurance=false;moves=[1,2,3,7];
 await expect(page.getByRole('button',{name:'Surrender',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Surrender',exact:true}).click();
 await expect.poll(async()=>await page.evaluate(()=>(window as unknown as {sent:unknown[]}).sent.length)).toBe(2);
 sent=await page.evaluate(()=>(window as unknown as {sent:{data:Hex}[]}).sent);
 expect(decodeFunctionData({abi:gameAbi,data:sent.at(-1)!.data}).args).toEqual([hash,7,0n,keccak256(observation(state))]);
 moves=[1,2,3];
 await expect(page.getByRole('button',{name:'Surrender',exact:true})).toBeDisabled();
});
