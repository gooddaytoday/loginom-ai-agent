import test from 'node:test';
import assert from 'node:assert/strict';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {retainedJavascriptWizardRefusal,verifiedJavascriptWizardRefusal,javascriptWizardDiagnostic} from '../lib/javascript-wizard-recovery.mjs';
import {createJavascriptSourceAdmission,javascriptSourceSettingsDigest} from '../lib/javascript-source-admission.mjs';
import {javascriptSourceIdentity} from '../lib/javascript-source-read.mjs';
import {javascriptExistingLifecycleBaseline} from '../lib/javascript-existing-lifecycle.mjs';
import {createRedactor} from '../lib/redact.mjs';
import {sourceFixture,javascriptSourceOwner} from './support/javascript-source-fixture.mjs';
import {applyNode} from '../lib/node-apply.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {compactNodeResult} from '../lib/user-results.mjs';

async function fixture(mode='code') {
 const owner={...javascriptSourceOwner,operation_id:'edit'},node={document_id:owner.document_id,workflow_id:owner.workflow_id,node_id:owner.node_id};
 const source='import {InputTable} from "builtIn/Data";\n',rejected=source+'const value=object?.field;\n';
 const browser=sourceFixture(source),events=[],calls=[],deadline=Date.now()+60000;
 const record=async event=>{events.push(structuredClone(event));return event;};
 const settings={generation:mode==='code',grids:[{tid:'columns',fields:[{Name:'Amount',Index:0,Required:false,DataType:4,UsageType:0,DefaultUsageType:4}]}]};
 const schema={verified:true,node_context:{...node,verified:true,surface:'wizard'},generation:{checked:mode==='code'},grids:structuredClone(settings.grids)};
 const admit=()=>createJavascriptSourceAdmission({kind:'existing',owner,deadline,redactor:createRedactor(),record,
  sourceAdapter:async()=>({open:async()=>{calls.push('open');return browser.observe({context:browser.context,owner,epoch:1,capture:true});},
   read:async held=>({...browser.observe({context:browser.context,owner,epoch:1,held}),settings}),
   discard:async()=>{calls.push('discard');return {owner,closed:true};}})});
 const admitted=await admit().admit({source_text:rejected,expected_source_sha256:javascriptSourceIdentity(source).source_sha256});
 const afterReceipt=await admit().admit({});
 const snapshot={owner,settings,schema};
 // Code baseline uses all semantic native values. The declared reader requires
 // its exact observed grid inventory, so declared mode is tested below through
 // the proof guard while native declared admission has its existing tests.
 const baseline=mode==='code'?javascriptExistingLifecycleBaseline({receipt:admitted,snapshot,parameters:{},owner})
  :{schema_mode:mode,settings_sha256:javascriptSourceSettingsDigest(settings)};
 const afterBaseline=mode==='code'?javascriptExistingLifecycleBaseline({receipt:afterReceipt,snapshot,parameters:{},owner}):structuredClone(baseline);
 const beforeGraph={complete:true,document_id:node.document_id,workflow_ref:{workflow_id:node.workflow_id},
  nodes:[{ref:node,locked:false,inputs:[0],outputs:[0],position:{x:100,y:100}}],links:[],foreign_links:[]};
 const diagnostic={owner:node,source_sha256:javascriptSourceIdentity(rejected).source_sha256,
  tooltip:'SyntaxError: Syntax error at code (:4:33)',tooltip_truncated:false,
  dialog_text:'Loginom 7.4.2\nSyntaxError: Syntax error at code (:4:33)\nOK',dialog_text_truncated:false,
  dialog_closed:true,native_owner_verified:true,explicit_execute_requested:false};
 const refusal={diagnostic,closed:{verified:true,closed:true,node_id:node.node_id,draft_discarded:true,settings_applied:false,execution_started:false}};
 const options={refusal,owner,admitted,afterReceipt,baseline,afterBaseline,beforeGraph,afterGraph:structuredClone(beforeGraph),record,deadline};
 const request={operation_id:owner.operation_id,contract_revision:'1.0.0',document_id:node.document_id,
  workflow_ref:{workflow_id:node.workflow_id,prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'nav',label:'Scenario'}]},
  target:{kind:'existing',type:'programming.javascript',ref:node},mode:'script',inputs:[],mappings:[],finish:'execute',
  parameters:{source_text:rejected,expected_source_sha256:admitted.previous_source.source_sha256,schema_mode:mode},
  read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},budgets:{configure_ms:1000,execute_ms:1000,total_ms:10000}};
 return {options,request,events,calls,node};
}
async function refusalError(options) {
 try{await retainedJavascriptWizardRefusal(options);}catch(error){return error;}
 throw Error('Expected refusal');
}
for(const mode of ['code','declared'])test('two actual owned source admissions and graph preservation allow typed native refusal '+mode,async()=>{
 const f=await fixture(mode),error=await refusalError(f.options);
 assert.equal(verifiedJavascriptWizardRefusal(error.nodePhaseRefusal,f.request),true);
 assert.deepEqual(f.calls,['open','discard','open','discard']);
 assert.equal(error.nodePhaseRefusal.proof.native.error_class.name,'SyntaxError');
 assert.deepEqual(error.nodePhaseRefusal.proof.native.location,{status:'recognized',line:4,column:33});
 assert.equal(f.events.at(-1).phase,'javascript_native_refusal_draft_discarded_baseline_retained');
});

