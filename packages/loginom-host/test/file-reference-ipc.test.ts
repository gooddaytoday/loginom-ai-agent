import { expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createLoginomHost } from "../src/host"
import { loginomHostPort } from "../src/host-port"
import { transport } from "../src/transport"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { inspectReferenceFile, stageReferenceFile, type ReferenceSlot } from "../src/file-reference"
import { stageKnowledgeFixture, waitForKnowledge } from "./fixtures/knowledge"

test("private IPC admits only a reserved original-input reference and retains its snapshot until runtime shutdown", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-reference-ipc-"))
  const resources = join(directory, "resources"),
    root = join(directory, "profile"),
    incoming = join(directory, "incoming.jsonl")
  await stageKnowledgeFixture(resources)
  await mkdir(join(resources, "bin"))
  await symlink(node, join(resources, "bin/node"))
  await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
  await writeFile(
    join(resources, "runtime/src/managed-entry.mjs"),
    `
    import { appendFileSync, existsSync } from 'node:fs';
    const admitted=new Map(),paths=new Set();
    process.on('message', m=>{
      if(m.operation==='start')process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
      if(m.operation==='list')process.send({id:m.id,result:{prepared:true,tools:[{name:'dock_action_describe',inputSchema:{type:'object'}}]}});
      if(m.operation==='work')process.send({id:m.id,result:{activeWork:false,unsettledWork:false,dispatching:false}});
      if(m.operation==='call')process.send({id:m.id,result:{result:{},recoveryPending:false,activeWork:false}});
      if(m.operation==='admitReference'){
        appendFileSync(${JSON.stringify(incoming)},JSON.stringify(m)+'\\n');
        const r=m.input.reference;
        paths.add(r.snapshot.canonical_path);
        if(!admitted.has(r.grant))admitted.set(r.grant,{artifact_id:r.grant,bytes:r.snapshot.size});
        process.send({id:m.id,result:admitted.get(r.grant)});
      }
      if(m.operation==='close'){
        // Closing the child must precede snapshot deletion by the Host.
        if([...paths].some(path=>!existsSync(path))){process.send({id:m.id,error:'SNAPSHOT_REMOVED_BEFORE_BROWSER_CLOSE'});return;}
        process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
      }
    });
  `,
  )
  const connections = connectionStore(join(root, "connection"), credentials("linux"))
  await connections.stage({
    generation: 1,
    revision: 1,
    url: "http://example.test",
    username: "user",
    apiKey: "fixture",
    password: "",
  })
  await connections.activate(1)
  const host = await createLoginomHost({ root, resources, codec: credentials("linux"), environment: {} })
  const requests = new EventEmitter(),
    replies = new EventEmitter()
  const port = loginomHostPort(
    { postMessage: (value) => replies.emit("message", { data: value }), on: requests.on.bind(requests), start() {} },
    host,
  )
  const client = transport({
    postMessage: (value) => requests.emit("message", { data: value }),
    on: replies.on.bind(replies),
    start() {},
  })
  try {
    await waitForKnowledge(host)
    await client.request("acquire", { run: "run", session: "chat" })
    await expect(
      client.request("referenceReserve", { run: "run", userMessage: "msg_original", name: "data.csv" }),
    ).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    await client.request("scope", {
      run: "run",
      mode: "bind",
      scope: { taskMessageID: "msg_original", profile: "loginom-automation" },
    })
    await client.request("call", { run: "run", name: "dock_prepare", args: {}, userMessage: "msg_original" })
    await expect(
      client.request("referenceReserve", { run: "run", userMessage: "msg_other", name: "data.csv" }),
    ).rejects.toThrow("LOGINOM_INPUT_INVALID")
    const slot = (await client.request("referenceReserve", {
      run: "run",
      userMessage: "msg_original",
      name: "data.csv",
    })) as ReferenceSlot
    const source = join(directory, "data.csv")
    await writeFile(source, "private input bytes\n")
    const reference = await stageReferenceFile(source, await inspectReferenceFile(source), slot)
    for (const changed of [
      { ...reference, chat: "other" },
      { ...reference, generation: 2 },
      { ...reference, userMessage: "msg_other" },
      { ...reference, snapshot: { ...reference.snapshot, canonical_path: source } },
    ])
      await expect(client.request("referenceAdmit", { run: "run", reference: changed })).rejects.toThrow(
        "LOGINOM_INPUT_INVALID",
      )
    const result = await client.request("referenceAdmit", { run: "run", reference })
    expect(await client.request("referenceAdmit", { run: "run", reference })).toEqual(result)
    await expect(client.request("referenceDiscard", { run: "run", grant: slot.grant })).rejects.toThrow(
      "LOGINOM_INPUT_IDENTITY_CONFLICT",
    )
    const received = (await readFile(incoming, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(received).toHaveLength(2)
    expect(received[0].input).toEqual({ reference })
    expect(JSON.stringify(received)).not.toContain("private input bytes")
    expect(JSON.stringify(received)).not.toMatch(/"(?:data|buffer|base64)":/)
    const unused = (await client.request("referenceReserve", {
      run: "run",
      userMessage: "msg_original",
      name: "unused.csv",
    })) as ReferenceSlot
    expect(await client.request("referenceDiscard", { run: "run", grant: unused.grant })).toEqual({ discarded: true })
    expect(await readFile(slot.path, "utf8")).toBe("private input bytes\n")
    await client.request("release", { run: "run" })
    await port.close()
    await host.close()
    expect(await readdir(join(root, "file-references"))).toEqual([])
  } finally {
    client.close()
    await port.close()
    await host.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 15000)
