// Fixed isolated offline driver. Never a production admission flag or hook.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {Diagnostics} from '../scripts/account-ui.mjs';
import {bootstrapBindings} from '../scripts/admin-bindings.mjs';
import {makePrivateBootstrapHarness} from '../scripts/capture-harness.mjs';
import {adminBootstrapLifecycle,cardAdminPolicy} from '../scripts/admin-bootstrap-ui.mjs';
import {savePrivateArtifact} from '../scripts/parent-readback.mjs';
const [operationFile,directory,mode='normal']=process.argv.slice(2);
const operation=JSON.parse(readFileSync(operationFile));
const {global,card,intent}=bootstrapBindings(operation.configs.map(x=>x.path),operation.issue_id,operation.stand);
const dependencies=JSON.parse(readFileSync(process.env.LAB53_FIXTURE_DEPENDENCIES));
const {chromium}=await import(dependencies.playwright_module);
const browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:dependencies.browser});
const diagnostics=new Diagnostics(directory,15000),requests=[],observed=[];
const envelope=JSON.parse(readFileSync(process.env.LOGINOM_ACCOUNTS_GUARDS_FILE));
const harness=makePrivateBootstrapHarness({directory,operation,envelope,configs:operation.configs.map(x=>x.path),diagnostics});
let receipts;
try {
  receipts=await adminBootstrapLifecycle({global,card,intent,operation,harness,diagnostics,openOwnPage:async()=>{
    const context=await browser.newContext();await context.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
    const page=await context.newPage();await page.setContent(readFileSync(new URL('../fixtures/navigation.html',import.meta.url),'utf8')+readFileSync(new URL('../fixtures/accounts.html',import.meta.url),'utf8'));
    await page.evaluate(options=>{addTree({});installAccounts(options);},{policy:cardAdminPolicy,adminUsers:mode==='rights'?[global.admin_user]:[global.admin_user,card.admin_user],
      initialRecord:intent.action==='probe-existing'?{username:card.admin_user,marker:intent.full_name,policy:cardAdminPolicy}:null,brokenDisconnect:mode==='logout'});
    await page.evaluate(guid=>window.accountGuid=guid,randomUUID());
    setTimeout(()=>page.emit('websocket',new EventEmitter()),1);return page;
  }});
}finally{
  const session=await browser.newBrowserCDPSession();
  for(const {id} of (await session.send('SystemInfo.getProcessInfo')).processInfo){
    try{const fields=readFileSync(`/proc/${id}/stat`,'utf8').split(')').at(-1).trim().split(/\s+/);observed.push({pid:id,start_ticks:fields[19]});}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  await session.detach();await browser.close();
  savePrivateArtifact(directory,'fixture-browser.json',{sandbox:true,network_requests:requests.length,observed_processes:observed,fixture:true,state:'UNKNOWN'});
  if(requests.length)throw Error('OFFLINE_NETWORK_REQUEST');
}
savePrivateArtifact(directory,'ui-completion.json',{schema:'lab53-admin-bootstrap-completion-v1',issue_id:operation.issue_id,
  operation_id:operation.operation_id,source:operation.source,expected_observer:operation.expected_observer,
  own_browser_closed:true,receipts,ready:false,state:'UNKNOWN'});
