import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {decodePortCell,makeNodePortOutputCode,readNodePortOutput} from '../lib/node-port-output.mjs';

const portGuid='11111111-1111-1111-1111-111111111111';
const execution={verified:true,cleanup_complete:true,status:'completed',owner_verified:true,execution_id:'doc:root:1',group_id:'1',process_id:'1.1',process_record_id:'child'};
function fixture({rows=[[{constructor:{name:'Int64'},toString:()=> '9007199254740993'},1.2345678901234567,'']],types=[4,3,5]}={}) {
 const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]},node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
 const rpcCalls=[],uiCalls=[],disposed=[],elements=new Map();
 const el=tid=>{const e={id:tid,getAttribute:k=>k==='data-tid'?tid:null,classList:{contains:k=>k==='x-tab-active'},getBoundingClientRect:()=>({width:100,height:100}),contains:x=>e===x||e.children?.includes(x)};elements.set(tid,e);return e;};
 const crumb=el('MF;TF-1;cnrNaviMode;b.s_Scenario');crumb.textContent='Scenario';
 const tab=el(binding.workflow_ref.tab_tid),graph=el('MF;TF-1;ModelForm;cmpDiagram'),body=el('MF;TF-1;Graph;Import'),portDom=el(body.id+';Output_Data-0');
 portDom.querySelectorAll=()=>[{getAttribute:k=>k==='href'?'/output_table_active.svg':null}];graph.children=[body,portDom];
 class PackageTreeNode{};class WorkFlowTreeNode{};class ModelForm{};
 const packageNode=new PackageTreeNode(),workflow=Object.assign(new WorkFlowTreeNode(),{ParentNode:packageNode}),session={};
 const proxy=(name,values)=>({...values,dispose:async()=>{disposed.push(name);}});
 const helper={FBaseProxy:null,$FData:null,$FCacheInitialized:false};
 const columnItems=types.map((type,i)=>proxy(['integerColumn','realColumn','stringColumn'][i]??'column'+i,{get_Name:async()=> ['I','R','S'][i]??'C'+i,get_DisplayName:async()=> ['I','R','S'][i]??'C'+i,get_DataType:async()=>type}));
 const integerColumn=columnItems[0],columns=proxy('columns',{get_Count:async()=>types.length,getItem:async i=>columnItems[i]});
 const dataSource=proxy('dataSource',{$S:session,$:{$OW:0,$O:10,$I:116},$FHelper:helper,get_RowCount:async()=>rows.length,get_Columns:async()=>columns,
  AsVariant:async(row,col)=>{rpcCalls.push([row,col]);helper.$FCacheInitialized=true;helper.$FData??={};return rows[row][col];}});helper.FBaseProxy=dataSource;
 const output=proxy('output',{$S:session,$:{$OW:0,$O:9},QueryInterface:async()=>dataSource});
 const node={FGuid:'node',FCell:{},FStatus:1,FRunning:false,FLocked:false,data:{$S:session}};
 const port={FGuid:portGuid,FCell:{},FStatus:1,FType:1,FSubType:1,FParam:0,FPortIndex:0,parent:node,data:{$S:session,get_Output:async()=>output}};node.FPorts=[{FCollection:[port]}];
 const d={FNodes:{FCollection:[node]},FmxGraph:{container:graph,view:{getState:cell=>({shape:{node:cell===node.FCell?body:portDom}})},getSelectionCells:()=>[node.FCell]}};
 const model=Object.assign(new ModelForm(),{FDiagram:d});
 const child={internalId:'child',data:{id:'1.1',Status:3,ErrorDetails:'',ModelNode:node.data},childNodes:[]};
 const group={internalId:'group',data:{id:'1',Status:3,ErrorDetails:'',loaded:true},childNodes:[child]};
 const root={internalId:'root',data:{loaded:true},childNodes:[group]},store={getRoot:()=>root,isLoading:()=>false};
 const tree=el('ConsoleForm;ProgressForm;trpProgress;treepanel;tree');
 const prep={document:null,id:'doc',receipts:new Map([['prepared',{phase:'verified',workflowId:'flow',tab,packageNode,nodeTargetWorkflowNode:workflow}]])};
 const document={querySelectorAll:q=>{if(q.startsWith('[data-tid^='))return [crumb];const tid=JSON.parse(q.slice(10,-1));return elements.has(tid)?[elements.get(tid)]:[];}};prep.document=document;
 const app={Version:'7.4.2',PackageTreeNode,WorkFlowTreeNode,ModelForm,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:model,Node:{data:{node:workflow}}}})}}}}}};
 const context=vm.createContext({document,bg:{app,IBGDataSource:{}},location:{origin:'http://example.test'},__loginomDockPreparationV1:prep,Ext:{getCmp:id=>id===tree.id?{getStore:()=>store}:null},TextEncoder,getComputedStyle:()=>({visibility:'visible'}),Date});
 const page={evaluate:async(fn,arg)=>structuredClone(await vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context))};
 return {page,binding,columnItems,columns,node,port,portDom,integerColumn,dataSource,helper,child,group,root,store,output,disposed,rpcCalls,uiCalls,run:request=>vm.runInNewContext('('+makeNodePortOutputCode(binding,request,{origin:'http://example.test',build:'7.4.2',deadline:Date.now()+10000})+')')(page)};
}

