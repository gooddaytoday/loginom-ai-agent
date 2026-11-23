import fs from "fs"
import { createInterface } from "node:readline"
import { standaloneCancellation } from "../../standalone-cancellation"
import * as tty from "node:tty"

export const INTERACTIVE_INPUT_ERROR = "--mini requires a controlling terminal for input"

type InteractiveStdin = {
  stdin: NodeJS.ReadStream
  cleanup?: () => void
}

function openTerminalStdin(path: string): NodeJS.ReadStream {
  return new tty.ReadStream(fs.openSync(path, "r"))
}

export function resolveInteractiveStdin(
  stdin: NodeJS.ReadStream = process.stdin,
  open: (path: string) => NodeJS.ReadStream = openTerminalStdin,
  platform = process.platform,
): InteractiveStdin {
  if (stdin.isTTY) {
    return { stdin }
  }

  const file = platform === "win32" ? "CONIN$" : "/dev/tty"

  try {
    const stream = open(file)
    return {
      stdin: stream,
      cleanup: () => {
        stream.destroy()
      },
    }
  } catch (error) {
    throw new Error(INTERACTIVE_INPUT_ERROR, { cause: error })
  }
}

export async function readPromptStdin(cancellable: boolean) {
  if (cancellable && standaloneCancellation()?.aborted) return { cancelled: true as const, text: undefined }
  if (process.stdin.isTTY) return { cancelled: false as const, text: undefined }
  if (!cancellable) return { cancelled: false as const, text: await Bun.stdin.text() }
  const cancelled = Promise.withResolvers<{ cancelled: true; text?: never }>()
  const interrupt = () => cancelled.resolve({ cancelled: true })
  process.on("SIGINT", interrupt)
  try {
    // Leave process exit to the standalone owner, after backend/host cleanup.
    // A pipe whose writer stays open must not prevent cancellation from unwinding.
    return await Promise.race([
      Bun.stdin.text().then((text) => ({ cancelled: false as const, text })),
      cancelled.promise,
    ])
  } finally {
    process.off("SIGINT", interrupt)
  }
}

export async function readTerminalConfirmation(prompt: string, choice: string, signal: AbortSignal) {
  if (signal.aborted) return false
  let terminal: InteractiveStdin
  try {
    terminal = resolveInteractiveStdin()
  } catch {
    process.stderr.write("Удаление отклонено: требуется управляющий терминал.\n")
    return false
  }

  const answer = Promise.withResolvers<boolean>()
  const cancel = () => answer.resolve(false)
  // The CLI owner handles cancellation and waits for the private Host to close.
  const interrupt = () => {
    cancel()
    process.emit("SIGINT")
  }
  const eof = (chunk: Buffer | string) => {
    if (chunk.toString().includes("\x04")) cancel()
  }
  const reader = createInterface({
    input: terminal.stdin,
    output: process.stderr.isTTY ? process.stderr : undefined,
    terminal: true,
  })
  // EOF can emit readline's buffered text as a line without an Enter.
  terminal.stdin.prependListener("end", cancel)
  terminal.stdin.prependListener("data", eof)
  process.stderr.write(prompt)
  try {
    reader.once("line", line => answer.resolve(line === choice))
    reader.once("close", cancel).once("error", cancel).once("SIGINT", interrupt)
    signal.addEventListener("abort", cancel, { once: true })
    if (signal.aborted || terminal.stdin.readableEnded || terminal.stdin.destroyed) return false
    return await answer.promise && !signal.aborted
  } finally {
    signal.removeEventListener("abort", cancel)
    reader.close()
    terminal.stdin.off("end", cancel).off("data", eof)
    terminal.cleanup?.()
  }
}
