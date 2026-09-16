import {createNodeProcedure} from '../../client/lib/node-procedure.mjs';
import {withBrowserReceipt} from '../../client/lib/executor.mjs';
import {openPreparedWizard} from '../../client/lib/node-wizard-open.mjs';
import {closePreparedWizard} from '../../client/lib/node-wizard-close.mjs';
import {readImportDefinitionPages} from '../../client/lib/import-definition-pages.mjs';
import {isTextImportSourceReady} from '../../client/lib/text-import-procedure.mjs';
import {selectPreparedGraphNode} from '../../client/lib/node-graph-selection.mjs';
import {createNodeTargetBrowserAdapter} from '../../client/lib/node-target-browser.mjs';

function sourceChannel({prepared,node,execute,record,receiptNamespace,operationId}){
 const operation={id:operationId,action:{action_key:'node14.audit.saved_source',revision:'1'},deadline:Date.now()+180000};
 return createNodeProcedure({operation,execute,record,targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',preparedNodeContext:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node},maxSteps:256,
  wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{receipt_namespace:receiptNamespace,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
}
function portProof(state){
 if(state.node_outputs?.verified!==true||state.node_outputs.surface!=='graph'||state.node_outputs.ports.length!==1)throw Error('Source output identity unavailable');
 const p=state.node_outputs.ports[0];if(p.index!==0||typeof p.active!=='boolean')throw Error('Source tabular output differs');
 return {node:state.prepared_node_context,port_guid:p.port_guid,active:p.active};
}
export async function inspectSavedMissingValuesSource(args){
 // Bind a fresh preparation to its cached native workflow before opening UI.
 // observe performs no graph or settings gestures.
 const adapter=createNodeTargetBrowserAdapter({execute:args.execute,origin:'http://logi-test-plan.bg.local',build:'7.4.2'});
 await adapter.observe({document_id:args.prepared.document_id,workflow_ref:args.prepared.workflow_ref,
  target:{kind:'existing',type:'imports.text',ref:args.node},inputs:[]},Date.now()+15000);
 const channel=sourceChannel(args);
 const initial=await channel.observe({condition:'saved source graph identity',readOutputs:true,ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'&&s.node_outputs?.verified===true});
 if(!initial.node_outputs.node_selected)await selectPreparedGraphNode(channel,initial,'select saved source for inspection');
 const opened=await openPreparedWizard(channel);
 const s=await channel.observe({condition:'saved import source fields',ready:isTextImportSourceReady});
 const source=Object.fromEntries(['source_path','encoding','rows_to_skip','first_line_as_title'].map(k=>[k,s.wizard.import_source.fields[k].value]));
 await channel.perform({condition:'inspect saved import format without editing',initialObservation:s,ready:isTextImportSourceReady,identity:()=>args.node,
  resolve:s=>{const e=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));if(e.length!==1)throw Error('Import Next not unique');return {verb:'wizard_step',ref:e[0].ref,expected_stage:'text_import_format'};}});
 const f=await channel.observe({condition:'saved import format',importColumnPage:{offset:0,limit:8},ready:s=>s.wizard?.stage==='text_import_format'&&['delimiter','decimal_separator','null_marker','text_qualifier'].every(k=>s.wizard.settings?.fields?.[k]?.status==='observed')});
 const format=Object.fromEntries(['delimiter','decimal_separator','null_marker','text_qualifier'].map(k=>[k,f.wizard.settings.fields[k].value]));
 const definitions=await readImportDefinitionPages(channel);
 const columns=definitions.fields.map(f=>Object.fromEntries(['name','label','type','data_kind','used'].map(k=>[k,f[k]])));
 const cancelled=await closePreparedWizard(channel);
 const after=await channel.observe({condition:'saved source inspection cancelled',readOutputs:true,ready:s=>s.prepared_node_context?.surface==='graph'&&s.node_outputs?.verified===true});
 return {verified:true,kind:'saved_import_inspection',diagnostic_operation_id:args.operationId,node:args.node,package_path:args.prepared.package_ref.path,source,format,columns,opened,cancelled,after_cancel:portProof(after),settings_applied:false};
}
export async function observeMissingValuesSourceOutput(args){
 const channel=sourceChannel(args);
 const state=await channel.observe({condition:'source activity after target execution',readOutputs:true,ready:s=>s.prepared_node_context?.surface==='graph'&&s.node_outputs?.verified===true});
 return {...portProof(state),diagnostic_operation_id:args.operationId};
}
