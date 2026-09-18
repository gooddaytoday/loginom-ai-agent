import path from "node:path"

const args = Bun.argv.slice(2)
if (args[0] === "--version") {
  process.stdout.write("fake-codex 0.0.0\n")
  process.exit(0)
}
const dir = args[args.indexOf("-C") + 1] ?? "."
const out = args[args.indexOf("-o") + 1] ?? path.join(dir, "verdict.json")
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
const passed = (index: number) => (mode === "pass" ? true : mode === "fail" ? false : index % 2 === 0)
await Bun.write(
  out,
  JSON.stringify({
    checklist: checklist.map((item, index) => ({ id: item.id, passed: passed(index), evidence: `fake ${mode}` })),
    summary: `fake verdict (${mode})`,
    confidence: "high",
  }),
)
