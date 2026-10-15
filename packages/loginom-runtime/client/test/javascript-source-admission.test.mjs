import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createJavascriptSourceAdmission} from '../lib/javascript-source-admission.mjs';
import {createRedactor} from '../lib/redact.mjs';
import {sourceFixture} from './support/javascript-source-fixture.mjs';
const digest=text=>createHash('sha256').update(text).digest('hex');
const original='import {InputTable} from "builtIn/Data"; const a="Сумма ё😀";';
const owner={document_id:'document',workflow_id:'workflow',node_id:'node',operation_id:'admission',ui_epoch:1};
function fixture({kind='existing',source=original,deadline=Date.now()+60000,chunkBytes=4096,record,secret,settingsTransition,expectedSource,expectedSettings}={}) {
 const browser=sourceFixture(source),events=[],calls=[],settings={generation:true,fields:['Value']};
 const startOwner={...owner,node_id:kind==='new'?null:'node'};
 const sourceAdapter=async boundOwner=>({
  open:async()=>{calls.push('open');return browser.observe({context:browser.context,owner:boundOwner,epoch:1,capture:true});},
  read:async held=>{calls.push('read');return {...browser.observe({context:browser.context,owner:boundOwner,epoch:1,held}),settings};},
  discard:async()=>{calls.push('close');return {closed:true,owner:boundOwner};}
 });
 const admission=createJavascriptSourceAdmission({kind,owner:startOwner,deadline,sourceAdapter,chunkBytes,settingsTransition,expectedSource,expectedSettings,redactor:createRedactor(secret?[secret]:[]),record:async event=>{events.push(structuredClone(event));return record?record(event,browser):event;}});
 return {browser,events,calls,settings,admission,owner:startOwner,deadline,sourceAdapter,
  mutate:async args=>{calls.push('mutate');browser.setSource(args.source_text);return {owner};},effect:async args=>{calls.push('effect');assert.equal(args.deadline,deadline);return {host_result:'returned'};}};
}
const input=(f,receipt,boundOwner=f.owner)=>({receipt,owner:boundOwner});
test('admission records a redacted host boundary refusal and remains retired without replay',async()=>{
 const f=fixture({secret:'PRIVATE_CREDENTIAL'}),receipt=await f.admission.admit({});
 let effects=0;
 await assert.rejects(()=>f.admission.withEffect(input(f,receipt),async()=>{
  effects++;throw Error('Owned preparation failed: PRIVATE_CREDENTIAL');
 }),{code:'boundary'});
 const refused=f.events.filter(event=>event.phase==='javascript_source_boundary_refused');
 assert.equal(refused.length,1);
 assert.equal(refused[0].reason,'Owned preparation failed: [redacted]');
 assert.deepEqual(refused[0].owner,f.owner);
 assert.equal(refused[0].read_id,3);
 assert.equal(f.admission.state,'retired');
 await assert.rejects(()=>f.admission.withEffect(input(f,receipt),f.effect),{code:'state'});
 assert.equal(effects,1);assert.ok(!f.calls.includes('effect'));
});
test('admission existing omitted source actual reader/Close before policy/effect',async()=>{
 const f=fixture(),receipt=await f.admission.admit({});assert.equal(receipt.intent,'preserve');assert.equal(receipt.effective_source.source_sha256,digest(original));assert.equal(f.calls.at(-1),'close');
 assert.ok(Object.isFrozen(receipt)&&Object.isFrozen(receipt.effective_source));assert.ok(!JSON.stringify(receipt).includes('Сумма'));
 const result=await f.admission.withEffect(input(f,receipt),f.effect);assert.deepEqual(result,{host_result:'returned'});assert.equal(f.admission.state,'finished');
 assert.equal(f.calls.filter(x=>x==='open').length,3);assert.equal(f.calls.at(-2),'close');assert.equal(f.calls.at(-1),'effect');
 const saved=f.events.find(e=>e.phase==='javascript_source_effect_dispatch');assert.equal(saved.receipt.effective_source.source_sha256,digest(original));
 await assert.rejects(()=>f.admission.withEffect(input(f,receipt),f.effect),{code:'state'});
});
for(const text of ['',original,'const result=1;'])test('admission explicit replacement preserved '+text.slice(0,10),async()=>{
 const f=fixture(),receipt=await f.admission.admit({source_text:text,expected_source_sha256:digest(original)});assert.equal(receipt.intent,'replace');
 await assert.rejects(()=>f.admission.withEffect(input(f,receipt),f.effect),{code:'state'});assert.ok(!f.calls.includes('effect'));
 const configured=await f.admission.withMutation(input(f,receipt),f.mutate);assert.equal(configured.intent,'replace');assert.equal(configured.effective_source.source_sha256,digest(text));assert.equal(configured.phase,'configured');
 await f.admission.withEffect(input(f,configured),f.effect);assert.equal(f.calls.filter(x=>x==='mutate').length,1);assert.equal(f.calls.filter(x=>x==='effect').length,1);
});
for(const text of ['',original])test('admission new policy before create then actual owned readback '+text.length,async()=>{
 const f=fixture({kind:'new'}),receipt=await f.admission.admit({source_text:text});assert.equal(receipt.owner.node_id,null);assert.equal(f.calls.length,0);
 const configured=await f.admission.withMutation(input(f,receipt),f.mutate);assert.equal(configured.owner.node_id,'node');assert.equal(configured.intent,'create');
 await f.admission.withEffect(input(f,configured,owner),f.effect);assert.equal(f.admission.state,'finished');
});
for(const params of [{},{source_text:undefined},{source_text:1},{source_text:'',expected_source_sha256:digest('')},{source_text:'',extra:true}])test('admission new invalid request '+JSON.stringify(params),async()=>{const f=fixture({kind:'new'});await assert.rejects(()=>f.admission.admit(params));assert.deepEqual(f.calls,[]);assert.equal(f.admission.state,'retired');});
for(const params of [{source_text:''},{source_text:'',expected_source_sha256:'bad'},{expected_source_sha256:digest(original)},{source_text:null,expected_source_sha256:digest(original)}])test('admission existing invalid replacement '+JSON.stringify(params),async()=>{const f=fixture();await assert.rejects(()=>f.admission.admit(params));assert.deepEqual(f.calls,[]);});
test('admission stale digest reads/discards but never mutates',async()=>{const f=fixture();await assert.rejects(()=>f.admission.admit({source_text:'',expected_source_sha256:digest('old')}),{code:'stale_digest'});assert.equal(f.calls.at(-1),'close');assert.ok(!f.calls.includes('mutate'));});
for(const kind of ['new','existing'])test('admission unsafe effective source never reaches mutation '+kind,async()=>{const f=fixture({kind,source:'import("PRIVATE_SENTINEL")'});await assert.rejects(()=>f.admission.admit(kind==='new'?{source_text:'require("PRIVATE_SENTINEL")'}:{}),e=>e.code==='policy'&&!JSON.stringify(e).includes('PRIVATE_SENTINEL'));assert.ok(!f.calls.includes('mutate'));if(kind==='existing')assert.equal(f.calls.at(-1),'close');});
test('admission full Unicode chunk assembly and every producer receipt bound to read id',async()=>{const f=fixture({chunkBytes:8}),receipt=await f.admission.admit({});assert.equal(receipt.effective_source.source_sha256,digest(original));assert.ok(f.calls.filter(x=>x==='open').length>1);assert.equal(f.calls.filter(x=>x==='open').length,f.calls.filter(x=>x==='close').length);const records=f.events.filter(e=>e.phase==='source_delivery_verified');assert.ok(records.every(e=>e.read_id===1&&e.admission_id===receipt.admission_id));});
for(const field of ['node_id','document_id','workflow_id','operation_id','ui_epoch'])test('admission owner continuation drift '+field,async()=>{const f=fixture(),receipt=await f.admission.admit({});const changed={...owner,[field]:field==='ui_epoch'?2:'foreign'};await assert.rejects(()=>f.admission.withEffect(input(f,receipt,changed),f.effect),{code:'owner'});assert.ok(!f.calls.includes('effect'));});
for(const fault of ['source','policy','settings'])for(const stage of ['mutation','effect'])test('admission fresh '+stage+' refuses '+fault,async()=>{
 const f=fixture(),receipt=await f.admission.admit({});if(fault==='source')f.browser.setSource(original+' ');if(fault==='policy')f.browser.setSource('require("private")');if(fault==='settings')f.settings.fields=['Changed'];
 await assert.rejects(()=>stage==='mutation'?f.admission.withMutation(input(f,receipt),f.mutate):f.admission.withEffect(input(f,receipt),f.effect));assert.ok(!f.calls.includes(stage==='mutation'?'mutate':'effect'));
});
for(const phase of ['source_discard_settled','source_delivery_verified','javascript_source_admitted','javascript_source_mutation_dispatch','javascript_source_configured','javascript_source_effect_dispatch','javascript_source_effect_returned'])for(const alter of ['delete','in-place'])test('admission exact producer/consumer ACK '+phase+' '+alter,async()=>{
 const f=fixture({record:event=>{if(event.phase!==phase)return event;if(alter==='delete')return {};if(event.receipt)event.receipt.source_sha256='forged';else event.owner.node_id='foreign';return event;}});
 const run=async()=>{const receipt=await f.admission.admit({});const configured=await f.admission.withMutation(input(f,receipt),f.mutate);await f.admission.withEffect(input(f,configured),f.effect);};
 await assert.rejects(run);assert.equal(f.admission.state,'retired');if(['source_discard_settled','source_delivery_verified','javascript_source_admitted','javascript_source_mutation_dispatch'].includes(phase))assert.ok(!f.calls.includes('mutate'));if(phase!=='javascript_source_effect_returned')assert.ok(!f.calls.includes('effect'));
});
test('admission never trusts a receipt from another producer or a modified policy',async()=>{for(const forged of ['foreign','policy','deadline']){const f=fixture(),receipt=await f.admission.admit({}),other=fixture(),foreign=await other.admission.admit({});const bad=structuredClone(forged==='foreign'?foreign:receipt);if(forged==='policy')bad.effective_source.parser.ecma_version=2026;if(forged==='deadline')bad.deadline++;await assert.rejects(()=>f.admission.withEffect(input(f,bad),f.effect),{code:'receipt'});assert.ok(!f.calls.includes('effect'));}});
for(const stage of ['mutate','effect'])test('admission lost callback reply once without replay '+stage,async()=>{const f=fixture(),receipt=await f.admission.admit({});let calls=0;const lost=async()=>{calls++;throw Error('PRIVATE_SENTINEL');};await assert.rejects(()=>stage==='mutate'?f.admission.withMutation(input(f,receipt),lost):f.admission.withEffect(input(f,receipt),lost),e=>e.code==='boundary'&&!e.message.includes('PRIVATE_SENTINEL'));await assert.rejects(()=>f.admission.withMutation(input(f,receipt),f.mutate),{code:'state'});assert.equal(calls,1);});
test('admission original deadline after admission prohibits callback',async()=>{const f=fixture({kind:'new',deadline:Date.now()+30}),receipt=await f.admission.admit({source_text:''});await new Promise(resolve=>setTimeout(resolve,35));await assert.rejects(()=>f.admission.withMutation(input(f,receipt),f.mutate),{code:'deadline'});assert.deepEqual(f.calls,[]);});
test('admission callback late reply retires and does not continue to readback',async()=>{const f=fixture({kind:'new',deadline:Date.now()+40}),receipt=await f.admission.admit({source_text:''});let finish;await assert.rejects(()=>f.admission.withMutation(input(f,receipt),()=>new Promise(resolve=>{finish=resolve;})),e=>['timeout','deadline'].includes(e.code));finish({owner});await new Promise(resolve=>setTimeout(resolve,1));assert.equal(f.admission.state,'retired');assert.deepEqual(f.calls,[]);});
test('admission replacement snapshots caller parameters before asynchronous read',async()=>{const params={source_text:'',expected_source_sha256:digest(original)};const f=fixture({record:event=>{params.source_text='require("changed")';return event;}});const receipt=await f.admission.admit(params);assert.equal(receipt.effective_source.source_sha256,digest(''));});
for(const fault of ['owner','source','settings'])test('admission mutation output must match independently read source/settings '+fault,async()=>{const f=fixture(),receipt=await f.admission.admit({source_text:'',expected_source_sha256:digest(original)});await assert.rejects(()=>f.admission.withMutation(input(f,receipt),async args=>{const value=await f.mutate(args);if(fault==='owner')return {owner:{...owner,node_id:'foreign'}};if(fault==='source')f.browser.setSource('let x=1;');if(fault==='settings')f.settings.generation=false;return value;}));assert.ok(!f.calls.includes('effect'));});
test('admission exact source redaction refusal cannot authorize effect',async()=>{const f=fixture({source:'const value="SECRET";',secret:'SECRET'});await assert.rejects(()=>f.admission.admit({}));assert.ok(!f.calls.includes('effect'));assert.equal(f.admission.state,'retired');});

