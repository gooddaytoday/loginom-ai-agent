import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { once } from "node:events"
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"

// Real Node child/stdin/IPC; synthetic browser/resources. No Loginom or Chromium.
const password = "private-cold-password-72", secret = "private-api-key-93"
type Frame = { version: number; type: string; phase: string; binding: { loginId: string; chat: string } }
async function fixture(mode: string, managed = true) {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to pinned Node")
  const root = await mkdtemp(join(tmpdir(), "cold-reader-"))
  const output = join(root, "out"), resources = join(root, "resources")
  const helpers = ["src/resources.mjs", "src/connection-check.mjs", "client/lib/workspace.mjs",
    "client/lib/node-target-browser.mjs", "client/lib/node-procedure.mjs", "client/lib/node-execution-procedure.mjs",
    "client/lib/execution-journal.mjs", "client/lib/executor.mjs", "client/lib/package-cleanup.mjs",
    "client/lib/node-output-procedure.mjs", "client/lib/table-output-pages.mjs", "client/lib/table-output-values.mjs", "client/lib/redact.mjs"]
  const runtime = join(import.meta.dir, "../../../loginom-runtime/client/lib")
  const fixturePath = join(resources, "fixture.mjs")
  await mkdir(resources)
  await writeFile(fixturePath, `
    import {appendFile,access} from 'node:fs/promises'; import {join} from 'node:path';
    export {createRedactor} from ${JSON.stringify(pathToFileURL(join(runtime, "redact.mjs")).href)};
    export {createExecutionJournal} from ${JSON.stringify(pathToFileURL(join(runtime, "execution-journal.mjs")).href)};
    const mode=${JSON.stringify(mode)},out=${JSON.stringify(output)},password=${JSON.stringify(password)};
    const path='/fresh_desktop/loginom-ai-agent-acceptance-fixed.lgp';
    const event=type=>appendFile(join(out,'observed.jsonl'),JSON.stringify({type})+'\\n');
    export const verifyResources=async()=>({manifest:{target:'linux-x64',actionManifestSha256:'a'.repeat(64)},manifestHash:'b'.repeat(64),browserPath:'/synthetic/browser'});
    export async function loginBrowser(input){
      if(${managed} && input.candidate.password!==password)throw Error(input.candidate.password);
      if(${managed})await access(join(out,'login-intent.json'));
      await event('browser-created');
      const close=async()=>{await event('context-closed');if(mode==='close-failed')throw Error(password)};
      try{
        if(mode==='login-throw')throw Error(password);
        if(input.loginBarrier && mode!=='skip-phases'){
          if(mode==='phase-order')await input.loginBarrier('authenticated');
          else {await input.loginBarrier('begin');if(mode==='repeat-begin')await input.loginBarrier('begin');await event('before-authenticated');await input.loginBarrier('authenticated')}
        }
        return {context:{pages:()=>[{url:()=> 'https://fixture.invalid/app',cleanup:async()=>{
          await event('cleanup');if(mode==='cleanup-lost')throw Error(password);
          return {status:'SUCCEEDED',package_closed:true,logged_out:true,note:password}}}],close}};
      }catch(error){await close().catch(()=>{});throw error}
    }
    export const makeWorkspacePrepareCode=()=> 'async()=>('+JSON.stringify({status:'READY',document_id:'doc',package_ref:{path},workflow_ref:{tab_tid:'tab',navigation_path:[]}})+')';
    export const makePackageCleanupCode=()=> 'async(page)=>page.cleanup()';
    export const createNodeTargetBrowserAdapter=()=>({observe:async()=>{
      if(mode==='read-failed')throw Error(password);
      return {nodes:[{ref:{node_id:'node'},type:'transform.group_data',label:'Groups fixed'}]}}});
    export const createNodeProcedure=input=>input;
    export const createNodeExecutionProcedure=channel=>({prepare:async()=>channel.record({type:'observed',note:password}),launchGraph:async()=>{},identify:async()=>{},waitCompleted:async()=>({status:'completed',verified:true,owner_verified:true})});
    export const withBrowserReceipt=code=>code;
    export const openNewOutputTable=async()=>({table:{}}), configureTablePrecision=async()=>({}),prepareTableRead=async()=>({}),restoreTablePrecision=async()=>{},returnFromOutputTable=async()=>{};
    export const readTableOutputPages=async()=>({columns:[{name:'Category'},{name:'Total'}]});
    export const decodeTableOutput=()=>({schema:[{name:'Category'},{name:'Total'}],sample:[[{value:'Alpha'},{value:15}],[{value:'Beta'},{value:40}]],row_count:2,sample_complete:true,precision:{numbers_verified:true}});
  `)
  for (const helper of helpers) {
    const path = join(resources, "runtime", helper)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `export * from ${JSON.stringify(pathToFileURL(fixturePath).href)};\n`)
  }
  await writeFile(join(root, "config.json"), JSON.stringify({ api_key: secret, loginom_url: "https://fixture.invalid/app",
    workflow_profile: { loginom_user: "fresh_desktop", passwordless_login: !managed } }))
  await writeFile(join(root, "saved.json"), JSON.stringify({ path: "/fresh_desktop/loginom-ai-agent-acceptance-fixed.lgp",
    node: "node", label: "fixed", expected: { Alpha: 15, Beta: 40 } }))
  if (mode === "collision") await mkdir(output)
  const child = spawn(node, [join(import.meta.dir, "cold-readback.mjs"), "--config", join(root, "config.json"),
    "--resources", resources, "--saved", join(root, "saved.json"), "--output", output, ...(managed ? ["--managed"] : [])], {
    stdio: mode === "missing-channel" ? ["pipe", "pipe", "pipe"] : ["pipe", "pipe", "pipe", "ipc"],
    env: { PATH: process.env.PATH, LOGINOM_AI_AGENT_TEST_HEADLESS: "1" },
  })
  const frames: Frame[] = []
  child.on("error", () => {})
  child.on("message", raw => {
    const value = raw as Frame
    frames.push(value)
    if (mode === "lost-ack") { child.disconnect(); return }
    const ack = { version: 2, method: "login-ack", loginId: value.binding.loginId, phase: value.phase }
    child.send(mode === "wrong-ack" ? { ...ack, loginId: randomUUID() } : mode === "extra-ack" ? { ...ack, password } : ack)
  })
  const body = { password, registration: { version: 2, attemptId: "own-attempt", loginBarrier: 2 } }
  child.stdin?.on("error", () => {})
  child.stdin?.end(mode === "oversize" ? "x".repeat(8193) : mode === "bad-registration"
    ? JSON.stringify({ ...body, registration: { ...body.registration, extra: true } }) : JSON.stringify(body))
  let stdout = "", stderr = ""
  child.stdout?.on("data", bytes => { stdout += bytes.toString() })
  child.stderr?.on("data", bytes => { stderr += bytes.toString() })
  const deadline = setTimeout(() => child.kill("SIGKILL"), 12_000)
  try {
    const [code, signal] = await once(child, "close")
    expect(signal).toBeNull()
    expect(stdout + stderr).not.toContain(password)
    expect(stdout + stderr).not.toContain(secret)
    const files = await readdir(output).catch(() => [])
    const text: Record<string, string> = {}
    for (const name of files) text[name] = await readFile(join(output, name), "utf8")
    for (const value of Object.values(text)) {
      // Legacy fixtures do not supply a password, so their synthetic helper must not emit one.
      if (managed) expect(value).not.toContain(password)
      expect(value).not.toContain(secret)
    }
    return { code, frames, text, stdout, stderr }
  } finally { clearTimeout(deadline); child.kill(); await rm(root, { recursive: true, force: true }) }
}

