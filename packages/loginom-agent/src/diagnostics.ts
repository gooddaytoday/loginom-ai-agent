import { access, constants } from "node:fs/promises"
import { join } from "node:path"
import { policyPath, policyStatus } from "@loginom-ai-agent/loginom-host/admin-policy"
import { cliCredentials } from "@loginom-ai-agent/loginom-host/connection/cli-credentials"
import { administratorReport, profileSecrets } from "@loginom-ai-agent/loginom-host/diagnostics-export"
import { DiagnosticsRpc, type DiagnosticsStatus } from "@loginom-ai-agent/loginom-host/diagnostics-rpc"
import type { Context } from "@opencode/plugin/promise/plugin"
import type { RpcHandlers } from "@opencode/plugin/promise/rpc"
import { Global } from "@opencode/util/global"
import { connectionSettings } from "./connection-settings"
import { ServiceHost } from "./host"

export function diagnostics(
  context: Pick<Context, "model">,
  bundledCatalog: boolean,
  connection = connectionSettings(),
) {
  async function snapshot(check: boolean): Promise<DiagnosticsStatus> {
    const profile = ServiceHost.diagnosticsProfile()
    const policyFile = policyPath()
    const [saved, model, help, policy] = await Promise.all([
      connection.status(),
      context.model.default().then(
        ({ data }) => (data?.enabled ? `${data.providerID}/${data.id}` : null),
        () => null,
      ),
      profile?.resources
        ? access(join(profile.resources, "help", "loginom-help", "data", "README.md"), constants.R_OK).then(
            () => true,
            () => false,
          )
        : false,
      policyStatus(policyFile),
    ])
    const status = saved.ok ? saved.value : undefined
    async function loginom() {
      if (!status?.url || !status.username || status.state === "unconfigured") return "failed"
      if (!check) return status.failed ? "failed" : status.state === "ready" ? "ready" : "unchecked"
      const result = await connection.check({
        revision: status.revision,
        url: status.url,
        username: status.username,
        password: { operation: status.hasPassword ? "preserve" : "empty" },
      })
      return result.ok ? "ready" : "failed"
    }
    return {
      loginom: await loginom(),
      address: status?.url ?? "",
      model,
      help,
      catalog: bundledCatalog,
      policy,
      policyFile,
      network: profile?.network ?? null,
    }
  }
  return {
    status: ({ check }) => snapshot(check),
    async report() {
      const status = await snapshot(false)
      const profile = ServiceHost.diagnosticsProfile()
      const secrets = await profileSecrets({
        loginom: profile?.root,
        data: Global.Path.data,
        codec: profile?.resources
          ? cliCredentials(process.platform, { root: profile.root, resources: profile.resources })
          : undefined,
      })
      return administratorReport({
        ...status,
        address: secrets.status === "ok" ? status.address : "",
        model: secrets.status === "ok" ? status.model : null,
        knownSecrets: secrets.secrets,
      })
    },
  } satisfies RpcHandlers<typeof DiagnosticsRpc>
}
