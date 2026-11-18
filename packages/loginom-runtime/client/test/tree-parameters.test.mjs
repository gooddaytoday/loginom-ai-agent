import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {treeToTableParametersSchema,validateTreeJsonScope,validateTreeParameters,validateJsonTreeSchema,validateSelectedTreePaths} from '../lib/tree-parameters.mjs';
import {createTreeNodeSupport,treeConfigurationReadback} from '../lib/tree-node.mjs';
import {NODE_TYPES,validateNodeTargetRequest} from '../lib/node-contracts.mjs';
test('tree stage 1 admits the independent acceptance JSON with exact original integer lexemes',async()=>{
 const text=await readFile(new URL('../../../../docs/node-development/nodes/trees-jsontotree/fixtures/response.json',import.meta.url),'utf8');
 assert.equal(validateTreeJsonScope(text).verified,true);
});
for(const value of ['[]','null','1','{"items":[]}','{"items":[1,2]}',
 '{"items":[{"v":1,"v":2}]}','{"id":1,"items":[{"id":2}]}','{"items":[{"v":9223372036854775808}]}'])test('tree scope refuses '+value,()=>{
 assert.throws(()=>validateTreeJsonScope(value));
});
test('JSON tree and tree-to-table admit the native-confirmed dates fixture and datetime schema',async()=>{
 const csv=await readFile(new URL('../../../../docs/node-development/nodes/trees-jsontotree/fixtures/typed/documents.csv',import.meta.url),'utf8');
 const text=csv.split(/\r?\n/)[1].match(/^"((?:""|[^"])*)";/)[1].replaceAll('""','"');
 assert.equal(validateTreeJsonScope(text).verified,true);
 assert.equal(validateTreeJsonScope('{"items":[{"when":"2026-01-15"}]}').verified,true);
 const schema=[{path:'',name:'Root',is_container:true,is_array:false},{path:'/items',name:'items',is_container:true,is_array:true},
  {path:'/items/id',name:'id',type:'integer',is_container:false},{path:'/items/when',name:'when',type:'datetime',is_container:false}];
 assert.equal(validateJsonTreeSchema(schema),true);
 assert.equal(validateSelectedTreePaths(schema,['/items/id','/items/when']),true);
 for(const type of ['unknown'])assert.throws(()=>validateJsonTreeSchema(schema.map(n=>n.name==='when'?{...n,type}:n)),/supported types/);
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
test('JSON tree preflight refuses several JSON documents before mutation and keeps the one-document path',async()=>{
 assert.equal((await jsonPreflight(['{"items":[{"sku":"A"}]}'])).verified,true);
 for(const rows of [['{"group":"A","items":[{"code":"x"}]}','{"group":"B","items":[{"code":"y"}]}'],['{"items":[{"sku":"A"}]}',null]])
  await assert.rejects(jsonPreflight(rows),/Несколько документов JSON в одном импорте пока не поддержаны; подай один документ/);
 await assert.rejects(jsonPreflight([]),/one non-NULL JSON string row/);
 await assert.rejects(jsonPreflight([null]),/one non-NULL JSON string row/);
 await assert.rejects(jsonPreflight(['{"items":[]}']),/one nonempty repeated object branch/);
 assert.equal((await jsonPreflight(['{"a":[{}],"b":[{}]}'])).verified,true);
});

function tableImplementation(json=false){
 const need=(v,m)=>{if(!v)throw Error(m);},owned=s=>s.prepared_node_context?.verified&&s.prepared_node_context.surface==='wizard';
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const factory=vm.runInNewContext('('+createTreeNodeSupport.toString()+')',{
  createTabularTransformNodeSupport:(_config,implementation)=>implementation,
  jsonToTreeParametersSchema:{},treeToTableParametersSchema:{},validateTreeParameters,validateJsonTreeSchema,validateSelectedTreePaths,treeConfigurationReadback,
  need,owned,ready:s=>owned(s)&&s.node_tree?.verified,same:(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b)),
  one:(s,p,m)=>{const found=s.ui.elements.filter(p);need(found.length===1,m);return found[0];},structuredClone,JSON,
 });
 return factory({}, {json});
}

