import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { verifyBundledSkills } from "../src/bundled-skills"

async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "loginom-skill-integrity-"))
  for (const [path, content] of Object.entries(files)) await Bun.write(join(root, "skills", path), content)
  await writeFile(
    join(root, "resource-manifest.json"),
    JSON.stringify({
      protocol: 1,
      files: Object.entries(files).map(([path, content]) => ({
        path: "skills/" + path,
        sha256: createHash("sha256").update(content).digest("hex"),
      })),
    }),
  )
  return { root, [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }) }
}

test("bundled skill verification rejects files omitted from the resource manifest", async () => {
  await using resource = await fixture({
    "package-docs/SKILL.md": "---\nname: package-docs\ndescription: Documentation.\n---\n\n# Docs\n",
  })
  expect(await verifyBundledSkills(resource.root)).toHaveLength(1)
  await writeFile(join(resource.root, "skills/package-docs/unlisted.mjs"), "unlisted executable")
  await expect(verifyBundledSkills(resource.root)).rejects.toThrow("LOGINOM_SKILL_UNMANIFESTED_FILE")
})
