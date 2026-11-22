import { expect, test } from "bun:test"
import { Env } from "../src/env"

test("session environment omits server credentials", () => {
  const previousPassword = process.env.LOGINOM_AI_AGENT_PASSWORD
  const previousLegacyPassword = process.env.LOGINOM_AI_AGENT_SERVER_PASSWORD
  const previousValue = process.env.LOGINOM_AI_AGENT_SESSION_ENV_TEST
  process.env.LOGINOM_AI_AGENT_PASSWORD = "password"
  process.env.LOGINOM_AI_AGENT_SERVER_PASSWORD = "legacy"
  process.env.LOGINOM_AI_AGENT_SESSION_ENV_TEST = "included"

  const environment = Env.session()

  if (previousPassword === undefined) delete process.env.LOGINOM_AI_AGENT_PASSWORD
  else process.env.LOGINOM_AI_AGENT_PASSWORD = previousPassword
  if (previousLegacyPassword === undefined) delete process.env.LOGINOM_AI_AGENT_SERVER_PASSWORD
  else process.env.LOGINOM_AI_AGENT_SERVER_PASSWORD = previousLegacyPassword
  if (previousValue === undefined) delete process.env.LOGINOM_AI_AGENT_SESSION_ENV_TEST
  else process.env.LOGINOM_AI_AGENT_SESSION_ENV_TEST = previousValue

  expect(environment.LOGINOM_AI_AGENT_PASSWORD).toBeUndefined()
  expect(environment.LOGINOM_AI_AGENT_SERVER_PASSWORD).toBeUndefined()
  expect(environment.LOGINOM_AI_AGENT_SESSION_ENV_TEST).toBe("included")
})