test('JSON output admits nested object arrays while tree-to-table retains its one-array scope',async()=>{
 const schema=[{path:'',name:'Root',type:'object',is_container:true,is_array:false},
  {path:'/items',name:'items',type:'object',is_container:true,is_array:true},
  {path:'/items/id',name:'id',type:'integer',is_container:false,is_array:false},
  {path:'/items/parts',name:'parts',type:'object',is_container:true,is_array:true},
  {path:'/items/parts/sku',name:'sku',type:'string',is_container:false,is_array:false}];
 const output={port_kind:'tree',tree:{complete:true,schema}};
 const result=await tableImplementation(true).readOutputs({readOutputPort:async()=>({output})},
  {ports:[0],sample_rows:100},{execution:{execution_id:'exec'}},{});
 assert.equal(result.verified,true);
 assert.throws(()=>validateSelectedTreePaths(schema),/one object and one repeated branch/);
 for(const fault of ['scalar-array']){
  const bad=structuredClone(schema);
  if(fault==='scalar-array')bad[3].is_container=false;
  if(['variant','datetime'].includes(fault))bad[4].type=fault;
  assert.throws(()=>validateJsonTreeSchema(bad),undefined,fault);
 }
});

test('JSON preflight admits empty record containers only with an object-array witness at the same schema path',async()=>{
 assert.throws(()=>validateTreeJsonScope('{"items":[]}'),{message:'Tree stage 1 requires one nonempty repeated object branch'});
 const text=await readFile(new URL('../../../../docs/node-development/nodes/trees-jsontotree/fixtures/nested-records/empty.json',import.meta.url),'utf8');
 assert.equal(validateTreeJsonScope(text).verified,true);
 assert.equal((await jsonPreflight([text])).verified,true);
 const value=JSON.parse(text);value.items.reverse();
 assert.equal(validateTreeJsonScope(JSON.stringify(value)).verified,true);
 assert.equal(validateTreeJsonScope('{"items":[{"parts":[],"details":{}},{"parts":[{"qty":0}],"details":{"code":""}}]}').verified,true);
 for(const input of [
  {items:[{parts:[]},{parts:[]}]},
  {items:[{parts:[],other:[{qty:1}]}]},
 ])assert.throws(()=>validateTreeJsonScope(JSON.stringify(input)));
});

test('nested JSON keeps scalar/container changes and limits outside scope',async()=>{
 for(const value of [
  {items:[{parts:[1,'x']}]}, {items:[{parts:[]}]},
  {items:[{details:{code:'A'}},{details:'A'}]},
  {items:Array.from({length:257},()=>({id:1}))},
  {items:[{text:'x'.repeat(1024*1024)}]},
 ])assert.throws(()=>validateTreeJsonScope(JSON.stringify(value)));
 let deep={code:'A'};for(let i=0;i<17;i++)deep={details:deep};
 assert.throws(()=>validateTreeJsonScope(JSON.stringify({items:[deep]})));
 const text=await readFile(new URL('../../../../docs/node-development/nodes/trees-jsontotree/fixtures/nested-records/nested.json',import.meta.url),'utf8');
 assert.equal(validateTreeJsonScope(text).verified,true);
 assert.equal(validateTreeJsonScope('{"items":[{"a/b~c":{"parts":[{"sku":"a"}]}}]}').verified,true);
});

