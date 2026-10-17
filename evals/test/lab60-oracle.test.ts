import { expect, test } from "bun:test"
import path from "node:path"
import { evalsRoot } from "../src/config"

test("LAB60 TASK/input calculation preserves quote modes and embedded CRLF/LF exactly", async () => {
  const run = Bun.spawn(["python3", path.join(evalsRoot, "script/check-lab60-oracle.py"),
    path.join(evalsRoot, "script/lab60-oracle.py"), path.join(evalsRoot, "drafts/text-import")],
    { stdout: "pipe", stderr: "pipe" })
  const [code, output, error] = await Promise.all([run.exited,
    new Response(run.stdout).text(), new Response(run.stderr).text()])
  expect(error).toBe("")
  expect(code).toBe(0)
  expect(output).toContain("PASS: all 11 tables")
})
