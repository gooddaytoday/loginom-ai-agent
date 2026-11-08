import test from 'node:test';
import assert from 'node:assert/strict';
import {decodePortCell,readTreePortSource} from '../lib/node-port-output.mjs';
import {compactNodeResult} from '../lib/user-results.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {nodeTreeOutputPortSchema} from '../lib/node-result-schema.mjs';

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
test('tree_io reads every native root row in order; one row keeps the original shape',async()=>{
 const one=await read();assert.equal(Object.hasOwn(one,'root_rows'),false);assert.equal(one.instances.some(n=>Object.hasOwn(n,'root_row')),false);
 const result=await read({rows:2,count:2});
 assert.equal(result.root_rows,2);assert.equal(result.node_count,28);
 const roots=result.instances.filter(n=>n.parent===null);
 assert.deepEqual(roots.map(n=>[n.path,n.root_row]),[['',0],['',1]]);
 const under=(root,path)=>{const seen=[];const walk=i=>{const n=result.instances[i];if(n.path===path)seen.push(n.value);for(const c of n.children??[])walk(c);};walk(root.index);return seen;};
 assert.deepEqual(under(roots[0],'/id'),['7']);assert.deepEqual(under(roots[1],'/id'),['8']);
 assert.deepEqual(under(roots[0],'/items/0/sku'),['A']);assert.deepEqual(under(roots[1],'/items/0/sku'),['C']);assert.deepEqual(under(roots[1],'/items/1/qty'),['1']);
 const validate=new AjvJsonSchemaValidator().getValidator(nodeTreeOutputPortSchema);
 assert.equal(validate({port:0,port_guid:'port',port_kind:'tree',fresh:true,execution_id:'exec',freshness_basis:'completed_execution_port_source',tree:result,sample_complete:true}).valid,true);
});
test('tree_io keeps refusing an empty tree and the 256 instance bound across root rows',async()=>{
 await assert.rejects(read({rows:0}),/tree_document_count/);
 await assert.rejects(read({rows:52,count:4}),/tree_instance_limit/);
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