for(const fault of ['none','before-drift','wrong-after','late-drift'])test('admission explicit planned code to declared settings '+fault,async()=>{
 const expected={generation:false,fields:['Сумма ё','Count']},plan={kind:'replace',expected_after:expected};
 const f=fixture({settingsTransition:plan}),receipt=await f.admission.admit({});expected.fields.push('caller mutation');
 assert.equal(receipt.intent,'preserve');assert.ok(receipt.planned_settings_sha256);
 await assert.rejects(()=>f.admission.withEffect(input(f,receipt),f.effect),{code:'state'});
 if(fault==='before-drift')f.settings.generation=false;
 const run=async()=>{const configured=await f.admission.withMutation(input(f,receipt),async args=>{const result=await f.mutate(args);assert.deepEqual(args.planned_settings,{generation:false,fields:['Сумма ё','Count']});f.settings.generation=false;f.settings.fields=fault==='wrong-after'?['Other']:['Сумма ё','Count'];return result;});if(fault==='late-drift')f.settings.fields=['Later'];await f.admission.withEffect(input(f,configured),f.effect);return configured;};
 if(fault==='none'){const configured=await run();assert.equal(configured.settings_sha256,configured.planned_settings_sha256);assert.equal(f.calls.filter(x=>x==='effect').length,1);}
 if(fault!=='none'){await assert.rejects(run);assert.ok(!f.calls.includes('effect'));if(fault==='before-drift')assert.ok(!f.calls.includes('mutate'));}
});
for(const stage of ['mutation','effect'])for(const drift of ['source','settings'])test('admission rechecks after '+stage+' dispatch ACK '+drift,async()=>{
 const f=fixture({record:event=>{if(event.phase==='javascript_source_'+stage+'_dispatch'){if(drift==='source')f.browser.setSource('import "builtIn/FS";');else f.settings.generation=false;}return event;}}),receipt=await f.admission.admit({});
 await assert.rejects(()=>stage==='mutation'?f.admission.withMutation(input(f,receipt),f.mutate):f.admission.withEffect(input(f,receipt),f.effect));assert.ok(!f.calls.includes(stage==='mutation'?'mutate':'effect'));assert.equal(f.admission.state,'retired');
});
test('admission snapshots parameters while actual adapter construction is deferred',async()=>{
 const f=fixture(),parameters={source_text:'',expected_source_sha256:digest(original)};let release,entered;
 const started=new Promise(resolve=>{entered=resolve;});
 const admission=createJavascriptSourceAdmission({kind:'existing',owner,deadline:f.deadline,redactor:createRedactor(),record:async e=>e,sourceAdapter:async bound=>{entered();await new Promise(resolve=>{release=resolve;});return f.sourceAdapter(bound);}});
 const pending=admission.admit(parameters);await started;parameters.source_text='require("changed")';parameters.expected_source_sha256=digest('changed');release();
 const receipt=await pending;assert.equal(receipt.effective_source.source_sha256,digest(''));assert.equal(receipt.previous_source.source_sha256,digest(original));
});

