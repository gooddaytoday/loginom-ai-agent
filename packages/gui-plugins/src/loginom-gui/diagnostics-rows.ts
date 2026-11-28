import type { DiagnosticsStatus } from "@loginom-ai-agent/loginom-host/diagnostics-rpc"

export function diagnosticsRows(status: DiagnosticsStatus | undefined) {
  return [
    { id: "loginom", ok: status?.loginom === "ready", tab: "loginom" },
    { id: "model", ok: status?.model?.available === true, tab: "models" },
    { id: "help", ok: status?.help === true, tab: "about" },
    { id: "catalog", ok: status?.catalog === "unchecked" ? null : false, tab: "extensions" },
    { id: "policy", ok: !!status && status.policy !== "invalid", tab: undefined },
    { id: "network", ok: !!status?.network && status.policy !== "invalid", tab: "general" },
    { id: "service", ok: !!status, tab: "servers" },
    { id: "journal", ok: null, tab: undefined },
  ] as const
}
