import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Diagnostics} from '../scripts/account-ui.mjs';
import {loginOwnPage,readOwnClient} from '../scripts/account-session-ui.mjs';
import {inspectOrCreateAdmin,cardAdminPolicy} from '../scripts/admin-bootstrap-ui.mjs';
import {accountPolicy} from '../scripts/account-lifecycle.mjs';
import {verifyObserver47Absence,observer47} from '../scripts/card-observer-readback.mjs';
import {verifyBootstrapLogouts,requireExactProcessAbsence} from '../scripts/admin-bindings.mjs';
const dependency=JSON.parse(readFileSync(join(homedir(),'.config/loginom-multica/operator.json')));
const {chromium}=await import(dependency.playwright_module),root=mkdtempSync(join(tmpdir(),'lab53-admin-offline-'));
const html=readFileSync(new URL('../fixtures/navigation.html',import.meta.url),'utf8')+readFileSync(new URL('../fixtures/accounts.html',import.meta.url),'utf8');
const hash=x=>createHash('sha256').update(x).digest('hex');
let browser;const network=[];const processes=[];
before(async()=>{browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:dependency.browser});});
after(async()=>{
  const session=await browser.newBrowserCDPSession();
  for(const {id} of (await session.send('SystemInfo.getProcessInfo')).processInfo){
    try{const fields=readFileSync(`/proc/${id}/stat`,'utf8').split(')').at(-1).trim().split(/\s+/);processes.push({pid:id,start_ticks:fields[19]});}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  await session.detach();await browser.close();assert.equal(network.length,0);
  for(const r of processes){try{const fields=readFileSync(`/proc/${r.pid}/stat`,'utf8').split(')').at(-1).trim().split(/\s+/);assert.ok(fields[19]!==r.start_ticks||['Z','X'].includes(fields[0]));}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(process.env.LAB53_ADMIN_OFFLINE_RECEIPT)writeFileSync(process.env.LAB53_ADMIN_OFFLINE_RECEIPT,JSON.stringify({sandbox:true,network_requests:0,processes,cleanup:'ABSENT_OR_NONLIVE',server_absence:'NOT_PROVED'})+'\n',{mode:0o600,flag:'wx'});
  rmSync(root,{recursive:true});
});
async function ui(initialRecord){
  const context=await browser.newContext();await context.route('**/*',route=>{network.push(route.request().url());return route.abort();});
  const page=await context.newPage();await page.setContent(html);await page.evaluate(options=>{addTree({});installAccounts(options);},{policy:cardAdminPolicy,initialRecord});
  const diagnostics=new Diagnostics(join(root,'evidence-'+Math.random()),3000),config={role:'admin',loginom:{url:'about:blank',username:'admin',password:'SYNTHETIC'}};
  await loginOwnPage(page,config,diagnostics);const original=await readOwnClient(page,config);
  const recheck=async()=>{assert.equal((await readOwnClient(page,config)).guid_hash,original.guid_hash);};
  return {page,context,diagnostics,recheck};
}
const target={loginom:{url:'about:blank',username:'card-admin',password:'SYNTHETIC'}};
const intent={full_name:'owned-card-admin',action:'probe-existing',history:{state:'EXISTING_VERIFIED',prior_attempts:[]}};
test('Worker/Reviewer minimal policy retains chkAdmin false',()=>{assert.equal(accountPolicy.chkAdmin,false);assert.equal(cardAdminPolicy.chkAdmin,true);});
test('both new readbacks reject numeric/bool ticks before comparison and reject the exact live string tuple',()=>{
  const ticks=readFileSync('/proc/self/stat','utf8').split(')').at(-1).trim().split(/\s+/)[19];
  for(const value of [Number(ticks),true,false])assert.throws(()=>requireExactProcessAbsence([{pid:process.pid,start_ticks:value}]),/PROVENANCE_UNKNOWN/);
  for(const pid of [0,-1,true,false])assert.throws(()=>requireExactProcessAbsence([{pid,start_ticks:ticks}]),/PROVENANCE_UNKNOWN/);
  assert.throws(()=>requireExactProcessAbsence([{pid:process.pid,start_ticks:ticks}]),/OWN_PROCESS_PRESENT/);
  for(const filename of ['bootstrap-readback.mjs','migration-readback.mjs'])assert.match(readFileSync(new URL('../scripts/'+filename,import.meta.url),'utf8'),/requireExactProcessAbsence\(cleanup.processes\)/);
  const child=spawnSync(process.execPath,['--input-type=module','-e',"import {readFileSync} from 'node:fs';const ticks=readFileSync('/proc/self/stat','utf8').split(')').at(-1).trim().split(/\\s+/)[19];console.log(JSON.stringify({pid:process.pid,start_ticks:ticks}));"],{encoding:'utf8'});
  assert.equal(child.status,0);const record=JSON.parse(child.stdout);assert.equal(typeof record.start_ticks,'string');
  requireExactProcessAbsence([record]);processes.push(record);
});
test('existing positively owned Admin is read/cancel only, never repaired',async()=>{
  const x=await ui({username:'card-admin',marker:intent.full_name,policy:cardAdminPolicy});
  try{assert.equal((await inspectOrCreateAdmin(x.page,target,intent,x.diagnostics,x.recheck)).chkAdmin,true);
    const actions=await x.page.evaluate(()=>actions);assert.equal(actions.filter(x=>x==='apply').length,0);assert.equal(actions.filter(x=>x==='add').length,0);assert.ok(actions.includes('cancel'));}
  finally{await x.context.close();}
});
test('missing existing/creating/unknown Admin never causes re-create',async()=>{
  const x=await ui(null);
  try{await assert.rejects(inspectOrCreateAdmin(x.page,target,intent,x.diagnostics,x.recheck),/RECONCILIATION_REQUIRED/);assert.equal((await x.page.evaluate(()=>actions)).includes('add'),false);}
  finally{await x.context.close();}
});
test('new Admin requires original never-started empty-attempt intent before one apply',async()=>{
  const x=await ui(null);
  try{const fresh={...intent,action:'create-unstarted',history:{state:'NEVER_STARTED',prior_attempts:[]}};
    await inspectOrCreateAdmin(x.page,target,fresh,x.diagnostics,x.recheck);const actions=await x.page.evaluate(()=>actions);
    assert.equal(actions.filter(x=>x==='apply').length,1);assert.equal(actions.filter(x=>x==='add').length,1);
    assert.ok(x.diagnostics.events.some(x=>x.action==='immutable-create-intent'));}
  finally{await x.context.close();}
});
for(const [name,record] of [
  ['fullname',{username:'card-admin',marker:'foreign',policy:cardAdminPolicy}],
  ['nonadmin',{username:'card-admin',marker:intent.full_name,policy:{...cardAdminPolicy,chkAdmin:false}}],
  ['blocked',{username:'card-admin',marker:intent.full_name,policy:{...cardAdminPolicy,chkBlocked:true}}],
])test('wrong '+name+' refuses without password or rights changes',async()=>{
  const x=await ui(record);try{await assert.rejects(inspectOrCreateAdmin(x.page,target,intent,x.diagnostics,x.recheck),/UNKNOWN/);assert.equal((await x.page.evaluate(()=>actions)).includes('apply'),false);}finally{await x.context.close();}
});
test('bootstrap all-effects aggregation rejects a missing admin/logout receipt',()=>{
  const operation={issue_id:'fixture',operation_id:'op',source:{sha:'a'},expected_observer:{},stand:'about:blank'};
  const receipts=['bootstrap-admin','card-admin'].map((actor,i)=>({actor,role:'admin',effective_admin:true,
    effect:{stand:operation.stand,guid_hash:hash('guid'+i)},logout:{guid_hash:hash('guid'+i),ui_logout_invoked:true,transport_disconnected:true},causal_proof_sha256:hash('proof'+i)}));
  const completion={schema:'lab53-admin-bootstrap-completion-v1',...operation,own_browser_closed:true,receipts};
  assert.equal(verifyBootstrapLogouts(completion,operation).length,2);
  for(const broken of [{...completion,receipts:receipts.slice(0,1)},{...completion,receipts:[receipts[0],{...receipts[1],logout:{}}]}])assert.throws(()=>verifyBootstrapLogouts(broken,operation),/ALL_EFFECTS_UNKNOWN/);
});
test('LAB47 current calibrated empty private bucket plus exact3119 absence accepts; historical PASS is unchanged',()=>{
  const after='2026-10-09T00:00:00.000Z',self={user_hash:hash('admin'),guid_hash:hash('owner'),session_id:3128,create_time:after,stand:'about:blank',tab_binding_sha256:hash('tab'),connected:true,mst_self_count:1};
  const readback={source:'existing-authorized-admin',stand:self.stand,loaded:true,refresh_complete:true,packages_complete:true,refreshed_at:after,manager_count:3,store_count:3,
    observer:self,calibration:{stand:self.stand,observer_guid_hash:self.guid_hash,tab_binding_sha256:self.tab_binding_sha256},rows:[{...self,kind:'client',type:'mstSelf',row_index:0,name_hash:hash('admin:3128'),packages:[],pending_disconnect:false},
      ...['mstShared','mstPool'].map((type,i)=>({kind:'virtual',type,row_index:i+1,name_hash:hash(type),user_hash:null,guid_hash:null,session_id:null,create_time:null,packages:[],pending_disconnect:false}))]};
  const effect={...observer47,user_hash:'e4c32267fce53e0a49e11b22036babb513cba117b932756b87e9f6664cf3d675',stand:self.stand};
  verifyObserver47Absence(readback,effect,after);
  const target={kind:'client',type:'mstClient',row_index:3,name_hash:hash('private:3119'),packages:[],pending_disconnect:false,...effect};
  assert.throws(()=>verifyObserver47Absence({...readback,manager_count:4,store_count:4,rows:[...readback.rows,target]},effect,after),/EFFECT_PRESENT/);
  assert.throws(()=>verifyObserver47Absence({...readback,loaded:false},effect,after),/INCOMPLETE/);
  assert.throws(()=>verifyObserver47Absence({...readback,manager_count:4,store_count:4,rows:[...readback.rows,{...target,session_id:9999,guid_hash:null}]},effect,after),/BUCKET_UNKNOWN/);
});
