// Loginom AI Agent (B4.15, decisions В-85 and В-97 п. 9): the Desktop part of dashboards. 0.4 queued the product's links
// for its window (`v0.4.0:packages/desktop/src/main/deep-links.ts`), and the window had main prepare a dashboard's folder
// with main's own Host (`dashboard-target.ts`). The Host is the service's now, and its product plugin prepares the folder
// (`loginom.dashboard`, B2.9h), so main asks it as soon as a link arrives. Showing the dashboard and its chat is the
// window's (stage C); until then the answer goes to the Desktop log.
export * as DashboardLinks from "./dashboard-links"

import { Product } from "@loginom-ai-agent/product"
import { Option, Schema } from "effect"
import { SidecarCredentials } from "../service/sidecar-credentials"

export type Link = { readonly id: string; readonly action: "create" | "edit" }

export type Queue = ReturnType<typeof make>

/** What `loginom.dashboard.prepare` answers (B2.9h): the dashboard's folder, or the code that stopped it. */
const Reply = Schema.Union([
  Schema.Struct({ code: Schema.String, message: Schema.String }),
  Schema.Struct({
    directory: Schema.String,
    nodeName: Schema.String,
    action: Schema.Literals(["create", "edit"]),
    fresh: Schema.Boolean,
    notice: Schema.optional(
      Schema.Struct({
        kind: Schema.String,
        latest: Schema.optional(Schema.String),
        current: Schema.optional(Schema.String),
        error: Schema.optional(Schema.String),
      }),
    ),
  }),
])

export type Reply = typeof Reply.Type

const decodeReply = Schema.decodeUnknownOption(Reply)

/**
 * Dashboard links wait until `connect` hands over the service's connection, then until the service is ready, and the
 * plugin prepares each link once: Studio gives a snapshot once, so a link is never asked again after a failure. Links go
 * one at a time, in the order they came, as the plugin prepares them anyway (`updates` in `dashboard/src/agent/folder.ts`).
 */
export function make(report: (link: Link, result: PromiseSettledResult<Reply>) => void) {
  const service = Promise.withResolvers<() => Promise<SidecarCredentials.Data>>()
  const queue = { tail: Promise.resolve() }

  return {
    receive(urls: readonly string[]) {
      urls
        .flatMap((url) => parse(url) ?? [])
        .forEach((link) => {
          queue.tail = queue.tail.then(() =>
            Promise.allSettled([service.promise.then((connection) => prepare(link, connection))]).then(([result]) =>
              report(link, result),
            ),
          )
        })
    },
    connect: (connection: () => Promise<SidecarCredentials.Data>) => service.resolve(connection),
  }
}

/**
 * A dashboard's link as the shell of a published dashboard builds it (`packages/dashboard/src/shell`), read as 0.4's
 * window read it (`v0.4.0:packages/app/src/pages/layout/deep-links.ts`): `loginom-ai-agent://dashboard?id=<uuid>&action=`
 * `create` or `edit`, and nothing else.
 */
function parse(input: string): Link | undefined {
  if (!input.startsWith(`${Product.scheme}://`) || !URL.canParse(input)) return

  const url = new URL(input)

  if (url.host !== "dashboard" || url.pathname || url.username || url.password || url.hash) return

  if (url.searchParams.size !== 2) return

  const id = url.searchParams.get("id")
  const action = url.searchParams.get("action")

  if (!id || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) return

  if (action !== "create" && action !== "edit") return

  return { id, action }
}

// No Location: the service's own, which Desktop's plugin host already lists (`plugin/host.ts`). The plugin registers its
// RPCs once the Location's plugins have loaded, and the service does not wait for them, so `rpc.unavailable` is asked
// again for a minute, as the CLI asks (`packages/cli/src/run/product.ts`). Desktop opens a new dashboard without the
// publication check, as 0.4's did (`defer`, B2.9h).
async function prepare(link: Link, connection: () => Promise<SidecarCredentials.Data>) {
  const { OpenCode, isRpcError } = await import("@opencode/client")
  // A reconnect moves the service, so each link reads its endpoint when the service is ready for it.
  const data = await connection()
  const authorization = SidecarCredentials.authorization(data, data.url)
  const client = OpenCode.make({ baseUrl: data.url, headers: authorization ? { authorization } : {} })
  const deadline = Date.now() + 60_000

  const ask = (): Promise<Reply> =>
    client.rpc.call({ rpcID: "loginom.dashboard", method: "prepare", input: { id: link.id, defer: true } }).then(
      (reply) =>
        Option.getOrElse(decodeReply(reply.output), () => ({
          code: "LOGINOM_REPLY_INVALID",
          message: "LOGINOM_REPLY_INVALID",
        })),
      async (failure) => {
        if (!isRpcError(failure) || failure.type !== "rpc.unavailable" || Date.now() >= deadline) throw failure

        await new Promise((resolve) => setTimeout(resolve, 100))

        return ask()
      },
    )

  return ask()
}
