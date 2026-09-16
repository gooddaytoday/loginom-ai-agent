import { Product, productChannel, productName } from "@loginom-ai-agent/product"
import { resolveChannel } from "./utils"

const channel = productChannel(process.argv[2] ?? resolveChannel())
const appId = Product.channels[channel]
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${appId}</id>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT AND AGPL-3.0-only</project_license>
  <name>${productName(channel)}</name>
  <summary>AI assistant for Loginom workflows</summary>
  <description><p>Create, execute and verify Loginom workflows with an AI assistant.</p></description>
  <launchable type="desktop-id">${appId}.desktop</launchable>
  <content_rating type="oars-1.1" />
</component>
`
await Bun.write(`resources/${appId}.metainfo.xml`, xml)
