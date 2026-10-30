import test from 'node:test';
import assert from 'node:assert/strict';
import {predictNewCalculatorOutput,preflightCalculatorSource,preflightInactiveCalculatorSource} from '../lib/calculator-preflight.mjs';
import {preflightInactiveTabularSource} from '../lib/grouping-preflight.mjs';
import {resolveGroupingParameters} from '../lib/grouping-parameters.mjs';
const input=[{name:'amount',label:'Amount',type:'real'},{name:'category',label:'Category',type:'string'}];
const parameters={expressions:[{target:{kind:'new'},name:'tax',label:'Tax',type:'real',formula:'amount*0.2',replace:false}]};
const layout=names=>[{direction:'output',port:0,fields:names.map(name=>({source:{kind:'configured_field',name}}))}];
test('new calculator predicts all inherited and calculated output fields',()=>{
 assert.deepEqual(predictNewCalculatorOutput(parameters,input).map(f=>f.name),['tax','amount','category']);
 assert.equal(predictNewCalculatorOutput(parameters,input,layout(['category','tax','amount'])).length,3);
});

function inactiveFixture(fault){
 const node={document_id:'doc',workflow_id:'flow',node_id:'import'},tid='source',port={index:0,port_guid:'port',tid:tid+';Output_Data-0',active:false};
 const icon=fault==='calculated'?'bg-vendor-icon-calcdata':'bg-vendor-icon-importtextfile';
 const form=fault==='calculated'?'DerivedDataSourceOutputSocketWizard':'DataSetOutputSocketWizard';
 const owner={...node,verified:true,surface:'wizard',output_port:{direction:'output',port:0,native_index:0,port_guid:'port',opening_operation_id:'open',node_icon_class:icon}};
 const root='wizard',events=[];let opened=false,closed=false,selected=fault!=='deselected';
 const state=()=>({prepared_node_context:closed?{...node,verified:true,surface:'graph',locked:false,tid}:owner,
  wizard:closed?{status:'absent'}:{status:'observed',stage:'output_mapping',root_ref:root,root_tid:root,port_context:{status:'observed',kind:'output_data',node:{ref:'node'},port:{ref:'port'}}},
  ui:{dialogs:[],masks:[],elements:[{tid:root+';'+form+';rbTable;DisplayEl',allowed_actions:['set_checked'],check_state:{checked:true}},
   {tid:root+';'+form+';btnGetSourceColumns',visible:true,enabled:false,allowed_actions:['click']},
   {tid:root+';btnClose',ref:'close',allowed_actions:['click']},
   {tid,ref:'source',graph_node:{part:'body'},interaction:{state:'point_observed'},allowed_actions:['click']}]},
  node_mapping:{verified:true,inventory_complete:fault!=='incomplete',source_identity_verified:true,target_fields:input.map(f=>({...f,excluded:false}))},
  node_outputs:{verified:true,node_selected:selected,ports:selected?[{...port,port_guid:fault==='changed_port'?'other':'port',active:fault==='activated'}]:[]}});
 const channel={openOutputPort:async index=>{assert.equal(index,0);opened=true;events.push('open');},
  observe:async o=>{assert.ok(opened);const s=state();assert.ok(o.ready(s),o.condition);events.push(o.readMappings?'schema':o.readOutputs?'outputs':'observe');return structuredClone(s);},
  perform:async o=>{const s=state();assert.ok(o.ready(s));const a=o.resolve(s);
   if(a.ref==='source'){assert.equal(closed,true);selected=true;events.push('select');return {status:'SUCCEEDED'};}
   assert.deepEqual(a,{verb:'click',ref:'close'});events.push('close');if(fault==='close')throw Error('unknown close');closed=true;return {status:'SUCCEEDED'};}};
 const binding={document_id:'doc',workflow_ref:{workflow_id:'flow'},node};
 const source={channel,binding,port,state:{prepared_node_context:{...node,tid},ui:{elements:[{tid,signature:{native_graph:{status:'non_script',icon:fault==='foreign_type'?'bg-vendor-icon-javascript':icon,node_id:node.node_id}}}]}}};
 const request={parameters:fault==='invalid_expression'?{expressions:[{...parameters.expressions[0],name:'amount'}]}:parameters,mappings:[]};
 const options={operation:{id:'l505',parameters:request},onRecord:async e=>{events.push('journal');return fault==='ack'?{}:structuredClone(e);}};
 return {events,source,options,run:()=>preflightInactiveCalculatorSource(options,source)};
}
test('inactive calculator preflight reads native fields, cancels and journals unchanged activity without execution',async()=>{
 const f=inactiveFixture(),proof=await f.run();
 assert.deepEqual(proof.schema,input);assert.equal(proof.parameters_valid,true);assert.equal(proof.settings_changed,false);
 assert.deepEqual(proof.source_activity,{before:false,after:false,changed:false});assert.equal(proof.cancellation.draft_discarded,true);
 assert.ok(f.events.indexOf('schema')<f.events.indexOf('close'));assert.ok(f.events.indexOf('close')<f.events.indexOf('outputs'));
 assert.equal(f.events.at(-1),'journal');
});
test('inactive calculator source is reselected after native editor cancellation hides its ports',async()=>{
 const f=inactiveFixture('deselected');assert.equal((await f.run()).verified,true);
 assert.ok(f.events.indexOf('close')<f.events.indexOf('select'));assert.equal(f.events.at(-1),'journal');
});
for(const fault of ['incomplete','changed_port','activated','foreign_type','close','ack'])test('inactive calculator source fails closed: '+fault,async()=>{
 const f=inactiveFixture(fault);await assert.rejects(f.run());
 if(fault==='foreign_type')assert.deepEqual(f.events,[]);
 if(['changed_port','activated','close'].includes(fault))assert.ok(!f.events.includes('journal'));
});
test('invalid calculator request closes the source editor before returning a settled refusal',async()=>{
 const f=inactiveFixture('invalid_expression');await assert.rejects(f.run(),e=>e.nodePhaseRefusal?.cleanup_complete===true&&/collides/.test(e.message));
 assert.ok(f.events.includes('close'));assert.equal(f.events.at(-1),'journal');
});
for(const fault of [undefined,'calculated'])test('grouping reuses the owned inactive schema and its cancellation: '+fault,async()=>{
 const f=inactiveFixture(fault);f.options.operation.parameters.parameters={group_by:[{kind:'input_field',name:'category'}],
  measures:[{field:{kind:'input_field',name:'amount'},function:'count',name:'Count',label:'Count'}]};
 const proof=await preflightInactiveTabularSource(f.options,f.source,{label:'grouping',
  sourceIcons:['bg-vendor-icon-importtextfile','bg-vendor-icon-calcdata'],resolve:resolveGroupingParameters});
 assert.equal(proof.verified,true);assert.equal(proof.parameters_valid,true);
 assert.deepEqual(proof.source_activity,{before:false,after:false,changed:false});assert.ok(f.events.includes('close'));
});
test('incomplete, extra, repeated and conflicting output fields fail before target mutation',()=>{
 for(const names of [['tax'],['tax','amount','unknown'],['tax','tax','category'],['tax','amount','category','extra']])
  assert.throws(()=>predictNewCalculatorOutput(parameters,input,layout(names)),/Invalid mappings.fields/);
 const mapping=layout(['tax','amount','category']);mapping[0].fields[0].name='category';
 assert.throws(()=>predictNewCalculatorOutput(parameters,input,mapping),/conflicting output name/);
 mapping[0].fields[0].name='tax';mapping[0].fields[0].excluded=true;
 assert.throws(()=>predictNewCalculatorOutput(parameters,input,mapping),/calculated output/);
 mapping[0].fields[0].excluded=false;mapping[0].fields[1].excluded=true;
 assert.equal(predictNewCalculatorOutput(parameters,input,mapping).length,3);
});
test('replacement and expression ordering are checked against the live input schema',()=>{
 assert.throws(()=>predictNewCalculatorOutput({expressions:[{...parameters.expressions[0],name:'amount'}]},input),/collides/);
 assert.throws(()=>predictNewCalculatorOutput({expressions:[{...parameters.expressions[0],replace:true}]},input),/missing/);
 assert.throws(()=>predictNewCalculatorOutput({...parameters,order:['absent']},input),/every resulting expression/);
 assert.deepEqual(predictNewCalculatorOutput({expressions:[{...parameters.expressions[0],name:'amount',replace:true}]},input).map(f=>f.name),['amount','category']);
});
test('existing calculator retains its native schema path; new calculator requires explicit input',async()=>{
 const options={operation:{parameters:{target:{kind:'existing'},parameters,inputs:[],mappings:[]}},execute:()=>{throw Error('No browser call expected');}};
 assert.equal((await preflightCalculatorSource(options,{},{})).validation_deferred,'input_mapping');
 options.operation.parameters.target.kind='new';
 await assert.rejects(()=>preflightCalculatorSource(options,{},{}),error=>{
  assert.match(error.message,/requires an explicit input/);
  assert.deepEqual(error.nodePhaseRefusal,{phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true});return true;
 });
});

