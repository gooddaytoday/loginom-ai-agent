// Only a confirmed producer Save As receipt can advance private preparation.
export function amountSaveContinuation(original,save,binding) {
 const fail=()=>{throw Error('LOGINOM_AMOUNT_SAVE_CONTINUATION_UNAVAILABLE')};
 const p=original?.state,c=save?.output?.save_continuation,w=c?.workflow_ref,previous=c?.previous_workflow_ref;
 if(!original?.attempted||p?.status!=='READY'||save?.status!=='SUCCEEDED'||save.phase!=='verified'
  ||save.cleanup_complete!==true||save.action_key!=='package.save_as'||save.output.reopened!==true
  ||save.output.package_ref?.path!==binding.packagePath||c?.package_path!==binding.packagePath
  ||p.loginom_account!==binding.account||p.operation_id!==original.operation_id||c.document_id!==p.document_id||c.session_id!==binding.session||c.account!==binding.account
  ||c.operation_id!==save.operation_id||c.source_operation_id!==original.operation_id
  ||previous?.workflow_id!==p.workflow_ref?.workflow_id||previous.tab_tid!==p.workflow_ref.tab_tid||previous.prefix!==p.workflow_ref.prefix
  ||!w?.workflow_id||w.tab_tid===previous.tab_tid||!/^MF;cntMain;cntWorkspace;Workspace;t\.br;tb(?:-\d+)?$/.test(w.tab_tid??'')
  ||w.prefix!=='MF;TF'+(w.tab_tid.match(/;tb(-\d+)?$/)?.[1]??'')
  ||!Array.isArray(w.navigation_path)||w.navigation_path.length<3||w.navigation_path.length>32
  ||w.navigation_path.some(x=>typeof x.tid!=='string'||typeof x.label!=='string')
  ||JSON.stringify(c.graph)!==JSON.stringify(c.previous_graph)
  ||!c.graph||['nodes','ports','links'].some(k=>!Array.isArray(c.graph[k])||c.graph[k].length!==0))fail();
 return {attempted:true,operation_id:save.operation_id,state:{...p,operation_id:save.operation_id,
  workflow_ref:w,package_ref:{...p.package_ref,path:binding.packagePath,persisted:true}},
  save_continuation:{source_preparation:original,source_save_operation:save.operation_id,proof:c}};
}
