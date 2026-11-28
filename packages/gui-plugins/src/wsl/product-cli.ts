import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Product } from "@loginom-ai-agent/product"
import { downloadWslArchive } from "@loginom-ai-agent/product/wsl-release"
import type { MainContext } from "@opencode/plugin/gui/main"
import { wslCliExecutable, wslCliHome, wslCliPath } from "./product-cli-path"
import { shellEscape, type WslRuntime } from "./runtime"

export function discoverProductCli() {
  return `cli="${wslCliPath}"
if [ -x "$cli" ]; then readlink -f -- "$cli"; fi`
}

export async function installProductCli(
  runtime: Pick<WslRuntime, "runWslSh">,
  distro: string,
  version: string,
  t: MainContext["t"],
  signal: AbortSignal,
  logFailure: (code: string) => void,
) {
  const architecture = await runtime.runWslSh("uname -m", distro, { signal })
  if (architecture.code !== 0) throw Error(t("error.executeDistro"))
  const machine = architecture.stdout.trim()
  if (machine === "aarch64" || machine === "arm64") throw Error(t("error.armUnsupported"))
  if (machine !== "x86_64") throw Error(t("error.archUnsupported"))

  const feed = Product.updateFeed

  if (!feed) throw Error(t("error.releaseUnavailable"))

  const { net } = await import("electron")
  const base = URL.parse(feed.endsWith("/") ? feed : feed + "/")

  if (base?.protocol !== "https:" || base.username || base.password || base.search || base.hash)
    throw Error(t("error.releaseUnavailable"))

  const temporary = await mkdtemp(join(tmpdir(), "loginom-wsl-"))
  const destination = join(temporary, "cli.tar.gz")
  const downloadSignal = AbortSignal.any([signal, AbortSignal.timeout(10 * 60_000)])

  try {
    const digest = await downloadWslArchive({
      version,
      destination,
      get: async (name) => {
        const url = new URL(`releases/${encodeURIComponent(version)}/${encodeURIComponent(name)}`, base)

        try {
          return await net.fetch(url.href, { signal: downloadSignal })
        } catch {
          throw Error("WSL_CLI_NETWORK_ERROR")
        }
      },
    }).catch((cause: unknown) => {
      const code = cause instanceof Error ? cause.message : ""
      logFailure(/^WSL_CLI_[A-Z_]+$/.test(code) ? code : "WSL_CLI_DOWNLOAD_FAILED")
      throw Error(t("error.releaseVerification"))
    })

    const result = await runtime.runWslSh(productCliInstallScript(destination, digest, version), distro, {
      signal,
      timeoutMs: 4 * 60_000,
    })

    if (result.stderr.includes("WSL_CLI_CLEANUP_FAILED")) logFailure("WSL_CLI_CLEANUP_FAILED")
    if (result.code !== 0) throw Error(t("error.installOpencode"))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

export function productCliInstallScript(archive: string, digest: string, version: string) {
  return `set -eu
test "$(uname -m)" = x86_64
umask 077
base="${wslCliHome}"
mkdir -p -- "$base"
stage=$(mktemp -d "$base/.install.XXXXXXXX")
trap 'rm -rf -- "$stage"' EXIT
cp -- "$(wslpath -a ${shellEscape(archive)})" "$stage/cli.tar.gz"
printf '%s  %s\\n' ${shellEscape(digest)} "$stage/cli.tar.gz" | sha256sum --check --status
mkdir -- "$stage/payload"
tar --extract --gzip --same-permissions --no-same-owner --file "$stage/cli.tar.gz" --directory "$stage/payload"
test "$("$stage/payload/${wslCliExecutable}" --version)" = ${shellEscape(version)}
# Serialize the switch and cleanup even when another Desktop process installs into this distro.
exec 9>"$base/.install.lock"
flock -x 9
target="$base/"${shellEscape(digest)}
previous=$(readlink -- "$base/current" || true)
if [ ! -d "$target" ]; then
  mv -T -- "$stage/payload" "$target"
fi
ln -s -- "$target" "$stage/current"
mv -Tf -- "$stage/current" "$base/current"
if [ "$previous" != "$target" ]; then
  for copy in "$base"/*; do
    [ -d "$copy" ] && [ ! -L "$copy" ] || continue
    [ "$copy" != "$target" ] && [ "$copy" != "$previous" ] || continue
    name=\${copy##*/}
    [ "\${#name}" -eq 64 ] || continue
    case "$name" in *[!0123456789abcdef]*) continue ;; esac
    rm -rf -- "$copy" || printf '%s\\n' WSL_CLI_CLEANUP_FAILED >&2
  done
fi
`
}
