import { ToolRenderer } from "@opencode/plugin/gui/builtin"
import type { ToolRenderContribution } from "@opencode/session-ui/context"
import { createMemo, For, mergeProps } from "solid-js"
import { usePluginHost, type Item } from "@/runtime/plugin/host"
import { Contribution } from "@/runtime/plugin/render"

export function createToolRenderers() {
  const host = usePluginHost()
  const wrapped = new WeakMap<Item<ToolRenderer>, ToolRenderContribution>()

  const items = createMemo(() => {
    const byTool = new Map<string, { renderer: ToolRenderContribution; separate: boolean }>()
    const prefixes: { prefix: string; entry: { renderer: ToolRenderContribution; separate: boolean } }[] = []

    for (const item of host.items(ToolRenderer)) {
      const name = item.value.tool

      const renderer =
        wrapped.get(item) ??
        ({
          get title() {
            return item.value.title
          },
          get handlesFailure() {
            return item.value.handlesFailure
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
      const entry = { renderer, separate: item.value.separate === true }

      if (name.endsWith("*")) prefixes.push({ prefix: name.slice(0, -1), entry })
      else byTool.set(name, entry)
    }

    prefixes.sort((a, b) => b.prefix.length - a.prefix.length)
    const find = (name: string) => byTool.get(name) ?? prefixes.find(({ prefix }) => name.startsWith(prefix))?.entry
    const hasSeparate = [...byTool.values(), ...prefixes.map(({ entry }) => entry)].some(({ separate }) => separate)
    const separate = hasSeparate ? { has: (name: string) => find(name)?.separate === true } : undefined

    return { find, separate }
  })

  return {
    find: (name: string) => items().find(name)?.renderer,
    separate: () => items().separate,
  }
}
