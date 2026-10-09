import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { parse } from "yaml"

test.skipIf(process.platform === "win32")(
  "cached CI inputs still install locked runtime dependencies",
  async () => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node distribution")
    const directory = await mkdtemp(join(tmpdir(), "loginom-ci-cache-hit-"))
    try {
      // A local locked dependency exercises the actual action shell and npm without
      // downloads or changing the repository's own node_modules.
      await mkdir(join(directory, "dependency"))
      await Bun.write(
        join(directory, "dependency/package.json"),
        JSON.stringify({ name: "fixture", version: "1.0.0", main: "index.js" }),
      )
      await Bun.write(join(directory, "dependency/index.js"), "module.exports = 'installed'")
      await Bun.write(
        join(directory, "package.json"),
        JSON.stringify({ name: "test", version: "1.0.0", dependencies: { fixture: "file:dependency" } }),
      )
      await Bun.write(
        join(directory, "package-lock.json"),
        JSON.stringify({
          name: "test",
          version: "1.0.0",
          lockfileVersion: 3,
          requires: true,
          packages: {
            "": { name: "test", version: "1.0.0", dependencies: { fixture: "file:dependency" } },
            dependency: { name: "fixture", version: "1.0.0" },
            "node_modules/fixture": { resolved: "dependency", link: true },
          },
        }),
      )
      const action = parse(
        await Bun.file(resolve(import.meta.dir, "../../../.github/actions/setup-loginom-inputs/action.yml")).text(),
      ) as {
        runs: { steps: { if?: string; "working-directory"?: string; run?: string }[] }
      }
      for (const step of action.runs.steps.filter(
        (step) => step["working-directory"] === "packages/loginom-runtime/client",
      )) {
        if (step.if === "steps.cache.outputs.cache-hit != 'true'") continue
        expect(step.if).toBeUndefined()
        const child = Bun.spawn(["bash", "-c", step.run!], {
          cwd: directory,
          env: { ...process.env, NODE: node, NPM: resolve(dirname(node), "../lib/node_modules/npm/bin/npm-cli.js") },
          stdout: "pipe",
          stderr: "pipe",
        })
        const [code, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ])
        expect({ code, diagnostics: code ? stdout + stderr : "" }).toEqual({ code: 0, diagnostics: "" })
      }
      const child = Bun.spawn([node, "-p", "require('fixture')"], { cwd: directory, stdout: "pipe", stderr: "pipe" })
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      expect({ code, stdout, stderr }).toEqual({ code: 0, stdout: "installed\n", stderr: "" })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  15000,
)
