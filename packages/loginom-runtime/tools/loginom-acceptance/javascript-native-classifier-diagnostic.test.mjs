import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {diagnoseJavascriptNativeClassifier,captureJavascriptNativeClassifierDiagnostic} from './javascript-native-classifier-diagnostic.mjs';

function run(change='') {
  const sandbox=vm.createContext({});
  vm.runInContext(`
    globalThis.calls={getter:0,state:0,tab:0};
    const element={getAttribute:()=> 'MF;TF-1;Graph;NativeInput'};
    const container={contains:e=>e===element,querySelectorAll:()=>[element]};
    const cell={},node={FGuid:'n',FCell:cell,FIconCls:'bg-vendor-icon-importtextfile'};
    const view={getState(c){calls.state++;if(c!==cell)throw Error('wrong cell');return {shape:{node:element}};}};
    const graph={container,view},diagram={FmxGraph:graph,FNodes:{FCollection:[node]}};
    class ModelForm {}
    const model=new ModelForm();model.FDiagram=diagram;
    const card={Controller:{FController:model}},workspace={getActiveTab(){calls.tab++;return card;}};
    globalThis.bg={app:{ModelForm,Application:{FInstance:{FMainForm:{Items:{Workspace:workspace}}}}}};
    globalThis.document={querySelectorAll:()=>[container]};
    globalThis.binding={context:{verified:true,surface:'graph',node_id:'n',tid:'MF;TF-1;Graph;NativeInput'},prefix:'MF;TF-1'};
    ${change}
  `,sandbox);
  const output=vm.runInContext(`(${diagnoseJavascriptNativeClassifier.toString()})(binding)`,sandbox);
  return {output:JSON.parse(JSON.stringify(output)),calls:JSON.parse(JSON.stringify(sandbox.calls))};
}

test('serialized own-data path proves target gates without leaking values',()=>{
  const {output,calls}=run();assert.equal(output.status,'observed');assert.equal(output.first_failed,null);
  assert.equal(output.gates.unique_tid,true);assert.equal(output.script,false);
  assert.deepEqual(calls,{getter:0,state:1,tab:1});
  assert.ok(!JSON.stringify(output).includes('NativeInput'));assert.ok(!JSON.stringify(output).includes('importtextfile'));
});
for(const [name,change,gate] of [
  ['missing','delete bg.app.Application','Application'],
  ['inherited data','Object.setPrototypeOf(bg.app,{Application:bg.app.Application});delete bg.app.Application','Application'],
  ['accessor','Object.defineProperty(bg.app,"Application",{get(){calls.getter++;throw Error("SECRET");}})','Application'],
  ['deep prototype bound','let p={Application:bg.app.Application};for(let i=0;i<9;i++)p=Object.create(p);Object.setPrototypeOf(bg.app,p);delete bg.app.Application','Application'],
  ['wrong model class','bg.app.ModelForm=class Other {}','instanceof'],
  ['model class accessor','Object.defineProperty(bg.app,"ModelForm",{get(){calls.getter++;return ModelForm;}})','model_class'],
  ['custom instanceof getter','Object.defineProperty(ModelForm,Symbol.hasInstance,{get(){calls.getter++;return ()=>true;}})','instanceof_unavailable'],
  ['wrong container','graph.container={}','container'],
  ['holey collection','diagram.FNodes.FCollection.length=2','dense_nodes'],
  ['collection accessor','Object.defineProperty(diagram.FNodes.FCollection,"0",{get(){calls.getter++;return node;}})','dense_nodes'],
  ['oversized collection','diagram.FNodes.FCollection=Array(201).fill(node)','dense_nodes'],
  ['missing renderer method','delete view.getState','getState'],
  ['renderer method accessor','Object.defineProperty(view,"getState",{get(){calls.getter++;return ()=>({});}})','getState'],
  ['inherited guid','Object.setPrototypeOf(node,{FGuid:node.FGuid});delete node.FGuid','target_guid'],
  ['duplicate guid','diagram.FNodes.FCollection.push({...node})','target_guid'],
  ['icon accessor','Object.defineProperty(node,"FIconCls",{get(){calls.getter++;return "bg-vendor-icon-importtextfile";}})','icon'],
  ['inherited icon','Object.setPrototypeOf(node,{FIconCls:node.FIconCls});delete node.FIconCls','icon'],
  ['wrong renderer','view.getState=()=>({shape:{node:{}}});container.contains=()=>false','renderer'],
  ['shape accessor','view.getState=()=>Object.defineProperty({},"shape",{get(){calls.getter++;return {node:element};}})','shape'],
  ['duplicate rendered tid','container.querySelectorAll=()=>[element,element]','unique_tid'],
  ['renderer throws','view.getState=()=>{throw Error("SECRET")}','diagnostic_exception'],
  ['no prepared context','binding.context.verified=false','prepared_context'],
  ['global accessor','const held=bg;Object.defineProperty(globalThis,"bg",{get(){calls.getter++;return held;}})','bg'],
])test(name,()=>{
  const {output,calls}=run(change);assert.equal(output.first_failed,gate);assert.equal(output.status,'unavailable');
  assert.equal(calls.getter,0);assert.ok(!JSON.stringify(output).includes('SECRET'));
  if(['bg','Application','model_class','instanceof','instanceof_unavailable','container','dense_nodes','getState','target_guid','icon','prepared_context'].includes(gate))assert.equal(calls.state,0);
  if(['bg','instanceof_unavailable','prepared_context','target_guid','diagnostic_exception'].includes(gate))assert.equal(output.failure_scope,'diagnostic_only');
  if(name==='inherited guid')assert.equal(output.node_fields.FGuid.inherited_data,1);
  if(name==='inherited data')assert.deepEqual(output.descriptors.at(-1),{field:'Application',owner_depth:1,kind:'data',type:'object'});
});

