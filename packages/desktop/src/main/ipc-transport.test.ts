import { describe, expect, test } from "bun:test"
import { MessageChannel } from "node:worker_threads"
import { Deferred, Effect, Layer, ManagedRuntime, Predicate, Schema, Stream } from "effect"
import { Rpc, RpcGroup, RpcMessage, RpcServer } from "effect/rpc"
import { Transferable } from "effect/workers"
import { omitUndefined } from "../shared/ipc-transport"
import { EventRpcs, MenuCommandTriggered } from "../shared/ipc-rpc/events"
import { FilesOpenFilePicker } from "../shared/ipc-rpc/files"
import { emitIpcEvent } from "./ipc-events"
import { eventHandlers } from "./ipc-handlers/events"
import { IpcPortHandoff, IpcServerProtocolLive } from "./ipc-transport"
import { call, sender, serverPort, success } from "./ipc-test-wire"

describe("desktop RPC transport", () => {
  test("decodes renderer payloads whose optional fields are undefined", async () => {
    let received: unknown
    const rpcs = RpcGroup.make(FilesOpenFilePicker)

    const handlers = rpcs.toLayer({
      FilesOpenFilePicker: ({ options }) =>
        Effect.sync(() => {
          received = options

          return null
        }),
    })

    const live = RpcServer.layer(rpcs).pipe(Layer.provide(handlers), Layer.provideMerge(IpcServerProtocolLive))
    const runtime = ManagedRuntime.make(live)
    const handoff = await runtime.runPromise(IpcPortHandoff)
    const channel = new MessageChannel()
    handoff.bind(sender(1), serverPort(channel.port1))
    // What openAttachmentPickerDialog sends for the composer's attach button.
    const payload = { options: { multiple: true, title: undefined, defaultPath: "C:\\project", extensions: undefined } }

    // Structured clone keeps a present-but-undefined key, so it reaches the JSON codec.
    const rejected = await call(channel.port2, 0, "FilesOpenFilePicker", payload)
    expect(rejected.exit).toMatchObject(died(expect.stringContaining('["options"]["title"]')))

    const accepted = await call(channel.port2, 1, "FilesOpenFilePicker", omitUndefined(payload))
    expect(accepted.exit).toEqual(success(null))
    expect(received).toEqual({ multiple: true, defaultPath: "C:\\project" })

    channel.port2.close()
    await runtime.dispose()
  })

  test("omitting undefined fields leaves bytes and defined values alone", () => {
    const data = new Uint8Array([0, 255, 2])
    expect(omitUndefined(data)).toBe(data)
    // Strict equality: a kept `drop: undefined` key must fail the match.
    expect(omitUndefined({ data, nested: [{ keep: null, drop: undefined }], count: 0 })).toStrictEqual({
      data,
      nested: [{ keep: null }],
      count: 0,
    })
  })

  test("keeps multiple renderer ports independent", async () => {
    let received: unknown

    const handlers = TestRpcs.toLayer(
      Effect.gen(function* () {
        const handoff = yield* IpcPortHandoff

        return TestRpcs.of({
          "test.focused": (_request, context) => Effect.succeed(handoff.sender(context.client.id)?.id === 1),
          "test.blob.put": ({ data }) => {
            received = data

            return Effect.succeed([...data].join(","))
          },
          "test.blob.get": () => Effect.succeed(new Uint8Array([3, 1, 4])),
          "test.events": () => Stream.make(new TestEvent({ value: "session.new" })),
        })
      }),
    )

    const live = RpcServer.layer(TestRpcs).pipe(Layer.provide(handlers), Layer.provideMerge(IpcServerProtocolLive))
    const runtime = ManagedRuntime.make(live)
    const handoff = await runtime.runPromise(IpcPortHandoff)
    const disconnected: number[] = []
    handoff.onDisconnect((clientId) => disconnected.push(clientId))
    const first = new MessageChannel()
    const second = new MessageChannel()
    handoff.bind(sender(1), serverPort(first.port1))
    handoff.bind(sender(2), serverPort(second.port1))

    const [focused, unfocused] = await Promise.all([
      call(first.port2, 0, "test.focused", null),
      call(second.port2, 0, "test.focused", null),
    ])

    expect(focused.exit).toEqual(success(true))
    expect(unfocused.exit).toEqual(success(false))
    const put = await call(first.port2, 1, "test.blob.put", omitUndefined({ data: new Uint8Array([2, 7, 1]) }))
    expect(put.exit).toEqual(success("2,7,1"))
    // Binary payloads arrive as bytes, not as base64 text or a plain object.
    expect(received).toBeInstanceOf(Uint8Array)
    expect((await call(first.port2, 2, "test.blob.get", null)).exit).toEqual(success(new Uint8Array([3, 1, 4])))
    expect((await call(first.port2, 3, "test.events", null)).chunks).toEqual([
      Schema.encodeSync(TestEvent)(new TestEvent({ value: "session.new" })),
    ])

    const reloaded = new MessageChannel()
    handoff.bind(sender(1), serverPort(reloaded.port1))

    const [reloadedFocused, stillUnfocused] = await Promise.all([
      call(reloaded.port2, 0, "test.focused", null),
      call(second.port2, 1, "test.focused", null),
    ])

    expect(reloadedFocused.exit).toEqual(success(true))
    expect(stillUnfocused.exit).toEqual(success(false))
    // Deep link delivery returns unacknowledged links to the queue when a reload replaces a renderer's port.
    expect(disconnected).toEqual([0])

    for (const port of [first.port2, second.port2, reloaded.port2]) port.close()
    await runtime.dispose()
  })

  test("delivers events sent between a window's snapshot and its port binding", async () => {
    const runtime = ManagedRuntime.make(eventsLive)
    const handoff = await runtime.runPromise(IpcPortHandoff)
    const win = sender(1)
    // A window that has not asked for its snapshot has no document to hold events for.
    expect(emitIpcEvent(win, new MenuCommandTriggered({ id: "early" }))).toBe(false)

    handoff.prepare(win)
    // On dev these were dropped: the window had no event queue until its port bound.
    expect(emitIpcEvent(win, new MenuCommandTriggered({ id: "a" }))).toBe(true)
    expect(emitIpcEvent(win, new MenuCommandTriggered({ id: "b" }))).toBe(true)
    const channel = new MessageChannel()
    handoff.bind(win, serverPort(channel.port1))
    emitIpcEvent(win, new MenuCommandTriggered({ id: "c" }))

    expect(await chunks(channel.port2, 0, "DesktopEvents", 3)).toEqual(["a", "b", "c"].map(menuCommand))

    channel.port2.close()
    await runtime.dispose()
  })

  test("lets a reloading window's old port finish its flush while events wait for the new document", async () => {
    const runtime = ManagedRuntime.make(eventsLive)
    const handoff = await runtime.runPromise(IpcPortHandoff)
    const disconnected: number[] = []
    handoff.onDisconnect((clientId) => disconnected.push(clientId))
    const win = sender(1)
    const first = new MessageChannel()
    handoff.bind(win, serverPort(first.port1))
    const firstEvents = call(first.port2, 0, "DesktopEvents", null)
    const flush = call(first.port2, 1, "test.flush", null)
    await Effect.runPromise(Deferred.await(flushStarted))

    // The new document's snapshot: the old one stops receiving events but still answers its RPCs.
    handoff.prepare(win)
    expect((await firstEvents).chunks).toEqual([])
    emitIpcEvent(win, new MenuCommandTriggered({ id: "during reload" }))
    Effect.runSync(Deferred.succeed(flushGate, undefined))
    expect((await flush).exit).toEqual(success("flushed"))

    const second = new MessageChannel()
    handoff.bind(win, serverPort(second.port1))
    expect(await chunks(second.port2, 0, "DesktopEvents", 1)).toEqual([menuCommand("during reload")])
    expect(disconnected).toEqual([0])

    for (const port of [first.port2, second.port2]) port.close()
    await runtime.dispose()
  })
})

