import { expect, test } from "bun:test"
import { isProductBuild } from "./feed"

const feed = "https://updates.example.test/loginom/latest"

// Loginom AI Agent (B4.12, UPDATE-01): the product feed may only offer this product. The file lists below are what
// electron-updater reads from latest*.yml: names relative to the feed, or absolute URLs.
test.each([
  { files: ["loginom-ai-agent-win-x64.exe"], accepted: true },
  { files: ["loginom-ai-agent-mac-arm64.zip", "loginom-ai-agent-mac-arm64.dmg"], accepted: true },
  { files: [`${feed}/loginom-ai-agent-linux-x86_64.AppImage`], accepted: true },
  { files: ["opencode-desktop-win-x64.exe"], accepted: false },
  { files: ["loginom-ai-agent-win-x64.exe", "opencode-desktop-win-arm64.exe"], accepted: false },
  { files: ["https://opencode.ai/download/loginom-ai-agent-win-x64.exe"], accepted: false },
  { files: ["../beta/loginom-ai-agent-win-x64.exe"], accepted: false },
  { files: [], accepted: false },
])("the product feed offering $files is accepted: $accepted", ({ files, accepted }) => {
  const offered = files.map((url) => ({ url }))

  expect(isProductBuild(offered, feed)).toBe(accepted)
})
