import { afterAll, expect } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Layer } from "effect"
import { LayerNode } from "@loginom-ai-agent/core/effect/layer-node"
import { CrossSpawnSpawner } from "@loginom-ai-agent/core/cross-spawn-spawner"
import { Skill } from "../../src/skill"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const resources = await mkdtemp(join(tmpdir(), "loginom-bundled-skills-"))
const content = "---\nname: package-docs\ndescription: Документация локального пакета Loginom.\n---\n\n# Документация\n"
await Bun.write(join(resources, "skills/package-docs/SKILL.md"), content)
await Bun.write(
  join(resources, "resource-manifest.json"),
  JSON.stringify({
    protocol: 1,
    files: [{ path: "skills/package-docs/SKILL.md", sha256: createHash("sha256").update(content).digest("hex") }],
  }),
)
afterAll(() => rm(resources, { recursive: true, force: true }))

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(Skill.node, [[RuntimeFlags.node, RuntimeFlags.layer({ loginomResources: resources })]]),
    LayerNode.compile(CrossSpawnSpawner.node),
    testInstanceStoreLayer,
  ),
)

it.live("discovers a verified bundled skill outside the source checkout", () =>
  provideTmpdirInstance(() =>
    Effect.gen(function* () {
      const skills = yield* Skill.Service
      const docs = (yield* skills.all()).find((skill) => skill.name === "package-docs")
      expect(docs).toBeDefined()
      expect(docs?.location).toBe(join(resources, "skills/package-docs/SKILL.md"))
      expect(docs?.source).toBe("bundled")
      expect(docs?.digest).toMatch(/^[a-f0-9]{64}$/)
      expect(docs?.content).toContain("# Документация")
      expect(yield* skills.dirs()).toContain(join(resources, "skills/package-docs"))
    }),
  ),
)

it.live("a project skill cannot replace the reserved bundled package-docs skill", () =>
  provideTmpdirInstance((directory) =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        Bun.write(
          join(directory, ".agents/skills/package-docs/SKILL.md"),
          "---\nname: package-docs\ndescription: Project replacement.\n---\n\nUNTRUSTED PROJECT CONTENT\n",
        ),
      )
      const skills = yield* Skill.Service
      const docs = yield* skills.require("package-docs")
      expect(docs.source).toBe("bundled")
      expect(docs.location).toBe(join(resources, "skills/package-docs/SKILL.md"))
      expect(docs.content).not.toContain("UNTRUSTED")
      expect((yield* skills.all()).filter((skill) => skill.name === "package-docs")).toHaveLength(1)
    }),
  ),
)

it.live("the same skill realpath is discovered only once through two configured paths", () =>
  provideTmpdirInstance((directory) =>
    Effect.gen(function* () {
      const source = join(directory, "custom-skills")
      const alias = join(directory, "alias-skills")
      yield* Effect.promise(() =>
        Bun.write(join(source, "sample/SKILL.md"), "---\nname: sample\ndescription: A custom skill.\n---\n\n# Custom\n"),
      )
      yield* Effect.promise(() => symlink(source, alias, process.platform === "win32" ? "junction" : "dir"))
      yield* Effect.promise(() =>
        Bun.write(join(directory, "loginom-ai-agent.json"), JSON.stringify({ skills: { paths: [source, alias] } })),
      )
      const skills = yield* Skill.Service
      expect((yield* skills.all()).filter((skill) => skill.name === "sample")).toHaveLength(1)
      expect(yield* skills.dirs()).toHaveLength(2)
      expect((yield* skills.require("sample")).location).toBe(join(source, "sample/SKILL.md"))
    }),
  ),
)

it.live("an ordinary project skill retains its source provenance", () =>
  provideTmpdirInstance((directory) =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        Bun.write(join(directory, ".agents/skills/sample/SKILL.md"), "---\nname: sample\ndescription: Project skill.\n---\n\n# Sample\n"),
      )
      const skills = yield* Skill.Service
      expect((yield* skills.require("sample")).source).toBe("project")
    }),
  ),
)

it.live("the later configured source wins for an ordinary skill name", () =>
  provideTmpdirInstance((directory) =>
    Effect.gen(function* () {
      const earlier = join(directory, "earlier")
      const later = join(directory, "later")
      yield* Effect.promise(() =>
        Bun.write(join(earlier, "sample/SKILL.md"), "---\nname: sample\ndescription: Earlier source.\n---\n\n# Earlier\n"),
      )
      yield* Effect.promise(() =>
        Bun.write(join(later, "sample/SKILL.md"), "---\nname: sample\ndescription: Later source.\n---\n\n# Later\n"),
      )
      yield* Effect.promise(() =>
        Bun.write(join(directory, "loginom-ai-agent.json"), JSON.stringify({ skills: { paths: [earlier, later] } })),
      )
      const skills = yield* Skill.Service
      const sample = yield* skills.require("sample")
      expect(sample.description).toBe("Later source.")
      expect(sample.location).toBe(join(later, "sample/SKILL.md"))
      expect(sample.source).toBe("config")
    }),
  ),
)

it.live("a changed bundled file is not registered and cannot fall back to a project copy", () =>
  provideTmpdirInstance((directory) =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        Bun.write(join(directory, ".agents/skills/package-docs/SKILL.md"), content),
      )
      yield* Effect.promise(() => Bun.write(join(resources, "skills/package-docs/SKILL.md"), content + "tampered"))
      const skills = yield* Skill.Service
      expect(yield* skills.get("package-docs")).toBeUndefined()
      expect((yield* skills.all()).some((skill) => skill.name === "package-docs")).toBe(false)
    }).pipe(Effect.ensuring(Effect.promise(() => Bun.write(join(resources, "skills/package-docs/SKILL.md"), content)))),
  ),
)