test('reads_bound_port_without_table',async()=>{
 const f=fixture(),result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,true);
 assert.equal(result.output.freshness_basis,'completed_execution_port_source');
 assert.deepEqual(result.output.sample[0].map(c=>c.value),['9007199254740993',1.2345678901234567,'']);
 assert.deepEqual(f.uiCalls,[]);
 assert.equal(result.cleanup_complete,true);
 assert.deepEqual(f.disposed.sort(),['columns','dataSource','integerColumn','output','realColumn','stringColumn']);
});

test('reads native tabular output with FParam 2',async()=>{
 const f=fixture();f.port.FParam=2;
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,true);assert.equal(result.cleanup_complete,true);
 assert.deepEqual(result.output.sample[0].map(c=>c.value),['9007199254740993',1.2345678901234567,'']);
 assert.equal(result.output.port_guid,portGuid);assert.equal(f.rpcCalls.length,3);
});

for(const [property,wrong] of [['FType',0],['FSubType',0],['FPortIndex',1]])test('FParam 2 preserves '+property+' guard',async()=>{
 const f=fixture();f.port.FParam=2;f.port[property]=wrong;
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,false);assert.equal(result.output,undefined);assert.deepEqual(f.rpcCalls,[]);
});

test('refuses foreign port ownership without publishing values',async()=>{
 const f=fixture();f.port.parent={...f.node};
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,false);assert.equal(result.output,undefined);assert.deepEqual(f.rpcCalls,[]);
});

test('refuses inactive output before data RPC',async()=>{
 const f=fixture();f.portDom.querySelectorAll=()=>[{getAttribute:()=>'/output_table_inactive.svg'}];
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,false);assert.equal(result.output,undefined);assert.deepEqual(f.rpcCalls,[]);assert.equal(result.cleanup_complete,true);
});

test('refuses an older execution when the node has a newer process group',async()=>{
 const f=fixture();f.root.childNodes.push({internalId:'next',data:{id:'2',Status:3,ErrorDetails:'',loaded:true},childNodes:[{internalId:'next-child',data:{id:'2.1',ModelNode:f.node.data,Status:3,ErrorDetails:''},childNodes:[]}]});
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,false);assert.equal(result.output,undefined);assert.deepEqual(f.rpcCalls,[]);
});

test('cache replacement during reading refuses values and disposes all proxies',async()=>{
 const f=fixture(),read=f.dataSource.AsVariant;
 f.dataSource.AsVariant=async(row,column)=>{const raw=await read(row,column);if(column===1)f.helper.$FData={};return raw;};
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,false);assert.equal(result.reason,'cache_changed');assert.equal(result.output,undefined);
 assert.equal(result.cleanup_complete,true);assert.equal(f.disposed.length,6);
});

