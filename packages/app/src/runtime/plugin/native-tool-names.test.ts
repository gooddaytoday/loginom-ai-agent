import { expect, test } from "bun:test"
import { nativeToolNames } from "./native-tool-names"

const packages = new URL("../../../../", import.meta.url)

test.each([
  ["session-ui/src/tools/tool-renderer.tsx", /ToolRegistry\.register\(\{\s*name: "([^"]+)"/g, undefined],
  ["session-ui/src/timeline-next/rules.ts", /const tools = .*?Object\.entries\(\{(.*?)\} satisfies/s, /^\s{4}(\w+):/gm],
  ["tui/src/mini/tool.ts", /type ToolName =([^;]*?)\ntype /s, /\| "([^"]+)"/g],
] as const)("reserves the native tool names in %s", async (path, pattern, names) => {
  const source = await Bun.file(new URL(path, packages)).text()
  const declarations = names ? (source.match(pattern)?.[1] ?? "") : source
  const listed = Array.from(declarations.matchAll(names ?? pattern), (match) => match[1])

  expect(listed.length).toBeGreaterThan(0)
  expect(listed.filter((name) => !nativeToolNames.has(name))).toEqual([])
})
