import {writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
const [modulePath,output]=process.argv.slice(2)
const {loginomHostPort}=await import(pathToFileURL(modulePath))
let runtimeCalls=0,diagnosticCalls=0,held=0,sequence=0
const listeners={},replies=new Map()
const port={postMessage:m=>replies.get(m.id)?.(m),on:(event,fn)=>{listeners[event]=fn},start(){}}
const lease={generation:1,release(){},holdRecovery(){held++}}
const service={
 recoveries:new Map(),acquire:()=>lease,retireRuntime:async()=>{},resetRestarts(){},bindCapture(){},authorizeCapture:()=>true,
 journal:{pending:()=>[],begin:async()=>{throw Error('Unexpected journal begin')},settle:async()=>{}},
 runtime:async()=>{runtimeCalls++;if(runtimeCalls===1)throw Error('original runtime was never established');return {request:async()=>{diagnosticCalls++;return {result:{fixture:'replacement-runtime'}}}}},
}
loginomHostPort(port,service)
const request=(method,input)=>new Promise(resolve=>{const id='unit-'+(++sequence);replies.set(id,resolve);listeners.message({data:{id,method,input}})})
const acquired=await request('acquire',{run:'original-run',session:'original-session'})
const capture=await request('acceptance.capture',{run:'original-run',authorization:'fixture'})
const diagnostic=await request('call',{run:'original-run',name:'dock_workspace_observe',args:{}})
const pass=runtimeCalls===1&&diagnosticCalls===0&&diagnostic.error==='LOGINOM_RECOVERY_REQUIRED'
const result={pass,runtimeCalls,diagnosticCalls,held,acquired,capture,diagnostic,scope:'SOURCE HostPort leaf; service/lease/port/runtime doubles; no native or installed-path proof. Original capture refused before obtaining a runtime. Diagnosis must never acquire a replacement.'}
await writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exitCode=pass?0:1
