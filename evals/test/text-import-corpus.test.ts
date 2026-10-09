import { expect, test } from "bun:test"
import path from "node:path"
import { evalsRoot } from "../src/config"

test("prepared text-import corpus has 58 byte-verified drafts and reproducible typed oracles", async () => {
  const run = Bun.spawn(["python3", path.join(evalsRoot, "script/prepare-text-import.py"), "--check",
    path.join(evalsRoot, "drafts/text-import")], { stdout: "pipe", stderr: "pipe" })
  const [code, output, error] = await Promise.all([run.exited, new Response(run.stdout).text(), new Response(run.stderr).text()])
  expect(error).toBe("")
  expect(code).toBe(0)
  expect(JSON.parse(output)).toMatchObject({ cases: 58, inputs: 59, references: 0, runtime: "NOT_RUN" })
})
