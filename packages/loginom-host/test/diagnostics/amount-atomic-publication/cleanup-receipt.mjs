import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
const [modulePath,rawOut,phase]=process.argv.slice(2),out=resolve(rawOut);await mkdir(out,{recursive:true});
const text=await readFile(modulePath,'utf8');const start=text.indexOf('    async function writeCleanupReceipt('),end=text.indexOf('    function closeBridge()',start);assert(start>=0&&end>start);const helper=text.slice(start,end),rows=[];
for(const mode of ['canonical','original-write-error']){
 const directory=join(out,mode);await mkdir(directory,{recursive:true});const receipt=Object.freeze({kind:'offline-storage-receipt',native:false}),metadata={sessionId:'A'},trace=[],original=Error('original write rejection',{cause:false});
 const sandbox={session:{directory,metadata},confirmedCleanup:receipt,cleanupWriters:new Set(),cleanupPublication:undefined,cleanupPersistencePrimary:undefined,cleanupPersistenceFailures:[],cleanupReceiptWritten:false,cleanupEvidenceBinding:undefined,lstat:fs.promises.lstat,join,randomUUID,constants:fs.constants,
 receiptOpen:(...args)=>{trace.push('open');return fs.open(...args)},receiptWrite:(fd,bytes,done)=>{trace.push('write');if(mode==='original-write-error'){done(original);return}return fs.writeFile(fd,bytes,done)},receiptSync:(...args)=>{trace.push('sync');return fs.fsync(...args)},receiptClose:(...args)=>{trace.push('close');return fs.close(...args)},receiptRename:(...args)=>{trace.push('rename');return fs.rename(...args)},receiptUnlink:fs.unlink,shutdownRejection:value=>({value}),Promise,Error,JSON};
 const call=vm.runInNewContext(helper+';writeCleanupReceipt',sandbox);let value;try{await call(receipt)}catch(error){value=error}
 let pass=true,why;try{
  if(mode==='canonical'){assert.equal(value,undefined);assert.deepEqual(trace,['open','write','sync','close','rename','open','sync','close']);assert.equal(await readFile(join(directory,'package-cleanup.json'),'utf8'),JSON.stringify(receipt,null,2)+'\n');assert.equal(sandbox.cleanupReceiptWritten,true);assert.equal(sandbox.cleanupWriters.size,0);assert.deepEqual(await readdir(directory),['package-cleanup.json'])}
  else{assert.equal(value,original);assert.equal(value.cause,false);assert.deepEqual(trace,['open','write','close']);assert.equal(sandbox.cleanupPersistencePrimary.value,original);assert.equal(sandbox.cleanupReceiptWritten,false);assert.equal(trace.includes('rename'),false);for(const file of sandbox.cleanupWriters)assert.equal(file.closeComplete,true)}
 }catch(error){pass=false;why=error.message}
 rows.push({mode,pass,why,trace,returnedError:value?.message,cause:value?.cause,receiptWritten:sandbox.cleanupReceiptWritten,files:await readdir(directory),native:false,acknowledged:false});
}
const result={phase,pass:rows.filter(row=>row.pass).length,fail:rows.filter(row=>!row.pass).length,rows,limits:'Literal production cleanup writer, real kernel FS/FD/write/fsync/close/rename. Captured tuple/receipt and injected write failure are labelled offline operands; not native cleanup/ACK proof.'};await writeFile(join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(result.fail)process.exitCode=1;
