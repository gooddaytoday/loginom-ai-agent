import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {roundtrip} from './javascript-native-roundtrip.test.mjs';
import {beginCalibrationWizard,readCalibrationWizard,captureCalibrationWizard,finishCalibrationWizardObservation} from './javascript-calibration-wizard.mjs';
import {javascriptStageTerminal,waitJavascriptStageObservation} from './javascript-stage-observer.mjs';

async function wizard(prior=null,nativeArrays=false){
 const x=await roundtrip({fixtureId:'integer-safe',calibrationId:'K1-parse-v1',wizardOnly:true});
 if(!nativeArrays)x.f.env.Array=Array;
 const model=x.f.env.__loginomJavascriptNativeRoundtripV1.schemaWitness.model;
 model.FException=prior;
 const args={id:'K1-parse-v1',stage:'next',identity:x.identity,deadline:x.f.b.deadline};
 const baseline=await x.f.page.evaluate(beginCalibrationWizard,args);
 const read=()=>x.f.page.evaluate(readCalibrationWizard);
 const capture=async(observation)=>{
  const before={...x.before,messages:[]},after={...before,native_owner_verified:true,calibration_native_exception:observation??await read()};
  return x.f.page.evaluate(captureCalibrationWizard,{...args,before,after});
 };
 return {x,model,args,baseline,read,capture};
}

test('serialized wizard captures complete own-data inner tree, preserving whitespace/name/stack without DOM novelty',async()=>{
 const w=await wizard({message:'prior error'});
 w.model.FException={message:' wrapper \r\n',name:'Exception',innerException:
  {message:'Syntax fixture\nsecond line',name:'SyntaxError',stack:'browser stack, not Chakra mapping',innerException:{message:'leaf',name:'Error'}}};
 const native=await w.read(),proof=await w.capture(native);
 assert.equal(native.native_text_complete,true);assert.equal(native.normalization_applied,'none');assert.equal(native.truncated,false);
 assert.equal(native.tree.message,' wrapper \r\n');assert.equal(native.tree.children.length,1);
 assert.equal(native.tree.children[0].stack_provenance,'native_exception_own_stack_origin_unverified');
 assert.equal(native.tree.children[0].children[0].message,'leaf');assert.equal(proof.messages.length,0);
 assert.equal(proof.explicit_execute_dispatched,false);assert.equal(proof.implicit_execution,'unknown');
 assert.equal(proof.committed_source_status,'not_established');assert.equal(proof.source_span,undefined);
 assert.equal(w.x.f.counters.sent,4);
 await assert.rejects(async()=>w.capture(native),/reserved/);
});

test('fresh native exception completes stage wait even with identical or absent tooltip IDs',async()=>{
 const w=await wizard();w.model.FException={message:'no new DOM message'};
 const before={owner_verified:true,wizard_visible:true,pending:false,page_tid:'code',messages:[]};
 let polls=0;
 const after=await waitJavascriptStageObservation({stage:'next',before,identity:w.args.identity,deadline:Date.now()+1000,
  read:async()=>{polls++;return {...before,native_owner_verified:true,calibration_native_exception:await w.read()};},
  wait:async()=>assert.fail('no wait after fresh diagnostic'),record:async e=>e});
 assert.equal(polls,1);assert.equal(javascriptStageTerminal({stage:'next',before,after}),true);
 assert.equal(javascriptStageTerminal({stage:'next',before,after:{...after,pending:true}}),false);
 assert.equal(javascriptStageTerminal({stage:'next',before,after:{...after,calibration_native_exception:{present:true,fresh:false,native_owner_verified:true}}}),false);
 await w.capture(after.calibration_native_exception);
});

for(const [fault,build]of Object.entries({
 accessor:()=>Object.defineProperty({message:'x'},'stack',{get(){assert.fail('stack getter invoked');}}),
 inherited:()=>Object.assign(Object.create({name:'Error'}),{message:'x'}),
 unknown:()=>({message:'x',serverDetails:'omitted information'}),
 wrongType:()=>({message:12}),
 long:()=>({message:'x'.repeat(8193)}),
 cycle:()=>{const e={message:'x'};e.innerException=e;return e;},
 depth:()=>Array.from({length:10}).reduce(e=>({message:'x',innerException:e}),{message:'leaf'}),
 total:()=>({message:'root',FInnerExceptions:Array.from({length:5},()=>({message:'x'.repeat(8192)}))}),
 wide:()=>({message:'root',FInnerExceptions:Array.from({length:33},()=>({message:'x'}))}),
 sparse:()=>({message:'root',FInnerExceptions:new Array(2)}),
 arrayGetter:()=>({message:'root',FInnerExceptions:Object.defineProperty([],'0',{get(){assert.fail('child getter invoked');}})}),
 mixed:()=>({message:'root',innerException:{message:'one'},FInnerExceptions:[{message:'two'}]}),
 legacyUnproved:()=>({_message:'ss storage does not prove global Exception',_innerException:null,_error:{stack:'host'}})
}))test('serialized wizard refuses completeness for '+fault+' without invoking getters',async()=>{
 const w=await wizard();w.model.FException=build();
 const native=await w.read();assert.equal(native.native_text_complete,false);assert.equal(native.tree,null);assert.equal(native.position_status,'incomplete');
 assert.match(native.refusal,/Calibration wizard:/);assert.equal((await w.capture(native)).native_text_complete,false);
 assert.equal(w.x.f.counters.sent,4);
});

