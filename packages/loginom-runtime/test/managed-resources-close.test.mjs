import test from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { stat } from "node:fs/promises"

// Actual Node IPC, live sockets and a private profile; bridge ACKs are boundary
// inputs only. No browser/Loginom/package-cleanup proof is asserted here.
const CHILD = `
import {createServer} from 'node:net';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
const {closeManagedResources}=await import(process.argv[1]);
const scenario=process.argv[2],calls=[];
const profile=await mkdtemp(join(tmpdir(),'loginom-resource-close-'));
await writeFile(join(profile,'owned-profile'),'private unit data');
const server=createServer(),browser=createServer();
server.listen(0,'127.0.0.1');await once(server,'listening');
browser.listen(0,'127.0.0.1');await once(browser,'listening');
const pending=Promise.withResolvers();
const closeSocket=handle=>new Promise((resolve,reject)=>handle.close(error=>error?reject(error):resolve()));
const state={browserProfile:profile,
  client:{async close(){calls.push('client');if(scenario==='client-reject')throw Error('private injected failure');}},
  browserServer:{async close(){calls.push('server');if(scenario==='server-reject')throw Error('private injected failure');await closeSocket(server);}},
  browser:{async close(){calls.push('browser');await closeSocket(browser);}}
};
if(scenario!=='unprepared')state.bridge={async close(){
  calls.push('bridge');
  if(scenario==='reject')throw Error('private injected failure');
  if(scenario==='missing')return undefined;
  return {browser_transport_closed:scenario!=='transport-false',browser_process_terminated:scenario!=='process-false',
    clipboard_leases_retained:scenario==='retained'?1:0};
}};
let closing;
process.on('message',message=>{
  if(message==='release'){pending.resolve();return;}
  if(message==='close'){
    closing??=closeManagedResources(state,new Set([pending.promise]));
    process.send({kind:'closing',calls:[...calls]});
    void closing.then(()=>process.send({kind:'result',closed:true,calls,server:server.listening,browser:browser.listening}),
      error=>process.send({kind:'result',error:error.message,calls,server:server.listening,browser:browser.listening}));
  }
  if(message==='dispose')void (async()=>{
    if(server.listening)await closeSocket(server);if(browser.listening)await closeSocket(browser);
    await rm(profile,{recursive:true,force:true});process.disconnect();
  })();
});
process.send({kind:'ready',profile});
`

for (const scenario of ["success", "transport-false", "process-false", "retained", "missing", "reject", "client-reject", "server-reject", "unprepared"]) {
  test(`managed resource close drains admitted work and checks bridge ACK: ${scenario}`, async (t) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", CHILD,
      new URL("../src/managed-resources-close.mjs", import.meta.url).href, scenario],
      { stdio: ["ignore", "pipe", "pipe", "ipc"] })
    t.after(async () => {
      if (child.exitCode !== null || child.signalCode !== null) return
      const exited = once(child, "exit")
      child.kill("SIGKILL")
      await exited
    })
    const message = () => once(child, "message", { signal: AbortSignal.timeout(5000) }).then(([value]) => value)
    const ready = await message()
    assert.equal(ready.kind, "ready")
    const closing = message()
    child.send("close")
    assert.deepEqual(await closing, { kind: "closing", calls: [] }, "resources cannot close before admitted work drains")
    assert.equal((await stat(ready.profile)).isDirectory(), true)
    const result = message()
    child.send("release")
    const actual = await result
    assert.equal(actual.kind, "result")
    if (["success", "unprepared"].includes(scenario)) {
      assert.equal(actual.closed, true)
      assert.equal(actual.server, false)
      assert.equal(actual.browser, false)
      assert.deepEqual(actual.calls, scenario === "success" ? ["client", "bridge", "server", "browser"] : ["client", "server", "browser"])
      await assert.rejects(stat(ready.profile), { code: "ENOENT" })
    } else {
      assert.equal(actual.error, "LOGINOM_RUNTIME_CLEANUP_FAILED")
      assert.equal(actual.closed, undefined)
      assert.equal(JSON.stringify(actual).includes("private injected failure"), false)
      if (!["client-reject", "server-reject"].includes(scenario)) {
        assert.equal(actual.server, true)
        assert.equal(actual.browser, true)
        assert.deepEqual(actual.calls, ["client", "bridge"])
        assert.equal((await stat(ready.profile)).isDirectory(), true)
      } else {
        assert.equal(actual.browser, false)
        assert.deepEqual(actual.calls, ["client", "bridge", "server", "browser"])
      }
    }
    const exited = once(child, "exit", { signal: AbortSignal.timeout(5000) })
    child.send("dispose")
    assert.deepEqual(await exited, [0, null], "test resource disposal exits normally; it cannot promote a failed runtime result")
  })
}
