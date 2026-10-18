import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRedactor} from '../lib/redact.mjs';
import {createExecutionJournal} from '../lib/execution-journal.mjs';
import {nodeOutputForJournal} from '../lib/node-support.mjs';

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
