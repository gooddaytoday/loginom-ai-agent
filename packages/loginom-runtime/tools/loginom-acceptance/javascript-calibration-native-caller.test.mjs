import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {javascriptCalibrationCase,calibrationDiagnostic} from './javascript-calibration-cases.mjs';
import {javascriptNamedCase,javascriptNamedIds} from './javascript-native-named-cases.mjs';
import {failedStage,readFailed} from './javascript-native-named.test.mjs';
import {javascriptNativeRoundtripCode,javascriptNativeRoundtripSnapshot} from './javascript-native-roundtrip-binding.mjs';
import {readJavascriptNativeRoundtrip} from './javascript-native-roundtrip-read.mjs';
import {armJavascriptNativeRoundtrip} from './javascript-native-roundtrip-owner.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
const id='K4-native-caller-v1';
// Synthetic failed diagnostic, not a prediction that Get(4, "Value") throws.
const diagnostic='Error: synthetic native call diagnostic\n   at Anonymous function (<main>:6:1)\n   at module (<main>:1:1)';

test('K4 exact single Get(4,Value) is line6 with no fallback source or literal throw',()=>{
 const p=javascriptCalibrationCase(id),lines=p.source.split('\n'),prefix=lines.slice(0,3).join('\n')+'\n';
 assert.equal(createHash('sha256').update(prefix).digest('hex'),'9ce636119d09e082caa29b44eea6a98748a2f5d8d62ca742d5a3bf8c3fcfb9be');
 assert.deepEqual(lines.slice(3),['','','const result=InputTable.Get(4,"Value");','']);
 assert.equal(Buffer.byteLength(p.source),295);assert.equal(p.source.indexOf('const result'),255);
 assert.equal(p.source.split('InputTable.Get(').length-1,1);
 assert.equal(p.source_sha256,'debb9802f3a381e3569b7a7c8857038a3a165fafacfbbcb7a5b18ed3dd17541f');
 for(const old of ['K1-parse-v1','K2-sync-v1','K3-shift-v1'])assert.equal(javascriptCalibrationCase(old).source.slice(0,253),prefix);
 for(const old of javascriptNamedIds.filter(k=>k.startsWith('B-')))assert.equal(javascriptNamedCase(old).source.slice(0,253),prefix);
});

for(const [name,change]of Object.entries({source:p=>p.source=p.source.replace('\n\n','\n'),index:p=>p.source=p.source.replace('Get(4,','Get(3,'),
 digest:p=>p.source_sha256=javascriptCalibrationCase('K2-sync-v1').source_sha256,future:p=>p.calibration_id='K5',
 mixed:p=>p.named_case_id='B-get-case',fixture:p=>p.input_fixture_id='real',schema:p=>p.schema_mode='declared'}))test('K4 serialized arm refuses '+name+' before native access',()=>{
 const p={...javascriptCalibrationCase(id),binding:{fixture_id:'integer-safe'}};change(p);
 assert.throws(()=>vm.runInNewContext('('+armJavascriptNativeRoundtrip.toString()+')')(p),/fixed calibration source\/input|fixed stage A\/B\/C source\/input/);
});

for(const text of [diagnostic,diagnostic.replace('6:1','2:3'),diagnostic.replace('6:1','3:3'),diagnostic.replace('6:1','4:1'),
 diagnostic.replace('<main>','<preview>'),diagnostic+'\n   at Anonymous function (<main>:7:1)',
 'Error: JS_CAL_K3_SYNC_SHIFT_V1\n   at module (<main>:1:1)',
 'Error: other\n   at source throw new Error("JS_CAL_K3_SYNC_SHIFT_V1");','unknown line5 col3',
 'Error: JS_CAL_K2_SYNC_V1\n   at Anonymous function (<main>:5:3)'])test('K4 raw diagnostic has no automatic attribution: '+text.slice(0,28)+' '+text.length,()=>{
 const d=calibrationDiagnostic({error_details:text,native_text_length:text.length,native_error_complete:true},id);
 assert.equal(d.controlled_throw_verified,false);assert.equal(d.mapping_status,'unverified');assert.equal(d.rejection_attributed,false);
 assert.equal(d.source_span,null);assert.equal(d.case_complete,false);assert.equal(d.g6_complete,false);assert.equal(d.j25_complete,false);
 if(text.includes('source throw')||text.includes('JS_CAL_K2')||text.startsWith('unknown'))assert.equal(d.literal_header_candidate,false);
 assert.equal(d.literal_header_candidate,false);
 if(text===diagnostic){assert.deepEqual(d.frames.map(f=>[f.line,f.column]),[[6,1],[1,1]]);assert.equal(d.frames[0].raw,text.split('\n')[1]);}
});

