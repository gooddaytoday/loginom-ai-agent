const steps=[];
for(const file of ['r2-start','graph','activate-import-guarded','activate-empty-guarded']){
 const source=await ctx.fs.readFile('.dock/'+file+'.mjs','utf8');
 const result=await new Function('ctx','return (async()=>{'+source+'})()')(ctx);
 await ctx.fs.writeFile(ctx.dir+'/'+file+'.json',JSON.stringify(result,null,2));steps.push(file);
}
return {steps,packagePath:ctx.packagePath,prepared:ctx.prep};
