import { test, expect } from "bun:test"
import { formatImportFileError } from "../../src/cli/cmd/import"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { tmpdir } from "../fixture/fixture"
import path from "node:path"
import { PlatformError } from "effect"

test("formats import file errors", () => {
  expect(
    formatImportFileError(
      "test.json",
      new PlatformError.PlatformError(
        new PlatformError.SystemError({
          _tag: "NotFound",
          module: "FileSystem",
          method: "readFileString",
        }),
      ),
    ),
  ).toBe("File not found: test.json")
  expect(
    formatImportFileError(
      "test.json",
      new PlatformError.PlatformError(
        new PlatformError.SystemError({
          _tag: "PermissionDenied",
          module: "FileSystem",
          method: "readFileString",
        }),
      ),
    ),
  ).toBe("Failed to read file: Permission denied")
  expect(
    formatImportFileError(
      "test.json",
      new FSUtil.FileSystemError({ method: "readJson", cause: new SyntaxError("Unexpected token") }),
    ),
  ).toBe("Invalid JSON in test.json: Unexpected token")
})

test("CLI import preserves dashboard restrictions on inserts and ID conflicts", async () => {
  await using tmp = await tmpdir()
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `
    import { mkdir } from "node:fs/promises"
    import { AppRuntime } from ${JSON.stringify(path.resolve(import.meta.dir, "../../src/effect/app-runtime.ts"))}
    import { Session } from ${JSON.stringify(path.resolve(import.meta.dir, "../../src/session/session.ts"))}
    import { ImportCommand } from ${JSON.stringify(path.resolve(import.meta.dir, "../../src/cli/cmd/import.ts"))}
    import { dashboardRoot } from ${JSON.stringify(path.resolve(import.meta.dir, "../../src/product/dashboard-session.ts"))}
    const ordinary = ${JSON.stringify(tmp.path)}
    const work = dashboardRoot() + "/import-fixture/work"
    await mkdir(work, { recursive: true })
    const results = []
    for (const source of ["existing", "imported", "destination", "imported-conflict", "destination-conflict", "ordinary"]) {
      process.chdir(ordinary)
      const file = ordinary + "/" + source + ".json"
      const seed = { id: "ses_" + source, slug: "import", projectID: "global", directory: ordinary, title: "Import", version: "1", time: { created: 1, updated: 1 }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }
      if (source === "existing") {
        await Bun.write(file, JSON.stringify({ info: { ...seed, metadata: { loginom_dashboard: true, note: "existing" } }, messages: [] }))
        await ImportCommand.handler({ file })
      }
      for (const conflict of [false, true]) {
        process.chdir((source === "destination" && !conflict || source === "destination-conflict" && conflict) ? work : ordinary)
        await Bun.write(file, JSON.stringify({ info: { ...seed, metadata: { ...((source === "imported" || source === "imported-conflict" && conflict) ? { loginom_dashboard: true } : {}), note: conflict ? "replacement" : "insert" } }, messages: [] }))
        await ImportCommand.handler({ file })
        results.push({ source, conflict, session: await AppRuntime.runPromise(Session.use.get(seed.id)) })
      }
    }
    console.log("RESULT:" + JSON.stringify(results))
    await AppRuntime.dispose()
  `,
    ],
    {
      cwd: path.resolve(import.meta.dir, "../.."),
      env: {
        ...process.env,
        LOGINOM_AI_AGENT_DB: path.join(tmp.path, "import.db"),
        XDG_DATA_HOME: path.join(tmp.path, "data"),
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect({ exit, stderr }).toMatchObject({ exit: 0 })
  const results = JSON.parse(
    stdout
      .split("\n")
      .find((line) => line.startsWith("RESULT:"))!
      .slice(7),
  ) as Array<{ source: string; conflict: boolean; session: { metadata: Record<string, unknown> } }>
  for (const result of results) {
    expect(result.session.metadata.loginom_dashboard).toBe(
      result.source === "ordinary" || (result.source.endsWith("-conflict") && !result.conflict) ? undefined : true,
    )
    expect(result.session.metadata.note).toBe(result.source === "existing" ? "existing" : "insert")
  }
})
