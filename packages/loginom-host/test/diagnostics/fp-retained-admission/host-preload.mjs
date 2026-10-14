import cp from 'node:child_process'
import {createHash} from 'node:crypto'
import {syncBuiltinESMExports} from 'node:module'
const original=cp.fork,children=[]
cp.fork=(entry,args,options)=>{
 if(!entry.endsWith('/runtime/src/managed-entry.mjs'))throw Error('Unexpected child boundary')
 const child=original(entry,args,{...options,execArgv:[...options.execArgv,'--experimental-test-module-mocks','--import',process.env.FP_BOUND_NATIVE],env:{...options.env,FP_BOUND_RUNTIME:process.env.FP_BOUND_RUNTIME,FP_BOUND_CASE:process.env.FP_BOUND_CASE}})
 children.push(child);child.on('message',m=>{if(process.connected)process.send(m.fixture?m:{fixture:'bound-managed-reply',packet:m},()=>{})});child.on('exit',(code,signal)=>{if(process.connected)process.send({fixture:'bound-managed-exit',code,signal},()=>{})});return child
}
syncBuiltinESMExports()
process.on('message',m=>{if(!m.fixture)return;for(const child of children)if(child.connected)child.send(m);if(m.fixture==='bound-finish'){process.removeAllListeners('disconnect');Promise.all(children.map(c=>c.exitCode===null?new Promise(resolve=>c.once('exit',resolve)):Promise.resolve())).then(()=>process.disconnect())}})

process.on("message",m=>{if(m.method&&process.connected)process.send({fixture:"bound-host-request",originalId:m.id,method:m.method,deadline:m.deadline,run:m.input?.run,requestId:m.input?.requestId,authorization_sha256:typeof m.input?.authorization==="string"?createHash("sha256").update(m.input.authorization).digest("hex"):null})})
