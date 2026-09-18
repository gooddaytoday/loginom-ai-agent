import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createHermesRouter,nativeSessionKey} from '../lib/hermes-router.mjs';
import {issueHostSession,readHostSession} from '../lib/host-session.mjs';
import {produceHostInputTicket} from '../lib/host-inputs.mjs';
import {createHostArtifactAdmission} from '../lib/host-artifacts.mjs';
import {createArtifactStore} from '../lib/artifacts.mjs';
async function fixture(t,options={}){
 const root=await mkdtemp(join(tmpdir(),'dock-hermes-router-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const config={agent:'hermes',stateDir:root,adapterRevision:'test',resultProfile:'user-v1',storageDirectories:{inputs:'/owner',packages:'/owner',exports:'/owner'}};
 const created=[],closed=[],calls=[],source=join(root,'input.csv');await writeFile(source,'value\n1\n');
 const router=await createHermesRouter({config,...options,async createClient(native){
  const id=native?.session_id??'discovery';created.push(id);
  const store=await createArtifactStore({directory:join(root,'store-'+id),storageDirectories:config.storageDirectories});
  const session={metadata:{sessionId:'dock-'+id,...(native?{hostInputOwner:{agent:'hermes',session_id:id}}:{})},artifactStore:store};
  const admit=createHostArtifactAdmission(config,session);
  return {close:async()=>{closed.push(id);return {browser_transport_closed:options.unconfirmed!==id,browser_process_terminated:options.unconfirmed!==id,clipboard_leases_retained:options.unconfirmed===id?1:0};},client:{
   listTools:async()=>({tools:['dock_prepare','dock_diagnostics'].map(name=>({name,...(options.outputSchema?{outputSchema:options.outputSchema}:{}),inputSchema:{type:'object',properties:{},additionalProperties:false}}))}),
   callTool:async params=>{calls.push({id,...params});assert.ok(!Object.hasOwn(params.arguments,nativeSessionKey));
    if(params.arguments.fail)throw Error('lost reply');
    await admit(params.arguments.host_context_token);
    return {content:[{type:'text',text:JSON.stringify({sessionId:session.metadata.sessionId,input_artifacts:store.list()})}]};}
  }};
 }});
 const client=new Client({name:'test',version:'1'}),[left,right]=InMemoryTransport.createLinkedPair();
 await router.server.connect(right);await client.connect(left);t.after(async()=>{await client.close();await router.close();});
 const ticket=async(session_id,turn_id='turn')=>(await issueHostSession(config,{session_id,turn_id})).token;
 const call=async(token,args={},name='dock_prepare')=>JSON.parse((await client.callTool({name,arguments:{...args,[nativeSessionKey]:token}})).content[0].text);
 return {root,config,router,client,created,closed,calls,ticket,call,source};
}
test('two GUI conversations retain separate sessions and artifacts across turns',async t=>{
 const f=await fixture(t),a=await f.ticket('A'),b=await f.ticket('B');
 const ia=await produceHostInputTicket(f.config,{session_id:'A',turn_id:'turn',paths:[f.source]});
 const ib=await produceHostInputTicket(f.config,{session_id:'B',turn_id:'turn',paths:[f.source]});
 const [ra,rb]=await Promise.all([f.call(a,{host_context_token:ia.token}),f.call(b,{host_context_token:ib.token})]);
 assert.equal(ra.sessionId,'dock-A');assert.equal(rb.sessionId,'dock-B');
 assert.notEqual(ra.input_artifacts[0].artifact_id,rb.input_artifacts[0].artifact_id);
 const again=await f.call(await f.ticket('A','after-login'),{},'dock_diagnostics');
 assert.deepEqual(again,ra);assert.equal(f.created[0],'discovery');
 // Independent parallel sessions may finish admission in either order.
 assert.deepEqual(f.created.slice(1).sort(),['A','B']);assert.deepEqual(f.closed,['discovery']);
 assert.ok((await f.client.listTools()).tools.every(x=>x.inputSchema.properties[nativeSessionKey]));
});
test('missing, forged and expired routing never selects the last task',async t=>{
 const f=await fixture(t);await f.call(await f.ticket('A'));
 for(const token of [undefined,'not-issued','b'.repeat(64)])assert.equal((await f.call(token)).error.code,'NATIVE_SESSION_REQUIRED');
 const expired=await f.ticket('B'),path=join(f.root,'host-sessions',expired+'.json'),v=JSON.parse(await readFile(path));v.created_at=Date.now()-86400001;await writeFile(path,JSON.stringify(v));
 assert.equal((await f.call(expired)).error.code,'NATIVE_SESSION_REQUIRED');assert.deepEqual(f.created,['discovery','A']);
});
test('foreign input remains refused and unclaimed in a correctly routed task',async t=>{
 const f=await fixture(t),a=await f.ticket('A');
 const foreign=await produceHostInputTicket(f.config,{session_id:'B',turn_id:'turn',paths:[f.source]});
 const result=await f.call(a,{host_context_token:foreign.token});assert.equal(result.status,'AMBIGUOUS');
 await assert.rejects(readFile(join(f.root,'host-inputs',foreign.token+'.claim')),e=>e.code==='ENOENT');
 assert.deepEqual((await f.call(a)).input_artifacts,[]);
});
test('lost call preserves its task route and cannot affect another conversation',async t=>{
 const f=await fixture(t),a=await f.ticket('A'),b=await f.ticket('B');
 const result=await f.call(a,{fail:true});assert.equal(result.effect_possible,true);assert.equal(result.status,'AMBIGUOUS');
 assert.equal((await f.call(a)).sessionId,'dock-A');assert.equal((await f.call(b)).sessionId,'dock-B');assert.equal(f.created.filter(x=>x==='A').length,1);
});
test('capacity never evicts an existing conversation',async t=>{
 const f=await fixture(t,{limit:1}),a=await f.ticket('A');await f.call(a);
 assert.equal((await f.call(await f.ticket('B'))).error.code,'DOCK_SESSION_LIMIT');assert.equal((await f.call(a)).sessionId,'dock-A');assert.deepEqual(f.closed,['discovery']);
});
test('native context rejects invalid identities and symlink ticket files',async t=>{
 const f=await fixture(t);await assert.rejects(issueHostSession(f.config,{session_id:'',turn_id:'t'}));
 const token=await f.ticket('A');await symlink(join(f.root,'host-sessions',token+'.json'),join(f.root,'host-sessions','a'.repeat(64)+'.json'));
 await assert.rejects(readHostSession(f.config,'a'.repeat(64)));assert.deepEqual(await readHostSession(f.config,token),{session_id:'A',turn_id:'turn'});
});

 test('one unconfirmed browser prevents aggregate shutdown success without repeating cleanup',async t=>{
 const f=await fixture(t,{unconfirmed:'A'});await f.call(await f.ticket('A'));await f.call(await f.ticket('B'));
 const first=f.router.close();assert.equal(f.router.close(),first);
 const result=await first;assert.equal(result.browser_transport_closed,false);assert.equal(result.browser_process_terminated,false);assert.equal(result.clipboard_leases_retained,null);
 assert.equal(f.closed.filter(x=>x==='A').length,1);assert.equal(f.closed.filter(x=>x==='B').length,1);
 });
 test('a ticket read pending during shutdown cannot create an untracked browser',async t=>{
 let release,entered;const reading=new Promise(r=>entered=r),pending=new Promise(r=>release=r);
 const f=await fixture(t,{readSession:async()=>{entered();await pending;return {session_id:'late',turn_id:'one'};}});
 const call=f.call('a'.repeat(64));await reading;
 const closed=await f.router.close();release();
 await call.catch(()=>{});await new Promise(r=>setImmediate(r));
 assert.equal(closed.browser_process_terminated,true);assert.deepEqual(f.created,['discovery']);
 });

 test('routing errors satisfy a structured-output tool without reaching its backend',async t=>{
 const f=await fixture(t,{outputSchema:{type:'object',properties:{node_id:{type:'string'}},required:['node_id']}});
 assert.equal((await f.client.listTools()).tools[0].outputSchema.type,'object');
 const result=await f.call(undefined);assert.equal(result.kind,'dock_routing_failure');assert.equal(result.error.code,'NATIVE_SESSION_REQUIRED');assert.deepEqual(f.created,['discovery']);
 });
