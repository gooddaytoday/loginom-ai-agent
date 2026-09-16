const {createNodeTargetBrowserAdapter}=await import(process.cwd()+'/client/lib/node-target-browser.mjs');
ctx.adapter=createNodeTargetBrowserAdapter({execute:ctx.execute,origin:'http://logi-test-plan.bg.local',build:'7.4.2',pinned:ctx.pinned});
ctx.graph=await ctx.adapter.observe(ctx.prep,Date.now()+30000);return ctx.graph;
