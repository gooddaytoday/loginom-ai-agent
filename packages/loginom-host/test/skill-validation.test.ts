import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readSkillDocument, validateSkillFolder } from "../src/bundled-skills"

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

test("strict validation checks reference links and ignores links shown as code", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-skill-links-"))
  try {
    const folder = join(root, "columns")
    await Bun.write(join(folder, "SKILL.md"), [
      "---", "name: columns", "description: Checks columns.", "---", "",
      "Read [the schema][schema].", "",
      "[schema]: references/columns.md", "",
      "```markdown", "[Example](placeholder.md)", "```",
    ].join("\n"))

    expect((await validateSkillFolder(folder)).errors.map((error) => error.message)).toEqual([
      "Missing local resource: references/columns.md",
    ])
    await Bun.write(join(folder, "references/columns.md"), "id, amount")
    expect((await validateSkillFolder(folder)).errors).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === "win32")("strict validation resolves references through internal directory links", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-skill-linked-directory-"))
  try {
    const folder = join(root, "columns")
    await Bun.write(join(folder, "SKILL.md"),
      "---\nname: columns\ndescription: Checks columns.\n---\n[Schema](references/columns.md)\n")
    await Bun.write(join(folder, "docs/columns.md"), "id, amount")
    await symlink("docs", join(folder, "references"))
    expect((await validateSkillFolder(folder)).errors).toEqual([])
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

test("rejects reserved names while returning the original Markdown body for discovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-skill-reserved-"))
  try {
    const name = "loginom-create-skill"
    const folder = join(root, name)
    const content = `---\r\nname: ${name}\r\ndescription: Example.\r\n---\r\n\r\n# Body\r\n`
    await Bun.write(join(folder, "SKILL.md"), content)
    expect(readSkillDocument(content)).toEqual({
      data: { name, description: "Example." },
      content: "\r\n# Body\r\n",
    })
    expect(readSkillDocument("Missing frontmatter")).toBeUndefined()
    expect((await validateSkillFolder(folder, { external: true })).errors).toMatchObject([
      { code: "LOGINOM_SKILL_NAME_RESERVED", path: "SKILL.md" },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("reports the exact unreadable resource when it disappears during read approval", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-skill-unreadable-"))
  try {
    const folder = join(root, "columns")
    expect((await validateSkillFolder(folder)).errors).toMatchObject([
      { code: "LOGINOM_SKILL_FOLDER_UNREADABLE" },
    ])
    const skill = join(folder, "SKILL.md")
    const schema = join(folder, "references/schema.md")
    await Bun.write(skill, "---\nname: columns\ndescription: Checks columns.\n---\n[Schema](references/schema.md)\n")
    await Bun.write(schema, "id, amount")
    expect((await validateSkillFolder(folder, {
      async authorizeRead(paths) {
        expect(paths).toContain(skill)
        expect(paths).toContain(schema)
        await rm(schema)
      },
    })).errors).toMatchObject([
      { code: "LOGINOM_SKILL_FOLDER_UNREADABLE", path: "references/schema.md" },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("reports a malformed percent escape in a relative Markdown link", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-skill-invalid-link-"))
  try {
    const folder = join(root, "columns")
    await Bun.write(join(folder, "SKILL.md"),
      "---\nname: columns\ndescription: Checks columns.\n---\n[Schema](references/100%complete.md)\n")
    expect((await validateSkillFolder(folder)).errors).toMatchObject([
      { code: "LOGINOM_SKILL_RESOURCE_ESCAPE", path: "SKILL.md" },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === "win32")("rejects a reference to shared files outside the portable folder", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-skill-shared-link-"))
  try {
    const folder = join(root, "columns")
    const references = join(folder, "references")
    await Bun.write(join(folder, "SKILL.md"),
      "---\nname: columns\ndescription: Checks columns.\n---\n[Schema](references/columns.md)\n")
    await Bun.write(join(folder, "docs/columns.md"), "id, amount")
    await Bun.write(join(root, "shared/columns.md"), "Shared project schema")
    await symlink("docs", references)
    expect((await validateSkillFolder(folder, {
      async authorizeRead() {
        await rm(references)
        await symlink("../shared", references)
      },
    })).errors).toMatchObject([
      { code: "LOGINOM_SKILL_RESOURCE_ESCAPE", path: "SKILL.md" },
    ])
    expect((await validateSkillFolder(folder)).errors).toMatchObject([
      { code: "LOGINOM_SKILL_RESOURCE_ESCAPE", path: "references" },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
