import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, utimes } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createLoginomHost } from "../src/host"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { stageKnowledgeFixture, waitForKnowledge } from "./fixtures/knowledge"

for (const failure of ["none", "starting", "ready", "logout"]) test(
  failure === "none"
    ? "only the latest package read starts after the previous runtime closes, leaving the conversation running"
    : `picker removes the profile after worker exit, preserving the ${failure} failure for that read`,
  async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "package-folder-"))
  const root = join(directory, "profile")
  const resources = join(directory, "resources")
  const state = join(root, "package-list")
  const trace = join(state, "reads")
  const diagnostics = Array.from({ length: 12 }, (_, index) => `login-failure-${index.toString(16)}.json`)
  const oldCloses = diagnostics.map((_, index) => `runtime-close-${index + 1}-ab.json`)
  try {
    await stageKnowledgeFixture(resources)
    await mkdir(state, { recursive: true })
    for (const [index, name] of diagnostics.entries()) {
      for (const file of [name, oldCloses[index]]) {
        await Bun.write(join(state, file), "{}\n")
        await utimes(join(state, file), index + 1, index + 1)
      }
    }
    await Bun.write(join(state, "startup-failures.jsonl"), diagnostics.join("\n") + "\n")
    await Bun.write(join(state, "startup-phases.jsonl"),
      diagnostics.map((_, index) => JSON.stringify({ phase: "old-phase", index })).join("\n") + "\n")
    await mkdir(join(resources, "bin"))
    await symlink(node, join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"))
    await Bun.write(join(resources, "resource-manifest.json"), "{}")
    await Bun.write(
      join(resources, "runtime/src/managed-entry.mjs"),
      `
      import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
      import { join } from "node:path";
      const failure = ${JSON.stringify(failure)};
      let started, folder, startMessage;
      process.on("message", message => {
        const reply = result => process.send({ id: message.id, result });
        if (message.operation === "start") {
          const { stateDir, generation, chat, packageFolder, headless } = message.input;
          const profile = join(stateDir, "generations", String(generation), "chats", chat);
          mkdirSync(profile, { recursive: true });
          writeFileSync(join(profile, "browser-profile"), "fixture");
          started = { protocol: 1, generation };
          if (packageFolder && headless !== true) throw Error("picker opened a browser window");
          if (!packageFolder) return reply({ ...started, ready: true, chat });
          folder = packageFolder;
          appendFileSync(join(stateDir, "reads"), "start " + folder + "\\n");
          appendFileSync(join(stateDir, "startup-phases.jsonl"),
            JSON.stringify({ phase: "fixture.read", folder, chat }) + "\\n");
          if (folder === "/user" && failure !== "ready") { startMessage = message; return }
          return reply({ ...started, listings: [{ folder, entries: [], slow: false }], skippedFolders: [], truncated: false });
        }
        if (message.operation === "inspect") return reply(started);
        if (message.operation === "close") {
          if (!folder) return process.send({ id: message.id, result: { closed: true } }, () => process.disconnect());
          setTimeout(() => {
            appendFileSync(join(process.cwd(), "reads"), "close " + folder + "\\n");
            const startError = failure === "logout" ? "LOGINOM_LOGOUT_UNCONFIRMED" : "LOGINOM_PACKAGE_FOLDER_CANCELLED";
            if (startMessage) process.send({ id: startMessage.id, error: startError });
            const response = folder === "/user" && (failure === "starting" || failure === "ready")
              ? { error: "LOGINOM_RUNTIME_CLEANUP_FAILED" } : { result: { closed: true } };
            process.send({ id: message.id, ...response }, () => process.disconnect());
          }, 120);
        }
      });
    `,
    )
    const codec = credentials("linux")
    const store = connectionStore(join(root, "connection"), codec)
    await store.stage({
      generation: 1,
      revision: 1,
      url: "http://example.test",
      username: "fixture",
      apiKey: "",
      password: "",
    })
    await store.activate(1)
    const host = await createLoginomHost({ root, resources, codec, environment: {}, preflightHeadless: false })
    try {
      await waitForKnowledge(host)
      const conversation = await host.runtime(1, "conversation")
      const first = host.readPackageFolders({ folder: "/user", generation: 1 })
      const cancelled = first.catch((error: unknown) => error)
      for (let i = 0; i < 100 && !(await Bun.file(trace).exists()); i++) await Bun.sleep(20)
      expect(await readFile(trace, "utf8")).toBe("start /user\n")
      const chats = join(state, "generations", "1", "chats")
      if (failure === "ready") {
        expect(await cancelled).toMatchObject({ message: "LOGINOM_RUNTIME_CLEANUP_FAILED" })
        expect(await readdir(chats)).toEqual([])
      }
      const skipped = host.readPackageFolders({ folder: "/common/intermediate", generation: 1 })
      const skippedCancelled = skipped.catch((error: unknown) => error)
      expect(await host.readPackageFolders({ folder: "/common", generation: 1 })).toEqual({
        listings: [{ folder: "/common", entries: [], slow: false }],
        skippedFolders: [],
        truncated: false,
      })
      expect(await cancelled).toMatchObject({
        message: failure === "none" ? "LOGINOM_PACKAGE_FOLDER_CANCELLED"
          : failure === "logout" ? "LOGINOM_LOGOUT_UNCONFIRMED" : "LOGINOM_RUNTIME_CLEANUP_FAILED",
      })
      expect(await skippedCancelled).toMatchObject({ message: "LOGINOM_PACKAGE_FOLDER_CANCELLED" })
      expect(await readFile(trace, "utf8")).toBe("start /user\nclose /user\nstart /common\nclose /common\n")
      expect((await readdir(state)).filter(name => name.startsWith("login-failure-")).sort()).toEqual(diagnostics.slice(2))
      const closes = (await readdir(state)).filter(name => name.startsWith("runtime-close-"))
      expect(closes).toHaveLength(10)
      expect(closes.filter(name => oldCloses.includes(name)).sort()).toEqual(oldCloses.slice(-8).sort())
      const receipts = await Promise.all(closes.filter(name => !oldCloses.includes(name)).map(async name =>
        JSON.parse(await readFile(join(state, name), "utf8"))))
      expect(receipts.filter(receipt => receipt.closed_ack === false)).toHaveLength(
        failure === "starting" || failure === "ready" ? 1 : 0,
      )
      expect(receipts.every(receipt => receipt.exit_code === 0)).toBe(true)
      const retained = (await readFile(join(state, "startup-failures.jsonl"), "utf8")).trimEnd().split("\n")
      expect(retained).toHaveLength(10)
      expect(retained).toContain(diagnostics[11])
      expect(retained).not.toContain(diagnostics[0])
      const phases = (await readFile(join(state, "startup-phases.jsonl"), "utf8")).trimEnd().split("\n").map(line => JSON.parse(line))
      expect(phases).toHaveLength(10)
      expect(phases.filter(row => row.phase === "old-phase").map(row => row.index)).toEqual([8, 9, 10, 11])
      expect(phases.at(-1)).toMatchObject({ phase: "fixture.read", folder: "/common" })
      const pickerChats = phases.filter(row => row.phase === "fixture.read").map(row => row.chat)
      const rootPhases = await readFile(join(root, "startup-phases.jsonl"), "utf8")
      for (const chat of pickerChats) expect(rootPhases).not.toContain(chat)
      expect(await readdir(chats)).toEqual([])
      expect(await readdir(join(root, "runtime", "generations", "1", "chats"))).toEqual(["conversation"])
      expect(await conversation.request("inspect")).toEqual({ protocol: 1, generation: 1 })
    } finally {
      await host.close()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
