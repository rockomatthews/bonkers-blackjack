import {test} from 'node:test';import assert from 'node:assert/strict';
import {cryptoPilotEnabled,publicCryptoTestingEnabled} from '../shared/crypto/access';
test('public testing requires explicit activation; local testing never implicitly publishes',()=>{
 assert.equal(publicCryptoTestingEnabled({}),false);assert.equal(cryptoPilotEnabled({}),false);
 assert.equal(cryptoPilotEnabled({CRYPTO_LAB_ENABLED:'1'}),true);
 assert.equal(cryptoPilotEnabled({CRYPTO_LAB_ENABLED:'1',VERCEL:'1'}),false);
 assert.equal(cryptoPilotEnabled({CRYPTO_PUBLIC_TESTING:'1',VERCEL:'1'}),true);
});
