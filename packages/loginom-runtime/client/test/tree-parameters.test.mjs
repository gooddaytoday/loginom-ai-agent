import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateTreeJsonScope,validateTreeParameters,validateSelectedTreePaths} from '../lib/tree-parameters.mjs';
import {createTreeNodeSupport,treeConfigurationReadback} from '../lib/tree-node.mjs';
import {NODE_TYPES,validateNodeTargetRequest} from '../lib/node-contracts.mjs';
test('tree stage 1 admits the independent acceptance JSON with exact original integer lexemes',async()=>{
 const text=await readFile(new URL('../../../../docs/node-development/nodes/trees-jsontotree/fixtures/response.json',import.meta.url),'utf8');
 assert.equal(validateTreeJsonScope(text).verified,true);
});
for(const value of ['[]','null','1','{"items":[]}','{"a":[{}],"b":[{}]}','{"items":[1,2]}','{"items":[{"v":1},{"v":"1"}]}',
 '{"items":[{"v":"2024-01-01"}]}','{"items":[{"v":1,"v":2}]}','{"id":1,"items":[{"id":2}]}','{"items":[{"v":9223372036854775808}]}'])test('tree scope refuses '+value,()=>{
 assert.throws(()=>validateTreeJsonScope(value));
});
test('tree schema paths bind exact leaves in native order and reject indexes and containers',()=>{
 const schema=[{path:'',name:'Root',is_container:true,is_array:false},{path:'/id',name:'id',type:'integer',is_container:false},
  {path:'/items',name:'items',is_container:true,is_array:true},{path:'/items/sku',name:'sku',type:'string',is_container:false}];
 assert.equal(validateSelectedTreePaths(schema,['/id','/items/sku']),true);
 for(const paths of [['/items'],['/items/0/sku'],['/items/sku','/id'],['/missing']])assert.throws(()=>validateSelectedTreePaths(schema,paths));
});
test('tree new/existing parameters are distinct and unsupported options refuse before UI',()=>{
 const request={target:{kind:'new',type:'trees.from_json'},inputs:[{input:0}],mappings:[]};
 assert.throws(()=>validateTreeParameters({},'auto_structure',request));
 validateTreeParameters({json_field:'Document',root_mode:'auto'},'auto_structure',request);
 validateTreeParameters({},'auto_structure',{...request,target:{...request.target,kind:'existing'},inputs:[]});
 assert.throws(()=>validateTreeParameters({json_field:'Document',root_mode:'array'},'auto_structure',request));
});
test('tree registrations distinguish tree ports from table counts and install the owned handlers',()=>{
 assert.equal(NODE_TYPES['trees.from_json'].tabular_outputs,0);assert.equal(NODE_TYPES['trees.from_json'].tree_outputs,1);
 assert.deepEqual(NODE_TYPES['trees.to_table'].input_kinds,['tree']);assert.equal(NODE_TYPES['trees.to_table'].tabular_inputs,0);
 for(const json of [true,false]){
  const type=json?'trees.from_json':'trees.to_table',support=createTreeNodeSupport({targetOrigin:'http://example.test',targetBuild:'7.4.2'},{json});
  assert.ok(support.nodeApplyHandlers.has(type));
  validateNodeTargetRequest({document_id:'d',workflow_ref:{workflow_id:'w',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]},
   target:{kind:'new',type},inputs:[{source:{document_id:'d',workflow_id:'w',node_id:'source'},input:0,output:0}]});
 }
});
test('tree readback projects verified observed settings and refuses a missing commit',()=>{
 const node={document_id:'d',workflow_id:'w',node_id:'n'},configuration={verified:true,inventory_complete:true,node_context:{verified:true,...node},
  kind:'json_to_tree',json_field:'Document',root_mode:'auto',auto_structure:true,strict:true,exclude_root:false};
 const phases=['input_mapping','configure','node_finish','output_mapping','finish'].map(phase=>({phase,status:'verified',receipt_id:'op:'+phase,
  value:{verified:true,cleanup_complete:true,settings_applied:true,configuration,validation:{status:'accepted_by_loginom_next'}}}));
 const result=treeConfigurationReadback({node,phases,operation_id:'op'});assert.equal(result.json_field,'Document');assert.equal(result.package_persistence_verified,false);
 assert.throws(()=>treeConfigurationReadback({node,phases:phases.slice(0,-1),operation_id:'op'}));
});
test('tree source preflight binds semantic node identity, port GUID and the same completed execution',async()=>{
 const node={document_id:'doc',workflow_id:'wf',node_id:'source'},request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',
  tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]},target:{kind:'new',type:'trees.from_json'},
  parameters:{json_field:'Document',root_mode:'auto'},inputs:[{input:0,output:0,source:{node_id:'source',workflow_id:'wf',document_id:'doc'}}]};
 const port={port:0,port_guid:'port',fresh:true,sample_complete:true,execution_id:'exec',row_count:1,schema:[{name:'Document',type:'string'}],
  sample:[[{is_null:false,value:'{"items":[{"sku":"A"}]}'}]]};
 const history=[{cleanup_confirmed:true,outcome:{status:'SUCCEEDED',cleanup_complete:true,output:{node,cleanup_complete:true,
  execution:{status:'completed',execution_id:'exec'},output:{ports:[port]}}}}];
 const events=[],options={operation:{id:'op',parameters:request,nodeTargetAdapter:{observe:async()=>({nodes:[],links:[]})}},
  execute:async()=>({verified:true,ports:[{index:0,active:true,port_guid:'port'}]}),nodeHistory:()=>history,now:Date.now,
  onRecord:async event=>{events.push(event);return {...event,recorded_at:'private metadata'};}};
 const support=createTreeNodeSupport({targetOrigin:'http://example.test',targetBuild:'7.4.2'},{json:true});
 const driver=support.nodeApplyDriverFactory(options),ctx={deadline:Date.now()+10000};
 assert.equal((await driver.beforeTarget(ctx)).verified,true);assert.equal(events.length,1);
 port.execution_id='stale';await assert.rejects(driver.beforeTarget(ctx),/same execution/);
 port.execution_id='exec';options.execute=async()=>({verified:true,ports:[{index:0,active:true,port_guid:'foreign'}]});
 await assert.rejects(driver.beforeTarget(ctx),/inactive or changed/);
});

