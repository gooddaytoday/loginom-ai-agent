import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createJavascriptColdSource} from './javascript-cold-source.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
import {sourceFixture} from '../../client/test/javascript-source-read.test.mjs';

const owner = {document_id:'document',workflow_id:'workflow',node_id:'node',operation_id:'cold-source',ui_epoch:1};
const source = 'import {InputTable} from "builtIn/Data";\nconst text="Фактический текст 😀";';
function fixture({text = source, fault, onRecord, deadline = Date.now() + 60000} = {}) {
  const browser = sourceFixture(text), calls = [], events = [], settings = {generation:true,grids:[]};
  const gate = createJavascriptColdSource({owner, deadline, redactor:createRedactor(['SECRET']),
    record:async event => { events.push(structuredClone(event));return onRecord ? onRecord(event,browser) : event; },
    sourceAdapter:async boundOwner => ({
      open:async () => { calls.push('open');if (fault === 'open') throw Error('Lost open');return browser.observe({context:browser.context,owner:boundOwner,epoch:1,capture:true}); },
      read:async held => { calls.push('read');return {...browser.observe({context:browser.context,owner:boundOwner,epoch:1,held}),settings}; },
      discard:async () => { calls.push('close');if (fault === 'close') throw Error('Lost close');return {closed:true,owner:boundOwner}; },
    })});
  return {gate,browser,calls,events,settings,effect:async checked => {
    calls.push('execute');assert.equal(checked.policy.source_sha256,createHash('sha256').update(text).digest('hex'));
    assert.equal('source_text' in checked,false);assert.equal(checked.deadline,deadline);
    return {execution:'owned-new-process'};
  }};
}

test('cold gate observes actual source/settings and reuses production admission before Execute', async () => {
  const f=fixture();const observed=await f.gate.read();
  assert.equal(observed.source_text,source);assert.deepEqual(observed.settings,f.settings);
  assert.equal(observed.admission.intent,'preserve');assert.equal(f.calls.at(-1),'close');
  observed.settings.generation=false;observed.admission.intent='replace';observed.owner.node_id='foreign';
  assert.deepEqual(await f.gate.execute(f.effect),{execution:'owned-new-process'});
  assert.equal(f.gate.state,'finished');assert.equal(f.calls.filter(x=>x==='open').length,3);
  assert.equal(f.calls.filter(x=>x==='close').length,3);assert.equal(f.calls.at(-1),'execute');
  await assert.rejects(f.gate.execute(f.effect));await assert.rejects(f.gate.read());
  assert.equal(f.calls.filter(x=>x==='execute').length,1);
  assert.equal(JSON.stringify(f.events).includes('Фактический текст'),false);
});

test('cold gate collects the full observed Unicode document across real source chunks', async () => {
  const text='// '+ 'Я😀'.repeat(2000)+'\nexport const value=1;';
  const f=fixture({text}),observed=await f.gate.read();
  assert.equal(observed.source_text,text);assert.equal(observed.source_utf8_bytes,Buffer.byteLength(text));
  assert.ok(f.calls.filter(x=>x==='open').length>1);
  assert.equal(f.calls.filter(x=>x==='open').length,f.calls.filter(x=>x==='close').length);
});

for (const text of ['import "builtIn/FS";','const a=import("builtIn/Data");','require("x");','const = ;','const x="SECRET";'])
  test('cold gate refuses unsafe/unreadable source ' + text,async()=>{
    const f=fixture({text});await assert.rejects(f.gate.read());await assert.rejects(f.gate.execute(f.effect));
    assert.equal(f.calls.includes('execute'),false);assert.equal(f.calls.at(-1),'close');
  });

for (const fault of ['open','close']) test('lost '+fault+' permanently prevents cold Execute',async()=>{
  const f=fixture({fault});await assert.rejects(f.gate.read());const count=f.calls.length;
  await assert.rejects(f.gate.read());await assert.rejects(f.gate.execute(f.effect));assert.equal(f.calls.length,count);
});

for (const change of ['source','settings','after-ack']) test('cold Execute refuses '+change+' drift',async()=>{
  const f=fixture({onRecord:async(event,browser)=>{
    if(change==='after-ack'&&event.phase==='javascript_source_effect_dispatch')browser.setSource(source+'\n// changed');
    return event;
  }});
  await f.gate.read();
  if(change==='source')f.browser.setSource(source+'\n// changed');
  if(change==='settings')f.settings.generation=false;
  await assert.rejects(f.gate.execute(f.effect));assert.equal(f.calls.includes('execute'),false);
});

test('cold interface refuses expected source/settings and has no mutation authority',async()=>{
  const f=fixture();assert.deepEqual(Object.keys(f.gate).sort(),['execute','read','state']);
  await assert.rejects(f.gate.read({source_text:'',settings:{}}));
  await assert.rejects(f.gate.execute(f.effect));assert.deepEqual(f.calls,[]);
});

test('lost Execute response cannot dispatch a second computation',async()=>{
  const f=fixture();await f.gate.read();let dispatched=0;
  const effect=async()=>{dispatched++;throw Error('Lost Execute response');};
  await assert.rejects(f.gate.execute(effect));await assert.rejects(f.gate.execute(effect));assert.equal(dispatched,1);
});
