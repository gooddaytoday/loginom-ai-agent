import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client as AgentClient} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createExecutionJournal,journalCopy} from '../../lib/execution-journal.mjs';
import * as executor from '../../lib/executor.mjs';
import * as workspace from '../../lib/workspace.mjs';
import {createBundledSkillFixture} from './bundled-skill-fixture.mjs';
import {linkPage,runtime} from './executor-fixture.mjs';
import {createActionCatalogFixture} from './action-catalog-fixture.mjs';

// Exercise the production Save executor against a deterministic Loginom page.
// The bridge owns the save-state reread, the lease and the recovery receipt.
const target={profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'};
const path='/user/data/packages/result.lgp';
const f={stateReads:0,modified:false};
class ExternalClient {
  constructor(identity){this.browser=identity.name==='loginom-dock-browser';}
  async connect(t){this.transport=t;}
  async close(){this.transport?.onclose?.();}
  async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]};}
  async callTool(request){
    if(!this.browser)return {content:[{type:'text',text:f.catalog.files.get(request.arguments.uris[0])}]};
    const code=request.arguments.code;
    let value;
    if(code.includes('async function prepareWorkspace')){
      f.prepares++;
      const bind=code.includes('"bindOpenOnly":true');
      value={status:'READY',authenticated:true,target_verified:true,target,loginom_account:'user',document_id:f.documentId,
        created_draft:!bind,effect_possible:!bind,workflow_ref:{tab_tid:bind?f.page.tabTid:f.tabTid,prefix:'own',
          workflow_id:'own-workflow',navigation_path:[]},package_ref:{path:bind?f.page.packagePath:null}};
    }
    else if(code.includes('async function observeGeometry'))value={version:1,source:'prepare_same_browser_page',observed:{document_id:f.documentId}};
    else if(code.includes('browser_recovery_page'))
      return {content:[{type:'text',text:JSON.stringify(JSON.stringify({kind:'browser_recovery_page',pages:1,origin:'http://loginom.invalid',document_id:f.documentId,tab_present:true}))}]};
    else if(code.includes('function readSavedPackageState')){
      // The first read after Save is lost; the recovery reread succeeds.
      if(f.failedReads.includes(++f.stateReads))throw Error('Read response lost');
      value={version:1,session_id:'own-session',document_id:f.documentId,account:'user',package_path:f.page?.packagePath??path,
        modified:f.page?JSON.stringify(f.page.nodes)!==JSON.stringify(f.page.storage.get(f.page.packagePath).nodes):f.modified,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false};
    } else throw Error('Unexpected browser code');
    return {content:[{type:'text',text:JSON.stringify(value)}]};
  }
}
class ExternalTransport{}
mock.module(new URL('../../lib/execution-journal.mjs',import.meta.url).href,{namedExports:{journalCopy,createExecutionJournal:options=>{
  const record=createExecutionJournal(options);
  return (event,...args)=>f.failedPhase&&event.phase===f.failedPhase
    ?Promise.reject(Object.assign(Error('No space left'),{code:'ENOSPC'})):record(event,...args);
}}});
mock.module('@modelcontextprotocol/sdk/client/index.js',{namedExports:{Client:ExternalClient}});
mock.module('@modelcontextprotocol/sdk/client/stdio.js',{namedExports:{StdioClientTransport:ExternalTransport,getDefaultEnvironment:()=>({})}});
mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js',{namedExports:{StreamableHTTPClientTransport:ExternalTransport}});
mock.module(new URL('../../lib/workspace.mjs',import.meta.url).href,{namedExports:{...workspace,
  makeWorkspacePrepareCode:options=>workspace.makeWorkspacePrepareCode({...options,platform:'darwin'})}});
