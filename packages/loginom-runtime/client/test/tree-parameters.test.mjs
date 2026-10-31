import test from 'node:test';
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