test('JSON scalar arrays admit homogeneous siblings and empty records with a typed witness',()=>{
 const document={items:[{id:1,tags:['a','b'],scores:[1.5,2.5]},{id:2,tags:[],scores:[]},{id:3,tags:['c'],scores:[.25]}]};
 assert.equal(validateTreeJsonScope(JSON.stringify(document)).verified,true);
 const schema=[{path:'',name:'Root',is_container:true,is_array:false},
  {path:'/items',name:'items',is_container:true,is_array:true},
  {path:'/items/id',name:'id',type:'integer',is_container:false,is_array:false},
  ...['tags','scores'].map((name,i)=>({path:'/items/'+name,name,type:i?'real':'string',is_container:false,is_array:true}))];
 assert.equal(validateJsonTreeSchema(schema),true);
 assert.throws(()=>validateSelectedTreePaths(schema,['/items/tags']),/one object and one repeated branch/);
 for(const items of [
  [{tags:['a',1]}],[{tags:['a']},{tags:[true]}],[{tags:['a']},{tags:[{v:'a'}]}],
  [{tags:[['a']]}],[{tags:[]}],[{tags:[null]}],
 ])assert.throws(()=>validateTreeJsonScope(JSON.stringify({items})));
 for(const tags of [['a',null,''],[false,true],[1,2.5]])
  assert.equal(validateTreeJsonScope(JSON.stringify({items:[{tags:[]},{tags}]})).verified,true);
 assert.throws(()=>validateJsonTreeSchema([...schema,{path:'/items/mixed',name:'mixed',type:'variant',is_container:false,is_array:true}]),/supported types/);
});
test('LAB-1807 tree-siblings-native: JSON admits sibling object arrays; tree-to-table selects across them, nested and scalar arrays stay refused',async()=>{
 const csv=await readFile(new URL('../../../../docs/node-development/nodes/trees-treetodata/fixtures/siblings/documents.csv',import.meta.url),'utf8');
 const text=csv.split(/\r?\n/)[1].match(/^1,"((?:""|[^"])*)"$/)[1].replaceAll('""','"');
 assert.deepEqual(Object.keys(JSON.parse(text)),['batch','items','tags']);
 assert.equal(validateTreeJsonScope(text).verified,true);
 for(const value of ['{"a":[{}],"b":[{}]}','{"items":[{"parts":[{"sku":"a"}],"other":[{"name":"b"}]}]}','{"items":[{"x":1}],"more":[{"t":"a"}],"x":{"tags":[{"u":"b"}]}}'])
  assert.equal(validateTreeJsonScope(value).verified,true,value);
 assert.throws(()=>validateTreeJsonScope('{"items":[{"code":"x"}],"tags":[]}'),/witness/);
 assert.throws(()=>validateTreeJsonScope(JSON.stringify({items:[{code:'x'}],tags:Array.from({length:128},()=>({tag:'a'}))})),/256 nodes/);
 const node=(path,type,is_array=false)=>({path,name:path.split('/').at(-1)||'Root',type,is_container:type==='object',is_array});
 const schema=[node('','object'),node('/batch','string'),node('/items','object',true),node('/items/code','string'),node('/items/qty','integer'),
  node('/tags','object',true),node('/tags/tag','string')];
 assert.equal(validateJsonTreeSchema(schema),true);
 const output={port_kind:'tree',tree:{complete:true,schema}};
 assert.equal((await tableImplementation(true).readOutputs({readOutputPort:async()=>({output})},{ports:[0],sample_rows:100},{execution:{execution_id:'exec'}},{})).verified,true);
 assert.equal(validateSelectedTreePaths(schema,['/batch','/items/code','/items/qty','/tags/tag']),true);
 assert.equal(validateSelectedTreePaths(schema,['/tags/tag'],['/tags']),true);
 assert.throws(()=>validateSelectedTreePaths(schema,['/tags/tag','/items/code']),/native schema order/);
 assert.throws(()=>validateSelectedTreePaths([...schema,node('/tags/parts','object',true),node('/tags/parts/sku','string')]),/one object and one repeated branch/);
 assert.throws(()=>validateSelectedTreePaths([...schema,{...node('/tags/codes','string',true),is_container:false}]),/one object and one repeated branch/);
 assert.throws(()=>validateSelectedTreePaths(schema.filter(n=>!n.is_array&&!n.path.match(/^\/(items|tags)\//))),/one object and one repeated branch/);
});
function tableState(indexed=false){
 const leaf=(path,name)=>({path,name,is_container:false,is_array:false,selected:true,checkbox_tid:name+';TreeCheckbox'});
 return {prepared_node_context:{verified:true,surface:'wizard'},wizard:{stage:'tree_table',root_tid:'W'},
  node_tree:{verified:true,inventory_complete:true,base:'W;',repeat_parents:true,composite_names:false,composite_labels:false,label_separator:'.',
   nodes:[{path:'',name:'Root',is_container:true,is_array:false,selected:true},leaf('/batch','batch'),
    {path:'/items',name:'items',is_container:true,is_array:true,selected:true,selected_global_index:indexed,global_index_tid:'items>index;TreeCheckbox'},
    leaf('/items/code','code'),leaf('/items/qty','qty')]},
  ui:{elements:[{tid:'W;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'items>index;TreeCheckbox',ref:'index',allowed_actions:['click'],interaction:{state:'point_observed'}}]}};
}

test('tree-to-table admits 70 through 256 selected paths and refuses overflow, duplicates and foreign paths',()=>{
 const request={target:{kind:'existing',type:'trees.to_table'},inputs:[],mappings:[]};
 const paths=Array.from({length:257},(_,i)=>'/rows/f'+String(i).padStart(2,'0'));
 assert.equal(treeToTableParametersSchema.properties.selected_paths.maxItems,256);
 for(const count of [70,256])validateTreeParameters({selected_paths:paths.slice(0,count)},'selected_nodes',request);
 for(const selected_paths of [paths,paths.slice(0,70).concat(paths[0])])
  assert.throws(()=>validateTreeParameters({selected_paths},'selected_nodes',request),/selected_paths/);
 const schema=[{path:'',is_container:true,is_array:false},{path:'/rows',is_container:true,is_array:true},
  ...paths.slice(0,70).map(path=>({path,name:path.split('/').at(-1),is_container:false,is_array:false,type:'integer'}))];
 assert.equal(validateSelectedTreePaths(schema,paths.slice(0,70)),true);
 assert.throws(()=>validateSelectedTreePaths(schema,paths.slice(0,71)),/selected_paths/);
});

for(const subset of [false,true])test('tree-to-table wide '+(subset?'reveals a subset below the viewport':'selects all leaves without individual leaf clicks and removes the native index'),async()=>{
 const state=tableState(),actions=[];let top=0;
 const leaves=Array.from({length:70},(_,i)=>({index:i+2,path:'/rows/f'+String(i).padStart(2,'0'),name:'f'+String(i).padStart(2,'0'),
  is_container:false,is_array:false,selected:false,checkbox_tid:'leaf'+i+';TreeCheckbox'}));
 state.node_tree.nodes=[{index:0,path:'',name:'Root',is_container:true,is_array:false,selected:false},
  {index:1,path:'/rows',name:'rows',is_container:true,is_array:true,selected:false,selected_global_index:false,global_index_tid:'rows>index;TreeCheckbox'},...leaves];
 const index=state.node_tree.nodes[1];
 const refresh=()=>{
  const rows=[{index:1,tid:index.global_index_tid},...leaves.map(n=>({index:n.index,tid:n.checkbox_tid}))];
  state.ui.elements=[{tid:'W;btnNext',ref:'next',allowed_actions:['wizard_step']},
   ...['btnSelectAll','btnDeselectAll'].map(name=>({tid:'W;'+name,ref:name,allowed_actions:['click']})),
   ...rows.map((row,i)=>({tid:row.tid,ref:row.tid,allowed_actions:['click',...(i>=top&&i<top+15?['scroll']:[])],
    scroll:{ref:'tree-scroll',top,height:15,scroll_height:71},interaction:{state:i>=top&&i<top+15?'point_observed':'obscured'}}))];
 };
 const channel={observe:async options=>{refresh();assert.ok(options.ready(state));return structuredClone(state);},perform:async options=>{
  refresh();const action=options.resolve(state);actions.push(action);
  if(action.verb==='wizard_step'){state.wizard.stage='done';return;}
  if(action.verb==='scroll'){top=Math.max(0,Math.min(56,top+Math.sign(action.delta_y)*12));return;}
  if(action.ref==='btnSelectAll'||action.ref==='btnDeselectAll'){
   for(const n of state.node_tree.nodes)n.selected=action.ref==='btnSelectAll';
   index.selected_global_index=action.ref==='btnSelectAll';return;
  }
  const e=state.ui.elements.find(e=>e.ref===action.ref);assert.equal(e.interaction.state,'point_observed','UI_REFERENCE_OBSCURED');
  if(action.ref===index.global_index_tid)index.selected_global_index=!index.selected_global_index;
  else{const n=leaves.find(n=>n.checkbox_tid===action.ref);n.selected=!n.selected;}
 }};
 const selected_paths=(subset?leaves.slice(65):leaves).map(n=>n.path);
 const result=await tableImplementation().configure(channel,{selected_paths},{request:{finish:'execute',target:{kind:'new'}}});
 assert.equal(result.verified,true);assert.equal(result.configuration.nodes[1].selected_global_index,false);
 assert.deepEqual(Array.from(result.configuration.nodes.filter(n=>!n.is_container&&n.selected),n=>n.path),selected_paths);
 const clicks=actions.filter(a=>a.verb==='click').map(a=>a.ref);
 if(subset){assert.ok(actions.some(a=>a.verb==='scroll'));assert.deepEqual(clicks.filter(t=>t.startsWith('leaf')),leaves.slice(65).map(n=>n.checkbox_tid));}
 else assert.deepEqual(clicks,['btnSelectAll',index.global_index_tid]);
});
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

test('tree-to-table configure refuses when the native index leaf does not settle after a click',async()=>{
 const state=tableState(false),performed=[];
 const channel={observe:async options=>{assert.ok(options.ready(state));return structuredClone(state);},perform:async options=>{
  const action=options.resolve(state);if(action.verb==='click'){performed.push(action.ref);return;}state.wizard.stage='done';}};
 await assert.rejects(tableImplementation().configure(channel,{global_index_paths:['/items']},{request:{finish:'execute',target:{kind:'new'}}}),/Tree table stage 1 settings differ/);
 assert.deepEqual(performed,['index']);
});
test('tree-to-table admits dates and Variant leaves; serialization still refuses them; JSON admits inferred dates',async()=>{
 const {decodePortCell}=await import('../lib/node-port-output.mjs');
 const {validateSerializationTree}=await import('../lib/tree-conversion-parameters.mjs');
 const schema=type=>[{path:'',name:'Root',is_container:true,is_array:false},{path:'/items',name:'items',is_container:true,is_array:true},
  {path:'/items/v',name:'v',type,is_container:false,is_array:false}];
 for(const type of ['datetime','variant']){
  // LAB-1699: R4 trees.from_table leaves reach trees.to_table as DataType 2/6.
  assert.equal(validateSelectedTreePaths(schema(type),['/items/v']),true);
  assert.throws(()=>validateSerializationTree({port_kind:'tree',tree:{complete:true,schema:schema(type)}}),/dates and Variant/);
 }
 assert.throws(()=>validateSelectedTreePaths(schema('unknown'),['/items/v']),/supported types/);
 assert.equal(validateTreeJsonScope('{"items":[{"v":"2024-01-01"}]}').verified,true);
 assert.deepEqual(decodePortCell('x','variant').limitations,['variant_display_precision']);
 assert.deepEqual(decodePortCell(1.5,'real').limitations,[]);
 assert.throws(()=>decodePortCell({},'string'),/unsupported_type/);
});

// Native R1 probe: mixed small integer/real cannot be distinguished by typeof.
test('JSON tree Variant preflight admits scalar subtype changes and retains container guards',()=>{
 const text='{"items":[{"id":1,"value":7},{"id":2,"value":"семь"},{"id":3,"value":false},{"id":4,"value":null},{"id":5,"value":2.5},{"id":6,"value":9007199254740993}]}';
 assert.equal(validateTreeJsonScope(text).verified,true);
 const schema=[{path:'',name:'Root',is_container:true,is_array:false},
  {path:'/items',name:'items',is_container:true,is_array:true},
  {path:'/items/value',name:'value',type:'variant',is_container:false,is_array:false}];
 assert.equal(validateJsonTreeSchema(schema),true);
 assert.equal(validateSelectedTreePaths(schema,['/items/value']),true);
 for(const value of ['{"items":[{"value":1},{"value":{"x":1}}]}','{"items":[{"value":[]},{"value":"x"}]}'])
  assert.throws(()=>validateTreeJsonScope(value));
});
