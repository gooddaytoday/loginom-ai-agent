import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { UnauthorizedError } from "../errors"

export class Authorization extends HttpApiMiddleware.Service<Authorization>()("@loginom-ai-agent/HttpApiAuthorization", {
  error: UnauthorizedError,
}) {}
