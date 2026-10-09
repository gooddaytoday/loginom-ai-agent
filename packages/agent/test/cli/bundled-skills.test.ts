import { expect, test } from "bun:test"
import { appendFile, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { standaloneFixture, invoke } from "../fixture/standalone"
import { testProviderConfig } from "../lib/test-provider"

type Request = {
  tools?: { function: { name: string } }[]
  messages: { role: string; tool_call_id?: string; content?: unknown }[]
}

test.each(["clean", "reserved", "reserved-command", "modified", "missing", "unlisted", "wrong-root"] as const)(
  "standalone discovers trusted skills with %s sources",
  async (kind) => {
    await using fixture = await standaloneFixture(process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN)
    const workspace = join(fixture.directory, "workspace")
    const resources =
      fixture.binary && kind === "clean" ? resolve(dirname(fixture.binary), "../resources/loginom") : fixture.bundle
    const external = kind !== "clean"
    const broken = kind === "modified" || kind === "missing" || kind === "unlisted"
    await mkdir(workspace)
    expect(await readdir(workspace)).toEqual([])
    const requests: Request[] = []
    const provider = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const body: Request = await request.json()
        const activate = body.tools?.length && !body.messages.some((message) => message.tool_call_id === "activate")
        if (body.tools?.length) requests.push(body)
        const delta = activate
          ? {
              tool_calls: [
                {
                  index: 0,
                  id: "activate",
                  type: "function",
                  function: {
                    name: "skill",
                    arguments: JSON.stringify({ name: "package-docs" }),
                  },
                },
              ],
            }
          : { content: "Каталог проверен." }
        return new Response(
          [
            { choices: [{ index: 0, delta, finish_reason: null }] },
            { choices: [{ index: 0, delta: {}, finish_reason: activate ? "tool_calls" : "stop" }] },
          ]
            .map(
              (chunk) =>
                `data: ${JSON.stringify({ id: "bundled-discovery", object: "chat.completion.chunk", ...chunk })}\n\n`,
            )
            .join("") + "data: [DONE]\n\n",
          { headers: { "content-type": "text/event-stream" } },
        )
      },
    })
    try {
      if (kind === "modified") await appendFile(join(fixture.bundle, "skills/package-docs/SKILL.md"), "\nTAMPERED\n")
      if (kind === "missing") await rm(join(fixture.bundle, "skills/package-docs/SKILL.md"))
      if (kind === "unlisted") await writeFile(join(fixture.bundle, "skills/package-docs/not-indexed.txt"), "UNLISTED")
      const earlier = join(fixture.directory, "earlier")
      const later = join(fixture.directory, "later")
      const alias = join(fixture.directory, "alias")
      if (external) {
        for (const root of [
          join(workspace, ".claude/skills"),
          join(workspace, ".agents/skills"),
          join(workspace, "home/.claude/skills"),
          join(workspace, "home/.agents/skills"),
          join(fixture.profile, "config/skills"),
          earlier,
          later,
        ]) {
          for (const name of ["package-docs", "loginom-automation", "package_docs"]) {
            await mkdir(join(root, name), { recursive: true })
            await writeFile(
              join(root, name, "SKILL.md"),
              `---\nname: ${name}\ndescription: UNTRUSTED replacement.\n---\n\nUNTRUSTED BODY\n`,
            )
          }
        }
        for (const [root, description] of [
          [earlier, "Earlier source."],
          [later, "Later source."],
        ]) {
          await mkdir(join(root, "sample"))
          await writeFile(
            join(root, "sample/SKILL.md"),
            `---\nname: sample\ndescription: ${description}\n---\n\n# Sample\n`,
          )
        }
        await symlink(later, alias, "dir")
      }
      await writeFile(
        join(fixture.profile, "config/loginom-ai-agent.json"),
        JSON.stringify({
          ...testProviderConfig(`http://127.0.0.1:${provider.port}/v1`),
          permission: { skill: "allow" },
          ...(external
            ? {
                skills: { paths: [earlier, later, alias] },
                command: Object.fromEntries(
                  ["package-docs", "loginom-automation", "package_docs"].map((name) => [
                    name,
                    { template: "UNTRUSTED COMMAND" },
                  ]),
                ),
              }
            : {}),
        }),
      )
      const result = await invoke(
        { ...fixture, directory: workspace },
        [...(kind === "reserved-command" ? ["--command", "package-docs"] : []), "--", "Проверь каталог skills."],
        undefined,
        {
          PATH: "/nonexistent",
          ...(fixture.binary && kind === "clean" ? { LOGINOM_AI_AGENT_CLI_BUNDLE: undefined } : {}),
          ...(kind === "wrong-root" ? { LOGINOM_AI_AGENT_CLI_BUNDLE: join(fixture.directory, "missing-root") } : {}),
        },
      )
      if (process.env.LOGINOM_AI_AGENT_TEST_ARTIFACTS) {
        const evidence = join(process.env.LOGINOM_AI_AGENT_TEST_ARTIFACTS, kind)
        await mkdir(evidence, { mode: 0o700 })
        await writeFile(
          join(evidence, "evidence.json"),
          JSON.stringify({ binary: fixture.binary, workspace, resources, result, requests }, null, 2),
        )
      }
      if (kind === "wrong-root") {
        expect(result.exit).toBe(1)
        expect(requests).toEqual([])
        expect(result.events).toContainEqual(
          expect.objectContaining({
            type: "error",
            error: { name: "LOGINOM_BUNDLE_INCOMPLETE", data: { message: "LOGINOM_BUNDLE_INCOMPLETE" } },
          }),
        )
        expect(await readdir(fixture.profile)).not.toContain(".writer")
        return
      }
      expect(result.exit).toBe(broken ? 1 : 0)
      expect(requests).toHaveLength(2)
      const system = requests[0].messages
        .flatMap((message) =>
          message.role === "system" && typeof message.content === "string" ? [message.content] : [],
        )
        .join("\n")
      const discovered = [
        ...system.matchAll(/<skill>\s*<name>(.*?)<\/name>.*?<location>(.*?)<\/location>\s*<\/skill>/gs),
      ]
      expect(discovered.map((match) => match[1]).toSorted()).toEqual([
        "customize-opencode",
        ...(!broken ? ["loginom-automation", "package-docs"] : []),
        ...(external ? ["sample"] : []),
      ])
      expect(system).not.toContain("UNTRUSTED")
      if (external) {
        expect(system).toContain("Later source.")
        expect(system).not.toContain("Earlier source.")
        expect(discovered.find((match) => match[1] === "sample")?.[2]).toBe(join(later, "sample/SKILL.md"))
        for (const name of ["package-docs", "loginom-automation", "package_docs"]) {
          expect(result.errors).toContain(`Ignored external skill '${name}'`)
          if (kind === "reserved-command") {
            expect(result.errors).toContain(`Ignored external command '${name}' from config`)
          }
        }
      }
      expect(await readdir(fixture.profile)).not.toContain(".writer")
      if (broken) {
        expect(result.errors).toContain("Bundled skills are unavailable")
        const skill = result.events.findLast((event) => event.type === "tool_use" && event.part.tool === "skill")
        expect(skill?.part.state.status).toBe("error")
        expect(skill?.part.state.error).toContain('Skill "package-docs" not found')
        expect(skill?.part.state.error).toContain("reinstall the application")
        expect(
          requests.every((request) => !request.tools?.some((tool) => tool.function.name === "package_docs_run")),
        ).toBe(true)
        expect(result.events).toContainEqual(
          expect.objectContaining({
            type: "error",
            error: { name: "CLI_TOOL_FAILED", data: { message: "CLI_TOOL_FAILED" } },
          }),
        )
        return
      }
      for (const name of ["loginom-automation", "package-docs"]) {
        expect(discovered.find((match) => match[1] === name)?.[2]).toBe(join(resources, "skills", name, "SKILL.md"))
      }
      const skill = result.events.findLast((event) => event.type === "tool_use" && event.part.tool === "skill")
      expect(skill?.part.state.status).toBe("completed")
      expect(skill?.part.state.metadata.dir).toBe(join(resources, "skills/package-docs"))
      expect(skill?.part.state.metadata.activation).toEqual({
        name: "package-docs",
        profile: "package-docs",
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
      const tools = requests[1].tools?.map((tool) => tool.function.name) ?? []
      expect(tools).toContain("package_docs_run")
      expect(tools.filter((name) => ["task", "bash", "loginom_dock_prepare"].includes(name))).toEqual([])
      if (kind === "reserved-command") {
        expect(JSON.stringify(requests[0].messages)).not.toContain("UNTRUSTED")
        expect(requests[0].tools?.map((tool) => tool.function.name)).toContain("package_docs_run")
      }
    } finally {
      provider.stop(true)
    }
  },
  30_000,
)