for(const saved of [false,true])test('JSON tree configure confirms '+(saved?'saved direct completion':'new output mapping and completion')+' without repeating Next',async()=>{
 const need=(v,m)=>{if(!v)throw Error(m);},owned=s=>s.prepared_node_context?.verified&&s.prepared_node_context.surface==='wizard';
 const factory=vm.runInNewContext('('+createTreeNodeSupport.toString()+')',{
  createTabularTransformNodeSupport:(_config,implementation)=>implementation,
  jsonToTreeParametersSchema:{},treeToTableParametersSchema:{},validateTreeParameters,treeConfigurationReadback,
  need,owned,ready:s=>owned(s)&&s.node_tree?.verified,
  one:(s,p,m)=>{const found=s.ui.elements.filter(p);need(found.length===1,m);return found[0];},structuredClone,
 });
 const implementation=factory({}, {json:true}),steps=[];
 const state={prepared_node_context:{verified:true,surface:'wizard'},wizard:{stage:'json_tree',root_tid:'W'},
  node_tree:{verified:true,inventory_complete:true,json_field:'Document',auto_structure:true,strict:true,exclude_root:false,root_mode:'auto'},
  ui:{elements:[{tid:'W;btnNext',ref:'next',allowed_actions:['wizard_step']}]}};
 const channel={observe:async options=>{assert.ok(options.ready(state));return structuredClone(state);},perform:async options=>{
  const action=options.resolve(state),next=steps.length===0&&!saved?'tree_output_mapping':'done';
  assert.equal(action.verb,'wizard_step');assert.ok(Array.isArray(action.expected_stage)?action.expected_stage.includes(next):action.expected_stage===next);
  steps.push(next);state.wizard.stage=next;
 }};
 const result=await implementation.configure(channel,{json_field:'Document'},{request:{finish:'execute'}});
 assert.equal(result.verified,true);assert.equal(result.validation.status,'accepted_by_loginom_next');
 assert.deepEqual(steps,saved?['done']:['tree_output_mapping','done']);
});

