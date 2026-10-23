import {readFile,writeFile} from 'node:fs/promises';
import {keccak256} from 'viem';
const a=JSON.parse(await readFile('contracts/out/GlobalCoinGame.sol/GlobalCoinGame.json','utf8'));
if((a.bytecode.object.length-2)/2>49152||(a.deployedBytecode.object.length-2)/2>24576)throw Error('Global coin deployment exceeds EVM size limits');
await writeFile('shared/crypto/global-coin-artifact.json',JSON.stringify({abi:a.abi,bytecode:a.bytecode.object,creationCodeHash:keccak256(a.bytecode.object)},null,2)+'\n');
console.log('Exported global coin artifact within EVM limits.');
