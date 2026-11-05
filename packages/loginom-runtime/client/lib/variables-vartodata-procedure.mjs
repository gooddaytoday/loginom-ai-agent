const need=(value,message)=>{if(!value)throw Error('Переменные в таблицу: '+message);};
export async function configureVariablesToTable(channel,parameters,{request}){
 const ready=s=>s.wizard?.stage==='variables_to_table'&&s.node_variables_to_table?.verified===true;
 const observe=condition=>channel.observe({condition,readVariablesToTable:true,ready});
 let state=await observe('owned variables-to-table orientation');
 const baseline=state.node_variables_to_table,node=baseline.node_context;
 const owner=s=>ready(s)&&s.node_variables_to_table.inventory_complete===true&&s.node_variables_to_table.node_context?.verified===true
  &&s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='wizard'
  &&!s.prepared_node_context.input_port&&!s.prepared_node_context.output_port
  &&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===node?.[k]&&s.node_variables_to_table.node_context[k]===node[k]
   &&(request.target.kind!=='existing'||node[k]===request.target.ref[k]));
 need(owner(state),'configuration owner differs');
 if(request.finish==='close')return {verified:true,cleanup_complete:true,effect_possible:false,configuration:baseline,draft_edits_skipped:true};
 need(request.target.kind==='new'||baseline.mode==='columns','Этот режим пока не поддерживается');
 const control=(s,suffix,verb)=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';'+suffix&&e.allowed_actions.includes(verb));need(es.length===1,'unique wizard control required: '+suffix);return es[0];};
 if(baseline.mode!=='columns'){
  await channel.perform({condition:'select columns orientation once',initialObservation:state,ready:owner,identity:()=>node,
   resolve:s=>({verb:'set_checked',ref:control(s,'VariablesToDataWizard;rbVarToColumns;DisplayEl','set_checked').ref,checked:true})});
  state=await observe('columns orientation read back');
 }
 need(owner(state)&&state.node_variables_to_table.mode==='columns','columns orientation was not confirmed');
 const configuration=state.node_variables_to_table;
 await channel.perform({condition:'validate variables-to-table orientation',initialObservation:state,ready:owner,identity:()=>node,
  resolve:s=>({verb:'wizard_step',ref:control(s,'btnNext','wizard_step').ref,expected_stage:['output_mapping','done']})});
 const destination=await channel.observe({condition:'variables-to-table accepted destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
 need(['document_id','workflow_id','node_id'].every(k=>destination.prepared_node_context?.[k]===node[k]),'validation owner differs');
 // A retained hidden mapping panel is not a wizard destination. Advance it
 // only when the ordinary Next gesture actually made it the observed page.
 if(destination.wizard.stage==='output_mapping'){
  await channel.perform({condition:'complete conditional variables-to-table mapping',initialObservation:destination,
   ready:s=>s.wizard?.stage==='output_mapping'&&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context?.[k]===node[k]),identity:()=>node,
   resolve:s=>({verb:'wizard_step',ref:control(s,'btnNext','wizard_step').ref,expected_stage:'done'})});
 }
 const done=await channel.observe({condition:'variables-to-table completion page',ready:s=>s.wizard?.stage==='done'
  &&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context?.[k]===node[k])});
 return {verified:true,cleanup_complete:true,effect_possible:true,configuration,
  validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
