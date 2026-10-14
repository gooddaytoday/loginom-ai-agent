import assert from 'node:assert/strict';import {readFile,writeFile,mkdtemp,rm}from'node:fs/promises';import {join}from'node:path';import {tmpdir}from'node:os';
const file=process.argv[2]??new URL('../../../src/node-entry.ts',import.meta.url).pathname;
const text=await readFile(file,'utf8');const a=text.indexOf('async function recordManagementRefusal('),b=text.indexOf('\nfunction stop()',a);assert(a>=0&&b>a);let code=text.slice(a,b);if(file.endsWith('.ts'))code=new Bun.Transpiler({loader:'ts'}).transformSync(code);
let pass=0;
for(const mode of ['cause0','false','undefined','writer-error']){
 const dir=await mkdtemp(join(tmpdir(),'management-refusal-')),state:any={root:dir},reason=mode==='false'?false:mode==='undefined'?undefined:Error('LOGINOM_CONNECTION_CHECK_FAILED',{cause:Error('LOGINOM_RUNTIME_TIMEOUT',{cause:0})});
 const fault=Error('original writer',{cause:0});const writer=mode==='writer-error'?async()=>{throw fault}:writeFile;
 // SOURCE_COMPILED/INSTALLED_DEFINING diagnostic functions with real FS; state and error input are labelled fixtures.
 const {recordManagementRefusal}=Function('state','writeFile','join',code+';return {recordManagementRefusal};')(state,writer,join);
 await recordManagementRefusal('original-request',reason);await recordManagementRefusal('original-request',Error('replacement'));
 assert.equal(state.shutdown.managementRefusals.length,1);assert.equal(state.shutdown.managementRefusals[0].requestId,'original-request');
 if(mode==='writer-error'){assert.equal(state.shutdown.managementPersistenceFailure.message,fault.message);assert.equal(state.shutdown.managementPersistenceFailure.cause.value,0)}
 else{const log=JSON.parse(await readFile(join(dir,'host-shutdown.json'),'utf8'));assert.equal(log.stages.filter((x:any)=>x.stage==='connection_check_refusal').length,1);const v=log.managementRefusals[0].rejection;if(mode==='cause0')assert.equal(v.cause.cause.value,0);else if(mode==='false')assert.equal(v.value,false);else assert.equal(v.is_undefined,true)}
 await rm(dir,{recursive:true});console.log('PASS',mode);pass++;
}console.log(pass+' PASS diagnostic real-FS fixture controls; no native/setup/permission proof');
