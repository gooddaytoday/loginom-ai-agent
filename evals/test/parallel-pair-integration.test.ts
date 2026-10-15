import { expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createPair, destroyPair, pairImages, readServerIdentity, verifyParallelPair } from "../src/parallel-pair"
import { parseSlots } from "../src/slots"
import { cleanupIsolatedStorage } from "../src/artifact"
import { writeLeaseReceipt } from "../src/lease"

const integration = process.env.EVAL_PAIR_INTEGRATION === "1" ? test : test.skip
const pairProgram = 'const {createPair,destroyPair}=await import("./src/parallel-pair");const file=await Bun.file(process.argv[1]).json();try{await (process.argv[3]==="create"?createPair:destroyPair)(file,JSON.parse(process.argv[2]));process.exitCode=0}catch(error){console.error(error.message);process.exitCode=2}'

integration("research pair: real create qualifies private route and epoch without touching dev", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "eval-pair-integration-"))
  const name = `eval-research-${crypto.randomUUID().slice(0, 8)}`
  const portProbe = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const port = portProbe.port
  portProbe.stop(true)
  const file = parseSlots({ version: 2,
    server: { container: `${name}-server`, studioContainer: `${name}-studio`, network: name, alias: "loginom-server-7.4.2-test",
      url: `http://127.0.0.1:${port}/app/`, storageRoot: "/workdir/UserStorage", backupRoot: "/workdir/SessionBackup" },
    controller: { stateDir: `${root}/controller`, adminCredentialsFile: `${root}/secrets/admin.json` },
    judge: { codexHome: `${root}/judge` },
    slots: [{ id: "a", username: "eval-a", profileDir: `${root}/a/profile`, workspaceRoot: `${root}/a/work`, historyDir: `${root}/a/history` }],
  }, 1)
  await mkdir(`${root}/locks`, { mode: 0o700 })
  const options = { purpose: "research" as const, out: `${root}/evidence`, lockRoot: `${root}/locks` }
  const dev = (await Bun.$`docker inspect --format ${"{{.Id}} {{.State.StartedAt}}"} loginom-server-7.4.2-test loginom-client-7.4.2-test`.quiet()).text()
  const created = await createPair(file, options).catch(error => {
    console.error(`pair fixture retained: ${root}`)
    throw error
  })
  try {
    expect(created.status).toBe("infrastructure-ready")
    expect(created.identity.containerId).toMatch(/^[a-f0-9]{64}$/)
    expect(created.identity.serverEpoch).toMatch(/^[a-f0-9]{64}$/)
    const journalBytes = await Bun.file(`${root}/controller/pair.json`).text()
    expect(await verifyParallelPair(file, created.identity)).toEqual(created.identity)
    expect(await Bun.file(`${root}/controller/pair.json`).text()).toBe(journalBytes)
    await expect(verifyParallelPair(file, { ...created.identity, serverEpoch: "f".repeat(64) })).rejects.toThrow("SERVER_EPOCH_CHANGED")
    const marker = (await Bun.$`docker exec ${created.identity.containerId} cat /workdir/.loginom-evals-isolated.json`.quiet()).text()
    try {
      await Bun.$`docker exec ${created.identity.containerId} sh -c ${'printf %s "$1" > /workdir/.loginom-evals-isolated.json'} sh ${JSON.stringify({ ...JSON.parse(marker), inventory: [{ username: "eval-a", storage_dir: "/workdir/UserStorage/../SessionBackup", owner_nonce: created.nonce }] })}`.quiet()
      await expect(verifyParallelPair(file, created.identity)).rejects.toThrow("PAIR_MARKER")
    } finally {
      await Bun.$`docker exec ${created.identity.containerId} sh -c ${'printf %s "$1" > /workdir/.loginom-evals-isolated.json'} sh ${marker}`.quiet()
    }
    try {
      await Bun.$`docker exec ${created.identity.containerId} sh -c ${'mv "$1" "$1.control" && ln -s "$1.control" "$1"'} sh /workdir/.loginom-evals-isolated.json`.quiet()
      await expect(verifyParallelPair(file, created.identity)).rejects.toThrow("PAIR_MARKER")
    } finally {
      await Bun.$`docker exec ${created.identity.containerId} sh -c ${'rm "$1" && mv "$1.control" "$1"'} sh /workdir/.loginom-evals-isolated.json`.quiet()
    }
    const components = (await Bun.$`docker exec ${created.identity.containerId} cat /workdir/Components.cfg`.quiet()).text()
    try {
      await Bun.$`docker exec ${created.identity.containerId} sh -c ${'printf %s "$1" > /workdir/Components.cfg'} sh ${components.replace('Disabled="true"', 'Disabled="false"')}`.quiet()
      await expect(verifyParallelPair(file, created.identity)).rejects.toThrow("PAIR_COMPONENTS_UNVERIFIED")
    } finally {
      await Bun.$`docker exec ${created.identity.containerId} sh -c ${'printf %s "$1" > /workdir/Components.cfg'} sh ${components}`.quiet()
    }
    expect(await verifyParallelPair(file, created.identity)).toEqual(created.identity)
    expect(await Bun.file(`${root}/controller/pair.json`).text()).toBe(journalBytes)
    // Read-only storage observation: synthetic inventory binding, actual Docker filesystem.
    // This does not qualify user creation, ACL, cleanup or model admission.
    const { inspectUserStorage } = await import("../src/parallel-pair")
    await Bun.$`docker exec ${created.identity.containerId} mkdir -- /workdir/UserStorage/eval-a`.quiet()
    await expect(inspectUserStorage(file, created.identity, file.slots[0]!, created.nonce)).rejects.toThrow("USER_STORAGE_OWNERSHIP")
    const storageMarker = { ...JSON.parse(marker), inventory: [{ username: "eval-a", storage_dir: "/workdir/UserStorage/eval-a", owner_nonce: created.nonce }] }
    await Bun.$`docker exec ${created.identity.containerId} sh -c ${'printf %s "$1" > /workdir/.loginom-evals-isolated.json'} sh ${JSON.stringify(storageMarker)}`.quiet()
    try {
      const observed = await inspectUserStorage(file, created.identity, file.slots[0]!, created.nonce)
      expect(observed).toMatchObject({ identity: created.identity, username: "eval-a", root: "/workdir/UserStorage/eval-a", ownerNonce: created.nonce, entries: [] })
      expect(observed.inode).toBeGreaterThan(0)
      expect(observed.uid).toBeGreaterThanOrEqual(0)
      await expect(inspectUserStorage(file, created.identity, file.slots[0]!, crypto.randomUUID())).rejects.toThrow("USER_STORAGE_OWNERSHIP")
      const names = ["white space", "tab\tfile", "line\nfile", "Юникод", "-leading", ".hidden", "draft.lgp.autosave", "nested/ordinary"]
      await Bun.$`docker exec ${created.identity.containerId} sh -c ${'mkdir -p /workdir/UserStorage/eval-a/nested /workdir/UserStorage/eval-b; printf B > /workdir/UserStorage/eval-b/control; for name do printf A > "/workdir/UserStorage/eval-a/$name"; done; ln -s ../eval-b /workdir/UserStorage/eval-a/neighbor'} user-storage ${names}`.quiet()
      const neighbor = (await Bun.$`docker exec ${created.identity.containerId} sha256sum /workdir/UserStorage/eval-b/control`.quiet()).text()
      const listed = await inspectUserStorage(file, created.identity, file.slots[0]!, created.nonce)
      expect(listed.entries.map(entry => entry.name).sort()).toEqual([...names, "nested", "neighbor"].sort())
      expect(listed.entries.find(entry => entry.name === "neighbor")).toMatchObject({ type: "l" })
      await Bun.$`docker exec ${created.identity.containerId} ln /workdir/UserStorage/eval-b/control /workdir/UserStorage/eval-a/hardlink`.quiet()
      try {
        await expect(inspectUserStorage(file, created.identity, file.slots[0]!, created.nonce)).rejects.toThrow("USER_STORAGE_TOPOLOGY")
      } finally { await Bun.$`docker exec ${created.identity.containerId} rm -- /workdir/UserStorage/eval-a/hardlink`.quiet() }
      await Bun.$`docker exec ${created.identity.containerId} sh -c ${'mv /workdir/UserStorage/eval-a /workdir/UserStorage/eval-a.control; ln -s eval-b /workdir/UserStorage/eval-a'}`.quiet()
      try {
        await expect(inspectUserStorage(file, created.identity, file.slots[0]!, created.nonce)).rejects.toThrow("USER_STORAGE_UNVERIFIED")
      } finally { await Bun.$`docker exec ${created.identity.containerId} sh -c ${'rm /workdir/UserStorage/eval-a; mv /workdir/UserStorage/eval-a.control /workdir/UserStorage/eval-a'}`.quiet() }
      await Bun.$`docker exec ${created.identity.containerId} chown ${String(observed.uid + 1)} /workdir/UserStorage/eval-a`.quiet()
      try {
        await expect(inspectUserStorage(file, created.identity, file.slots[0]!, created.nonce)).rejects.toThrow("USER_STORAGE_UNVERIFIED")
      } finally { await Bun.$`docker exec ${created.identity.containerId} chown ${String(observed.uid)} /workdir/UserStorage/eval-a`.quiet() }
      expect((await Bun.$`docker exec ${created.identity.containerId} sha256sum /workdir/UserStorage/eval-b/control`.quiet()).text()).toBe(neighbor)
      expect((await inspectUserStorage(file, created.identity, file.slots[0]!, created.nonce)).inode).toBe(observed.inode)
    } finally {
      await Bun.$`docker exec ${created.identity.containerId} sh -c ${'printf %s "$1" > /workdir/.loginom-evals-isolated.json'} sh ${marker}`.quiet()
    }
    const conflict = { ...file, server: { ...file.server, container: `${name}-conflict-server`, studioContainer: `${name}-conflict-studio`, network: `${name}-conflict` },
      controller: { ...file.controller, stateDir: `${root}/conflict-controller` } }
    await expect(createPair(conflict, options)).rejects.toThrow("PAIR_PORT_BUSY")
    expect((await Bun.$`docker network ls --format ${"{{.Name}}"} --filter ${`name=^${conflict.server.network}$`}`.quiet()).text().trim()).toBe("")
    const foreign = { ...conflict, server: { ...conflict.server, container: `${name}-foreign-server` },
      controller: { ...file.controller, stateDir: `${root}/foreign-controller` } }
    const placeholder = (await Bun.$`docker create --name ${foreign.server.container} ${pairImages.server}`.quiet()).text().trim()
    try {
      const original = (await Bun.$`docker inspect --format ${"{{.Id}} {{.State.Status}}"} ${placeholder}`.quiet()).text()
      await expect(createPair(foreign, options)).rejects.toThrow("PAIR_OWNERSHIP")
      expect((await Bun.$`docker inspect --format ${"{{.Id}} {{.State.Status}}"} ${placeholder}`.quiet()).text()).toBe(original)
    } finally { await Bun.$`docker rm ${placeholder}`.quiet() }
    const repeated = await createPair(file, options)
    expect(repeated.resources).toEqual(created.resources)
    expect(repeated.identity).toEqual(created.identity)
    const identity = await readServerIdentity(file)
    expect(identity).toEqual(created.identity)
    await Bun.$`docker exec ${identity.containerId} sh -c ${'mkdir -p /workdir/UserStorage/eval-a /workdir/UserStorage/eval-b; printf A > /workdir/UserStorage/eval-a/control; printf B > /workdir/UserStorage/eval-b/control'}`.quiet()
    const before = (await Bun.$`docker exec ${identity.containerId} sha256sum /workdir/UserStorage/eval-a/control /workdir/UserStorage/eval-b/control`.quiet()).text()
    await expect(cleanupIsolatedStorage({ kind: "docker", container: identity.containerId, storageDir: "/workdir/UserStorage/eval-a" })).rejects.toThrow("Широкая очистка запрещена")
    expect((await Bun.$`docker exec ${identity.containerId} sha256sum /workdir/UserStorage/eval-a/control /workdir/UserStorage/eval-b/control`.quiet()).text()).toBe(before)
    await Bun.$`docker restart ${identity.containerId}`.quiet()
    const restarted = await readServerIdentity(file)
    expect(restarted.containerId).toBe(identity.containerId)
    expect(restarted.serverEpoch).not.toBe(identity.serverEpoch)
    expect((await readServerIdentity(file)).serverEpoch).toBe(restarted.serverEpoch)
    await writeLeaseReceipt(`${root}/slots.json`, file)
    const saved = await Bun.file(`${root}/controller/pair.json`).json()
    const key = `provision:${saved.daemonId}:network:${file.server.network}`
    const commandFile = `${root}/controller/crashed-command.json`
    const keeper = Bun.spawn([process.execPath, "-e", 'const {acquireResourceLease,writeLeaseReceipt}=await import("./src/lease");const request=JSON.parse(process.argv[1]);await writeLeaseReceipt(request.journal,JSON.parse(process.argv[2]));await acquireResourceLease(request);console.log("held");await Bun.sleep(60000)',
      JSON.stringify({ key, lockRoot: options.lockRoot, journal: commandFile, commandId: "crashed-fixture" }),
      JSON.stringify({ kind: "pair-command", pairFile: `${root}/controller/pair.json`, nonce: saved.nonce })],
      { cwd: path.resolve(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" })
    expect(new TextDecoder().decode((await keeper.stdout.getReader().read()).value)).toContain("held")
    keeper.kill("SIGKILL")
    await keeper.exited
    await Bun.$`docker rename ${identity.containerId} ${`${name}-crash-renamed`}`.quiet()
    try {
      const rejected = Bun.spawn([process.execPath, "-e", pairProgram, `${root}/slots.json`, JSON.stringify(options), "create"],
        { cwd: path.resolve(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" })
      const [code, stderr] = await Promise.all([rejected.exited, new Response(rejected.stderr).text(), new Response(rejected.stdout).text()])
      expect(code).toBe(2)
      expect(stderr).toContain("PAIR_OWNERSHIP")
      const reservation = await Bun.file(`${options.lockRoot}/${new Bun.CryptoHasher("sha256").update(key).digest("hex")}.reservation.json`).json()
      expect(reservation.state).toBe("recovery-only")
    } finally { await Bun.$`docker rename ${identity.containerId} ${file.server.container}`.quiet() }
    expect((await createPair(file, options)).resources).toEqual(created.resources)
    // An immutable owned ID still exists after rename; missing names do not prove deletion.
    await Bun.$`docker rename ${identity.containerId} ${`${name}-renamed`}`.quiet()
    try {
      const child = Bun.spawn([process.execPath, "-e", pairProgram, `${root}/slots.json`, JSON.stringify(options), "destroy"],
        { cwd: path.resolve(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" })
      const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text(), new Response(child.stdout).text()])
      expect(code).toBe(2)
      expect(stderr).toContain("PAIR_OWNERSHIP")
      expect((await Bun.$`docker inspect --format ${"{{.State.Running}}"} ${identity.studioContainerId}`.quiet()).text().trim()).toBe("true")
    } finally { await Bun.$`docker rename ${identity.containerId} ${file.server.container}`.quiet() }
  } finally {
    await destroyPair(file, options)
    expect((await Bun.$`docker inspect --format ${"{{.Id}} {{.State.StartedAt}}"} loginom-server-7.4.2-test loginom-client-7.4.2-test`.quiet()).text()).toBe(dev)
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)
