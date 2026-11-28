import { Definition } from "@loginom-ai-agent/loginom-agent/package-list"
import type { Package as ServerPackage } from "@loginom-ai-agent/loginom-host/package-folder"
import { UploadRpc } from "@loginom-ai-agent/loginom-host/package-upload"
import { ConnectionSettingsRpc } from "@loginom-ai-agent/loginom-host/settings-rpc"
import type { PackageConnectionIdentity } from "./contract"
import type { Package, Listing } from "./package-model"
import { loginomLocation, type LoginomServer } from "./server"

function toPackage(item: typeof ServerPackage.Type, folder: string): Package {
  return { name: item.name, path: item.path, modified: item.modifiedAt, size: item.sizeBytes, folder }
}

export function samePackageConnection(left: PackageConnectionIdentity, right: PackageConnectionIdentity) {
  return left.server === right.server && left.key === right.key && left.generation === right.generation
}

export async function packageConnection(server: LoginomServer, signal: AbortSignal) {
  const location = await loginomLocation(server, signal)
  const { client } = server

  const status = async (signal: AbortSignal) => {
    const result = await client.rpc(ConnectionSettingsRpc).status({}, { location, signal })

    if (!result.ok || result.value.failed) throw Error("Loginom status unavailable")

    return result.value
  }

  const connection = await status(signal)

  if (connection.state !== "ready") return
  const { generation } = connection

  const identify = (value: typeof connection): PackageConnectionIdentity => ({
    server: server.id,
    key: JSON.stringify([value.url, value.username]),
    generation: value.generation,
  })

  const identity = identify(connection)
  const rpc = client.rpc(Definition)

  return {
    identity,
    verify: async (signal: AbortSignal) => {
      const current = await status(signal)

      return current.state === "ready" && samePackageConnection(identify(current), identity)
    },
    list: async (folder: string, signal: AbortSignal): Promise<Listing> => {
      const result = await rpc.list({ folder, generation }, { location, signal })

      return {
        folders: result.entries.filter((item) => item.kind === "folder"),
        packages: result.entries
          .filter((item) => item.kind === "package")
          .map((item) => toPackage(item, result.folder)),
        slow: result.slow,
      }
    },
    search: async (folder: string, text: string, cursor: string | undefined, signal: AbortSignal) => {
      const page = await rpc.search({ folder, text, recursive: true, cursor, generation }, { location, signal })

      return { cursor: page.cursor, packages: page.entries.map((item) => toPackage(item, page.folder)), slow: page.slow }
    },
    upload: async (file: File, signal: AbortSignal) => {
      const content = new Uint8Array(await file.arrayBuffer()).toBase64()

      const entry = await client
        .rpc(UploadRpc)
        .upload({ name: file.name, content, generation }, { location, signal })

      return toPackage(entry, "/user")
    },
  }
}

export type Connection = NonNullable<Awaited<ReturnType<typeof packageConnection>>>
