import { expect, spyOn } from "bun:test"
import { Cause, Effect, Exit, Fiber, Layer } from "effect"
import { rm, symlink } from "node:fs/promises"
import { join, relative } from "node:path"
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppProcess } from "@opencode-ai/core/process"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Global } from "@opencode-ai/core/global"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Agent } from "@/agent/agent"
import { Command } from "@/command"
import { InstanceState } from "@/effect/instance-state"
import { Permission } from "@/permission"
import { toolContributor } from "@/product/tool-contributor"
import { Session } from "@/session/session"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { MessageID, SessionID } from "@/session/schema"
import type { Tool } from "@/tool/tool"
import { Skill } from "@/skill"
import { Truncate } from "@/tool/truncate"
import { provideTmpdirInstance, TestInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"

const context = (permissions: Permission.Interface): Tool.Context => {
  const sessionID = SessionID.make("ses_skill_validation")
  return {
    agent: "build",
    sessionID,
    messageID: MessageID.ascending(),
    abort: new AbortController().signal,
    messages: [],
    metadata: () => Effect.void,
    ask: (request) =>
      permissions.ask({ ...request, sessionID, ruleset: [{ permission: "*", pattern: "*", action: "allow" }] }).pipe(Effect.orDie),
  }
}

const installTool = Effect.gen(function* () {
  const tools: Tool.Def[] = yield* toolContributor.definitions("default")
  const tool = tools.find((item) => item.id === "skill_install")
  if (!tool) throw Error("skill_install is missing from the default tool catalog")
  return tool
})

const pendingConsent = (permissions: Permission.Interface, except?: PermissionV1.ID) =>
  pollWithTimeout(
    permissions.list().pipe(Effect.map((requests) => requests.find((request) =>
      request.permission === "skill_install" && request.id !== except,
    ))),
    "Skill installation did not ask for consent",
  )

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(LayerNode.group([Agent.node, AppProcess.node, Command.node, FSUtil.node, Permission.node, RuntimeFlags.node, Session.node, Skill.node, Truncate.node])),
    LayerNode.compile(CrossSpawnSpawner.node),
    testInstanceStoreLayer,
  ),
)

