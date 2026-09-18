// Operator-only placement regression, never supplied to Hermes.
// Open a disposable task21 diagnostic package in text-export-live.mjs with an
// explicit /mimo storage root. The import must not already be executing/active.
// Exercises offscreen export, idempotent replay, then no-coordinate calculator
// after native zoom. Audit the downloaded CSV independently and discard this
// diagnostic package through the owned cleanup operator afterwards.
// Pass --placement-edge to the harness to reproduce the lower-edge regression.
const exportResult=await (async()=>{
const assert=(await import('node:assert/strict')).default;
const base=(await import('node:url')).pathToFileURL(process.cwd()+'/client/lib/').href;
const {createNodeTargetBrowserAdapter}=await import(base+'node-target-browser.mjs');
const adapter=createNodeTargetBrowserAdapter({execute:ctx.execute,origin:'http://10.200.11.224',build:'7.4.2',pinned:{}});
const graph=()=>adapter.observe({document_id:ctx.prep.document_id,workflow_ref:ctx.prep.workflow_ref},Date.now()+30000);
const before=await graph(),sources=before.nodes.filter(n=>n.type==='imports.text');assert.equal(sources.length,1);const source=sources[0].ref;
const {createNodeProcedure}=await import(base+'node-procedure.mjs'),{createNodeExecutionProcedure}=await import(base+'node-execution-procedure.mjs'),{withBrowserReceipt}=await import(base+'executor.mjs');
const channel=createNodeProcedure({operation:{id:'source-execution-'+Date.now(),action:{action_key:'diagnostic.source',revision:'1'},deadline:Date.now()+120000},execute:ctx.execute,record:ctx.record,targetOrigin:'http://10.200.11.224',targetBuild:'7.4.2',maxSteps:2048,preparedNodeContext:{document_id:ctx.prep.document_id,workflow_ref:ctx.prep.workflow_ref,node:source},wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{receipt_namespace:ctx.session.metadata.sessionId,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
const driver=createNodeExecutionProcedure(channel,source);await driver.prepare();await driver.launchGraph();await driver.identify();const executed=await driver.waitCompleted({});assert.equal(executed.status,'completed');
const request={operation_id:'placement-export-'+Date.now(),contract_revision:'1.0.0',document_id:ctx.prep.document_id,workflow_ref:ctx.prep.workflow_ref,
 target:{kind:'new',type:'exports.text',label:'Проверка размещения экспорта',position:process.argv.includes('--placement-edge')?{x:400,y:900}:{x:1300,y:100}},inputs:[{source,output:0,input:0}],mode:'delimited',finish:'execute',parameters:{destination:process.argv[process.argv.indexOf('--storage')+1]+'/placement-'+Date.now()+'.csv',encoding:'UTF-8',delimiter:',',header:'names',bom:false,line_ending:'LF',decimal_separator:'.',null_marker:'',text_qualifier:'\"'},mappings:[],read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:240000,execute_ms:120000,total_ms:600000}};
const result=await ctx.runtime.runNodeApply(request);await ctx.fs.writeFile(ctx.dir+'/placement-export-result.json',JSON.stringify(result,null,2));
assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
const after=await graph(),added=after.nodes.filter(n=>!before.nodes.some(b=>b.ref.node_id===n.ref.node_id));assert.equal(added.length,1);assert.deepEqual(added[0].position,process.argv.includes('--placement-edge')?{x:400,y:904}:{x:1304,y:104});
const repeat=await ctx.runtime.runNodeApply(request);assert.deepEqual(repeat.output.node,result.output.node);
return {status:'PASS',position:added[0].position,node:result.output.node,execution:result.output.execution,output:result.output.output,repeat_same_node:true};

})();
const automaticResult=await (async()=>{
const assert=(await import('node:assert/strict')).default;
const base=(await import('node:url')).pathToFileURL(process.cwd()+'/client/lib/').href;
const {createNodeTargetBrowserAdapter}=await import(base+'node-target-browser.mjs');
const adapter=createNodeTargetBrowserAdapter({execute:ctx.execute,origin:'http://10.200.11.224',build:'7.4.2',pinned:{}});
const graph=()=>adapter.observe({document_id:ctx.prep.document_id,workflow_ref:ctx.prep.workflow_ref},Date.now()+30000);
const before=await graph(),sources=before.nodes.filter(n=>n.type==='imports.text');assert.equal(sources.length,1);const source=sources[0].ref;

const request={operation_id:'placement-auto-'+Date.now(),contract_revision:'1.0.0',document_id:ctx.prep.document_id,workflow_ref:ctx.prep.workflow_ref,target:{kind:'new',type:'transform.calculator',label:'Автоматическое размещение'},inputs:[{source,output:0,input:0}],mode:'expression',finish:'done',parameters:{expressions:[{target:{kind:'new'},name:'TwiceLoan',label:'TwiceLoan',type:'real',formula:'loan_amount * 2',replace:false}]},mappings:[],read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:240000,execute_ms:120000,total_ms:600000}};
const result=await ctx.runtime.runNodeApply(request);await ctx.fs.writeFile(ctx.dir+'/placement-auto-result.json',JSON.stringify(result,null,2));assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));const after=await graph(),added=after.nodes.filter(n=>!before.nodes.some(b=>b.ref.node_id===n.ref.node_id));assert.equal(added.length,1);assert.equal(after.links.length,before.links.length+1);return {status:'PASS',node:result.output.node,position:added[0].position};

})();
return {export:exportResult,automatic:automaticResult};
