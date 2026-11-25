// B4.15: dashboard links in Desktop. 0.4's `deep-links.test.ts` queued them for the window, which had main prepare the
// folder; on v2 the queue hands them to the service's product plugin (`loginom.dashboard`, B2.9h) once the service is
// ready. The service here is a stand-in on 127.0.0.1 that logs what it is asked and answers by the case's script.
import { afterEach, describe, expect, test } from "bun:test"
import { startupUrls } from "../lifecycle/deep-link"
import type { SidecarCredentials } from "../service/sidecar-credentials"
import { DashboardLinks } from "./dashboard-links"

const servers: ReturnType<typeof Bun.serve>[] = []

afterEach(() => servers.splice(0).forEach((server) => server.stop(true)))

/** A service that answers its `n`-th request, counting from 0, with `answer(n)`, and logs every request. */
function service(answer: (n: number) => Response) {
  const requests: { method: string; path: string; search: string; authorization: string | null; body: unknown }[] = []

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url)

      requests.push({
        method: request.method,
        path: url.pathname,
        search: url.search,
        authorization: request.headers.get("authorization"),
        body: request.method === "POST" ? await request.json() : undefined,
      })

      return answer(requests.length - 1)
    },
  })

  servers.push(server)

  return { requests, data: { url: server.url.origin, password: "secret" } satisfies SidecarCredentials.Data }
}

/** What the queue reported, and a wait for its `count`-th report. */
function reports() {
  const list: [DashboardLinks.Link, PromiseSettledResult<DashboardLinks.Reply>][] = []
  const waiters: (() => void)[] = []

  return {
    list,
    report: (link: DashboardLinks.Link, result: PromiseSettledResult<DashboardLinks.Reply>) => {
      list.push([link, result])
      waiters.splice(0).forEach((wake) => wake())
    },
    async until(count: number) {
      while (list.length < count) await new Promise<void>((wake) => waiters.push(wake))
    },
  }
}

// One turn of the event loop: whatever a link would do before the app hands over the service has happened by then.
const turn = () => new Promise((resolve) => setImmediate(resolve))

const link = (id: string, action: "create" | "edit") => `loginom-ai-agent://dashboard?id=${id}&action=${action}`

const asked = (id: string) => ({ input: { id, defer: true } })

const prepared = { directory: "/data/dashboards/orders-1/work", nodeName: "Заказы", action: "create", fresh: true }

const answer = (output: DashboardLinks.Reply | Partial<typeof prepared>) => Response.json({ output })

// The service's own answers, as they travel.
const wire = (status: number, body: string) =>
  new Response(body, { status, headers: { "content-type": "application/json" } })

const unavailable = () => wire(400, '{"_tag":"RpcError","type":"rpc.unavailable","message":"RPC is unavailable"}')

const failed = () => wire(500, '{"_tag":"RpcInternalError","type":"rpc.internal","message":"RPC call failed"}')

