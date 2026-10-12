// Gap verification only. No application/browser/model actions or manufactured
// passive grants. Source and installed managed modules run only invalid start.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fork} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const runtime=process.env.PASSIVE_GAP_RUNTIME??fileURLToPath(new URL('../',import.meta.url));
const {validateStartInput}=await import(pathToFileURL(join(runtime,'src/start-input.mjs')));
const selectors=['calculator-grouped-before-done-v1','amount-import-type-v1','sorting-before-close-v1','import-before-configure-v1'];
const make=(harness)=>({protocol:1,generation:1,chat:'gap',stateDir:resolve('.'),
 resources:'/deliberately-unavailable-before-gate',connection:{username:'own'},
 acceptanceCapture:{revision:1,harness,owner:'fixture_owner',run:'fixture_run',lease:'fixture_owner:fixture_run',generation:1,chat:'gap',account:'own',packagePath:'/own/gap.lgp',admission:'fixture_admission',expires:Date.now()+60000}});
for(const selector of selectors)test('existing structural capture schema retained: '+selector,()=>{
 // Structural validation is not host authorization, native admission or PASS.
 assert.equal(validateStartInput(make(selector)).acceptanceCapture.harness,selector);
});
const invalid=[
 ['passive-kind',()=>make('dispatcher-passive-before-preflight-v1')],
 ['passive-without-package',()=>{const x=make('dispatcher-passive-before-preflight-v1');delete x.acceptanceCapture.packagePath;return x}],
 ['copied-capture-with-passive-ref',()=>{const x=make('sorting-before-close-v1');x.acceptanceCapture.priorController={verified:true};return x}],
 ['caller-module-path',()=>{const x=make('calculator-grouped-before-done-v1');x.acceptanceCapture.modulePath='/caller/reader.mjs';return x}],
];
for(const [label,input] of invalid)test('missing closed passive routing refuses before resource/login: '+label,()=>{
 assert.throws(()=>validateStartInput(input()),/LOGINOM_START_INVALID/);
});
for(const [label,input] of invalid)test('whole managed IPC handshake refusal '+label,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'passive-gap-'));
 const messages=[],logs=[];
 const child=fork(join(runtime,'src/managed-entry.mjs'),[],{execArgv:[],stdio:['ignore','pipe','pipe','ipc']});
 child.on('message',m=>messages.push(m));child.stdout.on('data',b=>logs.push(String(b)));child.stderr.on('data',b=>logs.push(String(b)));
 let exited;const exit=new Promise(r=>child.once('exit',(code,signal)=>{exited={code,signal};r()}));
 const wait=async predicate=>{const until=Date.now()+10000;while(!predicate()){assert.ok(!exited,'unexpected child exit '+JSON.stringify({exited,logs}));if(Date.now()>until)throw Error('IPC gap fixture timeout');await new Promise(r=>setTimeout(r,5))}};
 try{
  child.send({id:'start',operation:'start',input:{...input(),stateDir:directory}});
  await wait(()=>messages.some(m=>m.id==='start'));
  assert.equal(messages.find(m=>m.id==='start').error,'LOGINOM_START_INVALID');
  assert.equal(messages.some(m=>m.result?.ready),false);
  child.send({id:'close',operation:'close'});await exit;
  assert.equal(messages.find(m=>m.id==='close')?.result?.closed,true);
  assert.deepEqual(exited,{code:0,signal:null});
  if(process.env.PASSIVE_GAP_RESULTS){await mkdir(process.env.PASSIVE_GAP_RESULTS,{recursive:true});await writeFile(join(process.env.PASSIVE_GAP_RESULTS,label+'.json'),JSON.stringify({runtime,label,messages,logs,exit:exited,scope:'real IPC/whole managed module; invalid start before verifyResources/login; no Page or native authority; no-start Close is not authenticated cleanup'},null,2)+'\n')}
 }finally{
  // No detached/forced disposal: all children must acknowledge and exit here.
  if(!exited){child.send({id:'dispose',operation:'close'});await exit}
  await rm(directory,{recursive:true,force:true});
 }
});
test('current private anchors exist but do not export earlier refs/response bytes',async()=>{
 const managed=await readFile(join(runtime,'src/managed-entry.mjs'),'utf8');
 const bridge=await readFile(join(runtime,'client/lib/bridge.mjs'),'utf8');
 const connection=await readFile(join(runtime,'src/connection-check.mjs'),'utf8');
 assert.ok(managed.indexOf('await loginBrowser(')<managed.indexOf('state.startupBinding=Object.freeze'));
 assert.ok(managed.indexOf('state.startupBinding=Object.freeze')<managed.indexOf('state.bridge = await createBridge'));
 assert.match(managed,/async \(\) => authenticated.context/);
 assert.match(bridge,/const browserGate = createSerialGate\(\)/);
 assert.match(bridge,/workspaceReady !== true/);
 assert.match(bridge,/!savedPackages.has\(binding.packagePath\)/);
 assert.match(connection,/await page.goto\(loginomAddress\(candidate.url\)/);
 // Scoped absence: these exact entry files provide no response-body retention
 // hook. This is not an absence claim over all APIs or the loaded application.
 assert.equal(/\.on\(['"]response['"]/.test(managed+connection),false);
});
