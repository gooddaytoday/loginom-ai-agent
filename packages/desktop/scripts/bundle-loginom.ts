import { resolve } from "node:path"
import { stageResources } from "../../loginom-host/script/stage-resources"

const node = process.env.LOGINOM_AI_AGENT_NODE_SOURCE
const browsers = process.env.LOGINOM_AI_AGENT_BROWSER_SOURCE
if (!node || !browsers) throw new Error("Set LOGINOM_AI_AGENT_NODE_SOURCE and LOGINOM_AI_AGENT_BROWSER_SOURCE")
const result = await stageResources({
  destination: resolve(import.meta.dir, "../resources/loginom"),
  node,
  browsers,
  target: { platform: process.platform, arch: process.arch },
  flavor: "desktop",
})
console.log(`Bundled Loginom Linux runtime: ${result.files} verified resource files`)
