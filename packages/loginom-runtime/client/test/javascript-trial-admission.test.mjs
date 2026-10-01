import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {createJavascriptTrialAdmission} from '../lib/javascript-trial-admission.mjs';
import {createJavascriptTrialNodeSupport} from '../lib/javascript-trial-node.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {createRedactor} from '../lib/redact.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';

const node={document_id:'doc',workflow_id:'workflow',node_id:'javascript1'};
const source='// fixed comment-only JavaScript trial\n';
const request=()=>({operation_id:'trial1',contract_revision:'1.0.0',document_id:'doc',
 workflow_ref:{workflow_id:'workflow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
  navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]},
 target:{kind:'existing',type:'programming.javascript',ref:{...node}},inputs:[],mode:'script',
 parameters:{source_text:source,expected_source_sha256:'a'.repeat(64)},mappings:[],finish:'done',
 read:{ports:[],sample_rows:0,require_exact_numbers:true},
 budgets:{configure_ms:1000,execute_ms:1000,total_ms:10000}});
const validate=createJavascriptTrialAdmission({node,expected_source_sha256:'a'.repeat(64),source_text:source});
const handlers=new Map([['programming.javascript',{revision:'js-trial-v1',modes:['script'],validate,configure:async()=>{}}]]);

test('pinned existing JavaScript request passes pure pre-target trial admission',()=>{
 assert.equal(validateNodeApplyRequest(request(),handlers).handler,handlers.get('programming.javascript'));
 const reordered=request();reordered.target.ref={node_id:node.node_id,document_id:node.document_id,workflow_id:node.workflow_id};
 assert.doesNotThrow(()=>validateNodeApplyRequest(reordered,handlers));
});

test('trial rejects every unsupported operation before target or editor access',()=>{
 const changes=[
  p=>{p.target.kind='new';delete p.target.ref;p.target.label='JS';p.target.position={x:80,y:80};},
  p=>{p.target.ref.node_id='other';},p=>{p.finish='execute';},
  p=>{p.parameters.schema_mode='code';},p=>{p.parameters.columns=[];},
  p=>{p.parameters.source_text+='// extra\n';},p=>{p.parameters.expected_source_sha256='b'.repeat(64);},
  p=>{p.inputs=[{input:0,from:{document_id:'doc',workflow_id:'workflow',node_id:'source'},output:0}];},
  p=>{p.mappings=[{direction:'output',port:0}];},p=>{p.read.ports=[0];},
 ];
 for(const change of changes){const trial=request();change(trial);assert.throws(()=>validateNodeApplyRequest(trial,handlers));}
});

test('fixed trial overrides the general product handler only inside its isolated candidate map',()=>{
 const base=createCandidateNodeSupport({targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2'});
 assert.equal(base.nodeApplyHandlers.get('programming.javascript').revision,'javascript-script-lifecycle-v5');
 const trial=createJavascriptTrialNodeSupport({page:{},targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',
  redactor:createRedactor(),pinned:{node,expected_source_sha256:'a'.repeat(64),source_text:source}});
 const combined=new Map([...base.nodeApplyHandlers,...trial.nodeApplyHandlers]);
 assert.equal(validateNodeApplyRequest(request(),combined).handler,trial.nodeApplyHandlers.get('programming.javascript'));
 const phases=['source','workflow','target','input_mapping','open','configure','output_mapping','finish']
  .map(phase=>({phase,receipt_id:'trial1:'+phase,status:'verified',effect_possible:phase==='finish',
    value:phase==='finish'?{wizard_commit_verified:true,source_readback_verified:true,settings_preserved:true,
      execution_started:null,source_sha256:'b'.repeat(64),source_utf8_bytes:420,source_lf_lines:9}:{}}));
 const readback=trial.nodeApplyHandlers.get('programming.javascript').configurationReadback({node,phases});
 const result={operation_id:'trial1',status:'SUCCEEDED',effect_possible:true,
  phases:phases.map(({value,...phase})=>phase),node,execution:{status:'not_requested',execution_id:null},
  output:{status:'not_refreshed',evidence_ref:null,ports:[]},package_saved:false,cleanup_complete:true,warnings:[],
  configuration:{status:'applied',readback},checkpoint_kind:'local_node_checkpoint',persisted_package_verified:false};
 assert.equal(new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema)(result).valid,true);
 assert.deepEqual(readback.execution_effects,{explicit_execute_requested:false,internal_execution_started:null});
});
