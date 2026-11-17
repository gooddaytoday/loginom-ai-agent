// S7 (server half): plugin RPC is callable by a client and its events arrive on the SSE stream; the model's
// `loginom_request_access` raises a `loginom.access` permission that a client sees and answers; approval applies the
// grant mid-turn (the next model request already offers the privileged tool); rejection keeps it hidden; a saved
// "always" reply does not skip the next ask. The GUI rendering itself is not exercised here.
import { makeEnv, report } from "./env"
import { script } from "./mock-llm"

const env = await makeEnv("s7", { port: 47170, plugins: [], extraEnv: { LOGINOM_SPIKE_BUILTIN: "1", LOGINOM_SPIKE_U3: "1" } })
const results: Record<string, unknown> = {}

async function pendingPermission(sessionID: string) {
  for (let i = 0; i < 100; i++) {
    const list = (await env.api.permissions(sessionID)).body?.data ?? []
    if (list.length) return list[0]
    await Bun.sleep(100)
  }
  return undefined
}

try {
  const cold = await env.api.createSession()
  results.coldRpc = await env.api.rpc("loginom.runner", "start", { sessionID: cold, text: script([{ text: "x" }]) })
  await env.warm()

  const seen: string[] = []
  const controller = new AbortController()
  const sse = fetch(`http://127.0.0.1:${env.port}/api/event`, {
    headers: { authorization: `Basic ${Buffer.from("opencode:spike").toString("base64")}`, "x-opencode-directory": encodeURIComponent(env.project) },
    signal: controller.signal,
  }).then(async (response) => {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) return
      for (const line of decoder.decode(chunk.value).split("\n"))
        if (line.startsWith("data:")) seen.push(JSON.parse(line.slice(5)).type)
    }
  }).catch(() => undefined)
  await Bun.sleep(500)
  const viaRpc = await env.api.createSession()
  results.warmRpc = await env.api.rpc("loginom.runner", "start", { sessionID: viaRpc, text: script([{ text: "rpc run" }]) })
  await Bun.sleep(300)
  await env.api.wait(viaRpc)
  await Bun.sleep(500)
  results.sseRpcEvents = seen.filter((type) => type.startsWith("rpc."))

  const approve = await env.api.createSession()
  await env.api.prompt(approve, script([{ tool: "loginom_request_access", input: { reason: "open sales.lgp" } }, { tool: "loginom_dock_prepare", input: { intent: "open" } }, { text: "end" }]))
  const asked = await pendingPermission(approve)
  results.asked = asked
  results.sseAsked = seen.filter((type) => type.startsWith("permission."))
  if (asked) await env.api.reply(approve, asked.id, "once")
  await env.api.wait(approve)
  const offered = env.llm().filter((r) => r.tools.includes("loginom_dock_prepare")).map((r) => r.n)
  results.approved = {
    grant: env.plugin().filter((e) => e.sessionID === approve && e.event.startsWith("grant")).map((e) => e.event),
    dockExecuted: env.plugin().some((e) => e.sessionID === approve && e.event === "tool.executed" && e.tool === "loginom_dock_prepare"),
    modelRequestsOfferingDock: offered,
  }

  const reject = await env.api.createSession()
  await env.api.prompt(reject, script([{ tool: "loginom_request_access", input: { reason: "x" } }, { tool: "loginom_dock_prepare", input: {} }, { text: "end" }]))
  const rejectAsk = await pendingPermission(reject)
  if (rejectAsk) await env.api.reply(reject, rejectAsk.id, "reject")
  await env.api.wait(reject)
  results.rejected = {
    grant: env.plugin().some((e) => e.sessionID === reject && e.event === "grant.minted"),
    dockExecuted: env.plugin().some((e) => e.sessionID === reject && e.event === "tool.executed"),
  }

  const always = await env.api.createSession()
  await env.api.prompt(always, script([{ tool: "loginom_request_access", input: { reason: "x" } }, { text: "end" }]))
  const alwaysAsk = await pendingPermission(always)
  if (alwaysAsk) await env.api.reply(always, alwaysAsk.id, "always")
  await env.api.wait(always)
  const again = await env.api.createSession()
  await env.api.prompt(again, script([{ tool: "loginom_request_access", input: { reason: "y" } }, { text: "end" }]))
  const againAsk = await pendingPermission(again)
  results.alwaysThenAgain = { askedAgain: againAsk !== undefined }
  if (againAsk) await env.api.reply(again, againAsk.id, "reject")
  await env.api.wait(again)
  controller.abort()
  await sse

  const r = results as any
  const pass =
    r.warmRpc.status === 200 &&
    r.sseRpcEvents.includes("rpc.loginom.runner.stage") &&
    r.asked?.action === "loginom.access" &&
    r.approved.dockExecuted &&
    r.approved.modelRequestsOfferingDock.length > 0 &&
    !r.rejected.grant &&
    !r.rejected.dockExecuted &&
    r.alwaysThenAgain.askedAgain
  report("S7", pass ? "PARTIAL" : "FAIL", results)
} finally {
  env.stop()
}
