import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, Layer } from "effect"

import { cleanStages } from "./cli-stages"
import { stageDirectory } from "./cli-version"

// The file name of the CLI that Desktop 0.4 ran its service from (v0.4.0:packages/desktop/src/main/background-cli.ts).
const bundledCli = "loginom-ai-agent-cli"

describe("cleanStages", () => {
  test.each([
    { name: "upgrade", staged: ["2.0.18-x64", "2.0.19-x64", "2.0.20-x64"], current: "2.0.20-x64" },
    { name: "downgrade", staged: ["2.0.18-x64", "2.0.19-x64", "2.0.20-x64"], current: "2.0.18-x64" },
    { name: "prerelease", staged: ["2.0.20-x64", "2.1.0-beta.1-x64", "local-x64"], current: "2.1.0-beta.1-x64" },
    {
      name: "adopted server",
      staged: ["2.0.18-x64", "2.0.19-x64", "2.0.20-x64"],
      current: "2.0.20-x64",
      keep: ["2.0.19-x64"],
    },
  ])("keeps only the current and adopted staged CLIs after $name", async (input) => {
    const root = mkdtempSync(path.join(tmpdir(), "opencode-cli-stages-"))

    try {
      input.staged.forEach((version) => {
        mkdirSync(path.join(root, version))
        writeFileSync(path.join(root, version, bundledCli), version)
      })
      writeFileSync(path.join(root, "unrelated"), "")

      await Effect.runPromise(
        cleanStages(path.join(root, input.current, bundledCli), { keep: input.keep }).pipe(
          Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
        ),
      )

      expect(readdirSync(root).sort()).toEqual([input.current, ...(input.keep ?? []), "unrelated"].sort())
      expect(readdirSync(path.join(root, input.current))).toEqual([bundledCli])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// Fork (catalog CAT-13): Desktop 0.4 shares userData with the standalone CLI 0.4, whose profile — the Loginom connection
// with its password, the database and the config — is `<userData>/cli/profiles/default` (product cli-profile.ts).
describe("staged CLIs beside the CLI 0.4 profile", () => {
  test("cleanStages removes old stages and leaves the profile and any other directory", async () => {
    // The B4.1 probe: the profile in the cleaned directory, as when stages lived in `<userData>/cli`.
    const root = mkdtempSync(path.join(tmpdir(), "opencode-cli-stages-"))

    try {
      const connection = writeProfile(path.join(root, "profiles", "default"))

      ;["2.2.0-x64", "2.3.0-arm64", "2.3.0-x64"].forEach((stage) => writeStage(path.join(root, stage)))
      mkdirSync(path.join(root, "notes"))

      await clean(path.join(root, "2.3.0-x64", bundledCli))

      expect(readdirSync(root).sort()).toEqual(["2.3.0-x64", "notes", "profiles"])
      expect(readFileSync(connection, "utf8")).toBe(profileText)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("stages live outside the directory of the CLI 0.4 profile", async () => {
    const userData = mkdtempSync(path.join(tmpdir(), "opencode-cli-stages-userdata-"))

    try {
      const current = stageDirectory(userData, "2.3.0")

      const connection = writeProfile(path.join(userData, "cli", "profiles", "default"))

      ;["2.2.0", "2.1.0-beta.1", "local", "0.0.0-dev+build/7"].forEach((version) =>
        writeStage(stageDirectory(userData, version)),
      )
      writeStage(current)

      await clean(path.join(current, bundledCli))

      expect(path.relative(path.join(userData, "cli"), current).startsWith("..")).toBe(true)
      expect(readdirSync(path.dirname(current))).toEqual([path.basename(current)])
      expect(readdirSync(path.join(userData, "cli"))).toEqual(["profiles"])
      expect(readFileSync(connection, "utf8")).toBe(profileText)
    } finally {
      rmSync(userData, { recursive: true, force: true })
    }
  })

  // B4.7: earlier v2 builds of the product staged the CLI under its upstream name. Stages of other versions go as
  // usual; a stage of the same version keeps that file, and the launch copies the new one beside it.
  test("stages of earlier builds with the upstream CLI name go, and a same-version one keeps the new copy", async () => {
    const userData = mkdtempSync(path.join(tmpdir(), "opencode-cli-stages-userdata-"))

    try {
      const current = stageDirectory(userData, "2.3.0")

      const connection = writeProfile(path.join(userData, "cli", "profiles", "default"))

      ;["2.2.0", "2.3.0"].forEach((version) => writeStage(stageDirectory(userData, version), "opencode-cli"))
      writeFileSync(path.join(current, bundledCli), "2.3.0")

      await clean(path.join(current, bundledCli))

      expect(readdirSync(path.dirname(current))).toEqual([path.basename(current)])
      expect(readdirSync(current).sort()).toEqual([bundledCli, "opencode-cli"])
      expect(readdirSync(path.join(userData, "cli"))).toEqual(["profiles"])
      expect(readFileSync(connection, "utf8")).toBe(profileText)
    } finally {
      rmSync(userData, { recursive: true, force: true })
    }
  })
})

const profileText = '{"url":"https://loginom.example","username":"user"}'

function writeProfile(root: string) {
  mkdirSync(path.join(root, "loginom", "connection"), { recursive: true })
  mkdirSync(path.join(root, "data"))
  writeFileSync(path.join(root, "data", "loginom-ai-agent.db"), "")
  writeFileSync(path.join(root, "loginom", "connection", "connection.json"), profileText)

  return path.join(root, "loginom", "connection", "connection.json")
}

function writeStage(directory: string, name = bundledCli) {
  mkdirSync(directory, { recursive: true })
  writeFileSync(path.join(directory, name), path.basename(directory))
}

function clean(binary: string) {
  return Effect.runPromise(
    cleanStages(binary).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
  )
}
