import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createJavascriptSourceReader,javascriptSourceIdentity} from '../lib/javascript-source-read.mjs';
import {observeJavascriptSource,observeJavascriptSourceProcesses} from '../lib/javascript-source-browser.mjs';
import {createRedactor} from '../lib/redact.mjs';
const owner={document_id:'document',workflow_id:'workflow',node_id:'node',operation_id:'source-read',ui_epoch:3};
export function sourceFixture(source='const value="Сумма ё😀";') {
 const visible={isConnected:true,getBoundingClientRect:()=>({width:100,height:30})};
 const input={...visible,disabled:false},document={activeElement:{}},doc={lineCount:()=>source.split('\n').length,firstLine:()=>0,lastLine:()=>source.split('\n').length-1,getLine:i=>source.split('\n')[i]};
 const cm={getDoc:()=>doc,getInputField:()=>input,getOption:()=>false},wrapper={...visible,CodeMirror:cm};
 const codePage={...visible,contains:e=>e===wrapper};
 const root={...visible,querySelectorAll:q=>q==='.CodeMirror'?[wrapper]:[codePage],contains:e=>e===input||e===wrapper};
 const nodeData={},workflow={},cell={},node={FGuid:'node',data:nodeData,FCell:cell};
 const native={FParentNode:{FParentNode:workflow,FGuid:'node',FModelNode:nodeData}},model={FModelNode:nodeData,FView:{el:{dom:root}}};
 const tab={Controller:{Node:{data:{node:native}},FController:model}},binding={document,workflow,tab,nodeData,native:node,cell,wizardAddress:{epoch:1,wizard:native,node}};
 const processRecord={internalId:'child',data:{id:'1.1',Status:3,ErrorDetails:'',ModelNode:nodeData},childNodes:[]};
 const processRoot={internalId:'root',data:{loaded:true},childNodes:[processRecord]},tree={id:'tree'},store={getRoot:()=>processRoot,isLoading:()=>false};
 document.querySelectorAll=q=>q.includes('trpProgress')?[tree]:q.includes('WizrdMCF')?[root]:[];
 const environment={document,TextEncoder,getComputedStyle:()=>({visibility:'visible'}),
 __loginomDockPreparationV1:{document,id:'document',receipts:new Map([['receipt',{phase:'verified',workflowId:'workflow',nodeTargetWorkflowNode:workflow}]])},
 bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>tab}},FMapTree:{FServerConnection:{UserName:'owner'}}}}}}},Ext:{getCmp:()=>({getStore:()=>store})}};
 const realm=vm.createContext(environment),observe=vm.runInContext('('+observeJavascriptSource.toString()+')',realm),processes=vm.runInContext('('+observeJavascriptSourceProcesses.toString()+')',realm);
 const context={root,native,binding,prefix:'workflow',account:'owner',build:'7.4.2'};
 return {environment,document,context,codePage,doc,cm,input,wrapper,tab,model,binding,node,processRoot,processRecord,store,observe,processes,setSource:value=>{source=value;},capture:()=>observe({context,owner,epoch:1,capture:true}),read:held=>observe({context,owner,epoch:1,held})};
}
export function readerFixture(source,options={}) {
 const browser=sourceFixture(source),events=[],calls=[];
 const adapter={open:async()=>{calls.push('open');return browser.capture();},read:async held=>{calls.push('read');return {...browser.read(held),settings:{mode:'code'}};},discard:async()=>{calls.push('discard');return {closed:true,owner};}};
 const reader=createJavascriptSourceReader({owner,deadline:Date.now()+60000,adapter,record:async e=>{events.push(e);return e;},redactor:createRedactor(),...options});
 return {browser,events,calls,adapter,reader};
}
async function collect(f) {
 let request={owner},source='',count=0;
 do {const {receipt}=await f.reader.read(request);assert.ok(Buffer.byteLength(JSON.stringify(receipt))<=16384);assert.ok(receipt.source_text.isWellFormed());assert.equal(receipt.offset_utf8_bytes,Buffer.byteLength(source));source+=receipt.source_text;count++;request=receipt.cursor?{owner,cursor:receipt.cursor,expected_source_sha256:receipt.source_sha256}:null;}while(request);
 return {source,count};
}
test('source production procedure + serialized browser success/empty',async()=>{for(const source of ['','const value="Сумма ё😀";']){const f=readerFixture(source);assert.equal((await collect(f)).source,source);assert.deepEqual(f.calls,['open','read','read','read','discard']);assert.equal(f.reader.uncertain,false);assert.equal(f.events.at(-1).phase,'source_delivery_verified');}});
for(const source of ['😀'.repeat(8192),'\"\\\t'.repeat(7000),'x\n'.repeat(1023)+'x','const text="'+'\u0001'.repeat(4096)+'";','const text="'+'\u0001'.repeat(32754)+'";'])test('source complete escaped/Unicode delivery '+Buffer.byteLength(source),async()=>{if(source.startsWith('const'))new vm.Script(source);const f=readerFixture(source),result=await collect(f);assert.equal(result.source,source);assert.ok(result.count>=(Buffer.byteLength(source)>4096?2:1));assert.equal(f.calls.filter(x=>x==='open').length,f.calls.filter(x=>x==='discard').length);});
for(const source of ['x'.repeat(32769),'\n'.repeat(1024),'\r','\0','\ud800','\udc00'])test('source invalid bound/characters '+JSON.stringify(source.slice(0,3)),async()=>{assert.throws(()=>javascriptSourceIdentity(source));await assert.rejects(()=>collect(readerFixture(source)));});
test('source immutable owner and foreign owner before effects',async()=>{const original={...owner},f=readerFixture('x',{owner:original});original.node_id='foreign';await assert.rejects(()=>f.reader.read({owner:original}),/owner/);assert.equal(f.calls.length,0);assert.equal((await f.reader.read({owner})).receipt.owner.node_id,'node');});
test('source cursor/digest refusal and changed source',async()=>{const f=readerFixture('abcdefgh',{chunkBytes:4}),{receipt}=await f.reader.read({owner});for(const req of [{owner,cursor:'foreign',expected_source_sha256:receipt.source_sha256},{owner,cursor:receipt.cursor,expected_source_sha256:'foreign'}])await assert.rejects(()=>f.reader.read(req),/cursor/);f.browser.setSource('abcdEfgh');await assert.rejects(()=>f.reader.read({owner,cursor:receipt.cursor,expected_source_sha256:receipt.source_sha256}),/digest/);assert.equal(f.calls.filter(x=>x==='discard').length,2);await assert.rejects(()=>f.reader.read({owner}),/uncertain/);});
test('source consumed cursor cannot replay',async()=>{const f=readerFixture('abcdefghijkl',{chunkBytes:4}),first=await f.reader.read({owner}),req={owner,cursor:first.receipt.cursor,expected_source_sha256:first.receipt.source_sha256};await f.reader.read(req);await assert.rejects(()=>f.reader.read(req),/cursor/);assert.equal(f.calls.filter(x=>x==='open').length,2);});
for(const source of ['abSECRETcd','// Bearer abcdefghijklmnop','[ 1, 2 ]'])test('source full cross-chunk redaction '+source,async()=>{const f=readerFixture(source,{chunkBytes:4,redactor:createRedactor(['SECRET'])});await assert.rejects(()=>f.reader.read({owner}),/redaction/);assert.equal(f.events.some(e=>e.phase==='source_delivery_verified'),false);assert.equal(f.calls.at(-1),'discard');});
test('source JSON-like chunk refused though whole valid JS unchanged',async()=>{const source='aaaaaaa;[ 1, 2 ]';new vm.Script(source);const redactor=createRedactor();assert.equal(redactor.redact({source_text:source}).source_text,source);const f=readerFixture(source,{chunkBytes:8,redactor});await assert.rejects(()=>f.reader.read({owner}),/structured redaction/);assert.equal(f.events.some(e=>e.phase==='source_delivery_verified'),false);});
for(const fault of ['open','read','discard','open-ack','close-ack','delivery-ack'])test('source lost reply/ACK '+fault,async()=>{const f=readerFixture('x');if(['open','read','discard'].includes(fault))f.adapter[fault]=async()=>{f.calls.push(fault);throw Error('lost reply');};const reader=createJavascriptSourceReader({owner,deadline:Date.now()+60000,adapter:f.adapter,redactor:createRedactor(),record:async e=>e.phase===({'open-ack':'source_open_settled','close-ack':'source_discard_settled','delivery-ack':'source_delivery_verified'}[fault])?{}:e});await assert.rejects(()=>reader.read({owner}));const calls=[...f.calls];await assert.rejects(()=>reader.read({owner}),/uncertain/);assert.deepEqual(f.calls,calls);});
test('source timeout/late reply never publish/replay',async()=>{let finish;const f=readerFixture('x');f.adapter.open=()=>new Promise(resolve=>{finish=resolve;f.calls.push('open');});const reader=createJavascriptSourceReader({owner,deadline:Date.now()+30,adapter:f.adapter,redactor:createRedactor(),record:async e=>e});await assert.rejects(()=>reader.read({owner}),/timeout|deadline/);finish(f.browser.capture());await assert.rejects(()=>reader.read({owner}),/uncertain/);assert.deepEqual(f.calls,['open']);});
const changes={page:f=>f.codePage.isConnected=false,document:f=>f.environment.__loginomDockPreparationV1.document={},prepared:f=>f.environment.__loginomDockPreparationV1.id='foreign',workflow:f=>f.binding.workflow={},node:f=>f.node.FGuid='foreign',cell:f=>f.node.FCell={},root:f=>f.model.FView.el.dom={},doc:f=>f.cm.getDoc=()=>({...f.doc}),input:f=>f.cm.getInputField=()=>({...f.input}),wrapper:f=>f.wrapper.CodeMirror={...f.cm},focus:f=>f.document.activeElement={},epoch:f=>f.binding.wizardAddress.epoch++,readonly:f=>f.cm.getOption=()=>true,account:f=>f.environment.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.UserName='other'};
for(const [name,change] of Object.entries(changes))test('source serialized reader rejects '+name,()=>{const f=sourceFixture(),held=f.capture();change(f);assert.throws(()=>f.read(held),/Source browser/);});
test('source drift between two owned reads',async()=>{const f=readerFixture('a'),read=f.adapter.read;let count=0;f.adapter.read=async h=>{if(count++)f.browser.setSource('b');return read(h);};await assert.rejects(()=>f.reader.read({owner}),/changed during/);assert.equal(f.calls.includes('discard'),false);});
for(const change of [f=>f.processRecord.data.Status=1,f=>f.processRecord.data={...f.processRecord.data},f=>f.processRoot.childNodes.push({...f.processRecord}),f=>f.processRoot.childNodes=[]])test('source process cache refs/scalars unchanged',()=>{const f=sourceFixture(),held=f.processes({capture:true});assert.equal(f.processes({held}).unchanged,true);change(f);assert.throws(()=>f.processes({held}),/process/);});
for(const field of ['source_sha256','source_utf8_bytes','source_lf_lines','offset_utf8_bytes','chunk_utf8_bytes','chunk_sha256'])for(const mode of ['missing','altered'])test('source receipt ACK '+field+' '+mode,async()=>{
 const f=readerFixture('abc');const reader=createJavascriptSourceReader({owner,deadline:Date.now()+60000,adapter:f.adapter,redactor:createRedactor(),record:async event=>{
  if(event.phase!=='source_delivery_verified')return event;
  const ack=structuredClone(event);if(mode==='missing')delete ack.receipt[field];else ack.receipt[field]='different';return ack;
 }});await assert.rejects(()=>reader.read({owner}),/ACK/);assert.equal(reader.uncertain,true);assert.equal(f.calls.at(-1),'discard');
});
test('source redactor context expansion during final ACK prevents publication',async()=>{
 const f=readerFixture('abcdef'),redactor=createRedactor();const reader=createJavascriptSourceReader({owner,deadline:Date.now()+60000,adapter:f.adapter,redactor,record:async event=>{if(event.phase==='source_delivery_verified')redactor.prime({password:'abcdef'});return event;}});
 await assert.rejects(()=>reader.read({owner}),/redaction/);assert.equal(reader.uncertain,true);
});

