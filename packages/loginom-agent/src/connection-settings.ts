import { hostError } from "@loginom-ai-agent/loginom-host/errors"
import { Loginom } from "@loginom-ai-agent/loginom-host/loginom"
import {
  Address,
  ConnectionSettingsRpc,
  settingsAddress,
  type Candidate,
  type Issue,
  type Status,
} from "@loginom-ai-agent/loginom-host/settings-rpc"
import type { RpcHandlers } from "@opencode/plugin/promise/rpc"
import { Schema } from "effect"
import { ServiceHost } from "./host"

type Request = typeof ServiceHost.connectionSettings.request

export function connectionSettings(request: Request = ServiceHost.connectionSettings.request) {
  const readStatus = (reply: unknown): Status => {
    const view = Schema.decodeUnknownSync(Loginom.View)(reply)
    return {
      revision: view.revision,
      generation: view.generation,
      url: settingsAddress(view.url),
      username: view.username,
      folder: view.folder,
      hasPassword: view.hasPassword,
      state: view.state,
      failed: !!view.failure || view.state === "recoverable-error",
    }
  }
  const status = async (method: "connection.status" | "connection.settings.save", input: unknown) => {
    try {
      const value = readStatus(await request(method, input))
      return { ok: true as const, value }
    } catch (error) {
      return { ok: false as const, issue: issue(error, method === "connection.status" ? "unavailable" : "saveFailed") }
    }
  }
  return {
    status: () => status("connection.status", {}),
    async check(candidate: Candidate, context: { signal: AbortSignal }) {
      try {
        if (!Schema.is(Address)(candidate.url)) return { ok: false, issue: "invalidAddress" }
        const { validationId, expiresAt } = Schema.decodeUnknownSync(Loginom.Validation)(
          await request("connection.settings.check", candidate, 240_000, context.signal),
        )
        return { ok: true, value: { validationId, expiresAt } }
      } catch (error) {
        return { ok: false, issue: issue(error, "checkFailed") }
      }
    },
    save: (input: typeof Loginom.Save.Type) => status("connection.settings.save", input),
  } satisfies RpcHandlers<typeof ConnectionSettingsRpc>
}

function issue(error: unknown, fallback: Issue): Issue {
  switch (hostError(error)) {
    case "LOGINOM_HOST_NOT_READY":
    case "LOGINOM_HOST_CLOSED":
      return "unavailable"
    case "LOGINOM_URL_INVALID":
      return "invalidAddress"
    case "LOGINOM_USERNAME_INVALID":
    case "LOGINOM_ACCOUNT_MISMATCH":
      return "invalidUsername"
    case "LOGINOM_PASSWORD_REQUIRED":
      return "passwordRequired"
    case "LOGINOM_KNOWLEDGE_AUTH_FAILED":
      return "knowledgeAuthFailed"
    case "LOGINOM_LOGIN_REJECTED":
      return "credentialsRejected"
    case "LOGINOM_LOGOUT_UNCONFIRMED":
      return "logoutUnconfirmed"
    case "LOGINOM_LOGIN_UNAVAILABLE":
      return "loginUnavailable"
    case "LOGINOM_REVISION_CONFLICT":
    case "LOGINOM_APPLICATION_PENDING":
      return "changed"
    case "LOGINOM_VALIDATION_EXPIRED":
      return "expired"
    default:
      return fallback
  }
}