test('admission settings canonicalization permits key order only and rejects getters without invocation',async()=>{
 const f=fixture({settingsTransition:{kind:'replace',expected_after:{fields:['Value'],generation:true}}}),receipt=await f.admission.admit({});
 const configured=await f.admission.withMutation(input(f,receipt),f.mutate);assert.equal(configured.settings_sha256,configured.planned_settings_sha256);
 let invoked=false;const invalid={get field(){invoked=true;return 'secret';}};
 assert.throws(()=>fixture({settingsTransition:{kind:'replace',expected_after:invalid}}),{code:'settings_value'});assert.equal(invoked,false);
});
for(const expected_after of [undefined,()=>{},Infinity,Array(2),{value:'x'.repeat(32769)}])test('admission invalid planned settings bounded refusal '+typeof expected_after,()=>assert.throws(()=>fixture({settingsTransition:{kind:'replace',expected_after}}),e=>e.name==='SourceAdmissionError'));

test('admission rejects missing reader dependencies before new creation can be admitted',()=>{
 const f=fixture({kind:'new'}),base={kind:'new',owner:f.owner,deadline:f.deadline,sourceAdapter:f.sourceAdapter,record:async e=>e,redactor:createRedactor()};
 for(const patch of [{redactor:null},{sourceAdapter:null},{record:null},{chunkBytes:0},{chunkBytes:4097}])assert.throws(()=>createJavascriptSourceAdmission({...base,...patch}),{code:'dependencies'});
});


