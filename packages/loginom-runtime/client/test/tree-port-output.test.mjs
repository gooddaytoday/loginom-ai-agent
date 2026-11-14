import test from 'node:test';
import assert from 'node:assert/strict';
import {decodePortCell,readTreePortSource} from '../lib/node-port-output.mjs';
import {compactNodeResult} from '../lib/user-results.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {nodeTreeOutputPortSchema} from '../lib/node-result-schema.mjs';
import {readFile} from 'node:fs/promises';
import {validateTreeJsonScope} from '../lib/tree-parameters.mjs';

function fixture({count=4,depth=0,precision=false,duplicate=false,nativeContainers=false,absentContainer=false,rows=1,noteType=5}={}){
 const released=[],nodes=[];
 const node=(name,type,children=[],array=false)=>{
  const index=nodes.length,def={index,name,type,children,array,
   get_Name:async()=>name,get_DisplayName:async()=>name,get_IsContainer:async()=>children.length>0,
   get_IsArray:async()=>array,get_DataType:async()=>type,get_SubNodes:async()=>({get_Count:async()=>children.length,getItem:async i=>children[i],dispose:async()=>released.push('children:'+index)}),
   dispose:async()=>released.push(index)};
  nodes.push(def);return def;
 };
 const id=node('id',4),flag=node('active',1),sku=node('sku',5),qty=node('qty',4),price=node('price',3),note=node('note',noteType);
 if(duplicate)note.get_Name=async()=> 'sku';
 const items=node('items',0,[sku,qty,price,note],true);
 let root=node('Root',0,absentContainer?[node('meta',0,[id,flag]),items]:[id,flag,items]);
 for(let i=0;i<depth;i++)root=node('Root',0,[root]);
 class Int64{toString(){return '9007199254740993';}}
 const reader={GetRowCount:async()=>rows,GetContainerExists:async(index,row)=>{
  if(nativeContainers&&(index===0||reader.definitions[index].array))throw Error('Native container query is not applicable to root or array rows');
  return !(absentContainer&&reader.definitions[index].name==='meta');
 },
  GetRowRange:async(index,parent,start,size)=>{assert.ok(parent>=0&&parent<rows);start.$=parent*count;size.$=count;},
  AsVariant:async(index,row)=>{
   const name=reader.definitions[index].name;
   if(name==='id')return rows>1?[7,8][row]:precision?9007199254740992:new Int64();
   if(name==='note'&&noteType===2)return new Date(2024,1,29,13,45,6,789);
   if(name==='active')return false;
   if(name==='sku')return ['A','B','C','D','E','F','G','H'][row];
   if(name==='qty')return [2,0,3,1,5,6,7,8][row];
   if(name==='price')return [1.25,.5,2,.5,1,1,1,1][row];
   return [null,'','x',undefined][row];
  },dispose:async()=>released.push('reader')};
 const source={get_RootNodeDef:async()=>root,GetReader:async definitions=>{reader.definitions=definitions;return reader;}};
 const owned=[],call=async fn=>fn(),track=p=>{owned.push(p);return p;};
 return {source,call,track,owned,released};
}
async function read(options){const f=fixture(options);return readTreePortSource(f.source,f.call,f.track,decodePortCell);}
test('scalar arrays keep parent row ranges, empty arrays and exact leaf types',async()=>{
 const node=(name,type,children=[],array=false)=>({name,
  get_Name:async()=>name,get_DisplayName:async()=>name,get_DataType:async()=>type,
  get_IsContainer:async()=>children.length>0,get_IsArray:async()=>array,
  get_SubNodes:async()=>({get_Count:async()=>children.length,getItem:async i=>children[i]})});
 const root=node('Root',0,[node('items',0,[node('id',4),node('tags',5,[],true),node('scores',3,[],true)],true)]);
 const calls=[],values=[];
 const source={get_RootNodeDef:async()=>root,GetReader:async definitions=>({
  GetRowCount:async()=>1,
  GetRowRange:async(index,parent,start,size)=>{
   const name=definitions[index].name;calls.push([name,parent]);
   const range=name==='items'&&parent===0?[3,3]:parent===3?[10,2]:parent===4?[12,0]:parent===5?[12,1]:null;
   assert.ok(range);[start.$,size.$]=range;
  },
  GetContainerExists:async()=>{throw Error('array elements are not containers');},
  AsVariant:async(index,row)=>{
   const name=definitions[index].name;values.push([name,row]);
   const value={id:{3:1,4:2,5:3},tags:{10:'a',11:'b',12:'c'},scores:{10:1.5,11:2.5,12:.25}}[name][row];
   assert.notEqual(value,undefined);return value;
  },
 })};
 const tree=await readTreePortSource(source,async fn=>fn(),p=>p,decodePortCell);
 assert.deepEqual(calls,[['items',0],['tags',3],['scores',3],['tags',4],['scores',4],['tags',5],['scores',5]]);
 assert.deepEqual(values,[['id',3],['tags',10],['tags',11],['scores',10],['scores',11],['id',4],['id',5],['tags',12],['scores',12]]);
 for(const name of ['tags','scores']){
  const def=tree.schema.find(n=>n.name===name);assert.equal(def.is_array,true);assert.equal(def.is_container,false);
  assert.deepEqual(tree.instances.find(n=>n.path==='/items/1/'+name).children,[]);
 }
 const document=index=>{const n=tree.instances[index];return {path:n.path,type:n.is_null?'null':n.type,
  ...(n.children?{children:n.children.map(document)}:{value:n.type==='real'?String(n.value):n.value})};};
 const approved=JSON.parse(await readFile(new URL('../../../../docs/node-development/nodes/trees-jsontotree/acceptance/typed/expected.json',import.meta.url)));
 assert.deepEqual(document(0),approved.cases.scalar_arrays.tree_outputs[0].document);
 const validate=new AjvJsonSchemaValidator().getValidator(nodeTreeOutputPortSchema);
 assert.equal(validate({port:0,port_guid:'port',port_kind:'tree',fresh:true,execution_id:'exec',freshness_basis:'completed_execution_port_source',tree,sample_complete:true}).valid,true);
});
test('tree_io reads ordered schema and every native instance with exact Int64, false, zero and NULL',async()=>{
 const result=await read();
 assert.equal(result.complete,true);assert.equal(result.node_count,24);
 assert.deepEqual(result.schema.map(n=>n.path),['','/id','/active','/items','/items/sku','/items/qty','/items/price','/items/note']);
 const value=path=>result.instances.find(n=>n.path===path).value;
 assert.equal(value('/id'),'9007199254740993');assert.equal(value('/active'),false);
 assert.equal(result.instances.find(n=>n.path==='/items').children.length,4);
 assert.equal(value('/items/1/qty'),'0');assert.equal(value('/items/0/note'),null);
 assert.equal(value('/items/1/note'),'');assert.equal(value('/items/3/note'),null);assert.equal(value('/items/2/price'),2);
});
test('tree_io uses root row count and array row ranges as the existence proof for their records',async()=>{
 const result=await read({nativeContainers:true});
 assert.equal(result.complete,true);assert.equal(result.node_count,24);
 assert.equal(result.instances.find(n=>n.path==='/items/3/qty').value,'1');
});
for(const [type,value,decoded] of [[1,false,false],[2,new Date(2026,0,15,12),'2026-01-15T12:00:00.000'],
 [3,1.5,1.5],[4,7,'7'],[5,'',''],[6,7,null]])test('scalar array native DataType '+type,async()=>{
 const leaf={get_Name:async()=> 'values',get_DisplayName:async()=> 'values',get_IsContainer:async()=>false,get_IsArray:async()=>true,get_DataType:async()=>type};
 const root={get_Name:async()=> 'Root',get_DisplayName:async()=> 'Root',get_IsContainer:async()=>true,get_IsArray:async()=>false,
  get_SubNodes:async()=>({get_Count:async()=>1,getItem:async()=>leaf})};
 const source={get_RootNodeDef:async()=>root,GetReader:async()=>({GetRowCount:async()=>1,
  GetRowRange:async(index,parent,start,size)=>{assert.equal(index,1);assert.equal(parent,0);start.$=9;size.$=2;},
  AsVariant:async(index,row)=>{assert.equal(index,1);assert.ok([9,10].includes(row));return row===9?value:null;}})};
 const read=()=>readTreePortSource(source,async fn=>fn(),p=>p,(raw,kind)=>kind==='datetime'&&raw!==null
  ?{cell:{type:kind,is_null:false,value:decoded,precision:'millisecond',representation:'local_datetime'},limitations:[]}:decodePortCell(raw,kind));
 if(type===6){await assert.rejects(read(),/tree_scalar_type/);return;}
 const tree=await read();assert.equal(tree.instances[2].value,decoded);assert.equal(tree.instances[3].is_null,true);
});
test('tree_io still refuses a genuinely absent ordinary object container',async()=>{
 await assert.rejects(read({nativeContainers:true,absentContainer:true}),/tree_absent_container/);
});
test('tree_io refuses unsafe integer precision instead of rounding',async()=>{
 await assert.rejects(read({precision:true}),/integer_value/);
});
test('tree_io refuses instance overflow before delivering any truncated tree',async()=>{
 await assert.rejects(read({count:257}),/tree_instance_limit/);
});
test('tree_io refuses depth overflow and ambiguous sibling names',async()=>{
 await assert.rejects(read({depth:17}),/tree_depth_limit/);
 await assert.rejects(read({duplicate:true}),/tree_schema_names/);
});
test('tree_io public schema and compaction preserve the complete schema and instance tree',async()=>{
 const tree=await read(),port={port:0,port_guid:'port',port_kind:'tree',fresh:true,execution_id:'exec',
  freshness_basis:'completed_execution_port_source',tree,sample_complete:true};
 const validate=new AjvJsonSchemaValidator().getValidator(nodeTreeOutputPortSchema);
 assert.equal(validate(port).valid,true);
 const result=compactNodeResult({operation_id:'op',state:'settled',outcome:{status:'SUCCEEDED',cleanup_complete:true,
  output:{output:{status:'complete',execution_id:'exec',evidence_ref:'receipt',ports:[port]}}}});
 assert.deepEqual(result.output.ports,[port]);
 const bad=structuredClone(port);bad.tree.complete=false;assert.equal(validate(bad).valid,false);
});
test('tree_io reads datetime leaves as civil milliseconds and still refuses Variant leaves',async()=>{
 // Temporal-based datetime decoding is covered in the browser integration test;
 // here the tree reader must admit the type and keep the decoded civil cell.
 const f=fixture({noteType:2}),civil=(raw,type)=>type==='datetime'&&raw instanceof Date
  ?{cell:{type,is_null:false,value:'2024-02-29T13:45:06.789',representation:'local_datetime',precision:'millisecond',timezone:'unspecified'},limitations:[]}:decodePortCell(raw,type);
 const result=await readTreePortSource(f.source,f.call,f.track,civil);
 const note=result.instances.find(n=>n.path==='/items/0/note');
 assert.equal(result.schema.find(n=>n.path==='/items/note').type,'datetime');
 assert.equal(note.value,'2024-02-29T13:45:06.789');assert.equal(note.precision,'millisecond');
 const validate=new AjvJsonSchemaValidator().getValidator(nodeTreeOutputPortSchema);
 assert.equal(validate({port:0,port_guid:'port',port_kind:'tree',fresh:true,execution_id:'exec',freshness_basis:'completed_execution_port_source',tree:result,sample_complete:true}).valid,true);
 await assert.rejects(read({noteType:6}),/tree_scalar_type/);
});
test('tree_io still reads exactly one native document: several root rows and an empty tree refuse',async()=>{
 await assert.rejects(read({rows:2,count:2}),/tree_document_count/);
 await assert.rejects(read({rows:0}),/tree_document_count/);
});

