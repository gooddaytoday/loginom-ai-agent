import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PassThrough} from 'node:stream';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const [callerArg,helperArg,outArg,mode,sdkArg]=process.argv.slice(2),out=resolve(outArg),root=join(out,'candidate');
if(!sdkArg)throw Error('EXPLICIT_PINNED_PLAYWRIGHT_BUNDLE_REQUIRED');
const {clientEventEmitter:EventEmitter}=createRequire(import.meta.url)(resolve(sdkArg));
await mkdir(out,{recursive:true});
const {runLive398}=await import(pathToFileURL(resolve(callerArg)));
const source=await readFile(resolve(helperArg),'utf8'),code=source.slice(source.indexOf('export function browserEnvironment')).replaceAll('export ','');
const contexts=[],owners=[],raw=Error('synthetic init refusal'),locatorPrototype={waitFor(){},click(){},fill(){},inputValue(){},isVisible(){},or(){return this;},first(){return this;},locator(){return this;}};
function contextFixture(){
 const state=vm.createContext({document:{querySelectorAll:()=>[]},location:{href:'about:blank',origin:'null'},Error,getComputedStyle:()=>({visibility:'visible'})});
 const page=new EventEmitter();
 page.locator=()=>Object.create(locatorPrototype);
 page.evaluate=(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',state);
 page.goto=async()=>{
  if(mode==='foreign-event'){
   await new Promise((resolve,reject)=>setImmediate(()=>{
    const foreign=new EventEmitter();foreign.locator=()=>Object.create(locatorPrototype);foreign.goto=async()=>{};foreign.evaluate=page.evaluate;
    context.openPages.push(foreign);
    writeFileSync(join(out,'before-event.json'),JSON.stringify({phase:'helper is awaiting goto',owner_has_original_context:owners[0].context===context,owner_has_original_page:owners[0].page===page,context_close_calls:context.closeCalls,pages:context.pages().length}));
    context.emit('page',foreign);
    reject(Error('synthetic goto refusal after handled foreign event'));
   }));
  }
 };
 const context=new EventEmitter();context.page=page;context.openPages=[page];context.pages=()=>context.openPages;context.cookies=async()=>[];context.closeCalls=0;
 context.close=async()=>{context.closeCalls++;};
 context.addInitScript=async()=>{if(mode==='foreign-wrapper'){chromium.launchPersistentContext=globalThis.__foreignSDKLauncher;throw raw;}if(mode==='reuse')throw raw;};
 return context;
}
const chromium={async launchPersistentContext(){const context=contextFixture();contexts.push(context);return context;}};const originalLaunch=chromium.launchPersistentContext;
const helper=vm.runInNewContext(code+';({loginBrowser})',{require:()=>({chromium}),mkdir,writeFile,readFile,createHash,runtimeModulePath:resolve(helperArg),join,dirname,randomUUID,URL,process,Error,browserLaunch:()=>({args:[],viewport:{}}),browserDownloadScript:()=>''});
globalThis.__observerLifetimeFixture={helper,chromium};globalThis.__foreignSDKLauncher=()=>{throw Error('foreign launcher must remain untouched')};
const write=async(path,text)=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),text);};
await write('runtime/client/package.json',JSON.stringify({type:'module'}));
await write('runtime/client/node_modules/playwright-core/package.json',JSON.stringify({main:'index.cjs'}));
await write('runtime/client/node_modules/playwright-core/index.cjs','module.exports={chromium:globalThis.__observerLifetimeFixture.chromium};');
await write('runtime/src/resources.mjs',"export const verifyResources=async()=>({browserPath:'/offline',manifestHash:'mock'});");
await write('runtime/src/connection-check.mjs','export const loginBrowser=options=>globalThis.__observerLifetimeFixture.helper.loginBrowser(options);');
for(const [file,name,value] of [['executor','createActionRuntime','()=>{throw Error("unexpected runtime")}'],['node-support','createCandidateNodeSupport','()=>({})'],['artifacts','createArtifactStore','()=>({})'],['execution-journal','createExecutionJournal','()=>{throw Error("unexpected journal")}'],['workspace','makeWorkspacePrepareCode','()=>{}'],['package-cleanup','makePackageCleanupCode','()=>{}']])await write('runtime/client/lib/'+file+'.mjs','export const '+name+'='+value+';');
const config=join(out,'synthetic-config.json');await writeFile(config,JSON.stringify({workflow_profile:{loginom_user:'own',password:''},loginom_url:'https://own.invalid/app/'}));
const input=new PassThrough();input.isTTY=true;Object.defineProperty(process,'stdin',{value:input,configurable:true});
console.log=()=>{};
for(let i=0;i<(mode==='reuse'?2:1);i++){
 const attempt=join(out,'attempt-'+i);await mkdir(join(attempt,'startup'),{recursive:true});
 const owner={};owners.push(owner);await runLive398([root,config,attempt,'unused'],owner);
 if(i===0&&mode==='reuse'){
  assert.equal(owner.closed,true);assert.equal(owner.startupOwner.receipt.cleanup_complete,true);assert.equal(owner.startupOwner.receipt.context_closed,true);assert.equal(contexts[0].closeCalls,1);
 }
}
if(mode==='foreign-wrapper'){assert.equal(chromium.launchPersistentContext,globalThis.__foreignSDKLauncher);assert.equal(owners[0].closed,true);await writeFile(join(out,'result.json'),JSON.stringify({mode,foreign_instrumentation_preserved:true,first_closed:true,context_close_calls:contexts[0].closeCalls}));process.exit(0);}
assert.equal(chromium.launchPersistentContext,originalLaunch,'owned launcher must be restored');
if(mode==='foreign-event'){
 assert.equal(owners[0].primaryFailure.message,'STARTUP_PAGE_CHANGED');assert.equal(owners[0].error,owners[0].entryFailure);assert.equal(owners[0].error,owners[0].primaryFailure);assert.equal(contexts[0].listenerCount('page'),0);await assert.rejects(owners[0].recover());assert.equal(contexts[0].closeCalls,0);
 const result={mode,event_handled_without_process_crash:true,owner_retained:owners[0].context===contexts[0]&&owners[0].page===contexts[0].page,owner_failed:owners[0].failed===true,context_close_calls:contexts[0].closeCalls};
 await writeFile(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');assert.equal(result.owner_retained,true);assert.equal(result.owner_failed,true);assert.equal(result.context_close_calls,0);
 process.exit(0);
}
const result={mode,first_closed:owners[0].closed===true,created_contexts:contexts.length,second_context_retained:owners[1].context===contexts[1],second_close_calls:contexts[1].closeCalls,second_error:owners[1].error?.message,second_cause:owners[1].error?.cause?.message,second_startup_context_present:!!owners[1].startupOwner.context};
await writeFile(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
assert.equal(result.second_close_calls,1);assert.equal(owners[1].closed,true);assert.equal(owners[1].primaryFailure,raw);assert.equal(contexts[0].listenerCount('page'),0);assert.equal(contexts[1].listenerCount('page'),0);
assert.equal(result.second_context_retained,true,'A cleanly finished caller must not orphan the next entry context');
