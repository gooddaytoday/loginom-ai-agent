import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateTreeJsonScope,validateTreeParameters,validateSelectedTreePaths} from '../lib/tree-parameters.mjs';
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
