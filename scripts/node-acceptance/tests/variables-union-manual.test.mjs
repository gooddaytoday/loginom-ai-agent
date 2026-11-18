import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {auditVariablesUnionManual,auditVariablesUnionRefusal} from '../variables-union-manual.mjs';
const load=phase=>JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/variables-coluniondatavar/acceptance/expected-manual-'+phase+'-run.json',import.meta.url)));
const initial=load('initial'),updated=load('updated');
test('stock refusal validator admits the two Variables Calculator sources only for the union refusal case',()=>{
 const r=spawnSync('python3',['-c',`import ast, importlib.util
s=importlib.util.spec_from_file_location('runner','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
tree=ast.parse(open('scripts/node-acceptance/run-check.py').read())
check=next(n for n in ast.walk(tree) if isinstance(n,ast.Assert) and isinstance(n.msg,ast.Constant) and n.msg.value=='INVALID_REFUSAL_ORACLE')
expr=compile(ast.Expression(check.test),'refusal validator','eval')
spec=m.scenario('variables-union-type-refusal');expected=m.expected_for(spec,'/worker/refusal.lgp');refusal=expected['refusal'];rejection=None;execution_error=None;lgd_corrupt=False
assert eval(expr)
spec={};assert not eval(expr)
spec={'variables_union_refusal':True};expected['nodes'].append({'type':'variables.column_union'});assert not eval(expr)
`],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
function history(){
 const node={document_id:'d',workflow_id:'w',node_id:'u'},inputs=[0,1].map(input=>({kind:'variables',input,output:0,source:{...node,node_id:'s'+input}}));
 const fields=initial.variable_inventory.outputs[0].variables.map((v,i)=>({input:1-i,source:'amount',name:v.name,label:v.label,type:v.type}));
 const checkpoint=(id,expected)=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node,execution:{status:'completed',execution_id:id},
  configuration:{readback:{kind:'variables_column_union',mapping:'manual',input_count:2,inputs,fields,mapping_fields:fields.map(f=>({input:f.input,source_name:f.source,output_name:f.name}))}},
  output:{variable_ports:[{kind:'variables',port:0,read_id:id,execution_id:id,source:'execution',native_source:'VariablesForm',complete:true,fresh:true,count:2,completeness:{loaded:true,count:2,store_count:2,unique_ids:2},
   variables:expected.variable_inventory.outputs[0].variables.map((v,index)=>({id:index,index,name:v.name,label:v.label,type:v.type,cell:{type:v.type,is_null:false,value:v.type==='integer'?String(v.value):v.value,...(v.type==='integer'?{precision:'exact_integer'}:{})}}))}]}}});
 return [checkpoint('first',initial),{phase:'node_apply_prepared',request:{target:{kind:'existing',type:'variables.calculator',ref:inputs[1].source},parameters:{expressions:[{target:{kind:'existing',name:'amount'},formula:'23'}]}}},
  {phase:'node_apply_prepared',request:{target:{kind:'existing',type:'variables.column_union',ref:node},parameters:{},mappings:[],variable_inputs:[]}},checkpoint('second',updated)];
}
test('manual oracle requires full typed ordered results, retained IDs, source-only patch and fresh execution',()=>{
 assert.equal(auditVariablesUnionManual(history(),initial,updated).status,'PASS');
 for(const change of [e=>e.shift(),e=>e.splice(1,1),e=>e[1].request.target.ref={node_id:'left'},
  e=>e[1].request.parameters.expressions.push({target:{name:'empty'},formula:'"x"'}),e=>e[2].request.parameters={column_union:{mapping:'manual'}},
  e=>e[3].result.node={node_id:'other'},e=>e[3].result.execution.execution_id='first',
  e=>e[3].result.output.variable_ports[0].variables.reverse(),e=>e[3].result.output.variable_ports[0].variables[1].cell.value='7,0',
  e=>e[3].result.output.variable_ports[0].variables[0].id=99,e=>e[3].result.configuration.readback={...e[3].result.configuration.readback,inputs:[]}]){
  const events=history();change(events);assert.throws(()=>auditVariablesUnionManual(events,initial,updated));
 }
});
function refusalHistory(){
 const graph={complete:true,nodes:[{type:'variables.calculator',ref:{node_id:'left'}},{type:'variables.calculator',ref:{node_id:'right'}},{type:'variables.user',ref:{node_id:'builtin'}}],links:[],variable_links:[]};
 return [{phase:'node_apply_prepared',request:{operation_id:'refusal',target:{kind:'new',type:'variables.column_union'},parameters:{column_union:{mapping:'manual',fields:[{input:0,source:'amount',type:'string'}]}}}},
  {phase:'node_variables_union_preflight',operation_id:'refusal',settings_changed:false,graph_before:graph,graph_after:structuredClone(graph),outputs:[0,1].map(input=>({complete:true,count:2,variables:[{name:'amount',label:'amount',type:'integer',cell:{type:'integer',is_null:false,precision:'exact_integer',value:String(input?19:7)}},{name:input?'enabled':'empty',label:input?'enabled':'empty',type:input?'boolean':'string',cell:{type:input?'boolean':'string',is_null:false,value:input?false:''}}]}))},
  {phase:'node_phase_refused',operation_id:'refusal',receipt:{phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true}}];
}
function refusalWithRead(){
 return [...refusalHistory(),{phase:'node_apply_prepared',request:{operation_id:'read-left',target:{kind:'existing',type:'variables.calculator',ref:{node_id:'left'}},
  mode:'read_existing_output',parameters:{source_operation_id:'left-create',execution_policy:'existing',schemas:[]},inputs:[],mappings:[],finish:'done'}},
  {phase:'node_phase_completed',operation_id:'read-left',receipt:{phase:'finish',status:'verified',value:{settings_applied:false,execution_started:false}}}];
}
test('type-refusal oracle allows existing output reads after refusal without settings changes',()=>{
 const events=refusalWithRead();
 events.push(...structuredClone(events.slice(3)).map(e=>{
  if(e.request){e.request.operation_id='read-right';e.request.target.ref.node_id='right';e.request.parameters.source_operation_id='right-create';}
  else e.operation_id='read-right';
  return e;
 }));
 assert.equal(auditVariablesUnionRefusal(events).status,'PASS');
});
test('type-refusal oracle still rejects settings edits, new nodes and source patches after refusal',()=>{
 for(const change of [e=>e[3].request.target.kind='new',e=>e[3].request.mode='expression',
  e=>e[3].request.parameters.execution_policy='execute',e=>e[3].request.finish='execute',
  e=>e[3].request.parameters.expressions=[{target:{kind:'existing',name:'amount'},formula:'23'}],
  e=>e[3].request.inputs=[{input:0}],e=>e[3].request.variable_inputs=[{input:0}],e=>e[3].request.mappings=[{input:0}],
  e=>e[3].request.parameters.schemas=[{port:0}],e=>e[4].receipt.value.settings_applied=true,
  e=>e[3].request.bindings=[{name:'amount'}],e=>e[3].request.target.ref.node_id='other',
  e=>e[4].receipt.value.execution_started=true,e=>e[4].operation_id='unrelated',e=>e.pop()]){
  const events=refusalWithRead();change(events);
  assert.throws(()=>auditVariablesUnionRefusal(events),/VARIABLES_UNION_REFUSAL_NO_WORKAROUND_OR_SOURCE_PATCH/);
 }
});
test('type-refusal oracle requires native preflight, unchanged graph and values, no engine gesture or workaround',()=>{
 const events=refusalHistory();
 assert.equal(auditVariablesUnionRefusal(events).status,'PASS');
 for(const change of [e=>e.shift(),e=>e[1].graph_after.nodes.push({type:'variables.column_union'}),e=>e[1].outputs[1].variables[0].cell.value='23',
  e=>e[2].receipt.effect_possible=true,e=>e.push({phase:'node_step_prepared',operation_id:'refusal',action:{verb:'execute_graph_node'}}),
  e=>e.push({phase:'node_apply_prepared',request:{target:{type:'variables.calculator'}}})]){
  const e=structuredClone(events);change(e);assert.throws(()=>auditVariablesUnionRefusal(e));
 }
});
