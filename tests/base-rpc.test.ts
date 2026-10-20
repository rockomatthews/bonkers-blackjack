import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {createPublicClient} from 'viem';
import {base} from 'viem/chains';
import {baseRpcTransport} from '../server/crypto/base-rpc';
test('Base event reads fail over when the primary returns the observed request-limit error',async()=>{
 const calls:string[]=[];const fetchMock=mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input instanceof Request?input.url:input);calls.push(url);const body=JSON.parse(String(init?.body));return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,...(url.includes('mainnet.base.org')?{error:{code:-32011,message:'request limit reached'}}:{result:[]})}),{headers:{'content-type':'application/json'}});});
 try{const client=createPublicClient({chain:base,transport:baseRpcTransport('https://mainnet.base.org')});assert.deepEqual(await client.getLogs({address:'0x0000000000000000000000000000000000000001',fromBlock:1n,toBlock:2n}),[]);assert.deepEqual(calls,['https://mainnet.base.org/','https://base-rpc.publicnode.com/']);}finally{fetchMock.mock.restore();}
});
test('a failed disposable local RPC never falls through to mainnet',async()=>{const calls:string[]=[];const fetchMock=mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{calls.push(String(input instanceof Request?input.url:input));throw Error('Local RPC stopped');});try{const client=createPublicClient({chain:base,transport:baseRpcTransport('http://127.0.0.1:18567')});await assert.rejects(client.getBlockNumber());assert.ok(calls.length>0);assert.ok(calls.every(url=>url==='http://127.0.0.1:18567/'));}finally{fetchMock.mock.restore();}});