mock.module(new URL('../../lib/executor.mjs',import.meta.url).href,{namedExports:{...executor,createActionRuntime:()=>({
  tools:executor.executorTools,describe:()=>({actions:[],node_types:[],available_node_types:[]}),assertPreparationAllowed(){},hasUnsettledWork:()=>false,hasActiveWork:()=>false,async cleanupServerCache(){},closeArtifactDeliveries:async()=>{},
  run:async(key,parameters,{operationId})=>{
    if(f.page){
      const outcome=await f.engine.run(key,parameters,{operationId});
      f.saved=outcome;
      if(f.modified)f.page.addNode('Unsaved edit',0,0);
      return f.foreignReceipt?{...outcome,operation_id:'previous-save'}:outcome;
    }
    f.saved={status:'SUCCEEDED',action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}};
    return f.lost?{...f.saved,status:'AMBIGUOUS',output:{}}:f.saved;
  },
  inspect:async({operationId})=>f.page?f.engine.inspect({operationId}):({status:'SUCCEEDED',action_key:'operation.inspect',operation_id:operationId,
    output:{state:'resolved',cleanup_confirmed:true,outcome:f.saved}}),
  browserRecoveryBasis(){throw Error('No browser recovery trigger for this operation');},
})}});
const {createBridge}=await import('../../lib/bridge.mjs');

const superseded=['newer confirmed Save','newer unreadable Save','newer preparation','newer document'];
for(const scenario of ['P5','external failure','foreign package','foreign receipt','marker write failure','observation write failure','control',
  ...superseded,'newer ambiguous Save','ambiguous Save before preparation','late confirmation after preparation','no-effect Save','later proven no-effect Save','repeat confirms no-effect Save','implicit inspect confirms no-effect Save','confirmed reread'])
