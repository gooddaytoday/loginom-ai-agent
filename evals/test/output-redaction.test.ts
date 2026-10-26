import { expect, test } from "bun:test"
import { redactKnownSecrets } from "../src/output-redaction"

test("credential masking keeps deeply nested diagnostics serializable without losing top-level measurements", () => {
  const secret = "deep-output-private-canary"
  const nested = JSON.parse('{"nested":'.repeat(20000) + JSON.stringify(secret) + "}".repeat(20000))
  const input = { payload: nested, message: secret, cost: 0.5, tokens: { input: 11, output: 7 } }
  const result = redactKnownSecrets(input, [secret])
  expect(result.cost).toBe(0.5)
  expect(result.tokens).toEqual(input.tokens)
  expect(JSON.stringify(result)).not.toContain(secret)
  expect(JSON.parse(JSON.stringify(result)).message).toBe("[redacted]")
})
