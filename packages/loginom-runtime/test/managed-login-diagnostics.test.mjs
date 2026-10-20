import test from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { fork } from "node:child_process"
import { once } from "node:events"
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

for (const writable of [true,false]) test("managed login retains sanitized navigation failure outside validation profile, writable="+writable, {
  skip: (process.platform !== "linux" || !process.env.LOGINOM_DOCK_TEST_BROWSER) && "Linux fixture: set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium",
  timeout: 30000,
}, async t => {
  const root = await mkdtemp(join(tmpdir(), "login-diagnostics-")), resources = join(root,"resources"), stateDir = join(root,"validation")
  let server, child
  t.after(async()=>{
    if(child && child.exitCode===null && child.signalCode===null){
      const exited=once(child,"exit");child.kill("SIGKILL");await exited
    }
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
    await chmod(stateDir,0o700).catch(()=>{})
    await rm(root,{recursive:true,force:true})
  })
  await mkdir(join(resources,"bin"),{recursive:true})
  await copyFile(process.execPath,join(resources,"bin/node"),constants.COPYFILE_FICLONE)
  // Real pinned Chromium and its adjacent shared libraries; no fake browser,
  // Loginom credentials or external stand is involved in this regression.
  await cp(dirname(process.env.LOGINOM_DOCK_TEST_BROWSER),join(resources,"browser"),{recursive:true,mode:constants.COPYFILE_FICLONE})
  const browser = "browser/"+basename(process.env.LOGINOM_DOCK_TEST_BROWSER)
  const files = await Promise.all(["bin/node",browser].map(async path => ({path,
    sha256:createHash("sha256").update(await readFile(join(resources,path))).digest("hex")})))
  await writeFile(join(resources,"resource-manifest.json"),JSON.stringify({protocol:1,nodeVersion:process.versions.node,node:"bin/node",browser,files}))
  server = createServer(async (request,response) => {
    if(!writable && process.platform!=="win32")await chmod(stateDir,0o500)
    response.destroy()
  })
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
  child = fork(fileURLToPath(new URL("../src/managed-entry.mjs",import.meta.url)),[],{
    execPath:join(resources,"bin/node"),execArgv:[],stdio:["ignore","ignore","ignore","ipc"],
  })
  const reply=()=>once(child,"message",{signal:AbortSignal.timeout(15000)}).then(([message])=>message)
  const failed=reply()
  child.send({id:"start",operation:"start",input:{protocol:1,generation:1,chat:"test",stateDir,resources,validation:true,headless:true,
    connection:{url:`http://127.0.0.1:${server.address().port}/app/?opaque=secret-query#secret-fragment`,
      username:"secret-user",password:"secret-password",apiKey:"secret-key"}}})
  assert.deepEqual(await failed,{id:"start",error:"LOGINOM_LOGIN_UNAVAILABLE"})
  const closed=reply(),exited=once(child,"exit",{signal:AbortSignal.timeout(5000)})
  child.send({id:"close",operation:"close"})
  assert.deepEqual(await closed,{id:"close",result:{closed:true}})
  assert.deepEqual(await exited,[0,null])
  // Host removes exactly this validation subtree after check; diagnostics
  // must remain readable without retaining the private browser profile.
  await chmod(stateDir,0o700)
  await rm(join(stateDir,"generations"),{recursive:true,force:true})
  const names=(await readdir(stateDir)).filter(name=>name.startsWith("login-failure-"))
  if(!writable && process.platform!=="win32"){assert.deepEqual(names,[]);return}
  assert.equal(names.length,1)
  const path=join(stateDir,names[0]),text=await readFile(path,"utf8"),diagnostic=JSON.parse(text)
  assert.equal(diagnostic.code,"LOGINOM_LOGIN_UNAVAILABLE");assert.equal(diagnostic.phase,"goto")
  assert.match(diagnostic.original_code,/^net::ERR_/)
  assert.match(diagnostic.original_message,/page.goto/)
  assert.equal(diagnostic.url,`http://127.0.0.1:${server.address().port}/app/`)
  assert.ok(Number.isInteger(diagnostic.duration_ms)&&diagnostic.duration_ms>=0)
  assert.ok(diagnostic.elapsed_ms>=diagnostic.duration_ms)
  if(process.platform!=="win32")assert.equal((await stat(path)).mode&0o777,0o600)
  for(const secret of ["secret-query","secret-fragment","secret-user","secret-password","secret-key","?"])
    assert.ok(!text.includes(secret),secret)
})
