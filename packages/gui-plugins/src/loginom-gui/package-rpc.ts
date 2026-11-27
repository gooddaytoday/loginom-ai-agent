import { Definition as ListRpc } from "@loginom-ai-agent/loginom-agent/package-list"
import type { Package as ServerPackage } from "@loginom-ai-agent/loginom-host/package-folder"
import { Definition } from "@loginom-ai-agent/loginom-host/settings-rpc"
import { UploadRpc } from "@loginom-ai-agent/loginom-host/package-upload"
import type { Context } from "@opencode/plugin/gui"
import type { Package, Listing } from "./package-model"

function toPackage(item: typeof ServerPackage.Type, folder: string): Package {
  return { name: item.name, path: item.path, modified: item.modifiedAt, size: item.sizeBytes, folder }
}

export function loginomClient(ctx: Context) {
  const servers = ctx.servers.list().flatMap((id) => ctx.servers.get(id) ?? [])
  if (ctx.desktop) return servers.find((server) => server.builtin)?.client
  const serving = ctx.servers.get(location.origin)
  if (serving) return serving.client
  const local = servers.filter((server) => server.local)
  if (local.length === 1) return local.at(0)?.client
}

export async function packageConnection(client: NonNullable<ReturnType<typeof loginomClient>>, signal: AbortSignal) {
  const result = await client.rpc(Definition).status({}, { signal })
  if (!result.ok || result.value.state !== "ready" || result.value.failed) return
  const rpc = client.rpc(ListRpc)
  return {
    key: JSON.stringify([result.value.url, result.value.username]),
    list: async (folder: string, signal: AbortSignal): Promise<Listing> => {
      const result = await rpc.list({ folder }, { signal })
      return {
        folders: result.entries.filter((item) => item.kind === "folder"),
        packages: result.entries
          .filter((item) => item.kind === "package")
          .map((item) => toPackage(item, result.folder)),
        slow: result.slow,
      }
    },
    search: async (folder: string, text: string, signal: AbortSignal): Promise<Listing> => {
      const packages: Package[] = []
      let cursor: string | undefined
      let slow = false
      do {
        signal.throwIfAborted()
        const page = await rpc.search({ folder, text, recursive: true, cursor }, { signal })
        packages.push(...page.entries.map((item) => toPackage(item, page.folder)))
        slow ||= page.slow
        cursor = page.cursor
      } while (cursor)
      return { folders: [], packages, slow }
    },
    upload: async (file: File, signal: AbortSignal) => {
      const content = new Uint8Array(await file.arrayBuffer()).toBase64()
      const entry = await client
        .rpc(UploadRpc)
        .upload({ name: file.name, content, generation: result.value.generation }, { signal })
      return toPackage(entry, "/user")
    },
  }
}

export type Connection = NonNullable<Awaited<ReturnType<typeof packageConnection>>>
