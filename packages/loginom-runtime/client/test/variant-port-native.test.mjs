import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {adaptCell,temporalProfile} from '../lib/variant-native-values.mjs';
import {decodeVariantFrame} from '../lib/variant-native-decode.mjs';
import {createNativeVariantReader} from '../lib/variant-native-read.mjs';
import {readNativeVariableCells} from '../lib/node-port-output.mjs';
import {createHash,webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {nativeCellSchema,nativeVariableCellSchema} from '../lib/variant-native-schema.mjs';

// Logical bytes observed on mas3, Loginom 7.4.2, VarToData vdtrRows.
// Transport padding and unused scalar slots are deliberately omitted.
const observedRows=[
 [20,0,7,0,0,0,0,0,0,0],
 [11,0,0,0,0,0,0,0,0,0],
 [8,0,0,0,0,0,0,0,0,0,12,0,0,0,233,253,208,159,209,128,208,184,208,178,208,181,209,130],
 [7,0,74,238,58,23,4,121,230,64],
 [1,0,0,0,0,0,0,0,0,0],
 [5,0,0,0,0,0,0,0,244,63],
 [8,0,0,0,0,0,0,0,0,0,0,0,0,0],
 [20,0,0,0,0,0,0,0,0,0],
].map((payload,row)=>({row,column:2,tag:payload[0],payload,frame_size:60}));

test('observed eight Variant subtypes retain NULL, empty, zero and FALSE',()=>{
 const cells=observedRows.map(c=>adaptCell(c,{type:'variant'},{dateProfile:temporalProfile}));
 assert.deepEqual(cells.map(c=>c.cell_type),['integer','boolean','string','datetime','null','real','string','integer']);
 assert.deepEqual(cells.map(c=>c.is_null),[false,false,false,false,true,false,false,false]);
 assert.deepEqual(cells.map(c=>c.value),['7',false,'Привет','4aee3a170479e640',null,'1.25','','0']);
});

test('civil datetime is additive; the legacy scalar envelope remains unchanged',()=>{
 const old=adaptCell(observedRows[3],{type:'variant'},{dateProfile:temporalProfile});
 const cell=adaptCell(observedRows[3],{type:'variant'},{dateProfile:temporalProfile,civilTime:{value:'2026-01-02T03:04:05.006',timezone:'UTC'}});
 assert.equal(cell.value,'2026-01-02T03:04:05.006');
 assert.equal(cell.timezone,'UTC');
 assert.equal(cell.decimal,'46024.12783571759');
 assert.equal(cell.native.bytes_le,old.native.bytes_le);
 assert.equal(cell.native.semantic_scope,'browser_civil_time');
 assert.equal(old.value,'4aee3a170479e640');
 assert.equal(old.native.semantic_scope,'native_serial_only');
 const validate=new AjvJsonSchemaValidator().getValidator(nativeCellSchema);
 assert.equal(validate(cell).valid,true);
 assert.equal(validate(old).valid,true);
 for(const bad of [{...cell,timezone:''},{...cell,value:'2026-01-02'}, {...cell,native:{...cell.native,civil_time_verified:false}}])assert.equal(validate(bad).valid,false);
});

function transportFixture({deferred=false,foreign=false,changed=false,unpinned=false,variableValue=false,treeValue=false}={}){
 const environment={crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,DataView,setTimeout,clearTimeout,decode:decodeVariantFrame,
  frames:observedRows,pins:{},deferred,foreign,changed,unpinned,variableValue,treeValue};
 const context=vm.createContext(environment);
 // Exact observed frontend implementations, pinned by the production reader.
 vm.runInContext(`Date.FromOADate=function (d) {
        if (isNaN(d))
            return new Date(d);
        return Date.AddBias(new Date(Math.round((d - 25569) * 86400000)));
    };
 Date.AddBias=function (noBiasDate) {
        var Y = noBiasDate.getUTCFullYear(), M = noBiasDate.getUTCMonth(), D = noBiasDate.getUTCDate();
        var result = new Date(Y, M, D, noBiasDate.getUTCHours(), noBiasDate.getUTCMinutes(), noBiasDate.getUTCSeconds(), noBiasDate.getUTCMilliseconds());
        if (Y >= 0 && Y < 100)
            result.setFullYear(Y, M, D);
        return result;
    };
 var counters={requests:0,releasedRequests:0,releasedResponses:0},next;
 var source={$:{$I:treeValue?166:variableValue?427:116,$OW:0,$O:9},$S:{$FDisposed:false,$FPendingDisconnect:false,$FTransportStatus:0,$T:{FFinished:false,FDisconnected:false,$FSocket:{readyState:1}},$M:{GetDynamicData(){
  counters.requests++;return {row:0,column:0,set_StaticDataSize(size){if(size!==(variableValue?20:32))throw Error('variable parameter size');},InitializeMethodCallMessage(owner,object,method,flag){if(owner!==0||object!==9||method!==(treeValue?7230:variableValue?1141:321)||flag!==0)throw Error('wrong method');},
   WriteParameter(offset,row){if(offset!==(treeValue?4:0))throw Error('row offset');this.row=row;},WriteParameter$a(offset,column){if(offset!==(treeValue?0:8))throw Error('column offset');this.column=column;},get_MessageID(){return 101;},Release(){counters.releasedRequests++;}};
 }},DispatchMessageAsync(request,exceptions){
  if(exceptions!==false)throw Error('exception unmarshalling');
  return {continueWith(callback){
   const payload=frames[request.row].payload,bytes=new Uint8Array(60);bytes.set(payload,12);
   const complete=()=>callback({getAwaitedResult(){return {$FData:bytes,$FDataSize:60,get_MessageType(){return 1;},get_MessageID(){return foreign?999:101;},set_StaticDataSize(){},Release(){counters.releasedResponses++;}};}});
   if(deferred)next=complete;else complete();
  }};
 }}};
 var bg={rpc:{TIBGDataTreeReaderRpcCachedInternal_Proxy:{GetAsVariant:function(proxy,index,row){}}}};
 source.$FHelper={FBaseProxy:source};
 var treePins={get_as_variant:''};
 var collect=session=>({functions:{send:session.DispatchMessageAsync},constants:{},objects:[session,session.$M]});
 var stable=()=>{if(changed&&counters.requests)throw Error('binding changed');};
 var make=${createNativeVariantReader.toString()};`,context);
 environment.pins={constants:{},functions:{send:createHash('sha256').update(vm.runInContext('source.$S.DispatchMessageAsync.toString()',context)).digest('hex')}};
 vm.runInContext('treePins.get_as_variant='+JSON.stringify(createHash('sha256').update(vm.runInContext('bg.rpc.TIBGDataTreeReaderRpcCachedInternal_Proxy.GetAsVariant.toString()',context)).digest('hex')),context);
 if(unpinned)environment.pins.functions.send='bad';
 return {context,environment,run:(deadline=Date.now()+5000)=>vm.runInContext(`make(source,{deadline:${deadline},stable,variableValue,treeValue},decode,collect,pins,treePins)`,context)};
}

test('observed W1 interface427/method1141 uses no row/column parameters and retains int32 subtype',async()=>{
 const f=transportFixture({variableValue:true});
 f.environment.frames=[{tag:3,payload:[3,0,2,0,0,0,0,0,1,0],frame_size:60}];
 const reader=await f.run(),raw=await reader.read(0,0);
 const cell=adaptCell(raw,{type:'variant'},{variableValue:true});
 assert.equal(cell.value,'2');assert.equal(cell.cell_type,'integer');
 assert.deepEqual(cell.native,{tag:3,encoding:'signed-int32-le',bytes_le:'02000000',bits:32});
 assert.equal(new AjvJsonSchemaValidator().getValidator(nativeVariableCellSchema)(cell).valid,true);
 assert.equal(new AjvJsonSchemaValidator().getValidator(nativeCellSchema)(cell).valid,false);
 assert.throws(()=>adaptCell(raw,{type:'variant'}),/unsupported native tag/);
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(counters)',f.context)),{requests:1,releasedRequests:1,releasedResponses:1});
});

for(const fault of ['foreign','changed','unpinned'])test('fixed1141 retains the native binding/implementation guard: '+fault,async()=>{
 const f=transportFixture({variableValue:true,[fault]:true});
 await assert.rejects(async()=>{const reader=await f.run();await reader.read(0,0);});
 const counters=JSON.parse(vm.runInContext('JSON.stringify(counters)',f.context));
 assert.equal(counters.releasedRequests,counters.requests);
});

for(const fault of ['none','metadata','count','implementation','owner','port-owner','release'])test('W1 native chain binds metadata and releases proxies without partial publication: '+fault,async()=>{
 const f=transportFixture({variableValue:true,changed:fault==='owner'});
 f.environment.frames=[{payload:[3,0,2,0,0,0,0,0,1,0]}];f.environment.fault=fault;
 vm.runInContext(`
 var disposed=0;
 var proxy=(id,object,extra)=>Object.assign({$S:source.$S,$:{$I:id,$OW:0,$O:object},async dispose(){disposed++;if(fault==='release')throw Error('release failed');}},extra);
 var value=source;value.get_AsVariant=function(){};value.dispose=async()=>{disposed++;};
 var item=proxy(511,4,{async get_ID(){return 7;},async get_Index(){return 0;},async get_Name(){return fault==='metadata'?'other':'V';},async get_DisplayName(){return 'Value';},async get_DataType(){return 6;},async get_Value(){return value;}});
 var variables=proxy(541,3,{async get_Count(){if(fault==='port-owner')port.data.$.$O++;return fault==='count'?2:1;},async getItem(){return item;}});
 var output=proxy(0,2,{async QueryInterface(){return variables;}});
 var port={data:proxy(1081,1,{async get_Output(){return output;}})};
 var bg={IBGVariables:{}};
 var metadata={complete:true,count:1,variables:[{id:7,index:0,name:'V',label:'Value',type:'variant'}]};
 var functions={port_output:port.data.get_Output,query:output.QueryInterface,count:variables.get_Count,item:variables.getItem,value:item.get_Value,as_variant:value.get_AsVariant};
 var variablePins={};
 var runVariables=${readNativeVariableCells.toString()};
 `,f.context);
 for(const key of ['port_output','query','count','item','value','as_variant'])
  vm.runInContext(`variablePins.${key}=${JSON.stringify(createHash('sha256').update(vm.runInContext(`functions.${key}.toString()`,f.context)).digest('hex'))}`,f.context);
 if(fault==='implementation')vm.runInContext("variablePins.item='bad'",f.context);
 f.environment.capability={read:createNativeVariantReader.toString(),decode:decodeVariantFrame.toString(),adapt:adaptCell.toString(),collect:vm.runInContext('collect.toString()',f.context),pins:f.environment.pins,variablePins:vm.runInContext('variablePins',f.context)};
 const result=await vm.runInContext(`runVariables(port,metadata,{deadline:Date.now()+5000,stable},capability)`,f.context);
 if(fault==='none'){assert.equal(result.cells[0].value,'2');assert.equal(result.cells[0].native.tag,3);assert.equal(result.error,undefined);}
 else{assert.ok(result.error);assert.equal(result.cells,undefined);assert.equal(result.pending,fault==='release');}
 assert.ok(vm.runInContext('disposed',f.context)>0);
 const counts=JSON.parse(vm.runInContext('JSON.stringify(counters)',f.context));
 assert.equal(counts.releasedRequests,counts.requests);assert.equal(counts.releasedResponses,fault==='owner'?0:counts.requests);
});

test('generic fixed321 reader reads observed frames and releases every request and response',async()=>{
 const f=transportFixture(),reader=await f.run();
 for(let row=0;row<observedRows.length;row++){
  const raw=await reader.read(row,2);
  assert.equal(raw.tag,observedRows[row].tag);
  assert.deepEqual(Array.from(raw.payload),observedRows[row].payload);
  if(row===3)assert.equal(raw.civilTime.value,'2026-01-02T03:04:05.006');
 }
 assert.equal(reader.pending,0);
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(counters)',f.context)),{requests:8,releasedRequests:8,releasedResponses:8});
});
for(const mode of ['foreign','changed','unpinned'])test('generic fixed321 refuses '+mode+' without publishing a cell',async()=>{
 const f=transportFixture({[mode]:true});
 if(mode==='unpinned')await assert.rejects(f.run(),/loaded implementation changed/);
 else{const reader=await f.run();await assert.rejects(reader.read(0,2));assert.equal(reader.pending,0);}
 const counts=JSON.parse(vm.runInContext('JSON.stringify(counters)',f.context));
 assert.equal(counts.releasedRequests,counts.requests);assert.equal(counts.releasedResponses,mode==='foreign'?1:0);
});
test('generic fixed321 timeout retains native ownership until the late callback releases buffers',async()=>{
 const f=transportFixture({deferred:true}),reader=await f.run(Date.now()+100);
 await assert.rejects(reader.read(0,2),/deadline/);assert.equal(reader.pending,1);
 vm.runInContext('next()',f.context);assert.equal(reader.pending,0);
 await assert.rejects(reader.read(1,2),/retired/);
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(counters)',f.context)),{requests:1,releasedRequests:1,releasedResponses:1});
});

test('observed serial retains 006ms in UTC and Europe/Moscow',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,chromiumSandbox:true,args:['--no-proxy-server']});
 try{
  for(const timezoneId of ['UTC','Europe/Moscow']){
   const context=await browser.newContext({timezoneId});
   try{
    const page=await context.newPage();
    const civilTime=await page.evaluate(()=>{
     // Observed FromOADate + AddBias, independent of the production adapter.
     const linear=new Date(Math.round((46024.12783571759-25569)*86400000));
     const local=new Date(linear.getUTCFullYear(),linear.getUTCMonth(),linear.getUTCDate(),linear.getUTCHours(),linear.getUTCMinutes(),linear.getUTCSeconds(),linear.getUTCMilliseconds());
     const pad=(n,w=2)=>String(n).padStart(w,'0');
     return {value:pad(local.getFullYear(),4)+'-'+pad(local.getMonth()+1)+'-'+pad(local.getDate())+'T'+pad(local.getHours())+':'+pad(local.getMinutes())+':'+pad(local.getSeconds())+'.'+pad(local.getMilliseconds(),3),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
    });
    const cell=adaptCell(observedRows[3],{type:'variant'},{dateProfile:temporalProfile,civilTime});
    assert.equal(cell.value,'2026-01-02T03:04:05.006');
    assert.equal(cell.timezone,timezoneId);
    assert.equal(decodeVariantFrame([...observedRows[3].payload,...Array(38).fill(0)],60).oadate,46024.12783571759);
   }finally{await context.close();}
  }
 }finally{await browser.close();}
});

