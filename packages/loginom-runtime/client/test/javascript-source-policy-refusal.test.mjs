import test from 'node:test';
import assert from 'node:assert/strict';
import {createJavascriptSourceAdmission} from '../lib/javascript-source-admission.mjs';
import {withJavascriptSourcePolicyBoundary,verifiedJavascriptSourcePolicyRefusal} from '../lib/javascript-source-policy-refusal.mjs';
import {createRedactor} from '../lib/redact.mjs';
import {sourceFixture} from './support/javascript-source-fixture.mjs';
import {applyNode} from '../lib/node-apply.mjs';

const owner={document_id:'document',workflow_id:'workflow',node_id:'node',operation_id:'policy-refusal',ui_epoch:1};
const node={document_id:owner.document_id,workflow_id:owner.workflow_id,node_id:owner.node_id};
const request=()=>({operation_id:owner.operation_id,contract_revision:'1.0.0',document_id:owner.document_id,
 workflow_ref:{workflow_id:owner.workflow_id,prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
  navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]},
 target:{kind:'existing',type:'programming.javascript',ref:structuredClone(node)},mode:'script',parameters:{},
 inputs:[],mappings:[],finish:'execute',read:{ports:[0],sample_rows:10,require_exact_numbers:true},
 budgets:{configure_ms:60000,execute_ms:60000,total_ms:60000}});

function fixture({source='import "PRIVATE_SENTINEL";',record,closeError=false}={}){
 const browser=sourceFixture(source),events=[],calls=[],deadline=Date.now()+60000;
 const journal=async event=>{events.push(structuredClone(event));return record?record(event):event;};
 const admission=createJavascriptSourceAdmission({kind:'existing',owner,deadline,record:journal,redactor:createRedactor(),
  sourceAdapter:()=>({open:async()=>{calls.push('open');return browser.observe({context:browser.context,owner,epoch:1,capture:true});},
   read:async held=>({...browser.observe({context:browser.context,owner,epoch:1,held}),settings:{generation:true}}),
   discard:async()=>{calls.push('close');if(closeError)throw Error('Close reply lost');return {closed:true,owner};}})});
 const run=(phase='target',parameters={})=>withJavascriptSourcePolicyBoundary({phase,owner,deadline,record:journal},()=>admission.admit(parameters));
 return {browser,events,calls,admission,run,journal,deadline};
}
for(const finish of ['done','close','execute'])test('stale digest after actual verified Close clears only the pending phase '+finish,async()=>{
 const f=fixture({source:'import "builtIn/Data";'}),p=request();p.finish=finish;
 p.read={ports:[],sample_rows:0,require_exact_numbers:false};
 p.parameters={source_text:'',expected_source_sha256:'a'.repeat(64)};
 let failure;
 const result=await applyNode({request:p,operation:{id:owner.operation_id},record:f.journal,now:()=>f.deadline-60000,
  handlers:new Map([['programming.javascript',{revision:'test',modes:['script'],validate(){},configure(){assert.fail('Must not configure');}}]]),
  drivers:{verifySource:async()=>({verified:true,cleanup_complete:true,effect_possible:false}),
   prepareTarget:async()=>{try{return await f.run('target',p.parameters);}catch(error){failure=error;throw error;}}}});
 assert.deepEqual(f.calls,['open','close']);assert.equal(failure.code,'stale_digest');
 assert.equal(result.status,'FAILED');assert.equal(result.cleanup_complete,true);assert.equal(result.pending_phase,null);
 assert.equal(verifiedJavascriptSourcePolicyRefusal(failure.nodePhaseRefusal,p),true);
 const foreign=structuredClone(failure.nodePhaseRefusal);foreign.proof.closed.check_callback_dispatched=true;
 assert.equal(verifiedJavascriptSourcePolicyRefusal(foreign,p),false);
});
for(const source of ['import "PRIVATE_SENTINEL";', 'export * from "PRIVATE_SENTINEL";',
 'require("PRIVATE_SENTINEL");', 'import("builtIn/Data");', 'const value=`${require("PRIVATE_SENTINEL")}`;', 'const value=;'])
 test('actual full source reader and verified discard settle unsupported preserved source '+source.slice(0,18),async()=>{
  const f=fixture({source});let failure;
  await assert.rejects(f.run,error=>{failure=error;return error.code==='policy'&&error.nodePhaseRefusal?.cleanup_complete===true;});
  assert.deepEqual(f.calls,['open','close']);assert.equal(f.admission.state,'retired');
  assert.equal(verifiedJavascriptSourcePolicyRefusal(failure.nodePhaseRefusal,request()),true);
  assert.equal(failure.nodePhaseRefusal.effect_possible,true);
  assert.equal(JSON.stringify(f.events).includes('PRIVATE_SENTINEL'),false);
  await assert.rejects(f.run,{code:'state'});assert.equal(f.calls.length,2);
 });
