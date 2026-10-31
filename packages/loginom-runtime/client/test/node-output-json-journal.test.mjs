import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {createRedactor} from '../lib/redact.mjs';
import {createExecutionJournal} from '../lib/execution-journal.mjs';
import {nodeOutputForJournal,createCandidateNodeSupport} from '../lib/node-support.mjs';
import {isUnchangedTextImportExecution,isUnchangedTransformExecution} from '../lib/node-read-contract.mjs';

test('REST/Join JSON cells retain the exact phase ACK through the real journal redactor',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'node-json-ack-'));
 try{
  const body=JSON.stringify({args:{Key:'a b&я'},url:'https://echo.test/?Key=a%20b%26%D1%8F'},null,2);
  const raw={verified:true,cleanup_complete:true,execution_id:'doc:1:1',ports:[{port:0,sample:[[{type:'string',value:body}]]}]};
  const redactor=createRedactor(),record=createExecutionJournal({directory,metadata:{sessionId:'test'},redactor});
  const before=structuredClone(raw),value=nodeOutputForJournal(raw,redactor);
  const ack=await record({phase:'node_phase_completed',receipt:{phase:'read',value}});
  assert.equal(JSON.stringify(ack.receipt.value),JSON.stringify(value));
  assert.notEqual(value.ports[0].sample[0][0].value,body);
  assert.equal(JSON.parse(value.ports[0].sample[0][0].value).args.Key,'a b&я');
  assert.equal(JSON.parse(value.ports[0].sample[0][0].value).url.includes('Key=a'),false);
  assert.deepEqual(raw,before);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('output redaction failure cannot become accepted table evidence',()=>{
 assert.throws(()=>nodeOutputForJournal({}, {redact:()=>({type:'redaction_failure'})}),/could not be redacted/);
});

test('JSON source numbers survive secret redaction and repeated durable ACK without binary64 conversion',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'port-json-numbers-'));
 try{
  const body='{"id":9007199254740993,"amount":1e400,"zero":-0,"tiny":1e-400,"ratio":1.234567890123456789,"password":"private-json-secret"}';
  const raw={ports:[{freshness_basis:'completed_execution_port_source',sample:[[{type:'string',precision:'source_text',value:body}]]}]};
  const redactor=createRedactor(),value=nodeOutputForJournal(raw,redactor);
  const expected=body.replace('private-json-secret','[redacted]');
  assert.equal(value.ports[0].sample[0][0].value,expected);
  const record=createExecutionJournal({directory,metadata:{sessionId:'test'},redactor});
  const ack=await record({phase:'node_phase_completed',receipt:{phase:'read',value}});
  assert.deepEqual(ack.receipt.value,value);
  assert.equal(raw.ports[0].sample[0][0].value,body);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('source number tokens preserve descriptor and counter checks without exposing raw JSON strings',()=>{
 const redactor=createRedactor(['known-private-value']);
 assert.equal(redactor.redact('{"name":123,"element":0,"input_tokens":7,"ratio":1.00}'),
  '{"name":123,"element":0,"input_tokens":7,"ratio":1.00}');
 assert.equal(redactor.redact('{"element":0,"name":"password","value":"descriptor-private-value"}'),
  '{"redacted":"credential input"}');
 assert.equal(redactor.redact('{"input_tokens":9007199254740993,"output_tokens":1e400}'),
  '{"input_tokens":"[redacted]","output_tokens":"[redacted]"}');
 assert.equal(JSON.parse(redactor.redact(JSON.stringify({body:'{"id":9007199254740993,"token":"nested-private-value"}'}))).body,
  '{"id":9007199254740993,"token":"[redacted]"}');
 assert.doesNotMatch(JSON.stringify(redactor.redact(JSON.rawJSON('"known-private-value"'))),/known-private-value/);
 assert.equal(redactor.redact('{invalid known-private-value'),'{invalid [redacted]');
});

test('JavaScript product read normalizes echo URL cells before the exact durable phase ACK',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'javascript-url-ack-'));
 try{
  const raw={verified:true,cleanup_complete:true,execution_id:'doc:1:1',ports:[{port:0,port_guid:'js-output0',
   freshness_basis:'completed_execution_port_source',fresh:true,execution_id:'doc:1:1',
   sample:[[{type:'string',representation:'data_source_string',precision:'source_text',value:'https://httpbin.org/anything/audience?RequestId=r-a&Key=a%20b%26%D1%8F'},
    {type:'string',representation:'data_source_string',precision:'source_text',value:'a b&я'}]]}]};
  const before=structuredClone(raw),redactor=createRedactor(),calls=[];
  // Replace browser driver dependencies only; execute the actual product dispatch.
  const context={createRedactor,nodeOutputForJournal,isUnchangedTextImportExecution,isUnchangedTransformExecution,NODE_READ_MODE:'read',createNodeReadDrivers:()=>assert.fail('Wrong driver')};
  for(const name of ['Binning','ElimOutlier','CorrAnalysis','Sampling','DataPartition','ExcelImport','RestRequest','LinRegression','LogRegression','Clustering','CrossTable','Replacement','Duplicates',
   'DateTime','SlidingWindow','MissingValues','Collapse','Union','TextExport','Join','Filter','TextImport','Sorting','Grouping','Reform','Calculator'])
   context['create'+name+'NodeSupport']=()=>({nodeApplyHandlers:new Map(),nodeApplyDriverFactory:()=>assert.fail('Wrong driver')});
  const configureJavascript=()=>{};
  context.createJavascriptCodeNodeSupport=()=>({nodeApplyHandlers:new Map(),nodeApplyDriverFactory:()=>({configureJavascript,
   readOutput:async(...args)=>{calls.push(args);return raw;}})});
  const support=vm.runInNewContext('('+createCandidateNodeSupport.toString()+')',context)({
   targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2',redactor});
  const drivers=support.nodeApplyDriverFactory({operation:{parameters:{target:{type:'programming.javascript'},mode:'script'}}});
  const read={ports:[0]},ctx={execution:{execution_id:'doc:1:1'}},value=await drivers.readOutput(read,ctx);
  const record=createExecutionJournal({directory,metadata:{sessionId:'test'},redactor});
  const ack=await record({phase:'node_phase_completed',receipt:{phase:'read',value}});
  assert.deepEqual(ack.receipt.value,value);
  assert.equal(value.ports[0].sample[0][0].value.includes('Key=a'),false);
  assert.equal(value.ports[0].sample[0][1].value,'a b&я');
  assert.equal(value.ports[0].freshness_basis,'completed_execution_port_source');
  assert.equal(value.ports[0].sample[0][1].precision,'source_text');
  assert.equal(drivers.configureJavascript,configureJavascript);
  assert.deepEqual(calls,[[read,ctx]]);assert.deepEqual(raw,before);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('shared ordinary product output is normalized before durable ACK without mutating exact cells',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ordinary-port-ack-'));
 try{
  const redactor=createRedactor(['fixture-secret-token']);
  const raw={verified:true,cleanup_complete:true,ports:[{port:0,freshness_basis:'completed_execution_port_source',sample:[[
   {type:'string',value:JSON.stringify({url:'https://echo.test/?Key=secret'},null,2)},
   {type:'string',value:'https://user:password@echo.test/?token=secret'},
   {type:'string',value:'long 😀'.repeat(3000)+'fixture-secret-token'},
   {type:'integer',value:'9223372036854775807'},
   {type:'real',value:-0,decimal:'-0'}]]}]};
  const original=structuredClone(raw),native={ports:[{exact_table:{complete:true}}]};
  let returned=raw;
  const context={createRedactor,nodeOutputForJournal,isUnchangedTextImportExecution,isUnchangedTransformExecution,NODE_READ_MODE:'read',createNodeReadDrivers:()=>assert.fail('Wrong driver')};
  for(const name of ['Binning','ElimOutlier','CorrAnalysis','Sampling','DataPartition','ExcelImport','RestRequest','LinRegression','LogRegression','Clustering','CrossTable','Replacement','Duplicates',
   'DateTime','SlidingWindow','MissingValues','Collapse','Union','TextExport','Join','Filter','TextImport','Sorting','Grouping','Reform','Calculator','JavascriptCode'])
   context['create'+name+'NodeSupport']=()=>({nodeApplyHandlers:new Map(),nodeApplyDriverFactory:()=>({readOutput:async()=>returned})});
  const support=vm.runInNewContext('('+createCandidateNodeSupport.toString()+')',context)({redactor});
  const drivers=support.nodeApplyDriverFactory({operation:{parameters:{target:{type:'transform.calculator'}}}});
  const value=await drivers.readOutput({ports:[0]},{});
  const record=createExecutionJournal({directory,metadata:{sessionId:'test'},redactor});
  const ack=await record({phase:'node_phase_completed',receipt:{phase:'read',value}});
  assert.deepEqual(ack.receipt.value,value);assert.deepEqual(raw,original);
  assert.equal(JSON.stringify(value).includes('fixture-secret-token'),false);
  assert.equal(JSON.stringify(value).includes('password'),false);
  assert.equal(value.ports[0].sample[0][2].value,'long 😀'.repeat(3000)+'[redacted]');
  assert.equal(value.ports[0].sample[0][3].value,'9223372036854775807');
  assert.equal(value.ports[0].sample[0][4].decimal,'-0');
  returned=native;assert.equal(await drivers.readOutput({},{}),native);
 }finally{await rm(directory,{recursive:true,force:true});}
});
