import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const text=await readFile(process.env.BRIDGE_ENTRY??new URL('../client/lib/bridge.mjs',import.meta.url),'utf8');
const body=text.slice(text.indexOf('    async function closeCaptureWriter('),text.indexOf('    async function persistCapture('));
const at=text.indexOf('function shutdownRejection(');
const rejection=text.slice(at,text.indexOf('\n}',at)+2);

// Address only the changed no-operation removal. Genuine fs callbacks and FDs;
// session/guard inputs are doubles. No native/helper/whole-host ACK claim.
for(const mode of ['guard-no-dispatch','pending-original-open'])test('writer removal boundary '+mode,async()=>{
  const directory=await mkdtemp(join(tmpdir(),'generic-writer-boundary-'));
  const owned=new Set();let opens=0,deliver,signal;
  const ready=new Promise(resolve=>signal=resolve);
  const primary=mode==='guard-no-dispatch'?Error('guard refused',{cause:0}):0;
  const gate={allow:mode!=='guard-no-dispatch'};
  let hold=mode==='pending-original-open';
  const open=(path,flags,permissions,callback)=>{
    opens++;const withheld=hold;hold=false;
    fs.open(path,flags,permissions,(error,fd)=>{
      if(!error)owned.add(fd);
      if(withheld){deliver=()=>callback(error,fd);signal()}else callback(error,fd);
    });
    if(withheld)throw primary;
  };
  const close=(fd,callback)=>fs.close(fd,error=>{if(!error)owned.delete(fd);callback(error)});
  const ctx={session:{directory,metadata:{}},Error,Promise,Set,join,
    captureIOAssert:()=>{if(!gate.allow)throw primary},captureOpen:open,
    captureWrite:fs.writeFile,captureSync:fs.fsync,captureClose:close};
  const writer=vm.runInNewContext(`let capturePersistencePrimary;const capturePersistenceFailures=[],captureWriters=new Set();${rejection}\n${body}\n({write:writeCaptureEvidence,inspect:()=>({writers:[...captureWriters],primary:capturePersistencePrimary})})`,ctx);
  try{
    await assert.rejects(writer.write('capture.json','original bytes\n'),value=>value===primary);
    if(mode==='guard-no-dispatch'){
      assert.equal(opens,0);assert.equal(writer.inspect().writers.length,0);gate.allow=true;
    }else{
      await ready;const held=writer.inspect().writers[0];
      assert.equal(writer.inspect().writers.length,1);assert.equal(held.fd,undefined);
      assert.equal(held.io.pending,true);assert.equal(owned.size,1);
      await assert.rejects(writer.write('capture.json','original bytes\n'),value=>value===primary);
      assert.equal(opens,1,'no replacement open while original callback is pending');
      deliver();deliver=undefined;await Promise.resolve();
    }
    await writer.write('capture.json','original bytes\n');
    assert.equal(writer.inspect().writers.length,0);assert.equal(owned.size,0);
    assert.equal(writer.inspect().primary.value,primary);
    assert.equal(await readFile(join(directory,'capture.json'),'utf8'),'original bytes\n');
    console.log(JSON.stringify({mode,opens,pendingRetained:mode==='pending-original-open',writers:0,ownedFDs:0,firstCauseRetained:writer.inspect().primary.value===primary}));
  }finally{
    if(deliver){deliver();await Promise.resolve()}
    for(const fd of owned)await new Promise(resolve=>fs.close(fd,()=>resolve()));
    await rm(directory,{recursive:true,force:true});
  }
});
