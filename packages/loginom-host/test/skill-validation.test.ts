import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateSkillFolder } from "../src/bundled-skills"

test("validates and repairs a portable skill without writing to its tree", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-skill-validation-"))
  try {
    const directory = join(root, "check-columns")
    const header = "---\nname: check-columns\ndescription: Lists missing required columns before import.\n---\n"
    const skill = join(directory, "SKILL.md")
    await Bun.write(skill, header + "[Required columns](references/columns.md)\n")

    expect((await validateSkillFolder(directory)).errors).toEqual([
      expect.objectContaining({ code: "LOGINOM_SKILL_REQUIRED_RESOURCE_MISSING", path: "SKILL.md" }),
    ])
    const resource = join(directory, "references/columns.md")
    await Bun.write(resource, "id, amount\n")

    expect(await validateSkillFolder(directory)).toMatchObject({
      data: { name: "check-columns" },
      errors: [],
      warnings: [],
    })
    expect(await readdir(root)).toEqual(["check-columns"])
    expect((await readdir(directory)).toSorted()).toEqual(["SKILL.md", "references"])
    expect(await Bun.file(skill).text()).toBe(header + "[Required columns](references/columns.md)\n")
    expect(await Bun.file(resource).text()).toBe("id, amount\n")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("strict validation honors the exact frontmatter limits", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-skill-limits-"))
  try {
    const name = "a".repeat(64)
    const directory = join(root, name)
    const skill = join(directory, "SKILL.md")
    const description = "d".repeat(1024)
    const descriptionLine = `description: ${description}\n`
    const header = `---\nname: ${name}\n${descriptionLine}`
    await Bun.write(skill, header + `compatibility: ${"a".repeat(500)}\n---\n`)
    expect((await validateSkillFolder(directory)).errors).toEqual([])
    await Bun.write(skill, header.replace(descriptionLine, descriptionLine.trimEnd() + "d\n") + 'compatibility: ""\n---\n')
    expect((await validateSkillFolder(directory)).errors.map((entry) => entry.message)).toEqual([
      "Keep the description within 1024 characters.",
      "Compatibility must be text of 1–500 characters when provided.",
    ])
    const longName = name + "a"
    const longDirectory = join(root, longName)
    await Bun.write(join(longDirectory, "SKILL.md"), header.replace(name, longName) + "---\n")
    expect((await validateSkillFolder(longDirectory)).errors).toHaveLength(1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("external validation reports harmless extensions but rejects unsafe metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-skill-external-"))
  try {
    const name = "imported-skill"
    const directory = join(root, name)
    const skill = join(directory, "SKILL.md")
    const header = `---\nname: ${name}\ndescription: Imported skill.\n`
    await Bun.write(skill, header + "vendor: example\n---\n")
    const compatible = await validateSkillFolder(directory, { external: true })
    expect(compatible.errors).toEqual([])
    expect(compatible.warnings).toEqual([expect.objectContaining({ message: "Unrecognized YAML field: vendor" })])
    for (const invalid of [
      header.replace(name, "constructor"),
      header.replace(name, "check*columns"),
      header.replace("Imported skill.", "!!binary Qg=="),
      header.replace("Imported skill.", "*shared") + "metadata: &shared { label: example }\n",
    ]) {
      await Bun.write(skill, invalid + "---\n")
      expect((await validateSkillFolder(directory, { external: true })).errors).toEqual([
        expect.objectContaining({ code: "LOGINOM_SKILL_FRONTMATTER_INVALID" }),
      ])
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
