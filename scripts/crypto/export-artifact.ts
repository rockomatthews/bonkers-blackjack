import {readFile,writeFile} from 'node:fs/promises';
import {keccak256} from 'viem';
const a=JSON.parse(await readFile('contracts/out/BlackjackGame.sol/BlackjackGame.json','utf8'));
await writeFile('shared/crypto/pilot-artifact.json',JSON.stringify({rulesVersion:2,abi:a.abi,bytecode:a.bytecode.object,creationCodeHash:keccak256(a.bytecode.object)},null,2)+'\n');
console.log('Exported any-wallet pilot deployment artifact. Rebuild after any contract change.');
