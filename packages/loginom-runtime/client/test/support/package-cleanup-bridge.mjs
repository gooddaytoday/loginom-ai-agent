import vm from 'node:vm';
import {makePackageCleanupCode} from '../../lib/package-cleanup.mjs';
import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client as AgentClient} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import * as executor from '../../lib/executor.mjs';
import * as workspace from '../../lib/workspace.mjs';
import {createBundledSkillFixture} from './bundled-skill-fixture.mjs';
import {createActionCatalogFixture} from './action-catalog-fixture.mjs';
import {Page,runtime} from './executor-fixture.mjs';
import {closeManagedResources} from '../../../src/managed-resources-close.mjs';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import {stoppedImportOpen} from './stopped-import-open.mjs';

// Bridge lifecycle test: external services and the action executor are fixtures.
// The serialized Loginom close body is exercised separately in package-cleanup.test.
let current;
const target={profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'};
const path='/test-2/packages/result.lgp';
const secondPath='/test-2/packages/other.lgp';
class ExternalClient {
  constructor(identity){this.browser=identity.name==='loginom-dock-browser';this.f=current;}
  async connect(t){this.transport=t;}
  async close(){this.f.events.push(this.browser?'browser-close':'remote-close');this.transport?.onclose?.();}
  async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]};}
  async callTool(request){
    if(!this.browser){
      assert.equal(request.name,'read');
      const text=this.f.catalog.files.get(request.arguments.uris[0]);assert.equal(typeof text,'string');
      return {content:[{type:'text',text}]};
    }
    const code=request.arguments.code;
    let value;
    if(this.f.native && !code.includes('async function prepareWorkspace')){
      this.f.events.push('failed-open-browser');
      value=await this.f.native.runCode(code);
    }
    else if(code.includes('async function prepareWorkspace')){
      this.f.preparing?.resolve();
      await this.f.finishPreparation?.promise;
      value={status:'READY',authenticated:true,target_verified:true,
      target,loginom_account:'test-2',document_id:'own-doc',created_draft:!this.f.scenario.startsWith('opened-'),ownership_verified:!this.f.scenario.startsWith('opened-'),effect_possible:true,workflow_ref:{tab_tid:'own-tab',prefix:'own',workflow_id:'own-workflow',navigation_path:[]},package_ref:this.f.scenario.startsWith('opened-')?{path,persisted:true}:{path:null,...(this.f.finishPreparation?{persisted:false}:{})}};
      if(this.f.native)value={status:'NOT_READY',reason:'PACKAGE_OPEN_REJECTED',phase:'exact_workflow_ready',
        target,authenticated:true,created_draft:false,effect_possible:true,operation_id:'prepare',session_id:'own-session'};
      if(this.f.failedDraft)value={...value,reason:'NATIVE_MESSAGE_BOX_BLOCKED',created_draft:true};
    }
    else if(code.includes('async function observeGeometry'))value={version:1,source:'prepare_same_browser_page',observed:{document_id:'own-doc'}};
    else if(code.includes('function readSavedPackageState')){
      this.f.events.push('saved-state');
      if(this.f.scenario==='state-unavailable')throw Error('Read response lost');
      value={version:1,session_id:'own-session',document_id:'own-doc',account:'test-2',package_path:this.f.path,
        modified:this.f.scenario==='dirty-after-save'&&this.f.saves===1,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false};
    }
    else if(code.includes('async function closeOwnedPackage')){
      this.f.events.push('package-cleanup');
      if(this.f.page){
        this.f.cleanup=await Function('return ('+code+')')()(this.f.page);
        return {content:[{type:'text',text:JSON.stringify(this.f.cleanup)}]};
      }
      if(this.f.scenario==='product-native-error')throw Error('native response lost');
      if(this.f.scenario==='product-native-malformed')return {content:[{type:'text',text:'invalid native receipt'}]};
      const [options,deadline]=JSON.parse('['+code.slice(code.lastIndexOf(')(page,')+7,-1)+']');
      assert.ok(deadline>Date.now() && deadline<=Date.now()+30000);
      this.f.cleanupOptions=options;
      value={version:1,session_id:'own-session',document_id:'own-doc',status:this.f.scenario.endsWith('native-blocked')?'BLOCKED':'SUCCEEDED',package_closed:!this.f.scenario.endsWith('native-blocked'),
        logged_out:!this.f.scenario.endsWith('native-blocked'),account:'test-2',package_path:this.f.path,unsaved_changes_discarded:false,packages_before:1,packages_after:0,reason:null};
      if(this.f.scenario==='foreign-path')value.package_path=secondPath;
      if(this.f.scenario==='foreign-account')value.account='foreign';
      if(this.f.scenario==='discard-receipt')value.unsaved_changes_discarded=true;
      if(['mutated-after-save','opened-dirty','draft-dirty'].includes(this.f.scenario))value={...value,status:'BLOCKED',package_closed:false,logged_out:false,reason:'UNSAVED_CHANGES'};
    } else throw Error('Unexpected browser code');
    return {content:[{type:'text',text:JSON.stringify(value)}]};
  }
}
class ExternalTransport{}
mock.module('@modelcontextprotocol/sdk/client/index.js',{namedExports:{Client:ExternalClient}});
mock.module('@modelcontextprotocol/sdk/client/stdio.js',{namedExports:{StdioClientTransport:ExternalTransport,getDefaultEnvironment:()=>({})}});
mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js',{namedExports:{StreamableHTTPClientTransport:ExternalTransport}});
mock.module(new URL('../../lib/workspace.mjs',import.meta.url).href,{namedExports:{...workspace,
  makeWorkspacePrepareCode:options=>workspace.makeWorkspacePrepareCode({...options,platform:'darwin'})}});
mock.module(new URL('../../lib/executor.mjs',import.meta.url).href,{namedExports:{...executor,createActionRuntime:options=>{
  const f=current;
  if(f.stoppedImport){
    const node={document_id:'own-doc',workflow_id:'own-workflow',node_id:'source'};
    const graph={complete:true,document_id:'own-doc',nodes:[],links:[],foreign_links:[]};
    const adapter={observe:async request=>({...structuredClone(graph),workflow_ref:request.workflow_ref}),preflight:async()=>{},
      positionMatches:(n,p)=>JSON.stringify(n.position)===JSON.stringify(p),reconcile:async()=>({verified:true,cleanup_complete:true}),
      mutate:async e=>{assert.equal(e.kind,'create');graph.nodes.push({ref:node,type:'imports.text',label:'Source',position:e.parameters.position,inputs:[],outputs:[0]});return {status:'SUCCEEDED',cleanup_complete:true};}};
    f.runtime=executor.createActionRuntime({...options,nodeTargetAdapterFactory:()=>adapter,
      nodeApplyHandlers:new Map([['imports.text',{revision:'1',modes:['delimited'],validate(){},configure(){throw Error('Late configure');}}]]),
      nodeApplyDriverFactory:({operation})=>({verifySource:async()=>({verified:true,cleanup_complete:true}),
        finish:async()=>{throw Error('Late finish');},waitExecution:async()=>{throw Error('Late execute');},
        readOutput:async()=>{throw Error('Late read');},verifyContinuation:async()=>true,
        mapPorts:async()=>({verified:true,cleanup_complete:true}),openWizard:async()=>{
          f.opening=stoppedImportOpen(operation);throw Error('WIZARD_CONTEXT_CHANGED');
        },releasePending:()=>f.opening.run()})});
    return f.runtime;
  }
  if(f.realExecutor){
    // Only the external node driver is controlled. Keep the production facade,
    // job runner, cache cleanup and bridge close path intact for this regression.
    f.runtime=executor.createActionRuntime({...options,
      nodeApplyHandlers:new Map([['imports.text',{revision:'1',modes:['delimited'],validate(){},configure(){}}]]),
      nodeApplyDriverFactory:()=>({mapPorts:async()=>{},openWizard:async()=>{},finish:async()=>{},
        waitExecution:async()=>{},readOutput:async()=>{},verifyContinuation:async()=>true,verifySource:async()=>{
        f.entered.resolve();await f.finish.promise;
        f.events.push('node-drained');
        if(f.scenario==='opened-uncertain')throw Error('Browser reply lost');
        return {verified:true,cleanup_complete:true,effect_possible:false};
      }})});
    return f.runtime;
  }
  return {tools:executor.executorTools,describe:()=>({actions:[],node_types:[]}),assertPreparationAllowed(){if(f.busy)throw Error('busy');},hasUnsettledWork:()=>f.unsettled || (f.scenario==='product-gate-unsettled' && ++f.workChecks>1),async cleanupServerCache(){},closeArtifactDeliveries:async()=>{},
    requestFailure:error=>{
      f.failureMessages??=[];f.failureMessages.push(error.message);
      return {status:'NOT_APPLIED',operation_id:'refused-save',effect_possible:false,cleanup_complete:true};
    },
    run:async(key,parameters,{operationId})=>{
      // Keep the real executor's explicit-null validation authoritative.
      if(operationId===null)return runtime(new Page()).run(key,parameters,{operationId});
      operationId??='generated-save-id';
      if(f.throwOnce===operationId){f.throwOnce=null;throw Error('Invalid Save parameters');}
      if(f.returnOlderOnce===operationId){f.returnOlderOnce=null;return f.receipts.get('own-save');}
      if(f.refuseOnce===operationId){f.refuseOnce=null;return {status:'NOT_APPLIED',action_key:key,operation_id:operationId,effect_possible:false,cleanup_complete:true,output:{}};}
      if(f.receipts.has(operationId))return f.receipts.get(operationId);
      if(f.scenario==='failed-new-save'&&operationId==='failed-save')return {status:'NOT_APPLIED',action_key:key,operation_id:operationId,effect_possible:false,output:{}};
      f.saves++;f.path=parameters.path;
      const result={status:'SUCCEEDED',action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}};
      f.receipts.set(operationId,result);return f.loseId===operationId?{...result,status:'AMBIGUOUS'}:result;
    },
    inspect:async({operationId})=>f.inspection??{status:'SUCCEEDED',action_key:'operation.inspect',operation_id:operationId,
      output:{state:'resolved',cleanup_confirmed:true,outcome:f.receipts.get(operationId)}},
  };
}}});
const {createBridge}=await import('../../lib/bridge.mjs');

