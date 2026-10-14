import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { supervise } from "../src/supervisor"
import { createLoginomHost } from "../src/host"
import { credentials } from "../src/connection/credentials"

for (const start of ["LOGINOM_LOGIN_UNAVAILABLE", "LOGINOM_KNOWLEDGE_UNAVAILABLE", "invalid-handshake", false])
  for (const cleanup of ["clean", "refused"])
    test(`start ${start} remains primary after ${cleanup} cleanup`, async () => {
      const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
      if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
      const directory = await mkdtemp(join(tmpdir(), "loginom-start-failure-"))
      const entry = join(directory, "child.mjs"), history = join(directory, "history.jsonl")
      await writeFile(entry, `
import {appendFile} from 'node:fs/promises';
process.on('message',async m=>{
 await appendFile(${JSON.stringify(history)},JSON.stringify({operation:m.operation})+'\\n');
 if(m.operation==='start')process.send({id:m.id,...(${JSON.stringify(start)}==='invalid-handshake'
  ?{result:{protocol:2,generation:m.input.generation,checked:true}}
  :{error:${JSON.stringify(start)}})});
 if(m.operation==='close')process.send({id:m.id,...(${JSON.stringify(cleanup)}==='clean'
  ?{result:{closed:true}}:{error:'LOGINOM_RUNTIME_CLEANUP_FAILED'})},()=>process.disconnect());
});`)
      try {
        let rejection: (Error & { cleanupError?: Error }) | undefined
        try {
          await supervise({ node, entry, resources: directory, stateDir: directory,
            generation: 1, chat: "start-boundary", validation: true, endpoint: "https://example.test",
            connection: {apiKey:"fixture",password:"",username:"test",url:"https://example.test"} })
        } catch (error) { rejection = error as Error }
        expect(rejection).toBeInstanceOf(Error)
        expect(rejection!.message).toBe(start === "invalid-handshake" ? "LOGINOM_HANDSHAKE_INVALID"
          : start === false ? "LOGINOM_RUNTIME_FAILED" : start)
        expect(rejection!.cleanupError?.message).toBe(cleanup === "refused" ? "LOGINOM_RUNTIME_CLEANUP_FAILED" : undefined)
        expect(Object.keys(rejection!)).not.toContain("cleanupError")
        expect((await readFile(history,"utf8")).trim().split("\n").map(s=>JSON.parse(s).operation)).toEqual(["start","close"])
      } finally { await rm(directory,{recursive:true,force:true}) }
    })

test("valid start still requires acknowledged clean close", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-start-success-")), entry = join(directory, "child.mjs")
  await writeFile(entry, `process.on('message',m=>{
    if(m.operation==='start')process.send({id:m.id,result:{protocol:1,generation:m.input.generation,checked:true}});
    if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
  });`)
  try {
    const runtime = await supervise({node,entry,resources:directory,stateDir:directory,generation:1,chat:"positive",validation:true,
      endpoint:"https://example.test",connection:{apiKey:"fixture",password:"",username:"test",url:"https://example.test"}})
    await runtime.close();await runtime.close()
    expect(await runtime.exited).toEqual({code:0,signal:null})
  } finally { await rm(directory,{recursive:true,force:true}) }
})

test("host check retains primary allowlisted start code and failed validation evidence", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-start-host-")), resources=join(directory,"resources"),root=join(directory,"state")
  await mkdir(join(resources,"bin"),{recursive:true});await mkdir(join(resources,"runtime/src"),{recursive:true})
  await symlink(node,join(resources,"bin",process.platform==="win32"?"node.exe":"node"))
  await writeFile(join(resources,"resource-manifest.json"),JSON.stringify({endpoint:"https://example.test"}))
  await writeFile(join(resources,"runtime/src/managed-entry.mjs"),`
    import{mkdir,writeFile}from'node:fs/promises';import{join}from'node:path';
    process.on('message',async m=>{
      if(m.operation==='start'){
        const path=join(m.input.stateDir,'generations',String(m.input.generation),'chats',m.input.chat);
        await mkdir(path,{recursive:true});await writeFile(join(path,'startup-cleanup.json'),JSON.stringify({cleanup_complete:false,effect_possible:false,primary:'LOGINOM_LOGIN_UNAVAILABLE'}));
        process.send({id:m.id,error:'LOGINOM_LOGIN_UNAVAILABLE'});
      }
      if(m.operation==='close')process.send({id:m.id,error:'LOGINOM_RUNTIME_CLEANUP_FAILED'},()=>process.disconnect());
    });`)
  const host=await createLoginomHost({root,resources,codec:credentials("linux"),environment:{},headless:true})
  try {
    await expect(host.api.check({revision:0,url:"https://example.test",username:"test",apiKey:{operation:"replace",value:"fixture"},password:{operation:"empty"}})).rejects.toThrow("LOGINOM_LOGIN_UNAVAILABLE")
    const parent=join(root,"validation/generations/1/chats"),chats=await readdir(parent)
    expect(chats.length).toBe(1)
    expect(JSON.parse(await readFile(join(parent,chats[0],"startup-cleanup.json"),"utf8"))).toEqual({cleanup_complete:false,effect_possible:false,primary:"LOGINOM_LOGIN_UNAVAILABLE"})
  } finally {await host.close();await rm(directory,{recursive:true,force:true})}
})