test('8192-unit diagnostic boundary preserves full message and explicitly absent class/stack',async()=>{
 const w=await wizard();w.model.FException={message:'x'.repeat(8192)};
 const n=await w.read();assert.equal(n.native_text_complete,true);assert.equal(n.text_units,8192);
 assert.equal(n.tree.name,null);assert.equal(n.tree.class_provenance,'absent');assert.equal(n.tree.stack,null);
});

for(const change of ['same-root','reused-child','mutated-text','equal-replaced-child','disappeared','source','owner','deadline','capability'])test('wizard recheck rejects '+change,async()=>{
 const prior={message:'prior'},w=await wizard(prior);
 w.model.FException={message:'new',innerException:{message:'leaf'}};
 if(change==='same-root')w.model.FException=prior;
 if(change==='reused-child')w.model.FException.innerException=prior;
 if(change==='same-root'||change==='reused-child'){await assert.rejects(async()=>w.read(),/stale/);return;}
 const first=await w.read();
 if(change==='mutated-text')w.model.FException.innerException.message='changed';
 if(change==='equal-replaced-child')w.model.FException.innerException={message:'leaf'};
 if(change==='disappeared')w.model.FException=null;
 if(change==='source')w.x.lines[0]+=' ';
 if(change==='owner')w.x.f.env.bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController={};
 if(change==='deadline')w.x.f.env.Date={now:()=>w.args.deadline+1};
 if(change==='capability')w.x.f.env.__loginomJavascriptNativeRoundtripV1={...w.x.f.env.__loginomJavascriptNativeRoundtripV1};
 await assert.rejects(async()=>w.capture(first));assert.equal(w.x.f.counters.sent,4);
});

test('getter-backed native FException refuses baseline without getter access',async()=>{
 const x=await roundtrip({fixtureId:'integer-safe',calibrationId:'K1-parse-v1',wizardOnly:true});
 Object.defineProperty(x.f.env.__loginomJavascriptNativeRoundtripV1.schemaWitness.model,'FException',{get(){assert.fail('FException getter');}});
 await assert.rejects(async()=>x.f.page.evaluate(beginCalibrationWizard,{id:'K1-parse-v1',stage:'next',identity:x.identity,deadline:x.f.b.deadline}),/accessor/);
});

test('wizard baseline is once per stage and a seen diagnostic cannot be silently discarded',async()=>{
 const w=await wizard();await assert.rejects(async()=>w.x.f.page.evaluate(beginCalibrationWizard,w.args),/pending/);
 assert.equal((await w.read()).present,false);
 await w.x.f.page.evaluate(finishCalibrationWizardObservation);
 await w.x.f.page.evaluate(beginCalibrationWizard,{...w.args,identity:{...w.args.identity,effect_id:'next-2'}});
 w.model.FException={message:'new'};await w.read();
 await assert.rejects(async()=>w.x.f.page.evaluate(finishCalibrationWizardObservation),/unconsumed/);
});

async function vendorWizard(){
 const w=await wizard(null,true),fixture=JSON.parse(await readFile(new URL('./fixtures/javascript-calibration-vendor.json',import.meta.url),'utf8'));
 const f=fixture.fragments;
 // Real retained constructor/prototype fragments, executed in the page realm.
 // Only TS inheritance/registration scaffolding is supplied by the test.
 vm.runInContext(`var ss={Exception:(${f.constructor})};
 ss.Exception.__typeName='ss.Exception';
 ss.Exception.prototype.get_message=(${f.get_message});
 ss.Exception.prototype.get_innerException=(${f.get_innerException});
 ss.Exception.prototype.get_stack=(${f.get_stack});
 Object.setPrototypeOf(ss.Exception.prototype,Error.prototype);
 ${f.properties}
 ${f.stack_property}
 var Exception=ss.Exception;
 function __extends(ctor,base){Object.setPrototypeOf(ctor,base);ctor.prototype=Object.create(base.prototype,{constructor:{value:ctor,writable:true,configurable:true}});}
 function initExceptionClass(ctor,name){ctor.__typeName=name;}
 ${f.EBGException}
 ${f.AggregateException}
 var setRpcStack=(${f.set_rpc_stack});
 var vendorError=new bg.AggregateException(' wrapper ',[new Exception('parse fixture'),new bg.EBGException('nested',new Exception('leaf'),0)],0);
 setRpcStack(vendorError,'remote wrapper stack');
 setRpcStack(vendorError.FInnerExceptions[0],'remote parse stack');
 setRpcStack(vendorError.FInnerExceptions[1],'remote nested stack');
 setRpcStack(vendorError.FInnerExceptions[1]._innerException,'remote leaf stack');`,w.x.f.context);
 w.model.FException=w.x.f.env.vendorError;
 return w;
}

