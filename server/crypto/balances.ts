import {erc20Abi,parseAbi,type Address} from 'viem';
import {checked} from './house';
import {houseTransaction} from './house-store';
import {BASE_USDC} from '../../shared/crypto/assets';
import {vaultAbi} from '../../shared/crypto/vault';
import {gameAbi} from '../../shared/crypto/game-abi';
const treasuryAbi=parseAbi(['function treasury() view returns(address)']);
export async function walletBalances(account:Address){
 const c=await checked(),d=await houseTransaction(s=>s.deployment),blockNumber=await c.client.getBlockNumber({cacheTime:0});
 const wallet=await c.client.readContract({address:BASE_USDC,abi:erc20Abi,functionName:'balanceOf',args:[account],blockNumber});
 const result={account,chainId:8453,token:BASE_USDC,wallet:String(wallet),available:'',locked:'',house:'',reserved:'',fees:'',assets:'',accounted:'',block:String(blockNumber)};
 if(!d)return result;
 const read={address:d.vault,abi:vaultAbi,blockNumber} as const;
 const[available,locked,house,reserved,fees,accounted,assets,treasury,token,gameVault]=await Promise.all([
  c.client.readContract({...read,functionName:'available',args:[account]}),c.client.readContract({...read,functionName:'playerLocked'}),c.client.readContract({...read,functionName:'house'}),c.client.readContract({...read,functionName:'reserved'}),c.client.readContract({...read,functionName:'feeRevenue'}),c.client.readContract({...read,functionName:'accountedAssets'}),c.client.readContract({address:BASE_USDC,abi:erc20Abi,functionName:'balanceOf',args:[d.vault],blockNumber}),c.client.readContract({address:d.vault,abi:treasuryAbi,functionName:'treasury',blockNumber}),c.client.readContract({...read,functionName:'token'}),c.client.readContract({address:d.game,abi:gameAbi,functionName:'vault',blockNumber})]);
 if(treasury.toLowerCase()!==c.house.toLowerCase()||token.toLowerCase()!==BASE_USDC.toLowerCase()||gameVault.toLowerCase()!==d.vault.toLowerCase())throw Error('Shared house configuration mismatch');
 return{...result,available:String(available),locked:String(locked),house:String(house),reserved:String(reserved),fees:String(fees),assets:String(assets),accounted:String(accounted)};
}
