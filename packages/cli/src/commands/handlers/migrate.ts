import { Global } from "@opencode/util/global"
import { Effect, Option } from "effect"
import { parse } from "jsonc-parser"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { EOL } from "node:os"
import path from "node:path"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { databasePath } from "../../database-path"
import { errorMessage } from "../../util/error"

// Loginom AI Agent: 0.3.9 and 0.4.x kept the backend database of each channel in that channel's data directory, the
// one this version uses (`a080f7725c:packages/core/src/database/database.ts`), so a release build finds it at its own
// database path.
export default Runtime.handler(
  Commands.commands.migrate,
  Effect.fn("cli.migrate")(
    function* (input) {
      const global = yield* Global.Service
      const source = Option.getOrElse(input.source, () => path.join(global.data, "loginom-ai-agent.db"))
      const plugins = yield* Effect.try(() => configuredPlugins(global.config))
      const { LegacyMigrate } = yield* Effect.promise(() => import("@opencode/server/legacy-migrate"))
      const result = yield* LegacyMigrate.run({
        source,
        target: databasePath(global.data),
        backup: LegacyMigrate.backupPath(source),
      })
      const lines =
        result.status === "missing"
          ? [`No 0.3.9 or 0.4 database at ${path.resolve(source)}; nothing to migrate.`]
          : result.status === "current"
            ? [`${path.resolve(source)} is already an OpenCode 2 database; nothing to migrate.`]
            : [
                result.status === "migrated"
                  ? `Migrated ${result.summary.source} to ${result.summary.target}.`
                  : `Already migrated ${result.summary.source} to ${result.summary.target}; nothing changed.`,
                `  Source: ${result.summary.rows.sessions} sessions, ${result.summary.rows.messages} messages, ${result.summary.rows.parts} parts` +
                  (result.summary.schema ? ` (schema ${result.summary.schema})` : ""),
                `  Written: ${result.summary.migrated.sessions} sessions, ${result.summary.migrated.messages} messages` +
                  (result.summary.present ? `; ${result.summary.present} sessions were already present` : ""),
                ...(result.summary.backup ? [`  Original kept as ${result.summary.backup}`] : []),
                ...(result.summary.warnings.length
                  ? [
                      `  Skipped ${result.summary.warnings.length} rows that OpenCode 2 cannot read:`,
                      ...result.summary.warnings.map(
                        (warning) =>
                          `    ${warning.reason}: session ${warning.sessionID}` +
                          (warning.messageID ? `, message ${warning.messageID}` : "") +
                          (warning.partID ? `, part ${warning.partID}` : "") +
                          (warning.observedType ? ` (${warning.observedType})` : ""),
                      ),
                    ]
                  : []),
              ]
      process.stdout.write(
        [
          ...lines,
          ...(plugins.length
            ? [
                "User plugins are not migrated; this version loads only built-in plugins:",
                ...plugins.map((plugin) => `  ${plugin.spec} (${plugin.source})`),
              ]
            : []),
        ].join(EOL) + EOL,
      )
    },
    Effect.catch((error) =>
      Effect.sync(() => {
        process.stderr.write(`migrate failed: ${errorMessage(error)}${EOL}`)
        process.exitCode = 1
      }),
    ),
  ),
)

// 0.4 loaded user plugins from the `plugin` lists of the global configuration files and from `plugin(s)/*.{ts,js}`
// beside them (`a080f7725c:packages/opencode/src/config/config.ts`, `config/plugin.ts`). Project configurations are
// not scanned.
function configuredPlugins(directory: string) {
  const listed = ["config.json", "loginom-ai-agent.json", "loginom-ai-agent.jsonc"].flatMap((file) => {
    const source = path.join(directory, file)
    if (!existsSync(source)) return []
    const config: unknown = parse(readFileSync(source, "utf8"))
    if (typeof config !== "object" || config === null || !("plugin" in config) || !Array.isArray(config.plugin))
      return []
    return config.plugin.flatMap((item: unknown) => {
      const spec = Array.isArray(item) ? item[0] : item
      return typeof spec === "string" ? [{ spec, source }] : []
    })
  })
  const files = ["plugin", "plugins"].flatMap((folder) => {
    const source = path.join(directory, folder)
    if (!existsSync(source)) return []
    return readdirSync(source)
      .filter((file) => /\.(ts|js)$/.test(file))
      .map((file) => ({ spec: file, source }))
  })
  return [...listed, ...files]
}
