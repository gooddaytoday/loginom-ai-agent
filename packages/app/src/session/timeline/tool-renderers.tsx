import { ToolRenderer } from "@opencode/plugin/gui/builtin"
import type { ToolRenderContribution } from "@opencode/session-ui/context"
import { createMemo, For, mergeProps } from "solid-js"
import { usePluginHost, type Item } from "@/runtime/plugin/host"
import { Contribution } from "@/runtime/plugin/render"

export function createToolRenderers() {
  const host = usePluginHost()
  const wrapped = new WeakMap<Item<ToolRenderer>, ToolRenderContribution>()

  const items = createMemo(() => {
    const byTool = new Map<string, ToolRenderContribution>()
    const separate = new Set<string>()

    for (const item of host.items(ToolRenderer)) {
      const name = item.value.tool

      const renderer =
        wrapped.get(item) ??
        ({
          get title() {
            return item.value.title
          },
          // A new status gives a failed renderer a fresh error boundary.
          render: (props, fallback) => (
            <For each={[props.status]}>
              {() => (
                <Contribution plugin={item.plugin} fallback={fallback}>
                  {() =>
                    item.value.render(
                      mergeProps(props, {
                        get title() {
                          return item.value.title
                        },
                      }),
                    )
                  }
                </Contribution>
              )}
            </For>
          ),
        } satisfies ToolRenderContribution)

      wrapped.set(item, renderer)
      byTool.set(name, renderer)

      if (item.value.separate) separate.add(name)
    }

    return { byTool, separate: separate.size > 0 ? separate : undefined }
  })

  return {
    find: (name: string) => items().byTool.get(name),
    separate: () => items().separate,
  }
}