test('cache reset during reading refuses values without exposing proxy state',async()=>{
 const f=fixture(),read=f.dataSource.AsVariant;
 f.dataSource.AsVariant=async(row,column)=>{const raw=await read(row,column);if(column===1)f.helper.$FCacheInitialized=false;return raw;};
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,false);assert.equal(result.reason,'cache_changed');assert.equal(result.output,undefined);
 assert.doesNotMatch(JSON.stringify(result),/\$FData|\$S|\$OW|\$O|cookie|session|9007199254740993/);
});


test('ordinary source column names do not introduce a new sensitive-name refusal',async()=>{
 const f=fixture();f.integerColumn.get_Name=async()=> 'TokenCount';
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,true);assert.equal(result.output.schema[0].name,'TokenCount');
});

test('shared channel reads the actual serialized native callback and keeps private handles out of its journal',async()=>{
 const {createNodeProcedure}=await import('../lib/node-procedure.mjs'),f=fixture(),records=[],calls=[];
 const operation={id:'shared',deadline:Date.now()+10000,cleanupConfirmed:true,action:{action_key:'node.apply',revision:'1'}};
 const channel=createNodeProcedure({operation,preparedNodeContext:f.binding,targetOrigin:'http://example.test',targetBuild:'7.4.2',
  record:async r=>{records.push(r);return structuredClone(r)},execute:async code=>{calls.push(code);return vm.runInNewContext('('+code+')')(f.page);}});
 const result=await channel.readOutputPort({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,true);assert.equal(calls.length,1);assert.equal(operation.cleanupConfirmed,true);
 assert.deepEqual(result.output.sample[0].map(c=>c.value),['9007199254740993',1.2345678901234567,'']);
 assert.doesNotMatch(JSON.stringify(records),/\$FData|\$S|\$OW|\$O|cookie|session|dispose|QueryInterface/);
});

test('an already initialized cache cannot be replaced while metadata is read',async()=>{
 const f=fixture(),read=f.dataSource.get_Columns;f.helper.$FCacheInitialized=true;f.helper.$FData={};
 f.dataSource.get_Columns=async()=>{f.helper.$FData={};return read();};
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,false);assert.equal(result.output,undefined);assert.equal(result.reason,'cache_changed');
 assert.equal(result.cleanup_complete,true);
});


test('preserves_native_scalar_values',()=>{
 for(const type of ['integer','real','string','boolean','datetime','variant'])for(const raw of [null,undefined]){
  assert.deepEqual(decodePortCell(raw,type),{cell:{type,is_null:true,value:null,precision:'exact_null'},limitations:[]});
 }
 for(const text of ['-9223372036854775808','9223372036854775807','9007199254740993']){
  const integer=decodePortCell({constructor:{name:'Int64'},toString:()=>text},'integer');
  assert.deepEqual(integer,{cell:{type:'integer',is_null:false,value:text,representation:'decimal_integer',precision:'exact_integer'},limitations:[]});
 }
 for(const raw of [1.2345678901234567,5e-324,Number.MAX_VALUE,-0]){
  const real=decodePortCell(raw,'real');
  assert.ok(Object.is(real.cell.value,raw));
  assert.ok(Object.is(Number(JSON.parse(JSON.stringify(real.cell)).decimal),raw));
  assert.equal(real.cell.representation,'binary64');assert.equal(real.cell.precision,'17_significant_digits');
  assert.deepEqual(real.limitations,[]);
 }
 for(const raw of ['', ' ', '\u00a0', '\r\n']){
  const string=decodePortCell(raw,'string');
  assert.equal(string.cell.value,raw);assert.equal(string.cell.representation,'data_source_string');
  assert.equal(string.cell.precision,'source_text');assert.equal(Object.hasOwn(string.cell,'display_text'),false);
 }
 for(const raw of [true,false]){
  const boolean=decodePortCell(raw,'boolean');
  assert.equal(boolean.cell.value,raw);assert.equal(boolean.cell.representation,'data_source_boolean');
  assert.equal(boolean.cell.precision,'exact_boolean');assert.equal(Object.hasOwn(boolean.cell,'display_text'),false);
 }
});