test('LAB-505 configured inactive text import reaches the owned schema editor without F3 or Execute',async()=>{
 const node={document_id:'doc',workflow_id:'flow',node_id:'import'},tid='MF;TF;Graph;Import';
 const workflow={workflow_id:'flow',prefix:'MF;TF',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',navigation_path:[{tid:'path',label:'Scenario'}]};
 const owner={...node,verified:true,surface:'graph',locked:false,tid};
 const port={index:0,native_index:0,port_guid:'output',tid:tid+';Output_Data-0',active:false,activity_source:'rendered_port_icon'};
 const operation={id:'l505',action:{action_key:'node.apply',revision:'1'},deadline:100000,parameters:{document_id:'doc',workflow_ref:workflow,target:{kind:'new'},parameters,inputs:[{source:node,input:0,output:0}],mappings:[]}};
 const options={operation,now:()=>1000,onRecord:async e=>e,receiptOptions:()=>({}),execute:async code=>{
  assert.ok(!code.includes('"key":"F3"')&&!code.includes('"verb":"execute_graph_node"'));
  if(code.includes('readOutputContext'))return {verified:true,node_context:owner,ports:[port]};
  if(code.includes('openPreparedOutputPort'))throw Error('OWNED_SCHEMA_EDITOR');
  return {status:'SUCCEEDED',cleanup_complete:true,effect_possible:false,output:{origin:'https://example.test',loginom_build:'7.4.2',workflow_ref:workflow,
   dom_epoch:{document:'doc'},prepared_node_context:owner,wizard:{status:'absent'},scan:{complete:true},
   ui:{elements:[{tid,ref:'body',signature:{native_graph:{status:'non_script',icon:'bg-vendor-icon-importtextfile',node_id:node.node_id}},allowed_actions:['click']},
    {tid:port.tid,ref:'port',signature:{native_graph:{status:'non_script',icon:'bg-vendor-icon-importtextfile'}},allowed_actions:['click','press']}],dialogs:[],masks:[],truncated:{dialogs:false,masks:false}}}};
 }};
 await assert.rejects(()=>preflightCalculatorSource(options,{}, {targetOrigin:'https://example.test',targetBuild:'7.4.2'}),/OWNED_SCHEMA_EDITOR/);
});
