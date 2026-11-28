import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { MainContext } from "@opencode/plugin/gui/main"
import { wslCliExecutable, wslCliHome, wslCliPath } from "./wsl-path"
import { shellEscape } from "../shell-escape"
import type { RunWslOptions, WslCommandResult } from "../wsl/contract"

export function discoverProductCli() {
  return `cli="${wslCliPath}"
if [ -x "$cli" ]; then readlink -f -- "$cli"; fi`
}

export async function installProductCli(
  runWslSh: (script: string, options: RunWslOptions) => Promise<WslCommandResult>,
  version: string,
  t: MainContext["t"],
  signal: AbortSignal,
  logFailure: (code: string) => void,
  download: (destination: string, signal: AbortSignal) => Promise<string>,
) {
  const architecture = await runWslSh("uname -m", { signal })

  if (architecture.code !== 0) throw Error(t("error.executeDistro"))
  const machine = architecture.stdout.trim()

  if (machine === "aarch64" || machine === "arm64") throw Error(t("error.armUnsupported"))

  if (machine !== "x86_64") throw Error(t("error.archUnsupported"))

  const temporary = await mkdtemp(join(tmpdir(), "loginom-wsl-"))
  const destination = join(temporary, "cli.tar.gz")
  const downloadSignal = AbortSignal.any([signal, AbortSignal.timeout(10 * 60_000)])

  try {
    const digest = await download(destination, downloadSignal).catch((cause: unknown) => {
      const code = cause instanceof Error ? cause.message : ""
      logFailure(/^(?:WSL_CLI|LOGINOM_UPDATE)_[A-Z0-9_]+$/.test(code) ? code : "WSL_CLI_DOWNLOAD_FAILED")
      throw Error(t(code === "WSL_CLI_RELEASE_UNAVAILABLE" ? "error.releaseUnavailable" : "error.releaseVerification"))
    })

    const result = await runWslSh(productCliInstallScript(destination, digest, version), {
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
installed_version=$("$stage/payload/${wslCliExecutable}" --version)
test "$installed_version" = ${shellEscape(version)}
# Serialize the switch and cleanup even when another Desktop process installs into this distro.
exec 9>"$base/.install.lock"
flock -x 9
digest=${shellEscape(digest)}
target="$base/$digest"
previous=$(readlink -- "$base/current" || true)
previous_name=\${previous##*/}
if [ "$previous" = "$base/$previous_name" ]; then
  case "$previous_name" in "$digest"|"$digest".*) target="$previous" ;; esac
fi
# Compare the extracted trees including modes and symlinks, ignoring archive ownership and timestamps.
fingerprint() {
  bash -o pipefail -c '
    cd -- "$1" || exit
    LC_ALL=C tar --create --sort=name --format=gnu --mtime=@0 --owner=0 --group=0 --file - . | sha256sum
  ' sh "$1"
}
matches=no
if [ -d "$target" ] && [ ! -L "$target" ]; then
  expected=$(fingerprint "$stage/payload")
  if actual=$(fingerprint "$target" 2>/dev/null) && [ "$actual" = "$expected" ]; then matches=yes; fi
fi
if [ "$matches" = no ]; then
  # Keep current pointing at its old tree until a complete replacement is ready.
  if [ -e "$target" ] || [ -L "$target" ]; then target="$base/$digest.\${stage##*.}"; fi
  mv -T -- "$stage/payload" "$target"
fi
ln -s -- "$target" "$stage/current"
mv -Tf -- "$stage/current" "$base/current"
for copy in "$base"/*; do
  [ -d "$copy" ] && [ ! -L "$copy" ] || continue
  [ "$copy" != "$target" ] || continue
  name=\${copy##*/}
  copy_digest=\${name%%.*}
  [ "\${#copy_digest}" -eq 64 ] || continue
  case "$copy_digest" in *[!0123456789abcdef]*) continue ;; esac
  case "$name" in
    "$copy_digest") ;;
    "$copy_digest".????????) case "\${name#*.}" in *[!a-zA-Z0-9]*) continue ;; esac ;;
    *) continue ;;
  esac
  if [ "\${previous_name%%.*}" = "$digest" ]; then
    [ "$copy_digest" = "$digest" ] || continue
  else
    [ "$copy" != "$previous" ] || continue
  fi
  rm -rf -- "$copy" || printf '%s\\n' WSL_CLI_CLEANUP_FAILED >&2
done
`
}
