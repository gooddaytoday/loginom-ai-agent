import test from 'node:test';
import assert from 'node:assert/strict';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {createJavascriptCodeNodeSupport,validateJavascriptCodeRequest,javascriptCodeReadback,
  verifyJavascriptMappingGraph} from '../lib/javascript-code-node.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {compactNodeResult} from '../lib/user-results.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {createRedactor} from '../lib/redact.mjs';
const node={document_id:'doc',workflow_id:'flow',node_id:'node'};
const source={node_id:'source',document_id:'doc',workflow_id:'flow'};
const request={target:{kind:'new',type:'programming.javascript',position:{x:256,y:256}},mode:'script',
  inputs:[{source,output:0,input:0}],parameters:{source_text:'import {OutputTable} from "builtIn/Data";\n',schema_mode:'code'},
  mappings:[],finish:'execute',read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'}};

test('Code lifecycle admits complete new source but refuses unsupported scopes before effects',()=>{
 assert.equal(validateJavascriptCodeRequest(request.parameters,'script',request),request.parameters);
 for(const patch of [{target:{kind:'existing',type:'programming.javascript',ref:node}},
  {parameters:{...request.parameters,schema_mode:'declared'}},{finish:'done'},
  {mappings:[{direction:'output',port:0,autosync:false}]}]){
  const bad={...structuredClone(request),...patch};assert.throws(()=>validateJavascriptCodeRequest(bad.parameters,'script',bad));
 }
 assert.throws(()=>validateJavascriptCodeRequest({...request.parameters,source_text:'import fs from "fs";'},'script',request));
});

function graph(){return {complete:true,document_id:'doc',workflow_ref:{workflow_id:'flow'},nodes:[
 {ref:source,locked:false,dom_epoch:'old',inputs:[],outputs:[0],position:{x:10,y:10}},
 {ref:node,locked:true,dom_epoch:'old',inputs:[0],outputs:[0],position:{x:256,y:256}}],
 links:[{source:'source',target:'node',input:0,output:0}],foreign_links:[]};}

test('mapping close permits only the own lock transition while preserving complete graph structure',()=>{
 const before=graph(),after=structuredClone(before);after.nodes[1].locked=false;
 after.nodes.forEach(item=>item.dom_epoch='new');assert.equal(verifyJavascriptMappingGraph(before,after,node),true);
 for(const change of [v=>v.nodes[0].locked=true,v=>v.links=[],v=>v.nodes[1].position.x++,v=>v.nodes.pop(),
  v=>v.foreign_links=['foreign'],v=>v.nodes[1].ref.node_id='foreign',v=>v.complete=false]){
  const bad=structuredClone(after);change(bad);assert.throws(()=>verifyJavascriptMappingGraph(before,bad,node));
 }
});

function phases(){
 const mapping={verified:true,source_identity_verified:true,autosync:true,target_fields:[{index:0,name:'Amount',label:'Amount',
  type:'integer',data_kind:'Дискретный',excluded:false,source:{name:'Raw'}}]};
 return ['source','workflow','target','input_mapping','open','configure','node_finish','materialization_start',
  'materialization_execute','output_mapping','finish','execute','read'].map(phase=>({phase,receipt_id:'op:'+phase,
  status:'verified',effect_possible:true,value:phase==='node_finish'?{source_readback_verified:true,wizard_commit_verified:true,
    source_sha256:'a'.repeat(64),source_utf8_bytes:80,source_lf_lines:3}
    :phase==='output_mapping'||phase==='input_mapping'?{native_mapping:structuredClone(mapping)}
    :phase==='materialization_execute'||phase==='execute'?{owner_verified:true,status:'completed',execution_id:phase}: {}}));
}

test('executed Code readback survives full/user-v1 schemas and retains mapping without raw source',()=>{
 const p=phases(),readback=javascriptCodeReadback({node,phases:p});
 assert.equal(readback.execution_effects.explicit_execute_requested,true);
 assert.equal(readback.execution_effects.internal_execution_started,null);
 assert.equal(readback.output_mapping.fields[0].source_name,'Raw');
 const result={operation_id:'op',status:'SUCCEEDED',node,effect_possible:true,cleanup_complete:true,
  phases:p.map(({value,...phase})=>phase),execution:{status:'completed',execution_id:'execute'},
  output:{status:'not_refreshed',evidence_ref:null,ports:[]},package_saved:false,warnings:[],
  configuration:{status:'applied',readback},persisted_package_verified:false,checkpoint_kind:'local_node_checkpoint'};
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema);
 assert.equal(validate(result).valid,true,JSON.stringify(validate(result)));
 assert.deepEqual(compactNodeResult({operation_id:'op',state:'settled',outcome:{status:'SUCCEEDED',output:result}}).configuration,
  result.configuration);
 for(const change of [r=>r.configuration.readback.execution_effects.explicit_execute_requested=false,
  r=>delete r.configuration.readback.output_mapping,r=>r.configuration.readback.source.raw_text='private',
  r=>r.configuration.readback.receipt_ids=['op:source'],r=>r.pending_phase='retry']){
  const bad=structuredClone(result);change(bad);assert.equal(validate(bad).valid,false);
 }
 for(const change of [v=>v.find(p=>p.phase==='execute').value.execution_id='materialization_execute',
  v=>v.find(p=>p.phase==='execute').value.owner_verified=false,
  v=>v.find(p=>p.phase==='output_mapping').value.native_mapping.source_identity_verified=false]){
  const bad=phases();change(bad);assert.throws(()=>javascriptCodeReadback({node,phases:bad}));
 }
});

test('Code lifecycle has full UI materialization capability but is absent from the product catalog',()=>{
 const config={targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',redactor:createRedactor()};
 const support=createJavascriptCodeNodeSupport(config),handler=support.nodeApplyHandlers.get('programming.javascript');
 assert.equal(handler.materialize_output,true);assert.equal(handler.fullUiOutput,true);
 assert.equal(createCandidateNodeSupport(config).nodeApplyHandlers.has('programming.javascript'),false);
});
