import { expect, test } from "bun:test"
import path from "node:path"
import { chmod, link, lstat, mkdir, mkdtemp, readFile, rename, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { archiveProfileEvidence } from "../src/profile-archive"

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "evals-durable-archive-"))
  await Promise.all(["profile", "archive", "controller"].map(name => mkdir(path.join(root, name), { mode: 0o700 })))
  await mkdir(path.join(root, "profile/data"), { mode: 0o700 })
  await mkdir(path.join(root, "profile/loginom/inputs"), { recursive: true, mode: 0o700 })
  const files = { "data/loginom-ai-agent.db": "database", "data/loginom-ai-agent.db-wal": "wal", "data/loginom-ai-agent.db-shm": "shm", "loginom/inputs/input.csv": "input" }
  await Promise.all(Object.entries(files).map(([name, value]) => Bun.write(path.join(root, "profile", name), value)))
  await Bun.write(path.join(root, "profile/data/auth.json"), "retained-auth-fixture")
  return { root, files, profile: path.join(root, "profile"), archive: path.join(root, "archive"), journal: path.join(root, "controller/archive.json"),
    async close() { await rm(root, { recursive: true, force: true }) } }
}

test("durable archive: DB/WAL/SHM and inputs move under a committed private manifest", async () => {
  const context = await fixture()
  try {
    const receipt = await archiveProfileEvidence(context.profile, context.archive, context.journal)
    expect(receipt).toMatchObject({ version: 1, status: "committed", archive: context.archive, journal: context.journal })
    for (const [name, value] of Object.entries(context.files)) {
      expect(await Bun.file(path.join(context.archive, name)).text()).toBe(value)
      expect(await Bun.file(path.join(context.profile, name)).exists()).toBe(false)
    }
    expect(await Bun.file(path.join(context.profile, "data/auth.json")).text()).toBe("retained-auth-fixture")
    expect(await Bun.file(context.journal).json()).toMatchObject({ version: 1, kind: "profile-archive", status: "committed", profile: context.profile, archive: context.archive })
  } finally { await context.close() }
})

test("durable archive: a committed archive is reused without replacing its manifest with an empty one", async () => {
  const context = await fixture()
  try {
    const first = await archiveProfileEvidence(context.profile, context.archive, context.journal)
    const journal = await Bun.file(context.journal).text()
    expect(await archiveProfileEvidence(context.profile, context.archive, context.journal)).toEqual(first)
    expect(await Bun.file(context.journal).text()).toBe(journal)
    expect((await Bun.file(context.journal).json()).roots).toHaveLength(4)
    expect(await Bun.file(path.join(context.archive, "data/loginom-ai-agent.db")).text()).toBe(context.files["data/loginom-ai-agent.db"])
  } finally { await context.close() }
})

test("durable archive: recovery reconciles both sides after an I/O failure and a completed move", async () => {
  const context = await fixture()
  try {
    await mkdir(path.join(context.archive, "data"), { mode: 0o700 })
    await chmod(path.join(context.archive, "data"), 0o500)
    await expect(archiveProfileEvidence(context.profile, context.archive, context.journal)).rejects.toThrow("EACCES")
    expect((await Bun.file(context.journal).json()).status).toBe("intent")
    await chmod(path.join(context.archive, "data"), 0o700)
    await rename(path.join(context.profile, "data/loginom-ai-agent.db"), path.join(context.archive, "data/loginom-ai-agent.db"))
    expect(await archiveProfileEvidence(context.profile, context.archive, context.journal)).toMatchObject({ status: "committed" })
    for (const [name, value] of Object.entries(context.files)) expect(await Bun.file(path.join(context.archive, name)).text()).toBe(value)
    expect((await Bun.file(context.journal).json()).roots).toHaveLength(4)
  } finally { await chmod(path.join(context.archive, "data"), 0o700).catch(() => {}); await context.close() }
})

