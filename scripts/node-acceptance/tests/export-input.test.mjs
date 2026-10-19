import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExpectedOutputs,resolveExportInput,matchExpectedOutputs,mapExportInput,matchesExpectedOutput} from '../expected-outputs.mjs';
import {readFile} from 'node:fs/promises';

const output={output_node_type:'export_input',columns:[{name:'Code',type:'string'}],rows:[{Code:'A'}],ordered:true};
const node=(id,type,outputs=[0])=>({ref:{node_id:id},type,label:id,outputs});
const graph=()=>({complete:true,nodes:[node('filter','transform.filter_data'),node('rename','transform.reform_columns',[0,1]),node('export','exports.text',[])],
 links:[{source:'filter',output:0,target:'rename',input:0},{source:'rename',output:1,target:'export',input:0}]});
const actual=(id,port,name='Code')=>({node:{node_id:id},type:id==='filter'?'transform.filter_data':'transform.reform_columns',output_port:port,
 data:{schema:[{name,label:name,type:'string'}],row_count:1,sample_complete:true,precision:{numbers_verified:true},sample:[[{type:'string',is_null:false,value:'A'}]]}});

test('export_input parses in both forms and forbids explicit output ports or labels',()=>{
 const base={package_path:'/own/export.lgp',nodes:[]};
 for(const multiple of [false,true]){
  const wrap=o=>({...base,...(multiple?{outputs:[o]}:o)});
  assert.equal(parseExpectedOutputs(wrap(output)).outputs[0].output_node_type,'export_input');
  for(const options of [{output_port:0},{output_port:1},{output_node_label:'rename'},{output_port:undefined},{output_node_label:undefined}])
   assert.throws(()=>parseExpectedOutputs(wrap({...output,...options})));
 }
});

for(const [scenario,type,order] of [
 ['q7','transform.calculator',['Total','Office','Warehouse','Tech','Region']],
 ['q8','transform.reform_columns',['Office','Warehouse','Tech','Region']],
])test(`${scenario}: ${type} native order is projected through the saved export input, exact comparison stays strict`,async()=>{
 const expected=JSON.parse(await readFile(new URL(`../../../docs/testing/loginom-ai-agent/stability-2026-10-20/followups/${scenario}/expected-demo.json`,import.meta.url),'utf8')).outputs[0];
 assert.equal(expected.column_order,'exact');
 const schema=order.map((name,index)=>({...expected.columns.find(f=>f.name===name),index,
  label:expected.columns.find(f=>f.name===name).label??name}));
 const data={schema,row_count:expected.rows.length,sample_complete:true,precision:{numbers_verified:true},
  sample:expected.rows.map(row=>schema.map(f=>({type:f.type,is_null:false,value:f.type==='integer'?String(row[f.name]):row[f.name]})))};
 const source_fields=schema.map((f,i)=>({...f,record_id:'source-'+i,field_id:String(i)}));
 const mapping={verified:true,inventory_complete:true,settings_applied:false,source_fields,
  target_fields:expected.columns.map((f,index)=>({...f,index,label:f.label??f.name,source:source_fields.find(s=>s.name===f.name)}))};
 const g={complete:true,nodes:[node('report',type),node('export','exports.text',[])],links:[{source:'report',target:'export',input:0,output:0}]};
 const binding={...resolveExportInput(g),mapping};
 const actual={node:{node_id:'report'},type,output_port:0,data};
 assert.equal(matchesExpectedOutput(data,expected),false);
 const original=structuredClone(data),mapped=mapExportInput(data,mapping);
 assert.equal(matchesExpectedOutput(mapped,expected),true);
 assert.deepEqual(data,original);
 assert.deepEqual(mapped.schema.map(f=>f.name),expected.columns.map(f=>f.name));
 assert.equal(matchExpectedOutputs([actual],[expected],{exportInput:binding}).length,1);
 assert.throws(()=>matchExpectedOutputs([actual],[{...expected,output_node_type:type}],{exportInput:binding}),/COLD_OUTPUT_NOT_UNIQUELY_MATCHED/);
 for(const mutate of [m=>{m.target_fields.reverse();m.target_fields.forEach((f,i)=>f.index=i)},
  m=>m.target_fields[0].label='Wrong',m=>m.target_fields[0].name='Wrong',m=>m.target_fields.pop()]){
  const wrong=structuredClone(mapping);mutate(wrong);
  assert.throws(()=>matchExpectedOutputs([actual],[expected],{exportInput:{...binding,mapping:wrong}}),/COLD_OUTPUT_NOT_UNIQUELY_MATCHED/);
 }
 for(const mutate of [d=>d.sample[0][0].value=999999,d=>d.sample[0][0].type='boolean',d=>d.row_count++]){
  const wrong=structuredClone(actual);mutate(wrong.data);
  assert.throws(()=>matchExpectedOutputs([wrong],[expected],{exportInput:binding}),/COLD_OUTPUT_NOT_UNIQUELY_MATCHED/);
 }
 for(const mutate of [m=>m.verified=false,m=>m.inventory_complete=false,m=>m.settings_applied=true,
  m=>m.source_fields.pop(),m=>m.source_fields[0].type='boolean',m=>m.target_fields[0].source=null,
  m=>m.target_fields[0].source={...m.target_fields[0].source,record_id:'foreign'},m=>m.target_fields[0].excluded=true,
  m=>m.target_fields[0].type='boolean',m=>m.target_fields[0].index=99,
  m=>m.target_fields[1].name=m.target_fields[0].name]){
  const wrong=structuredClone(mapping);mutate(wrong);
  assert.throws(()=>mapExportInput(data,wrong),/COLD_EXPORT_INPUT_MAPPING_INVALID/);
 }
});

