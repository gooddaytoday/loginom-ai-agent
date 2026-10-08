import path from "path"
import { Global } from "@loginom-ai-agent/core/global"
import { Semaphore } from "effect"

export const TRUNCATION_DIR = path.join(Global.Path.data, "tool-output")

// Cleanup must not remove a snapshot while its attachment context is refreshing it.
export const TRUNCATION_LOCK = Semaphore.makeUnsafe(1)