for(const kind of ['new','existing'])for(const scenario of ['known-text','bearer-comment','fragment'])
 test('requested source redaction refuses before any owned read/create/write: '+kind+' '+scenario,async()=>{
  const f=fixture({kind,secret:'SYNTHETIC_SOURCE_SECRET',chunkBytes:scenario==='fragment'?8:4096});
  const source_text=scenario==='known-text'?'const value="SYNTHETIC_SOURCE_SECRET";'
    :scenario==='bearer-comment'?'// Bearer abcdefghijklmnop':'aaaaaaa;[ 1, 2 ]';
  await assert.rejects(()=>f.admission.admit({source_text,
    ...(kind==='existing'?{expected_source_sha256:digest(original)}:{})}));
  assert.deepEqual(f.calls,[]);assert.equal(f.admission.state,'retired');
  assert.equal(f.events.some(e=>e.phase==='javascript_source_admitted'),false);
  assert.equal(JSON.stringify(f.events).includes('SYNTHETIC_SOURCE_SECRET'),false);
  await assert.rejects(()=>f.admission.admit({source_text:''}),{code:'state'});
 });

test('requested source rechecks growing redactor context after mutation dispatch ACK before callback',async()=>{
 const redactor=createRedactor(),calls=[];
 const owner={document_id:'d',workflow_id:'w',node_id:null,operation_id:'redaction-ack',ui_epoch:1};
 const admission=createJavascriptSourceAdmission({kind:'new',owner,deadline:Date.now()+60000,
  sourceAdapter:()=>{calls.push('adapter');throw Error('No adapter expected');},redactor,
  record:async e=>{if(e.phase==='javascript_source_mutation_dispatch')redactor.prime({password:'SYNTHETIC_SOURCE_VALUE'});return e;}});
 const receipt=await admission.admit({source_text:'const value="SYNTHETIC_SOURCE_VALUE";'});
 await assert.rejects(()=>admission.withMutation({receipt,owner},async()=>{calls.push('mutation');throw Error('Must not mutate');}));
 assert.deepEqual(calls,[]);assert.equal(admission.state,'retired');
});

