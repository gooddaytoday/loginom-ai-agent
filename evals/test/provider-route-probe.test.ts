import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { probeProviderRoute } from "../src/provider-route-probe"

test("one bounded HEAD probe records route headers without generation secrets or a second probe", async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'evals-provider-probe-'))
 const calls:string[]=[]
 const server=Bun.serve({port:0,fetch:r=>{calls.push(r.method);return new Response('private-body',{status:401,headers:{'x-private':'secret-value'}})}})
 const receipt=path.join(root,'probe.json'),source=path.join(root,'timeout.json')
 await Bun.write(source,JSON.stringify({kind:'provider_headers_timeout',tokens:0,timeout_ms:300000}))
 try {
  const result=await probeProviderRoute({source,receipt,url:`http://127.0.0.1:${server.port}/v1`,apiKey:'private-key'})
  expect(result).toMatchObject({status:'HEADERS_RECEIVED',http_status:401,generation_verified:false})
  await expect(probeProviderRoute({source,receipt,url:`http://127.0.0.1:${server.port}/v1`,apiKey:'private-key'})).rejects.toThrow()
  await expect(probeProviderRoute({source,receipt:receipt+'.another',url:`http://127.0.0.1:${server.port}/v1`,apiKey:'private-key'})).rejects.toThrow()
  expect(calls).toEqual(['HEAD'])
  const saved=await readFile(receipt,'utf8');for(const secret of ['private-body','secret-value','private-key'])expect(saved).not.toContain(secret)
 }finally{server.stop(true);await rm(root,{recursive:true,force:true})}
})


test("unclassified failure cannot authorize a provider probe",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'evals-probe-source-'));
 try{
  const source=path.join(root,'source.json'),receipt=path.join(root,'probe.json');
  for(const failure of [{kind:'unknown',tokens:0,timeout_ms:300000},{kind:'provider_headers_timeout',tokens:1,timeout_ms:300000}]) {
   await Bun.write(source,JSON.stringify(failure));
   await expect(probeProviderRoute({source,receipt,url:'http://127.0.0.1:1',apiKey:'fixture'})).rejects.toThrow('PROBE_SOURCE_REFUSED');
   expect(await Bun.file(receipt).exists()).toBe(false);
  }
 }finally{await rm(root,{recursive:true,force:true})}
});