test('actual retained global Exception/BG aggregate constructors deliver complete backing tree and RPC closure stack',async()=>{
 const w=await vendorWizard(),n=await w.read();
 assert.equal(n.native_text_complete,true,n.refusal);assert.equal(n.tree.name,'AggregateException');
 assert.equal(n.tree.message,' wrapper ');assert.equal(n.tree.children[0].name,'Exception');
 assert.equal(n.tree.children[0].message,'parse fixture');assert.equal(n.tree.children[1].children[0].message,'leaf');
 assert.equal(n.tree.children[0].stack,'remote parse stack');
 assert.equal(n.tree.children[0].stack_provenance,'native_rpc_stack_closure_source_verified_unattributed');
 assert.equal(n.tree.children[0].class_provenance,'native_constructor_type_name_pinned_name_projection');
 assert.equal(n.source_span,null);assert.equal((await w.capture(n)).native_text_complete,true);
 assert.equal(w.x.f.counters.sent,4);
});

for(const [fault,script]of Object.entries({
 alias:'Exception=function Other(){}',
 getter:'Object.defineProperty(ss.Exception.prototype,"message",{get(){throw Error("must not invoke")}})',
 method:'ss.Exception.prototype.get_innerException=function(){throw Error("must not invoke")}',
 rpcMethod:'vendorError.get_stack=function(){throw Error("must not invoke")}',
 ownGetter:'Object.defineProperty(vendorError,"_message",{get(){throw Error("must not invoke")}})',
 unknownStorage:'vendorError.extraDiagnostic="not silently omitted"',
 inheritedStorage:'delete vendorError._innerException;Object.getPrototypeOf(vendorError)._innerException=null',
 stackBound:'setRpcStack(vendorError,"x".repeat(8193))'
}))test('actual vendor-backed diagnostic rejects '+fault+' without invoking substituted code',async()=>{
 const w=await vendorWizard();vm.runInContext(script,w.x.f.context);
 const n=await w.read();assert.equal(n.native_text_complete,false);assert.match(n.refusal,/Calibration wizard:/);
 assert.doesNotMatch(n.refusal,/must not invoke/);assert.equal(w.x.f.counters.sent,4);
});

test('pinned native backing name override remains observed metadata and closure replacement is refused',async()=>{
 const w=await vendorWizard();w.model.FException._name='Native RPC class';
 const first=await w.read();assert.equal(first.tree.name,'Native RPC class');
 assert.equal(first.tree.class_provenance,'native_exception_own_name_backing');
 vm.runInContext('setRpcStack(vendorError,"remote wrapper stack")',w.x.f.context);
 await assert.rejects(async()=>w.capture(first),/changed after observation/);
});

for(const [fault,script,reason]of [
 ['total','vendorError.FInnerExceptions=Array.from({length:5},()=>{var e=new Exception("x".repeat(8192));setRpcStack(e,"s");return e;})',/total bound/],
 ['nodes','vendorError.FInnerExceptions=Array.from({length:32},()=>{var e=new Exception("x");setRpcStack(e,"s");return e;})',/tree bound/],
 ['wide','vendorError.FInnerExceptions=Array.from({length:33},()=>new Exception("x"))',/dense bounded/],
 ['depth','var e=null;for(var i=0;i<10;i++){e=new Exception("x",e);setRpcStack(e,"s");}vendorError.FInnerExceptions=[e]',/tree bound/],
 ['sparse','vendorError.FInnerExceptions=new Array(2)',/dense bounded/],
 ['getter','Object.defineProperty(vendorError.FInnerExceptions,"0",{get(){throw Error("must not invoke")}})',/accessor/],
 ['extra','vendorError.FInnerExceptions.extra="hidden"',/dense bounded/],
 ['cycle','vendorError.FInnerExceptions=[vendorError]',/cycle/],
 ['aggregate-drift','Object.defineProperty(bg.AggregateException.prototype,"InnerExceptions",{get(){throw Error("must not invoke")}})',/storage provenance/]
])test('actual aggregate tree refuses '+fault+' at its concrete bound/descriptor',async()=>{
 const w=await vendorWizard();vm.runInContext(script,w.x.f.context);
 const n=await w.read();assert.equal(n.native_text_complete,false);assert.match(n.refusal,reason);assert.doesNotMatch(n.refusal,/must not invoke/);
});
