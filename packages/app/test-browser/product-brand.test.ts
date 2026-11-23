import { expect, test } from "bun:test"
import { readdirSync, realpathSync } from "node:fs"
import { createRequire } from "node:module"
import type { JSX } from "solid-js"
import { createComponent, render } from "solid-js/web"
import { Product } from "@loginom-ai-agent/product"
import type { Platform } from "@/runtime/platform/platform"
import en from "@/runtime/i18n/en"
import { dict } from "@/runtime/i18n/ru"

// Loginom AI Agent (B4.6b, B4.11d): what a Desktop user sees names the product, as in 0.4, not OpenCode.

// Bun does not compile Solid JSX. Compile the real components with the same presets as Vite.
const require = createRequire(import.meta.url)

const solid = createRequire(require.resolve("vite-plugin-solid"))

const { transformSync } = solid("@babel/core")

// This file runs with --isolate. Replace the shared hyperscript preload: with it, the components' JSX runtime is undefined.
Bun.plugin.clearAll()

Bun.plugin({
  name: "product-brand-solid",
  setup(build) {
    build.onLoad({ filter: /[\\/]packages[\\/][^\\/]+[\\/]src[\\/].+\.tsx$/ }, async (args) => ({
      contents: transformSync(await Bun.file(args.path).text(), {
        filename: args.path,
        presets: [solid.resolve("babel-preset-solid"), solid.resolve("@babel/preset-typescript")],
      }).code,
      loader: "js",
    }))
    // The Desktop splash imports its stylesheet, which a DOM without layout does not need.
    build.onLoad({ filter: /[\\/]startup[\\/]splash\.css$/ }, () => ({ contents: "", loader: "js" }))
  },
})

const { Mark, Splash } = await import("@opencode/ui/logo")

const { LoadingSplash } = await import("../../desktop/src/renderer/startup/splash")

const { PlatformProvider } = await import("@/runtime/platform/platform")

const { LanguageProvider } = await import("@/runtime/i18n/language")

const { ErrorPage } = await import("@/shell/errors/error")

const productIcon = await Bun.file(
  new URL("../../../apps/loginom-site/assets/loginom-icon.svg", import.meta.url),
).text()

const desktop = { os: "linux", openExternal() {} } as unknown as Platform

function mount(component: () => JSX.Element) {
  const root = document.createElement("div")
  document.body.append(root)

  return { root, dispose: render(component, root) }
}

async function expectProductMark(svg: Element | null | undefined) {
  const href = String(svg?.querySelector("image")?.getAttribute("href"))

  expect(svg?.querySelectorAll("path")).toHaveLength(0)
  expect(href).toEndWith("loginom-icon.svg")
  expect(await Bun.file(href).text()).toBe(productIcon)
}

test("the startup splash draws the product mark", async () => {
  const page = mount(() => createComponent(Splash, { class: "size-16" }))

  try {
    await expectProductMark(page.root.querySelector('[data-component="logo-splash"]'))
  } finally {
    page.dispose()
  }
})

test("the empty side pane draws the product mark", async () => {
  const page = mount(() => createComponent(Mark, { class: "w-14" }))

  try {
    await expectProductMark(page.root.querySelector('[data-component="logo-mark"]'))
  } finally {
    page.dispose()
  }
})

test("the first-launch splash draws the product mark and still finishes the onboarding preview", async () => {
  const drawing: string[] = []
  // A focused, visible window with motion allowed: the case where the OpenCode wordmark waited for its outline.
  const page = mount(() =>
    createComponent(LoadingSplash, {
      firstLaunch: true,
      deep: false,
      platform: desktop,
      drawingPaused: true,
      onDrawStart: () => drawing.push("start"),
      onDrawEnd: () => drawing.push("end"),
    }),
  )

  try {
    const splash = page.root.querySelector('[data-component="first-launch-splash"]')

    expect(splash?.querySelectorAll("path")).toHaveLength(0)
    await expectProductMark(splash?.querySelector('[data-component="logo-splash"]'))
    expect(drawing).toEqual(["start", "end"])
  } finally {
    page.dispose()
  }
})

test("the error page names the product and sends reports to the product", () => {
  const opened: string[] = []
  const platform = { platform: "web", restart: async () => {}, openExternal: (url: string) => opened.push(url) }
  const page = mount(() =>
    createComponent(PlatformProvider, {
      value: platform as unknown as Platform,
      get children() {
        return createComponent(LanguageProvider, {
          locale: "en",
          get children() {
            return createComponent(ErrorPage, { error: new Error("boom") })
          },
        })
      },
    }),
  )

  try {
    const report = [...page.root.querySelectorAll("button")].find(
      (button) => button.textContent === en["error.page.report.discord"],
    )

    expect(page.root.querySelectorAll("path")).toHaveLength(0)
    expect(page.root.textContent).toContain(Product.name)
    expect(page.root.textContent).not.toMatch(/opencode/i)
    report?.click()
    expect(opened).toEqual([Product.support])
  } finally {
    page.dispose()
  }
})

test("About states the license of Desktop 0.4 in en and ru", () => {
  expect(en["settings.about.license"]).toContain("MIT AND AGPL-3.0-only")
  expect(dict["settings.about.license"]).toContain("MIT AND AGPL-3.0-only")
})

test("pairing and the settings rows that 0.4 named the product do not say OpenCode", async () => {
  const pairing = (await import("../../gui-plugins/src/pairing/i18n/en")).default
  const keys = [
    "provider.connect.apiKey.description",
    "error.chain.mcpFailed",
    "settings.general.row.language.description",
    "settings.general.row.colorScheme.description",
    "settings.general.row.theme.description",
  ] as const
  const values = [...Object.values(pairing), ...[en, dict].flatMap((messages) => keys.map((key) => messages[key]))]

  expect(values.filter((value) => /opencode/i.test(value))).toEqual([])
})

test("the Desktop page and the public folder carry no OpenCode favicons", async () => {
  const pub = new URL("../public/", import.meta.url)
  const upstream = realpathSync(new URL("../../ui/src/assets/favicon/", import.meta.url))
  const page = await Bun.file(new URL("../../desktop/src/renderer/index.html", import.meta.url)).text()
  const links = [...page.matchAll(/<link[^>]+href="\.\/([^"]+)"/g)].map((match) => match[1]!)
  // A link to a removed file throws here, so the page cannot point at a favicon that no longer ships.
  const fromUpstream = (names: string[]) =>
    names.filter((name) => realpathSync(new URL(name, pub)).startsWith(upstream))

  expect(links.length).toBeGreaterThan(0)
  expect(fromUpstream(links)).toEqual([])
  expect(fromUpstream(readdirSync(pub))).toEqual([])
})
