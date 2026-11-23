import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditVariablesToTableSwitch} from '../variables-totable-switch.mjs';

const dir=new URL('../../../docs/node-development/nodes/variables-vartodata/acceptance/modes/',import.meta.url);
const tags={null:1,real:5,datetime:7,string:8,boolean:11,integer:20};
function port(o,execution_id){
 const cell=(c,v)=>{
  if(c.type==='variant')return v===null?{type:'variant',cell_type:'null',is_null:true,value:null,precision:'exact_native',native:{tag:1}}
   :{type:'variant',cell_type:v.cell_type,is_null:false,value:['integer','real'].includes(v.cell_type)?String(v.value):v.value,precision:'exact_native',native:{tag:tags[v.cell_type]}};
  return v===null?{type:c.type,is_null:true,value:null,precision:'exact_null'}
   :{type:c.type,is_null:false,value:c.type==='integer'?String(v):v,precision:c.type==='real'?'17_significant_digits':'source_text',...(c.type==='real'?{representation:'binary64',decimal:String(v)}:{})};
 };
 return {port:0,fresh:true,execution_id,freshness_basis:'completed_execution_port_source',schema:o.columns.map((c,index)=>({name:c.name,label:c.label,type:c.type,index})),
  row_count:o.rows.length,sample_complete:true,precision:{numbers_verified:true},sample:o.rows.map(r=>o.columns.map(c=>cell(c,r[c.name])))};
}
const link={kind:'variables',source:{node_id:'src'},output:0,input:0,source_port_guid:'sg',target_port_guid:'tg'};
const checkpoint=(mode,o,execution_id)=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node:{document_id:'doc',workflow_id:'wf',node_id:'conv'},
 execution:{status:'completed',execution_id},configuration:{readback:{kind:'variables_to_table',mode,variable_input:{...link}}},output:{ports:[port(o,execution_id)]}}});
const apply=(type,kind,mode,extra={})=>({phase:'node_apply_prepared',request:{target:{type,kind,...(kind==='existing'?{ref:{node_id:type==='variables.user'?'src':'conv'}}:{})},mode,parameters:{},mappings:[],...extra}});
async function fixture(){
 const phases=JSON.parse(await readFile(new URL('expected-phases.json',dir)));
 const events=[apply('variables.user','new','x'),apply('variables.to_table','new','columns'),
  apply('variables.to_table','existing','rows'),checkpoint('rows',phases.switch_rows,'e1'),
  apply('variables.user','existing','x'),apply('variables.to_table','existing','rows'),checkpoint('rows',phases.changed_rows,'e2'),
  apply('variables.to_table','existing','columns'),checkpoint('columns',phases.switch_back_columns,'e3')];
 return {phases,events};
}
test('switch audit accepts rows, edited rows and columns on one retained converter',async()=>{
 const {phases,events}=await fixture();
 assert.equal(auditVariablesToTableSwitch(phases,events).status,'PASS');
});
test('switch audit refuses every deviation named by the approved criteria',async()=>{
 const {phases,events}=await fixture();
 const faults={
  value:e=>{e[6].result.output.ports[0].sample[0][2].value='5';},
  null_as_empty:e=>{e[6].result.output.ports[0].sample[2][2]={type:'variant',cell_type:'string',is_null:false,value:'',precision:'exact_native',native:{tag:8}};},
  subtype:e=>{e[3].result.output.ports[0].sample[0][2].native.tag=1;},
  order:e=>{e[8].result.output.ports[0].schema.reverse();},
  stale:e=>{e[6].result.output.ports[0].execution_id='old';},
  node:e=>{e[8].result.node.node_id='other';},
  link:e=>{e[8].result.configuration.readback.variable_input.target_port_guid='other';},
  second_converter:e=>{e.splice(7,0,apply('variables.to_table','new','columns'));},
  parameters:e=>{e[7].request.parameters={mappings:1};},
  no_source_edit:e=>{e.splice(4,1);},
  substitute:e=>{e.push(apply('transform.calculator','new','x'));},
  same_execution:e=>{e[8].result.execution.execution_id='e2';e[8].result.output.ports[0].execution_id='e2';},
  no_mode_request:e=>{e.splice(7,1);},
  reversed:e=>e.reverse()
 };
 for(const [name,edit] of Object.entries(faults)){
  const bad=structuredClone(events);edit(bad);
  assert.throws(()=>auditVariablesToTableSwitch(phases,bad),/VARIABLES_TOTABLE_SWITCH_/,name);
 }
});
