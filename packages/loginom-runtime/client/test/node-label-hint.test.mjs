import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNodeTargetRequest} from '../lib/node-contracts.mjs';
import {compactNodeRequestFailure} from '../lib/user-results.mjs';

const request=label=>({operation_id:'filter-late',document_id:'doc',
 workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'scenario',label:'Scenario'}]},
 target:{kind:'new',type:'transform.filter_data',label},inputs:[]});
const validate=r=>validateNodeTargetRequest({document_id:r.document_id,workflow_ref:r.workflow_ref,target:r.target,inputs:r.inputs});

test('invalid node label names target.label and a safe repair without weakening label validation',()=>{
 for(const label of ['DaysOverdue > 7','a<b','a;b','a|b','a"b',"a'b",'a\\b','a\nb','a\tb','\0',' ',201, 'x'.repeat(201)]){
  const r=request(label),before=structuredClone(r);
  let error;try{validate(r);}catch(e){error=e;}
  assert.ok(error,String(label));
  const outcome={action_key:'request.validate',effect_possible:false,error:{code:'REQUEST_REJECTED',message:error.message}};
  const reply=compactNodeRequestFailure(outcome,r);
  assert.equal(reply.error.parameter_path,'target.label');assert.equal(reply.status,'NOT_APPLIED');
  assert.equal(reply.next_step.tool,'dock_node_apply');assert.equal(reply.cleanup_complete,true);
  assert.match(reply.next_step.instruction,/Omit target.label/);
  assert.match(reply.next_step.instruction,/comparison operators in parameters/);
  assert.match(reply.next_step.instruction,/NEW operation_id/);assert.deepEqual(r,before);
  const pending=compactNodeRequestFailure({...outcome,operation_id:'original',effect_possible:true},r);
  assert.equal(pending.next_step.tool,'dock_operation_inspect');
 }
 for(const label of ['Просрочка более 7 дней','DaysOverdue above 7','x'.repeat(200),undefined]){
  const r=request(label);if(label===undefined)delete r.target.label;
  assert.doesNotThrow(()=>validate(r));
 }
});