for(const source of ['// import("other") require("other")\n', 'const text="import other require";',
 'const text=`import("other") require("other")`;', 'import "builtIn/Data";'])
 test('preserved inert/module syntax is admitted by the actual reader '+source.slice(0,16),async()=>{
  const f=fixture({source}),receipt=await f.run();assert.equal(receipt.effective_source.status,'ADMITTED');
  assert.equal(f.events.some(event=>event.phase==='javascript_source_policy_closed'),false);
 });
for(const phase of ['javascript_source_closed_check_refused','javascript_source_policy_closed'])
 for(const alter of ['drop','in-place'])test('missing or changed '+phase+' ACK cannot settle the shell: '+alter,async()=>{
  const f=fixture({record:event=>{if(event.phase!==phase)return event;
   if(alter==='drop')return {};event.proof.closed?event.proof.closed.owner.node_id='foreign':event.proof.owner.node_id='foreign';return event;}});
  await assert.rejects(f.run,error=>error.nodePhaseRefusal===undefined);
  assert.equal(f.admission.state,'retired');assert.deepEqual(f.calls,['open','close']);
 });
test('unknown Close retains uncertainty and cannot manufacture a closed policy proof',async()=>{
 const f=fixture({closeError:true});await assert.rejects(f.run,error=>!error.nodePhaseRefusal&&!error.javascriptSourceClosedRefusal);
 assert.equal(f.events.some(event=>event.phase==='javascript_source_policy_closed'),false);
});
test('node shell consumes the actual closed policy proof and stops before target/edit/Execute',async()=>{
 const f=fixture(),operation={id:owner.operation_id},p=request(),calls=[];
 const forbidden=()=>{calls.push('forbidden');throw Error('Policy refusal must precede configuration and execution');};
 const drivers={verifySource:async()=>({verified:true,cleanup_complete:true,effect_possible:false}),
  prepareTarget:async(graph,ctx)=>{
   // The proof carries the shell's original target deadline, not an extension.
   const reader=sourceFixture('import "PRIVATE_SENTINEL";');
   const admission=createJavascriptSourceAdmission({kind:'existing',owner,deadline:ctx.deadline,redactor:createRedactor(),record:f.journal,
    sourceAdapter:()=>({open:async()=>reader.observe({context:reader.context,owner,epoch:1,capture:true}),
     read:async held=>({...reader.observe({context:reader.context,owner,epoch:1,held}),settings:{generation:true}}),
     discard:async()=>({closed:true,owner})})});
   return withJavascriptSourcePolicyBoundary({phase:'target',owner,deadline:ctx.deadline,record:f.journal},()=>admission.admit({}));
  },mapPorts:forbidden,openWizard:forbidden,finish:forbidden,waitExecution:forbidden,readOutput:forbidden,verifyContinuation:async()=>false};
 const result=await applyNode({request:p,operation,drivers,handlers:new Map([['programming.javascript',
  {revision:'policy',modes:['script'],validate(){},configure:forbidden}]]),record:f.journal});
 assert.equal(result.status,'FAILED');assert.equal(result.cleanup_complete,true);assert.equal(result.pending_phase,null);
 assert.equal(result.effect_possible,true);assert.equal(result.execution.status,'not_requested');
 assert.deepEqual(result.phases.map(phase=>phase.phase),['source']);assert.deepEqual(calls,[]);
});
test('forged closed policy receipt identities and callback state refuse verification',async()=>{
 const f=fixture();let refusal;await assert.rejects(f.run,error=>{refusal=error.nodePhaseRefusal;return true;});
 for(const mutate of [r=>r.proof.node.node_id='foreign',r=>r.proof.closed.owner.operation_id='foreign',
  r=>r.proof.closed.source_read_discard_verified=false,r=>r.proof.closed.check_callback_dispatched=true,
  r=>r.proof.closed.source_identity.source_sha256='bad',r=>r.proof.closed.source_identity.source_utf8_bytes=32769,
  r=>r.proof.closed.settings_sha256='bad',r=>r.proof.closed.admission_id='foreign',r=>r.proof.closed.read_id=0,
  r=>r.proof.closed.policy.parser.version='other',r=>r.proof.closed.policy.status='ADMITTED',
  r=>r.phase='read',r=>r.verification='other']){
  const changed=structuredClone(refusal);mutate(changed);
  assert.equal(verifiedJavascriptSourcePolicyRefusal(changed,request()),false);
 }
 const other=request();other.target.type='imports.text';assert.equal(verifiedJavascriptSourcePolicyRefusal(refusal,other),false);
});
