import { expect, test } from "bun:test"
import path from "node:path"
import { evalsRoot } from "../src/config"

test("LAB59 independent TASK/input calculation preserves headers, skips, quoting, NULL and exact types", async () => {
  const run = Bun.spawn(["python3", path.join(evalsRoot, "script/check-lab59-oracle.py"),
    path.join(evalsRoot, "script/lab59-oracle.py"), path.join(evalsRoot, "drafts/text-import")],
    { stdout: "pipe", stderr: "pipe" })
  const [code, output, error] = await Promise.all([run.exited,
    new Response(run.stdout).text(), new Response(run.stderr).text()])
  expect(error).toBe("")
  expect(code).toBe(0)
  expect(output).toContain("PASS: all 12 tables")
})
