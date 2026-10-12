import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {PassThrough} from 'node:stream';
import vm from 'node:vm';
import {randomUUID,createHash} from 'node:crypto';
import {runLive398} from '../replacement-live.mjs';
const helperPath=process.env.STARTUP_SOURCE??new URL('../../../packages/loginom-runtime/src/connection-check.mjs',import.meta.url);
const source=await readFile(helperPath,'utf8'),code=source.slice(source.indexOf('export function browserEnvironment')).replaceAll('export ','');
const baseline=process.env.REPLACEMENT_BASELINE==='1';
// Real entrypoint + real accepted helper in a VM. Only Playwright/native DOM are doubles.
// No browser, network, account credentials or native gesture is used.
for(const [label,raw] of [['Error',Error('synthetic original',{cause:0})],['undefined',undefined],['null',null],['false',false],['zero',0],['empty','']]) {
 for(const stage of ['observer','init','login','evidence'])test(stage+' preserves exact '+label+' at real entrypoint',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'replacement-startup-entry-')),root=join(dir,'candidate'),out=join(dir,'evidence'),events=[];
  const write=async(path,text)=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),text)};
  const state=vm.createContext({document:{querySelectorAll:()=>[{getBoundingClientRect:()=>({width:1,height:1})}]},location:{href:'about:blank',origin:'null'},Error,getComputedStyle:()=>({visibility:'visible'})});
  const locatorPrototype={or(){return this},first(){return this},locator(){return this},async waitFor(){throw raw},async isVisible(){return false},async click(){events.push('gesture');throw Error('unexpected gesture')}};
  const page={on(){if(stage==='observer')throw raw},locator(){return Object.create(locatorPrototype)},async goto(){state.location={href:'https://own.invalid/app/',origin:'https://own.invalid'}},async evaluate(fn,arg){return vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',state)}};
  const context={pages:()=>[page],on(){},async addInitScript(){if(stage==='init')throw raw},async close(){events.push('context-close')}};
  const chromium={async launchPersistentContext(){return context}};
  const helper=vm.runInNewContext(code+';({loginBrowser})',{require:()=>({chromium}),mkdir,writeFile,readFile,createHash,runtimeModulePath:String(helperPath),join,dirname,randomUUID,URL,process,Error,browserLaunch:()=>({args:[],viewport:{}}),browserDownloadScript:()=>''});
  globalThis.__replacementStartupFixture={helper,chromium};
  await write('runtime/client/package.json',JSON.stringify({type:'module'}));
  await write('runtime/client/node_modules/playwright-core/package.json',JSON.stringify({main:'index.cjs'}));
  await write('runtime/client/node_modules/playwright-core/index.cjs','module.exports={chromium:globalThis.__replacementStartupFixture.chromium}');
  await write('runtime/src/resources.mjs',"export const verifyResources=async()=>({browserPath:'/offline',manifestHash:'mock'});");
  await write('runtime/src/connection-check.mjs','export const loginBrowser=options=>globalThis.__replacementStartupFixture.helper.loginBrowser(options);');
  for(const [file,name,value] of [['executor','createActionRuntime','()=>{throw Error("runtime must not be created")}'],['node-support','createCandidateNodeSupport','()=>({})'],['artifacts','createArtifactStore','()=>({})'],['execution-journal','createExecutionJournal','()=>{throw Error("journal must not be created")}'],['workspace','makeWorkspacePrepareCode','()=>{}'],['package-cleanup','makePackageCleanupCode','()=>{}']])await write('runtime/client/lib/'+file+'.mjs','export const '+name+'='+value+';');
  const config=join(dir,'config.json');await writeFile(config,JSON.stringify({workflow_profile:{loginom_user:'own',password:''},loginom_url:'https://own.invalid/app/'}));
  if(stage==='evidence'){await mkdir(join(out,'login-failure.json'),{recursive:true});await mkdir(join(out,'login-observer.jsonl'));}
  const stdin=Object.getOwnPropertyDescriptor(process,'stdin'),log=console.log,mask=process.umask(),input=new PassThrough();input.isTTY=true;
  Object.defineProperty(process,'stdin',{value:input,configurable:true});console.log=()=>{};
  try {
   const owner={};assert.equal(await runLive398([root,config,out,'unused'],owner),owner);
   assert.equal(owner.failed,true);assert.equal(owner.error.message,'LOGINOM_LOGIN_UNAVAILABLE');
   assert.equal(owner.error.cause,raw);
   if(baseline){assert.equal(owner.context,undefined);return;}
   assert.equal(owner.context,context);assert.equal(owner.page,page);assert.equal(owner.startupOwner.context,context);assert.equal(owner.startupOwner.page,page);
   assert.ok(Object.hasOwn(owner,'primaryFailure'));assert.equal(owner.primaryFailure,raw);assert.equal(owner.startupOwner.primaryFailure,raw);
   assert.equal(owner.runtime,undefined);assert.equal(await owner.execute('async page=>page'),page);assert.equal(typeof owner.recover,'function');
   if(stage==='evidence')assert.ok(owner.evidenceFailures.length>=2);
   const first=JSON.stringify(owner.startupOwner.evidence.first_guard);
   await assert.rejects(owner.recover());assert.equal(owner.error.cause,raw);assert.equal(owner.primaryFailure,raw);assert.ok(owner.cleanupFailure);
   assert.equal(JSON.stringify(owner.startupOwner.evidence.first_guard),first);assert.notEqual(owner.closed,true);assert.deepEqual(events,[]);
   const originalPage=owner.page;owner.page={};await assert.rejects(owner.recover(),/STARTUP_OWNER_CHANGED/);owner.page=originalPage;
   owner.runtime={hasUnsettledWork:()=>true};await assert.rejects(owner.recover(),/PENDING_OPERATION_PRESERVED/);assert.deepEqual(events,[]);
  }finally{input.destroy();Object.defineProperty(process,'stdin',stdin);console.log=log;process.umask(mask);delete globalThis.__replacementStartupFixture;await rm(dir,{recursive:true,force:true});}
 });
}
