import { expect, test } from "bun:test"
import { profilePaths } from "@loginom-ai-agent/product/cli-profile"
import { profileEnvironment } from "../../src/cli/profile"

const paths = profilePaths("/tmp/isolated-cli-profile")

test("explicit shared credentials survive CLI environment isolation", () => {
  const env = profileEnvironment(paths, { LOGINOM_AI_AGENT_SHARED_AUTH_DIR: "/run/loginom-auth" })
  expect(env).toHaveProperty("LOGINOM_AI_AGENT_SHARED_AUTH_DIR", "/run/loginom-auth")
  expect(env.LOGINOM_AI_AGENT_CLI_ROOT).toBe(paths.root)
})

test("shared store refuses competing inline credentials", () => {
  expect(() =>
    profileEnvironment(paths, {
      LOGINOM_AI_AGENT_SHARED_AUTH_DIR: "/run/loginom-auth",
      LOGINOM_AI_AGENT_AUTH_CONTENT: "private-inline",
    }),
  ).toThrow("SHARED_AUTH_CONTENT_CONFLICT")
})

test("ordinary CLI retains its existing inherited-auth stripping behavior", () => {
  expect(profileEnvironment(paths, { LOGINOM_AI_AGENT_AUTH_CONTENT: "private-inline" })).not.toHaveProperty(
    "LOGINOM_AI_AGENT_AUTH_CONTENT",
  )
})
