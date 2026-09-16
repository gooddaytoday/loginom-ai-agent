const {randomBytes}=await import('node:crypto');const now=new Date().toISOString().replace(/[-:]/g,'');ctx.diagnosticRunId=now.slice(0,8)+'-'+now.slice(9,15)+'-'+randomBytes(4).toString('hex');
ctx.packagePath='/test-3/packages/Dock-date-time-'+ctx.diagnosticRunId+'.lgp';
const source=await ctx.fs.readFile('.dock/node13-live-preflight/start.mjs','utf8');const started=await new Function('ctx','return (async()=>{'+source+'})()')(ctx);
return {...started,diagnostic_run_id:ctx.diagnosticRunId,executor:'Codex operator',model_started:false,future_hermes_run_id:null,packagePath:ctx.packagePath};
