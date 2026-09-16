// An output-file operation may resume a read-only execution wait only while
// the exact already-observed graph/process state remains unchanged. No file
// discovery/download or partially edited wizard is replayed by continuation.
export const exportContinuationSurface=s=>structuredClone(Object.fromEntries(['dom_epoch','prepared_node_context','node_processes','wizard'].map(k=>[k,s[k]])));
export function verifyExportContinuation({node,finish,surface,checkpoint}){
 const before=finish?.continuation_surface,group=finish?.execution_group;
 const sameNode=c=>c?.verified===true&&c.surface==='graph'&&['document_id','workflow_id','node_id'].every(k=>typeof node?.[k]==='string'&&node[k]===c[k]);
 const valid=s=>s?.wizard?.status==='absent'&&sameNode(s.prepared_node_context)&&typeof s.dom_epoch?.document==='string'&&Number.isSafeInteger(s.dom_epoch.revision)
  &&s.node_processes?.verified===true&&s.node_processes.inventory_complete===true&&s.node_processes.show_completed===true&&sameNode(s.node_processes.node_context);
 if(!valid(before)||!valid(surface)||finish?.verified!==true||finish.cleanup_complete!==true||finish.mode!=='execute'||finish.settings_applied!==true||finish.execution_started!==true
  ||!group||finish.execution_id!==group.execution_id||!sameNode({...group.node,verified:true,surface:'graph'})||before.node_processes.root_id!==group.root_id)return false;
 if(checkpoint&&(checkpoint.phase!=='execute'||checkpoint.read_only!==true||checkpoint.cleanup_complete!==true||checkpoint.execution_id!==group.execution_id))return false;
 const matches=surface.node_processes.processes.filter(p=>p.parent_id===null&&p.process_id===group.group_id&&p.record_id===group.group_record_id&&p.error===false);
 return matches.length===1&&JSON.stringify(exportContinuationSurface(surface))===JSON.stringify(before);
}
