import test from 'node:test';
import assert from 'node:assert/strict';
import {decodePortCell,readTreePortSource} from '../lib/node-port-output.mjs';
import {compactNodeResult} from '../lib/user-results.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {nodeTreeOutputPortSchema} from '../lib/node-result-schema.mjs';

function fixture({count=4,depth=0,precision=false,duplicate=false}={}){
 const released=[],nodes=[];
 const node=(name,type,children=[],array=false)=>{
  const index=nodes.length,def={index,name,type,children,array,
   get_Name:async()=>name,get_DisplayName:async()=>name,get_IsContainer:async()=>children.length>0,
   get_IsArray:async()=>array,get_DataType:async()=>type,get_SubNodes:async()=>({get_Count:async()=>children.length,getItem:async i=>children[i],dispose:async()=>released.push('children:'+index)}),
   dispose:async()=>released.push(index)};
  nodes.push(def);return def;
 };
 const id=node('id',4),flag=node('active',1),sku=node('sku',5),qty=node('qty',4),price=node('price',3),note=node('note',5);
 if(duplicate)note.get_Name=async()=> 'sku';
 const items=node('items',0,[sku,qty,price,note],true);
 let root=node('Root',0,[id,flag,items]);
 for(let i=0;i<depth;i++)root=node('Root',0,[root]);
 class Int64{toString(){return '9007199254740993';}}
 const reader={GetRowCount:async()=>1,GetContainerExists:async()=>true,
  GetRowRange:async(index,parent,start,size)=>{assert.equal(parent,0);start.$=0;size.$=count;},
  AsVariant:async(index,row)=>{
   const name=reader.definitions[index].name;
   if(name==='id')return precision?9007199254740992:new Int64();
   if(name==='active')return false;
   if(name==='sku')return ['A','B','C','D'][row];
   if(name==='qty')return [2,0,3,1][row];
   if(name==='price')return [1.25,.5,2,.5][row];
   return [null,'','x',undefined][row];
  },dispose:async()=>released.push('reader')};
 const source={get_RootNodeDef:async()=>root,GetReader:async definitions=>{reader.definitions=definitions;return reader;}};
 const owned=[],call=async fn=>fn(),track=p=>{owned.push(p);return p;};
 return {source,call,track,owned,released};
}
async function read(options){const f=fixture(options);return readTreePortSource(f.source,f.call,f.track,decodePortCell);}
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
