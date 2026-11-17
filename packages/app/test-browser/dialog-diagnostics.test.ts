import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { createComponent, render } from "solid-js/web"
import { dict as ru } from "@/i18n/ru"
import type { DiagnosticsFile, DiagnosticsPrepared } from "@/utils/diagnostics"

let prepare: () => Promise<DiagnosticsPrepared>
let DialogDiagnostics: typeof import("@/components/dialog-diagnostics").DialogDiagnostics
// The test preload compiles TSX to hyperscript, which evaluates props eagerly. Reactivity of the window
// is what failed, so compile it with the Solid compiler the app build uses (vite-plugin-solid).
const compiled = join(import.meta.dir, `.dialog-diagnostics-${process.pid}.ts`)
afterAll(() => rmSync(compiled, { force: true }))

beforeAll(async () => {
  const pass = (props: { children?: unknown }) => props.children
  mock.module("@opencode-ai/ui/button", () => ({ Button: pass }))
  mock.module("@opencode-ai/ui/checkbox", () => ({ Checkbox: pass }))
  mock.module("@opencode-ai/ui/dialog", () => ({ Dialog: pass }))
  mock.module("@opencode-ai/ui/context/dialog", () => ({ useDialog: () => ({ close() {} }) }))
  mock.module("@/utils/toast", () => ({ showToast() {} }))
  mock.module("@/context/language", () => ({
    useLanguage: () => ({
      t: (key: keyof typeof ru, params: Record<string, unknown> = {}) =>
        String(ru[key]).replace(/{{(\w+)}}/g, (_, name: string) => String(params[name])),
    }),
  }))
  mock.module("@/context/platform", () => ({
    usePlatform: () => ({ diagnostics: { prepare: () => prepare(), preview: async () => undefined, save: async () => undefined } }),
  }))
  const require = createRequire(createRequire(import.meta.path).resolve("vite-plugin-solid"))
  const babel = require("@babel/core") as typeof import("@babel/core")
  const source = join(import.meta.dir, "../src/components/dialog-diagnostics.tsx")
  const output = babel.transformSync(readFileSync(source, "utf8"), {
    filename: source,
    babelrc: false,
    configFile: false,
    presets: [[require("babel-preset-solid"), { generate: "dom", hydratable: false }]],
    parserOpts: { plugins: ["jsx", "typescript"] },
  })
  writeFileSync(compiled, output!.code!)
  DialogDiagnostics = (await import(compiled)).DialogDiagnostics
})

// LAB-1776: the window showed «файлов: 0, 1 KB» for every group while the ZIP held 49 files.
test("group counters show the files and sizes of the prepared archive, not the empty list before it", async () => {
  let resolve!: (value: DiagnosticsPrepared) => void
  prepare = () => new Promise((done) => (resolve = done))
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(() => createComponent(DialogDiagnostics, {}), host)
  const summary = (group: string) => host.querySelector(`[data-tid="diagnostics-group-${group}-summary"]`)?.textContent

  const files: DiagnosticsFile[] = [
    { name: "runtime/a/execution-events.jsonl", group: "runtime", status: "included", size: 4 * 1024 },
    { name: "runtime/diagnostics/b/events.jsonl", group: "runtime", status: "included", size: 42 * 1024 },
    { name: "desktop/20261116T234555/main.log", group: "logs", status: "included", size: 3 * 1024 },
    { name: "desktop/20261116T234555/server.log", group: "logs", status: "included", size: 5 * 1024 },
    { name: "desktop/20261116T234555/network.netlog", group: "logs", status: "omitted", reason: "unreadable-or-not-redactable" },
    { name: "crashpad/a.dmp", group: "dumps", status: "omitted", reason: "unreadable-or-not-redactable" },
    { name: "manifest.json", group: "logs", status: "included", size: 7 * 1024 },
  ]
  resolve({ id: "ready", size: 95 * 1024, selection: "recent", files })
  await new Promise((done) => setTimeout(done, 0))

  // The same groups and sizes as the files that go into the ZIP (manifest.json is listed, not counted).
  expect(summary("runtime")).toBe("файлов: 2, 46 KB; пропущено: 0")
  expect(summary("logs")).toBe("файлов: 2, 8 KB; пропущено: 1")
  // An empty group is 0 KB, as in the ZIP.
  expect(summary("dumps")).toBe("файлов: 0, 0 KB; пропущено: 1")
  dispose()
  host.remove()
})
