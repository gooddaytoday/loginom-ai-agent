for(const [id,file] of [['full-init','full-init'],['source-admit','full-source-admit'],['source-deliver','source-deliver'],['import','import'],['calendar-initial','full-calendar']]){
 const body=await ctx.fs.readFile('.dock/node13-live-preflight/'+file+'.mjs','utf8');const result=await new Function('ctx','return (async()=>{'+body+'})()')(ctx);
 await ctx.fs.writeFile(ctx.dir+'/'+id+'.json',JSON.stringify(result,null,2),{flag:'wx'});
 if(['import','calendar-initial'].includes(id)&&(result.status!=='SUCCEEDED'||result.cleanup_complete!==true))return {stopped_at:id,result};
 if(id==='source-deliver'&&result.state!=='settled')throw Error('Source delivery incomplete');
}return {completed_through:'calendar-initial',independent_audit_required:true,model_started:false};
