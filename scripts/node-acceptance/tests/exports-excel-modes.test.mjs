import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
const script=fileURLToPath(new URL('../exports-excel-modes.mjs',import.meta.url));
const real=JSON.stringify(new URL('../../../packages/loginom-runtime/src/connection-check.mjs',import.meta.url).href);
// Stub runtime; prepare enforces the exact /app/ page path like workspace.mjs (FOREIGN_PAGE otherwise).
const modules={
 'src/resources.mjs':`export const verifyResources=async()=>({browserPath:'pinned'});`,
 'src/connection-check.mjs':`export {loginomAddress} from ${real};export async function loginBrowser(){let prepared=null;const page={prepare:o=>{prepared=o.loginomUrl;if(new URL(o.loginomUrl).pathname!=='/app/')return {status:'NOT_READY',reason:'FOREIGN_PAGE'};return {status:'READY',document_id:'doc',loginom_account:'worker',workflow_ref:{tab_tid:'own'}};},cleanup:()=>({package_closed:true,logged_out:true,prepared})};return {context:{pages:()=>[page],close:async()=>{}}};}`,
 'client/lib/workspace.mjs':`export const makeWorkspacePrepareCode=o=>'async page=>page.prepare('+JSON.stringify(o)+')';`,
 'client/lib/workspace-ui.mjs':`export const makeWorkspaceUiCode=()=>'async page=>({})';`,
 'client/lib/package-cleanup.mjs':`export const makePackageCleanupCode=()=>'async page=>page.cleanup()';`,
 'client/lib/executor.mjs':`export const createActionRuntime=()=>({deliverArtifact:async()=>({outcome:{status:'SUCCEEDED',destination:'/worker/book.xlsx',upload_completion_verified:true,cleanup_complete:true}})});`,
 'client/lib/artifacts.mjs':`export const createArtifactStore=async()=>({admit:async()=>({artifact_id:'input',upload:{grant_id:'grant'}})});`,
 'client/lib/execution-journal.mjs':`export const createExecutionJournal=()=>async e=>e;`,
 'client/lib/storage-policy.mjs':`export const createStorageBinding=()=>({});`,
 'executor/catalog/actions.json':JSON.stringify({actions:[]}),
 'executor/catalog/selectors.json':JSON.stringify({selectors:[]}),
};
async function seed(t,url,nativeServer=false){
 const root=await mkdtemp(join(tmpdir(),'excel-seed-url-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const fixtures={...modules,...(nativeServer?{'client/lib/artifacts.mjs':`export {createArtifactStore} from ${JSON.stringify(new URL('../../../packages/loginom-runtime/client/lib/artifacts.mjs',import.meta.url).href)};`}:{})};
 for(const [path,text] of Object.entries(fixtures)){const p=join(root,'runtime',path);await mkdir(join(p,'..'),{recursive:true});await writeFile(p,text);}
 const config=join(root,'config.json'),fixture=join(root,'book.xlsx'),output=join(root,'out');
 await writeFile(fixture,nativeServer?Buffer.alloc(20*1024*1024,120):'book');
 await writeFile(config,JSON.stringify({login:{url,username:'worker',password:'',package_directory:'/worker'},books:[{fixture,destination:'/worker/book.xlsx'}],...(nativeServer?{native_server_import:true}:{})}));
 const run=spawnSync(process.execPath,[script,root,config,output],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 return new URL(JSON.parse(await readFile(join(output,'result.json'),'utf8')).cleanup.prepared);
}
test('seed workspace prepare normalizes a pair URL without /app/ like loginBrowser',async t=>{
 const prepared=await seed(t,'https://app.loginom.ai');
 assert.equal(prepared.origin,'https://app.loginom.ai');assert.equal(prepared.pathname,'/app/');
});
test('seed workspace prepare keeps a pair URL that already has /app/',async t=>{
 const prepared=await seed(t,'https://app.loginom.ai/app/');
 assert.equal(prepared.origin,'https://app.loginom.ai');assert.equal(prepared.pathname,'/app/');
});
test('native server fixture seeding admits twenty MiB through the real artifact store',async t=>{
 const prepared=await seed(t,'https://app.loginom.ai/app/',true);
 assert.equal(prepared.pathname,'/app/');
});

test('native folder lookup scrolls the same virtual grid beyond DOM index 57 and verifies its row',async()=>{
 const source=await readFile(script,'utf8'),fn=source.slice(source.indexOf('function storageFolderRecord('));
 const records=Array.from({length:90},(_,i)=>({data:{FileName:'folder'+i,FilePath:'/worker/folder'+i+'/',Type:1}}));
 let visible=57;const el={id:'same-grid',scrollTop:0,contains:node=>node===row};
 const row={querySelector:()=>({textContent:'folder66'})};
 const view={getStore:()=>({isLoading:()=>false,getCount:()=>90,getTotalCount:()=>90,getRange:()=>records}),
  bufferedRenderer:{rowHeight:24},getNode:r=>records.indexOf(r)<=visible?row:null,getRecord:()=>records[66]};
 const lookup=runInNewContext('('+fn+')',{Ext:{getCmp:id=>id===el.id?view:null}});
 const args={part:'folder66',parent:'/worker/',path:'/worker/folder66/',tid:'cell66'};
 assert.throws(()=>lookup(el,{...args,visible:true}),/FS_STORAGE_FOLDER_DOM_IDENTITY/);
 assert.equal(lookup(el,{...args,scroll:true}).index,66);assert.equal(el.scrollTop,66*24);
 visible=89;assert.equal(lookup(el,{...args,visible:true}).path,args.path);
 for(const change of [r=>r.data.Type=0,r=>r.data.FilePath='/foreign/folder66/']){
  const saved={...records[66].data};change(records[66]);assert.throws(()=>lookup(el,args),/FS_STORAGE_FOLDER_IDENTITY/);records[66].data=saved;
 }
 assert.throws(()=>lookup(el,{...args,parent:'/foreign/'}),/FS_STORAGE_FOLDER_IDENTITY/);
 assert.throws(()=>lookup(el,{...args,part:'missing',path:'/worker/missing/'}),/FS_STORAGE_FOLDER_NOT_FOUND:\/worker\/missing\//);
 records[67].data={...records[66].data};assert.throws(()=>lookup(el,args),/FS_STORAGE_FOLDER_AMBIGUOUS/);
});

async function rootTransition(t,{missing=false,empty=false,staleEmpty=false,duplicate=false}={}){
 const source=await readFile(script,'utf8'),waiting=Promise.withResolvers(),changed=Promise.withResolvers();
 let records=staleEmpty?[]:[{data:{FileName:'input',FilePath:'/worker/stale/input/',Type:1}}],loadCount=5,directory='/worker/stale/';
 const grid={id:'grid',scrollTop:0,contains:()=>true,getBoundingClientRect:()=>({width:100,height:100}),getAttribute:()=> 'MF;TF-1;FileStorageForm;pnlFileStorage;tbl'};
 const store={isLoading:()=>false,getCount:()=>records.length,getTotalCount:()=>records.length,getRange:()=>records,get loadCount(){return loadCount;}};
 const view={getStore:()=>store,bufferedRenderer:{rowHeight:24},getNode:record=>({record,
  querySelector:()=>({textContent:record.data.FileName})}),getRecord:node=>node.record};
 const sender={constructor:{name:'FileSenderManager'},get CurrentDirectory(){return directory;}};
 const form={constructor:{name:'FileStorageForm'},FFileSenderManager:sender,FView:{el:{dom:{getAttribute:()=> 'MF;TF-1;FileStorageForm',contains:el=>el===grid}}}};
 let firstReady;
 const locator=selector=>({count:async()=>1,waitFor:async()=>{},getAttribute:async name=>name==='id'?'grid':'MF;TF-1;FileStorageForm;pnlFileStorage;tbl',
  locator,evaluate:async(fn,args)=>fn(grid,args),click:async()=>{directory='/';},dblclick:async()=>{
   const part=selector.includes('colName_worker')?'worker':'input';directory+='/'+part+'/';directory=directory.replaceAll('//','/');loadCount++;
   records=part==='worker'&&!empty?[{data:{FileName:'input',FilePath:'/worker/input/',Type:1}}]:[];
  }});
 const page={locator,screenshot:async()=>{},evaluate:async(fn,args)=>fn(args),waitForFunction:async(fn,args)=>{
  let value=fn(args);
  if(args?.active)return {jsonValue:async()=>value,dispose:async()=>{}};
  if(firstReady===undefined){firstReady=!!value;waiting.resolve();if(!value){await changed.promise;value=fn(args);}}
  assert.ok(value,'Native parent/listing must settle without a timer');
  return {jsonValue:async()=>value,dispose:async()=>{}};
 }};
 const context={page,config:{login:{package_directory:'/worker'}},record:async()=>{},output:'unused',
  document:{getElementById:()=>grid,querySelectorAll:()=>duplicate?[{...grid,id:'foreign-grid',getAttribute:()=> 'MF;TF-99;FileStorageForm;pnlFileStorage;tbl'},grid]:[grid]},Ext:{getCmp:()=>view},
  bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:form}})}}}}}}}};
 const run=runInNewContext(source.slice(source.indexOf('// Existing Files UI only;'))+'\nstorageDirectory',context);
 const outcome=run('/worker/'+(missing?'missing':'input')).then(value=>({value}),error=>({error}));
 await waiting.promise;
 const staleAccepted=firstReady;loadCount++;records=[{data:{FileName:'worker',FilePath:'/worker/',Type:1}}];changed.resolve();
 const result=await outcome;
 assert.equal(staleAccepted,false,'Root click must not accept a complete listing from the previous parent');
 return result;
}
test('root navigation waits for the new native parent/listing before folder lookup',async t=>{
 for(const staleEmpty of [false,true]){
  const result=await rootTransition(t,{staleEmpty});assert.equal(result.error,undefined,String(result.error));
 }
});
test('missing folder refuses after parent/listing settled, including an empty directory',async t=>{
 for(const empty of [false,true]){
  const result=await rootTransition(t,{missing:true,empty});assert.match(String(result.error),/FS_STORAGE_FOLDER_NOT_FOUND:\/worker\/missing\//);
 }
});

test('the actual ZIP audit reveals an offscreen folder before selecting Download',async()=>{
 const source=await readFile(script,'utf8');
 const start=source.indexOf("  const {prefix,at}=await storageDirectory(target.slice"),end=source.indexOf('  await download.delete();',start)+'  await download.delete();'.length;
 assert.ok(start>0&&end>start);
 const records=Array.from({length:90},(_,i)=>({data:{FileName:'folder'+i,FilePath:'/worker/folder'+i+'/',Type:1}}));
 let lastVisible=57,selected=false,saved=false,deleted=false;
 const grid={id:'grid',contains:()=>true,set scrollTop(value){lastVisible=Math.floor(value/24)+57;}};
 const visible=()=>lastVisible>=66;
 const row={waitFor:async()=>assert.ok(visible(),'Audit row remains outside the virtual DOM window'),count:async()=>visible()?1:0,
  click:async()=>{assert.ok(visible());selected=true;}};
 const grids={count:async()=>1,evaluate:async(fn,args)=>fn(grid,args),locator:()=>row};
 const view={getStore:()=>({isLoading:()=>false,getCount:()=>90,getTotalCount:()=>90,getRange:()=>records}),
  bufferedRenderer:{rowHeight:24},getNode:record=>visible()?{record,querySelector:()=>({textContent:record.data.FileName})}:null,getRecord:node=>node.record};
 const at=tid=>tid.endsWith(';btnDownload')?{click:async()=>assert.equal(selected,true)}:row;
 const page={locator:()=>grids,waitForEvent:async()=>({saveAs:async()=>{saved=true;},failure:async()=>null,delete:async()=>{deleted=true;}})};
 const events=[],context={page,storageDirectory:async()=>({prefix:'MF;TF-1',at}),target:'/worker/folder66',output:'unused',
  record:async e=>events.push(e),execute:async()=>({}),makeWorkspaceUiCode:()=>'',config:{login:{url:'https://app.loginom.ai/'}},URL,
  Ext:{getCmp:()=>view}};
 const run=runInNewContext(source.slice(source.indexOf('async function waitStorageParent('))+'\n(async()=>{'+source.slice(start,end)+'})',context);
 await run();assert.equal(saved,true);assert.equal(deleted,true);
 assert.equal(events.find(e=>e.phase==='fs_audit_folder_resolved')?.index,66);
});

test('FS seed waits for the native storage operation before guarded cleanup',async()=>{
 const source=await readFile(script,'utf8'),waiting=Promise.withResolvers(),changed=Promise.withResolvers();
 let busy=true,loading=true,cleanupCalls=0;
 const blocker={id:'storage',className:'bg-mask-message',textContent:'Files',getAttribute:()=> 'MF;TF-2;FileStorageForm',
  getBoundingClientRect:()=>({width:100,height:100})};
 const grid={id:'grid',getBoundingClientRect:()=>({width:100,height:100})};
 const page={evaluate:async(fn,args)=>fn(args),screenshot:async()=>{},waitForFunction:async(fn,args)=>{
  assert.equal(fn(args),false,'A visible native operation must block readiness');waiting.resolve(true);await changed.promise;
  busy=false;assert.equal(fn(args),false,'An unfinished native store still blocks cleanup');loading=false;
  const value=fn(args);assert.ok(value);return {jsonValue:async()=>value,dispose:async()=>{}};
 }};
 const events=[],context={page,config:{fs_fixture:true,login:{username:'worker',url:'https://app.loginom.ai'}},folders:{children:['effects']},output:'unused',
  record:async e=>events.push(e),writeFile:async()=>{},delivered:[],sessionId:'session',identity:{document_id:'doc',workflow_ref:{tab_tid:'tab'}},
  makePackageCleanupCode:()=> 'cleanup',execute:async()=>{cleanupCalls++;return {package_closed:!busy&&!loading,logged_out:!busy&&!loading};},
  document:{querySelectorAll:s=>s.includes('pnlFileStorage;tbl')?[grid]:busy?[blocker]:[]},
  getComputedStyle:()=>({visibility:'visible'}),Ext:{getCmp:id=>id==='grid'?{getStore:()=>({isLoading:()=>loading})}:{$className:'bg.filestorage.view.FileStorageForm'}}};
 const begin=source.lastIndexOf(' if(',source.indexOf("  await captureSeedCleanup('before_cleanup')")),end=source.indexOf('\n}finally{await context.close();}',begin);
 assert.ok(begin>0&&end>begin);
 const helpers=source.slice(source.indexOf('async function captureSeedCleanup('),source.indexOf('// Existing Files UI only;'));
 const run=runInNewContext(helpers+'\n(async()=>{'+source.slice(begin,end)+'})',context);
 const finished=run().then(()=>false);
 const reached=await Promise.race([waiting.promise,finished]);
 assert.equal(reached,true,'Production seed must wait before calling cleanup');assert.equal(cleanupCalls,0);
 changed.resolve();await finished;assert.equal(cleanupCalls,1);
 assert.equal(events[0].blockers[0].tid,'MF;TF-2;FileStorageForm');
 assert.equal(events.at(-1).cleanup.package_closed,true);
});

test('storage navigation uses the active FileStorageForm when another grid exists',async t=>{
 const result=await rootTransition(t,{duplicate:true});assert.equal(result.error,undefined,String(result.error));
});
