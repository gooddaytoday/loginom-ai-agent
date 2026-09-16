// Version 2 diagnostic protocol. This is not persisted-import node.apply support.
import {createHash} from 'node:crypto';
import {createNodeProcedure} from '../../client/lib/node-procedure.mjs';
import {withBrowserReceipt} from '../../client/lib/executor.mjs';
import {selectPreparedGraphNode} from '../../client/lib/node-graph-selection.mjs';
import {openPreparedWizard} from '../../client/lib/node-wizard-open.mjs';
import {closePreparedWizard} from '../../client/lib/node-wizard-close.mjs';
import {readImportDefinitionPages,readOutputDefinitionPages} from '../../client/lib/import-definition-pages.mjs';
import {bindConfiguredOutputColumns} from '../../client/lib/text-import-node.mjs';
import {ensureGroupingOutputSources} from '../../client/lib/grouping-output-sources.mjs';
import {createNodeExecutionProcedure} from '../../client/lib/node-execution-procedure.mjs';
import {openNewOutputTable,configureTablePrecision,prepareTableRead,restoreTablePrecision,returnFromOutputTable} from '../../client/lib/node-output-procedure.mjs';
import {readTableOutputPages} from '../../client/lib/table-output-pages.mjs';
import {decodeTableOutput} from '../../client/lib/table-output-values.mjs';
import {assertReadOnlyWizardAction} from './date-time-reopen-policy.mjs';
import {downloadSavedSource} from './date-time-saved-source.mjs';
const one=(xs,m)=>{if(xs.length!==1)throw Error(m);return xs[0];};
const pick=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v[k]]));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export const savedImportSettings=v=>pick(v,['source','format','columns','output_mapping']);
export async function inspectAndExecuteSavedImport(ctx,{operationId,node,originalRequest,originalCheckpoint}) {
 if(originalRequest.target.type!=='imports.text'||originalCheckpoint.node.node_id!==node.node_id||node.document_id!==ctx.prep.document_id)throw Error('Saved import identity differs');
 const request={...originalRequest,operation_id:operationId,document_id:ctx.prep.document_id,workflow_ref:ctx.prep.workflow_ref,
  target:{kind:'existing',type:'imports.text',ref:node},parameters:{source:originalRequest.parameters.source,settings:{}},inputs:[],mappings:[]};
 const operation={id:operationId,deadline:Date.now()+1800000,action:{action_key:'diagnostic.saved_import',revision:'2'}};
 let observed,configuration,columns,cancellation;
 const record=async e=>{
  if(e.phase==='node_step_prepared'&&e.action)assertReadOnlyWizardAction(observed,e.action);
  const saved=await ctx.record(e);if(e.phase==='node_observation_completed')observed=e.outcome.output;return saved;
 };
 const channel=createNodeProcedure({operation,execute:ctx.execute,record,targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',maxSteps:4096,
  preparedNodeContext:{document_id:ctx.prep.document_id,workflow_ref:ctx.prep.workflow_ref,node},
  wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{receipt_namespace:'node13-diagnostic:'+ctx.session.metadata.sessionId,
   receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
 await ctx.record({phase:'diagnostic_import_prepared',operation_id:operationId,request,protocol_revision:2,original_node:originalCheckpoint.node});
 await selectPreparedGraphNode(channel,await channel.observe({condition:'saved import graph before inspection',ready:s=>s.prepared_node_context?.surface==='graph'}),'select saved import for inspection');
 await openPreparedWizard(channel);
 try {
  const source=await channel.observe({condition:'saved import source values',ready:s=>s.wizard?.stage==='text_import_file'&&s.wizard.import_source?.status==='draft_ui_values'});
  const values=Object.fromEntries(Object.entries(source.wizard.import_source.fields).map(([k,v])=>{
   if(v.status!=='observed'||v.truncated)throw Error('Incomplete saved source field');return [k,v.value];}));
  const next=async(from,to)=>{
   const s=await channel.observe({condition:'read-only import page '+from,ready:s=>s.wizard?.stage===from});
   await channel.perform({condition:'inspect saved import next page',initialObservation:s,ready:s=>s.wizard?.stage===from,
    identity:s=>s.prepared_node_context,resolve:s=>({verb:'wizard_step',ref:one(s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'),'Unique Next required').ref,expected_stage:to})});
  };
  await next('text_import_file','text_import_format');
  const definitions=await readImportDefinitionPages(channel,{expectedCount:originalCheckpoint.configuration.readback.columns.length});
  const formatState=observed,aliases={delimiter:{'Точка с запятой':';'},decimal_separator:{'Точка (.)':'.'},text_qualifier:{'Двойная кавычка (")':'"'}};
  const format=Object.fromEntries(Object.entries(formatState.wizard.settings.fields).map(([k,v])=>{
   if(v.status!=='observed'||v.truncated)throw Error('Incomplete saved format field');return [k,aliases[k]?.[v.value]??v.value];}));
  await next('text_import_format','output_mapping');
  const initialMapping=await channel.observe({condition:'saved import native mapping before source retrieval',readMappings:true,ready:s=>s.node_mapping?.verified===true});
  const native=(await ensureGroupingOutputSources(channel,initialMapping)).node_mapping;
  const output=await readOutputDefinitionPages(channel,{expectedCount:definitions.fields.filter(f=>f.used).length});
  const after=(await channel.observe({condition:'saved import mapping remained unchanged',readMappings:true,ready:s=>s.node_mapping?.verified===true})).node_mapping;
  const semantic=m=>Object.fromEntries(Object.entries(m).filter(([k])=>k!=='rendered_indices'));
  if(!equal(semantic(native),semantic(after)))throw Error('Saved mapping changed while reading');
  columns=bindConfiguredOutputColumns(definitions.fields,output,after);
  configuration={kind:'text_import',node,source:values,format,
   columns:definitions.fields.map(f=>pick(f,['index','name','label','type','data_kind','used'])),
   output_mapping:{port:0,autosync:after.autosync,fields:after.target_fields.map(f=>({...pick(f,['index','name','label','type','data_kind']),source_name:f.source?.name}))}};
  await ctx.record({phase:'diagnostic_import_configuration_read',operation_id:operationId,configuration,definitions,output,native_mapping:after});
  if(!equal(savedImportSettings(configuration),savedImportSettings(originalCheckpoint.configuration.readback)))throw Error('Saved import configuration differs');
 } finally { cancellation=await closePreparedWizard(channel);await ctx.record({phase:'diagnostic_import_cancelled',operation_id:operationId,cancellation}); }
 const fixture=await ctx.fs.readFile(new URL('./fixtures/date-time/sales.csv',import.meta.url));
 const download=await downloadSavedSource(ctx,{operationId:operationId+'-source',sourcePath:configuration.source.source_path,
  bytes:fixture.length,sha256:createHash('sha256').update(fixture).digest('hex')});
 const driver=createNodeExecutionProcedure(channel,node);await driver.prepare();await driver.launchGraph();await driver.identify();
 const execution=await driver.waitCompleted({});
 if(!execution.verified||!execution.owner_verified)throw Error('Saved import execution unverified');
 const opened=await openNewOutputTable(channel,0),formatProof=await configureTablePrecision(channel,opened.table);
 let data,readSettings,restoration;
 try{readSettings=await prepareTableRead(channel,opened.table);const raw=await readTableOutputPages(channel,opened.table,{sampleRows:10});
  data=decodeTableOutput(raw,{formatProof,readSettings,expectedColumns:columns,requireExactNumbers:true});
 }finally{restoration=await restoreTablePrecision(channel,formatProof);}
 const returned=await returnFromOutputTable(channel,opened.table);
 const result={status:'SUCCEEDED',operation_id:operationId,node,configuration:{readback:configuration},execution,
  output:{ports:[{port:0,port_guid:opened.port_guid,fresh:true,execution_id:execution.execution_id,...data}],
   format_proof:formatProof,format_restoration:restoration,read_settings:readSettings,workflow_return:returned},
  cleanup_complete:true,protocol_revision:2,source_download:download,cancellation,format_proof:formatProof,format_restoration:restoration,
  read_settings:readSettings,workflow_return:returned,public_node_apply:false,package_saved:false,independent_audit_required:true};
 await ctx.record({phase:'diagnostic_import_completed',operation_id:operationId,result});return result;
}
