import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {createRedactor} from '../lib/redact.mjs';
import {createExecutionJournal} from '../lib/execution-journal.mjs';
import {nodeOutputForJournal,createCandidateNodeSupport} from '../lib/node-support.mjs';

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

test('JavaScript product read normalizes echo URL cells before the exact durable phase ACK',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'javascript-url-ack-'));
 try{
  const raw={verified:true,cleanup_complete:true,execution_id:'doc:1:1',ports:[{port:0,
   sample:[[{type:'string',value:'https://httpbin.org/anything/audience?RequestId=r-a&Key=a%20b%26%D1%8F'},
    {type:'string',value:'a b&я'}]]}]};
  const before=structuredClone(raw),redactor=createRedactor(),calls=[];
  // Replace browser driver dependencies only; execute the actual product dispatch.
  const context={createRedactor,nodeOutputForJournal,NODE_READ_MODE:'read',createNodeReadDrivers:()=>assert.fail('Wrong driver')};
  for(const name of ['ExcelImport','RestRequest','LinRegression','Clustering','CrossTable','Replacement','Duplicates',
   'DateTime','MissingValues','Collapse','Union','TextExport','Join','Filter','TextImport','Sorting','Grouping','Reform','Calculator'])
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
  assert.equal(drivers.configureJavascript,configureJavascript);
  assert.deepEqual(calls,[[read,ctx]]);assert.deepEqual(raw,before);
 }finally{await rm(directory,{recursive:true,force:true});}
});
