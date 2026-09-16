import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRecoveryContext } from '../lib/recovery-context.mjs';
const e2e='viking://resources/loginom-dock/sources/e2e-tests';
const help='viking://resources/loginom-dock/sources/loginom-help';
const body='source helper fixture secret-fixture\n'.repeat(10);
const reference={role:'helper',path:'bg/helpers/node.ts',line_start:1,line_end:5,commit:'a'.repeat(40),sha256:createHash('sha256').update(body).digest('hex')};
function fixture(overrides={}) {
 const calls=[];
 const remote={async callTool(request){calls.push(request);return {content:[{type:'text',text:
   ['find','grep'].includes(request.name) ? `${help}/node.md` : request.arguments.uris[0].startsWith(e2e) ? body : 'Help source text. '.repeat(10)}]};},...overrides};
 const load=createRecoveryContext({remote,pinned:{actions:new Map([['node.add',{evidence:[reference]}]])},knownSecrets:['secret-fixture']});
 return {load,calls};
}
const failed={status:'AMBIGUOUS',action_key:'node.add',operation_id:'original',error:{message:'private user label'}};
test('automatic context reads pinned bytes, searches only Help, redacts and caches by operation',async()=>{
 const {load,calls}=fixture();
 const [a,b]=await Promise.all([load(failed),load(failed)]);
 assert.deepEqual(a,b);assert.equal(a.status,'complete');assert.equal(calls.length,3);
 assert.equal(calls.find(c=>c.name==='grep').arguments.uri,help);
 assert.equal(calls.find(c=>c.name==='read').arguments.uris[0],e2e+'/.source/'+reference.path);
 assert.ok(!JSON.stringify(a).includes('secret-fixture'));
 assert.ok(!JSON.stringify(calls).includes('private user label'));
 for(const s of a.sources)assert.equal(s.excerpt_sha256,createHash('sha256').update(s.excerpt).digest('hex'));
});
test('mismatched E2E and an out-of-scope search hit never become delivered sources',async()=>{
 const {load}=fixture({async callTool(request){return {content:[{type:'text',text:['find','grep'].includes(request.name)?'viking://user/private/document.md':'wrong bytes'}]};}});
 const result=await load(failed);assert.equal(result.status,'partial');assert.deepEqual(result.sources,[]);
});
test('successful and rejected requests make no knowledge calls; retrieval failure does not throw',async()=>{
 const {load,calls}=fixture();assert.equal(await load({...failed,status:'SUCCEEDED'}),null);
 assert.equal(await load({...failed,request_rejected:true}),null);assert.equal(calls.length,0);
 const broken=fixture({async callTool(){throw new Error('private network details');}});
 const result=await broken.load(failed);assert.equal(result.status,'partial');assert.ok(!JSON.stringify(result).includes('private network'));
});
