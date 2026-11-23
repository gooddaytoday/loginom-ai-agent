import { expect, test } from "bun:test"
import { join } from "node:path"
import { Product } from "@loginom-ai-agent/product"

// Packaged windows load the renderer through the privileged `oc://` protocol, where a root-relative
// path such as `src="/foo.js"` resolves from the protocol origin instead of next to the HTML entry.
test("index.html references local resources by relative path and has no web manifest", async () => {
  const content = await Bun.file(join(import.meta.dirname, "index.html")).text()

  const paths = [...content.matchAll(/\bsrc=["']([^"']+)["']|<link[^>]+href=["']([^"']+)["']/g)].map(
    (match) => match[1] ?? match[2],
  )

  expect(paths.length).toBeGreaterThan(0)

  for (const path of paths) expect(path).not.toMatch(/^\/[^/]/)
  // A web app manifest does not apply in Electron.
  expect(content).not.toContain('rel="manifest"')
})

// Fork (catalog CAT-09): static HTML cannot read the channel, so the pre-load title is the product name for every
// channel, as in 0.4; the windows themselves carry the channel name (`APP_NAME`).
test("index.html titles the window with the product name", async () => {
  const content = await Bun.file(join(import.meta.dirname, "index.html")).text()

  expect(content.match(/<title[^>]*>([^<]*)<\/title>/)?.[1]).toBe(Product.name)
})

// Telemetry must not delay first paint: nothing awaits before render, and the Sentry SDK loads lazily.
test("the renderer entry renders while optional telemetry is still loading", async () => {
  const entry = await Bun.file(join(import.meta.dirname, "index.tsx")).text()
  const render = entry.indexOf("render(")
  expect(render).toBeGreaterThan(-1)
  expect(entry.slice(0, render)).not.toMatch(/\bawait\b/)

  for await (const file of new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: import.meta.dirname })) {
    if (file.includes(".test.")) continue
    expect(await Bun.file(join(import.meta.dirname, file)).text()).not.toMatch(/\bfrom\s+["']@sentry\//)
  }
})
