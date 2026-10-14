import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {openSync,closeSync,close as kernelClose} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const [path,out]=process.argv.slice(2),text=await readFile(path,'utf8');
const a=text.indexOf('    async function closeCaptureWriter(file)'),b=text.indexOf('    function rememberCapturePersistence'),c=text.indexOf('    async function drainCaptureWriters()'),d=text.indexOf('    async function writeCaptureEvidence');
assert(a>=0&&b>a&&c>b&&d>c);const make=new Function('captureClose','captureWriters','rememberCapturePersistence','capturePersistencePrimary','capturePublications',text.slice(a,b)+text.slice(c,d)+';return {closeCaptureWriter,drainCaptureWriters}');
const rows=[];
for(const mode of ['projection-first-undefined-late-false','callback-Error-cause-false','equal-same-Error','callback-success-throw-undefined']){
 const root=await mkdtemp(join(tmpdir(),'amount39-order-')),fd=openSync(join(root,'own-temp'),'wx',0o600),error=new Error('original close refusal',{cause:false});let calls=0,release,callbackDone,kernelDone;
 const kernel=new Promise(r=>kernelDone=r),callback=new Promise(r=>callbackDone=r),projection=new Promise((r,j)=>release=()=>mode==='equal-same-Error'?j(error):mode==='callback-Error-cause-false'?j(undefined):r());
 const file={fd,closeComplete:false},writers=new Set([file]);let raw,settled=false;const primary={value:mode==='projection-first-undefined-late-false'||mode==='callback-success-throw-undefined'?undefined:error};
 const captureClose=(number,done)=>{
  calls++;
  if(mode==='callback-success-throw-undefined'){closeSync(number);kernelDone();done(null);callbackDone();throw undefined}
  kernelClose(number,fault=>{assert.equal(fault,null);kernelDone();if(mode!=='projection-first-undefined-late-false'){done(error);callbackDone()}else release=()=>{done(false);callbackDone()}});
  return mode==='projection-first-undefined-late-false'?Promise.reject(undefined):projection;
 };
 const api=make(captureClose,writers,()=>{},primary,new Map()),pending=api.closeCaptureWriter(file).catch(value=>{raw=value;settled=true});
 try{
  await kernel;await new Promise(r=>setImmediate(r));
  if(mode==='callback-success-throw-undefined'){
   await pending;await file.closeSettlement;assert.equal(raw,undefined);assert(file.closeFailure);assert.equal(file.closeFailure.value,undefined);assert.equal(file.closePending,false);assert.equal(file.closeComplete,false);
  }else{
   await pending;assert.equal(settled,true);assert.equal(raw,mode==='projection-first-undefined-late-false'?undefined:error);assert.equal(file.closePending,true);assert.equal(file.closeComplete,false);
   assert(writers.has(file));await assert.rejects(api.drainCaptureWriters(),value=>value===raw);assert.equal(calls,1);
   release();await callback;await file.closeSettlement;assert.equal(file.closePending,false);assert.equal(file.closeComplete,false);
   assert.notEqual(file.closeFailure,file.closeSecondary);assert.equal(file.closeFailure.value,raw);assert.equal(file.closeSecondary.value,mode==='projection-first-undefined-late-false'?false:mode==='equal-same-Error'?error:undefined);
   if(mode!=='projection-first-undefined-late-false')assert.equal(raw.cause,false);
  }
  await assert.rejects(api.drainCaptureWriters(),value=>value===primary.value);assert(writers.has(file));assert.equal(calls,1);
  rows.push({mode,pass:true,rawIdentity:true,primaryPresent:!!file.closeFailure,secondaryPresent:!!file.closeSecondary,writerHeld:true,closeCalls:calls,callbackAndProjectionSettled:true});
 }finally{await rm(root,{recursive:true,force:true})}
}
const result={pass:rows.length,fail:0,rows,limits:'Literal defining close/drain functions. Real own kernel FD/close; callback timing, projection failures, writer object and persistence-primary are named conformance operands. No full bridge/native cleanup/provider/ACK proof.'};await writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
