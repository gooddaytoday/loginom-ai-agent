import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {createNodeOperationRunner} from '../lib/node-operation-runner.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {nodeApiTools,dispatchNodeApi} from '../lib/node-api.mjs';
import {compactNodeRequestFailure} from '../lib/user-results.mjs';

for(const mode of ['forward','backward','stepwise'])for(const kind of ['new','existing'])for(const explicit of [false,true])test(mode+' R2 refuses '+kind+' '+(explicit?'0/1':'default')+' before a job or browser effect and reaches the model as NOT_APPLIED',async()=>{
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 let effects=0;
 const runner=createNodeOperationRunner({validate:r=>validateNodeApplyRequest(r,support.nodeApplyHandlers).handler.revision,progress:()=>null,
  run:async()=>{effects++;return {status:'SUCCEEDED',effect_possible:false,cleanup_complete:true};}});
 const request={operation_id:'r2-refused',contract_revision:'1.0.0',document_id:'doc',
  workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]},
  target:{kind,type:'datamining.lin_regression',...(kind==='existing'?{ref:{document_id:'doc',workflow_id:'flow',node_id:'regression'}}:{})},
  inputs:kind==='new'?[{source:{document_id:'doc',workflow_id:'flow',node_id:'source'},output:0,input:0}]:[],
  mode,parameters:{input_fields:['X1','X2','X3'],target_field:'Y',linear_regression:{selection:{criterion:'r2',...(explicit?{add_significance:0,remove_significance:1}:{})}}},
  mappings:[],finish:'execute',read:{ports:[0,1],sample_rows:100,require_exact_numbers:true},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 let failure;
 await assert.rejects(dispatchNodeApi({tools:nodeApiTools,startNodeApply:r=>runner.start(r)},'dock_node_apply',request),error=>{failure=error;return /R².*недоступен/.test(error.message);});
 assert.equal(effects,0);assert.equal(runner.has(request.operation_id),false);assert.equal(runner.busy,false);assert.equal(runner.unsettled,false);
 // Same production formatter used by bridge.mjs for pre-admission failures.
 const reply=compactNodeRequestFailure({action_key:'request.validate',effect_possible:false,error:{code:'REQUEST_REJECTED',message:failure.message}},request);
 assert.equal(reply.status,'NOT_APPLIED');assert.equal(reply.effect_possible,false);assert.equal(reply.cleanup_complete,true);
 assert.match(reply.error.message,/R².*недоступен/);assert.equal(reply.operation_id,request.operation_id);
 const corrected={...request,parameters:{...request.parameters,linear_regression:{selection:{criterion:'f',add_significance:0.05,remove_significance:0.1}}}};
 runner.start(corrected);assert.equal((await runner.wait(request.operation_id)).outcome.status,'SUCCEEDED');assert.equal(effects,1);
});
