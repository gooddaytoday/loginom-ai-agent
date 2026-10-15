import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, symlink, readdir, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createLoginomHost } from "../src/host"
import { credentials } from "../src/connection/credentials"

for (const failed of [false, true])
  test(`validation ${failed ? "retains failure evidence and original refusal" : "removes its completed temporary directory"}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "loginom-validation-")),
      resources = join(directory, "resources"),
      root = join(directory, "state")
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
    await mkdir(join(resources, "bin"), { recursive: true })
    await mkdir(join(resources, "runtime/src"), { recursive: true })
    await symlink(node, join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"))
    await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "https://example.test" }))
    await writeFile(
      join(resources, "runtime/src/managed-entry.mjs"),
      `
    import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';
    process.on('message', async m=>{
      if(m.operation==='start'){
        const path=join(m.input.stateDir,'generations',String(m.input.generation),'chats',m.input.chat);
        await mkdir(path,{recursive:true});await writeFile(join(path,'evidence.json'),JSON.stringify({marker:'original-check',failed:${failed}}));
        process.send({id:m.id,${failed ? "error:'LOGINOM_LOGIN_REJECTED'" : "result:{protocol:1,generation:m.input.generation,checked:true}"}});
      }
      if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
    });`,
    )
    const host = await createLoginomHost({
      root,
      resources,
      codec: credentials("linux"),
      environment: {},
      headless: true,
    })
    try {
      const candidate = {
        revision: 0,
        url: "https://example.test",
        username: "test",
        apiKey: { operation: "replace" as const, value: "fixture" },
        password: { operation: "empty" as const },
      }
      if (failed) await expect(host.api.check(candidate)).rejects.toThrow("LOGINOM_LOGIN_REJECTED")
      if (!failed) await host.api.check(candidate)
      const parent = join(root, "validation/generations/1/chats"),
        chats = await readdir(parent)
      expect(chats.length).toBe(failed ? 1 : 0)
      if (failed)
        expect(JSON.parse(await readFile(join(parent, chats[0], "evidence.json"), "utf8"))).toEqual({
          marker: "original-check",
          failed: true,
        })
    } finally {
      await host.close()
      await rm(directory, { recursive: true, force: true })
    }
  })


for (const enabled of [false, true])
  test(`acceptance package cleanup is explicit and business-only: ${enabled}`, async () => {
    const { connectionStore } = await import("../src/connection/connection-store")
    const directory = await mkdtemp(join(tmpdir(), "loginom-cleanup-option-"))
    const resources = join(directory, "resources"), root = join(directory, "state"), history = join(directory, "starts.jsonl")
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE")
    await mkdir(join(resources, "bin"), { recursive: true })
    await mkdir(join(resources, "runtime/src"), { recursive: true })
    await symlink(node, join(resources, "bin/node"))
    await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "https://example.test" }))
    await writeFile(join(resources, "runtime/src/managed-entry.mjs"), `
      import {appendFile} from 'node:fs/promises';
      process.on('message',async m=>{
        if(m.operation==='start'){
          await appendFile(${JSON.stringify(history)},JSON.stringify({chat:m.input.chat,validation:m.input.validation,cleanup:m.input.acceptanceCleanupPackage})+'\\n');
          process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true,checked:true}});
        }
        if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
      });`)
    const store = connectionStore(join(root,"connection"), credentials("linux"))
    await store.stage({generation:1,revision:1,url:"https://example.test",username:"fixture",apiKey:"fixture",password:""})
    await store.activate(1)
    const environment = enabled ? { LOGINOM_AI_AGENT_ACCEPTANCE_CLEANUP_PACKAGE: "/fixture/current.lgp" } : {}
    const host = await createLoginomHost({root,resources,codec:credentials("linux"),environment,headless:true})
    try {
      await host.settled()
      await host.api.check({revision:1,url:"https://example.test",username:"fixture",apiKey:{operation:"preserve"},password:{operation:"preserve"}})
      await host.runtime(1,"business")
      const starts = (await readFile(history,"utf8")).trim().split("\n").map(line=>JSON.parse(line))
      expect(starts.find(s=>s.chat==="business").cleanup).toBe(enabled?"/fixture/current.lgp":undefined)
      expect(starts.find(s=>s.chat==="readiness").cleanup).toBeUndefined()
      expect(starts.find(s=>s.validation===true).cleanup).toBeUndefined()
    } finally { await host.close();await rm(directory,{recursive:true,force:true}) }
  })
