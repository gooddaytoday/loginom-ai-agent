import test from 'node:test';
import assert from 'node:assert/strict';
import {readAutoCorrelationOutputs,validateAutoCorrelationOutputSchema} from '../lib/auto-correlation-output.mjs';
import {autoCorrelationConfigurationReadback} from '../lib/auto-correlation-readback.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
const schema=[{name:'Lag',label:'Лаг',type:'integer'},{name:'X_ACF',label:'X: АКФ',type:'real'},{name:'X_StdErr',label:'X: Ошибка',type:'real'},{name:'X_Significant',label:'X: Значимость',type:'boolean'}];
test('ACF reads preserve native values, types, field/lag order and fresh execution binding',async()=>{
 const ctx={portExecution:{execution_id:'fresh'},execution:{execution_id:'fresh'},receipt_id:'read'};
 const output={port:0,schema:structuredClone(schema),row_count:1,sample:[{Lag:0,X_ACF:1,X_StdErr:0,X_Significant:true}],sample_complete:true};
 const channel={async readOutputPort(r){assert.equal(r.execution,ctx.portExecution);assert.equal(r.port,0);assert.equal(r.requireExactNumbers,true);return {output};}};
 const read={ports:[0],sample_rows:100,require_exact_numbers:true},mapping={lag_count:4,ports:[{port:0,schema}]};
 const run=()=>readAutoCorrelationOutputs(channel,read,ctx,mapping);
 const result=await run();assert.equal(result.status,'complete');assert.equal(result.ports[0].sample[0].X_Significant,true);
 for(const bad of [schema.slice().reverse(),schema.map(f=>({...f,type:f.name==='X_Significant'?'integer':f.type})),schema.map(f=>({...f,name:f.name==='X_StdErr'?'Y_StdErr':f.name}))])
  assert.throws(()=>validateAutoCorrelationOutputSchema(bad));
 output.sample[0].Lag=1;await assert.rejects(run,/lag order/);output.sample[0].Lag=0;
 output.row_count=5;await assert.rejects(run,/lag count/);output.row_count=1;
 output.schema[1].label='changed';await assert.rejects(run,/committed output/);
});
test('ACF readback refuses foreign owners, incomplete receipts, PACF and stale output schemas',()=>{
 const node={document_id:'doc',workflow_id:'wf',node_id:'acf'},owner={...node,verified:true};
 const fields=[{name:'RowID',label:'RowID',type:'integer',usage_type:0},{name:'X',label:'X',type:'real',usage_type:1}];
 const phases=['input_mapping','configure','node_finish','output_mapping','finish'].map(phase=>({phase,status:'verified',receipt_id:'op:'+phase,value:{verified:true,cleanup_complete:true,settings_applied:true,node_context:owner}}));
 phases[0].value.native_mapping={verified:true,inventory_complete:true,node_context:{...owner,input_port:{port:0}},target_fields:fields};phases[0].value.finish={settings_applied:true};
 phases[1].value.configuration={verified:true,node_context:owner,fields,field:'X',domain:'time',pacf:false,lag_count:4,output_schema:schema};
 phases[1].value.validation={status:'accepted_by_loginom_next',node_context:owner};phases[3].value.ports=[{port:0,schema}];
 const run=p=>autoCorrelationConfigurationReadback({node,phases:p,operation_id:'op'}),r=run(phases);
 assert.equal(r.field,'X');assert.equal(r.lag_count,4);assert.equal(r.package_persistence_verified,false);
 assert.equal(new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema.properties.configuration.properties.readback)(r).valid,true);
 for(const change of [p=>p[1].value.configuration.node_context={...owner,node_id:'foreign'},p=>p[1].value.configuration.pacf=true,
  p=>p[2].value.settings_applied=false,p=>p[4].receipt_id='wrong',p=>p[0].value.native_mapping.node_context.input_port.port=1,
  p=>p[3].value.ports[0].schema.reverse(),p=>p[1].value.configuration.fields[0].usage_type=1]){
  const p=structuredClone(phases);change(p);assert.throws(()=>run(p));
 }
});
