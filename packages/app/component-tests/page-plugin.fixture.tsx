import { createKeyed, usePlugin, type Context } from "@opencode/plugin/gui"
import { Page } from "@opencode/plugin/gui/builtin"
import type { Entry } from "@opencode/plugin/gui/host"
import { onCleanup } from "solid-js"
import { PackagePicker } from "@opencode/gui-plugins/loginom-gui/contract"

export function pagePlugin({ failRender = false, packageAction = false } = {}): Entry {
  return {
    id: "@acme/opencode-gui",
    windowEntry: async () => ({
      default(ctx: Context) {
        if (packageAction) {
          let runs = 0
          createKeyed(ctx.use(PackagePicker), (picker) => {
            onCleanup(picker.register({
              id: "example",
              title: "Example package action",
              run(input) {
                if (input.kind === "loginom") {
                  runs += 1
                  ctx.toast.show({ title: `Package action ${runs}: ${input.package.path}` })
                }
              },
            }))
          })
        }

        ctx.add(Page, {
          id: "overview",
          title: "Example plugin page",
          nav: {},
          render() {
            if (failRender) throw new Error("Fixture page render failed")

            return (
              <section class="mx-auto w-full max-w-2xl px-5 py-8 text-v2-text-text-base">
                <h1 class="text-20-medium">Example plugin page</h1>
                <p class="mt-2 text-v2-text-text-muted">
                  Provided by <code>{usePlugin().id}</code>
                </p>
              </section>
            )
          },
        })
      },
    }),
  }
}
