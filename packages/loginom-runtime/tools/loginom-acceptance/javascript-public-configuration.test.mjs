import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyJavascriptConfigurationJob,javascriptConfigurationSuffixes} from './javascript-public-configuration.mjs';
import {javascriptCodeReadback} from '../../client/lib/javascript-code-node.mjs';
import {javascriptSourceIdentity} from '../../client/lib/javascript-source-read.mjs';

const node={document_id:'doc',workflow_id:'flow',node_id:'node'};
const source=javascriptSourceIdentity('import {OutputTable} from "builtIn/Data";\n'+javascriptConfigurationSuffixes.done);
function job(mode,schemaMode){
 const value={mode:'done',schema_mode:schemaMode,...source,settings_sha256:'b'.repeat(64),settings_preserved:true,
   source_readback_verified:true,wizard_commit_verified:true,graph_owner_verified:true,owned_done_settled:true,
   settings_applied:true,execution_id:null,execution_started:null,explicit_execute_requested:false,
   ...(schemaMode==='declared'?{declared_columns:[{index:0,name:'Amount',label:'Amount',type:'integer',
     data_kind:'Непрерывный',usage:'Выходное',usage_type:0,default_usage_type:4,required:false}]}:{})};
 const phases=['source','workflow','target','input_mapping','open','configure',...(mode==='done'?['node_finish']:[]),'finish']
   .map(phase=>({phase,receipt_id:'op:'+phase,status:'verified',effect_possible:true,value}));
 const readback=mode==='done'?javascriptCodeReadback({node,phases}):null;
 const output={operation_id:'op',status:'SUCCEEDED',node:structuredClone(node),effect_possible:true,cleanup_complete:true,
   phases:phases.map(({value,...phase})=>phase),execution:{status:'not_requested',execution_id:null},
   output:{status:'not_refreshed',evidence_ref:null,ports:[]},package_saved:false,warnings:[],
   configuration:mode==='done'?{status:'applied',readback}:{status:'discarded'},persisted_package_verified:false,
   checkpoint_kind:mode==='done'?'local_node_checkpoint':'local_node_cancellation'};
 return {operation_id:'op',state:'settled',outcome:{status:'SUCCEEDED',cleanup_complete:true,output}};
}
for(const mode of ['done','close'])for(const schemaMode of ['code','declared']){
 test('configuration verifier preserves actual readback/user-v1 '+mode+'/'+schemaMode,()=>{
   const input=job(mode,schemaMode),actual=verifyJavascriptConfigurationJob(input,{node,mode,schemaMode,source});
   assert.deepEqual(actual.configuration,input.outcome.output.configuration);
 });
 for(const [name,mutate] of Object.entries({
   running:j=>j.state='running',failure:j=>j.outcome.status='FAILED',cleanup:j=>j.outcome.cleanup_complete=false,
   foreign:j=>j.outcome.output.node.node_id='foreign',execute:j=>j.outcome.output.execution.status='completed',
   refreshed:j=>j.outcome.output.output.status='complete',save:j=>j.outcome.output.package_saved=true,
   phase:j=>j.outcome.output.phases.push({phase:'materialization_start',status:'verified',receipt_id:'op:materialization_start'}),
   reordered:j=>j.outcome.output.phases.reverse(),unverified:j=>j.outcome.output.phases[0].status='pending',
   configuration:j=>j.outcome.output.configuration.status=mode==='done'?'discarded':'applied',
   ...(mode==='done'?{sha:j=>j.outcome.output.configuration.readback.source.sha256='a'.repeat(64),
     explicit:j=>j.outcome.output.configuration.readback.execution_effects.explicit_execute_requested=true,
     internal:j=>j.outcome.output.configuration.readback.execution_effects.internal_execution_started=false}: {})
 }))test('configuration verifier rejects '+mode+'/'+schemaMode+'/'+name,()=>{
   const bad=job(mode,schemaMode);mutate(bad);
   assert.throws(()=>verifyJavascriptConfigurationJob(bad,{node,mode,schemaMode,source}));
 });
}
