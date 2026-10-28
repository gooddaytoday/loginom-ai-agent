import type { NotFoundError as StorageNotFoundError } from "@/storage/storage"
import type { Session } from "@/session/session"
import { Provider } from "@/provider/provider"
import { Cause, Effect } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import * as ApiError from "../errors"

export function mapStorageNotFound<A, R>(self: Effect.Effect<A, StorageNotFoundError, R>) {
  return self.pipe(Effect.mapError((error) => ApiError.notFound(error.message)))
}

export function mapBusy<A, R>(self: Effect.Effect<A, Session.BusyError, R>) {
  return self.pipe(
    Effect.catchTag("SessionBusyError", (error) =>
      Effect.fail(
        new ApiError.SessionBusyError({
          sessionID: error.sessionID,
          message: `Session is busy: ${error.sessionID}`,
        }),
      ),
    ),
  )
}

// SessionPrompt.getModel dies on ProviderModelNotFoundError so the runner can
// go idle. mapError does not see defects, and an unhandled die leaves the
// in-process session.prompt fetch pending until the CLI harness kills it.
export function mapPromptFailure<A, E, R>(self: Effect.Effect<A, E, R>) {
  return self.pipe(
    Effect.sandbox,
    Effect.mapError((cause) => {
      const err = Cause.squash(cause)
      if (Provider.ModelNotFoundError.isInstance(err)) return ApiError.notFound(err.message)
      return new HttpApiError.BadRequest({})
    }),
  )
}
