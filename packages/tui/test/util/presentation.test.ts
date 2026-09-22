import { expect, test } from "bun:test"
import stripAnsi from "strip-ansi"
import { sessionEpilogue } from "../../src/util/presentation"

test("formats session continuation summary", () => {
  const epilogue = stripAnsi(sessionEpilogue({ title: "A session", sessionID: "ses_123" }))
  expect(epilogue).toContain("A session")
  expect(epilogue).toContain("Loginom AI")
  expect(epilogue).toContain("loginom-ai-agent-cli -s ses_123")
  expect(epilogue).not.toContain("opencode -s")
})