for(const route of ['bind','snapshot','read'])for(const [name,change]of Object.entries({future:b=>b.calibration_id='K5',
 other:b=>b.calibration_id='K2-sync-v1',mixed:b=>b.named_case_id='B-get-case',output:b=>b.roundtrip_role='output',
 source:b=>b.source_sha256='0'.repeat(64),fixture:b=>b.input_fixture_id='real'}))test('K4 '+route+' refuses '+name+' before upstream transport',async()=>{
 const s=await failedStage(id,{message:diagnostic}),failed=await s.seal(),f=s.x.f;
 f.model.FPreviewManager.FPreviewVisible=true;
 const args={...f.b,binding_id:'upstream',roundtrip_role:'upstream',calibration_id:id,input_fixture_id:'integer-safe',source_sha256:s.c.source_sha256,failed_terminal:failed};
 if(route==='bind'){
  change(args);await assert.rejects(()=>f.execute(javascriptNativeRoundtripCode(args)));
 }else{
  const binding=await f.execute(javascriptNativeRoundtripCode(args));change(binding);
  if(route==='snapshot')await assert.rejects(async()=>f.page.evaluate(javascriptNativeRoundtripSnapshot,binding));
  else await assert.rejects(()=>readJavascriptNativeRoundtrip(f.page,binding,decodeVariantFrame,{operationId:'upstream'}));
 }
 assert.deepEqual(f.counters,{sent:4,requests:4,responses:4});
 assert.equal(f.env.__loginomJavascriptNativeRoundtripV1.bindings.has('output'),false);
});

for(const mode of ['ok','pending','retired','source','input-field','other-id','mixed','release','uncertain'])test('K4 actual runtime final evidence check '+mode,async()=>{
 const r=await readFailed(await failedStage(id,{message:diagnostic})),f=r.x.f;
 if(mode==='pending')f.env.__loginomJavascriptNativeRoundtripReadV1.active={pending:1};
 if(mode==='retired')f.env.__loginomJavascriptNativeRoundtripReadV1.poisoned=true;
 if(mode==='source')f.env.__loginomJavascriptNativeRoundtripV1.source+=' ';
 if(mode==='input-field')f.env.__loginomJavascriptNativeRoundtripV1.input.field.Name='Other';
 if(mode==='mixed')f.env.__loginomJavascriptNativeRoundtripV1={...f.env.__loginomJavascriptNativeRoundtripV1,named_case_id:'B-get-case'};
 if(mode==='release')f.env.__loginomJavascriptNativeRoundtripReadV1.last.releasedResponses=0;
 const source=await readFile(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    async checkNativeNamedEvidence() {'),end=source.indexOf('    async readNativeRoundtrip(',start);
 let validated=0;
 const check=vm.runInNewContext('({'+source.slice(start,end)+'})',{nativeCalibrationId:mode==='other-id'?'K2-sync-v1':id,nativeNamedCaseId:undefined,
  nativeReadUncertain:mode==='uncertain',validateNativeSource:()=>{validated++;},page:f.page});
 if(mode==='ok'){await check.checkNativeNamedEvidence();assert.equal(validated,1);}else await assert.rejects(()=>check.checkNativeNamedEvidence());
 assert.deepEqual(f.counters,{sent:8,requests:8,responses:8});
});
