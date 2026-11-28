import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SessionID } from "@opencode/schema/session-id"
import { createLoginomHost } from "../src/host"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { stageKnowledgeFixture, waitForKnowledge } from "./fixtures/knowledge"

test("listing and scanning close their temporary runtimes while the conversation keeps running", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "package-folder-"))
  const root = join(directory, "profile")
  const resources = join(directory, "resources")
  try {
    await stageKnowledgeFixture(resources)
    await mkdir(join(resources, "bin"))
    await symlink(node, join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"))
    await Bun.write(join(resources, "resource-manifest.json"), "{}")
    const bytes = Buffer.from(await Bun.file(join(import.meta.dir, "fixtures/package-docs/demo.lgp")).arrayBuffer())
    await Bun.write(
      join(resources, "runtime/src/managed-entry.mjs"),
      `
      import { mkdirSync, writeFileSync } from "node:fs";
      import { join } from "node:path";
      let started;
      process.on("message", message => {
        const reply = result => process.send({ id: message.id, result });
        if (message.operation === "start") {
          const { stateDir, generation, chat, packageFolder, packageScan, headless } = message.input;
          const profile = join(stateDir, "generations", String(generation), "chats", chat);
          mkdirSync(profile, { recursive: true });
          writeFileSync(join(profile, "browser-profile"), "fixture");
          started = { protocol: 1, generation };
          if ((packageFolder || packageScan) && headless !== true) throw Error("opened a browser window");
          if (packageScan) return reply({ ...started, packageScan: true });
          return reply(packageFolder
            ? { ...started, listing: { folder: packageFolder, entries: [], slow: false } }
            : { ...started, ready: true, chat });
        }
        if (message.operation === "packageRead") return reply(${JSON.stringify(bytes.toString("base64"))});
        if (message.operation === "packageList") return reply({ folder: message.input, slow: false,
          entries: message.input === "/common" ? [{ kind: "package", path: "/common/example.lgp",
            name: "example.lgp", modifiedAt: "2026-11-27T10:00:00.000Z", sizeBytes: ${bytes.length} }] : [] });
        if (message.operation === "inspect") return reply(started);
        if (message.operation === "close")
          return process.send({ id: message.id, result: { closed: true } }, () => process.disconnect());
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
      const sessionID = SessionID.create()
      const chat = createHash("sha256").update(sessionID).digest("hex")
      const conversation = await host.runtime(1, chat)
      const copyState = JSON.stringify({ versions: {}, backups: {}, copy: {
        original: "/fixture/source.lgp", path: "/fixture/Копии агента/copy.lgp",
      } })
      const file = join(root, "runtime", "generations", "1", "chats", chat, "package-copy.json")
      await Bun.write(file, copyState)
      expect(await host.readPackageFolder({ folder: "/common", generation: 1 })).toEqual({
        folder: "/common",
        entries: [],
        slow: false,
      })
      expect(await host.readPackageReferences({ generation: 1, sessionID })).toMatchObject({
        status: "scanned", complete: true, packages: [], packagesScanned: 1, foldersWithoutAccess: 0,
      })
      expect(await Bun.file(file).text()).toBe(copyState)
      expect(await readdir(join(root, "package-list", "generations", "1", "chats"))).toEqual([])
      expect(await readdir(join(root, "runtime", "generations", "1", "chats"))).toEqual([chat])
      expect(await conversation.request("inspect")).toEqual({ protocol: 1, generation: 1 })
    } finally {
      await host.close()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
