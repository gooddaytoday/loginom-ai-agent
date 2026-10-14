// Whole production helper and reader. Page/native graph are VM doubles; FS is real.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import * as fs from 'node:fs/promises';import * as callbacks from 'node:fs';import * as crypto from 'node:crypto';
import * as path from 'node:path';import * as url from 'node:url';import * as os from 'node:os';import * as module from 'node:module';
const helperPath=process.env.CALCULATOR_HELPER??url.fileURLToPath(new URL('../src/connection-check.mjs',import.meta.url));
async function fixture(mode='transition') {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'calculator-ready-')),events=[];
 let loaded=false,closed=false;const document={querySelectorAll:()=>[]},empty={Count:0},settled={Count:0};
 const session={async get_CurrentUser(){return {async get_Name(){return 'own'}}}};
 const connection={Connected:true,UserName:mode==='foreign'?'foreign':'own',Session:session};
 const tree={FServerConnection:connection,get PackageNodes(){return loaded?settled:empty},get FPackagesParentNode(){return loaded?{}:undefined},HasRunningNodes:()=>false};
 const ctx=vm.createContext({URL,Promise,Map,Set,Error,Date,AbortController,setTimeout,clearTimeout,process,document,location:{origin:'https://fixture.invalid'},getComputedStyle:()=>({visibility:'visible'}),bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:tree}}}}}});
 const evaluate=(fn,arg)=>{ctx.arg=arg;return vm.runInContext(`(${fn.toString()})(arg)`,ctx)};
 const page={isClosed:()=>closed,async goto(){},async evaluate(fn,arg){const v=await evaluate(fn,arg);if(fn.toString().includes('package_parent_ready')){events.push('readiness');loaded=true}return v},async evaluateHandle(fn,arg){events.push('capture:'+loaded);const refs=await evaluate(fn,arg);return {evaluate:fn=>evaluate(fn,refs),async dispose(){events.push('dispose')}}},locator(selector){const avatar=selector.includes('btnAvatar'),logout=selector.includes('btnLogOut');return {locator(){return this},or(){return this},first(){return this},fill:async()=>{},inputValue:async()=>'',innerText:async()=>connection.UserName,isVisible:async()=>avatar?connection.Connected:true,waitFor:async()=>{},async click(){if(logout){connection.Connected=false;events.push('logout')}}}}};
 const browser={pages:()=>[page],addInitScript:async()=>{},async close(){closed=true;events.push('context-close')}};
 const requireDouble=name=>{if(name==='playwright-core')return {chromium:{launchPersistentContext:async()=>browser}};throw Error('unexpected require '+name)};
 const synthetic=e=>new vm.SyntheticModule(Object.keys(e),function(){for(const[k,v]of Object.entries(e))this.setExport(k,v)},{context:ctx});
 const readerPath=path.join(path.dirname(helperPath),'acceptance/calculator-resource-reader.mjs');
 const reader=new vm.SourceTextModule(await fs.readFile(readerPath,'utf8'),{context:ctx});await reader.link(()=>{throw Error('reader import')});
 const helper=new vm.SourceTextModule(await fs.readFile(helperPath,'utf8'),{context:ctx,identifier:url.pathToFileURL(helperPath).href,initializeImportMeta(meta){meta.url=url.pathToFileURL(helperPath).href}});
 const builtins={'node:fs/promises':fs,'node:fs':callbacks,'node:path':path,'node:url':url,'node:os':os,'node:crypto':crypto,'node:module':{...module,createRequire:()=>requireDouble},'../client/lib/browser-launch.mjs':{browserLaunch:()=>({args:[],viewport:{}})},'../client/lib/browser-downloads.mjs':{browserDownloadScript:()=>''}};
 await helper.link(spec=>spec==='./acceptance/calculator-resource-reader.mjs'?reader:synthetic(builtins[spec]));await helper.evaluate();
 const owner={directory};const login=()=>helper.namespace.loginBrowser({owner,profile:directory,browserPath:'/fixture',candidate:{url:'https://fixture.invalid/app/',username:'own',password:''},keepOpen:true,calculatorResourceRead:true});
 return {owner,events,tree,settled,login,dispose:()=>fs.rm(directory,{recursive:true,force:true})};
}
test('settled readiness precedes the sole trusted package-ref capture',async()=>{
 const f=await fixture();try{await f.login();assert.equal(f.owner.initialReadinessCompleted,true);assert.deepEqual(f.events.filter(e=>e.startsWith('capture:')),['capture:true']);const r=await f.owner.calculatorResourceReader.read();assert.equal(r.package_count,0);assert.equal(r.running,false);await f.owner.close();assert.equal(f.owner.closed,true)}finally{await f.dispose()}
});
test('foreign login never reaches reader capture',async()=>{
 const f=await fixture('foreign');try{await assert.rejects(f.login(),/ACCOUNT_MISMATCH/);assert.equal(f.events.some(e=>e.startsWith('capture:')),false)}finally{await f.dispose()}
});
test('later package-ref replacement still refuses and is never repinned',async()=>{
 const f=await fixture();try{await f.login();Object.defineProperty(f.tree,'PackageNodes',{value:{Count:0}});const r=f.owner.calculatorResourceReader;let first;for(let i=0;i<2;i++)await assert.rejects(r.read(),e=>{assert.equal(e.cause,'packages');if(i===0)first=e;else assert.equal(e,first);return true});assert.deepEqual(f.events.filter(e=>e.startsWith('capture:')),['capture:true']);await f.owner.close()}finally{await f.dispose()}
});
