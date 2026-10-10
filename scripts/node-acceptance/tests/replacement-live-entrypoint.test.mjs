import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {PassThrough} from 'node:stream';
import assert from 'node:assert/strict';
import {runLive398} from '../replacement-live.mjs';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';

// All candidate modules and Playwright objects below are private offline mocks.
// No credentials, browser, network connection or package operation is used.
const base=await mkdtemp(join(tmpdir(),'replacement-entrypoint-')),results=[];
const originalStdin=Object.getOwnPropertyDescriptor(process,'stdin'),originalLog=console.log,oldMask=process.umask();
async function runCase(mode){
 const directory=join(base,mode),root=join(directory,'candidate'),out=join(directory,'evidence');
 const write=async(path,text)=>{await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),text);};
 const password='SYNTHETIC_PASSWORD_123',failure=Error('setup original '+password),logs=[];
 const state={mode,failure,closed:0,launched:0,record:null};
 const page={on(){},locator(){return Object.create({waitFor(){},click(){},fill(){},inputValue(){},isVisible(){}});},async evaluate(fn){
  if(mode==='ready-inventory-rejection')throw failure;
  if(String(fn).includes('ReplaceColumnsWizard')){if(mode==='native-error-redaction')return {pairs:[{error:'native getter '+password}]};throw Error('native trace '+password);}
  return {account:'review-unit-worker',build:'7.4.2',packages:[]};
 }};
 const context={pages:()=>[page],on(){},async close(){state.closed++;}};
 state.page=page;state.context=context;globalThis.__replacementProbe=state;
 await write('runtime/client/package.json',JSON.stringify({type:'module'}));
 await write('runtime/client/node_modules/playwright-core/index.cjs',"module.exports={chromium:{launchPersistentContext:async()=>{globalThis.__replacementProbe.launched++;return globalThis.__replacementProbe.context}}};");
 await write('runtime/client/node_modules/playwright-core/package.json',JSON.stringify({main:'index.cjs'}));
 await write('runtime/src/resources.mjs',"export const verifyResources=async()=>({browserPath:'offline-only',manifestHash:'mock'});");
 await write('runtime/src/connection-check.mjs',"import {createRequire} from 'node:module';const req=createRequire(new URL('../client/package.json',import.meta.url));export const loginBrowser=async()=>({context:await req('playwright-core').chromium.launchPersistentContext()});");
 await write('runtime/client/lib/executor.mjs',"export const createActionRuntime=options=>{const s=globalThis.__replacementProbe;s.record=options.onRecord;s.runtime={hasUnsettledWork:()=>false,emitTrace:()=>options.onRecord({phase:'node_step_completed',action_key:'node.apply',internal_operation_id:'mock-only'})};return s.runtime};");
 await write('runtime/client/lib/node-support.mjs',"export const createCandidateNodeSupport=()=>({});");
 await write('runtime/client/lib/artifacts.mjs',"export const createArtifactStore=async()=>({});");
 await write('runtime/client/lib/execution-journal.mjs',"export const createExecutionJournal=()=>{if(globalThis.__replacementProbe.mode==='setup-rejection')throw globalThis.__replacementProbe.failure;return async e=>e;};");
 await write('runtime/client/lib/workspace.mjs',"export const makeWorkspacePrepareCode=()=>{throw Error('no package operation permitted in probe')};");
 await write('runtime/client/lib/package-cleanup.mjs',"export const makePackageCleanupCode=()=> 'async page=>{throw Error(\"no cleanup gesture permitted in probe\")}';");
 await write('runtime/executor/catalog/actions.json',JSON.stringify({actions:[{action_key:'package.save_checkpoint',effect:{}},{action_key:'package.save_as',effect:{}}]}));
 await write('runtime/executor/catalog/selectors.json',JSON.stringify({selectors:[]}));
 const config=join(directory,'synthetic-config.json');await writeFile(config,JSON.stringify({workflow_profile:{loginom_user:'review-unit-worker',password},api_key:'SYNTHETIC_API_KEY',loginom_url:'https://offline.example/app/'}));
 const input=new PassThrough();input.isTTY=true;
 input.on('newListener',event=>{if(event==='data')queueMicrotask(()=>input.end());});
 Object.defineProperty(process,'stdin',{value:input,configurable:true});console.log=(...args)=>logs.push(args.join(' '));
 const owner={};let result;
 try{
  result=await runLive398([root,config,out,'unused.csv'],owner);
  assert.equal(state.launched,1);assert.equal(state.closed,0);assert.equal(result,owner);assert.equal(owner.context,context);assert.equal(owner.page,page);
  if(mode==='setup-rejection'||mode==='ready-inventory-rejection'){
   assert.equal(owner.error,failure);
   assert.equal(typeof owner.execute,'function');assert.equal(typeof owner.recover,'function');assert.equal(await owner.execute('async page=>page'),page);await assert.rejects(owner.recover(),/IDENTITY_UNCONFIRMED/);assert.equal(owner.error,failure);
   if(mode==='ready-inventory-rejection'){assert.ok(state.runtime);assert.equal(owner.runtime,state.runtime);}
   results.push({probe:mode,original_error_preserved:owner.error===failure,context_preserved:owner.context===context,page_preserved:owner.page===page,runtime_was_created:!!state.runtime,runtime_available:!!owner.runtime,execute_available:typeof owner.execute==='function',guarded_recovery_available:typeof owner.recover==='function',expected_execute_available:true,expected_guarded_recovery_available:true,browser_exit_calls:state.closed});
  }else{
   assert.equal(owner.error.message,'DIAGNOSTIC_STDIN_EOF_BEFORE_CLEANUP');assert.equal(typeof owner.execute,'function');
   await owner.runtime.emitTrace();
   const files=(await readdir(out)).filter(x=>x.startsWith(mode==='native-error-redaction'?'trace-':'trace-error-'));
   assert.equal(files.length,1);const evidence=await readFile(join(out,files[0]),'utf8');assert.equal(evidence.includes(password),false);assert.ok(evidence.includes('[REDACTED]'));
   results.push({probe:mode,eof_refused:true,context_preserved:true,source_execute_available:true,guarded_recovery_available:typeof owner.recover==='function',evidence_file:files[0],synthetic_password_persisted:evidence.includes(password),expected_synthetic_password_persisted:false,browser_exit_calls:state.closed});
  }
 }finally{input.destroy();Object.defineProperty(process,'stdin',originalStdin);console.log=originalLog;process.umask(oldMask);}
}
test('entrypoint preserves setup handles and redacts both trace paths offline',async()=>{try{
 const guardOwner={};const guard=await runLive398([],guardOwner);
 assert.equal(guard,guardOwner);assert.equal(guard.failed,true);assert.equal(guard.error.message,'DIAGNOSTIC_INTERACTIVE_STDIN_REQUIRED_BEFORE_LOGIN');assert.equal(guard.context,undefined);
 results.push({probe:'non-PTY guard',refused_before_login:true});
 await runCase('setup-rejection');await runCase('ready-inventory-rejection');await runCase('trace-redaction');
}
finally{Object.defineProperty(process,'stdin',originalStdin);console.log=originalLog;process.umask(oldMask);delete globalThis.__replacementProbe;await rm(base,{recursive:true,force:true});}
});
