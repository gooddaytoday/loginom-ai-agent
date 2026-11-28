import { Definition } from "@loginom-ai-agent/loginom-agent/package-list"
import type { Package as ServerPackage } from "@loginom-ai-agent/loginom-host/package-folder"
import { UploadRpc } from "@loginom-ai-agent/loginom-host/package-upload"
import { ConnectionSettingsRpc } from "@loginom-ai-agent/loginom-host/settings-rpc"
import type { Package, Listing } from "./package-model"
import { loginomLocation, type LoginomServer } from "./server"

function toPackage(item: typeof ServerPackage.Type, folder: string): Package {
  return { name: item.name, path: item.path, modified: item.modifiedAt, size: item.sizeBytes, folder }
}

export async function packageConnection(server: LoginomServer, signal: AbortSignal) {
  const location = await loginomLocation(server, signal)
  const { client } = server
  const result = await client.rpc(ConnectionSettingsRpc).status({}, { location, signal })

  if (!result.ok || result.value.failed) throw Error("Loginom status unavailable")

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
