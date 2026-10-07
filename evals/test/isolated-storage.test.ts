import { expect, test } from "bun:test"
import { assertIsolatedStorageEmpty, cleanupIsolatedStorage, parseArtifactSource } from "../src/artifact"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { agentCommand } from "../src/cli"
import { loadConfig } from "../src/config"
import { afterAttempt, runAttempt } from "../src/run"
import { loadTasks } from "../src/task"
import { checkIsolatedLoginom, preflight } from "../src/preflight"

// Real Docker adapter, no Loginom/model execution and no host data mounts.
const requestedImage = process.env.EVAL_TEST_LOGINOM_IMAGE
const image = requestedImage ?? "sha256:5e3c79877de937aae168ecdcaf70c837bbbcf04e8f4262c2a976ac283ea394c2"
const available = Boolean(Bun.which("docker")) && (await Bun.$`docker image inspect ${image}`.quiet().nothrow()).exitCode === 0
if (requestedImage !== undefined && !available)
  throw new Error("EVAL_TEST_LOGINOM_IMAGE указан, но fixture image недоступен через Docker")

test.skipIf(!available)("checkIsolatedLoginom: доступный прежний сервер запрещает изолированный eval", async () => {
  const container = (await Bun.$`docker run --rm -d --network none --entrypoint /bin/sh ${image} -c ${"sleep 120"}`.quiet()).text().trim()
  const previous = (await Bun.$`docker run -d --network none --entrypoint /bin/sh ${image} -c ${"sleep 120"}`.quiet()).text().trim()
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-loginom-endpoint-"))
  try {
    await Bun.$`docker exec ${container} mkdir -p /workdir/UserStorage/user /workdir/SessionBackup`.quiet()
    const marker = path.join(dir, "marker.json")
    await Bun.write(marker, JSON.stringify({ kind: "loginom-evals-isolated", version: 1, container_id: container,
      storage_dir: "/workdir/UserStorage/user", roots: ["/workdir/UserStorage", "/workdir/SessionBackup"], previous_container_id: previous }))
    await Bun.$`docker cp ${marker} ${`${container}:/workdir/.loginom-evals-isolated.json`}`.quiet()
    await expect(checkIsolatedLoginom({ kind: "docker", container, storageDir: "/workdir/UserStorage/user" })).rejects.toThrow("прежний сервер")
    const dry = loadConfig(["--dry-run"], { EVAL_PROFILE_DIR: path.join(dir, "profile"), EVAL_WORKSPACE_ROOT: path.join(dir, "workspace") })
    await mkdir(dry.profileDir)
    const live = { ...dry, dryRun: false, agent: { ...dry.agent, cliMode: "binary" as const, cliBin: "/usr/bin/false" } }
    const [task] = await loadTasks(live.tasksDir, ["calc-data-double"])
    const { result, stop } = await runAttempt({ config: live, command: agentCommand(live),
      source: { kind: "docker", container, storageDir: "/workdir/UserStorage/user" }, task: task!, attempt: 1,
      runId: "server-guard", runDir: path.join(dir, "results"), signal: new AbortController().signal, profileRecovered: false, skipJudge: true })
    expect(result.harness_error).toContain("прежний сервер")
    expect(result.exit_code).toBeNull()
    expect(stop).toBe(true)
    await expect(preflight(live, { kind: "docker", container, storageDir: "/workdir/UserStorage/user" })).rejects.toThrow("прежний сервер")
    await Bun.$`docker stop -t 1 ${previous}`.quiet()
    await Bun.$`docker update --restart always ${previous}`.quiet()
    await expect(checkIsolatedLoginom({ kind: "docker", container, storageDir: "/workdir/UserStorage/user" })).rejects.toThrow("прежний сервер")
    await Bun.$`docker update --restart no ${previous}`.quiet()
    const components = path.join(dir, "Components.cfg")
    await Bun.write(components, '<ComponentSettings><Item Guid="70a6c99d-a725-4309-b05c-898c8072c3cd"><Settings Disabled="false"/></Item></ComponentSettings>')
    await Bun.$`docker cp ${components} ${`${container}:/workdir/Components.cfg`}`.quiet()
    await expect(checkIsolatedLoginom({ kind: "docker", container, storageDir: "/workdir/UserStorage/user" })).rejects.toThrow("Python")
    await Bun.write(components, '<ComponentSettings><Item Guid="70a6c99d-a725-4309-b05c-898c8072c3cd"><Settings Disabled="true"/></Item></ComponentSettings>')
    await Bun.$`docker cp ${components} ${`${container}:/workdir/Components.cfg`}`.quiet()
    await expect(checkIsolatedLoginom({ kind: "docker", container, storageDir: "/workdir/UserStorage/user" })).rejects.toThrow("alias")
  } finally {
    await Bun.$`docker rm -f ${container} ${previous}`.quiet().nothrow()
    await rm(dir, { recursive: true, force: true })
  }
}, 20_000)

