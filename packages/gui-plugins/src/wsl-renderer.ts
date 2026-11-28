import { setupWslRenderer } from "./wsl/renderer"
import { wslCliPath } from "./loginom-gui/wsl-path"

export default function setup(ctx: Parameters<typeof setupWslRenderer>[0]) {
  return setupWslRenderer(ctx, `"${wslCliPath}" loginom setup`)
}