describe("dashboard links (B4.15)", () => {
  test("prepares only the product's dashboard links, as 0.4's window read them, one at a time in order", async () => {
    const [first, second] = [crypto.randomUUID(), crypto.randomUUID()]
    const target = service(() => answer(prepared))
    const seen = reports()
    const queue = DashboardLinks.make(seen.report)

    queue.receive([
      `opencode://dashboard?id=${first}&action=create`,
      `loginom-ai-agent-beta://dashboard?id=${first}&action=create`,
      "loginom-ai-agent://console/authorized?window=window-a",
      `loginom-ai-agent://dashboard/?id=${first}&action=create`,
      `loginom-ai-agent://dashboard/open?id=${first}&action=create`,
      // 0.4's queue test used `id=1`; its window took only a snapshot's UUID.
      "loginom-ai-agent://dashboard?id=1&action=create",
      `loginom-ai-agent://dashboard?id=${first}&action=open`,
      `loginom-ai-agent://dashboard?id=${first}`,
      `loginom-ai-agent://dashboard?id=${first}&action=create&extra=1`,
      `loginom-ai-agent://dashboard?id=${first}&action=create#top`,
      `loginom-ai-agent://user:secret@dashboard?id=${first}&action=create`,
      "not a url",
      link(first, "create"),
      `loginom-ai-agent://dashboard?action=edit&id=${second.toUpperCase()}`,
    ])
    queue.connect(async () => target.data)
    await seen.until(2)

    expect(target.requests.map((request) => request.body)).toEqual([asked(first), asked(second.toUpperCase())])
    expect(seen.list).toEqual([
      [
        { id: first, action: "create" },
        { status: "fulfilled", value: prepared },
      ],
      [
        { id: second.toUpperCase(), action: "edit" },
        { status: "fulfilled", value: prepared },
      ],
    ])
  })

  // 0.4: "delivers startup and second-instance links once to their own windows". The window now receives every link
  // through the delivery machine (`deep-links/machine.ts`); what 0.4's window did with a dashboard's link is the queue's.
  test("delivers startup and second-instance links once to the service's plugin", async () => {
    const [cold, warm] = [crypto.randomUUID(), crypto.randomUUID()]
    const target = service(() => answer(prepared))
    const seen = reports()
    const queue = DashboardLinks.make(seen.report)

    queue.receive(
      startupUrls(["/opt/Loginom AI Agent/loginom-ai-agent", "--no-sandbox", link(cold, "create")], "linux"),
    )
    await turn()
    queue.connect(async () => target.data)
    queue.receive([link(warm, "edit")])
    await seen.until(2)

    expect(target.requests.map((request) => request.body)).toEqual([asked(cold), asked(warm)])
    expect(seen.list.map(([item, result]) => [item, result.status])).toEqual([
      [{ id: cold, action: "create" }, "fulfilled"],
      [{ id: warm, action: "edit" }, "fulfilled"],
    ])
  })

  test("a link waits for the app to hand over the service, then for the service to be ready", async () => {
    const id = crypto.randomUUID()
    const target = service(() => answer(prepared))
    const seen = reports()
    const queue = DashboardLinks.make(seen.report)
    const ready = Promise.withResolvers<SidecarCredentials.Data>()
    const waiting = Promise.withResolvers<void>()

    queue.receive([link(id, "create")])
    await turn()

    expect(seen.list).toEqual([])

    queue.connect(() => {
      waiting.resolve()

      return ready.promise
    })
    await waiting.promise

    expect({ requests: target.requests, reports: seen.list }).toEqual({ requests: [], reports: [] })

    ready.resolve(target.data)
    await seen.until(1)

    expect(target.requests.map((request) => request.body)).toEqual([asked(id)])
    expect(seen.list).toEqual([
      [
        { id, action: "create" },
        { status: "fulfilled", value: prepared },
      ],
    ])
  })

  test("asks loginom.dashboard of the service's own Location with its credential, again while the plugin loads", async () => {
    const [first, second] = [crypto.randomUUID(), crypto.randomUUID()]
    const refused = { code: "LOGINOM_CONFIG_REQUIRED", message: "LOGINOM_CONFIG_REQUIRED" }
    const answers = [unavailable(), unavailable(), answer(refused), answer({ directory: "/data/dashboards/x/work" })]
    const target = service((n) => answers[n] ?? answer(prepared))
    const seen = reports()
    const queue = DashboardLinks.make(seen.report)

    queue.connect(async () => target.data)
    queue.receive([link(first, "edit"), link(second, "create")])
    await seen.until(2)

    expect(target.requests).toEqual(
      [first, first, first, second].map((id) => ({
        method: "POST",
        path: "/api/rpc/loginom.dashboard/prepare",
        search: "",
        authorization: `Basic ${Buffer.from("loginom-ai-agent:secret").toString("base64")}`,
        body: asked(id),
      })),
    )
    // A code is the plugin's answer, not a failure of the bridge; an answer of another shape is not trusted.
    expect(seen.list).toEqual([
      [
        { id: first, action: "edit" },
        { status: "fulfilled", value: refused },
      ],
      [
        { id: second, action: "create" },
        { status: "fulfilled", value: { code: "LOGINOM_REPLY_INVALID", message: "LOGINOM_REPLY_INVALID" } },
      ],
    ])
  })

  test("a failed link is reported once and never asked again; the next one reaches the service it reconnected to", async () => {
    const [first, second, third] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
    const before = service(failed)
    const after = service(() => answer(prepared))
    const endpoints = [before.data, after.data]
    const seen = reports()
    const queue = DashboardLinks.make(seen.report)

    // The service is stopped after the second link, as when the app quits.
    queue.connect(() => {
      const next = endpoints.shift()

      return next ? Promise.resolve(next) : Promise.reject(new Error("Background service is stopped"))
    })
    queue.receive([link(first, "create"), link(second, "create"), link(third, "create")])
    await seen.until(3)

    expect({
      before: before.requests.map((request) => request.body),
      after: after.requests.map((request) => request.body),
    }).toEqual({ before: [asked(first)], after: [asked(second)] })
    expect(seen.list.map(([item, result]) => [item.id, result.status])).toEqual([
      [first, "rejected"],
      [second, "fulfilled"],
      [third, "rejected"],
    ])
    expect(seen.list[0]?.[1]).toMatchObject({ reason: { type: "rpc.internal" } })
    expect(seen.list[2]?.[1]).toMatchObject({ reason: new Error("Background service is stopped") })
  })
})
