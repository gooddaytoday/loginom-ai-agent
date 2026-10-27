import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { EventEmitter } from "node:events"
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createLoginomHost } from "../src/host"
import { loginomHostPort } from "../src/host-port"
import { transport } from "../src/transport"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { stageKnowledgeFixture, waitForKnowledge } from "./fixtures/knowledge"

async function fixture(configured = false, admissionResult?: unknown) {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-task-scope-"))
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  const marker = join(directory, "browser.jsonl")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await symlink(node, join(resources, "bin/node"))
  await stageKnowledgeFixture(resources)
  await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
  await Bun.write(
    join(resources, "runtime/src/managed-entry.mjs"),
    `
    import { appendFileSync } from 'node:fs';
    const work = { activeWork: false, unsettledWork: false, dispatching: false };
    let prepared = false;
    let holdWork = false, pendingWork, observer;
    process.on('disconnect', () => process.exit(0));
    process.on('message', message => {
      const send = result => process.send({ id: message.id, result });
      if (message.operation === 'start') {
        appendFileSync(${JSON.stringify(marker)}, JSON.stringify({ operation: 'start', pid: process.pid }) + '\\n');
        send({ protocol: 1, generation: message.input.generation, chat: message.input.chat, ready: true });
      }
      if (message.operation === 'list') send({ prepared, tools: ['dock_prepare','dock_node_wait'].map(name => ({ name, inputSchema: { type: 'object' } })) });
      if (message.operation === 'work') {
        if (!holdWork) send(work);
        if (holdWork) {
          pendingWork = { id: message.id, result: { ...work } };
          if (observer) { process.send({ id: observer, result: true }); observer = undefined; }
        }
      }
      if (message.operation === 'fixture.hold_work') { holdWork = true; send(true); }
      if (message.operation === 'fixture.wait_work') {
        if (pendingWork) send(true);
        if (!pendingWork) observer = message.id;
      }
      if (message.operation === 'fixture.release_work') {
        holdWork = false;
        if (pendingWork) { process.send(pendingWork); pendingWork = undefined; }
        send(true);
      }
      if (message.operation === 'fixture.state') { Object.assign(work, message.input); send(true); }
      if (message.operation === 'fixture.exit') process.send({ id: message.id, result: true }, () => process.disconnect());
      if (message.operation === 'admit') {
        appendFileSync(${JSON.stringify(marker)}, JSON.stringify({ operation: 'admit', ...message.input }) + '\\n');
        send(${JSON.stringify(admissionResult) ?? "undefined"} ?? message.input.files.map((file, index) => ({ artifact_id: 'artifact-' + index, name: file.name, upload: { grant_id: 'grant-' + index } })));
      }
      if (message.operation === 'call') {
        appendFileSync(${JSON.stringify(marker)}, JSON.stringify({ operation: 'call', ...message.input }) + '\\n');
        if (message.input.name === 'dock_prepare') prepared = message.input.arguments?.fixtureFailure !== true;
        send({ result: { content: [], ...(prepared ? {} : { isError: true }) }, recoveryPending: false, activeWork: false });
      }
      if (message.operation === 'close') process.send({ id: message.id, result: { closed: true } }, () => process.disconnect());
    });
  `,
  )
  if (configured) {
    const store = connectionStore(join(root, "connection"), credentials("linux"))
    await store.stage({
      generation: 1,
      revision: 1,
      url: "http://example.test",
      username: "user",
      apiKey: "fixture",
      password: "",
    })
    await store.activate(1)
  }
  const host = await createLoginomHost({ root, resources, codec: credentials("linux"), environment: {} })
  await waitForKnowledge(host)
  const requests = new EventEmitter()
  const replies = new EventEmitter()
  const port = loginomHostPort(
    {
      postMessage: (value) => replies.emit("message", { data: value }),
      on: requests.on.bind(requests),
      start() {},
    },
    host,
  )
  const client = transport({
    postMessage: (value) => requests.emit("message", { data: value }),
    on: replies.on.bind(replies),
    start() {},
  })
  await client.request("acquire", { run: "one", session: "chat" })
  return {
    host,
    client,
    root,
    marker,
    scope: (mode: string, profile: string, taskMessageID = "msg_original") =>
      client.request("scope", { run: "one", mode, scope: { taskMessageID, profile } }),
    call: (name: string) => client.request("call", { run: "one", name, userMessage: "msg_original", args: {} }),
    async close() {
      client.close()
      await port.close()
      await host.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

test.each(["default", "package-docs"])(
  "%s Host scope refuses browser and admission before any external work",
  async (profile) => {
    const f = await fixture()
    try {
      if (profile === "package-docs") await f.scope("bind", profile)
      expect(await f.client.request("tools", { run: "one" })).toMatchObject({
        tools: [expect.objectContaining({ name: "dock_diagnostics" })],
      })
      const catalog: unknown = await f.client.request("tools", { run: "one" })
      expect(JSON.stringify(catalog)).not.toContain("dock_prepare")
      for (const name of ["dock_prepare", "dock_node_wait", "unadvertised_tool"])
        await expect(f.call(name)).rejects.toThrow("LOGINOM_SCOPE_DENIED")
      await expect(
        f.client.request("admit", {
          run: "one",
          userMessage: "msg_original",
          files: [{ name: "data.csv", data: "YQ==" }],
        }),
      ).rejects.toThrow("LOGINOM_SCOPE_DENIED")
      await expect(access(f.marker)).rejects.toMatchObject({ code: "ENOENT" })
      expect(await readdir(f.root)).not.toContain("runtime")
      expect(await readdir(f.root)).not.toContain("inputs")
      expect(await readdir(join(f.root, "recovery"))).toEqual([])
    } finally {
      await f.close()
    }
  },
)

test("pending activation preserves the current catalog and requires application on the same run", async () => {
  const f = await fixture()
  try {
    await f.scope("bind", "default")
    expect(await f.scope("request", "loginom-automation")).toEqual({
      taskMessageID: "msg_original",
      profile: "loginom-automation",
    })
    expect(JSON.stringify(await f.client.request("tools", { run: "one" }))).not.toContain("dock_prepare")
    await expect(f.call("dock_prepare")).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    expect(await f.scope("apply", "loginom-automation")).toEqual({
      taskMessageID: "msg_original",
      profile: "loginom-automation",
    })
    expect(JSON.stringify(await f.client.request("tools", { run: "one" }))).toContain("dock_prepare")
    await expect(f.call("dock_prepare")).rejects.toThrow("LOGINOM_CONFIG_REQUIRED")
    await expect(access(f.marker)).rejects.toMatchObject({ code: "ENOENT" })
  } finally {
    await f.close()
  }
})

test("docs forbids automation in the same task, including a previously accepted pending docs request", async () => {
  const f = await fixture()
  try {
    await f.scope("bind", "default")
    await f.scope("request", "package-docs")
    await expect(f.scope("request", "loginom-automation")).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    await f.scope("apply", "package-docs")
    await expect(f.scope("request", "loginom-automation")).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    await expect(f.scope("bind", "loginom-automation")).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    await f.scope("bind", "default", "msg_next")
    await f.scope("request", "loginom-automation", "msg_next")
    await f.scope("apply", "loginom-automation", "msg_next")
    expect(JSON.stringify(await f.client.request("tools", { run: "one" }))).toContain("dock_prepare")
  } finally {
    await f.close()
  }
})

test("automation to docs rechecks live work at application and leaves the old profile after rejection", async () => {
  const f = await fixture(true)
  try {
    await f.scope("bind", "loginom-automation")
    await f.client.request("tools", { run: "one" })
    await f.call("dock_prepare")
    const runtime = await f.host.runtime(1, createHash("sha256").update("chat").digest("hex"))
    for (const work of [{ activeWork: true }, { unsettledWork: true }, { dispatching: true }]) {
      await runtime.request("fixture.state", { activeWork: false, unsettledWork: false, dispatching: false, ...work })
      await expect(f.scope("request", "package-docs")).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    }
    await runtime.request("fixture.state", { activeWork: false, unsettledWork: false, dispatching: false })
    await f.scope("request", "package-docs")
    await f.client.request("tools", { run: "one" })
    await f.call("dock_node_wait")
    await runtime.request("fixture.state", { activeWork: true, unsettledWork: true })
    await expect(f.scope("apply", "package-docs")).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    expect(JSON.stringify(await f.client.request("tools", { run: "one" }))).toContain("dock_node_wait")
    await runtime.request("fixture.state", { activeWork: false, unsettledWork: false })
    await f.scope("request", "package-docs")
    await f.scope("apply", "package-docs")
    const catalog = JSON.stringify(await f.client.request("tools", { run: "one" }))
    expect(catalog).not.toContain("dock_node_wait")
    expect(catalog).not.toContain("dock_prepare")
    await expect(f.call("dock_node_wait")).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    expect(
      (await readFile(f.marker, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line).operation),
    ).toEqual(["start", "call", "call"])
  } finally {
    await f.close()
  }
})

test("first authorized prepare admits original bytes before workspace work and never repeats them", async () => {
  const f = await fixture(true)
  try {
    await f.scope("bind", "loginom-automation")
    const admissions = [{ userMessage: "msg_early_csv", files: [{ name: "data.csv", data: "YSxiCg==" }] }]
    await f.client.request("call", {
      run: "one",
      name: "dock_prepare",
      userMessage: "msg_original",
      args: {},
      admissions,
    })
    await f.client.request("tools", { run: "one" })
    await f.client.request("call", {
      run: "one",
      name: "dock_node_wait",
      userMessage: "msg_original",
      args: {},
      admissions,
    })
    const events: { operation: string; userMessage?: string }[] = (await readFile(f.marker, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(events.map((event) => event.operation)).toEqual(["start", "admit", "call", "call"])
    expect(events[1].userMessage).toBe("msg_early_csv")
    expect(await readdir(join(f.root, "recovery"))).toEqual([])
  } finally {
    await f.close()
  }
})

test("private package input is rejected before startup or input staging outside its prepare contract", async () => {
  const f = await fixture(true)
  try {
    const packageInput = { admissionID: "local-package-1", file: { name: "input.lgp", data: "YQ==" } }
    const call = {
      run: "one",
      name: "dock_prepare",
      userMessage: "msg_original",
      args: { intent: "open_package" },
      packageInput,
    }
    await expect(f.client.request("call", call)).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    await f.scope("bind", "loginom-automation")
    for (const request of [
      { method: "tools", input: call },
      { method: "admit", input: { ...call, files: [] } },
      { method: "call", input: { ...call, name: "find" } },
      { method: "call", input: { ...call, name: "dock_diagnostics" } },
      { method: "call", input: { ...call, args: { intent: "new_draft" } } },
      { method: "call", input: { ...call, args: { intent: "open_package", package_path: "/user/other.lgp" } } },
      { method: "call", input: { ...call, args: { intent: "open_package", workflow_ref: {} } } },
      { method: "call", input: { ...call, args: { intent: "open_package", local_package_path: "/outside.lgp" } } },
      {
        method: "call",
        input: { ...call, packageInput: { ...packageInput, file: { name: "input.csv", data: "YQ==" } } },
      },
    ])
      await expect(f.client.request(request.method, request.input)).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    for (const [invalid, code] of [
      [null, "LOGINOM_HOST_REQUEST_FAILED"],
      [{}, "LOGINOM_HOST_REQUEST_FAILED"],
      [{ ...packageInput, admissionID: "" }, "LOGINOM_HOST_REQUEST_FAILED"],
      [{ ...packageInput, file: { name: "input.lgp", data: 5 } }, "LOGINOM_HOST_REQUEST_FAILED"],
      [{ ...packageInput, file: { name: "input.lgp", data: "YQ" } }, "LOGINOM_INPUT_INVALID"],
    ] as const)
      await expect(f.client.request("call", { ...call, packageInput: invalid })).rejects.toThrow(code)
    await expect(access(f.marker)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readdir(f.root)).not.toContain("runtime")
    expect(await readdir(f.root)).not.toContain("inputs")
    expect(await readdir(join(f.root, "recovery"))).toEqual([])
  } finally {
    await f.close()
  }
})

test("private package prepare stages exact bytes and forwards only one admitted artifact and grant", async () => {
  const f = await fixture(true)
  try {
    await f.scope("bind", "loginom-automation")
    const bytes = Buffer.from([0, 255, 128, 10])
    const args = { intent: "open_package", operation_id: "open-local-1" }
    await f.client.request("call", {
      run: "one",
      name: "dock_prepare",
      userMessage: "msg_original",
      args,
      packageInput: { admissionID: "local-package-1", file: { name: "План #2.lgp", data: bytes.toString("base64") } },
    })
    const events = (await readFile(f.marker, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(events.map((event) => event.operation)).toEqual(["start", "admit", "call"])
    expect(events[1].userMessage).toBe("local-package-1")
    expect(events[1].files).toHaveLength(1)
    expect(events[1].files[0]).toMatchObject({
      name: expect.stringMatching(/-0-План _2\.lgp$/),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      upload: { directory: "/user", overwrite: "reject" },
    })
    expect(await readFile(events[1].files[0].sourcePath)).toEqual(bytes)
    expect(events[2].arguments).toEqual(args)
    expect(events[2].packageArtifact).toEqual({ artifactID: "artifact-0", uploadGrantID: "grant-0" })
    expect(await readdir(join(f.root, "recovery"))).toEqual([])
    await expect(
      f.client.request("admit", {
        run: "one",
        userMessage: "msg_ordinary_lgp",
        files: [{ name: "input.lgp", data: bytes.toString("base64") }],
      }),
    ).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    await expect(
      f.client.request("call", {
        run: "one",
        name: "dock_prepare",
        userMessage: "msg_original",
        args: {},
        admissions: [
          { userMessage: "msg_ordinary_lgp", files: [{ name: "input.lgp", data: bytes.toString("base64") }] },
        ],
      }),
    ).rejects.toThrow("LOGINOM_SCOPE_DENIED")
  } finally {
    await f.close()
  }
})

test.each([
  { admissionResult: [] },
  { admissionResult: [{ artifact_id: "artifact-0" }] },
  { admissionResult: [0, 1].map((id) => ({ artifact_id: "artifact-" + id, upload: { grant_id: "grant-" + id } })) },
])("private package prepare refuses an invalid admission reply before dispatch: %j", async ({ admissionResult }) => {
  const f = await fixture(true, admissionResult)
  try {
    await f.scope("bind", "loginom-automation")
    await expect(
      f.client.request("call", {
        run: "one",
        name: "dock_prepare",
        userMessage: "msg_original",
        args: { intent: "open_package" },
        packageInput: { admissionID: "local-package-1", file: { name: "input.lgp", data: "YQ==" } },
      }),
    ).rejects.toThrow("LOGINOM_HOST_REQUEST_FAILED")
    const events = (await readFile(f.marker, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(events.map((event) => event.operation)).toEqual(["start", "admit"])
    expect(await readdir(join(f.root, "recovery"))).toEqual([])
  } finally {
    await f.close()
  }
})

test("interrupt during private package staging prevents runtime startup and does not poison the next call", async () => {
  const f = await fixture(true)
  const staged = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const inputs = f.host.inputs
  f.host.inputs = async (...args) => {
    const files = await inputs(...args)
    staged.resolve()
    await resume.promise
    return files
  }
  try {
    await f.scope("bind", "loginom-automation")
    const call = {
      run: "one",
      name: "dock_prepare",
      userMessage: "msg_original",
      args: { intent: "open_package" },
      packageInput: { admissionID: "local-package-1", file: { name: "input.lgp", data: "YQ==" } },
    }
    const preparing = f.client.request("call", call).then(
      () => undefined,
      (error: unknown) => error,
    )
    await staged.promise
    expect(await f.client.request("interrupt", { run: "one" })).toBe(true)
    resume.resolve()
    const failure = await preparing
    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).toContain("LOGINOM_HOST_REQUEST_FAILED")
    await expect(access(f.marker)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readdir(f.root)).not.toContain("runtime")
    expect(await readdir(join(f.root, "recovery"))).toEqual([])
    await f.client.request("call", { ...call, packageInput: { ...call.packageInput, admissionID: "local-package-2" } })
    const events = (await readFile(f.marker, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(events.map((event) => event.operation)).toEqual(["start", "admit", "call"])
  } finally {
    resume.resolve()
    await f.close()
  }
})

test("automation cannot implicitly create a runtime with a non-prepare call or separate admission", async () => {
  const f = await fixture(true)
  try {
    await f.scope("bind", "loginom-automation")
    await expect(f.call("dock_node_wait")).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    await expect(
      f.client.request("admit", {
        run: "one",
        userMessage: "msg_original",
        files: [{ name: "data.csv", data: "YQ==" }],
      }),
    ).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    await expect(access(f.marker)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readdir(f.root)).not.toContain("runtime")
    expect(await readdir(f.root)).not.toContain("inputs")
  } finally {
    await f.close()
  }
})

test("a replacement runtime receives original bytes again before its explicit prepare", async () => {
  const f = await fixture(true)
  try {
    await f.scope("bind", "loginom-automation")
    const admissions = [{ userMessage: "msg_early_csv", files: [{ name: "data.csv", data: "YSxiCg==" }] }]
    const prepare = () =>
      f.client.request("call", { run: "one", name: "dock_prepare", userMessage: "msg_original", args: {}, admissions })
    await prepare()
    await f.client.request("tools", { run: "one" })
    const runtime = await f.host.runtime(1, createHash("sha256").update("chat").digest("hex"))
    await runtime.request("fixture.exit")
    await runtime.exited
    await expect(f.call("dock_node_wait")).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    await prepare()
    const events: { operation: string; userMessage?: string }[] = (await readFile(f.marker, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(events.map((event) => event.operation)).toEqual(["start", "admit", "call", "start", "admit", "call"])
    expect(events.filter((event) => event.operation === "admit").map((event) => event.userMessage)).toEqual([
      "msg_early_csv",
      "msg_early_csv",
    ])
  } finally {
    await f.close()
  }
})

test("a failed prepare keeps the existing runtime unavailable to other Dock calls", async () => {
  const f = await fixture(true)
  try {
    await f.scope("bind", "loginom-automation")
    expect(
      await f.client.request("call", {
        run: "one",
        name: "dock_prepare",
        userMessage: "msg_original",
        args: { fixtureFailure: true },
      }),
    ).toMatchObject({ isError: true })
    expect(JSON.stringify(await f.client.request("tools", { run: "one" }))).not.toContain("dock_node_wait")
    await expect(f.call("dock_node_wait")).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    expect(await readdir(join(f.root, "recovery"))).toEqual([])
    await f.call("dock_prepare")
    expect(JSON.stringify(await f.client.request("tools", { run: "one" }))).toContain("dock_node_wait")
    await f.call("dock_node_wait")
    const events: { operation: string; name?: string }[] = (await readFile(f.marker, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(events.filter((event) => event.operation === "call").map((event) => event.name)).toEqual([
      "dock_prepare",
      "dock_prepare",
      "dock_node_wait",
    ])
  } finally {
    await f.close()
  }
})

test("a new default task preserves live work and cannot bypass its docs transition check", async () => {
  const f = await fixture(true)
  try {
    await f.scope("bind", "loginom-automation")
    await f.call("dock_prepare")
    const runtime = await f.host.runtime(1, createHash("sha256").update("chat").digest("hex"))
    await runtime.request("fixture.state", { activeWork: true, unsettledWork: true })
    await f.scope("bind", "default", "msg_next")
    expect(JSON.stringify(await f.client.request("tools", { run: "one" }))).not.toContain("dock_prepare")
    await expect(f.scope("request", "package-docs", "msg_next")).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    expect(await f.host.workState(1, createHash("sha256").update("chat").digest("hex"))).toEqual({
      activeWork: true,
      unsettledWork: true,
      dispatching: false,
    })
    await runtime.request("fixture.state", { activeWork: false, unsettledWork: false })
    await f.scope("request", "package-docs", "msg_next")
    await runtime.request("fixture.state", { unsettledWork: true })
    await expect(f.scope("apply", "package-docs", "msg_next")).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    expect(await f.scope("bind", "default", "msg_next")).toEqual({ taskMessageID: "msg_next", profile: "default" })
  } finally {
    await f.close()
  }
})

test("a raw browser call cannot start while the Host applies a docs transition", async () => {
  const f = await fixture(true)
  const state: { applying?: Promise<unknown>; runtime?: Awaited<ReturnType<typeof f.host.runtime>> } = {}
  try {
    await f.scope("bind", "loginom-automation")
    await f.call("dock_prepare")
    await f.client.request("tools", { run: "one" })
    await f.scope("request", "package-docs")
    state.runtime = await f.host.runtime(1, createHash("sha256").update("chat").digest("hex"))
    await state.runtime.request("fixture.hold_work")
    state.applying = f.scope("apply", "package-docs")
    await state.runtime.request("fixture.wait_work")
    await expect(f.call("dock_node_wait")).rejects.toThrow("LOGINOM_SCOPE_DENIED")
    await state.runtime.request("fixture.release_work")
    expect(await state.applying).toEqual({ taskMessageID: "msg_original", profile: "package-docs" })
    const events: { operation: string; name?: string }[] = (await readFile(f.marker, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(events.filter((event) => event.operation === "call").map((event) => event.name)).toEqual(["dock_prepare"])
  } finally {
    await state.runtime?.request("fixture.release_work")
    await state.applying?.catch(() => undefined)
    await f.close()
  }
})
