import { Product } from "@loginom-ai-agent/product"

// Fork (catalog CAT-09): Desktop registers and reads only the product scheme, as 0.4 did; `opencode://` belongs to
// OpenCode Desktop.
export const protocolUrls = (argv: readonly string[]) => argv.filter((arg) => arg.startsWith(`${Product.scheme}://`))

// Loginom AI Agent (B4.15): the links the app started with. On Linux a link that launches the app is on its command line,
// as 0.4 read it (`v0.4.0:packages/desktop/src/main/index.ts`); macOS sends it as `open-url`.
export const startupUrls = (argv: readonly string[], platform: NodeJS.Platform) =>
  platform === "linux" ? protocolUrls(argv) : []

export function consoleReturnWindow(value: string) {
  try {
    const url = new URL(value)

    if (url.protocol !== `${Product.scheme}:` || url.hostname !== "console" || url.pathname !== "/authorized") return
    const id = url.searchParams.get("window")

    if (!id || id.length > 256 || /[\u0000-\u001f\u007f]/.test(id)) return

    return id
  } catch {
    return
  }
}
