import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateTreeConversionParameters,validateTableTreeSource} from '../lib/tree-conversion-parameters.mjs';
import {nodeApplyInputSchema} from '../lib/node-api.mjs';
import {validateActionParameters} from '../lib/action-catalog.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {NODE_TYPES,describeNodeTypes} from '../lib/node-contracts.mjs';
import {userNodeTool} from '../lib/user-workflow.mjs';
import {nodeApiTools} from '../lib/node-api.mjs';
const nodes=JSON.parse(await readFile(new URL('../../../../docs/node-development/nodes/trees-datatotree/fixtures/structure.json',import.meta.url))).nodes;
const request={target:{kind:'new',type:'trees.from_table'},inputs:[{input:0,output:0}],mappings:[]};
test('table-tree validates the complete declared schema and typed source before mutation',()=>{
 validateTreeConversionParameters({nodes},'manual_structure',request);
 const schema=nodes.filter(n=>n.source_field).map(n=>({name:n.source_field,type:n.type}));
 const port={sample_complete:true,row_count:3,schema,sample:Array.from({length:3},()=>schema.map(c=>({type:c.type,is_null:true,value:null})))};
 validateTableTreeSource(port,nodes);
 for(const change of [n=>n[2].path='/items/0/RowID',n=>n[1].is_array=false,n=>n[0].source_field='RowID',n=>n[2].type='datetime',n=>n[2].label='other',n=>n.push({...n[2]})]){
  const bad=structuredClone(nodes);change(bad);assert.throws(()=>validateTreeConversionParameters({nodes:bad},'manual_structure',request));
 }
 assert.throws(()=>validateTableTreeSource({...port,schema:schema.map(c=>({...c,type:'string'}))},nodes));
 assert.throws(()=>validateTableTreeSource({...port,row_count:100},nodes));
 assert.throws(()=>validateTreeConversionParameters({},'manual_structure',request));
 validateTreeConversionParameters({},'manual_structure',{...request,target:{...request.target,kind:'existing'},inputs:[]});
});
test('serialization accepts only the approved settings and retains omitted existing settings',()=>{
 const r={...request,target:{kind:'new',type:'trees.to_json'}};
 const p={exclude_root:true,pretty:false,keys:'names',multi_row:false,datetime:'iso8601'};
 validateTreeConversionParameters(p,'serialize',r);
 for(const [key,value] of Object.entries({exclude_root:false,pretty:true,keys:'labels',multi_row:true,datetime:'local'}))assert.throws(()=>validateTreeConversionParameters({...p,[key]:value},'serialize',r));
 assert.throws(()=>validateTreeConversionParameters({},'serialize',r));
 validateTreeConversionParameters({},'serialize',{...r,target:{...r.target,kind:'existing'},inputs:[]});
});
test('new types install their actual handlers and preserve the sorting/join keys schema',()=>{
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 for(const type of ['trees.from_table','trees.to_json'])assert.ok(support.nodeApplyHandlers.has(type));
 assert.equal(NODE_TYPES['trees.from_table'].tree_outputs,1);
 assert.deepEqual(NODE_TYPES['trees.to_json'].input_kinds,['tree']);
 for(const keys of ['names',[{field:{kind:'input_field',name:'ID'},direction:'ASC'}],[{left:'ID',right:'Key'}]])validateActionParameters(nodeApplyInputSchema.properties.parameters,{keys});
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyInputSchema.properties.parameters);
 assert.equal(validate({keys:'labels'}).valid,false);
 assert.equal(validate({keys:'names'}).valid,true);
 const compact=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply'));
 assert.ok(Buffer.byteLength(JSON.stringify(compact.inputSchema))<=20000);
 for(const type of ['trees.from_table','trees.to_json']){
  const cards=describeNodeTypes([type],{},new Map(),support.nodeApplyHandlers);
  assert.ok(Buffer.byteLength(JSON.stringify(cards[0]))<=12000);
 }
});
