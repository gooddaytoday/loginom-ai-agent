import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {REPLACEMENT_FIXED_ABI,compileReplacementReadContract,validateReplacementReadContract} from '../replacement-fixed-abi.mjs';
import {captureFixture} from './fixtures/replacement-capture/fixture.mjs';
const request=f=>({binding:structuredClone(f.binding),account:'lab-73-monkey-47274bad-b33b-4a2a-bf2d-60b0c951c36e',package_path:f.packagePath,origin:'https://loginom.test',build:'7.4.2',port_guid:f.proof.result.input_port.port_guid,opening_operation_id:f.proof.result.input_port.opening_operation_id});
test('proposed contract composes with existing consumer; never mints authority',async()=>{
 const f=await captureFixture(),q=request(f),code=compileReplacementReadContract(q),r=await vm.runInContext('('+code+')',f.page.context)(f.page);
 assert.equal(validateReplacementReadContract(r,q),r);assert.equal(r.status,'DIAGNOSTIC_READ');assert.equal(REPLACEMENT_FIXED_ABI.admission,false);assert.equal(REPLACEMENT_FIXED_ABI.input,0);assert.deepEqual(f.page.events,[]);
});
for(const key of ['binding','account','package_path','origin','build','port_guid','opening_operation_id'])test('request accessor '+key+' refuses before read',async()=>{
 const f=await captureFixture(),q=request(f);let getters=0;Object.defineProperty(q,key,{enumerable:true,get(){getters++;throw Error('operand evaluated')}});
 assert.throws(()=>compileReplacementReadContract(q),/REPLACEMENT_FIXED_REQUEST/);assert.equal(getters,0);assert.deepEqual(f.page.events,[]);
});
for(const key of ['authority','verified','page','execute','module','callback'])test('no dynamic '+key+' operand',async()=>{const f=await captureFixture(),q=request(f);q[key]=true;assert.throws(()=>compileReplacementReadContract(q),/REPLACEMENT_FIXED_REQUEST/);assert.deepEqual(f.page.events,[])});
test('result ABI refuses foreign proof and affirmative admission; retained gates remain absent',async()=>{
 const f=await captureFixture(),q=request(f),r=await vm.runInContext('('+compileReplacementReadContract(q)+')',f.page.context)(f.page);
 for(const field of ['document_id','workflow_id','node_id']){const changed=structuredClone(r);changed.native_after[field]='foreign';assert.throws(()=>validateReplacementReadContract(changed,q),/REPLACEMENT_FIXED_RESULT/)}
 for(const flag of ['native_capture_admitted','effect_possible','settings_applied','execution_started'])assert.throws(()=>validateReplacementReadContract({...r,[flag]:true},q),/REPLACEMENT_FIXED_RESULT/);
 const changed=structuredClone(r);changed.gates.host_registration='verified';assert.throws(()=>validateReplacementReadContract(changed,q),/REPLACEMENT_FIXED_RESULT/);assert.deepEqual(f.page.events,[]);
 assert.throws(()=>validateReplacementReadContract({...r,gates:{}},q),/REPLACEMENT_FIXED_RESULT/);
});
test('nested accessors/cycles/foreign prototypes refuse before consumer or native reads',async()=>{
 const f=await captureFixture();let getters=0;const q=request(f);Object.defineProperty(q.binding.node,'node_id',{enumerable:true,get(){getters++;throw Error('unexpected getter')}});
 assert.throws(()=>compileReplacementReadContract(q),/REPLACEMENT_FIXED_REQUEST/);assert.equal(getters,0);
 const cycle=request(f);cycle.binding.node.loop=cycle;assert.throws(()=>compileReplacementReadContract(cycle),/REPLACEMENT_FIXED_REQUEST/);
 const foreign=request(f);Object.setPrototypeOf(foreign.binding.node,{foreign:true});assert.throws(()=>compileReplacementReadContract(foreign),/REPLACEMENT_FIXED_REQUEST/);assert.deepEqual(f.page.events,[]);
});
