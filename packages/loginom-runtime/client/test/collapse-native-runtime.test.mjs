import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {bindLoadedNativeRuntime,collectNativeRuntime,verifyLoadedNativeRuntime} from '../lib/collapse-native-runtime.mjs';
import {nativeRuntimePins} from '../lib/collapse-native-runtime-pins.mjs';
// Load the frozen observation as test data, never as operational instructions.
const sources=JSON.parse(fs.readFileSync(new URL('../../tools/loginom-acceptance/collapse/review-fix/loaded-runtime-sources.json',import.meta.url)));
const proof={binding_id:'binding_id',document_id:'doc',sources:sources.sources,constants:sources.constants};
test('actual loaded function hashes and constants must match every pinned implementation',()=>{
 assert.equal(Object.keys(verifyLoadedNativeRuntime(proof,proof).functions).length,53);
 for(const change of [p=>p.sources['session.DispatchMessageAsync']='function changed(){}',p=>delete p.sources['transport.InternalSend'],p=>p.constants.$FMethodIDOffset=32,p=>p.document_id='foreign',p=>p.binding_id='other']){const p=structuredClone(proof);change(p);assert.throws(()=>verifyLoadedNativeRuntime(p,proof));}
});
function fixture(){
 const s={$FDisposed:false,$FPendingDisconnect:false,$FTransportStatus:0,$M:{},$T:{FFinished:false,FDisconnected:false,$FSocket:{readyState:1}}};
 const message={};const globals={BitConverter:{},ss:{Task:function(){},TaskCompletionSource:function(){}},rpc:{TBGMessageDynamicData:function(){}},document:{},location:{origin:'http://test'},bg:{app:{Version:'7.4.2'}}};
 globals.rpc.TBGMessageDynamicData.prototype=message;
 for(const [key,source] of Object.entries(sources.sources)){const [group,name]=key.split('.');const o={session:s,manager:s.$M,message,class:globals.rpc.TBGMessageDynamicData,transport:s.$T,bit:globals.BitConverter,task:globals.ss.Task.prototype,completion:globals.ss.TaskCompletionSource.prototype}[group];o[name]=vm.runInNewContext('('+source+')');}
 Object.assign(globals.rpc.TBGMessageDynamicData,sources.constants);
 globals.__loginomDockPreparationV1={document:globals.document,id:'doc'};
 globals.bg.app.Application={FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:{FDiagram:{FNodes:{FCollection:[{FGuid:'node',data:{$S:s}}]}}}}})}}}}};
 const ctx=vm.createContext(globals);const page={evaluate:(fn,arg)=>{ctx.arg=arg;return vm.runInContext('('+fn.toString()+')(arg)',ctx);}};
 return {page,ctx,s,message};
}
test('document guard binds actual session, socket, functions and message methods throughout a read',async()=>{
 const f=fixture(),a={binding_id:'binding_id',document_id:'doc',origin:'http://test',node_id:'node'};
 const p=await bindLoadedNativeRuntime(f.page,a);verifyLoadedNativeRuntime(p,a);
 const g=f.ctx.__loginomDockCollapseRuntimeV1;assert.equal(g.check(f.s),true);
 const old=f.s.DispatchMessageAsync;f.s.DispatchMessageAsync=()=>{};assert.throws(()=>g.check(f.s),/implementation/);f.s.DispatchMessageAsync=old;
 assert.throws(()=>g.check(f.s,{...f.message,WriteParameter:()=>{}}),/message implementation/);
 f.s.$T.$FSocket.readyState=3;assert.throws(()=>g.check(f.s),/transport/);f.s.$T.$FSocket.readyState=1;
 f.s.$T.$FSocket={readyState:1};assert.throws(()=>g.check(f.s),/objects/);
});

test('compact build is detected from the loaded runtime: all 53 canonical keys bind to its own slots and actual socket',()=>{
 const f=fixture();f.ctx.session=f.s;
 const read=()=>vm.runInContext('('+collectNativeRuntime.toString()+')(session)',f.ctx);
 const before=read(),move=(object,key,slot)=>{object[slot]=object[key];delete object[key];};
 assert.equal(before.profile,'canonical');assert.equal(before.objects[3],f.s.$T.$FSocket);
 move(f.s,'$DoDispatchMessageAsync','$2');move(f.s,'$GetNextMessageID','$8');
 assert.throws(read,/unknown runtime build/);
 move(f.message,'get_$ParametersOffset','$6');move(f.message,'$DoSetDataSize','$1');move(f.message,'$GrowData','$3');
 move(f.s.$T,'$SendMessage','$4');move(f.s.$T,'$InvalidateResponseAwaiters','$1');move(f.s.$T,'$CancelResponseAwaiters','$0');
 move(f.s.$T,'$FSocket','$a');
 const klass=f.ctx.rpc.TBGMessageDynamicData;
 for(const [key,slot] of [['$FSignatureOffset','$m'],['$FMessageTypeOffset','$f'],['$FMessageFormatVersionOffset','$d'],['$FMessageIDOffset','$e'],['$FObjectOwnerIDOffset','$i'],['$FObjectIDOffset','$h'],['$FMethodIDOffset','$g']])move(klass,key,slot);
 const observed=read();
 assert.equal(observed.profile,'compact');
 assert.deepEqual({...observed.slots,message:{...observed.slots.message}},{disposed:'$r',pendingDisconnect:'$y',transportStatus:'$F',socket:'$a',data:'$7',dataSize:'$8',message:{get_$ParametersOffset:'$6',$DoSetDataSize:'$1',$GrowData:'$3'}});
 assert.equal(Object.keys(observed.functions).length,53);
 for(const [key,fn] of Object.entries(before.functions))assert.equal(observed.functions[key],fn,key);
 assert.deepEqual(observed.constants,before.constants);assert.equal(observed.objects[3],f.s.$T.$a);
 const both=()=>{Object.assign(klass,before.constants);f.s.$DoDispatchMessageAsync=f.s.$2;f.message.$GrowData=f.message.$3;};
 both();assert.throws(read,/unknown runtime build/);
 for(const k of Object.keys(before.constants).slice(1))delete klass[k];delete f.s.$DoDispatchMessageAsync;delete f.message.$GrowData;
 assert.equal(read().profile,'compact');
 delete f.s.$T.$4;assert.throws(read,/missing transport\.\$4$/);
});