for(const source_text of ['import "PRIVATE_SENTINEL";', 'export * from "PRIVATE_SENTINEL";',
 'require("PRIVATE_SENTINEL");', 'import("builtIn/Data");', 'const t=`${require("PRIVATE_SENTINEL")}`;', 'const x=;'])
 test('unsupported requested replacement refuses before existing editor opens: '+source_text.slice(0,18),async()=>{
  const f=fixture();
  await assert.rejects(()=>f.admission.admit({source_text,expected_source_sha256:digest(original)}),{code:'policy'});
  assert.deepEqual(f.calls,[]);assert.equal(f.admission.state,'retired');
  assert.equal(JSON.stringify(f.events).includes('PRIVATE_SENTINEL'),false);
 });

const binding=()=>({source_sha256:digest(original),source_utf8_bytes:Buffer.byteLength(original),source_lf_lines:1});
for(const drift of ['none','source','settings'])test('preserved source receipt binds a fresh final execution admission '+drift,async()=>{
 const f=fixture(),preserved=await f.admission.admit({});
 assert.equal(preserved.intent,'preserve');
 assert.equal(preserved.effective_source.policy,'javascript-module-v1');
 assert.throws(()=>fixture({expectedSource:preserved.effective_source}),{code:'source_binding'});
 const final=createJavascriptSourceAdmission({kind:'existing',owner:f.owner,deadline:f.deadline,
  sourceAdapter:f.sourceAdapter,redactor:createRedactor(),record:async event=>event,
  expectedSource:preserved.previous_source,expectedSettings:preserved.settings_sha256});
 if(drift==='source')f.browser.setSource(original+'\n// changed after materialization');
 if(drift==='settings')f.settings.generation=false;
 if(drift==='none'){
  const receipt=await final.admit({});
  await final.withEffect(input(f,receipt),f.effect);
  assert.equal(f.calls.filter(call=>call==='effect').length,1);
  assert.equal(f.calls.filter(call=>call==='close').length,f.calls.filter(call=>call==='open').length);
  return;
 }
 await assert.rejects(()=>final.admit({}),{code:drift==='source'?'stale_identity':'effect_drift'});
 assert.equal(final.state,'retired');assert.equal(f.calls.at(-1),'close');assert.ok(!f.calls.includes('effect'));
});
test('retained output source binding is snapshotted, canonically ordered and checked by the actual reader',async()=>{
 const expectedSource={source_lf_lines:1,source_utf8_bytes:Buffer.byteLength(original),source_sha256:digest(original)};
 const f=fixture({expectedSource});expectedSource.source_sha256=digest('changed');
 const receipt=await f.admission.admit({});assert.deepEqual(receipt.expected_source_identity,binding());
 await f.admission.withEffect(input(f,receipt),f.effect);
 assert.equal(f.calls.filter(call=>call==='effect').length,1);
});
for(const mutate of [value=>value.source_sha256=digest('changed'),value=>value.source_utf8_bytes++,value=>value.source_lf_lines++])
 test('retained source identity mismatch closes the reader and never executes '+mutate.toString(),async()=>{
  const expectedSource=binding();mutate(expectedSource);const f=fixture({expectedSource});
  await assert.rejects(()=>f.admission.admit({}),{code:'stale_identity'});
  assert.equal(f.calls.at(-1),'close');assert.ok(!f.calls.includes('effect'));assert.equal(f.admission.state,'retired');
 });
