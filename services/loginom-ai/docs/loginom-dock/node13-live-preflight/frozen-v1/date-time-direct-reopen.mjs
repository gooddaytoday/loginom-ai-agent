// Independent post-run diagnostic adapter for date-time-live.mjs.
// Call explicitly after Hermes has finished; never saves or makes a package copy.
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createNodeTargetBrowserAdapter} from '../../client/lib/node-target-browser.mjs';
export async function reopenDateTimeAcceptance(ctx,runDirectory){
 const root=path.resolve(process.cwd(),'.dock/node13-acceptance/runs'),dir=path.resolve(runDirectory);
 if(path.dirname(dir)!==root)throw Error('Owned acceptance run required');
 const request=JSON.parse(await ctx.fs.readFile(path.join(dir,'request.json'),'utf8'));
 const evidence=JSON.parse(await ctx.fs.readFile(path.join(dir,'evidence.json'),'utf8'));
 const packagePath='/test-3/packages/Dock-date-time-'+request.run_id+'.lgp';
 if(request.goal_id!=='date-time-sales'||request.package_path!==packagePath||request.run_id!==path.basename(dir)
   ||request.runtime_source_pin.client_revision!==ctx.session.metadata.clientRevision||evidence.export_complete!==true)throw Error('Run identity differs');
 const labels=['Продажи','Календарь','Месяцы','Кварталы','Нет продаж','Пустой календарь'];
 const events=evidence.events,planned=new Map(),final=new Map();
 for(const e of events){if(e.phase==='node_apply_prepared')planned.set(e.operation_id,e.request);
  if(e.phase==='node_checkpoint'&&e.result.status==='SUCCEEDED'){
   const r=planned.get(e.operation_id);if(!r)throw Error('Missing original request');
   const label=r.target.kind==='new'?r.target.label:[...final].find(([,v])=>v.node.node_id===r.target.ref.node_id)?.[0];
   if(!labels.includes(label))throw Error('Foreign original node');final.set(label,{request:r,node:e.result.node});
  }}
 if(final.size!==6)throw Error('Six completed nodes required');
 ctx.prep=await ctx.prepare({operationId:'base-open',intent:'open_package',packagePath});
 if(ctx.prep.status!=='READY')throw Error('Exact direct open failed');
 const adapter=createNodeTargetBrowserAdapter({execute:ctx.execute,origin:'http://logi-test-plan.bg.local',build:'7.4.2',pinned:ctx.pinned});
 const graph=await adapter.observe(ctx.prep,Date.now()+30000),graph_browser_file='browser-'+ctx.browserSequence()+'.json';
 if(graph.nodes.length!==6||graph.foreign_links?.length)throw Error('Unexpected saved graph');
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
  const result=await ctx.runtime.runNodeApply(r);
  await ctx.fs.writeFile(path.join(ctx.dir,operation_id+'.json'),JSON.stringify(result,null,2),{flag:'wx'});
  if(result.status!=='SUCCEEDED'||result.cleanup_complete!==true)throw Error('Diagnostic operation did not finish: '+label);
  operations[label]=operation_id;
 }
 const files={};for(const name of await ctx.fs.readdir(ctx.dir))if(/^browser-\d+\.json$/.test(name)||['execution-events.jsonl','public-api.jsonl'].includes(name))
  files[name]=createHash('sha256').update(await ctx.fs.readFile(path.join(ctx.dir,name))).digest('hex');
 const index={session_directory:ctx.dir,graph_browser_file,operations,files};
 await ctx.fs.writeFile(path.join(ctx.dir,'diagnostics.json'),JSON.stringify(index,null,2),{flag:'wx'});
 return {index:path.join(ctx.dir,'diagnostics.json'),packagePath,model_started:false,independent_audit_required:true};
}
