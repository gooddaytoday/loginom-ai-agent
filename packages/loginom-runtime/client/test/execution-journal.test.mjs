import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExecutionJournal } from '../lib/execution-journal.mjs';

test('operation evidence is durable, ordered and redacted independently of transcripts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-execution-journal-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const metadata = { sessionId: 'session', clientRevision: 'runtime', actionManifestDigest: 'manifest' };
  const record = createExecutionJournal({ directory, metadata, knownSecrets: ['private-key-value'] });
  await Promise.all([
    record({ operation_id: 'one', phase: 'intent', detail: 'value private-key-value', password: 'user-password' }),
    record({ operation_id: 'one', phase: 'completed', detail: 'user-password' }),
  ]);
  const path = join(directory, 'execution-events.jsonl');
  const text = await readFile(path, 'utf8');
  assert.doesNotMatch(text, /private-key-value|user-password/);
  const records = text.trim().split('\n').map(JSON.parse);
  assert.deepEqual(records.map(item => item.phase), ['intent', 'completed']);
  assert.equal(records[0].manifest_sha256, 'manifest');
  if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test('journal fails before mutation when evidence cannot be persisted safely', async t => {
  if (process.platform === 'win32') return t.skip('POSIX symlink protection');
  const directory = await mkdtemp(join(tmpdir(), 'dock-execution-symlink-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = join(directory, 'untouched');
  await writeFile(target, 'unchanged');
  await symlink(target, join(directory, 'execution-events.jsonl'));
  const record = createExecutionJournal({ directory, metadata: {} });
  await assert.rejects(record({ phase: 'intent' }));
  assert.equal(await readFile(target, 'utf8'), 'unchanged');
});

function admittingPair() {
 const sample={operation_id:'node-one',action_key:'node.apply',action_revision:'1',internal_provenance:'client_node_procedure_v1',step:4,internal_operation_id:'node-one:n4',
  phase:'node_observation_sample',sample:1,readiness:{policy:'semantic_condition_v2',required_samples:2,satisfied:true,condition:'ready',identity_sha256:'identity',timeout_ms:15000,elapsed_ms:100},
  outcome:{status:'SUCCEEDED',output:{field:'private-key-value'}}};
 const completed={...structuredClone(sample),phase:'node_observation_completed'};delete completed.sample;
 return [sample,completed];
}
function journalIo({fail,abortAt,controller,gateSync}={}) {
 const events=[],lines=[];let opens=0;
 const openFile=async()=>{
  events.push('open');opens++;if(fail==='open'&&opens===1)throw Error('open failure');let writes=0;
  return {writeFile:async text=>{writes++;events.push('write:'+writes);
   if(fail==='write:'+writes&&opens===1)throw Error('write failure');lines.push(JSON.parse(text));
   if(abortAt==='write:'+writes&&opens===1)controller.abort(Error('pair cancelled'));
  },sync:async()=>{events.push('sync');if(gateSync&&opens===1)await gateSync;
   if(abortAt==='sync'&&opens===1)controller.abort(Error('pair cancelled'));
   if(fail==='sync'&&opens===1)throw Error('sync failure');
  },close:async()=>{events.push('close');if(fail==='close'&&opens===1)throw Error('close failure');}};
 };
 return {events,lines,openFile};
}
test('admitting pair writes two complete ordered JSON lines with one sync and two joint acknowledgements',async()=>{
 let release;const gateSync=new Promise(resolve=>{release=resolve});const io=journalIo({gateSync});
 const record=createExecutionJournal({directory:'.',metadata:{sessionId:'s'},knownSecrets:['private-key-value']},{openFile:io.openFile});
 let acknowledged=false;const writing=record.observationPair(...admittingPair()).then(x=>{acknowledged=true;return x});
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(io.events,['open','write:1','write:2','sync']);assert.equal(acknowledged,false);
 release();const acks=await writing;assert.equal(acks.length,2);assert.deepEqual(acks.map(x=>x.phase),['node_observation_sample','node_observation_completed']);
 assert.deepEqual(io.events,['open','write:1','write:2','sync','close']);assert.equal(acks[0].session_id,'s');assert.doesNotMatch(JSON.stringify(acks),/private-key-value/);
 assert.deepEqual(JSON.parse(JSON.stringify(acks)),io.lines);assert.equal(Object.keys(record).includes('observationPair'),false);
});
for(const fail of ['open','write:1','write:2','sync','close'])test('pair '+fail+' failure returns neither acknowledgement and keeps queue usable',async()=>{
 const io=journalIo({fail}),record=createExecutionJournal({directory:'.',metadata:{}},{openFile:io.openFile});
 let acknowledged=false;await assert.rejects(record.observationPair(...admittingPair()).then(()=>{acknowledged=true}),/failure/);assert.equal(acknowledged,false);
 const interrupted=await record({phase:'node_observation_interrupted'});assert.equal(interrupted.phase,'node_observation_interrupted');
 assert.equal(io.lines.at(-1).phase,'node_observation_interrupted');
});
for(const abortAt of ['before','write:1','write:2','sync'])test('pair cancellation at '+abortAt+' never acknowledges completed',async()=>{
 const controller=new AbortController(),io=journalIo({controller,abortAt});const record=createExecutionJournal({directory:'.',metadata:{}},{openFile:io.openFile});
 if(abortAt==='before')controller.abort(Error('pair cancelled'));
 let acknowledged=false;await assert.rejects(record.observationPair(...admittingPair(),{signal:controller.signal}).then(()=>{acknowledged=true}),/pair cancelled/);
 assert.equal(acknowledged,false);
 if(abortAt==='before')assert.deepEqual(io.events,[]);
 if(abortAt==='write:1')assert.equal(io.lines.some(x=>x.phase==='node_observation_completed'),false);
 assert.equal((await record({phase:'node_observation_interrupted'})).phase,'node_observation_interrupted');
});
test('pair validates both records before opening and never batches timeout, context, refresh or early samples',async()=>{
 for(const alter of [p=>p[0].readiness.satisfied=false,p=>p[1].step++,p=>p[1].outcome.output={},p=>p[0].readiness.elapsed_ms=15000,
  ...['node_observation_timeout','node_observation_context_refused','node_step_refresh_authorized'].map(phase=>p=>p[1].phase=phase)]) {
  const io=journalIo(),record=createExecutionJournal({directory:'.',metadata:{}},{openFile:io.openFile}),pair=admittingPair();alter(pair);
  await assert.rejects(record.observationPair(...pair),/matching admitting/);assert.deepEqual(io.events,[]);
 }
});
test('pair preserves earlier durable records and queue order with later records',async()=>{
 const io=journalIo(),record=createExecutionJournal({directory:'.',metadata:{}},{openFile:io.openFile});
 await Promise.all([record({phase:'earlier_sample'}),record.observationPair(...admittingPair()),record({phase:'later_record'})]);
 assert.deepEqual(io.lines.map(x=>x.phase),['earlier_sample','node_observation_sample','node_observation_completed','later_record']);
 assert.equal(io.events.filter(x=>x==='sync').length,3);
});
test('pair redaction failure is rejected before either line is written',async()=>{
 const io=journalIo(),record=createExecutionJournal({directory:'.',metadata:{}},{openFile:io.openFile}),pair=admittingPair();
 let nested={};for(let i=0;i<45;i++)nested={nested};
 pair[0].outcome.output=nested;pair[1].outcome.output=structuredClone(nested);
 await assert.rejects(record.observationPair(...pair));assert.deepEqual(io.events,[]);
});
test('real pair preserves JSONL framing, redaction, permissions and no-follow protection',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'dock-pair-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const record=createExecutionJournal({directory,metadata:{sessionId:'s'},knownSecrets:['private-key-value']});const acks=await record.observationPair(...admittingPair());
 const path=join(directory,'execution-events.jsonl'),text=await readFile(path,'utf8');assert.ok(text.endsWith('\n'));assert.equal(text.split('\n').length,3);
 assert.deepEqual(text.trim().split('\n').map(JSON.parse),JSON.parse(JSON.stringify(acks)));assert.doesNotMatch(text,/private-key-value/);
 if(process.platform!=='win32') {
  assert.equal((await stat(path)).mode&0o777,0o600);await rm(path);const target=join(directory,'untouched');await writeFile(target,'kept');await symlink(target,path);
  await assert.rejects(record.observationPair(...admittingPair()));assert.equal(await readFile(target,'utf8'),'kept');
 }
});
