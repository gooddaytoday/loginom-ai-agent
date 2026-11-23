import {validateActionParameters} from './action-catalog.mjs';
import {validateNodeReference} from './node-contracts.mjs';

export const loopParametersSchema={type:'object',additionalProperties:false,required:['body'],description:'Sequential Loop over a same-workflow Supernode: one table input/output, fixed groups of one row. First create with inputs:[], finish:done; then connect input 0 on the SAME Loop with body again. FOR: variable-boundary Supernode, positive literal count, variable {port_guid,definition_id} from its readback; no table/external variable inputs. iteration_identifiers defaults false. No postcondition, parallelism, keys or ignored errors. Use dock_node_read for fresh output rereads.',properties:{body:{type:'object',additionalProperties:false,required:['document_id','workflow_id','node_id'],description:'Observed scoped ref of the source control.supernode in the CURRENT parent workflow, never its nested workflow. The live derived component follows edits to that body.',properties:{document_id:{type:'string',minLength:1,maxLength:256},workflow_id:{type:'string',minLength:1,maxLength:256},node_id:{type:'string',minLength:1,maxLength:256}}}}};
Object.assign(loopParametersSchema.properties,{count:{type:'integer',minimum:1,maximum:9007199254740991},variable:{type:'object',additionalProperties:false,required:['port_guid','definition_id'],properties:{port_guid:{type:'string',minLength:1,maxLength:256},definition_id:{type:'integer',minimum:0,maximum:9007199254740991}}},iteration_identifiers:{type:'boolean'}});
export function validateLoopParameters(p,mode,r){
 const need=(v,m)=>{if(!v)throw Error('Loop: '+m);};
 need(['group_rows','for'].includes(mode),'only group_rows and for are supported');
 validateActionParameters(loopParametersSchema,p);validateNodeReference(p.body);
 need(p.body.document_id===r.document_id&&p.body.workflow_id===r.workflow_ref.workflow_id,'body must belong to the same document and workflow');
 need(!r.variable_inputs?.length&&!r.bindings?.length&&!r.mappings?.length,'variables, bindings and port mappings are unsupported; configure the body instead');
 if(mode==='for'){
  need(Number.isSafeInteger(p.count)&&p.count>0,'count must be a positive integer literal');
  need(p.variable&&Number.isSafeInteger(p.variable.definition_id),'observed port GUID and native definition ID required');
  need(r.inputs.length===0&&!r.mappings?.length,'FOR has no table inputs or mappings');
 }else need(p.count===undefined&&p.variable===undefined&&p.iteration_identifiers===undefined,'FOR parameters require mode for');
 need(r.inputs.every(i=>i.input===0),'only table input 0 is supported');
 need(r.target.kind!=='existing'||r.target.ref.node_id!==p.body.node_id,'Loop cannot reference itself');
 if(r.target.kind==='new'&&mode==='group_rows')need(r.inputs.length===0&&r.finish==='done','create with inputs:[] and finish:done, then connect input 0 on the SAME Loop');
}
