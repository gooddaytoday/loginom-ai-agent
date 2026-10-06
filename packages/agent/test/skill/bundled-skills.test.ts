import { afterAll, expect, test } from "bun:test"
import { cp, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Layer } from "effect"
import { LayerNode } from "@loginom-ai-agent/core/effect/layer-node"
import { CrossSpawnSpawner } from "@loginom-ai-agent/core/cross-spawn-spawner"
import { Skill } from "../../src/skill"
import { Command } from "../../src/command"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { productSkillsDirectory, reservedSkillNames } from "@loginom-ai-agent/product/skills"
import { ConfigMarkdown } from "../../src/config/markdown"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Session } from "../../src/session/session"
import { MCP } from "../../src/mcp"
import { Global } from "@loginom-ai-agent/core/global"
import { resourceInventory } from "../../../loginom-runtime/src/resource-inventory.mjs"
import { verifyBundledSkills } from "@loginom-ai-agent/loginom-host/bundled-skills"

test("the product has one canonical directory for each shipped skill", async () => {
  const directories = (await readdir(productSkillsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted()
  expect(directories).toEqual([...reservedSkillNames].toSorted())
})

test("shipped skill metadata conforms to the Agent Skills specification", async () => {
  for (const name of reservedSkillNames) {
    const skill = await ConfigMarkdown.parse(join(productSkillsDirectory, name, "SKILL.md"))
    expect(skill.data.name, `${name}/SKILL.md: name must match its directory`).toBe(name)
    expect(name.length, `${name}: name must be at most 64 characters`).toBeLessThanOrEqual(64)
    expect(name, `${name}: use lowercase letters, digits and single internal hyphens`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(typeof skill.data.description, `${name}/SKILL.md: description must be a nonempty string`).toBe("string")
    expect(skill.data.description.trim().length).toBeGreaterThan(0)
    expect(skill.data.description.length).toBeLessThanOrEqual(1024)
    expect(typeof skill.data.compatibility).toBe("string")
    expect(skill.data.compatibility.length).toBeLessThanOrEqual(500)
    const supported = ["name", "description", "compatibility", "license", "metadata", "allowed-tools"]
    expect(Object.keys(skill.data).filter((key) => !supported.includes(key)), `${name}/SKILL.md: remove unsupported frontmatter fields`).toEqual([])
  }
})

test("package documentation declares its generated Node executor and describes the restricted product workflow", async () => {
  const skill = await ConfigMarkdown.parse(join(productSkillsDirectory, "package-docs/SKILL.md"))
  expect(skill.data.metadata?.["loginom-generated"]).toBe("scripts/package-docs.mjs")
  expect(skill.content).toContain("package_docs_run")
  expect(skill.content).not.toMatch(/python3|scripts\/\S+\.py/)
  expect(skill.content).toContain("assets/fonts/GolosText-Regular.ttf")
  expect(skill.content).toContain("assets/fonts/GolosText-Bold.ttf")
  expect(skill.content).toContain("assets/fonts/OFL.txt")
  expect(skill.content.split("\n").length).toBeLessThan(500)
  expect((await readdir(join(productSkillsDirectory, "package-docs"), { recursive: true })).filter((file) => file.endsWith(".py"))).toEqual([])
})

const resources = await mkdtemp(join(tmpdir(), "loginom-bundled-skills-"))
const content = await readFile(join(productSkillsDirectory, "package-docs/SKILL.md"), "utf8")
await cp(productSkillsDirectory, join(resources, "skills"), { recursive: true })
const builder = Bun.spawn(
  [
    process.execPath,
    join(import.meta.dir, "../../../loginom-host/script/build-package-docs.ts"),
    join(resources, "skills/package-docs/scripts"),
  ],
  { stdout: "pipe", stderr: "pipe" },
)
const stdout = new Response(builder.stdout).text(),
  stderr = new Response(builder.stderr).text()
expect(await builder.exited).toBe(0)
expect(await stderr).toBe("")
expect(JSON.parse(await stdout).script).toBe(join(resources, "skills/package-docs/scripts/package-docs.mjs"))
await Bun.write(
  join(resources, "resource-manifest.json"),
  JSON.stringify({
    protocol: 1,
    files: await resourceInventory(resources),
  }),
)
afterAll(() => rm(resources, { recursive: true, force: true }))

test("the product source catalog has all linked resources except declared generated files", async () => {
  const source = await mkdtemp(join(tmpdir(), "loginom-source-skills-"))
  try {
    await cp(productSkillsDirectory, join(source, "skills"), { recursive: true })
    await Bun.write(join(source, "resource-manifest.json"), JSON.stringify({ protocol: 1, files: await resourceInventory(source) }))
    expect(await Bun.file(join(source, "skills/package-docs/scripts/package-docs.mjs")).exists()).toBe(false)
    const skills = await verifyBundledSkills(source, { mode: "source" }).catch((error: unknown) => {
      throw Error("Product skills: fix SKILL.md fields and relative references inside each skill; add missing assets or declare the generated file in metadata.loginom-generated. " + String(error))
    })
    expect(skills.map((skill) => skill.name).toSorted()).toEqual([...reservedSkillNames].toSorted())
  } finally {
    await rm(source, { recursive: true, force: true })
  }
})

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(LayerNode.group([Command.node, Skill.node, EventV2Bridge.node, MCP.node, Global.node]), [[RuntimeFlags.node, RuntimeFlags.layer({ loginomResources: resources })]]),
    LayerNode.compile(CrossSpawnSpawner.node),
    testInstanceStoreLayer,
  ),
)

it.live("discovers a verified bundled skill outside the source checkout", () =>
  provideTmpdirInstance(() =>
    Effect.gen(function* () {
      const skills = yield* Skill.Service
      for (const name of reservedSkillNames) {
        const skill = yield* skills.require(name)
        expect(skill.source).toBe("bundled")
        expect(skill.location).toBe(join(resources, "skills", name, "SKILL.md"))
        expect(skill.digest).toMatch(/^[a-f0-9]{64}$/)
      }
      const commands = yield* Command.Service
      for (const name of reservedSkillNames) {
        const command = yield* commands.get(name)
        expect(command?.source).toBe("skill")
        expect(command?.template).toContain(`Base directory for this skill: ${join(resources, "skills", name)}`)
      }
      for (const name of ["loginom-scenario", "loginom", "package_docs"]) expect(yield* commands.get(name)).toBeUndefined()
      const docs = (yield* skills.all()).find((skill) => skill.name === "package-docs")
      expect(docs).toBeDefined()
      expect(docs?.location).toBe(join(resources, "skills/package-docs/SKILL.md"))
      expect(docs?.source).toBe("bundled")
      expect(docs?.digest).toMatch(/^[a-f0-9]{64}$/)
      expect(docs?.content).toContain("# package-docs")
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

it.live("all local discovery roots reject product and obsolete skill names with user diagnostics", () =>
  provideTmpdirInstance((directory) =>
    Effect.gen(function* () {
      const global = yield* Global.Service
      const token = `reserved-scan-${crypto.randomUUID()}`
      const roots = [
        join(global.home, ".claude/skills", token),
        join(global.home, ".agents/skills", token),
        join(directory, ".claude/skills", token),
        join(directory, ".agents/skills", token),
        join(directory, ".loginom-ai-agent/skill", token),
        join(directory, ".loginom-ai-agent/skills", token),
        join(directory, "configured-skills", token),
      ]
      yield* Effect.addFinalizer(() => Effect.promise(() =>
        Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))),
      ))
      const names = [...reservedSkillNames, "package_docs"]
      yield* Effect.promise(() => Promise.all(roots.flatMap((root) => names.map((name) =>
        Bun.write(join(root, name, "SKILL.md"),
          `---\nname: ${name}\ndescription: External replacement.\n---\n\nUNTRUSTED LOCAL SOURCE\n`),
      ))))
      yield* Effect.promise(() => Bun.write(join(directory, "loginom-ai-agent.json"),
        JSON.stringify({ skills: { paths: [join(directory, "configured-skills")] } }),
      ))
      const events = yield* EventV2Bridge.Service
      const warnings: string[] = []
      const off = yield* events.listen((event) => {
        if (event.type === Session.Event.Error.type) warnings.push(JSON.stringify(event.data))
        return Effect.void
      })
      yield* Effect.addFinalizer(() => off)
      const skills = yield* Skill.Service
      const commands = yield* Command.Service
      for (const name of reservedSkillNames) {
        expect((yield* skills.require(name)).source).toBe("bundled")
        expect((yield* commands.get(name))?.source).toBe("skill")
      }
      expect(yield* skills.get("package_docs")).toBeUndefined()
      expect(yield* commands.get("package_docs")).toBeUndefined()
      expect(warnings.filter((warning) => warning.includes("reserved")).length).toBe(roots.length * names.length)
    }),
    { git: true },
  ),
)

it.live("downloaded skills cannot claim reserved names or create obsolete commands", () =>
  provideTmpdirInstance((directory) =>
    Effect.gen(function* () {
      const names = [...reservedSkillNames, "package_docs"]
      const entries = names.map((name) => ({ name: `download-${crypto.randomUUID()}`, declared: name }))
      const requests: string[] = []
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
          const path = new URL(request.url).pathname
          requests.push(path)
          if (path === "/index.json") return Response.json({
            skills: entries.map((entry) => ({ name: entry.name, files: ["SKILL.md"] })),
          })
          const entry = entries.find((entry) => path === `/${entry.name}/SKILL.md`)
          return entry
            ? new Response(`---\nname: ${entry.declared}\ndescription: Downloaded replacement.\n---\n\nUNTRUSTED URL SOURCE\n`)
            : new Response("Not found", { status: 404 })
        },
      })
      yield* Effect.addFinalizer(() => Effect.promise(() => server.stop(true)))
      yield* Effect.promise(() => Bun.write(join(directory, "loginom-ai-agent.json"),
        JSON.stringify({ skills: { urls: [server.url.href] } }),
      ))
      const skills = yield* Skill.Service
      const commands = yield* Command.Service
      for (const name of reservedSkillNames) {
        expect((yield* skills.require(name)).source).toBe("bundled")
        expect((yield* commands.get(name))?.source).toBe("skill")
      }
      expect(yield* skills.get("package_docs")).toBeUndefined()
      expect(yield* commands.get("package_docs")).toBeUndefined()
      expect(requests.toSorted()).toEqual(["/index.json", ...entries.map((entry) => `/${entry.name}/SKILL.md`)].toSorted())
    }),
    { git: true },
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
      expect(yield* skills.dirs()).toHaveLength(3)
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

for (const name of ["package-docs", "loginom-automation", "package_docs"]) {
  it.live(`a configured command cannot claim the reserved name ${name}`, () =>
    provideTmpdirInstance((directory) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          Bun.write(join(directory, "loginom-ai-agent.json"), JSON.stringify({
            command: { [name]: { template: "UNTRUSTED COMMAND", description: "External replacement." } },
          })),
        )
        const events = yield* EventV2Bridge.Service
        const warnings: string[] = []
        const off = yield* events.listen((event) => {
          if (event.type === Session.Event.Error.type) warnings.push(JSON.stringify(event.data))
          return Effect.void
        })
        yield* Effect.addFinalizer(() => off)
        const commands = yield* Command.Service
        const command = yield* commands.get(name)
        if (name === "package_docs") expect(command).toBeUndefined()
        else {
          expect(command?.source).toBe("skill")
          expect(yield* Effect.promise(() => Promise.resolve(command?.template))).not.toContain("UNTRUSTED")
        }
        expect(warnings.some((warning) => warning.includes(`'${name}'`) && warning.includes("reserved"))).toBe(true)
      }),
    ),
  )
}

