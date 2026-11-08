import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readQualityModa} from '../lib/quality-moda.mjs';
import {decodeVariantFrame} from '../lib/variant-native-decode.mjs';
import {nativeCellSchema} from '../lib/variant-native-schema.mjs';
import {QUALITY_SUMMARY} from '../lib/quality-output.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';

function fixture(){
 const document={},source={$:{$I:116,$OW:0,$O:10}},node={FIconCls:'bg-vendor-icon-quality'};
 const ports=[0,1,2,3,4].map(()=>({parent:node,FSubType:1}));node.FPorts=[{}, {FCollection:ports}];
 let id=0,requests=0,released=0,checks=0;
 const frame=new Uint8Array(60),view=new DataView(frame.buffer);view.setInt16(12,5,true);view.setFloat64(14,2.5,true);
 source.$S={$M:{GetDynamicData:()=>{const messageId=++id;return {set_StaticDataSize(){},InitializeMethodCallMessage(owner,object,method){assert.deepEqual([owner,object,method],[0,10,321]);},WriteParameter(offset,row){assert.equal(offset,0);assert.ok(row<50);},WriteParameter$a(offset,column){assert.deepEqual([offset,column],[8,8]);},get_MessageID:()=>messageId,Release(){released++;}};}},
  DispatchMessageAsync(request,exceptions){requests++;assert.equal(exceptions,false);return {continueWith:callback=>callback({getAwaitedResult:()=>({$FData:frame,$FDataSize:frame.length,set_StaticDataSize(){},get_MessageType:()=>1,get_MessageID:()=>request.get_MessageID(),Release(){released++;}})})};}};
 const context=vm.createContext({document,Uint8Array,DataView,TextEncoder,TextDecoder,setTimeout,clearTimeout,
  __loginomDockCollapseRuntimeV1:{document,binding_id:'quality-test',check:s=>{assert.equal(s,source.$S);checks++;}}});
 const args={source,node,port:ports[4],portIndex:4,rowCount:2,rows:2,schema:QUALITY_SUMMARY.map((f,index)=>({...f,index})),bindingId:'quality-test',deadline:Date.now()+10000,stable:()=>{}};
 return {args,frame,context,stats:()=>({requests,released,checks}),run:()=>vm.runInContext('('+readQualityModa.toString()+')',context)(args,decodeVariantFrame)};
}
test('native Quality reads only Moda with fixed321 and emits schema-valid exact binary64 cells',async()=>{
 const f=fixture(),cells=await f.run(),validate=new AjvJsonSchemaValidator().getValidator(nativeCellSchema);
 assert.equal(cells.length,2);assert.equal(cells[0].cell_type,'real');assert.equal(cells[0].value,'2.5');assert.equal(cells[0].native.bytes_le,'0000000000000440');
 for(const cell of cells)assert.equal(validate(cell).valid,true,JSON.stringify(validate(cell)));
 assert.equal(f.stats().requests,2);assert.equal(f.stats().released,4);
 const state=f.context.__loginomDockCollapseNativeV1;
 assert.equal(state.last.published,true);assert.equal(state.last.pending,0);assert.equal(state.poisoned,false);
});
test('Quality native capability refuses other nodes, ports, schemas and bounds before dispatch',async()=>{
 for(const fault of ['node','port','schema','rows','binding']){
  const f=fixture();
  if(fault==='node')f.args.node.FIconCls='bg-vendor-icon-columnflipping';
  if(fault==='port')f.args.portIndex=0;
  if(fault==='schema')f.args.schema[8].name='Other';
  if(fault==='rows')f.args.rowCount=51;
  if(fault==='binding')f.args.bindingId='foreign';
  await assert.rejects(f.run());assert.equal(f.stats().requests,0);
 }
});
test('native subtype remains string or NULL and unknown/interface tags refuse',async()=>{
 for(const tag of [1,8,9]){
  const f=fixture(),view=new DataView(f.frame.buffer);view.setInt16(12,tag,true);
  if(tag===8)view.setInt32(22,0,true);
  if(tag===9){await assert.rejects(f.run(),/unknown\/interface tag 9 frame \d+ (?:zero|data)-slot/);assert.equal(f.context.__loginomDockCollapseNativeV1.poisoned,true);}
  else{const cells=await f.run();assert.equal(cells[0].cell_type,tag===1?'null':'string');assert.equal(cells[0].value,tag===1?null:'');}
 }
});
test('a changed owner after a response never publishes native values and releases both frames',async()=>{
 const f=fixture();let checks=0;f.args.stable=()=>{if(++checks===3)throw Error('owner changed');};
 await assert.rejects(f.run(),/owner/);assert.equal(f.stats().requests,1);assert.equal(f.stats().released,2);
 assert.equal(f.context.__loginomDockCollapseNativeV1.last.published,false);
});