test('cold reads only the selected export input and cancels its wizard on success and refusal',async()=>{
 const {observeExportInputMapping}=await import('../static-source-proof.mjs');
 const target={ref:{document_id:'doc',workflow_id:'wf',node_id:'export'}};
 for(const fault of [null,'foreign','direction','incomplete','applied','cleanup']){
  const actions=[];let opened=false;
  const mapping={verified:true,inventory_complete:fault!=='incomplete',settings_applied:fault==='applied',
   node_context:{...target.ref,node_id:fault==='foreign'?'other':'export',verified:true,surface:'wizard',
    input_port:{direction:fault==='direction'?'output':'input',port:0}}};
  const channel={revealGraphNode:async()=>actions.push('reveal'),openInputPort:async port=>{assert.equal(port,0);opened=true;actions.push('open')},
   observe:async request=>{const s={prepared_node_context:{surface:opened?'wizard':'graph'},wizard:opened?{status:'observed',stage:'input_mapping'}:{status:'absent'},
    workflow_navigation:{status:'observed',path:[{label:'Scenario'}]},active_identity:'Scenario',node_mapping:mapping};
    assert.ok(request.ready(s),request.condition);return s;}};
  const helpers={selectPreparedGraphNode:async()=>actions.push('select'),closePreparedWizard:async()=>{opened=false;actions.push('cancel');return {verified:fault!=='cleanup',settings_applied:false}}};
  const result=observeExportInputMapping({load:async()=>helpers,target,channelFor:ref=>{assert.deepEqual(ref,target.ref);return channel}});
  if(fault)await assert.rejects(result,/COLD_SOURCE/);
  else assert.deepEqual(await result,mapping);
  assert.deepEqual(actions,['reveal','select','open','cancel']);
 }
});

test('export input follows the immediate renamed table and connected port after a filter',()=>{
 const binding=resolveExportInput(graph());
 assert.equal(binding.node.ref.node_id,'rename');assert.equal(binding.output_port,1);
 assert.equal(matchExpectedOutputs([actual('rename',1)],[output],{exportInput:binding}).length,1);
 for(const a of [actual('filter',0),actual('rename',0),actual('other-rename',1),actual('rename',1,'OriginalCode')])
  assert.throws(()=>matchExpectedOutputs([a],[output],{exportInput:binding}));
 assert.throws(()=>matchExpectedOutputs([actual('rename',1)],[output]));
});

