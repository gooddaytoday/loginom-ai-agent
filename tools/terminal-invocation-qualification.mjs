import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const [module,toolsPath,proofPath,output]=process.argv.slice(2);
const api=await import(pathToFileURL(module)),proof=JSON.parse(await readFile(proofPath,'utf8'));
const source=await readFile(toolsPath,'utf8'),line=source.split('\n').find(x=>x.includes('const invocation = retainUnionInvocation('));
const sourceAcquire=Function('retainUnionInvocation','definition','request','options','owner','input','user','const loginom=owner,args=request;'+line.trim()+';return invocation');
const compiledAcquire=Function(...proof.acquireAliases,'return '+proof.acquire);
const [,ctx,u,c,p,binder]=proof.creationAliases,create=Function(binder,ctx,u,c,p,proof.creation);
const results=[];
for(const [route,acquire] of [['source statement',sourceAcquire],['compiled expression',compiledAcquire]]){
 const controller=new AbortController(),context={assistantMessage:{id:'message'}},processor=create(api.bindUnionInvocationProcessor,context,()=>{},()=>{},()=>{});
 let calls=0;const owner={generation:3,call(){calls++;throw Error('NOT_DISPATCHED')}},input={loginom:owner,session:{id:'chat'},processor},options={toolCallId:route,abortSignal:controller.signal},user={info:{id:'user'}};
 const prepare={operation_id:'terminal-original',intent:'new_draft'},definition={name:'dock_prepare',inputSchema:{required:['operation_id']}};
 const mint=request=>acquire(api.retainUnionInvocation,definition,request,options,owner,input,user);
 const absent=mint(prepare);assert.equal(absent,undefined);assert.throws(()=>api.originalUnionInvocation(absent,owner),/UNOWNED/);assert.equal(calls,0);results.push({route,name:'dock_prepare has no original invocation packet before H0',pass:true});
 const flags={...prepare,purpose:'terminal-original',deadline:Date.now()+120000,timeout_ms:120000,startupDeadline:Date.now()+600000};
 const copied=mint(flags);assert.equal(copied,undefined);assert.throws(()=>api.originalUnionInvocation(copied,owner),/UNOWNED/);assert.equal(calls,0);results.push({route,name:'caller purpose/deadline/startup timeout do not qualify terminal packet',pass:true});
 const unionRequest={operation_id:'union',target:{type:'transform.union_data'}},unionDefinition={name:'dock_node_apply',inputSchema:{required:['operation_id']}},unionOptions={...options,toolCallId:route+'-union'};
 const packet=acquire(api.retainUnionInvocation,unionDefinition,unionRequest,unionOptions,owner,input,user),original=api.originalUnionInvocation(packet,owner);
 assert.equal(original.purpose,'union-original-invocation-v1');assert.notEqual(original.request,prepare);assert.throws(()=>api.originalUnionInvocation({...packet},owner),/UNOWNED/);assert.equal(calls,0);assert.equal(packet.facts().nativeAuthority,false);assert.equal(packet.facts().creationAuthority,false);assert.equal(packet.facts().releaseAuthority,false);
 results.push({route,name:'Union packet retains Union purpose; copied packet unowned',pass:true});
}
await writeFile(output,JSON.stringify({results,pass:results.length,terminalQualification:'NOT_QUALIFIED',terminalPacket:false,RunCommandAbsoluteDeadline:false,native:false,scope:'Existing source/compiled expressions, actual helper and raw AbortSignal. Owner/processor/replies are doubles; no fallback dispatch, Effect/model loop, native or terminal allowance.'},null,2));console.log(JSON.stringify({pass:results.length,terminalQualification:'NOT_QUALIFIED'}));
