import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseExpectedVariableInventory,matchVariableInventoryOutput} from '../expected-outputs.mjs';
import {auditDataToVarHistory} from '../variables-datatovar.mjs';

const fixture=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/variables-datatovar/acceptance/expected.json',import.meta.url)));
const want=variant=>({node:{type:'variables.from_table'},port:0,ordered:true,variables:structuredClone(fixture[variant].variables)});
const output=w=>({kind:'variables',port:0,port_guid:'port',fresh:true,complete:true,source:'execution',native_source:'VariablesForm',execution_id:'exec',read_id:'read',count:5,
 completeness:{count:5,store_count:5,unique_ids:5,loaded:true},variables:w.variables.map((v,index)=>({id:index,index,name:v.name,label:v.label,type:v.type,
 cell:{type:v.type,is_null:v.value===null,value:v.type==='integer'&&v.value!==null?String(v.value):v.value,...(v.value!==null?{precision:v.type==='integer'?'exact_integer':'17_significant_digits',...(v.type==='real'?{representation:'binary64',decimal:String(v.value)}:{})}:{})}}))});

test('DataToVar variable matcher accepts approved ordered typed fixtures, NULL and empty input',()=>{
 for(const variant of ['initial','updated','null','empty']){
  const w=want(variant);parseExpectedVariableInventory({variable_inventory:{outputs:[w]}});
  assert.equal(matchVariableInventoryOutput(output(w),w),true);
 }
});

test('DataToVar order is a criterion even when names, labels, types and values are otherwise correct',()=>{
 const w=want('initial'),a=output(w);a.variables.reverse();a.variables.forEach((v,i)=>v.index=i);
 assert.throws(()=>matchVariableInventoryOutput(a,w),/ORDER/);
 const unordered={...w,ordered:false};assert.equal(matchVariableInventoryOutput(a,unordered),true);
});

test('DataToVar uses the approved real tolerance and never applies it to integer or NULL identity',()=>{
 const w=want('initial'),a=output(w);a.variables[0].cell.value+=5e-12;a.variables[0].cell.decimal=String(a.variables[0].cell.value);
 assert.equal(matchVariableInventoryOutput(a,w),true);
 a.variables[0].cell.value+=1e-5;a.variables[0].cell.decimal=String(a.variables[0].cell.value);
 assert.throws(()=>matchVariableInventoryOutput(a,w),/VALUE/);
 const bad=want('initial');bad.variables[1].tolerance={abs:1};assert.throws(()=>parseExpectedVariableInventory({variable_inventory:{outputs:[bad]}}));
 const empty=want('empty'),zero=output(empty);zero.variables[0].cell={type:'real',is_null:false,value:0,precision:'17_significant_digits'};
 assert.throws(()=>matchVariableInventoryOutput(zero,empty),/VALUE/);
});

test('DataToVar history proves both data sets on the same executable node without reconfiguration',()=>{
 const initial={variable_inventory:{outputs:[want('initial')]}},final={variable_inventory:{outputs:[want('updated')]}},node={document_id:'doc',workflow_id:'wf',node_id:'var'};
 const checkpoint=(w,id,configuration)=>{
  const o=output(w);o.execution_id=id;o.read_id=id+':read';
  return {phase:'node_checkpoint',result:{operation_id:id,status:'SUCCEEDED',cleanup_complete:true,node,execution:{status:'completed',execution_id:id},
   ...(configuration?{configuration:{readback:{kind:'variables_from_table',mode:'aggregate',fields:[{name:'X',aggregations:['sum','count','min','max','avg']}]}}}:{}),output:{variable_ports:[o]}}};
 };
 const history=()=>[checkpoint(want('initial'),'one',true),{phase:'node_apply_prepared',request:{target:{kind:'existing',type:'variables.from_table',ref:node},mode:'aggregate',parameters:{}}},checkpoint(want('updated'),'two')];
 assert.equal(auditDataToVarHistory(history(),initial,final).status,'PASS');
 for(const corrupt of [e=>e.pop(),e=>e[2].result.node={...node,node_id:'foreign'},e=>e[2].result.execution.execution_id='one',
  e=>e[1].request.parameters={fields:[]},e=>e[1].request.target.kind='new',e=>e[1].request.target.type='programming.javascript',
  e=>e[2].result.output.variable_ports[0].variables.reverse(),e=>e[2].result.output.variable_ports[0].port_guid='foreign']){
  const events=history();corrupt(events);assert.throws(()=>auditDataToVarHistory(events,initial,final));
 }
});