test.skipIf(!available)("checkIsolatedLoginom: чистый сервер без прежнего контейнера сохраняет Python и network gates", async () => {
  const container = (await Bun.$`docker run --rm -d --network none --entrypoint /bin/sh ${image} -c ${"sleep 120"}`.quiet()).text().trim()
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-loginom-fresh-endpoint-"))
  const source = { kind: "docker" as const, container, storageDir: "/workdir/UserStorage/user" }
  try {
    await Bun.$`docker exec ${container} mkdir -p /workdir/UserStorage/user /workdir/SessionBackup`.quiet()
    const marker = path.join(dir, "marker.json")
    const prepared = { kind: "loginom-evals-isolated", version: 1, container_id: container,
      storage_dir: source.storageDir, roots: ["/workdir/UserStorage", "/workdir/SessionBackup"] }
    await Bun.write(marker, JSON.stringify(prepared))
    await Bun.$`docker cp ${marker} ${`${container}:/workdir/.loginom-evals-isolated.json`}`.quiet()
    const components = path.join(dir, "Components.cfg")
    await Bun.write(components, '<ComponentSettings><Item Guid="70a6c99d-a725-4309-b05c-898c8072c3cd"><Settings Disabled="false"/></Item></ComponentSettings>')
    await Bun.$`docker cp ${components} ${`${container}:/workdir/Components.cfg`}`.quiet()
    await expect(checkIsolatedLoginom(source)).rejects.toThrow("Python")
    await Bun.write(components, '<ComponentSettings><Item Guid="70a6c99d-a725-4309-b05c-898c8072c3cd"><Settings Disabled="true"/></Item></ComponentSettings>')
    await Bun.$`docker cp ${components} ${`${container}:/workdir/Components.cfg`}`.quiet()
    // No duplicate alias on the live network: reaching this gate proves fresh-host admission preserves it.
    await expect(checkIsolatedLoginom(source)).rejects.toThrow("alias")
    for (const previous of [null, "invalid", container, "0".repeat(64)]) {
      await Bun.write(marker, JSON.stringify({ ...prepared, previous_container_id: previous }))
      await Bun.$`docker cp ${marker} ${`${container}:/workdir/.loginom-evals-isolated.json`}`.quiet()
      await expect(checkIsolatedLoginom(source)).rejects.toThrow("прежний сервер")
    }
  } finally { await Bun.$`docker rm -f ${container}`.quiet().nothrow(); await rm(dir, { recursive: true, force: true }) }
}, 20_000)

test.skipIf(!available)("afterAttempt: широкая очистка выделенного storage идёт после подтверждённого recovery и архива", async () => {
  const container = (await Bun.$`docker run --rm -d --network none --entrypoint /bin/sh ${image} -c ${"sleep 120"}`.quiet()).text().trim()
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-storage-after-attempt-"))
  try {
    await Bun.$`docker exec ${container} mkdir -p /workdir/UserStorage/user /workdir/SessionBackup`.quiet()
    const storageDir = "/workdir/UserStorage/user"
    const marker = path.join(dir, "marker.json")
    await Bun.write(marker, JSON.stringify({ kind: "loginom-evals-isolated", version: 1, container_id: container,
      storage_dir: storageDir, roots: ["/workdir/UserStorage", "/workdir/SessionBackup"] }))
    await Bun.$`docker cp ${marker} ${`${container}:/workdir/.loginom-evals-isolated.json`}`.quiet()
    await Bun.$`docker exec ${container} touch /workdir/UserStorage/user/custom-output.csv /workdir/SessionBackup/session`.quiet()
    const config = loadConfig(["--dry-run"], { EVAL_PROFILE_DIR: path.join(dir, "profile"), EVAL_WORKSPACE_ROOT: path.join(dir, "workspace") })
    await mkdir(config.profileDir)
    const command = agentCommand(config)
    const [task] = await loadTasks(config.tasksDir, ["calc-data-double"])
    const runDir = path.join(dir, "results", "storage")
    const { result } = await runAttempt({ config, command, source: parseArtifactSource(config.artifactSource, config.loginom),
      task: task!, attempt: 1, runId: "storage", runDir, signal: new AbortController().signal, profileRecovered: false, skipJudge: true })
    expect(result.harness_error).toBeNull()
    const out = path.join(runDir, task!.id, "1")
    const live = { ...config, dryRun: false, artifactSource: "docker", loginom: { ...config.loginom, container, storageDir },
      agent: { ...config.agent, cliMode: "binary" as const } }
    expect(await afterAttempt(live, command, result, out)).not.toHaveProperty("stop")
    const cleanup = await Bun.file(path.join(out, "cleanup.json")).json()
    expect(cleanup.stages.at(-1)).toMatchObject({ stage: "storage", status: "confirmed" })
    expect(result.status).toBe("no_artifact")
    expect((await Bun.$`docker exec ${container} test -f /workdir/UserStorage/user/custom-output.csv`.quiet().nothrow()).exitCode).toBe(1)
    await assertIsolatedStorageEmpty({ kind: "docker", container, storageDir })
  } finally { await Bun.$`docker rm -f ${container}`.quiet().nothrow(); await rm(dir, { recursive: true, force: true }) }
}, 30_000)