test('a confirmed Save followed by an independent read: '+scenario,async t=>{
  const ambiguous=['newer ambiguous Save','ambiguous Save before preparation','late confirmation after preparation'].includes(scenario);
  const noEffect=scenario.includes('no-effect Save');
  const modified=scenario==='external failure';
  f.documentId='own-doc';f.tabTid='own-tab';f.stateReads=0;f.prepares=0;f.modified=modified;f.lost=false;
  f.failedReads=ambiguous?[1,2,3]:scenario==='newer unreadable Save'?[1,2]:modified||superseded.includes(scenario)||noEffect||scenario==='confirmed reread'?[1]:[];
  f.foreignReceipt=scenario==='foreign receipt';f.page=linkPage();f.engine=runtime(f.page,{execute:async code=>{
    const result=await f.page.execute(code);
    // Supply the native identity attestation at the bridge boundary after the fixture's verified reopen.
    if(ambiguous&&result.operation_id==='own-save'&&result.output?.reopened===true)
      result.trace.push({event:'save_continuations_observed',reopened:true,native_identity_verified:true,continuations:[]});
    if(f.lost&&result.operation_id==='blocked-save'&&result.phase!=='prepared'&&result.effect_possible===false){
      f.lost=false;
      throw Error('Save refusal response was lost');
    }
    if(ambiguous&&result.operation_id==='other-save'&&result.output?.save_completed===true)
      throw Error('Save completed but its response was lost');
    return result;
  }});
  f.failedPhase=scenario==='marker write failure'?'acceptance_fault_triggered':scenario==='observation write failure'?'saved_package_state_observed':undefined;
  const saves=t.mock.method(f.page,'save');
  const directory=await mkdtemp(join(tmpdir(),'recovery-save-bridge-'));
  const resources=await createBundledSkillFixture(t);f.catalog=await createActionCatalogFixture(target);
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){}}};
  const bridge=await createBridge({resources:resources.resources,actionManifestUri:f.catalog.manifestUri,actionManifestSha256:f.catalog.manifestSha256,
    mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
    loginomUrl:'http://loginom.invalid/app',replayBootstrap:false,replayLoginUser:null,browserRecovery:true,
    acceptanceSaveReadPackage:scenario==='P5'||f.foreignReceipt||scenario==='marker write failure'?path:scenario==='foreign package'?'/user/other.lgp':undefined},session,{browserTransport:new ExternalTransport()});
  const client=new AgentClient({name:'recovery-save',version:'1'});
  try{
    const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
    const save=operation_id=>client.callTool({name:'dock_action_run',arguments:{action_key:ambiguous&&operation_id==='own-save'?'package.save_as':'package.save_checkpoint',parameters:{path,conflict_policy:'replace'},operation_id}});
    const inspect=operation_id=>client.callTool({name:'dock_operation_inspect',arguments:{operation_id}});
    const blocks=reply=>reply.content.filter(c=>c.text.startsWith('{')).map(c=>JSON.parse(c.text));
    const state=reply=>blocks(reply).find(v=>v.kind==='dock_saved_package_state');
    await client.callTool({name:'dock_prepare',arguments:{}});
    const saved=await save('own-save'),advice=state(saved);
    assert.equal(saves.mock.callCount(),1);assert.ok(f.page.storage.has(path));
    if(scenario==='observation write failure'){
      assert.deepEqual([advice.save_operation_id,advice.package_path,advice.modified],['own-save',path,false]);
      assert.equal(advice.next_step,undefined);assert.equal(f.stateReads,1);
      const start=await client.callTool({name:'dock_browser_recovery',arguments:{action:'start',operation_id:'own-save'}});
      assert.equal(start.isError,true);return;
    }
    if(f.foreignReceipt){
      assert.equal(blocks(saved)[0].status,'SUCCEEDED');assert.equal(advice,undefined);assert.equal(f.stateReads,0);
      return;
    }
    if(scenario==='foreign package'||scenario==='marker write failure'||scenario==='control'){
      assert.equal(advice.modified,false);assert.equal(f.stateReads,1);return;
    }
    assert.equal(advice.state,'unavailable');
    assert.deepEqual(advice.next_step.arguments,{action:'start',operation_id:'own-save'});
    if(ambiguous){
      assert.ok(f.page.events.includes('package_reopened'));assert.equal(f.prepares,2);
      const rebound=blocks(saved).find(value=>value.kind==='dock_saved_package_workspace');
      assert.equal(rebound?.workflow_ref?.tab_tid,f.page.tabTid);assert.equal(rebound.package_ref.path,path);
      const original=blocks(await inspect('own-save'))[0].output.outcome;
      assert.equal(f.prepares,3);assert.equal(f.stateReads,2);
      f.page.addNode('Later edit',520,120);
      const [other]=blocks(await save('other-save'));
      assert.equal(other.status,'AMBIGUOUS',JSON.stringify(other));
      assert.ok(f.page.storage.get(path).nodes.some(node=>node.label==='Later edit'));assert.equal(saves.mock.callCount(),2);
      const old=blocks(await inspect('own-save'));
      assert.deepEqual(old[0].output.outcome,original);
      assert.deepEqual([f.prepares,f.stateReads],[3,2]);
      assert.ok(!old.some(value=>['dock_saved_package_state','dock_saved_package_workspace'].includes(value.kind)));
      const start=await client.callTool({name:'dock_browser_recovery',arguments:advice.next_step.arguments});
      assert.equal(start.isError,true);
      if(scenario!=='newer ambiguous Save'){
        let confirmed;
        if(scenario==='ambiguous Save before preparation'){
          const current=await inspect();
          const resolved=blocks(current)[0];
          assert.equal(resolved.output.state,'resolved');
          confirmed=resolved.output.outcome;
          assert.equal(confirmed.operation_id,'other-save');
          assert.equal(state(current)?.next_step?.reason,'SAVE_STATE_UNCONFIRMED');
        }else{
          // A retry causes the executor to settle pending B before returning cached A.
          assert.deepEqual(blocks(await save('own-save'))[0],blocks(saved)[0]);
        }
        f.tabTid='later-tab';
        const prepared=await client.callTool({name:'dock_prepare',arguments:{operation_id:'later-prepare'}});
        assert.notEqual(prepared.isError,true,JSON.stringify(prepared));
        assert.equal(session.metadata.workspacePreparation.state.workflow_ref.tab_tid,'later-tab');
        const reads=f.stateReads,prepares=f.prepares;
        const late=await inspect('other-save');
        const receipt=blocks(late)[0].output.outcome;
        assert.equal(receipt.operation_id,'other-save');assert.equal(receipt.status,'SUCCEEDED');
        if(confirmed)assert.deepEqual(receipt,confirmed);
        assert.deepEqual([f.stateReads,f.prepares,state(late)],[reads,prepares,undefined]);
        assert.equal(saves.mock.callCount(),2);return;
      }
      f.failedReads=[];
      const current=await inspect('other-save');
      assert.equal(blocks(current)[0].output.outcome.status,'SUCCEEDED',JSON.stringify(current));
      assert.equal(state(current)?.save_operation_id,'other-save');assert.equal(state(current)?.modified,false);
      const repeated=blocks(await save('own-save'));
      assert.deepEqual(repeated[0],blocks(saved)[0]);
      assert.deepEqual([f.prepares,f.stateReads],[3,3]);
      assert.equal(saves.mock.callCount(),2);return;
    }
    if(superseded.includes(scenario)){
      const nextSave=scenario==='newer confirmed Save'||scenario==='newer unreadable Save';
      let nextState;
      if(nextSave){
        const next=await save('other-save');
        assert.equal(blocks(next)[0].status,'SUCCEEDED');
        nextState=state(next);
        assert.deepEqual([nextState.save_operation_id,nextState.modified],['other-save',scenario==='newer confirmed Save'?false:null]);
      }else{
        f.tabTid='later-tab';
        if(scenario==='newer document')f.documentId='later-doc';
        const prepared=await client.callTool({name:'dock_prepare',arguments:{operation_id:'later-prepare'}});
        assert.notEqual(prepared.isError,true,JSON.stringify(prepared));
        assert.equal(session.metadata.workspacePreparation.state.workflow_ref.tab_tid,'later-tab');
      }
      const started=await client.callTool({name:'dock_browser_recovery',arguments:advice.next_step.arguments});
      assert.equal(started.isError,true,JSON.stringify(started.structuredContent));
      const old=await inspect('own-save'),original=blocks(old)[0].output.outcome;
      assert.deepEqual([original.operation_id,original.status],['own-save','SUCCEEDED']);
      assert.equal(state(old),undefined);
      const repeated=await save('own-save');
      assert.equal(blocks(repeated)[0].status,'SUCCEEDED');assert.equal(state(repeated),undefined);
      assert.equal(saves.mock.callCount(),nextSave?2:1);assert.equal(f.stateReads,nextSave?2:1);
      if(scenario==='newer unreadable Save'){
        const start=await client.callTool({name:'dock_browser_recovery',arguments:nextState.next_step.arguments});
        assert.equal(start.structuredContent?.phase,'browser',JSON.stringify(start));
        const finish=await client.callTool({name:'dock_browser_recovery',arguments:{action:'finish',operation_id:'other-save',actions_performed:['Reviewed the warning']}});
        assert.equal(finish.structuredContent?.verification?.receipt_id,'other-save:br-save',JSON.stringify(finish));
      }
      return;
    }
    if(scenario==='confirmed reread'){
      assert.equal(state(await inspect('own-save'))?.modified,false);
      const started=await client.callTool({name:'dock_browser_recovery',arguments:advice.next_step.arguments});
      assert.equal(started.isError,true,JSON.stringify(started.structuredContent));
      assert.equal(saves.mock.callCount(),1);assert.equal(f.stateReads,2);
      return;
    }
    if(noEffect){
      f.lost=scenario!=='no-effect Save';
      const proto=f.page.app.PackageTreeNode.prototype;
      Object.defineProperty(proto,'ReadOnly',{get:()=>true,configurable:true});
      let [denied]=blocks(await save('blocked-save'));
      delete proto.ReadOnly;
      if(scenario!=='no-effect Save'){
        assert.equal(denied.status,'AMBIGUOUS');
        const held=await client.callTool({name:'dock_browser_recovery',arguments:advice.next_step.arguments});
        assert.equal(held.isError,true);
        denied=scenario==='repeat confirms no-effect Save'?blocks(await save('blocked-save'))[0]
          :blocks(await inspect(scenario==='implicit inspect confirms no-effect Save'?undefined:'blocked-save'))[0].output.outcome;
        assert.equal(denied.operation_id,'blocked-save');assert.equal(denied.cleanup_complete,true);
      }
      assert.ok(['FAILED','NOT_APPLIED'].includes(denied.status),JSON.stringify(denied));
      assert.equal(denied.effect_possible,false);assert.equal(saves.mock.callCount(),1);
    }
    const started=await client.callTool({name:'dock_browser_recovery',arguments:{action:'start',operation_id:'own-save'}});
    assert.equal(started.structuredContent?.phase,'browser',JSON.stringify(started));
    assert.equal(started.structuredContent.reason,'SAVE_STATE_UNCONFIRMED');
    const refused=await save('other-save');
    assert.equal(refused.isError,true);
    const attested=scenario==='P5'?['Reviewed https://fixture.test']:['Closed a notification over the scenario'];
    const finished=await client.callTool({name:'dock_browser_recovery',arguments:{action:'finish',operation_id:'own-save',
      actions_performed:attested}});
    const verification=finished.structuredContent.verification;
    assert.equal(finished.structuredContent.phase,'dock');
    assert.equal(verification.status,modified?'continuable':'completed');
    assert.equal(verification.state.modified,modified);
    assert.ok(verification.facts.includes(modified?'package_modified_after_save':'package_unmodified_after_save'));
    assert.deepEqual(verification.attested_by_model.actions_performed,attested);
    if(scenario==='P5'){
      assert.equal(state(await inspect('own-save'))?.modified,false);
    }
    const journal=(await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(saves.mock.callCount(),1);
    assert.equal(f.stateReads,2);
    assert.deepEqual(journal.filter(e=>e.phase==='acceptance_fault_triggered').map(e=>[e.condition,e.operation_id,e.package_path]),
      scenario==='P5'?[['P5','own-save',path]]:[]);
    const receipt=journal.find(e=>e.phase==='browser_recovery_receipt'&&e.receipt.id==='own-save:br-save');
    assert.ok(receipt);
    if(scenario==='P5')assert.equal(receipt.receipt.attested_by_model.actions_performed[0],'Reviewed https://fixture.test/');
    const again=await client.callTool({name:'dock_browser_recovery',arguments:{action:'start',operation_id:'own-save'}});
    assert.equal(again.isError,true);
  }finally{await client.close();await bridge.close();await rm(directory,{recursive:true,force:true});}
});

