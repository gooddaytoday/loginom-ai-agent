import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {receivePrivateAdmission,retainRunCommandCreation,retainPromptSender,associatePromptRequest,relayPromptRequest,admitPromptInput,relayPromptInput,promptSDKContext,assertSDKContext,retainSDKInvocation,assertSDKInvocation} from '../../../src/cli/private-admission.mjs'
import {withStandaloneCancellation} from '../../../src/cli/standalone-cancellation'
import {mock} from 'bun:test'
// Labelled command-runtime service double exposes the unchanged Effect generator;
// no AppRuntime/project bootstrap or native/model dispatch is performed.
mock.module('../../../src/cli/effect-cmd',()=>({effectCmd:(opts:unknown)=>opts}))
const {RunCommand}=await import('../../../src/cli/cmd/run')
import {Effect} from 'effect'
import {HttpServerRequest} from 'effect/unstable/http'
import {createOpencodeClient} from '@loginom-ai-agent/sdk/v2'
import {streamText,tool,jsonSchema} from 'ai'
import {MockLanguageModelV3} from 'ai/test'
const out=process.argv[2]
await receivePrivateAdmission()
let callbackCount=0,modelDoubleCount=0,realRequestCount=0,scopeDeadline:bigint|undefined,handlerRefusal
await withStandaloneCancellation(async runSignal=>{
 const runArgs={message:['harmless business fixture'],format:'json',command:undefined,model:undefined,agent:undefined}
 // Real RunCommand generator executes its original retention before first await.
 // Missing Effect service stops here; no model/native preparation is executed.
 try{await Effect.runPromise(RunCommand.handler!(runArgs as never) as never)}catch(e){handlerRefusal=e}
 assert(handlerRefusal)
 const root=retainRunCommandCreation(runArgs,runSignal);assert(root)
 const sessionID='ses_original_source_fixture',input={sessionID,parts:[{type:'text',text:'harmless business fixture'}]}
 retainPromptSender(root,input,'prompt')
 const sdk=createOpencodeClient({baseUrl:'http://opencode.internal',fetch:async(raw,init)=>{
  const original=associatePromptRequest(root,new Request(raw,init))
  const request=relayPromptRequest(original,new Request(original,{headers:new Headers(original.headers)}))
  const web=HttpServerRequest.fromWeb(request);assert.equal(web.source,request);realRequestCount++
  const payload=await request.json()
  // Source session service is a labelled no-model/no-native double; transport,
  // Web Request/Effect adapter and private association are actual implementations.
  const originalInput=admitPromptInput(web.source,{...payload,sessionID})
  const loop=relayPromptInput(originalInput,{sessionID})
  const context=promptSDKContext(loop);assert(context);assert.equal(assertSDKContext(context),context)
  const sdkAbort=new AbortController()
  const model=new MockLanguageModelV3({doStream:async()=>{
   modelDoubleCount++
   return{stream:new ReadableStream({start(c){c.enqueue({type:'tool-call',toolCallId:'original-tool',toolName:'fixed',input:JSON.stringify({value:'original'})});c.enqueue({type:'finish',finishReason:{unified:'tool-calls',raw:'tool-calls'},usage:{inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}}});c.close()}}),warnings:[]}
  }})
  const result=streamText({model,prompt:'labelled model fixture',experimental_context:context,abortSignal:sdkAbort.signal,tools:{fixed:tool({inputSchema:jsonSchema({type:'object',properties:{value:{type:'string'}},required:['value']}),execute(args,options){
   callbackCount++
   const invocation=retainSDKInvocation(args,options);assert(invocation)
   assert.equal(retainSDKInvocation(args,options),invocation)
   const facts=assertSDKInvocation(invocation,args,options);scopeDeadline=facts.deadline
   assert.equal(facts.runCommandSignal,runSignal);assert.equal(facts.sdkSignal,options.abortSignal);assert.notEqual(facts.sdkSignal,facts.runCommandSignal)
   assert.throws(()=>retainSDKInvocation(args,{...options}),/SDK/)
   assert.equal(retainSDKInvocation(args,{...options,experimental_context:{...context}}),undefined)
   return 'harmless SDK result; native authority false'
  }})}})
  for await(const chunk of result.fullStream){if(chunk.type==='error')throw chunk.error}
  return Response.json({info:{id:'fixture'},parts:[]})
 }})
 const response=await sdk.session.prompt(input);assert(!response.error)
 assert.equal(callbackCount,1);assert.equal(realRequestCount,1);assert.equal(modelDoubleCount,1);assert.equal(typeof scopeDeadline,'bigint')
})
await writeFile(out,JSON.stringify({positive:true,real:['ed7 live producer/child/reader','RunCommand pre-await generator retention','SDK client request','Effect Web Request adapter','private same-process association','AI SDK stream/tool callback original options and signal'],doubles:['business validator argv','command runtime services','session service','language model output','harmless tool result'],handlerRefusal:String(handlerRefusal).slice(0,180),callbackCount,realRequestCount,externalModel:0,native:0,SDKScope:true,authority:[false,false,false,false],deadline:scopeDeadline!.toString()},null,2))
await new Promise(r=>setTimeout(r,80))
