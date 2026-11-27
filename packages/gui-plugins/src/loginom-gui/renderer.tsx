import { ToolRenderer } from "@opencode/plugin/gui/builtin"
import type { Plugin } from "@opencode/plugin/gui"
import { Option } from "effect"
import { createMemo, lazy, Show, Suspense } from "solid-js"
import type definition from "./index"
import { decodePackageChanges, packageChangesTool } from "./package-changes-data"

const Card = lazy(async () => {
  const { PackageChangesCard } = await import("./package-changes")

  return { default: PackageChangesCard }
})

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  ctx.add(ToolRenderer, {
    tool: packageChangesTool,
    separate: true,
    get title() {
      return ctx.t("changes.title")
    },
    render(props) {
      const changes = createMemo(() =>
        props.status === "completed"
          ? Option.getOrUndefined(decodePackageChanges(props.metadata))?.loginom.packageChanges
          : undefined,
      )

      return (
        <Show when={changes()?.edits.length || changes()?.schemas ? changes() : undefined} keyed>
          {(value) => (
            <Suspense>
              <Card changes={value} />
            </Suspense>
          )}
        </Show>
      )
    },
  })
}

export default setup
