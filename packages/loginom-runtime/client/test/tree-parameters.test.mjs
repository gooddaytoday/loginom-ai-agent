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
