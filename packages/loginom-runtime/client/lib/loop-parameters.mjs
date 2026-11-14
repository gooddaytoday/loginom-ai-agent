import {validateActionParameters} from './action-catalog.mjs';
import {validateNodeReference} from './node-contracts.mjs';

export const loopParametersSchema={type:'object',additionalProperties:false,required:['body'],description:'Sequential Loop over a same-workflow Supernode: one table input/output, fixed groups of one row. First create with inputs:[], finish:done; then connect input 0 on the SAME Loop with body again. No FOR, postcondition, parallelism, keys, variables, iteration IDs or ignored errors. Use dock_node_read for fresh output rereads.',properties:{body:{type:'object',additionalProperties:false,required:['document_id','workflow_id','node_id'],description:'Observed scoped ref of the source control.supernode in the CURRENT parent workflow, never its nested workflow. The live derived component follows edits to that body.',properties:{document_id:{type:'string',minLength:1,maxLength:256},workflow_id:{type:'string',minLength:1,maxLength:256},node_id:{type:'string',minLength:1,maxLength:256}}}}};
export function validateLoopParameters(p,mode,r){
 const need=(v,m)=>{if(!v)throw Error('Loop: '+m);};
 need(mode==='group_rows','only group_rows is supported');
 validateActionParameters(loopParametersSchema,p);validateNodeReference(p.body);
 need(p.body.document_id===r.document_id&&p.body.workflow_id===r.workflow_ref.workflow_id,'body must belong to the same document and workflow');
 need(!r.variable_inputs?.length&&!r.bindings?.length&&!r.mappings?.length,'variables, bindings and port mappings are unsupported; configure the body instead');
 need(r.inputs.every(i=>i.input===0),'only table input 0 is supported');
 need(r.target.kind!=='existing'||r.target.ref.node_id!==p.body.node_id,'Loop cannot reference itself');
 if(r.target.kind==='new')need(r.inputs.length===0&&r.finish==='done','create with inputs:[] and finish:done, then connect input 0 on the SAME Loop');
}
