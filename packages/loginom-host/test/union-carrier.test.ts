import { afterEach, expect, test } from "bun:test"
import { MessageChannel } from "node:worker_threads"
import { LoginomHost } from "../src/adapter"
import { bindUnionInvocationProcessor, retainUnionInvocation } from "../src/union-invocation"

const channels: MessageChannel[] = []
function invocation(source: unknown) {
  const packet = retainUnionInvocation(source)
  if (!packet) throw Error("missing Union invocation")
  return packet
}
afterEach(() => {
  LoginomHost.disconnect()
  for (const channel of channels.splice(0)) {
    channel.port1.close()
    channel.port2.close()
  }
})

async function fixture() {
  const channel = new MessageChannel()
  channels.push(channel)
  const calls: string[] = []
  const entered = Promise.withResolvers<void>()
  let finish = () => {}
  channel.port2.on("message", (message) => {
    if (message.method === "acquire") {
      channel.port2.postMessage({ id: message.id, result: { generation: 1 } })
      return
    }
    if (message.method !== "call") {
      channel.port2.postMessage({ id: message.id, result: true })
      return
    }
    calls.push(message.input.name)
    if (message.input.name === "hold") {
      finish = () => channel.port2.postMessage({ id: message.id, result: true })
      entered.resolve()
      return
    }
    if (message.input.args.operation_id === "refuse") {
      channel.port2.postMessage({ id: message.id, error: "LOGINOM_CALL_BUSY" })
      return
    }
    // Native/tool result is a labelled double; channel and real lease factory are actual.
    channel.port2.postMessage({ id: message.id, result: { content: [{ type: "text", text: "accepted" }] } })
  })
  LoginomHost.connect({
    postMessage: (value) => channel.port1.postMessage(value),
    on: (_event, listener) => channel.port1.on("message", (data) => listener({ data })),
    start() {},
  })
  const lease = await LoginomHost.acquire("chat")
  if (!lease) throw Error("missing actual acquired lease")
  const message = { id: "assistant" }
  const processor = { get message() { return message } }
  bindUnionInvocationProcessor(processor, message)
  const controller = new AbortController()
  const request = { operation_id: "union", target: { type: "transform.union_data" }, parameters: { enabled: true } }
  const source = {
    definition: { name: "dock_node_apply", inputSchema: { required: ["operation_id", "target", "parameters"] } },
    request,
    options: { toolCallId: "call", abortSignal: controller.signal },
    owner: lease,
    sessionInput: { loginom: lease, session: { id: "chat" }, processor },
    user: { id: "user" },
  }
  return { lease, source, request, controller, calls, entered, finish: () => finish() }
}

test("real acquired lease carries the original Union invocation exactly once", async () => {
  const f = await fixture()
  const packet = invocation(f.source)
  const first = packet.invoke()
  expect(packet.invoke()).toBe(first)
  expect(await first).toEqual({ content: [{ type: "text", text: "accepted" }] })
  expect(f.calls).toEqual(["dock_node_apply"])
  expect(packet.facts().nativeAuthority).toBe(false)
  await f.lease.release()
})

test.each(["request", "generation", "method", "abort"])("retained carrier refuses changed %s before dispatch", async (change) => {
  const f = await fixture()
  const packet = invocation(f.source)
  if (change === "request") f.request.parameters.enabled = false
  if (change === "generation") f.lease.generation = 2
  if (change === "method") f.lease.call = async () => true
  if (change === "abort") f.controller.abort(0)
  let rejected = false
  try { await packet.invoke() } catch (error) {
    rejected = true
    if (change === "abort") expect(error).toBe(0)
    else expect(String(error)).toContain("UNION_INVOCATION_BINDING_CHANGED")
  }
  expect(rejected).toBe(true)
  expect(f.calls).toEqual([])
})

test("mutation while waiting for previous accepted work refuses Union without dispatch", async () => {
  const f = await fixture()
  const held = f.lease.call("hold", {}, "user")
  await f.entered.promise
  const packet = invocation(f.source)
  const result = packet.invoke().catch((error: unknown) => error)
  await Bun.sleep(0)
  f.request.parameters.enabled = false
  f.finish()
  await held
  expect(String(await result)).toContain("UNION_INVOCATION_BINDING_CHANGED")
  expect(f.calls).toEqual(["hold"])
})

test("declared transport refusal retains the same first Error and does not replay", async () => {
  const f = await fixture()
  f.request.operation_id = "refuse"
  const packet = invocation(f.source)
  const first = await packet.invoke().catch((error: unknown) => error)
  const second = await packet.invoke().catch((error: unknown) => error)
  expect(first).toBeInstanceOf(Error)
  if (!(first instanceof Error)) throw Error("missing first Error")
  expect(first.message).toBe("LOGINOM_CALL_BUSY")
  expect(second).toBe(first)
  expect(f.calls).toEqual(["dock_node_apply"])
})

test("foreign acquired lease cannot consume the original packet", async () => {
  const f = await fixture()
  const packet = invocation(f.source)
  const foreign = await LoginomHost.acquire("foreign")
  expect(foreign).toBeDefined()
  await expect(foreign!.call("dock_node_apply", f.request, "user", f.controller.signal, packet)).rejects.toThrow("UNION_INVOCATION_UNOWNED")
  expect(f.calls).toEqual([])
})
