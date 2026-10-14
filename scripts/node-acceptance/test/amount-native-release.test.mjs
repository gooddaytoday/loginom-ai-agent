import assert from 'node:assert/strict';import vm from 'node:vm';import{pathToFileURL}from'node:url';
const root=process.argv[2]??new URL('../../../packages/loginom-runtime',import.meta.url).pathname;
const{amountFilePhase}=await import(pathToFileURL(root+'/src/amount-file-bytes.mjs'));
let passes=0;
async function scenario(mode){
 const calls=[],doc={},nativeError=Error('read',{cause:0}),bytes=new Uint8Array([1,2,3,4]),info={get_Size(){calls.push('size');if(mode==='size-drift')connection.Session={};return Promise.resolve(mode==='size-change-after-open'&&calls.includes('open')?5:4)}};
 const stream={ReadBuffer:async b=>{calls.push('read');if(mode==='read-false'||mode==='equal-false')throw false;if(mode==='read-undefined')throw undefined;if(mode==='read-error')throw nativeError;b.set(bytes)}};
 const storage={GetFileInfo:async path=>{calls.push('info');if(mode==='info-drift')connection.Session={};return info},OpenFile:async(path,m,share)=>{calls.push('open');assert.equal(m,0);assert.equal(share,1);return stream}};
 const session={get_FileStorage:async()=>{calls.push('storage');return storage}},connection={Connected:true,UserName:'own',Session:session},map={PackageNodes:{Count:0},FServerConnection:connection};
 let releaseDone;const late=new Promise(resolve=>releaseDone=resolve);
 const transport={};session.$S=storage.$S=info.$S=stream.$S=transport;
 function disposeAsync(immediate){assert.equal(immediate,true);const handle=this;calls.push(handle===info?'info_release':'release');if(handle===stream&&mode==='early-release-throw')throw false;if(handle===stream&&mode==='pending-release')return late;if(handle===stream&&(mode==='equal-false'||mode==='repeat-release-failure'))return Promise.reject(false);return Promise.resolve(null)}
 function DoDispose(){}function nativeRelease(){}
 for(const h of [storage,info,stream]){h.disposeAsync=disposeAsync;h.$DoDispose=DoDispose;h.$_Release=nativeRelease}
 const funcs={disposeAsync:disposeAsync.toString(),DoDispose:DoDispose.toString(),nativeRelease:nativeRelease.toString(),OpenFile:storage.OpenFile.toString(),GetFileInfo:storage.GetFileInfo.toString(),ReadBuffer:stream.ReadBuffer.toString()};

 const ctx={document:doc,location:{origin:'https://app.loginom.ai'},bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:map}}}},filestorage:{},TBGFileOpenMode:{fomRead:0}},__loginomStartupV1:{document:doc,id:'owner',account:'own'},btoa:s=>Buffer.from(s,'binary').toString('base64'),Uint8Array,Error,Date};
 const fn=vm.runInNewContext('('+amountFilePhase.toString()+')',ctx),expected={bindingOwner:'host-owner',lease:'host-owner:run',generation:1,chat:'chat',id:'owner',account:'own',origin:'https://app.loginom.ai',path:'/own/accepted.lgp',operation:'original',request:'request',run:'run',deadline:Date.now()+60000},invoke=phase=>fn({expected,phase,functions:funcs});
 if(mode==='foreign'){ctx.__loginomStartupV1.id='foreign';const r=await invoke('storage');assert.equal(r.ok,false);assert.deepEqual(calls,[]);return}
 for(const phase of ['storage','info','size','info_release','open','open_info','open_size','open_info_release','read']){
  const r=await invoke(phase);
  if(!r.ok){
   if(mode==='info-drift'||mode==='size-drift'){assert(!calls.includes('open'));assert.equal(r.rejection.message,'ORIGINAL_FILE_OWNER_CHANGED')}
   else if(mode==='size-change-after-open'){assert.equal(r.rejection.message,'ORIGINAL_FILE_SIZE_CHANGED');assert(!calls.includes('read'))}
   else if(mode==='read-error')assert.equal(r.rejection.cause.value,0);
   else assert.equal(r.rejection.kind,'value');
   const close=await invoke('release');if(mode==='equal-false'){assert.equal(close.ok,false);assert.equal(close.secondaryPresent,true);assert.equal(close.rejection.value,false)}else assert.equal(close.ok,true);assert.equal(calls.filter(x=>x==='release').length,mode.includes('drift')?0:1);return;
  }
  if(phase==='storage'&&mode==='copy'){ctx.__loginomAmountFileReadV1={...ctx.__loginomAmountFileReadV1};await assert.rejects(invoke('info'),/ORIGINAL_FILE_BINDING_CHANGED/);assert.deepEqual(calls,['storage']);return}
  if(phase==='read')assert.equal(r.base64,Buffer.from(bytes).toString('base64'));
 }
 if(mode==='repeat-release-failure'||mode==='early-release-throw'){const first=await invoke('release'),repeat=await invoke('release');assert.equal(first.ok,false);assert.equal(repeat.ok,false);assert.equal(repeat.origin,'guard');assert.equal(repeat.secondaryPresent,false);assert.equal(calls.filter(x=>x==='release').length,1);return}
 if(mode==='pending-release'){
  const pending=invoke('release');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(ctx.__loginomAmountFileReadV1.busy,true);await assert.rejects(invoke('open'),/CALLBACK_PENDING/);assert.equal(calls.filter(x=>x==='release').length,1);releaseDone(null);assert.equal((await pending).ok,true);
 }else{assert.equal((await invoke('release')).ok,true);assert.equal((await invoke('release')).ok,true);assert.equal(calls.filter(x=>x==='release').length,1);await assert.rejects(invoke('storage'),/ALREADY_ATTEMPTED/)}
}
for(const mode of ['early-release-throw','repeat-release-failure','positive','foreign','copy','info-drift','read-false','read-undefined','read-error','equal-false','pending-release','size-change-after-open']){await scenario(mode);passes++;console.log('PASS',mode)}
console.log(JSON.stringify({pass:passes,fail:0,scope:'real serialized phase on labelled native/file-info/stream/proxy callback doubles; FileDownloader absent; no native bytes claim'}));
