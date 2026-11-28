import { Product } from "@loginom-ai-agent/product"
import { verifyUpdateSignature } from "@loginom-ai-agent/product/update-signature"
import { parseUpdateInfo, resolveFiles } from "electron-updater/out/providers/Provider.js"
import { GenericProvider } from "electron-updater/out/providers/GenericProvider.js"
import type { ProviderRuntimeOptions } from "electron-updater/out/providers/Provider.js"
import type { AppUpdater, UpdateInfo } from "electron-updater"
import { Predicate, Schema } from "effect"
import { isUpdateTransportError, updateAssetUrl, updateKeys, UpdateHttpError, UpdateTransportError, type UpdateSource } from "../update-feed"

export function updateMode(platform: NodeJS.Platform, appImage?: string) {
  return platform === "win32" || (platform === "linux" && Boolean(appImage)) ? "automatic" : "notify"
}

type SelectedUpdate = {
  source: UpdateSource["kind"]
  feed: string
  signed: SignedUpdateInfo
  url(file: string, signed?: boolean): string
}

export async function loadSignedUpdate(input: {
  sources: readonly UpdateSource[]
  read(url: string, timeout?: number): Promise<Buffer>
  file: string
  currentVersion: string
  keys?: readonly string[]
}): Promise<SelectedUpdate | undefined> {
  const failures: string[] = []

  for (const source of input.sources) {
    try {
      const deadline = Date.now() + 30_000

      const read = (url: string) => {
        const remaining = deadline - Date.now()

        if (remaining <= 0) throw new UpdateTransportError("LOGINOM_UPDATE_FEED_TIMEOUT")

        return input.read(url, remaining)
      }

      const release = source.kind === "github" ? await githubUpdateRelease(source, read) : undefined
      let feed: string

      if (source.kind === "github") {
        if (!release || compareUpdateVersions(release.tag_name.slice(1), input.currentVersion) <= 0) return undefined
        feed = new URL(encodeURIComponent(release.tag_name) + "/", source.download).href
      } else {
        feed = source.feed
      }

      // Sequential reads ensure an invalid primary signature is never hidden by
      // a racing transport error. Every request has a total wall-clock deadline.
      const raw = await read(updateAssetUrl(source, feed, input.file))
      const signature = await read(updateAssetUrl(source, feed, input.file + ".sig"))
      const signed = verifyUpdateManifest(raw, signature.toString("utf8"), feed, input.keys)

      if (release && release.tag_name !== "v" + signed.version) throw Error("LOGINOM_UPDATE_RELEASE_MISMATCH")

      // An older signed feed (an S3 mirror behind GitHub, or an installed
      // pre-release) means no update, as on GitHub; downgrades stay disabled.
      if (compareUpdateVersions(signed.version, input.currentVersion) < 0) return undefined

      return {
        source: source.kind,
        feed,
        signed,
        url: (file, signed) => updateAssetUrl(source, feed, file, signed),
      }
    } catch (error) {
      if (source.kind === "github" && error instanceof UpdateHttpError && error.statusCode === 404) return undefined

      if (!(error instanceof UpdateTransportError)) throw error
      failures.push(source.kind + ": " + error.message)
    }
  }

  throw Error("LOGINOM_UPDATE_SOURCES_UNAVAILABLE (" + failures.join("; ") + ")")
}

export function updateNotificationLink(selected: SelectedUpdate, file: string) {
  const url = selected.url(file, false)

  return {
    url,
    resolve: (requested: string) => {
      if (requested !== url) throw Error("LOGINOM_UPDATE_TARGET_INVALID")

      return selected.url(file)
    },
  }
}