test('tree-to-table global index is optional on new nodes, bounded and bound to the repeated array',()=>{
 const request={target:{kind:'new',type:'trees.to_table'},inputs:[{input:0}],mappings:[]};
 const base={selected_paths:['/items/sku'],repeat_parents:true,composite_names:false,composite_labels:false,label_separator:'.'};
 validateTreeParameters(base,'selected_nodes',request);
 validateTreeParameters({...base,global_index_paths:['/items']},'selected_nodes',request);
 validateTreeParameters({...base,global_index_paths:[]},'selected_nodes',request);
 for(const global_index_paths of [['/items','/other'],['items'],'/items',[1]])
  assert.throws(()=>validateTreeParameters({...base,global_index_paths},'selected_nodes',request),/global_index_paths/);
 const schema=[{path:'',name:'Root',is_container:true,is_array:false},{path:'/id',name:'id',type:'integer',is_container:false},
  {path:'/items',name:'items',is_container:true,is_array:true},{path:'/items/sku',name:'sku',type:'string',is_container:false}];
 assert.equal(validateSelectedTreePaths(schema,['/items/sku'],['/items']),true);
 for(const paths of [['/id'],['/items/sku'],['']])assert.throws(()=>validateSelectedTreePaths(schema,['/items/sku'],paths),/global_index_paths/);
});

function jsonPreflight(sample,row_count=sample.length){
 const node={document_id:'doc',workflow_id:'wf',node_id:'source'},request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',
  tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]},target:{kind:'new',type:'trees.from_json'},
  parameters:{json_field:'Document',root_mode:'auto'},inputs:[{input:0,output:0,source:{node_id:'source',workflow_id:'wf',document_id:'doc'}}]};
 const port={port:0,port_guid:'port',fresh:true,sample_complete:true,execution_id:'exec',row_count,schema:[{name:'Document',type:'string'}],
  sample:sample.map(value=>[{is_null:value===null,value}])};
 const history=[{cleanup_confirmed:true,outcome:{status:'SUCCEEDED',cleanup_complete:true,output:{node,cleanup_complete:true,
  execution:{status:'completed',execution_id:'exec'},output:{ports:[port]}}}}];
 const options={operation:{id:'op',parameters:request,nodeTargetAdapter:{observe:async()=>({nodes:[],links:[]})}},
  execute:async()=>({verified:true,ports:[{index:0,active:true,port_guid:'port'}]}),nodeHistory:()=>history,now:Date.now,onRecord:async event=>event};
 const driver=createTreeNodeSupport({targetOrigin:'http://example.test',targetBuild:'7.4.2'},{json:true}).nodeApplyDriverFactory(options);
 return driver.beforeTarget({deadline:Date.now()+10000});
}
test('JSON tree preflight admits several JSON rows as root rows and keeps empty, NULL and oversize refusals',async()=>{
 assert.equal((await jsonPreflight(['{"group":"A","items":[{"code":"x"},{"code":"z"}]}','{"group":"B","items":[{"code":"y"}]}'])).verified,true);
 assert.equal((await jsonPreflight(['{"items":[{"sku":"A"}]}'])).verified,true);
 await assert.rejects(jsonPreflight([]),/non-NULL JSON string rows/);
 await assert.rejects(jsonPreflight(['{"items":[{"sku":"A"}]}',null]),/non-NULL JSON string rows/);
 await assert.rejects(jsonPreflight(['{"items":[{"sku":"A"}]}'],2),/non-NULL JSON string rows/);
 await assert.rejects(jsonPreflight(['{"items":[{"sku":"A"}]}','{"a":[{}],"b":[{}]}']),/one nonempty repeated object branch/);
 const big='{"items":['+Array.from({length:60},(_,i)=>'{"v":'+i+'}').join(',')+']}';
 await assert.rejects(jsonPreflight([big,big,big]),/256 nodes/);
});

