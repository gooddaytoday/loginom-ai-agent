import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{EventEmitter}from'node:events';import{mkdir,symlink,writeFile}from'node:fs/promises';import{resolve,join}from'node:path';
const [modulePath,nodePath,rawOut]=process.argv.slice(2),out=resolve(rawOut),m=await import(modulePath),rows=[],chat=createHash('sha256').update('session').digest('hex');
await mkdir(out,{recursive:true});
for(const mode of ['canonical','copy','foreign-owner','foreign-run','foreign-chat','foreign-lease','generation','released','recovery','stale','pending','port']){
 const directory=join(out,mode),resources=join(directory,'resources'),root=join(directory,'root');await mkdir(join(resources,'runtime/src'),{recursive:true});await mkdir(join(resources,'bin'));await symlink(nodePath,join(resources,'bin/node'));await writeFile(join(resources,'resource-manifest.json'),JSON.stringify({endpoint:'https://labelled.invalid'}));
 await writeFile(join(resources,'runtime/src/managed-entry.mjs'),`process.on('message',m=>{if(m.operation==='start')process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});else if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect());else if(m.operation==='list')process.send({id:m.id,result:{tools:[]}});else process.send({id:m.id,error:'NATIVE_FORBIDDEN'});});`);
 const store=m.connectionStore(join(root,'connection'),m.credentials('linux'));await store.stage({generation:39,revision:1,url:'https://labelled.invalid',username:'labelled-account',apiKey:'fixture',password:''});await store.activate(39);
 const host=await m.createLoginomHost({root,resources,codec:m.credentials('linux'),environment:{},strictRecovery:true});await host.settled();let lease,bridge;
 try{
  if(mode==='port'){
   const requests=new EventEmitter();let reply;bridge=m.loginomHostPort({on:requests.on.bind(requests),start(){},postMessage(v){reply=v}},host);
   requests.emit('message',{data:{id:'original-acquire',method:'acquire',input:{run:'original-run',session:'session'}}});for(let i=0;i<1000&&!reply;i++)await new Promise(r=>setTimeout(r,1));assert.equal(reply.error,undefined);assert.equal(reply.result.generation,39);
   const bound=bridge.retainedAcquiredServiceOwner('original-run');assert.equal(bound.phase,'acquired-service');assert.equal(bound.account,'labelled-account');assert.equal(bridge.retainedAcquiredServiceOwner('original-run'),bound);assert.throws(()=>bridge.retainedAcquiredServiceOwner('foreign'),/PROVIDER_UNAVAILABLE/);await bridge.close();assert.throws(()=>bound.assertCurrent());
  }else{
   lease=host.acquire('owner:run');assert(lease);const bound=host.retainAcquiredServiceOwner('owner','run',chat,lease);assert.equal(bound.lease,lease);assert.equal(bound.account,'labelled-account');assert.equal(bound.generation,39);assert.equal(host.retainAcquiredServiceOwner('owner','run',chat,lease),bound);assert.equal(host.assertAcquiredServiceOwner(bound,'owner','run',chat,lease),bound);
   if(mode==='copy')assert.throws(()=>host.assertAcquiredServiceOwner({...bound},'owner','run',chat,lease));
   if(mode==='foreign-owner')assert.throws(()=>host.assertAcquiredServiceOwner(bound,'foreign','run',chat,lease));
   if(mode==='foreign-run')assert.throws(()=>host.assertAcquiredServiceOwner(bound,'owner','foreign',chat,lease));
   if(mode==='foreign-chat')assert.throws(()=>host.assertAcquiredServiceOwner(bound,'owner','run','foreign',lease));
   if(mode==='foreign-lease')assert.throws(()=>host.assertAcquiredServiceOwner(bound,'owner','run',chat,{...lease}));
   if(mode==='generation'){lease.generation=40;assert.throws(()=>bound.assertCurrent());lease.generation=39}
   if(mode==='released'){lease.release();assert.throws(()=>bound.assertCurrent());assert.throws(()=>host.retainAcquiredServiceOwner('owner','run',chat,lease))}
   if(mode==='recovery'){lease.holdRecovery();assert.throws(()=>bound.assertCurrent());lease.reconciled()}
   if(mode==='stale'){host.markRuntimeStale(chat);assert.throws(()=>bound.assertCurrent())}
   if(mode==='pending'){const id=await host.journal.begin(chat,39);assert.throws(()=>bound.assertCurrent());await host.journal.settle(id,true)}
  }
  rows.push({mode,pass:true,actualServiceLease:true,native:false,unionRegistration:false,parentProviderChannel:false});
 }finally{lease?.reconciled();lease?.release();await host.close()}
}
await writeFile(join(out,'results.json'),JSON.stringify({rows,pass:rows.length,phase:'SOURCE_COMPILED host/service/lease+real Node FS/IPC; managed readiness is named protocol double, not Page/native proof',unionRegistration:false,native:false},null,2));console.log(rows.length,'acquired-service controls PASS');
