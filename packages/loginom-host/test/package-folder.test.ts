import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createLoginomHost } from "../src/host"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { stageKnowledgeFixture, waitForKnowledge } from "./fixtures/knowledge"

test("reading packages disposes temporary runtimes while the conversation keeps running", async () => {
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
    const fixture = new URL("../../../evals/tasks/node-evals/crosstable-local-variable-bindings/reference.lgp", import.meta.url)
    const bytes = await readFile(fixture)
    await Bun.write(
      join(resources, "runtime/src/managed-entry.mjs"),
      `
      import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
      import { join } from "node:path";
      let started;
      process.on("message", message => {
        const reply = result => process.send({ id: message.id, result });
        if (message.operation === "start") {
          const { stateDir, generation, chat, packageFolder, packageDownload, headless } = message.input;
          const profile = join(stateDir, "generations", String(generation), "chats", chat);
          mkdirSync(profile, { recursive: true });
          writeFileSync(join(profile, "browser-profile"), "fixture");
          started = { protocol: 1, generation };
          if (packageFolder && headless !== true) throw Error("picker opened a browser window");
          if (packageDownload) {
            if (packageDownload.path !== "/common/Продажи.lgp") throw Error("unexpected package");
            return reply({ ...started, downloaded: readFileSync(new URL("./fixture.lgp", import.meta.url)).toString("base64") });
          }
          return reply(packageFolder
            ? { ...started, listing: { folder: packageFolder, entries: [], slow: false } }
            : { ...started, ready: true, chat });
        }
        if (message.operation === "inspect") return reply(started);
        if (message.operation === "close")
          return process.send({ id: message.id, result: { closed: true } }, () => process.disconnect());
      });
    `,
    )
    await Bun.write(join(resources, "runtime/src/fixture.lgp"), bytes)
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
      expect(await host.readPackageFolder({ folder: "/common", generation: 1 })).toEqual({
        folder: "/common",
        entries: [],
        slow: false,
      })
      await expect(host.readPackageVariables({ path: "/common/Продажи.lgp", generation: 2 })).rejects.toThrow("LOGINOM_GENERATION_UNAVAILABLE")
      expect(await host.readPackageVariables({ path: "/common/Продажи.lgp", generation: 1 })).toMatchObject({
        source: "saved",
        usages: expect.arrayContaining([expect.objectContaining({ name: "GroupLimit" })]),
      })
      expect(await readdir(join(root, "package-list", "generations", "1", "chats"))).toEqual([])
      expect(await readdir(join(root, "runtime", "generations", "1", "chats"))).toEqual(["conversation"])
      expect(await conversation.request("inspect")).toEqual({ protocol: 1, generation: 1 })
    } finally {
      await host.close()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
