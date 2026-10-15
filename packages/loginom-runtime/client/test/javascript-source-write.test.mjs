import test from 'node:test';
import assert from 'node:assert/strict';
import {javascriptSourceIdentity} from '../lib/javascript-source-read.mjs';
import {observeJavascriptSource} from '../lib/javascript-source-browser.mjs';
import {createJavascriptSourceWriter} from '../lib/javascript-source-write.mjs';
import {javascriptSourceOwner,sourceFixture} from './support/javascript-source-fixture.mjs';
const owner=javascriptSourceOwner;

function writerFixture(initial='old source',options={}) {
 const browser=sourceFixture(initial),calls=[],events=[];
 const page={
  evaluateHandle:async(fn,args)=>{assert.equal(fn,observeJavascriptSource);calls.push('capture');const held=browser.observe(args);held.dispose=async()=>{calls.push('dispose');};return held;},
  evaluate:async(fn,args)=>{assert.equal(fn,observeJavascriptSource);calls.push('read');return browser.observe(args);},
  mouse:{click:async()=>{calls.push('click');browser.document.activeElement=browser.input;}},
  keyboard:{press:async key=>{
   calls.push(key);
   if(key==='Control+A')browser.setSelection(browser.getSource());
   if(key==='Backspace')browser.setSource('');
  },insertText:async text=>{calls.push('insertText');browser.setSource(text);browser.setSelection('');}},
 };
 const writer=createJavascriptSourceWriter({page,context:browser.context,owner,epoch:1,deadline:Date.now()+60000,
  record:async event=>{events.push(structuredClone(event));return options.record?.(event)??event;}});
 const replace=source_text=>writer.replace({expected_source_sha256:javascriptSourceIdentity(initial).source_sha256,source_text});
 return {browser,page,writer,calls,events,replace};
}
const replacement='const next=1;';

test('owned editor writes exact Unicode source once and journals only digests',async()=>{
 const f=writerFixture(),source='import {InputTable} from "builtIn/Data";\nconst label="Сумма ё😀";\n';
 const result=await f.replace(source);
 assert.equal(f.browser.getSource(),source);
 assert.equal(result.source_sha256,javascriptSourceIdentity(source).source_sha256);
 assert.equal(result.draft_exact,true);
 assert.equal(result.wizard_commit_verified,false);
 assert.equal(f.writer.state,'draft_verified');
 assert.deepEqual(f.events.map(x=>x.phase),['javascript_source_write_prepared','javascript_source_write_mutation_dispatch','javascript_source_write_draft_verified']);
 assert.ok(f.events.every(x=>!JSON.stringify(x).includes('source_text')&&!JSON.stringify(x).includes('Сумма')));
 assert.deepEqual(f.calls.filter(x=>['click','Control+A','Backspace','insertText'].includes(x)),['click','Control+A','Backspace','insertText']);
 await assert.rejects(()=>f.replace(source),/one-shot/);
});

test('empty source is an explicit exact replacement',async()=>{
 const f=writerFixture('x'),result=await f.replace('');
 assert.equal(f.browser.getSource(),'');assert.equal(result.source_lf_lines,1);assert.equal(f.writer.state,'draft_verified');
});

test('wrong baseline digest refuses before any editor gesture',async()=>{
 const f=writerFixture();await assert.rejects(()=>f.writer.replace({expected_source_sha256:'a'.repeat(64),source_text:replacement}),
  error=>error.code==='JAVASCRIPT_SOURCE_WRITE_REFUSED'&&error.source_mutation_possible===false);
 assert.equal(f.writer.state,'refused');assert.equal(f.browser.getSource(),'old source');
 assert.equal(f.calls.includes('click'),false);assert.equal(f.events.length,0);
});

test('source bounds and module policy refuse before editor capture',async()=>{
 for(const source of ['x'.repeat(32769),'import {readFile} from "builtIn/FS";','import("builtIn/Data")']){
  const f=writerFixture();
  await assert.rejects(()=>f.replace(source),error=>error.code==='JAVASCRIPT_SOURCE_WRITE_REFUSED');
  assert.deepEqual(f.calls,[]);assert.equal(f.events.length,0);
 }
});