test('inherited renderer method is allowed, inherited renderer data is not',()=>{
  assert.equal(run('Object.setPrototypeOf(view,{getState:view.getState});delete view.getState').output.status,'observed');
  assert.equal(run('view.getState=()=>Object.create({shape:{node:element}})').output.first_failed,'shape');
});

test('failure capture executes once only for exact private stage',async()=>{
  let count=0;
  const page={evaluate:async(fn)=>{count++;assert.equal(fn,diagnoseJavascriptNativeClassifier);return run().output;}};
  for(const args of [{nativeRoundtrip:false,stage:'prepare-typed-input',page},{nativeRoundtrip:true,stage:'other',page},{nativeRoundtrip:true,stage:'prepare-typed-input'}])assert.equal(await captureJavascriptNativeClassifierDiagnostic(args),undefined);
  assert.equal(count,0);
  assert.equal((await captureJavascriptNativeClassifierDiagnostic({nativeRoundtrip:true,stage:'prepare-typed-input',page})).status,'observed');assert.equal(count,1);
});

for(const transportFails of [false,true])test('actual live catch/finally retains original failure and cleanup: transport='+transportFails,async()=>{
  const source=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8');
  const start=source.lastIndexOf("} catch(error) {\n  report.status='FAILED';"),end=source.lastIndexOf('\n\n}\nif(process.argv');
  assert.ok(start>0&&end>start);
  const events=[];
  const sandbox=vm.createContext({captureJavascriptNativeClassifierDiagnostic,
    evaluateDiagnostic:async(fn,binding)=>{events.push('diagnostic');assert.equal(fn,diagnoseJavascriptNativeClassifier);assert.equal(binding.context.node_id,'n');if(transportFails)throw Error('SECRET');return run().output;},
    closed:()=>events.push('browser-close')});
  const outcome=await vm.runInContext(`(async()=>{
    const report={stage:'prepare-typed-input',cleanup:{package_closed:false,logged_out:false,browser_closed:false}},redactor={redact:x=>x,text:x=>x},javascriptProbeFailure=e=>({message:e.message});
    const nativeRoundtrip=true,nativeClassifierBinding={context:{node_id:'n'}},discoveryProbe=false;
    let cleaning=false;
    const executionRuntime=null,paletteAdmission=null,createDeadline=0,packageHandle=null,owner=null,initialOpening={},openedWizard=false,browserLifecycle=null;
    const noop=async()=>{}, locator={filter(){return this},locator(){return this},waitFor:noop,innerText:async()=> 'account'};
    const page={evaluate:evaluateDiagnostic,locator:()=>locator,waitForFunction:noop};
    const snapshot=noop,paletteSnapshot=noop,refusalEvidence=noop,requireJavascriptInitialOpeningCleanup=()=>{},guard=async()=>({packages:0}),exact=()=>locator,click=noop,save=noop;
    const config={username:'account'},directory='/private-evidence',console={log:()=>{}},process={exitCode:0};
    const session={context:{close:async()=>closed()}};
    try {throw Error('original');${source.slice(start,end)}
    return {report,cleaning,exitCode:process.exitCode};
  })()`,sandbox);
  assert.equal(outcome.report.failure.message,'original');assert.equal(outcome.report.failure.stage,'prepare-typed-input');
  assert.equal(outcome.report.native_classifier_diagnostic.status,transportFails?'unavailable':'observed');
  assert.deepEqual(JSON.parse(JSON.stringify(outcome.report.cleanup)),{package_closed:true,logged_out:true,browser_closed:true,stage:'logout'});
  assert.equal(outcome.cleaning,true);assert.equal(outcome.exitCode,1);assert.equal(outcome.report.status,'FAILED');
  assert.deepEqual(events,['diagnostic','browser-close']);assert.ok(!JSON.stringify(outcome).includes('SECRET'));
});

test('actual journal integration retains only verified completed graph binding after persistence',async()=>{
  const source=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('const executionRecord=async event=>{'),source.indexOf('const createRemaining='));
  const sandbox=vm.createContext({});
  const result=await vm.runInContext(`(async()=>{
    let nativeClassifierBinding,executionJournalLine=0;
    const nativeRoundtrip=true,discoveryProbe=false,report={stage:'prepare-typed-input'},save=async()=>{},compactJavascriptJournalRecord=()=>({});
    let persist=true;
    const executionJournal=async e=>{if(!persist)throw Error('journal failure');return e;};
    ${code}
    const event={phase:'node_observation_completed',outcome:{output:{prepared_node_context:{verified:true,surface:'graph',node_id:'n',tid:'MF;TF-1;Graph;NativeInput',extra:'SECRET'},workflow_ref:{prefix:'MF;TF-1'}}}};
    await executionRecord({...event,phase:'node_observation_sample'});
    const sampleIgnored=nativeClassifierBinding===undefined;
    await executionRecord(event);const binding=nativeClassifierBinding;
    nativeClassifierBinding=undefined;persist=false;
    try {await executionRecord(event);}catch{}
    return {sampleIgnored,binding,failedPersistenceIgnored:nativeClassifierBinding===undefined};
  })()`,sandbox);
  assert.equal(result.sampleIgnored,true);assert.equal(result.failedPersistenceIgnored,true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.binding)),{context:{verified:true,surface:'graph',node_id:'n',tid:'MF;TF-1;Graph;NativeInput'},prefix:'MF;TF-1'});
});
