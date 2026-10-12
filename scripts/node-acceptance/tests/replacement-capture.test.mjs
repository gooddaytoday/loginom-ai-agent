import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {makeReplacementCaptureCode} from '../replacement-capture.mjs';
import {captureFixture} from './fixtures/replacement-capture/fixture.mjs';
const request=f=>({binding:structuredClone(f.binding),account:'lab-73-monkey-47274bad-b33b-4a2a-bf2d-60b0c951c36e',package_path:f.packagePath,origin:'https://loginom.test',build:'7.4.2',port_guid:f.proof.result.input_port.port_guid,opening_operation_id:f.proof.result.input_port.opening_operation_id});
const execute=(f,r)=>vm.runInContext('('+makeReplacementCaptureCode(r)+')',f.page.context)(f.page);
test('fixed diagnostic consumer uses real native reader and complete serialized observer; zero gestures and no admission',async()=>{
 const f=await captureFixture(),r=await execute(f,request(f));
 assert.equal(r.status,'DIAGNOSTIC_READ',r.reason);assert.equal(r.effect_possible,false);assert.equal(r.native_capture_admitted,false);assert.equal(r.native_before.input_port.port,0);assert.deepEqual(r.native_before,r.native_after);
 assert.equal(r.raw.grids[0].store.bound,false); // historical fixture has no complete local store proof
 assert.equal(r.raw.grids[0].rows.length,5);assert.equal(r.raw.grids[0].rows[0].cells.length,5);assert.equal(r.raw.controls.find(c=>c.tid.endsWith(';rbTable')).checked,true);
 assert.equal(r.observation.output.wizard.output_columns.definition_coverage.count,5);assert.ok(Object.values(r.gates).every(g=>g==='not_verified'));assert.equal(r.raw.semantic_connections_verified,false);assert.deepEqual(f.page.events,[]);
});
for(const key of ['native_context','readiness','snapshot','mode','action','verified','admission','page','runtime'])test('reject supplied '+key+' before any read',async()=>{
 const f=await captureFixture();assert.throws(()=>makeReplacementCaptureCode({...request(f),[key]:key==='mode'?'act':true}),/EXACT_REPLACEMENT/);assert.deepEqual(f.page.events,[]);
});
for(const [key,value] of [['account','foreign'],['package_path','/foreign/no.lgp'],['build','other'],['port_guid','foreign-port'],['opening_operation_id','foreign-opening']])test('linked input mismatch '+key,async()=>{
 const f=await captureFixture(),q={...request(f),[key]:value};if(key==='account')q.package_path='/foreign/no.lgp';
 if(key==='package_path')assert.throws(()=>makeReplacementCaptureCode(q),/OWN_REPLACEMENT/);
 else{const r=await execute(f,q);assert.equal(r.status,'NOT_APPLIED');assert.equal(r.effect_possible,false);assert.equal(r.native_capture_admitted,false);}
 assert.deepEqual(f.page.events,[]);
});
test('native wrong port refuses without observer or gesture',async()=>{const f=await captureFixture('foreign');const r=await execute(f,request(f));assert.equal(r.reason,'replacement_capture_native_binding');assert.equal(r.effect_possible,false);assert.deepEqual(f.page.events,[]);});
test('raw read loss is not retried and raw cause is preserved',async()=>{
 const f=await captureFixture(),original=f.page.evaluate.bind(f.page),cause=Error('synthetic lost raw reply');let raw=0;
 f.page.evaluate=(fn,arg)=>{if(String(fn).includes('semantic_connections_verified')){raw++;throw cause;}return original(fn,arg)};
 await assert.rejects(execute(f,request(f)),e=>e===cause);assert.equal(raw,1);assert.deepEqual(f.page.events,[]);
});
test('native binding changes across raw await refuses mixed evidence',async()=>{
 const f=await captureFixture(),original=f.page.evaluate.bind(f.page);f.page.evaluate=async(fn,arg)=>{const result=await original(fn,arg);if(String(fn).includes('semantic_connections_verified'))f.port.FIndex=1;return result;};
 const r=await execute(f,request(f));assert.equal(r.reason,'replacement_capture_changed');assert.equal(r.effect_possible,false);assert.deepEqual(f.page.events,[]);
});
test('page schema remains explicit; malformed/null options are rejected',async()=>{
 const f=await captureFixture();for(const p of [null,{offset:-1,limit:5},{offset:0,limit:0},{offset:0,limit:9},{offset:0,limit:5,verified:true}])assert.throws(()=>makeReplacementCaptureCode({...request(f),output_column_page:p}));
});
for(const [label,mutate] of [
 ['missing opening receipt',f=>f.f.prep.inputPortOpenReceipts.clear()],
 ['conflicting peer receipt',f=>f.f.prep.receipts.set('peer',{...f.f.record,packageNode:{}})],
 ['changed original request',f=>f.f.record.request='changed'],
 ['foreign document',f=>f.f.prep.id='foreign'],
 ['same account on foreign connection',f=>f.f.main.FMapTree.FServerConnection={UserName:request(f).account}],
])test('real authority reader refusal: '+label,async()=>{const f=await captureFixture();mutate(f);const r=await execute(f,request(f));assert.equal(r.status,'NOT_APPLIED');assert.equal(r.effect_possible,false);assert.equal(r.native_capture_admitted,false);assert.deepEqual(f.page.events,[]);});
test('compiled request is pinned; caller mutation cannot redirect capture',async()=>{
 const f=await captureFixture(),q=request(f),code=makeReplacementCaptureCode(q);q.binding.node.node_id='foreign';q.account='foreign';
 const r=await vm.runInContext('('+code+')',f.page.context)(f.page);assert.equal(r.status,'DIAGNOSTIC_READ');assert.equal(r.identity.account,request(f).account);assert.deepEqual(f.page.events,[]);
});
test('raw geometry changes across final await refuse mixed capture',async()=>{
 const f=await captureFixture(),original=f.page.evaluate.bind(f.page);let seen=false;
 f.page.evaluate=async(fn,arg)=>{const r=await original(fn,arg);if(String(fn).includes('semantic_connections_verified')&&!seen){seen=true;f.bodyGrid.scrollHeight=999;}return r};
 const r=await execute(f,request(f));assert.equal(r.status,'NOT_APPLIED');assert.equal(r.effect_possible,false);assert.deepEqual(f.page.events,[]);
});
test('owned SVG/CTM is raw capture, never semantic or Links admission',async()=>{
 const f=await captureFixture(),svg=f.page.add('svg',null,'',{x:600,y:300,width:100,height:100},f.form),path=f.page.add('path',null,'',{x:600,y:300,width:100,height:100},svg);path.attrs.d='M 0 0 L 100 100';path.getScreenCTM=()=>({a:1,b:0,c:0,d:1,e:600,f:300});
 const outside=f.page.add('svg',null,'',{x:0,y:0,width:10,height:10});f.page.add('path',null,'',undefined,outside).attrs.d='foreign';
 const r=await execute(f,request(f));assert.equal(r.status,'DIAGNOSTIC_READ');assert.equal(r.raw.svg.length,1);assert.equal(r.raw.svg[0].paths[0].d,path.attrs.d);assert.equal(r.raw.svg[0].paths[0].ctm.e,600);assert.equal(r.raw.semantic_connections_verified,false);assert.equal(r.gates.native_semantic_mapping,'not_verified');assert.equal(r.native_capture_admitted,false);assert.deepEqual(f.page.events,[]);
});
for(const [label,cause]of [['undefined',undefined],['null',null],['false',false],['0',0],['empty','']])test('lost raw read preserves exact '+label+' without retry',async()=>{
 const f=await captureFixture(),original=f.page.evaluate.bind(f.page);let calls=0,caught=false,value;
 f.page.evaluate=(fn,arg)=>{if(String(fn).includes('semantic_connections_verified')){calls++;throw cause;}return original(fn,arg)};
 try{await execute(f,request(f))}catch(e){caught=true;value=e}assert.equal(caught,true);assert.equal(value,cause);assert.equal(calls,1);assert.deepEqual(f.page.events,[]);
});
