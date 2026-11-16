import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';

export function checkExcelAutoMain(expected,events){
 const policy=expected.excel_auto,checkpoints=events.filter(e=>e.phase==='node_checkpoint').map(e=>e.result)
  .filter(r=>r?.status==='SUCCEEDED'&&r.cleanup_complete===true&&r.execution?.status==='completed'
   &&r.configuration?.readback?.kind==='excel_import');
 const rounds=checkpoints.filter(r=>r.configuration.readback.auto_detect===policy.mode);
 const typed=(r,want)=>{const p=r.output?.ports?.[0];return p?.fresh===true&&p.port===0
  &&p.execution_id===r.execution.execution_id&&p.freshness_basis==='completed_execution_port_source'&&matchesExpectedOutput(p,want);};
 const initial=rounds.find(r=>r.configuration.readback.source.source_path.endsWith(policy.initial)
  &&typed(r,expected.excel_auto.initial_output));
 const final=rounds.find(r=>initial&&checkpoints.indexOf(r)>checkpoints.indexOf(initial)
  &&r.execution.execution_id!==initial.execution.execution_id&&r.configuration.readback.source.source_path.endsWith(policy.file)
  &&typed(r,expected.outputs[0]));
 if(!initial||!final||!['document_id','workflow_id','node_id'].every(k=>initial.node[k]===final.node[k]))throw Error('EXCEL_AUTO_SAME_NODE_TYPED_ROUNDS');
 const requests=events.filter(e=>e.phase==='node_apply_prepared').map(e=>e.request);
 if(requests.filter(r=>r.target?.type==='imports.excel'&&r.target.kind==='new').length!==1
  ||requests.some(r=>!['imports.excel','exports.text'].includes(r.target?.type)))throw Error('EXCEL_AUTO_SUBSTITUTE_NODE');
 const mode={'Нет':'none','Только новые':'new','Все':'all'}[policy.mode];
 const patches=requests.filter(r=>r.target?.type==='imports.excel'&&r.target.kind==='existing'
  &&r.parameters?.excel?.source_path?.endsWith(policy.file));
 if(!patches.some(r=>r.target.ref.node_id===initial.node.node_id&&r.parameters.excel.auto_detect===mode
  &&r.parameters.excel.columns===undefined&&r.parameters.excel.header_rows===undefined&&r.mappings.length===0))throw Error('EXCEL_AUTO_MANUAL_SCHEMA_REPLACEMENT');
 return {status:'PASS',node:initial.node,mode:policy.mode,executions:[initial.execution.execution_id,final.execution.execution_id]};
}

export async function inspectSavedExcelAuto({load,channel,execute,node,graph,expected,origin}){
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
 const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const {makeExcelConfigureCode}=await load('client/lib/imports-excel-procedure.mjs');
 await channel.revealGraphNode({target:'body'});
 const state=await channel.observe({condition:'cold Excel policy selection',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
 await selectPreparedGraphNode(channel,state,'select cold Excel policy',{refreshReplacedBody:true});await openPreparedWizard(channel);
 try{
  const result=await execute(makeExcelConfigureCode({document_id:node.document_id,workflow_ref:graph.workflow_ref,node,excel:{},inspect:true,
   origin,build:'7.4.2',deadline:channel.now()+300000}));
  const c=result.configuration;
  if(!result.verified||!result.cleanup_complete||c?.auto_detect!==expected.mode||c.source.header_rows!==1||!c.source.whole_sheet
   ||c.source.blank_rows!=='Импортировать'||c.source.sheet_method!=='По имени'||c.source.sheet!=='Data'
   ||!c.source.source_path.endsWith(expected.file))throw Error('EXCEL_AUTO_COLD_POLICY');
  return {settings_applied:false,configuration:c};
 }finally{
  const closed=await closePreparedWizard(channel);
  if(!closed.verified||!closed.cleanup_complete||closed.settings_applied!==false)throw Error('EXCEL_AUTO_COLD_CANCEL');
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [expected,events]=await Promise.all(process.argv.slice(2).map(p=>readFile(p,'utf8').then(JSON.parse)));
 console.log(JSON.stringify(checkExcelAutoMain(expected,events)));
}
