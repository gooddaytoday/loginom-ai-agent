// Operator body for text-export-live.mjs --drop-output-done-once.
// Requires a separately opened diagnostic copy of the reviewed task21 package.
// Never supplied to Hermes. New nodes are discarded by explicit diagnostic cleanup.
const assert=(await import('node:assert/strict')).default;
const base=(await import('node:url')).pathToFileURL(process.cwd()+'/client/lib/').href;
const {createNodeTargetBrowserAdapter}=await import(base+'node-target-browser.mjs');
const adapter=createNodeTargetBrowserAdapter({execute:ctx.execute,origin:'http://10.200.11.224',build:'7.4.2',pinned:{}});
const graph=()=>adapter.observe({document_id:ctx.prep.document_id,workflow_ref:ctx.prep.workflow_ref},Date.now()+30000);
const before=await graph(),sources=before.nodes.filter(n=>n.type==='imports.text');assert.equal(sources.length,1);const source=sources[0].ref;
const {createNodeProcedure}=await import(base+'node-procedure.mjs'),{createNodeExecutionProcedure}=await import(base+'node-execution-procedure.mjs'),{withBrowserReceipt}=await import(base+'executor.mjs');
const channel=createNodeProcedure({operation:{id:'source-execution-'+Date.now(),action:{action_key:'diagnostic.source',revision:'1'},deadline:Date.now()+120000},execute:ctx.execute,record:ctx.record,targetOrigin:'http://10.200.11.224',targetBuild:'7.4.2',maxSteps:2048,preparedNodeContext:{document_id:ctx.prep.document_id,workflow_ref:ctx.prep.workflow_ref,node:source},wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{receipt_namespace:ctx.session.metadata.sessionId,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
const driver=createNodeExecutionProcedure(channel,source);await driver.prepare();await driver.launchGraph();await driver.identify();const executed=await driver.waitCompleted({});assert.equal(executed.status,'completed');
const request={operation_id:'output-recovery-'+Date.now(),contract_revision:'1.0.0',document_id:ctx.prep.document_id,workflow_ref:ctx.prep.workflow_ref,
 target:{kind:'new',type:'transform.calculator',label:'Проверка восстановления выхода'},inputs:[{source,output:0,input:0}],mode:'expression',finish:'execute',
 parameters:{expressions:[{target:{kind:'new'},name:'doubled_loan',label:'Двойной кредит',type:'real',formula:'loan_amount * 2',replace:false}]},
 mappings:[{direction:'output',port:0,changes:[{source:{kind:'configured_field',name:'doubled_loan'},name:'VerifiedLoan'},{source:{kind:'configured_field',name:'credit_score'},excluded:true}]}],
 read:{ports:[0],sample_rows:3,require_exact_numbers:true},
 budgets:{configure_ms:240000,execute_ms:120000,total_ms:600000}};
const first=await ctx.runtime.runNodeApply(request);
await ctx.fs.writeFile(ctx.dir+'/'+request.operation_id+'-first-output-loss.json',JSON.stringify(first,null,2));
assert.equal(first.status,'AMBIGUOUS');assert.equal(first.output.pending_phase,'output_mapping');
const inspected=await ctx.rawRuntime.inspect({operationId:request.operation_id});await ctx.fs.writeFile(ctx.dir+'/'+request.operation_id+'-inspected-output-loss.json',JSON.stringify(inspected,null,2));
const resumed=await ctx.runtime.runNodeApply({operation_id:request.operation_id},{resume:true});
await ctx.fs.writeFile(ctx.dir+'/'+request.operation_id+'-resumed-output-loss.json',JSON.stringify(resumed,null,2));
assert.equal(resumed.status,'SUCCEEDED',JSON.stringify(resumed.error));assert.equal(resumed.output.output.ports[0].row_count,300);
assert.ok(resumed.output.output.ports[0].schema.some(f=>f.name==='VerifiedLoan'));assert.ok(!resumed.output.output.ports[0].schema.some(f=>f.name==='credit_score'));
const port=resumed.output.output.ports[0],names=port.schema.map(f=>f.name);
for(const row of port.sample){const value=Object.fromEntries(names.map((name,i)=>[name,Number(row[i].value)]));assert.equal(value.VerifiedLoan,value.loan_amount*2);}
const after=await graph();assert.equal(after.nodes.length,before.nodes.length+1);assert.equal(after.links.length,before.links.length+1);
const repeated=await ctx.runtime.runNodeApply(request);assert.deepEqual(repeated.output.node,resumed.output.node);
return {status:'PASS',manual:true,autonomous_acceptance:false,original_operation_id:request.operation_id,node:resumed.output.node,rows:300,created_nodes:1,created_links:1,repeat_same_node:true};