test('marks_variant_and_nonfinite_unverified',async()=>{
 for(const raw of [NaN,Infinity,-Infinity]){
  const decoded=decodePortCell(raw,'real');
  assert.deepEqual(decoded,{cell:{type:'real',is_null:false,display_text:String(raw),representation:'formatted_display',precision:'unverified'},limitations:['numeric_display_precision']});
 }
 for(const [raw,text] of [[1,'1'],[-0,'-0'],['',''],[' \u00a0\r\n',' \u00a0\r\n'],[true,'true'],[false,'false'],[{constructor:{name:'UInt64'},toString:()=> '18446744073709551615'},'18446744073709551615']]){
  assert.deepEqual(decodePortCell(raw,'variant'),{cell:{type:'variant',is_null:false,display_text:text,representation:'formatted_display',precision:'unverified'},limitations:['variant_display_precision']});
 }
 const unknown={secret:'must not leak',toString:()=>{throw Error('VT_UNKNOWN is not text')}};
 assert.deepEqual(decodePortCell(unknown,'variant'),{cell:{type:'variant',is_null:false,representation:'formatted_display',precision:'unverified'},limitations:['variant_display_precision']});
 const rows=[[NaN,Infinity,-Infinity,1,unknown,null]],types=[3,3,3,6,6,6];
 const f=fixture({rows,types}),result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:false});
 assert.equal(result.verified,true);assert.equal(result.output.precision.numbers_verified,false);
 assert.deepEqual(result.output.precision.limitations,['numeric_display_precision','variant_display_precision']);
 assert.equal(result.output.precision.strings,'data source text; existing secret redaction applies; original byte encoding is not attested');
 assert.doesNotMatch(JSON.stringify(result),/must not leak/);
 for(const [raw,type] of [[NaN,3],[Infinity,3],[-Infinity,3],[1,6],[unknown,6]]){
  const strict=await fixture({rows:[[raw]],types:[type]}).run({port:0,execution,sampleRows:1,requireExactNumbers:true});
  assert.equal(strict.verified,false);assert.equal(strict.output,undefined);assert.equal(strict.cleanup_complete,true);
 }
 const nulls=await fixture({rows:[[null]],types:[6]}).run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(nulls.verified,true);assert.equal(nulls.output.precision.numbers_verified,true);
});

test('rereads_strings_one_row_at_a_time',async()=>{
 const full='x'.repeat(20000),cached='x'.repeat(4999)+'…',f=fixture({rows:[[cached,cached],[cached,cached]],types:[5,6]});
 const started=[],pending=[],rowStarted=Promise.withResolvers();
 f.columnItems.forEach((column,i)=>{column.AsString=row=>{
  const deferred=Promise.withResolvers();started.push([row,i]);pending.push(deferred);
  if(started.length===2)rowStarted.resolve();
  return deferred.promise;
 };});
 const reading=f.run({port:0,execution,sampleRows:2,requireExactNumbers:false});
 await Promise.race([rowStarted.promise,reading]);
 assert.deepEqual(started,[[0,0],[0,1]]);assert.deepEqual(f.rpcCalls,[[0,0],[0,1]]);assert.deepEqual(f.disposed,[]);
 pending[0].resolve(full);pending[1].resolve(full);
 // A second row starts only after every full string in the first row settles.
 const secondRow=Promise.withResolvers();
 f.columnItems.forEach((column,i)=>{column.AsString=async row=>{started.push([row,i]);if(i===1)secondRow.resolve();return full;};});
 await secondRow.promise;
 const result=await reading;
 assert.equal(result.verified,true);assert.equal(result.output.sample[0][0].value,full);
 assert.equal(result.output.sample[0][1].display_text,full);assert.equal(result.output.sample_rows,2);
 assert.deepEqual(started,[[0,0],[0,1],[1,0],[1,1]]);assert.equal(f.disposed.length,5);
});

