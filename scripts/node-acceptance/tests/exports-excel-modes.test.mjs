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
async function seed(t,url){
 const root=await mkdtemp(join(tmpdir(),'excel-seed-url-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const [path,text] of Object.entries(modules)){const p=join(root,'runtime',path);await mkdir(join(p,'..'),{recursive:true});await writeFile(p,text);}
 const config=join(root,'config.json'),fixture=join(root,'book.xlsx'),output=join(root,'out');
 await writeFile(fixture,'book');
 await writeFile(config,JSON.stringify({login:{url,username:'worker',password:'',package_directory:'/worker'},books:[{fixture,destination:'/worker/book.xlsx'}]}));
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
