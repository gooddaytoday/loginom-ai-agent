import type { SessionMessageInfo } from "@opencode/client/promise"
import { ToolRenderer } from "@opencode/plugin/gui/builtin"
import type { ToolRenderContribution } from "@opencode/session-ui/context"
import { createMemo, mergeProps } from "solid-js"
import { usePluginHost, type Item } from "@/runtime/plugin/host"
import { Contribution } from "@/runtime/plugin/render"

export function createToolRenderers(messages?: () => readonly SessionMessageInfo[]) {
  const host = usePluginHost()
  const wrapped = new WeakMap<Item<ToolRenderer>, ToolRenderContribution>()

  const items = createMemo(() => {
    const byTool = new Map<string, ToolRenderContribution>()
    const separate = new Set<string>()

    for (const item of host.items(ToolRenderer)) {
      const name = item.value.tool

      if (byTool.has(name)) continue

      const renderer =
        wrapped.get(item) ??
        ({
          get title() {
            return item.value.title
          },
          render: (props, fallback) => (
            <Contribution plugin={item.plugin} fallback={fallback}>
              {() =>
                item.value.render(
                  mergeProps(props, {
                    get title() {
                      return item.value.title
                    },
                    get latest() {
                      return !!props.id && latest().get(name) === props.id
                    },
                  }),
                )
              }
            </Contribution>
          ),
        } satisfies ToolRenderContribution)

      wrapped.set(item, renderer)
      byTool.set(name, renderer)

      if (item.value.separate) separate.add(name)
    }

    return { byTool, separate: separate.size > 0 ? separate : undefined }
  })

  const latest = createMemo(() => {
    const calls = new Map<string, string>()
    const tools = items().byTool
    if (!tools.size || !messages) return calls

    const history = messages()
    for (let index = history.length - 1; index >= 0; index--) {
      const message = history[index]
      if (message?.type === "user" || message?.type === "synthetic") break
      if (message?.type !== "assistant") continue

      for (let index = message.content.length - 1; index >= 0; index--) {
        const part = message.content[index]
        if (part?.type === "tool" && tools.has(part.name) && !calls.has(part.name)) calls.set(part.name, part.id)
      }
    }
    return calls
  })

  return {
    find: (name: string) => items().byTool.get(name),
    separate: () => items().separate,
  }
}
