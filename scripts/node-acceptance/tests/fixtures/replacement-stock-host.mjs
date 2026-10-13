// Test-only preload: inject Page/auth/native doubles into the real managed
// child. Product bytes, resource checks, host dispatch and IPC remain unchanged.
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const actual=childProcess.fork;
childProcess.fork=(entry,args,options={})=>actual(entry,args,{...options,execArgv:[...(options.execArgv??[]),'--import',process.env.STOCK_NATIVE_PRELOAD],env:{...options.env,...Object.fromEntries(['STOCK_NATIVE_FIXTURE','STOCK_RUNTIME_ROOT','STOCK_SCENARIO'].map(k=>[k,process.env[k]]))}});
syncBuiltinESMExports();
const send=process.send.bind(process);
process.send=(value,...args)=>{
 const envelope=value?.replacementOriginal;
 if(envelope){
  const scenario=process.env.STOCK_SCENARIO;
  if(scenario==='lost')return true;
  if(scenario==='missing')delete value.replacementOriginal;
  if(scenario==='foreign')envelope.original.run='foreign';
  if(scenario==='generation')envelope.original.generation++;
  if(scenario==='hash')envelope.original.request_sha256='0'.repeat(64);
  if(scenario==='opening-sibling')envelope.original.native_opening_operation_id=envelope.original.outer_opening_operation_id;
  if(scenario==='outcome')envelope.outcome.result={content:[]};
 }
 return send(value,...args);
};