test('full_text_threshold_preserves_string_and_variant_values',async()=>{
 const texts=['a'.repeat(4999),'b'.repeat(5000),'c'.repeat(5001),'d'.repeat(20000),'real suffix…','🙂'.repeat(5001)];
 for(const type of [5,6]){
  const rows=texts.map(text=>[text]),f=fixture({rows,types:[type]}),calls=[];
  f.columnItems[0].AsString=async row=>{calls.push(row);return texts[row];};
  const result=await f.run({port:0,execution,sampleRows:rows.length,requireExactNumbers:type===5});
  assert.equal(result.verified,true);assert.deepEqual(result.output.sample.map(row=>row[0].value??row[0].display_text),texts);
  assert.deepEqual(calls,[1,2,3,4,5]);
 }
});

test('failed_full_text_waits_for_all_started_rpcs_and_publishes_no_prefix',async()=>{
 const f=fixture({rows:[['prefix…','prefix…'],['next…','next…']],types:[5,5]}),pending=[],started=Promise.withResolvers();
 let unsettled=0,disposedBeforeSettlement=false;
 f.columnItems.forEach(column=>{
  const dispose=column.dispose;column.dispose=async()=>{disposedBeforeSettlement||=unsettled>0;await dispose();};
  column.AsString=()=>{
   unsettled++;const deferred=Promise.withResolvers();pending.push(deferred);if(pending.length===2)started.resolve();
   return deferred.promise.finally(()=>unsettled--);
  };
 });
 const reading=f.run({port:0,execution,sampleRows:2,requireExactNumbers:true});
 await Promise.race([started.promise,reading]);assert.equal(pending.length,2);
 pending[0].reject(Error('AsString failed'));
 // Let the rejection propagate without settling the other controlled RPC.
 await new Promise(setImmediate);assert.deepEqual(f.disposed,[]);
 pending[1].resolve('complete text');
 const result=await reading;
 assert.equal(result.verified,false);assert.equal(result.output,undefined);assert.equal(result.cleanup_complete,true);
 assert.equal(disposedBeforeSettlement,false);assert.deepEqual(f.rpcCalls,[[0,0],[0,1]]);assert.equal(f.disposed.length,5);
});

test('empty_sources_and_zero_requested_rows_make_no_cell_rpc',async()=>{
 for(const rows of [[],[['unused…']]]){
  const f=fixture({rows,types:[5]});f.columnItems[0].AsString=()=>{throw Error('No cell read expected')};
  const result=await f.run({port:0,execution,sampleRows:0,requireExactNumbers:true});
  assert.equal(result.verified,true);assert.deepEqual(result.output.sample,[]);assert.deepEqual(f.rpcCalls,[]);
  assert.equal(result.output.sample_complete,rows.length===0);assert.equal(result.output.schema.length,1);
 }
 const f=fixture({rows:[],types:[5]}),result=await f.run({port:0,execution,sampleRows:100,requireExactNumbers:true});
 assert.equal(result.output.sample_complete,true);assert.deepEqual(f.rpcCalls,[]);
});

test('byte_budget_counts_full_utf8_values_and_stops_at_the_first_whole_row',async()=>{
 const exact='Ж'.repeat(262141);
 assert.equal(new TextEncoder().encode(JSON.stringify([[exact]])).length,524288);
 for(const first of [exact,exact+'x']){
  const f=fixture({rows:[['cached…'],['second…'],['third…']],types:[5]}),started=[];
  f.columnItems[0].AsString=async row=>{started.push(row);return row===0?first:'x'.repeat(20000);};
  const result=await f.run({port:0,execution,sampleRows:3,requireExactNumbers:true});
  assert.equal(result.verified,true);assert.equal(result.output.sample_complete,false);
  assert.equal(result.output.read_limit,'preview_cell_or_byte_budget');
  assert.equal(result.output.sample_rows,first===exact?1:0);assert.deepEqual(started,first===exact?[0,1]:[0]);
  if(first===exact)assert.equal(result.output.sample[0][0].value,exact);
 }
});

