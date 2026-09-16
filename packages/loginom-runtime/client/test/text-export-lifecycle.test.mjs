import test from 'node:test';
import assert from 'node:assert/strict';
import {exportNext,runExportNext,configureTextExport} from '../lib/text-export-procedure.mjs';
import {validateNativeExportParams} from '../lib/text-export-parameters.mjs';
const binding={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'navigation',label:'Workflow'}]},node:{document_id:'doc',workflow_id:'wf',node_id:'node'}};
const before={verified:true,stage:'text_export_params',values:{destination:{value:'/test-2/a.csv'}}};
const task=()=>({binding,before,destination:'/test-2/a.csv',overwrite:'replace',origin:'http://logi-test-plan.bg.local',operation_id:'next',deadline:Date.now()+10000});
function fixture({exists=false,interrupt,expire=false}={}){
 let stage='params';const clicks=[],t=task(),page={};
 const hit=at=>{if(at===interrupt){if(expire)t.deadline=Date.now()-1;else page[Symbol.for('loginom-dock.text-export-cancel')]=new Set([t.operation_id]);}};
 page.evaluate=async fn=>{if(fn.toString().includes('new URL')){hit('origin');return true;}hit('question');return {present:stage==='question',exact:true};};
 page.locator=selector=>({count:async()=>{hit('count');return 1;},elementHandle:async()=>{hit('handle');return {evaluate:async()=>{hit('hit');return true;},dispose:async()=>{},click:async()=>{clicks.push(selector);if(selector.includes('btnNext')){stage=exists?'question':'format';hit('next');}else {stage=selector.includes(';yes')?'format':'params';hit('answer');}}};}});
 page.waitForTimeout=async()=>{};
 const readContext=async()=>{hit('read');return stage==='format'?{verified:true,stage:'text_export_format'}:structuredClone(before);};
 const readNode=async()=>{hit('owner');return {verified:true,surface:'wizard',node_id:'node'};};
 return {run:()=>exportNext(page,t,readNode,readContext,()=>{},{}),t,clicks};
}
test('export Next preserves native absence, replace and reject decisions',async()=>{
 for(const [exists,overwrite,count]of [[false,'reject',1],[true,'replace',2],[true,'reject',2]]){
  const f=fixture({exists});f.t.overwrite=overwrite;const r=await f.run();assert.equal(r.status,'SUCCEEDED');assert.equal(r.cleanup_complete,true);assert.equal(f.clicks.length,count);assert.equal(r.output.existed,exists);if(exists)assert.equal(r.output.decision,overwrite);
 }
});
test('export Next refuses cancellation/deadline after awaited reads before a gesture',async()=>{
 for(const expire of [false,true])for(const interrupt of ['origin','read','count','handle','hit']){
  const f=fixture({interrupt,expire}),r=await f.run();assert.equal(f.clicks.length,0,interrupt);assert.equal(r.status,'NOT_APPLIED');assert.equal(r.effect_possible,false);assert.equal(r.cleanup_complete,true);
 }
 const f=fixture();f.t.deadline=Date.now()-1;assert.equal((await f.run()).status,'NOT_APPLIED');assert.equal(f.clicks.length,0);
});
test('export Next never answers overwrite after cancellation or deadline at transition',async()=>{
 for(const expire of [false,true])for(const interrupt of ['next','owner','question']){
  const f=fixture({exists:true,interrupt,expire}),r=await f.run();assert.equal(f.clicks.length,1,interrupt);assert.equal(r.status,'AMBIGUOUS');assert.equal(r.effect_possible,true);assert.equal(r.cleanup_complete,false);
 }
});
test('host checks cancel and deadline after prepared journal, before dispatch',async()=>{
 for(const cancelled of [true,false]){
  const t=task(),ac=new AbortController();let next=0;const scripts=[];
  await assert.rejects(runExportNext(t,{signal:ac.signal},{operation:{id:'op'},receiptOptions:()=>({}),onRecord:async r=>{if(cancelled)ac.abort(Error('cancel'));else t.deadline=Date.now()-1;return r;},execute:async code=>{scripts.push(code);if(code.includes('function exportNext'))next++;return true;}}));
  assert.equal(next,0);if(cancelled){assert.equal(scripts.length,2);assert.ok(scripts[0].includes('.add('));assert.ok(scripts[1].includes('.delete('));}
 }
});
test('unknown native transport retains its cancellation marker',async()=>{
 const ac=new AbortController(),scripts=[];
 await assert.rejects(runExportNext(task(),{signal:ac.signal},{operation:{id:'op'},receiptOptions:(id,key,signature)=>({receipt_namespace:'test',receipt_id:id,receipt_signature:signature}),onRecord:async r=>r,execute:async code=>{scripts.push(code);if(code.includes('function exportNext')){ac.abort(Error('cancel'));throw Error('lost reply');}return true;}}));
 assert.ok(scripts.some(s=>s.includes('.add(')));assert.equal(scripts.some(s=>s.startsWith('async page=>{page[Symbol.for(')&&s.includes('.delete(')),false);
});
const params={destination:'/test-2/a.csv',text_qualifier:'"',decimal_separator:'.',null_marker:'?',true_value:'True',false_value:'False',date_separator:'',time_separator:'',date_format:'',time_format:''};
const values=p=>Object.fromEntries(Object.entries(p).map(([k,value])=>[k,{value}]));
test('retained first-page contract checks every field, without guessing decimal defaults',()=>{
 assert.doesNotThrow(()=>validateNativeExportParams(values(params)));
 for(const [key,value]of Object.entries({destination:'/test-1/a.csv',text_qualifier:'',decimal_separator:'',null_marker:'NIL',true_value:'yes',false_value:'no',date_separator:'|',time_separator:';',date_format:'unknown',time_format:'unknown'}))assert.throws(()=>validateNativeExportParams(values({...params,[key]:value})),key);
});
test('unsupported retained params close the draft before any Next/Execute',async()=>{
 const ac=new AbortController();let calls=0,closed=0;
 await assert.rejects(configureTextExport({}, {}, {...binding,finish:'execute',signal:ac.signal,deadline:Date.now()+10000},{operation:{id:'op'},execute:async()=>{calls++;return {...before,values:values({...params,decimal_separator:''})};},onRecord:async r=>r,close:async()=>{closed++;return {cleanup_complete:true,draft_discarded:true,settings_applied:false};}}),e=>e.nodePhaseRefusal?.verification==='text_export_unsupported_retained'&&e.nodePhaseRefusal.cleanup_complete===true);
 assert.equal(calls,1);assert.equal(closed,1);
});
