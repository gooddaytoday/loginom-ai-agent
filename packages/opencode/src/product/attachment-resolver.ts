import path from "path"
import { fileURLToPath } from "url"
import { Effect } from "effect"
import { and, eq, sql } from "drizzle-orm"
import { Database } from "@opencode-ai/core/database/database"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { MessageTable, PartTable } from "@opencode-ai/core/session/sql"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import type { MessageID, SessionID } from "@/session/schema"
import { attachmentContext, attachmentPreview } from "@/util/attachment-preview"
import { decodeDataUrl } from "@/util/data-url"
import { fileSnapshot } from "@/util/file-snapshot"

const PACKAGE_MIME = "application/x-loginom-package"

type Draft<T> = T extends SessionV1.Part ? Omit<T, "id"> & { id?: string } : never
type FileDraft = Omit<SessionV1.FilePart, "id" | "sessionID" | "messageID"> & { id?: string }
type Owner = { messageID: MessageID; sessionID: SessionID }

// Attachments reach the model as bounded text, while the bytes a user attached
// stay the only source for a later transfer to Loginom.
export const attachmentResolver = {
  mentionMime: (filepath: string) => (FSUtil.mimeType(filepath) === PACKAGE_MIME ? PACKAGE_MIME : "text/plain"),

  // A scenario package is never read into the conversation, only referenced by path.
  packageParts(part: FileDraft, filepath: string, owner: Owner): Draft<SessionV1.Part>[] | undefined {
    if (part.mime !== PACKAGE_MIME && !filepath.toLowerCase().endsWith(".lgp")) return undefined
    return [
      { ...owner, type: "text", synthetic: true, text: `Attached Loginom package path: ${filepath}` },
      { ...part, mime: PACKAGE_MIME, filename: part.filename ?? path.basename(filepath), ...owner },
    ]
  },

  dataContext: (url: string, fsys: FSUtil.Interface) =>
    attachmentContext(decodeDataUrl(url)).pipe(Effect.provideService(FSUtil.Service, fsys)),

  // A CLI attachment is read once from disk; the preview shown to the model and
  // the bytes kept for the Dock transfer come from that same snapshot.
  // Line references never authorize transferring the rest of the file.
  snapshot: Effect.fnUntraced(function* (input: {
    filepath: string
    url: URL
    filename?: string
    hasAttachments: boolean
  }) {
    if (
      !process.env.LOGINOM_AI_AGENT_CLI_ROOT ||
      input.url.search ||
      input.url.hash ||
      !input.filename ||
      input.hasAttachments
    )
      return undefined
    const bytes = yield* Effect.promise(() => fileSnapshot(input.filepath))
    return {
      text: attachmentPreview(bytes.toString("utf8")),
      dataUrl: (mime: string) => `data:${mime};base64,${bytes.toString("base64")}`,
    }
  }),

  // Compacted messages still own the canonical data URLs used by saved snapshot links.
  retainCompacted: Effect.fnUntraced(function* (
    db: Database.Service["Service"]["db"],
    fsys: FSUtil.Interface,
    sessionID: SessionID,
  ) {
    const attachments = yield* db
      .select({ url: sql<string>`json_extract(${PartTable.data}, '$.url')` })
      .from(MessageTable)
      .innerJoin(PartTable, eq(PartTable.message_id, MessageTable.id))
      .where(
        and(
          eq(MessageTable.session_id, sessionID),
          sql`json_extract(${MessageTable.data}, '$.role') = 'user'`,
          sql`json_extract(${PartTable.data}, '$.type') = 'file'`,
          sql`json_extract(${PartTable.data}, '$.mime') = 'text/plain'`,
        ),
      )
      .all()
      .pipe(Effect.orDie)
    yield* Effect.forEach(
      new Set(
        attachments.map((part) => part.url).filter((url) => URL.canParse(url) && new URL(url).protocol === "data:"),
      ),
      (url) => attachmentContext(decodeDataUrl(url)),
      { discard: true },
    ).pipe(Effect.provideService(FSUtil.Service, fsys))
  }),

  // Subtasks receive text, so retain attachment context after template and shell expansion.
  subtaskText: (part: { type: string; text?: string; ignored?: boolean; mime?: string; url?: string }): string[] => {
    if (part.type === "text") return part.ignored ? [] : [part.text ?? ""]
    if (part.mime === PACKAGE_MIME && part.url?.startsWith("file:"))
      return [`Attached Loginom package path: ${fileURLToPath(part.url)}`]
    return []
  },
}