test.skipIf(!available)("assertIsolatedStorageEmpty: чужие outputs и backups запрещают admission без удаления", async () => {
  const container = (await Bun.$`docker run --rm -d --network none --entrypoint /bin/sh ${image} -c ${"sleep 120"}`.quiet()).text().trim()
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-storage-admission-"))
  const source = { kind: "docker" as const, container, storageDir: "/workdir/UserStorage/user" }
  try {
    await Bun.$`docker exec ${container} mkdir -p /workdir/UserStorage/user /workdir/UserStorage/common /workdir/SessionBackup`.quiet()
    const marker = path.join(dir, "marker.json")
    await Bun.write(marker, JSON.stringify({ kind: "loginom-evals-isolated", version: 1, container_id: container,
      storage_dir: source.storageDir, roots: ["/workdir/UserStorage", "/workdir/SessionBackup"] }))
    await Bun.$`docker cp ${marker} ${`${container}:/workdir/.loginom-evals-isolated.json`}`.quiet()
    await assertIsolatedStorageEmpty(source)
    for (const file of ["/workdir/UserStorage/common/other.csv", "/workdir/SessionBackup/old-session"]) {
      await Bun.$`docker exec ${container} touch ${file}`.quiet()
      await expect(assertIsolatedStorageEmpty(source)).rejects.toThrow("прошлой попытки")
      expect((await Bun.$`docker exec ${container} test -f ${file}`.quiet().nothrow()).exitCode).toBe(0)
      await cleanupIsolatedStorage(source)
      await assertIsolatedStorageEmpty(source)
    }
  } finally { await Bun.$`docker rm -f ${container}`.quiet().nothrow(); await rm(dir, { recursive: true, force: true }) }
}, 20_000)

test.skipIf(!available)("cleanupIsolatedStorage: без маркера широкое удаление запрещено и файл сохраняется", async () => {
  const created = await Bun.$`docker run --rm -d --network none --entrypoint /bin/sh ${image} -c ${"sleep 120"}`.quiet()
  const container = created.text().trim()
  try {
    await Bun.$`docker exec ${container} mkdir -p /workdir/UserStorage/user`.quiet()
    await Bun.$`docker exec ${container} sh -c ${"printf answer > /workdir/UserStorage/user/reference.lgp"}`.quiet()
    await expect(cleanupIsolatedStorage({ kind: "docker", container, storageDir: "/workdir/UserStorage/user" }))
      .rejects.toThrow("маркер")
    expect((await Bun.$`docker exec ${container} test -f /workdir/UserStorage/user/reference.lgp`.quiet().nothrow()).exitCode).toBe(0)
  } finally { await Bun.$`docker rm -f ${container}`.quiet().nothrow() }
}, 20_000)

test.skipIf(!available)("cleanupIsolatedStorage: повреждённый маркер даёт понятную ошибку подготовки без удаления", async () => {
  const container = (await Bun.$`docker run --rm -d --network none --entrypoint /bin/sh ${image} -c ${"sleep 120"}`.quiet()).text().trim()
  try {
    await Bun.$`docker exec ${container} mkdir -p /workdir/UserStorage/user`.quiet()
    await Bun.$`docker exec ${container} sh -c ${"printf answer > /workdir/UserStorage/user/reference.lgp; printf broken > /workdir/.loginom-evals-isolated.json"}`.quiet()
    await expect(cleanupIsolatedStorage({ kind: "docker", container, storageDir: "/workdir/UserStorage/user" })).rejects.toThrow("маркер")
    expect((await Bun.$`docker exec ${container} test -f /workdir/UserStorage/user/reference.lgp`.quiet().nothrow()).exitCode).toBe(0)
  } finally { await Bun.$`docker rm -f ${container}`.quiet().nothrow() }
}, 20_000)

