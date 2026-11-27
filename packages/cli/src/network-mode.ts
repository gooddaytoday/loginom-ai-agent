export * as NetworkMode from "./network-mode"

import fs from "node:fs/promises"
import path from "node:path"
import { applyEdits, modify, parse, parseTree, type ParseError } from "jsonc-parser"
import type { Mode } from "@loginom-ai-agent/loginom-host/network-settings-rpc"

const names = ["loginom-ai-agent.json", "loginom-ai-agent.jsonc"]

// Loginom AI Agent (B2.8, U4): the product's network mode is the `network` key of its global config, the file the
// settings write (`<config>/loginom-ai-agent.json(c)`, in a CLI profile its `config`), so it reaches the server without
// Desktop's environment. A project's `.loginom-ai-agent` or an environment variable cannot change it. "online"
// («Интернет», В-32) is the default; "device" («Только этот компьютер») makes no request off loopback. Any other value,
// or a file that does not parse, reads as "device", as a broken policy file does (В-33). «Сеть организации» is not a
// mode yet: 0.4 had none.
export type { Mode }

export async function read(config: string): Promise<Mode> {
  // Core merges both global files, the later over the earlier.
  const values = await Promise.all(
    names.map((name) => fs.readFile(path.join(config, name), "utf8").then(decode, () => undefined)),
  )
  return values.findLast((value) => value !== undefined) ?? "online"
}

export async function write(directory: string, mode: Mode) {
  const candidates = names.map((name) => path.join(directory, name))
  for (const file of candidates.toReversed()) {
    const text = await fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
    })
    if (text === undefined) continue
    const errors: ParseError[] = []
    const root = parseTree(text, errors, { allowTrailingComma: true })
    if (errors.length || root?.type !== "object") throw new Error("Invalid global configuration")

    // JSONC reads the last duplicate key, so keep other entries and update the effective value.
    const value = root.children?.findLast((property) => property.children?.[0]?.value === "network")?.children?.[1]
    const updated = value
      ? text.slice(0, value.offset) + JSON.stringify(mode) + text.slice(value.offset + value.length)
      : applyEdits(text, modify(text, ["network"], mode, { formattingOptions: { tabSize: 2, insertSpaces: true } }))
    await save(file, updated)
    return
  }

  await fs.mkdir(directory, { recursive: true })
  await save(path.join(directory, "loginom-ai-agent.jsonc"), JSON.stringify({ network: mode }, null, 2))
}

async function save(file: string, text: string) {
  const temporary = `${file}.${process.pid}.network.tmp`
  try {
    await fs.writeFile(temporary, text.endsWith("\n") ? text : `${text}\n`, { mode: 0o600 })
    await fs.rename(temporary, file)
  } finally {
    await fs.rm(temporary, { force: true })
  }
}

function decode(text: string): Mode | undefined {
  const errors: ParseError[] = []
  const input: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length || typeof input !== "object" || input === null || Array.isArray(input)) return "device"
  if (!("network" in input)) return undefined
  return input.network === "online" ? "online" : "device"
}
