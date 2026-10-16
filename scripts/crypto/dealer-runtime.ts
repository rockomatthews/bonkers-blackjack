/** Keep the restricted production dealer key out of source, files, arguments and logs. */
import {spawnSync} from 'node:child_process';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
const service='ai.bonkers-blackjack.dealer.production';
let key=spawnSync('security',['find-generic-password','-s',service,'-a','bonkers-dealer','-w'],{encoding:'utf8'}).stdout.trim();
if(process.argv[2]==='provision'){
 if(!key){key=generatePrivateKey();const input=`add-generic-password -s ${service} -a bonkers-dealer -w ${key}\n`;const result=spawnSync('security',['-i'],{input,encoding:'utf8'});if(result.status!==0)throw Error('Unable to save restricted dealer key to Keychain');}
 if(!/^0x[0-9a-fA-F]{64}$/.test(key))throw Error('Invalid dealer credential');
 const result=spawnSync('vercel',['env','add','BONKERS_DEALER_KEY','production','--sensitive','--yes'],{cwd:'../bonkers-blackjack',input:key+'\n',encoding:'utf8'});
 if(result.status!==0){console.error('Vercel secret installation incomplete; credential preserved in Keychain.');process.exit(1);}
 console.log('Restricted dealer credential installed in Keychain and encrypted Vercel production configuration.');
 console.log('Public dealer address:',privateKeyToAccount(key as `0x${string}`).address);
}else throw Error('Use provision');
