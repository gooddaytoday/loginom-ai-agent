import path from "node:path"
import { appendFileSync } from "node:fs"

const args = Bun.argv.slice(2)
if (args.includes("--environment-probe")) {
  await Bun.write(
    args[args.indexOf("--environment-probe") + 1]!,
    JSON.stringify(Object.fromEntries(
      ["LOGINOM_SECRET_PROBE", "EVAL_SECRET_PROBE", "JUDGE_SECRET_PROBE", "FAKE_CODEX_SECRET_PROBE", "PATH", "PROBE_ALLOWED_ENV"]
        .map((key) => [key, process.env[key] ?? null]),
    )),
  )
}
if (args.includes("--version")) {
  if (args.includes("--version-home-file"))
    await Bun.write(args[args.indexOf("--version-home-file") + 1]!, JSON.stringify({ codexHome: process.env.CODEX_HOME ?? null }))
  process.stdout.write("fake-codex 0.0.0\n")
  process.exit(0)
}
if (args.includes("--child-pid-file")) {
  const child = Bun.spawn([process.execPath, "-e", "console.log(process.pid); setTimeout(() => process.exit(0), 10000)"],
    { stdin: "ignore", stdout: "pipe", stderr: "ignore" })
  const reader = child.stdout.getReader()
  await reader.read()
  reader.releaseLock()
  await Bun.write(args[args.indexOf("--child-pid-file") + 1]!, String(child.pid))
  // Keep the parent alive for continuous ancestry observation before leaving the child behind.
  await Bun.sleep(300)
}
const dir = args[args.indexOf("-C") + 1] ?? "."
const out = args[args.indexOf("-o") + 1] ?? path.join(dir, "verdict.json")
const trace = process.env.FAKE_CODEX_GATE_LOG ?? (args.includes("--gate-log") ? args[args.indexOf("--gate-log") + 1] : undefined)
if (trace) {
  const record = (kind: "start" | "end") => appendFileSync(trace, JSON.stringify({ kind, pid: process.pid, dir, at: Date.now().toString(), codexHome: process.env.CODEX_HOME }) + "\n", { mode: 0o600 })
  record("start")
  process.on("exit", () => record("end"))
  await Bun.sleep(Number(process.env.FAKE_CODEX_DELAY_MS ?? (args.includes("--delay-ms") ? args[args.indexOf("--delay-ms") + 1] : "0")))
}
// FAKE_CODEX_FLAKY_MARKER: первый вызов падает и создаёт маркер, второй проходит.
const marker = process.env.FAKE_CODEX_FLAKY_MARKER
if (marker && !(await Bun.file(marker).exists())) {
  await Bun.write(marker, "1")
  process.exit(1)
}
const exit = Number(process.env.FAKE_CODEX_EXIT ?? "0")
if (exit !== 0) process.exit(exit)
const mode = process.env.FAKE_CODEX_VERDICT ?? "pass" // pass | fail | half | invalid | file:<path>
if (mode === "invalid") {
  await Bun.write(out, "{not json")
  process.exit(0)
}
if (mode.startsWith("file:")) {
  await Bun.write(out, await Bun.file(mode.slice(5)).text())
  process.exit(0)
}
const checklist = (await Bun.file(path.join(dir, "checklist.json")).json()) as { id: string }[]
const failures = args.includes("--failed-by-case")
  ? ((await Bun.file(args[args.indexOf("--failed-by-case") + 1]!).json()) as Record<string, string[]>)[path.basename(path.dirname(dir))] ?? []
  : []
const passed = (index: number) => (mode === "pass" ? true : mode === "fail" ? false : index % 2 === 0)
await Bun.write(
  out,
  JSON.stringify({
    checklist: checklist.map((item, index) => ({ id: item.id, passed: !failures.includes(item.id) && passed(index), evidence: `fake ${mode}` })),
    summary: `fake verdict (${mode})${process.env.FAKE_CODEX_ECHO ?? ""}`,
    confidence: "high",
  }),
)

if (args.includes("--child-pid-file")) process.exit(0)