function tableImplementation(){
 const need=(v,m)=>{if(!v)throw Error(m);},owned=s=>s.prepared_node_context?.verified&&s.prepared_node_context.surface==='wizard';
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const factory=vm.runInNewContext('('+createTreeNodeSupport.toString()+')',{
  createTabularTransformNodeSupport:(_config,implementation)=>implementation,
  jsonToTreeParametersSchema:{},treeToTableParametersSchema:{},validateTreeParameters,treeConfigurationReadback,
  need,owned,ready:s=>owned(s)&&s.node_tree?.verified,same:(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b)),
  one:(s,p,m)=>{const found=s.ui.elements.filter(p);need(found.length===1,m);return found[0];},structuredClone,JSON,
 });
 return factory({}, {json:false});
}
function tableState(indexed=false){
 const leaf=(path,name)=>({path,name,is_container:false,is_array:false,selected:true,checkbox_tid:name+';TreeCheckbox'});
 return {prepared_node_context:{verified:true,surface:'wizard'},wizard:{stage:'tree_table',root_tid:'W'},
  node_tree:{verified:true,inventory_complete:true,base:'W;',repeat_parents:true,composite_names:false,composite_labels:false,label_separator:'.',
   nodes:[{path:'',name:'Root',is_container:true,is_array:false,selected:true},leaf('/batch','batch'),
    {path:'/items',name:'items',is_container:true,is_array:true,selected:true,selected_global_index:indexed,global_index_tid:'items>index;TreeCheckbox'},
    leaf('/items/code','code'),leaf('/items/qty','qty')]},
  ui:{elements:[{tid:'W;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'items>index;TreeCheckbox',ref:'index',allowed_actions:['click']}]}};
}
for(const [label,parameters,kind,initial,clicks,expected] of [
 ['selects the requested native global index on a new node',{global_index_paths:['/items']},'new',false,1,true],
 ['clears an unrequested index on a new node',{},'new',true,1,false],
 ['preserves a saved index when the parameter is omitted',{},'existing',true,0,true],
 ['removes a saved index on explicit []',{global_index_paths:[]},'existing',true,1,false],
])test('tree-to-table configure '+label,async()=>{
 const state=tableState(initial),performed=[];
 const channel={observe:async options=>{assert.ok(options.ready(state));return structuredClone(state);},perform:async options=>{
  const action=options.resolve(state);
  if(action.verb==='click'){performed.push(action.ref);const items=state.node_tree.nodes[2];items.selected_global_index=!items.selected_global_index;return;}
  state.wizard.stage='done';
 }};
 const result=await tableImplementation().configure(channel,parameters,{request:{finish:'execute',target:{kind}}});
 assert.equal(result.verified,true);assert.deepEqual(performed,Array(clicks).fill('index'));
 assert.equal(result.configuration.nodes[2].selected_global_index,expected);
});
test('tree-to-table read accepts exactly one generated integer index column and keeps leaf order',async()=>{
 const configuration=tableState(true).node_tree,implementation=tableImplementation();
 const read=async schema=>implementation.readOutputs({readOutputPort:async()=>({output:{port_kind:'table',sample_complete:true,schema}})},
  {ports:[0],sample_rows:100},{portExecution:{},execution:{execution_id:'exec'},receipt_id:'r'},{configuration});
 const col=(name,type='string')=>({name,type});
 assert.equal((await read([col('Index','integer'),col('batch'),col('code'),col('qty','integer')])).verified,true);
 assert.equal((await read([col('batch'),col('code'),col('qty','integer'),col('items_index','integer')])).verified,true);
 for(const schema of [[col('batch'),col('code'),col('qty','integer')],[col('Index'),col('batch'),col('code'),col('qty','integer')],
  [col('Index','integer'),col('code'),col('batch'),col('qty','integer')],[col('A','integer'),col('B','integer'),col('batch'),col('code'),col('qty','integer')]])
  await assert.rejects(read(schema),/field names or order differ/);
 const plain=structuredClone(configuration);plain.nodes[2].selected_global_index=false;
 await assert.rejects(implementation.readOutputs({readOutputPort:async()=>({output:{port_kind:'table',sample_complete:true,schema:[col('Index','integer'),col('batch'),col('code'),col('qty','integer')]}})},
  {ports:[0],sample_rows:100},{portExecution:{},execution:{execution_id:'exec'},receipt_id:'r'},{configuration:plain}),/field names or order differ/);
});
