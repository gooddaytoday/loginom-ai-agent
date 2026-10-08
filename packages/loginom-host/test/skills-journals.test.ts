import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createHash } from "node:crypto"
import { collectExecutionJournals } from "../script/skills-acceptance/journals.mjs"

test("acceptance preserves internal node step receipts without copying credentials or browser state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "skills-journals-"))
  try {
    const profile = join(directory, "profile")
    const session = join(profile, "loginom/runtime/generations/1/chats/chat/attempts/attempt")
    const output = join(directory, "evidence")
    await mkdir(join(session, "browser-profile"), { recursive: true })
    await writeFile(join(profile, "auth.json"), "private-fixture-secret")
    await writeFile(join(session, "browser-profile/execution-events.jsonl"), "private-fixture-secret")
    const events = JSON.stringify({
      phase: "node_step_completed",
      internal_operation_id: "import-sales:node-step-4",
      outcome: { status: "NOT_APPLIED", effect_possible: false, cleanup_complete: true, trace: [] },
    }) + "\n"
    await writeFile(join(session, "execution-events.jsonl"), events)
    const receipts = await collectExecutionJournals(profile, output, ["private-fixture-secret"])
    expect(receipts).toHaveLength(1)
    expect(receipts[0]!.source).toBe("loginom/runtime/generations/1/chats/chat/attempts/attempt/execution-events.jsonl")
    expect(receipts[0]!.sha256).toBe(createHash("sha256").update(events).digest("hex"))
    expect(await readFile(join(output, "internal-journals", receipts[0]!.name), "utf8")).toBe(events)
    expect(JSON.parse(await readFile(join(output, "internal-journals.json"), "utf8"))).toEqual(receipts)
    expect((await readdir(output)).sort()).toEqual(["internal-journals", "internal-journals.json"])
    expect(await readFile(join(profile, "auth.json"), "utf8")).toBe("private-fixture-secret")
    expect(await readFile(join(session, "execution-events.jsonl"), "utf8")).toBe(events)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("acceptance refuses a symlinked profile root without reading its destination", async () => {
  const directory = await mkdtemp(join(tmpdir(), "skills-journals-root-"))
  try {
    const outside = join(directory, "outside")
    const profile = join(directory, "profile")
    await mkdir(outside)
    await writeFile(join(outside, "execution-events.jsonl"), '{"phase":"outside"}\n')
    await symlink(outside, profile)
    await expect(collectExecutionJournals(profile, join(directory, "evidence"))).rejects.toThrow("SKILLS_JOURNAL_PROFILE_INVALID")
    expect((await readdir(directory)).sort()).toEqual(["outside", "profile"])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("acceptance refuses a journal symlink instead of reading a file outside its profile", async () => {
  const directory = await mkdtemp(join(tmpdir(), "skills-journals-link-"))
  try {
    const profile = join(directory, "profile")
    const output = join(directory, "evidence")
    const outside = join(directory, "outside.jsonl")
    await mkdir(profile)
    await writeFile(outside, '{"phase":"outside"}\n')
    await symlink(outside, join(profile, "execution-events.jsonl"))
    await expect(collectExecutionJournals(profile, output)).rejects.toThrow("SKILLS_JOURNAL_SYMLINK")
    expect(await readFile(outside, "utf8")).toBe('{"phase":"outside"}\n')
    expect((await readdir(directory)).sort()).toEqual(["outside.jsonl", "profile"])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("acceptance refuses an unredacted internal journal before persisting its contents", async () => {
  const directory = await mkdtemp(join(tmpdir(), "skills-journals-secret-"))
  try {
    const profile = join(directory, "profile")
    const output = join(directory, "evidence")
    await mkdir(profile)
    await writeFile(join(profile, "execution-events.jsonl"), JSON.stringify({ message: "private-fixture-secret" }) + "\n")
    await expect(collectExecutionJournals(profile, output, ["private-fixture-secret"])).rejects.toThrow("SKILLS_JOURNAL_SECRET")
    expect(await readdir(directory)).toEqual(["profile"])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