test.each(["foreign-file", "symlink-parent"] as const)("durable archive: %s target refuses before moving any profile data", async kind => {
  const context = await fixture()
  try {
    await mkdir(path.join(context.root, "other"), { mode: 0o700 })
    await Bun.write(path.join(context.root, "other/control"), "preserve-other")
    if (kind === "foreign-file") await Bun.write(path.join(context.archive, "foreign.txt"), "preserve-foreign")
    if (kind === "symlink-parent") await symlink(path.join(context.root, "other"), path.join(context.archive, "data"))
    await expect(archiveProfileEvidence(context.profile, context.archive, context.journal)).rejects.toThrow("ARCHIVE_TARGET_CHANGED")
    for (const [name, value] of Object.entries(context.files)) expect(await Bun.file(path.join(context.profile, name)).text()).toBe(value)
    expect(await Bun.file(path.join(context.root, "other/control")).text()).toBe("preserve-other")
    if (kind === "foreign-file") expect(await Bun.file(path.join(context.archive, "foreign.txt")).text()).toBe("preserve-foreign")
  } finally { await context.close() }
})

test("durable archive: actual SIGKILL during moves leaves an intent reconciled by the next process", async () => {
  const context = await fixture()
  await Promise.all(Array.from({ length: 40 }, (_, index) => Bun.write(path.join(context.profile, "data", `chunk-${String(index).padStart(2, "0")}`), `chunk-${index}`)))
  const child = Bun.spawn([process.execPath, "-e", `
    const {watch}=await import("node:fs");
    const {archiveProfileEvidence}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/profile-archive.ts"))});
    const input=JSON.parse(process.env.ARCHIVE_TEST_INPUT);
    let paused=false;
    const watcher=watch(input.profile+"/data",(event)=>{
      if(event!=="rename"||paused)return;
      paused=true;process.stdout.write("move-observed\\n");process.kill(process.pid,"SIGSTOP");
    });
    await archiveProfileEvidence(input.profile,input.archive,input.journal);
    watcher.close();
  `], { env: { PATH: process.env.PATH, ARCHIVE_TEST_INPUT: JSON.stringify({ profile: context.profile, archive: context.archive, journal: context.journal }) }, stdout: "pipe", stderr: "pipe" })
  const timeout = Promise.withResolvers<never>()
  const timer = setTimeout(() => timeout.reject(Error("archive move observation timed out")), 5_000)
  try {
    const row = await Promise.race([child.stdout.getReader().read(), timeout.promise])
    clearTimeout(timer)
    expect(new TextDecoder().decode(row.value)).toContain("move-observed")
    const deadline = Date.now() + 1_000
    while ((await readFile(`/proc/${child.pid}/stat`, "utf8")).split(") ")[1]!.split(" ")[0] !== "T" && Date.now() < deadline) await Bun.sleep(5)
    expect((await readFile(`/proc/${child.pid}/stat`, "utf8")).split(") ")[1]!.split(" ")[0]).toBe("T")
    const manifest = await Bun.file(context.journal).json() as { status: string; roots: { name: string }[] }
    expect(manifest.status).toBe("intent")
    const originals = await Promise.all(manifest.roots.map(root => lstat(path.join(context.profile, root.name)).then(() => true, () => false)))
    expect(originals.some(Boolean)).toBe(true)
    expect(originals.every(Boolean)).toBe(false)
    child.kill("SIGKILL")
    await child.exited
    expect(await archiveProfileEvidence(context.profile, context.archive, context.journal)).toMatchObject({ status: "committed" })
    expect((await Bun.file(context.journal).json()).roots).toHaveLength(44)
    for (const [name, value] of Object.entries(context.files)) expect(await Bun.file(path.join(context.archive, name)).text()).toBe(value)
    expect(await Bun.file(path.join(context.archive, "data/chunk-39")).text()).toBe("chunk-39")
  } finally { clearTimeout(timer); child.kill("SIGKILL"); await child.exited; await context.close() }
}, 10_000)

