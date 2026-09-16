// Independent post-run diagnostic adapter for date-time-live.mjs.
// Call explicitly after Hermes has finished; never saves or makes a package copy.
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createNodeTargetBrowserAdapter} from '../../client/lib/node-target-browser.mjs';
import {inspectAndExecuteSavedImport} from './date-time-saved-import.mjs';
import {readDiagnosticEvents} from './date-time-event-reference.mjs';
import {assertReadOnlyWizardAction} from './date-time-reopen-policy.mjs';
async function diagnosticFiles(ctx){
 const names=(await ctx.fs.readdir(ctx.dir)).filter(name=>/^browser-\d+\.json$/.test(name)||['execution-events.jsonl','public-api.jsonl'].includes(name));
 const events=(await ctx.fs.readFile(path.join(ctx.dir,'execution-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 for(const event of events)if(event.phase==='diagnostic_source_download_completed'){
  const relative=event.receipt.download_file,absolute=path.resolve(ctx.dir,relative);
  if(!absolute.startsWith(ctx.dir+path.sep)||path.isAbsolute(relative))throw Error('Foreign diagnostic download');names.push(relative);
 }
 const files={};for(const name of names)files[name]=createHash('sha256').update(await ctx.fs.readFile(path.join(ctx.dir,name))).digest('hex');return files;
}
export async function reopenDateTimeAcceptance(ctx,runDirectory){
 const root=path.resolve(process.cwd(),'.dock/node13-acceptance/runs'),dir=path.resolve(runDirectory);
 if(path.dirname(dir)!==root)throw Error('Owned acceptance run required');
 const request=JSON.parse(await ctx.fs.readFile(path.join(dir,'request.json'),'utf8'));
 const evidence=JSON.parse(await ctx.fs.readFile(path.join(dir,'evidence.json'),'utf8'));
 const packagePath='/test-3/packages/Dock-date-time-'+request.run_id+'.lgp';
 if(request.goal_id!=='date-time-sales'||request.package_path!==packagePath||request.run_id!==path.basename(dir)
   ||request.runtime_source_pin.client_revision!==ctx.session.metadata.clientRevision||evidence.export_complete!==true)throw Error('Run identity differs');
 const labels=['Продажи','Календарь','Месяцы','Кварталы','Нет продаж','Пустой календарь'];
 const events=await readDiagnosticEvents(evidence),planned=new Map(),final=new Map();
 for(const e of events){if(e.phase==='node_apply_prepared')planned.set(e.operation_id,e.request);
  if(e.phase==='node_checkpoint'&&e.result.status==='SUCCEEDED'){
   const r=planned.get(e.operation_id);if(!r)throw Error('Missing original request');
   const label=r.target.kind==='new'?r.target.label:[...final].find(([,v])=>v.node.node_id===r.target.ref.node_id)?.[0];
   if(!labels.includes(label))throw Error('Foreign original node');final.set(label,{request:r,node:e.result.node,checkpoint:e.result});
  }}
 if(final.size!==6)throw Error('Six completed nodes required');
 ctx.prep=await ctx.prepare({operationId:'base-open',intent:'open_package',packagePath});
 if(ctx.prep.status!=='READY')throw Error('Exact direct open failed');
 const adapter=createNodeTargetBrowserAdapter({execute:ctx.execute,origin:'http://logi-test-plan.bg.local',build:'7.4.2',pinned:ctx.pinned});
 const graph=await adapter.observe(ctx.prep,Date.now()+30000),graph_browser_file='browser-'+ctx.browserSequence()+'.json';
 const service=graph.nodes.filter(n=>n.type==='bg-vendor-icon-modelvariables');
 if(service.length>1||service.some(n=>n.label!=='Переменные сценария'||n.inputs.length||n.outputs.length)
   ||graph.links.some(l=>service.some(n=>l.source===n.ref.node_id||l.target===n.ref.node_id))
   ||graph.nodes.length-service.length!==6||graph.foreign_links?.length)throw Error('Unexpected saved graph');
 const operations={};
 for(const [i,label]of labels.entries()){
  const matches=graph.nodes.filter(n=>n.label===label&&n.ref.node_id===final.get(label).node.node_id);
  if(matches.length!==1)throw Error('Saved node identity differs');
  const old=final.get(label).request,operation_id='node13-reopen-'+i;
  const r={...old,operation_id,document_id:ctx.prep.document_id,workflow_ref:ctx.prep.workflow_ref,
   target:{kind:'existing',type:old.target.type,ref:matches[0].ref},inputs:[],mappings:[],
   parameters:label==='Продажи'?{source:old.parameters.source,settings:{}}:{},finish:'execute',
   read:{ports:label==='Нет продаж'?[0,1]:[0],sample_rows:10,require_exact_numbers:true},
   budgets:{configure_ms:1800000,execute_ms:180000,total_ms:1800000}};
  let result;
  if(label==='Продажи') {
   result=await inspectAndExecuteSavedImport(ctx,{operationId:operation_id,node:matches[0].ref,
    originalRequest:old,originalCheckpoint:final.get(label).checkpoint});
  } else {
   ctx.setDiagnosticGuard((state,action)=>assertReadOnlyWizardAction(state,action,{allowUnchangedFinish:true}));
   try{result=await ctx.runtime.runNodeApply(r);}finally{ctx.setDiagnosticGuard(null);}
  }
  await ctx.fs.writeFile(path.join(ctx.dir,operation_id+'.json'),JSON.stringify(result,null,2),{flag:'wx'});
  if(result.status!=='SUCCEEDED'||result.cleanup_complete!==true)throw Error('Diagnostic operation did not finish: '+label);
  operations[label]=operation_id;
 }
 const files=await diagnosticFiles(ctx);
 const index={protocol_revision:2,session_directory:ctx.dir,graph_browser_file,operations,files,
  import_protocol:'read_cancel_download_execute',public_persisted_import_supported:false};
 await ctx.fs.writeFile(path.join(ctx.dir,'diagnostics.pre-close.json'),JSON.stringify(index,null,2),{flag:'wx'});
 return {provisional_index:path.join(ctx.dir,'diagnostics.pre-close.json'),packagePath,model_started:false,
  close_without_saving_then_seal_required:true,independent_audit_required:true};
}

// Invoke after the operator's observed package close/discard, before closing the
// harness. Includes cleanup browser receipts without rewriting earlier evidence.
export async function sealDateTimeDiagnostics(ctx) {
 const index=JSON.parse(await ctx.fs.readFile(path.join(ctx.dir,'diagnostics.pre-close.json'),'utf8'));
 if(index.protocol_revision!==2||index.session_directory!==ctx.dir)throw Error('Owned diagnostic index required');
 const files=await diagnosticFiles(ctx);
 await ctx.fs.writeFile(path.join(ctx.dir,'diagnostics.json'),JSON.stringify({...index,files},null,2),{flag:'wx'});
 return {index:path.join(ctx.dir,'diagnostics.json'),model_started:false};
}
