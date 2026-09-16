for(const file of ['import','calendar-initial','calendar-final','month','quarter','filter','empty']){const v=JSON.parse(await ctx.fs.readFile(ctx.dir+'/'+file+'.json','utf8'));if(v.status!=='SUCCEEDED'||v.cleanup_complete!==true)throw Error('Incomplete '+file);}
return await ctx.runtime.run('package.save_checkpoint',{path:ctx.packagePath,conflict_policy:'fail'},{operationId:'node13-full-save'});
