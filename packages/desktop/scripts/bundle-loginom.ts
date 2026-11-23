import { resolve, dirname, join } from "node:path"
import { mkdir, rm } from "node:fs/promises"
import { parseUpdateS3Config } from "@loginom-ai-agent/product/update-signature"
import { stageResources } from "../../loginom-host/script/stage-resources"
import { buildNodeHost } from "../../loginom-host/script/build-node-host"

export async function writeUpdateS3Resource(file: string, environment: NodeJS.ProcessEnv) {
  // Remove a previous build's key even when the new build disables private S3.
  await rm(file, { force: true })

  if (!environment.LOGINOM_UPDATES_S3_READ_ACCESS_KEY && !environment.LOGINOM_UPDATES_S3_READ_SECRET_KEY) return false

  const config = parseUpdateS3Config({
    endpoint: environment.LOGINOM_UPDATES_S3_ENDPOINT,
    region: environment.LOGINOM_UPDATES_S3_REGION,
    bucket: environment.LOGINOM_UPDATES_S3_BUCKET,
    accessKeyId: environment.LOGINOM_UPDATES_S3_READ_ACCESS_KEY,
    secretAccessKey: environment.LOGINOM_UPDATES_S3_READ_SECRET_KEY,
  })

  await mkdir(dirname(file), { recursive: true })
  await Bun.write(file, JSON.stringify(config))

  return true
}

if (import.meta.main) {
  const node = process.env.LOGINOM_AI_AGENT_NODE_SOURCE
  const browsers = process.env.LOGINOM_AI_AGENT_BROWSER_SOURCE

  if (!node || !browsers) throw new Error("Set LOGINOM_AI_AGENT_NODE_SOURCE and LOGINOM_AI_AGENT_BROWSER_SOURCE")

  const destination = resolve(import.meta.dir, "../resources/loginom")

  const result = await stageResources({
    destination,
    node,
    browsers,
    target: { platform: process.platform, arch: process.arch },
    flavor: "desktop",
  })

  // Loginom AI Agent (B4.8a): the background service starts its Host from the bundled Node and this entry (B2.3), as
  // the CLI artifact does (`build-cli.ts`). resource-manifest.json does not list it; the app checks it is there.
  await buildNodeHost(join(destination, "host"))
  console.log(`Bundled Loginom ${process.platform}-${process.arch} runtime: ${result.files} verified resource files`)

  await writeUpdateS3Resource(resolve(import.meta.dir, "../resources/updates-s3.json"), process.env)
}
