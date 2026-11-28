import { Definition } from "@loginom-ai-agent/loginom-agent/package-list"
import type { Package as ServerPackage } from "@loginom-ai-agent/loginom-host/package-folder"
import * as Settings from "@loginom-ai-agent/loginom-host/settings-rpc"
import { UploadRpc } from "@loginom-ai-agent/loginom-host/package-upload"
import type { Context } from "@opencode/plugin/gui"
import type { Package, Listing } from "./package-model"

function toPackage(item: typeof ServerPackage.Type, folder: string): Package {
  return { name: item.name, path: item.path, modified: item.modifiedAt, size: item.sizeBytes, folder }
}

export function loginomServer(ctx: Context) {
  const servers = ctx.servers.list().flatMap((id) => ctx.servers.get(id) ?? [])

  if (ctx.desktop) return servers.find((server) => server.builtin)
  const serving = ctx.servers.get(location.origin)

  if (serving) return serving
  const local = servers.filter((server) => server.local)

  if (local.length === 1) return local.at(0)
}

export async function packageConnection(server: NonNullable<ReturnType<typeof loginomServer>>, signal: AbortSignal) {
  const directory = server.data.location.default().directory || (await server.client.location.get({}, { signal })).directory

  if (!directory) throw Error("Loginom location unavailable")
  const location = { directory }
  const { client } = server
  const result = await client.rpc(Settings.Definition).status({}, { location, signal })

  if (!result.ok || (result.value.state === "ready" && result.value.failed)) throw Error("Loginom status unavailable")

  if (result.value.state !== "ready") return
  const rpc = client.rpc(Definition)

  return {
    key: JSON.stringify([result.value.url, result.value.username]),
    list: async (folder: string, signal: AbortSignal): Promise<Listing> => {
      const result = await rpc.list({ folder }, { location, signal })

      return {
        folders: result.entries.filter((item) => item.kind === "folder"),
        packages: result.entries
          .filter((item) => item.kind === "package")
          .map((item) => toPackage(item, result.folder)),
        slow: result.slow,
      }
    },
    search: async (folder: string, text: string, cursor: string | undefined, signal: AbortSignal) => {
      const page = await rpc.search({ folder, text, recursive: true, cursor }, { location, signal })

      return { cursor: page.cursor, packages: page.entries.map((item) => toPackage(item, page.folder)), slow: page.slow }
    },
    upload: async (file: File, signal: AbortSignal) => {
      const content = new Uint8Array(await file.arrayBuffer()).toBase64()

      const entry = await client
        .rpc(UploadRpc)
        .upload({ name: file.name, content, generation: result.value.generation }, { location, signal })

      return toPackage(entry, "/user")
    },
  }
}

export type Connection = NonNullable<Awaited<ReturnType<typeof packageConnection>>>