async function githubUpdateRelease(
  source: Extract<UpdateSource, { kind: "github" }>,
  read: (url: string) => Promise<Buffer>,
) {
  const Release = Schema.Struct({
    tag_name: Schema.String.check(Schema.isPattern(/^v\d+\.\d+\.\d+$/)),
    draft: Schema.Literal(false),
    prerelease: Schema.Boolean,
  })

  const valid = Schema.is(Release)
  const api = source.api.replace(/\/+$/, "")

  const latest = await (async () => {
    try {
      const release: unknown = JSON.parse((await read(api + "/latest")).toString("utf8"))

      if (!valid(release) || release.prerelease) throw Error("LOGINOM_UPDATE_RELEASE_INVALID")

      return release
    } catch (error) {
      if (error instanceof UpdateHttpError && error.statusCode === 404) return undefined
      throw error
    }
  })()

  if (source.channel === "stable") return latest

  // Keep release-list responses comfortably below the metadata byte limit.
  for (let page = 1; page <= 10; page++) {
    const releases: unknown = JSON.parse((await read(api + `?per_page=5&page=${page}`)).toString("utf8"))

    if (!Array.isArray(releases)) throw Error("LOGINOM_UPDATE_RELEASE_INVALID")
    const release = releases.filter(valid).find((item) => item.prerelease)

    if (release)
      return !latest || compareUpdateVersions(release.tag_name.slice(1), latest.tag_name.slice(1)) > 0
        ? release
        : latest

    if (releases.length < 5) break
  }

  return latest
}

function configureSignedUpdate(
  updater: Pick<AppUpdater, "setFeedURL" | "allowDowngrade">,
  selected: SelectedUpdate,
  preferArm64 = false,
) {
  // Use electron-updater's supported custom-provider hook, based on GenericProvider.
  // It consumes the verified snapshot without a second unsigned metadata request.
  // Only URL resolution differs for flat GitHub assets and the S3 releases tree.
  class SignedProvider extends GenericProvider {
    constructor(_options: { provider: "custom" }, updater: AppUpdater, runtime: ProviderRuntimeOptions) {
      super({ provider: "generic", url: selected.feed, useMultipleRangeRequest: false }, updater, {
        ...runtime,
        isUseMultipleRangeRequest: false,
      })
    }
    override async getLatestVersion() {
      // Keep approval evidence independent of the updater's mutable UpdateInfo.
      return structuredClone(selected.signed)
    }
    override resolveFiles(info: UpdateInfo) {
      matchUpdateManifest(selected.signed, info)
      const native = preferArm64 ? info.files.filter((file) => file.url.includes("arm64")) : []

      return resolveFiles(native.length ? { ...info, files: native } : info, new URL(selected.feed), selected.url)
    }
  }

  updater.setFeedURL({ provider: "custom", updateProvider: SignedProvider, url: selected.feed })
  updater.allowDowngrade = false
}

export function downloadTarget(updater: AppUpdater): object | undefined {
  const target: object | null | undefined = Object.getOwnPropertyDescriptor(updater, "updateInfoAndProvider")?.value

  if (Predicate.isObject(target) && "info" in target && Predicate.isObject(target.info)) return target.info
}

export async function checkAutomaticUpdate(updater: AppUpdater, selected: SelectedUpdate, preferArm64: boolean) {
  configureSignedUpdate(updater, selected, preferArm64)
  const result = await updater.checkForUpdates()

  if (!result?.isUpdateAvailable) return undefined
  matchUpdateManifest(selected.signed, result.updateInfo)

  if (downloadTarget(updater) !== result.updateInfo) throw Error("LOGINOM_UPDATE_MANIFEST_MISMATCH")

  return { info: result.updateInfo, selected }
}

export async function downloadSignedUpdate(
  updater: AppUpdater,
  selected: SelectedUpdate,
  fallback: () => Promise<SelectedUpdate | undefined>,
  preferArm64 = false,
) {
  updater.allowDowngrade = false

  try {
    return await updater.downloadUpdate()
  } catch (error) {
    if (selected.source !== "github" || !(error instanceof Error) || !isUpdateTransportError(error)) throw error
    const next = await fallback()

    if (!next) throw Error("LOGINOM_UPDATE_MANIFEST_MISMATCH")
    // A download fallback cannot silently replace the version already shown in
    // the UI. It needs the same signed target, rollout and minimum version.
    matchUpdateManifest(selected.signed, next.signed)

    if (!(await checkAutomaticUpdate(updater, next, preferArm64))) throw Error("LOGINOM_UPDATE_MANIFEST_MISMATCH")

    try {
      return await updater.downloadUpdate()
    } catch (error) {
      if (!(error instanceof Error) || !isUpdateTransportError(error)) throw error
      throw Error("LOGINOM_UPDATE_SOURCES_UNAVAILABLE (github; generic download)")
    }
  }
}

