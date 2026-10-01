/** Starts a LOCAL Base mainnet fork. All signing is checked against Anvil chain 31337. */
import {openSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createPublicClient,createWalletClient,http,defineChain,erc20Abi,parseAbi,type Address} from 'viem';
import {BASE_USDC,address} from '../../shared/crypto/assets';
import {gameAbi} from '../../shared/crypto/game-abi';
import type {LabConfig} from '../../server/crypto/lab-types';
const player=address(process.env.CRYPTO_TEST_WALLET??'0x8A0182c099A618583e9EF98716DAcF739b3BD944');
const port=8547,rpc=`http://127.0.0.1:${port}`,dir=process.env.CRYPTO_LAB_DIR??'.data/crypto-lab';
const source=process.env.BASE_FORK_RPC_URL??'https://mainnet.base.org';
await mkdir(dir,{recursive:true});
// Refuse to erase an earlier lab. Pick a new directory explicitly for a fresh chain.
try{await access(`${dir}/config.json`);throw Error(`Lab already exists at ${dir}; use CRYPTO_LAB_DIR for a fresh run. Existing receipts are preserved.`);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
execFileSync('forge',['build'],{cwd:'contracts',stdio:'inherit'});
const children:ReturnType<typeof spawn>[]=[];
const stop=()=>{for(const child of children)child.kill('SIGTERM');};process.on('SIGINT',()=>{stop();process.exit(0);});process.on('SIGTERM',()=>{stop();process.exit(0);});
try{
 const anvil=spawn('anvil',['--host','127.0.0.1','--port',String(port),'--chain-id','31337','--block-time','1','--fork-url',source,'--silent'],{stdio:['ignore',openSync(`${dir}/anvil.log`,'a'),openSync(`${dir}/anvil-error.log`,'a')]});children.push(anvil);
 const chain=defineChain({id:31337,name:'Bonkers local Base fork',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[rpc]}}});
 const client=createPublicClient({chain,transport:http(rpc,{retryCount:0,timeout:5000})});
 for(let i=0;;i++){try{await client.getBlockNumber();break;}catch{if(i>=40)throw Error('Local fork did not start');await new Promise(r=>setTimeout(r,500));}}
 if(await client.getChainId()!==31337||!(await client.request({method:'web3_clientVersion'})).toLowerCase().includes('anvil'))throw Error('Refusing to transact outside local Anvil');
 const forkBlock=await client.getBlockNumber();
 const wallet=createWalletClient({chain,transport:http(rpc)}),[operator]=await wallet.getAddresses();
 async function wait(hash:`0x${string}`){const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw Error('Local transaction failed');return receipt;}
 const artifact=JSON.parse(await readFile('contracts/out/BlackjackGame.sol/BlackjackGame.json','utf8'));
 const deployed=await wait(await wallet.deployContract({account:operator,abi:artifact.abi,bytecode:artifact.bytecode.object,args:[BASE_USDC,operator,operator]}));
 const game=deployed.contractAddress!;
 const vault=await client.readContract({address:game,abi:gameAbi,functionName:'vault'});
 const usdcAdmin=parseAbi(['function masterMinter() view returns(address)','function configureMinter(address,uint256) returns(bool)','function mint(address,uint256) returns(bool)']);
 const minter=await client.readContract({address:BASE_USDC,abi:usdcAdmin,functionName:'masterMinter'});
 // RPC cheatcodes only mutate the fork. Never sent to source/mainnet provider.
 const raw=(method:string,params:unknown[])=>client.request({method,params} as never);
 await raw('anvil_impersonateAccount',[minter]);await raw('anvil_setBalance',[minter,'0x56BC75E2D63100000']);
 await wait(await wallet.writeContract({account:minter,address:BASE_USDC,abi:usdcAdmin,functionName:'configureMinter',args:[operator,101000n*1000000n]}));
 await raw('anvil_stopImpersonatingAccount',[minter]);
 await wait(await wallet.writeContract({account:operator,address:BASE_USDC,abi:usdcAdmin,functionName:'mint',args:[operator,100000n*1000000n]}));
 await wait(await wallet.writeContract({account:operator,address:BASE_USDC,abi:usdcAdmin,functionName:'mint',args:[player,1000n*1000000n]}));
 await raw('anvil_setBalance',[player,'0x56BC75E2D63100000']);
 await wait(await wallet.writeContract({account:operator,address:BASE_USDC,abi:erc20Abi,functionName:'approve',args:[vault,100000n*1000000n]}));
 await wait(await wallet.writeContract({account:operator,address:vault,abi:parseAbi(['function fundHouse(uint256)','function setPaused(bool)']),functionName:'fundHouse',args:[100000n*1000000n]}));
 await wait(await wallet.writeContract({account:operator,address:vault,abi:parseAbi(['function setPaused(bool)']),functionName:'setPaused',args:[false]}));
 const config:LabConfig={chainId:31337,rpc,game,vault,token:BASE_USDC,operator,player,startBlock:deployed.blockNumber.toString(),forkBlock:forkBlock.toString(),createdAt:new Date().toISOString()};
 await writeFile(`${dir}/config.json`,JSON.stringify(config,null,2),{mode:0o600});
 const env={...process.env,CRYPTO_LAB_ENABLED:'1',CRYPTO_LAB_DIR:dir};
 const worker=spawn(process.execPath,['--import','tsx','scripts/crypto/lab-worker.ts'],{env,stdio:'inherit'});children.push(worker);
 const web=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3107'],{env,stdio:'inherit'});children.push(web);
 console.log('\nPrivate crypto lab: http://127.0.0.1:3107/crypto-lab\nWallet chain: 31337, RPC http://127.0.0.1:8547\nThe 1,000 USDC in this fork is not real money. No mainnet transactions were broadcast.');
 for(const child of children)child.on('exit',()=>{stop();process.exit(1);});
}catch(error){stop();throw error;}
