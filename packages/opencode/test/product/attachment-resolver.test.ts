import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Effect } from "effect"
import { MessageID, SessionID } from "@/session/schema"
import { ProductHooks } from "../../src/product-hooks"

const resolver = ProductHooks.attachmentResolver
const owner = { messageID: MessageID.ascending(), sessionID: SessionID.make("ses_attachment") }
const previousRoot = process.env.LOGINOM_AI_AGENT_CLI_ROOT
const directories: string[] = []

afterEach(async () => {
  if (previousRoot === undefined) delete process.env.LOGINOM_AI_AGENT_CLI_ROOT
  else process.env.LOGINOM_AI_AGENT_CLI_ROOT = previousRoot
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function attached(name: string, content: string) {
  const directory = await mkdtemp(join(tmpdir(), "attachment-resolver-"))
  directories.push(directory)
  const filepath = join(directory, name)
  await writeFile(filepath, content)
  return { filepath, url: new URL(pathToFileURL(filepath).href) }
}

describe("ProductHooks.attachmentResolver", () => {
  test("an @-mentioned scenario package keeps its own media type", () => {
    expect(resolver.mentionMime("/work/demo.lgp")).toBe("application/x-loginom-package")
    expect(resolver.mentionMime("/work/notes.txt")).toBe("text/plain")
  })

  test("a scenario package is referenced by path and never read into the conversation", () => {
    const part = { type: "file" as const, mime: "application/octet-stream", url: "file:///work/Demo.LGP" }
    const parts = resolver.packageParts(part, "/work/Demo.LGP", owner)
    expect(parts).toEqual([
      { ...owner, type: "text", synthetic: true, text: "Attached Loginom package path: /work/Demo.LGP" },
      { ...part, ...owner, mime: "application/x-loginom-package", filename: "Demo.LGP" },
    ])
    expect(resolver.packageParts({ ...part, mime: "application/x-loginom-package", filename: "x" }, "/work/x.bin", owner)).toBeDefined()
    expect(resolver.packageParts({ ...part, mime: "text/csv" }, "/work/sales.csv", owner)).toBeUndefined()
  })

  test("a subtask receives user text and package paths but not ignored text or other files", () => {
    expect(resolver.subtaskText({ type: "text", text: "build it" })).toEqual(["build it"])
    expect(resolver.subtaskText({ type: "text", text: "hidden", ignored: true })).toEqual([])
    expect(resolver.subtaskText({ type: "file", mime: "application/x-loginom-package", url: "file:///work/demo.lgp" })).toEqual([
      "Attached Loginom package path: /work/demo.lgp",
    ])
    expect(resolver.subtaskText({ type: "file", mime: "text/csv", url: "file:///work/sales.csv" })).toEqual([])
    expect(resolver.subtaskText({ type: "file", mime: "application/x-loginom-package", url: "data:;base64,AA==" })).toEqual([])
  })

  test("the original bytes of a CLI attachment are the only source of the preview and the data URL", async () => {
    process.env.LOGINOM_AI_AGENT_CLI_ROOT = "/cli"
    const { filepath, url } = await attached("sales.csv", "A;1\nB;2\n")
    const snapshot = await Effect.runPromise(resolver.snapshot({ filepath, url, filename: "sales.csv", hasAttachments: false }))
    expect(snapshot?.text).toBe("A;1\nB;2\n")
    expect(snapshot?.dataUrl("text/csv")).toBe(`data:text/csv;base64,${Buffer.from("A;1\nB;2\n").toString("base64")}`)
  })

  test("a line reference, an anchor, a missing name or a desktop session never snapshots the file", async () => {
    const { filepath, url } = await attached("sales.csv", "A;1\n")
    const take = (patch: Partial<Parameters<typeof resolver.snapshot>[0]>) =>
      Effect.runPromise(resolver.snapshot({ filepath, url, filename: "sales.csv", hasAttachments: false, ...patch }))
    delete process.env.LOGINOM_AI_AGENT_CLI_ROOT
    expect(await take({})).toBeUndefined()
    process.env.LOGINOM_AI_AGENT_CLI_ROOT = "/cli"
    expect(await take({ url: new URL(`${url.href}?start=1&end=1`) })).toBeUndefined()
    expect(await take({ url: new URL(`${url.href}#fragment`) })).toBeUndefined()
    expect(await take({ filename: undefined })).toBeUndefined()
    expect(await take({ hasAttachments: true })).toBeUndefined()
    expect(await take({})).toBeDefined()
  })
})
