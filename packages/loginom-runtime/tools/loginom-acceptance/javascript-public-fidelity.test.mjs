import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {javascriptPublicCodeProbe,javascriptPublicCodeRequest,verifyJavascriptPublicCodeInput,javascriptPublicCodeOracle} from './javascript-public-code-live.mjs';
import {javascriptPublicSourceCase} from './javascript-public-source-cases.mjs';
import {runJavascriptOperator} from './javascript-live.mjs';
import {createJavascriptColdSource} from './javascript-cold-source.mjs';
import {sourceFixture} from '../../client/test/support/javascript-source-fixture.mjs';
import {createJavascriptCodeNodeSupport} from '../../client/lib/javascript-code-node.mjs';
import {validateNodeApplyRequest} from '../../client/lib/node-apply.mjs';
import {inspectJavascriptModulePolicy} from '../../client/lib/javascript-module-policy.mjs';
import {javascriptSourceIdentity} from '../../client/lib/javascript-source-read.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';

const paths=['--config','/not-read/private.json','--profile','/not-created/profile','--browser','/not-opened/chrome','--evidence','/not-created/evidence'];
const args=[...paths,'--execution-case','code-table-execute','--verify-public-code-lifecycle','--verify-public-code-save'];
const prepared={document_id:'document',workflow_ref:{workflow_id:'workflow',prefix:'MF;TF-1',
 tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'workflow',label:'Scenario'}]}};
const input={node:{document_id:'document',workflow_id:'workflow',node_id:'input'},
 table:{row_count:6,sample_rows:6,sample_complete:true,schema:[{},{},{},{},{}]}};

