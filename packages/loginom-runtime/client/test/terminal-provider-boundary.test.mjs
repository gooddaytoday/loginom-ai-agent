import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {setup} from './terminal-provider-boundary-fixture.mjs';
const root=process.env.TERMINAL_PACKET_ROOT??new URL('../lib/',import.meta.url).pathname;
const {prepareTerminalOriginalPacket,captureTerminalInitialCustody,terminalPacketArguments}=await import(pathToFileURL(root+'/terminal-original-packet.mjs'));
const {parseSavedPackageState}=await import(pathToFileURL(root+'/package-persistence.mjs'));
const control=async fn=>{const f=await setup();try{await fn(f)}finally{await f.native.drain();await f.native.cleanup()}};

test('missing initial provider refuses before even reading invocation options',async()=>{
 let getterCalls=0;
 const options={get loginomUrl(){getterCalls++;throw Error('late lookup')}};
 await assert.rejects(prepareTerminalOriginalPacket(undefined,options),/TERMINAL_PACKET_INITIAL/);
 assert.equal(getterCalls,0);
});
test('copied or serialized initial custody cannot become an invocation carrier',()=>control(async f=>{
 for(const candidate of [{...f.initial},JSON.parse(JSON.stringify(f.initial)),{...f.custody}])
  await assert.rejects(prepareTerminalOriginalPacket(candidate,{}),/TERMINAL_PACKET_INITIAL/);
 assert.deepEqual(f.native.calls,[]);assert.equal(f.writes(),0);
}));
test('ordinary READY receipt does not supply original initial-provider authority',()=>control(async f=>{
 const ready=await f.prepare();assert.equal(ready.status,'READY');
 assert.equal(Object.hasOwn(ready,'terminalOriginalCreation'),false);
 assert.equal(Object.hasOwn(ready,'packet'),false);
 await assert.rejects(prepareTerminalOriginalPacket(ready,{}),/TERMINAL_PACKET_INITIAL/);
 assert.deepEqual(f.native.calls,[]);assert.equal(f.writes(),0);
}));
test('late native/load lookup after creation cannot qualify initial provider',()=>control(async f=>{
 assert.throws(()=>captureTerminalInitialCustody({custody:f.custody,native:f.receivers,loaded:f.load,preparation:f.preparation}),/LATE_INITIAL/);
 assert.deepEqual(f.native.calls,[]);assert.equal(f.writes(),0);
}));
test('copied packet cannot compensate for absent original provider',()=>control(async f=>{
 assert.throws(()=>terminalPacketArguments({...f.packet}),/TERMINAL_PACKET_PACKET/);
 assert.deepEqual(f.native.calls,[]);assert.equal(f.writes(),0);
}));
test('genuine doubled original continuation supplies readonly facts, no semantic or physical authority',()=>control(async f=>{
 const scope=f.build(),token=await scope.read(),facts=scope.inspect(token);
 assert.deepEqual(f.native.calls,[907,0,909,910,911]);
 assert.equal(facts.interface_reply,'original_proxy_observed');
 for(const name of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(facts[name],false);
 for(const name of ['baseline','settings','mappings','dependencies','serializer','verifier','exclusiveCreate','physicalCompletion'])assert.equal(Object.hasOwn(facts,name),false);
 assert.throws(()=>scope.end(),/RETAIN_ORIGINAL/);assert.equal(scope.state.ended,false);assert.equal(f.writes(),0);
}));
test('evidence-only durable record and end do not qualify a serializer, physical completion or release',()=>control(async f=>{
 const scope=f.build(),token=await scope.read();await scope.persist();scope.end();
 assert.equal(f.writes(),1);assert.deepEqual(f.native.calls,[907,0,909,910,911]);
 const record=JSON.parse(await (await import('node:fs/promises')).readFile(f.native.dir+'/packet.json','utf8'));
 for(const name of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(record[name],false);
 assert.equal(Object.hasOwn(record,'release'),false);assert.equal(Object.hasOwn(record,'persisted_content_verified'),false);
}));
test('IsPackageModified=false saved-state receipt explicitly retains content verification false',()=>{
 const identity={sessionId:'owner-session',documentId:'original-doc',account:'test-account',packagePath:'/personal/UUID.lgp'};
 const value={version:1,session_id:identity.sessionId,document_id:identity.documentId,account:identity.account,package_path:identity.packagePath,
  modified:false,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false};
 const parsed=parseSavedPackageState({content:[{type:'text',text:JSON.stringify(value)}]},identity);
 assert.equal(parsed.persisted_content_verified,false);
 assert.throws(()=>parseSavedPackageState({content:[{type:'text',text:JSON.stringify({...value,persisted_content_verified:true})}]},identity),/missing/);
});
