import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';

// Stock typed matching on complete internal checkpoints, never model prose.
export function checkExcelNamedMain(initial,updated,events){
 const checkpoints=events.filter(e=>e.phase==='node_checkpoint').map(e=>e.result).filter(r=>r?.status==='SUCCEEDED'&&r.cleanup_complete===true
  &&r.execution?.status==='completed'&&r.configuration?.readback?.kind==='excel_import');
 const rounds=[];
 for(const [index,want] of [initial,updated].entries()){
  const r=checkpoints.find(r=>{
   const s=r.configuration.readback.source,p=r.output?.ports?.find(p=>p.port===0);
   return s.sheet_method==='Именованный диапазон'&&s.named_range==='SalesRange'&&s.sheet==='SalesRange'&&s.extend_range===(index===1)&&s.header_rows===1
    &&p?.fresh===true&&p.execution_id===r.execution.execution_id&&p.freshness_basis==='completed_execution_port_source'
    &&matchesExpectedOutput(p,want.outputs[0])&&(!index||checkpoints.indexOf(r)>checkpoints.indexOf(rounds[0])&&r.execution.execution_id!==rounds[0].execution.execution_id);
  });
  if(!r)throw Error('EXCEL_NAMED_TYPED_ROUND_'+index);rounds.push(r);
 }
 if(!['document_id','workflow_id','node_id'].every(k=>rounds[0].node[k]===rounds[1].node[k])
  ||rounds[0].configuration.readback.source.source_path!==rounds[1].configuration.readback.source.source_path)throw Error('EXCEL_NAMED_NODE_REPLACED');
 const requests=events.filter(e=>e.phase==='node_apply_prepared').map(e=>e.request);
 if(requests.filter(r=>r.target?.type==='imports.excel'&&r.target.kind==='new').length!==1
  ||requests.some(r=>!['imports.excel','exports.text'].includes(r.target?.type)))throw Error('EXCEL_NAMED_SUBSTITUTE_NODE');
 return {status:'PASS',node:rounds[0].node,executions:rounds.map(r=>r.execution.execution_id),rows:[2,3]};
}

export async function inspectSavedExcelNamed({load,channel,execute,graph,node,expected,origin}){
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs'),{closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const {makeExcelConfigureCode}=await load('client/lib/imports-excel-procedure.mjs');
 await channel.revealGraphNode({target:'body'});
 const state=await channel.observe({condition:'cold Excel range selection',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
 await selectPreparedGraphNode(channel,state,'cold select Excel range',{refreshReplacedBody:true});await openPreparedWizard(channel);
 try{
  const r=await execute(makeExcelConfigureCode({document_id:node.document_id,workflow_ref:graph.workflow_ref,node,inspect:true,excel:{},origin,build:'7.4.2',deadline:Date.now()+300000}));
  const s=r.configuration?.source;
  if(!r.verified||!r.cleanup_complete||s?.sheet_method!=='Именованный диапазон'||s.named_range!==expected.name||s.sheet!==expected.name
   ||s.extend_range!==expected.extend_range||s.header_rows!==expected.header_rows)throw Error('EXCEL_NAMED_COLD_SETTINGS');
  return {settings_applied:false,configuration:r.configuration};
 }finally{const closed=await closePreparedWizard(channel);if(!closed.verified||!closed.cleanup_complete||closed.settings_applied!==false)throw Error('EXCEL_NAMED_COLD_CANCEL');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [initial,updated,events]=await Promise.all(process.argv.slice(2).map(p=>readFile(p,'utf8').then(JSON.parse)));
 console.log(JSON.stringify(checkExcelNamedMain(initial,updated,events)));
}
