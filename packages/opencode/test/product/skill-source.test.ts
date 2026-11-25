import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { Effect } from "effect"
import { reservedSkillNames } from "@loginom-ai-agent/product/skills"
import { skillSource } from "../../src/product/skill-source"
import { tmpdir } from "../fixture/fixture"

const untrusted = ["builtin", "external", "project", "config", "url", undefined] as const

describe("skillSource", () => {
  test("an unreadable home catalog returns no replacement revision", async () => {
    await using tmp = await tmpdir()
    const home = join(tmp.path, "home")
    expect(await Effect.runPromise(skillSource.revision(home))).toBe("")
    await Bun.write(home, "The home path is no longer a directory.")
    expect(await Effect.runPromise(skillSource.revision(home))).toBeUndefined()
  })

  test("reserved names are admitted only from the bundled source", () => {
    for (const name of [...reservedSkillNames, "package_docs"]) {
      expect(skillSource.admits(name, "bundled")).toBe(true)
      for (const source of untrusted) expect(skillSource.admits(name, source)).toBe(false)
    }
  })

  test("ordinary names are admitted from every source", () => {
    for (const source of [...untrusted, "bundled" as const])
      expect(skillSource.admits("review-helper", source)).toBe(true)
  })

  test("only bundled skills with a reserved name run in the caller's session", () => {
    expect(skillSource.commandSubtask({ name: reservedSkillNames[0], source: "bundled" })).toBe(false)
    expect(skillSource.commandSubtask({ name: reservedSkillNames[0], source: "project" })).toBeUndefined()
    expect(skillSource.commandSubtask({ name: "review-helper", source: "bundled" })).toBeUndefined()
  })

  test("a missing bundled skill points at the resource path, an ordinary one does not", () => {
    expect(skillSource.notFoundHint(reservedSkillNames[0])).toContain("Verify the Loginom resource path")
    expect(skillSource.notFoundHint("review-helper")).toBe("")
  })
})
