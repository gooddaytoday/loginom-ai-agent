import { expect, test } from "bun:test"
import path from "node:path"
import { failureKind, parseEvents } from "../src/cli"
import { evalsRoot, repoRoot } from "../src/config"

// B2.7a4: what evals and scripts/node-acceptance/run-check.py read from `run --headless --format json` of the product CLI
// on OpenCode 2. The streams were recorded from the real CLI with a scripted model (`packages/cli/test/cli-run.test.ts`,
// which also fails when the CLI stops producing their shape); each `.exit` file holds the exit code of that run.
const fixtures = path.join(evalsRoot, "fixtures", "events", "cli-run")

async function recorded(name: string) {
  const text = await Bun.file(path.join(fixtures, `${name}.jsonl`)).text()
  const exitCode = Number((await Bun.file(path.join(fixtures, `${name}.exit`)).text()).trim())
  const parsed = parseEvents(text)
  return { text, exitCode, parsed, kind: failureKind({ exitCode, errors: parsed.errors, errorTexts: parsed.errorTexts, stderr: "" }) }
}

test("a completed run: one session, provider coverage, its tools, usage and final answer", async () => {
  const run = await recorded("success")
  expect(run.exitCode).toBe(0)
  expect(run.parsed.sessionId).toStartWith("ses_")
  expect(run.parsed.errors).toEqual([])
  expect(run.parsed.limitEvidence).toEqual({ coverage: { provider: "complete", dock: "unavailable", judge: "unavailable" }, events: [] })
  expect(run.parsed.tools).toEqual([
    { tool: "read", status: "completed", action: undefined, target: undefined, error: undefined },
    { tool: "webfetch", status: "completed", action: undefined, target: undefined, error: undefined },
  ])
  expect(run.parsed.counters).toEqual({ toolCalls: 2, loginomToolCalls: 0, toolErrors: 0, memoryToolCalls: 0 })
  expect(run.parsed.tokens).toEqual({ input: 30, output: 6, reasoning: 0 })
  expect(run.parsed.finalText).toBe("Ответ: 4.")
})

test.each([
  { name: "tool-failed", exitCode: 1, kind: "tool", errors: ["CLI_TOOL_FAILED"] },
  { name: "permission-rejected", exitCode: 1, kind: "permission", errors: ["CLI_PERMISSION_REJECTED"] },
  { name: "provider-auth", exitCode: 1, kind: "provider", errors: ["ProviderAuthError"] },
  { name: "cancelled", exitCode: 130, kind: "cancelled", errors: ["CLI_CANCELLED"] },
])("a failed run is classified by its error and exit code: $name", async (expected) => {
  const run = await recorded(expected.name)
  expect(run.exitCode).toBe(expected.exitCode)
  expect(run.kind).toBe(expected.kind)
  expect(run.parsed.errors).toEqual([...expected.errors])
  // The stream still covers the whole session: busy first, idle last among its statuses.
  expect(run.parsed.limitEvidence.coverage.provider).toBe("complete")
})

// run-check.py reads the stream with its own `records` and `model_replies`, the session from the first event that has
// one, the replies of completed tools that start with a JSON object, and the last text as the answer.
test.skipIf(!Bun.which("python3"))("run-check.py reads the session, the tool reply and the answer", async () => {
  const script = `
import importlib.util, json, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("run_check", sys.argv[1])
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)
events = list(check.records(Path(sys.argv[2])))
session = next(e["sessionID"] for _, e in events if e.get("sessionID"))
replies = [reply for _, reply in check.model_replies(events)]
answer = next((e.get("part", {}).get("text", "") for _, e in reversed(events) if e.get("type") == "text"), "")
print(json.dumps({"session": session, "replies": replies, "answer": answer, "events": len(events)}))
`
  const child = Bun.spawn(
    ["python3", "-I", "-c", script, path.join(repoRoot, "scripts", "node-acceptance", "run-check.py"), path.join(fixtures, "success.jsonl")],
    { stdout: "pipe", stderr: "pipe" },
  )
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  const run = await recorded("success")
  expect(JSON.parse(stdout)).toEqual({
    session: run.parsed.sessionId,
    replies: [{ operation_id: "fixture-operation", status: "SUCCEEDED" }],
    answer: "Ответ: 4.",
    events: run.text.trim().split("\n").length,
  })
})
