import {
  ClientError,
  isSessionNotFoundError,
  type SessionApi,
  type SessionInfo,
  type SessionNotFoundError,
} from "@opencode/client/promise"
import { Predicate } from "effect"

type SessionCreateOutcome = { type: "created"; session: SessionInfo } | { type: "missing" } | { type: "unknown" }

export async function failedSessionCreate(
  api: Pick<SessionApi, "get">,
  sessionID: string,
  error: ClientError | SessionNotFoundError | undefined,
): Promise<SessionCreateOutcome> {
  const cause = error instanceof ClientError && error.reason === "UnexpectedStatus" ? error.cause : undefined
  const status = Predicate.isObject(cause) && "status" in cause ? cause.status : undefined

  const completed =
    isSessionNotFoundError(error) ||
    status === 500 ||
    (Predicate.isNumber(status) && status >= 400 && status < 500 && status !== 408)

  return api.get({ sessionID }, { signal: AbortSignal.timeout(5_000) }).then(
    (session) => ({ type: "created", session }),
    (lookupError) =>
      completed && isSessionNotFoundError(lookupError) && lookupError.sessionID === sessionID
        ? { type: "missing" }
        : { type: "unknown" },
  )
}