test('nested records use native parent row ranges and object existence, matching the approved tree',async()=>{
 const base=new URL('../../../../docs/node-development/nodes/trees-jsontotree/',import.meta.url);
 const expected=JSON.parse(await readFile(new URL('acceptance/nested-records/expected.json',base))).cases.nested.proposed_tree_output;
 const node=(name,type,children=[],array=false)=>({name,children,array,
  get_Name:async()=>name,get_DisplayName:async()=>name,get_DataType:async()=>type,
  get_IsContainer:async()=>children.length>0,get_IsArray:async()=>array,
  get_SubNodes:async()=>({get_Count:async()=>children.length,getItem:async i=>children[i]})});
 const root=node('Root',0,[node('batch',5),node('items',0,[node('id',4),
  node('details',0,[node('code',5),node('active',1)]),node('parts',0,[node('sku',5),node('qty',4)],true)],true)]);
 const calls=[];
 class Int64{constructor(value){this.value=value;}toString(){return String(this.value);}}
 const source={get_RootNodeDef:async()=>root,GetReader:async definitions=>({
  GetRowCount:async index=>{assert.equal(index,0);return 1;},
  GetRowRange:async(index,parent,start,size)=>{
   const name=definitions[index].name;calls.push([name,parent]);
   const range=name==='items'&&parent===0?[3,2]:name==='parts'&&parent===3?[10,1]:name==='parts'&&parent===4?[11,2]:null;
   assert.ok(range,'range must belong to the actual parent row');[start.$,size.$]=range;
  },
  GetContainerExists:async(index,row)=>{assert.equal(definitions[index].name,'details');assert.ok([3,4].includes(row));return true;},
  AsVariant:async(index,row)=>{
   const values={batch:{0:'Бета'},id:{3:9007199254740993n,4:9007199254740994n},code:{3:'A',4:''},
    active:{3:true,4:false},sku:{10:'a',11:'b',12:'c'},qty:{10:2,11:0,12:null}};
   const value=values[definitions[index].name][row];assert.notEqual(value,undefined);
   return typeof value==='bigint'?new Int64(value):value;
  },
 })};
 const tree=await readTreePortSource(source,async fn=>fn(),p=>p,decodePortCell);
 assert.deepEqual(calls,[['items',0],['parts',3],['parts',4]]);
 const document=index=>{
  const n=tree.instances[index];return {path:n.path,type:n.is_null?'null':n.type,
   ...(n.children?{children:n.children.map(document)}:{value:n.value})};
 };
 assert.deepEqual(document(0),expected.document);
 for(const [path,type] of Object.entries(expected.schema_types)){
  const n=tree.schema.find(n=>n.path===path);assert.ok(n,path);
  assert.equal(n.is_array?'object_array':n.type,type,path);
 }
 // The production admission path must accept the same document the native reader proves.
 assert.equal(validateTreeJsonScope(await readFile(new URL('fixtures/nested-records/nested.json',base),'utf8')).verified,true);
});
