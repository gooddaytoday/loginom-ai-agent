import { expect, test } from "bun:test"
import { join } from "node:path"

const src = join(import.meta.dir, "../../src")
const modules = [
  "installation",
  "skill",
  "command",
  "session/tools",
  "session/prompt",
  "product/installation",
  "product/skill-source",
  "product/tool-policy",
  "product/tool-contributor",
  "product/attachment-resolver",
  "product/turn-lifecycle",
]

test.each(modules)("%s can be the first module loaded", async (name) => {
  const child = Bun.spawn([process.execPath, "-e", `await import(${JSON.stringify(join(src, name))})`], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  expect({ code, stderr: code === 0 ? "" : stderr.slice(0, 600) }).toEqual({ code: 0, stderr: "" })
})
