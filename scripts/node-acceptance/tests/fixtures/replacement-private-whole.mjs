// Whole connection-check module; FS is real. Browser/auth/native are labelled
// doubles. No sliced helper, network, host admission or native cleanup proof.
import vm from 'node:vm';
import * as fs from 'node:fs/promises';
import * as nativeFs from 'node:fs';
import * as module from 'node:module';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as url from 'node:url';
import {tmpdir} from 'node:os';
import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import {runLive398} from '../../replacement-live.mjs';
export async function privateWhole({raw,stage='init',storage='none'}) {
 const runtime=process.env.PRIVATE_RUNTIME_ROOT;
 if(!runtime || process.env.CAPTURE_RUNTIME_ROOT!==runtime)throw Error('ONE_EXPLICIT_RUNTIME_REQUIRED');
 const helperPath=path.resolve(runtime,'src/connection-check.mjs');
 const dir=await fs.mkdtemp(path.join(tmpdir(),'replacement-private-whole-')),root=path.join(dir,'candidate'),out=path.join(dir,'evidence'),events=[];
 let blocked=storage!=='none',closeCalls=0,launchCalls=0,initCalls=0,nativeReads=0,capturePage;
 const persistence=Error('synthetic storage refusal',{cause:false});
 const realm=vm.createContext({document:{querySelectorAll:()=>[]},location:{href:'about:blank',origin:'null'},Error,getComputedStyle:()=>({visibility:'visible'})});
 const page=new EventEmitter();
 const on=page.on;page.on=function(...args){if(stage==='observer')throw raw;return on.apply(this,args)};
 page.locator=()=>({or(){return this},first(){return this},locator(){return this},async waitFor(){throw raw},async isVisible(){return false},async click(){events.push('unexpected-gesture');throw Error('unexpected gesture')}});
 page.goto=async()=>{throw raw};
 page.evaluate=async(fn,arg)=>{nativeReads++;return capturePage?capturePage.evaluate(fn,arg):vm.runInContext('('+fn.toString()+')',realm)(arg)};
 const context=new EventEmitter();context.pages=()=>[page];context.addInitScript=async()=>{initCalls++;if(stage==='init')throw raw};
 context.close=async()=>{closeCalls++;events.push('context-close-double')};
 const chromium={async launchPersistentContext(){launchCalls++;return context}};
 const fsObserved={...fs,async open(p,...args){
  const handle=await fs.open(p,...args),directory=String(p)===path.join(out,'startup');
  return {async writeFile(...a){events.push('file-write');return handle.writeFile(...a)},async sync(){
   events.push(directory?'directory-sync':'file-sync');
   if(blocked&&(storage==='before'||storage==='after'&&closeCalls>0))throw persistence;
   return handle.sync();
  },async close(){events.push(directory?'directory-close':'file-close');return handle.close()}};
 },async rename(...a){events.push('rename');return fs.rename(...a)},async unlink(...a){events.push('unlink');return fs.unlink(...a)}};
 const moduleRealm=vm.createContext({process,URL,Error,console,setTimeout,clearTimeout});
 const builtins={'node:fs/promises':fsObserved,'node:fs':nativeFs,'node:module':{...module,createRequire:()=>name=>{if(name!=='playwright-core')throw Error('unexpected require '+name);return {chromium}}},'node:crypto':crypto,'node:path':path,'node:url':url};
 const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v)},{context:moduleRealm});
 const source=await fs.readFile(helperPath,'utf8');
 const helper=new vm.SourceTextModule(source,{context:moduleRealm,identifier:url.pathToFileURL(helperPath).href,initializeImportMeta(m){m.url=url.pathToFileURL(helperPath).href}});
 await helper.link(spec=>{const exports=builtins[spec]??({'../client/lib/browser-downloads.mjs':{browserDownloadScript:()=>''},'../client/lib/browser-launch.mjs':{browserLaunch:()=>({args:[],viewport:{}})}})[spec];if(!exports)throw Error('UNDECLARED_IMPORT '+spec);return synthetic(exports)});await helper.evaluate();
 const write=async(name,text)=>{const p=path.join(root,name);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,text)};
 globalThis.__replacementWhole={helper:helper.namespace,chromium};
 await write('runtime/client/package.json','{"type":"module"}');
 await write('runtime/client/node_modules/playwright-core/package.json','{"main":"index.cjs"}');
 await write('runtime/client/node_modules/playwright-core/index.cjs','module.exports={chromium:globalThis.__replacementWhole.chromium}');
 await write('runtime/src/resources.mjs',"export const verifyResources=async()=>({browserPath:'/offline-double',manifestHash:'fixture-not-authority'});");
 await write('runtime/src/connection-check.mjs','export const loginBrowser=o=>globalThis.__replacementWhole.helper.loginBrowser(o);');
 for(const [file,name]of [['executor','createActionRuntime'],['node-support','createCandidateNodeSupport'],['artifacts','createArtifactStore'],['execution-journal','createExecutionJournal'],['workspace','makeWorkspacePrepareCode'],['package-cleanup','makePackageCleanupCode']])await write('runtime/client/lib/'+file+'.mjs','export const '+name+'=()=>{throw Error("post-login setup forbidden in startup fixture")};');
 const config=path.join(dir,'config.json');await fs.writeFile(config,JSON.stringify({workflow_profile:{loginom_user:'own',password:''},loginom_url:'https://own.invalid/app/'}));
 const stdin=Object.getOwnPropertyDescriptor(process,'stdin'),log=console.log,mask=process.umask(),input=new PassThrough();input.isTTY=true;
 Object.defineProperty(process,'stdin',{value:input,configurable:true});console.log=()=>{};
 let owner;
 try {owner=await runLive398([root,config,out,'unused'],{});}finally{input.destroy();Object.defineProperty(process,'stdin',stdin);console.log=log;process.umask(mask);delete globalThis.__replacementWhole;}
 return {owner,page,context,out,events,persistence,source,helperPath,
  counts:()=>({closeCalls,launchCalls,initCalls,nativeReads}),unblock:()=>{blocked=false},capture:f=>{capturePage=f.page},
  async dispose(){
   if(process.env.PRIVATE_EVIDENCE_DIR){
    const destination=path.resolve(process.env.PRIVATE_EVIDENCE_DIR,path.basename(dir));await fs.mkdir(destination,{recursive:true});
    const rejection=v=>v instanceof Error?{kind:'Error',message:v.message,...('cause'in v?{cause:rejection(v.cause)}:{})}:{kind:'value',is_undefined:v===undefined,value:v===undefined?null:v};
    await fs.writeFile(path.join(destination,'receipt.json'),JSON.stringify({stage,storage,helper_path:helperPath,helper_sha256:crypto.createHash('sha256').update(source).digest('hex'),events,counts:{closeCalls,launchCalls,initCalls,nativeReads},primary:rejection(owner.primaryFailure),cause:rejection(owner.error?.cause),cleanup_failure:rejection(owner.cleanupFailure),owner_closed:owner.closed===true,owner_id:owner.startupOwner?.id,startup_evidence:owner.startupOwner?.evidence,cleanup_receipt:owner.cleanupReceipt,browser_auth_native:'doubles',fs:'real',native_admission:false},null,2));
    try{await fs.copyFile(path.join(out,'startup/startup-cleanup.json'),path.join(destination,'startup-cleanup.json'))}catch(e){if(e.code!=='ENOENT')throw e}
   }
   await fs.rm(dir,{recursive:true,force:true});
  }};
}
