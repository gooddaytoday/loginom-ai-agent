import assert from'node:assert/strict';import{readFile,writeFile,mkdtemp,rm}from'node:fs/promises';import{close as kernelClose,openSync,closeSync}from'node:fs';import{join,resolve}from'node:path';import{tmpdir}from'node:os';
const [source,out]=process.argv.slice(2),text=await readFile(source,'utf8');const body=text.slice(text.indexOf('    async function closeCaptureWriter(file)'),text.indexOf('    function rememberCapturePersistence'));
const drain=text.slice(text.indexOf('    async function drainCaptureWriters()'),text.indexOf('    async function writeCaptureEvidence'));
const make=new Function('captureClose','captureWriters','rememberCapturePersistence','capturePersistencePrimary','capturePublications',body+drain+';return{closeCaptureWriter,drainCaptureWriters}');const rows=[];
for(const mode of ['canonical','callback-success-projection-held','callback-false-projection-held','callback-success-projection-undefined','equal-false','throw-without-callback']){
 const root=await mkdtemp(join(tmpdir(),'owned-close-'));const filePath=join(root,'receipt-temp');const fd=openSync(filePath,'wx',0o600);let calls=0,release,rejection,projectionSettled=false,kernelDone;const done=new Promise(r=>kernelDone=r);const projection=new Promise((r,j)=>{release=()=>{projectionSettled=true;mode==='callback-success-projection-undefined'?j(undefined):mode==='equal-false'?j(false):r()}});
 const file={fd,closeComplete:false},writers=new Set([file]),primary={value:false};
 const captureClose=(number,callback)=>{calls++;if(mode==='throw-without-callback')throw false;kernelClose(number,error=>{assert.equal(error,null);callback(['callback-false-projection-held','equal-false'].includes(mode)?false:null);kernelDone()});return mode==='canonical'?undefined:projection};
 const api=make(captureClose,writers,()=>{},primary,new Map());let settled=false,raw;const result=api.closeCaptureWriter(file).then(()=>{settled=true},v=>{settled=true;raw=v});
 try{
  if(mode==='throw-without-callback'){await result;assert.equal(raw,false);assert.equal(file.closePending,true);assert.equal(file.closeComplete,false);await assert.rejects(api.drainCaptureWriters(),v=>v===false);assert.equal(writers.size,1);assert.equal(calls,1);closeSync(fd);}
  else{
   await done;await new Promise(r=>setImmediate(r));
   if(mode==='canonical'){await result;assert.equal(file.closeComplete,true);await api.drainCaptureWriters();assert.equal(writers.size,0)}
   else{
    assert.equal(projectionSettled,false);assert.equal(file.closeComplete,false);assert.equal(file.closePending,true);await assert.rejects(api.drainCaptureWriters(),v=>v===false);assert.equal(writers.size,1);assert.equal(calls,1);release();await result;await file.closeSettlement;
    if(mode==='callback-success-projection-held'){assert.equal(file.closeComplete,true);await api.drainCaptureWriters();assert.equal(writers.size,0);await api.closeCaptureWriter(file);assert.equal(calls,1)}
    else{assert.equal(file.closeComplete,false);assert.equal(file.closePending,false);assert.equal(file.closeFailure.value,mode==='callback-success-projection-undefined'?undefined:false);if(mode==='equal-false'){assert.equal(file.closeSecondary.value,false);assert.notEqual(file.closeFailure,file.closeSecondary)}await assert.rejects(api.drainCaptureWriters(),v=>v===false);assert.equal(writers.size,1)}
   }
  }
  rows.push({mode,pass:true,calls,closeComplete:file.closeComplete,closePending:file.closePending,writerHeld:writers.has(file),primaryPresent:!!file.closeFailure,secondaryPresent:!!file.closeSecondary});
 }finally{await rm(root,{recursive:true,force:true})}
}
await writeFile(out,JSON.stringify({pass:rows.length,rows,limits:'Literal production close/drain extraction. Real kernel FS/close; retained file, callback-falsy/held projection/metadata are named conformance operands. Not genuine consumer/native/ACK/cleanup proof.'},null,2));