test.skipIf(!available)("cleanupIsolatedStorage: чужой ID и широкие корни маркера не дают права удаления", async () => {
  const container = (await Bun.$`docker run --rm -d --network none --entrypoint /bin/sh ${image} -c ${"sleep 120"}`.quiet()).text().trim()
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-storage-marker-refusal-"))
  try {
    await Bun.$`docker exec ${container} mkdir -p /workdir/UserStorage/user /workdir/SessionBackup`.quiet()
    await Bun.$`docker exec ${container} sh -c ${"printf answer > /workdir/UserStorage/user/reference.lgp"}`.quiet()
    const marker = path.join(dir, "marker.json")
    for (const change of [{ container_id: "0".repeat(64) }, { roots: ["/workdir"] }]) {
      await Bun.write(marker, JSON.stringify({ kind: "loginom-evals-isolated", version: 1, container_id: container,
        storage_dir: "/workdir/UserStorage/user", roots: ["/workdir/UserStorage", "/workdir/SessionBackup"], ...change }))
      await Bun.$`docker cp ${marker} ${`${container}:/workdir/.loginom-evals-isolated.json`}`.quiet()
      await expect(cleanupIsolatedStorage({ kind: "docker", container, storageDir: "/workdir/UserStorage/user" })).rejects.toThrow("корни")
      expect((await Bun.$`docker exec ${container} test -f /workdir/UserStorage/user/reference.lgp`.quiet().nothrow()).exitCode).toBe(0)
    }
  } finally { await Bun.$`docker rm -f ${container}`.quiet().nothrow(); await rm(dir, { recursive: true, force: true }) }
}, 20_000)

test.skipIf(!available)("cleanupIsolatedStorage: даже верный маркер не разрешает удаление host bind mount", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-storage-bind-refusal-"))
  await Bun.write(path.join(dir, "reference.lgp"), "host answer")
  const container = (await Bun.$`docker run --rm -d --network none --mount ${`type=bind,src=${dir},dst=/workdir/UserStorage/user`} --entrypoint /bin/sh ${image} -c ${"sleep 120"}`.quiet()).text().trim()
  try {
    const marker = path.join(dir, "marker.json")
    await Bun.write(marker, JSON.stringify({ kind: "loginom-evals-isolated", version: 1, container_id: container,
      storage_dir: "/workdir/UserStorage/user", roots: ["/workdir/UserStorage", "/workdir/SessionBackup"] }))
    await Bun.$`docker cp ${marker} ${`${container}:/workdir/.loginom-evals-isolated.json`}`.quiet()
    await expect(cleanupIsolatedStorage({ kind: "docker", container, storageDir: "/workdir/UserStorage/user" })).rejects.toThrow("bind mounts")
    expect(await Bun.file(path.join(dir, "reference.lgp")).text()).toBe("host answer")
  } finally { await Bun.$`docker rm -f ${container}`.quiet().nothrow(); await rm(dir, { recursive: true, force: true }) }
}, 20_000)

test.skipIf(!available)("cleanupIsolatedStorage: подтверждённый контейнер очищается вне настроек, включая чужие имена и backups", async () => {
  const created = await Bun.$`docker run --rm -d --network none --entrypoint /bin/sh ${image} -c ${"sleep 120"}`.quiet()
  const container = created.text().trim()
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-storage-marker-"))
  try {
    await Bun.$`docker exec ${container} mkdir -p /workdir/UserStorage/user /workdir/UserStorage/admin /workdir/UserStorage/common /workdir/SessionBackup`.quiet()
    await Bun.$`docker exec ${container} sh -c ${"printf answer > /workdir/UserStorage/user/reference.lgp; printf answer > /workdir/UserStorage/admin/other.csv; printf answer > /workdir/UserStorage/common/shared.csv; printf answer > /workdir/SessionBackup/session; printf config > /workdir/preserved.cfg"}`.quiet()
    const marker = path.join(dir, "marker.json")
    await Bun.write(marker, JSON.stringify({ kind: "loginom-evals-isolated", version: 1, container_id: container,
      storage_dir: "/workdir/UserStorage/user", roots: ["/workdir/UserStorage", "/workdir/SessionBackup"] }))
    await Bun.$`docker cp ${marker} ${`${container}:/workdir/.loginom-evals-isolated.json`}`.quiet()
    await cleanupIsolatedStorage({ kind: "docker", container, storageDir: "/workdir/UserStorage/user" })
    const checked = await Bun.$`docker exec ${container} sh -c ${"test -d /workdir/UserStorage/user && test -f /workdir/preserved.cfg && test -z \"$(find /workdir/UserStorage -mindepth 2 -print -quit)\" && test -z \"$(find /workdir/SessionBackup -mindepth 1 -print -quit)\""}`.quiet().nothrow()
    expect(checked.exitCode).toBe(0)
  } finally {
    await Bun.$`docker rm -f ${container}`.quiet().nothrow()
    await rm(dir, { recursive: true, force: true })
  }
}, 20_000)
