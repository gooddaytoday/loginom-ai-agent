import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExpectedOutputs,resolveExportInput,matchExpectedOutputs,projectExportInput,matchesExpectedOutput} from '../expected-outputs.mjs';

const output={output_node_type:'export_input',columns:[{name:'Code',type:'string'}],rows:[{Code:'A'}],ordered:true};
const node=(id,type,outputs=[0])=>({ref:{node_id:id},type,label:id,outputs});
const graph=()=>({complete:true,nodes:[node('filter','transform.filter_data'),node('rename','transform.reform_columns',[0,1]),node('export','exports.text',[])],
 links:[{source:'filter',output:0,target:'rename',input:0},{source:'rename',output:1,target:'export',input:0}]});
const actual=(id,port,name='Code')=>({node:{node_id:id},type:id==='filter'?'transform.filter_data':'transform.reform_columns',output_port:port,
 data:{schema:[{name,label:name,type:'string'}],row_count:1,sample_complete:true,precision:{numbers_verified:true},sample:[[{type:'string',is_null:false,value:'A'}]]}});

function reorderedExport(){
 const data={schema:[{name:'Total',label:'Total',type:'real'},{name:'Region',label:'Region',type:'string'}],row_count:1,sample_complete:true,precision:{numbers_verified:true},sample:[[{type:'real',is_null:false,value:12.5},{type:'string',is_null:false,value:'North'}]]};
 const source_fields=data.schema.map((f,index)=>({...f,index,record_id:'source-'+index}));
 const mapping={verified:true,source_identity_verified:true,inventory_complete:true,settings_applied:false,source_fields,target_fields:[source_fields[1],source_fields[0]].map((s,index)=>({...s,index,record_id:'target-'+index,source:s}))};
 const expected={column_order:'exact',columns:[{name:'Region',type:'string'},{name:'Total',type:'real'}],rows:[{Region:'North',Total:12.5}],ordered:true};
 return {data,mapping,expected};
}
test('exact export order follows the observed input mapping without reordering the upstream evidence',()=>{
 const {data,mapping,expected}=reorderedExport(),before=structuredClone(data);
 assert.equal(matchesExpectedOutput(data,expected),false);
 assert.equal(matchesExpectedOutput(projectExportInput(data,mapping),expected),true);
 assert.deepEqual(data,before);
 mapping.target_fields.reverse();mapping.target_fields.forEach((f,i)=>f.index=i);
 assert.equal(matchesExpectedOutput(projectExportInput(data,mapping),expected),false);
});
test('export projection refuses incomplete, ambiguous, converted or unbound columns',()=>{
 for(const change of [m=>m.verified=false,m=>m.source_identity_verified=false,m=>m.inventory_complete=false,m=>m.settings_applied=true,
  m=>m.source_fields.pop(),m=>m.source_fields[1].record_id=m.source_fields[0].record_id,m=>delete m.source_fields[0].record_id,
  m=>m.target_fields[0].source={record_id:'foreign'},m=>m.target_fields[0].type='real',m=>m.target_fields[0].index=9,
  m=>m.target_fields[1].name=m.target_fields[0].name]){
  const {data,mapping}=reorderedExport();change(mapping);assert.throws(()=>projectExportInput(data,mapping),/COLD_EXPORT_INPUT_MAPPING_INVALID/);
 }
 const {data,mapping,expected}=reorderedExport();data.sample[0][0].value=13;
 assert.equal(matchesExpectedOutput(projectExportInput(data,mapping),expected),false);
});
test('saved export input is read and cancelled through its exact native input1 owner',async()=>{
 const {observeExportInputMapping}=await import('../static-source-proof.mjs');
 for(const fault of [null,'foreign','index','mutated','cleanup']){
  let open=false;const actions=[],ref={document_id:'doc',workflow_id:'flow',node_id:'export'};
  const m={verified:true,inventory_complete:true,source_identity_verified:true,settings_applied:fault==='mutated',node_context:{...ref,node_id:fault==='foreign'?'other':ref.node_id,verified:true,surface:'wizard',input_port:{direction:'input',port:0,native_index:fault==='index'?0:1}}};
  const channel={revealGraphNode:async()=>{},openInputPort:async port=>{assert.equal(port,0);open=true;actions.push('open');},observe:async o=>{const s={wizard:open?{status:'observed',stage:'input_mapping'}:{status:'absent'},node_mapping:m};assert.ok(o.ready(s));return s;}};
  const load=async()=>({closePreparedWizard:async c=>{assert.equal(c,channel);open=false;actions.push('cancel');return {verified:fault!=='cleanup',settings_applied:false};}});
  const promise=observeExportInputMapping({load,channelFor:()=>channel,target:{ref}});
  if(fault)await assert.rejects(promise,/COLD_SOURCE/);else assert.equal(await promise,m);
  assert.deepEqual(actions,['open','cancel']);
 }
});

test('export_input parses in both forms and forbids explicit output ports or labels',()=>{
 const base={package_path:'/own/export.lgp',nodes:[]};
 for(const multiple of [false,true]){
  const wrap=o=>({...base,...(multiple?{outputs:[o]}:o)});
  assert.equal(parseExpectedOutputs(wrap(output)).outputs[0].output_node_type,'export_input');
  for(const options of [{output_port:0},{output_port:1},{output_node_label:'rename'},{output_port:undefined},{output_node_label:undefined}])
   assert.throws(()=>parseExpectedOutputs(wrap({...output,...options})));
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
