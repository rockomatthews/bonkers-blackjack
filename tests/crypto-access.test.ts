import {test} from 'node:test';import assert from 'node:assert/strict';
import {cryptoPilotEnabled,publicCryptoTestingEnabled} from '../shared/crypto/access';
test('live mode exposes wallet routes while practice remains isolated',()=>{
 assert.equal(publicCryptoTestingEnabled({}),false);assert.equal(cryptoPilotEnabled({}),true);assert.equal(cryptoPilotEnabled({BONKERS_MODE:'practice'}),false);
 assert.equal(cryptoPilotEnabled({CRYPTO_LAB_ENABLED:'1'}),true);
 assert.equal(cryptoPilotEnabled({BONKERS_MODE:'practice',CRYPTO_LAB_ENABLED:'1',VERCEL:'1'}),false);
 assert.equal(cryptoPilotEnabled({CRYPTO_PUBLIC_TESTING:'1',VERCEL:'1'}),true);
});
