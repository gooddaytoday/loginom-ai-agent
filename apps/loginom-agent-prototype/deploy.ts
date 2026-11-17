#!/usr/bin/env bun
// Publishes site/ as an immutable release: <dir>/releases/<sha256 of SHA256SUMS>/{site,SHA256SUMS}, then
// atomically repoints <dir>/current under <dir>/deploy.lock. The web container serves <dir>/current/site.
// Host-specific values come from the environment or deploy.local.json next to this script (git-ignored).
//
//   bun deploy.ts [--dry-run]            publish the committed site/ and switch to it
//   bun deploy.ts --rollback <hash>      switch back to an existing release
//   bun deploy.ts --list                 show releases, newest first, and the current one
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { $ } from "bun"

const root = import.meta.dir
const local = Bun.file(path.join(root, "deploy.local.json"))
const env: Record<string, string | undefined> = { ...((await local.exists()) ? await local.json() : {}), ...process.env }
const host = required("PROTOTYPE_SSH_HOST")
const dir = required("PROTOTYPE_DIR")
const url = required("PROTOTYPE_URL").replace(/\/+$/, "")
const keep = 10
const args = process.argv.slice(2)
const dry = args.includes("--dry-run")
const ssh = (script: string) => $`ssh -o BatchMode=yes ${host} ${`set -eu; cd ${quote(dir)}; ${script}`}`

if (args.includes("--list")) {
  console.log((await ssh(`echo "current -> $(readlink current)"; ls -1t releases`).text()).trim())
  process.exit(0)
}

const rollback = args.indexOf("--rollback")
if (rollback !== -1) {
  const hash = requireHash(args[rollback + 1])
  await ssh(`test -d releases/${hash}`)
  console.log(`rollback to ${hash}${dry ? " (dry run)" : ""}`)
  if (dry) process.exit(0)
  await activate(hash)
  await smoke(hash)
  process.exit(0)
}

const dirty = (await $`git -C ${root} status --porcelain -- site`.text()).trim()
if (dirty) fail(`site/ has uncommitted changes; commit them first:\n${dirty}`)

const sums = await checksums(path.join(root, "site"))
const hash = new Bun.CryptoHasher("sha256").update(sums).digest("hex")
const current = path.basename((await ssh(`readlink current || true`).text()).trim())
const exists = (await ssh(`test -d releases/${hash} && echo yes || true`).text()).trim() === "yes"
console.log(`release ${hash}\ncurrent ${current || "(none)"}\nupload  ${exists ? "no, release exists" : "yes"}`)
if (hash === current) {
  console.log("already current")
  process.exit(0)
}
if (dry) process.exit(0)

if (!exists) await upload(hash, sums)
await activate(hash)
await smoke(hash)
await ssh(
  `cd releases; ls -1t | grep -v '\\.tmp$' | grep -vx ${hash} | tail -n +${keep} | xargs -r rm -rf --`,
)

async function upload(hash: string, sums: string) {
  const staging = await mkdtemp(path.join(os.tmpdir(), "prototype-deploy-"))
  await Bun.write(path.join(staging, "SHA256SUMS"), sums)
  // Reproducible archive: same bytes, owner and modes as the existing releases.
  const tar = `--sort=name --owner=0 --group=0 --numeric-owner --mtime=@0 --mode=u=rwX,go=rX`
  await $`tar ${{ raw: tar }} -cf - -C ${root} site -C ${staging} SHA256SUMS | ssh -o BatchMode=yes ${host} ${`set -eu; cd ${quote(dir)}/releases; rm -rf ${hash}.tmp; mkdir ${hash}.tmp; tar -xf - -C ${hash}.tmp; (cd ${hash}.tmp && sha256sum --quiet -c SHA256SUMS); mv -T ${hash}.tmp ${hash}`}`
  await rm(staging, { recursive: true })
  console.log(`uploaded ${hash}`)
}

async function activate(hash: string) {
  await ssh(
    `touch releases/${hash}; flock deploy.lock sh -c 'ln -sfn releases/${hash} current.tmp && mv -T current.tmp current'`,
  )
  console.log(`current -> releases/${hash}`)
}

// Fetches every published file through the public URL and compares it with the release checksums.
async function smoke(hash: string) {
  const lines = (await ssh(`cat releases/${hash}/SHA256SUMS`).text()).trim().split("\n")
  const index = await fetch(`${url}/`)
  if (!index.ok) fail(`GET / returned ${index.status}`)
  if (!index.headers.get("content-security-policy")) fail("GET / has no Content-Security-Policy header")
  const mismatches = (
    await Promise.all(
      lines.map(async (line) => {
        const [sum, file] = line.split(/\s+/)
        const response = await fetch(`${url}/${file.replace(/^site\//, "")}`)
        const served = new Bun.CryptoHasher("sha256").update(await response.arrayBuffer()).digest("hex")
        return response.ok && served === sum ? undefined : `${file}: HTTP ${response.status}`
      }),
    )
  ).filter((item) => item !== undefined)
  if (mismatches.length) fail(`served files differ from release ${hash}:\n${mismatches.join("\n")}`)
  console.log(`smoke ok: ${lines.length} files match, CSP present`)
}

async function checksums(site: string) {
  const files = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: site, onlyFiles: true, dot: true }))).sort()
  const lines = await Promise.all(
    files.map(async (file) => {
      const sum = new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(site, file)).arrayBuffer())
      return `${sum.digest("hex")}  site/${file}\n`
    }),
  )
  return lines.join("")
}

function required(name: string) {
  const value = env[name]
  if (!value) fail(`set ${name} in the environment or in deploy.local.json next to deploy.ts`)
  return value as string
}

function requireHash(value: string | undefined) {
  if (!value || !/^[0-9a-f]{64}$/.test(value)) fail("--rollback needs a 64-character release hash (see --list)")
  return value as string
}

function quote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
