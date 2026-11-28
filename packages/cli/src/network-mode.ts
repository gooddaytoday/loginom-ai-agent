export * as NetworkMode from "./network-mode"

import fs from "node:fs/promises"
import path from "node:path"
import { parse, type ParseError } from "jsonc-parser"

// Loginom AI Agent (B2.8, U4): the product's network mode is the `network` key of its global config, the file the
// settings write (`<config>/loginom-ai-agent.json(c)`, in a CLI profile its `config`), so it reaches the server without
// Desktop's environment. A project's `.loginom-ai-agent` or an environment variable cannot change it. "online"
// («Интернет», В-32) is the default; "device" («Только этот компьютер») makes no request off loopback. Any other value,
// or a file that does not parse, reads as "device", as a broken policy file does (В-33). «Сеть организации» is not a
// mode yet: 0.4 had none.
export type Mode = "online" | "device"

export async function read(config: string): Promise<Mode> {
  // Core merges both global files, the later over the earlier.
  const values = await Promise.all(
    ["loginom-ai-agent.json", "loginom-ai-agent.jsonc"].map((name) =>
      fs.readFile(path.join(config, name), "utf8").then(decode, () => undefined),
    ),
  )
  return values.findLast((value) => value !== undefined) ?? "online"
}

function decode(text: string): Mode | undefined {
  const errors: ParseError[] = []
  const input: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length || typeof input !== "object" || input === null || Array.isArray(input)) return "device"
  if (!("network" in input)) return undefined
  return input.network === "online" ? "online" : "device"
}
