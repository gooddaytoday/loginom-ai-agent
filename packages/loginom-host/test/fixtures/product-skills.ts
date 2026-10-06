import { cp } from "node:fs/promises"
import { join } from "node:path"
import { productSkillsDirectory } from "@loginom-ai-agent/product/skills"
import { resourceInventory } from "../../../loginom-runtime/src/resource-inventory.mjs"

// Real Product metadata, references, fonts and generated executor; reused by
// artifact fixtures without executing code from the artifact being inspected.
export async function copyProductSkillsFixture(resources: string) {
  await cp(productSkillsDirectory, join(resources, "skills"), { recursive: true })
  const builder = Bun.spawn([
    process.execPath,
    join(import.meta.dir, "../../script/build-package-docs.ts"),
    join(resources, "skills/package-docs/scripts"),
  ], { stdout: "pipe", stderr: "pipe" })
  const [output, error, code] = await Promise.all([
    new Response(builder.stdout).text(), new Response(builder.stderr).text(), builder.exited,
  ])
  if (code !== 0 || error || JSON.parse(output).script !== join(resources, "skills/package-docs/scripts/package-docs.mjs"))
    throw Error("LOGINOM_PRODUCT_SKILLS_FIXTURE_BUILD_FAILED: " + error)
  return (await resourceInventory(resources)).filter((file) => file.path.startsWith("skills/"))
}