for(const change of [value=>delete value.source_sha256,value=>value.source_utf8_bytes=32769,
 value=>value.source_lf_lines=1025,value=>value.source_sha256='not-a-hash',value=>value.extra=true])
 test('invalid retained source binding refuses before constructing a reader '+change.toString(),()=>{
  const expectedSource=binding();change(expectedSource);assert.throws(()=>fixture({expectedSource}),{code:'source_binding'});
 });
test('a retained output binding cannot authorize a new node or bypass fresh saved source policy',async()=>{
 assert.throws(()=>fixture({kind:'new',expectedSource:binding()}),{code:'source_binding'});
 const source='import("builtIn/Data");',expectedSource={source_sha256:digest(source),source_utf8_bytes:Buffer.byteLength(source),source_lf_lines:1};
 const f=fixture({source,expectedSource});await assert.rejects(()=>f.admission.admit({}),{code:'policy'});
 assert.equal(f.calls.at(-1),'close');assert.ok(!f.calls.includes('effect'));
});

test('retained settings bind a fresh reader without authorizing any callback on drift',async()=>{
 const f=fixture({expectedSettings:'a'.repeat(64)});
 await assert.rejects(()=>f.admission.admit({}),error=>error.code==='effect_drift'
  &&error.javascriptSourceClosedRefusal?.source_read_discard_verified===true);
 assert.equal(f.calls.at(-1),'close');assert.ok(!f.calls.includes('effect'));
 assert.throws(()=>fixture({expectedSettings:'bad'}),{code:'settings_binding'});
});