it.live("the chat validates with read permissions and only publishes after one-time consent", () =>
  provideTmpdirInstance((directory) =>
    Effect.gen(function* () {
      const instance = yield* InstanceState.context
      const permissions = yield* Permission.Service
      const resource = join(directory, "columns/references/columns.md")
      yield* Effect.promise(async () => {
        await Bun.write(join(directory, "columns/SKILL.md"), "---\nname: columns\ndescription: Checks columns.\n---\n[Columns](references/columns.md)\n")
        await Bun.write(resource, "id, amount")
        await Bun.write(join(directory, ".agents/skills/columns/SKILL.md"), "---\nname: columns\ndescription: Project override.\n---\n")
      })
      const home = Global.Path.home
      const tool = yield* installTool
      expect((yield* toolContributor.definitions("package-docs")).some((item) => item.id === "skill_install")).toBe(false)
      expect((yield* toolContributor.definitions("loginom-dashboard")).some((item) => item.id === "skill_install")).toBe(false)
      const ctx = context(permissions)
      const sessionID = ctx.sessionID
      const args = { action: "validate", source: "columns" }
      const result = yield* tool.execute(args, ctx)
      expect(JSON.parse(result.output)).toMatchObject({ path: join(directory, "columns"), errors: [], warnings: [] })
      const url = "https://github.com/owner/repository"
      const wrongAction = yield* tool.execute({ action: "validate", source: url }, ctx)
      expect(JSON.parse(wrongAction.output)).toMatchObject({
        errors: [expect.objectContaining({ message: expect.stringContaining('action: "install"') })],
      })
      const denied = yield* Effect.exit(tool.execute(args, {
        ...ctx,
        ask: (request) => permissions.ask({ ...request, sessionID, ruleset: [
          { permission: "*", pattern: "*", action: "allow" },
          { permission: "read", pattern: relative(instance.worktree, resource), action: "deny" },
        ] }).pipe(Effect.orDie),
      }))
      expect(Exit.isFailure(denied) && Cause.squash(denied.cause)).toBeInstanceOf(PermissionV1.DeniedError)

      const installation = { action: "install", source: "columns" }
      const installed = join(home, ".agents/skills/columns")
      yield* Effect.addFinalizer(() => Effect.promise(() => rm(installed, { recursive: true, force: true })))
      const pending = pendingConsent(permissions)
      const stopReading = (path: string) => Effect.gen(function* () {
        const abort = new AbortController()
        const stopped = yield* Effect.forkChild(Effect.exit(tool.execute(installation, {
          ...ctx,
          abort: abort.signal,
          ask: (request) => permissions.ask({ ...request, sessionID, ruleset: [
            { permission: "*", pattern: "*", action: "allow" },
            { permission: "read", pattern: relative(instance.worktree, path), action: "ask" },
          ] }).pipe(Effect.orDie),
        })))
        const readRequest = yield* pollWithTimeout(
          permissions.list().pipe(Effect.map((requests) => requests.find((request) =>
            request.permission === "read" && request.patterns.includes(relative(instance.worktree, path)),
          ))),
          "Skill installation did not ask to read " + path,
        )
        abort.abort()
        yield* pollWithTimeout(
          permissions.list().pipe(Effect.map((requests) => requests.some((request) => request.id === readRequest.id) ? undefined : true)),
          "Cancelled skill installation left a read permission pending",
        ).pipe(
          Effect.ensuring(permissions.reply({ requestID: readRequest.id, reply: "reject" }).pipe(Effect.ignore)),
        )
        expect((yield* Fiber.join(stopped))._tag).toBe("Failure")
      })
      yield* stopReading(join(directory, "columns"))
      yield* stopReading(resource)
      const rejected = yield* Effect.forkChild(Effect.exit(tool.execute(installation, ctx)))
      const request = yield* pending
      expect(request.metadata.skillInstall).toContain("Папка установки: " + JSON.stringify(installed))
      expect(yield* Effect.promise(() => Bun.file(join(installed, "SKILL.md")).exists())).toBe(false)
      yield* permissions.reply({ requestID: request.id, reply: "reject" })
      const rejectedResult = yield* Fiber.join(rejected)
      expect(Exit.isFailure(rejectedResult) && Cause.squash(rejectedResult.cause)).toBeInstanceOf(PermissionV1.RejectedError)
      expect(yield* Effect.promise(() => Bun.file(join(installed, "SKILL.md")).exists())).toBe(false)

      const approved = yield* Effect.forkChild(tool.execute(installation, ctx))
      const fresh = yield* pending
      expect(fresh.id).not.toBe(request.id)
      yield* permissions.reply({ requestID: fresh.id, reply: "once" })
      expect(JSON.parse((yield* Fiber.join(approved)).output)).toMatchObject({
        status: "installed",
        path: installed,
        override: join(directory, ".agents/skills/columns/SKILL.md"),
        warnings: [expect.stringContaining("/columns")],
      })
      expect(yield* Effect.promise(() => Bun.file(join(installed, "references/columns.md")).text())).toBe("id, amount")
      expect(JSON.parse((yield* tool.execute(installation, ctx)).output)).toMatchObject({ status: "already-installed" })
      yield* stopReading(join(installed, "references/columns.md"))

      const destinationReadRefused = yield* Effect.exit(tool.execute(installation, {
        ...ctx,
        ask: (request) => permissions.ask({ ...request, sessionID, ruleset: [
          { permission: "*", pattern: "*", action: "allow" },
          { permission: "read", pattern: relative(instance.worktree, join(installed, "references/columns.md")), action: "deny" },
        ] }).pipe(Effect.orDie),
      }))
      expect(destinationReadRefused._tag).toBe("Failure")
      expect(yield* permissions.list()).toEqual([])

      yield* Effect.promise(() => Bun.write(resource, "id, amount, version-two"))
      const declinedUpdate = yield* Effect.forkChild(Effect.exit(tool.execute(installation, ctx)))
      const replacement = yield* pending
      expect(replacement.metadata.skillInstall).toContain('Замена скилла "columns"')
      expect((replacement.metadata.skillInstall as string[]).some((line) => line.startsWith("Текущая ревизия: "))).toBe(true)
      yield* permissions.reply({ requestID: replacement.id, reply: "reject" })
      const declined = yield* Fiber.join(declinedUpdate)
      expect(Exit.isFailure(declined) && Cause.squash(declined.cause)).toBeInstanceOf(PermissionV1.RejectedError)
      const installedResource = join(installed, "references/columns.md")
      expect(yield* Effect.promise(() => Bun.file(installedResource).text())).toBe("id, amount")
      const confirmUpdate = yield* Effect.forkChild(tool.execute(installation, ctx))
      const confirmed = yield* pending
      expect(confirmed.id).not.toBe(replacement.id)
      yield* permissions.reply({ requestID: confirmed.id, reply: "once" })
      expect(JSON.parse((yield* Fiber.join(confirmUpdate)).output).status).toBe("installed")
      expect(yield* Effect.promise(() => Bun.file(installedResource).text())).toBe("id, amount, version-two")

      const networkRefusal = yield* Effect.exit(tool.execute({
        action: "install", source: "https://github.com/owner/repository",
      }, {
        ...ctx,
        ask: (request) => permissions.ask({ ...request, sessionID, ruleset: [
          { permission: "*", pattern: "*", action: "allow" },
          { permission: "webfetch", pattern: "*", action: "deny" },
        ] }).pipe(Effect.orDie),
      }))
      expect(networkRefusal._tag).toBe("Failure")
      expect(yield* permissions.list()).toEqual([])

      yield* Effect.promise(() => Bun.write(resource, "staged revision"))
      const waiting = yield* Effect.forkChild(Effect.exit(tool.execute(installation, ctx)))
      const stale = yield* pending
      yield* Effect.promise(() => Bun.write(resource, "published in another request"))
      const competing = yield* Effect.forkChild(tool.execute(installation, ctx))
      const competingRequest = yield* pendingConsent(permissions, stale.id)
      yield* permissions.reply({ requestID: competingRequest.id, reply: "once" })
      expect(JSON.parse((yield* Fiber.join(competing)).output).status).toBe("installed")

      yield* permissions.reply({ requestID: stale.id, reply: "once" })
      const renewed = yield* pending
      expect(renewed.id).not.toBe(stale.id)
      expect(renewed.metadata.skillInstall).not.toEqual(stale.metadata.skillInstall)
      yield* permissions.reply({ requestID: renewed.id, reply: "reject" })
      expect((yield* Fiber.join(waiting))._tag).toBe("Failure")
      expect(yield* Effect.promise(() => Bun.file(installedResource).text())).toBe("published in another request")
    }),
    { config: { command: { columns: { template: "Run the existing columns command." } } } },
  ),
)

