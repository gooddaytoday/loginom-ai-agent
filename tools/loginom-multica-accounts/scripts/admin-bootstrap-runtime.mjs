import {readFileSync} from 'node:fs';
import {Diagnostics} from './account-ui.mjs';
import {privatePath,savePrivateArtifact} from './parent-readback.mjs';
import {bootstrapBindings} from './admin-bindings.mjs';
import {makePrivateBootstrapHarness} from './capture-harness.mjs';
import {adminBootstrapLifecycle} from './admin-bootstrap-ui.mjs';
import {trackVendorSources} from './vendor-provenance.mjs';

export async function runAdminBootstrap({operationFile,evidenceDir}) {
  privatePath(operationFile);const operation=JSON.parse(readFileSync(operationFile));
  const paths=operation.configs.map(x=>x.path),{bindings,global,card,intent}=bootstrapBindings(paths,operation.issue_id,operation.stand);
  if(JSON.stringify(bindings)!==JSON.stringify(operation.configs))throw Error('BOOTSTRAP_CONFIG_BINDING_UNKNOWN');
  const diagnostics=new Diagnostics(evidenceDir,300000);
  const envelope=JSON.parse(readFileSync(process.env.LOGINOM_ACCOUNTS_GUARDS_FILE));
  for(const operator of [global,card]) {
    const guard=envelope.guards.find(x=>x.path.endsWith('/'+operator.admin_user+'.lock'));
    if(!guard)throw Error('BOOTSTRAP_GUARD_UNKNOWN');
    const file=guard.path.slice(0,-5)+'.active.json';privatePath(file);const marker=JSON.parse(readFileSync(file));
    if(marker.schema!=='loginom-account-effect-v1'||marker.state!=='UNKNOWN'||marker.issue_id!==operation.issue_id
      ||marker.attempt_id!==operation.operation_id||marker.source_sha!==operation.source.sha
      ||JSON.stringify(marker.configs)!==JSON.stringify(operation.configs)
      ||marker.writer?.pid!==envelope.audit?.parent?.pid||marker.writer.start_ticks!==envelope.audit.parent.start_ticks
      ||marker.lock?.device!==guard.device||marker.lock.inode!==guard.inode
      ||JSON.stringify(marker.previous_processes_absent)!==JSON.stringify(guard.previous_processes_absent))throw Error('BOOTSTRAP_EFFECT_UNRECORDED');
  }
  const harness=makePrivateBootstrapHarness({directory:evidenceDir,operation,envelope,configs:paths,diagnostics});
  let browser,receipts;
  try {
    receipts=await adminBootstrapLifecycle({global,card,intent,operation,harness,diagnostics,openOwnPage:async url=>{
      if(!browser){const playwright=(await import(global.playwright_module)).default;
        browser=await playwright.chromium.launch({headless:true,chromiumSandbox:true,executablePath:global.browser,
          ...(global.proxy?.server?{proxy:{server:global.proxy.server}}:{})});}
      const context=await browser.newContext(),page=await context.newPage(),vendor=trackVendorSources(page);
      const address=new URL(url);address.searchParams.set('testable','true');
      await page.goto(address.href,{waitUntil:'domcontentloaded',timeout:diagnostics.remaining()});
      await page.waitForFunction(()=>globalThis.bg?.app?.Application?.FInstance?.FServerConnection===null
        &&typeof globalThis.bg?.app?.ServerConnection?.prototype?.DoConnect==='function',null,{timeout:diagnostics.remaining()});
      diagnostics.events.push({phase:'pre-login',action:'vendor-bytes',state:'UNKNOWN',vendor:await vendor()});diagnostics.save();
      return page;
    }});
  } finally {await browser?.close();}
  savePrivateArtifact(evidenceDir,'ui-completion.json',{schema:'lab53-admin-bootstrap-completion-v1',issue_id:operation.issue_id,
    operation_id:operation.operation_id,source:operation.source,expected_observer:operation.expected_observer,
    own_browser_closed:true,ready:false,state:'UNKNOWN',receipts,diagnostics_sha256:diagnostics.sha256});
}
