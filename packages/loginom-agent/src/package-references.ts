import { referencesNotChecked } from "@loginom-ai-agent/loginom-host/package-references-contract"
import type { RpcHandlers } from "@opencode/plugin/promise/rpc"
import type { SessionID } from "@opencode/schema/session-id"
import { ServiceHost } from "./host"
import type { Definition } from "./package-references-contract"

export function packageReferencesHandlers(
  ownsSession: (sessionID: SessionID) => Promise<boolean>,
  host: Pick<typeof ServiceHost.packageFolders, "generation" | "references"> = ServiceHost.packageFolders,
): RpcHandlers<typeof Definition> {
  return {
    async references({ sessionID }, { signal }) {
      signal.throwIfAborted()
      try {
        if (!(await ownsSession(sessionID))) return referencesNotChecked("no_copy")
        signal.throwIfAborted()
        const generation = await host.generation()
        signal.throwIfAborted()
        if (!generation) return referencesNotChecked("not_connected")
        return await host.references({ sessionID, generation }, signal)
      } catch (error) {
        signal.throwIfAborted()
        return referencesNotChecked(error instanceof Error && error.message === "LOGINOM_HOST_NOT_READY"
          ? "not_connected" : "unavailable")
      }
    },
  }
}