it.instance("a disabled external catalog refuses installation and preserves validation permissions", () =>
  Effect.gen(function* () {
    const instance = yield* TestInstance
    const permissions = yield* Permission.Service
    const flags = yield* RuntimeFlags.Service
    const tool = yield* installTool.pipe(Effect.provideService(RuntimeFlags.Service, { ...flags, disableExternalSkills: true }))
    const ctx = context(permissions)
    const source = "~/validate-columns"
    const folder = join(Global.Path.home, "validate-columns")
    yield* Effect.addFinalizer(() => Effect.promise(() => rm(folder, { recursive: true, force: true })))

    const validation = { action: "validate", source }
    const missing = yield* tool.execute(validation, ctx)
    expect(JSON.parse(missing.output)).toMatchObject({
      path: folder,
      errors: [expect.objectContaining({ code: "LOGINOM_SKILL_FOLDER_UNREADABLE" })],
    })
    yield* Effect.promise(() => Bun.write(join(folder, "SKILL.md"), "---\nname: validate-columns\ndescription: Checks columns.\n---\n"))
    const found = yield* tool.execute(validation, ctx)
    expect(JSON.parse(found.output)).toMatchObject({ path: folder, name: "validate-columns", errors: [] })

    const disabled = yield* Effect.exit(tool.execute({ action: "install", source }, ctx))
    expect(Exit.isFailure(disabled) && Cause.squash(disabled.cause)).toMatchObject({
      message: "External skills are disabled in this Loginom process.",
    })
    expect(yield* permissions.list()).toEqual([])

    if (process.platform !== "win32") {
      yield* Effect.promise(() => symlink(folder, join(instance.directory, "linked-columns"), "dir"))
      const externalPaths: unknown[] = []
      const denied = yield* Effect.exit(tool.execute({ action: "validate", source: "linked-columns" }, {
        ...ctx,
        ask: (request) => {
          if (request.permission === "external_directory") externalPaths.push(request.metadata.filepath)
          return permissions.ask({ ...request, sessionID: ctx.sessionID, ruleset: [
            { permission: "*", pattern: "*", action: "allow" },
            { permission: "external_directory", pattern: "*", action: "deny" },
          ] }).pipe(Effect.orDie)
        },
      }))
      expect(Exit.isFailure(denied)).toBe(true)
      expect(externalPaths).toEqual([folder])
    }
  }),
)

