import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { spawn } from "@lydell/node-pty"

// Manual Windows acceptance driver. It supplies terminal input through ConPTY
// only and never dispatches Loginom operations itself.
const [executable, workspace, evidence, browserMode, resumeJson = "{}"] = process.argv.slice(2)
if (!executable || !workspace || !evidence || !["--headless", "--no-headless"].includes(browserMode))
  throw Error("TUI_ORACLE_ARGUMENT_INVALID")
const resume = JSON.parse(resumeJson) as { session?: string; latest?: boolean; prompt?: string; permission?: string }
const args = [workspace, browserMode, "--model", "test/test-model"]
args.push(...(resume.permission ? ["--prompt", "Prepare Loginom only if permission allows it."] : ["--dangerously-skip-permissions"]))
if (resume.latest) args.push("--continue")
else if (resume.session) args.push("--session", resume.session)

const child = spawn(executable, args, {
  cwd: evidence,
  cols: 120,
  rows: 40,
  env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
})
let screen = ""
let selected = resume.permission ? 3 : 0
let selectedAt = 0
let finishing = 0
let exitStep = 0
let submittedChats = 0
let forced = false
let settled = false
let stopping = false
child.onData((chunk) => {
  process.stdout.write(chunk)
  screen = (screen + chunk).slice(-200_000)
  if (chunk.includes("\x1b[6n")) child.write("\x1b[1;1R")
  if (chunk.includes("\x1b[c")) child.write("\x1b[?1;2c")
})
let input = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk) => {
  input += chunk
  for (;;) {
    const index = input.indexOf("\n")
    if (index < 0) break
    const command = input.slice(0, index).trim()
    input = input.slice(index + 1)
    if (command === "finish" && !finishing) finishing = Date.now()
  }
})
process.stdin.on("end", () => {
  if (!finishing) finishing = Date.now()
})

const started = Date.now()
const stop = () => {
  if (stopping || settled) return
  stopping = true
  forced = true
  child.kill()
  setTimeout(() => process.exit(1), 5000)
}
process.once("SIGTERM", stop)
const timer = setInterval(() => {
  const now = Date.now()
  if (now - started > 600_000) {
    stop()
    return
  }
  if (selected === 0 && !resume.session && screen.includes("Ask anything")) {
    child.write("@sales.csv")
    selected = 1
    selectedAt = now
  } else if (selected === 1 && now - selectedAt > 3000) {
    child.write("\r")
    selected = 2
    selectedAt = now
  } else if (selected === 2 && now - selectedAt > 2000) {
    child.write(" Import the attached sales.csv, aggregate its numeric values, save the package, and close it.\r")
    selected = 3
    submittedChats++
  } else if (selected === 0 && resume.session && screen.includes("CLI oracle completed")) {
    child.write((resume.prompt ?? "") + "\r")
    selected = 3
  }
  if (finishing && now - finishing > 3000 && exitStep === 0) {
    child.write("\x1b")
    exitStep = 1
  }
  if (finishing && now - finishing > 5000 && exitStep === 1) {
    child.write("\x03")
    exitStep = 2
  }
  if (finishing && now - finishing > 8000 && exitStep === 2) {
    child.write("\x03")
    exitStep = 3
  }
  if (finishing && now - finishing > 15_000 && !settled) {
    stop()
  }
}, 100)

child.onExit(async ({ exitCode }) => {
  if (settled) return
  settled = true
  clearInterval(timer)
  process.stdin.pause()
  const code = exitCode ?? 0
  await writeFile(
    join(evidence, "tui-exit.json"),
    JSON.stringify({ code, forced, submitted_chats: submittedChats, input_submitted: selected === 3 }),
  )
  setTimeout(() => process.exit(code === 0 && !forced ? 0 : 1), 250)
})