test('inspection of an ambiguous Save delivers the original saved-package follow-up',async t=>{
  f.page=null;f.documentId='own-doc';f.tabTid='own-tab';f.stateReads=1;f.modified=false;f.lost=true;f.failedReads=[];
  const directory=await mkdtemp(join(tmpdir(),'reconciled-save-bridge-'));
  const resources=await createBundledSkillFixture(t);f.catalog=await createActionCatalogFixture(target);
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){}}};
  const bridge=await createBridge({resources:resources.resources,actionManifestUri:f.catalog.manifestUri,actionManifestSha256:f.catalog.manifestSha256,
    mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
    loginomUrl:'http://loginom.invalid/app',replayBootstrap:false,replayLoginUser:null,browserRecovery:true},session,{browserTransport:new ExternalTransport()});
  const client=new AgentClient({name:'reconciled-save',version:'1'});
  try{
    const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
    await client.callTool({name:'dock_prepare',arguments:{}});
    await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path,conflict_policy:'replace'},operation_id:'own-save'}});
    const inspected=await client.callTool({name:'dock_operation_inspect',arguments:{operation_id:'own-save'}});
    const blocks=inspected.content.map(c=>{try{return JSON.parse(c.text);}catch{return {};}});
    assert.equal(blocks[0].action_key,'operation.inspect');
    const state=blocks.find(v=>v.kind==='dock_saved_package_state');
    assert.equal(state?.save_operation_id,'own-save',JSON.stringify(inspected));
    assert.equal(state.package_path,path);assert.equal(state.modified,false);assert.equal(f.stateReads,2);
  }finally{await client.close();await bridge.close();await rm(directory,{recursive:true,force:true});}
});
