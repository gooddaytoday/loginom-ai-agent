import { $ } from "bun"
import { mkdtemp, mkdir, link, rm } from "node:fs/promises"
import { isAbsolute, join } from "node:path"

// Sign before resource staging inventories the helper. Stable identity identifies
// this test helper; ad-hoc signing does not guarantee Keychain access across updates.
export async function buildKeychain(output: string) {
  if (process.platform !== "darwin" || process.arch !== "arm64") throw Error("LOGINOM_NATIVE_RESOURCES_UNAVAILABLE")
  if (!isAbsolute(output)) throw Error("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  await mkdir(output, { recursive: true })
  const work = await mkdtemp(join(output, ".keychain-build-"))
  try {
    await $`/usr/bin/clang -fobjc-arc -arch arm64 -mmacosx-version-min=14.0 -framework Foundation -framework Security ${join(import.meta.dir, "../native/keychain.m")} -o ${join(work, "loginom-keychain")}`
    await $`/usr/bin/codesign --force --sign - --timestamp=none --identifier com.loginom.aiagent.cli.keychain ${join(work, "loginom-keychain")}`
    await $`/usr/bin/codesign --verify --strict ${join(work, "loginom-keychain")}`
    await link(join(work, "loginom-keychain"), join(output, "loginom-keychain"))
    return join(output, "loginom-keychain")
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
if (import.meta.main) {
  if (!process.argv[2]) throw Error("Provide absolute helper output directory")
  await buildKeychain(process.argv[2])
}
