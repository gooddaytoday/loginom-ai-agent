import assert from "node:assert/strict"
import test from "node:test"
import { checkBundledSkills } from "./windows-sidecar-smoke.mjs"

const resources = "C:\\lab\\run\\installed\\resources\\loginom"

const names = ["loginom-automation", "package-docs"]

const manifest = { files: names.map((name) => ({ path: `skills/${name}/SKILL.md` })) }

const skill = (name, path = `${resources}\\skills\\${name}\\SKILL.md`) => ({
  id: name,
  name,
  path,
  content: `# ${name}`,
})

const catalog = names.map((name) => skill(name))

test("the service's catalog has exactly the installed manifest's skills from the installed directory", () => {
  assert.deepEqual(checkBundledSkills(manifest, [...catalog].reverse(), resources), { expected: names, actual: names })
  assert.deepEqual(
    checkBundledSkills(manifest, catalog, resources.toUpperCase().replaceAll("\\", "/") + "/").actual,
    names,
  )
  assert.throws(() => checkBundledSkills(manifest, [], resources))
  assert.throws(() => checkBundledSkills(manifest, catalog.slice(0, 1), resources))
  assert.throws(() => checkBundledSkills(manifest, [catalog[0], catalog[0]], resources))
  assert.throws(() => checkBundledSkills(manifest, [...catalog, skill("unexpected")], resources))
  assert.throws(() => checkBundledSkills({ files: manifest.files.slice(1) }, catalog.slice(1), resources))
})

test("a user's or built-in skill of the same name does not stand in for an installed one", () => {
  for (const path of [
    "C:\\Users\\user\\.config\\loginom-ai-agent\\skills\\package-docs\\SKILL.md",
    "skill://package-docs/SKILL.md",
    "C:\\lab\\run\\installed\\resources\\loginom-copy\\skills\\package-docs\\SKILL.md",
  ])
    assert.throws(() => checkBundledSkills(manifest, [catalog[0], skill("package-docs", path)], resources))
  assert.throws(() => checkBundledSkills(manifest, [catalog[0], { ...catalog[1], content: " " }], resources))
  assert.throws(() =>
    checkBundledSkills(
      manifest,
      [catalog[0], skill("package-docs", `${resources}\\skills\\other\\SKILL.md`)],
      resources,
    ),
  )
  const user = skill("own-skill", "C:\\Users\\user\\.config\\loginom-ai-agent\\skills\\own-skill\\SKILL.md")
  assert.deepEqual(checkBundledSkills(manifest, [...catalog, user], resources).actual, names)
})
