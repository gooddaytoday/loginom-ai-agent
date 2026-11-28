import { usePlugin, type Context } from "@opencode/plugin/gui"
import { Page } from "@opencode/plugin/gui/builtin"
import type { Entry } from "@opencode/plugin/gui/host"

export function pagePlugin({ failRender = false } = {}): Entry {
  return {
    id: "@acme/opencode-gui",
    windowEntry: async () => ({
      default(ctx: Context) {
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