it.live("ordinary configured commands retain precedence over ordinary project skills", () =>
  provideTmpdirInstance((directory) =>
    Effect.gen(function* () {
      yield* Effect.promise(() => Bun.write(join(directory, "loginom-ai-agent.json"), JSON.stringify({
        command: { sample: { template: "CONFIGURED TEMPLATE", description: "Configured sample." } },
      })))
      yield* Effect.promise(() => Bun.write(join(directory, ".agents/skills/sample/SKILL.md"),
        "---\nname: sample\ndescription: Ordinary project skill.\n---\n\nPROJECT SKILL TEMPLATE\n"))
      const commands = yield* Command.Service
      expect((yield* commands.get("sample"))?.source).toBe("command")
      expect((yield* commands.get("sample"))?.template).toBe("CONFIGURED TEMPLATE")
    }),
  ),
)

it.live("real MCP prompts keep their namespace and do not replace bundled commands", () =>
  provideTmpdirInstance(() =>
    Effect.gen(function* () {
      const mcp = yield* MCP.Service
      yield* mcp.add("external", {
        type: "local",
        command: [process.execPath, join(import.meta.dir, "../fixture/mcp-reserved-prompts.ts")],
      })
      expect((yield* mcp.status()).external?.status).toBe("connected")
      const commands = yield* Command.Service
      for (const name of ["package-docs", "loginom-automation", "package_docs", "sample"]) {
        const external = yield* commands.get(`external:${name}`)
        expect(external?.source).toBe("mcp")
        expect(yield* Effect.promise(() => Promise.resolve(external?.template))).toBe(`EXTERNAL MCP ${name}`)
      }
      for (const name of reservedSkillNames) expect((yield* commands.get(name))?.source).toBe("skill")
      expect(yield* commands.get("package_docs")).toBeUndefined()
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
      yield* Effect.promise(() => Bun.write(join(directory, "loginom-ai-agent.json"), JSON.stringify({
        command: { "package-docs": { template: "UNTRUSTED FALLBACK" }, package_docs: { template: "OBSOLETE FALLBACK" } },
      })))
      yield* Effect.promise(() => Bun.write(join(resources, "skills/package-docs/SKILL.md"), content + "tampered"))
      const skills = yield* Skill.Service
      expect(yield* skills.get("package-docs")).toBeUndefined()
      expect((yield* skills.all()).some((skill) => skill.name === "package-docs")).toBe(false)
      const commands = yield* Command.Service
      expect(yield* commands.get("package-docs")).toBeUndefined()
      expect(yield* commands.get("package_docs")).toBeUndefined()
    }).pipe(Effect.ensuring(Effect.promise(() => Bun.write(join(resources, "skills/package-docs/SKILL.md"), content)))),
  ),
)
