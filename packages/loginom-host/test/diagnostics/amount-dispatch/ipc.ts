import assert from'node:assert/strict';import{mkdtemp}from'node:fs/promises';import{tmpdir}from'node:os';import{join,resolve}from'node:path';import{supervise}from'../../../src/supervisor';
const rows:any[]=[];
for(const mode of ['canonical','abort-false','abort-Error-cause0','foreign-control']){
 const controller=new AbortController(),deadline=Date.now()+10000,stateDir=await mkdtemp(join(tmpdir(),'amount-dispatch-ipc-'));const original=new Error('original',{cause:0});let primary:any;
 const startup:any={signal:controller.signal,deadline,requestId:'startup-original',authorization:'a'.repeat(64),harness:'amount-import-type-v1',operation:'original-op',request:'original-request',phase:'capture',binding:{original:true},guard(){},reject:(v:any)=>v,receive:(v:any)=>{primary??={value:v};return primary.value},retain(){}};
 const runtime=await supervise({node:'/home/user/.cache/loginom-bootstrap/node/node-v24.19.0-linux-x64/bin/node',entry:resolve('grouping-dispatch/packages/loginom-host/test/fixtures/amount-dispatch-child.mjs'),resources:resolve('grouping-dispatch/packages/loginom-runtime'),stateDir,generation:1,chat:'chat',connection:{generation:1}as any,headless:true,environment:process.env,endpoint:'labelled',actionManifestUri:'labelled',actionManifestSha256:'a'.repeat(64)}as any,startup);
 try{
  if(mode==='foreign-control')await assert.rejects(runtime.request('acceptance.prepare',undefined,1,{signal:new AbortController().signal,deadline}),/HANDSHAKE_INVALID/);
  else{
   let settled=false;const work=runtime.request('acceptance.prepare',undefined,1,{signal:controller.signal,deadline}).then(v=>{settled=true;return {v}},v=>{settled=true;return {error:{v}}});
   if(mode!=='canonical'){controller.abort(mode==='abort-false'?false:original);await new Promise(r=>setImmediate(r));assert.equal(settled,false,'hold original pending peer before terminal reply')}
   const result:any=await work;if(mode==='canonical')assert.equal(result.v.preparationComplete,true);else assert.equal(result.error.v,mode==='abort-false'?false:original);
  }
  rows.push({mode,pass:true,realChildIPC:true,originalDeadline:true});
 }finally{await runtime.close();}
}
console.log(JSON.stringify({pass:rows.length,rows,limits:'Real production supervisor/fork/Node IPC/controls with labelled managed peer. Not original SDK/native/browser/cleanup/factory authority.'}));
