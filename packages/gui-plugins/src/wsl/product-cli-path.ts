import { Product } from "@loginom-ai-agent/product"

export const wslCliHome = "$HOME/.local/share/loginom-ai-agent-wsl"
export const wslCliExecutable = `bin/${Product.cliExecutable}`
export const wslCliPath = `${wslCliHome}/current/${wslCliExecutable}`
