import { run as runTui, type TuiInput } from "@loginom-ai-agent/tui"
import { Global } from "@loginom-ai-agent/core/global"
import { AppNodeBuilder } from "@loginom-ai-agent/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