for(const [name,change] of [
 ['dialog',o=>o.refusal.diagnostic.dialog_closed=false],['close',o=>o.refusal.closed.draft_discarded=false],
 ['source',o=>o.afterReceipt={...o.afterReceipt,previous_source:{...o.afterReceipt.previous_source,source_sha256:'a'.repeat(64)}}],
 ['settings',o=>o.afterBaseline.settings_sha256='b'.repeat(64)],['graph',o=>o.afterGraph.nodes[0].position.x++],
 ['lock',o=>o.afterGraph.nodes[0].locked=true],['ACK',o=>o.record=async event=>{event.proof.full_graph_unchanged=false;return event;}],
])test('unconfirmed recovery '+name+' cannot publish a node phase refusal',async()=>{
 const f=await fixture();change(f.options);const error=await refusalError(f.options);assert.equal(error.nodePhaseRefusal,undefined);
});

test('native class and location remain explicitly unrecognized for absent or contradictory native text',()=>{
 for(const text of ['Причина не определена','TypeError: value (:1:2)\nSyntaxError: syntax (:3:4)']) {
  const result=javascriptWizardDiagnostic({tooltip:text,dialog_text:'OK',source_sha256:'a'.repeat(64),tooltip_truncated:false,dialog_text_truncated:false},{});
  assert.equal(result.error_class.status,'unrecognized');assert.equal(result.location.status,'unrecognized');
 }
 const result=javascriptWizardDiagnostic({tooltip:'Ё'.repeat(4096),dialog_text:'😀'.repeat(4096),source_sha256:'a'.repeat(64)},{});
 assert.ok(Buffer.byteLength(result.tooltip)<=2048&&Buffer.byteLength(result.dialog_text)<=2048);
 assert.equal(result.tooltip_truncated,true);assert.equal(result.dialog_text_truncated,true);assert.ok(result.dialog_text.isWellFormed());
});

for(const failure of [null,'owner','operation','digest','settings','graph','discard','execute','class','location','journal','foreign-type'])test('actual node shell accepts only the complete native wizard recovery proof '+failure,async()=>{
 const f=await fixture(),error=await refusalError(f.options),proof=error.nodePhaseRefusal.proof,calls=[];
 if(failure==='owner')proof.owner.node_id='foreign';if(failure==='operation')proof.owner.operation_id='foreign';
 if(failure==='digest')proof.retained_source={...proof.retained_source,source_sha256:'b'.repeat(64)};if(failure==='settings')proof.native_settings_unchanged=false;
 if(failure==='graph')proof.full_graph_unchanged=false;if(failure==='discard')proof.draft_discarded=false;
 if(failure==='execute')proof.explicit_execute_requested=true;if(failure==='class')proof.native.error_class.name='invented';
 if(failure==='location')proof.native.location.line=0;
 if(failure==='foreign-type'){f.request.target.type='imports.text';delete f.request.read.coverage;}
 const verified=async()=>({verified:true,cleanup_complete:true,effect_possible:true});
 const handler={revision:'test',modes:['script'],fullUiOutput:true,output_wizard:'separate',validate:()=>{},configure:verified};
 const drivers={verifySource:verified,prepareTarget:async()=>({...await verified(),node:f.node}),mapPorts:verified,openWizard:verified,
  finish:async()=>{calls.push('node_finish');throw error;},finishGraph:async()=>{calls.push('finishGraph');throw Error('Unexpected');},
  waitExecution:async()=>{calls.push('execute');throw Error('Unexpected');},readOutput:async()=>{calls.push('read');throw Error('Unexpected');}};
 const result=await applyNode({request:f.request,operation:{id:f.request.operation_id},handlers:new Map([[f.request.target.type,handler]]),drivers,
  record:async event=>{if(failure==='journal'&&event.phase==='node_phase_refused')throw Error('lost ACK');return event;}});
 assert.deepEqual(calls,['node_finish']);assert.equal(result.output.status,'not_refreshed');assert.equal(result.execution.status,'not_requested');
 if(failure){assert.equal(result.status,'AMBIGUOUS');assert.equal(result.cleanup_complete,false);assert.equal(result.pending_phase,'node_finish');return;}
 assert.equal(result.status,'FAILED');assert.equal(result.cleanup_complete,true);assert.equal(result.pending_phase,null);
 assert.equal(result.configuration.status,'discarded');assert.equal(result.error.native.source_sha256,proof.rejected_source_sha256);
 assert.match(result.next_step.instruction,new RegExp(proof.retained_source.source_sha256));
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema);
 assert.equal(validate(result).valid,true);const compact=compactNodeResult(result);
 assert.equal(compact.error.native.location.line,4);assert.ok(Buffer.byteLength(JSON.stringify(compact))<16384);
});

for(const mode of ['code','declared'])test('Done recovery declares discard only after new full baseline and graph proof '+mode,async()=>{
 const f=await fixture(mode);f.options.refusal.diagnostic.error_stage='done';
 Object.assign(f.options.refusal.closed,{draft_discarded:null,settings_applied:null,execution_started:null});
 const error=await refusalError(f.options);assert.equal(verifiedJavascriptWizardRefusal(error.nodePhaseRefusal,f.request),true);
 assert.equal(error.nodePhaseRefusal.proof.native.stage,'done');assert.equal(error.nodePhaseRefusal.proof.draft_discarded,true);
 for(const field of ['settings_sha256','schema_mode']){
  const after=structuredClone(f.options.afterBaseline);f.options.afterBaseline[field]='changed';
  assert.equal((await refusalError(f.options)).nodePhaseRefusal,undefined);f.options.afterBaseline=after;
 }
});

test('invented wizard stage cannot produce a retained refusal proof',async()=>{
 const f=await fixture();f.options.refusal.diagnostic.error_stage='execute';
 assert.equal((await refusalError(f.options)).nodePhaseRefusal,undefined);
});
