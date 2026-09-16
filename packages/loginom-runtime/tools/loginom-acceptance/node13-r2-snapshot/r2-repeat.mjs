const before=ctx.browserSequence(),inspection=await ctx.runtime.inspect({operationId:ctx.r2FailureRequest.operation_id});
const repeat=await ctx.runtime.runNodeApply(ctx.r2FailureRequest),middle=ctx.browserSequence();
const resume=await ctx.runtime.runNodeApply(ctx.r2FailureRequest,{resume:true}),after=ctx.browserSequence();
ctx.runtime.assertPreparationAllowed();
return {before,middle,after,repeat:repeat.status,resume:resume.status,identical:JSON.stringify(repeat)===JSON.stringify(resume),inspection,pending_released:true};
