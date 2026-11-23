import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {createNodeOperationRunner} from '../lib/node-operation-runner.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {nodeApiTools,dispatchNodeApi} from '../lib/node-api.mjs';
import {compactNodeRequestFailure} from '../lib/user-results.mjs';

for(const kind of ['new','existing'])for(const mode of ['xls','xlsx'])test('XLS refuses '+kind+' / '+mode+' before job admission and reaches the model as NOT_APPLIED',async()=>{
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 let effects=0;
 const runner=createNodeOperationRunner({validate:r=>validateNodeApplyRequest(r,support.nodeApplyHandlers).handler.revision,progress:()=>null,
  run:async()=>{effects++;return {status:'SUCCEEDED',effect_possible:false,cleanup_complete:true};}});
 const request={operation_id:'xls-refused',contract_revision:'1.0.0',document_id:'doc',
  workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]},
  target:{kind,type:'exports.excel',...(kind==='existing'?{ref:{document_id:'doc',workflow_id:'flow',node_id:'sink'}}:{})},
  inputs:kind==='new'?[{source:{document_id:'doc',workflow_id:'flow',node_id:'source'},output:0,input:0}]:[],
  mode,parameters:{excel_export:{destination:mode==='xls'?'/test-2/book.xlsx':'/test-2/book.XLS',sheet_name:'Данные',header:'names',overwrite:'reject'}},
  mappings:[],finish:'execute',read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 let failure;
 await assert.rejects(dispatchNodeApi({tools:nodeApiTools,startNodeApply:r=>runner.start(r)},'dock_node_apply',request),error=>{
  failure=error;return /формат XLS в этой версии Loginom не выгружает данные/.test(error.message)&&/XLSX/.test(error.message);
 });
 assert.equal(effects,0);assert.equal(runner.has(request.operation_id),false);assert.equal(runner.busy,false);assert.equal(runner.unsettled,false);
 const reply=compactNodeRequestFailure({action_key:'request.validate',effect_possible:false,error:{code:'REQUEST_REJECTED',message:failure.message}},request);
 assert.equal(reply.status,'NOT_APPLIED');assert.equal(reply.effect_possible,false);assert.equal(reply.cleanup_complete,true);
 assert.match(reply.error.message,/формат XLS в этой версии Loginom не выгружает данные/);assert.match(reply.error.message,/XLSX/);
 const corrected={...request,mode:'xlsx',parameters:{excel_export:{...request.parameters.excel_export,destination:'/test-2/book.xlsx'}}};
 runner.start(corrected);assert.equal((await runner.wait(request.operation_id)).outcome.status,'SUCCEEDED');assert.equal(effects,1);
});
