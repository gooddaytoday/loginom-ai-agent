import {createHash} from 'node:crypto';
import {need} from './text-export-observer-policy.mjs';
import {isDeepStrictEqual as same} from 'node:util';
const sha=s=>createHash('sha256').update(s).digest('hex');
const one=xs=>{need(xs.length===1,'Unique observer ledger anchor required');return xs[0];};
// Reads only actual execution journal entries; no cached settings are evidence.
export function bindObserver({journal,request,run,session,overallDeadline}){
 const lines=journal.trimEnd().split('\n'),events=lines.map(JSON.parse),args=request.params.arguments,destination=args.parameters.destination;
 need(request.params.name==='dock_node_apply'&&args.target?.type==='exports.text'&&args.target.kind==='existing'&&args.parameters.overwrite==='replace','Expected exact existing export replace');
 need(destination===`/test-2/Dock-export-${run.run_id}-csv.csv`&&run.goal_id==='text-export-node-complete','Unexpected run file');
 need(session.clientRevision===run.runtime_source_pin.client_revision&&events.every(e=>e.session_id===session.sessionId&&e.runtime_revision===session.clientRevision),'Foreign journal owner/runtime');
 const completes=events.map((e,i)=>({e,i})).filter(x=>x.e.phase==='completed');
 const original=one(completes.filter(({e})=>e.outcome?.output?.output?.file_artifacts?.some(f=>f.destination===destination)));
 const f=one(original.e.outcome.output.output.file_artifacts),node=original.e.outcome.output.node;
 need(original.e.outcome.status==='SUCCEEDED'&&f.freshness_basis==='native_absence_check_and_completed_execution','Original execution incomplete');
 const refused=one(events.filter(e=>e.phase==='node_phase_refused'&&e.receipt?.verification==='text_export_conflict_rejected'&&e.receipt?.before_node?.node_id===node.node_id));
 const reject=one(completes.filter(({e})=>e.operation_id===refused.operation_id));
 need(original.i<reject.i&&reject.e.outcome.status==='FAILED'&&reject.e.outcome.cleanup_complete===true&&refused.receipt.cleanup_complete===true,'Reject not terminal');
 need(reject.e.parameters.parameters.destination===destination&&reject.e.parameters.parameters.overwrite!=='replace','Reject path differs');
 const workflow_ref=original.e.parameters.workflow_ref;
 need(same(args.workflow_ref,workflow_ref)||same(args.workflow_ref,{workflow_id:workflow_ref.workflow_id}),'Foreign issued workflow ref');
 need(same(args.target.ref,node)&&args.document_id===node.document_id&&same(reject.e.parameters.target.ref,node),'Node/workflow owner changed');
 const input=one(original.e.parameters.inputs),source=input.source;
 need(source.document_id===node.document_id&&source.workflow_id===node.workflow_id,'Foreign source anchor');
 const sourceCompleted=one(completes.filter(({e})=>e.outcome?.output?.node?.node_id===source.node_id&&e.outcome.status==='SUCCEEDED'&&e.i!==original.i));
 need(sourceCompleted.i<original.i,'Stale source anchor');
 for(const e of events.filter(e=>e.phase==='node_apply_prepared'))need(completes.some(x=>x.e.operation_id===e.operation_id),'Pending node operation');
 need(!completes.some(x=>x.i>reject.i),'Intervening product completion');
 const identity={...node,source_node_id:source.node_id},source_edge={source:source.node_id,output:input.output,target:node.node_id,input:input.input};
 return {run_id:run.run_id,session_id:session.sessionId,runtime:session.clientRevision,origin:'http://logi-test-plan.bg.local',overall_deadline_ms:overallDeadline,identity,source_edge,workflow_ref,graph_request:{document_id:args.document_id,workflow_ref,target:args.target,inputs:[]},other_pending_operations:[],
  baseline:{original_event_hash:sha(lines[original.i]),original_event_index:original.i,operation_id:original.e.operation_id,execution_id:f.execution_id,destination,bytes:f.bytes,sha256:f.sha256,native_file:'artifacts/input/output-'+f.artifact_id+'/'+destination.split('/').at(-1),source_event_hash:sha(lines[sourceCompleted.i]),source_event_index:sourceCompleted.i},
  reject:{terminal_event_hash:sha(lines[reject.i]),terminal_event_index:reject.i,operation_id:reject.e.operation_id,status:'FAILED',cleanup_complete:true,verification:'text_export_conflict_rejected',destination}};
}