const flushStarted = Effect.runSync(Deferred.make<void>())

const flushGate = Effect.runSync(Deferred.make<void>())

const FlushRpcs = RpcGroup.make(Rpc.make("test.flush", { success: Schema.String }))

const flushHandlers = FlushRpcs.toLayer({
  "test.flush": () =>
    Deferred.succeed(flushStarted, undefined).pipe(Effect.andThen(Deferred.await(flushGate)), Effect.as("flushed")),
})

const eventsLive = RpcServer.layer(EventRpcs.merge(FlushRpcs)).pipe(
  Layer.provide(Layer.mergeAll(eventHandlers, flushHandlers)),
  Layer.provideMerge(IpcServerProtocolLive),
)

function menuCommand(id: string) {
  return Schema.encodeSync(MenuCommandTriggered)(new MenuCommandTriggered({ id }))
}

class TestEvent extends Schema.TaggedClass<TestEvent>()("TestEvent", { value: Schema.String }) {}

const TestRpcs = RpcGroup.make(
  Rpc.make("test.focused", { success: Schema.Boolean }),
  Rpc.make("test.blob.put", { payload: { data: Transferable.Uint8Array }, success: Schema.String }),
  Rpc.make("test.blob.get", { success: Transferable.Uint8Array }),
  Rpc.make("test.events", { success: TestEvent, stream: true }),
)

// SAFETY: these are the RPC wire format's plain encoded messages and exits, which the tests post and expect as is.
/* oxlint-disable anti-slop-effect/no-manual-tagged-construction -- see SAFETY above */
function died<A>(defect: A) {
  return { _tag: "Failure", cause: [{ _tag: "Die", defect }] } as const
}

// Subscribes to a stream that never ends and settles once `count` values have arrived.
function chunks(port: MessageChannel["port2"], id: number, tag: string, count: number) {
  const values: unknown[] = []

  return new Promise<unknown[]>((resolve) => {
    const onMessage = (message: RpcMessage.FromServerEncoded) => {
      if (!Predicate.isTagged(message, "Chunk") || Number(message.requestId) !== id) return
      values.push(...message.values)
      port.postMessage({ _tag: "Ack", requestId: message.requestId } satisfies RpcMessage.AckEncoded)

      if (values.length < count) return
      port.off("message", onMessage)
      resolve(values)
    }

    port.on("message", onMessage)
    port.postMessage({ _tag: "Request", id, tag, payload: null, headers: [] })
  })
}
/* oxlint-enable anti-slop-effect/no-manual-tagged-construction */
