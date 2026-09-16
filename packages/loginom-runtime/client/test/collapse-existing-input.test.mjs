import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCollapseInputSnapshot} from '../lib/collapse-existing-input.mjs';
const request=()=>({document_id:'d',workflow_ref:{workflow_id:'w'},target:{kind:'existing',ref:{node_id:'n'}},inputs:[],mappings:[],parameters:{information:[{kind:'input_field',name:'EntityId'}],transposed:[{kind:'input_field',name:'Value'}]}});
const snapshot=()=>({verified:true,complete:true,cleanup_complete:true,mutation_calls:0,document_id:'d',workflow_id:'w',node_id:'n',build:'7.4.2',binding:{node:'n',input:'p',link:'l',source:'s',source_port:'sp',status:1,state:0,input_status:1,source_status:1,locked:false},active:true,references_acquired:13,references_released:13,native_schema_bytes:[7,8,9],usage_types:{columns:1,definitions:192,hashed:193},fields:[{index:0,id:0,name:'EntityId',source_name:'Id',type:4},{index:1,id:1,name:'Value',source_name:'V',type:5}]});
test('saved effective rename is valid; original upstream name is not a target name',()=>{
 assert.equal(validateCollapseInputSnapshot(snapshot(),request()).fields[0].name,'EntityId');
 const r=request();r.parameters.information[0].name='Id';assert.throws(()=>validateCollapseInputSnapshot(snapshot(),r),/missing: Id/);
});
test('missing selected field refuses the unchanged effective schema',()=>{
 const s=snapshot(),r=request();r.parameters.transposed[0].name='__MissingField__';assert.throws(()=>validateCollapseInputSnapshot(s,r),/missing/);assert.deepEqual(s,snapshot());
});
test('prospective explicit input rename resolves via saved source binding',()=>{
 const r=request();r.parameters.information[0].name='NextId';r.mappings=[{direction:'input',port:0,fields:[{source:{kind:'configured_field',name:'Id'},name:'NextId'},{source:{kind:'configured_field',name:'V'}}]}];
 assert.deepEqual(validateCollapseInputSnapshot(snapshot(),r).fields.map(f=>f.name),['NextId','Value']);
 r.mappings[0].fields[0].source.name='EntityId';assert.throws(()=>validateCollapseInputSnapshot(snapshot(),r),/unknown/);
});
test('stale exact name is rejected even when native case-insensitive schema bytes stay equal',()=>{
 const s=snapshot(),r=request(),previous=validateCollapseInputSnapshot(s,r).signature;s.fields[0].name='ENTITYID';assert.throws(()=>validateCollapseInputSnapshot(s,r,previous),/stale/);
});
for(const [name,edit] of [
 ['document',s=>s.document_id='foreign'],['workflow',s=>s.workflow_id='foreign'],['node',s=>s.node_id='foreign'],
 ['incomplete',s=>s.complete=false],['duplicate source',s=>s.fields[1].source_name='Id'],['missing field id',s=>delete s.fields[0].id],
 ['cleanup',s=>s.references_released--],['missing schema bytes',s=>s.native_schema_bytes=[]],['mutation',s=>s.mutation_calls=1],['missing usage masks',s=>delete s.usage_types],['wrong mask union',s=>s.usage_types.hashed=1],['invalid mask',s=>s.usage_types.definitions=65536],
])test(name+' snapshot is rejected',()=>{const s=snapshot();edit(s);assert.throws(()=>validateCollapseInputSnapshot(s,request()));});
test('source replacement cannot use the old saved input proof',()=>{
 const r=request();r.inputs=[{input:0,source:{node_id:'foreign',document_id:'d',workflow_id:'w'},output:0}];assert.throws(()=>validateCollapseInputSnapshot(snapshot(),r),/differs/);
});

test('usage mask changes invalidate the retained snapshot even with the same hash',()=>{const s=snapshot(),r=request(),signature=validateCollapseInputSnapshot(s,r).signature;s.usage_types={columns:192,definitions:192,hashed:192};assert.throws(()=>validateCollapseInputSnapshot(s,r,signature),/stale/);});
