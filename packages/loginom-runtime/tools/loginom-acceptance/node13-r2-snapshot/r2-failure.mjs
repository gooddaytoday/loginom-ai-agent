ctx.graph=await ctx.adapter.observe(ctx.prep,Date.now()+30000);
const matches=ctx.graph.nodes.filter(n=>n.type==='transform.date_time'&&n.ref.node_id==='6b840be2-3723-4dc4-9e06-098016b76e60');if(matches.length!==1)throw Error('Unique saved date node required');
const request={operation_id:'node13-r2-failure',contract_revision:'1.0.0',document_id:ctx.prep.document_id,workflow_ref:ctx.prep.workflow_ref,target:{kind:'existing',type:'transform.date_time',ref:matches[0].ref},inputs:[],mode:'calendar',parameters:{},mappings:[],finish:'execute',read:{ports:[0],sample_rows:10,require_exact_numbers:true},budgets:{configure_ms:1800000,execute_ms:180000,total_ms:1800000}};
ctx.r2FailureRequest=request;return await ctx.runtime.runNodeApply(request);