test('row_and_cell_limits_count_values_without_typed_metadata',async()=>{
 const unknown={secret:'not serialized'};
 for(const total of [100,101]){
  const f=fixture({rows:Array.from({length:100},()=>Array(total).fill(unknown)),types:Array(total).fill(6)});
  const result=await f.run({port:0,execution,sampleRows:100,requireExactNumbers:false});
  assert.equal(result.verified,true);assert.equal(result.output.sample_rows,total===100?100:99);
  assert.equal(result.output.sample_complete,total===100);assert.equal(f.rpcCalls.length,total===100?10000:9999);
  assert.equal(result.output.read_limit,total===100?undefined:'preview_cell_or_byte_budget');
  assert.equal(result.output.sample[0][0].is_null,false);assert.equal(Object.hasOwn(result.output.sample[0][0],'display_text'),false);
  assert.doesNotMatch(JSON.stringify(result),/not serialized/);
 }
 const f=fixture({rows:Array.from({length:101},()=>[null]),types:[5]});
 const result=await f.run({port:0,execution,sampleRows:100,requireExactNumbers:true});
 assert.equal(result.output.sample_rows,100);assert.equal(result.output.sample_complete,false);assert.equal(f.rpcCalls.length,100);
});

test('a_nonfitting_row_does_not_change_admitted_precision',async()=>{
 const first='x'.repeat(524272);
 assert.equal(new TextEncoder().encode(JSON.stringify([[first,null,null]])).length,524288);
 const f=fixture({rows:[['first…',null,null],['second…',1,Infinity]],types:[5,6,3]}),strings=[];
 f.columnItems[0].AsString=async row=>{strings.push(row);return row===0?first:'x'.repeat(20000);};
 const result=await f.run({port:0,execution,sampleRows:2,requireExactNumbers:true});
 assert.equal(result.verified,true);assert.equal(result.output.sample_rows,1);assert.equal(result.output.sample_complete,false);
 assert.equal(result.output.read_limit,'preview_cell_or_byte_budget');assert.equal(result.output.precision.numbers_verified,true);
 assert.deepEqual(result.output.precision.limitations,[]);assert.deepEqual(strings,[0,1]);
});

test('a_single_full_string_over_two_mebibytes_returns_the_row_budget',async()=>{
 const f=fixture({rows:[['prefix…']],types:[5]});f.columnItems[0].AsString=async()=> 'x'.repeat(2*1024*1024+1);
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,true);assert.equal(result.cleanup_complete,true);assert.deepEqual(result.output.sample,[]);
 assert.equal(result.output.sample_complete,false);assert.equal(result.output.read_limit,'preview_cell_or_byte_budget');
});


test('reader_applies_datetime_limitations_without_downgrading_numeric_precision',async()=>{
 // Browser date integration verifies this decoder result; here verify its reader contract.
 const ambiguousDate=()=>({cell:{type:'datetime',is_null:false,display_text:'2010-03-28T03:30:00.000',representation:'formatted_display',precision:'unverified'},limitations:['datetime_display_precision']});
 for(const requireExactNumbers of [false,true]){
  const f=fixture({rows:[[new Date('2010-03-28T00:30:00.000Z')]],types:[2]});
  const result=await readNodePortOutput(f.page,f.binding,{port:0,execution,sampleRows:1,requireExactNumbers},{origin:'http://example.test',build:'7.4.2',deadline:Date.now()+10000},undefined,undefined,ambiguousDate);
  assert.equal(result.verified,!requireExactNumbers);assert.equal(result.cleanup_complete,true);
  if(requireExactNumbers){assert.equal(result.output,undefined);assert.equal(result.reason,'unverified_precision');continue;}
  assert.equal(result.output.precision.numbers_verified,true);
  assert.deepEqual(result.output.precision.limitations,['datetime_display_precision']);
 }
});
