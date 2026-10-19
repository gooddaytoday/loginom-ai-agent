import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseExpectedOutputs,resolveExportInput,matchExpectedOutputs} from '../expected-outputs.mjs';

const output={output_node_type:'export_input',columns:[{name:'Code',type:'string'}],rows:[{Code:'A'}],ordered:true};
const node=(id,type,outputs=[0])=>({ref:{node_id:id},type,label:id,outputs});
const graph=()=>({complete:true,nodes:[node('filter','transform.filter_data'),node('rename','transform.reform_columns',[0,1]),node('export','exports.text',[])],
 links:[{source:'filter',output:0,target:'rename',input:0},{source:'rename',output:1,target:'export',input:0}]});
const actual=(id,port,name='Code')=>({node:{node_id:id},type:id==='filter'?'transform.filter_data':'transform.reform_columns',output_port:port,
 data:{schema:[{name,label:name,type:'string'}],row_count:1,sample_complete:true,precision:{numbers_verified:true},sample:[[{type:'string',is_null:false,value:'A'}]]}});

test('cold inspects saved export mapping after execution restores the complete dynamic schema',async()=>{
 const source=await readFile(new URL('../cold-check.mjs',import.meta.url),'utf8');
 // Run the actual orchestration with a REST-dependent source whose schema is
 // incomplete until cold execution. The mapping observer itself is tested below.
 const body=source.slice(source.indexOf('  const types=new Set'),source.indexOf('  const matched=correspondence.map'));
 const run=new (Object.getPrototypeOf(async function(){}).constructor)('f',
  `const {${['expectedOutputs','expected','graph','load','channelFor','execute','record','saved','prepared','origin','multiple',
   'createNodeProcedure','withBrowserReceipt','session','createNodeExecutionProcedure','performColdNodeAction',
   'runColdExecution','staticSources','openNewOutputTable','configureTablePrecision','prepareTableRead',
   'readTableOutputPages','decodeTableOutput','returnFromOutputTable','writeFile','join','args','config',
   'loginPassword','matchExpectedOutputs','resolveExportInput','observeExportDestinations','openColdOutputViews'].join(',')}}=f;\n${body}\nreturn correspondence;`);
 const fields=[{name:'Code',source_name:'Code',type:'string'},{name:'Status',source_name:'Status',type:'integer'}];
 const data=actual('rename',1).data;
 data.schema.push({name:'Status',label:'Status',type:'integer'});
 data.sample[0].push({type:'integer',is_null:false,value:'200'});
 const want={...output,column_order:'exact',columns:fields.map(({name,type})=>({name,type})),rows:[{Code:'A',Status:200}]};
 for(const completeAfterExecution of [true,false]){
  let restored=false;const calls=[];
  const result=run({expectedOutputs:[want],expected:{nodes:[]},graph:graph(),load:async()=>({}),
   channelFor:()=>({}),execute:async()=>({}),record:async()=>{},saved:{path:'/own/export.lgp'},
   prepared:{document_id:'doc',workflow_ref:{}},origin:'https://app.loginom.ai',multiple:false,createNodeProcedure:()=>({}),withBrowserReceipt:()=>'',session:'cold',
   createNodeExecutionProcedure:()=>({}),performColdNodeAction:async()=>{},staticSources:undefined,
   runColdExecution:async()=>{calls.push('execute');restored=completeAfterExecution;return {status:'completed',verified:true,owner_verified:true};},
   openNewOutputTable:async()=>({table:{}}),configureTablePrecision:async()=>({fields:data.schema.map(f=>({...f,key:f.name}))}),
   prepareTableRead:async()=>({}),readTableOutputPages:async()=>structuredClone(data),decodeTableOutput:raw=>raw,
   returnFromOutputTable:async()=>{},writeFile:async()=>{},join:()=>'',args:{output:''},config:{},loginPassword:'',
   matchExpectedOutputs,resolveExportInput,openColdOutputViews:async()=>{},
   observeExportDestinations:async()=>{calls.push('mapping');return [{node_id:'export',input_fields:restored?fields:fields.slice(1)}];}});
  if(completeAfterExecution)assert.equal((await result).length,1);
  else await assert.rejects(result,/COLD_OUTPUT_NOT_UNIQUELY_MATCHED/);
  assert.deepEqual(calls,['execute','mapping']);
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

test('export_input follows saved input mapping order, never expected order or transient source layout',()=>{
 const binding=resolveExportInput(graph());
 const fields=[{name:'Code',source_name:'Code',type:'string'},{name:'Status',source_name:'Status',type:'integer'}];
 const a=actual('rename',1);a.data.schema=[{name:'Status',label:'Status',type:'integer'},{name:'Code',label:'Code',type:'string'}];
 a.data.sample=[[{type:'integer',is_null:false,value:'200'},{type:'string',is_null:false,value:'A'}]];
 const want={...output,column_order:'exact',columns:[{name:'Code',type:'string'},{name:'Status',type:'integer'}],rows:[{Code:'A',Status:200}]};
 const original=structuredClone(a);
 assert.throws(()=>matchExpectedOutputs([a],[want],{exportInput:binding}));
 assert.equal(matchExpectedOutputs([a],[want],{exportInput:{...binding,input_fields:fields}}).length,1);
 assert.deepEqual(a,original);
 for(const input_fields of [fields.toReversed(),fields.slice(1),[fields[0],fields[0]],fields.map(f=>({...f,source_name:'Other'})),fields.map(f=>({...f,type:'real'}))])
  assert.throws(()=>matchExpectedOutputs([a],[want],{exportInput:{...binding,input_fields}}));
 const missing=structuredClone(a);missing.data.row_count=0;missing.data.sample=[];
 assert.throws(()=>matchExpectedOutputs([missing],[want],{exportInput:{...binding,input_fields:fields}}));
 const wrong=structuredClone(a);wrong.data.sample[0][0].value='503';
 assert.throws(()=>matchExpectedOutputs([wrong],[want],{exportInput:{...binding,input_fields:fields}}));
 assert.throws(()=>matchExpectedOutputs([a],[{...want,output_node_type:a.type}],{exportInput:{...binding,input_fields:fields}}));
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
 for(const startParameters of [false,true])for(const includeInputFields of [false,true])for(const fault of includeInputFields?[null,'cleanup','mapping-owner','mapping-source','mapping-incomplete']:[null,'foreign','missing','cleanup']){
  const actions=[],channels=new Map();
  const channelFor=ref=>{
   let stage=null;const c={ref,setStage:s=>{stage=s},revealGraphNode:async()=>actions.push(['reveal',ref.node_id]),
    openInputPort:async port=>{assert.equal(port,0);actions.push(['open-input',ref.node_id]);stage='input_mapping';},
    observe:async o=>{const s={prepared_node_context:{...owner(ref.node_id),surface:stage?'wizard':'graph'},wizard:stage?{status:'observed',stage,root_tid:'wizard'}:{status:'absent'},
     active_identity:'Scenario',workflow_navigation:{status:'observed',path:[{label:'Scenario'}]},ui:{elements:[{tid:'wizard;btnNext',ref:'Next',allowed_actions:['wizard_step']}]},
     node_mapping:{verified:true,inventory_complete:fault!=='mapping-incomplete',source_identity_verified:true,settings_applied:false,mapping_wizard:'TuneDataSourceMappingWizard',
      node_context:{...owner(fault==='mapping-owner'?'other':ref.node_id),input_port:{port:0}},
      source_fields:[{name:'Code',type:'string',record_id:'source',field_id:'0'}],
      target_fields:[{index:0,name:'Code',type:'string',source:{name:'Code',type:'string',record_id:fault==='mapping-source'?'foreign':'source',field_id:'0'}}]}};
     assert.ok(o.ready(s),o.condition);return s;},
    perform:async o=>{const s={wizard:{stage,root_tid:'wizard'},ui:{elements:['Next','Prev'].map(b=>({tid:'wizard;btn'+b,ref:b,allowed_actions:['wizard_step']}))}};assert.ok(o.ready(s));
     const a=o.resolve(s);assert.equal(a.verb,'wizard_step');assert.equal(a.expected_stage,stage==='input_mapping'?'text_export_params':'input_mapping');actions.push([a.ref==='Next'?'next':'prev',ref.node_id]);stage=a.expected_stage;}};
   channels.set(ref.node_id,c);return c;
  };
  const helpers={openPreparedWizard:async c=>{actions.push(['open',c.ref.node_id]);c.setStage(startParameters?'text_export_params':'input_mapping')},
   closePreparedWizard:async c=>{actions.push(['cancel',c.ref.node_id]);c.setStage(null);return {verified:fault!=='cleanup',settings_applied:false}},
   selectPreparedGraphNode:async c=>actions.push(['select',c.ref.node_id]),makeTextExportContextCode:b=>b};
  const load=async()=>helpers,execute=async b=>({verified:fault!=='missing',stage:'text_export_params',settings_applied:false,
   node_context:owner(fault==='foreign'?'other':b.node.node_id),values:{destination:{value:b.node.node_id==='export'?'/own/revenue-ru.csv':'/own/revenue.csv'}}});
  const result=observeExportDestinations({load,graph:g,channelFor,execute,includeInputFields});
  if(fault)await assert.rejects(result,/COLD_SOURCE/);
  else assert.deepEqual(await result,includeInputFields?['export','old-export'].map(node_id=>({node_id,input_fields:[{name:'Code',source_name:'Code',type:'string'}]}))
   :[{node_id:'export',destination:'/own/revenue-ru.csv'},{node_id:'old-export',destination:'/own/revenue.csv'}]);
  assert.equal(actions.filter(a=>['open','open-input'].includes(a[0])).length,actions.filter(a=>a[0]==='cancel').length);
  assert.ok(actions.every(a=>['reveal','select','open','open-input','next','cancel'].includes(a[0])));
  if(includeInputFields)assert.ok(actions.every(a=>!['open','next'].includes(a[0])));
 }
});
