import{test}from'node:test';import assert from'node:assert/strict';import{privateKeyToAccount}from'viem/accounts';import{encodeFunctionData,type Hex,type Address}from'viem';import{gameAbi}from'../shared/crypto/game-abi';import{playerRpc,validatePlayerTransaction}from'../server/crypto/player-rpc';
const account=privateKeyToAccount(('0x'+'11'.repeat(32))as Hex),owner='0x0000000000000000000000000000000000000001',game='0x0000000000000000000000000000000000000002',id=('0x'+'22'.repeat(32))as Hex;
test('player RPC rejects wallet/admin methods and restricts signed calls to the authenticated player and game',async()=>{
 await assert.rejects(playerRpc(owner,'personal_sign',[]),/Invalid/);await assert.rejects(playerRpc(owner,'anvil_setBalance',[]),/Invalid/);
 const data=encodeFunctionData({abi:gameAbi,functionName:'joinFor',args:[id,owner,1000000n,id]});const tx={type:'eip1559' as const,chainId:8453,nonce:0,maxFeePerGas:1n,maxPriorityFeePerGas:1n,gas:300000n,to:game as Address,value:0n,data};
 assert.equal(await validatePlayerTransaction(await account.signTransaction(tx),owner,game),account.address);
 for(const change of[{chainId:1},{to:owner as Address},{value:1n},{data:encodeFunctionData({abi:gameAbi,functionName:'authorizeSession',args:[account.address,1000000n,9999999999n]})}])await assert.rejects(validatePlayerTransaction(await account.signTransaction({...tx,...change}),owner,game),/Invalid/);
 await assert.rejects(validatePlayerTransaction(await account.signTransaction(tx),game,game),/Invalid/);
});
