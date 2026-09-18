import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import { loadConfig } from "../src/config"
import { agentCommand } from "../src/cli"
import { agentConfigJson, assertAuth, ensureProfile, recoverIfNeeded, releaseStaleWriter, resetProfile } from "../src/profile"
import { EvalFailure } from "../src/fail"

const stateFile = async (view: object) => {
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), "evals-state-")), "view.json")
  await writeFile(file, JSON.stringify(view))
  return file
}

const fakeProfile = async (env: Record<string, string> = {}) => {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "evals-profile-"))
  const config = { ...loadConfig(["--dry-run"], {}), profileDir, dock: { apiKey: "eval-dock-key", baseUrl: "https://x" } }
  const command = agentCommand(config)
  return { config, command: { ...command, env: { ...command.env, ...env } }, profileDir }
}

test("releaseStaleWriter: снимает .writer без процессов, без .writer возвращает false", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-profile-"))
  expect(await releaseStaleWriter(profile)).toBe(false)
  await mkdir(path.join(profile, ".writer"))
  await writeFile(path.join(profile, ".writer", "nonce"), "x")
  expect(await releaseStaleWriter(profile)).toBe(true)
  expect(await stat(path.join(profile, ".writer")).catch(() => undefined)).toBeUndefined()
})

test("releaseStaleWriter: путь с regex-метасимволами снимает .writer", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-profile-a+b(c)-"))
  await mkdir(path.join(profile, ".writer"))
  await writeFile(path.join(profile, ".writer", "nonce"), "x")
  expect(await releaseStaleWriter(profile)).toBe(true)
  expect(await stat(path.join(profile, ".writer")).catch(() => undefined)).toBeUndefined()
})

test("agentConfigJson: разрешает loginom_* и описывает OpenAI-compatible провайдер", () => {
  const base = loadConfig(["--dry-run"], {})
  expect(agentConfigJson(base)).toEqual({ permission: { "loginom_*": "allow" } })
  const withProvider = { ...base, agent: { ...base.agent, provider: { id: "xiaomi", baseUrl: "https://api", apiKey: "k", modelId: "mimo" } } }
  const json = agentConfigJson(withProvider) as { provider: Record<string, { options: { apiKey: string; baseURL: string }; models: Record<string, unknown> }> }
  expect(json.provider.xiaomi?.options).toEqual({ apiKey: "k", baseURL: "https://api" })
  expect(Object.keys(json.provider.xiaomi?.models ?? {})).toEqual(["mimo"])
})

test("ensureProfile: unconfigured при существующем cli-profile.json запускает setup", async () => {
  const file = await stateFile({ state: "unconfigured", hasApiKey: false })
  const { config, command, profileDir } = await fakeProfile({ EVAL_FAKE_STATE_FILE: file })
  await Bun.write(path.join(profileDir, "cli-profile.json"), JSON.stringify({ leftover: true }))
  const before = await Bun.file(path.join(profileDir, "cli-profile.json")).text()
  expect((await ensureProfile(config, command)).fresh).toBe(true)
  expect(await Bun.file(path.join(profileDir, "setup-called")).exists()).toBe(true)
  expect(await Bun.file(path.join(profileDir, "cli-profile.json")).text()).not.toBe(before)
  expect((await Bun.file(file).json()).state).toBe("ready")
  const written = await Bun.file(path.join(profileDir, "config", "loginom-ai-agent.json")).json()
  expect(written.permission).toEqual({ "loginom_*": "allow" })
})

test("ensureProfile: ready с hasApiKey не вызывает setup и пишет config", async () => {
  const { config, command, profileDir } = await fakeProfile({
    EVAL_FAKE_STATE_FILE: await stateFile({ state: "ready", hasApiKey: true }),
  })
  expect((await ensureProfile(config, command)).fresh).toBe(false)
  expect(await Bun.file(path.join(profileDir, "setup-called")).exists()).toBe(false)
  expect(await Bun.file(path.join(profileDir, "config", "loginom-ai-agent.json")).exists()).toBe(true)
})

test("recoverIfNeeded: unconfigured — EvalFailure с подсказкой reset-profile", async () => {
  const { command } = await fakeProfile({
    EVAL_FAKE_STATE_FILE: await stateFile({ state: "unconfigured", hasApiKey: false }),
  })
  await expect(recoverIfNeeded(command, 1)).rejects.toThrow("--reset-profile")
  await expect(recoverIfNeeded(command, 1)).rejects.toThrow("LOGINOM_DOCK_API_KEY")
})

test("assertAuth: без auth.json — EvalFailure с командой providers login; с записью провайдера — ок", async () => {
  const { config, command, profileDir } = await fakeProfile()
  const openai = { ...config, agent: { ...config.agent, model: "openai/gpt-5.6-sol" } }
  await expect(assertAuth(openai, command)).rejects.toThrow("providers login")
  await mkdir(path.join(profileDir, "data"), { recursive: true })
  await writeFile(path.join(profileDir, "data", "auth.json"), JSON.stringify({ openai: { type: "oauth" } }))
  await assertAuth(openai, command)
  const viaProvider = { ...config, agent: { ...config.agent, model: "xiaomi/mimo", provider: { id: "xiaomi", baseUrl: "u", apiKey: "k", modelId: "mimo" } } }
  await assertAuth(viaProvider, command)
})

test("recoverIfNeeded: непустые recoveries → acknowledge → ready", async () => {
  const file = await stateFile({ state: "ready", recoveries: ["op-1"] })
  const { command } = await fakeProfile({ EVAL_FAKE_STATE_FILE: file })
  const result = await recoverIfNeeded(command, 1)
  expect(result.recovered).toBe(true)
  expect(result.view.state).toBe("ready")
  expect((await Bun.file(file).json()).recoveries).toEqual([])
})

test("recoverIfNeeded: ready без recoveries — ничего не делает", async () => {
  const { command } = await fakeProfile({ EVAL_FAKE_STATE_FILE: await stateFile({ state: "ready" }) })
  expect((await recoverIfNeeded(command, 1)).recovered).toBe(false)
})

test("recoverIfNeeded: recoverable-error — EvalFailure с состоянием", async () => {
  const { command } = await fakeProfile({ EVAL_FAKE_STATE_FILE: await stateFile({ state: "recoverable-error", failure: "LOGIN_FAILED" }) })
  await expect(recoverIfNeeded(command, 1)).rejects.toThrow("state=recoverable-error")
})

test("recoverIfNeeded: starting ожидается до ready", async () => {
  const file = await stateFile({ state: "starting" })
  const { command } = await fakeProfile({ EVAL_FAKE_STATE_FILE: file })
  setTimeout(() => void writeFile(file, JSON.stringify({ state: "ready" })), 1_500)
  expect((await recoverIfNeeded(command, 1)).view.state).toBe("ready")
}, 15_000)

test("resetProfile: удаляет каталог профиля", async () => {
  const { config, profileDir } = await fakeProfile()
  await resetProfile(config)
  expect(await stat(profileDir).catch(() => undefined)).toBeUndefined()
})
