import { expect, test } from "bun:test"
import { SessionID } from "../../../src/session/schema"
import { InvalidSessionError, validateSession } from "../../../src/cli/tui/validate-session"

test("invalid session syntax is distinct from an API failure and never reaches the API", async () => {
  const requests: string[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      requests.push(request.url)
      return Response.json({ message: "Session not found" }, { status: 404 })
    },
  })
  try {
    const url = `http://127.0.0.1:${server.port}`
    await expect(validateSession({ url, sessionID: "not-a-session" })).rejects.toBeInstanceOf(InvalidSessionError)
    expect(requests).toEqual([])
    const failure = await validateSession({ url, sessionID: SessionID.make("ses_missing") }).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure).toBeDefined()
    expect(failure).not.toBeInstanceOf(InvalidSessionError)
    expect(requests).toHaveLength(1)
  } finally {
    server.stop(true)
  }
})
