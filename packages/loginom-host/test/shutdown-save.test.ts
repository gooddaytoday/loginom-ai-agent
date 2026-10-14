import {expect,test} from 'bun:test'
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {homedir,tmpdir} from 'node:os'
import {supervise} from '../src/supervisor'

// Real Node child/IPC/exit; save/refusal replies are named protocol doubles.
for(const mode of ['saved','unconfirmed','business-marker'])test(`close resumes only on original save receipt: ${mode}`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'shutdown-save-ipc-'));const entry=join(root,'child.mjs')
 await writeFile(entry,`import {writeFileSync} from 'node:fs';let closes=0;process.on('message',m=>{
 if(m.operation==='start'){process.send({id:m.id,result:{protocol:1,ready:true,generation:1,chat:'fixture'}});return;}
 if(m.operation==='close'){closes++;writeFileSync('count.json',JSON.stringify({closes}));if(closes===1){process.send({id:m.id,error:'LOGINOM_RUNTIME_CLEANUP_FAILED',closeSaveRequired:true});return;}process.send({id:m.id,result:{closed:true}},()=>{process.disconnect();process.exit(0)});return;}
 if(m.operation==='finish'){process.send({id:m.id,result:true},()=>{process.disconnect();process.exit(0)});return;}
 process.send({id:m.id,result:{result:{status:'SUCCEEDED'}},closeRecoveryReady:${JSON.stringify(mode)}!=='unconfirmed'});
 });`)
 const runtime=await supervise({node:join(homedir(),'.cache/loginom-bootstrap/node/node-v24.19.0-linux-x64/bin/node'),entry,resources:root,stateDir:root,generation:1,chat:'fixture',endpoint:'https://fixture.invalid',connection:{apiKey:'fixture',password:'',url:'https://fixture.invalid',username:'fixture'}})
 try{
  const first=runtime.close();expect(await first.catch(e=>e.message)).toBe('LOGINOM_RUNTIME_CLEANUP_FAILED');expect(runtime.close()).toBe(first)
  const input=mode==='business-marker'?{name:'dock_prepare',arguments:{}}:{name:'dock_action_run',arguments:{action_key:'package.save_as'}}
  await runtime.request('call',input)
  if(mode==='saved'){expect(runtime.close()).not.toBe(first);await runtime.close();expect(JSON.parse(await readFile(join(root,'count.json'),'utf8')).closes).toBe(2)}
  else{expect(runtime.close()).toBe(first);expect(JSON.parse(await readFile(join(root,'count.json'),'utf8')).closes).toBe(1);await runtime.request('finish')}
 }finally{await runtime.exited;await rm(root,{recursive:true})}
})

import {mkdir,symlink} from 'node:fs/promises'
import {EventEmitter} from 'node:events'
import {createHash} from 'node:crypto'
import {createLoginomHost} from '../src/host'
import {loginomHostPort} from '../src/host-port'
import {transport} from '../src/transport'
import {connectionStore} from '../src/connection/connection-store'
import {credentials} from '../src/connection/credentials'
for(const foreign of [false,true])test(`original host/service/lease save recovery excludes foreign journal: ${foreign}`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'save-owner-host-'));const resources=join(root,'resources');await mkdir(join(resources,'runtime/src'),{recursive:true});await mkdir(join(resources,'bin'));await symlink(join(homedir(),'.cache/loginom-bootstrap/node/node-v24.19.0-linux-x64/bin/node'),join(resources,'bin/node'));await writeFile(join(resources,'resource-manifest.json'),JSON.stringify({endpoint:'https://fixture.invalid'}));
 await writeFile(join(resources,'runtime/src/managed-entry.mjs'),`let refused=false;process.on('message',m=>{
 if(m.operation==='start'){process.send({id:m.id,result:{protocol:1,ready:true,generation:1,chat:m.input.chat}});return;}
 if(m.operation==='close'){if(!refused&&m.input===undefined&&chat!=='readiness'){refused=true;process.send({id:m.id,error:'LOGINOM_RUNTIME_CLEANUP_FAILED',closeSaveRequired:true});return;}process.send({id:m.id,result:{closed:true}},()=>process.disconnect());return;}
 if(m.operation==='call')process.send({id:m.id,closeRecoveryReady:refused,result:{result:{saved:true},recoveryPending:false,activeWork:false}});
 });let chat='';process.on('message',m=>{if(m.operation==='start')chat=m.input.chat});`)
 const profile=join(root,'profile');const store=connectionStore(join(profile,'connection'),credentials('linux'));await store.stage({generation:1,revision:1,url:'https://fixture.invalid',username:'fixture',password:'',apiKey:'fixture'});await store.activate(1);
 const host=await createLoginomHost({root:profile,resources,codec:credentials('linux'),environment:{},strictRecovery:true});const requests=new EventEmitter(),replies=new EventEmitter();const port=loginomHostPort({postMessage:v=>replies.emit('message',{data:v}),on:requests.on.bind(requests),start(){}},host);const client=transport({postMessage:v=>requests.emit('message',{data:v}),on:replies.on.bind(replies),start(){}});
 let foreignId:string|undefined;
 try{
  await host.settled();await client.request('acquire',{run:'own',session:'fixture-session'});const chat=createHash('sha256').update('fixture-session').digest('hex');const runtime=await host.runtime(1,chat);const first=runtime.close();await expect(first).rejects.toThrow('LOGINOM_RUNTIME_CLEANUP_FAILED');expect(runtime.canSaveAfterCloseRefusal()).toBe(true);
  if(foreign){foreignId=await host.journal.begin(createHash('sha256').update('foreign').digest('hex'),1);await host.journal.settle(foreignId,false);await expect(client.request('call',{run:'own',name:'dock_action_run',args:{action_key:'package.save_as'},userMessage:'original'})).rejects.toThrow('LOGINOM_RECOVERY_REQUIRED');expect(runtime.close()).toBe(first);await host.journal.settle(foreignId,true);}
  expect(await client.request('call',{run:'own',name:'dock_action_run',args:{action_key:'package.save_as'},userMessage:'original'})).toEqual({saved:true});await runtime.close();
 }finally{if(foreignId&&host.journal.pending().includes(foreignId))await host.journal.settle(foreignId,true);await port.close();await host.close();await rm(root,{recursive:true})}
})
