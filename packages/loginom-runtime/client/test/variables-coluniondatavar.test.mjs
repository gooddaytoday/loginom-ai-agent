import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVariablesColumnUnionParameters,resolveVariablesColumnUnionInputs} from '../lib/variables-coluniondatavar-parameters.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
const source=id=>({document_id:'doc',workflow_id:'wf',node_id:id});
const request=()=>({target:{kind:'new'},inputs:[],variable_inputs:[0,1].map(input=>({kind:'variables',input,output:0,source:source('s'+input)})),mappings:[],finish:'execute',read:{ports:[],variable_ports:[0]}});
test('two native variable inputs register independently from positional table union',()=>{
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 const handler=support.nodeApplyHandlers.get('variables.column_union');assert.ok(handler);
 assert.deepEqual(handler.modes,['append_variables']);
 assert.equal(NODE_TYPES['variables.column_union'].variable_inputs,2);
 assert.equal(NODE_TYPES['variables.column_union'].tabular_outputs,0);
 handler.validate({},'append_variables',request());
 handler.validate({column_union:{mapping:'automatic'}},'append_variables',request());
});
test('reject unsupported mapping, mode, read, duplicate sources and missing fixed input before mutation',()=>{
 for(const mutate of [r=>r.variable_inputs.pop(),r=>r.variable_inputs[1].input=2,r=>r.variable_inputs[0].kind='control',
  r=>r.variable_inputs[1].source=r.variable_inputs[0].source,r=>r.inputs.push({}),r=>r.mappings.push({direction:'output',port:0}),r=>r.read.ports=[0],r=>r.read.variable_ports=[1]]){
  const r=request();mutate(r);assert.throws(()=>validateVariablesColumnUnionParameters({},'append_variables',r));
 }
 for(const p of [{column_union:{mapping:'manual'}},{column_union:{}},{column_union:{mapping:'automatic',extra:true}},{extra:true}])assert.throws(()=>validateVariablesColumnUnionParameters(p,'append_variables',request()));
 assert.throws(()=>validateVariablesColumnUnionParameters({},'positional',request()));
});
test('existing empty link patch keeps exact reciprocal graph edges and refuses dynamic inputs',()=>{
 const r={...request(),target:{kind:'existing',ref:source('u')},variable_inputs:[]};
 validateVariablesColumnUnionParameters({},'append_variables',r);
 const graph={nodes:[...['s0','s1'].map(id=>({ref:source(id),variable_outputs:[{kind:'variables',port:0,port_guid:'out-'+id}]})),
  {ref:source('u'),type:'variables.column_union',locked:false,variable_inputs:[0,1].map(port=>({kind:'variables',port,port_guid:'in'+port}))}],
  variable_links:request().variable_inputs.map(i=>({kind:'variables',source:i.source.node_id,target:'u',input:i.input,output:0,source_port_guid:'out-'+i.source.node_id,target_port_guid:'in'+i.input}))};
 assert.deepEqual(resolveVariablesColumnUnionInputs(r,graph).map(i=>i.source.node_id),['s0','s1']);
 graph.nodes.at(-1).variable_inputs.push({kind:'variables',port:2});assert.throws(()=>resolveVariablesColumnUnionInputs(r,graph));
});
