// Whole managed entry + whole unchanged connection-check; FS/IPC real,
// browser/Page/native/MCP authentication are explicit doubles. No browser spawned.
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
import * as fs from 'node:fs/promises';
import * as nativeFs from 'node:fs';
import * as module from 'node:module';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as url from 'node:url';
import * as os from 'node:os';
const entryPath=process.env.MANAGED_DRAIN_ENTRY;
const helperPath=join(dirname(entryPath),'connection-check.mjs');
const scenario=process.env.LINKED_SCENARIO,events=[];
let persistenceBlocked=true,ownerCalls=0,logoutCalls=0,contextCalls=0;
let releaseNative;
const nativePending=new Promise(resolve=>{releaseNative=resolve});
const serialize=v=>v instanceof Error?{kind:'Error',name:v.name,message:v.message,...('cause' in v?{cause:serialize(v.cause)}:{})}:{kind:'value',value:v===undefined?null:v,is_undefined:v===undefined};
const value=label=>label==='error'?Error('raw fixture rejection',{cause:0}):label==='undefined'?undefined:label==='null'?null:label==='false'?false:label==='zero'?0:'';
const label=scenario.split('-').at(-1),primary=value(label),native=value(label);
const document={querySelectorAll:()=>[]},connection={Connected:false,UserName:'own'};
const context=vm.createContext({process,URL,AbortController,setImmediate,setTimeout,clearTimeout,console,Error,Promise,Map,Set,document,location:{href:'about:blank',origin:'null'},getComputedStyle:()=>({visibility:'visible'})});
let entry;
const page={
 async goto(){if(scenario==='partial-error')throw primary;context.location={href:'https://fixture.invalid/app/',origin:'https://fixture.invalid'};context.bg={app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:connection,PackageNodes:{Count:0},FPackagesParentNode:{},HasRunningNodes:()=>false}}}}}}},
 async evaluate(fn,arg){if(fn.toString().includes('?? null')){events.push('authentication-read');throw primary}return vm.runInContext('('+fn.toString()+')',context)(arg)},
 locator(selector){const avatar=selector.includes('btnAvatar'),logout=selector.includes('btnLogOut'),login=selector.includes('btnLogin');return {locator(){return this},or(){return this},first(){return this},fill:async()=>{},inputValue:async()=>'',innerText:async()=>connection.UserName,isVisible:async()=>avatar?connection.Connected:true,waitFor:async()=>{},async click(){if(login){connection.Connected=true;events.push('login-double')}if(logout){logoutCalls++;events.push('logout-double');if(scenario==='native-pending-error')await nativePending;if(scenario.startsWith('native-'))throw native;connection.Connected=false}}}},
};
const browser={pages:()=>[page],async addInitScript(){},async close(){if(scenario.startsWith('producer-')&&events.lastIndexOf('producer-directory_close')<events.lastIndexOf('logout-double'))throw Error('PRODUCER_NOT_DURABLE');contextCalls++;events.push('context-close-double')}};
const requireDouble=name=>name==='playwright-core'?{chromium:{async launchPersistentContext(){const owner=entry.namespace.state.startupOwner;const close=owner.close;owner.close=async()=>{ownerCalls++;return close()};events.push('owner-before-await');return browser}}}:name==='@modelcontextprotocol/sdk/client/index.js'?{Client:class{async connect(){}async close(){}}}:name==='@modelcontextprotocol/sdk/client/streamableHttp.js'?{StreamableHTTPClientTransport:class{}}:(()=>{throw Error('unexpected require '+name)})();
const producerPhase=scenario.startsWith('producer-')?scenario.slice(9,scenario.lastIndexOf('-')):null;
const producerFault=phase=>{if(producerPhase===phase&&persistenceBlocked&&logoutCalls>0)throw primary};
const fsDouble={...fs,
 async rename(a,b){events.push('producer-rename');producerFault('rename');await fs.rename(a,b);events.push('producer-rename-complete')},
 async writeFile(p,data,options){if(scenario==='write-error'&&persistenceBlocked&&String(p).endsWith('managed-shutdown.json'))throw Error('managed write rejected');return fs.writeFile(p,data,options)},
 async open(p,...args){
 const producer=String(p).includes('.startup-cleanup-')||((args[0]&nativeFs.constants.O_DIRECTORY)!==0),kind=(args[0]&nativeFs.constants.O_DIRECTORY)!==0?'directory':'file';
 if(producer){events.push('producer-'+kind+'_open');producerFault(kind+'_open')}
 const handle=await fs.open(p,...args);
 if(producer)return {async writeFile(data){events.push('producer-write');producerFault('write');await handle.writeFile(data);events.push('producer-write-complete')},async sync(){events.push('producer-'+kind+'_sync');producerFault(kind+'_sync');await handle.sync();events.push('producer-'+kind+'_sync-complete')},async close(){events.push('producer-'+kind+'_close-attempt');producerFault(kind+'_close');await handle.close();events.push('producer-'+kind+'_close')}};if(String(p).endsWith('managed-shutdown.json'))return {async sync(){events.push('receipt-sync');if(persistenceBlocked&&scenario==='sync-error')throw Error('managed sync rejected');if(persistenceBlocked&&scenario==='sync-confirmed-error'&&String(await fs.readFile(p,'utf8')).includes('"stage": "startup_owner"'))throw Error('confirmed receipt sync rejected');await handle.sync()},async close(){events.push('receipt-handle-close');await handle.close()}};return handle},
};
// The accepted managed writer now uses kernel callbacks, not FileHandle.sync.
// Inject the same labelled storage faults at its real callback boundary.
const managedDescriptors=new Map();
const callbackFs={...nativeFs,
 open(p,flags,mode,done){nativeFs.open(p,flags,mode,(error,fd)=>{if(!error&&String(p).endsWith('managed-shutdown.json'))managedDescriptors.set(fd,String(p));done(error,fd)})},
 writeFile(fd,data,done){if(managedDescriptors.has(fd)&&persistenceBlocked&&scenario==='write-error')return queueMicrotask(()=>done(Error('managed write rejected')));return nativeFs.writeFile(fd,data,done)},
 fsync(fd,done){
  const p=managedDescriptors.get(fd);if(p){events.push('receipt-sync');
   if(persistenceBlocked&&(scenario==='sync-error'||(scenario==='sync-confirmed-error'&&nativeFs.readFileSync(p,'utf8').includes('"stage": "startup_owner"'))))return queueMicrotask(()=>done(Error('managed sync rejected')))}
  return nativeFs.fsync(fd,done);
 },
 close(fd,done){nativeFs.close(fd,error=>{if(!error&&managedDescriptors.has(fd)){managedDescriptors.delete(fd);events.push('receipt-handle-close')}done(error)})},
};
const builtins={'node:fs/promises':fsDouble,'node:fs':callbackFs,'node:module':{...module,createRequire:()=>requireDouble},'node:crypto':crypto,'node:path':path,'node:url':url,'node:os':os};
const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v)},{context});
const helper=new vm.SourceTextModule(await readFile(helperPath,'utf8'),{context,identifier:pathToFileURL(helperPath).href,initializeImportMeta(meta){meta.url=pathToFileURL(helperPath).href}});
await helper.link(async spec=>{
 if(spec==='./acceptance/calculator-resource-reader.mjs')return new vm.SourceTextModule(await readFile(join(dirname(helperPath),'acceptance/calculator-resource-reader.mjs'),'utf8'),{context});
 return synthetic(builtins[spec]??({'../client/lib/browser-downloads.mjs':{browserDownloadScript:()=>''},'../client/lib/browser-launch.mjs':{browserLaunch:()=>({args:[],viewport:{}})}})[spec]);
});await helper.evaluate();
entry=new vm.SourceTextModule(await readFile(entryPath,'utf8')+'\nexport {state,requests};',{context,identifier:pathToFileURL(entryPath).href,initializeImportMeta(meta){meta.url=pathToFileURL(entryPath).href}});
await entry.link(spec=>spec==='./connection-check.mjs'?helper:synthetic(builtins[spec]??({'./resources.mjs':{verifyResources:()=>({browserPath:'/fixture',manifest:{files:[]}})},'./start-input.mjs':{validateStartInput:()=>({})},'../client/lib/session.mjs':{createSession:()=>{}},'../client/lib/artifacts.mjs':{admitStartupArtifacts:()=>{}},'../client/lib/bridge.mjs':{createBridge:()=>{}}})[spec]));await entry.evaluate();
process.on('message',m=>{if(m?.fixture==='unblock')persistenceBlocked=false;if(m?.fixture==='unblock-native')releaseNative();if(m?.fixture==='change-context')entry.namespace.state.startupOwner.context={};if(m?.fixture==='probe')setImmediate(()=>{const s=entry.namespace.state;process.send({fixture:'linked-probe',events,ownerCalls,logoutCalls,contextCalls,ownerRetained:!!s.startupOwner,contextRetained:s.browser===browser,ownerContextSame:s.startupOwner?.context===browser,ownerPageSame:s.startupOwner?.page===page,startupFailure:serialize(s.startupFailure),ownerPrimary:serialize(s.startupOwner?.primaryFailure),ownerCleanup:serialize(s.startupOwner?.cleanupFailure),shutdown:s.shutdown,ownerClosed:s.startupOwner?.closed,contextClosed:s.startupOwner?.contextClosed,trackedRequests:entry.namespace.requests.size})})});
setInterval(()=>{},1000);process.send({fixture:'ready',helperPath,entryPath,doubles:true});
