import { expect, test } from "bun:test"
import path from "node:path"
import { chmod, mkdtemp, mkdir, symlink, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import { evalsRoot, loadConfig } from "../src/config"
import { parseArtifactSource } from "../src/artifact"
import { EvalFailure } from "../src/fail"
import { agentInfo, checkFreeSpace, checkStorage, checkSandbox, dockSkillRevision, preflight, verifyAdminRuntime } from "../src/preflight"
import { probeJudgeEnvironment } from "./helpers/judge-probe"

const fakeJudge = `bun ${path.join(evalsRoot, "fixtures", "fake-codex.ts")}`

test("preflight: parent auth cannot admit an empty explicit judge home", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-home-"))
  try {
    const desktop = path.join(root, "parent-home")
    const judge = path.join(root, "judge-home")
    const binary = path.join(root, "codex")
    const observed = path.join(root, "version-home")
    await Promise.all([desktop, judge].map(dir => mkdir(dir, { mode: 0o700 })))
    await writeFile(path.join(desktop, "auth.json"), "{}", { mode: 0o600 })
    await writeFile(binary, '#!/bin/sh\nprintf "%s" "$CODEX_HOME" > "$PROBE_JUDGE_HOME_FILE"\nprintf "fake-codex 0.0.0\\n"\n', { mode: 0o700 })
    const child = Bun.spawn([process.execPath, "-e", `
      import { loadConfig } from ${JSON.stringify(path.join(evalsRoot, "src/config.ts"))};
      import { preflight } from ${JSON.stringify(path.join(evalsRoot, "src/preflight.ts"))};
      import { parseArtifactSource } from ${JSON.stringify(path.join(evalsRoot, "src/artifact.ts"))};
      const config = loadConfig(["--judge-only", "fixture"], { JUDGE_MODEL: "fake" });
      config.judge = { ...config.judge, command: [${JSON.stringify(binary)}], env: { CODEX_HOME: ${JSON.stringify(judge)} } };
      try { await preflight(config, parseArtifactSource("docker", config.loginom)); console.log(JSON.stringify({ admitted: true })); }
      catch (error) { console.log(JSON.stringify({ admitted: false, error: error.message })); }
    `], { env: { ...process.env, CODEX_HOME: desktop, PROBE_JUDGE_HOME_FILE: observed }, stdout: "pipe", stderr: "pipe" })
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
    expect(JSON.parse(stdout)).toEqual({ admitted: false, error: `Нет входа Codex: отсутствует ${path.join(judge, "auth.json")}. Выполните: codex login` })
    expect(await Bun.file(observed).text()).toBe(judge)
    expect(await Bun.file(path.join(desktop, "auth.json")).text()).toBe("{}")
  } finally { await rm(root, { recursive: true, force: true }) }
})

async function runtimeFixture(directory = os.tmpdir()) {
  const root = await mkdtemp(path.join(directory, "evals-admin-runtime-"))
  const executable = Buffer.alloc(64)
  executable.set([0x7f, 0x45, 0x4c, 0x46, 2, 1])
  executable.writeUInt16LE(62, 18)
  const payload = [
    { path: "bin/loginom-ai-agent-cli", content: executable, mode: 0o755 },
    { path: "resources/loginom/bin/node", content: executable, mode: 0o755 },
    { path: "resources/loginom/browsers/chrome", content: executable, mode: 0o755 },
    { path: "resources/loginom/runtime/client/package.json", content: "{}", mode: 0o644 },
    { path: "resources/loginom/runtime/client/node_modules/playwright-core/package.json", content: '{"main":"index.js"}', mode: 0o644 },
    { path: "resources/loginom/runtime/client/node_modules/playwright-core/index.js", content: "module.exports={}", mode: 0o644 },
  ]
  const resource = { protocol: 1, target: "linux-x64", node: "bin/node", browser: "browsers/chrome",
    nodeSha256: new Bun.CryptoHasher("sha256").update(executable).digest("hex"), browserSha256: new Bun.CryptoHasher("sha256").update(executable).digest("hex"),
    files: payload.filter(file => file.path.startsWith("resources/loginom/")).map(file => ({ path: file.path.slice("resources/loginom/".length),
      sha256: new Bun.CryptoHasher("sha256").update(file.content).digest("hex") })) }
  const files = [...payload, { path: "resources/loginom/resource-manifest.json", content: JSON.stringify(resource), mode: 0o644 }]
  await Promise.all(files.map(async file => {
    await mkdir(path.dirname(path.join(root, file.path)), { recursive: true })
    await writeFile(path.join(root, file.path), file.content)
    await chmod(path.join(root, file.path), file.mode)
  }))
  const manifest = { format: "loginom-cli-artifact-v1", metadata: { platform: "linux", arch: "x64", sourceCommit: "a".repeat(40), sourceTreeSha256: "b".repeat(64) },
    files: files.map(file => ({ path: file.path, sha256: new Bun.CryptoHasher("sha256").update(file.content).digest("hex"), mode: file.mode })) }
  await writeFile(path.join(root, "cli-manifest.json"), JSON.stringify(manifest))
  return { root, manifest, resource, binary: path.join(root, "bin/loginom-ai-agent-cli") }
}

