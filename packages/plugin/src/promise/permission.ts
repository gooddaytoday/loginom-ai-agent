import type { PermissionApi } from "@opencode/client/promise/api"
import type { Agent } from "@opencode/schema/agent"
import type { Permission } from "@opencode/schema/permission"
import type { Session } from "@opencode/schema/session"
import type { AssertInput } from "../permission.js"
import type { Hooks } from "./registration.js"

export interface PermissionEvaluation {
  readonly sessionID: Session.ID
  readonly agent?: Agent.ID
  readonly action: string
  readonly resources: ReadonlyArray<string>
  readonly metadata?: Record<string, unknown>
  readonly source?: Permission.Source
  effect: Permission.Effect
  message?: string
}

export interface PermissionHooks {
  readonly evaluate: PermissionEvaluation
}

type Reply = PermissionApi["reply"]

export type PermissionDomain = Pick<PermissionApi, "list" | "get"> & {
  readonly hook: Hooks<PermissionHooks>
  readonly reply: (
    input: Parameters<Reply>[0],
    options?: Parameters<Reply>[1] & {
      /** Resolves the history notice after the reply is claimed and before the tool resumes. Overrides `input.notice`. */
      readonly resolveNotice?: () => Promise<string | undefined>
    },
  ) => ReturnType<Reply>
  /**
   * Evaluates the session's permission rules and, when approval is required, prompts the user and
   * waits for the reply. Resolves when allowed. A deny rule or a rejection with feedback rejects with
   * a `Tool.Error` carrying the reason. A plain rejection rejects with an error that ends the current
   * step; rethrow it rather than returning it as tool output.
   */
  readonly assert: (input: typeof AssertInput.Encoded) => Promise<void>
}
