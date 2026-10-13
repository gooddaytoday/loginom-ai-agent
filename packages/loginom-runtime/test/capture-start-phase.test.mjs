import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateStartInput} from '../src/start-input.mjs';
import {retainFPManagedStartup} from '../src/fp-managed-startup.mjs';
function fixture(){
 const deadline=Date.now()+60000,binding={revision:1,harness:'field-parameters-preservation-v1',owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'ownchat',account:'worker',packagePath:'/worker/fp.lgp',admission:'original',expires:deadline};
 const input={protocol:1,generation:1,chat:'ownchat',stateDir:'/own',connection:{username:'worker'},acceptanceCapture:binding,
  fpStartup:{requestId:'outer_original',authorization:'a'.repeat(64),harness:binding.harness,deadline,phase:'capture',binding:{...binding}}};
 return {input,deadline};
}
test('strict acquired-chat phase matches original capture tuple',()=>{const {input}=fixture();assert.equal(validateStartInput(input).fpStartup,input.fpStartup)});
for(const key of ['owner','run','lease','generation','chat','account','packagePath','expires'])test('foreign capture binding '+key,()=>{const {input}=fixture();input.fpStartup.binding[key]=key==='generation'||key==='expires'?0:'foreign';assert.throws(()=>validateStartInput(input),/LOGINOM_START_INVALID/)});
test('readiness cannot be relabelled capture',()=>{const {input}=fixture();input.chat='readiness';assert.throws(()=>validateStartInput(input),/LOGINOM_START_INVALID/)});
test('old readiness tuple cannot qualify acquired chat',()=>{const {input}=fixture();delete input.fpStartup.phase;delete input.fpStartup.binding;assert.throws(()=>validateStartInput(input),/LOGINOM_START_INVALID/)});
test('Amount cannot impersonate FP capture purpose',()=>{const {input}=fixture();input.fpStartup.harness=input.acceptanceCapture.harness=input.fpStartup.binding.harness='amount-import-type-v1';assert.throws(()=>validateStartInput(input),/LOGINOM_START_INVALID/)});
for(const value of [false,0,undefined])test('capture-phase same-child cancel and genuine equal secondary '+String(value),()=>{
 const {input,deadline}=fixture(),controller=new AbortController(),state={startupController:controller},message={id:'managed_original',input,deadline};
 const startup=retainFPManagedStartup(message,input,state,controller);
 try{
  const cancel={phase:'startup',requestId:message.id,startupRequestId:input.fpStartup.requestId,authorization:input.fpStartup.authorization,harness:input.fpStartup.harness,deadline,bindingPhase:'capture',captureBinding:{...input.acceptanceCapture},rejection:{kind:'value',value:value??null,is_undefined:value===undefined}};
  assert.equal(startup.cancel({...cancel,captureBinding:{...cancel.captureBinding,run:'foreign'}}),false);
  assert.equal(startup.cancel(cancel),true);assert.equal(startup.pending,true);
  assert.equal(startup.propagate(value),value);assert.equal(startup.secondary,undefined);
  assert.equal(startup.reject(value),value);assert.deepEqual(startup.secondary,{value});
 }finally{startup.settle()}
 assert.equal(startup.pending,false);
});
test('original capture packet drift after retained await refuses',()=>{const {input,deadline}=fixture(),controller=new AbortController(),state={startupController:controller};const startup=retainFPManagedStartup({id:'managed_original',input,deadline},input,state,controller);try{input.fpStartup.binding.run='changed';assert.throws(()=>startup.guard(),/LOGINOM_STARTUP_OWNER_CHANGED/)}finally{startup.settle()}});