test("admin runtime: selects only manifest-verified installed Node, browser and client paths", async () => {
  const item = await runtimeFixture()
  try {
    const runtime = await verifyAdminRuntime(item.binary)
    expect(runtime).toMatchObject({ installation: item.root, resources: `${item.root}/resources/loginom`,
      node: `${item.root}/resources/loginom/bin/node`, browser: `${item.root}/resources/loginom/browsers/chrome`,
      clientPackage: `${item.root}/resources/loginom/runtime/client/package.json` })
    expect(runtime.manifestHash).toMatch(/^[a-f0-9]{64}$/)
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("admin runtime: refuses a changed dependency before executing any binary", async () => {
  const item = await runtimeFixture()
  try {
    await writeFile(`${item.root}/resources/loginom/runtime/client/node_modules/playwright-core/index.js`, "throw Error('must not execute')")
    await expect(verifyAdminRuntime(item.binary)).rejects.toThrow("ADMIN_RUNTIME_HASH")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("admin runtime: manifest paths and symlinks cannot escape the installed payload", async () => {
  const item = await runtimeFixture()
  try {
    await writeFile(`${item.root}/outside`, "outside")
    const entry = item.manifest.files.find(file => file.path.endsWith("playwright-core/index.js"))!
    await rm(path.join(item.root, entry.path))
    await symlink(path.join(item.root, "outside"), path.join(item.root, entry.path))
    await writeFile(`${item.root}/cli-manifest.json`, JSON.stringify({ ...item.manifest,
      files: item.manifest.files.map(file => file === entry ? { ...file, mode: 0o777, link: `${item.root}/outside`, sha256: new Bun.CryptoHasher("sha256").update("outside").digest("hex") } : file) }))
    // The target is outside the claimed dependency subtree but still in installation:
    // undeclared target must be rejected by the full inventory check.
    await expect(verifyAdminRuntime(item.binary)).rejects.toThrow("ADMIN_RUNTIME_INVENTORY")
    await writeFile(`${item.root}/cli-manifest.json`, JSON.stringify({ ...item.manifest,
      files: item.manifest.files.map(file => file === entry ? { ...file, path: "../outside" } : file) }))
    await expect(verifyAdminRuntime(item.binary)).rejects.toThrow("ADMIN_RUNTIME_PATH")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("admin runtime: executable and manifest modes are verified before launch", async () => {
  const item = await runtimeFixture()
  try {
    await chmod(`${item.root}/resources/loginom/bin/node`, 0o644)
    await expect(verifyAdminRuntime(item.binary)).rejects.toThrow("ADMIN_RUNTIME_MODE")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("admin runtime: malformed or mismatched manifest targets fail with safe codes", async () => {
  const item = await runtimeFixture()
  try {
    await writeFile(`${item.root}/cli-manifest.json`, '{"password":"secret-canary"')
    await expect(verifyAdminRuntime(item.binary)).rejects.toThrow("ADMIN_RUNTIME_INVALID")
    await writeFile(`${item.root}/cli-manifest.json`, JSON.stringify({ ...item.manifest, metadata: { ...item.manifest.metadata, platform: "win32" } }))
    await expect(verifyAdminRuntime(item.binary)).rejects.toThrow("ADMIN_RUNTIME_TARGET")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("admin runtime: resource claims must match the complete CLI payload", async () => {
  const item = await runtimeFixture()
  try {
    const resource = { ...item.resource, nodeSha256: "0".repeat(64) }
    await writeFile(`${item.root}/resources/loginom/resource-manifest.json`, JSON.stringify(resource))
    await writeFile(`${item.root}/cli-manifest.json`, JSON.stringify({ ...item.manifest,
      files: item.manifest.files.map(file => file.path.endsWith("resource-manifest.json") ? { ...file,
        sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(resource)).digest("hex") } : file) }))
    await expect(verifyAdminRuntime(item.binary)).rejects.toThrow("ADMIN_RUNTIME_RESOURCE")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("admin runtime: a declared executable with the wrong ELF target is refused", async () => {
  const item = await runtimeFixture()
  try {
    const header = Buffer.alloc(64)
    header.set([0x7f, 0x45, 0x4c, 0x46, 2, 1])
    header.writeUInt16LE(183, 18)
    await writeFile(`${item.root}/bin/loginom-ai-agent-cli`, header)
    await writeFile(`${item.root}/cli-manifest.json`, JSON.stringify({ ...item.manifest,
      files: item.manifest.files.map(file => file.path === "bin/loginom-ai-agent-cli" ? { ...file,
        sha256: new Bun.CryptoHasher("sha256").update(header).digest("hex") } : file) }))
    await expect(verifyAdminRuntime(item.binary)).rejects.toThrow("ADMIN_RUNTIME_EXECUTABLE")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("admin runtime: a symlink with a matching hash cannot point outside installation", async () => {
  const item = await runtimeFixture()
  const external = await mkdtemp(path.join(os.tmpdir(), "evals-admin-external-"))
  try {
    const target = `${external}/module.js`
    const entry = item.manifest.files.find(file => file.path.endsWith("playwright-core/index.js"))!
    await writeFile(target, "module.exports={}")
    await rm(path.join(item.root, entry.path))
    await symlink(target, path.join(item.root, entry.path))
    await writeFile(`${item.root}/cli-manifest.json`, JSON.stringify({ ...item.manifest,
      files: item.manifest.files.map(file => file === entry ? { ...file, link: target, mode: 0o777 } : file) }))
    await expect(verifyAdminRuntime(item.binary)).rejects.toThrow("ADMIN_RUNTIME_PATH")
  } finally { await Promise.all([item.root, external].map(root => rm(root, { recursive: true, force: true }))) }
})

test("admin runtime: manifest paths cannot select a checkout bundle", async () => {
  const root = await mkdtemp(path.join(evalsRoot, ".admin-runtime-test-"))
  try {
    const item = await runtimeFixture(root)
    await expect(verifyAdminRuntime(item.binary)).rejects.toThrow("ADMIN_RUNTIME_PATH")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("preflight: live source отклонён до обращения к Loginom с инструкцией binary", async () => {
  const config = loadConfig(["--skip-judge"], { LOGINOM_DOCK_API_KEY: "fixture", EVAL_AGENT_MODEL: "m/x", LOGINOM_URL: "http://127.0.0.1:1" })
  await expect(preflight(config, parseArtifactSource(config.artifactSource, config.loginom)))
    .rejects.toThrow("EVAL_CLI_MODE=binary")
})

test("preflight: live binary требует выделенный storage до проверки endpoint и запуска CLI", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-preflight-storage-"))
  try {
    const config = loadConfig(["--skip-judge"], { LOGINOM_DOCK_API_KEY: "fixture", EVAL_AGENT_MODEL: "m/x",
      EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: "/usr/bin/false", EVAL_PROFILE_DIR: path.join(dir, "profile"),
      EVAL_WORKSPACE_ROOT: path.join(dir, "workspace"), LOGINOM_URL: "http://127.0.0.1:1", EVAL_ARTIFACT_SOURCE: `dir:${dir}` })
    await expect(preflight(config, parseArtifactSource(config.artifactSource, config.loginom))).rejects.toThrow("выделенный Docker-контейнер")
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("checkSandbox: не допускает executable без установленного CLI manifest", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-preflight-boundary-"))
  try {
    const config = loadConfig(["--skip-judge"], { LOGINOM_DOCK_API_KEY: "fixture", EVAL_AGENT_MODEL: "m/x",
      EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: "/usr/bin/python3", EVAL_PROFILE_DIR: path.join(dir, "profile"), EVAL_WORKSPACE_ROOT: path.join(dir, "workspace") })
    await expect(checkSandbox(config)).rejects.toThrow("Изоляция")
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("agentInfo: binary идентифицируется по реальному файлу и манифесту сборки", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-agent-identity-"))
  try {
    const binary = path.join(dir, "release", "bin", "loginom-ai-agent-cli")
    await mkdir(path.dirname(binary), { recursive: true })
    await Bun.write(binary, "abc")
    await Bun.write(path.join(dir, "release", "cli-manifest.json"), JSON.stringify({
      metadata: { version: "0.1.17", sourceCommit: "a".repeat(40), sourceDirty: false, sourceTreeSha256: "b".repeat(64) },
    }))
    await symlink(binary, path.join(dir, "current-cli"))
    const config = loadConfig(["--skip-judge"], {
      LOGINOM_DOCK_API_KEY: "k", EVAL_AGENT_MODEL: "m/x", EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: path.join(dir, "current-cli"),
    })
    expect(await agentInfo(config)).toEqual({
      cliVersion: "0.1.17", binaryPath: binary,
      binarySha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      sourceCommit: "a".repeat(40), sourceDirty: false, sourceTreeSha256: "b".repeat(64),
    })
    await Bun.write(binary, "abcd")
    expect((await agentInfo(config)).binarySha256).not.toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("preflight: dry-run проверяет только фикстуры и читает git", async () => {
  const config = loadConfig(["--dry-run"], {})
  const environment = await preflight(config, parseArtifactSource(config.artifactSource, config.loginom))
  expect(environment.git?.sha).toMatch(/^[0-9a-f]{7,}$/)
  expect(environment.codex).toBeNull()
  expect(environment.dock).toBeNull()
  expect(environment.loginom).toBeNull()
})

test("preflight: --judge-only проверяет только судью и не трогает Loginom/docker", async () => {
  const config = loadConfig(["--judge-only", "run-1"], { JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: fakeJudge })
  const environment = await preflight(config, parseArtifactSource("docker", config.loginom))
  expect(environment.codex?.version).toBe("fake-codex 0.0.0")
  expect(environment.loginom).toBeNull()
})

test("preflight: --version не наследует секреты harness и сохраняет обычное окружение", async () => {
  const probe = await probeJudgeEnvironment("preflight")
  expect(probe.version).toBe("fake-codex 0.0.0")
  expect(probe.environment).toEqual({
    LOGINOM_SECRET_PROBE: null,
    EVAL_SECRET_PROBE: null,
    JUDGE_SECRET_PROBE: null,
    FAKE_CODEX_SECRET_PROBE: null,
    PATH: "/judge-probe-preserved-path",
    PROBE_ALLOWED_ENV: "ordinary-value",
  })
})

test("preflight: --version применяет явный judge.env после фильтрации", async () => {
  const env = {
    LOGINOM_SECRET_PROBE: "explicit-judge-value",
    EVAL_SECRET_PROBE: "explicit-judge-value",
    JUDGE_SECRET_PROBE: "explicit-judge-value",
    FAKE_CODEX_SECRET_PROBE: "explicit-judge-value",
    PATH: "/judge-probe-overridden-path",
    PROBE_ALLOWED_ENV: "overridden-value",
  }
  const probe = await probeJudgeEnvironment("preflight", env)
  expect(probe.version).toBe("fake-codex 0.0.0")
  expect(probe.environment).toEqual(env)
})

test("checkStorage: существующий dir: проходит, отсутствующий — EvalFailure с кодом 2", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-storage-"))
  const docker = { container: "c", storageDir: "/s" }
  await checkStorage(parseArtifactSource(`dir:${dir}`, docker))
  const missing = `dir:${path.join(dir, "missing")}`
  const rejected = await checkStorage(parseArtifactSource(missing, docker)).catch((error: unknown) => error)
  expect(rejected).toBeInstanceOf(EvalFailure)
  expect((rejected as EvalFailure).exitCode).toBe(2)
  expect((rejected as EvalFailure).message).toContain("Хранилище Loginom недоступно")
})

test("checkFreeSpace: проверяет реальное свободное место перед прогоном", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-free-space-"))
  try {
    await expect(checkFreeSpace(dir)).resolves.toBeUndefined()
    const error = await checkFreeSpace(dir, Number.MAX_SAFE_INTEGER).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(EvalFailure)
    expect((error as EvalFailure).exitCode).toBe(2)
    expect((error as EvalFailure).message).toContain("Недостаточно свободного места")
    expect((error as EvalFailure).message).toContain(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("preflight: недоступный судья — EvalFailure", async () => {
  const config = loadConfig(["--judge-only", "run-1"], { JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: "/nonexistent/codex" })
  await expect(preflight(config, parseArtifactSource("docker", config.loginom))).rejects.toThrow("Судья недоступен")
})

test("dockSkillRevision: читает result.revision и падает без revision", async () => {
  const apiKey = "eval-dock-test-key-not-for-leak"
  let payload: object = { status: "ok", result: { revision: "r1" } }
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === "/health") return new Response("ok", { status: 200 })
      if (url.pathname === "/api/v1/skills/loginom-automation") return Response.json(payload)
      return new Response("not found", { status: 404 })
    },
  })
  const dock = { apiKey, baseUrl: `http://127.0.0.1:${server.port}` }
  try {
    expect(await dockSkillRevision(dock)).toBe("r1")
    payload = { status: "ok", result: {} }
    const rejected = await dockSkillRevision(dock).catch((error: unknown) => error)
    expect(rejected).toBeInstanceOf(EvalFailure)
    expect((rejected as EvalFailure).exitCode).toBe(2)
    expect((rejected as EvalFailure).message).toContain("Манифест skill без revision")
    expect((rejected as EvalFailure).message).not.toContain(apiKey)
  } finally {
    server.stop()
  }
})