test('source rejects source drift after discard intent ACK before any Close',async()=>{
 const f=readerFixture('initial');const reader=createJavascriptSourceReader({owner,deadline:Date.now()+60000,adapter:f.adapter,redactor:createRedactor(),record:async e=>{if(e.phase==='source_discard_dispatch')f.browser.setSource('changed');return e;}});
 await assert.rejects(()=>reader.read({owner}),/before discard/);assert.equal(f.calls.includes('discard'),false);
});
test('source detects mutable shared settings changed between reads',async()=>{
 const f=readerFixture('text'),settings={mode:'code'};let reads=0;f.adapter.read=async held=>{if(reads++)settings.mode='declared';return {...f.browser.read(held),settings};};
 await assert.rejects(()=>f.reader.read({owner}),/changed during/);assert.equal(f.calls.includes('discard'),false);
});

test('source durable production journal ACK binds delivered digest and chunk without raw source',async t=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {createExecutionJournal}=await import('../lib/execution-journal.mjs');
 const directory=await mkdtemp(join(tmpdir(),'source97-journal-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const record=createExecutionJournal({directory,metadata:{sessionId:'source97',clientRevision:'test'}}),source='const unusualName = "Сумма ё";',f=readerFixture(source,{record});
 const {receipt}=await f.reader.read({owner});
 const {readdir}=await import('node:fs/promises');const names=await readdir(directory);
 const text=(await Promise.all(names.filter(name=>name.endsWith('.jsonl')).map(name=>readFile(join(directory,name),'utf8')))).join('\n');
 assert.ok(text.includes(receipt.source_sha256));assert.ok(text.includes('chunk_sha256'));assert.ok(!text.includes('unusualName'));assert.ok(!text.includes('source_text'));
});
