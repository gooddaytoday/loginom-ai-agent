import assert from 'node:assert/strict'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const sdk=resolve(process.argv[2]),load=p=>import(pathToFileURL(resolve(sdk,'dist/esm',p)).href)
const [{Client},{Server},{InMemoryTransport},{CallToolRequestSchema}]=await Promise.all([load('client/index.js'),load('server/index.js'),load('inMemory.js'),load('types.js')])
const evidence=[]
for(const reason of [false,0,null,'',new Error('original',{cause:0})]) {
 const client=new Client({name:'owned-source-probe',version:'1'},{capabilities:{}}),server=new Server({name:'owned-source-probe',version:'1'},{capabilities:{tools:{}}})
 const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair()
 const input={name:'dock_prepare',arguments:{operation_id:'original',intent:'new_draft'}},controller=new AbortController()
 const entered=Promise.withResolvers(),aborted=Promise.withResolvers(),finish=Promise.withResolvers()
 let seen
 server.setRequestHandler(CallToolRequestSchema,async(request,extra)=>{
  seen={paramsSame:request.params===input,argsSame:request.params.arguments===input.arguments,signalSame:extra.signal===controller.signal,extra}
  extra.signal.addEventListener('abort',()=>aborted.resolve(extra.signal.reason),{once:true});entered.resolve()
  await finish.promise;return {content:[]}
 })
 try {
  await server.connect(serverTransport);await client.connect(clientTransport)
  const outcome=client.callTool(input,undefined,{signal:controller.signal,timeout:5000}).catch(error=>error)
  await entered.promise
  assert.equal(seen.signalSame,false);assert.equal('deadline' in seen.extra,false)
  controller.abort(reason);const [childReason,error]=await Promise.all([aborted.promise,outcome])
  assert.equal(childReason,String(reason));assert.equal(Object.is(childReason,reason),typeof reason==='string')
  assert.notEqual(error,reason);assert.equal(error.code,-32001)
  evidence.push({inputReason:reason instanceof Error?'Error(cause0)':reason,serverSignalSame:false,serverHasDeadline:false,paramsSame:seen.paramsSame,argsSame:seen.argsSame,serverReason:childReason,clientCode:error.code,clientPreservesReason:false})
 } finally {finish.resolve();await client.close();await server.close()}
}
console.log(JSON.stringify({sdk,scope:'real SDK Client/Server/InMemoryTransport/AbortController/Promise; no Page/native/host operations',cases:evidence,pass:5},null,2))