// External Loginom fixture only: a synchronous first menu fetch stalls the real
// renderer just like lazy menu loading. The bridge serializes production cleanup
// and the ordinary managed resource closer decides whether it can acknowledge.
if(process.env.LOGINOM_DOCK_TEST_BROWSER)for(const [fault,delay] of [
  ['slow18',18000],['slow22',22000],['disconnect',9000],['session',9000],
  ['account',9000],['mask',9000],['expired',32000],
])test('Chromium managed cleanup with lazy menu: '+fault,{timeout:45000},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'cleanup-chromium-'));
  const resources=await createBundledSkillFixture(t),catalog=await createActionCatalogFixture(target);
  let timer;
  const http=createServer((request,response)=>{
    if(request.url==='/menu'){
      timer=setTimeout(()=>response.end('loaded'),delay);return;
    }
    response.end(`<!doctype html><style>[hidden]{display:none}button,section{width:160px;height:40px}</style>
      <div data-tid="own-tab">owned</div>
      <button data-tid="MF;cntMain;tlbMainToolbar;btnAvatar">test-2</button>
      <section data-tid="MF;AppMenuForm" hidden>
        <span data-tid="MF;AppMenuForm;p.h;p.t">test-2</span>
        <button data-tid="MF;AppMenuForm;btnLogOut">logout</button>
      </section>
      <div data-tid="LoginForm;Login;edtUsername" hidden><input></div>
      <script>
        const fault=${JSON.stringify(fault)},at=tid=>document.querySelector('[data-tid="'+tid+'"]');
        window.gestures={close:0,avatar:0,logout:0};
        const tab=at('own-tab'),node={PackageFileName:${JSON.stringify(path)},ReadOnly:false,Package:{},HasRunningNodes:()=>false};
        const map={PackageNodes:{Count:1,Items:()=>node},HasRunningNodes:()=>false,
          FServerConnection:{UserName:'test-2',Connected:true,Session:{IsPackageModified:async()=>false}},
          ClosePackage:async()=>{gestures.close++;map.PackageNodes.Count=0;tab.remove();return true;}};
        window.bg={app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:map}}}}};
        window.__loginomDockPreparationV1={document,id:'own-doc',receipts:new Map([
          ['prepare',{request:JSON.stringify({session:'own-session'}),packageNode:node,tab}]])};
        at('MF;cntMain;tlbMainToolbar;btnAvatar').onclick=()=>{
          gestures.avatar++;
          const xhr=new XMLHttpRequest();xhr.open('GET','/menu',false);xhr.send();
          if(fault==='disconnect')map.FServerConnection.Connected=false;
          if(fault==='session')map.FServerConnection.Session={};
          if(fault==='account')map.FServerConnection.UserName='foreign';
          if(fault==='mask'){
            const mask=document.createElement('div');mask.className='x-mask-msg';
            mask.style='position:fixed;inset:0;background:white';document.body.append(mask);
          }
          at('MF;AppMenuForm').hidden=false;
        };
        at('MF;AppMenuForm;btnLogOut').onclick=()=>{
          gestures.logout++;at('MF;AppMenuForm').hidden=true;
          at('MF;cntMain;tlbMainToolbar;btnAvatar').hidden=true;
          at('LoginForm;Login;edtUsername').hidden=false;
        };
      </script>`);
  });
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${http.address().port}/app`;
  const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,
    headless:true,chromiumSandbox:true,args:['--no-proxy-server']});
  let client,bridge;
  t.after(async()=>{
    await client?.close();await browser.close();clearTimeout(timer);
    http.closeAllConnections();await new Promise(resolve=>http.close(resolve));
    await rm(directory,{recursive:true,force:true});
  });
  const page=await browser.newPage();await page.goto(url);
  const f=current={scenario:'opened-clean',events:[],saves:0,path,catalog,page};
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){}}};
  bridge=await createBridge({resources:resources.resources,actionManifestUri:catalog.manifestUri,actionManifestSha256:catalog.manifestSha256,
    mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',
    stateDir:directory,loginomUrl:url,replayBootstrap:false,replayLoginUser:null,closeSavedPackageOnShutdown:true},session);
  client=new AgentClient({name:'chromium-cleanup',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
  const prepared=await client.callTool({name:'dock_prepare',arguments:{intent:'open_package',package_path:path}});
  assert.notEqual(prepared.isError,true,JSON.stringify(prepared));
  let ackAt;
  const closing=closeManagedResources({bridge},[]).then(()=>{ackAt=Date.now();return null;},error=>error);
  const error=await closing;
  const cleanup=JSON.parse(await readFile(join(directory,'saved-package-cleanup.json'),'utf8'));
  const success=fault.startsWith('slow');
  assert.equal(cleanup.status,success?'SUCCEEDED':'BLOCKED',JSON.stringify(cleanup));
  assert.equal(cleanup.package_closed,true);
  assert.equal(cleanup.logged_out,success);
  assert.equal(cleanup.logout_menu_step,'observe_after_timeout');
  assert.equal(Date.parse(cleanup.deadline_at)-Date.parse(cleanup.started_at)<=30000,true);
  assert.ok(Date.parse(cleanup.completed_at)<=Date.parse(cleanup.deadline_at)+250);
  if(success){
    assert.ifError(error);assert.ok(ackAt<Date.parse(cleanup.deadline_at));
    assert.equal(await page.locator('[data-tid="LoginForm;Login;edtUsername"] input').isVisible(),true);
  }else{
    assert.match(error?.message??'',/LOGINOM_RUNTIME_CLEANUP_FAILED/);assert.equal(ackAt,undefined);
  }
  // Expiry returns while the renderer is still blocked; wait only to inspect
  // the fixture's gesture counters, never to promote the cleanup decision.
  assert.deepEqual(await page.evaluate(()=>gestures),{close:1,avatar:1,logout:success?1:0});
  assert.equal(f.events.filter(e=>e==='package-cleanup').length,1);
});

test('LAB-666 stopped Import opening releases before package close/logout and managed ACK',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'cleanup-import-open-'));
 const resources=await createBundledSkillFixture(t),catalog=await createActionCatalogFixture(target);
 const f=current={scenario:'opened-clean',stoppedImport:true,events:[],saves:0,path,catalog};
 const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
  metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
  artifactStore:{list:()=>[],async releaseUploads(){}}};
 const bridge=await createBridge({resources:resources.resources,actionManifestUri:catalog.manifestUri,actionManifestSha256:catalog.manifestSha256,
  mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
  loginomUrl:'http://loginom.invalid/app',replayBootstrap:true,replayLoginUser:'test-2',closeSavedPackageOnShutdown:true},session);
 const client=new AgentClient({name:'stopped-import-cleanup',version:'1'});
 try{
  const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
  assert.notEqual((await client.callTool({name:'dock_prepare',arguments:{intent:'open_package',package_path:path}})).isError,true);
  f.runtime.startNodeApply({operation_id:'import-update',contract_revision:'1.0.0',document_id:'own-doc',
   workflow_ref:{workflow_id:'own-workflow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]},
   target:{kind:'new',type:'imports.text',label:'Source',position:{x:320,y:280}},inputs:[],mode:'delimited',parameters:{},mappings:[],
   finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});
  const stopped=await f.runtime.waitNodeApply('import-update',{timeoutMs:1000});
  assert.ok(stopped.outcome,JSON.stringify(stopped));
  assert.equal(stopped.outcome.error.code,'NODE_APPLY_STOPPED');assert.equal(stopped.outcome.output.pending_phase,'open');
  assert.equal(f.runtime.hasUnsettledWork(),true);
  const released=await f.runtime.recover('import-update',{strategy:'abandon_operation',recoveryOperationId:'release-import-update'});
  const closed=await closeManagedResources({bridge,session},[]).then(()=>({ok:true}),error=>({ok:false,error:error.message}));
  assert.equal(closed.ok,true,JSON.stringify({released,closed}));
  assert.equal(released.status,'SUCCEEDED',JSON.stringify(released));assert.equal(f.runtime.hasUnsettledWork(),false);
  const cleanup=JSON.parse(await readFile(join(directory,'saved-package-cleanup.json'),'utf8'));
  assert.equal(cleanup.status,'SUCCEEDED');assert.equal(cleanup.package_closed,true);assert.equal(cleanup.logged_out,true);
  const stages=(await readFile(join(directory,'resource-close.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(stages.at(-1).stage,'complete');assert.equal(stages.at(-1).status,'fulfilled');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.opening.gestures,[{verb:'click',ref:'ui-cancel'}]);
  assert.deepEqual(f.events.filter(e=>['package-cleanup','browser-close','remote-close'].includes(e)),['package-cleanup','remote-close','browser-close']);
 }finally{await client.close().catch(()=>{});await bridge.close().catch(()=>{});await rm(directory,{recursive:true,force:true});}
});

for(const scenario of ['opened-clean','opened-dirty','opened-uncertain'])
 test('real executor shutdown drains an owned node job: '+scenario,async t=>{
  const directory=await mkdtemp(join(tmpdir(),'cleanup-node-job-'));
  const resources=await createBundledSkillFixture(t),catalog=await createActionCatalogFixture(target);
  const f=current={scenario,realExecutor:true,events:[],saves:0,path,catalog,
    entered:Promise.withResolvers(),finish:Promise.withResolvers()};
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){}}};
  const bridge=await createBridge({resources:resources.resources,actionManifestUri:catalog.manifestUri,actionManifestSha256:catalog.manifestSha256,
    mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
    loginomUrl:'http://loginom.invalid/app',replayBootstrap:true,replayLoginUser:'test-2',closeSavedPackageOnShutdown:true},session);
  const client=new AgentClient({name:'node-job-cleanup',version:'1'});
  let closing;
  try{
    const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
    const prepared=await client.callTool({name:'dock_prepare',arguments:{intent:'open_package',package_path:path}});
    assert.notEqual(prepared.isError,true,JSON.stringify(prepared));
    f.runtime.startNodeApply({operation_id:'apply',contract_revision:'1.0.0',document_id:'own-doc',
      workflow_ref:{workflow_id:'own-workflow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]},
      target:{kind:'new',type:'imports.text',label:'Source',position:{x:320,y:280}},inputs:[],mode:'delimited',
      parameters:{},mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},
      budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});
    await f.entered.promise;
    assert.equal(f.runtime.nodeApplyStatus('apply').state,'running');
    await assert.rejects(f.runtime.run('package.save_checkpoint',{}),/background node operation/);
    // Observe rejection immediately too, so the red case has no unhandled error.
    closing=bridge.close().then(value=>({value}),error=>({error}));
    await new Promise(resolve=>setImmediate(resolve));
    assert.ifError((await Promise.race([closing,Promise.resolve(null)]))?.error);
    assert.equal(f.runtime.nodeApplyStatus('apply').cancel_requested,true);
    assert.equal(f.events.includes('package-cleanup'),false);
    assert.equal(f.events.includes('browser-close'),false);
    f.finish.resolve();
    const closed=await closing;
    assert.ifError(closed.error);
    const cleanup=JSON.parse(await readFile(join(directory,'saved-package-cleanup.json'),'utf8'));
    assert.equal(f.runtime.nodeApplyStatus('apply').state,'settled');
    assert.equal(closed.value.browser_transport_closed,true);
    assert.equal(cleanup.status,scenario==='opened-clean'?'SUCCEEDED':'BLOCKED');
    assert.equal(f.events.filter(e=>e==='package-cleanup').length,scenario==='opened-uncertain'?0:1);
    if(scenario==='opened-clean'){
      assert.equal(cleanup.package_closed,true);assert.equal(cleanup.logged_out,true);
      assert.ok(f.events.indexOf('node-drained')<f.events.indexOf('package-cleanup'));
      await closeManagedResources({bridge},[]);
    }else{
      assert.notEqual(cleanup.package_closed,true);assert.notEqual(cleanup.logged_out,true);
      assert.equal(cleanup.reason,scenario==='opened-dirty'?'UNSAVED_CHANGES':'CLEANUP_OR_OPERATION_UNCONFIRMED');
      await assert.rejects(closeManagedResources({bridge},[]),/LOGINOM_RUNTIME_CLEANUP_FAILED/);
    }
  }finally{
    f.finish.resolve();await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
    await closing;await client.close();await bridge.close().catch(()=>{});
    await rm(directory,{recursive:true,force:true});
  }
 });

for(const scenario of ['opened-clean','opened-dirty','opened-path-mismatch','opened-busy','opened-unsettled','opened-not-persisted'])
 test('normal shutdown of an opened package without Save: '+scenario,async t=>{
  const directory=await mkdtemp(join(tmpdir(),'cleanup-opened-'));
  const resources=await createBundledSkillFixture(t),catalog=await createActionCatalogFixture(target);
  const f=current={scenario,events:[],busy:false,saves:0,path,receipts:new Map(),catalog};
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){}}};
  const bridge=await createBridge({resources:resources.resources,actionManifestUri:catalog.manifestUri,actionManifestSha256:catalog.manifestSha256,
    mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
    loginomUrl:'http://loginom.invalid/app',replayBootstrap:true,replayLoginUser:'test-2',closeSavedPackageOnShutdown:true},session);
  const client=new AgentClient({name:'opened-cleanup',version:'1'});
  try{
    const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
    const prepared=await client.callTool({name:'dock_prepare',arguments:{intent:'open_package',package_path:scenario==='opened-path-mismatch'?secondPath:path}});
    assert.notEqual(prepared.isError,true,JSON.stringify(prepared));
    if(scenario==='opened-not-persisted')session.metadata.workspacePreparation.state.package_ref.persisted=false;
    f.busy=scenario==='opened-busy';f.unsettled=scenario==='opened-unsettled';
    const result=await bridge.close();
    const cleanup=JSON.parse(await readFile(join(directory,'saved-package-cleanup.json'),'utf8'));
    assert.equal(result.browser_transport_closed,true);assert.equal(f.saves,0);
    assert.equal(cleanup.save_operation_id,null);
    assert.equal(cleanup.status,scenario==='opened-clean'?'SUCCEEDED':'BLOCKED');
    assert.equal(f.events.includes('package-cleanup'),['opened-clean','opened-dirty'].includes(scenario));
    if(scenario==='opened-dirty')assert.equal(cleanup.reason,'UNSAVED_CHANGES');
    if(scenario==='opened-clean'){
      assert.equal(cleanup.package_closed,true);assert.equal(cleanup.logged_out,true);
      assert.equal(cleanup.policy,'opened_saved_package');assert.equal(cleanup.package_path,path);
      assert.equal(f.cleanupOptions.diagnosticDiscard,false);assert.equal(f.cleanupOptions.diagnosticReadOnly,false);
      assert.equal(f.cleanupOptions.documentId,'own-doc');assert.equal(f.cleanupOptions.tabTid,'own-tab');
    }
  }finally{await client.close();await bridge.close();await rm(directory,{recursive:true,force:true});}
 });

test('unknown prepared workflow advises only the last confirmed Save of its own bridge',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'prepared-workflow-hint-'));
  const resources=await createBundledSkillFixture(t),catalog=await createActionCatalogFixture(target);
  const f=current={scenario:'success',events:[],busy:false,saves:0,path,receipts:new Map(),catalog};
  const makeSession=()=>({directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){}}});
  const config={resources:resources.resources,actionManifestUri:catalog.manifestUri,actionManifestSha256:catalog.manifestSha256,
    mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
    loginomUrl:'http://loginom.invalid/app',replayBootstrap:true,replayLoginUser:'test-2'};
  const bridge=await createBridge(config,makeSession());
  const client=new AgentClient({name:'prepared-workflow-hint',version:'1'});
  const stale={intent:'existing_workflow',workflow_ref:{document_id:'old-doc',workflow_id:'old-workflow',
    tab_tid:'old-tab',prefix:'old',navigation_path:[{tid:'not-a-package-path',label:'guessed.lgp'}]}};
  const save=(operation_id,action_key,savePath)=>client.callTool({name:'dock_action_run',arguments:{operation_id,action_key,parameters:{path:savePath}}});
  const refusal=async(c=client)=>{
    const before=[...f.events],saves=f.saves;
    const reply=await c.callTool({name:'dock_prepare',arguments:stale});
    assert.equal(reply.isError,true);
    assert.deepEqual(f.events,before);assert.equal(f.saves,saves);
    const value=JSON.parse(reply.content[0].text);
    assert.equal(value.code,'UNKNOWN_PREPARED_WORKFLOW');
    assert.match(value.message,/reference issued in this session/);
    assert.equal(value.next_step.tool,'dock_prepare');assert.equal(value.next_step.arguments.intent,'open_package');
    return value.next_step;
  };
  try{
    const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
    const unknown=await refusal();
    assert.deepEqual(unknown.arguments,{intent:'open_package'});assert.match(unknown.instruction,/does not know/);
    await client.callTool({name:'dock_prepare',arguments:{}});
    await save('first-save','package.save_checkpoint',path);
    assert.deepEqual((await refusal()).arguments,{intent:'open_package',package_path:path});
    await save('newer-save','package.save_as',secondPath);
    assert.equal((await refusal()).arguments.package_path,secondPath);
    await save('first-save','package.save_checkpoint',path);
    assert.equal((await refusal()).arguments.package_path,secondPath);
    f.refuseOnce='failed-save';await save('failed-save','package.save_checkpoint',path);
    assert.equal((await refusal()).arguments.package_path,secondPath);
    f.loseId='ambiguous-save';await save('ambiguous-save','package.save_checkpoint',path);
    assert.equal((await refusal()).arguments.package_path,secondPath);
    await client.callTool({name:'dock_operation_inspect',arguments:{operation_id:'ambiguous-save'}});
    assert.equal((await refusal()).arguments.package_path,path);
    f.unsettled=true;
    const pending=await client.callTool({name:'dock_prepare',arguments:stale});
    assert.equal(pending.isError,true);assert.match(pending.content[0].text,/^UNKNOWN_PREPARED_WORKFLOW:/);
    assert.doesNotMatch(pending.content[0].text,/next_step|open_package/);
    f.unsettled=false;
    const fresh=await createBridge(config,makeSession()),other=new AgentClient({name:'new-runtime',version:'1'});
    try{
      const [x,y]=InMemoryTransport.createLinkedPair();await fresh.server.connect(y);await other.connect(x);
      assert.deepEqual((await refusal(other)).arguments,{intent:'open_package'});
    }finally{await other.close();await fresh.close();}
  }finally{await client.close();await bridge.close();await rm(directory,{recursive:true,force:true});}
});

for(const action_key of ['package.save_checkpoint','package.save_as'])
 test('Save rejects explicit null but permits an omitted ID: '+action_key,async t=>{
  const directory=await mkdtemp(join(tmpdir(),'cleanup-null-save-'));
  const resources=await createBundledSkillFixture(t),catalog=await createActionCatalogFixture(target);
  const f=current={scenario:'success',events:[],busy:false,saves:0,path,receipts:new Map(),catalog};
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
   metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
   artifactStore:{list:()=>[],async releaseUploads(){}}};
  const bridge=await createBridge({resources:resources.resources,actionManifestUri:catalog.manifestUri,actionManifestSha256:catalog.manifestSha256,
   mode:'executor-replay',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
   loginomUrl:'http://loginom.invalid/app',replayBootstrap:true,replayLoginUser:'test-2',closeSavedPackageOnShutdown:true},session);
  const client=new AgentClient({name:'null-save',version:'1'});
  try{
   const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
   await client.callTool({name:'dock_prepare',arguments:{}});
   for(let attempt=0;attempt<2;attempt++){
    const response=await client.callTool({name:'dock_action_run',arguments:{action_key,parameters:{path,conflict_policy:'replace'},operation_id:null}});
    const refusal=JSON.parse(response.content[0].text);
    assert.equal(refusal.status,'NOT_APPLIED');assert.equal(refusal.effect_possible,false);
    assert.match(f.failureMessages.at(-1),/operation_id must be a stable identifier/);
    assert.equal(f.saves,0);assert.equal(f.receipts.size,0);assert.equal(f.events.includes('saved-state'),false);
   }
   const response=await client.callTool({name:'dock_action_run',arguments:{action_key,parameters:{path,conflict_policy:'replace'}}});
   const saved=JSON.parse(response.content[0].text);
   assert.equal(saved.status,'SUCCEEDED');assert.match(saved.operation_id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
   assert.equal(f.saves,1);
   assert.equal((await bridge.close()).browser_transport_closed,true);
   const cleanup=JSON.parse(await readFile(join(directory,'saved-package-cleanup.json'),'utf8'));
   assert.equal(cleanup.status,'SUCCEEDED');assert.equal(cleanup.save_operation_id,saved.operation_id);
  }finally{await client.close();await bridge.close();await rm(directory,{recursive:true,force:true});}
 });

const cases=['success','unprepared','no-save','native-blocked','busy','dirty-after-save','state-unavailable'];
const productCases=['product-success','product-unsettled','product-gate-unsettled','product-native-blocked','product-evidence-directory','product-journal-directory','product-no-save','product-multiple-paths','product-busy','product-native-error','product-native-malformed'];
for(const mode of ['isolated','product','normal'])for(const scenario of mode==='isolated'?cases:mode==='product'?productCases:[...cases,
  'latest-same-path','older-save-retry','inspected-older-save','failed-new-save','mutated-after-save',
  'foreign-path','foreign-account','discard-receipt','changed-document','normal-evidence-directory','normal-journal-directory'])test(mode+' shutdown lifecycle: '+scenario,async t=>{
  const directory=await mkdtemp(join(tmpdir(),'cleanup-bridge-'));
  const resources=await createBundledSkillFixture(t),catalog=await createActionCatalogFixture(target);
  const f=current={scenario,events:[],busy:false,saves:0,path,receipts:new Map(),catalog};
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release-uploads');}}};
  let bridge,client;
  try{
    bridge=await createBridge({resources:resources.resources,actionManifestUri:catalog.manifestUri,actionManifestSha256:catalog.manifestSha256,
      mode:'executor-replay',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
      loginomUrl:'http://loginom.invalid/app',replayBootstrap:mode!=='product',replayLoginUser:mode==='product'?null:'test-2',
      ...(mode==='product'?{resultProfile:'user-v1'}:mode==='normal'?{closeSavedPackageOnShutdown:true}:{acceptanceCleanupPackage:path})},session);
    client=new AgentClient({name:'test',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
    if(scenario!=='unprepared'){
      const prep=await client.callTool({name:'dock_prepare',arguments:{}});assert.notEqual(prep.isError,true,JSON.stringify(prep));
      if(!scenario.endsWith('no-save')){
        const saved=await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'own-save'}});
        const values=saved.content.filter(c=>c.type==='text').map(c=>{try{return JSON.parse(c.text);}catch{return {};}});
        assert.equal(values[0].status,'SUCCEEDED');if(!scenario.startsWith('product-'))assert.deepEqual(values[0].output,{package_ref:{path}});
        const advice=values.find(v=>v.kind==='dock_saved_package_state');assert.ok(advice);
        assert.equal(advice.modified,scenario==='state-unavailable'?null:scenario==='dirty-after-save');
        if(scenario==='dirty-after-save'){
          assert.equal(advice.next_step.arguments.action_key,'package.save_checkpoint');assert.equal(advice.next_step.arguments.parameters.path,path);
          const second=await client.callTool({name:advice.next_step.tool,arguments:{...advice.next_step.arguments,operation_id:'own-save-2'}});
          const clean=second.content.map(c=>{try{return JSON.parse(c.text);}catch{return {};}}).find(v=>v.kind==='dock_saved_package_state');
          assert.equal(clean.modified,false);assert.equal(clean.next_step,undefined);assert.equal(f.saves,2);
        }
      }
    }
    let expectedSave=scenario==='dirty-after-save'?'own-save-2':'own-save';
    if(['latest-same-path','older-save-retry','inspected-older-save'].includes(scenario)){
      const newer=await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_as',parameters:{path:secondPath},operation_id:'newer-save'}});
      assert.notEqual(newer.isError,true,JSON.stringify(newer));expectedSave='newer-save';
      if(scenario==='latest-same-path'){
        await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'latest-save'}});expectedSave='latest-save';
      }
      if(scenario==='older-save-retry')await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'own-save'}});
      if(scenario==='inspected-older-save')await client.callTool({name:'dock_operation_inspect',arguments:{operation_id:'own-save'}});
    }
    if(scenario==='failed-new-save')await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_as',parameters:{path:secondPath},operation_id:'failed-save'}});
    if(scenario==='changed-document')session.metadata.workspacePreparation.state.document_id='other-doc';
    if(scenario==='product-multiple-paths'){
      const second=await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path:'/test-2/packages/second.lgp'},operation_id:'own-save-2'}});
      assert.notEqual(second.isError,true,JSON.stringify(second));
    }
    f.busy=scenario.endsWith('busy');f.unsettled=scenario==='product-unsettled';f.workChecks=0;
    if(scenario.endsWith('evidence-directory'))await mkdir(join(directory,mode==='normal'?'saved-package-cleanup.json':'package-cleanup.json'));
    if(scenario.endsWith('journal-directory')){
      await rm(join(directory,'execution-events.jsonl'));await mkdir(join(directory,'execution-events.jsonl'));
    }
    const first=bridge.close();assert.equal(bridge.close(),first);const result=await first;
    if(scenario.endsWith('evidence-directory')||scenario.endsWith('journal-directory')){
      assert.equal(result.package_cleanup.status,'BLOCKED');assert.equal(result.package_cleanup.reason,'CLEANUP_EVIDENCE_UNCONFIRMED');
      assert.equal(result.browser_transport_closed,true);assert.equal(f.events.includes('browser-close'),true);return;
    }
    if(['product-no-save','product-multiple-paths'].includes(scenario)){
      assert.equal(result.package_cleanup,undefined);assert.equal(result.browser_transport_closed,true);
      assert.equal(f.events.includes('package-cleanup'),false);
      await assert.rejects(readFile(join(directory,'package-cleanup.json'),'utf8'),{code:'ENOENT'});return;
    }
    const receipt=JSON.parse(await readFile(join(directory,mode==='normal'?'saved-package-cleanup.json':'package-cleanup.json'),'utf8'));
    if(['product-native-blocked','product-native-error','product-native-malformed'].includes(scenario)){
      assert.equal(receipt.status,'BLOCKED');assert.equal(result.package_cleanup.status,'BLOCKED');
      assert.equal(result.browser_transport_closed,true);assert.equal(f.events.includes('package-cleanup'),true);return;
    }
    if(['product-unsettled','product-gate-unsettled','product-busy'].includes(scenario)){
      assert.equal(receipt.status,'BLOCKED');assert.equal(result.browser_transport_closed,true);
      assert.equal(f.events.includes('package-cleanup'),false);return;
    }
    if(mode==='normal'){
      assert.equal(receipt.policy,'last_confirmed_own_save');
      assert.equal(receipt.package_path,scenario==='unprepared'||scenario==='no-save'?null:f.path);
      assert.equal(receipt.save_operation_id,scenario==='unprepared'||scenario==='no-save'?null:expectedSave);
      await assert.rejects(readFile(join(directory,'package-cleanup.json')),{code:'ENOENT'});
      const journal=(await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
      assert.equal(journal.filter(row=>row.event==='managed_saved_package_cleanup').length,1);
      assert.equal(journal.some(row=>row.event==='isolated_package_cleanup'),false);
    }
    if(['success','unprepared','dirty-after-save','state-unavailable','product-success','latest-same-path','older-save-retry','inspected-older-save','failed-new-save'].includes(scenario)){
      assert.equal(result.browser_transport_closed,true);assert.equal(result.clipboard_leases_retained,0);
      assert.equal(receipt.status,scenario!=='unprepared'?'SUCCEEDED':'SKIPPED_UNPREPARED');
      if(scenario!=='unprepared')assert.ok(f.events.indexOf('package-cleanup')<f.events.indexOf('browser-close'));
      else assert.equal(f.events.includes('package-cleanup'),false);
      assert.ok(f.events.indexOf('browser-close')<f.events.indexOf('release-uploads'));
    }else{
      assert.equal(result.browser_transport_closed,mode==='normal');assert.equal(receipt.status,'BLOCKED');
      assert.equal(f.events.includes('browser-close'),mode==='normal');assert.equal(f.events.includes('release-uploads'),mode==='normal');
      assert.equal(f.events.includes('package-cleanup'),!['no-save','busy','changed-document'].includes(scenario));
    }
    assert.equal(f.events.filter(e=>e==='package-cleanup').length,['unprepared','no-save','busy','changed-document'].includes(scenario)?0:1);
    if(f.cleanupOptions){
      assert.equal(f.cleanupOptions.packagePath,f.path);assert.equal(f.cleanupOptions.diagnosticDiscard,false);
      assert.equal(f.cleanupOptions.diagnosticReadOnly,false);assert.equal(f.cleanupOptions.sessionId,'own-session');
      assert.equal(f.cleanupOptions.documentId,'own-doc');assert.equal(f.cleanupOptions.account,'test-2');
    }
  }finally{try{await client?.close();await bridge?.close();}finally{await rm(directory,{recursive:true,force:true});}}
});

for(const scenario of ['generated-id','reconciled-own','reconciled-older','reconciled-not-admitted','noeffect-retry','validation-retry','changed-document-reconciled',
 'foreign-id','wrong-path','wrong-action','unresolved-inspection','unclean-inspection','unknown-inspection'])
 test('normal shutdown binds only an admitted confirmed Save: '+scenario,async t=>{
  const directory=await mkdtemp(join(tmpdir(),'cleanup-save-admission-'));
  const resources=await createBundledSkillFixture(t),catalog=await createActionCatalogFixture(target);
  const f=current={scenario,events:[],busy:false,saves:0,path,receipts:new Map(),loseId:scenario==='generated-id'?null:'own-save',catalog};
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
   metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},artifactStore:{list:()=>[],async releaseUploads(){}}};
  const bridge=await createBridge({resources:resources.resources,actionManifestUri:catalog.manifestUri,actionManifestSha256:catalog.manifestSha256,
   mode:'executor-replay',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
   loginomUrl:'http://loginom.invalid/app',replayBootstrap:true,replayLoginUser:'test-2',closeSavedPackageOnShutdown:true},session);
  const client=new AgentClient({name:'save-admission',version:'1'});
  try{
   const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
   await client.callTool({name:'dock_prepare',arguments:{}});
   const response=await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},
    ...(scenario==='generated-id'?{}:{operation_id:'own-save'})}});
   const save=JSON.parse(response.content[0].text);
   assert.equal(save.status,scenario==='generated-id'?'SUCCEEDED':'AMBIGUOUS');
   assert.equal(typeof save.operation_id,'string');
   if(scenario==='reconciled-older')
    await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_as',parameters:{path:secondPath},operation_id:'newer-save'}});
   if(['reconciled-not-admitted','noeffect-retry','validation-retry'].includes(scenario)){
    if(scenario==='reconciled-not-admitted')f.returnOlderOnce='deferred-save';
    if(scenario==='noeffect-retry')f.refuseOnce='deferred-save';
    if(scenario==='validation-retry')f.throwOnce='deferred-save';
    const args={action_key:'package.save_checkpoint',parameters:{path},operation_id:'deferred-save'};
    await client.callTool({name:'dock_action_run',arguments:args});
    await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_as',parameters:{path:secondPath},operation_id:'newer-save'}});
    await client.callTool({name:'dock_action_run',arguments:args});
   }
   if(scenario==='changed-document-reconciled')session.metadata.workspacePreparation.state.document_id='foreign-doc';
   if(scenario!=='generated-id'){
    const outcome=structuredClone(f.receipts.get('own-save'));
    if(['foreign-id','unknown-inspection'].includes(scenario))outcome.operation_id='foreign-save';
    if(scenario==='wrong-path')outcome.output.package_ref.path=secondPath;
    if(scenario==='wrong-action')outcome.action_key='package.save_as';
    f.inspection={status:'SUCCEEDED',action_key:'operation.inspect',operation_id:scenario==='unknown-inspection'?'foreign-save':'own-save',
     output:{state:scenario==='unresolved-inspection'?'pending':'resolved',cleanup_confirmed:scenario!=='unclean-inspection',outcome}};
    await client.callTool({name:'dock_operation_inspect',arguments:{operation_id:scenario==='unknown-inspection'?'foreign-save':'own-save'}});
   }
   const closed=await bridge.close();
   const cleanup=JSON.parse(await readFile(join(directory,'saved-package-cleanup.json'),'utf8'));
   const accepted=['generated-id','reconciled-own','reconciled-older','reconciled-not-admitted','noeffect-retry','validation-retry'].includes(scenario);
   assert.equal(closed.browser_transport_closed,true);
   assert.equal(cleanup.status,accepted?'SUCCEEDED':'BLOCKED');
   assert.equal(cleanup.save_operation_id,accepted?(scenario==='reconciled-older'?'newer-save'
    :['reconciled-not-admitted','noeffect-retry','validation-retry'].includes(scenario)?'deferred-save':save.operation_id):null);
   assert.equal(cleanup.package_path,accepted?(scenario==='reconciled-older'?secondPath:path):null);
   assert.equal(f.events.filter(event=>event==='package-cleanup').length,accepted?1:0);
   if(!accepted)assert.equal(closed.package_cleanup.reason,'CONFIRMED_SAVE_REQUIRED');
  }finally{await client.close();await bridge.close();await rm(directory,{recursive:true,force:true});}
 });

for(const scenario of ['draft-clean','draft-dirty','draft-busy','draft-unsettled','draft-not-owned','draft-persisted','draft-cancelled-unverified','draft-cancelled-not-owned','draft-cancelled-no-tab','draft-cancelled-persisted'])
 test('normal shutdown of an unsaved draft without Save: '+scenario,async t=>{
  const directory=await mkdtemp(join(tmpdir(),'cleanup-draft-'));
  const resources=await createBundledSkillFixture(t),catalog=await createActionCatalogFixture(target);
  const f=current={scenario,events:[],busy:false,saves:0,path:null,receipts:new Map(),catalog};
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){}}};
  const bridge=await createBridge({resources:resources.resources,actionManifestUri:catalog.manifestUri,actionManifestSha256:catalog.manifestSha256,
    mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
    loginomUrl:'http://loginom.invalid/app',replayBootstrap:true,replayLoginUser:'test-2',closeSavedPackageOnShutdown:true},session);
  const client=new AgentClient({name:'draft-cleanup',version:'1'});
  try{
    const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
    await client.callTool({name:'dock_prepare',arguments:{intent:'new_draft'}});
    const state=session.metadata.workspacePreparation.state;
    state.package_ref={path:null,persisted:scenario==='draft-persisted'};
    if(scenario==='draft-not-owned')state.created_draft=false;
    if(scenario.startsWith('draft-cancelled-')){
      session.metadata.workspaceReady=false;session.metadata.targetIdentity=null;
      state.status='NOT_READY';state.reason='CANCELLED';
      if(scenario==='draft-cancelled-unverified')state.target_verified=false;
      if(scenario==='draft-cancelled-not-owned')state.ownership_verified=false;
      if(scenario==='draft-cancelled-no-tab')delete state.workflow_ref;
      if(scenario==='draft-cancelled-persisted')state.package_ref.persisted=true;
    }
    f.busy=scenario==='draft-busy';f.unsettled=scenario==='draft-unsettled';
    const result=await bridge.close();
    assert.equal(result.browser_transport_closed,true);assert.equal(f.saves,0);
    assert.equal(result.package_cleanup.status,scenario==='draft-clean'?'SUCCEEDED':'BLOCKED');
    assert.equal(f.events.includes('package-cleanup'),['draft-clean','draft-dirty'].includes(scenario));
    if(f.cleanupOptions){
      assert.equal(f.cleanupOptions.unsavedDraft,true);assert.equal(f.cleanupOptions.packagePath,null);
      assert.equal(f.cleanupOptions.diagnosticDiscard,false);
    }
    if(scenario==='draft-clean'){
      assert.equal(result.package_cleanup.package_closed,true);assert.equal(result.package_cleanup.logged_out,true);
      assert.equal(result.package_cleanup.policy,'unsaved_draft');
    }
  }finally{await client.close();await bridge.close();await rm(directory,{recursive:true,force:true});}
 });

for(const dirty of [false,true])test('SIGINT shutdown waits for admitted prepare and protects dirty draft: '+dirty,async t=>{
  const directory=await mkdtemp(join(tmpdir(),'cleanup-interrupt-'));
  const resources=await createBundledSkillFixture(t),catalog=await createActionCatalogFixture(target);
  const f=current={scenario:dirty?'draft-dirty':'draft-clean',events:[],busy:false,saves:0,path:null,receipts:new Map(),catalog,
    preparing:Promise.withResolvers(),finishPreparation:Promise.withResolvers()};
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){}}};
  const bridge=await createBridge({resources:resources.resources,actionManifestUri:catalog.manifestUri,actionManifestSha256:catalog.manifestSha256,
    mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
    loginomUrl:'http://loginom.invalid/app',replayBootstrap:true,replayLoginUser:'test-2',closeSavedPackageOnShutdown:true},session);
  const client=new AgentClient({name:'interrupt-cleanup',version:'1'});
  try{
    const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
    const controller=new AbortController();
    const pending=client.callTool({name:'dock_prepare',arguments:{intent:'new_draft'}},undefined,{signal:controller.signal}).catch(()=>null);
    await f.preparing.promise;
    assert.equal(session.metadata.workspaceReady,false);
    assert.equal(session.metadata.workspacePreparation.state,undefined);
    controller.abort();await pending;
    await new Promise(resolve=>setImmediate(resolve));
    await client.close();
    const closing=bridge.close();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.events.includes('browser-close'),false);
    f.finishPreparation.resolve();
    const result=await closing;
    assert.equal(session.metadata.workspacePreparation.state.reason,'CANCELLED');
    assert.equal(session.metadata.workspaceReady,false);
    assert.equal(result.browser_transport_closed,true);
    assert.equal(result.package_cleanup.status,dirty?'BLOCKED':'SUCCEEDED');
    assert.equal(result.package_cleanup.policy,'unsaved_draft');
    assert.equal(result.package_cleanup.unsaved_changes_discarded,false);
    assert.equal(f.saves,0);
  }finally{f.finishPreparation.resolve();await client.close();await bridge.close();await rm(directory,{recursive:true,force:true});}
});

// Execute the actual failed-Open binding, OK and native Close in the managed
// bridge regression. Only external Loginom/DOM and its clock are fixtures.
{
const options={sessionId:'own-session',documentId:'own-doc',account:'test-2',
 packagePath:path,loginomUrl:'http://loginom.invalid/app',loginomBuild:'7.4.2',tabTid:'own-tab',timeoutMs:100};
function fixture(overrides = {}) {
  const events = [], state = {clock:Date.now(), avatarClicks:0, avatarBudgets:[], menu:false, account:'test-2', path:options.packagePath, modified:false, running:false,
    count:1, tab:true, dialog:false, loggedOut:false, readonly:false, closeResult:true, ...overrides};
  const fail = stage => {if(state.failStage===stage)throw Error('private upstream failure: do not persist');};
  const timed = (stage, settings) => {
    (state.apiBudgets??=[]).push({stage,timeout:settings.timeout,at:state.clock});
    const elapsed=state.apiElapsed?.[stage]??0;
    state.clock+=Math.min(elapsed,settings.timeout);
    if(elapsed>0&&elapsed>=settings.timeout)throw Object.assign(Error('simulated bounded UI timeout'),{name:'TimeoutError'});
  };
  const node = {DisplayName:'result',get PackageFileName(){return state.path;}, get ReadOnly(){return state.readonly;},
    Package:{}, HasRunningNodes:() => state.running};
  const m = {PackageNodes:{get Count(){return state.count;}, Items:() => node}, HasRunningNodes:() => state.running,
    FServerConnection:{get UserName(){return state.account;}, Connected:true, Session:{IsPackageModified:async () => {
      events.push('modified-read'); if (state.racePath) state.path = state.racePath; if(state.raceReadOnly!==undefined)state.readonly=state.raceReadOnly;
      if(state.raceTab)state.tab=false; if(state.raceTabTid)state.tabTid=state.raceTabTid;
      if(state.maskOnModifiedRead){state.mask=true;state.maskOnModifiedRead=false;}
      state.clock+=state.modifiedReadElapsed??0;
      return state.modified;
    }}}, async ClosePackage(target, suppressEvents, processAfterCall) {
      events.push('close'); assert.equal(target,node); assert.equal(suppressEvents,false); assert.equal(processAfterCall,true);
      if ((state.closePrompt || state.modified)&&!state.closeWithoutPrompt) { state.dialog=true; return new Promise(resolve => {
        state.confirm=()=>{state.count=0;state.tab=false;state.dialog=false;resolve(true);};
      }); }
      if (state.closeThrows) throw Error('upstream private failure');
      if (state.closeResult) { state.count=0; state.tab=false; }
      return state.closeResult;
    }};
  const dialog = {getBoundingClientRect:() => ({x:0,y:0,width:10,height:10}),getAttribute:()=>'fixture-mask',closest:()=>dialog};
  const tab = {getAttribute:() => state.tabTid ?? options.tabTid};
  const doc = {querySelectorAll:query => {
    if(query.includes('MF;AppMenuForm'))return state.menu ? Array(state.menuCount??1).fill(dialog) : [];
    if(query.includes('btnAvatar'))return state.avatarAbsent ? [] : [dialog];
    // Timeout adds a plain backdrop; initial masks also expose busy markers.
    return state.dialog || state.mask && (query.split(',').includes('.x-mask') || !state.maskAfterTimeout) ? [dialog] : [];
  }, contains:value => value === tab && state.tab,elementFromPoint:()=>dialog};
  const context = vm.createContext({document:doc, location:{origin:'http://loginom.invalid'},
    ownedPackage:state.foreignPreparedPackage ? {} : node, ownedTab:tab,
    getComputedStyle:() => ({visibility:'visible'}), bg:{app:{Version:'7.4.2', Application:{FInstance:{FMainForm:{FMapTree:m}}}}}});
  vm.runInContext(`globalThis.__loginomDockPreparationV1={document,id:'own-doc',receipts:new Map([['prepare',{request:JSON.stringify({session:'owned-session'}),packageNode:ownedPackage,tab:ownedTab}]])}`,context);
  const locator = query => ({
    locator:() => locator(query+' input'),
    async waitFor(settings) {
      assert.ok(settings.timeout > 0 && settings.timeout <= (state.timeoutMs??options.timeoutMs));
      timed(query.includes('LoginForm')?'login_form_wait':'tab_detach',settings);
      fail(query.includes('LoginForm')?'login_form_wait':'tab_detach');
      events.push(query.includes('LoginForm') ? 'login-visible' : 'tab-detached');
      if (query.includes('LoginForm') ? !state.loggedOut : state.tab) throw Error('UI wait failed');
    }, async click(settings) {
      assert.ok(settings.timeout > 0 && settings.timeout <= (state.timeoutMs??options.timeoutMs));
      timed(query.includes('tlb;no')?'discard_click':query.includes('btnLogOut')?'logout_click':'logout_menu_open',settings);
      fail(query.includes('tlb;no')?'discard_click':query.includes('btnLogOut')?'logout_click':'logout_menu_open');
      if (query.includes('tlb;no')) {events.push('discard');state.confirm();}
      else if (query.includes('btnLogOut')) { events.push('logout'); state.loggedOut=true; }
      else {
        state.avatarClicks++; state.avatarBudgets.push(settings.timeout); events.push('avatar');
        if(state.avatarTimeouts >= state.avatarClicks){
          state.clock += state.avatarElapsed??(state.timeoutMs??options.timeoutMs);
          if(state.menuAfterTimeout)state.menu=true;
          if(state.maskAfterTimeout)state.mask=true;
          if(state.dialogAfterTimeout)state.dialog=true;
          if(state.accountAfterTimeout)state.account=state.accountAfterTimeout;
          throw Object.assign(Error('private click timeout'),{name:'TimeoutError'});
        }
        state.menu=true;
      }
    }, async count(){return state.dialog?1:0;},
    async innerText(){fail('logout_account_readback');return query.includes('cnt;cnt;cmp')?(state.prompt??'Сохранить изменения в пакете "result"?'):state.account;},
    async isVisible(){fail('logout_readback');return !state.loggedOut;},
  });
  const page = {locator,
    async waitForTimeout(ms){
      if(events.includes('close')){
        (state.diagnosticWaitBudgets??=[]).push(ms);
        return new Promise(resolve=>{const timer=setTimeout(resolve,ms);timer.unref?.();});
      }
      assert.ok(ms>0&&ms<=100);events.push('idle-wait');state.clock+=state.idleElapsed??ms;
      if(state.clearBlocker){state.mask=false;state.dialog=false;}
      Object.assign(state,state.idleChange??{});
      if(state.changePreparation)context.__loginomDockPreparationV1.id='foreign-document';
    },
    async evaluate(fn,arg){
      if(state.failDiagnostic&&fn.toString().includes("s?.document!==document"))throw Error('Diagnostic transport unavailable');
      if(state.diagnosticDelay&&fn.toString().includes("s?.document!==document"))await new Promise(resolve=>setTimeout(resolve,state.diagnosticDelay));
      if(fn.toString().includes('m.ClosePackage(node, false, true)'))fail('close_request');
      if(fn.toString().includes('remaining:globalThis'))fail('close_readback');
      if(fn.toString().includes('m?.PackageNodes?.Count === 0'))fail('logout_inventory_readback');
      return vm.runInContext('('+fn.toString()+')',context)(arg);
    },
    async waitForFunction(fn,arg,settings){
      assert.ok(settings.timeout > 0 && settings.timeout <= (state.timeoutMs??options.timeoutMs));
      timed(fn.toString().includes('const menu =')?'logout_observe':fn.toString().includes('globalThis.__loginomDockCleanupV1?.done === true')?'discard_close_wait':'close_wait',settings);
      if(fn.toString().includes('const menu =')){
        events.push('logout-observe'); state.observeTimeout=settings.timeout;
        for(let i=0;i<2;i++){
          const value=await this.evaluate(fn,arg);
          if(value)return {jsonValue:async()=>value,dispose:async()=>{}};
          if(state.clearMask){state.mask=false;state.clock+=state.maskElapsed??10;}
        }
        throw Error('observation timeout');
      }
      fail('close_wait');for(let i=0;i<8;i++){if(await this.evaluate(fn,arg))return;await Promise.resolve();}throw Error('timeout');
    },
  };
  const Clock = class extends Date {static now(){return state.clock;}};
  return {state,events,context,page, run:changed => {
    const code=makePackageCleanupCode({...options,timeoutMs:state.timeoutMs??options.timeoutMs,...changed});
    state.deadline=Number(code.match(/,(\d+)\)$/)[1]);
    state.clock=state.deadline-30000;
    context.Date=Clock;
    return vm.runInNewContext('('+code+')',{Date:Clock})(page);
  }};
}
function failedOpenFixture(fault='none') {
 const f=fixture(),c=f.context,m=c.bg.app.Application.FInstance.FMainForm.FMapTree;
 const node=m.PackageNodes.Items(0),tab=c.ownedTab,r=c.__loginomDockPreparationV1.receipts.get('prepare');
 f.state.tabTid='MF;cntMain;cntWorkspace;Workspace;t.br;tb-1';tab.classList={contains:()=>true};
 const element=(tid,text='')=>({id:tid,isConnected:true,textContent:text,innerText:text,getAttribute:()=>tid,
  contains(e){return e===this;},closest(){return null;},matches:()=>false,
  getBoundingClientRect:()=>({x:100,y:100,width:200,height:100})});
 const root=element('MF;TF-1'),error=element('msgbox'),body=element('messages',"Cannot read properties of undefined (reading 'TestableCellRenderer')"),ok=element('msgbox;tlb;ok','OK');
 f.state.mask=true;f.state.openError=true;f.state.dismissals=0;
 root.matches=()=>f.state.mask;root.contains=e=>e===root;
 error.contains=e=>[error,body,ok].includes(e);
 for(const e of [error,body,ok])e.getBoundingClientRect=()=>({x:100,y:100,width:f.state.openError?200:0,height:f.state.openError?100:0});
 const native={$className:'bg.app.view.TabForm',el:{dom:root},hidden:false,closable:true,Controller:{Node:{data:{node}}}};
 const message={el:{dom:error}},messages={el:{dom:body}},info={};
 const instance={FMessageBox:message,FMessages:messages,FErrorMessageInfo:info};
 const button={el:{dom:ok},disabled:false,ownerCt:message};
 c.bg.ext={errormessage:{ErrorMsg:{FInstance:instance}}};
 c.Ext={getCmp:id=>id===root.id?native:id===error.id?message:id===ok.id?button:null};
 c.innerWidth=1280;c.innerHeight=800;
 c.bg.app.Application.FInstance.FMainForm.Items={Workspace:{getActiveTab:()=>native}};
 const query=c.document.querySelectorAll;
 c.document.querySelectorAll=q=>q.startsWith('[data-tid^="MF;cntMain;cntWorkspace')?[tab]:
  q==='[data-tid="MF;TF-1"]'?[root]:q==='.bg-error-messages'?[body]:q==='[data-tid="msgbox;tlb;ok"]'?[ok]:
  q==='[data-tid^="msgbox;tlb;"]'?(fault==='confirmation'?[ok,element('msgbox;tlb;yes')]:[ok]):
  q.startsWith('[role="dialog"]')?[...(f.state.mask?[root]:[]),...(f.state.openError?[error]:[]),...(fault==='foreign dialog'?[element('foreign')]:[])]:query(q);
 c.document.elementFromPoint=()=>fault==='covered'?element('cover'):ok;
 Object.assign(r,{request:JSON.stringify({session:options.sessionId,intent:'open_package',packagePath:options.packagePath}),phase:'effect_possible',before:[],openSubmitted:true,
  openAccount:options.account,openConnection:m.FServerConnection,openServerSession:m.FServerConnection.Session,packageInventoryBefore:0,
  openError:{instance,message,root:error,messages,info,element:body}});
 delete r.tab;delete r.packageNode;
 if(fault==='unknown error')body.textContent='Unknown error';
 if(fault==='unbound error')delete r.openError;
 if(fault==='changed native')instance.FErrorMessageInfo={};
 if(fault==='foreign account')f.state.account='foreign';
 if(fault==='dirty')f.state.modified=true;
 if(fault==='running')f.state.running=true;
 const wait=f.page.waitForTimeout;
 f.page.waitForTimeout=async ms=>{
  if(ms>100)return new Promise(()=>{});
  await wait(ms);
  if(!['permanent mask','late modal'].includes(fault))f.state.mask=false;
  if(fault==='late modal'){f.state.openError=false;f.state.mask=false;}
  if(fault==='session after wait')m.FServerConnection.Session={};
  if(fault==='late wait')f.state.clock+=30000;
 };
 ok.click=()=>{f.state.dismissals++;f.events.push('error-ok');if(fault!=='late modal')f.state.openError=false;
  if(fault==='lost click')throw Error('lost OK reply');
  if(fault==='late click')f.state.clock+=30000;
 };
 f.page.mouse={async click(){return ok.click();}};
 return {...f,runCode:async code=>{
  const deadline=code.match(/deadline=(\d+)/)?.[1];
  if(deadline){f.state.deadline=Number(deadline);f.state.clock=f.state.deadline-30000;}
  c.Date=class extends Date {static now(){return f.state.clock;}};
  return vm.runInContext('('+code+')',c)(f.page);
 }};
}

for(const intent of ['open_package','new_draft'])for(const scenario of ['clean','sole-tab','foreign-account','replacement-session','foreign-operation','wrong-path','dirty','persistent-window','unknown-error','replacement-after-binding','document-after-binding','busy','unsettled'])
test('managed shutdown reconciles its rejected preparation: '+intent+' '+scenario,async t=>{
 const directory=await mkdtemp(join(tmpdir(),'cleanup-rejected-open-'));
 const resources=await createBundledSkillFixture(t),catalog=await createActionCatalogFixture(target);
 const native=failedOpenFixture('late modal'),c=native.context;
 native.state.timeoutMs=8000;
 const receipt=c.__loginomDockPreparationV1.receipts.get('prepare'),error=receipt.openError;
 if(intent==='new_draft'){
  receipt.request=JSON.stringify({session:'own-session',intent});
  receipt.draftSubmitted=true;delete receipt.openSubmitted;
  native.state.path=null;
 }
 // LAB-591 native-messagebox.json: four controls, exactly one OK response.
 const extras=[['DetailPanel;btnDetais','Технические подробности'],['DetailPanel;btnMailto','Сообщить об ошибке'],['b','']]
  .map(([tid,label])=>({getAttribute:()=>tid,innerText:label,getBoundingClientRect:()=>({width:20,height:10})}));
 const query=c.document.querySelectorAll,contains=error.root.contains;
 error.root.contains=e=>extras.includes(e)||contains(e);
 c.document.querySelectorAll=q=>q==='[data-tid^="DetailPanel;"]'?extras.slice(0,2):q==='[data-tid="b"]'?[extras[2]]:query(q);
 const wait=native.page.waitForTimeout;
 native.page.waitForTimeout=async ms=>{
  await wait(ms);
  if(ms<=100&&scenario==='persistent-window')native.state.openError=true;
 };
 // Missing Package must settle. A sole tab stays nonclosable even when ready.
 const rootComponent=c.Ext.getCmp('MF;TF-1');
 const packageNode=c.bg.app.Application.FInstance.FMainForm.FMapTree.PackageNodes.Items(0),modelPackage=packageNode.Package;
 if(['clean','sole-tab'].includes(scenario))rootComponent.closable=false;
 if(scenario==='clean')packageNode.Package=undefined;
 const settle=native.page.waitForTimeout;let settlementReads=0;
 native.page.waitForTimeout=async ms=>{
  await settle(ms);
  if(ms<=100){
   settlementReads++;
   if(scenario==='clean'&&settlementReads>=2){rootComponent.closable=true;packageNode.Package=modelPackage;}
  }
 };
 if(scenario==='foreign-account')native.state.account='foreign';
 if(scenario==='replacement-session')c.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.Session={};
 if(scenario==='foreign-operation')receipt.request=JSON.stringify({session:'foreign-session',intent:'open_package',packagePath:path});
 if(scenario==='wrong-path')receipt.request=JSON.stringify({session:'own-session',intent:'open_package',packagePath:secondPath});
 if(scenario==='dirty')native.state.modified=true;
 if(scenario==='unknown-error')error.element.textContent='Unknown error';
 const runCode=native.runCode;
 native.runCode=async code=>{
  const result=await runCode(code);
  if(result?.operation_id==='prepare'){
   if(scenario==='replacement-after-binding')c.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.Session={};
   if(scenario==='document-after-binding')c.__loginomDockPreparationV1.id='replacement-document';
  }
  return result;
 };
 const f=current={scenario,events:[],busy:false,saves:0,path,receipts:new Map(),catalog,native,failedDraft:intent==='new_draft'};
 const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
  metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
  artifactStore:{list:()=>[],async releaseUploads(){}}};
 const bridge=await createBridge({resources:resources.resources,actionManifestUri:catalog.manifestUri,actionManifestSha256:catalog.manifestSha256,
  mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
  loginomUrl:'http://loginom.invalid/app',replayBootstrap:false,replayLoginUser:null,closeSavedPackageOnShutdown:true},session);
 const client=new AgentClient({name:'failed-open-cleanup',version:'1'});
 try{
  const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
  const response=await client.callTool({name:'dock_prepare',arguments:{intent,...(intent==='open_package'?{package_path:path}:{}),operation_id:'prepare'}});
  assert.ok(session.metadata.workspacePreparation,JSON.stringify(response));
  const prepared=session.metadata.workspacePreparation.state;
  assert.equal(prepared.status,'NOT_READY');assert.equal(prepared.document_id,undefined);assert.equal(prepared.loginom_account,undefined);
  f.busy=scenario==='busy';f.unsettled=scenario==='unsettled';
  const result=await bridge.close(),success=['clean','sole-tab'].includes(scenario);
  assert.equal(result.package_cleanup.status,success?'SUCCEEDED':'BLOCKED',JSON.stringify(result.package_cleanup));
  assert.equal(session.metadata.workspaceReady,false);assert.equal(f.saves,0);
  assert.equal(native.state.dismissals,success||['dirty','persistent-window'].includes(scenario)?1:0);
  assert.equal(native.events.filter(e=>e==='close').length,success?1:0);
  assert.equal(native.events.filter(e=>e==='logout').length,success?1:0);
  assert.equal(result.package_cleanup.unsaved_changes_discarded??false,false);
  if(success){
   assert.ok(settlementReads>=(scenario==='clean'?2:1));
   if(scenario==='sole-tab')assert.equal(rootComponent.closable,false);
   assert.equal(result.package_cleanup.package_path,intent==='new_draft'?null:path);assert.equal(result.package_cleanup.document_id,'own-doc');
   assert.equal(result.package_cleanup.account,'test-2');assert.equal(result.package_cleanup.package_closed,true);
   assert.equal(result.package_cleanup.logged_out,true);assert.equal(result.package_cleanup.policy,intent==='new_draft'?'unsaved_draft':'opened_saved_package');
   assert.ok(native.events.indexOf('error-ok')<native.events.indexOf('idle-wait'));
   assert.ok(native.events.indexOf('idle-wait')<native.events.indexOf('close'));
   assert.ok(native.events.indexOf('close')<native.events.indexOf('logout'));
   await closeManagedResources({bridge},[]);
  }else await assert.rejects(closeManagedResources({bridge},[]),/LOGINOM_RUNTIME_CLEANUP_FAILED/);
 }finally{await client.close();await bridge.close();await rm(directory,{recursive:true,force:true});}
});
}
