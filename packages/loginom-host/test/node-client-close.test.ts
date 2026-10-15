import { expect, test } from "bun:test"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { launchNodeHost } from "../src/node-client"

// Genuine pinned-Node IPC; the child is an explicit host/native double.
for (const mode of ["delayed", "false", "error"] as const) {
  test(`outer node client Close ${mode} preserves acknowledgement and exit guards`, async () => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to pinned Node")
    const directory = await mkdtemp(join(tmpdir(), "lab71-client-close-"))
    const entry = join(directory, "child.mjs"), log = join(directory, "calls.jsonl")
    await writeFile(entry, `
      import {appendFileSync} from 'node:fs';
      process.on('message', request => {
        appendFileSync(${JSON.stringify(log)}, JSON.stringify({method:request.method})+'\\n');
        if(request.method==='start') process.send({id:request.id,result:{protocol:1,ready:true,pid:process.pid}});
        if(request.method==='close') {
          const result=${JSON.stringify(mode)}==='error'?{error:{code:'LOGINOM_RUNTIME_CLEANUP_FAILED'}}:{result:{closed:${mode === "false" ? "false" : "true"}}};
          setTimeout(()=>process.send({id:request.id,...result},()=>{
            if(${JSON.stringify(mode)}==='delayed'){process.disconnect();process.exit(0);}
          }),${mode === "delayed" ? 31_000 : 0});
        }
        if(request.method==='test.exit') process.send({id:request.id,result:true},()=>{process.disconnect();process.exit(0)});
      });
    `)
    const host = await launchNodeHost({node,entry,root:directory,resources:directory,headless:true})
    let exited = false
    host.exited.then(() => { exited = true })
    try {
      const started = performance.now()
      const first = host.close(), second = host.close()
      expect(second).toBe(first)
      if(mode === "delayed") {
        await first
        expect(performance.now()-started).toBeGreaterThanOrEqual(30_000)
        expect(await host.exited).toEqual({code:0,signal:null})
      } else {
        const results = await Promise.allSettled([first,second])
        expect(results.every(r=>r.status==='rejected')).toBe(true)
        expect((results[0] as PromiseRejectedResult).reason.message).toBe(mode==='false'?'LOGINOM_HOST_CLEANUP_FAILED':'LOGINOM_HOST_REQUEST_FAILED')
        expect(exited).toBe(false)
        await host.request('test.exit',{})
        expect(await host.exited).toEqual({code:0,signal:null})
      }
      const calls=(await readFile(log,'utf8')).trim().split('\n').map(line=>JSON.parse(line))
      expect(calls.filter(x=>x.method==='close').length).toBe(1)
    } finally {
      if(!exited){await host.request('test.exit',{}).catch(()=>{});await host.exited}
      await rm(directory,{recursive:true,force:true})
    }
  }, 60_000)
}