export function compareUpdateVersions(left: string, right: string) {
  if (![left, right].every((version) => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)))
    throw Error("LOGINOM_UPDATE_VERSION_INVALID")
  const a = left.split(".").map(Number)
  const b = right.split(".").map(Number)

  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1
  }

  return 0
}

type SignedUpdateInfo = UpdateInfo & { minSupportedVersion: string; stagingPercentage?: number }

// Verify the exact response bytes before YAML parsing; either pinned key may sign a release.
function verifyUpdateManifest(
  raw: Buffer,
  signature: string,
  feed: string,
  keys: readonly string[] = updateKeys,
): SignedUpdateInfo {
  if (!verifyUpdateSignature(raw, signature, keys)) throw Error("LOGINOM_UPDATE_SIGNATURE_INVALID")
  const info = parseUpdateInfo(raw.toString("utf8"), "latest.yml", new URL(feed))
  const minimum = "minSupportedVersion" in info ? info.minSupportedVersion : undefined

  if (!Predicate.isString(minimum)) throw Error("LOGINOM_UPDATE_VERSION_INVALID")
  compareUpdateVersions(info.version, minimum)

  if (
    info.stagingPercentage !== undefined &&
    (!Number.isFinite(info.stagingPercentage) || info.stagingPercentage < 0 || info.stagingPercentage > 100)
  )
    throw Error("LOGINOM_UPDATE_STAGING_INVALID")
  // Preserve all existing origin, product filename and SHA-512 checks.
  validateUpdate(info, feed)
  const paths = [info.path, ...info.files.map((file) => file.url)]

  if (
    paths.some(
      (path) =>
        !Predicate.isString(path) ||
        !(path.startsWith(info.version + "/") || path.startsWith("releases/" + info.version + "/")) ||
        path.replace(/^(?:releases\/)?[^/]+\//, "").includes("/") ||
        path.includes("\\") ||
        path.includes("%") ||
        path.includes("?") ||
        path.includes("#"),
    )
  )
    throw Error("LOGINOM_UPDATE_TARGET_INVALID")

  if (info.sha512 !== undefined && !info.files.some((file) => file.url === info.path && file.sha512 === info.sha512))
    throw Error("LOGINOM_UPDATE_TARGET_INVALID")

  // NSIS web packages are outside this signed feed contract.
  if ("packages" in info) throw Error("LOGINOM_UPDATE_TARGET_INVALID")

  return Object.assign(info, { minSupportedVersion: minimum })
}

export function matchUpdateManifest(signed: SignedUpdateInfo, info: UpdateInfo) {
  if (
    "packages" in info ||
    JSON.stringify([
      signed.version,
      signed.path,
      signed.sha512,
      signed.files,
      signed.minSupportedVersion,
      signed.stagingPercentage,
    ]) !==
      JSON.stringify([
        info.version,
        info.path,
        info.sha512,
        info.files,
        "minSupportedVersion" in info ? info.minSupportedVersion : undefined,
        info.stagingPercentage,
      ])
  )
    throw Error("LOGINOM_UPDATE_MANIFEST_MISMATCH")
}

function validateUpdate(info: { files: { url: string; sha512: string }[] }, feed: string) {
  const base = new URL(feed.endsWith("/") ? feed : feed + "/")

  if (!info.files.length) throw Error("LOGINOM_UPDATE_FILES_MISSING")

  for (const file of info.files) {
    const url = new URL(file.url, base)
    const name = decodeURIComponent(url.pathname.slice(url.pathname.lastIndexOf("/") + 1))

    if (
      url.origin !== base.origin ||
      !url.pathname.startsWith(base.pathname) ||
      url.username ||
      url.password ||
      !name.startsWith(Product.slug + "-") ||
      !/^[A-Za-z0-9._-]+$/.test(name) ||
      !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)
    )
      throw Error("LOGINOM_UPDATE_TARGET_INVALID")
  }
}