test('fixed fidelity writer pins the previously observed whole source and real public JS admission',()=>{
 const probe=javascriptPublicCodeProbe(null,'code','fidelity-bound-code'),source=javascriptPublicSourceCase('fidelity-bound-code');
 assert.equal(probe.source,source.source);
 assert.deepEqual(javascriptSourceIdentity(probe.source),{source_sha256:'85acd23df49eed604fafc875942e6f8a75a26d1f9f65bab90ac71f3ce886f16e',source_utf8_bytes:32768,source_lf_lines:1024});
 assert.equal(inspectJavascriptModulePolicy(probe.source).status,'ADMITTED');
 const request=javascriptPublicCodeRequest({prepared,input,probe,schemaMode:'code',remaining:1500000});
 const support=createJavascriptCodeNodeSupport({targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',redactor:createRedactor()});
 validateNodeApplyRequest(request,support.nodeApplyHandlers);
 assert.equal(request.target.kind,'new');assert.equal(request.parameters.source_text,source.source);
 assert.equal(request.parameters.schema_mode,'code');assert.equal(request.finish,'execute');
 assert.equal(request.read.coverage,'full');assert.equal(verifyJavascriptPublicCodeInput(probe,input).verified,true);
 for(const patch of [{source:probe.source+' '},{source:probe.source.slice(0,-1)},{source_sha256:'0'.repeat(64)},{source_case_id:'unknown'}]){
  assert.throws(()=>javascriptPublicCodeRequest({prepared,input,probe:{...probe,...patch},schemaMode:'code',remaining:1500000}));
  assert.throws(()=>verifyJavascriptPublicCodeInput({...probe,...patch},input));
 }
});

test('fidelity oracle uses independent full business rows and rejects changed values/source/schema',()=>{
 const probe=javascriptPublicCodeProbe(null,'code','fidelity-bound-code');
 const values=[['1','alpha','1800','продажа'],['2','beta','0','ноль'],['3','alpha','-750','возврат'],
  ['4','гамма','400','продажа'],['5','ёж','0','ноль'],['6','delta','500','продажа']];
 const table={fresh:true,row_count:6,sample_rows:6,sample_complete:true,filter_enabled:false,
  precision:{numbers_verified:true,limitations:[]},schema:probe.schema,
  sample:values.map(row=>row.map((value,index)=>({type:probe.schema[index].type,value,is_null:false,
   precision:index===0||index===2?'exact_integer':'display_text'})))};
 assert.equal(javascriptPublicCodeOracle(probe,table,input).gate_passed,true);
 const wrong=structuredClone(table);wrong.sample[5][2].value='501';assert.equal(javascriptPublicCodeOracle(probe,wrong,input).gate_passed,false);
 assert.throws(()=>javascriptPublicCodeOracle({...probe,source:probe.source.slice(0,-1)},table,input),/pin changed/);
 const schema=structuredClone(table);schema.schema[0].type='real';assert.throws(()=>javascriptPublicCodeOracle(probe,schema,input));
});

for(const options of [{publicFidelitySave:'true'},{publicFidelitySave:true,coldReader:true},
 {publicFidelitySave:true,publicPolicyMode:'code'},{publicFidelitySave:true,publicProbeId:'g5-null-empty'},
 {publicFidelitySave:true,existingLifecycle:'code'},{publicFidelitySave:true,publicSourceCaseId:'fidelity-bound-code'},
 {publicFidelitySave:true,uiProfileMode:'code'},{publicFidelitySave:true,batchCases:[]}])
 test('fidelity writer refuses mixed authority before config: '+JSON.stringify(options),async()=>{
  await assert.rejects(()=>runJavascriptOperator(args,options),/Public fidelity Save requires its separate fixed new Code entrypoint/);
 });

test('fidelity writer refuses wrong lifecycle, no Save, arbitrary text and focus flag before config',async()=>{
 for(const given of [paths,[...paths,'--execution-case','code-table-execute','--verify-public-code-lifecycle'],
  [...paths,'--execution-case','declared-table-execute','--verify-public-declared-lifecycle','--verify-public-declared-save'],
  [...args,'--source','arbitrary'],[...args,'--x11-no-focus']])
  await assert.rejects(()=>runJavascriptOperator(given,{publicFidelitySave:true}));
 for(const [id,mode] of [['unknown','code'],['empty-source-declared','declared'],['fidelity-bound-code','declared']])
  assert.throws(()=>javascriptPublicCodeProbe(null,mode,id),/fixed Code business source/);
 assert.throws(()=>javascriptPublicCodeProbe('g5-null-empty','code','fidelity-bound-code'),/fixed Code business source/);
 const entry=new URL('./javascript-public-fidelity-live.mjs',import.meta.url);
 const refused=spawnSync(process.execPath,[entry.pathname,...paths,'--package','/foreign/file.lgp'],{encoding:'utf8'});
 assert.notEqual(refused.status,0);assert.match(refused.stderr,/Only four assigned public fidelity paths permitted/);
});

test('path-only cold source observes complete fixed32KiB without expected input and guards fresh Execute',async()=>{
 const text=javascriptPublicSourceCase('fidelity-bound-code').source,browser=sourceFixture(text),events=[],calls=[];
 const owner={document_id:'document',workflow_id:'workflow',node_id:'node',operation_id:'fidelity-cold',ui_epoch:1};
 const gate=createJavascriptColdSource({owner,deadline:Date.now()+600000,redactor:createRedactor(),
  record:async value=>{events.push(structuredClone(value));return value;},sourceAdapter:async bound=>({
   open:async()=>{calls.push('open');return browser.observe({context:browser.context,owner:bound,epoch:1,capture:true});},
   read:async held=>({...browser.observe({context:browser.context,owner:bound,epoch:1,held}),settings:{generation:true,grids:[]}}),
   discard:async()=>{calls.push('close');return {closed:true,owner:bound};},
  })});
 await assert.rejects(gate.read({source_text:text}));assert.equal(calls.length,0);
 const actual=await gate.read();assert.equal(actual.source_text,text);assert.equal(actual.source_utf8_bytes,32768);
 assert.equal(actual.source_lf_lines,1024);assert.equal(actual.admission.intent,'preserve');
 await gate.execute(async checked=>{calls.push('execute');assert.equal(checked.policy.source_sha256,actual.source_sha256);});
 assert.equal(calls.filter(value=>value==='open').length,24);
 assert.equal(calls.filter(value=>value==='close').length,24);assert.equal(calls.at(-1),'execute');
 assert.equal(events.filter(value=>value.phase==='source_delivery_verified').length,24);
 assert.equal(events.filter(value=>value.phase==='source_discard_settled').length,24);
 assert.equal(JSON.stringify(events).includes('Кириллица Ёж'),false);
 await assert.rejects(gate.execute(async()=>{}));assert.equal(calls.filter(value=>value==='execute').length,1);
});
