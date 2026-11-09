import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
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