test("durable archive: a hardlink refuses before any move and preserves its other name", async () => {
  const context = await fixture()
  try {
    await link(path.join(context.profile, "data/loginom-ai-agent.db"), path.join(context.root, "other-database"))
    await expect(archiveProfileEvidence(context.profile, context.archive, context.journal)).rejects.toThrow("ARCHIVE_TOPOLOGY")
    expect(await Bun.file(path.join(context.profile, "data/loginom-ai-agent.db")).text()).toBe("database")
    expect(await Bun.file(path.join(context.root, "other-database")).text()).toBe("database")
    expect(await Bun.file(context.journal).exists()).toBe(false)
  } finally { await context.close() }
})

test("durable archive: changed archived data cannot reuse a committed receipt", async () => {
  const context = await fixture()
  try {
    await archiveProfileEvidence(context.profile, context.archive, context.journal)
    const journal = await Bun.file(context.journal).text()
    await Bun.write(path.join(context.archive, "data/loginom-ai-agent.db"), "changed")
    await expect(archiveProfileEvidence(context.profile, context.archive, context.journal)).rejects.toThrow("ARCHIVE_IDENTITY_CHANGED")
    expect(await Bun.file(context.journal).text()).toBe(journal)
    expect(await Bun.file(path.join(context.archive, "data/loginom-ai-agent.db-wal")).text()).toBe("wal")
  } finally { await context.close() }
})

test("durable archive: replaced archive root cannot adopt the recorded identity", async () => {
  const context = await fixture()
  try {
    await archiveProfileEvidence(context.profile, context.archive, context.journal)
    const journal = await Bun.file(context.journal).text()
    await rename(context.archive, context.archive + ".old")
    await mkdir(context.archive, { mode: 0o700 })
    await Bun.write(path.join(context.archive, "foreign"), "preserve")
    await expect(archiveProfileEvidence(context.profile, context.archive, context.journal)).rejects.toThrow("ARCHIVE_MANIFEST_INVALID")
    expect(await Bun.file(context.journal).text()).toBe(journal)
    expect(await Bun.file(path.join(context.archive, "foreign")).text()).toBe("preserve")
    expect(await Bun.file(path.join(context.archive + ".old", "data/loginom-ai-agent.db")).text()).toBe("database")
  } finally { await context.close() }
})

test("durable archive: a live env-only writer preserves history and creates no intent", async () => {
  const context = await fixture()
  const child = Bun.spawn([process.execPath, "-e", 'process.stdout.write("ready\\n");await Bun.sleep(30_000)'],
    { cwd: context.profile, env: { PATH: process.env.PATH, LOGINOM_AI_AGENT_CLI_PROFILE: context.profile }, stdout: "pipe", stderr: "pipe" })
  try {
    expect(new TextDecoder().decode((await child.stdout.getReader().read()).value)).toContain("ready")
    await expect(archiveProfileEvidence(context.profile, context.archive, context.journal)).rejects.toThrow("незавершённое")
    expect(await Bun.file(context.journal).exists()).toBe(false)
    expect(await Bun.file(path.join(context.profile, "data/loginom-ai-agent.db")).text()).toBe("database")
    expect(process.kill(child.pid, 0)).toBe(true)
  } finally { child.kill("SIGKILL"); await child.exited; await context.close() }
})

test("durable archive: unusual names and symlink objects retain bytes without reading their target", async () => {
  const context = await fixture()
  const names = [".autosave", "-leading", "a b\tc\nЮникод"]
  try {
    await Promise.all(names.map(name => Bun.write(path.join(context.profile, "loginom/inputs", name), name)))
    await mkdir(path.join(context.root, "other"), { mode: 0o700 })
    await Bun.write(path.join(context.root, "other/control"), "other-data")
    await symlink(path.join(context.root, "other/control"), path.join(context.profile, "loginom/inputs/link"))
    await archiveProfileEvidence(context.profile, context.archive, context.journal)
    for (const name of names) expect(await Bun.file(path.join(context.archive, "loginom/inputs", name)).text()).toBe(name)
    expect((await lstat(path.join(context.archive, "loginom/inputs/link"))).isSymbolicLink()).toBe(true)
    expect(await Bun.file(path.join(context.root, "other/control")).text()).toBe("other-data")
  } finally { await context.close() }
})
