import {mkdir, copyFile, writeFile, readFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {createHash} from 'node:crypto'
import {connectionStore} from '../../../../loginom-host/src/connection/connection-store'
import {cliCredentials} from '../../../../loginom-host/src/connection/cli-credentials'
import {buildNodeHost} from '../../../../loginom-host/script/build-node-host'
const scenario=process.argv[4]??'positive'
let child:any
const dir=resolve(process.argv[2]), resources=join(dir,'product/resources/loginom'),profile=join(dir,'profile')
await mkdir(resources,{recursive:true});await mkdir(join(resources,'runtime/src'),{recursive:true});await mkdir(join(resources,'bin'),{recursive:true})
await copyFile('/home/user/.cache/loginom-bootstrap/node/node-v24.19.0-linux-x64/bin/node',join(resources,'bin/node'))
await buildNodeHost(join(resources,'host'))
const sha=async (p:string)=>createHash('sha256').update(await readFile(p)).digest('hex')
const nodeHash=await sha(join(resources,'bin/node')),hostHash=await sha(join(resources,'host/node-host.mjs'))
await writeFile(join(resources,'resource-manifest.json'),JSON.stringify({endpoint:'http://fixture.invalid',files:[{path:'bin/node',sha256:nodeHash}]}))
await writeFile(join(dir,'product/cli-manifest.json'),JSON.stringify({format:'loginom-cli-artifact-v1',files:[{path:'resources/loginom/host/node-host.mjs',sha256:hostHash}]}))
const trace=join(dir,'runtime-calls.jsonl')
await writeFile(join(resources,'runtime/src/managed-entry.mjs'),`
import {appendFileSync} from 'node:fs';
process.on('message',m=>{
 if(m.operation==='start')process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true,checked:true}});
 if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
 if(m.operation==='list')process.send({id:m.id,result:{tools:[{name:'dock_node_apply',inputSchema:{type:'object',properties:{operation_id:{type:'string'},target:{type:'object',properties:{type:{type:'string'}},required:['type']}},required:['operation_id','target']}}]}});
 if(m.operation==='call'){
  appendFileSync(${JSON.stringify(trace)},JSON.stringify({name:m.input.name,arguments:m.input.arguments,executionDeadline:m.input.executionDeadline})+'\\n');
  process.send({id:m.id,result:{recoveryPending:false,result:{content:[{type:'text',text:'Harmless native runtime double completed. Native authority=false.'}]}}});
 }
 if(m.operation==='interrupt')process.send({id:m.id,result:true});
});`)
await mkdir(profile,{mode:0o700});await writeFile(join(profile,'cli-profile.json'),JSON.stringify({format:'loginom-cli',version:1,channel:'dev'}),{mode:0o600})
const store=connectionStore(join(profile,'loginom/connection'),cliCredentials('linux'))
await store.stage({generation:1,revision:1,url:'http://fixture.invalid',username:'fixture-user',apiKey:'dummy',password:''});await store.activate(1)
let hits=0;const requests=[]
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){
 const b=await req.json() as {messages:{role:string}[]};requests.push(b);hits++
 const hasResult=b.messages.some(m=>m.role==='tool')
 if(scenario==='sigint' && !hasResult){child?.kill('SIGINT');await new Promise(r=>setTimeout(r,100))}
 const chunks=hasResult?[{choices:[{index:0,delta:{role:'assistant',content:'Fixture completed.'},finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:'stop'}]}]:[
 {choices:[{index:0,delta:{role:'assistant',tool_calls:[{index:0,id:'fixed-row-filter',type:'function',function:{name:'loginom_dock_node_apply',arguments:JSON.stringify({operation_id:'original-filter',target:{type:'transform.filter_data'}})}},{index:1,id:'fixed-row-filter-second',type:'function',function:{name:'loginom_dock_node_apply',arguments:JSON.stringify({operation_id:'second-filter',target:{type:'transform.filter_data'}})}}]},finish_reason:null}]},
 {choices:[{index:0,delta:{},finish_reason:'tool_calls'}]}]
 return new Response(chunks.map(c=>'data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:'test-model',...c})+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}})
}})
await mkdir(join(profile,'config'),{mode:0o700})
await writeFile(join(profile,'config/loginom-ai-agent.json'),JSON.stringify({provider:{test:{name:'Test',npm:'@ai-sdk/openai-compatible',models:{'test-model':{name:'Test Model',tool_call:true,limit:{context:100000,output:10000}}},options:{apiKey:'fixture',baseURL:`http://127.0.0.1:${server.port}/v1`}}},model:'test/test-model',permission:{'*':'allow'},mcp:{}}))
const env:NodeJS.ProcessEnv={...process.env,LOGINOM_AI_AGENT_CLI_PROFILE:profile,LOGINOM_AI_AGENT_CLI_BUNDLE:resources,LOGINOM_AI_AGENT_CHANNEL:'dev',LOGINOM_AI_AGENT_DISABLE_AUTOUPDATE:'1',LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH:'1',LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS:'false'}
for(const k of ['LOGINOM_AI_AGENT_SHARED_AUTH_DIR','LOGINOM_AI_AGENT_AUTH_CONTENT','LOGINOM_PRIVATE_ADMISSION_FD'])delete env[k]
const argv=process.argv[3]?[resolve(process.argv[3]),'run']:[process.execPath,'src/standalone.ts','run']
const launchTime=Date.now()
child=Bun.spawn([...argv,'--headless','--format','json','--model','test/test-model','Closed offline integration fixture; call only the fixed Row Filter tool once.'],{cwd:resolve(import.meta.dir,'../../..'),env,stdin:'ignore',stdout:'pipe',stderr:'pipe'})
try{
 const [stdout,stderr,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited])
 await writeFile(join(dir,'stdout.log'),stdout);await writeFile(join(dir,'stderr.log'),stderr)
 await writeFile(join(dir,'result.json'),JSON.stringify({code,hits,modelRequests:requests.length,sourceCLI:!process.argv[3],native:false,externalModel:false},null,2))
 const lines=await readFile(trace,'utf8').catch(()=>''),calls=lines.trim()?lines.trim().split('\n').map(line=>JSON.parse(line)):[]
 if(scenario==='sigint'){if(calls.length!==0)throw Error('ABORT_DISPATCHED');await writeFile(join(dir,'origin-proof.json'),JSON.stringify({scenario,code,hostCalls:0,actualSignal:'CLI SIGINT',native:false}));console.log(JSON.stringify({scenario,code,hostCalls:0}));}
 if(scenario!=='sigint'){
 if(code!==0 || calls.length!==2 || !calls.every(c=>Number.isSafeInteger(c.executionDeadline)) || calls[0].executionDeadline!==calls[1].executionDeadline || calls[0].executionDeadline<launchTime+7200000 || calls[0].executionDeadline>Date.now()+7200000)throw Error('CLI_ORIGIN_CHAIN_NOT_CONFIRMED')
 await writeFile(join(dir,'origin-proof.json'),JSON.stringify({calls:2,sameDeadline:true,deadline:calls[0].executionDeadline,launchTime,completed:Date.now(),native:false,modelOutput:'closed HTTP fixture',actual:['standalone','RunCommand/AppRuntime','Request/session/prompt loop','AI SDK','SessionTools','NodeHost factory/service/lease/IPC'],scope:'production code with language response and managed runtime doubles; not native or final model acceptance'},null,2))
 console.log(JSON.stringify({code,hits,deadline:calls[0].executionDeadline,stderr:stderr.slice(-400)}))
 }
}finally{server.stop(true)}
