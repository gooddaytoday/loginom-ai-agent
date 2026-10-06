import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, join } from "node:path"
import { verifyBundledSkills } from "../src/bundled-skills"
import { resourceInventory } from "../../loginom-runtime/src/resource-inventory.mjs"

async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "loginom-skill-integrity-"))
  for (const [path, content] of Object.entries(files)) await Bun.write(join(root, "skills", path), content)
  await writeFile(
    join(root, "resource-manifest.json"),
    JSON.stringify({
      protocol: 1,
      files: await resourceInventory(root),
    }),
  )
  return { root, [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }) }
}

test("Host and pinned Node compute the same revision for a bundled skill", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node || !isAbsolute(node)) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  await using resource = await fixture({
    "loginom-automation/SKILL.md": "---\nname: loginom-automation\ndescription: Build.\n---\n\n[Справка](references/связь.md)\n",
    "loginom-automation/references/связь.md": "Русская справка\n",
  })
  const verified = await verifyBundledSkills(resource.root)
  const child = Bun.spawn([node, "--input-type=module", "--eval", `
    import { verifyBundledSkills } from ${JSON.stringify(new URL("../../loginom-runtime/client/lib/bundled-skill-manifest.mjs", import.meta.url).href)};
    const skills = await verifyBundledSkills(process.argv[1]);
    process.stdout.write(skills[0].digest);
  `, resource.root], { env: {}, stdout: "pipe", stderr: "pipe" })
  const output = await new Response(child.stdout).text()
  expect(await child.exited).toBe(0)
  expect(output).toBe(verified[0].digest)
})

test("bundled skill verification rejects files omitted from the resource manifest", async () => {
  await using resource = await fixture({
    "package-docs/SKILL.md": "---\nname: package-docs\ndescription: Documentation.\n---\n\n# Docs\n",
  })
  expect(await verifyBundledSkills(resource.root)).toHaveLength(1)
  await writeFile(join(resource.root, "skills/package-docs/unlisted.mjs"), "unlisted executable")
  await expect(verifyBundledSkills(resource.root)).rejects.toThrow("LOGINOM_SKILL_UNMANIFESTED_FILE")
})

test("bundled skill verification rejects a missing resource linked by a reference", async () => {
  await using resource = await fixture({
    "package-docs/SKILL.md": "---\nname: package-docs\ndescription: Documentation.\n---\n\n[Template](references/template.md)\n",
    "package-docs/references/template.md": "[Font](../assets/GolosText-Regular.ttf)\n",
  })
  await expect(verifyBundledSkills(resource.root)).rejects.toThrow("LOGINOM_SKILL_REQUIRED_RESOURCE_MISSING")
})

test("changed skill bytes and missing inventoried assets fail verification", async () => {
  await using changed = await fixture({
    "package-docs/SKILL.md": "---\nname: package-docs\ndescription: Docs.\n---\n\n# Docs\n",
  })
  await writeFile(join(changed.root, "skills/package-docs/SKILL.md"), "modified instructions")
  await expect(verifyBundledSkills(changed.root)).rejects.toThrow("LOGINOM_SKILL_HASH_MISMATCH")

  await using missing = await fixture({
    "package-docs/SKILL.md": "---\nname: package-docs\ndescription: Docs.\n---\n\n[Font](assets/font.ttf)\n",
    "package-docs/assets/font.ttf": "font bytes",
  })
  await rm(join(missing.root, "skills/package-docs/assets/font.ttf"))
  await expect(verifyBundledSkills(missing.root)).rejects.toThrow()
})

test("generated executables declared in metadata must be present in the manifest", async () => {
  await using resource = await fixture({
    "package-docs/SKILL.md": "---\nname: package-docs\ndescription: Docs.\nmetadata:\n  loginom-generated: scripts/package-docs.mjs\n---\n\n# Docs\n",
  })
  await expect(verifyBundledSkills(resource.root)).rejects.toThrow("LOGINOM_SKILL_REQUIRED_RESOURCE_MISSING")
})

test("verified skill references cannot escape into another skill", async () => {
  await using resource = await fixture({
    "package-docs/SKILL.md": "---\nname: package-docs\ndescription: Docs.\n---\n\n[Other skill](../loginom-automation/SKILL.md)\n",
    "loginom-automation/SKILL.md": "---\nname: loginom-automation\ndescription: Build.\n---\n\n# Build\n",
  })
  await expect(verifyBundledSkills(resource.root)).rejects.toThrow("LOGINOM_SKILL_RESOURCE_ESCAPE")
})

test("canonical resource escapes are rejected before reading a symlink target", async () => {
  await using resource = await fixture({
    "package-docs/SKILL.md": "---\nname: package-docs\ndescription: Docs.\n---\n\n# Docs\n",
  })
  await using external = await fixture({})
  const outside = join(external.root, "outside.md")
  await writeFile(outside, "original outside content")
  await rm(join(resource.root, "skills/package-docs/SKILL.md"))
  await symlink(outside, join(resource.root, "skills/package-docs/SKILL.md"))
  await expect(verifyBundledSkills(resource.root)).rejects.toThrow("LOGINOM_SKILL_RESOURCE_ESCAPE")
  expect(await readFile(outside, "utf8")).toBe("original outside content")
})

test("a skill revision is unaffected by changes in a different skill or manifest order", async () => {
  const automation = "---\nname: loginom-automation\ndescription: Build.\n---\n\n# Build\n"
  await using original = await fixture({
    "loginom-automation/SKILL.md": automation,
    "package-docs/SKILL.md": "---\nname: package-docs\ndescription: Docs.\n---\n\n# First docs\n",
  })
  await using changed = await fixture({
    "package-docs/SKILL.md": "---\nname: package-docs\ndescription: Docs.\n---\n\n# Updated docs\n",
    "loginom-automation/SKILL.md": automation,
  })
  const before = await verifyBundledSkills(original.root)
  const after = await verifyBundledSkills(changed.root)
  expect(after.find((skill) => skill.name === "loginom-automation")?.digest).toBe(
    before.find((skill) => skill.name === "loginom-automation")?.digest,
  )
  expect(after.find((skill) => skill.name === "package-docs")?.digest).not.toBe(
    before.find((skill) => skill.name === "package-docs")?.digest,
  )
})
