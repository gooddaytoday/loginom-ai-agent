import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Product } from "@loginom-ai-agent/product"
import { downloadWslArchive } from "@loginom-ai-agent/product/wsl-release"
import type { MainContext } from "@opencode/plugin/gui/main"
import { shellEscape, type WslRuntime } from "./runtime"

const home = "$HOME/.local/share/loginom-ai-agent-wsl"

const executable = `bin/${Product.cliExecutable}`

export function discoverProductCli() {
  return `cli="${home}/current/${executable}"
if [ -x "$cli" ]; then readlink -f -- "$cli"; fi`
}

export async function installProductCli(
  runtime: WslRuntime,
  distro: string,
  version: string,
  t: MainContext["t"],
  signal: AbortSignal,
) {
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
      get: (name) => {
        const url = new URL(`releases/${encodeURIComponent(version)}/${encodeURIComponent(name)}`, base)

        return net.fetch(url.href, { signal: downloadSignal })
      },
    }).catch(() => {
      throw Error(t("error.releaseVerification"))
    })

    const result = await runtime.runWslSh(productCliInstallScript(destination, digest, version), distro, {
      signal,
      timeoutMs: 4 * 60_000,
    })

    if (result.code !== 0) throw Error(t("error.installOpencode"))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

export function productCliInstallScript(archive: string, digest: string, version: string) {
  return `set -eu
test "$(uname -m)" = x86_64
umask 077
base="${home}"
mkdir -p -- "$base"
stage=$(mktemp -d "$base/.install.XXXXXXXX")
trap 'rm -rf -- "$stage"' EXIT
cp -- "$(wslpath -a ${shellEscape(archive)})" "$stage/cli.tar.gz"
printf '%s  %s\\n' ${shellEscape(digest)} "$stage/cli.tar.gz" | sha256sum --check --status
mkdir -- "$stage/payload"
tar --extract --gzip --same-permissions --no-same-owner --file "$stage/cli.tar.gz" --directory "$stage/payload"
test "$("$stage/payload/${executable}" --version)" = ${shellEscape(version)}
target="$base/"${shellEscape(digest)}
if [ ! -d "$target" ]; then
  mv -T -- "$stage/payload" "$target" || test -x "$target/${executable}"
fi
ln -s -- "$target" "$stage/current"
mv -Tf -- "$stage/current" "$base/current"
`
}
