import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditVariablesCalculatorHistory} from '../variables-calculator.mjs';
const initial=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/variables-calculator/acceptance/expected-initial-run.json',import.meta.url)));
const final=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/variables-calculator/acceptance/expected-run.json',import.meta.url)));
function history(initialState=initial,finalState=final){
 const node={document_id:'doc',workflow_id:'wf',node_id:'calc'};
 const checkpoint=(id,want)=>({phase:'node_checkpoint',result:{operation_id:id,status:'SUCCEEDED',cleanup_complete:true,node,execution:{status:'completed',execution_id:id},
  configuration:{readback:{kind:'variables_calculator',syntax_validation:'accepted_by_loginom_next',expressions:want.variable_inventory.outputs[0].variables.map((v,index)=>({index,name:v.name,type:v.type,label:v.label,formula:v.name==='limit'?String(v.value):v.name,description:'',intermediate:false}))}},
  output:{variable_ports:[{kind:'variables',port:0,read_id:id,execution_id:id,source:'execution',native_source:'VariablesForm',complete:true,fresh:true,count:8,completeness:{loaded:true,count:8,store_count:8,unique_ids:8},variables:want.variable_inventory.outputs[0].variables.map((v,index)=>({id:index,index,...v,cell:{type:v.type,is_null:v.value===null,value:v.type==='integer'&&v.value!==null?String(v.value):v.value,...(v.type==='integer'&&v.value!==null?{precision:'exact_integer'}:v.type==='real'?{precision:'17_significant_digits'}:{})}}))}]}}});
 const events=[checkpoint('initial',initialState),checkpoint('updated',finalState)];
 for(const e of events){const p=e.result.output.variable_ports[0],n=p.variables.length;p.count=n;p.completeness={loaded:true,count:n,store_count:n,unique_ids:n};}
 return events;
}
test('calculator audit checks two fresh executions, exact typed native values, order and retained expressions',()=>{
 assert.equal(auditVariablesCalculatorHistory(history(),initial,final).status,'PASS');
 for(const corrupt of [e=>e.shift(),e=>e[1].result.node={node_id:'other'},e=>e[1].result.execution.execution_id='initial',
  e=>e[1].result.output.variable_ports[0].variables.reverse(),e=>e[1].result.output.variable_ports[0].variables[1].cell.value=null,
  e=>e[1].result.output.variable_ports[0].variables[0].id=99,e=>e[1].result.configuration.readback.expressions[1].formula='changed',
  e=>e[1].result.output.variable_ports[0].variables[5].cell.value=0.13]){
  const e=history();corrupt(e);assert.throws(()=>auditVariablesCalculatorHistory(e,initial,final));
 }
});

test('modes audit distinguishes four configured expressions from three emitted variables and checks only base changes',()=>{
 const state=total=>({nodes:[{type:'variables.calculator'}],outputs:[],variable_inventory:{outputs:[{node:{type:'variables.calculator'},port:0,variables:[
  {name:'report_date',label:'Дата отчёта',type:'datetime',value:'2026-11-07T23:59:58.123'},
  {name:'marker',label:'Синтетическая константа теста',type:'boolean',value:false},
  {name:'total',label:'Итого',type:'integer',value:total},
 ]}]}});
 const before=state(3),after=state(5);
 const events=()=>history(before,after).map((e,i)=>{
  Object.assign(e.result.output.variable_ports[0].variables[0].cell,{precision:'millisecond',representation:'local_datetime',timezone:'unspecified'});
  const expressions=e.result.configuration.readback.expressions;
  expressions.splice(2,0,{index:2,name:'base',label:'Основа',type:'integer',formula:i?'4':'2',description:'keep',intermediate:true});
  expressions[3].index=3;
  return e;
 });
 assert.equal(auditVariablesCalculatorHistory(events(),before,after,'variables-calculator-modes').status,'PASS');
 for(const corrupt of [
  e=>e[0].result.configuration.readback.expressions[2].intermediate=false,
  e=>e[1].result.configuration.readback.expressions[2].description='changed',
  e=>e[1].result.configuration.readback.expressions[2].type='real',
  e=>e[1].result.configuration.readback.expressions[2].formula='2',
  e=>e[1].result.configuration.readback.expressions[0].formula='changed',
  e=>e[1].result.configuration.readback.expressions.pop(),
  e=>e[1].result.configuration.readback.expressions.reverse(),
  e=>{const x=e[1].result.configuration.readback.expressions;x.unshift(x.splice(2,1)[0]);x.forEach((v,i)=>v.index=i);},
  e=>e[1].result.output.variable_ports[0].variables[0].id=99,
 ]){const e=events();corrupt(e);assert.throws(()=>auditVariablesCalculatorHistory(e,before,after,'variables-calculator-modes'));}
});
