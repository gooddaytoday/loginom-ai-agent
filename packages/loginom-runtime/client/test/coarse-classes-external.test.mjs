import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCoarseClassesParameters} from '../lib/coarse-classes-parameters.mjs';

// LAB-1324, owner decision 12.11: Loginom 7.4.2 does not apply a ready external
// partition to a discrete predictor (probes (б)/(в), runs 1794209858242266964 and
// 1794213272022742203). The request is refused in validation, before any gesture.
const external={input_field:'Segment',target_field:'Target',event_value:'yes',partition:'external',min_class_percent:5,max_classes:2,uniformity_percent:0};
const refusal=/COARSE_EXTERNAL_UNSUPPORTED.*Loginom 7\.4\.2.*partition:"automatic"/s;

test('external partition is refused with a code and a working next step',()=>{
 assert.throws(()=>validateCoarseClassesParameters({coarse_classes:external},'internal'),refusal);
 assert.throws(()=>validateCoarseClassesParameters({coarse_classes:{...external,frozen:true}},'internal'),refusal);
});

test('the public dock_node_apply path refuses external classes before any graph or UI gesture',async()=>{
 const {nodeApiTools,dispatchNodeApi}=await import('../lib/node-api.mjs');
 const {createCandidateNodeSupport}=await import('../lib/node-support.mjs');
 const {validateNodeApplyRequest}=await import('../lib/node-apply.mjs');
 const handlers=createCandidateNodeSupport({}).nodeApplyHandlers;
 const gestures=[];
 const runtime={tools:nodeApiTools,startNodeApply:args=>{validateNodeApplyRequest(args,handlers);gestures.push('apply');return {status:'SUCCEEDED'};}};
 const source=id=>({document_id:'doc',workflow_id:'wf',node_id:id});
 const envelope={operation_id:'coarse-external',contract_revision:'1.0.0',document_id:'doc',
  workflow_ref:{workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]},
  target:{kind:'new',type:'preprocessing.coarse_classes',position:{x:320,y:280}},
  mode:'internal',parameters:{coarse_classes:external},mappings:[],finish:'execute',read:{ports:[0,1,2],sample_rows:100,require_exact_numbers:true},
  budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 for(const inputs of [[{source:source('main'),output:0,input:0},{source:source('classes'),output:0,input:1}],[{source:source('main'),output:0,input:0}]])
  await assert.rejects(dispatchNodeApi(runtime,'dock_node_apply',{...envelope,inputs}),refusal);
 await assert.rejects(dispatchNodeApi(runtime,'dock_node_apply',{...envelope,parameters:{coarse_classes:{...external,partition:'automatic'}},
  inputs:[{source:source('main'),output:0,input:0},{source:source('classes'),output:0,input:1}]}),/one input 0 required/);
 assert.deepEqual(gestures,[]);
 // Automatic discrete training on input 0 stays admitted.
 await dispatchNodeApi(runtime,'dock_node_apply',{...envelope,parameters:{coarse_classes:{...external,partition:'automatic'}},inputs:[{source:source('main'),output:0,input:0}]});
 assert.deepEqual(gestures,['apply']);
});
