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
