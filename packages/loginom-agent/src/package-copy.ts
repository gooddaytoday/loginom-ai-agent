import {
  CopyBusy, CopyEmpty, CopyExists, CopyReplacement, CopyReply, CopyRestore, CopyVersion,
  type CopyRequest,
} from "@loginom-ai-agent/loginom-host/package-copy"
import { PackagePath } from "@loginom-ai-agent/loginom-host/package-access"
import type { Plugin } from "@opencode/plugin"
import type { RpcCallContext } from "@opencode/plugin/promise/rpc"
import { SessionID } from "@opencode/schema/session-id"
import { Option, Schema } from "effect"
import { ServiceHost } from "./host"
import { visiblePackageAccess } from "./package-access"

const standard = Schema.toStandardSchemaV1
const empty = standard(CopyEmpty)
const session = standard(Schema.Struct({ sessionID: SessionID }))
const errors = {
  package_busy: standard(CopyBusy),
  path_exists: standard(CopyExists),
  access_denied: empty,
  copy_missing: empty,
  not_applied: empty,
  package_too_large: empty,
  state_check_required: empty,
}
const rpc = {
  id: "loginom.package-copy",
  methods: {
    "save-version": { input: session, output: standard(CopyVersion), errors },
    "undo-save": { input: standard(Schema.Struct({ sessionID: SessionID, path: PackagePath })), output: empty, errors },
    "replace-original": {
      input: standard(Schema.Struct({ sessionID: SessionID, confirmed: Schema.Literal(true) })),
      output: standard(CopyReplacement),
      errors,
    },
    "restore-previous": {
      input: standard(Schema.Struct({ sessionID: SessionID, backupPath: PackagePath })),
      output: standard(CopyRestore),
      errors,
    },
    discard: { input: session, output: empty, errors },
  },
  events: {},
} as const

const unknownState = "Нужно проверить состояние пакета перед повтором операции."

export function registerPackageCopy(
  ctx: Plugin.Context,
  permitted: (sessionID: SessionID) => Promise<boolean>,
) {
  async function execute<S extends typeof CopyVersion | typeof CopyEmpty | typeof CopyReplacement | typeof CopyRestore>(
    sessionID: SessionID,
    request: CopyRequest,
    schema: S,
    call: RpcCallContext<typeof rpc.methods.discard>,
  ) {
    await ctx.session.get({ sessionID })
    if (!await permitted(sessionID)) return call.error("access_denied", "Нет прав для изменения пакета.", {})
    if (call.signal.aborted) return call.error("not_applied", "Операция отменена до запуска.", {})
    const lease = await ServiceHost.acquire(sessionID).catch(() => undefined)
    if (!lease) return call.error("not_applied", "Окно Loginom недоступно. Операция не запущена.", {})
    const result = await lease.packageCopy(request).then(Schema.decodeUnknownOption(CopyReply))
      .catch(() => Option.none())
      .finally(() => ServiceHost.release(lease))
    if (Option.isNone(result)) return call.error("state_check_required", unknownState, {})
    if ("output" in result.value) {
      const output = Schema.decodeUnknownOption(schema)(result.value.output)
      return Option.isSome(output) ? output.value : call.error("state_check_required", unknownState, {})
    }
    const { code, data } = result.value.failure
    switch (code) {
      case "package_busy": {
        const access = await visiblePackageAccess(data, (id) => ctx.session.get({ sessionID: id }))
        const visible = Schema.decodeUnknownOption(CopyBusy)(access)
        return call.error("package_busy", "Пакет занят.", Option.getOrElse(visible, () => ({
          packagePath: data.packagePath,
          kind: "read_only" as const,
          lockMarker: "unknown" as const,
        })))
      }
      case "path_exists": return call.error(code, "Пакет с таким именем уже существует.", data)
      case "access_denied": return call.error(code, "Нет прав для изменения пакета.", {})
      case "copy_missing": return call.error(code, "Копия пакета не найдена.", {})
      case "not_applied": return call.error(code, "Операция не применена. Проверьте доступность пакета и его текущую версию.", {})
      case "package_too_large": return call.error(code, "Копирование поддерживает пакеты размером до 32 МиБ.", {})
      case "state_check_required": return call.error(code, unknownState, {})
    }
  }
  return ctx.rpc.register(rpc, {
    "save-version": ({ sessionID }, call) => execute(sessionID, { action: "save-version" }, CopyVersion, call),
    "undo-save": ({ sessionID, path }, call) => execute(sessionID, { action: "undo-save", path }, CopyEmpty, call),
    "replace-original": ({ sessionID, confirmed }, call) => execute(sessionID, {
      action: "replace-original", confirmed,
    }, CopyReplacement, call),
    "restore-previous": ({ sessionID, backupPath }, call) => execute(sessionID, {
      action: "restore-previous", backupPath,
    }, CopyRestore, call),
    discard: ({ sessionID }, call) => execute(sessionID, { action: "discard" }, CopyEmpty, call),
  })
}
