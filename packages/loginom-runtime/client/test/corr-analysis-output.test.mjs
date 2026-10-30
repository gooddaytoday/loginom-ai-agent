import test from 'node:test';
import assert from 'node:assert/strict';
import {readCorrAnalysisOutputs,CORR_ANALYSIS_OUTPUT} from '../lib/corr-analysis-output.mjs';
import {corrAnalysisConfigurationReadback} from '../lib/corr-analysis-readback.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
test('native Pearson read keeps NULL and port execution binding, rejects reordered or renamed fields',async()=>{
 const ctx={portExecution:{execution_id:'fresh'},execution:{execution_id:'fresh'},receipt_id:'read'},sample=[{Pirson:null}];
 const output={port:0,schema:structuredClone(CORR_ANALYSIS_OUTPUT),sample,sample_complete:true};
 const channel={async readOutputPort(request){assert.equal(request.execution,ctx.portExecution);assert.equal(request.port,0);return {output};}};
 const read={ports:[0],sample_rows:10,require_exact_numbers:true};
 const r=await readCorrAnalysisOutputs(channel,read,ctx);assert.equal(r.status,'complete');assert.equal(r.ports[0].sample[0].Pirson,null);
 for(const bad of [CORR_ANALYSIS_OUTPUT.slice().reverse(),CORR_ANALYSIS_OUTPUT.map(f=>({...f,name:f.name==='Pirson'?'Pearson':f.name})),CORR_ANALYSIS_OUTPUT.map(f=>({...f,type:f.name==='Pirson'?'integer':f.type}))]){
  output.schema=bad;await assert.rejects(()=>readCorrAnalysisOutputs(channel,read,ctx),/schema/);
 }
});
test('correlation readback requires committed settings, exact receipts and its owned node',()=>{
 const node={document_id:'doc',workflow_id:'wf',node_id:'corr'},operation_id='apply';
 const configuration={verified:true,node_context:{...node},coefficients:{pearson:true,kendall:false,spearman:false,extremum:false},fields:[{name:'X',first_set:true,second_set:false},{name:'Z',first_set:false,second_set:true}]};
 const phases=['input_mapping','configure','node_finish','output_mapping','finish'].map(phase=>({phase,status:'verified',receipt_id:operation_id+':'+phase,value:{verified:true,cleanup_complete:true,settings_applied:true}}));
 phases[1].value={...phases[1].value,configuration,validation:{status:'accepted_by_loginom_next'}};
 const input={node,phases,operation_id},r=corrAnalysisConfigurationReadback(input);
 assert.deepEqual(r.first_set,['X']);assert.deepEqual(r.second_set,['Z']);
 const schema=nodeApplyResultSchema.properties.configuration.properties.readback;
 assert.equal(new AjvJsonSchemaValidator().getValidator(schema)(r).valid,true);
 for(const change of [p=>p[1].value.configuration.node_context.node_id='foreign',p=>p[1].value.configuration.coefficients.kendall=true,p=>p[2].value.settings_applied=false,p=>p[4].receipt_id='other']){
  const p=structuredClone(phases);change(p);assert.throws(()=>corrAnalysisConfigurationReadback({...input,phases:p}));
 }
});
