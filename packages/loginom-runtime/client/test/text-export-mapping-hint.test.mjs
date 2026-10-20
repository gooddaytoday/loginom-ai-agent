import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTextExportParameters} from '../lib/text-export-parameters.mjs';
import {compactNodeRequestFailure} from '../lib/user-results.mjs';

test('rejected export mappings identify the complete corrected request without changing the contract',()=>{
 const request={operation_id:'export-large-debts',target:{kind:'existing',type:'exports.text'},inputs:[],
  parameters:{destination:'/test-2/debts-large.csv',overwrite:'reject'},
  mappings:[{direction:'input',port:0,fields:[{source:{kind:'configured_field',name:'Debt'}}]}],
  mode:'delimited',finish:'execute',read:{ports:[]}};
 let error;
 try{validateTextExportParameters(request.parameters,request.mode,request);}catch(e){error=e;}
 assert.ok(error);
 const before=structuredClone(request);
 const outcome={status:'FAILED',effect_possible:false,action_key:'request.validate',error:{code:'REQUEST_REJECTED',message:error.message}};
 const reply=compactNodeRequestFailure(outcome,request);
 assert.equal(reply.status,'NOT_APPLIED');assert.equal(reply.cleanup_complete,true);
 assert.equal(reply.error.parameter_path,'mappings');assert.equal(reply.next_step.tool,'dock_node_apply');
 assert.match(reply.next_step.instruction,/mappings:\[\]/);
 assert.match(reply.next_step.instruction,/transform.reform_columns/);
 assert.match(reply.next_step.instruction,/COMPLETE request with a NEW operation_id/);
 assert.deepEqual(request,before);
 const corrected={...request,operation_id:'export-large-debts-v2',mappings:[]};
 assert.doesNotThrow(()=>validateTextExportParameters(corrected.parameters,corrected.mode,corrected));
 assert.equal(corrected.parameters.overwrite,'reject');
 const pending=compactNodeRequestFailure({...outcome,operation_id:'uncertain',effect_possible:true},request);
 assert.equal(pending.next_step.tool,'dock_operation_inspect');
 assert.doesNotMatch(pending.next_step.instruction,/transform.reform_columns/);
 const running=compactNodeRequestFailure({...outcome,output:{active_node_job:{state:'running',operation_id:'active'}}},request);
 assert.equal(running.next_step.tool,'dock_node_wait');
 assert.equal(running.next_step.arguments.operation_id,'active');
});
