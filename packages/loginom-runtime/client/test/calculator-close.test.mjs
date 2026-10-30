import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalculatorNodeSupport} from '../lib/calculator-node.mjs';
import {createTabularTransformNodeSupport} from '../lib/calculator-node.mjs';
import {captureExecutionBaseline,identifyNewExecution} from '../lib/node-execution-evidence.mjs';
import vm from 'node:vm';
test('Close skips the input wizard entirely, including its otherwise implicit Done',async()=>{
 let browserCalls=0;const support=createCalculatorNodeSupport({targetOrigin:'https://example.test',targetBuild:'7.4.2'});
 const operation={id:'close',nodeApply:{request:{finish:'close'}}};
 const driver=support.nodeApplyDriverFactory({operation,execute:()=>{browserCalls++;throw Error('Unexpected browser work')}});
 const result=await driver.mapPorts([],{receipt_id:'close:input_mapping'});
 assert.equal(result.verified,true);assert.equal(result.effect_possible,false);assert.equal(browserCalls,0);
 await assert.rejects(driver.mapPorts([{direction:'input',port:0}],{receipt_id:'close:input_mapping'}),/cannot commit/);assert.equal(browserCalls,0);
});

test('Calculator execution captures history after Preview and port commits',async()=>{
 const node={document_id:'doc',workflow_id:'flow',node_id:'node'},roots=['1'];
 let surface='graph',stage='calculator';
 const history=()=>({verified:true,inventory_complete:true,show_completed:true,root_id:'root',node_context:{...node,verified:true},
  processes:roots.map(process_id=>({process_id,record_id:'record-'+process_id,parent_id:null,state:'completed',error:false}))});
 const state=()=>({prepared_node_context:{...node,verified:true,surface},wizard:{status:surface==='graph'?'absent':'observed',stage,root_tid:'wizard'},
  node_calculator:{verified:true},node_processes:history(),node_outputs:{verified:true},ui:{elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']}]}});
 const channel={async observe({ready}){const s=state();assert.ok(ready(s));return s;},async perform({resolve}){resolve(state());stage='done';}};
 const prepares=[];
 const create=vm.runInNewContext('('+createTabularTransformNodeSupport.toString()+')',{
  structuredClone,calculatorParametersSchema:{},calculatorConfigurationReadback:()=>{},
  requireValue:(v,m)=>{if(!v)throw Error(m);},verified:v=>({verified:true,...v}),
  createNodeProcedure:()=>channel,
  createNodeExecutionProcedure:()=>({async prepare(){this.baseline=captureExecutionBaseline(history(),node);prepares.push(this.baseline);}}),
  selectPreparedGraphNode:async()=>{},openPreparedWizard:async()=>{surface='wizard';},
  configureCalculator:async()=>({configuration:{expressions:[{name:'Twice',formula:'Value * 2'}]}}),
  previewCalculator:async()=>{roots.push('2','3');return {status:'accepted_by_loginom_preview'};},
  control:(s)=>s.ui.elements[0],finishedImportSurface:()=>({}),
  finishConfiguredGraph:async(channel,driver)=>{roots.push('4');return identifyNewExecution(driver.baseline,history());},
 });
 const support=create({}),request={finish:'execute',target:{kind:'existing'},inputs:[],mappings:[],document_id:'doc',workflow_ref:{workflow_id:'flow'}};
 const operation={id:'calc',nodeApply:{request,node},nodeTargetAdapter:{async observe(){return {complete:true,document_id:'doc',workflow_ref:{workflow_id:'flow'},nodes:[],links:[]};}}};
 const driver=support.nodeApplyDriverFactory({operation}),ctx={node,document_id:'doc',workflow_ref:request.workflow_ref,deadline:1000};
 await driver.openWizard(ctx);await driver.configureCalculator(ctx,{expressions:[]});surface='graph';
 const finish=await driver.finishGraph('execute',ctx);
 assert.equal(finish.group_id,'4');
 assert.deepEqual(prepares.map(p=>p.roots.map(r=>r.process_id)),[['1'],['1','2','3']]);
});
