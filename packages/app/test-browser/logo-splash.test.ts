import { expect, test } from "bun:test"
import { createRequire } from "node:module"
import { createComponent, render } from "solid-js/web"

// Bun does not compile Solid JSX. Compile the real logo with the same presets as Vite.
const require = createRequire(import.meta.url)

const solid = createRequire(require.resolve("vite-plugin-solid"))

const { transformSync } = solid("@babel/core")

// This file runs with --isolate. Replace the shared hyperscript preload: with it, the logo's JSX runtime is undefined.
Bun.plugin.clearAll()

Bun.plugin({
  name: "logo-solid",
  setup(build) {
    build.onLoad({ filter: /[\\/]components[\\/]logo\.tsx$/ }, async (args) => ({
      contents: transformSync(await Bun.file(args.path).text(), {
        filename: args.path,
        presets: [solid.resolve("babel-preset-solid"), solid.resolve("@babel/preset-typescript")],
      }).code,
      loader: "js",
    }))
  },
})

const { Splash } = await import("@opencode/ui/logo")

// Loginom AI Agent (B4.6b): the Desktop startup splash shows the product mark, as 0.4 did, not the OpenCode mark.
test("the startup splash draws the product mark", async () => {
  const root = document.createElement("div")
  const dispose = render(() => createComponent(Splash, { class: "size-16" }), root)

  try {
    const svg = root.querySelector('[data-component="logo-splash"]')
    const href = String(svg?.querySelector("image")?.getAttribute("href"))

    expect(svg?.querySelectorAll("path")).toHaveLength(0)
    expect(href).toEndWith("loginom-icon.svg")
    expect(await Bun.file(href).text()).toBe(
      await Bun.file(new URL("../../../apps/loginom-site/assets/loginom-icon.svg", import.meta.url)).text(),
    )
  } finally {
    dispose()
  }
})