test('missing or ambiguous export, connection, source and port refuse before output reading',()=>{
 for(const change of [g=>g.complete=false,g=>g.nodes.pop(),g=>g.nodes.push(node('second-export','exports.text',[])),
  g=>g.links.pop(),g=>g.links.push({...g.links[1]}),g=>g.links[1].input=1,
  g=>g.links[1].source='missing',g=>g.nodes.push({...g.nodes[1]}),
  g=>g.links[1].output=2,g=>g.links[1].output=-1,g=>g.links[1].output=0.5]){
  const g=graph();change(g);assert.throws(()=>resolveExportInput(g),/COLD_EXTRA_OR_MISSING_OUTPUT_NODE/);
 }
});

test('export from filter output 1 preserves the connected port for cold readback lookup',()=>{
 const g={complete:true,nodes:[node('filter','transform.filter_data',[0,1]),node('export','exports.text',[])],
  links:[{source:'filter',output:1,target:'export',input:0}]};
 const readback=actual('filter',1),binding=resolveExportInput(g);
 const [match]=matchExpectedOutputs([readback],[output],{exportInput:binding});
 assert.equal(match.output_port,1);
 assert.equal([readback].find(a=>a.node.node_id===match.node.node_id&&a.output_port===match.output_port),readback);
});

test('ordinary outputs retain type, label and port matching beside an export input',()=>{
 const binding=resolveExportInput(graph()),ordinary={...output,output_node_type:'transform.filter_data',output_node_label:'Original',output_port:0};
 const filter={...actual('filter',0),label:'Original'};
 assert.equal(matchExpectedOutputs([filter,actual('rename',1)],[ordinary,output],{exportInput:binding}).length,2);
 assert.throws(()=>matchExpectedOutputs([{...filter,label:'Wrong'},actual('rename',1)],[ordinary,output],{exportInput:binding}));
});

test('exact full export destination is additive and valid only on one export_input',()=>{
 const wrap=o=>({package_path:'/own/package.lgp',nodes:[],outputs:[o]});
 const wanted={...output,export_destination:'/own/revenue-ru.csv'};
 assert.equal(parseExpectedOutputs(wrap(wanted)).outputs[0].export_destination,wanted.export_destination);
 assert.equal(parseExpectedOutputs({package_path:'/own/package.lgp',nodes:[],...wanted}).outputs[0].export_destination,wanted.export_destination);
 for(const value of ['',null,undefined,42,'revenue-ru.csv','/own/../revenue-ru.csv','/own//revenue-ru.csv','/own/revenue-ru.csv\0'])
  assert.throws(()=>parseExpectedOutputs(wrap({...wanted,export_destination:value})),/EXPECTED_EXPORT_DESTINATION_INVALID/);
 assert.throws(()=>parseExpectedOutputs(wrap({...wanted,output_node_type:'transform.sorting'})),/EXPECTED_EXPORT_DESTINATION_INVALID/);
 assert.throws(()=>parseExpectedOutputs({...wrap(wanted),outputs:[wanted,{...wanted,export_destination:'/own/other.csv'}]}),/EXPECTED_EXPORT_INPUT_OPTIONS_INVALID/);
});