test("private password + exact fresh login ACKs, redaction and own close before PASS", async () => {
  const value = await fixture("ok")
  expect(value.code, value.stderr).toBe(0)
  expect(value.frames.map(item => item.phase)).toEqual(["begin", "authenticated"])
  expect(value.frames[0].binding).toEqual(value.frames[1].binding)
  expect(value.frames[0].binding).toMatchObject({ attemptId: "own-attempt", generation: 1, purpose: "chat", account: "fresh_desktop" })
  expect(value.frames[0].binding.loginId).toMatch(/^[a-f0-9-]{36}$/)
  const observedSession = JSON.parse(value.text["execution-events.jsonl"].trim()).session_id
  expect(value.frames[0].binding.chat).toBe(createHash("sha256").update(observedSession).digest("hex"))
  expect(JSON.parse(value.text["login-intent.json"]).binding).toEqual(value.frames[0].binding)
  expect(JSON.parse(value.text["login-result.json"]).authenticated).toBe(true)
  expect(JSON.parse(value.text["result.json"]).total).toBe(55)
  expect(value.text["cleanup.json"]).toContain("[redacted]")
  expect(value.text["execution-events.jsonl"]).toContain("[redacted]")
  expect(value.text["observed.jsonl"].trim().split("\n").map(line => JSON.parse(line).type))
    .toEqual(["browser-created", "before-authenticated", "cleanup", "context-closed"])
}, 20_000)

for (const mode of ["missing-channel", "bad-registration", "oversize", "collision", "phase-order", "wrong-ack", "extra-ack",
  "lost-ack", "login-throw", "read-failed", "cleanup-lost", "close-failed", "skip-phases", "repeat-begin"]) {
  test(`cold reader rejects without secret output or false PASS: ${mode}`, async () => {
    const value = await fixture(mode)
    expect(value.code).toBe(1)
    expect(value.stderr).toContain("COLD_READBACK_FAILED")
    expect(value.text["result.json"]).toBeUndefined()
    if (["missing-channel", "bad-registration", "oversize", "collision"].includes(mode)) expect(value.frames).toEqual([])
    else expect(value.text["login-intent.json"]).toBeDefined()
    if (["wrong-ack", "extra-ack", "lost-ack", "phase-order", "login-throw", "skip-phases", "repeat-begin"].includes(mode)) {
      expect(value.text["login-result.json"]).toBeUndefined()
      expect(value.text["observed.jsonl"]).toContain("context-closed")
    }
    if (mode === "skip-phases") expect(value.frames).toEqual([])
    if (mode === "repeat-begin") expect(value.frames.map(item => item.phase)).toEqual(["begin"])
    if (mode === "cleanup-lost") expect(value.text["observed.jsonl"].match(/"cleanup"/g)).toHaveLength(1)
    if (["read-failed", "cleanup-lost", "close-failed"].includes(mode))
      expect(value.text["observed.jsonl"]).toContain("context-closed")
  }, 20_000)
}

test("legacy passwordless reader has no managed protocol", async () => {
  const value = await fixture("legacy", false)
  expect(value.code, value.stderr).toBe(0)
  expect(value.frames).toEqual([])
  expect(value.text["login-intent.json"]).toBeUndefined()
  expect(JSON.parse(value.text["result.json"]).status).toBe("PASS")
}, 20_000)
