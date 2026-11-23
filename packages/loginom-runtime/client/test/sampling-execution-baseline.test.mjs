import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createTabularTransformNodeSupport} from '../lib/calculator-node.mjs';
import {createSequentialNodeSupport} from '../lib/sampling-node.mjs';
import {captureExecutionBaseline,identifyNewExecution} from '../lib/node-execution-evidence.mjs';

// LAB-764: btnGetUniqueValues creates an input-activation group while the
// biased wizard is open. It must belong to the pre-launch inventory, not be
// mistaken for the requested final graph execution (P journal:551,553,581).
for(const type of ['preprocessing.sampling','preprocessing.data_partition'])
for(const mode of ['biased','stratified','random','sequential'])
test(`${type} ${mode}: only biased recaptures execution history after its wizard`,async()=>{
 const node={document_id:'doc',workflow_id:'flow',node_id:'node'},roots=['1'];
 let surface='graph';
 const history=()=>({verified:true,inventory_complete:true,show_completed:true,root_id:'root',node_context:{...node,verified:true},
  processes:roots.map(process_id=>({process_id,record_id:'record-'+process_id,parent_id:null,state:'completed',error:false}))});
 const state=()=>({prepared_node_context:{...node,verified:true,surface},wizard:{status:surface==='graph'?'absent':'observed',stage:'sampling'},
  node_sampling:{verified:true},node_processes:history(),node_outputs:{verified:true},ui:{elements:[]}});
 const channel={async observe({ready}){const s=state();assert.ok(ready(s));return s;}};
 const prepares=[];
 const create=vm.runInNewContext('('+createTabularTransformNodeSupport.toString()+')',{
  structuredClone,calculatorParametersSchema:{},calculatorConfigurationReadback:()=>{},
  requireValue:(v,m)=>{if(!v)throw Error(m);},verified:v=>({verified:true,...v}),
  createNodeProcedure:()=>channel,
  createNodeExecutionProcedure:()=>({async prepare(){this.baseline=captureExecutionBaseline(history(),node);prepares.push(this.baseline);}}),
  selectPreparedGraphNode:async()=>{},openPreparedWizard:async()=>{surface='wizard';},finishedImportSurface:()=>({}),
  finishConfiguredGraph:async(channel,driver)=>{roots.push(mode==='biased'?'3':'2');return identifyNewExecution(driver.baseline,history());},
 });
 const sampling=vm.runInNewContext('('+createSequentialNodeSupport.toString()+')',{
  createTabularTransformNodeSupport:create,samplingConfigurationReadback:()=>{},configureSamplingOutputs:()=>{},readSamplingOutputs:()=>{},
  configureSampling:async()=>{if(mode==='biased')roots.push('2');return {configuration:{mode}};},
 });
 const support=sampling({},{type,validate:()=>{},parameterSchema:{}});
 const request={mode,finish:'execute',target:{kind:'existing'},inputs:[],mappings:[],document_id:'doc',workflow_ref:{workflow_id:'flow'}};
 const driver=support.nodeApplyDriverFactory({operation:{id:'sample',nodeApply:{request,node,phases:[]}}});
 const ctx={node,document_id:'doc',workflow_ref:request.workflow_ref,deadline:1000};
 await driver.openWizard(ctx);await driver.configureCalculator(ctx,{});surface='graph';
 const finish=await driver.finishGraph('execute',ctx);
 assert.equal(finish.group_id,mode==='biased'?'3':'2');
 assert.deepEqual(prepares.map(p=>p.roots.map(r=>r.process_id)),mode==='biased'?[['1'],['1','2']]:[['1']]);
});