test('writer refuses an unvalidated observed build at construction',()=>{
 const f=writerFixture();
 assert.throws(()=>createJavascriptSourceWriter({page:f.page,context:{...f.browser.context,build:'7.4.3'},
  owner,epoch:1,deadline:Date.now()+60000,record:async event=>event}),/Loginom 7.4.2/);
 assert.deepEqual(f.calls,[]);
});

test('owner or hit-test drift refuses before source mutation',async()=>{
 for(const mutate of [f=>{f.browser.node.FGuid='foreign';},f=>{f.browser.document.elementFromPoint=()=>null;}]){
  const f=writerFixture();mutate(f);
  await assert.rejects(()=>f.replace(replacement),error=>error.code==='JAVASCRIPT_SOURCE_WRITE_REFUSED');
  assert.equal(f.calls.includes('click'),false);assert.equal(f.browser.getSource(),'old source');
 }
});

test('unconfirmed full selection retains the original source and never sends Backspace',async()=>{
 const f=writerFixture();f.page.keyboard.press=async key=>{f.calls.push(key);};
 await assert.rejects(()=>f.replace(replacement),error=>error.code==='JAVASCRIPT_SOURCE_WRITE_UNCERTAIN'&&error.phase==='selecting');
 assert.equal(f.browser.getSource(),'old source');assert.equal(f.calls.includes('Backspace'),false);
 assert.equal(f.events.some(x=>x.phase==='javascript_source_write_mutation_dispatch'),false);
 await assert.rejects(()=>f.replace(replacement),/one-shot/);
});

test('lost insertText reply keeps the original attempt uncertain and never retries',async()=>{
 const f=writerFixture();f.page.keyboard.insertText=async text=>{f.calls.push('insertText');f.browser.setSource(text);throw Error('lost reply');};
 await assert.rejects(()=>f.replace(replacement),error=>error.code==='JAVASCRIPT_SOURCE_WRITE_UNCERTAIN'&&error.source_mutation_possible===true);
 assert.equal(f.browser.getSource(),replacement);assert.equal(f.calls.filter(x=>x==='insertText').length,1);
 assert.equal(f.writer.state,'uncertain');await assert.rejects(()=>f.replace(replacement),/one-shot/);
});

test('journal ACK mismatch before mutation refuses; after mutation remains uncertain',async()=>{
 for(const phase of ['javascript_source_write_prepared','javascript_source_write_draft_verified']){
  const f=writerFixture('old',{record:event=>event.phase===phase?{}:event});
  await assert.rejects(()=>f.replace(replacement),error=>error.code===
   (phase==='javascript_source_write_prepared'?'JAVASCRIPT_SOURCE_WRITE_REFUSED':'JAVASCRIPT_SOURCE_WRITE_UNCERTAIN'));
  assert.equal(f.browser.getSource(),phase==='javascript_source_write_prepared'?'old':replacement);
 }
});

test('real redacting journal retains write digests without source text',async t=>{
 const {mkdtemp,readFile,readdir,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {createExecutionJournal}=await import('../lib/execution-journal.mjs');
 const directory=await mkdtemp(join(tmpdir(),'javascript-write-journal-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const f=writerFixture('old'),source='const unusualName="Сумма ё";';
 const record=createExecutionJournal({directory,metadata:{sessionId:'javascript-writer',clientRevision:'test'}});
 const writer=createJavascriptSourceWriter({page:f.page,context:f.browser.context,owner,epoch:1,
  deadline:Date.now()+60000,record});
 const result=await writer.replace({expected_source_sha256:javascriptSourceIdentity('old').source_sha256,source_text:source});
 const events=(await Promise.all((await readdir(directory)).filter(name=>name.endsWith('.jsonl'))
  .map(name=>readFile(join(directory,name),'utf8')))).join('\n');
 assert.ok(events.includes(result.source_sha256));
 assert.ok(events.includes('javascript_source_write_draft_verified'));
 assert.ok(!events.includes('unusualName')&&!events.includes('source_text'));
});