for(const fault of ['none','foreign','changed','unpinned','getter','helper','interface'])test('tree reader166 fixed7230 retains subtype and native guards: '+fault,async()=>{
 const f=transportFixture({treeValue:true,[fault]:true});
 if(fault==='getter')vm.runInContext('bg.rpc.TIBGDataTreeReaderRpcCachedInternal_Proxy.GetAsVariant=function changed(){}',f.context);
 if(fault==='helper')vm.runInContext('source.$FHelper.FBaseProxy={}',f.context);
 if(fault==='interface')vm.runInContext('source.$.$I=2178',f.context);
 if(fault!=='none'){
  await assert.rejects(async()=>{const reader=await f.run();await reader.read(0,2);});
 }else{
  const reader=await f.run();
  for(let row=0;row<observedRows.length;row++){
   const raw=await reader.read(row,2),cell=adaptCell(raw,{type:'variant'},{dateProfile:temporalProfile});
   assert.equal(raw.column,2);assert.equal(cell.cell_type,['integer','boolean','string','datetime','null','real','string','integer'][row]);
  }
 }
 const counters=JSON.parse(vm.runInContext('JSON.stringify(counters)',f.context));
 assert.equal(counters.releasedRequests,counters.requests);assert.equal(counters.releasedResponses,fault==='changed'?0:counters.requests);
});
test('tree fixed7230 rechecks getter binding across an awaited response',async()=>{
 const f=transportFixture({treeValue:true,deferred:true}),reader=await f.run(),pending=reader.read(0,2);
 const rejected=assert.rejects(pending,/getter changed/);
 vm.runInContext('bg.rpc.TIBGDataTreeReaderRpcCachedInternal_Proxy.GetAsVariant=function changed(){};next()',f.context);
 await rejected;
 assert.equal(reader.unsettled,false);
});
