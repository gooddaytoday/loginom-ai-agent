import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateVariablesToTableParameters,validateVariablesToTableFields} from '../lib/variables-vartodata-parameters.mjs';

const fields=JSON.parse(readFileSync(new URL('../../../../docs/node-development/nodes/variables-vartodata/fixtures/variables.json',import.meta.url)));
const request=()=>({document_id:'doc',workflow_ref:{workflow_id:'wf'},target:{kind:'new'},finish:'execute',inputs:[],
 variable_inputs:[{source:{document_id:'doc',workflow_id:'wf',node_id:'source'},output:0,input:0,kind:'variables'}],mappings:[],read:{ports:[0]}});
test('columns accepts empty settings and the eight stage-0 scalar fields without coercing values',()=>{
 assert.doesNotThrow(()=>validateVariablesToTableParameters({},'columns',request()));
 const copy=structuredClone(fields);validateVariablesToTableFields(fields);assert.deepEqual(fields,copy);
 assert.equal(fields[1].value,false);assert.equal(fields[4].value,null);assert.equal(fields[6].value,'');assert.equal(fields[7].value,0);
});
test('unsupported mode and settings refuse before a driver can mutate',()=>{
 assert.throws(()=>validateVariablesToTableParameters({},'rows',request()),/Этот режим пока не поддерживается/);
 for(const p of [null,[],{variables:fields},{layout:'columns'},{to_rows:false},{expressions:[]},{local_variables:[]}])
  assert.throws(()=>validateVariablesToTableParameters(p,'columns',request()));
});
test('table input mappings and foreign output ports cannot configure a variable socket',()=>{
 for(const mappings of [[{direction:'input',port:0}],[{direction:'output',port:1}]]){
  const r=request();r.mappings=mappings;assert.throws(()=>validateVariablesToTableParameters({},'columns',r));
 }
});
test('empty, duplicate, unsupported or incomplete variable metadata refuses without guessed names or types',()=>{
 for(const bad of [[],[fields[0],fields[0]],[{...fields[0],type:'variant'}],[{...fields[0],label:null}],[{...fields[0],name:''}]])
  assert.throws(()=>validateVariablesToTableFields(bad));
});
test('typed variable source admission refuses foreign workflows, tables, control ports and multiple sources',()=>{
 for(const change of [r=>r.inputs.push({input:0}),r=>r.variable_inputs=[],r=>r.variable_inputs.push(r.variable_inputs[0]),
  r=>r.variable_inputs[0].kind='control',r=>r.variable_inputs[0].kind='table',r=>r.variable_inputs[0].input=1,
  r=>r.variable_inputs[0].output=-1,r=>r.variable_inputs[0].source.document_id='foreign',r=>r.variable_inputs[0].source.workflow_id='foreign']){
  const r=request();change(r);assert.throws(()=>validateVariablesToTableParameters({},'columns',r));
 }
});
