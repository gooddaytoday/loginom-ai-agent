import { isAbsolute, join } from "node:path"
import { verifyCliManifest } from "../src/cli-manifest"
import { cliSourceSnapshot } from "./cli-source-snapshot"
import release from "../../product/loginom-release.json"
import { verifyCliCapabilities } from "./verify-cli-capabilities"

const [artifact, repo] = process.argv.slice(2)
if (!artifact || !repo || !isAbsolute(artifact) || !isAbsolute(repo))
  throw Error("Absolute artifact and repository required")
const metadata = await verifyCliManifest(artifact, { platform: process.platform, arch: process.arch })
const source = await cliSourceSnapshot(repo)
if (
  metadata.sourceCommit !== source.sourceCommit ||
  metadata.sourceDirty !== source.sourceDirty ||
  metadata.sourceTreeSha256 !== source.sourceTreeSha256
)
  throw Error("LOGINOM_CANDIDATE_SOURCE_MISMATCH")
if (
  metadata.dependencies.bun !== process.versions.bun ||
  metadata.dependencies.node !== release.nodeVersion ||
  metadata.dependencies.chromium !== release.chromiumRevision
)
  throw Error("LOGINOM_CANDIDATE_INPUT_MISMATCH")
await verifyCliCapabilities(join(artifact, "bin/loginom-ai-agent-cli"), metadata.capabilities)
console.log(JSON.stringify(metadata))
