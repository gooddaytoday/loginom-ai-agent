import { plugin } from "bun"
import { isServer } from "solid-js/web"
import solidPlugin from "vite-plugin-solid"

// Use the production Solid compiler: Bun's JSX transform loses runtime bindings and reactivity.
// Vite leaves TypeScript annotations for Bun's TS loader below.
const transform = solidPlugin({ hot: false, dev: false, ssr: true }).transform as (
  source: string, id: string, options: { ssr?: boolean },
) => Promise<{ code: string }>

plugin({
  name: "solid-jsx-runtime",
  setup(build) {
    build.onLoad({ filter: /\.[jt]sx$/ }, async (args) => ({
      contents: (await transform(await Bun.file(args.path).text(), args.path, { ssr: isServer })).code,
      loader: "ts",
    }))
  },
})