it.instance("the GitHub tool lists choices and requires consent for the selected revision", () =>
  Effect.gen(function* () {
    const permissions = yield* Permission.Service
    const tool = yield* installTool
    const ctx = context(permissions)
    const repo = "https://github.com/owner/skills"
    const sha = "a".repeat(40)
    const folder = join(Global.Path.home, ".agents/skills/github-columns")
    yield* Effect.addFinalizer(() => Effect.promise(() => rm(folder, { recursive: true, force: true })))
    const archive = yield* Effect.promise(async () => {
      const writer = new ZipWriter(new BlobWriter())
      for (const name of ["github-columns", "github-rows"])
        await writer.add(`owner-skills-main/${name}/SKILL.md`, new TextReader(`---\nname: ${name}\ndescription: "Checks ${name}.\\nExample."\n---\n`))
      return writer.close()
    })
    const realFetch = globalThis.fetch
    const requests: string[] = []
    yield* Effect.acquireRelease(
      Effect.sync(() => spyOn(globalThis, "fetch").mockImplementation(Object.assign(
        async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
          const url = new URL(input instanceof Request ? input.url : input)
          if (url.origin !== "https://api.github.com") return realFetch(input, init)
          requests.push(url.pathname)
          if (url.pathname === "/repos/owner/skills") return Response.json({ default_branch: "main" })
          if (url.pathname.startsWith("/repos/owner/skills/commits/")) return Response.json({ sha })
          expect(url.pathname).toBe(`/repos/owner/skills/zipball/${sha}`)
          return new Response(archive)
        },
        { preconnect: realFetch.preconnect },
      ))),
      (mock) => Effect.sync(() => mock.mockRestore()),
    )

    const chooser = yield* tool.execute({ action: "install", source: repo }, ctx)
    const target = repo + "/tree/" + sha + "/github-columns"
    expect(JSON.parse(chooser.output)).toMatchObject({
      status: "choose",
      sha,
      candidates: [{ source: target }, { name: "github-rows" }],
    })
    expect(yield* permissions.list()).toEqual([])
    expect(yield* Effect.promise(() => Bun.file(join(folder, "SKILL.md")).exists())).toBe(false)
    expect(requests).toEqual(["/repos/owner/skills", "/repos/owner/skills/commits/main", `/repos/owner/skills/zipball/${sha}`])

    const install = yield* Effect.forkChild(tool.execute({ action: "install", source: target }, ctx))
    const request = yield* pendingConsent(permissions)
    expect(request.metadata.skillInstall).toEqual(expect.arrayContaining([
      "GitHub SHA: " + sha,
      'Каталог в репозитории: "github-columns"',
      'Описание автора: "Checks github-columns.\\nExample."',
    ]))
    yield* permissions.reply({ requestID: request.id, reply: "once" })
    expect(JSON.parse((yield* Fiber.join(install)).output)).toMatchObject({ status: "installed", sha, path: folder })
    expect(yield* Effect.promise(() => Bun.file(join(folder, "SKILL.md")).exists())).toBe(true)
  }),
)
