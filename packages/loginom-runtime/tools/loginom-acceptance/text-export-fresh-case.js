const binding=JSON.parse(await ctx.fs.readFile(ctx.dir+'/fresh-binding.json','utf8'));const modelDir=binding.model_run_directory;
const request=JSON.parse(await ctx.fs.readFile(modelDir+'/request.json','utf8'));
const events=JSON.parse(await ctx.fs.readFile(modelDir+'/evidence.json','utf8')).events;
const declared=events.filter(e=>e.phase==='node_apply_prepared'),complete=events.filter(e=>e.phase==='completed'&&e.outcome?.status==='SUCCEEDED');
const original=label=>{const candidates=declared.filter(e=>e.request.target.kind==='new'&&e.request.target.label===label).map(d=>({d,c:complete.find(e=>e.operation_id===d.operation_id)})).filter(x=>x.c);if(candidates.length!==1)throw Error('Unique completed model node required '+label);const {d,c}=candidates[0];return {request:d.request,node:c.outcome.output.node};};
const execute=async(label,id,destination)=>{const old=original(label),ref={...old.node,document_id:ctx.prep.document_id,workflow_id:ctx.prep.workflow_ref.workflow_id};
 const r={contract_revision:'1.0.0',operation_id:id,document_id:ctx.prep.document_id,workflow_ref:ctx.prep.workflow_ref,target:{kind:'existing',type:old.request.target.type,ref},mode:old.request.mode,inputs:[],parameters:destination?{destination}:{},mappings:[],finish:'execute',read:{ports:destination?[]:label==='Empty'?[0,1]:[0],sample_rows:destination?0:10,require_exact_numbers:!destination},budgets:{configure_ms:180000,execute_ms:60000,total_ms:240000}};
 const result=await ctx.runtime.runNodeApply(r);await ctx.fs.writeFile(ctx.dir+'/'+id+'.json',JSON.stringify({request:r,result},null,2));if(result.status!=='SUCCEEDED')throw Error('Fresh node failed '+label);return {r,result};};
// Native export execution refreshes its saved upstream dependencies. No source reconfiguration or redelivery.
await ctx.fs.writeFile(ctx.dir+'/external-strategy.json',JSON.stringify({source_execution:'native_saved_dependencies',source_parameters_reapplied:false}));
const manifest={model_run_directory:modelDir,exports:{},inventory_receipt:'external-inventory.json',empty_receipt:'external-source-empty.json',output_prefix:'/test-2/Dock-export-'+request.run_id+'-external-'+ctx.session.metadata.sessionId+'-'},outputs={};
for(const [kind,label,suffix] of [['changed','ExportCSV','changed.csv'],['typed','ExportTyped','typed.csv'],['wide','ExportWide','wide.tsv'],['zero','ExportEmpty','zero.csv']]){
 if(kind==='zero')await execute('Empty','external-source-empty');
 const old=original(label);const prior=complete.filter(e=>e.outcome.output?.node?.node_id===old.node.node_id&&e.outcome.output?.output?.file_artifacts?.length).at(-1);if(!prior)throw Error('Model baseline missing');
 const id='external-'+kind;const {result}=await execute(label,id,manifest.output_prefix+suffix);manifest.exports[kind]={receipt:id+'.json',baseline_operation_id:prior.operation_id};await ctx.fs.writeFile(ctx.dir+'/external-manifest.json',JSON.stringify(manifest,null,2));outputs[kind]={status:result.status,bytes:result.output.output.file_artifacts[0].bytes};
}
await ctx.fs.writeFile(ctx.dir+'/external-manifest.json',JSON.stringify(manifest,null,2));return {exports:outputs,model_run_directory:modelDir};
