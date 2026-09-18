import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAuditReadScope} from './scenario-audit-scope.mjs';
const plan=()=>({operator_reviewed:true,inspect_configuration:true,expected_graph:{links:[{source:'source',target:'long'},{source:'long',target:'rates'},{source:'rates',target:'matrix'}]},outputs:[
 {name:'input',node_id:'source',type:'imports.text'},
 {name:'unpivot',node_id:'long',type:'transform.collapse_columns',configuration_only:true,audit_role:'intermediate',read_omission_reason:'Complete final matrix is checked against raw CSV; this intermediate is executed and its settings inspected.',covered_by:['matrix']},
 {name:'matrix',node_id:'matrix',type:'transform.sorting',audit_role:'final'},
 {name:'file',node_id:'file',type:'exports.text',configuration_only:true}
]});
test('reviewed intermediate scope requires a reachable complete final table and retains source read',()=>{
 assert.equal(validateAuditReadScope(plan()),true);
});
test('missing, unrelated or omitted final outputs cannot justify omitting an intermediate read',()=>{
 for(const change of [p=>p.outputs[1].covered_by=['missing'],p=>p.expected_graph.links=[],p=>p.outputs[2].configuration_only=true,p=>p.outputs[2].audit_role='intermediate',p=>p.outputs[1].covered_by=['file'],p=>p.outputs[1].covered_by=['unpivot']]){
  const p=plan();change(p);assert.throws(()=>validateAuditReadScope(p));
 }
});
test('source/final reads and settings checks cannot silently be skipped',()=>{
 for(const change of [p=>p.inspect_configuration=false,p=>p.operator_reviewed=false,p=>delete p.outputs[1].read_omission_reason,p=>p.outputs[1].audit_role='final',p=>p.outputs[1].type='imports.text',p=>p.outputs[1].covered_by=[]]){
  const p=plan();change(p);assert.throws(()=>validateAuditReadScope(p));
 }
});
