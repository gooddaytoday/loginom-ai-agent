import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {recordNativeProof} from '../lib/collapse-native-output.mjs';
import {createExecutionJournal} from '../lib/execution-journal.mjs';
test('actual redacting journal acknowledges exact evidence without changing the live origin binding',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dock-native-journal-'));
 try{
  const journal=createExecutionJournal({directory:dir,metadata:{sessionId:'s',clientRevision:'r'}});
  const proof={binding:{origin:'http://logi-test-plan.bg.local',node_id:'n',runtime_binding_id:'native-read'},loaded_runtime:{binding_id:'native-read',document_id:'d',functions:{'session.DispatchMessageAsync':'a'.repeat(64)},constants:{signature:18242}},lifecycle:{published:true,requests:60}};
  await recordNativeProof(journal,'op',proof);
  const saved=JSON.parse(await readFile(join(dir,'execution-events.jsonl'),'utf8'));
  assert.equal(saved.proof.binding.origin,'http://logi-test-plan.bg.local/');assert.equal(proof.binding.origin,'http://logi-test-plan.bg.local');
  assert.equal(saved.proof.lifecycle.requests,60);assert.equal(saved.proof.binding.runtime_binding_id,'native-read');assert.equal(saved.proof.loaded_runtime.binding_id,'native-read');
  await assert.rejects(()=>recordNativeProof(async event=>({...event,proof:{...event.proof,lifecycle:{published:false,requests:60}}}),'bad',proof),/acknowledged/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
