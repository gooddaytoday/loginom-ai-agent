import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {applyNode} from '../lib/node-apply.mjs';
import {createCandidateNodeSupport,nodeOutputForJournal} from '../lib/node-support.mjs';
import {verifyDeferredTextImportSources} from '../lib/text-import-node.mjs';
import {createNodeReadDrivers} from '../lib/node-read-driver.mjs';
import {createRedactor} from '../lib/redact.mjs';
import {createTabularTransformNodeSupport} from '../lib/calculator-node.mjs';
import {configureJoin} from '../lib/join-procedure.mjs';
import * as executionProcedure from '../lib/node-execution-procedure.mjs';
import * as contract from '../lib/node-read-contract.mjs';

const isUnchangedTransformExecution=contract.isUnchangedTransformExecution??(()=>false);
const workflow={workflow_id:'flow',prefix:'MF;TF',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
function fixture(type,{savedMode='inner',mode='inner',foreign=false,unknown=false,initialStage='join',missingNext=false,foreignAfterNext=false,unknownNext=false,lostLinks=false,unknownAnswer=false}={}){
 const node={document_id:'doc',workflow_id:'flow',node_id:'saved'},calls=[],records=[];
 const request={operation_id:'saved-apply',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
  target:{kind:'existing',type,ref:node},inputs:[],mode:type==='transform.join_data'?mode:'scalar',
  parameters:type==='transform.join_data'?{}:{changes:[]},mappings:[],finish:'execute',
  read:{ports:[0],sample_rows:10,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 let active=false;
 const owner={...node,node_id:foreign?'other':node.node_id,verified:true};
 const state={prepared_node_context:{...owner,surface:'graph'},wizard:{status:'absent'},
  node_join:{verified:true,mode:savedMode,keys:[{left:'A',right:'A'}],node_context:owner},
  node_outputs:{verified:true,node_context:owner,ports:[{index:0,port_guid:'saved-port',active}]},node_processes:{verified:true},ui:{elements:[]}};
 const graph=()=>{state.wizard={status:'absent'};state.prepared_node_context.surface='graph';};
 const wizard=stage=>{
  active=false;state.node_outputs.ports[0].active=false;
  state.wizard={status:'observed',root_tid:'W',stage};state.prepared_node_context.surface='wizard';
  state.ui.elements=[{tid:'W;btnDone',ref:'done',allowed_actions:['finish_wizard']},...(!missingNext?[{tid:'W;btnNext',ref:'next',allowed_actions:['wizard_step']}]:[])];
 };
 const channel={async observe(options){assert.ok(options.ready(state),options.condition);return structuredClone(state);},
  async perform(options){
   if(state.wizard.stage==='input_mapping'){
    assert.ok(options.ready(state));assert.deepEqual({...options.resolve(state)},{verb:'wizard_step',ref:'next',expected_stage:'join'});
    calls.push('next');if(unknownNext)throw Error('Unknown Next reply');
    if(lostLinks){
     state.ui.dialogs=[{text:'Обнаружены связи с несуществующими объектами.',controls:['yes','no','cancel']}];
     state.ui.masks=[{kind:'modal_background',ref:'W'}];
     // The real Next leaves the original input page masked by a portal. Only
     // the private unchanged-read option can preserve links and complete it.
     if(options.preserveJoinMapping!==true)throw Error('WIZARD_STEP_NOT_CONFIRMED');
     calls.push('no');if(unknownAnswer)throw Error('Unknown No reply');
     state.ui.dialogs=[];state.ui.masks=[];
    }
    wizard('join');
    if(foreignAfterNext){state.prepared_node_context.node_id='other';state.node_join.node_context.node_id='other';}
   }else graph();
  },async openOutputPort(){wizard('output_mapping');}};
 const execution={verified:true,owner_verified:true,cleanup_complete:true,status:'completed',execution_id:'fresh',node};
 // Replace browser/execution dependencies only; execute product dispatch, the
 // read-driver methods and the entire applyNode phase machine together.
 const driverContext={
  structuredClone,Date,isUnchangedTransformExecution,isUnchangedTextImportExecution:contract.isUnchangedTextImportExecution,
  need:(ok,message)=>{if(!ok)throw Error(message);},verified:v=>({verified:true,cleanup_complete:true,effect_possible:false,...v}),
  createNodeProcedure:()=>channel,
  selectPreparedGraphNode:async()=>{calls.push('select');},
  openPreparedWizard:async()=>{calls.push('open');wizard(initialStage);},
  closePreparedWizard:async()=>{calls.push('close');graph();return {verified:true,draft_discarded:true,cleanup_complete:true};},
  joinReady:s=>s.wizard?.stage==='join'&&s.node_join?.verified===true,
  createNodeExecutionProcedure:()=>({prepare:async()=>{calls.push('baseline');},waitCompleted:async()=>execution}),
  finishConfiguredGraph:async()=>{calls.push('Execute');if(unknown)throw Error('Unknown launch reply');active=true;state.node_outputs.ports[0].active=true;return {verified:true,cleanup_complete:true,mode:'execute',execution_id:'fresh',settings_applied:true};},
 };
 const readFactory=vm.runInNewContext('('+createNodeReadDrivers.toString()+')',driverContext);
 const config={targetOrigin:'https://loginom.invalid',targetBuild:'7.4.2'},real=createCandidateNodeSupport(config);
 // Also run the old tabular lifecycle on the red revision. This demonstrates
 // the two actual launches and the late mode refusal, rather than failing on
 // a missing dispatch stub. Native mapping contents are outside this regression.
 const oldHook=executionProcedure.prepareExistingInput
  ?vm.runInNewContext('('+executionProcedure.prepareExistingInput.toString()+')',{
   ...driverContext,requireValue:driverContext.need}):undefined;
 const tabularFactory=vm.runInNewContext('('+createTabularTransformNodeSupport.toString()+')',{
  ...driverContext,requireValue:driverContext.need,Map,structuredClone,
  calculatorConfigurationReadback:()=>{},calculatorParametersSchema:{},validateCalculatorParameters:()=>{},
  selectPreparedGraphNode:async()=>{},finishedImportSurface:()=>({}),
  readOutputDefinitionPages:async()=>({fields:[],total_columns:0}),
  control:(s,key,verb)=>s.ui.elements.find(e=>e.tid===s.wizard.root_tid+';'+key&&e.allowed_actions.includes(verb)),
 });
 const configuredSupport=()=>tabularFactory(config,{
  type,revision:'native-fixture',modes:type==='transform.join_data'?['inner','left']:['scalar'],
  validate:real.nodeApplyHandlers.get(type).validate,readback:()=>({}),
  ...(oldHook?{beforeInput:oldHook}:{}),
  configureInputs:async()=>({verified:true,cleanup_complete:true}),
  configure:async(channel,p,{request})=>type==='transform.join_data'?configureJoin(channel,p,{request})
   :{verified:true,cleanup_complete:true,configuration:{node_context:owner}},
  configurationObservation:{condition:'owned settings fixture',ready:s=>s.wizard.status==='observed'},
  configureOutput:async()=>({verified:true,cleanup_complete:true,native_mapping:{target_fields:[]}}),
 });
 const context={createRedactor,nodeOutputForJournal,verifyDeferredTextImportSources,NODE_READ_MODE:contract.NODE_READ_MODE,
  isUnchangedTextImportExecution:contract.isUnchangedTextImportExecution,isUnchangedTransformExecution,
  createNodeReadDrivers:readFactory};
 for(const name of ['Binning','ElimOutlier','CorrAnalysis','Sampling','DataPartition','ExcelImport','LinRegression','LogRegression','Clustering','RestRequest','CrossTable','TextExport','Collapse','MissingValues',
  'DateTime','SlidingWindow','Duplicates','Replacement','Union','Join','Filter','TextImport','Calculator','Grouping','Sorting','Reform','JavascriptCode'])
  context['create'+name+'NodeSupport']=()=>({nodeApplyHandlers:real.nodeApplyHandlers,
   nodeApplyDriverFactory:options=>configuredSupport().nodeApplyDriverFactory(options)});
 const support=vm.runInNewContext('('+createCandidateNodeSupport.toString()+')',context)(config);
 const operation={id:request.operation_id,parameters:request};
 const drivers=support.nodeApplyDriverFactory({operation,now:Date.now,onRecord:async e=>e});
 drivers.prepareTarget=async()=>({verified:true,cleanup_complete:true,effect_possible:false,node});
 drivers.readOutput=async()=>({verified:true,cleanup_complete:true,effect_possible:false,execution_id:'fresh',status:'complete',
  evidence_ref:'native-table',ports:[{port:0,fresh:true,schema:[{name:'A',label:'A',type:'integer'}],sample:[],row_count:0}]});
 return {request,calls,records,run:()=>applyNode({request,operation,handlers:support.nodeApplyHandlers,drivers,
  record:async e=>{records.push(structuredClone(e));return e;}})};
}

for(const type of ['transform.join_data','transform.reform_columns'])test('D46 whole node.apply executes unchanged inactive '+type+' exactly once',async()=>{
 const f=fixture(type),result=await f.run();
 assert.equal(f.calls.filter(x=>x==='Execute').length,1);
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
 assert.equal(result.execution.status,'completed');assert.equal(result.output.status,'complete');
 assert.equal(result.configuration.status,'not_requested');
 assert.deepEqual(result.phases.map(p=>p.phase),['source','target','finish','execute','read']);
 assert.deepEqual(f.calls,type==='transform.join_data'?['select','open','close','baseline','Execute']:['baseline','Execute']);
});
test('D46 whole node.apply rejects saved inner / requested left before any Execute',async()=>{
 const f=fixture('transform.join_data',{mode:'left'}),result=await f.run();
 assert.notEqual(result.status,'SUCCEEDED');assert.match(JSON.stringify(result),/Preserved join mode differs/);
 assert.equal(f.calls.filter(x=>x==='Execute').length,0);
 assert.deepEqual(f.calls,['select','open','close']);
});
test('D46 whole node.apply cannot accept a foreign Join mode owner',async()=>{
 const f=fixture('transform.join_data',{foreign:true}),result=await f.run();
 assert.notEqual(result.status,'SUCCEEDED');assert.equal(f.calls.includes('Execute'),false);
});
test('D46 whole node.apply never repeats an unknown Execute',async()=>{
 const f=fixture('transform.reform_columns',{unknown:true}),result=await f.run();
 assert.notEqual(result.status,'SUCCEEDED');assert.equal(f.calls.filter(x=>x==='Execute').length,1);
});
test('D46 unchanged execution predicate excludes every configuration edit and other handler',()=>{
 for(const change of [r=>r.target.kind='new',r=>r.inputs=[{}],r=>r.mappings=[{}],r=>r.finish='done',r=>r.finish='close',
  r=>r.parameters={keys:[]},r=>r.parameters=[],r=>r.mode='leftish',r=>r.target.type='programming.javascript']){
  const r=fixture('transform.join_data').request;change(r);assert.equal(isUnchangedTransformExecution(r),false);
 }
 for(const change of [r=>r.parameters.changes=[{}],r=>r.parameters.extra=true,r=>r.mode='other']){
  const r=fixture('transform.reform_columns').request;change(r);assert.equal(isUnchangedTransformExecution(r),false);
 }
});

for(const mode of ['inner','left','right','full','difference'])test('D46 whole node.apply advances observed input_mapping before saved Join '+mode,async()=>{
 const f=fixture('transform.join_data',{savedMode:mode,mode,initialStage:'input_mapping'}),result=await f.run();
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
 assert.deepEqual(f.calls,['select','open','next','close','baseline','Execute']);
 assert.equal(result.configuration.status,'not_requested');
});
test('D46 observed input_mapping still rejects a saved Join mode mismatch before Execute',async()=>{
 const f=fixture('transform.join_data',{initialStage:'input_mapping',mode:'left'}),result=await f.run();
 assert.notEqual(result.status,'SUCCEEDED');assert.match(JSON.stringify(result),/Preserved join mode differs/);
 assert.deepEqual(f.calls,['select','open','next','close']);
});
for(const options of [{missingNext:true},{foreign:true},{foreignAfterNext:true},{unknownNext:true},{initialStage:'output_mapping'}])test('D46 observed Join initial page refuses invalid navigation '+JSON.stringify(options),async()=>{
 const f=fixture('transform.join_data',{initialStage:'input_mapping',...options}),result=await f.run();
 assert.notEqual(result.status,'SUCCEEDED');assert.equal(f.calls.includes('Execute'),false);
 if(options.foreign||options.missingNext||options.initialStage==='output_mapping')assert.equal(f.calls.includes('next'),false);
 assert.ok(f.calls.filter(c=>c==='next').length<=1);
});

test('D46 whole apply handles the observed same-page lost-links portal before the only Join Execute',async()=>{
 const f=fixture('transform.join_data',{initialStage:'input_mapping',lostLinks:true}),result=await f.run();
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
 assert.deepEqual(f.calls,['select','open','next','no','close','baseline','Execute']);
});
test('D46 same-page portal still checks saved mode before any Execute',async()=>{
 const f=fixture('transform.join_data',{initialStage:'input_mapping',lostLinks:true,mode:'left'}),result=await f.run();
 assert.notEqual(result.status,'SUCCEEDED');assert.match(JSON.stringify(result),/Preserved join mode differs/);
 assert.deepEqual(f.calls,['select','open','next','no','close']);
});
test('D46 whole apply never replays Next or its unknown No answer',async()=>{
 const f=fixture('transform.join_data',{initialStage:'input_mapping',lostLinks:true,unknownAnswer:true}),result=await f.run();
 assert.notEqual(result.status,'SUCCEEDED');assert.deepEqual(f.calls,['select','open','next','no']);
});
