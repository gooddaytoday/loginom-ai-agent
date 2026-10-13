import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateStartInput} from '../src/start-input.mjs';
import {retainAmountManagedStartup} from '../src/fp-managed-startup.mjs';
function fixture(){
 const deadline=Date.now()+60000,binding={revision:1,harness:'amount-import-type-v1',owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'ownchat',account:'worker',packagePath:'/worker/amount.lgp',admission:'original',expires:deadline};
 const input={protocol:1,generation:1,chat:'ownchat',stateDir:'/own',connection:{username:'worker'},acceptanceCapture:binding,
  amountStartup:{requestId:'outer_original',authorization:'a'.repeat(64),purpose:binding.harness,operation:'original_operation',request:'original_request',deadline,phase:'capture',binding:{...binding}}};
 return {input,deadline};
}
test('distinct Amount capture packet retains operation/request without FP alias',()=>{const {input}=fixture();assert.equal(validateStartInput(input).amountStartup,input.amountStartup);assert.equal(validateStartInput(input).fpStartup,undefined)});
for(const key of ['owner','run','lease','generation','chat','account','packagePath','expires'])test('foreign Amount binding '+key,()=>{const {input}=fixture();input.amountStartup.binding[key]=key==='generation'||key==='expires'?0:'foreign';assert.throws(()=>validateStartInput(input),/LOGINOM_START_INVALID/)});
for(const mode of ['fp-alias','dual-purpose','missing-operation','missing-request','missing-provider','late-deadline','readiness-capture','extra-key'])test('strict Amount refuses '+mode,()=>{
 const {input}=fixture();
 if(mode==='fp-alias'){input.fpStartup=input.amountStartup;delete input.amountStartup}
 if(mode==='dual-purpose')input.fpStartup={requestId:'original',authorization:'a'.repeat(64),harness:'field-parameters-preservation-v1',deadline:input.amountStartup.deadline};
 if(mode==='missing-operation')delete input.amountStartup.operation;
 if(mode==='missing-request')delete input.amountStartup.request;
 if(mode==='missing-provider'){delete input.amountStartup.phase;delete input.amountStartup.binding}
 if(mode==='late-deadline')input.amountStartup.deadline=Date.now()-1;
 if(mode==='readiness-capture')input.chat='readiness';
 if(mode==='extra-key')input.amountStartup.ready=true;
 assert.throws(()=>validateStartInput(input),/LOGINOM_START_INVALID/);
});
for(const value of [false,0,undefined])test('Amount cancel and genuine equal secondary '+String(value),()=>{
 const {input,deadline}=fixture(),controller=new AbortController(),state={startupController:controller},message={id:'managed_original',input,deadline};
 const startup=retainAmountManagedStartup(message,input,state,controller);
 try{
  const cancel={phase:'startup',requestId:message.id,startupRequestId:input.amountStartup.requestId,authorization:input.amountStartup.authorization,harness:input.amountStartup.purpose,operation:input.amountStartup.operation,request:input.amountStartup.request,deadline,bindingPhase:'capture',captureBinding:{...input.acceptanceCapture},rejection:{kind:'value',value:value??null,is_undefined:value===undefined}};
  for(const key of ['requestId','startupRequestId','authorization','harness','operation','request','deadline'])assert.equal(startup.cancel({...cancel,[key]:key==='deadline'?deadline-1:'foreign'}),false);
  assert.equal(startup.cancel({...cancel,captureBinding:{...cancel.captureBinding,run:'foreign'}}),false);
  assert.equal(startup.cancel(cancel),true);assert.equal(startup.pending,true);
  assert.equal(startup.propagate(value),value);assert.equal(startup.secondary,undefined);
  assert.equal(startup.reject(value),value);assert.deepEqual(startup.secondary,{value});
 }finally{startup.settle()}
 assert.equal(startup.pending,false);
});
for(const mode of ['operation','request','copy','owner','signal','disposal'])test('original Amount retention refuses '+mode,()=>{
 const {input,deadline}=fixture(),controller=new AbortController(),state={startupController:controller},message={id:'managed_original',input,deadline};
 const startup=retainAmountManagedStartup(message,input,state,controller);
 try{
  if(mode==='operation'||mode==='request')input.amountStartup[mode]='replaced';
  if(mode==='copy')input.amountStartup={...input.amountStartup};
  if(mode==='owner'){state.startupOwner={directory:'/own',generation:1,chat:'ownchat',signal:controller.signal,deadline};startup.bindOwner(state.startupOwner);state.startupOwner={...state.startupOwner}}
  if(mode==='signal')state.startupController=new AbortController();
  if(mode==='disposal'){startup.settle();assert.equal(startup.cancel({}),false);return}
  assert.throws(()=>startup.guard(),/LOGINOM_STARTUP_OWNER_CHANGED/);
 }finally{startup.settle()}
});
