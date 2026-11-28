import { Database } from "bun:sqlite"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { NonNegativeInt } from "@opencode/schema/schema"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { Option, Schema } from "effect"

const node = Schema.Struct({
  document_id: Schema.NonEmptyString,
  workflow_id: Schema.NonEmptyString,
  node_id: Schema.NonEmptyString,
})
const file = Schema.Struct({
  artifact_id: Schema.NonEmptyString,
  destination: Schema.String.check(Schema.isPattern(/^\/.+\.(csv|tsv|txt|xls|xlsx|lgd)$/iu)),
  bytes: NonNegativeInt,
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
  verification_id: Schema.NonEmptyString,
})
export const ExportRecord = Schema.Struct({ ...file.fields, name: Schema.NonEmptyString, node })
const storedReceipt = Schema.decodeUnknownSync(Schema.fromJsonString(ExportRecord))
const decodeResult = Schema.decodeUnknownOption(
  Schema.Struct({
    result_version: Schema.Literal("user-v1"),
    operation_id: Schema.NonEmptyString,
    state: Schema.Literal("settled"),
    status: Schema.Literal("SUCCEEDED"),
    action_key: Schema.Literal("node.apply"),
    cleanup_complete: Schema.Literal(true),
    error: Schema.Null,
    node,
    execution: Schema.Struct({ status: Schema.Literal("completed"), execution_id: Schema.NonEmptyString }),
    output: Schema.Struct({
      status: Schema.Literal("complete"),
      file_artifacts: Schema.Tuple([
        Schema.Struct({
          ...file.fields,
          execution_id: Schema.NonEmptyString,
          freshness_basis: Schema.Literals([
            "explicit_replace_and_completed_native_execution",
            "native_absence_check_and_completed_execution",
          ]),
        }),
      ]),
    }),
  }),
)

const dockTools = new Set(["dock_node_apply", "dock_node_wait", "dock_node_status"])

export function exportMetadata(tool: string, structuredContent: unknown) {
  if (!dockTools.has(tool)) return undefined
  const result = decodeResult(structuredContent)
  if (Option.isNone(result)) return undefined
  const receipt = result.value
  const [artifact] = receipt.output.file_artifacts
  if (artifact.execution_id !== receipt.execution.execution_id) return undefined
  return {
    operationId: receipt.operation_id,
    state: receipt.state,
    export: {
      artifact_id: artifact.artifact_id,
      destination: artifact.destination,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      verification_id: artifact.verification_id,
      name: artifact.destination.slice(artifact.destination.lastIndexOf("/") + 1),
      node: receipt.node,
    },
  }
}

const turnInput = Schema.Struct({ sessionID: Session.ID, messageID: SessionMessage.ID })

export const exportReceiptsRpc = {
  id: "loginom.exports",
  methods: {
    turn: {
      input: Schema.toStandardSchemaV1(turnInput),
      output: Schema.toStandardSchemaV1(Schema.Struct({ files: Schema.Array(ExportRecord) })),
      errors: { not_found: Schema.toStandardSchemaV1(Schema.Undefined) },
    },
  },
  events: {},
}

export function exportReceipts(directory: string) {
  const path = join(directory, "exports.sqlite")
  function open() {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const database = new Database(path)
    try {
      database.exec(`
        PRAGMA busy_timeout = 5000;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS turns (
          session TEXT NOT NULL, message TEXT NOT NULL, PRIMARY KEY (session, message)
        );
        CREATE TABLE IF NOT EXISTS receipts (
          session TEXT NOT NULL, message TEXT NOT NULL, verification TEXT NOT NULL, receipt TEXT NOT NULL,
          UNIQUE (session, verification), FOREIGN KEY (session, message) REFERENCES turns ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS receipts_turn ON receipts (session, message);
      `)
      return database
    } catch (error) {
      database.close()
      throw error
    }
  }
  const register = (database: Database, sessionID: string, messageID: string) =>
    database.run("INSERT OR IGNORE INTO turns VALUES (?, ?)", [sessionID, messageID])
  return {
    start(sessionID: string, messageID: string) {
      using database = open()
      register(database, sessionID, messageID)
    },
    record(sessionID: string, messageID: string, receipt: typeof ExportRecord.Type) {
      using database = open()
      return database.transaction(() => {
        register(database, sessionID, messageID)
        return (
          database.run("INSERT OR IGNORE INTO receipts VALUES (?, ?, ?, ?)", [
            sessionID,
            messageID,
            receipt.verification_id,
            JSON.stringify(receipt),
          ]).changes !== 0
        )
      })()
    },
    turn({ sessionID, messageID }: typeof turnInput.Type) {
      if (!existsSync(path)) return undefined
      using database = new Database(path, { readonly: true })
      if (!database.query("SELECT 1 FROM turns WHERE session = ? AND message = ?").get(sessionID, messageID))
        return undefined
      const rows = database
        .query<{ receipt: string }, [string, string]>(
          "SELECT receipt FROM receipts WHERE session = ? AND message = ? ORDER BY rowid",
        )
        .all(sessionID, messageID)
      return { files: rows.map(({ receipt }) => storedReceipt(receipt)) }
    },
    remove(sessionID: string) {
      if (!existsSync(path)) return
      using database = open()
      database.run("DELETE FROM turns WHERE session = ?", [sessionID])
    },
  }
}