test('exact destination selects renamed report while the earlier s1 export remains legal',()=>{
 const g=graph();g.nodes.push(node('old-export','exports.text',[]));g.links.push({source:'filter',output:0,target:'old-export',input:0});
 const destination='/own/revenue-ru.csv',destinations=[{node_id:'old-export',destination:'/own/revenue.csv'},{node_id:'export',destination}];
 const binding=resolveExportInput(g,{destination,destinations});
 assert.equal(binding.node.ref.node_id,'rename');assert.equal(binding.output_port,1);
 assert.equal(matchExpectedOutputs([actual('rename',1)],[{...output,export_destination:destination}],{exportInput:binding}).length,1);
 for(const ds of [[],destinations.slice(1),[destinations[1],destinations[1]],
  destinations.map(d=>({...d,destination:'/other/revenue-ru.csv'})),destinations.map(d=>({...d,destination})),
  destinations.map(d=>({...d,destination:d.node_id==='export'?'/own/prefix-revenue-ru.csv':d.destination}))])
  assert.throws(()=>resolveExportInput(g,{destination,destinations:ds}),/COLD_EXTRA_OR_MISSING_OUTPUT_NODE/);
 assert.throws(()=>resolveExportInput(g),/COLD_EXTRA_OR_MISSING_OUTPUT_NODE/);
 const ordered=actual('rename',1);ordered.data.row_count=2;ordered.data.sample.push([{type:'string',is_null:false,value:'B'}]);
 const orderedWant={...output,rows:[{Code:'A'},{Code:'B'}],export_destination:destination};
 assert.equal(matchExpectedOutputs([ordered],[orderedWant],{exportInput:binding}).length,1);
 ordered.data.sample.reverse();assert.throws(()=>matchExpectedOutputs([ordered],[orderedWant],{exportInput:binding}),/COLD_OUTPUT_NOT_UNIQUELY_MATCHED/);
 for(const mutate of [d=>{d.schema[0].name='Wrong'},d=>{d.schema[0].label='Wrong'},d=>{d.schema[0].type='real'},d=>{d.sample[0][0].value='Wrong'},d=>{d.schema.push({...d.schema[0]})}]){
  const a=actual('rename',1);mutate(a.data);
  assert.throws(()=>matchExpectedOutputs([a],[{...output,export_destination:destination}],{exportInput:binding}),/COLD_OUTPUT_NOT_UNIQUELY_MATCHED/);
 }
});

test('cold observes both destinations through cancelled owned wizards without exporting or saving',async()=>{
 const {observeExportDestinations}=await import('../static-source-proof.mjs');
 const owner=id=>({document_id:'doc',workflow_id:'wf',node_id:id,verified:true,surface:'wizard'});
 const g=graph();g.workflow_ref={workflow_id:'wf'};g.nodes.push(node('old-export','exports.text',[]));
 for(const n of g.nodes)Object.assign(n.ref,{document_id:'doc',workflow_id:'wf'});
 for(const fault of [null,'foreign','missing','cleanup']){
  const actions=[],channels=new Map();
  const channelFor=ref=>{
   let stage=null;const c={ref,setStage:s=>{stage=s},revealGraphNode:async()=>actions.push(['reveal',ref.node_id]),
    observe:async o=>{const s={prepared_node_context:{...owner(ref.node_id),surface:stage?'wizard':'graph'},wizard:stage?{status:'observed',stage,root_tid:'wizard'}:{status:'absent'},
     active_identity:'Scenario',workflow_navigation:{status:'observed',path:[{label:'Scenario'}]},ui:{elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']}]}};
     assert.ok(o.ready(s),o.condition);return s;},
    perform:async o=>{const s={wizard:{stage,root_tid:'wizard'},ui:{elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']}]}};assert.ok(o.ready(s));
     const a=o.resolve(s);assert.equal(a.verb,'wizard_step');assert.equal(a.expected_stage,'text_export_params');actions.push(['next',ref.node_id]);stage='text_export_params';}};
   channels.set(ref.node_id,c);return c;
  };
  const helpers={openPreparedWizard:async c=>{actions.push(['open',c.ref.node_id]);c.setStage('input_mapping')},
   closePreparedWizard:async c=>{actions.push(['cancel',c.ref.node_id]);c.setStage(null);return {verified:fault!=='cleanup',settings_applied:false}},
   selectPreparedGraphNode:async c=>actions.push(['select',c.ref.node_id]),makeTextExportContextCode:b=>b};
  const load=async()=>helpers,execute=async b=>({verified:fault!=='missing',stage:'text_export_params',settings_applied:false,
   node_context:owner(fault==='foreign'?'other':b.node.node_id),values:{destination:{value:b.node.node_id==='export'?'/own/revenue-ru.csv':'/own/revenue.csv'}}});
  const result=observeExportDestinations({load,graph:g,channelFor,execute});
  if(fault)await assert.rejects(result,/COLD_SOURCE/);
  else assert.deepEqual(await result,[{node_id:'export',destination:'/own/revenue-ru.csv'},{node_id:'old-export',destination:'/own/revenue.csv'}]);
  assert.equal(actions.filter(a=>a[0]==='open').length,actions.filter(a=>a[0]==='cancel').length);
  assert.ok(actions.every(a=>['reveal','select','open','next','cancel'].includes(a[0])));
 }
});
